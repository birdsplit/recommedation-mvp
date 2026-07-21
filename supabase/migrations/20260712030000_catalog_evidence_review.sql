-- Consumer-protection policies, review sampling, and release approval records.

alter table products
  add column return_policy_summary text,
  add column damage_process_summary text,
  add column warranty_summary text,
  add column review_sample_count int not null default 0,
  add column review_risk_counts jsonb not null default '{}',
  add column review_verified_at date,
  add column review_rechecked_count int not null default 0,
  add constraint products_review_sample_count_check
    check (review_sample_count between 0 and 10),
  add constraint products_review_rechecked_count_check
    check (review_rechecked_count between 0 and review_sample_count),
  add constraint products_review_risk_counts_object_check
    check (jsonb_typeof(review_risk_counts) = 'object'),
  add constraint products_public_mvp_bed_size_check
    check (status <> 'public' or bed_size = 'SS');

alter table catalog_releases
  add column approved_by text,
  add column warning_approval text,
  add constraint catalog_releases_approved_by_nonempty_check
    check (approved_by is null or approved_by ~ '[^[:space:]]'),
  add constraint catalog_releases_warning_approval_nonempty_check
    check (warning_approval is null or warning_approval ~ '[^[:space:]]');

delete from product_evidence older
using product_evidence newer
where older.product_id = newer.product_id
  and older.field_group = newer.field_group
  and (older.updated_at, older.id) < (newer.updated_at, newer.id);

alter table product_evidence
  drop constraint if exists product_evidence_product_id_field_group_source_url_key,
  add constraint product_evidence_product_field_group_key
    unique (product_id, field_group);

create or replace function guard_catalog_release_scope()
returns trigger language plpgsql as $$
begin
  if new.product_snapshot ->> 'status' = 'public'
     and new.product_snapshot ->> 'bed_size' <> 'SS' then
    raise exception 'Current MVP releases only allow SS products';
  end if;
  if coalesce((new.product_snapshot ->> 'review_sample_count')::int, 0) < 1 then
    raise exception 'Released products require a reviewed sample';
  end if;
  return new;
end $$;

create trigger catalog_release_scope_guard
  before insert or update on catalog_release_products
  for each row execute function guard_catalog_release_scope();
