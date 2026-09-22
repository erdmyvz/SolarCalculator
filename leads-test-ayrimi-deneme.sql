-- ============================================================================
--  leads-test-ayrimi-deneme.sql   — AYRI DOSYA, sonu `rollback`
--  ⚠️ Supabase yalnız SON ifadenin sonucunu gösterir → tek select.
--
--  Asıl sınanan (3): ZİYARETÇİ FORMU YOLU. submit_lead anonim çalışır,
--  investor_id NULL gelir. Yalnız investor_id'ye bakan bir kapı, sizin en sık
--  yapacağınız testi — formu doldurup göndermeyi — kaçırırdı.
-- ============================================================================
begin;

-- (3) anonim + test e-postası  → test sayılmalı
insert into public.leads (tracking_code, source, full_name, phone, email, address, status, company_id)
values ('DENEME-ANON-TEST', 'website', 'Deneme Anonim', '0', 'YAVUZMEDYA@outlook.com',
        'x', 'tamamlandi', '8d455eb3-72d2-4ef3-b9bf-cf13a005e6b6');

-- (4) anonim + yabancı e-posta → gerçek kalmalı
insert into public.leads (tracking_code, source, full_name, phone, email, address, status, company_id)
values ('DENEME-ANON-GERCEK', 'website', 'Deneme Gerçek', '0', 'birileri@ornek.com',
        'x', 'tamamlandi', '8d455eb3-72d2-4ef3-b9bf-cf13a005e6b6');

-- (5) gerçek başlayıp sonradan test hesabına bağlanan kayıt (claim_my_leads yolu)
insert into public.leads (tracking_code, source, full_name, phone, email, address, status)
values ('DENEME-CLAIM', 'website', 'Deneme Claim', '0', 'baska@ornek.com', 'x', 'yeni_basvuru');

update public.leads
   set investor_id = (select user_id from gizli.test_hesaplari
                       where lower(eposta) = 'yavuzmedya@outlook.com')
 where tracking_code = 'DENEME-CLAIM';


select * from (
    select 1 as s, 'kolon test_mi var mı' as kontrol,
           (select count(*)::text from information_schema.columns
             where table_schema='public' and table_name='leads' and column_name='test_mi') as sonuc,
           '1' as beklenen
    union all
    select 2, 'tetikleyici INSERT + UPDATE mi',
           (select (tgtype & 4 > 0 and tgtype & 16 > 0)::text from pg_trigger where tgname='leads_test_trg'),
           'true'
    union all
    select 3, 'eski kayıtlardan bayraksız kalan',
           (select count(*)::text from public.leads
             where test_mi = false and tracking_code not like 'DENEME-%'), '0'
    union all
    select 4, '★ anonim form + test e-postası',
           (select case when test_mi then 'test — ✅' else 'gerçek — ❌ form yolu kaçtı' end
              from public.leads where tracking_code='DENEME-ANON-TEST'), 'test — ✅'
    union all
    select 5, 'anonim form + yabancı e-posta',
           (select case when test_mi then 'test — ❌ her şeyi yutuyor' else 'gerçek — ✅' end
              from public.leads where tracking_code='DENEME-ANON-GERCEK'), 'gerçek — ✅'
    union all
    select 6, 'sonradan test hesabına bağlanan (claim)',
           (select case when test_mi then 'test — ✅' else 'gerçek — ❌ UPDATE kapısı yok' end
              from public.leads where tracking_code='DENEME-CLAIM'), 'test — ✅'
    union all
    select 7, '★ tamamlanan_is (1 test + 1 gerçek kurulum)',
           (select tamamlanan_is::text from public.firma_puan_ozeti('8d455eb3-72d2-4ef3-b9bf-cf13a005e6b6')),
           '1 — yalnız gerçek sayılmalı'
    union all
    select 8, 'en_yakin_firmalar aynı sayıyı mı veriyor',
           (select tamamlanan_is::text from public.en_yakin_firmalar('İstanbul','Kartal',3,2)
             where company_id = '8d455eb3-72d2-4ef3-b9bf-cf13a005e6b6'),
           '1 — sıralama da bu sayıyı kullanıyor'
    union all
    select 9, 'lead_test_isaretle kurulu ve yönetici kapılı mı',
           (select case when exists (
                     select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='public' and p.proname='lead_test_isaretle')
                   then 'kurulu' else 'YOK' end), 'kurulu'
) t order by s;

rollback;
