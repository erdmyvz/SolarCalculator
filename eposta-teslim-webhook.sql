-- ============================================================================
--  eposta-teslim-webhook.sql
--
--  KAPATILAN AÇIK
--  Kuyruk, Resend'den HTTP 2xx gelince satırı 'gonderildi' işaretliyordu.
--  Ama 2xx "KABUL ETTİM" demek, "TESLİM ETTİM" demek değil. Canlıda görüldü:
--
--      kuyruk        →  gonderildi
--      Resend kaydı  →  Failed  ("domain is not verified")
--
--  İki ekran aynı posta için farklı şey söylüyordu. Bütün boru hattını
--  yazma sebebimiz tam da buydu: gitmemiş postayı gitti göstermemek.
--
--  ÇÖZÜM
--  Resend gerçek teslim olaylarını webhook ile bildiriyor. Vercel'deki
--  /api/resend-webhook ucu imzayı doğrulayıp bu fonksiyonu çağırıyor:
--
--      email.sent              → kabul edildi (henüz teslim değil)
--      email.failed            → Resend gönderemedi (bizi bu işe başlatan olay)
--      email.delivered         → TESLİM EDİLDİ
--      email.delivery_delayed  → gecikiyor, yeniden deneniyor
--      email.bounced           → geri döndü (adres yok / kutu dolu / red)
--      email.complained        → alıcı "spam" dedi
--
--  ⚠️ KARA LİSTE. Geri dönen ve şikâyet edilen adreslere göndermeye devam
--  etmek gönderen itibarını düşürür — yeni bir alan adı için en pahalı
--  hatalardan biri. Bu iki olay adresi gizli.eposta_engelli'ye yazıyor ve
--  tetikleyici oraya bakıyor. Kullanıcının kendi tercihinden AYRI tutuluyor:
--  biri kullanıcının kararı, diğeri teknik zorunluluk; karıştırılırsa
--  "ben kapatmadım ki" diyen kullanıcıya yanlış cevap verilir.
-- ============================================================================


-- ============================================ 1) YENİ ALANLAR
alter table gizli.eposta_kuyrugu add column if not exists resend_id    text;
alter table gizli.eposta_kuyrugu add column if not exists teslim_durum text;
alter table gizli.eposta_kuyrugu add column if not exists teslim_at    timestamptz;
alter table gizli.eposta_kuyrugu add column if not exists teslim_detay text;

create index if not exists eposta_kuyrugu_resend on gizli.eposta_kuyrugu (resend_id)
    where resend_id is not null;


-- ============================================ 2) KARA LİSTE
create table if not exists gizli.eposta_engelli (
    adres      text primary key,
    sebep      text not null,          -- 'bounced' | 'complained'
    detay      text,
    created_at timestamptz not null default now()
);


-- ============================ 3) RESEND KİMLİĞİNİ YANITTAN AL
-- Resend POST yanıtında {"id":"..."} döndürüyor. Webhook olayları bu
-- kimlikle geliyor; saklamazsak olayı hangi satıra yazacağımızı bilemeyiz.
create or replace function gizli.eposta_sonuc_isle()
returns int language plpgsql security definer set search_path = public as $$
declare
    r    record;
    v_n  int := 0;
    v_id text;
begin
    for r in
        select k.id, k.deneme, y.status_code, y.content, y.error_msg, y.timed_out
          from gizli.eposta_kuyrugu k
          join net._http_response y on y.id = k.request_id
         where k.durum = 'gonderiliyor'
    loop
        if r.status_code between 200 and 299 then
            begin
                v_id := (r.content::jsonb) ->> 'id';
            exception when others then v_id := null;    -- yanıt JSON değilse
            end;

            update gizli.eposta_kuyrugu
               set durum = 'gonderildi', http_kod = r.status_code,
                   hata = null, sonuc_at = now(),
                   resend_id = coalesce(v_id, resend_id),
                   -- ⚠️ 'kabul' — 'teslim' DEĞİL. Gerçeği webhook yazacak.
                   teslim_durum = coalesce(teslim_durum, 'kabul')
             where id = r.id;
        else
            update gizli.eposta_kuyrugu
               set durum    = case when deneme >= 3 then 'hata' else 'bekliyor' end,
                   http_kod = r.status_code,
                   hata     = left(coalesce(r.error_msg, r.content,
                                   case when r.timed_out then 'zaman aşımı' else 'bilinmeyen hata' end), 500),
                   sonuc_at = now()
             where id = r.id;
        end if;
        v_n := v_n + 1;
    end loop;

    update gizli.eposta_kuyrugu
       set durum = case when deneme >= 3 then 'hata' else 'bekliyor' end,
           hata  = 'yanıt alınamadı'
     where durum = 'gonderiliyor' and islem_at < now() - interval '15 minutes';

    return v_n;
