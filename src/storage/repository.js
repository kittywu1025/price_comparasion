import { getNextId, nowDate, readDb, writeDb } from "./json-db.js";

export function listCategories() {
  return readDb().categories.sort((a, b) => a.name.localeCompare(b.name));
}

export function createCategory(name) {
  const db = readDb();
  const exists = db.categories.find((c) => c.name === name);
  if (exists) throw new Error("分类已存在");
  const row = { id: getNextId(db, "category"), name };
  db.categories.push(row);
  writeDb(db);
  return row;
}

export function listStores() {
  return readDb().stores.slice().reverse();
}

export function createStore(input) {
  const db = readDb();
  const row = {
    id: getNextId(db, "store"),
    name: input.name,
    chainBrand: input.chainBrand ?? "",
    location: input.location ?? "",
    note: input.note ?? ""
  };
  db.stores.push(row);
  writeDb(db);
  return row;
}

export function listProducts({ q = "", categoryId, storeId } = {}) {
  const db = readDb();

  let products = db.products;
  if (q) {
    const query = q.toLowerCase();
    products = products.filter((p) =>
      [p.nameZh, p.nameJa, p.brand, p.barcode].some((x) => (x || "").toLowerCase().includes(query))
    );
  }
  if (categoryId) products = products.filter((p) => String(p.categoryId) === String(categoryId));
  if (storeId) {
    const ids = new Set(db.priceRecords.filter((r) => String(r.storeId) === String(storeId)).map((r) => r.productId));
    products = products.filter((p) => ids.has(p.id));
  }

  return products.map((p) => {
    const records = db.priceRecords.filter((r) => r.productId === p.id);
    const lowest = records.slice().sort((a, b) => a.unitPrice - b.unitPrice || b.recordDate.localeCompare(a.recordDate))[0];
    const latest = records.slice().sort((a, b) => b.recordDate.localeCompare(a.recordDate) || b.id - a.id)[0];
    const lowestStore = lowest ? db.stores.find((s) => s.id === lowest.storeId)?.name : null;
    return {
      productId: p.id,
      nameZh: p.nameZh,
      nameJa: p.nameJa,
      brand: p.brand,
      defaultImageUrl: p.defaultImageUrl,
      lowestUnitPrice: lowest?.unitPrice ?? null,
      lowestUnitPriceLabel: lowest?.unitPriceLabel ?? null,
      lowestStoreName: lowestStore ?? null,
      latestPriceTaxIn: latest?.priceTaxIn ?? null,
      latestRecordDate: latest?.recordDate ?? null
    };
  }).sort((a, b) => (b.latestRecordDate || "").localeCompare(a.latestRecordDate || ""));
}

export function getProductDetail(productId) {
  const db = readDb();
  const product = db.products.find((p) => p.id === productId);
  if (!product) return null;
  const records = db.priceRecords
    .filter((r) => r.productId === productId)
    .sort((a, b) => b.recordDate.localeCompare(a.recordDate) || a.unitPrice - b.unitPrice)
    .map((r) => ({ ...r, storeName: db.stores.find((s) => s.id === r.storeId)?.name || "-" }));

  const overview = {
    lowestUnitPrice: records.length ? Math.min(...records.map((r) => r.unitPrice)) : null,
    lowestTotalPrice: records.length ? Math.min(...records.map((r) => r.priceTaxIn)) : null,
    lastUpdatedAt: records[0]?.recordDate ?? null,
    recordCount: records.length
  };

  return {
    product: {
      id: product.id,
      nameZh: product.nameZh,
      nameJa: product.nameJa,
      brand: product.brand,
      barcode: product.barcode,
      categoryName: db.categories.find((c) => c.id === product.categoryId)?.name || null,
      defaultImageUrl: product.defaultImageUrl
    },
    overview,
    records
  };
}

export function createPriceRecord(input) {
  const db = readDb();

  let productId = input.product?.id ? Number(input.product.id) : null;
  if (!productId) {
    const product = {
      id: getNextId(db, "product"),
      nameZh: input.product?.nameZh || "",
      nameJa: input.product?.nameJa || "",
      brand: input.product?.brand || "",
      barcode: input.product?.barcode || "",
      categoryId: input.product?.categoryId ? Number(input.product.categoryId) : null,
      defaultImageUrl: input.imageUrl || null,
      createdAt: nowDate(),
      updatedAt: nowDate()
    };
    db.products.push(product);
    productId = product.id;
  }

  const row = {
    id: getNextId(db, "priceRecord"),
    productId,
    storeId: Number(input.storeId),
    priceTaxIn: Number(input.priceTaxIn),
    priceTaxEx: input.priceTaxEx == null ? null : Number(input.priceTaxEx),
    taxRate: input.taxRate == null ? null : Number(input.taxRate),
    specValue: Number(input.specValue),
    unit: input.unit,
    unitPrice: input.unitPrice,
    unitPriceLabel: input.unitPriceLabel,
    imageUrl: input.imageUrl || null,
    recordDate: input.recordDate,
    note: input.note || null,
    createdAt: nowDate()
  };

  db.priceRecords.push(row);
  writeDb(db);

  return {
    id: row.id,
    productId: row.productId,
    storeId: row.storeId,
    priceTaxIn: row.priceTaxIn,
    specValue: row.specValue,
    unit: row.unit,
    unitPrice: row.unitPrice,
    unitPriceLabel: row.unitPriceLabel,
    recordDate: row.recordDate
  };
}
