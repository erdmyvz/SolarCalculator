-- ============================================================================
--  eposta-teslimat-iyilestirme.sql
--
--  SORUN
--  Bildirim e-postaları spam klasörüne düşüyor. Kimlik doğrulama tarafı
--  sağlam — SPF, DKIM ve DMARC kayıtları yerinde, Resend "Delivered"
--  diyor — yani posta teslim ediliyor, ama SÜZGEÇ onu istenmeyen sayıyor.
--
--  GÖNDERDİĞİMİZ İSTEĞE BAKINCA ÜÇ EKSİK GÖRÜNÜYOR:
--
--    jsonb_build_object('from', …, 'to', …, 'subject', …, 'html', …)
--
--  1) DÜZ METİN YOK. Yalnız HTML gönderiyoruz. Süzgeçler çok yönlü
--     (multipart) olmayan postayı klasik toplu posta işareti sayar;
--     metin karşılığı olmayan HTML bugün en bilinen spam sinyallerinden.
--
--  2) List-Unsubscribe BAŞLIĞI YOK. Gmail, Yahoo ve Outlook artık bu
--     başlığı olan göndericiye belirgin şekilde daha iyi davranıyor.
--     Bizde zaten çalışan bir kapatma anahtarı var (Profilim → Bildirim
--     e-postaları); başlıkla onu duyurmuyorduk.
--
--  3) Reply-To YOK ve bildirim@epcmerkezim.com POSTA ALAMIYOR.
--     Alan adının kökünde MX kaydı yok (dig ile doğrulandı). Yanıtlanamayan
--     bir adresten gelen posta, süzgeçler için olumsuz bir işaret.
--
--  ⚠️ DÜRÜST OLALIM: bunlar gerçek ve ölçülebilir iyileştirmeler ama
--  spam'in EN BÜYÜK sebebi muhtemelen hiçbiri değil. epcmerkezim.com
--  bugün ilk postasını gönderdi. Gönderen itibarı sıfır ve Outlook/Hotmail
--  yeni alan adlarına karşı en sert davranan sağlayıcı. İtibar zamanla ve
--  ETKİLEŞİMLE oluşur: açılan, okunan, "spam değil" denen postalarla.
--  Aşağıdakiler zemini düzeltir, geçmişi satın almaz.
-- ============================================================================


-- ========================================== 1) DÜZ METİN İÇİN YENİ SÜTUN
alter table gizli.eposta_kuyrugu add column if not exists govde_text text;


-- ========================================== 2) AYARLARA YANIT ADRESİ
-- NULL bırakılırsa Reply-To hiç gönderilmez. Gerçekten okunan bir adres
-- yazın; okunmayan bir adres, olmamasından daha kötüdür.
alter table gizli.eposta_ayar add column if not exists yanit_adresi text;


-- ========================================== 3) DÜZ METİN KARŞILIĞI
-- HTML'in birebir metin hâli. Aynı bilgiyi taşımalı: süzgeçler iki parçayı
-- karşılaştırıyor, metin parçası "buraya tıklayın" gibi içi boş olursa
-- durum iyileşmiyor, kötüleşiyor.
create or replace function gizli.eposta_metin(
    p_baslik text, p_govde text, p_link text, p_site text
) returns text language sql immutable as $$
    select coalesce(p_baslik, 'Bildirim') || E'\n\n'
        || case when coalesce(btrim(p_govde), '') = '' then '' else p_govde || E'\n\n' end
        || 'Panelde açmak için:' || E'\n' || p_link || E'\n\n'
        || '---' || E'\n'
        || 'Bu e-posta epcmerkezim hesabınızdaki bir olay için gönderildi.' || E'\n'
        || 'Bildirim e-postalarını kapatmak için: ' || p_site || '/#profilim' || E'\n';
$$;


-- ========================================== 4) HTML ŞABLONU — ön izleme satırı
-- Posta listesinde konunun yanında görünen özet (preheader). Olmayınca
-- istemciler HTML'in ilk metnini kapıyor; bizde bu "epcmerkezim" logosuydu,
-- yani her bildirim aynı görünüyordu. Aynılık da bir spam sinyali.
create or replace function gizli.eposta_govde(
    p_baslik text, p_govde text, p_link text, p_ikon text, p_site text
) returns text language sql immutable as $$
    select
'<!doctype html><html lang="tr"><head><meta charset="utf-8">'
|| '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
|| '<body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">'
|| '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">'
   || left(coalesce(nullif(btrim(p_govde), ''), coalesce(p_baslik, 'Bildirim')), 120) || '</div>'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">'
