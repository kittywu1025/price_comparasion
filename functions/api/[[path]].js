import { buildPriceRecordPayload } from "../../src/core/price-record-service.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8"
};

export async function onRequest(context) {
  const { request, env } = context;
  const route = getRoute(context.params?.path);
  const auth = await getAuth(request, env);

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

    if (requiresAccess(route, request) && !hasAccessSession(request)) {
      return json({ error: "login required" }, 401);
    }

    if (route[0] === "categories") {
      return handleCategories(request, env, auth);
    }

    if (route[0] === "auth") {
      return handleAuth(request);
    }

    if (route[0] === "stores") {
      return handleStores(request, env, route, auth);
    }

    if (route[0] === "me") {
      return handleMe(request, env, route, auth);
    }

    if (route[0] === "feedback") {
      return handleFeedback(request, env, auth);
    }

    if (route[0] === "products") {
      return handleProducts(request, env, route, auth);
    }

    if (route[0] === "price-records") {
      return handlePriceRecords(request, env, route, auth);
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json({ error: error.message || "Bad request" }, 400);
  }
}

function requiresAccess(route, request) {
  const area = route[0];
  if (area === "auth") return true;
  if (area === "me") return true;
  if (area === "feedback") return true;
  if (area === "stores") return request.method !== "GET";
  if (area === "price-records" || area === "categories") return true;
  return request.method !== "GET";
}

function hasAccessSession(request) {
  return Boolean(request.headers.get("cf-access-authenticated-user-email") || getAccessJwt(request));
}

