import * as vscode from "vscode";
import { InstantiationService, ServiceCollection, createDecorator } from "@/common/ioc";
import { IExtensionContext } from "@/interface/common";

export interface ICommandTool {
    registerEmptyCommand(name: string): void;
    registerEmptyCommand(names: string[]): void;
    disposeEmptyCommand(name: string): void;
    registerCommand(name: string, callback: (...args: any[]) => any, thisArg?: any): void;
}
export const ICommandTool = createDecorator<ICommandTool>('commandTool');


export class CommandTool implements ICommandTool {
    private emptyCommandMap = new Map<string, vscode.Disposable>();
    constructor(@IExtensionContext private _context: IExtensionContext) { }

    static Create(instantiation: InstantiationService, service?: ServiceCollection) {
        const instance = instantiation.createInstance<ICommandTool>(this);
        if(service) {
            service.set(ICommandTool, instance);
        }
        return instance;
    }

    registerEmptyCommand(name: string): void;
    registerEmptyCommand(names: string[]): void;
	public registerEmptyCommand(name: string | string[]) {
        if(Array.isArray(name)) {
            this.registerEmptyCommands(name);
        }else {
            this.emptyCommandMap.set(name, vscode.commands.registerCommand(name, () => { }));
        }
	}
    private registerEmptyCommands(names: string[]) {
        names.forEach((name) => {
            this.registerEmptyCommand(name);
        });
    }
	public disposeEmptyCommand(name: string) {
		const command = this.emptyCommandMap.get(name);
		if (command) {
			command.dispose();
		}
	}
	public registerCommand(name: string, callback: (...args: any[]) => any, thisArg?: any) {
		this.disposeEmptyCommand(name);
		this._context.subscriptions.push(vscode.commands.registerCommand(name, callback, thisArg));
	}
}