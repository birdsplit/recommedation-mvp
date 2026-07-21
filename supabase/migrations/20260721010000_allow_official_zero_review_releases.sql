-- Keep the database release guard aligned with catalog validation:
-- an official review page/API may legitimately confirm zero reviews.

create or replace function guard_catalog_release_scope()
returns trigger language plpgsql as $$
declare
  sample_count int;
  rechecked_count int;
begin
  if new.product_snapshot ->> 'status' = 'public'
     and new.product_snapshot ->> 'bed_size' <> 'SS' then
    raise exception 'Current MVP releases only allow SS products';
  end if;

  sample_count := coalesce((new.product_snapshot ->> 'review_sample_count')::int, -1);
  if sample_count < 0 or sample_count > 10 then
    raise exception 'Released products require an officially confirmed review count from 0 to 10';
  end if;

  if nullif(new.product_snapshot ->> 'review_verified_at', '') is null then
    raise exception 'Released products require a review verification date';
  end if;

  rechecked_count := coalesce((new.product_snapshot ->> 'review_rechecked_count')::int, -1);
  if rechecked_count < ceil(sample_count * 0.2) or rechecked_count > sample_count then
    raise exception 'Released products require a valid 20 percent review recheck';
  end if;

  return new;
end $$;
