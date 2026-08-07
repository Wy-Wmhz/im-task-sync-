'use strict';

/**
 * BaseConnector - IM platform connector interface
 *
 * All platform connectors (DingTalk, Feishu, WeCom, etc.) must extend this class.
 * Each connector is responsible for:
 *   1. Pulling messages from its platform (CLI, API, etc.)
 *   2. Normalizing messages into a standard format
 *   3. Reporting which chats/groups are being monitored
 *
 * Standard message format (returned by getMessages / syncAll):
 *   {
 *     platform:   'dingtalk' | 'feishu' | 'wecom',
 *     chatName:   string,         // group name or contact name
 *     chatType:   'group' | 'p2p',
 *     content:    string,         // message text
 *     sender:     string,         // sender display name
 *     timestamp:  string,         // ISO 8601 or 'YYYY-MM-DD HH:mm:ss'
 *   }
 *
 * @param {Object} config - Connector-specific configuration
 */

function BaseConnector(config) {
  this.platform = config.platform || 'unknown';
  this.displayName = config.displayName || this.platform;
  this.enabled = config.enabled !== false;
  this.config = config;
}

/**
 * Sync all monitored chats and return normalized messages.
 * This is the main entry point called by sync-engine.
 *
 * @param {string} since - 'YYYY-MM-DD HH:mm:ss' timestamp, pull messages after this
 * @returns {Promise<{ success: boolean, messages: Array, error?: string }>}
 */
BaseConnector.prototype.syncAll = function(/* since */) {
  return Promise.resolve({ success: false, messages: [], error: 'syncAll not implemented' });
};

/**
 * Test whether the connector is properly configured and reachable.
 * @returns {Promise<{ success: boolean, message: string }>}
 */
BaseConnector.prototype.testConnection = function() {
  return Promise.resolve({ success: false, message: 'testConnection not implemented' });
};

/**
 * Get the list of monitored chats for this connector.
 * @returns {Array<{ name: string, id: string, type: string }>}
 */
BaseConnector.prototype.getMonitoredChats = function() {
  return [];
};

module.exports = BaseConnector;
