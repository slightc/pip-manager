import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { PackageManager } from '../../packageManager';
import { ExtensionAPI } from '../../extension';

suite('Extension Pip Test Suite', function () {
	this.timeout(10000);
	const timers: NodeJS.Timeout[] = [];
	let pip: PackageManager;

	test('pip-manager ready', (done) => {
		(async () => {
			await new Promise((resolve) => {
				const checkPipManager = () => {
					const pipManager = vscode.extensions.getExtension<ExtensionAPI>('slightc.pip-manager');
					if (pipManager && pipManager.isActive) {
						pip = pipManager.exports?.pip;
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

	test('have pip api', () => {
		assert.strictEqual(true, !!pip);
	})
	test('pip api: list', (done) => {
		(async () => {
			const packageList  = await pip.getPackageList();
			assert.strictEqual(true, JSON.stringify(packageList).includes('pip'));
		})().then(done).catch(done);
	})


	suiteTeardown(() => {
		timers.forEach((timer) => {
			clearInterval(timer);
		})
	})
});
