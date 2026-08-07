'use strict';

/**
 * Test script for Part 1 verification
 * Tests: TaskExtractor, DingTalkConnector interface, SyncEngine config loading
 *
 * Run: node scripts/test-sync.js
 */

var path = require('path');
var assert = require('assert');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  PASS: ' + name);
    passed++;
  } catch (e) {
    console.log('  FAIL: ' + name + ' - ' + e.message);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log('  PASS: ' + name);
    passed++;
  } catch (e) {
    console.log('  FAIL: ' + name + ' - ' + e.message);
    failed++;
  }
}

console.log('\n=== Part 1 Tests ===\n');

// ---- Test TaskExtractor ----
console.log('TaskExtractor:');

var TaskExtractor = require('../electron-app/task-extractor');

test('creates extractor with defaults', function() {
  var ext = new TaskExtractor();
  assert(ext.keywords.length > 0, 'should have default keywords');
  assert(ext.excludePatterns.length > 0, 'should have exclude patterns');
});

test('isTaskMessage - detects task keyword', function() {
  var ext = new TaskExtractor({ selfName: '张三' });
  var msg = { content: '帮忙处理一下本周的项目周报', sender: '李四' };
  assert(ext.isTaskMessage(msg) === true, 'should detect task');
});

test('isTaskMessage - filters self messages', function() {
  var ext = new TaskExtractor({ selfName: '张三' });
  var msg = { content: '帮忙处理一下本周的项目周报', sender: '张三' };
  assert(ext.isTaskMessage(msg) === false, 'should filter self');
});

test('isTaskMessage - filters ack words', function() {
  var ext = new TaskExtractor();
  var msg = { content: '收到', sender: '张三' };
  assert(ext.isTaskMessage(msg) === false, 'should filter ack');
});

test('isTaskMessage - filters short messages', function() {
  var ext = new TaskExtractor();
  var msg = { content: '好', sender: '张三' };
  assert(ext.isTaskMessage(msg) === false, 'should filter short');
});

test('isTaskMessage - filters image messages', function() {
  var ext = new TaskExtractor();
  var msg = { content: '[图片]设计图', sender: '张三' };
  assert(ext.isTaskMessage(msg) === false, 'should filter [图片]');
});

test('extractPriority - P0 for urgent', function() {
  var ext = new TaskExtractor();
  assert(ext.extractPriority('这个很紧急，今天要') === 'P0', 'should be P0');
});

test('extractPriority - P1 for important', function() {
  var ext = new TaskExtractor();
  assert(ext.extractPriority('重要，需要尽快完成') === 'P1', 'should be P1');
});

test('extractPriority - P2 for normal', function() {
  var ext = new TaskExtractor();
  assert(ext.extractPriority('帮忙整理个文档') === 'P2', 'should be P2');
});

test('extractDueDate - today', function() {
  var ext = new TaskExtractor();
  var today = new Date();
  var pad = function(n) { return String(n).padStart(2, '0'); };
  var expected = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
  assert(ext.extractDueDate('今天交') === expected, 'should extract today');
});

test('extractDueDate - X号', function() {
  var ext = new TaskExtractor();
  var result = ext.extractDueDate('15号之前交');
  assert(result.match(/^\d{4}-\d{2}-15$/), 'should extract day 15, got: ' + result);
});

test('extractDueDate - empty for no date', function() {
  var ext = new TaskExtractor();
  assert(ext.extractDueDate('帮忙整理') === '', 'should be empty');
});

test('extract - full pipeline', function() {
  var ext = new TaskExtractor({ selfName: '张三' });
  var messages = [
    { platform: 'dingtalk', chatName: '项目群', chatType: 'group', content: '帮忙整理一下项目周报', sender: '李四' },
    { platform: 'dingtalk', chatName: '项目群', chatType: 'group', content: '收到', sender: '王五' },
    { platform: 'dingtalk', chatName: '项目群', chatType: 'group', content: '紧急修改方案文档', sender: '张三' },
  ];
  var tasks = ext.extract(messages, '20260807100000');
  assert(tasks.length === 1, 'should extract 1 task, got ' + tasks.length);
  assert(tasks[0].priority === 'P2', 'should be P2');
  assert(tasks[0].source === '项目群', 'should have source');
  assert(tasks[0].platform === 'dingtalk', 'should have platform');
});

