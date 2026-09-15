-- ============================================================================
--  yatirimci-paneli-duzelt.sql  (3. sürüm — ÇALIŞTIRILACAK SÜRÜM BU)
--  "⚠️ Verileriniz şu an yüklenemedi" — yatırımcı panelindeki hata
--
--  HATA
--    42702: column reference "facility_code" is ambiguous
--
--  SEBEP (gövde görüldü, artık tahmin değil)
--    Fonksiyonun RETURNS TABLE listesi facility_code · system_kwp ·
--    install_date · created_at adlarını ÇIKTI DEĞİŞKENİ olarak tanımlıyor.
--    Alttaki LATERAL alt sorgusu ise aynı adları TABLO KOLONU olarak
--    niteliksiz yazıyor:
--
--        left join lateral (
--            select facility_code, system_kwp, install_date   -- ← niteliksiz
--            from public.projects
--            where lead_id = l.id
--            order by created_at                              -- ← niteliksiz
--            limit 1
--        ) pr on true
--
--    PostgreSQL "bu ad çıktı değişkeni mi, kolon mu?" diyip reddediyor.
--
--  DEĞİŞEN TEK ŞEY
--    LATERAL alt sorgusuna "pj" takma adı verildi ve dört kolon referansı
--    nitelendi (pj.facility_code, pj.system_kwp, pj.install_date,
--    pj.created_at, pj.lead_id).
--
--  ⚠️ DEĞİŞMEYEN — ÖNEMLİ
--    Sahiplik kuralı olduğu gibi duruyor:  where l.investor_id = auth.uid()
--    Bu fonksiyon SECURITY DEFINER; o satır yanlış yazılsaydı panel başka
--    yatırımcıların başvurularını gösterirdi. Tek harfi değiştirilmedi.
--    Dönüş tipi, sütun sırası ve geri kalan sorgu da birebir aynı.
-- ============================================================================

create or replace function public.list_my_projects()
returns table (
    id           uuid,
    tracking_code text,
    full_name    text,
    address      text,
    status       text,
    created_at   timestamp with time zone,
    company_id   uuid,
    company_name text,
    steps_total  integer,
    steps_done   integer,
    current_step text,
    facility_code text,
    system_kwp   numeric,
    install_date date
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total int;
begin
  select count(*)::int into v_total from public.process_steps;

  return query
  select
    l.id,
    l.tracking_code,
    l.full_name,
    l.address,
    l.status,
    l.created_at,
    l.company_id,
    c.name,
    v_total,
    (select count(*)::int
       from public.process_steps p
      where p.slug in (
        select jsonb_array_elements_text(
          case when jsonb_typeof(l.completed_steps) = 'array'
               then l.completed_steps else '[]'::jsonb end))),
    (select p.title
       from public.process_steps p
      where p.slug not in (
        select jsonb_array_elements_text(
          case when jsonb_typeof(l.completed_steps) = 'array'
               then l.completed_steps else '[]'::jsonb end))
      order by p.sort_order
      limit 1),
    pr.facility_code,
    pr.system_kwp,
    pr.install_date
  from public.leads l
  left join public.companies c on c.id = l.company_id
  left join lateral (
    -- ⚠️ TAKMA AD ŞART: kolonlar nitelenmezse RETURNS TABLE'daki aynı adlı
    -- çıktı değişkenleriyle çakışıyor ve fonksiyon 42702 ile patlıyor.
    select pj.facility_code, pj.system_kwp, pj.install_date
    from public.projects pj
    where pj.lead_id = l.id
    order by pj.created_at
    limit 1
  ) pr on true
  where l.investor_id = auth.uid()
  order by l.created_at desc;
end $function$;

-- KONTROL — hata vermeden dönmeli (yatırımcı hesabıyla kendi başvuruları,
-- başka hesapla boş liste):
--   select * from public.list_my_projects();
