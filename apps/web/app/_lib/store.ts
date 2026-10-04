// Storefront vocabulary shared by the store, the bag and the catalogue manager.
export const productCategories: Record<string, string> = {
  WELLNESS: "Everyday wellness",
  NUTRITION: "Nutrition",
  FITNESS: "Fitness",
  DEVICES: "Health devices",
  MENTAL_WELLNESS: "Mental wellness",
  PERSONAL_CARE: "Personal care",
};
// What the customer pays for one unit, after any live offer.
export const unitPrice = (product: any): number =>
  product.offerPrice ?? product.price;
export const discountLabel = (kind: string, value: number) =>
  kind === "PERCENT"
    ? `${Number(value)}% off`
    : `NPR ${Number(value).toLocaleString("en-NP")} off`;