// ---- Test DingTalkConnector ----
console.log('\nDingTalkConnector:');

var DingTalkConnector = require('../electron-app/connectors/dingtalk');
var BaseConnector = require('../electron-app/connectors/base');

test('creates DingTalk connector', function() {
  var dt = new DingTalkConnector({
    platform: 'dingtalk',
    nodePath: 'node',
    dwsPath: '/fake/dws.js',
    groups: [{ name: '群1', id: 'cid123' }],
    contacts: [{ name: '张三', id: 'uid456' }],
    selfName: '李四'
  });
  assert(dt.platform === 'dingtalk', 'platform should be dingtalk');
  assert(dt.groups.length === 1, 'should have 1 group');
  assert(dt.contacts.length === 1, 'should have 1 contact');
});

test('inherits from BaseConnector', function() {
  var dt = new DingTalkConnector({
    nodePath: 'node',
    dwsPath: '/fake/dws.js',
    groups: [],
    contacts: []
  });
  assert(dt instanceof BaseConnector, 'should be instance of BaseConnector');
  assert(typeof dt.syncAll === 'function', 'should have syncAll method');
  assert(typeof dt.testConnection === 'function', 'should have testConnection method');
});

test('getMonitoredChats returns all chats', function() {
  var dt = new DingTalkConnector({
    nodePath: 'node',
    dwsPath: '/fake/dws.js',
    groups: [{ name: '群A', id: 'cid1' }, { name: '群B', id: 'cid2' }],
    contacts: [{ name: '张三', id: 'uid1' }]
  });
  var chats = dt.getMonitoredChats();
  assert(chats.length === 3, 'should have 3 chats, got ' + chats.length);
  assert(chats[0].type === 'group', 'first should be group');
  assert(chats[2].type === 'p2p', 'last should be p2p');
});

test('syncAll returns empty for no chats', async function() {
  var dt = new DingTalkConnector({
    nodePath: 'node',
    dwsPath: '/fake/dws.js',
    groups: [],
    contacts: []
  });
  var result = await dt.syncAll('2026-08-07 08:00:00');
  assert(result.success === true, 'should succeed');
  assert(result.messages.length === 0, 'should have 0 messages');
});

// ---- Test FeishuConnector ----
console.log('\nFeishuConnector:');

var FeishuConnector = require('../electron-app/connectors/feishu');

test('creates Feishu connector', function() {
  var fs = new FeishuConnector({
    platform: 'feishu',
    appId: 'cli_test',
    appSecret: 'secret',
    chats: [{ name: '项目群', id: 'oc_123', type: 'group' }],
    limit: 30
  });
  assert(fs.platform === 'feishu', 'platform should be feishu');
  assert(fs.appId === 'cli_test', 'should have appId');
  assert(fs.chats.length === 1, 'should have 1 chat');
  assert(fs.limit === 30, 'should have limit 30');
});

test('inherits from BaseConnector', function() {
  var fs = new FeishuConnector({ appId: 'x', appSecret: 'y', chats: [] });
  assert(fs instanceof BaseConnector, 'should be instance of BaseConnector');
  assert(typeof fs.syncAll === 'function', 'should have syncAll');
  assert(typeof fs.testConnection === 'function', 'should have testConnection');
});

test('getMonitoredChats returns all chats', function() {
  var fs = new FeishuConnector({
    appId: 'x', appSecret: 'y',
    chats: [
      { name: '群A', id: 'oc_1', type: 'group' },
      { name: '张三', id: 'oc_2', type: 'p2p' }
    ]
  });
  var chats = fs.getMonitoredChats();
  assert(chats.length === 2, 'should have 2 chats, got ' + chats.length);
  assert(chats[0].type === 'group', 'first should be group');
  assert(chats[1].type === 'p2p', 'second should be p2p');
});

test('syncAll returns empty for no chats', async function() {
  var fs = new FeishuConnector({ appId: 'x', appSecret: 'y', chats: [] });
  var result = await fs.syncAll('2026-08-07 08:00:00');
  assert(result.success === true, 'should succeed');
  assert(result.messages.length === 0, 'should have 0 messages');
});

