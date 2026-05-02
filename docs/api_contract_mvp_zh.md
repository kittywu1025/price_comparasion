# 当前 API 契约

> 当前线上 API 位于 `functions/api/[[path]].js`。ID 均为 D1 自增整数，不是 UUID。

## 1. 认证与权限

应用通过以下来源识别用户：

- Cloudflare Access header / JWT。
- 开发口令登录写入的 `price_dev_session` HttpOnly cookie。

需要登录的接口：

- `/api/me*`
- `/api/feedback*`
- 非 GET 的 `/api/stores*`
- 非 GET 的 `/api/store-posts*`
- `/api/categories*`
- `/api/price-records*`
- 其他非 GET 请求

公开 GET：

- `/api/health`
- `/api/images/*`
- `GET /api/stores`
- `GET /api/store-posts`
- `GET /api/store-posts/:id`
- `GET /api/products`
- `GET /api/products/:id`

管理员由 `ACCESS_ADMIN_EMAIL_HASHES` 或兼容的明文邮箱变量识别。公开仓库不要提交真实邮箱。

## 2. 开发口令登录

### `POST /api/dev-login`

请求体：

```json
{
  "password": "开发口令原文"
}
```

成功后设置 `price_dev_session` cookie：

```json
{
  "ok": true,
  "email": "user@example.com"
}
```

需要配置 Cloudflare Pages secrets：

- `DEV_LOGIN_EMAIL`
- `DEV_LOGIN_PASSWORD_HASH`
- `DEV_LOGIN_SECRET`

### `DELETE /api/dev-login`

清除开发登录 cookie。

## 3. 当前用户

- `GET /api/me/stats`
- `GET /api/me/profile`
- `PUT /api/me/profile`

`PUT /api/me/profile` 请求体：

```json
{
  "displayName": "Kitty"
}
```

## 4. 分类

- `GET /api/categories`
- `POST /api/categories`

`POST` 请求体：

```json
{
  "name": "食品"
}
```

## 5. 店铺

- `GET /api/stores`
- `POST /api/stores`
- `PUT /api/stores/:id`
- `DELETE /api/stores/:id`
- `POST /api/stores/:id/undo`

`POST` / `PUT` 请求体：

```json
{
  "name": "FRESTA フレスタ（西条店）",
  "chainBrand": "",
  "location": "西条",
  "note": ""
}
```

返回字段包含：

```json
{
  "id": 1,
  "name": "FRESTA フレスタ（西条店）",
  "chainBrand": "",
  "location": "西条",
  "note": "",
  "canDelete": true
}
```

## 6. 商品列表

### `GET /api/products?q=&scope=all|name|store&categoryId=&storeId=`

响应示例：

```json
[
  {
    "productId": 1,
    "nameZh": "香蕉",
    "nameJa": "",
    "brand": "",
    "barcode": "",
    "defaultImageUrl": "/api/images/products/example.jpg",
    "isKeywordBest": true,
    "isSameProductBest": false,
    "latestIsPromo": false,
    "lowestUnitPrice": 138.24,
    "lowestUnitPriceLabel": "/100g",
    "lowestStoreName": "Every エブリイ（西条御薗宇店）",
    "sameProductLowestUnitPrice": 138.24,
    "sameProductLowestUnitPriceLabel": "/100g",
    "sameProductLowestStoreName": "Every エブリイ（西条御薗宇店）",
    "latestPriceTaxIn": 214,
    "latestUnitPrice": 138.24,
    "latestUnitPriceLabel": "/100g",
    "latestStoreName": "Every エブリイ（西条御薗宇店）",
    "latestRecordDate": "2026-04-02"
  }
]
```

搜索范围：

- `all`：名称/品牌/条码/店铺名。
- `name`：名称/品牌/条码。
- `store`：店铺名。

## 7. 商品详情

### `GET /api/products/:id`

响应示例：

```json
{
  "product": {
    "id": 1,
    "nameZh": "香蕉",
    "nameJa": "",
    "brand": "",
    "barcode": "",
    "categoryName": null,
    "defaultImageUrl": "/api/images/products/example.jpg"
  },
  "overview": {
    "lowestUnitPrice": 138.24,
    "lowestTotalPrice": 214,
    "keywordLowestUnitPrice": 138.24,
    "keywordLowestUnitPriceLabel": "/100g",
    "keywordLowestStoreName": "Every エブリイ（西条御薗宇店）",
    "sameProductLowestUnitPrice": 138.24,
    "sameProductLowestUnitPriceLabel": "/100g",
    "sameProductLowestStoreName": "Every エブリイ（西条御薗宇店）",
    "lastUpdatedAt": "2026-04-02",
    "recordCount": 1
  },
  "records": []
}
```

