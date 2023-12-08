import {
    after,
    arrayFilter,
    arrayUnique,
    arrayWithout,
    asyncMemo,
    facade,
    fail,
    getLocationQueryParameter,
    hasLocationQueryParameter,
    objectWithout,
    objectWithoutEmpty,
    parseBoolean,
    setAsyncMemo,
    tap,
    urlRoot,
} from '@noeldemartin/utils';
import { App, Errors, Events, UI, translateWithDefault } from '@aerogel/core';
import { fetchLoginUserProfile } from '@noeldemartin/solid-utils';
import { setEngine } from 'soukai';
import { SolidACLAuthorization, SolidContainer, SolidTypeIndex } from 'soukai-solid';
import type { ErrorSource } from '@aerogel/core';
import type { Fetch, SolidModelConstructor } from 'soukai-solid';
import type { SolidUserProfile } from '@noeldemartin/solid-utils';

import AuthenticationCancelledError from '@/errors/AuthenticationCancelledError';
import { ContainerAlreadyInUse } from '@/errors';
import { getAuthenticator } from '@/auth';
import type { AuthenticatorName } from '@/auth';
import type Authenticator from '@/auth/Authenticator';
import type { AuthSession } from '@/auth/Authenticator';

import Service from './Solid.state';

export type LoginOptions = {
    authenticator?: AuthenticatorName;
    onError?(error: ErrorSource): unknown;
    fallbackUrl?: string;
};

export type ReconnectOptions = Omit<LoginOptions, 'authenticator'> & {
    force?: boolean;
};

export class SolidService extends Service {

    public isLoggedIn(): this is { session: AuthSession; user: SolidUserProfile; authenticator: Authenticator } {
        return !!this.session;
    }

    public wasLoggedIn(): this is { user: SolidUserProfile } {
        return !!this.previousSession;
    }

    public hasLoggedIn(): this is { user: SolidUserProfile } {
        return !!(this.session || this.previousSession);
    }

    public requireAuthenticator(): Authenticator {
        return this.authenticator ?? fail('Could not get authenticator');
    }

    public requireUser(): SolidUserProfile {
        return this.user ?? fail('Could not get user profile (are you logged in?)');
    }

    public requireUserProfile(url: string): Promise<SolidUserProfile> {
        return this.getUserProfile(url, true);
    }

    public async getUserProfile(url: string, required: true): Promise<SolidUserProfile>;
    public async getUserProfile(url: string, required?: false): Promise<SolidUserProfile | null>;
    public async getUserProfile(url: string, required: boolean = false): Promise<SolidUserProfile | null> {
        return (
            this.profiles[url] ??
            tap(
                await fetchLoginUserProfile(url, {
                    fetch: this.fetch,
                    required,
                }),
                (profile) => profile && this.rememberProfile(profile),
            )
        );
    }

    public async refreshUserProfile(): Promise<void> {
        if (!this.isLoggedIn()) {
            return;
        }

        this.setState({ profiles: objectWithout(this.profiles, [this.user.webId]) });

        const user = await this.requireUserProfile(this.user.webId);

        this.setState({
            session: {
                ...this.session,
                user,
            },
        });
    }

