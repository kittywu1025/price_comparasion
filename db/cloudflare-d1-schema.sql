pragma foreign_keys = on;

create table if not exists categories (
  id integer primary key autoincrement,
  name text not null unique,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists stores (
  id integer primary key autoincrement,
  name text not null,
  chain_brand text not null default '',
  location text not null default '',
  note text not null default '',
  created_by text not null default '',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create index if not exists idx_stores_name on stores(name);

create table if not exists store_revisions (
  id integer primary key autoincrement,
  store_id integer not null references stores(id) on delete cascade,
  snapshot_name text not null default '',
  snapshot_chain_brand text not null default '',
  snapshot_location text not null default '',
  snapshot_note text not null default '',
  modified_by text not null default '',
  created_at text not null default (datetime('now'))
);

create index if not exists idx_store_revisions_store_id on store_revisions(store_id, id desc);

create table if not exists products (
  id integer primary key autoincrement,
  name_zh text not null default '',
  name_ja text not null default '',
  brand text not null default '',
  barcode text not null default '',
  category_id integer references categories(id) on delete set null,
  default_image_url text,
  created_by text not null default 'cloudflare-access',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  check (trim(name_zh) <> '' or trim(name_ja) <> '')
);

create index if not exists idx_products_barcode on products(barcode);
create index if not exists idx_products_name_zh on products(name_zh);
create index if not exists idx_products_name_ja on products(name_ja);
create index if not exists idx_products_category_id on products(category_id);

create table if not exists price_records (
  id integer primary key autoincrement,
  product_id integer not null references products(id) on delete cascade,
  store_id integer not null references stores(id) on delete restrict,
  price_tax_in real not null check (price_tax_in > 0),
  price_tax_ex real,
  tax_rate real,
  spec_value real not null check (spec_value > 0),
  unit text not null,
  unit_price real not null,
  unit_price_label text not null,
  image_url text,
  record_date text not null,
  note text,
  created_by text not null default 'cloudflare-access',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create index if not exists idx_price_records_product_id on price_records(product_id);
create index if not exists idx_price_records_store_id on price_records(store_id);
create index if not exists idx_price_records_record_date on price_records(record_date desc);
create index if not exists idx_price_records_unit_price on price_records(unit_price);

create table if not exists price_record_revisions (
  id integer primary key autoincrement,
  price_record_id integer not null references price_records(id) on delete cascade,
  snapshot_store_id integer not null,
  snapshot_price_tax_in real not null,
  snapshot_price_tax_ex real,
  snapshot_tax_rate real,
  snapshot_spec_value real not null,
  snapshot_unit text not null,
  snapshot_unit_price real not null,
  snapshot_unit_price_label text not null,
  snapshot_image_url text,
  snapshot_record_date text not null,
  snapshot_note text,
  modified_by text not null default '',
  created_at text not null default (datetime('now'))
);

create index if not exists idx_price_record_revisions_record_id on price_record_revisions(price_record_id, id desc);
