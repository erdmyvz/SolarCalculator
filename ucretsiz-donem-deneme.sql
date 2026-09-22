-- ============================================================================
--  ucretsiz-donem-deneme.sql   — AYRI DOSYA, sonu `rollback`
--  ⚠️ Supabase yalnız SON ifadenin sonucunu gösterir → tek select.
--
--  Asıl sınananlar:
--   ★ 5) Ücretsiz dönem BİTTİĞİ GÜN kimse kilitlenmiyor mu? (uçurum testi)
--   ★ 7) Engelli firma ücretsiz dönemde de engelli mi?
-- ============================================================================
begin;

-- Süresi çoktan dolmuş bir firma: ücretsiz dönemde de, dönem biter bitmez de
-- engellenmemeli.
create temporary table _f on commit drop as
select id from public.companies where name = 'Enerji';

-- ⚠️ companies_guard sub_ends_at'ı sabitliyor ve SQL editöründe auth.uid()
-- olmadığı için yönetici sayılmıyoruz: korumayı kapatmadan yapılan bu
-- güncelleme HATA VERMEDEN geri alınır ve test hiçbir şey sınamamış olur.
-- (İlk yazımda tam olarak bu oldu; 'süresi dolmuş' sanılan firma aslında
-- 15.10.2026'ya kadar geçerliydi, uçurum testi boşa çalıştı.)
alter table public.companies disable trigger companies_guard_trg;
update public.companies set sub_ends_at = timestamptz '2026-08-01 00:00:00+03'
 where id in (select id from _f);
alter table public.companies enable trigger companies_guard_trg;

-- Kurulum gerçekten tuttu mu? Tutmadıysa aşağısı yalan söyler.
create temporary table _kurulum on commit drop as
select (select sub_ends_at::date::text from public.companies where id in (select id from _f)) as tarih;

create temporary table _sonuc on commit drop as
select
  -- (1-4) ücretsiz dönem AÇIKKEN
  (select aktif::text from public.ucretsiz_donem())                              as d1_aktif,
  (select bitis::text from public.ucretsiz_donem())                              as d2_bitis,
  (select deneme_bitisi::text from public.ucretsiz_donem())                      as d3_deneme,
  coalesce((select public.firma_abonelik_engeli(id) from _f), '(engel yok)')      as d4_engel;

-- ★ (5) DÖNEM DÜN BİTTİ diyelim — uçurum var mı?
update public.app_settings set value = 20260921 where key = 'ucretsizDonemBitis';

create temporary table _sonuc2 on commit drop as
select (select aktif::text from public.ucretsiz_donem())                         as d5_aktif,
       coalesce((select public.firma_abonelik_engeli(id) from _f), '(engel yok)') as d6_engel;

-- (6) DÖNEM ÇOK ÖNCE BİTTİ — artık engellenmeli
update public.app_settings set value = 20260701 where key = 'ucretsizDonemBitis';

create temporary table _sonuc3 on commit drop as
select coalesce(left((select public.firma_abonelik_engeli(id) from _f), 45), '(engel yok)') as d7_engel;

-- (7) BAN: ücretsiz dönem geri açık, ama firma engelli
update public.app_settings set value = 20261115 where key = 'ucretsizDonemBitis';
alter table public.companies disable trigger companies_guard_trg;
update public.companies set banned = true, ban_reason = 'deneme' where id in (select id from _f);
alter table public.companies enable trigger companies_guard_trg;


select * from (
  select 0 as s, '⚠️ kurulum tuttu mu (firma süresi dolmuş olmalı)' as kontrol,
         (select tarih from _kurulum) as sonuc, '2026-08-01' as beklenen
  union all
  select 1, 'ücretsiz dönem aktif mi',
         (select d1_aktif from _sonuc) as sonuc, 'true' as beklenen
  union all select 2, 'dönem bitişi',        (select d2_bitis from _sonuc),   '2026-11-15'
  union all select 3, 'deneme bitişi',       (select d3_deneme from _sonuc),  '2026-11-22'
  union all select 4, 'süresi dolmuş firma (dönem açıkken)',
                                             (select d4_engel from _sonuc),   '(engel yok)'
  union all select 5, '★ dönem DÜN bitti — aktif mi',
                                             (select d5_aktif from _sonuc2),  'false'
  union all select 6, '★ dönem DÜN bitti — kilitlendi mi (UÇURUM TESTİ)',
                                             (select d6_engel from _sonuc2),  '(engel yok)'
  union all select 7, 'dönem 3 ay önce bitti — artık engelli mi',
                                             (select d7_engel from _sonuc3),  'Aboneliğiniz … sona erdi'
  union all select 8, '★ engelli firma (dönem açıkken bile)',
                                             coalesce(left((select public.firma_abonelik_engeli(id) from _f), 40), '(engel yok)'),
                                             'Firma hesabı askıya alınmış…'
) t order by s;

rollback;
