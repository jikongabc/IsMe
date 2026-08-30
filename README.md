# IsMe

可复用的个人主页模板：展示资料 / 经历 / 项目，并通过对接 CogDoc 提供多知识库 RAG 问答。适合挂在简历上，也适合 clone 后改造成自己的站点。

## 设计边界

| `.env`（密钥与服务） | SQLite 数据库（内容） |
| --- | --- |
| 管理员密码、会话密钥 | 姓名、简介、技能 |
| CogDoc URL / API Key | 经历、项目、博客 |
| 数据库路径、站点 URL | 知识库模块与 `cogdocKbId` |

不要把真实个人信息写进源码或提交进 Git。模板自带的是占位 demo 数据。

## 快速开始

```bash
cp .env.example .env.local
# 编辑 ADMIN_PASSWORD、SESSION_SECRET；可选填写 COGDOC_API_URL / COGDOC_API_KEY
# ADMIN_PASSWORD 至少 15 字符且不能是常见/重复模式；SESSION_SECRET 至少 32 位随机字符

npm install
npm run db:migrate
npm run db:seed
npm run dev
```

打开：

- 公开站：http://localhost:3000
- 管理后台：http://localhost:3000/admin/login
- 个性化上站：http://localhost:3000/admin/setup（登录后）
- 发布体检：http://localhost:3000/admin/readiness（登录后）
- 知识库问答：http://localhost:3000/knowledge
- 简历页：http://localhost:3000/resume（可打印 / 另存为 PDF）
- 留言板：http://localhost:3000/guestbook（提交后待后台审核）
- RSS / Atom：`/feed.xml` · `/atom.xml`
- 健康检查：http://localhost:3000/api/health

未配置 `COGDOC_API_URL` 时，问答与反馈走演示模式，站点其余功能仍可用。

`COGDOC_API_URL` 必须是单一 `http(s)` origin（例如 `https://cogdoc.example.com`），不能包含路径、查询、片段或 `user:password@host` 凭据。生产环境默认只允许 HTTPS；只有部署所有者已确认 CogDoc 位于同机或受控私网、且接受链路明文风险时，才可在服务端环境显式设置 `COGDOC_ALLOW_INSECURE_HTTP=true`。该开关默认关闭，也不能由任何请求字段覆盖。所有 CogDoc 请求共用 `COGDOC_TIMEOUT_MS`，并拒绝跟随任何上游重定向。

### Launch Studio：把模板内容换成你的内容

首次登录后打开 `/admin/setup`。Launch Studio 把原本分散在资料、经历、项目、文章与外观页面的初始化工作组织成一次可预览的数据迁移：

1. 下载当前站点的轻量 `portfolio-pack.v1`、带受管图片的 `portfolio-bundle.v1`，或下载空白内容包作为填写模板
2. 选择或粘贴 JSON；草稿可选择只保存在当前浏览器
3. 逐栏目选择要迁移的内容，先查看新增、替换、移除及发布状态调整
4. 确认预览后一次性应用；应用成功后再进入发布体检验证公开入口

轻量内容包只包含站点内容、发布/可见状态和媒体 URL 引用（因此也可能含草稿、隐藏或归档内容）。自包含站点包会额外内嵌媒体库中已注册、且确实被资料/项目/文章引用的图片；每项都记录长度、文件类型与 SHA-256，导入时复核后写成内容摘要稳定地址。任意外部图片不会被服务器抓取，仍保留为 URL 引用。

两种格式都不包含管理员密码、会话密钥、CogDoc API Key 或内部知识库绑定。`knowledgeBases` 只迁移公开模块文案；同 slug 模块保留当前实例的本机绑定，新模块仍需重新绑定 CogDoc KB。自包含包最多 64 个受管图片、单图 2 MiB、媒体总量 32 MiB、文件总量 48 MiB；超过边界时可继续使用轻量内容包并手工迁移 uploads/S3 对象。

每次导入和 demo 清理都会先生成只读预览，并用服务端指纹绑定“当时的数据库状态 + 内容包 + 栏目选择”。若预览后数据发生变化，应用会返回冲突并要求重新预览，不会凭旧确认覆盖新内容。默认只预选空栏目或纯 demo 栏目；包含真实内容的栏目必须手动选择。选中的列表栏目采用整栏替换，请在确认页认真核对移除项，并先下载当前内容包留作可移植备份。

