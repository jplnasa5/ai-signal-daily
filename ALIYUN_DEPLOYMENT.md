# 阿里云部署方案

目标：让 AI Signal Daily 在阿里云 OSS 上公开访问，并继续由 GitHub Actions 每天北京时间 08:00 自动更新。

## 当前条件

你还没有 ICP 备案，因此先采用：

```text
GitHub Actions -> 生成 data/current.json -> 上传到阿里云 OSS 香港 Bucket -> 自定义域名访问
```

备案完成后再升级为：

```text
GitHub Actions -> 生成 data/current.json -> 上传到阿里云 OSS 中国内地 Bucket -> 阿里云 CDN -> 已备案域名访问
```

原因：

- 阿里云 OSS 静态网站需要绑定自定义域名才能正常浏览 HTML。
- 如果 Bucket 位于中国内地，绑定的域名必须完成 ICP 备案。
- 如果 CDN 加速区域包含中国内地，域名也必须完成 ICP 备案。
- 没备案时，先用香港 Bucket 可以绕开内地 Bucket 的备案门槛，但访问质量不等同于中国内地 CDN。

## 一、阿里云控制台准备

### 1. 开通 OSS

进入阿里云控制台，开通对象存储 OSS。

### 2. 创建 Bucket

建议未备案阶段这样选：

- Bucket 名称：例如 `ai-signal-daily`
- 地域：`中国香港`
- Endpoint：`oss-cn-hongkong.aliyuncs.com`
- 读写权限：先保持私有，后面只把网站公开
- 存储类型：标准存储

不要把密钥、私有文件、原始账号资料放进这个 Bucket。这个 Bucket 会用于公开网站。

### 3. 配置静态网站

进入 Bucket：

```text
数据管理 -> 静态页面 -> 设置
```

推荐配置：

- 默认首页：`index.html`
- 子目录首页：不开通
- 默认 404 页：`index.html`
- 错误文档响应码：`200`

### 4. 允许公开访问

进入 Bucket：

```text
权限控制 -> 阻止公共访问
```

关闭阻止公共访问。

然后进入：

```text
权限控制 -> 读写权限
```

设置 Bucket ACL 为 `公共读`。

### 5. 绑定自定义域名

建议使用子域名，例如：

```text
ai.example.com
```

进入 Bucket：

```text
Bucket 配置 -> 域名管理 -> 绑定域名
```

然后在 DNS 控制台添加 CNAME，指向 OSS 控制台给出的目标域名。

未备案阶段建议把 Bucket 放在香港。备案完成前，不要把中国内地 Bucket 绑定到自定义域名，也不要开启包含中国内地的 CDN 加速。

### 6. 配置 HTTPS

在：

```text
Bucket 配置 -> 域名管理
```

为绑定的域名配置 HTTPS 证书。可以使用阿里云证书服务签发或上传已有证书。

## 二、创建最小权限 RAM 用户

进入：

```text
RAM 访问控制 -> 用户 -> 创建用户
```

只勾选 `OpenAPI 调用访问`，创建 AccessKey。

给这个用户添加自定义权限策略，把 `your-bucket-name` 替换为真实 Bucket 名：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:PutObjectAcl",
        "oss:GetObject",
        "oss:ListObjects"
      ],
      "Resource": [
        "acs:oss:*:*:your-bucket-name",
        "acs:oss:*:*:your-bucket-name/*"
      ]
    }
  ]
}
```

## 三、配置 GitHub Secrets

进入 GitHub 仓库：

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

添加：

| Secret | 示例 |
| --- | --- |
| `ALIYUN_ACCESS_KEY_ID` | RAM 用户 AccessKey ID |
| `ALIYUN_ACCESS_KEY_SECRET` | RAM 用户 AccessKey Secret |
| `ALIYUN_OSS_BUCKET` | `ai-signal-daily` |
| `ALIYUN_OSS_ENDPOINT` | `oss-cn-hongkong.aliyuncs.com` |
| `ALIYUN_OSS_PREFIX` | 留空，除非你想部署到 Bucket 子目录 |

已有的 `X_BEARER_TOKEN` 可以继续保留，用于 X 热点数据。

## 四、自动更新如何工作

项目里的 `.github/workflows/daily-update.yml` 每天北京时间 08:00 运行：

1. 拉取 GitHub 仓库。
2. 执行 `node scripts/update-daily.mjs`。
3. 更新 `data/current.json` 和 `data/archive/YYYY-MM-DD.json`。
4. 提交并推送 JSON 更新。
5. 执行 `node scripts/deploy-aliyun-oss.mjs`。
6. 把 `index.html`、`assets/`、`data/` 上传到 OSS。

这不会消耗你的 Codex token。运行发生在 GitHub Actions 服务器上；费用取决于 GitHub Actions、OSS 存储和 OSS 流量。

## 五、手动部署

配置好 GitHub Secrets 后，可以在 GitHub Actions 页面手动运行：

```text
Deploy Static Site to Aliyun OSS
```

本地如果设置了环境变量，也可以运行：

```bash
npm run deploy:aliyun
```

## 六、备案完成后的升级

备案完成后：

1. 新建中国内地 OSS Bucket，例如华东 2（上海）或华东 1（杭州）。
2. 把 `ALIYUN_OSS_BUCKET` 改成新的 Bucket。
3. 把 `ALIYUN_OSS_ENDPOINT` 改成对应内地区域，例如 `oss-cn-shanghai.aliyuncs.com`。
4. 在 OSS 绑定已备案域名。
5. 开通 CDN，源站选择 OSS Bucket。
6. CDN 加速区域选择中国内地或全球。
7. DNS CNAME 从 OSS 目标改为 CDN 分配的 CNAME。

如果后续启用 CDN，需要再加一步 CDN 刷新，确保 `data/current.json` 每天更新后边缘节点及时失效。
