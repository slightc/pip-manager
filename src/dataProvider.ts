import * as vscode from 'vscode';
import { PackageManager } from './packageManager';

export class DataItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly version: string,
        public readonly collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.description = version;
        this.iconPath = new vscode.ThemeIcon('circle-outline');
        this.tooltip = `${label}@${version}`;
    }
}

export class DataProvider implements vscode.TreeDataProvider<DataItem> {
    constructor(private readonly pip: PackageManager) { }
    getTreeItem(element: DataItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DataItem): Promise<DataItem[]> {
        if(element){
            return Promise.resolve([]);
        }else{
            const packageList = await this.pip.getPackageList();
            const datalist = packageList.map((info) => {
                return new DataItem(info.name, info.version);
            });
            return Promise.resolve(datalist);
        }
    }

    private _onDidChangeTreeData: vscode.EventEmitter<DataItem | undefined | null | void> = new vscode.EventEmitter<DataItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DataItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}