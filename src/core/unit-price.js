const WEIGHT_UNITS = new Set(["g", "kg"]);
const VOLUME_UNITS = new Set(["ml", "l"]);
const COUNT_UNITS = new Set(["个", "pack", "袋", "包", "盒", "枚", "本", "瓶", "罐", "卷"]);

/**
 * @typedef {{ unitPrice:number, unitPriceLabel:string }} UnitPriceResult
 */

/**
 * 按 MVP 规则计算单位价格（基于税后价）。
 * - 重量类统一 /100g
 * - 容量类统一 /100ml
 * - 数量类统一 /单位
 * @param {number} priceTaxIn
 * @param {number} specValue
 * @param {string} unit
 * @returns {UnitPriceResult}
 */
export function calculateUnitPrice(priceTaxIn, specValue, unit) {
  const normalizedUnit = normalizeUnit(unit);

  validatePositiveNumber(priceTaxIn, "priceTaxIn");
  validatePositiveNumber(specValue, "specValue");

  if (WEIGHT_UNITS.has(normalizedUnit)) {
    const grams = normalizedUnit === "kg" ? specValue * 1000 : specValue;
    return {
      unitPrice: round(priceTaxIn / (grams / 100), 4),
      unitPriceLabel: "/100g"
    };
  }

  if (VOLUME_UNITS.has(normalizedUnit)) {
    const ml = normalizedUnit === "l" ? specValue * 1000 : specValue;
    return {
      unitPrice: round(priceTaxIn / (ml / 100), 4),
      unitPriceLabel: "/100ml"
    };
  }

  if (COUNT_UNITS.has(normalizedUnit)) {
    return {
      unitPrice: round(priceTaxIn / specValue, 4),
      unitPriceLabel: `/${normalizedUnit}`
    };
  }

  throw new Error(`Unsupported unit: ${unit}`);
}

/**
 * 统一单位输入（大小写、全角）
 * @param {string} rawUnit
 */
export function normalizeUnit(rawUnit) {
  if (!rawUnit || typeof rawUnit !== "string") {
    throw new Error("unit is required");
  }

  const unit = rawUnit.trim().toLowerCase();
  if (unit === "l") return "l";
  if (unit === "kg") return "kg";
  if (unit === "pack") return "pack";
  return rawUnit.trim();
}

function validatePositiveNumber(value, fieldName) {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
}

function round(num, fractionDigits) {
  const power = 10 ** fractionDigits;
  return Math.round(num * power) / power;
}

export const UNIT_GROUPS = {
  WEIGHT_UNITS,
  VOLUME_UNITS,
  COUNT_UNITS
};
