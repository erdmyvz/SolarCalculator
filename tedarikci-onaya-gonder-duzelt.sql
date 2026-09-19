-- ============================================================================
--  tedarikci-onaya-gonder-duzelt.sql
--
--  NE OLDU
--  Tedarikçi profilini onaya HİÇ gönderemiyordu; ekran ise "✅ Profiliniz
--  onaya gönderildi" diyordu. Canlıda üretildi (Yavuz Tedarik, 19.09.2026):
--
--      rpc('supplier_submit_for_review')  →  hata yok
--      suppliers.status                   →  hâlâ 'draft'
--
--  SEBEP
--  tedarikci.sql iki şey tanımlıyor ve birbirini kesiyorlar:
--
--    1) suppliers_guard_trg  (BEFORE UPDATE)
--         if public.is_admin() then return new; end if;
--         new.status := old.status;        ← statü değişikliğini GERİ ALIYOR
--
--    2) supplier_submit_for_review()  — "statüyü değiştirebildiği tek yol"
--         update public.suppliers set status = 'pending' ...
--
--  SECURITY DEFINER yalnız YETKİYİ değiştirir, OTURUMU değil: fonksiyonun
--  içinde de auth.uid() tedarikçidir ve is_admin() false döner. Yani
--  tetikleyici, kendisine izin verilmesi gereken fonksiyonun yaptığı
--  güncellemeyi de geri alıyordu. Doğrudan UPDATE de aynı sonucu veriyor:
--
--      update suppliers set status='pending' → hata yok, satır 'draft'
--
--  Tetikleyici RETURN NEW ile sessizce devam ettiği için ne SQL hatası ne de
--  PostgREST hatası oluşuyor; fonksiyon void döndüğünden arayüz "oldu"
--  sanıyordu. Sonuç: tedarikçi onaya giremiyor, admin kuyruğunda hiç kayıt
--  görünmüyor, ikisi de sebebini bilmiyor.
--
--  ÇÖZÜM
--  Tetikleyiciye GEÇİŞ KURALI koyuyoruz: tedarikçinin statü üzerindeki tek
--  hakkı kendi profilini onaya sunmaktır.
--        draft | rejected  →  pending      serbest
--        başka her geçiş (özellikle → approved)  reddedilir
--  Ayrıca eksik profille onaya gidilemesin diye zorunlu alanlar SUNUCUDA
--  doğrulanıyor — arayüzdeki kontrol kullanıcıya kolaylık, kural burası.
--
--  Reddedilen geçiş artık SESSİZCE GERİ ALINMIYOR, hata fırlatıyor: bir daha
--  "başarılı" yazıp hiçbir şey yapmaması mümkün olmasın.
--
--  Abonelik, ban ve onay gerekçesi kolonları eskisi gibi tedarikçiye kapalı.
-- ============================================================================


-- --------------------------------------------------- 1) KORUMA TETİKLEYİCİSİ
create or replace function public.suppliers_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Admin her şeyi yapabilir (onay/ret, abonelik, ban).
    if public.is_admin() then return new; end if;

    -- Tedarikçiye her zaman kapalı kolonlar.
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
    if new.status = 'pending' and old.status in ('draft', 'rejected') then
        if coalesce(length(btrim(new.about)), 0) < 30 then
            raise exception 'Onaya göndermeden önce en az 30 karakterlik bir tanıtım yazın.';
        end if;
        if coalesce(array_length(new.categories, 1), 0) = 0 then
            raise exception 'Onaya göndermeden önce en az bir ürün kategorisi seçin.';
        end if;
        if coalesce(btrim(new.city), '') = '' then
            raise exception 'Onaya göndermeden önce şehir bilgisini girin.';
        end if;
        new.reject_reason := null;   -- yeniden başvuru: eski gerekçe düşsün
        return new;
    end if;

    -- Geri kalan her şey (kendini onaylamak dâhil) yasak — ve SESSİZ DEĞİL.
    raise exception 'Profil onay durumunu kendiniz değiştiremezsiniz (% → %).',
        old.status, new.status;
end $$;

drop trigger if exists suppliers_guard_trg on public.suppliers;
create trigger suppliers_guard_trg before update on public.suppliers
    for each row execute function public.suppliers_guard();


-- ------------------------------------------------------- 2) ONAYA GÖNDERME
-- ⚠️ Artık void DEĞİL: oluşan statüyü döndürüyor. Arayüz "oldu" varsaymak
-- yerine dönen değere bakıyor. Hiçbir satır etkilenmediyse hata fırlatılır.
drop function if exists public.supplier_submit_for_review();

create or replace function public.supplier_submit_for_review()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_durum text;
begin
    update public.suppliers
       set status = 'pending'
     where id = auth.uid()
       and status in ('draft', 'rejected')
    returning status into v_durum;

    if v_durum is null then
        select status into v_durum from public.suppliers where id = auth.uid();
        if v_durum is null then
            raise exception 'Tedarikçi kaydınız bulunamadı.';
        end if;
        if v_durum = 'pending' then
            raise exception 'Profiliniz zaten onay kuyruğunda.';
        end if;
        if v_durum = 'approved' then
            raise exception 'Profiliniz zaten onaylı.';
        end if;
        raise exception 'Profil onaya gönderilemedi (durum: %).', v_durum;
    end if;

    return v_durum;
end $$;

grant execute on function public.supplier_submit_for_review() to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA — TEDARİKÇİ HESABIYLA, TARAYICI KONSOLUNDA
--
--    await supabaseClient.rpc('supplier_submit_for_review')
--      → { data: 'pending', error: null }
--
--    (await supabaseClient.from('suppliers').select('status')
--        .eq('id', (await supabaseClient.auth.getUser()).data.user.id).single()).data
--      → { status: 'pending' }
--
--  Kendini onaylama denemesi artık açıkça reddedilir:
--    await supabaseClient.from('suppliers').update({ status: 'approved' })
--         .eq('id', <kendi id>)
--      → error: "Profil onay durumunu kendiniz değiştiremezsiniz (pending → approved)."
-- ============================================================================
