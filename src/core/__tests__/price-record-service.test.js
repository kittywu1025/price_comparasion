import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPriceRecordPayload } from "../price-record-service.js";
import { createPriceRecord } from "../../storage/repository.js";

test("自动补齐 unitPrice 与 unitPriceLabel", () => {
  const payload = buildPriceRecordPayload({
    productId: "p1",
    storeId: "s1",
    priceTaxIn: 178,
    specValue: 400,
    unit: "g",
    recordDate: "2026-04-24",
    createdBy: "u1"
  });

  assert.equal(payload.unitPrice, 44.5);
  assert.equal(payload.unitPriceLabel, "/100g");
  assert.equal(payload.priceTaxEx, null);
});

test("缺少必填字段时报错", () => {
  assert.throws(() =>
    buildPriceRecordPayload({
      productId: "p1"
    })
  );
});

test("0% 税率应原样保留", () => {
  const payload = buildPriceRecordPayload({
    productId: "p1",
    storeId: "s1",
    priceTaxIn: 198,
    priceTaxEx: 198,
    taxRate: 0,
    specValue: 1,
    unit: "pack",
    recordDate: "2026-04-29",
    createdBy: "u1"
  });

  assert.equal(payload.taxRate, 0);
  assert.equal(payload.priceTaxEx, 198);
  assert.equal(payload.priceTaxIn, 198);
});

test("同商品同店同日期再次新增时更新原价格记录", (t) => {
  const dataFile = "data/app.json";
  const backup = fs.existsSync(dataFile) ? fs.readFileSync(dataFile, "utf8") : null;
  t.after(() => {
    if (backup == null) fs.rmSync(dataFile, { force: true });
    else fs.writeFileSync(dataFile, backup);
  });

  fs.writeFileSync(dataFile, JSON.stringify({
    counters: { category: 1, store: 2, product: 2, priceRecord: 1, storeRevision: 1, priceRecordRevision: 1, feedback: 1 },
    categories: [],
    stores: [{ id: 1, name: "Cosmos", chainBrand: "", location: "", note: "", createdBy: "test" }],
    products: [{ id: 1, nameZh: "冰淇淋", nameJa: "", brand: "", barcode: "4901005381643", categoryId: null, defaultImageUrl: null, createdBy: "test", createdAt: "2026-04-29", updatedAt: "2026-04-29" }],
    priceRecords: [],
    storeRevisions: [],
    priceRecordRevisions: [],
    feedback: [],
    userProfiles: []
  }, null, 2));

  const firstPayload = buildPriceRecordPayload({
    productId: 1,
    storeId: 1,
    priceTaxIn: 198,
    specValue: 1,
    unit: "个",
    recordDate: "2026-04-29",
    createdBy: "tester@example.com"
  });
  const first = createPriceRecord({ ...firstPayload, product: { id: 1 } }, { email: "tester@example.com" });

  const secondPayload = buildPriceRecordPayload({
    productId: 1,
    storeId: 1,
    priceTaxIn: 188,
    specValue: 1,
    unit: "个",
    recordDate: "2026-04-29",
    createdBy: "tester@example.com"
  });
  const second = createPriceRecord({ ...secondPayload, product: { id: 1 } }, { email: "tester@example.com" });
  const db = JSON.parse(fs.readFileSync(dataFile, "utf8"));

  assert.equal(second.id, first.id);
  assert.equal(db.priceRecords.length, 1);
  assert.equal(db.priceRecords[0].priceTaxIn, 188);
  assert.equal(db.priceRecordRevisions.length, 1);
});
