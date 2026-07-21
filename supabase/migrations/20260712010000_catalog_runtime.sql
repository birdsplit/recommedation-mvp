-- Real-catalog identity, evidence, and immutable release snapshots.
-- Existing rows predate this contract and are demoted from public until they
-- are re-imported and explicitly released through the catalog workflow.

alter table products
  add column internal_key text,
  add column offer_id text,
  add column variant_key text,
  add column option_name text,
  add column availability text not null default 'unknown',
  add column source_url text,
  add column shipping_fee_confidence text not null default 'confirmed',
  add column unknown_fields text[] not null default '{}',
  add column commercial_verified_at date,
  add column spec_verified_at date;

alter table products
  alter column width_cm type numeric(7,2) using width_cm::numeric,
  alter column length_cm type numeric(7,2) using length_cm::numeric,
  alter column height_cm type numeric(7,2) using height_cm::numeric,
  alter column under_bed_clearance_cm type numeric(7,2)
    using under_bed_clearance_cm::numeric,
  drop constraint if exists products_bed_size_check,
  add constraint products_bed_size_nonempty_check
    check (bed_size ~ '[^[:space:]]');

update products
set
  internal_key = 'legacy:' || id::text,
  offer_id = id::text,
  variant_key = 'default',
  option_name = bed_size,
  source_url = seller_url,
  commercial_verified_at = last_verified_at,
  spec_verified_at = last_verified_at,
  status = case when status = 'public' then 'hidden' else status end;

alter table products
  alter column internal_key set not null,
  alter column offer_id set not null,
  alter column variant_key set not null,
  alter column option_name set not null,
  alter column source_url set not null,
  alter column commercial_verified_at set not null,
  alter column spec_verified_at set not null,
  add constraint products_internal_key_nonempty_check
    check (internal_key ~ '[^[:space:]]'),
  add constraint products_offer_id_nonempty_check
    check (offer_id ~ '[^[:space:]]'),
  add constraint products_variant_key_nonempty_check
    check (variant_key ~ '[^[:space:]]'),
  add constraint products_option_name_nonempty_check
    check (option_name ~ '[^[:space:]]'),
  add constraint products_availability_check
    check (availability in ('in_stock','out_of_stock','preorder','unknown')),
  add constraint products_source_url_check
    check (source_url ~* '^https?://'),
  add constraint products_shipping_fee_confidence_check
    check (shipping_fee_confidence in ('confirmed','estimated','unknown')),
  add constraint products_unknown_fields_check
    check (unknown_fields <@ array[
      'mattress_included','scheduled_delivery','has_outlet','has_headboard',
      'carry_service_available','assembly_service_available',
      'delivery_days_min','delivery_days_max','storage_type','assembly_people'
    ]::text[]),
  add constraint products_public_catalog_ready_check
    check (
      status <> 'public'
      or (
        availability = 'in_stock'
        and seller_url ~* '^https://'
        and source_url ~* '^https://'
        and seller_url !~* '^https://(localhost|127[.]0[.]0[.]1|([^/]+[.])?example[.](com|org|net)|[^/]+[.]invalid)([:/]|$)'
        and source_url !~* '^https://(localhost|127[.]0[.]0[.]1|([^/]+[.])?example[.](com|org|net)|[^/]+[.]invalid)([:/]|$)'
      )
    );

alter table products
  add constraint products_internal_key_key unique (internal_key),
  add constraint products_offer_variant_key unique (seller_name, offer_id, variant_key);

create table product_evidence (
  id bigint generated always as identity primary key,
  product_id uuid not null references products(id) on delete cascade,
  field_group text not null
    check (field_group in ('identity','commercial','delivery','spec','review','policy','catalog')),
  field_names text[] not null check (cardinality(field_names) > 0),
  source_url text not null check (source_url ~* '^https?://'),
  observed_value jsonb not null default '{}',
  confidence text not null
    check (confidence in ('confirmed','estimated','unknown')),
  verified_at date not null,
  verified_by text not null check (verified_by ~ '[^[:space:]]'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, field_group, source_url)
);

create index product_evidence_product_idx on product_evidence (product_id);
create index product_evidence_verified_idx on product_evidence (verified_at);

create trigger product_evidence_updated_at
  before update on product_evidence
  for each row execute function set_updated_at();

create table catalog_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (version ~ '[^[:space:]]'),
  data_hash text not null unique check (data_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft'
    check (status in ('draft','published','retired')),
  product_count int not null check (product_count > 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null) or status = 'retired')
);

create unique index catalog_releases_one_published_idx
  on catalog_releases ((status)) where status = 'published';

create table catalog_release_products (
  release_id uuid not null references catalog_releases(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  position int not null check (position > 0),
  product_snapshot jsonb not null check (jsonb_typeof(product_snapshot) = 'object'),
  primary key (release_id, product_id),
  unique (release_id, position)
);

create index catalog_release_products_product_idx
  on catalog_release_products (product_id);

create or replace function guard_catalog_release_items()
returns trigger language plpgsql as $$
declare
  target_release_id uuid;
begin
  target_release_id := case when tg_op = 'DELETE' then old.release_id else new.release_id end;
  if exists (
    select 1 from catalog_releases
    where id = target_release_id and status <> 'draft'
  ) then
    raise exception 'Published or retired catalog release items are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger catalog_release_items_immutable
  before insert or update or delete on catalog_release_products
  for each row execute function guard_catalog_release_items();

create or replace function publish_catalog_release(p_release_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  target catalog_releases%rowtype;
  actual_count int;
begin
  lock table catalog_releases in share row exclusive mode;
  select * into target from catalog_releases where id = p_release_id for update;
  if not found then
    raise exception 'Catalog release not found';
  end if;
  if target.status = 'published' then
    return;
  end if;
  if target.status <> 'draft' then
    raise exception 'Only a draft catalog release can be published';
  end if;

  select count(*) into actual_count
  from catalog_release_products where release_id = p_release_id;
  if actual_count <> target.product_count then
    raise exception 'Catalog release product count mismatch: expected %, got %',
      target.product_count, actual_count;
  end if;
  if exists (
    select 1 from catalog_release_products
    where release_id = p_release_id
      and (
        product_snapshot ->> 'status' <> 'public'
        or product_snapshot ->> 'availability' <> 'in_stock'
      )
  ) then
    raise exception 'Catalog release contains an ineligible product snapshot';
  end if;

  update catalog_releases
  set status = 'retired'
  where status = 'published' and id <> p_release_id;

  update catalog_releases
  set status = 'published', published_at = now()
  where id = p_release_id;
end $$;

alter table product_evidence enable row level security;
alter table catalog_releases enable row level security;
alter table catalog_release_products enable row level security;

grant all on table product_evidence, catalog_releases, catalog_release_products to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function publish_catalog_release(uuid) to service_role;
revoke all on table product_evidence, catalog_releases, catalog_release_products
  from anon, authenticated;
