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

Access 用来控制谁能访问这个网页。

1. 进入 Cloudflare `Zero Trust`。
2. 如果第一次使用，先创建 Team name。
3. 进入 `Access` > `Applications`。
4. 点击 `Add an application`。
5. 选择 `Self-hosted`。
6. Application name 填：`price-comparison`。
7. Application domain 填你的 Pages 域名，例如：
   `price-comparasion.pages.dev`
8. Policy 创建：
   - Action：`Allow`
   - Include：`Emails`
   - 填你自己和允许使用的朋友邮箱
9. 保存。

配置完后，别人打开网址会先走 Cloudflare 登录验证，通过邮箱验证后才能访问。

## 8. 验证

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
