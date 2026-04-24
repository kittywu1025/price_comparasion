# MVP API 契约（V1.0）

## 1) 新增价格记录
### `POST /api/price-records`

请求体：
```json
{
  "product": {
    "id": "optional-uuid",
    "nameZh": "片栗粉",
    "nameJa": "片栗粉",
    "brand": "Topvalu",
    "barcode": "4900000000000",
    "categoryId": "uuid"
  },
  "storeId": "uuid",
  "priceTaxIn": 178,
  "priceTaxEx": 165,
  "taxRate": 8,
  "specValue": 400,
  "unit": "g",
  "imageUrl": "https://...",
  "recordDate": "2026-04-24",
  "note": "会员价"
}
```

响应体：
```json
{
  "id": "price-record-uuid",
  "productId": "product-uuid",
  "storeId": "store-uuid",
  "unitPrice": 44.5,
  "unitPriceLabel": "/100g",
  "priceTaxIn": 178,
  "specValue": 400,
  "unit": "g",
  "recordDate": "2026-04-24"
}
```

校验规则：
- `priceTaxIn > 0`
- `specValue > 0`
- `unit` 必须在枚举内
- `nameZh` 与 `nameJa` 至少一个非空（当 `product.id` 未传时）

---

## 2) 商品列表（聚合最低价）
### `GET /api/products?q=&categoryId=&storeId=&sort=recent|unitPrice`

响应体（示例）：
```json
[
  {
    "productId": "uuid",
    "nameZh": "片栗粉",
    "nameJa": "片栗粉",
    "brand": "Topvalu",
    "defaultImageUrl": "https://...",
    "lowestUnitPrice": 43.5,
    "lowestUnitPriceLabel": "/100g",
    "lowestStoreName": "Cosmos",
    "latestPriceTaxIn": 348,
    "latestRecordDate": "2026-04-20"
  }
]
```

---

## 3) 商品详情
### `GET /api/products/:id`

响应体（示例）：
```json
{
  "product": {
    "id": "uuid",
    "nameZh": "片栗粉",
    "nameJa": "片栗粉",
    "brand": "Topvalu",
    "barcode": "4900000000000",
    "category": "食品",
    "defaultImageUrl": "https://..."
  },
  "overview": {
    "lowestUnitPrice": 43.5,
    "lowestTotalPrice": 178,
    "lastUpdatedAt": "2026-04-20T10:00:00Z",
    "recordCount": 6
  },
  "records": [
    {
      "id": "uuid",
      "storeName": "Cosmos",
      "priceTaxIn": 178,
      "specValue": 400,
      "unit": "g",
      "unitPrice": 44.5,
      "unitPriceLabel": "/100g",
      "recordDate": "2026-04-20",
      "note": "普通价",
      "imageUrl": "https://..."
    }
  ]
}
```

---

## 4) 店铺
- `GET /api/stores`
- `POST /api/stores`

`POST` 请求体：
```json
{
  "name": "中央 cosmos",
  "chainBrand": "Cosmos",
  "location": "中央",
  "note": "营业到23:00"
}
```

---

## 5) 分类
- `GET /api/categories`

---

## 6) 上传图片
### `POST /api/upload`
- multipart/form-data
- 返回：`{ "url": "https://..." }`
- 限制：单图 <= 2MB，失败时不影响文字记录保存
