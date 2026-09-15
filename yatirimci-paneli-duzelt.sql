-- ============================================================================
--  yatirimci-paneli-duzelt.sql  (2. sürüm)
--  "⚠️ Verileriniz şu an yüklenemedi" — yatırımcı panelindeki hata
--
--  TEŞHİS (sunucudan doğrulandı):
--    list_my_projects() şu hatayı döndürüyor:
--      42702: column reference "facility_code" is ambiguous
--      "It could refer to either a PL/pgSQL variable or a table column."
--
--    Fonksiyonun içinde "facility_code" İKİ ANLAMA geliyor: fonksiyonun
--    çıktı kolonu (RETURNS TABLE) ve sorgudaki tablo kolonu. PostgreSQL
--    hangisi olduğunu bilemeyip sorguyu reddediyor.
--
--  ⚠️ 1. SÜRÜMDEKİ ÇÖZÜM SUPABASE'TE ÇALIŞMIYOR
--    alter function ... set plpgsql.variable_conflict = 'use_column';
--    → ERROR 42501: permission denied to set parameter
--    Bu parametreyi ayarlamak superuser yetkisi istiyor; Supabase vermiyor.
--    Tek yol fonksiyonu kolonları takma adla niteleyerek yeniden yazmak.
--
--  list_my_quotes() ve claim_my_leads() sorunsuz; bozuk olan yalnız bu.
-- ============================================================================

-- ---------------------------------------------------------------- ADIM 1/2
-- Fonksiyonun MEVCUT hâlini dökün ve çıktıyı bana gönderin.
-- Tek satır, hiçbir şeyi değiştirmez:

select pg_get_functiondef('public.list_my_projects'::regproc);

-- ---------------------------------------------------------------- ADIM 2/2
-- Çıktıyı görünce doğru sürümü buraya yazacağım: aynı sorgu, ama her kolon
-- tablo takma adıyla (p.facility_code gibi) nitelenmiş olacak. Çakışma
-- kaynağında biter, bir daha oluşmaz.
--
-- NEDEN GÖVDEYİ TAHMİNLE YAZMIYORUM
-- Bu fonksiyon SECURITY DEFINER: çağıranın değil, sahibinin yetkisiyle
-- çalışıyor ve RLS'i atlıyor. "Hangi kayıtlar bu yatırımcınındır" kuralını
-- yanlış yazarsam panel BAŞKA yatırımcıların başvurularını, telefonlarını
-- ve tekliflerini gösterebilir. Tahminle dokunulacak yer değil.
-- ============================================================================
