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
    constructor(
        @IPackageManager private readonly pip: PackageManager
    ) { }

    getTreeItem(element: PackageDataItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PackageDataItem): Promise<PackageDataItem[]> {
        if(element){
            return Promise.resolve([]);
        }else{
            const packageList = await this.pip.getPackageList();
            const datalist = packageList.map((info) => {
                return new PackageDataItem(info);
            });
            return Promise.resolve(datalist);
        }
    }

    private _onDidChangeTreeData: vscode.EventEmitter<PackageDataItem | undefined | null | void> = new vscode.EventEmitter<PackageDataItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PackageDataItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}