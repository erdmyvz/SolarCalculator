-- ============================================================================
--  depo-silme-politikasi.sql — support-images kovasının erişim düzeni
--
--  İKİ AYRI SORUN VARDI.
--
--  1) SİLME YOKTU. Kovada yalnız SELECT ve INSERT politikaları vardı. Servis
--     talebiyle yüklenen arıza fotoğrafları hiçbir şekilde silinemiyordu — ne
--     panelden, ne Storage API'sinden, ne SQL'den (storage.protect_delete()
--     doğrudan DELETE'i engelliyor, API ise politika bulamıyor).
--     Sonuçları: spam yüklemeler kalıcı olarak birikiyordu ve KVKK kapsamında
--     müşteri verisinin silinmesi istendiğinde servis kaydı siliniyor, ama
--     FOTOĞRAFLAR sistemde kalıyordu.
--
--  2) KOVA PUBLIC'Tİi. Asıl mesele buydu. storage.buckets.public = true iken
--     nesneler /object/public/... yolundan RLS'e HİÇ BAKILMADAN servis edilir.
--     Yani dosya adını bilen herkes, giriş yapmadan müşterinin arıza
--     fotoğrafını açabiliyordu. Adlar sistem_<zaman damgası>.png biçiminde,
--     rastgele değil.
--
--     ⚠️ Yalnız anon SELECT politikasını kaldırmak bu sorunu ÇÖZMEZ; denendi
--     ve dosya hâlâ indirilebiliyordu. public bayrağı kapatılmadan politika
--     okunmuyor bile.
--
--  Panel görselleri createSignedUrl ile açıyor (admin.js). İmzalı bağlantı
--  hem RLS'ten hem public bayrağından bağımsız çalıştığı için panel
--  etkilenmedi. Yükleme ayrı INSERT politikalarında, ziyaretçi formu da
--  etkilenmedi.
-- ============================================================================

-- 1) Admin silebilsin
drop policy if exists support_images_admin_delete on storage.objects;
create policy support_images_admin_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'support-images' and public.is_admin());

-- 2) Anonim okuma politikası kaldırıldı (tek başına yetersiz ama gereksiz de)
drop policy if exists "Allow Public Uploads and Reads 18lauu_0" on storage.objects;

-- 3) ASIL DÜZELTME: kova artık private
update storage.buckets set public = false where id = 'support-images';

-- ---------------------------------------------------------------------------
--  DOĞRULAMA
--  Beklenen: public=false, politikalar DELETE(admin) · INSERT(anon) · SELECT(auth)
-- ---------------------------------------------------------------------------
select 'kova' as ne, id || ' | public=' || public::text as deger
  from storage.buckets where id = 'support-images'
union all
select 'politika', cmd || ' — ' || policyname || ' [' || array_to_string(roles,',') || ']'
  from pg_policies
 where schemaname='storage' and tablename='objects'
   and (coalesce(qual,'') ilike '%support-images%'
        or coalesce(with_check,'') ilike '%support-images%'
        or policyname ilike '%support_images%'
        or policyname ilike '%Public Uploads%')
 order by 1, 2;
