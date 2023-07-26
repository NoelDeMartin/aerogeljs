import { createApp } from 'vue';
import type { Component } from 'vue';

import directives from '@/directives';
import services from '@/services';
import ui from '@/ui';
import { translate } from '@/utils';
import type { AerogelOptions } from '@/bootstrap/options';

export async function bootstrapApplication(rootComponent: Component, options: AerogelOptions = {}): Promise<void> {
    const plugins = [directives, services, ui, ...(options.plugins ?? [])];
    const app = createApp(rootComponent);

    await Promise.all(plugins.map((plugin) => plugin.install(app, options)) ?? []);

    app.config.globalProperties.$t ??= translate;
    app.mount('#app');
}