轻量内容包请求上限为 4 MiB，自包含站点包请求上限约 48 MiB；所有字段、实体、媒体长度、哈希和图片魔数仍会在服务端再次校验。浏览器恢复草稿默认关闭，只适合在可信的个人设备上主动启用；共享设备上请保持关闭或使用“清除浏览器草稿”。

### 项目案例证据

项目不只保存一段介绍。后台 **projects** 可以维护个人职责、团队规模、项目周期、量化结果、技术决策与取舍，以及带双语替代文本和说明的截图画廊。公开详情页会把这些内容组织成适合面试讲解的案例档案；未填写的区块自动隐藏，旧项目无需迁移内容也能继续展示。

建议每个要放进简历的项目至少补齐：

1. 你本人负责的边界，而不是团队的笼统职责
2. 1–3 个能够解释口径的结果证据
3. 至少一个真实技术取舍，以及被放弃的方案
4. 一张带准确替代文本的界面、架构或结果截图

### 简历发布体检

把站点链接写进简历前，先打开后台 **发布体检**。它会把检查结果组织成一条发布闸门，而不是只给一个容易掩盖硬伤的总分：只要仍有模板身份、示例经历、占位链接、不安全的公开域名或缺少核心案例证据，结论就会保持 **HOLD / 暂缓分享**，并提供直达对应编辑页的修复入口。

公开入口验证需要管理员手动触发。它会检查简历、案例、文章、知识问答等关键页面与公开外链，并确认每个启用的 CogDoc 知识库确实存在且含有可检索内容。服务端会限制协议、端口、跳转次数和并发数，并拒绝回环、内网、链路本地、云元数据及其他保留地址；密钥、内部服务地址和完整查询参数不会进入浏览器报告。检查完成后可导出 JSON，作为上线前的自查记录。

### 知识库文档入库与站点同步

1. 在 `.env` 填好 `COGDOC_API_URL` / `COGDOC_API_KEY`
2. 打开 `/admin/knowledge-bases`，为模块填写 `cogdoc kb id`
3. 点 **docs** → **sync kb**（不存在则在 CogDoc 创建）
4. **upload pdf**，等待 job 变为 `succeeded`
5. 或点 **sync site content**：把资料 / 经历 / 已发布项目与博客写成 IsMe 托管的派生知识并自动批准
6. 内容变更后会后台执行完整对账：更新新版本、删除已归档/改名/删除的旧版本，同时保留 CogDoc 中手工维护的知识
7. 访客即可在 `/knowledge` 对该模块提问，并可对答案 `[up]` / `[down]`
8. 后台 **insights** 查看页面访问、设备 / 地区、问题热榜、近期问答与赞踩统计
9. 访客可在 `/guestbook` 留言；后台 **guestbook** 审核后公开

## 复用步骤

1. Fork / clone 本仓库
2. 复制 `.env.example` → `.env` / `.env.local`，只改密钥与 CogDoc 配置
3. `npm run db:migrate && npm run db:seed`（或留空库，后台自己录入）
4. 登录 `/admin/setup`，下载空白内容包或导出当前内容，预览后按栏目替换 demo 内容
5. 在 **projects** 补齐代表项目的职责、量化结果、技术取舍与图片证据；也可在 **theme** 继续微调主题、强调色和默认语言
6. 在 **media** 管理上传图片（默认本地 `public/uploads`；配置 `S3_*` 后走 S3 兼容存储）
7. 在知识库模块里填写对应的 CogDoc `doc_id` 并上传 PDF
8. 部署后打开 `/admin/readiness`，处理全部阻断项并运行一次公开入口验证
9. 确认发布闸门为可分享状态后，再把链接写进简历

## Docker 部署

> **公网环境必须使用 HTTPS。** 容器内固定以 `NODE_ENV=production` 运行，管理会话使用 `Secure` cookie；如果浏览器直接通过 HTTP 访问，后台登录会话不会被发送。基础 `docker-compose.yml` 的 `:80` 入口只用于本机验收、内网调试，或前面已经有 HTTPS 终止代理的场景，不能作为公网最终入口。

### 本机 / 内网验收

```bash
cp .env.example .env
# ADMIN_PASSWORD 至少 15 字符；SESSION_SECRET 至少 32 位随机字符
# 编辑 CogDoc 配置；本机验收可保留 SITE_URL=http://localhost

docker compose up --build -d
```

首次启动会在空数据卷中写入 demo 数据；上线前登录后台替换全部占位资料。后续启动不会覆盖已有数据库。

拓扑：