    public async login(loginUrl: string, options: LoginOptions = {}): Promise<boolean> {
        const authenticatorName = options.authenticator ?? this.preferredAuthenticator ?? 'default';
        const handleLoginError =
            options.onError ??
            ((error: ErrorSource) =>
                App.isMounted ? Errors.report(error) : this.setState({ loginStartupError: error }));

        if (App.development && loginUrl === 'devserver') {
            loginUrl = 'http://localhost:4000';
        }

        if (!/^https?:\/\//.test(loginUrl)) {
            options.fallbackUrl ??= `http://${loginUrl}`;
            loginUrl = `https://${loginUrl}`;
        }

        if (this.isLoggedIn()) {
            return true;
        }

        if (this.loginOngoing) {
            throw new Error('Authentication already in progress');
        }

        const staleTimeout = setTimeout(() => (this.loginStale = true), 10000);
        const initialState = {
            dismissed: this.dismissed,
            ignorePreviousSessionError: this.ignorePreviousSessionError,
            previousSession: this.previousSession,
        };
        this.loginOngoing = true;

        try {
            const profile = await this.getUserProfile(loginUrl);
            const oidcIssuerUrl = profile?.oidcIssuerUrl ?? urlRoot(profile?.webId ?? loginUrl);
            const authenticator = await this.bootAuthenticator(authenticatorName);

            this.setState({
                dismissed: false,
                ignorePreviousSessionError: true,
                previousSession: objectWithoutEmpty({
                    profile,
                    loginUrl,
                    authenticator: authenticatorName,
                    error: translateWithDefault(
                        'auth.stuckConnecting',
                        'We didn\'t hear back from the identity provider, maybe try reconnecting?',
                    ),
                }),
            });

            // This should redirect away from the app, so in most cases
            // the rest of the code won't be reached.
            await authenticator.login(oidcIssuerUrl);

            return true;
        } catch (error) {
            this.setState(initialState);

            if (error instanceof AuthenticationCancelledError) {
                return false;
            }

            if (options.fallbackUrl) {
                return after().then(() => this.login(options.fallbackUrl ?? '', objectWithout(options, 'fallbackUrl')));
            }

            handleLoginError(error);

            return false;
        } finally {
            clearTimeout(staleTimeout);

            this.setState({
                loginOngoing: false,
                loginStale: false,
            });
        }
    }

    public async reconnect(options: ReconnectOptions = {}): Promise<void> {
        const { force, ...loginOptions } = options;
        if (this.isLoggedIn() || !this.previousSession || (this.previousSession.error !== null && !force)) {
            return;
        }

        await this.login(this.previousSession.loginUrl, {
            authenticator: this.previousSession.authenticator,
            ...loginOptions,
        });
    }

    public async logout(force: boolean = false): Promise<void> {
        const confirmLogout =
            force ||
            (await UI.confirm(translateWithDefault('solid.logoutConfirm', 'Are you sure you want to log out?')));

        if (!confirmLogout) {
            return;
        }

        if (!this.previousSession) {
            return;
        }

        this.setState({ previousSession: null });
        this.isLoggedIn() && (await this.authenticator.logout());

        await Events.emit('logout');
    }

    public dismiss(): void {
        this.setState({ dismissed: true });
    }

    public async findOrCreatePrivateTypeIndex(): Promise<SolidTypeIndex> {
        return (await this.findPrivateTypeIndex()) ?? (await this.createPrivateTypeIndex());
    }

    public async findPrivateTypeIndex(): Promise<SolidTypeIndex | null> {
        const user = this.requireUser();
        const engine = this.requireAuthenticator().engine;

        return asyncMemo(`${user.webId}-privateTypeIndex`, () =>
            SolidTypeIndex.withEngine(engine).find(user.privateTypeIndexUrl));
    }

    public async findOrCreatePublicTypeIndex(): Promise<SolidTypeIndex> {
        return (await this.findPublicTypeIndex()) ?? (await this.createPublicTypeIndex());
    }

    protected async findPublicTypeIndex(): Promise<SolidTypeIndex | null> {
        const user = this.requireUser();
        const engine = this.requireAuthenticator().engine;

        return asyncMemo(`${user.webId}-publicTypeIndex`, () =>
            SolidTypeIndex.withEngine(engine).find(user.publicTypeIndexUrl));
    }

    public async createPrivateContainer(options: {
        url: string;
        name: string;
        registerFor?: SolidModelConstructor;
        reuseExisting?: boolean;
    }): Promise<SolidContainer> {
        const engine = this.requireAuthenticator().engine;

        return SolidContainer.withEngine(engine, async () => {
            const existingContainer = await SolidContainer.find(options.url);

            if (existingContainer && !options.reuseExisting) {
                throw new ContainerAlreadyInUse(existingContainer);
            }

            const container = existingContainer ?? new SolidContainer({ url: options.url, name: options.url });

            await container.save();

            if (options.registerFor) {
                const typeIndex = await this.findOrCreatePrivateTypeIndex();

                await container.register(typeIndex.url, options.registerFor);
            }

            return container;
        });
    }

