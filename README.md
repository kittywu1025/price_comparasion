# price_comparasion

日本超市价格比价工具（MVP 第一版可运行）

## 当前状态
- ✅ 登录暂时关闭（按你的要求先不做登录页）
- ✅ 可新增店铺、分类
- ✅ 可新增价格记录（自动算单位价格）
- ✅ 首页按商品聚合展示最低单位价
- ✅ 商品详情可看历史记录
- ✅ 数据库支持“空库启动”，可手动添加或执行 seed

## 技术栈
- Node.js（原生 `http` 服务）
- JSON 文件存储（`data/app.json`，零外部依赖）
- 原生 HTML（移动端优先简化版）

## 运行步骤
```bash
npm run init-db
npm run seed   # 可选：初始化一些分类/店铺演示数据
npm start
```

打开：
- 首页：http://localhost:3000/index.html
- 添加：http://localhost:3000/add.html
- 店铺：http://localhost:3000/stores.html

## 接口
- `GET /api/health`
- `GET /api/categories`
- `POST /api/categories`
- `GET /api/stores`
- `POST /api/stores`
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/price-records`

## 已有核心模块
- `src/core/unit-price.js`
- `src/core/price-record-service.js`
- `src/storage/*`
- `server.js`
