-- ============================================================================
--  yarismali-atama.sql
--
--  NE DEĞİŞİYOR
--  Bugün bir kayıt tek firmaya gidiyor (leads.company_id) ve o firma rakipsiz
--  çalışıyor. Yeni model: yatırımcının adresine en yakın 3 firmaya aynı anda
--  davet gider, üçü de teklif verir, yatırımcı karşılaştırıp seçer.
--
--  ⚠️ EN ÖNEMLİ TASARIM KARARI
--  Yarışma aşamasının ilerlemesi leads.status'a YAZILAMAZ — üç firma aynı
--  satırı birbirinin üstüne yazardı. Bu yüzden yarışma ilerlemesi firma başına
--  lead_assignments.durum'da tutuluyor. leads.status ve completed_steps
--  DOKUNULMADAN kalıyor; kazanan belli olduğunda leads.company_id doluyor ve
--  mevcut 7 aşamalı süreç hiç değişmeden kazanan firmayla işliyor.
--
--  Sunucudan doğrulandı (tahmin değil):
--    · leads: city / district YOK → ekleniyor · address (serbest metin) VAR
--    · lead_assignments · ratings YOK → oluşturuluyor
--    · il_bolge (81 il) VAR · companies.city / district VAR
--    · is_admin() · my_company_id() VAR (tedarikci.sql)
--    · quotes: id, lead_id, company_id, status VAR
--
--  ⚠️ leads RLS'ine YALNIZCA EKLEME yapılıyor. Politikalar OR'lanır; mevcut
--  politikaların gövdesi bilinmediği için hiçbirine dokunulmuyor. Atanan firma
--  kaydı yalnız GÖREBİLİR — yazamaz. Yazma hakkı kazanan firmada kalır.
-- ============================================================================

-- ------------------------------------------------------------ 1) KONUM ALANI
-- "En yakın firma" için serbest metin adres yetmez; il/ilçe ayrı gerekir.
alter table public.leads add column if not exists city     text;
alter table public.leads add column if not exists district text;
create index if not exists leads_city_idx on public.leads (city);


-- --------------------------------------------------- 2) TÜRKÇE NORMALLEŞTİRME
-- lower('İstanbul') UTF-8'de birleşik noktalı i üretir ve 'istanbul' ile
-- EŞLEŞMEZ. Türkçe harfleri önce sadeleştirip sonra küçültüyoruz.
create or replace function public.epc_norm(t text)
returns text
language sql
immutable
as $$
    select lower(translate(coalesce(t, ''), 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc'));
$$;


-- --------------------------------------------------------- 3) YAKINLIK KADEMESİ
--   1 = aynı ilçe · 2 = aynı il · 3 = aynı bölge · 4 = diğer
-- Kilometre uydurmuyoruz; elimizde koordinat yok, kademe dürüst olanı.
create or replace function public.epc_yakinlik(
    p_il text, p_ilce text, c_il text, c_ilce text
) returns int
language sql
stable
as $$
    select case
        when p_il is null or c_il is null then 4
        when public.epc_norm(p_il) = public.epc_norm(c_il)
             and p_ilce is not null and c_ilce is not null
             and public.epc_norm(p_ilce) = public.epc_norm(c_ilce) then 1
        when public.epc_norm(p_il) = public.epc_norm(c_il) then 2
        when exists (
            select 1 from public.il_bolge a
            join public.il_bolge b on a.bolge = b.bolge
            where public.epc_norm(a.il) = public.epc_norm(p_il)
              and public.epc_norm(b.il) = public.epc_norm(c_il)
        ) then 3
        else 4
    end;
$$;


-- ------------------------------------------------------------- 4) ATAMA TABLOSU
create table if not exists public.lead_assignments (
    id          uuid primary key default gen_random_uuid(),
    lead_id     uuid not null references public.leads(id)     on delete cascade,
    company_id  uuid not null references public.companies(id) on delete cascade,
    -- YARIŞMA AŞAMASI — firmaya özel. leads.status ile karıştırılmamalı.
    durum       text not null default 'davet',
                -- davet | iletisim | teklif_verildi | kazandi | kaybetti | vazgecti
    yakinlik    int  not null default 4,
    not_        text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (lead_id, company_id)
);
create index if not exists lead_assign_co_idx   on public.lead_assignments (company_id, durum);
create index if not exists lead_assign_lead_idx on public.lead_assignments (lead_id);


