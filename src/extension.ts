// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DataItem, DataProvider } from './dataProvider';
import { PythonExtensionApi } from './pythonApi';
import { PackageManager } from './packageManager';
import { i18n } from './i18n/localize';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	const pythonExt = vscode.extensions.getExtension<PythonExtensionApi>('ms-python.python');

	if(!pythonExt){
		vscode.window.showErrorMessage(i18n.localize('pip-manager.tip.installPython', 'Please install python extension'));
		return;
	}

	if(!pythonExt.isActive){
		await pythonExt.exports.ready;
	}

	function getPythonPath(extension: vscode.Extension<PythonExtensionApi>): string {
		const executionDetails = extension.exports.settings.getExecutionDetails();
		return executionDetails?.execCommand?.[0] || '';
	}

	const outputChannel = vscode.window.createOutputChannel('Pip Manager');

	outputChannel.clear();
	outputChannel.appendLine('Pip Manager Start');

	const pythonPath = getPythonPath(pythonExt);

	const pip = new PackageManager(pythonPath, outputChannel);
	const dataProvider = new DataProvider(pip);

	context.subscriptions.push(pythonExt.exports.settings.onDidChangeExecutionDetails((e) => {
		const pythonPath = getPythonPath(pythonExt);
		pip.updatePythonPath(pythonPath);
		dataProvider.refresh();
	}));

	context.subscriptions.push(vscode.window.registerTreeDataProvider('pip-manager-installed', dataProvider));

	context.subscriptions.push(vscode.commands.registerCommand('pip-manager.refreshPackage', () => {
		dataProvider.refresh();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('pip-manager.addPackage', async () => {
		const value = await vscode.window.showInputBox({ title: i18n.localize('pip-manager.input.addPackage', 'input install package name') });
		if(value){
			outputChannel.clear();
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: i18n.localize('pip-manager.tip.addPackage', 'installing package %0%', `${value}`),
				cancellable: true,
			}, async (progress, cancelToken) => {
				await pip.addPackage(value, cancelToken);
				dataProvider.refresh();
			});
		}
	}));

	function checkRemovePackage(name: string) {
		const necessaryPackage = [
			'pip', 'setuptools', 'wheel',
		];
		if (necessaryPackage.includes(name)) {
			vscode.window.showWarningMessage(i18n.localize('pip-manager.tip.disableRemove', 'package %0% cannot remove',`${necessaryPackage}`));
			return false;
		}
		return true;
	}

	context.subscriptions.push(vscode.commands.registerCommand('pip-manager.removePackage', async (e?: DataItem) => {
		let value = '';
		if(!e){
			value = await vscode.window.showInputBox({ title: i18n.localize('pip-manager.input.removePackage', 'input remove package name') }) || '';
		}else{
			value = e.label;
		}

		if (!(value && checkRemovePackage(value.split('@')[0]))) {
			return;
		}
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: i18n.localize('pip-manager.tip.removePackage', 'remove package %0%', `${value}`),
		}, async () => {
			await pip.removePackage(value);
			dataProvider.refresh();
		});
	}));
	context.subscriptions.push(vscode.commands.registerCommand('pip-manager.packageDescription', async (e?: DataItem) => {
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
	}));
}

// this method is called when your extension is deactivated
export function deactivate() {}
