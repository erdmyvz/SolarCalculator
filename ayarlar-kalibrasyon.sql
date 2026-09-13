-- ============================================================================
--  ayarlar-kalibrasyon.sql — app_settings kalibrasyonu
--
--  BU BETİK YALNIZCA DOĞRULANABİLDİĞİM DEĞERİ DEĞİŞTİRİR.
--  Tarife ve kurulum bedeli DEĞİŞTİRİLMİYOR — gerekçesi aşağıda.
-- ============================================================================

-- --------------------------------------------------------- 1) USD/TRY KURU
--  KAYNAK: T.C. Merkez Bankası resmi gösterge kuru
--          tcmb.gov.tr/kurlar/today.xml · Bülten 2026/171 · 11.09.2026
--          Döviz alış 48,4305 · Döviz satış 48,5178
--
--  Kayıtlı değer 42 idi: gerçeğin %13 ALTINDA.
--  Bu kur epcTlPerKwp() içinde kurulum bedelini TL'ye çeviriyor
--  (usdPerKwp × usdTry). Yani platform, USD maliyetli bir sistemin TL
--  karşılığını sistematik olarak düşük gösteriyordu; fatura analizi ve
--  hesaplayıcılardaki geri ödeme süresi olduğundan kısa çıkıyordu.
--
--  ⚠️ KUR HER GÜN DEĞİŞİR. Bu tek seferlik bir düzeltmedir; yönetici
--  panelinden düzenli güncellenmeli.
update public.app_settings set value = '48.43' where key = 'usdTry';
insert into public.app_settings (key, value, label, category)
select 'usdTry', '48.43', 'USD/TRY kuru (₺)', 'Fatura Analizi'
where not exists (select 1 from public.app_settings where key = 'usdTry');

-- -------------------------------------------------- 2) ULUSAL ORTALAMA VERİM
--  81 ilin PVGIS değerlerinin düz ortalaması. Yalnız tabloda bulunmayan bir
--  konum için YEDEK olarak kullanılır; iller artık tek tek core.js'te.
--  (Nüfus ağırlıklı değil, düz ortalama — yedek değer olduğu için yeterli.)
update public.app_settings set value = '1406' where key = 'solarYield';

-- ------------------------------------------------------- 3) TARİFELER (GEÇİCİ)
--  ⚠️ BU DÖRT DEĞER DOĞRULANMADI.
--  Ulaşabildiğim kaynaklar birbiriyle çelişiyordu: aynı tarih için mesken
--  kademesini bir site 2,92/4,32 TL, bir diğeri 2,59/3,92 diyordu; ticarethane
--  için 6,42 ve 4,78 gibi iki ayrı rakam çıktı. EPDK kendi tablolarını
--  etkileşimli bir bileşenin arkasında tutuyor ve son tarife değişikliğini
--  4 Nisan 2026 olarak gösteriyor.
--
--  Aşağıdakiler, EPDK'nın "son değişiklik 4 Nisan 2026" bilgisiyle örtüşen
--  kaynaktan alınan rakamlar. "Şimdilik bir değer olsun" talebiniz üzerine
--  giriliyor — KESİN DEĞİL.
--
--  tariffDogrulandi = 0 olduğu sürece:
--    · Yönetici panelindeki Ayarlar sekmesinde kalın sarı bir uyarı durur
--    · Genel Bakış'taki Aksiyon Kuyruğu'na "tarifeler doğrulanmadı" satırı düşer
--  Böylece düzeltmeyi unutmak zor. Faturadan teyit edip alanı 1 yapınca ikisi
--  de kalkar.
--
--  GİRİLECEK RAKAM: müşterinin kWh başına FİİLEN ÖDEDİĞİ tutar — dağıtım
--  bedeli, BTV, enerji fonu ve KDV DAHİL. Kendi faturanızdan
--  "toplam tutar ÷ tüketilen kWh" ile bulabilirsiniz. Vergiler hariç enerji
--  bedeli girilirse hem fatura→kWh çevrimi hem tasarruf hesabı yanlış çıkar.
update public.app_settings set value = '3.21' where key = 'tariffMesken';
update public.app_settings set value = '6.42' where key = 'tariffTicarethane';
update public.app_settings set value = '5.26' where key = 'tariffSanayi';
update public.app_settings set value = '2.40' where key = 'tariffTarimsal';

insert into public.app_settings (key, value, label, category)
select 'tariffDogrulandi', '0', 'Tarifeleri faturadan teyit ettim (1 = evet)', 'Fatura Analizi'
where not exists (select 1 from public.app_settings where key = 'tariffDogrulandi');

-- ---------------------------------------------------------------------------
--  ⚠️ BİLEREK DEĞİŞTİRİLMEYENLER
--
--  usdPerKwp (panel + inverter $/kWp) ve batteryUsdPerKwh
--    Piyasa fiyatı. Sizin tedarikçi tekliflerinizden geliyor; dışarıdan
--    doğrulayamam. Kurulum bedelinin TL karşılığı usdPerKwp × usdTry ile
--    hesaplandığı için bu rakam geri ödeme süresini doğrudan belirliyor.
--
--  pricePerKwp (30.000 TL/kWp)
--    ARTIK KULLANILMIYOR. Tek okuyucusu ziyaretçi ana sayfasındaki hızlı
--    hesaptı; o da epcTlPerKwp()'ye bağlandı (bu yüzden ana sayfa ile
--    hesaplayıcı %40 farklı yatırım tutarı gösteriyordu). Kayıt, eski
--    kurulumlar bozulmasın diye duruyor.
-- ---------------------------------------------------------------------------

-- KONTROL
--   select key, value from public.app_settings
--    where key in ('usdTry','solarYield','tariffMesken','tariffTicarethane',
--                  'tariffSanayi','tariffTarimsal','tariffDogrulandi','usdPerKwp')
--    order by key;
--
--   Beklenen: usdTry 48.43 · solarYield 1406 · tariffDogrulandi 0
--             tariffMesken 3.21 · tariffTicarethane 6.42
--             tariffSanayi 5.26 · tariffTarimsal 2.40