-- ------------------------------------------------------------- 5) PUANLAMA
-- Yatırımcı kurulum BİTTİKTEN sonra üç şeyi ayrı ayrı puanlar:
--   platform  → ana sayfada görünür (tek herkese açık puan budur)
--   company   → firma seçim ekranında görünür
--   consultant→ danışman profilinde görünür
create table if not exists public.ratings (
    id           uuid primary key default gen_random_uuid(),
    lead_id      uuid references public.leads(id)   on delete set null,
    investor_id  uuid references auth.users(id)     on delete set null,
    hedef_tip    text not null check (hedef_tip in ('platform', 'company', 'consultant')),
    hedef_id     uuid,                                   -- platform'da null
    puan         int  not null check (puan between 1 and 5),
    yorum        text,
    -- ⚠️ Yorum İTİBAR etkiler. Puan anında sayılır, YORUM onaydan geçer.
    -- Onaysız yayınlamak firmaları iftiraya açık bırakırdı.
    yorum_durum  text not null default 'pending',        -- pending | approved | rejected
    ad_gorunsun  boolean not null default true,
    created_at   timestamptz not null default now()
);
-- hedef_id null olduğunda unique çalışmaz (null'lar ayrı sayılır) — sabitle.
create unique index if not exists ratings_uniq
    on public.ratings (lead_id, hedef_tip,
        coalesce(hedef_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists ratings_hedef_idx on public.ratings (hedef_tip, hedef_id);


-- --------------------------------------------------------- 6) FİRMA PUAN ÖZETİ
create or replace function public.firma_puan_ozeti(p_company_id uuid)
returns table (ortalama numeric, adet int, tamamlanan_is int)
language sql
stable
security definer
set search_path = public
as $$
    select
        (select round(avg(r.puan)::numeric, 1) from public.ratings r
          where r.hedef_tip = 'company' and r.hedef_id = p_company_id),
        (select count(*)::int from public.ratings r
          where r.hedef_tip = 'company' and r.hedef_id = p_company_id),
        (select count(*)::int from public.leads l
          where l.company_id = p_company_id and l.status = 'tamamlandi');
$$;


-- ------------------------------------------------------- 7) EN YAKIN FİRMALAR
-- p_kapsam: en fazla hangi yakınlık kademesine kadar bakılsın (varsayılan 2 = aynı il).
-- Yatırımcı "biraz daha uzağa bak" derse 3 (aynı bölge) veya 4 (tüm Türkiye)
-- ile tekrar çağrılır. Kapsamı kod değil KULLANICI genişletir.
create or replace function public.en_yakin_firmalar(
    p_il     text,
    p_ilce   text,
    p_limit  int default 3,
    p_kapsam int default 2
) returns table (
    company_id uuid, firma text, il text, ilce text, yakinlik int,
    puan numeric, puan_adedi int, tamamlanan_is int
)
language sql
stable
security definer
set search_path = public
as $$
    select c.id, c.name, c.city, c.district,
           public.epc_yakinlik(p_il, p_ilce, c.city, c.district),
           o.ortalama, o.adet, o.tamamlanan_is
    from public.companies c
    left join lateral public.firma_puan_ozeti(c.id) o on true
    where coalesce(c.banned, false) = false
      and c.city is not null
      and public.epc_yakinlik(p_il, p_ilce, c.city, c.district) <= greatest(p_kapsam, 1)
    order by public.epc_yakinlik(p_il, p_ilce, c.city, c.district),
             o.ortalama desc nulls last,
             o.tamamlanan_is desc nulls last,
             c.name
    limit greatest(coalesce(p_limit, 3), 1);
$$;

grant execute on function public.en_yakin_firmalar(text, text, int, int) to anon, authenticated;
grant execute on function public.firma_puan_ozeti(uuid) to anon, authenticated;


-- --------------------------------------------------------- 8) KAÇ FİRMA VAR
-- "Bölgenizde kayıtlı 2 firma var, diğerleri uzak kalıyor" diyebilmek için
-- her kademede kaç firma olduğunu sayar. Yatırımcıya dürüst tablo verir.
create or replace function public.firma_sayilari(p_il text, p_ilce text)
returns table (ayni_ilce int, ayni_il int, ayni_bolge int, diger int)
language sql
stable
security definer
set search_path = public
as $$
    with y as (
        select public.epc_yakinlik(p_il, p_ilce, c.city, c.district) as k
        from public.companies c
        where coalesce(c.banned, false) = false and c.city is not null
    )
    select count(*) filter (where k = 1)::int,
           count(*) filter (where k = 2)::int,
           count(*) filter (where k = 3)::int,
           count(*) filter (where k = 4)::int
    from y;
