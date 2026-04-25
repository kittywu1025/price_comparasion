import { calculateUnitPrice } from "./unit-price.js";

/**
 * 构建可入库的价格记录载荷。
 * 后端应以此函数二次计算 unitPrice，避免前端传入脏数据。
 * @param {object} input
 */
export function buildPriceRecordPayload(input) {
  if (!input || typeof input !== "object") {
    throw new Error("input is required");
  }

  const requiredFields = ["productId", "storeId", "priceTaxIn", "specValue", "unit", "recordDate", "createdBy"];
  for (const field of requiredFields) {
    if (!input[field]) {
      throw new Error(`${field} is required`);
    }
  }

  const { unitPrice, unitPriceLabel } = calculateUnitPrice(
    Number(input.priceTaxIn),
    Number(input.specValue),
    input.unit
  );

  return {
    productId: input.productId,
    storeId: input.storeId,
    priceTaxIn: Number(input.priceTaxIn),
    priceTaxEx: input.priceTaxEx == null ? null : Number(input.priceTaxEx),
    taxRate: input.taxRate == null ? null : Number(input.taxRate),
    specValue: Number(input.specValue),
    unit: input.unit,
    unitPrice,
    unitPriceLabel,
    imageUrl: input.imageUrl ?? null,
    recordDate: input.recordDate,
    note: input.note ?? null,
    createdBy: input.createdBy
  };
}
