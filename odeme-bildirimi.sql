-- ============================================================================
--  odeme-bildirimi.sql   —  "Ödemeyi yaptım" düğmesinin sunucu tarafı
--
--  NEDEN GEREKTİ
--  Kilit ekranı IBAN'ı gösterip "Ödemeniz onaylandığında hesabınız
--  aktifleştirilecek" diyor. Ama sistemde ödemeyi HABER VEREN bir yol yoktu:
--  firma havaleyi yapıyor, yönetici bankaya bakana kadar kilitli bekliyor ve
--  bunu kimse söylemiyor. Deneme 30 günken yılda birkaç kez yaşanırdı;
--  7 güne indiği ve kilit gerçekten kapandığı için haftalık hâle geldi.
--
--  ⚠️ BU DÜĞME ABONELİĞİ AÇMIYOR — açmamalı da. Ödemeyi doğrulayan tek şey
--  banka hesabı; "ödedim" demekle açılan bir kapı, ödemeden açılan bir kapıdır.
--  Düğme yalnız YÖNETİCİYE HABER VERİYOR. Süreyi yönetici uzatıyor.
--
--  ⚠️ KULLANICIYA VERİLEN CEVAP DA BUNU SÖYLÜYOR: "iletildi", "açıldı" değil.
-- ============================================================================


-- ============================================ 1) KAYIT (yinelenmeyi engeller)
-- Bildirimler tablosundan geriye dönük eşleştirme yapmak metin aramaya
-- kalırdı (body LIKE '%eposta%'); bu hem kırılgan hem yanlış eşleşmeye açık.
-- Küçük bir kayıt tablosu hem tekrarı engelliyor hem iz bırakıyor.
create table if not exists gizli.odeme_bildirimleri (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null,
    ad         text,
    rol        text,
    eposta     text,
    not_       text,
    created_at timestamptz not null default now()
);
create index if not exists odeme_bildirimleri_user_idx
    on gizli.odeme_bildirimleri (user_id, created_at desc);


-- ============================================ 2) BİLDİRİM
create or replace function public.odeme_bildirdim(p_not text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_uid    uuid := auth.uid();
    v_ad     text;
    v_rol    text;
    v_bitis  timestamptz;
    v_eposta text;
    v_son    timestamptz;
begin
    if v_uid is null then raise exception 'Oturum bulunamadı.'; end if;

    -- Kim bildiriyor? Üç rolden hangisiyse.
    select c.name, 'kurulumcu firma', c.sub_ends_at into v_ad, v_rol, v_bitis
      from public.companies c where c.id = public.my_company_id();

    if v_ad is null then
        select co.full_name, 'danışman', co.sub_ends_at into v_ad, v_rol, v_bitis
          from public.consultants co where co.id = v_uid;
    end if;

    if v_ad is null then
        select s.company_name, 'tedarikçi', s.sub_ends_at into v_ad, v_rol, v_bitis
          from public.suppliers s where s.id = v_uid;
    end if;

    if v_ad is null then
        raise exception 'Hesabınız bir firma, danışman veya tedarikçi kaydına bağlı değil.';
    end if;

    select u.email into v_eposta from auth.users u where u.id = v_uid;

    -- ⚠️ 12 saatte bir. Bekleyen biri düğmeye arka arkaya basar; yöneticinin
    -- gelen kutusunu doldurmak bildirimin kendisini işe yaramaz hâle getirir.
    select max(o.created_at) into v_son
      from gizli.odeme_bildirimleri o where o.user_id = v_uid;

    if v_son is not null and v_son > now() - interval '12 hours' then
        return jsonb_build_object(
            'gonderildi', false,
            'mesaj', 'Bildiriminiz zaten iletildi (' ||
                     to_char(v_son at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') ||
                     '). Ödeme kontrol edildikten sonra hesabınız açılacak.');
    end if;

    insert into gizli.odeme_bildirimleri (user_id, ad, rol, eposta, not_)
    values (v_uid, v_ad, v_rol, v_eposta, nullif(trim(coalesce(p_not, '')), ''));

    perform public.notify_push(
        null, null, true, 'odeme', '💳',
        'Ödeme bildirimi: ' || v_ad,
        v_ad || ' (' || v_rol || ') ödeme yaptığını bildirdi.' ||
        ' Hesap: ' || coalesce(v_eposta, '-') ||
        coalesce(' · Abonelik bitişi: ' || to_char(v_bitis, 'DD.MM.YYYY'), '') ||
        coalesce(' · Notu: ' || nullif(trim(coalesce(p_not, '')), ''), '') ||
        ' — Havaleyi kontrol edip Abonelikler ekranından süreyi uzatın.',
        '#admin');

    return jsonb_build_object(
        'gonderildi', true,
        'mesaj', 'Bildiriminiz iletildi. Ödemeniz kontrol edildikten sonra hesabınız açılacak.');
end $$;

grant execute on function public.odeme_bildirdim(text) to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  ⚠️ DENEME AYRI DOSYADA: odeme-bildirimi-deneme.sql
-- ============================================================================
