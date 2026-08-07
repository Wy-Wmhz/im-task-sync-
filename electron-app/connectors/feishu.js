'use strict';

/**
 * FeishuConnector - Feishu (Lark) message sync via Open Platform API
 *
 * Uses Feishu Open Platform REST API to pull messages from
 * monitored group chats and direct messages.
 *
 * Prerequisites:
 *   - Create a Feishu app at https://open.feishu.cn/
 *   - Enable bot capability for the app
 *   - Grant permissions: im:message:readonly (or im:message)
 *   - Add the bot to the groups you want to monitor
 *   - Get app_id and app_secret from the app settings
 *
 * Config:
 *   {
 *     platform:    'feishu',
 *     displayName: '飞书',
 *     enabled:     true,
 *     appId:       'cli_xxxxx',
 *     appSecret:   'xxxxx',
 *     chats:       [{ name, id, type }],  // id = chat_id (oc_xxxxx)
 *     limit:       50
 *   }
 *
 * API Reference:
 *   - Token:   POST /open-apis/auth/v3/tenant_access_token/internal
 *   - Messages: GET /open-apis/im/v1/messages?container_id_type=chat&container_id={id}
 *   - User:    GET /open-apis/contact/v3/users/{open_id}?user_id_type=open_id
 */

var BaseConnector = require('./base');
var https = require('https');

var API_HOST = 'open.feishu.cn';
var TOKEN_PATH = '/open-apis/auth/v3/tenant_access_token/internal';
var MESSAGES_PATH = '/open-apis/im/v1/messages';
var USER_PATH_PREFIX = '/open-apis/contact/v3/users/';

function FeishuConnector(config) {
  BaseConnector.call(this, config);
  this.appId = config.appId || '';
  this.appSecret = config.appSecret || '';
  this.chats = config.chats || [];
  this.limit = config.limit || 50;

  // Token cache
  this._token = '';
  this._tokenExpire = 0;

  // Sender name cache: open_id -> name
  this._nameCache = {};
}

FeishuConnector.prototype = Object.create(BaseConnector.prototype);
FeishuConnector.prototype.constructor = FeishuConnector;

// ---- HTTP helper ----

/**
 * Make an HTTPS request. Returns parsed JSON or throws.
 * @private
 */
