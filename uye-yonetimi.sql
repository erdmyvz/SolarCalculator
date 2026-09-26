-- ============================================================================
--  uye-yonetimi.sql — Üyeler sekmesi: e-posta görünürlüğü + tedarikçi aboneliği
--
--  SORUN: Panelde firma satırlarında e-posta yoktu ve EKLENEMEZDİ —
--  profiles."Mail" ve companies.email sütunları var ama TAMAMEN BOŞ
--  (4 profilin 0'ı, 2 firmanın 0'ı). Gerçek adres auth.users'ta duruyor,
--  oraya tarayıcıdan erişilemiyor. Sonuç: isimsiz bir test hesabı panelde
--  görünüyor ama kime ait olduğu anlaşılamıyordu.
--
--  ÇÖZÜM: auth.users.email'i YALNIZ admine açan tek bir RPC. Sütun
--  kopyalamak yerine RPC tercih edildi; kopya veri ilk parola/e-posta
--  değişiminde sessizce eskir, RPC her zaman günceli okur.
-- ============================================================================

create or replace function public.admin_uye_epostalari()
returns table (id uuid, eposta text)
language sql
stable
security definer
set search_path = public, auth
as $$
    -- is_admin() false ise sıfır satır döner: yetkisiz çağrı boş liste alır,
    -- hata almaz. Hata mesajı da bilgi sızdırabilir.
    select u.id, u.email::text
      from auth.users u
     where public.is_admin();
$$;

revoke all     on function public.admin_uye_epostalari() from public, anon;
grant  execute on function public.admin_uye_epostalari() to authenticated;

-- ---------------------------------------------------------------------------
--  Tedarikçilerde abonelik alanları: sub_status / sub_ends_at / banned var,
--  ban_reason'ın varlığı doğrulanmadı. Eksikse ekle (varsa dokunma).
-- ---------------------------------------------------------------------------
alter table public.suppliers add column if not exists ban_reason  text;
alter table public.suppliers add column if not exists sub_status  text;
alter table public.suppliers add column if not exists sub_ends_at timestamptz;
alter table public.suppliers add column if not exists banned      boolean default false;

-- ---------------------------------------------------------------------------
--  DOĞRULAMA
-- ---------------------------------------------------------------------------
select 'rpc satır sayısı'   as kontrol, count(*)::text as deger from public.admin_uye_epostalari()
union all
select 'suppliers abonelik sütunları',
       string_agg(column_name, ', ' order by column_name)
  from information_schema.columns
 where table_schema='public' and table_name='suppliers'
   and column_name in ('sub_status','sub_ends_at','banned','ban_reason');
