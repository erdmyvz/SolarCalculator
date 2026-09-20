-- ============================================================================
--  kendini-onaylama-kapisi.sql
--
--  NE BULUNDU — DANIŞMAN VE FİRMA KENDİNİ ONAYLAYABİLİYOR
--  danisman-onay-kapisi.sql ile "reddedilmiş danışman danışan aktaramaz"
--  kapısı kondu. Kapının işe yarayıp yaramadığını sınarken asıl sorun çıktı:
--  danışman kendi `status` kolonunu yazabiliyor. Canlıda kanıtlandı
--  (denemeden hemen sonra eski hâline döndürüldü):
--
--      from('consultants').update({ status: 'approved' }).eq('id', kendi_id)
--      → hata yok, status 'rejected' → 'approved'
--
--  Yani tarayıcı konsolunda tek satırla kendini onaylıyor. Yeni kapı da,
--  yönetimin onay/ret akışının tamamı da bununla anlamsız hâle geliyordu.
--
--  POLİTİKALAR AÇIĞI GÖSTERİYOR:
--      consultants_update  USING (auth.uid() = id OR is_admin())
--                          WITH CHECK (auth.uid() = id OR is_admin())
--      companies_update    USING (id = auth_company_id() OR is_admin())
--                          WITH CHECK yok
--
--  RLS "bu SATIRI yazabilir misin" sorusuna cevap verir, "bu KOLONU yazabilir
--  misin" sorusuna değil. Satır kendisinin olduğu için bütün kolonlar açık.
--
--  ⚠️ FİRMADA DAHA PAHALI: companies'te `status` yok ama `sub_status` ve
--  `sub_ends_at` var. Yani firma kendine süresiz ücretsiz abonelik yazabilir
--  ve `banned = false` diyerek yasağı kaldırabilir. Abonelik geliri, tahsil
--  edilmeden önce daha veritabanında açık.
--
--  ÇÖZÜM — PROJEDE ZATEN VAR OLAN KALIP
--  tedarikci-onaya-gonder-duzelt.sql `suppliers_guard` ile bunu çözmüş:
--  hassas kolonlar BEFORE UPDATE'te eski değerine sabitleniyor, tek serbest
--  geçiş "kendi profilini onaya sunmak". Aynı koruma consultants ve
--  companies'te YOKTU — iki tablo kalıbın dışında kalmış.
--
--  ⚠️ RED SESSİZ DEĞİL. Yasak geçiş hata fırlatıyor. Sessizce geri alsaydık
--  ekran yine "kaydedildi" derdi ve bu projede defalarca çıkan aynı kusuru
--  bir kez daha üretirdik.
-- ============================================================================


-- ============================================ 1) DANIŞMAN
create or replace function public.consultants_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Admin her şeyi yapabilir (onay/ret, abonelik, ban).
    if public.is_admin() then return new; end if;

    -- Danışmana HER ZAMAN kapalı kolonlar.
    new.sub_status  := old.sub_status;
    new.sub_ends_at := old.sub_ends_at;
    new.banned      := old.banned;
    new.ban_reason  := old.ban_reason;

    -- Olağan profil kaydı: statüye dokunulmuyor.
    if new.status is not distinct from old.status then
        new.reject_reason := old.reject_reason;
        return new;
    end if;

    -- Tek serbest geçiş: onaya sunmak.
    if new.status = 'pending' and coalesce(old.status, 'draft') in ('draft', 'rejected') then
        if coalesce(btrim(new.full_name), '') = '' then
            raise exception 'Onaya göndermeden önce ad soyad girin.';
        end if;
        if coalesce(btrim(new.title), '') = '' then
            raise exception 'Onaya göndermeden önce unvanınızı girin.';
        end if;
        -- ⚠️ Tanıtım yazısı zorunlu: yatırımcı danışmanı bu metinle seçiyor.
        -- Boş tanıtımla onaya gelen profil zaten reddediliyordu; kural
        -- arayüzde değil BURADA olmalı.
        if coalesce(length(btrim(new.bio)), 0) < 30 then
            raise exception 'Onaya göndermeden önce en az 30 karakterlik bir tanıtım yazın.';
        end if;
        new.reject_reason := null;   -- yeniden başvuru: eski gerekçe düşsün
        return new;
    end if;

    raise exception 'Profil onay durumunu kendiniz değiştiremezsiniz (% → %).',
        coalesce(old.status, 'draft'), new.status;
end $$;

drop trigger if exists consultants_guard_trg on public.consultants;
create trigger consultants_guard_trg before update on public.consultants
    for each row execute function public.consultants_guard();


-- ============================================ 2) FİRMA
-- companies'te `status` kolonu YOK (firmanın onay akışı yok); korunacak olan
-- yalnız abonelik ve yasak kolonları. Ama korunması daha acil: burada doğrudan
-- para var.
create or replace function public.companies_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if public.is_admin() then return new; end if;

    new.sub_status  := old.sub_status;
    new.sub_ends_at := old.sub_ends_at;
    new.banned      := old.banned;
    new.ban_reason  := old.ban_reason;

    return new;
end $$;

drop trigger if exists companies_guard_trg on public.companies;
create trigger companies_guard_trg before update on public.companies
    for each row execute function public.companies_guard();


-- ============================================ 3) AÇIK KULLANILMIŞ MI
-- ⚠️ Kapıyı kapatmadan önce sorulması gereken soru: bu açık kullanıldı mı?
-- Cevabı bilmeden "kapattık" demek eksik olur. Elle uzatılan abonelikler
-- meşrudur; burada aranan, yönetimin haberi olmadan uzamış olma ihtimali.
select 'firma'  as tur, c.name as ad, c.sub_status, c.sub_ends_at
  from public.companies c
 where c.sub_status = 'active' and c.sub_ends_at > now() + interval '1 year'
union all
select 'danışman', co.full_name, co.sub_status, co.sub_ends_at
  from public.consultants co
 where co.sub_status = 'active' and co.sub_ends_at > now() + interval '1 year'
union all
select 'danışman (onaylı)', co.full_name, co.status, co.updated_at
  from public.consultants co
 where co.status = 'approved';


notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA — açığın kapandığını görmek için
--  (danışman hesabıyla, tarayıcı konsolunda)
--
--      const u = (await supabaseClient.auth.getUser()).data.user;
--      await supabaseClient.from('consultants')
--            .update({ status: 'approved' }).eq('id', u.id);
--      → hata: "Profil onay durumunu kendiniz değiştiremezsiniz
--               (rejected → approved)."
--
--      await supabaseClient.from('consultants')
--            .update({ sub_ends_at: '2099-01-01' }).eq('id', u.id);
--      → hata YOK ama değer DEĞİŞMEZ: kolon sessizce eskiye sabitleniyor.
--        (Abonelikte hata fırlatmıyoruz; profil kaydı sırasında yanlışlıkla
--         gönderilen alan yüzünden danışmanın kaydı kaybolmasın.)
-- ============================================================================
