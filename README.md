# price_comparasion

日本超市价格比价工具。当前目标是个人到小范围使用，优先移动端体验，开发和部署方案默认选择免费或免费额度内可用的方案。

## 开发原则
- 优先免费方案；涉及付费 API、付费云服务或可能消耗不可控额度的功能，需要先确认。
- `reference/` 只作为参考资料目录，不修改、不提交到 GitHub。
- 代码推送到 GitHub 前，同步更新 README。

## 当前功能
- 首页：新手教程、快速入口、生活优惠入口。
- 新人优惠页：集中展示 PayPay、Mercari、Yahoo!フリマ 邀请奖励，并支持页内导航快速跳转。
- 学习工具：日语读音标注工具改为开发者/管理员专用；普通用户首页不显示入口，直接访问页面也会被拦下。
- 生活工具：首页快捷入口可进入日本发快递预估价格；使用滑动分段控件按尺寸、重量、匿名、追踪和补偿需求推荐寄送方式，并在结果中显示对应快递示意图和估算运费。
- 底部导航：五个主页面统一使用滑块式 tabbar，支持在底部导航区域左右滑动切换页面。
- 商品清单：按商品聚合展示价格，支持全部/名称/店铺范围搜索、店铺筛选、最低价标记、限时优惠标记；卡片上的价格、店铺和单价统一来自该商品的最新记录，最低价只作为标记展示；空结果会显示可点击的录入引导。
- 商品详情：头部左侧显示紧凑商品图，右侧显示中文名和日文名；查看税后总价、规格、店铺、各店现价排行、历史记录、税后价格走势；历史记录显示记录人、日期和价格。
- 商品记录：支持新增价格记录、修正记录、删除当前记录；修正时条形码只读展示，可通过重新扫码更新；也可更换或删除图片；详情弹窗打开时锁定背景滚动。
- 商品录入：移动端优先布局，支持扫码条码、拍照、相册上传、上传前压缩图片、最多保留 4 张图片、快速填入、店铺输入匹配、税后价自动计算、限时优惠开关；快速填入识别出的价格默认写入税前价格，税后价格继续按当前税率自动计算，并统一按 `税前 × (1 + 税率)` 后用 `Math.round` 四舍五入到整数日元；扫码在 Safari 不支持原生识别时会自动使用本地 ZXing 前端解码组件。
- 批量导入：我的页面可下载 CSV 模板，填写后上传预览；导入列表支持单选/全选和手动修正，校验无误后批量写入价格记录。模板包含限时优惠和优惠截止日期；浏览器端 Excel 文件需先另存为 CSV。
- 录入表单：必填项会显示“必填”标记，商品中文名和日文名二选一填写即可。
- 单位默认规格提示：普通录入或价格修正时，规格数量输入框会随单位显示默认提示；`g = 1000`、`ml = 1000`、`个 = 1`、`pack = 1`。如果用户留空，提交时自动按当前单位默认值写入；如果用户填写了具体数值，则以用户输入为准。
- 规格计算：规格数值支持弹出计算器，可输入 `100*3`、`100g*3` 这类组合规格。
- 店铺管理：店铺列表、弹窗新增、长按或左滑后编辑/删除、点击店铺会跳到清单页并筛选该店铺商品；新增时可按东广岛市范围搜索店铺并二次确认。
- 店铺情报投稿：`store.html` 店铺详情页支持普通用户上传店内海报或公告；弹窗只保留图片必填、备注可选、活动结束日期可选，支持拍照上传、相册多选和一次上传多张图片；拍照和相册分别使用独立 file input，其中相册 input 不带 `capture`；图片会在前端压缩为 JPEG 后保存，并限制最多 5 张、限制总大小，上传失败时会尽量显示更具体的原因；多图优先保存在 `images` / `images_json`，旧的单图 `imageData` / `image_data` 仍兼容显示；普通用户只能管理自己的投稿，管理员可管理全部；卡片显示图片、备注、上传者、上传日期和活动结束日期，并对过期或超过 30 天的旧情报给出提示。
- 登录体验：店铺页可公开查看；录入页和个人主页未登录时显示登录弹窗，可返回或跳转登录。
- 个人主页：底部导航始终显示入口；未登录进入时显示登录弹窗；登录后可查看自己的价格记录、商品、店铺和修改次数贡献统计；首次登录会要求设置用户名，并显示用户名与绑定邮箱。
- 体验细节：首页教程会明确提示快速填入默认识别税前价格；店铺页空状态会直接提示先新增店铺；店铺情报图片处理失败后，上传区会自动恢复默认提示，不会长时间停留在“正在压缩”状态。
- 开发者模式：管理员默认以普通用户界面使用，打开开发者模式后才显示用户反馈列表和后续管理入口。
- 开发者数据整理：开发者模式下可一键导出所有价格记录为 CSV，在表格里修改后上传；带 `recordId` 的行会更新原记录，空 `recordId` 的行会新增。
- 商品去重：条码相同视为同一个商品，会追加价格记录；只有中文名相同仍允许录入为不同商品。
- 权限规则：只有管理员可删除所有人数据；普通用户只能删除自己的数据、撤回自己的修改，但可以修改别人数据。
- 反馈入口：普通用户可在个人主页提交建议，反馈免费保存到 D1，只有管理员打开开发者模式后可查看。
- 错误提示：主要页面的错误改为顶部 toast 弹窗提示，避免错误信息堆在页面底部。
- 数据导入：支持从 `reference/price_minimal_template_数据表_总表.xlsx` 生成 D1 导入 SQL，图片暂时忽略。

