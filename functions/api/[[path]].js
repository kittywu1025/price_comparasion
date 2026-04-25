import { buildPriceRecordPayload } from "../../src/core/price-record-service.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8"
};

export async function onRequest(context) {
  const { request, env } = context;
  const route = getRoute(context.params?.path);

  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (request.method === "GET" && route[0] === "health") {
      return json({ ok: true, runtime: "cloudflare-pages", loginEnabled: true });
    }

    if (request.method === "GET" && route[0] === "images") {
      return getImage(env, route.slice(1));
    }

    if (!env.DB) {
      return json({ error: "Cloudflare D1 binding DB is missing" }, 500);
    }

    if (route[0] === "categories") {
      return handleCategories(request, env);
    }

    if (route[0] === "stores") {
      return handleStores(request, env, route);
    }

    if (route[0] === "products") {
      return handleProducts(request, env, route);
    }

    if (route[0] === "price-records") {
      return handlePriceRecords(request, env, route);
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json({ error: error.message || "Bad request" }, 400);
  }
}

function getRoute(pathParam) {
  if (!pathParam) return [];
  if (Array.isArray(pathParam)) return pathParam.filter(Boolean);
  return [pathParam].filter(Boolean);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function all(env, sql, params = []) {
  const result = await env.DB.prepare(sql).bind(...params).all();
  return result.results || [];
}

async function first(env, sql, params = []) {
  return env.DB.prepare(sql).bind(...params).first();
}

async function run(env, sql, params = []) {
  return env.DB.prepare(sql).bind(...params).run();
}

async function handleCategories(request, env) {
  if (request.method === "GET") {
    const rows = await all(env, "select id, name from categories order by name");
    return json(rows.map((row) => ({ id: row.id, name: row.name })));
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    const name = body.name?.trim();
    if (!name) return json({ error: "name is required" }, 400);
    const result = await run(env, "insert into categories (name) values (?)", [name]);
    const row = await first(env, "select id, name from categories where id = ?", [result.meta.last_row_id]);
    return json({ id: row.id, name: row.name }, 201);
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handleStores(request, env, route) {
  const storeId = route[1] ? Number(route[1]) : null;

  if (request.method === "GET" && !storeId) {
    const rows = await all(env, "select * from stores order by id desc");
    return json(rows.map(toStore));
  }

  if (request.method === "POST" && !storeId) {
    const body = await readJson(request);
    const name = body.name?.trim();
    if (!name) return json({ error: "name is required" }, 400);
    const result = await run(
      env,
      "insert into stores (name, chain_brand, location, note) values (?, ?, ?, ?)",
      [name, clean(body.chainBrand), clean(body.location), clean(body.note)]
    );
    const row = await first(env, "select * from stores where id = ?", [result.meta.last_row_id]);
    return json(toStore(row), 201);
  }

  if (!storeId || !Number.isFinite(storeId)) {
    return json({ error: "invalid store id" }, 400);
  }

  if (request.method === "PUT") {
    const body = await readJson(request);
    const name = body.name?.trim();
    if (!name) return json({ error: "name is required" }, 400);

    const existing = await first(env, "select id from stores where id = ?", [storeId]);
    if (!existing) return json({ error: "store not found" }, 404);

    await run(
      env,
      "update stores set name = ?, chain_brand = ?, location = ?, note = ?, updated_at = datetime('now') where id = ?",
      [name, clean(body.chainBrand), clean(body.location), clean(body.note), storeId]
    );
    const row = await first(env, "select * from stores where id = ?", [storeId]);
    return json(toStore(row));
  }

  if (request.method === "DELETE") {
    const inUse = await first(env, "select count(*) as count from price_records where store_id = ?", [storeId]);
    if (Number(inUse?.count || 0) > 0) {
      throw new Error("store has related price records");
    }

    const result = await run(env, "delete from stores where id = ?", [storeId]);
    if (!result.meta.changes) return json({ error: "store not found" }, 404);
    return json({ id: storeId });
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handleProducts(request, env, route) {
  const productId = route[1] ? Number(route[1]) : null;

  if (request.method === "GET" && !productId) {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const categoryId = url.searchParams.get("categoryId");
    const storeId = url.searchParams.get("storeId");
    return json(await listProducts(env, { q, categoryId, storeId }));
  }

  if (request.method === "GET" && productId && Number.isFinite(productId)) {
    const detail = await getProductDetail(env, productId);
    if (!detail) return json({ error: "product not found" }, 404);
    return json(detail);
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handlePriceRecords(request, env, route) {
  const recordId = route[1] ? Number(route[1]) : null;

  if (request.method === "POST" && !recordId) {
    const body = await readJson(request);
    if (!body.product?.id && !body.product?.nameZh && !body.product?.nameJa) {
      return json({ error: "product.nameZh or product.nameJa is required for new product" }, 400);
    }
    const created = await createPriceRecord(env, body);
    return json(created, 201);
  }

  if (request.method === "PUT" && recordId && Number.isFinite(recordId)) {
    const body = await readJson(request);
    const updated = await updatePriceRecord(env, recordId, body);
    return json(updated);
  }

  return json({ error: "Method not allowed" }, 405);
}

async function listProducts(env, { q = "", categoryId, storeId } = {}) {
  let products = await all(env, "select * from products order by id");
  const records = await all(env, "select * from price_records");
  const stores = await all(env, "select id, name from stores");

  if (q) {
    products = products.filter((p) =>
      [p.name_zh, p.name_ja, p.brand, p.barcode].some((x) => String(x || "").toLowerCase().includes(q))
    );
  }

  if (categoryId) {
    products = products.filter((p) => String(p.category_id) === String(categoryId));
  }

  if (storeId) {
    const ids = new Set(records.filter((r) => String(r.store_id) === String(storeId)).map((r) => r.product_id));
    products = products.filter((p) => ids.has(p.id));
  }

  return products
    .map((product) => {
      const productRecords = records.filter((r) => r.product_id === product.id);
      const lowest = productRecords.slice().sort((a, b) =>
        Number(a.unit_price) - Number(b.unit_price) || String(b.record_date || "").localeCompare(String(a.record_date || ""))
      )[0];
      const latest = productRecords.slice().sort((a, b) =>
        String(b.record_date || "").localeCompare(String(a.record_date || "")) || Number(b.id) - Number(a.id)
      )[0];
      const lowestStore = lowest ? stores.find((s) => s.id === lowest.store_id)?.name : null;

      return {
        productId: product.id,
        nameZh: product.name_zh,
        nameJa: product.name_ja,
        brand: product.brand,
        defaultImageUrl: product.default_image_url,
        lowestUnitPrice: lowest?.unit_price ?? null,
        lowestUnitPriceLabel: lowest?.unit_price_label ?? null,
        lowestStoreName: lowestStore ?? null,
        latestPriceTaxIn: latest?.price_tax_in ?? null,
        latestRecordDate: latest?.record_date ?? null
      };
    })
    .sort((a, b) => String(b.latestRecordDate || "").localeCompare(String(a.latestRecordDate || "")));
}

async function getProductDetail(env, productId) {
  const product = await first(
    env,
    `select p.*, c.name as category_name
     from products p
     left join categories c on c.id = p.category_id
     where p.id = ?`,
    [productId]
  );
  if (!product) return null;

  const records = await all(
    env,
    `select pr.*, s.name as store_name
     from price_records pr
     left join stores s on s.id = pr.store_id
     where pr.product_id = ?
     order by pr.record_date desc, pr.unit_price asc, pr.id desc`,
    [productId]
  );
  const mappedRecords = records.map(toPriceRecord);

  return {
    product: {
      id: product.id,
      nameZh: product.name_zh,
      nameJa: product.name_ja,
      brand: product.brand,
      barcode: product.barcode,
      categoryName: product.category_name || null,
      defaultImageUrl: product.default_image_url
    },
    overview: {
      lowestUnitPrice: mappedRecords.length ? Math.min(...mappedRecords.map((r) => Number(r.unitPrice))) : null,
      lowestTotalPrice: mappedRecords.length ? Math.min(...mappedRecords.map((r) => Number(r.priceTaxIn))) : null,
      lastUpdatedAt: mappedRecords[0]?.recordDate ?? null,
      recordCount: mappedRecords.length
    },
    records: mappedRecords
  };
}

async function createPriceRecord(env, input) {
  const imageUrl = await normalizeImageUrl(env, input.imageUrl);
  const productId = await resolveProductId(env, input.product, imageUrl);
  const payload = buildPriceRecordPayload({
    productId,
    storeId: input.storeId,
    priceTaxIn: input.priceTaxIn,
    priceTaxEx: input.priceTaxEx,
    taxRate: input.taxRate,
    specValue: input.specValue,
    unit: input.unit,
    imageUrl,
    recordDate: input.recordDate,
    note: input.note,
    createdBy: getCreatedBy()
  });

  const result = await run(
    env,
    `insert into price_records
      (product_id, store_id, price_tax_in, price_tax_ex, tax_rate, spec_value, unit, unit_price, unit_price_label, image_url, record_date, note, created_by)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.productId,
      Number(payload.storeId),
      payload.priceTaxIn,
      payload.priceTaxEx,
      payload.taxRate,
      payload.specValue,
      payload.unit,
      payload.unitPrice,
      payload.unitPriceLabel,
      payload.imageUrl,
      payload.recordDate,
      payload.note,
      payload.createdBy
    ]
  );

  const row = await first(env, "select * from price_records where id = ?", [result.meta.last_row_id]);
  return toPriceRecord(row);
}

async function updatePriceRecord(env, recordId, input) {
  const existing = await first(env, "select * from price_records where id = ?", [recordId]);
  if (!existing) throw new Error("price record not found");

  const imageUrl = input.imageUrl === undefined ? existing.image_url : await normalizeImageUrl(env, input.imageUrl);
  const payload = buildPriceRecordPayload({
    productId: input.productId || existing.product_id,
    storeId: input.storeId,
    priceTaxIn: input.priceTaxIn,
    priceTaxEx: input.priceTaxEx,
    taxRate: input.taxRate,
    specValue: input.specValue,
    unit: input.unit,
    imageUrl,
    recordDate: input.recordDate,
    note: input.note,
    createdBy: existing.created_by || getCreatedBy()
  });

  await run(
    env,
    `update price_records
     set store_id = ?, price_tax_in = ?, price_tax_ex = ?, tax_rate = ?, spec_value = ?, unit = ?,
         unit_price = ?, unit_price_label = ?, image_url = ?, record_date = ?, note = ?, updated_at = datetime('now')
     where id = ?`,
    [
      Number(payload.storeId),
      payload.priceTaxIn,
      payload.priceTaxEx,
      payload.taxRate,
      payload.specValue,
      payload.unit,
      payload.unitPrice,
      payload.unitPriceLabel,
      payload.imageUrl,
      payload.recordDate,
      payload.note,
      recordId
    ]
  );

  const row = await first(env, "select * from price_records where id = ?", [recordId]);
  return toPriceRecord(row);
}

async function resolveProductId(env, productInput = {}, imageUrl = null) {
  if (productInput.id) {
    const product = await first(env, "select id, default_image_url from products where id = ?", [Number(productInput.id)]);
    if (!product) throw new Error("product not found");
    if (imageUrl && !product.default_image_url) {
      await run(env, "update products set default_image_url = ?, updated_at = datetime('now') where id = ?", [imageUrl, product.id]);
    }
    return product.id;
  }

  const barcode = clean(productInput.barcode);
  if (barcode) {
    const existing = await first(env, "select id, default_image_url from products where barcode = ?", [barcode]);
    if (existing) {
      if (imageUrl && !existing.default_image_url) {
        await run(env, "update products set default_image_url = ?, updated_at = datetime('now') where id = ?", [imageUrl, existing.id]);
      }
      return existing.id;
    }
  }

  const nameZh = clean(productInput.nameZh);
  const nameJa = clean(productInput.nameJa);
  if (!nameZh && !nameJa) throw new Error("product.nameZh or product.nameJa is required for new product");

  const result = await run(
    env,
    `insert into products (name_zh, name_ja, brand, barcode, category_id, default_image_url, created_by)
     values (?, ?, ?, ?, ?, ?, ?)`,
    [
      nameZh,
      nameJa,
      clean(productInput.brand),
      barcode,
      productInput.categoryId ? Number(productInput.categoryId) : null,
      imageUrl,
      getCreatedBy()
    ]
  );
  return result.meta.last_row_id;
}

async function normalizeImageUrl(env, imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  if (!imageUrl.startsWith("data:image/")) return imageUrl;
  if (!env.IMAGES) throw new Error("Cloudflare R2 binding IMAGES is missing");

  const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("invalid image data url");

  const mimeType = match[1];
  const bytes = base64ToBytes(match[2]);
  const key = `products/${crypto.randomUUID()}.${imageExtension(mimeType)}`;

  await env.IMAGES.put(key, bytes, {
    httpMetadata: { contentType: mimeType }
  });

  return `/api/images/${key}`;
}

async function getImage(env, keyParts) {
  if (!env.IMAGES) return json({ error: "Cloudflare R2 binding IMAGES is missing" }, 500);
  const key = keyParts.join("/");
  if (!key) return json({ error: "image key is required" }, 400);

  const object = await env.IMAGES.get(key);
  if (!object) return json({ error: "image not found" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function imageExtension(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

function clean(value) {
  return String(value ?? "").trim();
}

function getCreatedBy() {
  return "cloudflare-access";
}

function toStore(row) {
  return {
    id: row.id,
    name: row.name,
    chainBrand: row.chain_brand || "",
    location: row.location || "",
    note: row.note || ""
  };
}

function toPriceRecord(row) {
  return {
    id: row.id,
    productId: row.product_id,
    storeId: row.store_id,
    priceTaxIn: row.price_tax_in == null ? null : Number(row.price_tax_in),
    priceTaxEx: row.price_tax_ex == null ? null : Number(row.price_tax_ex),
    taxRate: row.tax_rate == null ? null : Number(row.tax_rate),
    specValue: row.spec_value == null ? null : Number(row.spec_value),
    unit: row.unit,
    unitPrice: row.unit_price == null ? null : Number(row.unit_price),
    unitPriceLabel: row.unit_price_label,
    imageUrl: row.image_url || null,
    recordDate: row.record_date,
    note: row.note || null,
    createdAt: row.created_at,
    storeName: row.store_name || "-"
  };
}
