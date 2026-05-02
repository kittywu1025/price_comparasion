# Cloudflare 部署步骤

当前线上结构：

- `public/`：Cloudflare Pages 静态页面。
- `functions/api/[[path]].js`：Cloudflare Pages Functions API。
- D1 binding `DB`：商品、店铺、价格记录、用户资料、反馈。
- R2 binding `IMAGES`：商品图片。
- Cloudflare Access：只作为邮箱登录入口，不建议拦截整个网站。

## 1. 检查 `wrangler.toml`

当前项目通过 `wrangler.toml` 管理普通环境变量和绑定：

```toml
name = "price-comparasion"
pages_build_output_dir = "public"

[vars]
ACCESS_ADMIN_EMAIL_HASHES = "your-lowercase-email-sha256"

[[d1_databases]]
binding = "DB"
database_name = "price-comparison"
database_id = "..."

[[r2_buckets]]
binding = "IMAGES"
bucket_name = "price-comparison-images"
```

Cloudflare 控制台提示“环境变量由 wrangler.toml 管理”是正常现象。普通变量改 `wrangler.toml`；机密变量用 Pages secret。

## 2. 创建 D1 数据库

1. 打开 Cloudflare Dashboard。
2. 进入 `Workers & Pages` 或 `Storage & Databases`。
3. 找到 D1。
4. 创建数据库：`price-comparison`。
5. 复制 `database_id`，填入 `wrangler.toml`。

初始化新数据库：

```bash
npx wrangler login
npx wrangler d1 execute price-comparison --remote --file db/cloudflare-d1-schema.sql
```

注意：`db/cloudflare-d1-store-ownership.sql` 是旧库迁移脚本。新数据库执行 `cloudflare-d1-schema.sql` 即可，不要重复执行旧迁移。

## 3. 创建 R2 图片桶

1. 打开 Cloudflare Dashboard。
2. 进入 R2。
3. 创建 bucket：`price-comparison-images`。
4. 可选创建开发 bucket：`price-comparison-images-dev`。
5. 确认 `wrangler.toml` 中 binding 名为 `IMAGES`。

## 4. 创建 Pages 项目

1. 进入 Cloudflare `Workers & Pages`。
2. 点击 `Create application`。
3. 选择 `Pages`。
4. 连接 GitHub 仓库。
5. 构建设置：
   - Framework preset：`None`
   - Build command：留空
   - Build output directory：`public`
6. 保存并部署。

如果项目由 GitHub 自动部署，后续推送 `main` 后等待 Pages 自动部署完成即可。

## 5. 绑定 D1 和 R2

如果 `wrangler.toml` 已正确提交，Pages 会按配置读取绑定。也可以在 Pages 项目设置里检查：

- D1 binding：`DB` -> `price-comparison`
- R2 binding：`IMAGES` -> `price-comparison-images`

binding 名必须严格是 `DB` 和 `IMAGES`。

## 6. 管理员配置

不要把真实邮箱写进公开仓库。使用邮箱小写后的 SHA-256：

```bash
node -e "const crypto=require('crypto'); console.log(crypto.createHash('sha256').update('your-email@example.com'.toLowerCase()).digest('hex'))"
```

然后填入 `wrangler.toml`：

```toml
[vars]
ACCESS_ADMIN_EMAIL_HASHES = "生成的哈希"
```

推送后等待 Cloudflare Pages 重新部署。

## 7. 开发口令登录 secret

开发口令不要写入 `wrangler.toml`，使用 Pages secret：

```bash
node -e "const crypto=require('crypto'); console.log(crypto.createHash('sha256').update('你的开发口令').digest('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

依次设置：

```bash
npx wrangler pages secret put DEV_LOGIN_EMAIL --project-name price-comparasion
npx wrangler pages secret put DEV_LOGIN_PASSWORD_HASH --project-name price-comparasion
npx wrangler pages secret put DEV_LOGIN_SECRET --project-name price-comparasion
```

设置后重新部署 Pages。

## 8. Cloudflare Access 推荐配置

当前应用已经有自己的登录弹窗和 API 权限判断。推荐 Access 只保护登录入口：

- `/api/auth*`

不要保护这些页面，否则用户看不到应用内登录弹窗：

- `/add.html`
- `/profile.html`
- `/stores.html`
- `/products`
- `/home.html`

也不建议保护写入 API，否则开发口令登录会被 Access 提前拦截：

- `/api/price-records*`
- `/api/categories*`
- `/api/feedback*`
- 非 GET 的 `/api/stores*`

这些接口未登录时会由应用返回 `401 login required`。

如果你坚持用 Access 保护写入 API，也可以，但开发口令登录不能绕过这些路径，需要继续收 Access 验证码或把 Access 会话时间调长。

## 9. 导入本地数据

导出本地 JSON：

```bash
node scripts/export-local-json-to-d1-sql.mjs
```

导入远端 D1：

```bash
npx wrangler d1 execute price-comparison --remote --file tmp/cloudflare-import.sql
```

从飞书导出的参考表格生成导入 SQL：

```bash
python3 scripts/reference_xlsx_to_d1_import.py
npx wrangler d1 execute price-comparison --remote --file tmp/reference-xlsx-import.sql
```

`reference/` 只读，不修改、不提交。

## 10. 验证

部署完成后检查：

- `https://price-comparasion.pages.dev/home.html`
- `https://price-comparasion.pages.dev/products`
- `https://price-comparasion.pages.dev/add.html`
- `https://price-comparasion.pages.dev/stores.html`
- `https://price-comparasion.pages.dev/profile.html`
- `https://price-comparasion.pages.dev/kana.html`（开发者/管理员专用）

重点验证：

1. 清单和店铺页未登录可查看。
2. 录入页和我的页面未登录会显示应用内登录弹窗。
3. 登录后可新增价格记录。
4. 图片上传后可通过 `/api/images/...` 显示。
5. D1 新增 `price_records`。
6. R2 新增图片对象。
