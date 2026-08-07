---
name: im-task-sync-deploy
description: |
  通用职场 IM 任务同步台一键部署技能。帮用户从零搭建完整的任务管理工作台：网页版任务台 + Electron 桌面应用（托盘常驻+关闭最小化）+ 多IM任务自动同步（钉钉/飞书）+ 周报自动化。适用于所有通过钉钉/飞书进行工作沟通的职场人士。
  触发词：部署任务台、搭建工作台、IM任务同步、任务台部署、职场任务管理。
  前提：WorkBuddy 已连接钉钉或飞书 connector（至少一个）。
version: 2.1.0
license: MIT-0
display_name: "IM任务同步台部署"
display_name_en: "IM Task Sync Deploy"
description_zh: "一键部署通用职场IM任务同步台（Electron桌面应用+钉钉/飞书自动同步+周报自动化）"
description_en: "Deploy universal IM task sync desktop app with DingTalk/Feishu sync and weekly report automation"
visibility: "public"
metadata:
  category: productivity
  requires:
    connectors:
      - dingtalk
    os:
      - windows
  optional_connectors:
    - feishu
---

# IM 任务同步台 - 一键部署技能 v2.1

帮用户从零搭建一个通用职场任务管理工作台。适用于设计、运营、开发、产品、市场、行政等所有通过钉钉/飞书沟通的岗位。部署完成后用户获得：
- 网页版工作台（任务清单 + 今天要处理置顶 + 进度看板 + 导出导入备份）
- Electron 桌面应用（托盘常驻 + 关闭最小化 + 点击徽章即时同步）
- 多IM任务提取（钉钉 dws CLI + 飞书开放平台API，支持同时启用多个平台）
- 周报自动化（每周自动生成草稿，用户确认后提交）
- 开机启动可选（用户自行决定是否开机自动启动）

模板文件在 `{SKILL_ROOT}/templates/` 目录下。

---

## 前置检查

1. **确认操作系统**：必须是 Windows。
2. **确认 IM Connector**：检查 connector 状态，dingtalk 或 feishu 至少一个已连接。
3. **确认 Node.js**：运行 `node -v` 检查。如果没有 Node.js，**直接用 `install_binary` 工具安装**：
   ```
   install_binary node 22
   ```
   安装后再次确认。后续所有 node 命令使用安装后的完整路径。
4. **获取 dws CLI 路径**（仅钉钉需要）：在 `~/.workbuddy/binaries/node/cli-connector-packages/node_modules/dingtalk-workspace-cli/bin/dws.js` 下查找。如果找不到，在 `~/.workbuddy/` 下搜索 `dws.js`。
5. **获取 node 路径**：优先 managed node（`~/.workbuddy/binaries/node/versions/` 下版本最高的），其次系统 node。

---

## 交互流程（6步，逐步执行）

### 第1步：基本信息与职业

用 AskUserQuestion 询问：
- **你的岗位/行业是什么？**（例如：电商设计、软件开发、市场运营、行政管理等）
  - 根据用户回答，生成行业专属的任务关键词列表
  - 预设行业关键词库：
    - 电商设计：设计、修改、素材、主图、详情页、海报、banner、拍摄、剪辑、排版、修图、上新、换图…
    - 软件开发：开发、修复、部署、测试、联调、发版、Code Review、接口、Bug、需求评审…
    - 市场运营：活动、推广、投放、数据、复盘、排期、预算、转化、获客、裂变…
    - 行政人事：预订、采购、报销、审批、入职、考勤、会议、文件、登记、通知…
    - 通用职场（默认）：帮忙、处理、安排、跟进、完成、确认、提交、整理、需要、修改、更新…
  - 用户也可以自定义关键词
- **任务台标题显示什么？**（例如"张三的任务台"或部门名+岗位）

### 第2步：选择 IM 平台

用 AskUserQuestion 询问：
- **你要同步哪些 IM 平台的消息？**
  - 选项：钉钉 / 飞书 / 钉钉+飞书
  - 根据已连接的 connector 动态展示可用选项
  - 记录用户选择，后续步骤据此执行

### 第3步：配置钉钉（如选中）