$$;

grant execute on function public.firma_sayilari(text, text) to anon, authenticated;


-- --------------------------------------------------------- 8b) KONUMU YAZ
-- submit_lead() il/ilçe almıyor ve gövdesi bilinmediği için ona dokunulmuyor.
-- Başvuru oluştuktan hemen sonra konum bu fonksiyonla yazılır; takip kodu
-- yetki belgesidir (kodu bilen, başvuruyu az önce yapan kişidir).
-- Konum YALNIZCA BİR KEZ yazılabilir: sonradan değiştirilip başka bölgenin
-- firmalarına dağılması engellenir.
create or replace function public.lead_konum_yaz(
    p_tracking_code text,
    p_il            text,
    p_ilce          text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    if coalesce(trim(p_il), '') = '' then
        raise exception 'İl boş olamaz';
    end if;

    update public.leads
       set city = trim(p_il),
           district = nullif(trim(coalesce(p_ilce, '')), ''),
           updated_at = now()
     where tracking_code = p_tracking_code
       and city is null
    returning id into v_id;

    if v_id is null then
        return jsonb_build_object('yazildi', false);
    end if;
    return jsonb_build_object('yazildi', true);
end;
$$;

grant execute on function public.lead_konum_yaz(text, text, text) to anon, authenticated;


-- ------------------------------------------------------------ 9) ATAMA YAP
-- Takip koduyla yetkilendirilir: kodu bilen, başvuruyu yeni yapan kişidir.
-- (track_application aynı modeli kullanıyor.) Böylece yatırımcı hesap açmadan
-- da firmalarını seçebiliyor. Admin de çağırabilir.
create or replace function public.lead_firma_esle(
    p_tracking_code text,
    p_limit         int default 3,
    p_kapsam        int default 2
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_lead public.leads%rowtype;
    v_yeni int := 0;
    r      record;
begin
    select * into v_lead from public.leads where tracking_code = p_tracking_code;
    if not found then
        raise exception 'Takip kodu bulunamadı';
    end if;

    -- Zaten bir firmaya bağlıysa yarışma açılmaz (firmanın kendi müşterisi ya da
    -- danışman yönlendirmesi). Bu bilinçli: danışman seçimini yapmıştır.
    if v_lead.company_id is not null then
        return jsonb_build_object('durum', 'zaten_bagli', 'atanan', 0);
    end if;

    if v_lead.city is null then
        raise exception 'Kaydın ili girilmemiş — en yakın firma bulunamaz';
    end if;

    for r in
        select * from public.en_yakin_firmalar(v_lead.city, v_lead.district, p_limit, p_kapsam)
    loop
        insert into public.lead_assignments (lead_id, company_id, yakinlik)
        values (v_lead.id, r.company_id, r.yakinlik)
        on conflict (lead_id, company_id) do nothing;

        if found then
            v_yeni := v_yeni + 1;
            insert into public.notifications (user_id, title, body, icon, link)
            select p.id,
                   'Yeni keşif talebi — ' || coalesce(v_lead.full_name, 'yatırımcı'),
                   coalesce(v_lead.district || ' / ', '') || coalesce(v_lead.city, '') ||
                       ' · Bu talebe başka firmalar da davet edildi, teklifiniz karşılaştırılacak.',
                   '📍',
                   '#kurulumcu-panel/crm'
            from public.profiles p where p.company_id = r.company_id;
        end if;
    end loop;

    return jsonb_build_object('durum', 'atandi', 'atanan', v_yeni);
end;
$$;

grant execute on function public.lead_firma_esle(text, int, int) to anon, authenticated;


-- ------------------------------------------------------ 10) KAZANANI BELİRLE
-- Yatırımcı teklifi kabul edince çağrılır. leads.company_id dolar ve bundan
-- sonrası MEVCUT 7 aşamalı süreçtir — hiçbir şey değişmez.
create or replace function public.lead_kazanan(
    p_lead_id    uuid,
    p_company_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_lead  public.leads%rowtype;
    v_firma text;
begin
    select * into v_lead from public.leads where id = p_lead_id;
    if not found then raise exception 'Kayıt bulunamadı'; end if;

    if not (v_lead.investor_id = auth.uid() or public.is_admin()) then
        raise exception 'Bu kayıt için yetkiniz yok';
    end if;

    if not exists (select 1 from public.lead_assignments la
                    where la.lead_id = p_lead_id and la.company_id = p_company_id) then
        raise exception 'Bu firma bu talebe davet edilmemiş';
    end if;

    select c.name into v_firma from public.companies c where c.id = p_company_id;

    update public.leads set company_id = p_company_id, updated_at = now()
     where id = p_lead_id;

    update public.lead_assignments
       set durum = case when company_id = p_company_id then 'kazandi' else 'kaybetti' end,
           updated_at = now()
     where lead_id = p_lead_id;

    -- Herkese haber ver: kazanan da kaybeden de sonucu öğrensin.
    insert into public.notifications (user_id, title, body, icon, link)
    select p.id,
           case when la.company_id = p_company_id
                then 'Teklifiniz kabul edildi 🎉' else 'Bu talepte başka firma seçildi' end,
           coalesce(v_lead.full_name, 'Yatırımcı') ||
               case when la.company_id = p_company_id
                    then ' teklifinizi kabul etti. Süreci CRM üzerinden yürütebilirsiniz.'
                    else ' başka bir firmayla devam etmeye karar verdi.' end,
           case when la.company_id = p_company_id then '🎉' else 'ℹ️' end,
           '#kurulumcu-panel/crm'
    from public.lead_assignments la
    join public.profiles p on p.company_id = la.company_id
    where la.lead_id = p_lead_id;

    return jsonb_build_object('kazanan', v_firma);
end;
$$;

grant execute on function public.lead_kazanan(uuid, uuid) to authenticated;


-- ------------------------------------------------------------- 11) PUAN VER
create or replace function public.puan_ver(
    p_lead_id   uuid,
    p_hedef_tip text,
    p_puan      int,
    p_yorum     text default null,
    p_hedef_id  uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_lead   public.leads%rowtype;
    v_hedef  uuid;
    v_cons   uuid;
begin
    select * into v_lead from public.leads where id = p_lead_id;
    if not found then raise exception 'Kayıt bulunamadı'; end if;

    if v_lead.investor_id is distinct from auth.uid() then
        raise exception 'Yalnız kendi tesisinizi puanlayabilirsiniz';
    end if;

    -- ⚠️ Kurulum bitmeden puan alınmaz. Yarı yoldaki iş adil değerlendirilemez.
    if v_lead.status is distinct from 'tamamlandi' then
        raise exception 'Puanlama kurulum tamamlandıktan sonra açılır';
    end if;

    if p_puan < 1 or p_puan > 5 then raise exception 'Puan 1 ile 5 arasında olmalı'; end if;

    -- Hedefi kaydın kendisinden doğrula: kullanıcı istediği firmayı puanlayamaz.
    if p_hedef_tip = 'platform' then
        v_hedef := null;
    elsif p_hedef_tip = 'company' then
        if v_lead.company_id is null then raise exception 'Bu kayda bağlı firma yok'; end if;
        v_hedef := v_lead.company_id;
    elsif p_hedef_tip = 'consultant' then
        select cc.consultant_id into v_cons
        from public.consultant_clients cc where cc.id = v_lead.consultant_client_id;
        if v_cons is null then raise exception 'Bu kayda bağlı danışman yok'; end if;
        v_hedef := v_cons;
    else
        raise exception 'Geçersiz hedef';
    end if;

    insert into public.ratings (lead_id, investor_id, hedef_tip, hedef_id, puan, yorum)
    values (p_lead_id, auth.uid(), p_hedef_tip, v_hedef, p_puan, nullif(trim(coalesce(p_yorum,'')), ''))
    on conflict (lead_id, hedef_tip, coalesce(hedef_id, '00000000-0000-0000-0000-000000000000'::uuid))
    -- ON CONFLICT içinde mevcut satıra ŞEMASIZ ad ile erişilir (public.ratings.x hata verir).
    do update set puan = excluded.puan,
                  yorum = excluded.yorum,
                  yorum_durum = case when excluded.yorum is distinct from ratings.yorum
                                     then 'pending' else ratings.yorum_durum end,
                  created_at = now();

    return jsonb_build_object('kaydedildi', true, 'yorum_onayda', (nullif(trim(coalesce(p_yorum,'')),'') is not null));
end;
$$;

grant execute on function public.puan_ver(uuid, text, int, text, uuid) to authenticated;


-- -------------------------------------------- 12) ANA SAYFA: PLATFORM YORUMLARI
-- ⚠️ Yalnız platform puanı herkese açıktır. Firma ve danışman yorumları buradan
-- DÖNMEZ; onlar yalnız firma seçim ekranında ve danışman profilinde görünür.
create or replace function public.platform_deneyimi(p_limit int default 6)
returns table (puan int, yorum text, ad text, tarih timestamptz)
language sql
stable
security definer
set search_path = public
as $$
    select r.puan,
           r.yorum,
           case when r.ad_gorunsun
                then split_part(coalesce(l.full_name, ''), ' ', 1) ||
                     case when position(' ' in coalesce(l.full_name,'')) > 0
                          then ' ' || left(split_part(l.full_name, ' ', 2), 1) || '.' else '' end
                else 'Yatırımcı' end,
           r.created_at
    from public.ratings r
    left join public.leads l on l.id = r.lead_id
    where r.hedef_tip = 'platform'
      and r.yorum is not null
      and r.yorum_durum = 'approved'
    order by r.created_at desc
    limit greatest(coalesce(p_limit, 6), 1);
