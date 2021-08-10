// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { PackageDataItem, PackageDataProvider } from './packageDataProvider';
import { pythonExtensionReady } from './pythonApi';
import { PackageManager, necessaryPackage } from './packageManager';
import { i18n } from './i18n/localize';
import axios from 'axios';
import * as path from 'path';

export interface ExtensionAPI {
	pip: PackageManager
}

class CommandTool {
	private map = new Map<string, vscode.Disposable>();
	constructor(private _context: vscode.ExtensionContext) { }

	public registerEmptyCommand(name: string) {
		this.map.set(name, vscode.commands.registerCommand(name, () => { }));
	}
	public registerEmptyCommands(names: string[]) {
		names.forEach((name) => {
			this.registerEmptyCommand(name);
		})
	}
	public disposeEmptyCommand(name: string) {
		const command = this.map.get(name);
		if (command) {
			command.dispose();
		}
	}
	public registerCommand(name: string, callback: (...args: any[]) => any, thisArg?: any) {
		this.disposeEmptyCommand(name);
		this._context.subscriptions.push(vscode.commands.registerCommand(name, callback, thisArg));
	}
}


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	const commandTool = new CommandTool(context);
	commandTool.registerEmptyCommands([
		'pip-manager.addPackage',
		'pip-manager.refreshPackage',
		'pip-manager.searchPackage',
	])

	const [pythonPath, onPythonPathChange] = await pythonExtensionReady();

	const outputChannel = vscode.window.createOutputChannel('Pip Manager');
	outputChannel.clear();
	outputChannel.appendLine('Pip Manager Start');

	const pip = new PackageManager(pythonPath, outputChannel);
	const packageDataProvider = new PackageDataProvider(pip);

	context.subscriptions.push(onPythonPathChange((pythonPath) => {
		pip.updatePythonPath(pythonPath);
		packageDataProvider.refresh();
	}));

	context.subscriptions.push(vscode.window.registerTreeDataProvider('pip-manager-installed', packageDataProvider));

	commandTool.registerCommand('pip-manager.refreshPackage', () => {
		packageDataProvider.refresh();
	});

	async function addPackage(name?: string){
		if(name){
			outputChannel.clear();
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: i18n.localize('pip-manager.tip.addPackage', 'installing package %0%', `${name}`),
				cancellable: true,
			}, async (progress, cancelToken) => {
				await pip.addPackage(name, cancelToken);
				packageDataProvider.refresh();
			});
		}
	}
	commandTool.registerCommand('pip-manager.addPackage', async (name?: string) => {
		let value = '';
		if(name){
			value  = name;
		}else{
			value = await vscode.window.showInputBox({ title: i18n.localize('pip-manager.input.addPackage', 'input install package name') }) || '';
		}
		await addPackage(value);
	});

	function checkRemovePackage(name: string) {
		if (necessaryPackage.includes(name)) {
			vscode.window.showWarningMessage(i18n.localize('pip-manager.tip.disableRemove', 'package %0% cannot remove',`${necessaryPackage}`));
			return false;
		}
		return true;
	}

	commandTool.registerCommand('pip-manager.removePackage', async (e?: PackageDataItem) => {
		let value = '';
		if(!e){
			value = await vscode.window.showInputBox({ title: i18n.localize('pip-manager.input.removePackage', 'input remove package name') }) || '';
		}else{
			value = e.label;
		}

		if (!(value && checkRemovePackage(value.split('==')[0]))) {
			return false;
		}
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: i18n.localize('pip-manager.tip.removePackage', 'remove package %0%', `${value}`),
		}, async () => {
			await pip.removePackage(value);
			packageDataProvider.refresh();
		});
		return true;
	});
	commandTool.registerCommand('pip-manager.packageDescription', async (e?: PackageDataItem) => {
		let value = '';
		if (!e) {
			value = await vscode.window.showInputBox({ title: i18n.localize('pip-manager.input.packageDescription', 'input find package name') }) || '';
		} else {
			value = e.label;
		}
		if (!value) {
			return;
		}
		vscode.env.openExternal(vscode.Uri.parse(`https://pypi.org/project/${value}/`));
	});

	commandTool.registerCommand('pip-manager.copyPackageName', async (e?: PackageDataItem) => {
		if (!e) {
			return;
		}
		const value = e.label;
		if (!value) {
			return;
		}
		await vscode.env.clipboard.writeText(value);
	});

	commandTool.registerCommand('pip-manager.installRequirements', async (e?: vscode.Uri) => {
		if (!e) {
			return;
		}
		const filePath = e.path;
		if (!filePath) {
			return;
		}
		outputChannel.clear();
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: i18n.localize('pip-manager.tip.addPackageFromFile', 'installing package in %0%', path.basename(e.path)),
			cancellable: true,
		}, async (progress, cancelToken) => {
			await pip.addPackageFromFile(filePath, cancelToken);
			packageDataProvider.refresh();
		});
	});

	commandTool.registerCommand('pip-manager.searchPackage', async () => {
		const qPick = vscode.window.createQuickPick();

		let rBusy = 0;
		let timer: NodeJS.Timeout;
		let lastCancelToken: vscode.CancellationTokenSource | undefined;

		qPick.busy = true;
		qPick.show();
		const defaultTitle = i18n.localize('pip-manager.pick.search.defaultTitle', 'search from PyPI');
		qPick.title = defaultTitle;
		qPick.placeholder = i18n.localize('pip-manager.pick.search.placeholder', 'input to search');

		const btnTable = {
			dot: { iconPath: new vscode.ThemeIcon('debug-stackframe-dot') },
			left: { iconPath: new vscode.ThemeIcon('arrow-left'), tooltip: i18n.localize('pip-manager.pick.search.preBtn', 'pre page') },
			right: { iconPath: new vscode.ThemeIcon('arrow-right'), tooltip: i18n.localize('pip-manager.pick.search.nextBtn', 'next page') },
		};

		function clearSteps() {
			qPick.step = 0;
			qPick.totalSteps = 0;
			qPick.buttons = [];
		}

		function setStep(step: number, totalSteps?: number) {
			qPick.step = step;
			if(totalSteps){
				qPick.totalSteps = totalSteps;
			}
			let preBtn,nextBtn;
			if(qPick.step === 1){
				preBtn = btnTable.dot;
			}else {
				preBtn = btnTable.left;
			}
			if(qPick.step === qPick.totalSteps){
				nextBtn = btnTable.dot;
			}else{
				nextBtn = btnTable.right;
			}
			qPick.buttons = [preBtn,nextBtn];
		}

		async function updateItemList(value: string, page: number, clear = true) {
			if(lastCancelToken){
				lastCancelToken.cancel();
			}
			const cancelToken = new vscode.CancellationTokenSource();
			lastCancelToken = cancelToken;
			rBusy++;
			qPick.busy = !!rBusy;

			try {
				if (value) {
					qPick.title = i18n.localize('pip-manager.pick.search.resultTitle', 'search for %0%', `${value}`);;
				} else {
					qPick.title = defaultTitle;
				}
				if(clear){
					clearSteps();
				}else{
					setStep(page);
				}
				const data = await pip.searchFromPyPi(value, page, cancelToken.token);
				qPick.items = data.list;
				setStep(page,data.totalPages);
				qPick.step = page;
				qPick.totalSteps = data.totalPages;
			} catch (err) {
				if(!axios.isCancel(err)) {
					qPick.title = i18n.localize('pip-manager.pick.search.noResultTitle', 'no search result');
					qPick.items = [];
					qPick.step = 0;
					qPick.totalSteps = 0;
				}
			}
			cancelToken.dispose();
			rBusy--;
			qPick.busy = !!rBusy;
		}

		qPick.onDidChangeValue((value: string) => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				updateItemList(value, 1);
			}, 300);
		});

		qPick.onDidChangeSelection((data) => {
			const item = data[0];
			qPick.hide();
			const value = item.label;
			addPackage(value);
		});

		qPick.onDidTriggerButton((e) => {
			if (e === btnTable.left) {
				updateItemList(qPick.value, (qPick.step || 0) - 1, false);
			}
			if (e === btnTable.right) {
				updateItemList(qPick.value, (qPick.step || 0) + 1, false);
			}
		});

		qPick.onDidHide(() => {
			qPick.dispose();
			lastCancelToken?.dispose();
		});

		updateItemList('', 1);
	});

	return { pip } as ExtensionAPI;
}

// this method is called when your extension is deactivated
export function deactivate() {}
