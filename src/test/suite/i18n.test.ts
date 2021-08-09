import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

import { i18n } from '../../i18n/localize';
import zhCn from '../../i18n/zh-cn';

suite('Extension I18n Test Suite', () => {
	test('i18n test: en', () => {
		i18n.updateLocale('en');
		assert.strictEqual('use default', i18n.localize('key.of.any', 'use default'));
		assert.strictEqual('use default with args arg0', i18n.localize('key.of.any', 'use default with args %0%', 'arg0'));
		assert.strictEqual('no key use default', i18n.localize('', 'no key use default'));
	});
	test('i18n test: zh-cn', () => {
		i18n.updateLocale('zh-cn');
		assert.strictEqual(zhCn['zh-cn']['pip-manager.input.addPackage'], i18n.localize('pip-manager.input.addPackage', 'not use default'));
		assert.strictEqual(zhCn['zh-cn']['pip-manager.tip.disableRemove'].replace('%0%', 'testArg'), i18n.localize('pip-manager.tip.disableRemove', 'not use default', 'testArg'));
		assert.strictEqual('use default', i18n.localize('key.of.any', 'use default'));
		assert.strictEqual('use default with args arg0', i18n.localize('key.of.any', 'use default with args %0%', 'arg0'));
		assert.strictEqual('no key use default', i18n.localize('', 'no key use default'));
	});
	test('i18n test: not exist', () => {
		i18n.updateLocale('not exist');
		assert.strictEqual('use default', i18n.localize('key.of.any', 'use default'));
		assert.strictEqual('use default with args arg0', i18n.localize('key.of.any', 'use default with args %0%', 'arg0'));
		assert.strictEqual('no key use default', i18n.localize('', 'no key use default'));

		i18n.updateLocale('en');
	});
});
