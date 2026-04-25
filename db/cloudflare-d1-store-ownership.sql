alter table stores add column created_by text not null default '';

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
