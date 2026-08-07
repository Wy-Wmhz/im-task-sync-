# Architecture

## Design Principles

1. **Connector Abstraction** - Each IM platform is a self-contained connector module implementing the same interface. Adding a new platform = adding one file.

2. **Shared Task Extraction** - Message parsing (keywords, priority, due dates) is platform-agnostic. All connectors feed into the same TaskExtractor. Keywords are configurable per deployment to adapt to different industries.

3. **Config-Driven** - All runtime configuration (paths, credentials, chat lists, keywords, window title) lives in `config.json`. Code contains zero hardcoded paths or domain-specific values.

4. **Process Isolation** - Sync engine runs as a child process, not blocking the Electron main thread. File watcher notifies UI of changes.

## Data Flow

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  DingTalk    │     │                  │     │                 │
│  Connector   │────▶│                  │     │                 │
└─────────────┘     │   SyncEngine     │     │   TaskExtractor  │     ┌────────────┐
                    │   (orchestrator)  │────▶│   (keywords +   │────▶│ tasks.json │
┌─────────────┐     │                  │     │    priority +   │     └────────────┘
│  Feishu      │     │  parallel sync   │     │    due dates)   │          │
│  Connector   │────▶│  aggregate msgs  │     │                 │          ▼
└─────────────┘     └──────────────────┘     └─────────────────┘     ┌────────────┐
                                                                      │  Electron  │
                                                                      │  file watch│
                                                                      └────────────┘
```

## Adding a New Connector

1. Create `connectors/newplatform.js`
2. Extend `BaseConnector`
3. Implement `syncAll(since)` - return normalized messages
4. Add config section in `config.json`
5. Register in `sync-engine.js` `initConnectors()`

```javascript
// connectors/newplatform.js
var BaseConnector = require('./base');

function NewPlatformConnector(config) {
  BaseConnector.call(this, config);
  // store credentials, chat lists, etc.
}

NewPlatformConnector.prototype = Object.create(BaseConnector.prototype);
NewPlatformConnector.prototype.constructor = NewPlatformConnector;

NewPlatformConnector.prototype.syncAll = function(since) {
  // 1. Call platform API / CLI
  // 2. Normalize messages to standard format
  // 3. Return { success, messages }
};

module.exports = NewPlatformConnector;
```

## File Structure

```
im-task-sync/
├── README.md
├── LICENSE
├── .gitignore
├── electron-app/
│   ├── main.js              # Electron main process
│   ├── preload.js           # IPC bridge
│   ├── sync-engine.js       # Standalone sync script
│   ├── task-extractor.js    # Shared task extraction
│   ├── config.json          # Runtime config (gitignored)
│   ├── package.json
│   ├── connectors/
│   │   ├── base.js          # Connector interface
│   │   ├── dingtalk.js      # DingTalk via dws CLI
│   │   └── feishu.js        # Feishu via Open API
│   └── icon.png
├── scripts/
│   └── test-sync.js         # Unit tests
├── docs/
│   └── ARCHITECTURE.md      # This file
└── workspace/
    └── index.html           # Task board HTML
```

## Cross-Platform Considerations

Currently Windows-only, but code is structured for future macOS support:

- All paths use `path.join()` and `os.homedir()` (no hardcoded drive letters)
- Launcher: VBS (Windows) → will add shell script (macOS)
- Auto-start: Windows Startup folder → will add launchd plist (macOS)
- Auto-start is optional: user can choose whether to enable it during setup
- Tray icon: Electron Tray API is cross-platform ready

## Config-Driven Customization

All user-specific values are in `config.json`, not in code:

| Config Field | Purpose |
|---|---|
| `windowTitle` | Electron window and tray tooltip title |
| `appUrl` | Cloud-deployed task board URL |
| `tasksFile` | Path to tasks.json output |
| `selfName` | Current user's name (to filter self-sent messages) |
| `hoursBack` | How far back to sync messages |
| `extractor.keywords` | Industry-specific task keywords |
| `connectors.*` | IM platform credentials and chat lists |

This means the same codebase serves any industry — only `config.json` differs between deployments.
