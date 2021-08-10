import * as vscode from 'vscode';
import { PackageManager } from './packageManager';

export class PackageDataItem extends vscode.TreeItem {
    public name: string;
    constructor(
        public readonly label: string,
        public readonly version: string,
        public readonly collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.name = label;
        this.description = version;
        this.iconPath = new vscode.ThemeIcon('circle-outline');
        this.tooltip = `${label}@${version}`;
    }
}

export class PackageDataProvider implements vscode.TreeDataProvider<PackageDataItem> {
    constructor(private readonly pip: PackageManager) { }
    getTreeItem(element: PackageDataItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PackageDataItem): Promise<PackageDataItem[]> {
        if(element){
            return Promise.resolve([]);
        }else{
            const packageList = await this.pip.getPackageList();
            const datalist = packageList.map((info) => {
                return new PackageDataItem(info.name, info.version);
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