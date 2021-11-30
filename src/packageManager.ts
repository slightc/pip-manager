import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import axios from 'axios';
import * as xml2js from 'xml2js';
import * as utils from './utils';
import { createDecorator } from './instantiation/common/instantiation';
import { IExtensionContext, IOutputChannel } from './types';

interface PackageInfo {
    name: string;
    version?: string;
    latestVersion?: string;
}

export type PackageVersionInfo = Omit<PackageInfo, 'version'> & Required<Pick<PackageInfo, 'version'>>;

type PackagePickItem = vscode.QuickPickItem & PackageVersionInfo;

enum Source {
    pypi     = 'https://pypi.python.org/simple',
    tsinghua = 'https://pypi.tuna.tsinghua.edu.cn/simple',
    aliyun   = 'http://mirrors.aliyun.com/pypi/simple',
    douban   = 'http://pypi.douban.com/simple',
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

export interface IPackageManager {
    getPackageList(): Promise<PackageVersionInfo[]>;
    getPackageListWithUpdate(): Promise<PackageVersionInfo[]>;
    addPackage(pack: string | PackageInfo, cancelToken?: vscode.CancellationToken, source?: Source): Promise<any>;
    updatePackage(pack: string | PackageInfo, cancelToken?: vscode.CancellationToken, source?: Source): Promise<any>;
    removePackage(pack: string | PackageInfo): Promise<any>;
    searchFromPyPi(keyword: string, page?: number, cancelToken?: vscode.CancellationToken): Promise<{ list: PackagePickItem[], totalPages: number }>;
    updatePythonPath(path: string): void;
    addPackageFromFile(filePath: string, cancelToken?: vscode.CancellationToken): Promise<any>;
    getPackageVersionList(pack: string | PackageInfo, cancelToken?: vscode.CancellationToken): Promise<string[]>;
    getPackageUpdate(): Promise<PackageVersionInfo[]>;
    mergePackageListWithUpdate(packInfo: PackageVersionInfo[], updateInfo: PackageVersionInfo[]): PackageVersionInfo[];
}

export const IPackageManager = createDecorator<IPackageManager>('packageManager');

export class PackageManager implements IPackageManager {
    private source: string = Source.tsinghua;
    constructor(
        private _pythonPath: string,
        @IOutputChannel private readonly output: IOutputChannel,
        @IExtensionContext private readonly context: IExtensionContext,
    ) {
        this.updatePythonSource();
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(this.onConfigUpdate.bind(this))
        );
    }

    onConfigUpdate(e: vscode.ConfigurationChangeEvent) {
        const careConfig = ['source','sourceCustom'];
        const checkCareConfigChanged = (careConfig: string[], e: vscode.ConfigurationChangeEvent): boolean => {
            for(let item of careConfig) {
                if(e.affectsConfiguration(`pip-manager.${item}`)){
                    return true;
                }
            }
            return false;
        };
        if (checkCareConfigChanged(careConfig, e)) {
            this.updatePythonSource();
        }
    }

    updatePythonSource(){
        const { source, sourceCustom } = vscode.workspace.getConfiguration('pip-manager');
        const getSource = (source: string) => {
            switch (source) {
                case 'pypi': return Source.pypi;
                case 'tsinghua': return Source.tsinghua;
                case 'aliyun': return Source.aliyun;
                case 'douban': return Source.douban;
                default:
                    return '';
            }
        };

        if(sourceCustom){
            this.source = sourceCustom;
        }else{
            this.source = getSource(source);
        }
    }

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
                    errMsg += data;
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

    private pip(args: string[], cancelToken?: vscode.CancellationToken, showErrorMessage = true) {
        const python = this.pythonPath;
  
        return this.execute(python, ['-m', 'pip']
            .concat(args)
            .concat([]),
            cancelToken
        ).catch((err) => {
            if (showErrorMessage) {
                vscode.window.showErrorMessage(err.message);
            }
            return Promise.reject(err);
        });
    }

