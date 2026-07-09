# 公开部署方案

这个项目是纯静态站点，公开访问最简单的方式是把 `ai-signal-daily` 作为一个独立仓库推到 GitHub，然后接入静态托管平台。

当前 Vercel 生产地址：

```text
https://ai-signal-daily-chi.vercel.app
```

GitHub 仓库：

```text
https://github.com/jplnasa5/ai-signal-daily
```

## 推荐方案 A：Cloudflare Pages

适合：免费、访问快、全球 CDN、静态站点稳定。

设置方式：

- Framework preset: `None`
- Build command: 留空
- Build output directory: `/`
- Root directory: 仓库根目录，也就是 `ai-signal-daily`

每日更新：

- 使用仓库里的 `.github/workflows/daily-update.yml`
- GitHub Actions 每天北京时间 08:00 运行 `node scripts/update-daily.mjs`
- 更新 `data/current.json` 并提交
- Cloudflare Pages 监听 GitHub 提交后自动重新部署

GitHub Actions 权限：

- 仓库 Settings -> Actions -> General -> Workflow permissions
- 选择 `Read and write permissions`
- 允许 workflow 提交更新后的 `data/current.json`

## 推荐方案 B：Vercel

适合：上手快、自动生成公开 URL、预览部署方便。

设置方式：

- Framework preset: `Other`
- Build command: 留空
- Output directory: 留空或 `.`
- Root directory: 仓库根目录

每日更新方式同上：GitHub Actions 更新 JSON 后触发 Vercel 自动部署。

注意：`vercel.app` 域名在中国大陆访问可能不稳定。如果主要面向中国大陆用户，建议同时部署阿里云 OSS 镜像，见 [ALIYUN_DEPLOYMENT.md](./ALIYUN_DEPLOYMENT.md)。

## 推荐方案 C：阿里云 OSS

适合：面向中国大陆用户，需要比 `vercel.app` 更可控的访问入口。

当前未备案阶段：

- 使用阿里云 OSS 中国香港 Bucket
- 绑定自定义域名
- GitHub Actions 每天更新后自动同步到 OSS

备案完成后：

- 迁移到中国内地 OSS Bucket
- 接入阿里云 CDN
- 使用已备案域名访问

具体步骤见 [ALIYUN_DEPLOYMENT.md](./ALIYUN_DEPLOYMENT.md)。

## 方案 D：GitHub Pages

适合：完全放在 GitHub 内，配置少。

设置方式：

- Repository Settings -> Pages
- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/root`

注意：

- 如果仓库根目录就是 `ai-signal-daily`，选 `/root`
- 如果你把项目放在大仓库子目录，需要改成从子目录构建或把项目移动到仓库根目录

## X 数据

真实 X 热度需要配置仓库 Secret：

- Secret name: `X_BEARER_TOKEN`
- Value: 你的 X API Bearer Token

如果不配置，网站仍会更新主流媒体与官方 RSS 数据，X 热点会沿用上一版兜底数据。

## 上线前检查

```bash
npm run check
npm run update
npm run serve
```

打开：

```text
http://127.0.0.1:4173
```

确认页面、分类筛选、搜索和数据加载正常后再推送部署。