end $$;


-- ============================ 4) WEBHOOK'UN ÇAĞIRDIĞI FONKSİYON
-- ⚠️ YETKİ: yalnız service_role. anon veya authenticated çağırabilseydi
-- herkes teslim durumlarını uydurabilirdi — yani tam da güvenmek için
-- kurduğumuz kaydı kirletebilirdi. İmza doğrulaması Vercel ucunda yapılıyor.
create or replace function public.eposta_teslim_kaydet(
    p_resend_id text,
    p_olay      text,
    p_detay     text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_durum text;
    v_adres text;
begin
    if coalesce(btrim(p_resend_id), '') = '' then
        raise exception 'resend_id gerekli';
    end if;

    v_durum := case p_olay
        when 'email.sent'             then 'kabul'
        when 'email.delivered'        then 'teslim'
        when 'email.delivery_delayed' then 'gecikti'
        when 'email.bounced'          then 'dondu'
        when 'email.complained'       then 'sikayet'
        -- Resend'in kendisi gönderemedi (alan adı doğrulanmamış, adres
        -- biçimsiz…). Bizi bu işe başlatan olay tam olarak buydu.
        when 'email.failed'           then 'basarisiz'
        else null
    end;

    -- İlgilenmediğimiz olaylar (opened, clicked…) sessizce yok sayılır.
    if v_durum is null then return 'yoksayildi'; end if;

    update gizli.eposta_kuyrugu
       set teslim_durum = v_durum,
           teslim_at    = now(),
           teslim_detay = left(p_detay, 500)
     where resend_id = p_resend_id
    returning alici into v_adres;

    if v_adres is null then return 'bulunamadi'; end if;

    -- Geri dönen ve şikâyet edilen adrese bir daha gönderme.
    if v_durum in ('dondu', 'sikayet') then
        insert into gizli.eposta_engelli (adres, sebep, detay)
        values (v_adres, case when v_durum = 'dondu' then 'bounced' else 'complained' end,
                left(p_detay, 500))
        on conflict (adres) do update
            set sebep = excluded.sebep, detay = excluded.detay, created_at = now();
    end if;

    return v_durum;
end $$;

revoke all on function public.eposta_teslim_kaydet(text, text, text) from public, anon, authenticated;
grant execute on function public.eposta_teslim_kaydet(text, text, text) to service_role;


-- ============================ 5) TETİKLEYİCİ KARA LİSTEYE BAKSIN
create or replace function gizli.eposta_gonderilebilir(p_adres text, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select p_adres is not null
       and not exists (select 1 from gizli.eposta_engelli e where e.adres = p_adres)
       and coalesce((select t.aktif from public.eposta_tercih t where t.user_id = p_uid), true);
$$;

create or replace function gizli.notification_eposta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_ayar  gizli.eposta_ayar%rowtype;
    v_link  text; v_konu text; v_html text; v_text text; v_mail text;
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
        if gizli.eposta_gonderilebilir(v_mail, new.user_id) then
            insert into gizli.eposta_kuyrugu (notification_id, alici, konu, govde_html, govde_text)
            values (new.id, v_mail, v_konu, v_html, v_text) on conflict do nothing;
        end if;

    elsif new.company_id is not null then
        for r in select p.id from public.profiles p where p.company_id = new.company_id loop
            v_mail := gizli.mail_adresi(r.id);
            if gizli.eposta_gonderilebilir(v_mail, r.id) then
                insert into gizli.eposta_kuyrugu (notification_id, alici, konu, govde_html, govde_text)
                values (new.id, v_mail, v_konu, v_html, v_text) on conflict do nothing;
            end if;
        end loop;

    elsif new.for_admin then
        for r in select p.id from public.profiles p where p.role = 'admin' loop
            v_mail := gizli.mail_adresi(r.id);
            -- Yöneticide tercih aranmaz ama kara liste yine geçerli.
            if v_mail is not null
               and not exists (select 1 from gizli.eposta_engelli e where e.adres = v_mail) then
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


-- ============================ 6) YÖNETİM GÖRÜNÜRLÜĞÜ
-- Artık iki ayrı gerçek var: isteği kabul ettik mi, posta teslim oldu mu.
drop function if exists public.eposta_kuyruk_ozeti();

