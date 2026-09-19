-- ============================================================================
--  eposta-bildirimleri.sql
--
--  NEDEN
--  Sistemde on ayrı yerden bildirim üretiliyor (yarışmalı davet, teklif
--  kabulü, danışman ataması, evrak, mesaj, tedarikçi talebi…) ama hepsi
--  YALNIZ uygulama içinde duruyor. Paneli o gün açmayan kimse haberi
--  almıyor. Yarışmalı modelde bunun bedeli somut: davet edilen üç firmadan
--  paneline bakmayan, teklif verme hakkını sessizce kaybediyor.
--
--  TASARIM — TEK KANCA
--  Yeni bir olay türü icat etmiyoruz. notifications tablosuna düşen HER
--  satır zaten "bu kişinin bilmesi gereken bir şey oldu" demek. Tetikleyici
--  o satırı yakalayıp e-posta kuyruğuna yazıyor. Böylece bugün var olan on
--  olay da, yarın eklenecek olanlar da kendiliğinden e-posta kazanıyor.
--
--      notifications (insert)
--            │  tetikleyici
--            ▼
--      gizli.eposta_kuyrugu  ──►  eposta_isle()  ──► Resend API  (pg_net)
--            ▲                                            │
--            └──────── eposta_sonuc_isle() ◄──────────────┘
--
--  NEDEN KUYRUK VAR — doğrudan da POST edebilirdik. Ama pg_net yanıtı
--  ASENKRON bırakır: gönderim başarısız olsa bile kimse görmez. Sessizce
--  kaybolan bildirim, hiç göndermemekten beterdir — kullanıcı haberdar
--  olduğunu sanır. Kuyruk sayesinde her e-postanın durumu, HTTP kodu ve
--  hata metni kayıtlı; admin panelinden sayılabiliyor.
--
--  ÖNCE YAPILACAKLAR (Supabase panelinden, bir kez)
--    1) Database → Extensions → pg_net  AÇ
--    2) Database → Extensions → pg_cron AÇ
--    3) resend.com hesabı aç, epcmerkezim.com alan adını doğrula (DNS),
--       bir API anahtarı üret
--    4) Aşağıdaki 2. bölümde anahtarı ve gönderen adresi gir
--
--  Eklentiler açık mı, en alttaki "KONTROL" bölümü söylüyor.
-- ============================================================================


-- ========================================================== 0) ÖN KOŞULLAR
-- ⚠️ pg_net'e "with schema" verilmez: eklenti yer değiştiremez (relocatable
-- değil), her zaman kendi 'net' şemasını kurar. Şema dayatmak hata verir.
create extension if not exists pg_net;
create extension if not exists pg_cron;


-- ========================================================== 1) GİZLİ ŞEMA
-- ⚠️ 'public' DEĞİL. PostgREST yalnız public'i yayınlıyor; API anahtarını
-- oraya koymak, anahtarı internete koymak demekti. Bu şemadaki hiçbir şey
-- REST üzerinden erişilebilir değil; yalnız SECURITY DEFINER fonksiyonlar
-- ve veritabanı sahibi görüyor.
create schema if not exists gizli;
revoke all on schema gizli from public, anon, authenticated;


-- ========================================================== 2) AYARLAR
create table if not exists gizli.eposta_ayar (
    tek           boolean primary key default true check (tek),   -- tek satır garantisi
    resend_anahtar text,
    gonderen       text not null default 'epcmerkezim <bildirim@epcmerkezim.com>',
    site_url       text not null default 'https://epcmerkezim.com',
    aktif          boolean not null default false,   -- anahtar girilene kadar KAPALI
    gunluk_limit   int not null default 2000,
    guncelleme     timestamptz not null default now()
);

insert into gizli.eposta_ayar (tek) values (true) on conflict (tek) do nothing;

