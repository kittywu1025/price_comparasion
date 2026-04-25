# Cloudflare 部署步骤

这个项目的 Cloudflare 目标结构：

- `public/`：静态页面，由 Cloudflare Pages 托管。
- `functions/api/[[path]].js`：API，由 Cloudflare Pages Functions 执行。
- D1 `DB`：存商品、店铺、分类、价格历史。
- R2 `IMAGES`：存商品图片。
- Cloudflare Access：限制只有允许的人能打开页面。

## 1. 创建 D1 数据库

1. 打开 Cloudflare Dashboard。
2. 进入 `Workers & Pages`。
3. 左侧找到 `D1 SQL Database`。
4. 点击 `Create database`。
5. 数据库名填：`price-comparison`。
6. 创建完成后复制 `database_id`。
7. 打开项目里的 `wrangler.toml`，把：
   `REPLACE_WITH_D1_DATABASE_ID`
   替换成刚才复制的 `database_id`。

## 2. 创建 R2 图片桶

1. 打开 Cloudflare Dashboard。
2. 进入 `R2 Object Storage`。
3. 点击 `Create bucket`。
4. Bucket 名称填：`price-comparison-images`。
5. 如果你之后想本地预览也测图片上传，可以再建一个：
   `price-comparison-images-dev`。

## 3. 初始化 D1 表结构

在项目根目录运行：

```bash
npx wrangler login
npx wrangler d1 execute price-comparison --remote --file db/cloudflare-d1-schema.sql
```

执行成功后，D1 里会有这些表：

- `categories`
- `stores`
- `products`
- `price_records`

## 4. 导入当前本地数据

先把当前本地 JSON 数据导出成 D1 SQL：

```bash
node scripts/export-local-json-to-d1-sql.mjs
```

会生成：

```text
tmp/cloudflare-import.sql
```

然后执行：

```bash
npx wrangler d1 execute price-comparison --remote --file tmp/cloudflare-import.sql
```

注意：本地 JSON 里如果有 base64 图片，导入脚本会自动跳过这些图片，因为 D1 不应该存图片正文。之后新增图片会存到 R2。

## 5. 创建 Cloudflare Pages 项目

1. 打开 Cloudflare Dashboard。
2. 进入 `Workers & Pages`。
3. 点击 `Create application`。
4. 选择 `Pages`。
5. 选择 `Connect to Git`。
6. 选择这个 GitHub 仓库。
7. 构建设置：
   - Framework preset：`None`
   - Build command：留空
   - Build output directory：`public`
8. 保存并部署。

## 6. 绑定 D1 和 R2

进入刚创建的 Pages 项目：

1. 打开 `Settings`。
2. 打开 `Bindings`。
3. 添加 D1 binding：
   - Variable name：`DB`
   - D1 database：`price-comparison`
4. 添加 R2 binding：
   - Variable name：`IMAGES`
   - R2 bucket：`price-comparison-images`
5. 保存后重新部署一次项目。

绑定名必须严格叫 `DB` 和 `IMAGES`，否则 API 会报 binding missing。

## 7. 配置 Cloudflare Access

Access 用来控制谁能新增、修改、上传数据。推荐配置为：

- 清单页公开可看。
- 录入页、店铺页、写入相关 API 必须登录。

不要继续用 `*` 保护整个网站，否则清单页也会要求登录。

1. 进入 Cloudflare `Zero Trust`。
2. 如果第一次使用，先创建 Team name。
3. 进入 `Access` > `Applications`。
4. 点击 `Add an application`。
5. 选择 `Self-hosted`。
6. Application name 填：`price-comparison`。
7. Application domain 填：`price-comparasion.pages.dev`。
8. 在 Target / 目标里添加这些路径：
   - `/add.html`
   - `/stores.html`
   - `/api/stores*`
   - `/api/price-records*`
   - `/api/categories*`
9. Policy 创建：
   - Action：`Allow`
   - Include：`Emails`
   - 填你自己和允许使用的朋友邮箱
10. 保存。

配置完后，别人可以直接打开清单页查看；只有进入录入、店铺管理，或调用写入 API 时才需要邮箱验证。

## 8. 自定义登录页文案

默认 Cloudflare Access 登录页是英文，不够直观。可以改成更像“请登录”的页面。

1. 进入 Cloudflare `Zero Trust`。
2. 打开 `Reusable components`。
3. 打开 `Custom pages`。
4. 找到 `Access login page`。
5. 点击 `Manage`。
6. 建议这样填写：
   - Organization name：`价格比价工具`
   - Header：`请登录`
   - Footer：`输入已授权的邮箱，系统会发送验证码。未授权邮箱无法新增、修改或上传数据。`
   - Background color：选择接近当前应用的浅绿色或白色
7. 保存。

注意：Cloudflare 默认按钮文案可能仍显示英文，例如 `Send me a code`。如果之后需要完全中文化，可以再做 Custom HTML 登录页。

## 9. 验证

部署完成后打开：

```text
https://你的-pages域名/index.html
```

检查：

1. 清单页能打开。
2. 店铺页能看到 D1 里的店铺。
3. 录入页能新增商品。
4. 拍照/上传图片后，图片能在清单和详情里显示。
5. D1 的 `price_records` 表新增了记录。
6. R2 桶里新增了图片对象。
