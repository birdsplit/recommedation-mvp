-- 공개 상품은 사용자 화면에 정보 출처가 함께 표시되어야 한다.
-- 비공개 초안과 품절/재확인 상품은 출처를 나중에 보완할 수 있다.
do $$
begin
  if exists (
    select 1
    from products
    where status = 'public'
      and (
        source_note is null
        or source_note !~ '[^[:space:]]'
      )
  ) then
    raise exception
      'Public products without source_note exist. Add a source or hide them before applying this migration.';
  end if;

end
$$;

alter table products
  drop constraint if exists products_public_source_note_check;

alter table products
  add constraint products_public_source_note_check
  check (
    status <> 'public'
    or (source_note is not null and source_note ~ '[^[:space:]]')
  );