test('testConnection fails without credentials', async function() {
  var fs = new FeishuConnector({ appId: '', appSecret: '', chats: [] });
  var result = await fs.testConnection();
  assert(result.success === false, 'should fail without credentials');
});

test('_parseContent - text message', function() {
  var fs = new FeishuConnector({ appId: 'x', appSecret: 'y', chats: [] });
  var content = fs._parseContent('text', JSON.stringify({ text: 'hello world' }));
  assert(content === 'hello world', 'should parse text, got: ' + content);
});

test('_parseContent - post (rich text)', function() {
  var fs = new FeishuConnector({ appId: 'x', appSecret: 'y', chats: [] });
  var postBody = JSON.stringify({
    title: '标题',
    content: [[{ tag: 'text', text: '第一段' }, { tag: 'text', text: '第二段' }]]
  });
  var content = fs._parseContent('post', postBody);
  assert(content.indexOf('标题') >= 0, 'should include title');
  assert(content.indexOf('第一段') >= 0, 'should include first text');
  assert(content.indexOf('第二段') >= 0, 'should include second text');
});

test('_parseContent - image returns placeholder', function() {
  var fs = new FeishuConnector({ appId: 'x', appSecret: 'y', chats: [] });
  var content = fs._parseContent('image', '{}');
  assert(content === '[图片]', 'should return [图片], got: ' + content);
});

test('_parseContent - empty body', function() {
  var fs = new FeishuConnector({ appId: 'x', appSecret: 'y', chats: [] });
  var content = fs._parseContent('text', '');
  assert(content === '', 'should return empty');
});

test('_formatTimestamp - valid timestamp', function() {
  var fs = new FeishuConnector({ appId: 'x', appSecret: 'y', chats: [] });
  // 1608594809 = 2020-12-22 10:06:49 UTC
  var result = fs._formatTimestamp('1608594809');
  assert(result.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/), 'should format timestamp, got: ' + result);
});

test('_formatTimestamp - empty input', function() {
  var fs = new FeishuConnector({ appId: 'x', appSecret: 'y', chats: [] });
  assert(fs._formatTimestamp('') === '', 'should return empty');
});

test('cross-platform: TaskExtractor works with Feishu messages', function() {
  var ext = new TaskExtractor({ selfName: '张三' });
  var messages = [
    { platform: 'feishu', chatName: '项目群', chatType: 'group', content: '帮忙整理一下项目文档', sender: '李四' },
    { platform: 'feishu', chatName: '项目群', chatType: 'group', content: '[图片]', sender: '王五' },
    { platform: 'feishu', chatName: '项目群', chatType: 'group', content: '收到', sender: '王五' },
  ];
  var tasks = ext.extract(messages, '20260807100000');
  assert(tasks.length === 1, 'should extract 1 task from feishu messages, got ' + tasks.length);
  assert(tasks[0].platform === 'feishu', 'should have feishu platform');
});

// ---- Test SyncEngine config loading ----
console.log('\nSyncEngine:');

var fs = require('fs');
var CONFIG_PATH = path.join(__dirname, '..', 'electron-app', 'config.json');

test('config.json exists and is valid', function() {
  assert(fs.existsSync(CONFIG_PATH), 'config.json should exist');
  var config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  assert(config.connectors, 'should have connectors section');
  assert(config.connectors.dingtalk, 'should have dingtalk connector');
  assert(config.connectors.dingtalk.enabled === true, 'dingtalk should be enabled');
  assert(config.connectors.dingtalk.groups.length > 0, 'should have groups');
  assert(config.connectors.dingtalk.contacts.length > 0, 'should have contacts');
  assert(config.selfName, 'should have selfName');
});

test('config has nodePath and dwsPath', function() {
  var config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  assert(config.connectors.dingtalk.nodePath, 'should have nodePath');
  assert(config.connectors.dingtalk.dwsPath, 'should have dwsPath');
});

test('feishu and wecom are disabled', function() {
  var config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  assert(config.connectors.feishu.enabled === false, 'feishu should be disabled');
  assert(config.connectors.wecom.enabled === false, 'wecom should be disabled');
});

// ---- Summary ----
console.log('\n=== Results ===');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
console.log('');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!\n');
}
