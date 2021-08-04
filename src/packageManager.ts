import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

interface PackageInfo {
    name: string;
    version: string;
}

enum Source {
    tsinghua = 'https://pypi.tuna.tsinghua.edu.cn/simple',
}

export class PackageManager {
    constructor(private _pythonPath?: string) { }

    updatePythonPath(path: string) {
        this._pythonPath = path;
    }

    private get defaultPath() {
        return path.join(os.homedir(), '.codejiang', 'python', 'bin', 'python3');
    }

    private get pythonPath() {
        return this._pythonPath || this.defaultPath;
    }

    private execute(command: string, args: string[]): Promise<any> {
        return new Promise((resolve, reject) => {
            let errMsg = '';
            let out = '';
            const p = spawn(command, args);

            p.stdout.on('data', (data: string) => {
                out = data;
            });

            p.stderr.on('data', (data: string) => {
                if(!errMsg && !(data.indexOf('WARNING') === 0)) {
                    errMsg = data;
                }
            });

            p.on('close', (code) => {
                if (!code) {
                    resolve(out);
                } else {
                    const err = new Error(errMsg);
                    (err as Error & { code: number }).code = code;
                    reject(err);
                }
            });
        });
    }

    private pip(args: string[]) {
        const python = this.pythonPath;
        return this.execute(python, ['-m', 'pip']
            .concat(args)
            .concat([])
        ).catch((err) => {
            vscode.window.showErrorMessage(err.message);
            return Promise.reject();
        });
    }

    public async getPackageList(): Promise<PackageInfo[]> {
        const packages = await this.pip(['list', '--format', 'json']);
        return JSON.parse(packages);
    }

    public async addPackage(pack: string | { name: string; version?: string }, source = Source.tsinghua) {
        let name: string = '';
        if (typeof pack === 'string') {
            name = pack;
        } else {
            name = `${pack.name}${pack.version ? `@${pack.version}` : ''}`;
        }

        if (!name) {
            throw new Error('Invalid Name');
        }

        const args = ['install', name];
        if (source) {
            args.push('-i', source);
        }
        await this.pip(args);
    }

    public async removePackage(pack: string | { name: string }) {
        let name: string = '';
        if (typeof pack === 'string') {
            name = pack;
        } else {
            name = `${pack.name}`;
        }

        if (!name) {
            throw new Error('Invalid Name');
        }

        await this.pip(['uninstall', name, '-y']);
    }
}