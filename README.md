# AI Signal Daily

一个每天北京时间 08:00 更新的 AI 新闻情报网站，聚合过去 24 小时 X 平台与主流媒体的 AI 技术、大模型、深度学习、机器学习、商业投资、安全和监管新闻。

公开地址：

```text
https://ai-signal-daily-chi.vercel.app
```

GitHub 仓库：

```text
https://github.com/jplnasa5/ai-signal-daily
```

## 本地运行

```bash
npm run serve
```

打开 `http://127.0.0.1:4173`。

当前环境如果没有全局 Node，可以用 Codex 内置 Node：

```bash
/Users/sisyphus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/serve.mjs
```

## 生成日报

```bash
npm run update
```

脚本会：

- 抓取 `scripts/config/sources.json` 中配置的 RSS/官方来源
- 按 AI 关键词过滤过去 24 小时内容
- 生成分类、标签、重要性、短摘要和分析
- 写入 `data/current.json`
- 归档到 `data/archive/YYYY-MM-DD.json`

## X 数据

如果设置了 `X_BEARER_TOKEN`，脚本会调用 X recent counts API 估算热点热度。

```bash
X_BEARER_TOKEN=your_token node scripts/update-daily.mjs
```

没有 token 时，页面仍会使用上一版 `data/current.json` 中的 X 热点作为兜底。

## 每天 8 点更新

仓库内已配置 `.github/workflows/daily-update.yml`：

- cron: `0 0 * * *`
- 对应北京时间每天 `08:00`
- 运行 `node scripts/update-daily.mjs`
- 自动提交更新后的日报 JSON

部署到 GitHub Pages、Vercel、Cloudflare Pages 等静态托管即可。

## 数据源调整

编辑 `scripts/config/sources.json`：

- `rssSources`: 主流媒体、官方博客、研究媒体
- `xQueries`: X 平台热点关键词组合

建议保留“官方来源 + 主流媒体 + 科技媒体 + 开发者平台”的组合，避免单一舆论源造成偏差。

## 公开部署

见 [DEPLOYMENT.md](./DEPLOYMENT.md)。推荐 Cloudflare Pages 或 Vercel；如果仓库公开，也可以直接使用 GitHub Pages。

如果面向中国大陆用户，见 [ALIYUN_DEPLOYMENT.md](./ALIYUN_DEPLOYMENT.md)。未备案阶段建议先部署到阿里云 OSS 香港 Bucket；备案完成后再升级到中国内地 OSS + CDN。
