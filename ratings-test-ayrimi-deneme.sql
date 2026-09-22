-- ============================================================================
--  ratings-test-ayrimi-deneme.sql   — AYRI DOSYA, sonu `rollback`
--
--  Kurulum dosyasıyla aynı yerde yaşayamaz: Supabase betiği TEK İŞLEM olarak
--  çalıştırır, sondaki rollback create/alter'ı da geri alır. (Bir kez oldu.)
--
--  ⚠️ Supabase yalnız SON ifadenin sonucunu gösterir — bu yüzden bütün
--  kontroller tek bir select'te toplandı.
--
--  Dört soru:
--   1) Kurulum gerçekten oturdu mu? (kolon + tetikleyici + hesap listesi)
--   2) Test hesabının puanı OTOMATİK işaretleniyor mu? gizli.test_hesaplari
--      üzerinde RLS AÇIK; tetikleyici listeyi göremezse hiç işaretlemez ve
--      hata da vermez — sessizce çalışmayan koruma. Asıl sınanan bu.
--   3) Listede OLMAYAN hesabın puanı gerçek kalıyor mu? (yoksa bayrak her
--      şeyi yutar, gerçek yorum da görünmez)
--   4) Ziyaretçiye açık özetler testi dışlayıp gerçeği geçiriyor mu?
-- ============================================================================
begin;

-- (2) test hesabından bir puan
insert into public.ratings (lead_id, investor_id, hedef_tip, puan, yorum, yorum_durum)
select null, t.user_id, 'platform', 5, 'DENEME — test hesabından', 'approved'
  from gizli.test_hesaplari t order by t.eposta limit 1;

-- (3) aynı hesabı listeden çıkar, yeni puanı gerçek sayılmalı
delete from gizli.test_hesaplari
 where user_id = (select investor_id from public.ratings where yorum = 'DENEME — test hesabından');

insert into public.ratings (lead_id, investor_id, hedef_tip, hedef_id, puan, yorum, yorum_durum)
select null, r.investor_id, 'company', gen_random_uuid(), 4, 'DENEME — gerçek sayılmalı', 'approved'
  from public.ratings r where r.yorum = 'DENEME — test hesabından';


select * from (
    select 1 as s, 'kolon test_mi var mı' as kontrol,
           (select count(*)::text from information_schema.columns
             where table_schema='public' and table_name='ratings' and column_name='test_mi') as sonuc,
           '1' as beklenen
    union all
    select 2, 'tetikleyici var mı',
           (select count(*)::text from pg_trigger where tgname='ratings_test_trg' and not tgisinternal), '1'
    union all
    select 3, 'tetikleyici INSERT + UPDATE mi',
           (select (tgtype & 4 > 0 and tgtype & 16 > 0)::text from pg_trigger where tgname='ratings_test_trg'), 'true'
    union all
    select 4, 'listede kalan test hesabı (biri silindi)',
           (select count(*)::text from gizli.test_hesaplari), '3'
    union all
    select 5, '★ test hesabının puanı otomatik işaretlendi mi',
           (select case when test_mi then 'true — ✅' else 'false — ❌ RLS tetikleyiciyi körleştirdi' end
              from public.ratings where yorum = 'DENEME — test hesabından'), 'true — ✅'
    union all
    select 6, 'listede olmayan hesabın puanı gerçek kaldı mı',
           (select case when test_mi then 'test — ❌' else 'gerçek — ✅' end
              from public.ratings where yorum = 'DENEME — gerçek sayılmalı'), 'gerçek — ✅'
    union all
    select 7, 'platform_puani.adet (tek platform puanı test)',
           (select adet::text from public.platform_puani()), '0'
    union all
    select 8, 'platform_deneyimi satır sayısı',
           (select count(*)::text from public.platform_deneyimi(6)), '0'
    union all
    select 9, 'firma_puan_ozeti.adet (gerçek puan görünmeli)',
           (select adet::text from public.firma_puan_ozeti(
                (select hedef_id from public.ratings where yorum = 'DENEME — gerçek sayılmalı'))), '1'
) t order by s;

rollback;