create or replace function public.eposta_kuyruk_ozeti()
returns table (durum text, adet bigint, hatali bigint, son timestamptz)
language sql stable security definer set search_path = public as $$
    select k.durum, count(*)::bigint,
           count(*) filter (where k.hata is not null)::bigint,
           max(k.created_at)
      from gizli.eposta_kuyrugu k
     where public.is_admin()
     group by k.durum
     order by k.durum;
$$;

create or replace function public.eposta_teslim_ozeti()
returns table (teslim_durum text, adet bigint, son timestamptz)
language sql stable security definer set search_path = public as $$
    select coalesce(k.teslim_durum, 'bilinmiyor'), count(*)::bigint, max(k.teslim_at)
      from gizli.eposta_kuyrugu k
     where public.is_admin() and k.durum = 'gonderildi'
     group by coalesce(k.teslim_durum, 'bilinmiyor')
     order by 1;
$$;

create or replace function public.eposta_engelli_liste(p_limit int default 20)
returns table (adres text, sebep text, detay text, ne_zaman timestamptz)
language sql stable security definer set search_path = public as $$
    select e.adres, e.sebep, e.detay, e.created_at
      from gizli.eposta_engelli e
     where public.is_admin()
     order by e.created_at desc
     limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- Yanlışlıkla engellenen adresi yöneticinin geri açabilmesi için.
create or replace function public.eposta_engeli_kaldir(p_adres text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'Bu işlem yalnız yöneticiye açıktır.'; end if;
    delete from gizli.eposta_engelli where adres = p_adres;
    return found;
end $$;

grant execute on function public.eposta_kuyruk_ozeti()        to authenticated;
grant execute on function public.eposta_teslim_ozeti()        to authenticated;
grant execute on function public.eposta_engelli_liste(int)    to authenticated;
grant execute on function public.eposta_engeli_kaldir(text)   to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  BUNDAN SONRA — VERCEL TARAFI
--  1) Vercel → Settings → Environment Variables (Production):
--        SUPABASE_URL                 https://bxcghdbrafzudiigeeud.supabase.co
--        SUPABASE_SERVICE_ROLE_KEY    (Supabase → Settings → API → service_role)
--        RESEND_WEBHOOK_SECRET        (Resend webhook ekleyince verilen whsec_…)
--     ⚠️ service_role anahtarı VERİTABANININ TAMAMINA yetkilidir. Yalnız
--     sunucu tarafı ortam değişkeninde durur; tarayıcıya asla verilmez.
--
--  2) Resend → Webhooks → Add Webhook
--        URL      https://epcmerkezim.com/api/resend-webhook
--        Olaylar  email.sent, email.delivered, email.delivery_delayed,
--                 email.bounced, email.complained
--
--  KONTROL (admin hesabıyla, tarayıcı konsolunda)
--     await supabaseClient.rpc('eposta_teslim_ozeti')
--  Yeni bir bildirimden sonra 'teslim' satırı görünmeli. 'kabul'de takılı
--  kalıyorsa webhook ulaşmıyordur: Resend → Webhooks → Logs'a bakın.
-- ============================================================================
