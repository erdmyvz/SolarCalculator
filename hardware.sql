-- ============================================================================
--  hardware.sql — DONANIM KARŞILAŞTIRMA VERİSİ
--  Supabase SQL Editor'de bir kez çalıştırın.
--
--  Neden: Bu tablonun içeriği daha önce hardware.js içinde sabit kodlanmıştı ve
--  gerçek marka adlarının yanında doğrulanmamış spesifikasyonlar taşıyordu.
--  Artık veri buradan gelir; ziyaretçiye yalnızca sizin girip yayına aldığınız,
--  kaynağı belli satırlar gösterilir. Tablo boşken araç hiç görünmez.
--
--  Yapı, ekrandaki tabloyla birebir örtüşür:
--    hardware_categories → sekmeler ve sütun başlıkları
--    hardware_items      → satırlar (cells dizisi cols ile aynı uzunlukta)
-- ============================================================================

-- ---------------------------------------------------------------- kategoriler
create table if not exists public.hardware_categories (
    key          text primary key,                    -- inverter | battery | panel | ...
    label        text        not null,                -- sekmede görünen ad
    guide        text,                                -- sekmenin üstündeki açıklama (HTML kabul eder)
    cols         jsonb       not null default '[]'::jsonb,  -- ["Marka / Model","Tip",...]
    sort_order   int         not null default 0,
    is_published boolean     not null default true
);

comment on column public.hardware_categories.cols is
    'Sütun başlıkları dizisi. İlk sütun satırlarda kalın yazılır (marka/model).';

-- -------------------------------------------------------------------- satırlar
create table if not exists public.hardware_items (
    id           uuid        primary key default gen_random_uuid(),
    category_key text        not null references public.hardware_categories(key) on delete cascade,
    cells        jsonb       not null default '[]'::jsonb,  -- cols ile aynı sırada ve uzunlukta
    source_url   text,                                      -- veriyi aldığınız üretici sayfası
    verified_on  date,                                      -- en son ne zaman doğruladınız
    sort_order   int         not null default 0,
    is_published boolean     not null default true,
    updated_at   timestamptz not null default now()
);

comment on column public.hardware_items.source_url is
    'Üreticinin teknik doküman/katalog bağlantısı. Ziyaretçiye "kaynak" olarak gösterilir.';
comment on column public.hardware_items.verified_on is
    'Bu satırdaki değerlerin son doğrulanma tarihi. Ziyaretçiye tablo altında gösterilir.';

create index if not exists hardware_items_cat_idx
    on public.hardware_items (category_key, sort_order);

-- updated_at'i kendiliğinden güncelle
create or replace function public.hardware_touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists hardware_items_touch on public.hardware_items;
create trigger hardware_items_touch
    before update on public.hardware_items
    for each row execute function public.hardware_touch_updated_at();

-- ============================================================================
--  RLS — herkes yayındakileri okur, yalnız admin yazar
--  (projedeki admin tanımı: profiles.role = 'admin')
-- ============================================================================
alter table public.hardware_categories enable row level security;
alter table public.hardware_items      enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
    );
$$;

drop policy if exists hw_cat_read   on public.hardware_categories;
drop policy if exists hw_cat_write  on public.hardware_categories;
drop policy if exists hw_item_read  on public.hardware_items;
drop policy if exists hw_item_write on public.hardware_items;

-- Okuma: yayındaki satırlar herkese açık; admin taslakları da görür.
create policy hw_cat_read on public.hardware_categories
    for select using (is_published or public.is_admin());

create policy hw_item_read on public.hardware_items
    for select using (is_published or public.is_admin());

-- Yazma: yalnız admin.
create policy hw_cat_write on public.hardware_categories
    for all using (public.is_admin()) with check (public.is_admin());

create policy hw_item_write on public.hardware_items
    for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
--  BAŞLANGIÇ: yalnız kategoriler ve sütun başlıkları.
--  Ürün satırı BİLEREK eklenmemiştir — üretici verisini admin panelinden,
--  kaynağını doğrulayarak siz gireceksiniz.
-- ============================================================================
insert into public.hardware_categories (key, label, guide, cols, sort_order) values
(
    'inverter', 'İnverter',
    'Şebeke bağlantılı basit sistemlerde string inverter yeterlidir. Kesintide çalışmak veya batarya kullanmak istiyorsanız <strong>hibrit inverter</strong> seçmelisiniz.',
    '["Marka / Model","Tip","Güç (kW)","MPPT","Verim","Hibrit","Garanti","Öne Çıkan"]'::jsonb, 1
),
(
    'battery', 'Batarya',
    'Kesinti sırasında evi ayakta tutmak için batarya kapasitesi (kWh) ve deşarj derinliği (DoD) önemlidir. LiFePO4 kimyası uzun ömür ve güvenlik sağlar.',
    '["Marka / Model","Kimya","Kapasite","DoD","Çevrim","Modüler","Garanti","Öne Çıkan"]'::jsonb, 2
),
(
    'panel', 'Panel',
    'Aynı çatı alanında daha çok üretim için panel <strong>verimi (%)</strong> ve gölge/sıcak iklim performansına bakın. Tier-1 üreticiler uzun vadeli üretim garantisi verir.',
    '["Marka / Seri","Hücre","Güç (Wp)","Verim","Tip","Sıcaklık Katsayısı","Garanti (Üretim)","Öne Çıkan"]'::jsonb, 3
)
on conflict (key) do nothing;
