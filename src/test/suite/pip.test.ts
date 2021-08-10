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

	test('have pip api', () => {
		assert.strictEqual(true, !!pip);
	})

	test('pip api: _test_createPackageInfo',() => {
		let info = pip._test_createPackageInfo('test==0.0.1');
		assert.strictEqual('test', info?.name);
		assert.strictEqual('0.0.1', info?.version);
		assert.strictEqual('test==0.0.1', info?.toString());

		info = pip._test_createPackageInfo('test2');
		assert.strictEqual('test2', info?.name);
		assert.strictEqual(undefined, info?.version);

		info = pip._test_createPackageInfo({ name: 'test3', version: '0.0.2' });
		assert.strictEqual('test3', info?.name);
		assert.strictEqual('0.0.2', info?.version);
		assert.strictEqual('test3==0.0.2', info?.toString());

		info = pip._test_createPackageInfo({ name: 'test4' });
		assert.strictEqual('test4', info?.name);
		assert.strictEqual(undefined, info?.version);

		info = pip._test_createPackageInfo('');
		assert.strictEqual(null, info);

		info = pip._test_createPackageInfo({ name: '' });
		assert.strictEqual(null, info);
	})

	test('pip api: list', (done) => {
		(async () => {
			const packageList  = await pip.getPackageList();
			assert.strictEqual(true, JSON.stringify(packageList).includes('pip'));
		})().then(done).catch(done);
	})
	test('pip api: search', (done) => {
		(async () => {
			const searchResult  = await pip.searchFromPyPi('pip');
			assert.strictEqual(true, searchResult?.list.length > 0);
		})().then(done).catch(done);
	})


	suiteTeardown(() => {
		timers.forEach((timer) => {
			clearInterval(timer);
		})
	})
});
