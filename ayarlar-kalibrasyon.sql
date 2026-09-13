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

-- ---------------------------------------------------------------------------
--  ⚠️ BİLEREK DEĞİŞTİRİLMEYENLER
--
--  tariffMesken / tariffTicarethane / tariffSanayi / tariffTarimsal
--    Ulaşabildiğim kaynaklar BİRBİRİYLE ÇELİŞİYOR. Aynı tarih için bir site
--    mesken kademe 2,92/4,32 TL derken bir diğeri 2,59/3,92 diyor; ticarethane
--    için 6,42 ve 4,78 gibi iki ayrı rakam çıkıyor. EPDK'nın kendi sayfası
--    tabloları etkileşimli bir bileşenin arkasında tutuyor ve son tarife
--    değişikliğini 4 Nisan 2026 olarak gösteriyor.
--    Çelişen blog rakamlarından birini seçip platformun TEK KAYNAĞINA yazmak,
--    tam da kaçındığımız şey olurdu. Bu değerler faturadan kWh türetiyor ve
--    tasarrufu paraya çeviriyor — yani her hesabın altında duruyorlar.
--    Doğru rakamı bilen sizsiniz; yönetici panelinden girin.
--
--    DİKKAT — HANGİ RAKAM: platformun istediği, müşterinin kWh başına FİİLEN
--    ÖDEDİĞİ tutar (dağıtım bedeli, BTV, enerji fonu ve KDV DAHİL). Çünkü
--    · fatura ÷ bu değer = tüketilen kWh
--    · üretim × bu değer = kazanılan para
--    "Vergiler hariç enerji bedeli" girilirse iki hesap da yanlış çıkar.
--
--  usdPerKwp (panel + inverter $/kWp) ve batteryUsdPerKwh
--    Piyasa fiyatı. Sizin tedarikçi tekliflerinizden geliyor; dışarıdan
--    doğrulayamam.
--
--  pricePerKwp (30.000 TL/kWp)
--    ARTIK KULLANILMIYOR. Tek okuyucusu ziyaretçi ana sayfasındaki hızlı
--    hesaptı; o da epcTlPerKwp()'ye bağlandı (bu yüzden ana sayfa ile
--    hesaplayıcı %40 farklı yatırım tutarı gösteriyordu). Kayıt, eski
--    kurulumlar bozulmasın diye duruyor.
-- ---------------------------------------------------------------------------

-- KONTROL
--   select key, value from public.app_settings
--    where key in ('usdTry','solarYield','tariffMesken','usdPerKwp') order by key;
