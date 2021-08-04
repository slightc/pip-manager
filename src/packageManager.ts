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
    constructor(private _pythonPath: string, private readonly output: vscode.OutputChannel) { }

    updatePythonPath(path: string) {
        this._pythonPath = path;
    }

    private get defaultPath() {
        return path.join(os.homedir(), '.codejiang', 'python', 'bin', 'python3');
    }

    private get pythonPath() {
        return this._pythonPath || this.defaultPath;
    }

    private execute(command: string, args: string[], cancelToken?: vscode.CancellationToken): Promise<any> {
        return new Promise((resolve, reject) => {
            let errMsg = '';
            let out = '';
            const p = spawn(command, args);

            this.output.appendLine(`exec ${command} ${args.join(' ')}`);

            if (cancelToken) {
                cancelToken.onCancellationRequested(() => {
                    this.output.appendLine('cancel command');
                    p.kill();
                });
            }

            p.stdout.on('data', (data: string) => {
                this.output.appendLine(data);
                out = data;
            });

            p.stderr.on('data', (data: string) => {
                if(!(data.indexOf('WARNING') === 0)) {
                    this.output.appendLine(data);
                    errMsg = data;
                }
            });

            p.on('close', (code) => {
                this.output.appendLine('');
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

    private pip(args: string[], cancelToken?: vscode.CancellationToken) {
        const python = this.pythonPath;
        return this.execute(python, ['-m', 'pip']
            .concat(args)
            .concat([]),
            cancelToken
        ).catch((err) => {
            vscode.window.showErrorMessage(err.message);
            return Promise.reject();
        });
    }

    public async getPackageList(): Promise<PackageInfo[]> {
        const packages = await this.pip(['list', '--format', 'json']);
        return JSON.parse(packages);
    }

    public async addPackage(pack: string | { name: string; version?: string }, cancelToken?: vscode.CancellationToken, source = Source.tsinghua) {
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
        await this.pip(args, cancelToken);
    }
    public async addPackageFromFile(filePath: string, cancelToken?: vscode.CancellationToken, source = Source.tsinghua) {
        if (!path) {
            throw new Error('Invalid Path');
        }

        const args = ['install', '-r', filePath];
        if (source) {
            args.push('-i', source);
        }
        await this.pip(args, cancelToken);
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