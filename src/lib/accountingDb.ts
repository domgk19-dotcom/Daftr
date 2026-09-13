import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

export type DbCustomer = {
  id: number;
  name: string;
  phone: string;
  group: string;
  balance: number;
  status: "مدين" | "دائن" | "متزن";
  lastActivity: string;
  initials: string;
  tone: string;
  transactionCount: number;
};

export type DbTransaction = {
  id: number;
  customer: string;
  type: "قبض" | "صرف";
  amount: number;
  note: string;
  date: string;
  currencyId: number;
  currencyCode: string;
};

export type DbCurrency = { id: number; name: string; code: string; symbol: string; decimals: number; transactionCount: number };
export type DbCatalogItem = { id: number; name: string };
export type DbShopSettings = { id: number; name: string; phone: string; logo: string; country: string; countryCode: string; defaultCurrencyId: number };

let database: any = null;
let databasePromise: Promise<any> | null = null;
const STORAGE_KEY = "daftar-sqlite-database-v2";

const seedCustomers = [
  [1, "محمد عبدالملك", "0771 234 567", "عملاء", 0, "م ع", "emerald", "اليوم 10:42 ص"],
  [2, "شركة النور للتجارة", "0711 122 233", "موردين", 0, "ش ن", "indigo", "أمس 04:18 م"],
  [3, "علي عبدالله صالح", "0734 455 667", "عملاء", 0, "ع ع", "amber", "11 مايو 01:05 م"],
  [4, "مؤسسة الازدهار", "0779 988 776", "موردين", 0, "م ا", "rose", "10 مايو 09:30 ص"],
  [5, "سالم اليافعي", "0700 112 233", "عملاء", 0, "س ي", "sky", "09 مايو 11:20 ص"],
  [6, "محلات الخير", "0777 555 444", "عملاء", 0, "م خ", "emerald", "اليوم 08:15 ص"],
  [7, "عمران الجعدي", "0733 221 144", "موردين", 0, "ع ا", "indigo", "أمس 11:10 ص"]
];

const seedTransactions = [
  [1, 1, 1, "صرف", 150000, "سند مبيعات\nالمستلم: محمد\nبضاعة متنوعة | الكمية: 1 | الوحدة: حبة | الإجمالي: 150000\nالإجمالي: 150000", "2024-05-01", "سند مبيعات", "محمد"],
  [2, 1, 1, "قبض", 50000, "دفعة من الحساب", "2024-05-05", "", ""],
  [3, 2, 1, "قبض", 450000, "سند مشتريات\nالمسلم: مندوب الشركة\nمواد غذائية | الكمية: 10 | الوحدة: كرتون | الإجمالي: 450000\nالإجمالي: 450000", "2024-05-02", "سند مشتريات", "مندوب الشركة"],
  [4, 2, 1, "صرف", 200000, "دفعة من الحساب", "2024-05-06", "", ""],
  [5, 3, 1, "صرف", 25000, "مبيعات آجل", "2024-05-03", "", ""],
  [6, 4, 1, "قبض", 120000, "مشتريات بضاعة", "2024-05-04", "", ""],
  [7, 4, 1, "صرف", 120000, "سداد كامل الحساب", "2024-05-07", "", ""],
  [8, 5, 1, "صرف", 85000, "أعمال صيانة", "2024-05-08", "", ""],
  [9, 5, 1, "قبض", 40000, "دفعة أولى", "2024-05-09", "", ""],
  [10, 6, 1, "صرف", 300000, "سند مبيعات\nالمستلم: علي\nأسمنت | الكمية: 100 | الوحدة: كيس | الإجمالي: 300000\nالإجمالي: 300000", "2024-05-10", "سند مبيعات", "علي"],
  [11, 6, 1, "قبض", 150000, "دفعة من الحساب", "2024-05-11", "", ""],
  [12, 7, 1, "قبض", 500000, "توريد مواد بناء", "2024-05-12", "", ""],
  [13, 7, 1, "صرف", 100000, "دفعة تحت الحساب", "2024-05-13", "", ""]
];

