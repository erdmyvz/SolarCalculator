-- ============================================================================
--  eposta-erken-olay-duzelt.sql
--
--  NE OLDU
--  Teslim webhook'u kuruldu, Resend "Success" diyor, imza doğrulanıyor —
--  ama kuyrukta teslim_durum 'kabul'da takılı kalıyordu. Canlıda üretildi:
--
--      07:03:08  satır kuyruğa girdi, net.http_post ile Resend'e gitti
--      07:03:1x  Resend email.sent + email.delivered webhook'unu yolladı
--                → eposta_teslim_kaydet('01a0bda0…')
--                → o resend_id'ye sahip SATIR HENÜZ YOK → 'bulunamadi'
--                → uç 200 döndü, OLAY KAYBOLDU
--      07:04:xx  cron yanıtı okudu, resend_id'yi yazdı, 'kabul' dedi
--
--  Sebep: pg_net eşzamansız. Resend'in verdiği kimliği ancak bir sonraki
--  cron turunda öğreniyoruz; webhook ise saniyeler içinde geliyor. Yani
--  teslim olayları neredeyse HER ZAMAN erken geliyor.
--
--  Fonksiyonun kendisi doğru çalışıyor — elle çağrılınca 'teslim' yazıyor.
--  Kusur eşleştirme anında.
--
--  ÇÖZÜM — OLAYI ASLA ATMA
--  Eşleşmeyen olay çöpe atılmıyor, bekleme tablosuna yazılıyor. Kuyruk
--  resend_id'yi öğrendiği anda bekleyen olaylar GELİŞ SIRASIYLA uygulanıyor.
--  Sıra önemli: 'sent' ile 'delivered' arka arkaya gelir; ters uygulanırsa
--  teslim edilmiş posta "kabul edildi"de kalırdı.
--
--  ⚠️ Bu dosyanın varlık sebebi, kapatmaya çalıştığımız hatanın bir
--  benzerini yeni bir yerde üretmiş olmam: her şey "başarılı" görünürken
--  gerçek sessizce kayboluyordu.
-- ============================================================================


-- ======================================= 1) BEKLEYEN OLAY TABLOSU
create table if not exists gizli.eposta_olay_bekleyen (
    id         bigserial primary key,
    resend_id  text not null,
    olay       text not null,
    detay      text,
    created_at timestamptz not null default now(),
    islendi_at timestamptz
);

create index if not exists eposta_olay_bekleyen_acik
    on gizli.eposta_olay_bekleyen (resend_id, id) where islendi_at is null;


-- ======================================= 2) TEK OLAYI UYGULA
-- Hem webhook hem de bekleyen olay tekrarı bu gövdeyi kullanıyor;
-- mantığın iki yerde ayrı ayrı yaşaması, zamanla ayrışması demekti.
create or replace function gizli.eposta_olay_uygula(
    p_resend_id text, p_olay text, p_detay text
) returns text
language plpgsql security definer set search_path = public as $$
declare
    v_durum text;
    v_adres text;
begin
    v_durum := case p_olay
        when 'email.sent'             then 'kabul'
        when 'email.delivered'        then 'teslim'
        when 'email.delivery_delayed' then 'gecikti'
        when 'email.bounced'          then 'dondu'
        when 'email.complained'       then 'sikayet'
        when 'email.failed'           then 'basarisiz'
        else null
    end;
    if v_durum is null then return 'yoksayildi'; end if;

    update gizli.eposta_kuyrugu
       set teslim_durum = v_durum,
           teslim_at    = now(),
           teslim_detay = left(p_detay, 500)
     where resend_id = p_resend_id
    returning alici into v_adres;

    if v_adres is null then return 'bulunamadi'; end if;

    if v_durum in ('dondu', 'sikayet') then
        insert into gizli.eposta_engelli (adres, sebep, detay)
        values (v_adres, case when v_durum = 'dondu' then 'bounced' else 'complained' end,
                left(p_detay, 500))
        on conflict (adres) do update
            set sebep = excluded.sebep, detay = excluded.detay, created_at = now();
    end if;

    return v_durum;
end $$;


