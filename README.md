# IM Task Sync

通用职场 IM 任务同步工具 —— 从钉钉/飞书群聊自动提取工作任务，桌面常驻 + 托盘 + 实时同步。

适用于所有通过钉钉或飞书进行工作沟通的职场人士：设计、运营、开发、产品、市场、行政……只要群聊里有任务派发，就能自动提取并展示在桌面任务台上。

## 功能

- **多 IM 消息同步**：从钉钉群聊和单聊中自动提取任务，支持飞书开放平台 API
- **智能任务提取**：关键词匹配 + 优先级识别 + 截止日期解析，关键词可按行业自定义
- **Electron 桌面应用**：托盘常驻、关闭最小化、点击徽章即时同步
- **自动化集成**：定时拉取消息 + 周报自动生成
- **数据安全**：localStorage 持久化 + JSON 导出导入备份
- **开机启动可选**：用户自行决定是否开机自动启动

## 架构

```
electron-app/
  main.js              # Electron 主进程（窗口+托盘+IPC）
  preload.js           # 渲染进程桥接
  sync-engine.js       # 多连接器同步引擎
  task-extractor.js    # 共享任务提取逻辑（关键词+优先级+截止日期）
  config.json          # 运行时配置（连接器凭证、群列表、关键词等）
  connectors/
    base.js            # 连接器接口
    dingtalk.js        # 钉钉连接器（dws CLI）
    feishu.js          # 飞书连接器（开放平台 API）
```

### 连接器接口

每个 IM 平台实现 `BaseConnector` 接口：

| 方法 | 说明 |
|------|------|
| `syncAll(since)` | 拉取指定时间后的所有消息，返回标准格式 |
| `testConnection()` | 测试连接是否正常 |
| `getMonitoredChats()` | 返回监控的群/联系人列表 |

标准消息格式：
```json
{
  "platform": "dingtalk",
  "chatName": "项目沟通群",
  "chatType": "group",
  "content": "帮忙整理下本周数据报表",
  "sender": "张三",
  "timestamp": "2026-08-07 10:00:00"
}
```

### 可配置关键词

任务提取器的关键词完全可配置，适配不同行业：

```json
{
  "extractor": {
    "keywords": ["帮忙", "处理", "安排", "跟进", "完成", "确认", "提交", "整理"]
  }
}
```

不配置时使用通用职场关键词默认值。

## 快速开始

### 前置条件

- Node.js 22+
- 钉钉 WorkBuddy Connector（已连接）和/或 飞书开放平台应用

### 安装

```bash
cd electron-app
npm install
```

### 配置

编辑 `config.json`，填入你的 IM 平台凭证、群列表和关键词。

### 运行

```bash
# 启动桌面应用
npm start

# 仅运行同步（测试用）
node sync-engine.js
```

### 测试

```bash
node scripts/test-sync.js
```

## 支持的 IM 平台

| 平台 | 状态 | 方案 |
|------|------|------|
| 钉钉 | ✅ 已支持 | dws CLI |
| 飞书 | ✅ 已支持 | 开放平台 API（需配置 appId/appSecret） |
| 企业微信 | 📋 计划中 | 开放平台 API |
| 微信(个人) | ❌ 不支持 | 无官方 API |

## 技术栈

- Electron 43+
- 纯 Node.js（零运行时依赖）
- 系统字体栈（无外部字体）
- 内联 SVG 图标

## License

MIT
