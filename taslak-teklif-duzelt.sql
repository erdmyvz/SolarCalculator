-- ============================================================================
--  taslak-teklif-duzelt.sql
--
--  NE OLDU
--  "Bu firma teklif verdi mi?" kontrolü şöyleydi:
--
--      coalesce(q.status, '') <> 'revised'
--
--  Yani REVİZE EDİLMİŞ dışındaki her teklifi sayıyor — TASLAK DAHİL.
--  Teklif sihirbazı ise kaydı her zaman 'draft' olarak açıyor (quote.js →
--  wzSave: status: 'draft'); firma teklifi ayrıca "Gönder" demeden müşteriye
--  ulaşmıyor.
--
--  SONUÇ: firma sihirbazı açıp kaydeder, göndermezse
--    · yatırımcının karşılaştırma ekranında o firma "teklif verdi" görünüyor
--    · "Bu firmayı seç" düğmesi AÇILIYOR
--    · yatırımcı HİÇ GÖRMEDİĞİ bir teklif yüzünden firma seçebiliyor
--
--  Canlıda üretildi: taslak teklif kaydedildi, firma_davetleri()
--  teklif_verdim = true döndü.
--
--  DÜZELTME
--  Yalnız MÜŞTERİYE ULAŞMIŞ teklifler sayılıyor: 'sent' ve 'accepted'.
--    · draft    → firma henüz göndermedi
--    · revised  → yerine yenisi geçti
--    · rejected → yatırımcı reddetti; "bu firmayı seç" için gerekçe değil
--
--  ⚠️ Bu dosya YALNIZCA iki fonksiyonun teklif kontrolünü değiştirir; imzalar,
--  yetkiler ve geri kalan mantık teklif-danismanligi.sql'deki hâliyle aynıdır.
-- ============================================================================


-- ----------------------------- 1) YATIRIMCININ GÖRDÜĞÜ DAVETLİ FİRMA LİSTESİ
create or replace function public.davetli_firmalar(p_lead_id uuid)
returns table (
    company_id uuid, firma text, il text, ilce text, yakinlik int,
    durum text, puan numeric, puan_adedi int, tamamlanan_is int, teklif_var boolean
)
language sql
stable
security definer
set search_path = public
as $$
    select c.id, c.name, c.city, c.district, la.yakinlik, la.durum,
           o.ortalama, o.adet, o.tamamlanan_is,
           -- ⚠️ YALNIZ GÖNDERİLMİŞ TEKLİF. Taslak sayılırsa yatırımcı
           -- görmediği bir teklif yüzünden firma seçebiliyordu.
           exists (select 1 from public.firm_quotes q
                    where q.lead_id = p_lead_id and q.company_id = c.id
                      and coalesce(q.status, '') in ('sent', 'accepted'))
    from public.lead_assignments la
    join public.companies c on c.id = la.company_id
    left join lateral public.firma_puan_ozeti(c.id) o on true
    where la.lead_id = p_lead_id
      and exists (select 1 from public.leads l
                   where l.id = p_lead_id
                     and (l.investor_id = auth.uid() or public.is_admin()))
    order by la.yakinlik, o.ortalama desc nulls last, c.name;
$$;


-- ------------------------------------ 2) FİRMANIN GÖRDÜĞÜ KENDİ DAVET LİSTESİ
create or replace function public.firma_davetleri()
returns table (
    assignment_id uuid, lead_id uuid, ad text, telefon text, eposta text,
    il text, ilce text, adres text, yakinlik int, durum text,
    rakip_sayisi int, teklif_verdim boolean, olusturma timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select la.id, l.id, l.full_name, l.phone, l.email,
           l.city, l.district, l.address, la.yakinlik, la.durum,
           (select count(*)::int - 1 from public.lead_assignments x where x.lead_id = l.id),
           -- Firmanın kendi ekranında da aynı ölçü: taslak "verdim" değildir.
           exists (select 1 from public.firm_quotes q
                    where q.lead_id = l.id and q.company_id = la.company_id
                      and coalesce(q.status, '') in ('sent', 'accepted')),
           l.created_at
    from public.lead_assignments la
    join public.leads l on l.id = la.lead_id
    where la.company_id = public.my_company_id()
      and l.company_id is null
    order by la.yakinlik, l.created_at desc;
$$;

grant execute on function public.davetli_firmalar(uuid) to authenticated;
grant execute on function public.firma_davetleri() to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA
--  Firma hesabıyla, taslak teklifi olan bir davette:
--      (await supabaseClient.rpc('firma_davetleri')).data
--  teklif_verdim artık FALSE olmalı. Teklifi "Gönder" ile yollayınca
--  (status → 'sent') TRUE olur ve yatırımcının "Bu firmayı seç" düğmesi açılır.
-- ============================================================================
