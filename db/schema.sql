-- 日本超市价格比价工具 MVP 数据库结构（PostgreSQL）
-- 版本：V1.0

create extension if not exists pgcrypto;

-- 用户
create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nickname text not null,
  created_at timestamptz not null default now()
);

-- 分类
create table if not exists category (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 店铺
create table if not exists store (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  chain_brand text,
  location text,
  note text,
  created_at timestamptz not null default now(),
  unique (name, coalesce(location, ''))
);

-- 商品（不直接存价格）
create table if not exists product (
  id uuid primary key default gen_random_uuid(),
  name_zh text,
  name_ja text,
  brand text,
  barcode text,
  category_id uuid references category(id),
  default_image_url text,
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coalesce(trim(name_zh), '') <> '' or coalesce(trim(name_ja), '') <> '')
);

create index if not exists idx_product_barcode on product(barcode);
create index if not exists idx_product_name_zh on product(name_zh);
create index if not exists idx_product_name_ja on product(name_ja);

-- 价格记录（每次新增，不覆盖旧记录）
create table if not exists price_record (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references product(id),
  store_id uuid not null references store(id),
  price_tax_in numeric(10,2) not null check (price_tax_in > 0),
  price_tax_ex numeric(10,2),
  tax_rate numeric(4,2),
  spec_value numeric(10,3) not null check (spec_value > 0),
  unit text not null,
  unit_price numeric(10,4) not null,
  unit_price_label text not null,
  image_url text,
  record_date date not null,
  note text,
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_price_record_product on price_record(product_id);
create index if not exists idx_price_record_store on price_record(store_id);
create index if not exists idx_price_record_record_date on price_record(record_date desc);
create index if not exists idx_price_record_unit_price on price_record(unit_price);

-- 商品最低价视图（按单位价格）
create or replace view v_product_lowest_unit_price as
select distinct on (pr.product_id)
  pr.product_id,
  pr.id as price_record_id,
  pr.store_id,
  pr.unit_price,
  pr.unit_price_label,
  pr.price_tax_in,
  pr.record_date,
  pr.created_at
from price_record pr
order by pr.product_id, pr.unit_price asc, pr.record_date desc;

-- 自动更新时间戳
create or replace function set_product_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_product_updated_at on product;
create trigger trg_product_updated_at
before update on product
for each row execute function set_product_updated_at();
