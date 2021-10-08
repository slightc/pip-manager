import * as vscode from 'vscode';
import { IPackageManager, PackageManager, PackageVersionInfo } from './packageManager';

export class PackageDataItem extends vscode.TreeItem {
    public name: string;
    constructor(
        public readonly info: PackageVersionInfo,
        public readonly collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(info.name, collapsibleState);
        this.name = info.name;
        this.description = info.latestVersion ? `${info.version} > ${info.latestVersion}` : info.version;
        this.iconPath = new vscode.ThemeIcon('circle-outline');
        this.tooltip = `${this.name}@${this.description}`;
        this.contextValue = info.latestVersion ? 'canUpdate' : '';
    }
}

export class PackageDataProvider implements vscode.TreeDataProvider<PackageDataItem> {
    private isFristUpdate: boolean = true;
    private nextUpdateTimer: NodeJS.Timeout | undefined;
    constructor(
        @IPackageManager private readonly pip: PackageManager
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
            let packageList: PackageVersionInfo[] = [];
            if(this.isFristUpdate){
                packageList = await this.pip.getPackageList();
                this.requireNextUpdate();
            }else{
                this.isFristUpdate = true;
                packageList = await this.pip.getPackageListWithUpdate();
            }
            const datalist = packageList.map((info) => {
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