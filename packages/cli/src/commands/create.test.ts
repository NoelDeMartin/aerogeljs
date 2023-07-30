import { describe, it } from 'vitest';

import FileMock from '@/lib/File.mock';
import ShellMock from '@/lib/Shell.mock';

import { CreateCommand } from './create';

describe('Create command', () => {

    it('works', async () => {
        // Act
        await CreateCommand.run('./app', { name: 'My App' });

        // Assert
        FileMock.expectCreated('./app/.gitignore').toContain('node_modules');
        FileMock.expectCreated('./app/package.json').toContain('"name": "my-app"');
        FileMock.expectCreated('./app/index.html').toContain('My App');
        FileMock.expectCreated('./app/src/App.vue').toContain(
            '<h1 class="text-4xl font-semibold">{{ $t(\'home.title\') }}</h1>',
        );

        ShellMock.expectRan('npm install');
        ShellMock.expectRan('git init');
    });

});
