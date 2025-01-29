import File from '@/lib/File';
import Log from '@/lib/Log';
import Plugin from '@/plugins/Plugin';
import Shell from '@/lib/Shell';
import { isLinkedLocalApp } from '@/lib/utils/app';
import { packagePath } from '@/lib/utils/paths';
import type { Editor } from '@/lib/Editor';

export class Solid extends Plugin {

    constructor() {
        super('solid');
    }

    protected async updateFiles(editor: Editor): Promise<void> {
        await this.updateTailwindConfig(editor, {
            content: isLinkedLocalApp()
                ? `'${packagePath('plugin-solid')}/dist/**/*.js'`
                : '\'./node_modules/@aerogel/plugin-solid/dist/**/*.js\'',
        });

        await this.updateNpmScripts(editor);
        await this.updateGitIgnore();
        await super.updateFiles(editor);
    }

    protected async installNpmDependencies(): Promise<void> {
        await Shell.run('npm install soukai-solid@next --save-exact');
        await Shell.run('npm install @noeldemartin/solid-utils@next --save-exact');
        await Shell.run('npm install @solid/community-server@~7.0 --save-dev');
        await super.installNpmDependencies();
    }

    protected async updateNpmScripts(editor: Editor): Promise<void> {
        Log.info('Updating npm scripts...');

        const packageJson = File.read('package.json');

        if (!packageJson) {
            return Log.fail('Could not find package.json file');
        }

        File.write(
            'package.json',
            packageJson
                .replace(
                    '"cy:dev": "concurrently --kill-others \\"npm run test:serve-app\\" \\"npm run cy:open\\"",',
                    '"cy:dev": "concurrently --kill-others ' +
                        '\\"npm run test:serve-app\\" \\"npm run test:serve-pod\\" \\"npm run cy:open\\"",',
                )
                .replace(
                    '"cy:test": "start-server-and-test test:serve-app http-get://localhost:5001 cy:run",',
                    '"cy:test": "start-server-and-test ' +
                        'test:serve-app http-get://localhost:5001 test:serve-pod http-get://localhost:3000 cy:run",',
                )
                .replace(
                    '"dev": "vite",',
                    '"dev": "vite",\n' +
                        '"dev:serve-pod": "community-solid-server -c @css:config/file.json -f ./solid-data",',
                )
                .replace(
                    '"test:serve-app": "vite --port 5001 --mode testing"',
                    '"test:serve-app": "vite --port 5001 --mode testing",\n' +
                        '"test:serve-pod": "community-solid-server -l debug"',
                ),
        );

        editor.addModifiedFile('package.json');
    }

    protected async updateGitIgnore(): Promise<void> {
        Log.info('Updating .gitignore');

        const gitignore = File.read('.gitignore') ?? '';

        File.write('.gitignore', `${gitignore}/solid-data\n`);
    }

}