$$;

create or replace function public.platform_puani()
returns table (ortalama numeric, adet int)
language sql
stable
security definer
set search_path = public
as $$
    select round(avg(puan)::numeric, 1), count(*)::int
    from public.ratings where hedef_tip = 'platform';
$$;

grant execute on function public.platform_deneyimi(int) to anon, authenticated;
grant execute on function public.platform_puani() to anon, authenticated;


-- ------------------------------------------- 13) FİRMA YORUMLARI (seçim ekranı)
create or replace function public.firma_yorumlari(p_company_id uuid, p_limit int default 5)
returns table (puan int, yorum text, ad text, tarih timestamptz)
language sql
stable
security definer
set search_path = public
as $$
    select r.puan, r.yorum,
           case when r.ad_gorunsun
                then split_part(coalesce(l.full_name, ''), ' ', 1) else 'Yatırımcı' end,
           r.created_at
    from public.ratings r
    left join public.leads l on l.id = r.lead_id
    where r.hedef_tip = 'company' and r.hedef_id = p_company_id
      and r.yorum is not null and r.yorum_durum = 'approved'
    order by r.created_at desc
    limit greatest(coalesce(p_limit, 5), 1);
$$;

grant execute on function public.firma_yorumlari(uuid, int) to anon, authenticated;