|| '<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">'
|| '<tr><td style="padding:18px 24px;background:#0f172a;color:#ffffff;font-weight:800;font-size:15px;">epcmerkezim</td></tr>'
|| '<tr><td style="padding:24px;">'
|| '<p style="margin:0 0 6px;font-size:17px;font-weight:800;color:#0f172a;">'
   || coalesce(p_ikon, '') || ' ' || coalesce(p_baslik, 'Bildirim') || '</p>'
|| case when coalesce(btrim(p_govde), '') = '' then ''
        else '<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">' || p_govde || '</p>' end
|| '<a href="' || p_link || '" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:9px;">Panelde aç</a>'
|| '<p style="margin:18px 0 0;font-size:12px;color:#64748b;line-height:1.5;">Bağlantı çalışmazsa adresi tarayıcınıza yapıştırın:<br>'
   || '<span style="color:#94a3b8;">' || p_link || '</span></p>'
|| '<p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;line-height:1.5;">'
|| 'Bu e-posta epcmerkezim hesabınızdaki bir olay için gönderildi. '
|| '<a href="' || p_site || '/#profilim" style="color:#64748b;">Bildirim e-postalarını kapat</a></p>'
|| '</td></tr></table></td></tr></table></body></html>';
$$;


-- ========================================== 5) TETİKLEYİCİ — metni de yaz
create or replace function gizli.notification_eposta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_ayar  gizli.eposta_ayar%rowtype;
    v_link  text;
    v_konu  text;
    v_html  text;
    v_text  text;
    v_mail  text;
    r       record;
begin
    select * into v_ayar from gizli.eposta_ayar where tek;
    if not found or not v_ayar.aktif then return new; end if;

    v_link := gizli.baglanti_mutlak(new.link, v_ayar.site_url);
    v_konu := coalesce(nullif(btrim(new.title), ''), 'epcmerkezim bildirimi');
    v_html := gizli.eposta_govde(new.title, new.body, v_link, new.icon, v_ayar.site_url);
    v_text := gizli.eposta_metin(new.title, new.body, v_link, v_ayar.site_url);

    if new.user_id is not null then
        v_mail := gizli.mail_adresi(new.user_id);
        if v_mail is not null
           and coalesce((select t.aktif from public.eposta_tercih t where t.user_id = new.user_id), true)
        then
            insert into gizli.eposta_kuyrugu (notification_id, alici, konu, govde_html, govde_text)
            values (new.id, v_mail, v_konu, v_html, v_text) on conflict do nothing;
        end if;

    elsif new.company_id is not null then
        for r in select p.id from public.profiles p where p.company_id = new.company_id loop
            v_mail := gizli.mail_adresi(r.id);
            if v_mail is not null
               and coalesce((select t.aktif from public.eposta_tercih t where t.user_id = r.id), true)
            then
                insert into gizli.eposta_kuyrugu (notification_id, alici, konu, govde_html, govde_text)
                values (new.id, v_mail, v_konu, v_html, v_text) on conflict do nothing;
            end if;
        end loop;

    elsif new.for_admin then
        for r in select p.id from public.profiles p where p.role = 'admin' loop
            v_mail := gizli.mail_adresi(r.id);
            if v_mail is not null then
                insert into gizli.eposta_kuyrugu (notification_id, alici, konu, govde_html, govde_text)
                values (new.id, v_mail, v_konu, v_html, v_text) on conflict do nothing;
            end if;
        end loop;
    end if;

    return new;
exception when others then
    raise warning 'e-posta kuyruğuna yazılamadı (notification %): %', new.id, sqlerrm;
    return new;
end $$;


-- ========================================== 6) GÖNDERİCİ — metin + başlıklar
create or replace function gizli.eposta_isle(p_limit int default 50)
returns int language plpgsql security definer set search_path = public as $$
declare
    v_ayar  gizli.eposta_ayar%rowtype;
    v_bugun int;
    r       record;
    v_req   bigint;
    v_n     int := 0;
    v_body  jsonb;
