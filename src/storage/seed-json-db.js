import { getNextId, readDb, writeDb } from "./json-db.js";

const db = readDb();

for (const name of ["食品", "日用品", "饮料", "调味料", "冷冻食品"]) {
  if (!db.categories.find((c) => c.name === name)) {
    db.categories.push({ id: getNextId(db, "category"), name });
  }
}

if (db.stores.length === 0) {
  const stores = [
    ["Cosmos 中央店", "Cosmos", "中央"],
    ["业务超市 博多店", "业务超市", "博多"],
    ["Donki 天神店", "Donki", "天神"]
  ];
  for (const [name, chainBrand, location] of stores) {
    db.stores.push({ id: getNextId(db, "store"), name, chainBrand, location, note: "" });
  }
}

writeDb(db);
console.log("Seed completed.");
