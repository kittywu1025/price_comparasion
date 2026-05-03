import test from "node:test";
import assert from "node:assert/strict";
import { calculateTaxIncludedPrice } from "../tax.js";

test("税后价按整数日元四舍五入", () => {
  assert.equal(calculateTaxIncludedPrice(165, 8), 178);
  assert.equal(calculateTaxIncludedPrice(199, 10), 219);
  assert.equal(calculateTaxIncludedPrice(101.4, 8), 110);
});

test("0% 税率时税后价按整数日元四舍五入", () => {
  assert.equal(calculateTaxIncludedPrice(198, 0), 198);
  assert.equal(calculateTaxIncludedPrice(198.6, 0), 199);
});
