// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { PackageDataItem, PackageDataProvider } from './modules/PackageDataProvider';
import { PythonExtension } from './modules/PythonExtension';
import { PackageManager, necessaryPackage } from './modules/PackageManager';
import { i18n } from './common/i18n/localize';
import axios from 'axios';
import * as path from 'path';
import { ServiceCollection } from './common/ioc/common/serviceCollection';
import { InstantiationService } from './common/ioc';
import { IOutputChannel, IExtensionContext } from './interface/common';
import trace from './common/trace';
import { CommandTool } from './modules/CommandTool';

export interface ExtensionAPI {
	pip: PackageManager
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	// start register services
	const services = new ServiceCollection();
	const instantiationService = new InstantiationService(services);
	const outputChannel: IOutputChannel = vscode.window.createOutputChannel('Pip Manager');
	outputChannel.clear();

	services.set(IExtensionContext, context);
	services.set(IOutputChannel, outputChannel);

	const commandTool = CommandTool.Create(instantiationService, services);

	commandTool.registerEmptyCommand([
		'pip-manager.addPackage',
		'pip-manager.refreshPackage',
		'pip-manager.searchPackage',
	]);


	outputChannel.appendLine('Pip Manager Start');

	const pythonExtension = PythonExtension.Create(instantiationService, services);
	await pythonExtension.waitPythonExtensionInited();

	const pythonPath = pythonExtension.pythonPath;
	outputChannel.appendLine(`Pip Manager Got python path at ${pythonPath}`);

	const pip = PackageManager.Create(instantiationService, services, pythonPath);
	const packageDataProvider = PackageDataProvider.Create(instantiationService, services);

	pythonExtension.onPythonPathChange((newPythonPath)=>{
		pip.updatePythonPath(newPythonPath);
		packageDataProvider.refresh();
	});

	// after services registered

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

	async function updatePackage(name?: string){
		if(name){
			outputChannel.clear();
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: i18n.localize('pip-manager.tip.updatePackage', 'update package %0%', `${name}`),
				cancellable: true,
			}, async (progress, cancelToken) => {
				await pip.updatePackage(name, cancelToken);
				packageDataProvider.refresh();
			});
		}
	}

	function checkRemovePackage(name: string) {
		if (necessaryPackage.includes(name)) {
			vscode.window.showWarningMessage(i18n.localize('pip-manager.tip.disableRemove', 'package %0% cannot remove',`${necessaryPackage}`));
			return false;
		}
		return true;
	}

	// ======================

	const pipManagerTreeView = vscode.window.createTreeView('pip-manager-installed', {
		treeDataProvider: packageDataProvider,
	});
    pipManagerTreeView.onDidChangeVisibility((e)=>{
        if(e.visible) {
            trace.openView();
        }
    });
    context.subscriptions.push(pipManagerTreeView);

	commandTool.registerCommand('pip-manager.refreshPackage', () => {
		packageDataProvider.refresh();
	});

	commandTool.registerCommand('pip-manager.addPackage', async (name?: string) => {
		let value = '';
		if(name){
			value  = name;
		}else{
			value = await vscode.window.showInputBox({ title: i18n.localize('pip-manager.input.addPackage', 'input install package name') }) || '';
		}
		await addPackage(value);
	});

	commandTool.registerCommand('pip-manager.updatePackage', async (e?: PackageDataItem) => {
		if(!e?.name) {
			return;
		}
		await updatePackage(e.name);
	});

	commandTool.registerCommand('pip-manager.removePackage', async (e?: PackageDataItem) => {
		let value = '';
		if(!e){
			value = await vscode.window.showInputBox({ title: i18n.localize('pip-manager.input.removePackage', 'input remove package name') }) || '';
		}else{
			value = e.name;
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
			value = e.name;
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
		const value = e.name;
		if (!value) {
			return;
		}
		await vscode.env.clipboard.writeText(value);
	});

	commandTool.registerCommand('pip-manager.installRequirements', async (e?: vscode.Uri) => {
		if (!e) {
			return;
		}
		const filePath = e.fsPath;
		if (!filePath) {
			return;
		}
		outputChannel.clear();
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: i18n.localize('pip-manager.tip.addPackageFromFile', 'installing package in %0%', path.basename(filePath)),
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

	commandTool.registerCommand('pip-manager.pickPackageVersion', async (e?: PackageDataItem) => {
		let pack = '';
		if(!e){
			pack = await vscode.window.showInputBox({ title: i18n.localize('pip-manager.input.pickPackageVersion', 'input pick version package name') }) || '';
		}else{
			pack = e.name;
		}

		pack = pack.split('==')[0];
		if (!(pack)) {
			return false;
		}

		let versionList: string[] = [];

		outputChannel.clear();
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: i18n.localize('pip-manager.tip.pickPackageVersion', 'check %0% version', `${pack}`),
			cancellable: true,
		}, async (progress, cancelToken) => {
			versionList = await pip.getPackageVersionList(pack, cancelToken);
		});

		if (!versionList.length) {
			vscode.window.showInformationMessage(i18n.localize('pip-manager.tip.noPackageVersion', 'no found version for %0%', `${pack}`));
			return;
		}

		const quickPickItems: vscode.QuickPickItem[] = versionList.map((item)=>{
			const picked = (e?.version && e?.version === item) || false;
			return {
				label: item,
				alwaysShow: true,
				description: picked ?
					i18n.localize('pip-manager.tip.currentVersion','%0% current version', pack) :
					undefined,
				picked,
			};
		});

		const selectedVersion = await new Promise<vscode.QuickPickItem | null>((resolve, reject) => {
			const qPick = vscode.window.createQuickPick();
			let value: vscode.QuickPickItem | null = null;
			qPick.title = i18n.localize('pip-manager.tip.selectPackageVersion', 'select install version for %0%', `${pack}`);
			qPick.placeholder = e?.version;
			qPick.items = quickPickItems;
			qPick.activeItems = quickPickItems.filter((item) => item.picked);

			qPick.onDidChangeSelection((e) => {
				value = e[0];
				qPick.hide();
			});
			qPick.onDidHide(() => {
				resolve(value);
				qPick.dispose();
			});

			qPick.show();
		});

		if (selectedVersion && selectedVersion.label !== e?.version) {
			vscode.commands.executeCommand('pip-manager.addPackage', `${pack}==${selectedVersion.label}`);
		}
	});

	return { pip } as ExtensionAPI;
}

// this method is called when your extension is deactivated
export function deactivate() {}