begin
    select * into v_ayar from gizli.eposta_ayar where tek;
    if not found or not v_ayar.aktif or coalesce(btrim(v_ayar.resend_anahtar), '') = '' then
        return 0;
    end if;

    select count(*) into v_bugun from gizli.eposta_kuyrugu
     where islem_at >= date_trunc('day', now());
    if v_bugun >= v_ayar.gunluk_limit then
        raise warning 'günlük e-posta limiti doldu (%)', v_ayar.gunluk_limit;
        return 0;
    end if;

    for r in
        select * from gizli.eposta_kuyrugu
         where durum = 'bekliyor' and deneme < 3
         order by id
         limit greatest(1, least(p_limit, v_ayar.gunluk_limit - v_bugun))
         for update skip locked
    loop
        v_body := jsonb_build_object(
            'from',    v_ayar.gonderen,
            'to',      jsonb_build_array(r.alici),
            'subject', r.konu,
            'html',    r.govde_html,
            -- Düz metin karşılığı. Eski satırlarda yoksa HTML etiketleri
            -- kabaca ayıklanıyor — boş metin göndermekten iyidir.
            'text',    coalesce(r.govde_text,
                                btrim(regexp_replace(regexp_replace(r.govde_html, '<[^>]+>', ' ', 'g'),
                                                     '\s+', ' ', 'g'))),
            -- ⚠️ Tek tıkla abonelikten çıkma (List-Unsubscribe-Post) İDDİA
            -- EDİLMİYOR: onun için kimlik doğrulaması istemeyen bir POST uç
            -- noktası gerekiyor, bizde yok. Olmayan bir yeteneği duyurmak
            -- süzgeçlerde güven kaybettirir.
            'headers', jsonb_build_object(
                           'List-Unsubscribe', '<' || v_ayar.site_url || '/#profilim>'));

        if coalesce(btrim(v_ayar.yanit_adresi), '') <> '' then
            v_body := v_body || jsonb_build_object('reply_to', v_ayar.yanit_adresi);
        end if;

        select net.http_post(
            url     := 'https://api.resend.com/emails',
            body    := v_body,
            headers := jsonb_build_object(
                           'Content-Type',  'application/json',
                           'Authorization', 'Bearer ' || v_ayar.resend_anahtar),
            timeout_milliseconds := 8000
        ) into v_req;

        update gizli.eposta_kuyrugu
           set durum = 'gonderiliyor', request_id = v_req,
               deneme = deneme + 1, islem_at = now()
         where id = r.id;

        v_n := v_n + 1;
    end loop;

    return v_n;
end $$;


-- ========================================== 7) DENEME POSTASI — metinli
create or replace function public.eposta_deneme()
returns text language plpgsql security definer set search_path = public as $$
declare
    v_ayar gizli.eposta_ayar%rowtype;
    v_mail text;
    v_b    text := 'Bildirim boru hattının çalıştığını doğrulamak için gönderildi. '
                || 'Bu e-postayı gördüyseniz kurulum tamamdır.';
begin
    if not public.is_admin() then raise exception 'Bu işlem yalnız yöneticiye açıktır.'; end if;
    select * into v_ayar from gizli.eposta_ayar where tek;
    if not found or not v_ayar.aktif then raise exception 'E-posta gönderimi kapalı (gizli.eposta_ayar.aktif = false).'; end if;
    if coalesce(btrim(v_ayar.resend_anahtar), '') = '' then raise exception 'Resend API anahtarı girilmemiş.'; end if;

    v_mail := gizli.mail_adresi(auth.uid());
    if v_mail is null then raise exception 'Hesabınızda e-posta adresi bulunamadı.'; end if;

    insert into gizli.eposta_kuyrugu (notification_id, alici, konu, govde_html, govde_text)
    values (null, v_mail, 'epcmerkezim bildirim ayarları',
            gizli.eposta_govde('Bildirim ayarlarınız hazır', v_b, v_ayar.site_url, '✅', v_ayar.site_url),
            gizli.eposta_metin('Bildirim ayarlarınız hazır', v_b, v_ayar.site_url, v_ayar.site_url));

    perform gizli.eposta_isle(1);
    return v_mail;
end $$;

grant execute on function public.eposta_deneme() to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  İSTEĞE BAĞLI — YANIT ADRESİ
--  Gerçekten okuduğunuz bir adres yazın; okunmayan adres, hiç olmamasından
--  kötüdür. Boş bırakılırsa Reply-To başlığı gönderilmez.
--
--    update gizli.eposta_ayar set yanit_adresi = 'sizin@adresiniz.com';
--
--  ÇALIŞTIRDIKTAN SONRA
--    await supabaseClient.rpc('eposta_deneme')
--  Gelen postada artık düz metin karşılığı ve "Bildirim e-postalarını kapat"
--  bağlantısı var. Spam'e düştüyse "Bu spam değil" deyip göndereni
--  kişilere ekleyin: kendi kutunuz için en hızlı, en kalıcı düzeltme budur.
-- ============================================================================
