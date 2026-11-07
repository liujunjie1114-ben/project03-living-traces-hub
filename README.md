# LIVING TRACES · 项目资料站

首页有作品集排版、外观建模、采购与制作、硬件搭建四项工作。每项工作使用独立的 `/?work=<id>` 地址，显示状态、下一步、待确认项、相关资料和操作历史。点击「更新进度」会生成新记录版本。点击「给这项工作加资料」可上传附件或登记链接。

在工作页可以复制给 GPT 的接力指令或下载最新交接 Markdown。在 ChatGPT 或 Codex 连接 Sites 发布时创建的项目站插件后，用 `get_handoff` 读取实时状态，用 `record_progress` 回写本次结果，用 `add_resource_link` 归档在线资料。未连接时，将导出的 Markdown 和需要的附件上传给 GPT，执行后在网页登记结果。

站点通过 Sites 私有发布。D1 保存版本和历史，R2 保存附件。`src/workstreams.json` 是四项工作的初始状态，`src/workstreams.js` 提供状态、导出和 MCP 工具，`src/workspace-ui.js` 是工作台界面。原有的资料库和 R2 索引从侧栏打开。执行 `npm run build` 生成 Sites Worker，`npm run check` 检查 JavaScript 语法。
