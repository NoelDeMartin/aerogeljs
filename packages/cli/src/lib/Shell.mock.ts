import { expect } from 'vitest';
import { facade } from '@noeldemartin/utils';

import { ShellService } from './Shell';

export class ShellServiceMock extends ShellService {

    private history: string[] = [];

    public async run(command: string): Promise<void> {
        this.history.push(command);
    }

    public expectRan(command: string): void {
        expect(this.history, `expected '${command}' command to have been executed`).toContain(command);
    }

}

export default facade(new ShellServiceMock());