-- ------------------------------------------------------------- 14) RLS
alter table public.lead_assignments enable row level security;
alter table public.ratings          enable row level security;

-- Firma kendi davetlerini görür ve yarışma durumunu günceller.
drop policy if exists la_firma_select on public.lead_assignments;
create policy la_firma_select on public.lead_assignments for select to authenticated
    using (company_id = public.my_company_id() or public.is_admin());

drop policy if exists la_firma_update on public.lead_assignments;
create policy la_firma_update on public.lead_assignments for update to authenticated
    using (company_id = public.my_company_id())
    with check (company_id = public.my_company_id());

drop policy if exists la_admin_all on public.lead_assignments;
create policy la_admin_all on public.lead_assignments for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- Yatırımcı kendi kaydının davetlerini görür (firmaları karşılaştırabilsin).
drop policy if exists la_yatirimci_select on public.lead_assignments;
-- ⚠️ Alt sorgu yerine fonksiyon — yukarıdaki döngü açıklamasına bakın.
create policy la_yatirimci_select on public.lead_assignments for select to authenticated
    using (public.lead_yatirimcisi(lead_assignments.lead_id));

-- Puanlar: yatırımcı kendi puanını görür/yazar, admin hepsini yönetir.
drop policy if exists r_kendi on public.ratings;
create policy r_kendi on public.ratings for select to authenticated
    using (investor_id = auth.uid() or public.is_admin());

