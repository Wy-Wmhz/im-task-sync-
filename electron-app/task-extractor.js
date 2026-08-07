'use strict';

/**
 * TaskExtractor - Shared task extraction logic
 *
 * Takes normalized messages from any connector and extracts actionable tasks.
 * This module is platform-agnostic - it doesn't care whether a message came
 * from DingTalk, Feishu, or WeCom.
 *
 * Pipeline:
 *   raw message → isTaskMessage? → extractPriority → extractDueDate → task object
 *
 * Customizable:
 *   - keywords: industry-specific terms that indicate a task
 *   - excludePatterns: message types to skip ([image], [file], etc.)
 *   - ackWords: short acknowledgments that aren't tasks
 *   - selfName: filter own messages
 *
 * @param {Object} options - Customization options
 */

function TaskExtractor(options) {
  options = options || {};

  // General workplace keywords - can be overridden per deployment via config.json
  this.keywords = options.keywords || [
    '帮忙', '处理', '安排', '跟进', '完成', '确认', '提交', '整理',
    '需要', '催', '对接', '发布', '需求', '文档', '方案', '排期',
    '修改', '更新', '检查', '审核', '审批', '回复', '发送', '整理',
    '准备', '协调', '通知', '提醒', '反馈', '确认', '梳理', '汇总',
    '预订', '预定', '采购', '报销', '申请', '填写', '登记', '录入',
    '联系', '沟通', '讨论', '会议', '培训', '汇报', '总结', '计划',
    '任务', '问题', '修复', '测试', '上线', '部署', '验收', '交付'
  ];

  // Message patterns to exclude (images, files, stickers, etc.)
  this.excludePatterns = options.excludePatterns || [
    /^\[图片\]/, /^\[文件/, /^\[文件夹/, /^\[语音\]/,
    /^\[视频\]/, /^\[表情\]/, /^\[回复\]/, /^\[链接\]$/,
    /^\[合并转发\]/, /^\[位置\]/, /^\[名片\]/, /^\[红包\]/
  ];

  // Short acknowledgments that are not tasks
  this.ackWords = options.ackWords || [
    '收到', '好的', '嗯嗯', '嗯', 'ok', 'OK', '谢谢', '感谢',
    '明白', '了解', '知道了', '已收到', '收到啦', '好的好的', '哈哈',
    '嗯好的', '收到~', 'ok~', '好的~', '收到!', 'ok!', '好', '行'
  ];

  // Filter messages from self
  this.selfName = options.selfName || '';
}

/**
 * Determine if a message is likely a task request.
 * @param {Object} msg - Normalized message { content, sender, ... }
 * @returns {boolean}
 */
TaskExtractor.prototype.isTaskMessage = function(msg) {
  var content = msg.content;
  var sender = msg.sender;

  if (!content || content.length < 4) return false;

  // Filter self messages
  if (this.selfName && sender === this.selfName) return false;

  // Filter excluded patterns
  var i;
  for (i = 0; i < this.excludePatterns.length; i++) {
    if (this.excludePatterns[i].test(content)) return false;
  }

  // Filter acknowledgments
  var trimmed = content.trim();
  for (i = 0; i < this.ackWords.length; i++) {
    if (trimmed === this.ackWords[i]) return false;
    if (trimmed.length < 8 && trimmed.indexOf(this.ackWords[i]) >= 0) return false;
  }

  // Check for keyword matches
  var lower = content.toLowerCase();
  for (i = 0; i < this.keywords.length; i++) {
    if (lower.indexOf(this.keywords[i].toLowerCase()) >= 0) return true;
  }

  return false;
};

/**
 * Extract priority from message content.
 * @param {string} content
 * @returns {'P0'|'P1'|'P2'}
 */
TaskExtractor.prototype.extractPriority = function(content) {
  var lower = content.toLowerCase();
  if (/紧急|急|asap|今天|马上|立刻|催/.test(lower)) return 'P0';
  if (/重要|需要|尽快|本周|赶紧|要求/.test(lower)) return 'P1';
  return 'P2';
};

/**
 * Extract due date from message content.
 * @param {string} content
 * @returns {string} 'YYYY-MM-DD' or empty string
 */
TaskExtractor.prototype.extractDueDate = function(content) {
  var today = new Date();
  var pad = function(n) { return String(n).padStart(2, '0'); };
  var todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());

  if (content.indexOf('今天') >= 0) return todayStr;
  if (content.indexOf('明天') >= 0) {
    var t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
  }
  if (content.indexOf('后天') >= 0) {
    var d = new Date(today);
    d.setDate(d.getDate() + 2);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // "X号" or "X日"
  var m1 = content.match(/(\d{1,2})[号日](?:之前|前)?/);
  if (m1) {
    var day = parseInt(m1[1], 10);
    if (day >= 1 && day <= 31) {
      return today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(day);
    }
  }

  // "X月X日" or "X月X号"
  var m2 = content.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (m2) {
    return today.getFullYear() + '-' + pad(parseInt(m2[1], 10)) + '-' + pad(parseInt(m2[2], 10));
  }

  return '';
};

/**
 * Process an array of normalized messages and extract tasks.
 * @param {Array} messages - Normalized messages from connectors
 * @param {string} batchId - Batch ID for this sync run
 * @returns {Array} Extracted tasks
 */
TaskExtractor.prototype.extract = function(messages, batchId) {
  var self = this;
  var tasks = [];
  var taskIndex = 0;

  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    if (!self.isTaskMessage(msg)) continue;

    var title = msg.content;
    if (title.length > 80) title = title.substring(0, 80) + '...';

    tasks.push({
      syncId: msg.platform + '_' + batchId + '_' + taskIndex,
      title: '[' + msg.chatName + '] ' + title,
      priority: self.extractPriority(msg.content),
      due: self.extractDueDate(msg.content),
      source: msg.chatName,
      platform: msg.platform
    });
    taskIndex++;
  }

  return tasks;
};

module.exports = TaskExtractor;
