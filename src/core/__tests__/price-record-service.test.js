import test from "node:test";
import assert from "node:assert/strict";
import { buildPriceRecordPayload } from "../price-record-service.js";

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