drop policy if exists r_admin on public.ratings;
create policy r_admin on public.ratings for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- ⚠️ leads'e YALNIZCA EKLEME. Politikalar OR'lanır; mevcutlara dokunulmuyor.
-- Davet edilen firma kaydı GÖRÜR ama YAZAMAZ — yazma kazananda kalır.
-- ⚠️ ALT SORGU DEĞİL, FONKSİYON. Bu politika doğrudan lead_assignments'tan
-- SELECT yapıyordu; lead_assignments'ın la_yatirimci_select politikası da
-- leads'ten SELECT yapıyor. İkisi birbirini çağırınca PostgreSQL
-- "infinite recursion detected in policy" verip HER İKİ TABLOYU DA oturum
-- açmış kullanıcılara tamamen kapattı. Çözüm rls-dongu-duzelt.sql'de:
-- alt sorgu SECURITY DEFINER fonksiyona taşındı, döngü kırıldı.
drop policy if exists leads_davetli_select on public.leads;
create policy leads_davetli_select on public.leads for select to authenticated
    using (public.lead_davetli_firma(leads.id));

notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA
--
--  Yakınlık doğru mu (Pendik/İstanbul için kademeler):
--    select * from public.firma_sayilari('İstanbul', 'Pendik');
--    select * from public.en_yakin_firmalar('İstanbul', 'Pendik', 3, 2);
--
--  ⚠️ FİRMALARIN İL/İLÇESİ BOŞSA hiçbir firma dönmez. en_yakin_firmalar
--  city'si null olan firmaları eler — uydurma konumla eşleştirmemek için.
--    select name, city, district from public.companies;
--
--  ⚠️ ESKİ KAYITLARIN il/ilçesi yok; yarışmalı atama yalnız yeni kayıtlarda
--  çalışır. Geçmişe dokunulmadı.
-- ============================================================================
