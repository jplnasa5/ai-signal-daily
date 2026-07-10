# 微信公众号发布

目标：在每天北京时间 08:00 生成 AI Signal Daily 网站数据后，同步创建一篇可审核的微信公众号草稿。

## 当前发布方式

```text
GitHub Actions -> 更新 data/current.json -> 生成公众号图文 -> 公众号草稿箱
```

默认只进草稿箱，不会自动公开，也不会向粉丝群发。这样可以先检查当天来源、摘要和“看点”是否适合发布。

## GitHub 配置

在仓库的 `Settings -> Secrets and variables -> Actions` 添加两个 Repository secrets：

| 名称 | 值 |
| --- | --- |
| `WECHAT_APP_ID` | 公众号 AppID |
| `WECHAT_APP_SECRET` | 公众号 AppSecret |

不要把 `AppSecret` 提交到仓库或发到聊天中。

可选的 Repository variables：

| 名称 | 用途 |
| --- | --- |
| `WECHAT_AUTHOR` | 文章署名；不填时为 `AI Signal Daily` |
| `WECHAT_SOURCE_URL` | 文章“阅读原文”链接；可先留空 |

## 内容格式

每篇文章包含：

- 3 条“今日主线”
- 10 条精选新闻，包括来源、领域、摘要和看点
- 4 条后续观察项

内容取自当天 `data/current.json`；文章的“看点”沿用网站的中文分析。原始媒体标题与摘要会保留，以避免自动翻译失真。

## 手动发布测试

在 GitHub 的 `Actions` 页面打开 `Create WeChat Daily Draft`：

1. 先选择 `draft`，确认可以在公众号后台看到草稿。
2. 检查封面、排版、摘要和来源信息。
3. 内容稳定后，可选择 `publish` 将草稿公开发布。

`publish` 只发布公众号文章，并不会自动对粉丝群发。是否能群发、群发频率以及可用接口受公众号类型、认证状态和微信规则限制；在确认你的账号类型前，不建议把群发接入自动化流程。

## 每日自动化

`.github/workflows/daily-update.yml` 会每天北京时间 08:00 运行：

1. 更新网站数据并提交归档。
2. 创建微信公众号草稿。

阿里云 OSS 上传已从此工作流移除，部署方案处于暂停状态。