-- ⚠️ ANAHTARI BURAYA YAZIN, sonra bu iki satırı çalıştırın.
-- Anahtar girilmeden aktif=true yapmayın: kuyruk dolar, hiçbiri gitmez.
--
--   update gizli.eposta_ayar
--      set resend_anahtar = 're_XXXXXXXXXXXXXXXXXXXX',
--          gonderen       = 'epcmerkezim <bildirim@epcmerkezim.com>',
--          aktif          = true,
--          guncelleme     = now();


-- ============================================== 3) KULLANICI TERCİHİ
-- Kimse istemediği postayı almak zorunda değil. Varsayılan AÇIK: bunlar
-- pazarlama değil, kullanıcının kendi hesabındaki olaylar. Ama kapatma
-- hakkı ilk günden var olmalı, sonradan eklenen bir düğme geç kalır.
create table if not exists public.eposta_tercih (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    aktif      boolean not null default true,
    guncelleme timestamptz not null default now()
);

alter table public.eposta_tercih enable row level security;

drop policy if exists eposta_tercih_self on public.eposta_tercih;
create policy eposta_tercih_self on public.eposta_tercih
    for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Uygulamanın kullandığı iki fonksiyon: oku ve yaz.
create or replace function public.eposta_tercihim()
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select t.aktif from public.eposta_tercih t where t.user_id = auth.uid()), true);
$$;

create or replace function public.eposta_tercihim_yaz(p_aktif boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    if auth.uid() is null then raise exception 'Oturum bulunamadı.'; end if;
    insert into public.eposta_tercih (user_id, aktif, guncelleme)
    values (auth.uid(), coalesce(p_aktif, true), now())
    on conflict (user_id) do update set aktif = excluded.aktif, guncelleme = now();
    return coalesce(p_aktif, true);
end $$;

grant execute on function public.eposta_tercihim()             to authenticated;
grant execute on function public.eposta_tercihim_yaz(boolean)  to authenticated;


-- ========================================================== 4) KUYRUK
create table if not exists gizli.eposta_kuyrugu (
    id              bigserial primary key,
    notification_id uuid,
    alici           text not null,
    konu            text not null,
    govde_html      text not null,
    durum           text not null default 'bekliyor',
        -- bekliyor · gonderiliyor · gonderildi · hata · iptal
    deneme          int  not null default 0,
    request_id      bigint,
    http_kod        int,
    hata            text,
    created_at      timestamptz not null default now(),
    islem_at        timestamptz,
    sonuc_at        timestamptz
);

-- Aynı bildirim aynı adrese iki kez girmesin (tetikleyici tekrar çalışırsa).
create unique index if not exists eposta_kuyrugu_tekil
    on gizli.eposta_kuyrugu (notification_id, alici)
    where notification_id is not null;

create index if not exists eposta_kuyrugu_bekleyen
    on gizli.eposta_kuyrugu (durum, id) where durum in ('bekliyor', 'gonderiliyor');