1. 用 dws 搜索用户的钉钉群：`{NODE_PATH} {DWS_PATH} chat search --keyword ""`
2. 以编号列表展示，让用户输入要监控的群编号（可多选）
3. 用 dws 搜索联系人：`{NODE_PATH} {DWS_PATH} contact user search --keyword ""`
4. 让用户选择要监控的联系人（可多选）
5. 记录选中的群名称和 openConversationId、联系人姓名和 openDingTalkId

### 第4步：配置飞书（如选中）

1. 用 AskUserQuestion 询问飞书应用凭证：
   - **你的飞书应用 App ID 是什么？**（格式 cli_xxxxx）
   - **你的飞书应用 App Secret 是什么？**
2. 提醒用户前提条件：
   - 在 https://open.feishu.cn/ 创建自建应用
   - 开启机器人能力
   - 添加权限：`im:message:readonly`（获取单聊、群组消息）
   - 把机器人加入要监控的群
3. 用飞书API列出群列表（调用 `GET /open-apis/im/v1/chats`，用 tenant_access_token）
4. 让用户选择要监控的群
5. 记录选中的群名称和 chat_id（oc_开头）

### 第5步：开机启动选项

用 AskUserQuestion 询问：
- **是否开启开机自动启动？**
  - 选项：是，开机自动启动 / 否，手动启动
  - 默认推荐：是
  - 说明：开机启动后任务台会自动以托盘形式常驻；不开机启动时可通过桌面快捷方式手动启动

### 第6步：周报设置

用 AskUserQuestion 询问：
- **周报生成时间？**（默认：每周一上午9点）
- **周报提交方式？**（默认：先生成草稿，用户确认后提交）

---

## 部署步骤

完成交互后，按以下步骤依次执行。

### 步骤1：生成工作台 HTML

1. 读取 `{SKILL_ROOT}/templates/template.html`
2. 找到 `<!--APP_TITLE-->` 注释，替换为用户选择的标题前缀（如"张三的"或部门名，留空则只显示"任务台"）
3. 找到 `<!--APP_SUBTITLE-->` 注释，替换为副标题（如"张三 · 产品部"），用 `<div class="sub">副标题文字</div>` 包裹
4. 保存到用户工作目录，文件名 `任务同步台.html`

### 步骤2：部署到 CloudStudio

1. 创建部署目录 `~/.workbuddy/deploy_taskboard/`
2. 将生成的 HTML 复制为 `index.html`
3. 用 `workbuddy_cloudstudio_deploy` 工具部署
4. 记录返回的公网 URL

### 步骤3：生成 config.json

读取 `{SKILL_ROOT}/templates/config-template.json`，替换以下占位符后保存为 `~/.workbuddy/electron-app/config.json`：

- `{{APP_URL}}` → 步骤2获得的公网URL
- `{{WINDOW_TITLE}}` → 用户选择的任务台标题（与第1步一致）
- `{{TASKS_FILE}}` → `~/.workbuddy/electron-app/tasks.json`（展开为绝对路径）
- `{{SELF_NAME}}` → 用户名
- `{{NODE_PATH}}` → Node.js 完整路径
- `{{DWS_PATH}}` → dws.js 完整路径
- `{{DINGTALK_GROUPS}}` → 钉钉群数组 JSON：`[{"name":"群名","id":"openConversationId"},...]`（如未选钉钉则设为空数组 `[]`）
- `{{DINGTALK_CONTACTS}}` → 钉钉联系人数组 JSON（同上格式）
- `{{DINGTALK_ENABLED}}` → `true` 或 `false`
- `{{FEISHU_APP_ID}}` → 飞书 App ID（如未选飞书则留空）
- `{{FEISHU_APP_SECRET}}` → 飞书 App Secret
- `{{FEISHU_CHATS}}` → 飞书群数组 JSON：`[{"name":"群名","id":"oc_xxx","type":"group"},...]`
- `{{FEISHU_ENABLED}}` → `true` 或 `false`
- `{{EXTRACTOR_KEYWORDS}}` → 根据第1步用户选择的行业生成的关键词数组 JSON：`["关键词1","关键词2",...]`

### 步骤4：安装 Electron 应用

1. 创建应用目录 `~/.workbuddy/electron-app/`

