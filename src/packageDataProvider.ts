import * as vscode from 'vscode';
import { IPackageManager, PackageVersionInfo } from './packageManager';

export class PackageDataItem extends vscode.TreeItem {
    public name: string;
    public version?: string;
    constructor(
        public readonly info: PackageVersionInfo,
        public readonly collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(info.name, collapsibleState);
        const canUpdate = (info.latestVersion && info.latestVersion !== info.version);
        this.name = info.name;
        this.version = info.version;
        this.description = canUpdate ? `${info.version} > ${info.latestVersion}` : info.version;
        this.iconPath = new vscode.ThemeIcon('circle-outline');
        this.tooltip = `${this.name}@${this.description}`;
        this.contextValue = canUpdate ? 'canUpdate' : '';
    }
}

export class PackageDataProvider implements vscode.TreeDataProvider<PackageDataItem> {
    private isFristUpdate: boolean = true;
    private nextUpdateTimer: NodeJS.Timeout | undefined;
    private packageList: PackageVersionInfo[] = [];
    private packageUpdateList: PackageVersionInfo[] = [];
    constructor(
        @IPackageManager private readonly pip: IPackageManager
    ) { }

    getTreeItem(element: PackageDataItem): vscode.TreeItem {
        return element;
    }

    requireNextUpdate() {
        this.isFristUpdate = false;
        if(this.nextUpdateTimer){
            clearTimeout(this.nextUpdateTimer);
        }
        this.nextUpdateTimer = setTimeout(() => {
            this._onDidChangeTreeData.fire();
        }, 100);
    }

    async getChildren(element?: PackageDataItem): Promise<PackageDataItem[]> {
        if(element){
            return Promise.resolve([]);
        }else{
            if(this.isFristUpdate){
                this.packageList = await this.pip.getPackageList();
                /** async fetch update info */
                this.pip.getPackageUpdate().then((updateInfo) => {
                    this.packageUpdateList = updateInfo;
                }).finally(() => {
                    this.requireNextUpdate();
                });
            }else{
                this.isFristUpdate = true;
            }
            const packList = this.pip.mergePackageListWithUpdate(this.packageList, this.packageUpdateList);
            const datalist = packList.map((info) => {
                return new PackageDataItem(info);
            });
            return Promise.resolve(datalist);
        }
    }

    private _onDidChangeTreeData: vscode.EventEmitter<PackageDataItem | undefined | null | void> = new vscode.EventEmitter<PackageDataItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PackageDataItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this.isFristUpdate = true;
        this._onDidChangeTreeData.fire();
    }
}