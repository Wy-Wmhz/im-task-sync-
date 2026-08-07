'use strict';

/**
 * DingTalkConnector - DingTalk message sync via dws CLI
 *
 * Uses the dingtalk-workspace-cli (dws) tool to pull messages from
 * monitored group chats and 1-on-1 conversations.
 *
 * Config:
 *   {
 *     platform:    'dingtalk',
 *     displayName: '钉钉',
 *     enabled:     true,
 *     nodePath:    '/path/to/node',           // Node.js executable
 *     dwsPath:     '/path/to/dws.js',          // dws CLI entry
 *     groups:      [{ name, id }],             // openConversationId
 *     contacts:    [{ name, id }],             // openDingTalkId
 *     selfName:    '王洋',                     // filter own messages
 *     limit:       50,                         // max messages per chat (optional)
 *   }
 */

var BaseConnector = require('./base');
var execFile = require('child_process').execFile;

function DingTalkConnector(config) {
  BaseConnector.call(this, config);
  this.nodePath = config.nodePath;
  this.dwsPath = config.dwsPath;
  this.groups = config.groups || [];
  this.contacts = config.contacts || [];
  this.selfName = config.selfName || '';
  this.limit = config.limit || 50;
}

// Inherit from BaseConnector
DingTalkConnector.prototype = Object.create(BaseConnector.prototype);
DingTalkConnector.prototype.constructor = DingTalkConnector;

/**
 * Run dws CLI with given arguments, return parsed JSON result.
 * @private
 */
DingTalkConnector.prototype._runDws = function(args) {
  var self = this;
  return new Promise(function(resolve) {
    execFile(self.nodePath, [self.dwsPath].concat(args), {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    }, function(error, stdout, stderr) {
      if (error) {
        resolve({ success: false, messages: [] });
        return;
      }
      try {
        var data = JSON.parse(stdout);
        resolve({
          success: data.success !== false,
          messages: (data.result && data.result.messages) || []
        });
      } catch (e) {
        resolve({ success: false, messages: [] });
      }
    });
  });
};

/**
 * Build dws CLI arguments for a group chat.
 * @private
 */
DingTalkConnector.prototype._groupArgs = function(groupId, since) {
  return ['chat', 'message', 'list',
    '--group', groupId,
    '--time', since,
    '--direction', 'newer',
    '--limit', String(this.limit),
    '--format', 'json'
  ];
};

/**
 * Build dws CLI arguments for a 1-on-1 chat.
 * @private
 */
DingTalkConnector.prototype._contactArgs = function(contactId, since) {
  return ['chat', 'message', 'list',
    '--open-dingtalk-id', contactId,
    '--time', since,
    '--direction', 'newer',
    '--limit', String(this.limit),
    '--format', 'json'
  ];
};

/**
 * Normalize a raw DingTalk message into standard format.
 * @private
 */
DingTalkConnector.prototype._normalizeMessage = function(rawMsg, chatName, chatType) {
  return {
    platform: 'dingtalk',
    chatName: chatName,
    chatType: chatType,
    content: rawMsg.content || '',
    sender: rawMsg.sender || '',
    timestamp: rawMsg.timestamp || rawMsg.createTime || ''
  };
};

/**
 * Sync all monitored groups and contacts in parallel.
 * @param {string} since - 'YYYY-MM-DD HH:mm:ss' timestamp
 * @returns {Promise<{ success: boolean, messages: Array, error?: string }>}
 */
DingTalkConnector.prototype.syncAll = function(since) {
  var self = this;

  // Build all requests
  var requests = [];
  var i;

  for (i = 0; i < self.groups.length; i++) {
    var g = self.groups[i];
    requests.push({
      name: g.name,
      type: 'group',
      args: self._groupArgs(g.id, since)
    });
  }

  for (i = 0; i < self.contacts.length; i++) {
    var c = self.contacts[i];
    requests.push({
      name: c.name,
      type: 'p2p',
      args: self._contactArgs(c.id, since)
    });
  }

  if (requests.length === 0) {
    return Promise.resolve({ success: true, messages: [] });
  }

  // Run all in parallel
  return Promise.all(requests.map(function(req) {
    return self._runDws(req.args);
  })).then(function(results) {
    var messages = [];
    var allSuccess = true;

    for (var i = 0; i < requests.length; i++) {
      var req = requests[i];
      var result = results[i];
      if (!result.success) {
        allSuccess = false;
        continue;
      }
      for (var j = 0; j < result.messages.length; j++) {
        messages.push(self._normalizeMessage(result.messages[j], req.name, req.type));
      }
    }

    return {
      success: allSuccess,
      messages: messages,
      conversations: requests.length
    };
  });
};

/**
 * Test connection by running a simple dws command.
 * @returns {Promise<{ success: boolean, message: string }>}
 */
DingTalkConnector.prototype.testConnection = function() {
  var self = this;
  return self._runDws(['chat', 'search', '--keyword', '']).then(function(result) {
    if (result.success) {
      return { success: true, message: 'DingTalk connected (' + (self.groups.length + self.contacts.length) + ' chats monitored)' };
    }
    return { success: false, message: 'DingTalk CLI not responding' };
  });
};

/**
 * Get the list of monitored chats.
 */
DingTalkConnector.prototype.getMonitoredChats = function() {
  var chats = [];
  var i;
  for (i = 0; i < this.groups.length; i++) {
    chats.push({ name: this.groups[i].name, id: this.groups[i].id, type: 'group' });
  }
  for (i = 0; i < this.contacts.length; i++) {
    chats.push({ name: this.contacts[i].name, id: this.contacts[i].id, type: 'p2p' });
  }
  return chats;
};

module.exports = DingTalkConnector;