    protected async boot(): Promise<void> {
        await Errors.booted;

        if (hasLocationQueryParameter('authenticator')) {
            this.setState({
                preferredAuthenticator: getLocationQueryParameter('authenticator') as AuthenticatorName,
            });
        }

        if (hasLocationQueryParameter('refreshProfile')) {
            this.setState({
                staleProfiles: arrayUnique(
                    this.staleProfiles.concat(arrayFilter([this.session?.user.webId, this.previousSession?.loginUrl])),
                ),
            });
        }

        await this.restorePreviousSession();
        await this.startupReconnect();
    }

    protected async createPrivateTypeIndex(): Promise<SolidTypeIndex> {
        const user = this.requireUser();
        const authenticator = this.requireAuthenticator();
        const typeIndex = await SolidTypeIndex.withEngine(authenticator.engine).createPrivate(user);

        return tap(typeIndex, () => {
            user.privateTypeIndexUrl = typeIndex.url;

            setAsyncMemo(`${user.webId}-privateTypeIndex`, typeIndex);

            this.rememberProfile(user);
        });
    }

    public async createPublicTypeIndex(): Promise<SolidTypeIndex> {
        const user = this.requireUser();
        const authenticator = this.requireAuthenticator();
        const typeIndex = await SolidTypeIndex.withEngine(authenticator.engine).createPublic(user);

        return tap(typeIndex, () => {
            user.privateTypeIndexUrl = typeIndex.url;

            setAsyncMemo(`${user.webId}-publicTypeIndex`, typeIndex);

            this.rememberProfile(user);
        });
    }

    private async restorePreviousSession(): Promise<void> {
        if (!this.previousSession) {
            return;
        }

        await this.bootAuthenticator(this.previousSession.authenticator);
    }

    private async startupReconnect(): Promise<void> {
        if (!this.reconnectOnStartup()) {
            return;
        }

        await this.reconnect();
    }

    private reconnectOnStartup(): boolean {
        if (hasLocationQueryParameter('autoReconnect')) {
            return parseBoolean(getLocationQueryParameter('autoReconnect'));
        }

        return this.autoReconnect;
    }

    private async bootAuthenticator(name: AuthenticatorName): Promise<Authenticator> {
        const authenticator = getAuthenticator(name);

        authenticator.addListener({
            onSessionStarted: async (session) => {
                this.setState({
                    session,
                    previousSession: {
                        authenticator: authenticator.name,
                        loginUrl: session.loginUrl,
                        profile: session.user,
                        error: null,
                    },
                });

                if (
                    session.user.cloaked ||
                    !session.user.writableProfileUrl ||
                    this.staleProfiles.includes(session.user.webId)
                ) {
                    await this.refreshUserProfile();
                }

                App.plugin('@aerogel/offline-first') || setEngine(session.authenticator.engine);

                SolidACLAuthorization.setEngine(session.authenticator.engine);

                await Events.emit('login', session);
            },
            onSessionFailed: async (loginUrl, error) => {
                this.setState({
                    session: null,
                    previousSession: {
                        authenticator: authenticator.name,
                        loginUrl,
                        error,
                    },
                });
            },
            onSessionEnded: () => this.setState({ session: null }),
            onAuthenticatedFetchReady: (fetch) => Events.emit('authenticated-fetch-ready', fetch),
        });

        await authenticator.boot();

        return authenticator;
    }

    private rememberProfile(profile: SolidUserProfile): void {
        this.setState({
            profiles: {
                ...this.profiles,
                [profile.webId]: profile,
            },
            staleProfiles: arrayWithout(this.staleProfiles, profile.webId),
        });
    }

}

export default facade(new SolidService());

declare module '@aerogel/core' {
    export interface EventsPayload {
        'authenticated-fetch-ready': Fetch;
        login: AuthSession;
        logout: void;
    }
}
