-- ============================================================================
--  tarife-epdk.sql — Elektrik tarifeleri, EPDK resmi tablosundan
--
--  KAYNAK: EPDK "4 Nisan 2026 Tarihinden İtibaren Geçerli Vergiler Hariç
--          Elektrik Tarifeleri" — Dağıtım Sistemi Kullanıcıları / AG Tek Terim
--          https://www.epdk.gov.tr/Detay/Icerik/3-1327/elektrik-faturalarina-esas-tarife-tablolari
--
--  HESAP (kr/kWh → TL/kWh, vergiler dahil):
--    toplam = (enerji + dağıtım + enerji×%1 fon + enerji×BTV) × 1,20 KDV
--    BTV: mesken ve ticarethanede %5, sanayi ve tarımda %1
--
--    grup                         enerji   dağıtım   ver.hariç   ver.dahil
--    Mesken  (8 kWh/gün altı)     49,4065  242,4900    2,9190      3,54
--    Mesken  (8 kWh/gün üstü)    189,5808  242,4900    4,3207      5,32
--    Ticaret (30 kWh/gün altı)   287,3087  247,9368    5,3525      6,63
--    Ticaret (30 kWh/gün üstü)   345,4688  247,9368    5,9341      7,37
--    Sanayi                      298,5253  182,9503    4,8148      5,85
--    Tarımsal                    233,3838  203,7247    4,3711      5,30
--
--  ⚠️ NE KESİN, NE DEĞİL:
--    · Enerji ve dağıtım bedelleri RESMİ TABLODAN — kesin.
--    · Vergi katmanı (fon, BTV, KDV) yukarıdaki kurala göre HESAPLANDI.
--      Faturanızla bir kez karşılaştırın; tutuyorsa tariffDogrulandi = 1 yapın.
--      Doğrulama: https://lisans.epdk.gov.tr/epvys-web/faces/pages/online/tarifeFatura/tarifeFatura.xhtml
--
--  ÖNCEKİ GEÇİCİ DEĞERLERDEN FARK: mesken %66, tarımsal %121 düşük girilmişti.
--  Düşük tarife = düşük tasarruf = uzun amortisman; yani platform GES'i
--  olduğundan kötü gösteriyordu.
-- ============================================================================

update public.app_settings set value = '5.32' where key = 'tariffMesken';
update public.app_settings set value = '6.63' where key = 'tariffTicarethane';
update public.app_settings set value = '5.85' where key = 'tariffSanayi';
update public.app_settings set value = '5.30' where key = 'tariffTarimsal';

-- Yeni kademeler (mesken düşük, ticarethane üst)
insert into public.app_settings (key, value, label, category)
select 'tariffMeskenDusuk', '3.54', 'Mesken — 8 kWh/gün altı (TL/kWh)', 'Fatura Analizi'
where not exists (select 1 from public.app_settings where key = 'tariffMeskenDusuk');

insert into public.app_settings (key, value, label, category)
select 'tariffTicarethaneUst', '7.37', 'Ticarethane — 30 kWh/gün üstü (TL/kWh)', 'Fatura Analizi'
where not exists (select 1 from public.app_settings where key = 'tariffTicarethaneUst');

-- 'tariff' eski yedek anahtarı da mesken ile hizalansın (bir yerde okunursa şaşırtmasın)
update public.app_settings set value = '5.32' where key = 'tariff';

-- KONTROL
--   select key, value from public.app_settings where key like 'tariff%' order by key;
--   Beklenen: tariff 5.32 · tariffDogrulandi 0 · tariffMesken 5.32
--             tariffMeskenDusuk 3.54 · tariffSanayi 5.85 · tariffTarimsal 5.30
--             tariffTicarethane 6.63 · tariffTicarethaneUst 7.37