## 技术栈
- 本地开发：Node.js 原生 `http` 服务 + JSON 文件存储。
- 线上部署：Cloudflare Pages Functions + Cloudflare D1。
- 前端：原生 HTML/CSS/JavaScript，移动端优先。
- 手机端适配：主要页面使用 `viewport-fit=cover`、安全区 padding、`100dvh` 和横向溢出限制，避免 iPhone 浏览器中内容被左右边缘、顶部或底部导航遮挡。

## 本地运行
```bash
npm run init-db
npm run seed   # 可选：初始化一些分类/店铺演示数据
npm start
```

打开：
- 首页：http://localhost:3000/home.html
- 清单：http://localhost:3000/products
- 录入：http://localhost:3000/add.html
- 店铺：http://localhost:3000/stores.html
- 我的：http://localhost:3000/profile.html
- 日语读音标注（开发者/管理员专用）：http://localhost:3000/kana.html
- 日本发快递预估价格：http://localhost:3000/shipping.html
- 新人注册优惠：http://localhost:3000/deals.html

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
删除全体数据依赖 Pages 环境变量。公开仓库不要直接写真实邮箱，优先使用邮箱 SHA-256 哈希：

- `ACCESS_ADMIN_EMAIL_HASHES`：填写开发者邮箱的小写 SHA-256 哈希，多个用英文逗号分隔。
- `ACCESS_ADMIN_EMAILS`：兼容明文邮箱配置，但不建议提交到公开仓库。
- 兼容别名：`ADMIN_EMAILS`。

当前项目通过 `wrangler.toml` 管理环境变量，所以 Cloudflare 控制台里会提示“此项目的环境变量在 wrangler.toml 中管理”，不能直接在页面保存。需要改 `wrangler.toml`：

```toml
[vars]
ACCESS_ADMIN_EMAIL_HASHES = "your-lowercase-email-sha256"
```

本地生成哈希：

```bash
node -e "const crypto=require('crypto'); console.log(crypto.createHash('sha256').update('your-email@example.com'.toLowerCase()).digest('hex'))"
```

如果没有配置该变量，登录用户只能删除自己创建的数据，不能删除别人创建或导入的数据。

## Cloudflare Access 路径建议
为了让公开浏览、应用内登录弹窗和开发口令登录同时生效，Access 建议只保护登录入口：

- `/api/auth*`

不要保护这些页面或接口，否则用户看不到应用内登录弹窗，开发口令登录也无法绕过 Access：

- `/add.html`
- `/profile.html`
- `/stores.html`
- `/api/stores*`
- `/api/price-records*`
- `/api/categories*`
- `/api/feedback*`

这些写入接口未登录时会由应用自身返回 `401 login required`。

## 开发口令登录
为了减少开发时反复收验证码，可以启用应用自己的开发口令登录。这个功能默认关闭，只有配置环境变量才可用。

这个项目的普通环境变量由 `wrangler.toml` 管理，所以 Cloudflare 控制台会禁止直接保存普通变量。开发口令相关信息不要写进 `wrangler.toml`，统一作为加密 secret 设置。

需要设置 3 个 secret：

- `DEV_LOGIN_EMAIL`：开发口令登录后绑定到哪个邮箱。
- `DEV_LOGIN_PASSWORD_HASH`：开发口令的小写 SHA-256 哈希。
- `DEV_LOGIN_SECRET`：用于签名登录 cookie 的随机长字符串，不要提交到 GitHub。

生成口令哈希：

```bash
node -e "const crypto=require('crypto'); console.log(crypto.createHash('sha256').update('your-dev-password').digest('hex'))"
```

生成 cookie 签名密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

设置到 Cloudflare Pages：

```bash
npx wrangler pages secret put DEV_LOGIN_EMAIL --project-name price-comparasion
npx wrangler pages secret put DEV_LOGIN_PASSWORD_HASH --project-name price-comparasion
npx wrangler pages secret put DEV_LOGIN_SECRET --project-name price-comparasion
```

每条命令运行后，把对应值粘贴进去确认即可。设置 secret 后，需要重新部署一次 Pages，线上环境才会读到新值。

如果 Cloudflare Access 仍然保护 `/api/price-records*`、`/api/categories*`、`/api/feedback*`，开发口令登录后的请求仍会先被 Access 拦截。要使用开发口令登录，需要让这些 API 交给应用内认证处理，或在 Access 里为开发者单独配置可长期保持登录的策略。

## 接口
- `GET /api/health`
- `POST /api/dev-login`
- `DELETE /api/dev-login`
- `GET /api/me/stats`
- `GET /api/me/profile`
- `PUT /api/me/profile`
- `GET /api/feedback`
- `POST /api/feedback`
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