2. 复制代码文件（这些文件不需要任何修改，全部原样复制）：
   - `{SKILL_ROOT}/templates/main-template.js` → `main.js`
   - `{SKILL_ROOT}/templates/preload.js` → `preload.js`
   - `{SKILL_ROOT}/templates/sync-engine.js` → `sync-engine.js`
   - `{SKILL_ROOT}/templates/task-extractor.js` → `task-extractor.js`
   - `{SKILL_ROOT}/templates/connectors/base.js` → `connectors/base.js`
   - `{SKILL_ROOT}/templates/connectors/dingtalk.js` → `connectors/dingtalk.js`
   - `{SKILL_ROOT}/templates/connectors/feishu.js` → `connectors/feishu.js`
   - `{SKILL_ROOT}/templates/icon.png` → `icon.png`
   - `{SKILL_ROOT}/templates/icon.ico` → `icon.ico`

3. 读取 `{SKILL_ROOT}/templates/package-template.json`，保存为 `package.json`

4. 创建初始 `tasks.json`：
   ```json
   { "batchId": "", "generatedAt": "", "tasks": [] }
   ```

5. 安装 Electron：
   ```
   cd ~/.workbuddy/electron-app
   {NPM_PATH} install --legacy-peer-deps
   ```
   如果 electron 二进制未自动下载，手动执行：
   ```
   {NODE_PATH} node_modules/electron/install.js
   ```
   国内环境可设镜像：`set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`

6. 读取 `{SKILL_ROOT}/templates/launch-template.vbs`，替换占位符：
   - `{{ELECTRON_EXE_PATH}}` → `~/.workbuddy/electron-app/node_modules/electron/dist/electron.exe`
   - `{{APP_DIR}}` → `~/.workbuddy/electron-app`
   保存为 `launch.vbs`（**必须纯 ASCII，不能含中文注释**）

7. 创建桌面快捷方式（用 Python + pywin32，目标 wscript.exe + launch.vbs）

8. 开机自启（根据第5步用户选择）：
   - 如果用户选择"是"：将 launch.vbs 复制到 Windows Startup 文件夹
   - 如果用户选择"否"：跳过此步骤

9. 启动验证（必须清除 ELECTRON_RUN_AS_NODE 环境变量）

### 步骤5：创建自动化任务

#### 5.1 任务提取自动化

1. 读取 `{SKILL_ROOT}/templates/prompt-task-extraction.txt`
2. 替换占位符（用户名、群列表、联系人列表、tasks.json路径、dws命令等）
3. 用 `automation_update` 创建：
   - rrule: `FREQ=HOURLY;BYHOUR=9,10,11,12,13,14,15,16,17,18`
   - connectorIds: 根据启用的平台选择 `["dingtalk"]` 或 `["feishu"]` 或 `["dingtalk","feishu"]`

#### 5.2 周报自动化

1. 读取 `{SKILL_ROOT}/templates/prompt-weekly-report.txt`
2. 替换占位符
3. 用 `automation_update` 创建：
   - rrule: 默认 `FREQ=WEEKLY;BYDAY=MO;BYHOUR=9`

### 步骤6：验证与交付

1. 确认 Electron 应用已启动，窗口正常显示
2. 确认自动化任务已创建
3. 向用户总结部署结果

---

## 重要注意事项

1. **config.json 是核心**：所有运行时配置（URL、路径、群列表、凭证、关键词、窗口标题）都在 config.json 中，代码文件不需要任何修改
2. **VBS 文件必须纯 ASCII**：launch.vbs 不能含中文注释
3. **清除 ELECTRON_RUN_AS_NODE**：启动 Electron 时必须清除该环境变量
4. **GPU 兼容**：虚拟机/远程桌面下需要 disable-gpu 和 no-sandbox
5. **周末任务提前到周五**：自动化 prompt 中已包含此规则
6. **周报流程**：先生成草稿 → 用户确认 → 才提交，不能直接提交
7. **飞书前提**：需要自建应用 + 机器人能力 + im:message:readonly 权限 + 机器人入群
8. **Node.js 未安装时直接安装**：用 `install_binary node 22`，不要让用户手动下载
9. **代码文件原样复制**：connectors/、sync-engine.js、task-extractor.js、main.js、preload.js 不需要任何修改，全部从模板原样复制
10. **开机启动是可选的**：根据用户在第5步的选择决定是否创建开机自启，不要默认强制开启
11. **行业关键词可配置**：根据用户岗位生成专属关键词写入 config.json 的 extractor.keywords 字段，不配置时使用通用职场关键词默认值