`records` 使用价格记录返回结构。

## 8. 店铺情报投稿

- `GET /api/store-posts?storeId=1`
- `GET /api/store-posts/:id`
- `POST /api/store-posts`
- `PUT /api/store-posts/:id`
- `DELETE /api/store-posts/:id`

`POST` / `PUT` 请求体：

```json
{
  "storeId": "1",
  "title": "店铺情报",
  "type": "post",
  "content": "周三双倍积分",
  "source": "用户上传",
  "imageData": "data:image/jpeg;base64,...",
  "imageUrl": "",
  "images": [
    "data:image/jpeg;base64,...",
    "data:image/jpeg;base64,..."
  ],
  "validTo": "2026-05-31"
}
```

说明：

- `images` 支持多张图片；线上 D1 使用 `images_json` 保存。
- 旧单图 `imageData` / `image_data` 仍兼容读取和显示。
- 前端会先压缩成 JPEG 再提交。
- 普通用户只能编辑和删除自己创建的投稿；管理员可以管理全部。
- 列表页根据 `validTo` 或 `uploadedAt` 判断“已过期，仅供参考”与“旧情报，请注意确认”。

返回字段示例：

```json
{
  "id": "uuid",
  "storeId": "1",
  "content": "周三双倍积分",
  "imageData": "data:image/jpeg;base64,...",
  "imageUrl": "",
  "images": [
    "data:image/jpeg;base64,...",
    "data:image/jpeg;base64,..."
  ],
  "validTo": "2026-05-31",
  "createdBy": "user@example.com",
  "createdByName": "Kitty",
  "uploadedAt": "2026-05-03 12:00:00",
  "canEdit": true,
  "canDelete": true
}
```

## 9. 价格记录

- `POST /api/price-records`
- `GET /api/price-records/:id`
- `PUT /api/price-records/:id`
- `DELETE /api/price-records/:id`
- `POST /api/price-records/:id/undo`

### 新增价格记录

`POST /api/price-records`

```json
{
  "product": {
    "id": 1,
    "nameZh": "片栗粉",
    "nameJa": "片栗粉",
    "brand": "",
    "barcode": "4900000000000",
    "categoryId": null
  },
  "storeId": 1,
  "priceTaxIn": 178,
  "priceTaxEx": 165,
  "taxRate": 8,
  "specValue": 400,
  "unit": "g",
  "imageUrls": ["data:image/jpeg;base64,..."],
  "recordDate": "2026-04-24",
  "note": "[[promo:2026-04-30]] 限时优惠"
}
```

说明：

- `product.id` 存在时使用已有商品。
- 没有 `product.id` 时，中文名或日文名至少填一个。
- 条码相同时复用已有商品。
- `imageUrls` 最多 4 张。
- data URL 图片线上会写入 R2，并返回 `/api/images/...` URL。
- 单张图片超过 900KB 会被拒绝。
- 限时优惠通过 `note` 前缀 `[[promo:YYYY-MM-DD]]` 标记。

响应示例：

```json
{
  "id": 1,
  "productId": 1,
  "storeId": 1,
  "priceTaxIn": 178,
  "priceTaxEx": 165,
  "taxRate": 8,
  "specValue": 400,
  "unit": "g",
  "unitPrice": 44.5,
  "unitPriceLabel": "/100g",
  "imageUrl": "/api/images/products/example.jpg",
  "imageUrls": ["/api/images/products/example.jpg"],
  "recordDate": "2026-04-24",
  "note": "[[promo:2026-04-30]] 限时优惠",
  "createdBy": "user@example.com",
  "storeName": "-"
}
```

### 权限查询

`GET /api/price-records/:id` 返回当前用户是否可删除、是否可撤回：

```json
{
  "id": 1,
  "canDelete": true,
  "canUndo": true,
  "createdBy": "user@example.com",
  "currentUser": "user@example.com",
  "isAdmin": true
}
```

## 9. 图片读取

### `GET /api/images/products/:file`

从 R2 读取图片。项目没有独立的 `/api/upload` 接口，图片随价格记录创建/更新提交。

## 10. 反馈

- `GET /api/feedback`
- `POST /api/feedback`

`POST` 请求体：

```json
{
  "message": "希望增加价格导出功能"
}
```
