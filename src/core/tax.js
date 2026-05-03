export function calculateTaxIncludedPrice(priceTaxEx, taxRate) {
  const before = Number(priceTaxEx || 0);
  const rate = Number(taxRate ?? 0);
  if (!(before > 0)) return 0;
  if (!Number.isFinite(rate) || rate === 0) return Math.round(before);
  return Math.round(before * (1 + rate / 100));
}
