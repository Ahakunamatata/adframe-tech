# AdFrame Pilot Landing Page

一个纯静态 HTML + Vercel Function 的 founding pilot landing page。

页面 offer：用户提交 App URL、目标平台、语言和邮箱后，如果请求被接受，交付一条 finished 9:16 MP4 skit-style app video test。

## 项目结构

- `index.html`: Vercel 根页面。
- `favicon.svg`: 浏览器标签页 icon，方形 SVG，适合 favicon 缩放。
- `skit-style-app-video-ad-landing_副本.html`: 改造来源文件，内容与 `index.html` 保持一致。
- `api/intake.js`: 表单提交后端，接收 `POST /api/intake`。
- `assets/adframe-logo.svg`: 页面 header 使用的 AdFrame 横向 logo。
- `assets/segments/`: demo 视频片段。
- `assets/source-icons/`: proof 区块来源图标。
- `.vercelignore`: 部署时排除线索数据、脚本、旧验证页和本地文档，只上传上线需要的页面、API 与 assets。

## 本地运行或预览

只看页面静态效果：

```bash
python3 -m http.server 3000
```

然后打开 `http://127.0.0.1:3000/`。这种方式不会运行 `/api/intake`。

测试页面和 Vercel Function：

```bash
npx vercel dev --listen 3000
```

然后打开 `http://127.0.0.1:3000/` 并提交表单。

## Vercel 部署

1. 在 Vercel 新建 Project，导入这个目录对应的 Git 仓库。
2. Framework Preset 选择 `Other` 或让 Vercel 自动识别。
3. Build Command 留空。
4. Output Directory 留空。
5. Root Directory 指向当前项目根目录。
6. 配置环境变量后部署。

也可以使用 CLI：

```bash
vercel deploy
vercel deploy --prod
```

## 环境变量

飞书 webhook 是第一优先级：

```bash
FEISHU_WEBHOOK_URL=
FEISHU_WEBHOOK_SECRET=
```

`FEISHU_WEBHOOK_SECRET` 只在飞书机器人启用了签名校验时需要。

邮箱通知是可选项，当前使用 Resend API，不引入依赖：

```bash
NOTIFY_EMAIL_TO=
FROM_EMAIL=
RESEND_API_KEY=
```

如果没有配置飞书，也没有配置完整邮箱通知，`/api/intake` 会返回：

```json
{ "ok": false, "error": "notification_not_configured" }
```

## 自定义域名 adframe.tech

1. 购买或准备 `adframe.tech`。
2. 在 Vercel Project 的 Settings -> Domains 添加 `adframe.tech`。
3. 按 Vercel 提示配置 DNS：
   - apex 域通常配置 `A` 记录到 Vercel 提供的 IP；
   - `www` 通常配置 `CNAME` 到 Vercel 提供的目标。
4. 等待 Vercel 显示 Valid Configuration。
5. 需要时把 `www.adframe.tech` 重定向到 `adframe.tech`。

## 表单提交格式

前端提交到：

```http
POST /api/intake
Content-Type: application/json
```

字段：

```json
{
  "url": "https://example.com",
  "scenario": "optional scenario expectation",
  "platform": "TikTok",
  "language": "English",
  "email": "name@company.com",
  "page_url": "https://adframe.tech/",
  "referrer": "",
  "honeypot": ""
}
```

后端校验：

- method 必须是 `POST`；
- `url`、`platform`、`language`、`email` 必填；
- `url` 必须是 `http` 或 `https` URL；
- `email` 做基础格式校验；
- `platform` 只能是 `TikTok`、`Meta`、`YouTube Shorts`、`Other`；
- `scenario` 可选；
- `honeypot` 有值时返回 `{ "ok": true }` 但不发送通知。

## 测试表单提交

本地通过 `vercel dev` 启动后，可以用页面表单测试，也可以用 curl：

```bash
curl -i -X POST http://127.0.0.1:3000/api/intake \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","platform":"TikTok","language":"English","email":"test@example.com","scenario":"parent panic moment","page_url":"http://127.0.0.1:3000/","referrer":"","honeypot":""}'
```

成功时返回：

```json
{ "ok": true }
```

## 确认前端没有暴露 webhook

检查 `index.html`：

```bash
rg -n "FEISHU|WEBHOOK|RESEND|open.feishu|hooks|secret|api_key" index.html
```

期望没有命中。飞书 webhook、签名 secret、邮箱 API key 只应存在于 Vercel Environment Variables 和 `api/intake.js` 的 `process.env.*` 读取逻辑中。

## 上线前人工检查

- 购买或绑定 `adframe.tech`。
- 配置 DNS 并等待 Vercel 域名校验通过。
- 配置 `FEISHU_WEBHOOK_URL`。
- 如果飞书机器人启用了签名校验，配置 `FEISHU_WEBHOOK_SECRET`。
- 配置联系邮箱 `hello@popcornai.art` 的收信或转发。
- 可选配置 `NOTIFY_EMAIL_TO`、`FROM_EMAIL`、`RESEND_API_KEY`。
- 提交一次测试表单。
- 检查飞书是否收到 `New $1 founding pilot request`。
- 检查 demo 视频 assets 是否加载。
- 检查移动端显示与表单提交状态。