    private pipWithSource(iargs: string[], cancelToken?: vscode.CancellationToken, showErrorMessage?: boolean) {
        const args = ([] as string[]).concat(iargs);

        if (this.source) {
            args.push('-i', this.source);
        }

        return this.pip(args, cancelToken, showErrorMessage);
    }

    private createPackageInfo(pack: string | PackageInfo): PackageInfo | null {
        let out: PackageInfo;
        if (typeof pack === 'string') {
            const [name, version] = pack.split('==');
            out = { name, version: version || undefined };
        }else{
            out = {...pack};
        }
        if(!out.name){
            return null;
        }
        out.toString = ()=>{
            return `${out.name}${out.version ? `==${out.version}` : ''}`;
        };
        return out;
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    public _test_createPackageInfo = this.createPackageInfo;

    public async getPackageList(): Promise<PackageVersionInfo[]> {
        const packages = await this.pip(['list', '--format', 'json']);
        return JSON.parse(packages);
    }

    public async getPackageUpdate(): Promise<PackageVersionInfo[]> {
        const updates = await this.pipWithSource(['list', '--outdated', '--format', 'json']);
        return JSON.parse(updates);
    }

    public mergePackageListWithUpdate(packInfo: PackageVersionInfo[], updateInfo: PackageVersionInfo[]): PackageVersionInfo[] {
        const latestVersionMap: Record<string, string>= {};
        if(updateInfo && updateInfo.length > 0) {
            updateInfo.forEach((info: any) => {
                latestVersionMap[info.name] = info.latest_version;
            });
            return packInfo.map((info: any) => {
                const latestVersion = latestVersionMap[info.name];
                if(latestVersion){
                    return {
                        ...info,
                        latestVersion,
                    };
                }
                return info;
            });
        }
        return packInfo;
    }

    public async getPackageListWithUpdate(): Promise<PackageVersionInfo[]> {
        let packInfo = await this.getPackageList();
        try {
            const updateInfo = await this.getPackageUpdate();
            packInfo = this.mergePackageListWithUpdate(packInfo, updateInfo);
        } catch (error) {
            // ignore error
        }
        return packInfo;
    }

    private async installPackage(iargs: string[], cancelToken?: vscode.CancellationToken) {
        const args = ['install'].concat(iargs);

        await this.pipWithSource(args, cancelToken);
    }

    public async addPackage(pack: string | PackageInfo, cancelToken?: vscode.CancellationToken) {
        const info = this.createPackageInfo(pack);
        if (!info) {
            throw new Error('Invalid Name');
        }

        const name = info.toString();
        await this.installPackage([name], cancelToken);
    }
    public async updatePackage(pack: string | PackageInfo, cancelToken?: vscode.CancellationToken) {
        const info = this.createPackageInfo(pack);
        if (!info) {
            throw new Error('Invalid Name');
        }

        const name = info.toString();
        await this.installPackage(['--upgrade',name], cancelToken);
    }
    public async addPackageFromFile(filePath: string, cancelToken?: vscode.CancellationToken) {
        if (!filePath) {
            throw new Error('Invalid Path');
        }

        await this.installPackage(['-r', filePath], cancelToken);
    }

    public async removePackage(pack: string | PackageInfo) {
        const info = this.createPackageInfo(pack);

        if (!info) {
            throw new Error('Invalid Name');
        }
        const name = info.name;
        if (necessaryPackage.includes(name)) {
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

    public async getPackageVersionList(pack: string | PackageInfo, cancelToken?: vscode.CancellationToken) {
        const info = this.createPackageInfo(pack);

        if (!info) {
            throw new Error('Invalid Name');
        }
        const name = info.name;
        let versionList: string[] = [];

        try {
            await this.pipWithSource(['install', `${name}==`], cancelToken,  false);
        } catch (err) {
            const { message } = (err as Error);
            const [versions] = /(?<=\(from versions: ).+(?=\))/.exec(message) || [];
            versionList = (versions || '').replace(/\s+/g, '').split(',').filter((version) => (version && version !== 'none')).reverse();
        }

        return versionList;
    }
}