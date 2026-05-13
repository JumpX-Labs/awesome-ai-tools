# 参与维护与解析契约

本仓库首页数据来自根目录 **`README.md`**。构建或开发前会运行 `scripts/parse-readme.mjs`，生成 `public/tools.json`（**不入库**，见 `.gitignore`）。

## 条目格式（必须遵守）

1. **站点标题**：第一行一级标题，且仅一处。

   ```markdown
   # 你的站点标题
   ```

2. **引言（可选）**：从一级标题下一行起，到第一个 `##` 之前的非空行，会合并为页面副文案（纯文本，不支持 Markdown 内联语法渲染为 HTML）。

3. **分类**：每个分类使用二级标题（仅此一级分类，不要使用 `###` 作为分类）。

   ```markdown
   ## 分类名称
   ```

4. **工具行**：每个工具单独一行，格式固定（名称、URL、描述均不可省略）：

   ```markdown
   - [显示名称](https://完整链接) - 一句话描述
   ```

5. **不要**在分类区块内使用：表格、嵌套列表、围栏代码块（```）。需要代码请放在全文最后或独立文件。

6. **URL**：使用 `https://` 或 `http://`，括号内不要留空格。

## 本地校验

```bash
npm install
npm run validate
```

校验失败时脚本以非零退出码结束，并指出 README 中不符合契约的行（严格模式）。

## 生成数据与预览

```bash
npm run parse   # 写入 public/tools.json
npm run dev     # 开发服务器（predev 会自动 parse）
npm run build   # 生产构建（prebuild 会自动 parse）
```

## CI 建议

在 Pull Request 与工作流中执行 `npm ci`（或 `npm install`）后运行 **`npm run validate`**，失败则阻止合并。