-- ================================================= 5) YARDIMCILAR
-- Adres auth.users'tan okunuyor: profiles."Mail" elle doldurulan bir alan,
-- boş veya eski olabilir. Kullanıcının giriş yaptığı adres tek doğru kaynak.
create or replace function gizli.mail_adresi(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
    select u.email from auth.users u where u.id = p_uid and u.email is not null;
$$;

-- Bağlantılar tutarsız yazılmış: kimi '#kurulumcu-panel/crm', kimi düz 'crm'.
-- E-postada mutlak adres şart; yönlendirici eski düz adresi zaten tam adrese
-- çeviriyor, o yüzden ikisi de çalışır hâle getiriliyor.
create or replace function gizli.baglanti_mutlak(p_link text, p_site text)
returns text language sql immutable as $$
    select case
        when p_link is null or btrim(p_link) = '' then p_site
        when p_link like 'http%'                  then p_link
        when left(btrim(p_link), 1) = '#'         then p_site || '/' || btrim(p_link)
        else p_site || '/#' || btrim(p_link)
    end;
$$;

-- Sade, tek sütunlu, koyu/açık farkı gözetmeyen bir şablon. Resim yok:
-- kurumsal posta sunucuları uzak resmi engelliyor, boş kutu kalıyordu.
create or replace function gizli.eposta_govde(
    p_baslik text, p_govde text, p_link text, p_ikon text, p_site text
) returns text language sql immutable as $$
    select
'<!doctype html><html lang="tr"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">'
|| '<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">'
|| '<tr><td style="padding:18px 24px;background:#0f172a;color:#ffffff;font-weight:800;font-size:15px;">epcmerkezim</td></tr>'
|| '<tr><td style="padding:24px;">'
|| '<p style="margin:0 0 6px;font-size:17px;font-weight:800;color:#0f172a;">'
   || coalesce(p_ikon, '') || ' ' || coalesce(p_baslik, 'Bildirim') || '</p>'
|| case when coalesce(btrim(p_govde), '') = '' then ''
        else '<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">' || p_govde || '</p>' end
|| '<a href="' || p_link || '" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:9px;">Panelde aç</a>'
|| '<p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">Bu e-posta epcmerkezim hesabınızdaki bir olay için gönderildi. '
|| 'Bildirim e-postalarını panelden kapatabilirsiniz.</p>'
|| '</td></tr></table></td></tr></table></body></html>';
$$;


-- ====================================== 6) TETİKLEYİCİ: BİLDİRİM → KUYRUK
-- ⚠️ Bu tetikleyici ASLA kaynak işlemi düşürmemeli. Bir başvurunun
-- kaydedilmesi, e-posta kuyruğu yüzünden geri alınamaz. Bu yüzden gövde
-- baştan sona exception yakalıyor: hata olursa bildirim yine de yazılır,
-- yalnız postası gitmez.
create or replace function gizli.notification_eposta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_ayar  gizli.eposta_ayar%rowtype;
    v_link  text;
    v_konu  text;
    v_html  text;
    v_mail  text;
    r       record;
begin
    select * into v_ayar from gizli.eposta_ayar where tek;
    if not found or not v_ayar.aktif then return new; end if;

    v_link := gizli.baglanti_mutlak(new.link, v_ayar.site_url);
    v_konu := coalesce(nullif(btrim(new.title), ''), 'epcmerkezim bildirimi');
    v_html := gizli.eposta_govde(new.title, new.body, v_link, new.icon, v_ayar.site_url);

    -- a) Kişiye özel bildirim
    if new.user_id is not null then
        v_mail := gizli.mail_adresi(new.user_id);
        if v_mail is not null
           and coalesce((select t.aktif from public.eposta_tercih t where t.user_id = new.user_id), true)
        then
            insert into gizli.eposta_kuyrugu (notification_id, alici, konu, govde_html)
            values (new.id, v_mail, v_konu, v_html)
            on conflict do nothing;
        end if;

    -- b) Firmaya düşen bildirim: o firmanın tüm kullanıcılarına
    elsif new.company_id is not null then
        for r in
            select p.id from public.profiles p where p.company_id = new.company_id
        loop
            v_mail := gizli.mail_adresi(r.id);
            if v_mail is not null
               and coalesce((select t.aktif from public.eposta_tercih t where t.user_id = r.id), true)
            then
                insert into gizli.eposta_kuyrugu (notification_id, alici, konu, govde_html)
                values (new.id, v_mail, v_konu, v_html)
                on conflict do nothing;
            end if;
        end loop;

    -- c) Yönetim bildirimi: admin rolündeki herkese
    elsif new.for_admin then
        for r in
            select p.id from public.profiles p where p.role = 'admin'
        loop
            v_mail := gizli.mail_adresi(r.id);
            if v_mail is not null then
                insert into gizli.eposta_kuyrugu (notification_id, alici, konu, govde_html)
                values (new.id, v_mail, v_konu, v_html)
                on conflict do nothing;
            end if;
        end loop;
    end if;

    return new;
