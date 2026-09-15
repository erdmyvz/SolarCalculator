-- ============================================================================
--  yatirimci-paneli-duzelt.sql
--  "⚠️ Verileriniz şu an yüklenemedi" — yatırımcı panelindeki hatanın sebebi
--
--  TEŞHİS (sunucudan doğrulandı, tahmin değil):
--    list_my_projects() çağrısı şu hatayı döndürüyor:
--      42702: column reference "facility_code" is ambiguous
--      "It could refer to either a PL/pgSQL variable or a table column."
--
--    Yani fonksiyonun içinde "facility_code" adı İKİ ANLAMA geliyor:
--    fonksiyonun çıktı kolonu (RETURNS TABLE) ve sorgudaki tablo kolonu.
--    PostgreSQL hangisi olduğunu bilemeyip sorguyu reddediyor.
--    Arayüz hatayı doğru yakalıyor — bu yüzden "başvurunuz yok" yerine
--    dürüst bir uyarı gösteriyor. Sorun tamamen veritabanı tarafında.
--
--  list_my_quotes() ve claim_my_leads() sorunsuz çalışıyor; yalnız bu bozuk.
-- ============================================================================

-- ------------------------------------------------------------- HIZLI ÇÖZÜM
-- Fonksiyonun gövdesine hiç dokunmadan çakışmayı çözer: ad hem değişken hem
-- kolon olabiliyorsa KOLON kazanır — bu sorgunun zaten istediği davranış.
-- Tek satır, geri alınabilir ( ... reset plpgsql.variable_conflict ).
alter function public.list_my_projects()
    set plpgsql.variable_conflict = 'use_column';

-- KONTROL — bu satır hata vermeden boş liste veya kayıtları döndürmeli:
--   select * from public.list_my_projects();


-- ============================================================================
--  KALICI ÇÖZÜM (önerilen)
--  Yukarıdaki satır hatayı kapatır ama sebebi yerinde durur: fonksiyon
--  içindeki kolonlar tablo takma adıyla yazılırsa (p.facility_code gibi)
--  çakışma bir daha hiç oluşmaz.
--
--  Fonksiyonun mevcut hâlini göremediğim için gövdeyi ben yazmadım:
--  yanlış yazarsam bu SECURITY DEFINER fonksiyon BAŞKA yatırımcıların
--  kayıtlarını gösterebilir. Tahminle dokunulacak yer değil.
--
--  Şu sorguyu çalıştırıp çıktısını bana gönderin, doğru sürümü yazayım:
--
--      select pg_get_functiondef('public.list_my_projects'::regproc);
-- ============================================================================