FeishuConnector.prototype._http = function(method, path, headers, body) {
  var self = this;
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: API_HOST,
      port: 443,
      path: path,
      method: method,
      headers: headers || {}
    };

    var req = https.request(options, function(res) {
      var chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() {
        var raw = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error('Invalid JSON response: ' + raw.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, function() {
      req.destroy(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
};

// ---- Token management ----

/**
 * Get a valid tenant_access_token, refreshing if necessary.
 * @private
 */
FeishuConnector.prototype._getToken = function() {
  var self = this;

  // Return cached token if still valid (with 5 min buffer)
  var now = Date.now();
  if (self._token && now < self._tokenExpire - 300000) {
    return Promise.resolve(self._token);
  }

  if (!self.appId || !self.appSecret) {
    return Promise.reject(new Error('Feishu appId/appSecret not configured'));
  }

  return self._http('POST', TOKEN_PATH, { 'Content-Type': 'application/json; charset=utf-8' }, {
    app_id: self.appId,
    app_secret: self.appSecret
  }).then(function(resp) {
    if (resp.code !== 0) {
      throw new Error('Feishu auth failed: ' + (resp.msg || 'unknown error'));
    }
    self._token = resp.tenant_access_token;
    self._tokenExpire = now + (resp.expire || 7200) * 1000;
    return self._token;
  });
};

// ---- Sender name resolution ----

/**
 * Resolve an open_id to a display name. Uses cache.
 * @private
 */
FeishuConnector.prototype._getUserName = function(openId) {
  var self = this;

  if (self._nameCache[openId]) {
    return Promise.resolve(self._nameCache[openId]);
  }

  return self._getToken().then(function(token) {
    return self._http('GET', USER_PATH_PREFIX + openId + '?user_id_type=open_id', {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json; charset=utf-8'
    });
  }).then(function(resp) {
    var name = openId; // fallback to open_id
    if (resp.code === 0 && resp.data && resp.data.user && resp.data.user.name) {
      name = resp.data.user.name;
    }
    self._nameCache[openId] = name;
    return name;
  }).catch(function() {
    self._nameCache[openId] = openId;
    return openId;
  });
};

// ---- Message parsing ----

/**
 * Parse message body content based on msg_type.
 * Only text and post (rich text) messages are parsed; others return empty.
 * @private
 */
FeishuConnector.prototype._parseContent = function(msgType, bodyContent) {
  if (!bodyContent) return '';

  try {
    var parsed = JSON.parse(bodyContent);

    if (msgType === 'text') {
      return parsed.text || '';
    }

    if (msgType === 'post') {
      // Rich text: { "title": "...", "content": [[{ "tag": "text", "text": "..." }]] }
      var parts = [];
      if (parsed.title) parts.push(parsed.title);
      if (parsed.content && Array.isArray(parsed.content)) {
        for (var i = 0; i < parsed.content.length; i++) {
          var line = parsed.content[i];
          if (!Array.isArray(line)) continue;
          for (var j = 0; j < line.length; j++) {
            if (line[j].text) parts.push(line[j].text);
          }
        }
      }
      return parts.join(' ');
    }

    // For other types (image, file, etc.), return a placeholder
    if (msgType === 'image') return '[图片]';
    if (msgType === 'file') return '[文件]';
    if (msgType === 'audio') return '[语音]';
    if (msgType === 'video') return '[视频]';
    if (msgType === 'sticker') return '[表情]';
    if (msgType === 'share_chat') return '[链接]';
  } catch (e) {
    // If JSON parse fails, return raw content
    return bodyContent;
  }

  return '';
};

/**
 * Convert a Feishu timestamp (seconds string) to 'YYYY-MM-DD HH:mm:ss'.
 * @private
 */
FeishuConnector.prototype._formatTimestamp = function(tsStr) {
  if (!tsStr) return '';
  var ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return '';
  var d = new Date(ts * 1000);
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
};

// ---- Message fetching ----

/**
 * Fetch messages from a single chat since a given time.
 * @private
 */
FeishuConnector.prototype._fetchChatMessages = function(chat, sinceStr, token) {
  var self = this;

  // Convert 'YYYY-MM-DD HH:mm:ss' to Unix seconds
  var sinceDate = new Date(sinceStr.replace(/-/g, '/'));
  var sinceTs = Math.floor(sinceDate.getTime() / 1000);

  var query = 'container_id_type=chat' +
    '&container_id=' + encodeURIComponent(chat.id) +
    '&start_time=' + sinceTs +
    '&sort_type=ByCreateTimeAsc' +
    '&page_size=' + self.limit;

  return self._http('GET', MESSAGES_PATH + '?' + query, {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json; charset=utf-8'
  }).then(function(resp) {
    if (resp.code !== 0) {
      return { success: false, messages: [], error: resp.msg };
    }

    var items = (resp.data && resp.data.items) || [];
    return { success: true, messages: items };
  });
};

// ---- Interface implementation ----

/**
 * Sync all monitored chats in parallel.
 * @param {string} since - 'YYYY-MM-DD HH:mm:ss' timestamp
 * @returns {Promise<{ success: boolean, messages: Array, error?: string }>}
 */
FeishuConnector.prototype.syncAll = function(since) {
  var self = this;

  if (self.chats.length === 0) {
    return Promise.resolve({ success: true, messages: [], conversations: 0 });
  }

  return self._getToken().then(function(token) {
    // Fetch messages from all chats in parallel
    return Promise.all(self.chats.map(function(chat) {
      return self._fetchChatMessages(chat, since, token);
    }));
  }).then(function(results) {
    // Collect all raw messages
    var rawMsgs = [];
    var allSuccess = true;

    for (var i = 0; i < results.length; i++) {
      if (!results[i].success) {
        allSuccess = false;
        continue;
      }
      var msgs = results[i].messages;
      for (var j = 0; j < msgs.length; j++) {
        rawMsgs.push({ raw: msgs[j], chatIndex: i });
      }
    }

    // Resolve all sender names (deduplicated)
    var senderIds = {};
    for (var k = 0; k < rawMsgs.length; k++) {
      var sender = rawMsgs[k].raw.sender;
      if (sender && sender.id && !self._nameCache[sender.id]) {
        senderIds[sender.id] = true;
      }
    }

    var idList = Object.keys(senderIds);
    return Promise.all(idList.map(function(id) {
      return self._getUserName(id);
    })).then(function() {
      // Normalize all messages
      var messages = [];
      for (var m = 0; m < rawMsgs.length; m++) {
        var rawMsg = rawMsgs[m].raw;
        var chat = self.chats[rawMsgs[m].chatIndex];
        var senderId = (rawMsg.sender && rawMsg.sender.id) || '';
        var senderName = self._nameCache[senderId] || senderId;
        var content = self._parseContent(rawMsg.msg_type, rawMsg.body && rawMsg.body.content);

        messages.push({
          platform: 'feishu',
          chatName: chat.name,
          chatType: chat.type || 'group',
          content: content,
          sender: senderName,
          timestamp: self._formatTimestamp(rawMsg.create_time)
        });
      }

      return {
        success: allSuccess,
        messages: messages,
        conversations: self.chats.length
      };
    });
  }).catch(function(err) {
    return { success: false, messages: [], error: err.message, conversations: self.chats.length };
  });
};

/**
 * Test connection by fetching a token.
 * @returns {Promise<{ success: boolean, message: string }>}
 */
FeishuConnector.prototype.testConnection = function() {
  var self = this;
  return self._getToken().then(function() {
    return {
      success: true,
      message: 'Feishu connected (' + self.chats.length + ' chats monitored)'
    };
  }).catch(function(err) {
    return { success: false, message: 'Feishu auth failed: ' + err.message };
  });
};

/**
 * Get the list of monitored chats.
 */
FeishuConnector.prototype.getMonitoredChats = function() {
  return this.chats.map(function(c) {
    return { name: c.name, id: c.id, type: c.type || 'group' };
  });
};

module.exports = FeishuConnector;
