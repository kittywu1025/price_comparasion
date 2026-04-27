# 日本超市价格比价工具：当前开发指南

> 本文档按当前代码状态维护。早期 Next.js / Supabase 方案已经废弃，当前项目使用 Cloudflare Pages + Pages Functions + D1 + R2。

## 1. 当前技术方案

- 前端：`public/` 下原生 HTML / CSS / JavaScript，移动端优先。
- 本地开发：`server.js` 提供静态页面和本地 JSON API。
- 本地数据：`data/app.json`，通过 `src/storage/*` 读写。
- 线上运行：Cloudflare Pages 托管静态页面。
- 线上 API：`functions/api/[[path]].js`，由 Cloudflare Pages Functions 执行。
- 线上数据库：Cloudflare D1，binding 名为 `DB`。
- 图片存储：Cloudflare R2，binding 名为 `IMAGES`。
- 登录来源：Cloudflare Access 邮箱登录，或开发口令登录。

## 2. 本地开发

```bash
npm run init-db
npm run seed   # 可选
npm start
```

常用页面：

- 首页：`http://localhost:3000/home.html`
- 清单：`http://localhost:3000/products`
- 录入：`http://localhost:3000/add.html`
- 店铺：`http://localhost:3000/stores.html`
- 我的：`http://localhost:3000/profile.html`
- 日语读音标注：`http://localhost:3000/kana.html`

## 3. 当前页面结构

- `home.html`：新手教程、优惠信息、快捷入口。
- `products.html`：商品清单、搜索、商品详情、编辑和删除价格记录。
- `add.html`：录入商品价格、扫码、拍照/相册、快速填入、重复商品提示。
- `stores.html`：店铺列表、新增、编辑、删除、点击店铺进入该店商品。
- `profile.html`：个人贡献、用户名、反馈入口、开发者模式。
- `kana.html`：日语句子汉字读音标注和本地生词表。
- `auth-nav.js`：登录弹窗、用户名弹窗、开发口令登录。

## 4. 当前核心功能

- 商品价格记录新增、修正、删除。
- 商品按名称/条码聚合展示。
- 最低价标记：按关键词包含关系计算“最低价”；同条码或同中文名用于“同产品”逻辑，但同产品最低价暂不强调展示。
- 价格走势：详情页使用税后价格走势。
- 历史记录：简化展示记录日期和税后价格。
- 店铺管理：店铺页公开可看；修改、新增、删除需要登录。
- 权限：管理员可删除全部数据；普通用户只能删除自己创建的数据，可以修改别人数据；撤回只能撤回自己修改或管理员操作。
- 图片：前端压缩，最多 4 张，随价格记录提交；线上保存到 R2。
- 个人主页：首次登录设置用户名，显示用户名和绑定邮箱。
- 反馈：普通用户提交，管理员打开开发者模式后查看。

## 5. 单位价格规则

统一使用税后价格计算。

```text
g / kg  -> 每 100g
ml / L  -> 每 100ml
个      -> 每个
```

后端保存时会再次计算并覆盖前端提交值，避免脏数据。

## 6. 数据库初始化

新 D1 数据库执行：

```bash
npx wrangler d1 execute price-comparison --remote --file db/cloudflare-d1-schema.sql
```

`db/cloudflare-d1-store-ownership.sql` 是早期线上库的兼容迁移脚本，只在旧库缺少 `stores.created_by` 或 revision 表时使用。新库不要重复执行这个迁移。

## 7. Cloudflare 环境变量

普通变量由 `wrangler.toml` 管理，例如：

```toml
[vars]
ACCESS_ADMIN_EMAIL_HASHES = "your-lowercase-email-sha256"
```

机密变量使用 Pages secret，不写进 GitHub：

```bash
npx wrangler pages secret put DEV_LOGIN_EMAIL --project-name price-comparasion
npx wrangler pages secret put DEV_LOGIN_PASSWORD_HASH --project-name price-comparasion
npx wrangler pages secret put DEV_LOGIN_SECRET --project-name price-comparasion
```

## 8. 开发注意事项

- `reference/` 只读，不修改、不提交。
- 每次推送代码前同步更新 README。
- `data/app.json` 可能会被本地服务自动补字段，除非明确要更新本地种子数据，否则不要混入提交。
- 功能优先保持免费方案；涉及付费 API 或不可控额度前先确认。
- 页面改动需要考虑手机端安全区、底部导航和小屏宽度。
