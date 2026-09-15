-- ============================================================================
--  panel-gelistirmeler.sql
--  1) Firmalara il / ilçe alanı — danışmanın firma seçicisinde arama için
--  2) Kurulum durumu değişince danışmana bildirim
--
--  ⚠️ Bu dosya ÇALIŞTIRILMADAN:
--     · Danışmanın firma araması yalnız ADA göre çalışır (il/ilçe kolonu yok).
--     · Kurulumcu kurulum durumunu değiştirdiğinde danışmana bildirim düşmez;
--       danışman değişikliği yalnız kendi listesine bakınca görür.
--  Arayüz her iki durumda da çalışır, sadece bu iki yetenek kapalı kalır.
-- ============================================================================

-- ---------------------------------------------------------------- 1) İL / İLÇE
alter table public.companies add column if not exists city     text;
alter table public.companies add column if not exists district text;

-- İl bazlı arama için (küçük tablo, yine de sıralama/eşitlik hızlansın)
create index if not exists companies_city_idx on public.companies (city);

-- list_companies danışmanın firma seçicisini besliyor; il/ilçe de dönsün.
-- ⚠️ Yalnız GİRİLMİŞ değer döner. Boşsa arayüz "il/ilçe girilmemiş" yazar;
--    uydurma konum göstermez.
create or replace function public.list_companies()
returns table (id uuid, name text, city text, district text)
language sql
security definer
set search_path = public
as $$
    select c.id, c.name, c.city, c.district
    from public.companies c
    where coalesce(c.banned, false) = false
    order by c.name;
$$;

grant execute on function public.list_companies() to anon, authenticated;

-- ------------------------------------------------- 2) KURULUM DURUMU BİLDİRİMİ
-- Kurulumcu firma, danışmanın kendisine yönlendirdiği danışanın kurulum
-- durumunu "Danışman Kanalı" ekranından güncelliyor. Danışman bunu şimdiye
-- kadar yalnız kendi listesini açınca görüyordu. Artık bildirim düşüyor.
create or replace function public.set_client_install_status(
    p_client_id uuid,
    p_status    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_company_id   uuid;
    v_consultant   uuid;
    v_client_name  text;
    v_company_name text;
    v_user         uuid;
    v_etiket       text;
begin
    -- Çağıran kullanıcının firması
    select company_id into v_company_id
    from public.profiles where id = auth.uid();

    if v_company_id is null then
        raise exception 'Firma kaydı bulunamadı';
    end if;

    -- ⚠️ Yalnız KENDİ firmasına atanmış danışanın durumunu değiştirebilir.
    update public.consultant_clients
       set install_status = nullif(p_status, ''),
           updated_at     = now()
     where id = p_client_id
       and assigned_company_id = v_company_id
    returning consultant_id, name into v_consultant, v_client_name;

    if not found then
        raise exception 'Bu danışan firmanıza atanmamış';
    end if;

    -- Bildirim: danışmanın kullanıcı hesabına
    select user_id into v_user from public.consultants where id = v_consultant;
    select name    into v_company_name from public.companies where id = v_company_id;

    if v_user is not null then
        v_etiket := case nullif(p_status, '')
            when 'basvuru'    then 'Başvuru sürecinde'
            when 'kurulumda'  then 'Kurulum başladı'
            when 'tamamlandi' then 'Kurulum tamamlandı'
            when 'iptal'      then 'İptal edildi'
            else 'Durum güncellendi' end;

        insert into public.notifications (user_id, title, body, icon, link)
        values (
            v_user,
            v_etiket || ' — ' || coalesce(v_client_name, 'danışan'),
            coalesce(v_company_name, 'Kurulumcu firma') || ' kurulum durumunu güncelledi.',
            case nullif(p_status, '') when 'tamamlandi' then '✅' when 'iptal' then '⚠️' else '🔧' end,
            '#danisan-takip'
        );
    end if;
end;
$$;

grant execute on function public.set_client_install_status(uuid, text) to authenticated;

-- KONTROL
--   select id, name, city, district from public.companies order by name;
--   -- İl/ilçe doldurmak için (örnek):
--   -- update public.companies set city = 'İstanbul', district = 'Pendik' where name = 'Enerji';