exception when others then
    -- Kuyruk yazılamadıysa bildirim yine de kalsın; olay kaybolmasın.
    raise warning 'e-posta kuyruğuna yazılamadı (notification %): %', new.id, sqlerrm;
    return new;
end $$;

drop trigger if exists notifications_eposta_trg on public.notifications;
create trigger notifications_eposta_trg after insert on public.notifications
    for each row execute function gizli.notification_eposta();


-- ============================================== 7) GÖNDERİCİ (pg_net)
-- Kuyruktaki bekleyenleri Resend'e POST eder. Yanıt asenkron geldiği için
-- burada 'gonderildi' DEMİYORUZ — yalnız 'gonderiliyor' + request_id.
-- Gerçeği 8. bölüm yazıyor.
create or replace function gizli.eposta_isle(p_limit int default 50)
returns int language plpgsql security definer set search_path = public as $$
declare
    v_ayar gizli.eposta_ayar%rowtype;
    v_bugun int;
    r      record;
    v_req  bigint;
    v_n    int := 0;
begin
    select * into v_ayar from gizli.eposta_ayar where tek;
    if not found or not v_ayar.aktif or coalesce(btrim(v_ayar.resend_anahtar), '') = '' then
        return 0;
    end if;

    -- Günlük tavan: bir döngü hatası faturayı patlatmasın.
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
        select net.http_post(
            url     := 'https://api.resend.com/emails',
            body    := jsonb_build_object(
                           'from',    v_ayar.gonderen,
                           'to',      jsonb_build_array(r.alici),
                           'subject', r.konu,
                           'html',    r.govde_html),
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


-- ====================================== 8) SONUÇ OKUMA — GERÇEĞİ YAZAN YER
-- pg_net yanıtı net._http_response'a bırakır. Buraya bakmazsak "gönderdim"
-- demiş ama gitmemiş oluruz; bu projedeki en sevmediğimiz hata türü.
create or replace function gizli.eposta_sonuc_isle()
returns int language plpgsql security definer set search_path = public as $$
declare
    r    record;
    v_n  int := 0;
begin
    for r in
        select k.id, k.deneme, y.status_code, y.content, y.error_msg, y.timed_out
          from gizli.eposta_kuyrugu k
          join net._http_response y on y.id = k.request_id
         where k.durum = 'gonderiliyor'
    loop
        if r.status_code between 200 and 299 then
            update gizli.eposta_kuyrugu
               set durum = 'gonderildi', http_kod = r.status_code,
                   hata = null, sonuc_at = now()
             where id = r.id;
        else
            update gizli.eposta_kuyrugu
               set durum    = case when r.deneme >= 3 then 'hata' else 'bekliyor' end,
                   http_kod = r.status_code,
                   hata     = left(coalesce(r.error_msg, r.content,
                                   case when r.timed_out then 'zaman aşımı' else 'bilinmeyen hata' end), 500),
                   sonuc_at = now()
             where id = r.id;
        end if;
        v_n := v_n + 1;
    end loop;

    -- Yanıtı hiç gelmeyenler (pg_net kaydı düşmüş): 15 dk sonra tekrar dene.
    update gizli.eposta_kuyrugu
       set durum = case when deneme >= 3 then 'hata' else 'bekliyor' end,
           hata  = 'yanıt alınamadı'
     where durum = 'gonderiliyor' and islem_at < now() - interval '15 minutes';

    return v_n;
end $$;


-- ========================================================== 9) ZAMANLAMA
-- Dakikada bir gönder, dakikada bir sonuçları oku. Bildirim e-postasında
-- bir dakikalık gecikme sorun değil; garanti olması önemli.
do $$
begin
    perform cron.unschedule('eposta-gonder');
exception when others then null; end $$;

do $$
begin
    perform cron.unschedule('eposta-sonuc');
exception when others then null; end $$;

