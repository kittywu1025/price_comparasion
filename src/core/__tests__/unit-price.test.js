import test from "node:test";
import assert from "node:assert/strict";
import { calculateUnitPrice } from "../unit-price.js";

test("重量类: 400g, ¥178 => ¥44.5/100g", () => {
  const result = calculateUnitPrice(178, 400, "g");
  assert.equal(result.unitPrice, 44.5);
  assert.equal(result.unitPriceLabel, "/100g");
});

test("重量类: 0.8kg, ¥348 => ¥43.5/100g", () => {
  const result = calculateUnitPrice(348, 0.8, "kg");
  assert.equal(result.unitPrice, 43.5);
  assert.equal(result.unitPriceLabel, "/100g");
});

test("容量类: 900ml, ¥298 => ¥33.1111/100ml", () => {
  const result = calculateUnitPrice(298, 900, "ml");
  assert.equal(result.unitPrice, 33.1111);
  assert.equal(result.unitPriceLabel, "/100ml");
});

test("数量类: 6个, ¥198 => ¥33/个", () => {
  const result = calculateUnitPrice(198, 6, "个");
  assert.equal(result.unitPrice, 33);
  assert.equal(result.unitPriceLabel, "/个");
});

test("非法参数会抛错", () => {
  assert.throws(() => calculateUnitPrice(0, 400, "g"));
  assert.throws(() => calculateUnitPrice(100, -1, "g"));
  assert.throws(() => calculateUnitPrice(100, 1, "unknown"));
});
