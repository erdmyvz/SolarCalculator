-- ============================================================================
--  basvuru-hiz-siniri.sql
--
--  Ziyaretçi formu anonim ve sınırsız çağrılabiliyordu. Bugüne kadar sorun
--  değildi çünkü siteyi kimse bilmiyordu. Reklamla adres yayılınca bir bot
--  formu saatlerce doldurabilir; tek kurulumcu firmanın paneli çöp kayıtla
--  dolar ve gerçek başvuru ayırt edilemez hâle gelir.
--
--  ⚠️ IP AÇIK SAKLANMIYOR — TUZLU ÖZETİ SAKLANIYOR
--  IP adresi KVKK kapsamında kişisel veridir. Kötüye kullanım için IP'nin
--  KENDİSİNE ihtiyacımız yok; "aynı kaynak mı?" sorusuna cevap yeterli.
--  Bu yüzden md5(ip || gizli tuz) saklanıyor. Tuz olmadan geri çevrilemez
--  (IPv4 uzayı küçük, tuzsuz özet kaba kuvvetle çözülür — tuz bu yüzden var).
--  Aynı mantık e-posta için de geçerli.
--
--  ⚠️ SINIRLAR BİLEREK GENİŞ
--  Yanlış pozitifin bedeli gerçek bir müşteri. Bir ev iki başvuru yapabilir
--  (kurulum + servis), bir ofis aynı IP'den birkaç kişi olabilir. Yüzlerce
--  istek atan bot yakalanır, insan yakalanmaz.
--
--  ⚠️ YALNIZ ANONİM AKIŞ SINIRLANIYOR. Firma kendi müşterisini CRM'e
--  eklerken (oturum açık) sınır uygulanmıyor; orada kötüye kullanım yüzeyi
--  yok ve firmayı yavaşlatmak işimize gelmez.
-- ============================================================================


-- ============================================ 1) KAYIT
create table if not exists gizli.hiz_kayit (
    id         bigserial primary key,
    anahtar    text not null,          -- tuzlu özet; ham IP/e-posta DEĞİL
    tur        text not null check (tur in ('ip', 'eposta')),
    created_at timestamptz not null default now()
);

create index if not exists hiz_kayit_arama_idx
    on gizli.hiz_kayit (anahtar, created_at desc);


-- ============================================ 2) TUZ
create table if not exists gizli.hiz_tuz (
    tek  boolean primary key default true check (tek),
    tuz  text not null
);
insert into gizli.hiz_tuz (tek, tuz)
select true, encode(gen_random_bytes(16), 'hex')
where not exists (select 1 from gizli.hiz_tuz);


-- ============================================ 3) KONTROL
create or replace function gizli.hiz_siniri(p_eposta text)
returns text
language plpgsql security definer set search_path = public, gizli as $$
declare
    v_tuz    text;
    v_ip     text;
    v_ipk    text;
    v_epk    text;
    v_ip15   int := 0;
    v_ipgun  int := 0;
    v_ep15   int := 0;
    v_epgun  int := 0;
    -- Geniş tutuldu: insanı değil botu yakalamalı.
    C_IP_15    constant int := 8;
    C_IP_GUN   constant int := 25;
    C_EP_15    constant int := 3;
    C_EP_GUN   constant int := 6;
begin
    select tuz into v_tuz from gizli.hiz_tuz limit 1;
    if v_tuz is null then return null; end if;   -- kurulum eksikse akışı kesme

    -- Eski kayıtları ara sıra temizle: ayrı bir cron işi kurmadan,
    -- tablonun süresiz büyümesini engellemek için.
    if random() < 0.02 then
        delete from gizli.hiz_kayit where created_at < now() - interval '2 days';
    end if;

    -- İstek başlığı her ortamda gelmeyebilir (SQL editöründe yok).
    begin
        v_ip := split_part(
                  coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
                  ',', 1);
    exception when others then v_ip := '';
    end;
    v_ip := nullif(btrim(v_ip), '');

    if v_ip is not null then
        v_ipk := md5(v_ip || v_tuz);
        select count(*) filter (where created_at > now() - interval '15 minutes'),
               count(*) filter (where created_at > now() - interval '1 day')
          into v_ip15, v_ipgun
          from gizli.hiz_kayit where anahtar = v_ipk and tur = 'ip';
    end if;

    if nullif(btrim(coalesce(p_eposta, '')), '') is not null then
        v_epk := md5(lower(btrim(p_eposta)) || v_tuz);
        select count(*) filter (where created_at > now() - interval '15 minutes'),
               count(*) filter (where created_at > now() - interval '1 day')
          into v_ep15, v_epgun
          from gizli.hiz_kayit where anahtar = v_epk and tur = 'eposta';
    end if;

    if v_ep15 >= C_EP_15 or v_epgun >= C_EP_GUN then
        return 'Bu e-posta adresiyle kısa süre içinde birden fazla başvuru alındı. ' ||
               'Başvurunuz bize ulaştıysa tekrar göndermenize gerek yok — ' ||
               'takip kodunuzla durumu izleyebilirsiniz. Yeni bir talep için ' ||
               'lütfen bir süre sonra tekrar deneyin.';
    end if;

    if v_ip15 >= C_IP_15 or v_ipgun >= C_IP_GUN then
        return 'Bağlantınızdan kısa süre içinde çok sayıda başvuru geldi. ' ||
               'Lütfen birkaç dakika sonra tekrar deneyin. Sorun sürerse ' ||
               'bize doğrudan yazabilirsiniz.';
    end if;

    -- Sayaçları işle (yalnız geçen istekler için).
    if v_ipk is not null then
        insert into gizli.hiz_kayit (anahtar, tur) values (v_ipk, 'ip');
    end if;
    if v_epk is not null then
        insert into gizli.hiz_kayit (anahtar, tur) values (v_epk, 'eposta');
    end if;

    return null;
end $$;


-- ============================================ 4) TETİKLEYİCİLER
create or replace function public.basvuru_hiz_guard()
returns trigger
language plpgsql security definer set search_path = public, gizli as $$
declare v_engel text;
begin
    -- Yalnız anonim akış. Oturum açmış kullanıcı (firma CRM'e müşteri
    -- ekliyor, yönetici kayıt giriyor) sınırlanmıyor.
    if auth.uid() is not null then return new; end if;

    v_engel := gizli.hiz_siniri(new.email);
    if v_engel is not null then
        raise exception '%', v_engel;
    end if;
    return new;
end $$;

drop trigger if exists leads_hiz_trg on public.leads;
create trigger leads_hiz_trg before insert on public.leads
    for each row execute function public.basvuru_hiz_guard();

drop trigger if exists service_requests_hiz_trg on public.service_requests;
create trigger service_requests_hiz_trg before insert on public.service_requests
    for each row execute function public.basvuru_hiz_guard();


notify pgrst, 'reload schema';

-- ============================================================================
--  ⚠️ DENEME AYRI DOSYADA: basvuru-hiz-siniri-deneme.sql
--
--  ⚠️ ÖNCE service_requests TABLOSUNDA email KOLONU OLDUĞU DOĞRULANMALI.
--  Yoksa tetikleyici "record new has no field email" ile HER servis talebini
--  düşürür — koruma diye eklenen şey formu tamamen kırar.
-- ============================================================================
