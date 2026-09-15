-- ============================================================================
--  panel-gelistirmeler.sql   (2. sürüm — ilk sürüm hata verip geri alınıyordu)
--
--  1) Firmalara il / ilçe alanı — danışmanın firma seçicisinde arama için
--  2) Kurulum durumu değişince danışmana bildirim
--
--  ⚠️ İLK SÜRÜM NEDEN ÇALIŞMADI
--  "create or replace function list_companies()" ile fonksiyonun DÖNÜŞ TİPİNİ
--  değiştirmeye çalışıyordu (id+name → id+name+city+district). PostgreSQL buna
--  izin vermez: "cannot change return type of existing function". SQL editörü
--  betiği tek işlem olarak çalıştırdığı için hata TÜM betiği geri aldı — bu
--  yüzden district kolonu da oluşmadı. Artık önce drop ediliyor.
--
--  Sunucudan doğrulandı (tahmin değil):
--    · companies.city   VAR (zaten vardı) · companies.district YOK
--    · list_companies() hâlâ yalnız id+name döndürüyor
--    · consultants.id = auth kullanıcı kimliği (user_id kolonu YOK)
--    · notifications: user_id · title · body · icon · link · is_read
--
--  Bu dosya çalıştırılmadan arayüz bozulmaz; yalnız iki yetenek kapalı kalır:
--    · Firma araması ada göre çalışır (il/ilçe kolonu yok)
--    · Kurulum durumu değişince danışmana bildirim düşmez
-- ============================================================================

-- ---------------------------------------------------------------- 1) İL / İLÇE
alter table public.companies add column if not exists city     text;
alter table public.companies add column if not exists district text;

create index if not exists companies_city_idx on public.companies (city);

-- ⚠️ DROP ŞART: dönüş tipi değişiyor, "create or replace" yetmez.
drop function if exists public.list_companies();

create function public.list_companies()
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
-- kadar yalnız kendi listesini açınca görüyordu; artık bildirim düşüyor.
--
-- NOT: consultant_clients.consultant_id doğrudan consultants.id, o da auth
-- kullanıcı kimliği (auth.js hesabı "consultants.id = user.id" ile buluyor).
-- Bu yüzden ayrıca bir kullanıcı araması yapılmıyor.
drop function if exists public.set_client_install_status(uuid, text);

create function public.set_client_install_status(
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
    v_etiket       text;
begin
    select p.company_id into v_company_id
    from public.profiles p where p.id = auth.uid();

    if v_company_id is null then
        raise exception 'Firma kaydı bulunamadı';
    end if;

    -- ⚠️ Yalnız KENDİ firmasına atanmış danışanın durumu değiştirilebilir.
    update public.consultant_clients cc
       set install_status = nullif(p_status, ''),
           updated_at     = now()
     where cc.id = p_client_id
       and cc.assigned_company_id = v_company_id
    returning cc.consultant_id, cc.name into v_consultant, v_client_name;

    if v_consultant is null then
        raise exception 'Bu danışan firmanıza atanmamış';
    end if;

    select c.name into v_company_name
    from public.companies c where c.id = v_company_id;

    v_etiket := case nullif(p_status, '')
        when 'basvuru'    then 'Başvuru sürecinde'
        when 'kurulumda'  then 'Kurulum başladı'
        when 'tamamlandi' then 'Kurulum tamamlandı'
        when 'iptal'      then 'İptal edildi'
        else 'Durum güncellendi' end;

    insert into public.notifications (user_id, title, body, icon, link)
    values (
        v_consultant,
        v_etiket || ' — ' || coalesce(v_client_name, 'danışan'),
        coalesce(v_company_name, 'Kurulumcu firma') || ' kurulum durumunu güncelledi.',
        case nullif(p_status, '') when 'tamamlandi' then '✅' when 'iptal' then '⚠️' else '🔧' end,
        '#danisman-panel/danisan-takip'
    );
end;
$$;

grant execute on function public.set_client_install_status(uuid, text) to authenticated;

-- PostgREST şema önbelleği: fonksiyon imzası değişti, yenilensin.
notify pgrst, 'reload schema';

-- ============================================================================
--  KONTROL — çalıştırdıktan sonra bunu da çalıştırın, dört kolon dönmeli:
--     select * from public.list_companies();
--
--  Firmaların il/ilçesini doldurmak için (örnek):
--     update public.companies set city = 'İstanbul', district = 'Pendik'
--      where name = 'Enerji';
-- ============================================================================
