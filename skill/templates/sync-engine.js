'use strict';

/**
 * SyncEngine - Multi-connector sync orchestrator
 *
 * This is a standalone script spawned by Electron's main process.
 * It can also be run directly for testing:
 *   node sync-engine.js [--config path/to/config.json]
 *
 * Pipeline:
 *   config.json → init connectors → parallel sync → aggregate messages
 *   → task extraction → write tasks.json → stdout summary
 *
 * Config format (config.json):
 *   {
 *     "tasksFile": "/path/to/tasks.json",
 *     "selfName": "张三",
 *     "hoursBack": 2,
 *     "connectors": {
 *       "dingtalk": {
 *         "enabled": true,
 *         "nodePath": "/path/to/node",
 *         "dwsPath": "/path/to/dws.js",
 *         "groups": [{ "name": "...", "id": "..." }],
 *         "contacts": [{ "name": "...", "id": "..." }]
 *       },
 *       "feishu": { ... },
 *       "wecom": { ... }
 *     },
 *     "extractor": {
 *       "keywords": [...],
 *       "selfName": "张三"
 *     }
 *   }
 */

var fs = require('fs');
var path = require('path');

// ---- Helpers ----

function formatTime(date) {
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

function log(msg) {
  process.stderr.write('[sync-engine] ' + msg + '\n');
}

// ---- Config loading ----

function loadConfig() {
  // Allow custom config path via --config arg
  var configPath = path.join(__dirname, 'config.json');
  var args = process.argv.slice(2);
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = args[i + 1];
      break;
    }
  }

  try {
    var raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    log('Failed to load config from ' + configPath + ': ' + e.message);
    return null;
  }
}

// ---- Connector initialization ----

function initConnectors(config) {
  var connectors = [];
  var connectorConfigs = config.connectors || {};

  // DingTalk
  if (connectorConfigs.dingtalk && connectorConfigs.dingtalk.enabled !== false) {
    try {
      var DingTalkConnector = require('./connectors/dingtalk');
      var dtConfig = connectorConfigs.dingtalk;
      dtConfig.platform = 'dingtalk';
      dtConfig.displayName = '钉钉';
      dtConfig.selfName = config.selfName || dtConfig.selfName || '';
      connectors.push(new DingTalkConnector(dtConfig));
      log('Initialized DingTalk connector (' + (dtConfig.groups.length + (dtConfig.contacts ? dtConfig.contacts.length : 0)) + ' chats)');
    } catch (e) {
      log('Failed to init DingTalk connector: ' + e.message);
    }
  }

  // Feishu
  if (connectorConfigs.feishu && connectorConfigs.feishu.enabled !== false) {
    try {
      var FeishuConnector = require('./connectors/feishu');
      var fsConfig = connectorConfigs.feishu;
      fsConfig.platform = 'feishu';
      fsConfig.displayName = '飞书';
      connectors.push(new FeishuConnector(fsConfig));
      log('Initialized Feishu connector (' + (fsConfig.chats ? fsConfig.chats.length : 0) + ' chats)');
    } catch (e) {
      log('Failed to init Feishu connector: ' + e.message);
    }
  }

  // WeCom (future - not yet implemented)
  if (connectorConfigs.wecom && connectorConfigs.wecom.enabled !== false) {
    log('WeCom connector not yet implemented, skipping');
  }

  return connectors;
}

// ---- Main sync logic ----

async function main() {
  var config = loadConfig();
  if (!config) {
    console.log(JSON.stringify({ success: false, error: 'Config not found' }));
    process.exit(1);
  }

  var tasksFile = config.tasksFile || path.join(__dirname, 'tasks.json');
  var hoursBack = config.hoursBack || 2;
  var selfName = config.selfName || '';

  var now = new Date();
  var since = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
  var sinceStr = formatTime(since);

  var pad = function(n) { return String(n).padStart(2, '0'); };
  var batchId = '' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
    pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());

  log('Starting sync: since=' + sinceStr + ', batchId=' + batchId);

  // Initialize connectors
  var connectors = initConnectors(config);
  if (connectors.length === 0) {
    log('No connectors available');
    console.log(JSON.stringify({
      success: false,
      error: 'No connectors configured',
      tasksExtracted: 0
    }));
    process.exit(1);
  }

  // Run all connectors in parallel
  var syncResults = await Promise.all(connectors.map(function(c) {
    log('Syncing ' + c.displayName + '...');
    return c.syncAll(sinceStr);
  }));

  // Aggregate messages
  var allMessages = [];
  var totalConversations = 0;
  var totalMessages = 0;
  var connectorSummaries = [];

  for (var i = 0; i < connectors.length; i++) {
    var result = syncResults[i];
    var connector = connectors[i];

    if (!result.success) {
      log(connector.displayName + ' sync had errors');
    }

    allMessages = allMessages.concat(result.messages || []);
    totalConversations += result.conversations || 0;
    totalMessages += (result.messages || []).length;

    connectorSummaries.push({
      platform: connector.platform,
      displayName: connector.displayName,
      success: result.success,
      messages: (result.messages || []).length
    });
  }

  log('Total messages collected: ' + totalMessages);

  // Extract tasks
  var TaskExtractor = require('./task-extractor');
  var extractorConfig = Object.assign({}, config.extractor || {}, { selfName: selfName });
  var extractor = new TaskExtractor(extractorConfig);
  var tasks = extractor.extract(allMessages, batchId);

  log('Tasks extracted: ' + tasks.length);

  // Write tasks.json
  var output = {
    batchId: batchId,
    generatedAt: now.toISOString(),
    tasks: tasks
  };

  try {
    fs.writeFileSync(tasksFile, JSON.stringify(output, null, 2));
    log('Wrote ' + tasks.length + ' tasks to ' + tasksFile);
  } catch (e) {
    log('Failed to write tasks.json: ' + e.message);
    console.log(JSON.stringify({ success: false, error: 'Write failed: ' + e.message }));
    process.exit(1);
  }

  // Output summary for main.js to read from stdout
  console.log(JSON.stringify({
    success: true,
    batchId: batchId,
    conversations: totalConversations,
    messagesScanned: totalMessages,
    tasksExtracted: tasks.length,
    timeRange: sinceStr + ' ~ now',
    connectors: connectorSummaries
  }));
}

main().catch(function(e) {
  log('Fatal error: ' + e.message);
  console.log(JSON.stringify({ success: false, error: e.message }));
  process.exit(1);
});
