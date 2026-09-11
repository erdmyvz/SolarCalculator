-- ============================================================================
--  tedarikci.sql — TEDARİKÇİ ROLÜ
--  Supabase SQL Editor'de bir kez çalıştırın.
--
--  Tedarikçi, platformun dördüncü tarafıdır. Yatırımcıya DOĞRUDAN gösterilmez;
--  bu bilinçli bir tercihtir — platform "satıcıdan bağımsız" konumlanıyor ve
--  tedarikçiyi yatırımcının önüne koymak bu iddiayı zayıflatır. Tedarikçi:
--    1) ürün kataloğunu yayınlar  → onaydan geçince donanım karşılaştırmasını besler
--    2) kurulumcu firmalara ulaşır → fiyat/stok talepleri alır
--    3) bayi/kurulumcu ağı ilanı verir
--
--  Kalıp danışman rolüyle aynıdır: suppliers tablosu auth.users'a 1-1 bağlıdır,
--  abonelik ve ban alanları satırda tutulur, admin onayı statü ile yürür.
--  hardware.sql önce çalıştırılmış olmalıdır.
-- ============================================================================

-- ------------------------------------------------------------------ tedarikçi
create table if not exists public.suppliers (
    id             uuid primary key references auth.users(id) on delete cascade,
    company_name   text not null,
    full_name      text,
    email          text,
    phone          text,
    city           text,
    website        text,
    about          text,                       -- kısa tanıtım
    categories     text[] default '{}',        -- panel, inverter, batarya, montaj...
    brands         text[] default '{}',        -- temsil edilen markalar
    logo_url       text,

    -- admin onay akışı (danışman profiliyle aynı mantık)
    status         text not null default 'draft',   -- draft | pending | approved | rejected
    reject_reason  text,

    -- abonelik (kurulumcu 400$, danışman 200$, tedarikçi 600$/ay)
    sub_status     text default 'trial',
    sub_ends_at    timestamptz default (now() + interval '30 days'),
    banned         boolean not null default false,
    ban_reason     text,

    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

-- --------------------------------------------------------- tedarikçi kataloğu
-- Onaylanan satır donanım karşılaştırma tablosuna taşınır (hardware_items).
create table if not exists public.supplier_products (
    id            uuid primary key default gen_random_uuid(),
    supplier_id   uuid not null references public.suppliers(id) on delete cascade,
    category_key  text not null,               -- hardware_categories.key ile hizalı
    name          text not null,               -- marka / model
    cells         jsonb not null default '[]'::jsonb,  -- kategorinin cols dizisiyle aynı sırada
    source_url    text,                        -- üretici teknik dokümanı
    note          text,                        -- tedarikçinin admin'e notu

    status        text not null default 'pending',  -- pending | approved | rejected
    reject_reason text,
    hardware_item_id uuid references public.hardware_items(id) on delete set null,

    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists supplier_products_sup_idx on public.supplier_products (supplier_id, status);

-- --------------------------------------------------------- bayi / ağ ilanları
create table if not exists public.supplier_dealer_ads (
    id            uuid primary key default gen_random_uuid(),
    supplier_id   uuid not null references public.suppliers(id) on delete cascade,
    title         text not null,
    body          text,
    cities        text[] default '{}',
    status        text not null default 'pending',  -- pending | approved | rejected
    reject_reason text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists supplier_ads_sup_idx on public.supplier_dealer_ads (supplier_id, status);

-- ------------------------------------- kurulumcu → tedarikçi fiyat/stok talebi
create table if not exists public.supplier_requests (
    id           uuid primary key default gen_random_uuid(),
    supplier_id  uuid not null references public.suppliers(id) on delete cascade,
    company_id   uuid,                         -- talebi açan kurulumcu firma
    created_by   uuid references auth.users(id) on delete set null,
    subject      text not null,
    body         text,
    status       text not null default 'open', -- open | answered | closed
    answer       text,
    answered_at  timestamptz,
    created_at   timestamptz not null default now()
);

create index if not exists supplier_requests_sup_idx on public.supplier_requests (supplier_id, status);
create index if not exists supplier_requests_co_idx  on public.supplier_requests (company_id);

-- ------------------------------------------------------------ updated_at trig
create or replace function public.supplier_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists suppliers_touch on public.suppliers;
create trigger suppliers_touch before update on public.suppliers
    for each row execute function public.supplier_touch_updated_at();

drop trigger if exists supplier_products_touch on public.supplier_products;
create trigger supplier_products_touch before update on public.supplier_products
    for each row execute function public.supplier_touch_updated_at();

drop trigger if exists supplier_ads_touch on public.supplier_dealer_ads;
create trigger supplier_ads_touch before update on public.supplier_dealer_ads
    for each row execute function public.supplier_touch_updated_at();

-- ============================================================================
--  Yardımcılar
-- ============================================================================
-- is_admin() hardware.sql'de tanımlıdır; yoksa burada da güvenceye alalım.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- Giriş yapan kullanıcının kurulumcu firma kimliği (yoksa null).
create or replace function public.my_company_id()
returns uuid language sql stable security definer set search_path = public as $$
    select company_id from public.profiles where id = auth.uid();
$$;

-- Kullanıcı onaylı, engellenmemiş bir tedarikçi mi?
create or replace function public.is_active_supplier()
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.suppliers s
        where s.id = auth.uid() and s.status = 'approved' and not s.banned
    );
$$;

-- ============================================================================
--  RLS
--  · tedarikçi kendi satırlarını görür ve yazar
--  · kurulumcu firma yalnız ONAYLI tedarikçileri ve onaylı içeriklerini görür
--  · admin her şeyi görür ve yazar
--  · anonim ziyaretçiye HİÇBİR tedarikçi verisi açılmaz (bağımsızlık gereği)
-- ============================================================================
alter table public.suppliers           enable row level security;
alter table public.supplier_products   enable row level security;
alter table public.supplier_dealer_ads enable row level security;
alter table public.supplier_requests   enable row level security;

-- --- suppliers ---
drop policy if exists sup_self_read   on public.suppliers;
drop policy if exists sup_self_write  on public.suppliers;
drop policy if exists sup_self_insert on public.suppliers;
drop policy if exists sup_dir_read    on public.suppliers;
drop policy if exists sup_admin_all   on public.suppliers;

create policy sup_self_read on public.suppliers
    for select using (id = auth.uid());

create policy sup_self_insert on public.suppliers
    for insert with check (id = auth.uid());

-- Tedarikçi kendi satırını günceller. Abonelik, ban ve onay durumunu kendi
-- değiştiremesin diye bu kolonlar admin'e bırakılmıştır: uygulama katmanı
-- bunları göndermez, ayrıca aşağıdaki trigger sunucu tarafında da korur.
create policy sup_self_write on public.suppliers
    for update using (id = auth.uid()) with check (id = auth.uid());

-- Kurulumcu firma çalışanı onaylı tedarikçileri görebilir (tedarikçi dizini).
create policy sup_dir_read on public.suppliers
    for select using (
        status = 'approved' and not banned and public.my_company_id() is not null
    );

create policy sup_admin_all on public.suppliers
    for all using (public.is_admin()) with check (public.is_admin());

-- Ayrıcalıklı kolonları tedarikçinin kendi eliyle değiştirmesini engelle.
create or replace function public.suppliers_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if public.is_admin() then return new; end if;
    new.status        := old.status;
    new.reject_reason := old.reject_reason;
    new.sub_status    := old.sub_status;
    new.sub_ends_at   := old.sub_ends_at;
    new.banned        := old.banned;
    new.ban_reason    := old.ban_reason;
    return new;
end $$;

drop trigger if exists suppliers_guard_trg on public.suppliers;
create trigger suppliers_guard_trg before update on public.suppliers
    for each row execute function public.suppliers_guard();

-- "Onaya gönder" işlemi: tedarikçinin statüyü değiştirebildiği tek yol.
create or replace function public.supplier_submit_for_review()
returns void language plpgsql security definer set search_path = public as $$
begin
    update public.suppliers
       set status = 'pending', reject_reason = null
     where id = auth.uid() and status in ('draft', 'rejected');
end $$;

grant execute on function public.supplier_submit_for_review() to authenticated;

-- --- supplier_products ---
drop policy if exists supprod_owner    on public.supplier_products;
drop policy if exists supprod_inst_read on public.supplier_products;
drop policy if exists supprod_admin    on public.supplier_products;

create policy supprod_owner on public.supplier_products
    for all using (supplier_id = auth.uid()) with check (supplier_id = auth.uid());

create policy supprod_inst_read on public.supplier_products
    for select using (status = 'approved' and public.my_company_id() is not null);

create policy supprod_admin on public.supplier_products
    for all using (public.is_admin()) with check (public.is_admin());

-- --- supplier_dealer_ads ---
drop policy if exists supad_owner     on public.supplier_dealer_ads;
drop policy if exists supad_inst_read on public.supplier_dealer_ads;
drop policy if exists supad_admin     on public.supplier_dealer_ads;

create policy supad_owner on public.supplier_dealer_ads
    for all using (supplier_id = auth.uid()) with check (supplier_id = auth.uid());

create policy supad_inst_read on public.supplier_dealer_ads
    for select using (status = 'approved' and public.my_company_id() is not null);

create policy supad_admin on public.supplier_dealer_ads
    for all using (public.is_admin()) with check (public.is_admin());

-- --- supplier_requests ---
drop policy if exists supreq_sup_read  on public.supplier_requests;
drop policy if exists supreq_sup_write on public.supplier_requests;
drop policy if exists supreq_co_read   on public.supplier_requests;
drop policy if exists supreq_co_insert on public.supplier_requests;
drop policy if exists supreq_admin     on public.supplier_requests;

-- Tedarikçi kendisine gelen talepleri görür ve yanıtlar.
create policy supreq_sup_read on public.supplier_requests
    for select using (supplier_id = auth.uid());
create policy supreq_sup_write on public.supplier_requests
    for update using (supplier_id = auth.uid()) with check (supplier_id = auth.uid());

-- Kurulumcu firma kendi açtığı talepleri görür ve yenisini açar.
create policy supreq_co_read on public.supplier_requests
    for select using (company_id is not null and company_id = public.my_company_id());
create policy supreq_co_insert on public.supplier_requests
    for insert with check (company_id = public.my_company_id() and created_by = auth.uid());

create policy supreq_admin on public.supplier_requests
    for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
--  Onaylanan ürünü donanım karşılaştırmasına taşıyan yardımcı (admin çağırır)
-- ============================================================================
create or replace function public.approve_supplier_product(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_item uuid; v_row public.supplier_products%rowtype;
begin
    if not public.is_admin() then raise exception 'yetkisiz'; end if;
    select * into v_row from public.supplier_products where id = p_id;
    if not found then raise exception 'kayit yok'; end if;

    if v_row.hardware_item_id is not null then
        update public.hardware_items
           set cells = v_row.cells, source_url = v_row.source_url,
               verified_on = current_date, is_published = true
         where id = v_row.hardware_item_id
        returning id into v_item;
    else
        insert into public.hardware_items (category_key, cells, source_url, verified_on, is_published)
        values (v_row.category_key, v_row.cells, v_row.source_url, current_date, true)
        returning id into v_item;
    end if;

    update public.supplier_products
       set status = 'approved', reject_reason = null, hardware_item_id = v_item
     where id = p_id;

    return v_item;
end $$;

grant execute on function public.approve_supplier_product(uuid) to authenticated;
