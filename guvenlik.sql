-- ============================================================================
--  guvenlik.sql — quote_products maliyet tablosunu anonim erişime kapat
--  Supabase SQL Editor'de çalıştırın.
--
--  BULGU (7 Eylül 2026, canlıda doğrulandı):
--  quote_products tablosunun 33 satırının tamamı, giriş yapmadan, tarayıcı
--  konsolundan okunabiliyor. Tablo default_cost_usd kolonunu taşıyor ve bir GES
--  kurulumunun tüm maliyet kalemlerini kapsıyor: panel, inverter, battery,
--  construction, cable, panel_board, meter, labor, engineering, logistics,
--  grounding, safety, monitoring, insurance ($1 – $3.400 aralığı).
--
--  NEDEN ÖNEMLİ: Bu, kurulumcu firmaların teklif kurarken kullandığı referans
--  maliyet tabanı. Açıkta olması (a) müşterinin firmanın marjını hesaplamasına,
--  (b) rakibin tüm maliyet modelini görmesine izin verir.
--
--  ETKİSİ YOK: Tabloyu yalnızca quote.js okuyor ve orası da giriş yapmış
--  kurulumcu panelinde çalışıyor (loadQuoteData company_id yoksa erken dönüyor).
--  Ziyaretçi hesaplayıcıları bu tabloyu değil app_settings'i kullanıyor.
-- ============================================================================

alter table public.quote_products enable row level security;

-- Varsa eski açık politikaları kaldır (adları projeye göre değişebilir).
drop policy if exists quote_products_read      on public.quote_products;
drop policy if exists quote_products_anon_read on public.quote_products;
drop policy if exists qp_read                  on public.quote_products;

-- Okuma: yalnız giriş yapmış kullanıcılar.
create policy qp_auth_read on public.quote_products
    for select to authenticated using (true);

-- Yazma: yalnız admin.
drop policy if exists qp_admin_write on public.quote_products;
create policy qp_admin_write on public.quote_products
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
--  DOĞRULAMA
--  Çalıştırdıktan sonra epcmerkezim.com'da, GİRİŞ YAPMADAN tarayıcı konsolunda:
--
--    (await supabaseClient.from('quote_products').select('*')).data.length
--
--  0 dönmeli. Giriş yapmış bir kurulumcu hesabında 33 dönmeli ve teklif
--  motorundaki ürün kataloğu eskisi gibi dolmalı.
-- ---------------------------------------------------------------------------