select cron.schedule('eposta-gonder', '* * * * *', $$select gizli.eposta_isle(50)$$);
select cron.schedule('eposta-sonuc',  '* * * * *', $$select gizli.eposta_sonuc_isle()$$);


-- ============================================ 10) ADMİN GÖRÜNÜRLÜĞÜ
-- Kuyruğun sessizce tıkanmadığını görebilmek için. Yalnız admin okur.
create or replace function public.eposta_kuyruk_ozeti()
returns table (durum text, adet bigint, son timestamptz)
language sql stable security definer set search_path = public as $$
    select k.durum, count(*)::bigint, max(k.created_at)
      from gizli.eposta_kuyrugu k
     where public.is_admin()
     group by k.durum
     order by k.durum;
$$;

create or replace function public.eposta_son_hatalar(p_limit int default 10)
returns table (alici text, konu text, http_kod int, hata text, ne_zaman timestamptz)
language sql stable security definer set search_path = public as $$
    select k.alici, k.konu, k.http_kod, k.hata, k.sonuc_at
      from gizli.eposta_kuyrugu k
     where public.is_admin() and k.durum = 'hata'
     order by k.sonuc_at desc nulls last
     limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

-- Kurulum sonrası tek tıkla sınama: kendi adresinize deneme postası.
create or replace function public.eposta_deneme()
returns text language plpgsql security definer set search_path = public as $$
declare
    v_ayar gizli.eposta_ayar%rowtype;
    v_mail text;
begin
    if not public.is_admin() then raise exception 'Bu işlem yalnız yöneticiye açıktır.'; end if;
    select * into v_ayar from gizli.eposta_ayar where tek;
    if not found or not v_ayar.aktif then raise exception 'E-posta gönderimi kapalı (gizli.eposta_ayar.aktif = false).'; end if;
    if coalesce(btrim(v_ayar.resend_anahtar), '') = '' then raise exception 'Resend API anahtarı girilmemiş.'; end if;

    v_mail := gizli.mail_adresi(auth.uid());
    if v_mail is null then raise exception 'Hesabınızda e-posta adresi bulunamadı.'; end if;

    insert into gizli.eposta_kuyrugu (notification_id, alici, konu, govde_html)
    values (null, v_mail, 'epcmerkezim — deneme bildirimi',
            gizli.eposta_govde('Deneme bildirimi',
                'Bu bir sınama e-postasıdır. Bunu gördüyseniz bildirim boru hattı çalışıyor demektir.',
                v_ayar.site_url, '✅', v_ayar.site_url));

    perform gizli.eposta_isle(1);
    return v_mail;
end $$;

grant execute on function public.eposta_kuyruk_ozeti()      to authenticated;
grant execute on function public.eposta_son_hatalar(int)    to authenticated;
grant execute on function public.eposta_deneme()            to authenticated;


notify pgrst, 'reload schema';


-- ============================================================================
--  KONTROL — SIRAYLA ÇALIŞTIRIN
--
--  1) Eklentiler açık mı?
--       select extname from pg_extension where extname in ('pg_net','pg_cron');
--     İkisi de listede olmalı. Yoksa Database → Extensions'tan açın.
--
--  2) Anahtarı girin ve açın (yukarıdaki 2. bölümdeki update).
--
--  3) Zamanlama kurulmuş mu?
--       select jobname, schedule, active from cron.job where jobname like 'eposta%';
--
--  4) Kendinize deneme postası (admin hesabıyla, tarayıcı konsolundan):
--       await supabaseClient.rpc('eposta_deneme')
--     Dönen değer kendi adresiniz olmalı; posta 1-2 dakikada gelir.
--
--  5) Durum:
--       await supabaseClient.rpc('eposta_kuyruk_ozeti')
--       await supabaseClient.rpc('eposta_son_hatalar', { p_limit: 10 })
--
--  KAPATMA: update gizli.eposta_ayar set aktif = false;
--  Tetikleyici de gönderici de bu bayrağa bakıyor, kuyruk bile dolmaz.
-- ============================================================================