-- ======================================= 3) WEBHOOK UCU
-- Eşleşmezse ARTIK ATMIYOR: bekletiyor.
create or replace function public.eposta_teslim_kaydet(
    p_resend_id text, p_olay text, p_detay text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
    v_sonuc text;
begin
    if coalesce(btrim(p_resend_id), '') = '' then
        raise exception 'resend_id gerekli';
    end if;

    v_sonuc := gizli.eposta_olay_uygula(p_resend_id, p_olay, p_detay);

    -- Satır henüz yok (pg_net yanıtı okunmadı): olayı sakla, sonra uygula.
    if v_sonuc = 'bulunamadi' then
        insert into gizli.eposta_olay_bekleyen (resend_id, olay, detay)
        values (p_resend_id, p_olay, left(p_detay, 500));
        return 'beklemede';
    end if;

    return v_sonuc;
end $$;

revoke all on function public.eposta_teslim_kaydet(text, text, text) from public, anon, authenticated;
grant execute on function public.eposta_teslim_kaydet(text, text, text) to service_role;


-- ======================================= 4) BEKLEYENLERİ UYGULA
create or replace function gizli.eposta_bekleyen_olaylari_isle()
returns int language plpgsql security definer set search_path = public as $$
declare
    r   record;
    v_n int := 0;
begin
    -- ⚠️ GELİŞ SIRASIYLA (id artan). 'sent' ve 'delivered' saniyeler arayla
    -- gelir; ters uygulanırsa teslim edilmiş posta 'kabul'de kalır.
    for r in
        select b.id, b.resend_id, b.olay, b.detay
          from gizli.eposta_olay_bekleyen b
         where b.islendi_at is null
           and exists (select 1 from gizli.eposta_kuyrugu k where k.resend_id = b.resend_id)
         order by b.id
    loop
        perform gizli.eposta_olay_uygula(r.resend_id, r.olay, r.detay);
        update gizli.eposta_olay_bekleyen set islendi_at = now() where id = r.id;
        v_n := v_n + 1;
    end loop;

    -- Bir haftadır eşleşmeyen olay artık eşleşmeyecek; tablo şişmesin.
    delete from gizli.eposta_olay_bekleyen
     where islendi_at is null and created_at < now() - interval '7 days';

    return v_n;
end $$;


-- ======================================= 5) SONUÇ OKUMASINA BAĞLA
-- resend_id yazılır yazılmaz bekleyenler uygulanıyor; ayrı bir cron işine
-- gerek yok, zaten dakikada bir çalışan tur bunu da yapıyor.
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
            exception when others then v_id := null;
            end;

            update gizli.eposta_kuyrugu
               set durum = 'gonderildi', http_kod = r.status_code,
                   hata = null, sonuc_at = now(),
                   resend_id = coalesce(v_id, resend_id),
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

    -- Kimlikler yazıldı; erken gelmiş teslim olaylarını şimdi uygula.
    perform gizli.eposta_bekleyen_olaylari_isle();

    return v_n;
end $$;


-- ======================================= 6) YÖNETİM GÖRÜNÜRLÜĞÜ
-- Bekleyen olay birikiyorsa bir şey ters demektir; görünmezse anlaşılmaz.
create or replace function public.eposta_bekleyen_olay_sayisi()
returns int language sql stable security definer set search_path = public as $$
    select case when public.is_admin()
                then (select count(*)::int from gizli.eposta_olay_bekleyen where islendi_at is null)
                else 0 end;
$$;

grant execute on function public.eposta_bekleyen_olay_sayisi() to authenticated;


-- Geçmişte kaybolan olaylar için tek seferlik telafi: kuyruktaki
-- 'kabul' satırlarının gerçek durumu bundan sonraki olaylarla düzelecek.
select gizli.eposta_bekleyen_olaylari_isle() as uygulanan_bekleyen;

notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA
--  Yeni bir bildirim üretin; en geç iki cron turunda (≈2 dk) satırın
--  teslim_durum'u 'teslim' olmalı. 'kabul'de kalıyorsa:
--      select * from gizli.eposta_olay_bekleyen where islendi_at is null;
--  Burada satır varsa eşleştirme, yoksa webhook ulaşmıyor demektir.
-- ============================================================================