const seedCurrencies = [
  [1, "ريال يمني", "YER", "ر.ي", 0],
  [2, "ريال سعودي", "SAR", "ر.س", 2],
  [3, "دولار أمريكي", "USD", "$", 2]
];

function rowToCustomer(row: any[]): DbCustomer {
  return {
    id: Number(row[0]),
    name: String(row[1]),
    phone: String(row[2]),
    group: String(row[3]),
    balance: Number(row[4]),
    status: Number(row[4]) > 0 ? "مدين" : Number(row[4]) < 0 ? "دائن" : "متزن",
    initials: String(row[5]),
    tone: String(row[6]),
    lastActivity: String(row[7]),
    transactionCount: Number(row[8] || 0)
  };
}

function rowToTransaction(row: any[]): DbTransaction {
  return {
    id: Number(row[0]),
    customer: String(row[1]),
    currencyId: Number(row[2]),
    currencyCode: String(row[3]),
    type: String(row[4]) as "قبض" | "صرف",
    amount: Number(row[5]),
    note: String(row[6]),
    date: String(row[7])
  };
}

function rowToCurrency(row: any[]): DbCurrency {
  return {
    id: Number(row[0]),
    name: String(row[1]),
    code: String(row[2]),
    symbol: String(row[3]),
    decimals: Number(row[4]),
    transactionCount: Number(row[5] || 0)
  };
}

