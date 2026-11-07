# LIVING TRACES · 项目资料站

在「资料库」中按分类、状态、名称、编号或版本查找资料。「新增资料」支持上传单个文件或登记外链。资料详情可以下载附件、编辑分类、版本、状态与说明。已登记附件的后续版本使用新记录，便于对照。

「状态与交接」「版本差异」和「R2 包内索引」来自项目总账的建站快照。「操作记录」显示网站上创建、修改或上传的记录。

站点通过 Sites 私有发布。D1 保存记录和操作历史，R2 保存附件。仓库中 `src/catalog.json` 是初始索引，`src/index.html`、`src/site.css` 和 `src/app.js` 是界面，`src/worker.js` 提供文件和资料接口，`drizzle/` 保存迁移。执行 `npm run build` 生成 Sites Worker，执行 `npm run check` 检查 JavaScript 语法。
