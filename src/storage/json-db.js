import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const DATA_FILE = path.join(DATA_DIR, "app.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      counters: { category: 1, store: 1, product: 1, priceRecord: 1 },
      categories: [],
      stores: [],
      products: [],
      priceRecords: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
}

export function readDb() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

export function writeDb(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function getNextId(db, key) {
  const id = db.counters[key];
  db.counters[key] += 1;
  return id;
}

export function nowDate() {
  return new Date().toISOString().slice(0, 10);
}
