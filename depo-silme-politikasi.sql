-- ============================================================================
--  depo-silme-politikasi.sql — support-images kovasına admin silme yetkisi
--
--  SORUN: Kovada yalnız SELECT ve INSERT politikaları vardı. Servis talebiyle
--  yüklenen arıza fotoğrafları HİÇBİR ŞEKİLDE silinemiyordu — ne panelden,
--  ne Storage API'sinden, ne de SQL'den (storage.protect_delete() tetikleyicisi
--  doğrudan DELETE'i engelliyor, API ise politika bulamıyor).
--
--  İki somut sonucu vardı:
--   1) Spam/test yüklemeleri kovada kalıcı olarak birikiyordu.
--   2) KVKK: müşteri verilerinin silinmesini istediğinde servis kaydı
--      siliniyor ama YÜKLEDİĞİ FOTOĞRAFLAR sistemde kalıyordu. Silme hakkı
--      fiilen kullanılamıyordu.
--
--  Yetki yalnız adminde; yükleyen ziyaretçi kendi dosyasını da silemez
--  (talep kaydıyla fotoğrafın eşleşmesi yöneticinin kontrolünde kalsın).
-- ============================================================================

drop policy if exists support_images_admin_delete on storage.objects;
create policy support_images_admin_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'support-images' and public.is_admin());

-- ---------------------------------------------------------------------------
--  DOĞRULAMA
-- ---------------------------------------------------------------------------
select cmd || ' — ' || policyname || ' [' || array_to_string(roles,',') || ']' as politika
  from pg_policies
 where schemaname='storage' and tablename='objects'
   and (coalesce(qual,'') ilike '%support-images%' or policyname ilike '%support_images%'
        or policyname ilike '%Public Uploads%')
 order by cmd, policyname;
