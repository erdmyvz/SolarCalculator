-- ============================================================================
--  tedarikci-hesap-onar.sql
--
--  NE İŞE YARAR
--  Bir hesabın neden tedarikçi paneline giremediğini GÖSTERİR ve gerekiyorsa
--  elle onarır. Uygulama tarafındaki iki hata düzeltildi:
--
--    1) getAccountInfo() profiles.role = 'investor' okuyunca ORADA dönüyordu;
--       suppliers tablosuna hiç bakmıyordu. Gerçek tedarikçi yatırımcı
--       paneline düşüyordu. Artık suppliers satırı önceliklidir.
--
--    2) Kayıt akışı, e-posta doğrulaması zorunluyken signInWithPassword'e
--       takılıp suppliers satırını AÇAMADAN "✅ Kaydınız oluşturuldu"
--       diyordu. Artık ilk girişte ekranda tamamlatılıyor.
--
--  Bu dosya YALNIZCA şu durum için gerekli: hesap en baştan YATIRIMCI olarak
--  açılmışsa (auth metadata'sında role = 'investor'). O hesabı uygulama
--  kendi başına tedarikçiye çeviremez — çevirebilseydi herhangi bir
--  yatırımcı kendini tedarikçi ilan edebilirdi.
--
--  ⚠️ Supabase SQL Editor'da çalıştırın (service_role). Sırayla gidin.
-- ============================================================================


-- ===========================================================================
--  1) TANI — bu hesap sistemde ne görünüyor?
--  E-postayı kendi adresinizle değiştirin.
-- ===========================================================================
select
    u.id,
    u.email,
    u.email_confirmed_at is not null            as eposta_dogrulandi,
    u.raw_user_meta_data ->> 'role'             as kayit_rolu,
    u.raw_user_meta_data ->> 'company_name'     as kayit_unvani,
    p.role                                      as profiles_rolu,
    (s.id is not null)                          as suppliers_satiri_var,
    s.status                                    as tedarikci_durumu,
    (c.id is not null)                          as consultants_satiri_var
from auth.users u
left join public.profiles    p on p.id = u.id
left join public.suppliers   s on s.id = u.id
left join public.consultants c on c.id = u.id
where u.email = 'BURAYA_EPOSTA_YAZIN';

-- Sonucu nasıl okursunuz:
--   suppliers_satiri_var = true  → uygulamadaki düzeltmeden sonra tedarikçi
--                                  paneline girer. BAŞKA BİR ŞEY YAPMAYIN.
--   suppliers_satiri_var = false ve kayit_rolu = 'supplier'
--                                → ilk girişte ekran kaydı tamamlatır.
--                                  BAŞKA BİR ŞEY YAPMAYIN.
--   suppliers_satiri_var = false ve kayit_rolu <> 'supplier'
--                                → hesap yatırımcı/kurulumcu olarak açılmış.
--                                  Aşağıdaki 2. adım gerekir.


-- ===========================================================================
--  2) YATIRIMCI OLARAK AÇILMIŞ HESABI TEDARİKÇİYE ÇEVİR
--  İki değeri doldurun ve bloğu çalıştırın.
-- ===========================================================================
do $$
declare
    v_eposta text := 'BURAYA_EPOSTA_YAZIN';
    v_unvan  text := 'BURAYA RESMİ FİRMA ÜNVANI';
    v_id     uuid;
begin
    select id into v_id from auth.users where email = v_eposta;
    if v_id is null then
        raise exception 'Böyle bir hesap yok: %', v_eposta;
    end if;
    if coalesce(trim(v_unvan), '') = '' or v_unvan like 'BURAYA%' then
        raise exception 'Firma ünvanını doldurun.';
    end if;

    -- suppliers satırı: 'draft' açılır, tedarikçi profili tamamlayıp onaya gönderir.
    insert into public.suppliers (id, company_name, full_name, email, phone, status)
    select v_id,
           v_unvan,
           coalesce(u.raw_user_meta_data ->> 'full_name', ''),
           u.email,
           coalesce(u.raw_user_meta_data ->> 'phone', ''),
           'draft'
      from auth.users u
     where u.id = v_id
    on conflict (id) do nothing;

    -- Kayıt metadata'sı da tedarikçiye çevrilir; yoksa uygulama her girişte
    -- hesabı yatırımcı sayma ihtimalini taşır.
    update auth.users
       set raw_user_meta_data =
           coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('role', 'supplier', 'company_name', v_unvan)
     where id = v_id;

    -- ⚠️ profiles.role'a DOKUNULMUYOR.
    -- Uygulamadaki yeni öncelik sırası suppliers satırını zaten üste alıyor.
    -- Silmek/değiştirmek, o satıra bağlı başka kayıtları (varsa) kırabilir.
    -- Yine de temizlemek isterseniz aşağıdaki satırın yorumunu kaldırın:
    -- delete from public.profiles where id = v_id and role = 'investor';

    raise notice 'Tamam: % artık tedarikçi (id %).', v_eposta, v_id;
end $$;


-- ===========================================================================
--  3) DOĞRULA — 1. adımı tekrar çalıştırın.
--     suppliers_satiri_var = true, tedarikci_durumu = 'draft' görmelisiniz.
--     Ardından hesapla giriş yapın: Tedarikçi paneli açılır.
--     Firma Profili ekranından bilgileri tamamlayıp onaya gönderin;
--     onaylanana kadar stok kalemleriniz kurulumculara görünmez.
-- ===========================================================================
