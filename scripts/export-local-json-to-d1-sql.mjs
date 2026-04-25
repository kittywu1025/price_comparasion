import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const inputPath = path.join(ROOT, "data", "app.json");
const outputDir = path.join(ROOT, "tmp");
const outputPath = path.join(outputDir, "cloudflare-import.sql");

const db = JSON.parse(fs.readFileSync(inputPath, "utf8"));

fs.mkdirSync(outputDir, { recursive: true });

const lines = ["pragma foreign_keys = on;"];

for (const category of db.categories || []) {
  lines.push(upsert("categories", {
    id: category.id,
    name: category.name
  }));
}

for (const store of db.stores || []) {
  lines.push(upsert("stores", {
    id: store.id,
    name: store.name,
    chain_brand: store.chainBrand || "",
    location: store.location || "",
    note: store.note || ""
  }));
}

for (const product of db.products || []) {
  lines.push(upsert("products", {
    id: product.id,
    name_zh: product.nameZh || "",
    name_ja: product.nameJa || "",
    brand: product.brand || "",
    barcode: product.barcode || "",
    category_id: product.categoryId || null,
    default_image_url: product.defaultImageUrl || null,
    created_by: "local-import",
    created_at: product.createdAt || null,
    updated_at: product.updatedAt || product.createdAt || null
  }));
}

for (const record of db.priceRecords || []) {
  lines.push(upsert("price_records", {
    id: record.id,
    product_id: record.productId,
    store_id: record.storeId,
    price_tax_in: record.priceTaxIn,
    price_tax_ex: record.priceTaxEx,
    tax_rate: record.taxRate,
    spec_value: record.specValue,
    unit: record.unit,
    unit_price: record.unitPrice,
    unit_price_label: record.unitPriceLabel,
    image_url: normalizeImportImage(record.imageUrl),
    record_date: record.recordDate,
    note: record.note || null,
    created_by: "local-import",
    created_at: record.createdAt || null,
    updated_at: record.createdAt || null
  }));
}

lines.push("");

fs.writeFileSync(outputPath, lines.join("\n"));
console.log(`Wrote ${outputPath}`);

function upsert(table, row) {
  const columns = Object.keys(row);
  const values = columns.map((key) => sqlValue(row[key]));
  const updates = columns
    .filter((key) => key !== "id")
    .map((key) => `${quoteIdent(key)} = excluded.${quoteIdent(key)}`)
    .join(", ");

  return `insert into ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) values (${values.join(", ")}) on conflict(id) do update set ${updates};`;
}

function normalizeImportImage(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  if (imageUrl.startsWith("data:image/")) return null;
  return imageUrl;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}