function openStoredDb(bytes: Uint8Array | null, SQL: any) {
  const isNewDatabase = !bytes;
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS currencies (id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, symbol TEXT NOT NULL, decimals INTEGER DEFAULT 2);
    CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, group_name TEXT, opening_balance REAL DEFAULT 0, initials TEXT, tone TEXT, last_activity TEXT);
    CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, currency_id INTEGER DEFAULT 1, type TEXT NOT NULL CHECK(type IN ('قبض', 'صرف')), amount REAL NOT NULL, note TEXT, transaction_date TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(customer_id) REFERENCES customers(id), FOREIGN KEY(currency_id) REFERENCES currencies(id));
    CREATE TABLE IF NOT EXISTS catalog_items (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_units (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS shop_settings (id INTEGER PRIMARY KEY CHECK(id = 1), name TEXT NOT NULL, phone TEXT DEFAULT '', logo TEXT DEFAULT '', country TEXT DEFAULT 'اليمن', country_code TEXT DEFAULT '+967', default_currency_id INTEGER DEFAULT 1);
  `);

  const columns = db.exec("PRAGMA table_info(transactions)")[0]?.values || [];
  if (!columns.some((column: any[]) => column[1] === "currency_id")) db.run("ALTER TABLE transactions ADD COLUMN currency_id INTEGER DEFAULT 1");
  if (!columns.some((column: any[]) => column[1] === "voucher_type")) db.run("ALTER TABLE transactions ADD COLUMN voucher_type TEXT DEFAULT ''");
  if (!columns.some((column: any[]) => column[1] === "handover")) db.run("ALTER TABLE transactions ADD COLUMN handover TEXT DEFAULT ''");

  const legacyCurrency = db.exec("SELECT code, name FROM currencies WHERE id = 1")[0]?.values[0];
  if (legacyCurrency && (legacyCurrency[0] === "IQD" || legacyCurrency[1] === "دينار عراقي")) db.run("UPDATE currencies SET name = 'ريال يمني', code = 'YER', symbol = 'ر.ي', decimals = 0 WHERE id = 1");

  const legacyShop = db.exec("SELECT country, country_code FROM shop_settings WHERE id = 1")[0]?.values[0];
  if (legacyShop && legacyShop[0] === "العراق" && legacyShop[1] === "+964") db.run("UPDATE shop_settings SET country = 'اليمن', country_code = '+967', default_currency_id = 1 WHERE id = 1");

  const currencyCount = db.exec("SELECT COUNT(*) FROM currencies")[0]?.values[0]?.[0] ?? 0;
  if (!Number(currencyCount)) {
    const insertCurrency = db.prepare("INSERT INTO currencies VALUES (?, ?, ?, ?, ?)");
    seedCurrencies.forEach((currency) => insertCurrency.run(currency));
    insertCurrency.free();
  }

  const count = db.exec("SELECT COUNT(*) FROM customers")[0]?.values[0]?.[0] ?? 0;
  if (!Number(count) && isNewDatabase) {
    const insertCustomer = db.prepare("INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    seedCustomers.forEach((customer) => insertCustomer.run(customer));
    insertCustomer.free();

    const insertTransaction = db.prepare("INSERT INTO transactions (id, customer_id, currency_id, type, amount, note, transaction_date, voucher_type, handover) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    seedTransactions.forEach((transaction) => {
      insertTransaction.run(transaction.length === 7 ? [...transaction, "", ""] : transaction);
    });
    insertTransaction.free();
  }

  return db;
}

function loadBytes(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open("daftar-accounting-storage", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => {
      const tx = request.result.transaction("files", "readonly");
      const get = tx.objectStore("files").get(STORAGE_KEY);
      get.onsuccess = () => resolve(get.result ? new Uint8Array(get.result) : null);
      get.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

function saveBytes(bytes: Uint8Array) {
  return new Promise<void>((resolve) => {
    const request = indexedDB.open("daftar-accounting-storage", 1);
    request.onsuccess = () => {
      const tx = request.result.transaction("files", "readwrite");
      tx.objectStore("files").put(bytes, STORAGE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    };
    request.onerror = () => resolve();
  });
}

export async function getDb() {
  if (!databasePromise) databasePromise = (async () => {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    database = openStoredDb(await loadBytes(), SQL);
    return database;
  })();
  return databasePromise;
}

export async function persistDb() {
  if (database) await saveBytes(database.export());
}

export async function readAccountingData() {
  const db = await getDb();
  const customerRows = db.exec(`SELECT c.id, c.name, c.phone, c.group_name, c.opening_balance + COALESCE(SUM(CASE WHEN t.type='صرف' THEN t.amount WHEN t.type='قبض' THEN -t.amount ELSE 0 END), 0) AS balance, c.initials, c.tone, COALESCE(MAX(t.transaction_date), c.last_activity), COUNT(t.id) FROM customers c LEFT JOIN transactions t ON t.customer_id=c.id GROUP BY c.id ORDER BY c.id DESC`)[0]?.values || [];
  const transactionRows = db.exec("SELECT t.id, c.name, t.currency_id, cur.code, t.type, t.amount, t.note, t.transaction_date FROM transactions t JOIN customers c ON c.id=t.customer_id JOIN currencies cur ON cur.id=t.currency_id ORDER BY t.id DESC")[0]?.values || [];
  const currencyRows = db.exec("SELECT cur.id, cur.name, cur.code, cur.symbol, cur.decimals, COUNT(t.id) FROM currencies cur LEFT JOIN transactions t ON t.currency_id=cur.id GROUP BY cur.id ORDER BY cur.id")[0]?.values || [];
  const itemRows = db.exec("SELECT id, name FROM catalog_items ORDER BY name COLLATE NOCASE")[0]?.values || [];
  const unitRows = db.exec("SELECT id, name FROM catalog_units ORDER BY name COLLATE NOCASE")[0]?.values || [];
  const shopRow = db.exec("SELECT id, name, phone, logo, country, country_code, default_currency_id FROM shop_settings WHERE id = 1")[0]?.values[0];

  const shop = shopRow ? { id: Number(shopRow[0]), name: String(shopRow[1]), phone: String(shopRow[2] || ''), logo: String(shopRow[3] || ''), country: String(shopRow[4] || 'اليمن'), countryCode: String(shopRow[5] || '+967'), defaultCurrencyId: Number(shopRow[6] || 1) } : null;

  return { customers: customerRows.map(rowToCustomer), transactions: transactionRows.map(rowToTransaction), currencies: currencyRows.map(rowToCurrency), items: itemRows.map((row: any[]) => ({ id: Number(row[0]), name: String(row[1]) })), units: unitRows.map((row: any[]) => ({ id: Number(row[0]), name: String(row[1]) })), shop };
}

export async function insertCustomer(input: { name: string; phone: string; group: string }) {
  const db = await getDb();
  const id = Date.now();
  const initials = input.name.split(" ").slice(0, 2).map((part) => part[0]).join("");
  const tones = ["emerald", "indigo", "amber", "rose", "sky"];
  const statement = db.prepare("INSERT INTO customers VALUES (?, ?, ?, ?, 0, ?, ?, ?)");
  statement.run([id, input.name, input.phone || "بدون رقم", input.group, initials, tones[id % tones.length], "اليوم"]);
  statement.free();
  await persistDb();
  return readAccountingData();
}

export async function insertTransaction(input: { customerName: string; currencyId: number; type: "قبض" | "صرف"; amount: number; note: string; date: string }) {
  const db = await getDb();
  const customer = db.exec("SELECT id FROM customers WHERE name = ?", [input.customerName])[0]?.values[0];
  if (!customer) throw new Error("العميل غير موجود");
  const id = Date.now();
  const statement = db.prepare("INSERT INTO transactions (id, customer_id, currency_id, type, amount, note, transaction_date, voucher_type, handover) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  statement.run([id, customer[0], input.currencyId || 1, input.type, input.amount, input.note || "بدون تفاصيل", input.date || new Date().toISOString().slice(0, 10), "", ""]);
  statement.free();
  await persistDb();
  return readAccountingData();
}

export async function insertSalesVoucher(input: { customerName: string; currencyId: number; date: string; handover: string; rows: { item: string; quantity: number; unit: string; amount: number }[] }) {
  return insertCatalogVoucher({ ...input, type: 'صرف', title: 'سند مبيعات' });
}

export async function insertPurchaseVoucher(input: { customerName: string; currencyId: number; date: string; handover: string; rows: { item: string; quantity: number; unit: string; amount: number }[] }) {
  return insertCatalogVoucher({ ...input, type: 'قبض', title: 'سند مشتريات' });
}

async function insertCatalogVoucher(input: { customerName: string; currencyId: number; date: string; handover: string; type: 'قبض' | 'صرف'; title: string; rows: { item: string; quantity: number; unit: string; amount: number }[] }) {
  const db = await getDb();
  const customer = db.exec("SELECT id FROM customers WHERE name = ?", [input.customerName])[0]?.values[0];
  if (!customer) throw new Error("العميل غير موجود");
  const validRows = input.rows.filter((row) => row.item.trim() && row.unit.trim() && Number.isFinite(row.quantity) && row.quantity > 0 && Number.isFinite(row.amount) && row.amount > 0);
  if (!validRows.length) throw new Error("لا توجد عناصر صحيحة");

  const total = validRows.reduce((sum, row) => sum + row.amount, 0);
  const details = validRows.map((row) => `${row.item.trim()} | الكمية: ${row.quantity} | الوحدة: ${row.unit.trim()} | الإجمالي: ${row.amount}`).join("\n");
  const note = `${input.title}\nالمستلم/المسلم: ${input.handover.trim() || 'لا يوجد'}\n${details}\nالإجمالي: ${total}`;

  const statement = db.prepare("INSERT INTO transactions (id, customer_id, currency_id, type, amount, note, transaction_date, voucher_type, handover) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  statement.run([Date.now(), customer[0], input.currencyId || 1, input.type, total, note, input.date || new Date().toISOString().slice(0, 10), input.title, input.handover.trim()]);
  statement.free();

  const itemStatement = db.prepare("INSERT OR IGNORE INTO catalog_items (name) VALUES (?)");
  const unitStatement = db.prepare("INSERT OR IGNORE INTO catalog_units (name) VALUES (?)");
  validRows.forEach((row) => {
    itemStatement.run([row.item.trim()]);
    unitStatement.run([row.unit.trim()]);
  });
  itemStatement.free();
  unitStatement.free();

  await persistDb();
  return readAccountingData();
}

export async function saveShopSettings(input: Omit<DbShopSettings, 'id'>) {
  const db = await getDb();
  const statement = db.prepare("INSERT INTO shop_settings (id, name, phone, logo, country, country_code, default_currency_id) VALUES (1, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, logo=excluded.logo, country=excluded.country, country_code=excluded.country_code, default_currency_id=excluded.default_currency_id");
  statement.run([input.name, input.phone, input.logo, input.country, input.countryCode, input.defaultCurrencyId]);
  statement.free();
  await persistDb();
  return readAccountingData();
}

export async function updateCustomer(id: number, input: { name: string; phone: string; group: string }) {
  const db = await getDb();
  const count = Number(db.exec("SELECT COUNT(*) FROM transactions WHERE customer_id = ?", [id])[0]?.values[0]?.[0] || 0);
  if (count) throw new Error("لا يمكن تعديل عميل لديه عمليات");
  const statement = db.prepare("UPDATE customers SET name = ?, phone = ?, group_name = ?, initials = ? WHERE id = ?");
  statement.run([input.name, input.phone, input.group, input.name.split(" ").slice(0, 2).map((part) => part[0]).join(""), id]);
  statement.free();
  await persistDb();
  return readAccountingData();
}

export async function deleteCustomer(id: number) {
  const db = await getDb();
  const count = Number(db.exec("SELECT COUNT(*) FROM transactions WHERE customer_id = ?", [id])[0]?.values[0]?.[0] || 0);
  if (count) throw new Error("لا يمكن حذف عميل لديه عمليات");
  db.run("DELETE FROM customers WHERE id = ?", [id]);
  await persistDb();
  return readAccountingData();
}

export async function updateTransaction(id: number, input: { currencyId: number; type: "قبض" | "صرف"; amount: number; note: string; date: string }) {
  const db = await getDb();
  const statement = db.prepare("UPDATE transactions SET currency_id = ?, type = ?, amount = ?, note = ?, transaction_date = ? WHERE id = ?");
  statement.run([input.currencyId || 1, input.type, input.amount, input.note, input.date, id]);
  statement.free();
  await persistDb();
  return readAccountingData();
}

export async function updateCurrency(id: number, input: { name: string; code: string; symbol: string }) {
  const db = await getDb();
  const statement = db.prepare("UPDATE currencies SET name = ?, code = ?, symbol = ? WHERE id = ?");
  statement.run([input.name, input.code.toUpperCase(), input.symbol, id]);
  statement.free();
  await persistDb();
  return readAccountingData();
}

export async function insertCurrency(input: { name: string; code: string; symbol: string; decimals: number }) {
  const db = await getDb();
  const id = Date.now();
  const statement = db.prepare("INSERT INTO currencies VALUES (?, ?, ?, ?, ?)");
  statement.run([id, input.name, input.code.toUpperCase(), input.symbol, input.decimals]);
  statement.free();
  await persistDb();
  return readAccountingData();
}

export async function deleteCurrency(id: number) {
  const db = await getDb();
  const count = Number(db.exec("SELECT COUNT(*) FROM transactions WHERE currency_id = ?", [id])[0]?.values[0]?.[0] || 0);
  if (count) throw new Error("لا يمكن حذف عملة لها عمليات مرتبطة");
  if (id === 1) throw new Error("لا يمكن حذف العملة الافتراضية");
  db.run("DELETE FROM currencies WHERE id = ?", [id]);
  await persistDb();
  return readAccountingData();
}

export async function deleteTransaction(id: number) {
  const db = await getDb();
  db.run("DELETE FROM transactions WHERE id = ?", [id]);
  await persistDb();
  return readAccountingData();
}

export async function exportDatabase() {
  const db = await getDb();
  return db.export();
}

export async function importDatabase(bytes: Uint8Array) {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  database = openStoredDb(bytes, SQL);
  databasePromise = Promise.resolve(database);
  await persistDb();
  return readAccountingData();
}

export async function createEmptyDatabase() {
  const db = await getDb();
  db.run("DELETE FROM transactions; DELETE FROM customers;");
  await persistDb();
  return readAccountingData();
}

export async function resetDatabase() {
  database = null;
  databasePromise = null;
  const request = indexedDB.deleteDatabase("daftar-accounting-storage");
  await new Promise<void>((resolve) => {
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
  return readAccountingData();
}
