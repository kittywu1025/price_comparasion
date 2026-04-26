import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { buildPriceRecordPayload } from "./src/core/price-record-service.js";
import { initDb } from "./src/storage/init-json-db.js";
import {
  createCategory,
  deletePriceRecord,
  createPriceRecord,
  createStore,
  deleteStore,
  getProductDetail,
  getMyStats,
  getPriceRecordAccess,
  listCategories,
  listProducts,
  listStores,
  undoPriceRecord,
  undoStore,
  updatePriceRecord,
  updateStore
} from "./src/storage/repository.js";

initDb();

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.resolve("public");
const DEV_ACTOR_EMAIL = String(process.env.DEV_ACTOR_EMAIL || "local-admin@example.com").trim().toLowerCase();
const DEV_ADMIN_EMAILS = String(process.env.DEV_ADMIN_EMAILS || DEV_ACTOR_EMAIL)
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);

function getLocalAuth() {
  return {
    email: DEV_ACTOR_EMAIL,
    isAdmin: DEV_ADMIN_EMAILS.includes(DEV_ACTOR_EMAIL)
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(res, pathname) {
  const requestedPath = pathname === "/" ? "home.html" : pathname;
  let filePath = path.join(PUBLIC_DIR, requestedPath);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if ((!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) && !path.extname(filePath)) {
    filePath = path.join(PUBLIC_DIR, `${requestedPath}.html`);
  }
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath);
  const type = ext === ".html" ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
  res.writeHead(200, { "content-type": type });
  res.end(fs.readFileSync(filePath));
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const { pathname, searchParams } = url;
    const auth = getLocalAuth();

    if (req.method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, loginEnabled: false });
    }

    if (req.method === "GET" && pathname === "/api/me/stats") {
      return sendJson(res, 200, getMyStats(auth));
    }

    if (req.method === "GET" && pathname === "/api/categories") {
      return sendJson(res, 200, listCategories());
    }

    if (req.method === "POST" && pathname === "/api/categories") {
      const body = await parseBody(req);
      if (!body.name?.trim()) return sendJson(res, 400, { error: "name is required" });
      return sendJson(res, 201, createCategory(body.name.trim()));
    }

    if (req.method === "GET" && pathname === "/api/stores") {
      return sendJson(res, 200, listStores(auth));
    }

    if (req.method === "POST" && pathname === "/api/stores") {
      const body = await parseBody(req);
      if (!body.name?.trim()) return sendJson(res, 400, { error: "name is required" });
      return sendJson(res, 201, createStore(body, auth));
    }

    if (pathname.startsWith("/api/stores/")) {
      const parts = pathname.split("/").filter(Boolean);
      const id = Number(parts[2]);
      if (!Number.isFinite(id)) return sendJson(res, 400, { error: "invalid store id" });

      if (req.method === "POST" && parts[3] === "undo") {
        return sendJson(res, 200, undoStore(id, auth));
      }

      if (req.method === "PUT") {
        const body = await parseBody(req);
        if (!body.name?.trim()) return sendJson(res, 400, { error: "name is required" });
        return sendJson(res, 200, updateStore(id, body, auth));
      }

      if (req.method === "DELETE") {
        return sendJson(res, 200, deleteStore(id, auth));
      }
    }

    if (req.method === "GET" && pathname === "/api/products") {
      return sendJson(
        res,
        200,
        listProducts({ q: searchParams.get("q") || "", categoryId: searchParams.get("categoryId"), storeId: searchParams.get("storeId") })
      );
    }

    if (req.method === "GET" && pathname.startsWith("/api/products/")) {
      const id = Number(pathname.split("/").pop());
      const detail = getProductDetail(id);
      if (!detail) return sendJson(res, 404, { error: "product not found" });
      return sendJson(res, 200, detail);
    }

    if (req.method === "POST" && pathname === "/api/price-records") {
      const body = await parseBody(req);

      if (!body.product?.id && !body.product?.nameZh && !body.product?.nameJa) {
        return sendJson(res, 400, { error: "product.nameZh or product.nameJa is required for new product" });
      }

      const payload = buildPriceRecordPayload({
        productId: body.product?.id || "temp",
        storeId: body.storeId,
        priceTaxIn: body.priceTaxIn,
        priceTaxEx: body.priceTaxEx,
        taxRate: body.taxRate,
        specValue: body.specValue,
        unit: body.unit,
        imageUrl: body.imageUrl,
        recordDate: body.recordDate,
        note: body.note,
        createdBy: auth.email
      });

      const created = createPriceRecord({ ...payload, product: body.product }, auth);
      return sendJson(res, 201, created);
    }

    if (pathname.startsWith("/api/price-records/")) {
      const parts = pathname.split("/").filter(Boolean);
      const id = Number(parts[2]);
      if (!Number.isFinite(id)) return sendJson(res, 400, { error: "invalid price record id" });

      if (req.method === "GET") {
        return sendJson(res, 200, getPriceRecordAccess(id, auth));
      }

      if (req.method === "POST" && parts[3] === "undo") {
        return sendJson(res, 200, undoPriceRecord(id, auth));
      }

      if (req.method === "DELETE") {
        return sendJson(res, 200, deletePriceRecord(id, auth));
      }

      if (req.method !== "PUT") return sendJson(res, 405, { error: "Method not allowed" });

      const body = await parseBody(req);

      const payload = buildPriceRecordPayload({
        productId: body.productId || "temp",
        storeId: body.storeId,
        priceTaxIn: body.priceTaxIn,
        priceTaxEx: body.priceTaxEx,
        taxRate: body.taxRate,
        specValue: body.specValue,
        unit: body.unit,
        imageUrl: body.imageUrl,
        recordDate: body.recordDate,
        note: body.note,
        createdBy: auth.email
      });

      const updated = updatePriceRecord(id, payload, auth);
      return sendJson(res, 200, updated);
    }

    if (serveStatic(res, pathname)) return;

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Bad request" });
  }
});

server.listen(PORT, () => {
  console.log(`MVP app running at http://localhost:${PORT}`);
});