async function getAuth(request, env) {
  const email = String(
    request.headers.get("cf-access-authenticated-user-email") ||
    emailFromAccessJwt(getAccessJwt(request)) ||
    ""
  ).trim().toLowerCase();
  const adminEmails = String(env.ACCESS_ADMIN_EMAILS || env.ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const adminEmailHashes = String(env.ACCESS_ADMIN_EMAIL_HASHES || env.ADMIN_EMAIL_HASHES || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const emailHash = email ? await sha256Hex(email) : "";

  return {
    email,
    isAdmin: Boolean(email && (adminEmails.includes(email) || adminEmailHashes.includes(emailHash)))
  };
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getAccessJwt(request) {
  return request.headers.get("cf-access-jwt-assertion") || cookieValue(request, "CF_Authorization");
}

function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

function emailFromAccessJwt(token) {
  if (!token) return "";
  try {
    const payload = token.split(".")[1];
    if (!payload) return "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const jsonText = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const data = JSON.parse(jsonText);
    return data.email || data.sub || "";
  } catch {
    return "";
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

async function ensureFeedbackTable(env) {
  await run(
    env,
    `create table if not exists feedback (
      id integer primary key autoincrement,
      message text not null,
      created_by text not null default '',
      created_at text not null default (datetime('now'))
    )`
  );
  await run(env, "create index if not exists idx_feedback_created_at on feedback(created_at desc)");
}

async function ensureUserProfilesTable(env) {
  await run(
    env,
    `create table if not exists user_profiles (
      email text primary key,
      display_name text not null default '',
      updated_at text not null default (datetime('now'))
    )`
  );
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

function handleAuth(request) {
  const url = new URL(request.url);
  const rawReturnTo = url.searchParams.get("return") || "/products";
  const returnTo = rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : "/products";
  return Response.redirect(new URL(returnTo, url.origin).href, 302);
}

async function handleStores(request, env, route, auth) {
  const storeId = route[1] ? Number(route[1]) : null;
  const hasOwnership = await storesHaveOwnership(env);
  const isUndoRoute = route[2] === "undo";

  if (request.method === "GET" && !storeId) {
    const rows = await all(
      env,
      hasOwnership ? "select * from stores order by id desc" : "select *, '' as created_by from stores order by id desc"
    );
    return json(rows.map((row) => toStore(row, auth)));
  }

  if (request.method === "POST" && !storeId) {
    const body = await readJson(request);
    const name = body.name?.trim();
    if (!name) return json({ error: "name is required" }, 400);
    const result = hasOwnership
      ? await run(
        env,
        "insert into stores (name, chain_brand, location, note, created_by) values (?, ?, ?, ?, ?)",
        [name, clean(body.chainBrand), clean(body.location), clean(body.note), auth.email]
      )
      : await run(
        env,
        "insert into stores (name, chain_brand, location, note) values (?, ?, ?, ?)",
        [name, clean(body.chainBrand), clean(body.location), clean(body.note)]
      );
    const row = await first(env, "select * from stores where id = ?", [result.meta.last_row_id]);
    return json(toStore(row, auth), 201);
  }

  if (!storeId || !Number.isFinite(storeId)) {
    return json({ error: "invalid store id" }, 400);
  }

  if (request.method === "POST" && isUndoRoute) {
    const undone = await undoStoreRevision(env, storeId, auth, hasOwnership);
    return json(undone);
  }

  if (request.method === "PUT") {
    const body = await readJson(request);
    const name = body.name?.trim();
    if (!name) return json({ error: "name is required" }, 400);

    const existing = await first(
      env,
      hasOwnership ? "select * from stores where id = ?" : "select *, '' as created_by from stores where id = ?",
      [storeId]
    );
    if (!existing) return json({ error: "store not found" }, 404);
    await snapshotStoreRevision(env, existing, auth);

    await run(
      env,
      "update stores set name = ?, chain_brand = ?, location = ?, note = ?, updated_at = datetime('now') where id = ?",
      [name, clean(body.chainBrand), clean(body.location), clean(body.note), storeId]
    );
    const row = await first(env, "select * from stores where id = ?", [storeId]);
    return json(toStore(row, auth));
  }

  if (request.method === "DELETE") {
    const existing = await first(
      env,
      hasOwnership ? "select id, created_by from stores where id = ?" : "select id, '' as created_by from stores where id = ?",
      [storeId]
    );
    if (!existing) return json({ error: "store not found" }, 404);
    if (!canDeleteRow(auth, existing.created_by)) {
      return json({ error: "forbidden: only owner or admin can delete this store" }, 403);
    }

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

async function handleProducts(request, env, route, auth) {
  const productId = route[1] ? Number(route[1]) : null;

  if (request.method === "GET" && !productId) {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const scope = (url.searchParams.get("scope") || "all").trim().toLowerCase();
    const categoryId = url.searchParams.get("categoryId");
    const storeId = url.searchParams.get("storeId");
    return json(await listProducts(env, { q, scope, categoryId, storeId }));
  }

  if (request.method === "GET" && productId && Number.isFinite(productId)) {
    const detail = await getProductDetail(env, productId);
    if (!detail) return json({ error: "product not found" }, 404);
    return json(detail);
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handleMe(request, env, route, auth) {
  if (route[1] === "profile") {
    await ensureUserProfilesTable(env);
    if (request.method === "GET") {
      const profile = await first(env, "select email, display_name from user_profiles where email = ?", [auth.email || ""]);
      return json({
        email: auth.email || "未登录",
        displayName: profile?.display_name || "",
        isAdmin: Boolean(auth.isAdmin)
      });
    }
    if (request.method === "PUT") {
      const body = await readJson(request);
      const displayName = String(body.displayName || "").trim().slice(0, 40);
      await run(
        env,
        `insert into user_profiles (email, display_name, updated_at)
         values (?, ?, datetime('now'))
         on conflict(email) do update set display_name = excluded.display_name, updated_at = datetime('now')`,
        [auth.email || "", displayName]
      );
      return json({
        email: auth.email || "未登录",
        displayName,
        isAdmin: Boolean(auth.isAdmin)
      });
    }
    return json({ error: "Method not allowed" }, 405);
  }

  if (request.method !== "GET" || route[1] !== "stats") {
    return json({ error: "Not found" }, 404);
  }

  await ensureUserProfilesTable(env);
  const email = auth.email || "";
  const profile = email ? await first(env, "select display_name from user_profiles where email = ?", [email]) : null;
  const [
    totalRecords,
    totalProducts,
    totalStores,
    myRecords,
    myProducts,
    myStores,
    myRecordEdits,
    myStoreEdits,
    lastContribution
  ] = await Promise.all([
    first(env, "select count(*) as count from price_records"),
    first(env, "select count(*) as count from products"),
    first(env, "select count(*) as count from stores"),
    email ? first(env, "select count(*) as count from price_records where lower(created_by) = ?", [email]) : { count: 0 },
    email ? first(env, "select count(*) as count from products where lower(created_by) = ?", [email]) : { count: 0 },
    email ? first(env, "select count(*) as count from stores where lower(created_by) = ?", [email]) : { count: 0 },
    email ? first(env, "select count(*) as count from price_record_revisions where lower(modified_by) = ?", [email]) : { count: 0 },
    email ? first(env, "select count(*) as count from store_revisions where lower(modified_by) = ?", [email]) : { count: 0 },
    email
      ? first(env, "select max(record_date) as date from price_records where lower(created_by) = ?", [email])
      : { date: null }
  ]);

  return json({
    user: {
      email: email || "未登录",
      displayName: profile?.display_name || "",
      isAdmin: Boolean(auth.isAdmin)
    },
    mine: {
      priceRecords: Number(myRecords?.count || 0),
      products: Number(myProducts?.count || 0),
      stores: Number(myStores?.count || 0),
      edits: Number(myRecordEdits?.count || 0) + Number(myStoreEdits?.count || 0)
    },
    totals: {
      priceRecords: Number(totalRecords?.count || 0),
      products: Number(totalProducts?.count || 0),
      stores: Number(totalStores?.count || 0)
    },
    lastContributionDate: lastContribution?.date || null
  });
}

async function handleFeedback(request, env, auth) {
  await ensureFeedbackTable(env);
  await ensureUserProfilesTable(env);

  if (request.method === "GET") {
    if (!auth.isAdmin) return json({ error: "forbidden: admin only" }, 403);
    const rows = await all(
      env,
      `select f.id, f.message, f.created_by, f.created_at, up.display_name as created_by_name
       from feedback f
       left join user_profiles up on up.email = lower(f.created_by)
       order by f.created_at desc, f.id desc
       limit 100`
    );
    return json(rows.map((row) => ({
      id: row.id,
      message: row.message,
      createdBy: row.created_by || "",
      createdByName: row.created_by_name || row.created_by || "",
      createdAt: row.created_at || ""
    })));
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    const message = String(body.message || "").trim();
    if (!message) return json({ error: "message is required" }, 400);
    const result = await run(
      env,
      "insert into feedback (message, created_by) values (?, ?)",
      [message, auth.email || ""]
    );
    const row = await first(env, "select id, message, created_by, created_at from feedback where id = ?", [result.meta.last_row_id]);
    return json({
      id: row.id,
      message: row.message,
      createdBy: row.created_by || "",
      createdAt: row.created_at || ""
    }, 201);
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handlePriceRecords(request, env, route, auth) {
  const recordId = route[1] ? Number(route[1]) : null;
  const isUndoRoute = route[2] === "undo";

  if (request.method === "POST" && !recordId) {
    const body = await readJson(request);
    if (!body.product?.id && !body.product?.nameZh && !body.product?.nameJa) {
      return json({ error: "product.nameZh or product.nameJa is required for new product" }, 400);
    }
    const created = await createPriceRecord(env, body, auth);
    return json(created, 201);
  }

  if (request.method === "GET" && recordId && Number.isFinite(recordId)) {
    const row = await first(env, "select * from price_records where id = ?", [recordId]);
    if (!row) return json({ error: "price record not found" }, 404);
    const latestRevision = await first(
      env,
      "select modified_by from price_record_revisions where price_record_id = ? order by id desc limit 1",
      [recordId]
    );
    return json({
      id: row.id,
      canDelete: canDeleteRow(auth, row.created_by),
      canUndo: canUndoLatestRevision(auth, latestRevision?.modified_by),
      createdBy: row.created_by || "",
      currentUser: auth.email || "",
      isAdmin: Boolean(auth.isAdmin)
    });
  }

  if (request.method === "POST" && recordId && Number.isFinite(recordId) && isUndoRoute) {
    const undone = await undoPriceRecordRevision(env, recordId, auth);
    return json(undone);
  }

  if (request.method === "PUT" && recordId && Number.isFinite(recordId)) {
    const body = await readJson(request);
    const updated = await updatePriceRecord(env, recordId, body, auth);
    return json(updated);
  }

  if (request.method === "DELETE" && recordId && Number.isFinite(recordId)) {
    const existing = await first(env, "select id, created_by from price_records where id = ?", [recordId]);
    if (!existing) return json({ error: "price record not found" }, 404);
    if (!canDeleteRow(auth, existing.created_by)) {
      return json({ error: "forbidden: only owner or admin can delete this record" }, 403);
    }
    await run(env, "delete from price_records where id = ?", [recordId]);
    return json({ id: recordId });
  }

  return json({ error: "Method not allowed" }, 405);
}

async function listProducts(env, { q = "", scope = "all", categoryId, storeId } = {}) {
  let products = await all(env, "select * from products order by id");
  const records = await all(env, "select * from price_records");
  const stores = await all(env, "select id, name from stores");

  if (q) {
    const storeIds = new Set(
      stores
        .filter((store) => String(store.name || "").toLowerCase().includes(q))
        .map((store) => store.id)
    );
    const productIdsByStoreName = new Set(
      records.filter((record) => storeIds.has(record.store_id)).map((record) => record.product_id)
    );
    products = products.filter((p) => {
      const productMatch = [p.name_zh, p.name_ja, p.brand, p.barcode]
        .some((x) => String(x || "").toLowerCase().includes(q));
      if (scope === "name") return productMatch;
      if (scope === "store") return productIdsByStoreName.has(p.id);
      return productMatch || productIdsByStoreName.has(p.id);
    });
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
      const latest = productRecords.slice().sort((a, b) =>
        String(b.record_date || "").localeCompare(String(a.record_date || "")) || Number(b.id) - Number(a.id)
      )[0];
      const keywordProducts = products.filter((candidate) =>
        matchesCompareKeyword(compareKeywordOfProduct(product), compareKeywordOfProduct(candidate))
      );
      const sameProductProducts = products.filter((candidate) => isSameProductGroup(product, candidate));
      const keywordRecords = records.filter((r) => keywordProducts.some((candidate) => candidate.id === r.product_id));
      const sameProductRecords = records.filter((r) => sameProductProducts.some((candidate) => candidate.id === r.product_id));
      const keywordLowest = lowestRecord(keywordRecords);
      const sameProductLowest = lowestRecord(sameProductRecords);
      const keywordLowestStore = keywordLowest ? stores.find((s) => s.id === keywordLowest.store_id)?.name : null;
      const sameProductLowestStore = sameProductLowest ? stores.find((s) => s.id === sameProductLowest.store_id)?.name : null;
      const latestStore = latest ? stores.find((s) => s.id === latest.store_id)?.name : null;

      return {
        productId: product.id,
        nameZh: product.name_zh,
        nameJa: product.name_ja,
        brand: product.brand,
        barcode: product.barcode,
        defaultImageUrl: product.default_image_url,
        isKeywordBest: Boolean(keywordLowest && keywordLowest.product_id === product.id),
        isSameProductBest: Boolean(sameProductLowest && sameProductLowest.product_id === product.id),
        latestIsPromo: isPromoActive(latest?.note),
        lowestUnitPrice: keywordLowest?.unit_price ?? null,
        lowestUnitPriceLabel: keywordLowest?.unit_price_label ?? null,
        lowestStoreName: keywordLowestStore ?? null,
        sameProductLowestUnitPrice: sameProductLowest?.unit_price ?? null,
        sameProductLowestUnitPriceLabel: sameProductLowest?.unit_price_label ?? null,
        sameProductLowestStoreName: sameProductLowestStore ?? null,
        latestPriceTaxIn: latest?.price_tax_in ?? null,
        latestUnitPrice: latest?.unit_price ?? null,
        latestUnitPriceLabel: latest?.unit_price_label ?? null,
        latestStoreName: latestStore ?? null,
        latestRecordDate: latest?.record_date ?? null
      };
    })
    .sort((a, b) => String(b.latestRecordDate || "").localeCompare(String(a.latestRecordDate || "")));
}

async function getProductDetail(env, productId) {
  await ensureUserProfilesTable(env);
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
    `select pr.*, s.name as store_name,
       prr.modified_by as last_modified_by,
       cup.display_name as created_by_name,
       mup.display_name as last_modified_by_name
     from price_records pr
     left join stores s on s.id = pr.store_id
     left join (
       select price_record_id, max(id) as max_id
       from price_record_revisions
       group by price_record_id
     ) latest_revision on latest_revision.price_record_id = pr.id
     left join price_record_revisions prr on prr.id = latest_revision.max_id
     left join user_profiles cup on cup.email = lower(pr.created_by)
     left join user_profiles mup on mup.email = lower(prr.modified_by)
     where pr.product_id = ?
     order by pr.record_date desc, pr.unit_price asc, pr.id desc`,
    [productId]
  );
  const mappedRecords = records.map(toPriceRecord);
  const allProducts = await all(env, "select id, name_zh, name_ja, barcode from products order by id");
  const allRecords = await all(env, "select * from price_records");
  const stores = await all(env, "select id, name from stores");
  const keywordProducts = allProducts.filter((candidate) =>
    matchesCompareKeyword(compareKeywordOfProduct(product), compareKeywordOfProduct(candidate))
  );
  const sameProductProducts = allProducts.filter((candidate) => isSameProductGroup(product, candidate));
  const keywordRecords = allRecords.filter((r) => keywordProducts.some((candidate) => candidate.id === r.product_id));
  const sameProductRecords = allRecords.filter((r) => sameProductProducts.some((candidate) => candidate.id === r.product_id));
  const keywordLowest = lowestRecord(keywordRecords);
  const sameProductLowest = lowestRecord(sameProductRecords);

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
      keywordLowestUnitPrice: keywordLowest?.unit_price ?? null,
      keywordLowestUnitPriceLabel: keywordLowest?.unit_price_label ?? null,
      keywordLowestStoreName: keywordLowest ? stores.find((s) => s.id === keywordLowest.store_id)?.name || "-" : null,
      sameProductLowestUnitPrice: sameProductLowest?.unit_price ?? null,
      sameProductLowestUnitPriceLabel: sameProductLowest?.unit_price_label ?? null,
      sameProductLowestStoreName: sameProductLowest ? stores.find((s) => s.id === sameProductLowest.store_id)?.name || "-" : null,
      lastUpdatedAt: mappedRecords[0]?.recordDate ?? null,
      recordCount: mappedRecords.length
    },
    records: mappedRecords
  };
}

async function createPriceRecord(env, input, auth) {
  const imageUrls = await normalizeImageUrls(env, input.imageUrls ?? input.imageUrl);
  const imageUrl = serializeImageUrls(imageUrls);
  const productId = await resolveProductId(env, input.product, imageUrls[0] || null, auth);
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
    createdBy: getCreatedBy(auth)
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

async function updatePriceRecord(env, recordId, input, auth) {
  const existing = await first(env, "select * from price_records where id = ?", [recordId]);
  if (!existing) throw new Error("price record not found");
  await snapshotPriceRecordRevision(env, existing, auth);

  const imageValue = input.imageUrls !== undefined ? input.imageUrls : input.imageUrl;
  const imageUrls = imageValue === undefined ? parseImageUrls(existing.image_url) : await normalizeImageUrls(env, imageValue);
  const imageUrl = serializeImageUrls(imageUrls);
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
    createdBy: existing.created_by || getCreatedBy(auth)
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
  await run(env, "update products set default_image_url = ?, updated_at = datetime('now') where id = ?", [imageUrls[0] || null, payload.productId]);

  const row = await first(env, "select * from price_records where id = ?", [recordId]);
  return toPriceRecord(row);
}

async function resolveProductId(env, productInput = {}, imageUrl = null, auth) {
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
      getCreatedBy(auth)
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
  if (bytes.byteLength > 900 * 1024) {
    throw new Error("图片太大，请压缩到 900KB 以下再上传");
  }
  const key = `products/${crypto.randomUUID()}.${imageExtension(mimeType)}`;

  await env.IMAGES.put(key, bytes, {
    httpMetadata: { contentType: mimeType }
  });

  return `/api/images/${key}`;
}

async function normalizeImageUrls(env, value) {
  const input = Array.isArray(value) ? value : (value ? [value] : []);
  const urls = [];
  for (const item of input.filter(Boolean).slice(0, 4)) {
    const normalized = await normalizeImageUrl(env, item);
    if (normalized) urls.push(normalized);
  }
  return urls;
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

function getCreatedBy(auth) {
  return auth?.email || "cloudflare-access";
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
  return String(meta.until) >= new Date().toISOString().slice(0, 10);
}

function parsePromoNote(note) {
  const text = String(note || "");
  const match = text.match(/^\[\[promo(?::(\d{4}-\d{2}-\d{2}))?\]\]\s*/i);
  if (!match) return { isPromo: false, until: null };
  return { isPromo: true, until: match[1] || null };
}

function compareKeywordOfProduct(product) {
  return normalizeCompareText(product?.name_zh || product?.name_ja || product?.barcode || "");
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
  return normalizeCompareText(baseProduct?.name_zh) === normalizeCompareText(candidate?.name_zh);
}

function lowestRecord(records) {
  return records.slice().sort((a, b) =>
    Number(a.unit_price) - Number(b.unit_price) || String(b.record_date || "").localeCompare(String(a.record_date || ""))
  )[0] || null;
}

let storesOwnershipPromise;

async function storesHaveOwnership(env) {
  if (!storesOwnershipPromise) {
    storesOwnershipPromise = all(env, "pragma table_info(stores)").then((rows) =>
      rows.some((row) => String(row.name || "").toLowerCase() === "created_by")
    );
  }
  return storesOwnershipPromise;
}

function toStore(row, auth) {
  return {
    id: row.id,
    name: row.name,
    chainBrand: row.chain_brand || "",
    location: row.location || "",
    note: row.note || "",
    canDelete: canDeleteRow(auth, row.created_by || "")
  };
}

function toPriceRecord(row) {
  const imageUrls = parseImageUrls(row.image_url);
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
    imageUrl: imageUrls[0] || null,
    imageUrls,
    recordDate: row.record_date,
    note: row.note || null,
    createdAt: row.created_at,
    createdBy: row.created_by || "",
    createdByName: row.created_by_name || row.created_by || "",
    lastModifiedBy: row.last_modified_by || "",
    lastModifiedByName: row.last_modified_by_name || row.last_modified_by || "",
    storeName: row.store_name || "-"
  };
}

async function snapshotStoreRevision(env, existing, auth) {
  await run(
    env,
    `insert into store_revisions
      (store_id, snapshot_name, snapshot_chain_brand, snapshot_location, snapshot_note, modified_by)
     values (?, ?, ?, ?, ?, ?)`,
    [
      existing.id,
      existing.name || "",
      existing.chain_brand || "",
      existing.location || "",
      existing.note || "",
      getCreatedBy(auth)
    ]
  );
}

async function snapshotPriceRecordRevision(env, existing, auth) {
  await run(
    env,
    `insert into price_record_revisions
      (price_record_id, snapshot_store_id, snapshot_price_tax_in, snapshot_price_tax_ex, snapshot_tax_rate,
       snapshot_spec_value, snapshot_unit, snapshot_unit_price, snapshot_unit_price_label, snapshot_image_url,
       snapshot_record_date, snapshot_note, modified_by)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      existing.id,
      existing.store_id,
      existing.price_tax_in,
      existing.price_tax_ex,
      existing.tax_rate,
      existing.spec_value,
      existing.unit,
      existing.unit_price,
      existing.unit_price_label,
      existing.image_url,
      existing.record_date,
      existing.note,
      getCreatedBy(auth)
    ]
  );
}

async function undoStoreRevision(env, storeId, auth, hasOwnership) {
  const existing = await first(
    env,
    hasOwnership ? "select * from stores where id = ?" : "select *, '' as created_by from stores where id = ?",
    [storeId]
  );
  if (!existing) throw new Error("store not found");

  const revision = await first(
    env,
    "select * from store_revisions where store_id = ? order by id desc limit 1",
    [storeId]
  );
  if (!revision) throw new Error("没有可撤回的修改");
  if (!canUndoLatestRevision(auth, revision.modified_by)) {
    throw new Error("只能撤回你自己做的最后一次修改");
  }

  await run(
    env,
    "update stores set name = ?, chain_brand = ?, location = ?, note = ?, updated_at = datetime('now') where id = ?",
    [
      revision.snapshot_name,
      revision.snapshot_chain_brand,
      revision.snapshot_location,
      revision.snapshot_note,
      storeId
    ]
  );
  await run(env, "delete from store_revisions where id = ?", [revision.id]);
  const row = await first(env, "select * from stores where id = ?", [storeId]);
  return toStore(row, auth);
}

async function undoPriceRecordRevision(env, recordId, auth) {
  const existing = await first(env, "select * from price_records where id = ?", [recordId]);
  if (!existing) throw new Error("price record not found");

  const revision = await first(
    env,
    "select * from price_record_revisions where price_record_id = ? order by id desc limit 1",
    [recordId]
  );
  if (!revision) throw new Error("没有可撤回的修改");
  if (!canUndoLatestRevision(auth, revision.modified_by)) {
    throw new Error("只能撤回你自己做的最后一次修改");
  }

  await run(
    env,
    `update price_records
     set store_id = ?, price_tax_in = ?, price_tax_ex = ?, tax_rate = ?, spec_value = ?, unit = ?,
         unit_price = ?, unit_price_label = ?, image_url = ?, record_date = ?, note = ?, updated_at = datetime('now')
     where id = ?`,
    [
      revision.snapshot_store_id,
      revision.snapshot_price_tax_in,
      revision.snapshot_price_tax_ex,
      revision.snapshot_tax_rate,
      revision.snapshot_spec_value,
      revision.snapshot_unit,
      revision.snapshot_unit_price,
      revision.snapshot_unit_price_label,
      revision.snapshot_image_url,
      revision.snapshot_record_date,
      revision.snapshot_note,
      recordId
    ]
  );
  await run(env, "delete from price_record_revisions where id = ?", [revision.id]);
  const row = await first(env, "select * from price_records where id = ?", [recordId]);
  return toPriceRecord(row);
}
