import { calculateUnitPrice, normalizeUnit } from "./unit-price.js";

export function getDefaultSpecValueForUnit(unit) {
  const normalizedUnit = normalizeUnit(String(unit || ""));
  if (normalizedUnit === "g" || normalizedUnit === "ml") return 1000;
  if (normalizedUnit === "kg" || normalizedUnit === "l") return 1;
  if (["个", "pack", "パック", "包", "PAC"].includes(String(unit || "").trim())) return 1;
  if (normalizedUnit === "pack") return 1;
  return null;
}

export function resolveSpecValue(inputSpecValue, unit) {
  const number = Number(inputSpecValue);
  if (Number.isFinite(number) && number > 0) return number;
  const fallback = getDefaultSpecValueForUnit(unit);
  if (fallback == null) {
    throw new Error("specValue is required");
  }
  return fallback;
}

/**
 * 构建可入库的价格记录载荷。
 * 后端应以此函数二次计算 unitPrice，避免前端传入脏数据。
 * @param {object} input
 */
export function buildPriceRecordPayload(input) {
  if (!input || typeof input !== "object") {
    throw new Error("input is required");
  }

  const requiredFields = ["productId", "storeId", "priceTaxIn", "unit", "recordDate", "createdBy"];
  for (const field of requiredFields) {
    if (!input[field]) {
      throw new Error(`${field} is required`);
    }
  }

  const specValue = resolveSpecValue(input.specValue, input.unit);

  const { unitPrice, unitPriceLabel } = calculateUnitPrice(
    Number(input.priceTaxIn),
    specValue,
    input.unit
  );

  return {
    productId: input.productId,
    storeId: input.storeId,
    priceTaxIn: Number(input.priceTaxIn),
    priceTaxEx: input.priceTaxEx == null ? null : Number(input.priceTaxEx),
    taxRate: input.taxRate == null ? null : Number(input.taxRate),
    specValue,
    unit: input.unit,
    unitPrice,
    unitPriceLabel,
    imageUrl: input.imageUrl ?? null,
    recordDate: input.recordDate,
    note: input.note ?? null,
    createdBy: input.createdBy
  };
}