```text
:80  nginx  →  web:3000 (Next.js)
                 ├── /app/data/isme.db
                 └── /app/public/uploads   # 未配置 S3 时
                 └── 或 S3 / R2 / MinIO     # 配置 S3_BUCKET + 密钥后
```

- Nginx 反代 + API 限流，`/api/chat` 支持长超时与关闭缓冲（SSE）
- `web` / `nginx` 均带 healthcheck
- 数据卷：`isme-data`、`isme-uploads`（仅本地上传模式需要）
- 对象存储：填写 `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`（及可选 `S3_ENDPOINT`、`S3_PUBLIC_BASE_URL`）后，后台 media 上传写入桶内 `media/` 前缀；媒体元数据记在 SQLite `media_assets`

### 公网 HTTPS（Let’s Encrypt）

```bash
# .env 中设置 DOMAIN / CERTBOT_EMAIL，并确保 SITE_URL 使用同一个 https:// 域名
DOMAIN=example.com CERTBOT_EMAIL=you@example.com ./scripts/init-letsencrypt.sh

# 日常启动
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d
```

初始化脚本会启用 HTTP → HTTPS 跳转。证书落在 `deploy/certbot/`（已 gitignore），`certbot` 服务会定期续期。如果由云负载均衡器、Cloudflare 或 Caddy 终止 TLS，也必须保证访客最终只通过 HTTPS 访问，并把 `SITE_URL` 设置为公开的 `https://` 地址。

备份与回滚：

```bash
npm run backup                    # 本地 WAL 安全备份
npm run backup:docker             # 容器内一致性快照
npm run restore -- backups/isme-....db
./scripts/restore-db.sh backups/isme-....db --docker
```

恢复命令只接受不依赖 `-wal` / `-shm` 的独立 SQLite 快照，并在替换前运行 `integrity_check`。本地模式检测到数据库仍被进程打开时会拒绝执行；Docker 模式会先留下 `backups/pre-restore-docker-*.db` 安全快照，再停止 `web`、清理 sidecar、原子替换。新库启动、自动迁移并通过 healthcheck 后才算成功；失败会自动尝试回滚，安全快照不会删除。

## 安全要点

- 浏览器只知道公开的知识库 `slug`，看不到 CogDoc API Key 和内部 KB ID
- `/api/chat`、`/api/feedback` 服务端代理，带限流与超时（应用层限流落 SQLite，重启后仍生效）
- Nginx 覆盖 `X-Real-IP` / `X-Forwarded-For` 为真实连接 IP；管理 IP 白名单与限流以此为准
- 管理会话 cookie 在 Next.js Proxy 层做 HMAC 验签；上传按文件魔数校验；普通外链仅允许 http(s) 或站内路径，社交联系方式另允许不带参数的 `mailto:`
- 生产管理会话 cookie 强制 `Secure`；公网部署必须使用 HTTPS，不能把基础 HTTP Compose 入口直接暴露到互联网
- 访问 / 问答原始事件约保留 90 天，审计日志约 180 天
- 中间件为响应加安全头；未登录访问 `/admin/*` 与 `/api/admin/*` 会被拦截
- 可选 `ADMIN_IP_ALLOWLIST` 限制后台来源 IP
- 后台登录与内容变更写入 `/admin/audit`
- 切换知识库模块使用独立会话上下文
- `.env*`、`data/*.db`、`uploads`、`backups`、`deploy/certbot` 已加入 `.gitignore`

## 技术栈

Next.js App Router · TypeScript · Tailwind CSS · Drizzle ORM · SQLite · Zod · CogDoc HTTP API · Nginx · Docker Compose

## 脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 本地开发 |
| `npm run build` / `npm start` | 生产构建与启动 |
| `npm run db:migrate` | 创建 / 更新表结构 |
| `npm run db:seed` | 写入占位 demo（已有内容则跳过；`--force` 可覆盖） |
| `npm run lint` | ESLint |
| `npm test` | Vitest 单元测试 |
| `npm run test:e2e` | Playwright 端到端冒烟（需先 `npm run build`） |
| `npm run backup` | WAL 安全备份本地 SQLite（better-sqlite3 backup API） |
| `npm run backup:docker` | 从运行中的 web 容器做一致性备份 |
| `npm run restore -- <file>` | 从备份恢复 SQLite |

CI：推送到 `main` / PR 时，GitHub Actions 会跑 lint、单测、`npm audit`、build 与 e2e。

端到端测试：

```bash
npm run build
npm run test:e2e   # 首页 / resume / 草稿隔离 / 知识库会话 / 后台 / health
```

## 许可

MIT
