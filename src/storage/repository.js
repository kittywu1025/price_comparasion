import { getNextId, nowDate, readDb, writeDb } from "./json-db.js";

export function listCategories() {
  return readDb().categories.sort((a, b) => a.name.localeCompare(b.name));
}

export function getMyStats(auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const actor = getCreatedBy(auth);
  const profile = profileFor(db, actor);
  const myPriceRecords = db.priceRecords.filter((record) => record.createdBy === actor);
  const myProducts = db.products.filter((product) => product.createdBy === actor);
  const myStores = db.stores.filter((store) => store.createdBy === actor);
  const myStoreEdits = db.storeRevisions.filter((revision) => revision.modifiedBy === actor);
  const myRecordEdits = db.priceRecordRevisions.filter((revision) => revision.modifiedBy === actor);

  return {
    user: {
      email: actor,
      displayName: profile.displayName || "",
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

export function getMyProfile(auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const actor = getCreatedBy(auth);
  const profile = profileFor(db, actor);
  return {
    email: actor,
    displayName: profile.displayName || "",
    isAdmin: Boolean(auth?.isAdmin)
  };
}

export function updateMyProfile(input, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const actor = getCreatedBy(auth);
  const displayName = String(input.displayName || "").trim().slice(0, 40);
  let profile = db.userProfiles.find((item) => item.email === actor);
  if (!profile) {
    profile = { email: actor, displayName: "", updatedAt: new Date().toISOString() };
    db.userProfiles.push(profile);
  }
  profile.displayName = displayName;
  profile.updatedAt = new Date().toISOString();
  writeDb(db);
  return {
    email: actor,
    displayName: profile.displayName,
    isAdmin: Boolean(auth?.isAdmin)
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

export function listFeedback(auth = {}) {
  if (!auth?.isAdmin) throw new Error("forbidden: admin only");
  const db = readDb();
  ensureDbShape(db);
  return db.feedback
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || b.id - a.id)
    .map((item) => ({
      id: item.id,
      message: item.message,
      createdBy: item.createdBy || "",
      createdByName: profileFor(db, item.createdBy || "").displayName || item.createdBy || "",
      createdAt: item.createdAt || ""
    }));
}

export function createFeedback(input, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const message = String(input.message || "").trim();
  if (!message) throw new Error("message is required");
  const row = {
    id: getNextId(db, "feedback"),
    message,
    createdBy: getCreatedBy(auth),
    createdAt: new Date().toISOString()
  };
  db.feedback.push(row);
  writeDb(db);
  return {
    id: row.id,
    message: row.message,
    createdBy: row.createdBy,
    createdAt: row.createdAt
  };
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

export function getStore(storeId, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const id = Number(storeId);
  const store = db.stores.find((item) => Number(item.id) === id);
  if (!store) return null;
  const priceRecords = db.priceRecords.filter((record) => Number(record.storeId) === id);
  const storePosts = db.storePosts.filter((post) => Number(post.storeId) === id && !post.deletedAt);
  return {
    ...store,
    canDelete: canDeleteRow(auth, store.createdBy),
    priceRecordCount: priceRecords.length,
    storePostCount: storePosts.length,
    latestPriceRecordDate: priceRecords
      .map((record) => record.recordDate || "")
      .filter(Boolean)
      .sort()
      .pop() || null
  };
}

export function listStorePosts({ storeId = "" } = {}, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const storeIdText = String(storeId || "").trim();
  if (storeIdText && !/^\d+$/.test(storeIdText)) throw new Error("storeId is required");

  return db.storePosts
    .filter((post) => !post.deletedAt)
    .filter((post) => !storeIdText || String(post.storeId) === storeIdText)
    .slice()
    .sort((a, b) =>
      String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")) ||
      String(b.validTo || "").localeCompare(String(a.validTo || "")) ||
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) ||
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    )
    .map((post) => toStorePost(db, post, auth));
}

export function getStorePost(postId, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const post = db.storePosts.find((item) => item.id === String(postId) && !item.deletedAt);
  if (!post) return null;
  return toStorePost(db, post, auth);
}

export function createStorePost(input, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const row = normalizeStorePostInput(input, auth);
  row.id = createStorePostId(db);
  row.createdBy = getCreatedBy(auth);
  row.uploadedAt = new Date().toISOString();
  row.createdAt = new Date().toISOString();
  row.updatedAt = row.createdAt;
  row.deletedAt = null;
  db.storePosts.push(row);
  writeDb(db);
  return toStorePost(db, row, auth);
}

export function updateStorePost(postId, input, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const row = db.storePosts.find((item) => item.id === String(postId) && !item.deletedAt);
  if (!row) throw new Error("store post not found");
  if (!canDeleteRow(auth, row.createdBy)) {
    throw new Error("forbidden: only owner or admin can edit this store post");
  }

  const next = normalizeStorePostInput(input, auth);
  Object.assign(row, {
    storeId: next.storeId,
    title: next.title,
    type: next.type,
    content: next.content,
    source: next.source,
    imageData: next.imageData,
    imageUrl: next.imageUrl,
    lastConfirmedAt: next.lastConfirmedAt,
    validFrom: next.validFrom,
    validTo: next.validTo,
    updatedAt: new Date().toISOString()
  });
  writeDb(db);
  return toStorePost(db, row, auth);
}

export function deleteStorePost(postId, auth = {}) {
  const db = readDb();
  ensureDbShape(db);
  const row = db.storePosts.find((item) => item.id === String(postId) && !item.deletedAt);
  if (!row) throw new Error("store post not found");
  if (!canDeleteRow(auth, row.createdBy)) {
    throw new Error("forbidden: only owner or admin can delete this store post");
  }
  row.deletedAt = new Date().toISOString();
  row.updatedAt = row.deletedAt;
  writeDb(db);
  return { id: row.id };
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
    const latestActivityAt = latestActivityForProduct(db, p, records);
    const keywordProducts = db.products.filter((candidate) => matchesCompareKeyword(compareKeywordOf(p), compareKeywordOf(candidate)));
    const sameProductProducts = db.products.filter((candidate) => isSameProductGroup(p, candidate));
    const keywordRecords = db.priceRecords.filter((r) => keywordProducts.some((candidate) => candidate.id === r.productId));
    const sameProductRecords = db.priceRecords.filter((r) => sameProductProducts.some((candidate) => candidate.id === r.productId));
    const keywordLowest = lowestRecord(keywordRecords);
    const sameProductLowest = lowestRecord(sameProductRecords);
    const keywordLowestStore = keywordLowest ? db.stores.find((s) => s.id === keywordLowest.storeId)?.name : null;
    const sameProductLowestStore = sameProductLowest ? db.stores.find((s) => s.id === sameProductLowest.storeId)?.name : null;
    const latestStore = latest ? db.stores.find((s) => s.id === latest.storeId)?.name : null;
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
      latestRecordId: latest?.id ?? null,
      latestPriceTaxIn: latest?.priceTaxIn ?? null,
      latestUnitPrice: latest?.unitPrice ?? null,
      latestUnitPriceLabel: latest?.unitPriceLabel ?? null,
      latestStoreName: latestStore ?? null,
      latestRecordDate: latest?.recordDate ?? null,
      latestActivityAt
    };
  }).sort((a, b) =>
    String(b.latestActivityAt || "").localeCompare(String(a.latestActivityAt || "")) ||
    String(b.latestRecordDate || "").localeCompare(String(a.latestRecordDate || "")) ||
    Number(b.latestRecordId || 0) - Number(a.latestRecordId || 0)
  );
}

export function getProductDetail(productId) {
  const db = readDb();
  const product = db.products.find((p) => p.id === productId);
  if (!product) return null;
  const records = db.priceRecords
    .filter((r) => r.productId === productId)
    .sort((a, b) => b.recordDate.localeCompare(a.recordDate) || a.unitPrice - b.unitPrice)
    .map((r) => {
      const revision = latestBy(db.priceRecordRevisions, (item) => item.priceRecordId === r.id);
      return {
        ...r,
        storeName: db.stores.find((s) => s.id === r.storeId)?.name || "-",
        createdByName: profileFor(db, r.createdBy || "").displayName || r.createdBy || "",
        lastModifiedBy: revision?.modifiedBy || "",
        lastModifiedByName: profileFor(db, revision?.modifiedBy || "").displayName || revision?.modifiedBy || ""
      };
    });
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
  const imageUrls = normalizeImageUrls(input.imageUrls ?? input.imageUrl);
  const imageUrl = serializeImageUrls(imageUrls);

  let productId = input.product?.id ? Number(input.product.id) : null;
  const barcode = String(input.product?.barcode || "").trim();
  const hasBarcodeInput = Boolean(input.product && Object.prototype.hasOwnProperty.call(input.product, "barcode"));
  if (!productId && barcode) {
    const existingProduct = db.products.find((product) => String(product.barcode || "").trim() === barcode);
    if (existingProduct) {
      productId = existingProduct.id;
      if (imageUrls[0] && !existingProduct.defaultImageUrl) {
        existingProduct.defaultImageUrl = imageUrls[0];
        existingProduct.updatedAt = nowDate();
      }
    }
  }
  if (productId) {
    const existingProduct = db.products.find((product) => product.id === productId);
    if (!existingProduct) throw new Error("product not found");
    if (input.product && Object.prototype.hasOwnProperty.call(input.product, "nameZh")) {
      existingProduct.nameZh = String(input.product.nameZh || "").trim();
      existingProduct.updatedAt = nowDate();
    }
    if (input.product && Object.prototype.hasOwnProperty.call(input.product, "nameJa")) {
      existingProduct.nameJa = String(input.product.nameJa || "").trim();
      existingProduct.updatedAt = nowDate();
    }
    if (input.product && Object.prototype.hasOwnProperty.call(input.product, "brand")) {
      existingProduct.brand = String(input.product.brand || "").trim();
      existingProduct.updatedAt = nowDate();
    }
    if (hasBarcodeInput) {
      const duplicate = barcode
        ? db.products.find((product) => product.id !== productId && String(product.barcode || "").trim() === barcode)
        : null;
      if (duplicate) throw new Error("这个条形码已经属于另一个商品");
      existingProduct.barcode = barcode || "";
      existingProduct.updatedAt = nowDate();
    }
    if (imageUrls[0] && !existingProduct.defaultImageUrl) {
      existingProduct.defaultImageUrl = imageUrls[0];
      existingProduct.updatedAt = nowDate();
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
      defaultImageUrl: imageUrls[0] || null,
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
    imageUrl,
    recordDate: input.recordDate,
    note: input.note || null,
    createdBy: getCreatedBy(auth),
    createdAt: nowDate(),
    updatedAt: nowDate()
  };

  const existingRecord = db.priceRecords
    .slice()
    .sort((a, b) => Number(b.id) - Number(a.id))
    .find((record) =>
      Number(record.productId) === Number(row.productId) &&
      Number(record.storeId) === Number(row.storeId) &&
      String(record.recordDate || "") === String(row.recordDate || "")
    );

  if (existingRecord) {
    db.priceRecordRevisions.push({
      id: getNextId(db, "priceRecordRevision"),
      priceRecordId: existingRecord.id,
      snapshot: {
        storeId: existingRecord.storeId,
        priceTaxIn: existingRecord.priceTaxIn,
        priceTaxEx: existingRecord.priceTaxEx,
        taxRate: existingRecord.taxRate,
        specValue: existingRecord.specValue,
        unit: existingRecord.unit,
        unitPrice: existingRecord.unitPrice,
        unitPriceLabel: existingRecord.unitPriceLabel,
        imageUrl: existingRecord.imageUrl || null,
        recordDate: existingRecord.recordDate,
        note: existingRecord.note || null
      },
      modifiedBy: getCreatedBy(auth),
      createdAt: nowDate()
    });
    Object.assign(existingRecord, {
      storeId: row.storeId,
      priceTaxIn: row.priceTaxIn,
      priceTaxEx: row.priceTaxEx,
      taxRate: row.taxRate,
      specValue: row.specValue,
      unit: row.unit,
      unitPrice: row.unitPrice,
      unitPriceLabel: row.unitPriceLabel,
      imageUrl: imageUrls.length ? row.imageUrl : existingRecord.imageUrl,
      recordDate: row.recordDate,
      note: row.note,
      updatedAt: nowDate()
    });
    writeDb(db);
    return toPriceRecord(existingRecord);
  }

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
  const imageInput = input.imageUrls !== undefined ? input.imageUrls : input.imageUrl;
  row.imageUrl = imageInput === undefined ? row.imageUrl : serializeImageUrls(normalizeImageUrls(imageInput));
  row.recordDate = input.recordDate;
  row.note = input.note || null;
  row.updatedAt = nowDate();
  const product = db.products.find((item) => item.id === row.productId);
  if (product) {
    if (input.product && Object.prototype.hasOwnProperty.call(input.product, "nameZh")) {
      product.nameZh = String(input.product.nameZh || "").trim();
    }
    if (input.product && Object.prototype.hasOwnProperty.call(input.product, "nameJa")) {
      product.nameJa = String(input.product.nameJa || "").trim();
    }
    if (input.product && Object.prototype.hasOwnProperty.call(input.product, "brand")) {
      product.brand = String(input.product.brand || "").trim();
    }
    if (input.product && Object.prototype.hasOwnProperty.call(input.product, "barcode")) {
      const barcode = String(input.product.barcode || "").trim();
      const duplicate = barcode
        ? db.products.find((item) => item.id !== product.id && String(item.barcode || "").trim() === barcode)
        : null;
      if (duplicate) throw new Error("这个条形码已经属于另一个商品");
      product.barcode = barcode || "";
    }
    product.defaultImageUrl = parseImageUrls(row.imageUrl)[0] || null;
    product.updatedAt = nowDate();
  }

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
  const imageUrls = parseImageUrls(row.imageUrl);
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
    imageUrl: imageUrls[0] || null,
    imageUrls,
    recordDate: row.recordDate,
    note: row.note || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt || row.createdAt || "",
    createdBy: row.createdBy || "",
    createdByName: row.createdByName || row.createdBy || "",
    lastModifiedBy: row.lastModifiedBy || "",
    lastModifiedByName: row.lastModifiedByName || row.lastModifiedBy || ""
  };
}

function latestActivityForProduct(db, product, records) {
  const recordActivity = records.flatMap((record) => {
    const latestRevision = latestBy(db.priceRecordRevisions, (item) => item.priceRecordId === record.id);
    return [
      record.updatedAt,
      record.createdAt,
      latestRevision?.createdAt
    ].filter(Boolean);
  });
  return [
    product.updatedAt,
    product.createdAt,
    ...recordActivity
  ].filter(Boolean).sort().pop() || "";
}

function normalizeImageUrls(value) {
  const input = Array.isArray(value) ? value : (value ? [value] : []);
  return input.filter(Boolean).slice(0, 4);
}

function parseImageUrls(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [text];
}

function serializeImageUrls(urls) {
  const cleanUrls = (urls || []).filter(Boolean).slice(0, 4);
  if (!cleanUrls.length) return null;
  return cleanUrls.length === 1 ? cleanUrls[0] : JSON.stringify(cleanUrls);
}

function ensureDbShape(db) {
  db.counters ??= {};
  db.counters.storeRevision ??= 1;
  db.counters.priceRecordRevision ??= 1;
  db.counters.feedback ??= 1;
  db.counters.storePost ??= 1;
  db.storeRevisions ??= [];
  db.priceRecordRevisions ??= [];
  db.feedback ??= [];
  db.userProfiles ??= [];
  if (!db.storePosts && Array.isArray(db.deals)) db.storePosts = db.deals;
  db.storePosts ??= [];

  for (const store of db.stores ?? []) {
    store.createdBy ??= "local-import";
  }

  for (const record of db.priceRecords ?? []) {
    record.createdBy ??= "local-import";
  }

  for (const product of db.products ?? []) {
    product.createdBy ??= "local-import";
  }

  for (const post of db.storePosts ?? []) {
    post.id = String(post.id || createStorePostId(db));
    post.storeId = post.storeId == null || post.storeId === "" ? null : Number(post.storeId);
    post.title ??= "";
    post.type ??= "other";
    post.content ??= post.note ?? "";
    post.source ??= "";
    post.imageData ??= "";
    post.imageUrl ??= "";
    post.uploadedAt ??= post.createdAt ?? new Date().toISOString();
    post.lastConfirmedAt ??= "";
    post.validFrom ??= post.startDate ?? "";
    post.validTo ??= post.endDate ?? "";
    post.createdBy ??= "local-import";
    post.createdAt ??= post.uploadedAt;
    post.updatedAt ??= post.createdAt;
    post.deletedAt ??= null;
  }
}

function profileFor(db, email) {
  const normalized = String(email || "").trim().toLowerCase();
  return db.userProfiles.find((item) => item.email === normalized) || { email: normalized, displayName: "" };
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

function createStorePostId(db) {
  const id = db?.counters?.storePost ?? 1;
  if (db?.counters) db.counters.storePost = id + 1;
  return `store_post_${id}`;
}

function normalizeStorePostInput(input, auth = {}) {
  const title = String(input.title || "").trim();
  const type = String(input.type || "").trim();
  const storeId = normalizeNullableNumber(input.storeId);
  if (!title) throw new Error("title is required");
  if (!type) throw new Error("type is required");
  if (storeId == null) throw new Error("storeId is required");
  return {
    storeId,
    title,
    type,
    content: clean(input.content),
    source: clean(input.source),
    imageData: cleanImageData(input.imageData),
    imageUrl: clean(input.imageUrl),
    lastConfirmedAt: clean(input.lastConfirmedAt),
    validFrom: clean(input.validFrom),
    validTo: clean(input.validTo),
    createdBy: getCreatedBy(auth)
  };
}

function toStorePost(db, row, auth = {}) {
  const store = row.storeId == null ? null : db.stores.find((item) => Number(item.id) === Number(row.storeId));
  const profile = profileFor(db, row.createdBy || "");
  return {
    id: row.id,
    storeId: row.storeId,
    title: row.title,
    type: row.type,
    content: row.content || "",
    source: row.source || "",
    imageData: row.imageData || "",
    imageUrl: row.imageUrl || "",
    uploadedAt: row.uploadedAt || row.createdAt || "",
    lastConfirmedAt: row.lastConfirmedAt || "",
    validFrom: row.validFrom || "",
    validTo: row.validTo || "",
    createdBy: row.createdBy || "",
    createdByName: profile.displayName || row.createdBy || "",
    createdAt: row.createdAt || "",
    updatedAt: row.updatedAt || row.createdAt || "",
    deletedAt: row.deletedAt || null,
    storeName: store?.name || "",
    canEdit: canDeleteRow(auth, row.createdBy),
    canDelete: canDeleteRow(auth, row.createdBy),
    currentUser: auth?.email || "",
    isAdmin: Boolean(auth?.isAdmin)
  };
}

function normalizeNullableNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("storeId must be a number");
  return number;
}

function clean(value) {
  return String(value ?? "").trim();
}

function cleanImageData(value) {
  const text = clean(value);
  if (!text) return "";
  if (!text.startsWith("data:image/")) {
    throw new Error("imageData must be a data URL");
  }
  return text;
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
