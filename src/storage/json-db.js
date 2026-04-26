import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const DATA_FILE = path.join(DATA_DIR, "app.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      counters: { category: 1, store: 1, product: 1, priceRecord: 1, storeRevision: 1, priceRecordRevision: 1, feedback: 1 },
      categories: [],
      stores: [],
      products: [],
      priceRecords: [],
      storeRevisions: [],
      priceRecordRevisions: [],
      feedback: [],
      userProfiles: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
}

export function readDb() {
  ensureDataFile();
  const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  db.counters ??= {};
  db.counters.category ??= 1;
  db.counters.store ??= 1;
  db.counters.product ??= 1;
  db.counters.priceRecord ??= 1;
  db.counters.storeRevision ??= 1;
  db.counters.priceRecordRevision ??= 1;
  db.counters.feedback ??= 1;
  db.categories ??= [];
  db.stores ??= [];
  db.products ??= [];
  db.priceRecords ??= [];
  db.storeRevisions ??= [];
  db.priceRecordRevisions ??= [];
  db.feedback ??= [];
  db.userProfiles ??= [];
  return db;
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
