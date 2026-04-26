import { getNextId, nowDate, readDb, writeDb } from "./json-db.js";

export function listCategories() {
  return readDb().categories.sort((a, b) => a.name.localeCompare(b.name));
}

export function getMyStats(auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const actor = getCreatedBy(auth);
  const myPriceRecords = db.priceRecords.filter((record) => record.createdBy === actor);
  const myProducts = db.products.filter((product) => product.createdBy === actor);
  const myStores = db.stores.filter((store) => store.createdBy === actor);
  const myStoreEdits = db.storeRevisions.filter((revision) => revision.modifiedBy === actor);
  const myRecordEdits = db.priceRecordRevisions.filter((revision) => revision.modifiedBy === actor);

  return {
    user: {
      email: actor,
      isAdmin: Boolean(auth?.isAdmin)
    },
    mine: {
      priceRecords: myPriceRecords.length,
      products: myProducts.length,
      stores: myStores.length,
      edits: myStoreEdits.length + myRecordEdits.length
    },
    totals: {
      priceRecords: db.priceRecords.length,
      products: db.products.length,
      stores: db.stores.length
    },
    lastContributionDate: myPriceRecords
      .map((record) => record.recordDate || record.createdAt || "")
      .filter(Boolean)
      .sort()
      .pop() || null
  };
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

export function listStores(auth = {}) {
  const db = readDb();
  return db.stores.slice().reverse().map((store) => ({
    ...store,
    canDelete: canDeleteRow(auth, store.createdBy)
  }));
}

export function createStore(input, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const row = {
    id: getNextId(db, "store"),
    name: input.name,
    chainBrand: input.chainBrand ?? "",
    location: input.location ?? "",
    note: input.note ?? "",
    createdBy: getCreatedBy(auth)
  };
  db.stores.push(row);
  writeDb(db);
  return { ...row, canDelete: true };
}

export function updateStore(storeId, input, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const id = Number(storeId);
  const target = db.stores.find((s) => s.id === id);
  if (!target) throw new Error("store not found");
  if (!input.name?.trim()) throw new Error("name is required");

  db.storeRevisions.push({
    id: getNextId(db, "storeRevision"),
    storeId: target.id,
    snapshot: {
      name: target.name,
      chainBrand: target.chainBrand ?? "",
      location: target.location ?? "",
      note: target.note ?? ""
    },
    modifiedBy: getCreatedBy(auth),
    createdAt: nowDate()
  });

  target.name = input.name.trim();
  target.chainBrand = (input.chainBrand ?? "").trim();
  target.location = (input.location ?? "").trim();
  target.note = (input.note ?? "").trim();

  writeDb(db);
  return { ...target, canDelete: canDeleteRow(auth, target.createdBy) };
}

export function undoStore(storeId, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const id = Number(storeId);
  const target = db.stores.find((s) => s.id === id);
  if (!target) throw new Error("store not found");

  const revision = latestBy(db.storeRevisions, (item) => item.storeId === id);
  if (!revision) throw new Error("没有可撤回的修改");
  if (!canUndoLatestRevision(auth, revision.modifiedBy)) {
    throw new Error("只能撤回你自己做的最后一次修改");
  }

  target.name = revision.snapshot.name;
  target.chainBrand = revision.snapshot.chainBrand;
  target.location = revision.snapshot.location;
  target.note = revision.snapshot.note;
  db.storeRevisions = db.storeRevisions.filter((item) => item.id !== revision.id);
  writeDb(db);
  return { ...target, canDelete: canDeleteRow(auth, target.createdBy) };
}

export function deleteStore(storeId, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const id = Number(storeId);
  const target = db.stores.find((s) => s.id === id);
  if (!target) throw new Error("store not found");
  if (!canDeleteRow(auth, target.createdBy)) {
    throw new Error("forbidden: only owner or admin can delete this store");
  }
  const inUse = db.priceRecords.some((r) => r.storeId === id);
  if (inUse) throw new Error("store has related price records");

  const idx = db.stores.findIndex((s) => s.id === id);
  const [deleted] = db.stores.splice(idx, 1);
  db.storeRevisions = db.storeRevisions.filter((item) => item.storeId !== id);
  writeDb(db);
  return deleted;
}

export function listProducts({ q = "", scope = "all", categoryId, storeId } = {}) {
  const db = readDb();

  let products = db.products;
  if (q) {
    const query = q.toLowerCase();
    const storeIds = new Set(
      db.stores
        .filter((store) => String(store.name || "").toLowerCase().includes(query))
        .map((store) => store.id)
    );
    const productIdsByStoreName = new Set(
      db.priceRecords.filter((record) => storeIds.has(record.storeId)).map((record) => record.productId)
    );
    products = products.filter((p) => {
      const productMatch = [p.nameZh, p.nameJa, p.brand, p.barcode]
        .some((x) => (x || "").toLowerCase().includes(query));
      if (scope === "name") return productMatch;
      if (scope === "store") return productIdsByStoreName.has(p.id);
      return productMatch || productIdsByStoreName.has(p.id);
    });
  }
  if (categoryId) products = products.filter((p) => String(p.categoryId) === String(categoryId));
  if (storeId) {
    const ids = new Set(db.priceRecords.filter((r) => String(r.storeId) === String(storeId)).map((r) => r.productId));
    products = products.filter((p) => ids.has(p.id));
  }

  return products.map((p) => {
    const records = db.priceRecords.filter((r) => r.productId === p.id);
    const latest = records.slice().sort((a, b) => b.recordDate.localeCompare(a.recordDate) || b.id - a.id)[0];
    const keywordProducts = db.products.filter((candidate) => matchesCompareKeyword(compareKeywordOf(p), compareKeywordOf(candidate)));
    const sameProductProducts = db.products.filter((candidate) => isSameProductGroup(p, candidate));
    const keywordRecords = db.priceRecords.filter((r) => keywordProducts.some((candidate) => candidate.id === r.productId));
    const sameProductRecords = db.priceRecords.filter((r) => sameProductProducts.some((candidate) => candidate.id === r.productId));
    const keywordLowest = lowestRecord(keywordRecords);
    const sameProductLowest = lowestRecord(sameProductRecords);
    const keywordLowestStore = keywordLowest ? db.stores.find((s) => s.id === keywordLowest.storeId)?.name : null;
    const sameProductLowestStore = sameProductLowest ? db.stores.find((s) => s.id === sameProductLowest.storeId)?.name : null;
    return {
      productId: p.id,
      nameZh: p.nameZh,
      nameJa: p.nameJa,
      brand: p.brand,
      barcode: p.barcode,
      defaultImageUrl: p.defaultImageUrl,
      isKeywordBest: Boolean(keywordLowest && keywordLowest.productId === p.id),
      isSameProductBest: Boolean(sameProductLowest && sameProductLowest.productId === p.id),
      latestIsPromo: isPromoActive(latest?.note),
      lowestUnitPrice: keywordLowest?.unitPrice ?? null,
      lowestUnitPriceLabel: keywordLowest?.unitPriceLabel ?? null,
      lowestStoreName: keywordLowestStore ?? null,
      sameProductLowestUnitPrice: sameProductLowest?.unitPrice ?? null,
      sameProductLowestUnitPriceLabel: sameProductLowest?.unitPriceLabel ?? null,
      sameProductLowestStoreName: sameProductLowestStore ?? null,
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
  const keywordProducts = db.products.filter((candidate) => matchesCompareKeyword(compareKeywordOf(product), compareKeywordOf(candidate)));
  const sameProductProducts = db.products.filter((candidate) => isSameProductGroup(product, candidate));
  const keywordRecords = db.priceRecords.filter((r) => keywordProducts.some((candidate) => candidate.id === r.productId));
  const sameProductRecords = db.priceRecords.filter((r) => sameProductProducts.some((candidate) => candidate.id === r.productId));
  const keywordLowest = lowestRecord(keywordRecords);
  const sameProductLowest = lowestRecord(sameProductRecords);

  const overview = {
    lowestUnitPrice: records.length ? Math.min(...records.map((r) => r.unitPrice)) : null,
    lowestTotalPrice: records.length ? Math.min(...records.map((r) => r.priceTaxIn)) : null,
    keywordLowestUnitPrice: keywordLowest?.unitPrice ?? null,
    keywordLowestUnitPriceLabel: keywordLowest?.unitPriceLabel ?? null,
    keywordLowestStoreName: keywordLowest ? db.stores.find((s) => s.id === keywordLowest.storeId)?.name || "-" : null,
    sameProductLowestUnitPrice: sameProductLowest?.unitPrice ?? null,
    sameProductLowestUnitPriceLabel: sameProductLowest?.unitPriceLabel ?? null,
    sameProductLowestStoreName: sameProductLowest ? db.stores.find((s) => s.id === sameProductLowest.storeId)?.name || "-" : null,
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

export function createPriceRecord(input, auth = {}) {
  const db = readDb();
  ensureDbShape(db);

  let productId = input.product?.id ? Number(input.product.id) : null;
  const barcode = String(input.product?.barcode || "").trim();
  if (!productId && barcode) {
    const existingProduct = db.products.find((product) => String(product.barcode || "").trim() === barcode);
    if (existingProduct) {
      productId = existingProduct.id;
      if (input.imageUrl && !existingProduct.defaultImageUrl) {
        existingProduct.defaultImageUrl = input.imageUrl;
        existingProduct.updatedAt = nowDate();
      }
    }
  }
  if (!productId) {
    const product = {
      id: getNextId(db, "product"),
      nameZh: input.product?.nameZh || "",
      nameJa: input.product?.nameJa || "",
      brand: input.product?.brand || "",
      barcode,
      categoryId: input.product?.categoryId ? Number(input.product.categoryId) : null,
      defaultImageUrl: input.imageUrl || null,
      createdBy: getCreatedBy(auth),
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
    createdBy: getCreatedBy(auth),
    createdAt: nowDate()
  };

  db.priceRecords.push(row);
  writeDb(db);

  return toPriceRecord(row);
}

export function getPriceRecordAccess(recordId, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const id = Number(recordId);
  const row = db.priceRecords.find((record) => record.id === id);
  if (!row) throw new Error("price record not found");
  const revision = latestBy(db.priceRecordRevisions, (item) => item.priceRecordId === id);
  return {
    id: row.id,
    canDelete: canDeleteRow(auth, row.createdBy),
    canUndo: canUndoLatestRevision(auth, revision?.modifiedBy),
    createdBy: row.createdBy || "",
    currentUser: auth?.email || "",
    isAdmin: Boolean(auth?.isAdmin)
  };
}

export function updatePriceRecord(recordId, input, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const id = Number(recordId);
  const row = db.priceRecords.find((r) => r.id === id);
  if (!row) throw new Error("price record not found");

  db.priceRecordRevisions.push({
    id: getNextId(db, "priceRecordRevision"),
    priceRecordId: row.id,
    snapshot: {
      storeId: row.storeId,
      priceTaxIn: row.priceTaxIn,
      priceTaxEx: row.priceTaxEx,
      taxRate: row.taxRate,
      specValue: row.specValue,
      unit: row.unit,
      unitPrice: row.unitPrice,
      unitPriceLabel: row.unitPriceLabel,
      imageUrl: row.imageUrl || null,
      recordDate: row.recordDate,
      note: row.note || null
    },
    modifiedBy: getCreatedBy(auth),
    createdAt: nowDate()
  });

  row.storeId = Number(input.storeId);
  row.priceTaxIn = Number(input.priceTaxIn);
  row.priceTaxEx = input.priceTaxEx == null ? null : Number(input.priceTaxEx);
  row.taxRate = input.taxRate == null ? null : Number(input.taxRate);
  row.specValue = Number(input.specValue);
  row.unit = input.unit;
  row.unitPrice = input.unitPrice;
  row.unitPriceLabel = input.unitPriceLabel;
  row.imageUrl = input.imageUrl || null;
  row.recordDate = input.recordDate;
  row.note = input.note || null;

  writeDb(db);
  return row;
}

export function undoPriceRecord(recordId, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const id = Number(recordId);
  const row = db.priceRecords.find((record) => record.id === id);
  if (!row) throw new Error("price record not found");

  const revision = latestBy(db.priceRecordRevisions, (item) => item.priceRecordId === id);
  if (!revision) throw new Error("没有可撤回的修改");
  if (!canUndoLatestRevision(auth, revision.modifiedBy)) {
    throw new Error("只能撤回你自己做的最后一次修改");
  }

  Object.assign(row, revision.snapshot);
  db.priceRecordRevisions = db.priceRecordRevisions.filter((item) => item.id !== revision.id);
  writeDb(db);
  return row;
}

export function deletePriceRecord(recordId, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const id = Number(recordId);
  const row = db.priceRecords.find((record) => record.id === id);
  if (!row) throw new Error("price record not found");
  if (!canDeleteRow(auth, row.createdBy)) {
    throw new Error("forbidden: only owner or admin can delete this record");
  }

  db.priceRecords = db.priceRecords.filter((record) => record.id !== id);
  db.priceRecordRevisions = db.priceRecordRevisions.filter((item) => item.priceRecordId !== id);
  writeDb(db);
  return { id };
}

function toPriceRecord(row) {
  return {
    id: row.id,
    productId: row.productId,
    storeId: row.storeId,
    priceTaxIn: row.priceTaxIn,
    priceTaxEx: row.priceTaxEx,
    taxRate: row.taxRate,
    specValue: row.specValue,
    unit: row.unit,
    unitPrice: row.unitPrice,
    unitPriceLabel: row.unitPriceLabel,
    imageUrl: row.imageUrl || null,
    recordDate: row.recordDate,
    note: row.note || null,
    createdAt: row.createdAt
  };
}

function ensureDbShape(db) {
  db.counters ??= {};
  db.counters.storeRevision ??= 1;
  db.counters.priceRecordRevision ??= 1;
  db.storeRevisions ??= [];
  db.priceRecordRevisions ??= [];

  for (const store of db.stores ?? []) {
    store.createdBy ??= "local-import";
  }

  for (const record of db.priceRecords ?? []) {
    record.createdBy ??= "local-import";
  }

  for (const product of db.products ?? []) {
    product.createdBy ??= "local-import";
  }
}

function latestBy(items, predicate) {
  return items.filter(predicate).sort((a, b) => Number(b.id) - Number(a.id))[0] || null;
}

function getCreatedBy(auth) {
  return auth?.email || "local-user";
}

function canDeleteRow(auth, createdBy) {
  if (auth?.isAdmin) return true;
  return Boolean(auth?.email && createdBy && auth.email === String(createdBy).trim().toLowerCase());
}

function canUndoLatestRevision(auth, modifiedBy) {
  if (auth?.isAdmin) return true;
  return Boolean(auth?.email && modifiedBy && auth.email === String(modifiedBy).trim().toLowerCase());
}

function isPromoActive(note) {
  const meta = parsePromoNote(note);
  if (!meta.isPromo) return false;
  if (!meta.until) return true;
  return String(meta.until) >= nowDate();
}

function parsePromoNote(note) {
  const text = String(note || "");
  const match = text.match(/^\[\[promo(?::(\d{4}-\d{2}-\d{2}))?\]\]\s*/i);
  if (!match) return { isPromo: false, until: null };
  return { isPromo: true, until: match[1] || null };
}

function compareKeywordOf(product) {
  return normalizeCompareText(product?.nameZh || product?.nameJa || product?.barcode || "");
}

function normalizeCompareText(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesCompareKeyword(baseKeyword, candidateKeyword) {
  if (!baseKeyword || !candidateKeyword) return false;
  return baseKeyword.includes(candidateKeyword) || candidateKeyword.includes(baseKeyword);
}

function isSameProductGroup(baseProduct, candidate) {
  const baseBarcode = normalizeCompareText(baseProduct?.barcode);
  const candidateBarcode = normalizeCompareText(candidate?.barcode);
  if (baseBarcode) return baseBarcode === candidateBarcode;
  return normalizeCompareText(baseProduct?.nameZh) === normalizeCompareText(candidate?.nameZh);
}

function lowestRecord(records) {
  return records.slice().sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice) || String(b.recordDate || "").localeCompare(String(a.recordDate || "")))[0] || null;
}
