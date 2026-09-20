-- ============================================================================
--  yayin-hazirligi.sql
--
--  Sosyal medya kanalları açılmadan önce iki kayıt işi.
--
--  1) YANIT ADRESİ
--     Bildirim e-postaları yanıt adresi olmadan gidiyordu: firmanın "tamam,
--     ilgileniyorum" cevabı hiçbir yere ulaşmıyordu. Trafik artmadan önce
--     kapatılması gereken bir boşluk — kampanyadan gelen ilk firmanın ilk
--     refleksi cevap yazmak olur.
--
--  2) TEST DANIŞMANI LİSTEDEN ÇIKIYOR
--     Ziyaretçi sayfasındaki "Danışmanlık Al" bölümünde listelenen TEK
--     danışman "Danışman TesT" idi (bugün onay akışını sınamak için
--     onaylanmıştı). Gerçek ziyaretçinin göreceği ilk şey bu olurdu.
--
--     ⚠️ SİLİNMİYOR, YAYINDAN ÇIKIYOR. status='pending' → profil duruyor,
--     hesap çalışıyor, danışan kayıtları ve ölçüm satırları yerinde; yalnız
--     ziyaretçi listesinde görünmüyor. Gerçek bir danışmanla test etmek
--     gerekirse yönetim panelinden tek tıkla geri onaylanır.
--
--     ⚠️ consultants_guard approved→pending geçişine izin VERMİYOR (danışmanın
--     kendi statüsünü oynatmasını engellemek için, bilerek). Yönetici muaf ama
--     SQL editöründe auth.uid() yok, yani is_admin() false. Bu yüzden
--     tetikleyici tek işlemlik olarak devre dışı bırakılıp hemen geri
--     açılıyor — koruma kalkmıyor.
-- ============================================================================


-- ============================================ 1) YANIT ADRESİ
update gizli.eposta_ayar set yanit_adresi = 'erdem.yvz@hotmail.com';

select 'yanit_adresi' as ne, yanit_adresi as deger from gizli.eposta_ayar;


-- ============================================ 2) TEST DANIŞMANI YAYINDAN ÇIK
begin;

alter table public.consultants disable trigger consultants_guard_trg;

update public.consultants
   set status = 'pending', updated_at = now()
 where full_name = 'Danışman TesT' and status = 'approved';

alter table public.consultants enable trigger consultants_guard_trg;

commit;

-- Koruma geri açıldı mı, ve ziyaretçi ne görecek?
select 'guard etkin mi' as ne,
       (select (tgenabled <> 'D')::text from pg_trigger
         where tgname = 'consultants_guard_trg') as deger
union all
select 'ziyaretciye gorunen danisman',
       coalesce((select string_agg(full_name, ' · ') from public.consultants
                  where status = 'approved' and coalesce(banned,false) = false),
                '(hiç — liste boş görünecek)');


notify pgrst, 'reload schema';

-- ============================================================================
--  ⚠️ LİSTE ARTIK BOŞ. Ziyaretçi "Danışmanlık Al" bölümünde kimseyi görmeyecek.
--  Bu, sahte bir danışman göstermekten iyidir ama boş bölümün kendisi de
--  ziyaretçiye bir şey söylüyor: o bölümün "yakında" gibi dürüst bir boş
--  hâli var mı, kontrol edin. Yoksa bölümü yayından kaldırmak daha temiz olur.
-- ============================================================================
