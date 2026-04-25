import { readDb, writeDb } from "./json-db.js";

export function initDb() {
  const db = readDb();
  writeDb(db);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initDb();
  console.log("JSON DB initialized at data/app.json");
}
