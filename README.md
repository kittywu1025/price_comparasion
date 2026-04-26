# price_comparasion

日本超市价格比价工具。当前目标是个人到小范围使用，优先移动端体验，开发和部署方案默认选择免费或免费额度内可用的方案。

## 开发原则
- 优先免费方案；涉及付费 API、付费云服务或可能消耗不可控额度的功能，需要先确认。
- `reference/` 只作为参考资料目录，不修改、不提交到 GitHub。
- 代码推送到 GitHub 前，同步更新 README。

## 当前功能
- 首页：新手教程、快速入口、生活优惠与邀请码信息占位。
- 底部导航：五个主页面统一使用滑块式 tabbar，支持在底部导航区域左右滑动切换页面。
- 商品清单：按商品聚合展示价格，支持店铺筛选、最低价标记、限时优惠标记。
- 商品详情：查看税后总价、规格、店铺、记录时间、各店现价排行、历史记录、税后价格走势；详情图片使用紧凑展示。
- 商品记录：支持新增价格记录、修正记录、删除当前记录；详情弹窗打开时锁定背景滚动。
- 商品录入：移动端优先布局，支持扫码条码、拍照/上传、快速填入、店铺输入匹配、税后价自动计算、限时优惠开关。
- 规格计算：规格数值支持弹出计算器，可输入 `100*3`、`100g*3` 这类组合规格。
- 店铺管理：店铺列表、弹窗新增/编辑/删除、点击店铺会跳到清单页并筛选该店铺商品；新增时可按东广岛市范围搜索店铺并二次确认。
- 个人主页：查看自己的价格记录、商品、店铺和修改次数贡献统计。
- 商品去重：条码相同视为同一个商品，会追加价格记录；只有中文名相同仍允许录入为不同商品。
- 权限规则：只有管理员可删除所有人数据；普通用户只能删除自己的数据、撤回自己的修改，但可以修改别人数据。
- 反馈入口：先在个人主页占位，后续计划免费保存到 D1 供开发者查看。
- 数据导入：支持从 `reference/price_minimal_template_数据表_总表.xlsx` 生成 D1 导入 SQL，图片暂时忽略。

## 技术栈
- 本地开发：Node.js 原生 `http` 服务 + JSON 文件存储。
- 线上部署：Cloudflare Pages Functions + Cloudflare D1。
- 前端：原生 HTML/CSS/JavaScript，移动端优先。

## 本地运行
```bash
npm run init-db
npm run seed   # 可选：初始化一些分类/店铺演示数据
npm start
```

打开：
- 首页：http://localhost:3000/home.html
- 清单：http://localhost:3000/list.html
- 录入：http://localhost:3000/add.html
- 店铺：http://localhost:3000/stores.html
- 我的：http://localhost:3000/profile.html

## Cloudflare 数据导入
从参考表格生成 SQL：
```bash
python3 scripts/reference_xlsx_to_d1_import.py
```

导入远端 D1：
```bash
npx wrangler d1 execute price-comparison --remote --file tmp/reference-xlsx-import.sql
```

## Cloudflare 管理员权限
删除全体数据依赖 Pages 环境变量：

- `ACCESS_ADMIN_EMAILS`：填写开发者邮箱，多个邮箱用英文逗号分隔。
- 兼容别名：`ADMIN_EMAILS`。

当前项目通过 `wrangler.toml` 管理环境变量，所以 Cloudflare 控制台里会提示“此项目的环境变量在 wrangler.toml 中管理”，不能直接在页面保存。需要改 `wrangler.toml`：

```toml
[vars]
ACCESS_ADMIN_EMAILS = "873818496@qq.com"
```

如果没有配置该变量，登录用户只能删除自己创建的数据，不能删除别人创建或导入的数据。

## 接口
- `GET /api/health`
- `GET /api/me/stats`
- `GET /api/categories`
- `POST /api/categories`
- `GET /api/stores`
- `POST /api/stores`
- `PUT /api/stores/:id`
- `DELETE /api/stores/:id`
- `POST /api/stores/:id/undo`
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/price-records`
- `GET /api/price-records/:id`
- `PUT /api/price-records/:id`
- `DELETE /api/price-records/:id`
- `POST /api/price-records/:id/undo`

## 已有核心模块
- `src/core/unit-price.js`
- `src/core/price-record-service.js`
- `src/storage/*`
- `server.js`
