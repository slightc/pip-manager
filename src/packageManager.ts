import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import axios from 'axios';
import * as xml2js from 'xml2js';
import * as utils from './utils';

interface PackageInfo {
    name: string;
    version?: string;
}

type PackagePickItem = vscode.QuickPickItem & Required<PackageInfo>;

enum Source {
    tsinghua = 'https://pypi.tuna.tsinghua.edu.cn/simple',
}

enum Category {
    python3 = 'Programming Language :: Python :: 3',
    education = 'Intended Audience :: Education',
    stable = 'Development Status :: 5 - Production/Stable',
    empty = '',
}

const defaultCategory = encodeURI(Category.stable);

export const necessaryPackage = [
    'pip', 'setuptools', 'wheel'
];

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

    public async getPackageList(): Promise<Required<PackageInfo>[]> {
        const packages = await this.pip(['list', '--format', 'json']);
        return JSON.parse(packages);
    }

    public async addPackage(pack: string | PackageInfo, cancelToken?: vscode.CancellationToken, source = Source.tsinghua) {
        let name: string = '';
        if (typeof pack === 'string') {
            name = pack;
        } else {
            name = `${pack.name}${pack.version ? `==${pack.version}` : ''}`;
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

    public async removePackage(pack: string | PackageInfo) {
        let name: string = '';
        if (typeof pack === 'string') {
            name = pack;
        } else {
            name = `${pack.name}`;
        }

        if (!name) {
            throw new Error('Invalid Name');
        }
        if(necessaryPackage.includes(name.split('==')[0])) {
            return;
        }

        await this.pip(['uninstall', name, '-y']);
    }

    public async searchFromPyPi(keyword: string, page = 1, cancelToken?: vscode.CancellationToken) {
        const axiosCancelToken = utils.createAxiosCancelToken(cancelToken);
        const resp = await axios({
            method: 'GET',
            cancelToken: axiosCancelToken.token,
            url: `https://pypi.org/search/?q=${keyword}&page=${page}${keyword ? '' : `&c=${defaultCategory}`
                }`,
        });
        const [resultXml] =
            RegExp(
                '<ul class="unstyled" aria-label="Search results">[\\s\\S]*?</ul>'
            ).exec(resp.data) || [];
        if (!resultXml) {return Promise.reject({ type: 'no result' });}
        const [paginationXml] =
            RegExp(
                '<div class="button-group button-group--pagination">[\\s\\S]*?</div>'
            ).exec(resp.data) || [];
        const result = await xml2js.parseStringPromise(resultXml, {
            explicitArray: false,
        });

        const list: PackagePickItem[] = [];
        result.ul.li.forEach((item: any) => {
            const data = {
                name: item.a.h3.span[0]._,
                version: item.a.h3.span[1]._,
                updateTime: item.a.h3.span[2].time.$.datetime,
                describe: item.a.p._,
            };
            list.push({
                name: data.name,
                version: data.version,
                alwaysShow: true,
                label: data.name,
                description: `${data.version}`,
                detail: data.describe
            });
        });

        let totalPages = 1;

        if (paginationXml) {
            const pagination = await xml2js.parseStringPromise(paginationXml, {
                explicitArray: false,
            });
            totalPages = Number(pagination.div.a[pagination.div.a.length - 2]._) || 1;
            if (totalPages < page) {
                totalPages = page;
            }
        }

        return {
            list,
            totalPages,
        };
    }
}