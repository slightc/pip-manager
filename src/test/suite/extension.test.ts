import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', function () {
	this.timeout(10000);
	vscode.window.showInformationMessage('Start all tests.');
	const timers: NodeJS.Timeout[] = [];

	test('pip-manager ready', (done) => {
		(async () => {
			await new Promise((resolve) => {
				const checkPipManager = () => {
					const pipManager = vscode.extensions.getExtension('slightc.pip-manager');
					if (pipManager && pipManager.isActive) {
						resolve(undefined);
					}
				};
				checkPipManager();
				const timer = setInterval(() => {
					checkPipManager();
				}, 400);
				timers.push(timer);
			})
		})().then(done).catch(done);
	})

	this.timeout(2000);

	test('refreshPackage', (done) => {
		(async () => {
			await vscode.commands.executeCommand('pip-manager.refreshPackage');
		})().then(done).catch(done);
	})

	test('addPackage', (done) => {
		(async () => {
			await vscode.commands.executeCommand('pip-manager.addPackage', 'pyserial');
		})().then(done).catch(done);
	})
	test('removePackage', (done) => {
		(async () => {
			assert.strictEqual(false, await vscode.commands.executeCommand('pip-manager.removePackage', { label: 'pip' }))
			assert.strictEqual(true, await vscode.commands.executeCommand('pip-manager.removePackage', { label: 'pyserial' }))
		})().then(done).catch(done);
	})

	test('addPackage again', (done) => {
		(async () => {
			await vscode.commands.executeCommand('pip-manager.addPackage', 'pyserial');
		})().then(done).catch(done);
	})

	suiteTeardown(() => {
		timers.forEach((timer) => {
			clearInterval(timer);
		})
	})
});
