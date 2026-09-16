-- ============================================================================
--  stok-fiyatlandirma.sql
--
--  İKİ YENİ KAVRAM
--  1) TEDARİKÇİ STOĞU — hangi üründen, NEREDE, kaç adet, hangi fiyata.
--     Konum kritik: kurulumcu firma en yakın depodan alırsa nakliye ve süre
--     düşer. Platformun "dijital verimlilik" iddiasının somut karşılığı bu.
--  2) KURULUMCU STOĞU — firmanın elindeki miktar ve ortalama alış fiyatı.
--     Basit sayaç: giriş/çıkış hareketi tutulmaz, firma elle günceller.
--  İkisi birleşince teklif aşamasında fiyatlandırma tablosu çıkar:
--     ihtiyaç − eldeki = eksik → en yakın tedarikçi fiyatı → tahmini maliyet.
--
--  FİYAT GÖRÜNÜRLÜĞÜ — her stok satırı kendi kararını taşır:
--     price_visible = true  → birim fiyat kurulumcuya doğrudan görünür
--     price_visible = false → fiyat gizli, kurulumcu "fiyat teklifi iste" der
--  Gizleme SUNUCUDA yapılır (list_supplier_stock fiyatı null'lar). Arayüzde
--  gizlemek yetmezdi: satır yine de tele gider, tarayıcıdan okunurdu.
--
--  Sunucudan doğrulandı: suppliers(id, company_name, city, status, banned,
--  categories) VAR, district YOK · hardware_categories(key,label,cols) ·
--  quote_products / firm_catalog / firm_quote_settings VAR ·
--  my_company_id(), is_admin(), is_active_supplier() tedarikci.sql'de tanımlı.
--  tedarikci.sql ve hardware.sql önce çalıştırılmış olmalıdır.
-- ============================================================================

-- ==========================================================================
--  1) İL → BÖLGE   (yakınlık sıralaması için)
--  Koordinat yok; km hesaplamıyoruz, uydurmuyoruz da. Sıralama dört kademe:
--  aynı ilçe → aynı il → aynı bölge → diğer.
-- ==========================================================================
create table if not exists public.il_bolge (
    il     text primary key,
    bolge  text not null
);

insert into public.il_bolge (il, bolge) values
 ('Balıkesir','Marmara'),('Bilecik','Marmara'),('Bursa','Marmara'),('Çanakkale','Marmara'),
 ('Edirne','Marmara'),('İstanbul','Marmara'),('Kırklareli','Marmara'),('Kocaeli','Marmara'),
 ('Sakarya','Marmara'),('Tekirdağ','Marmara'),('Yalova','Marmara'),
 ('Afyonkarahisar','Ege'),('Aydın','Ege'),('Denizli','Ege'),('İzmir','Ege'),
 ('Kütahya','Ege'),('Manisa','Ege'),('Muğla','Ege'),('Uşak','Ege'),
 ('Adana','Akdeniz'),('Antalya','Akdeniz'),('Burdur','Akdeniz'),('Hatay','Akdeniz'),
 ('Isparta','Akdeniz'),('Kahramanmaraş','Akdeniz'),('Mersin','Akdeniz'),('Osmaniye','Akdeniz'),
 ('Aksaray','İç Anadolu'),('Ankara','İç Anadolu'),('Çankırı','İç Anadolu'),('Eskişehir','İç Anadolu'),
 ('Karaman','İç Anadolu'),('Kayseri','İç Anadolu'),('Kırıkkale','İç Anadolu'),('Kırşehir','İç Anadolu'),
 ('Konya','İç Anadolu'),('Nevşehir','İç Anadolu'),('Niğde','İç Anadolu'),('Sivas','İç Anadolu'),
 ('Yozgat','İç Anadolu'),
 ('Amasya','Karadeniz'),('Artvin','Karadeniz'),('Bartın','Karadeniz'),('Bayburt','Karadeniz'),
 ('Bolu','Karadeniz'),('Çorum','Karadeniz'),('Düzce','Karadeniz'),('Giresun','Karadeniz'),
 ('Gümüşhane','Karadeniz'),('Karabük','Karadeniz'),('Kastamonu','Karadeniz'),('Ordu','Karadeniz'),
 ('Rize','Karadeniz'),('Samsun','Karadeniz'),('Sinop','Karadeniz'),('Tokat','Karadeniz'),
 ('Trabzon','Karadeniz'),('Zonguldak','Karadeniz'),
 ('Ağrı','Doğu Anadolu'),('Ardahan','Doğu Anadolu'),('Bingöl','Doğu Anadolu'),('Bitlis','Doğu Anadolu'),
 ('Elazığ','Doğu Anadolu'),('Erzincan','Doğu Anadolu'),('Erzurum','Doğu Anadolu'),('Hakkari','Doğu Anadolu'),
 ('Iğdır','Doğu Anadolu'),('Kars','Doğu Anadolu'),('Malatya','Doğu Anadolu'),('Muş','Doğu Anadolu'),
 ('Tunceli','Doğu Anadolu'),('Van','Doğu Anadolu'),
 ('Adıyaman','Güneydoğu Anadolu'),('Batman','Güneydoğu Anadolu'),('Diyarbakır','Güneydoğu Anadolu'),
 ('Gaziantep','Güneydoğu Anadolu'),('Kilis','Güneydoğu Anadolu'),('Mardin','Güneydoğu Anadolu'),
 ('Siirt','Güneydoğu Anadolu'),('Şanlıurfa','Güneydoğu Anadolu'),('Şırnak','Güneydoğu Anadolu')
on conflict (il) do update set bolge = excluded.bolge;

alter table public.il_bolge enable row level security;
drop policy if exists il_bolge_read on public.il_bolge;
create policy il_bolge_read on public.il_bolge for select using (true);


-- ==========================================================================
--  2) KATEGORİLER — kullanıcının saydığı beş ürünle başlıyoruz
--  hardware_categories zaten panel / inverter / battery taşıyor; ikisi eksik.
-- ==========================================================================
insert into public.hardware_categories (key, label, guide, cols, sort_order, is_published) values
 ('cable', 'Kablo ve Bağlantı',
  'Solar DC kablosu, AG kablo, MC4 konnektör, kablo tavası ve bağlantı malzemeleri.',
  '["Marka / Seri","Tip","Kesit (mm²)","İletken","Gerilim","Sertifika","Garanti","Öne Çıkan"]'::jsonb,
  4, true),
 ('mounting', 'Konstrüksiyon',
  'Çatı ve arazi montaj sistemleri: profil, kelepçe, ayak ve bağlantı elemanları.',
  '["Marka / Seri","Tip","Malzeme","Kaplama","Uyumlu Panel","Rüzgâr/Kar Yükü","Garanti","Öne Çıkan"]'::jsonb,
  5, true)
on conflict (key) do nothing;


-- ==========================================================================
--  3) KATEGORİ ALANLARI — stok satırındaki teknik alanlar
--  Kod içine gömmedik: yeni bir alan gerektiğinde yayın beklemeden eklenebilsin.
--  Değerler üretici veri sayfalarının standart alanlarıdır.
-- ==========================================================================
create table if not exists public.stok_alanlari (
    id        bigserial primary key,
    kategori  text not null,
    anahtar   text not null,
    etiket    text not null,
    birim     text,
    tip       text not null default 'sayi',   -- sayi | metin | secim
    secenek   text[],
    sira      int  not null default 0,
    unique (kategori, anahtar)
);

insert into public.stok_alanlari (kategori, anahtar, etiket, birim, tip, secenek, sira) values
 ('panel','guc','Güç','Wp','sayi',null,1),
 ('panel','hucre','Hücre tipi',null,'secim','{"Monokristal","Polikristal","TOPCon","HJT","Bifacial"}',2),
 ('panel','verim','Verim','%','sayi',null,3),
 ('panel','garanti','Ürün garantisi','yıl','sayi',null,4),

 ('inverter','guc','Güç','kW','sayi',null,1),
 ('inverter','faz','Faz',null,'secim','{"Monofaze","Trifaze"}',2),
 ('inverter','mppt','MPPT sayısı',null,'sayi',null,3),
 ('inverter','hibrit','Hibrit',null,'secim','{"Evet","Hayır"}',4),
 ('inverter','garanti','Garanti','yıl','sayi',null,5),

 ('battery','kapasite','Kapasite','kWh','sayi',null,1),
 ('battery','kimya','Kimya',null,'secim','{"LiFePO4","NMC","Jel","AGM"}',2),
 ('battery','voltaj','Voltaj','V','sayi',null,3),
 ('battery','dod','DoD','%','sayi',null,4),
 ('battery','garanti','Garanti','yıl','sayi',null,5),

 ('cable','tip','Tip',null,'secim','{"Solar DC","AG Kablo","Konnektör","Kablo Tavası","Topraklama"}',1),
 ('cable','kesit','Kesit','mm²','sayi',null,2),
 ('cable','iletken','İletken',null,'secim','{"Bakır","Alüminyum"}',3),
 ('cable','gerilim','Gerilim','V','sayi',null,4),

 ('mounting','tip','Tip',null,'secim','{"Sac Çatı","Kiremit Çatı","Beton Çatı","Arazi","Carport"}',1),
 ('mounting','malzeme','Malzeme',null,'secim','{"Alüminyum","Galvaniz Çelik","Paslanmaz"}',2),
 ('mounting','kaplama','Kaplama',null,'metin',null,3),
 ('mounting','garanti','Garanti','yıl','sayi',null,4)
on conflict (kategori, anahtar) do nothing;

alter table public.stok_alanlari enable row level security;
drop policy if exists stok_alanlari_read on public.stok_alanlari;
create policy stok_alanlari_read on public.stok_alanlari for select using (true);
drop policy if exists stok_alanlari_admin on public.stok_alanlari;
create policy stok_alanlari_admin on public.stok_alanlari for all
    using (public.is_admin()) with check (public.is_admin());


-- ==========================================================================
--  4) TEDARİKÇİ STOĞU
--  Bir ürün birden çok depoda bulunabilir → her (ürün × konum) ayrı satır.
-- ==========================================================================
create table if not exists public.supplier_stock (
    id             uuid primary key default gen_random_uuid(),
    supplier_id    uuid not null references public.suppliers(id) on delete cascade,
    category_key   text not null,
    brand          text not null,                 -- üretici
    model          text not null,                 -- seri / model
    unit           text not null default 'adet',  -- adet | metre | takım | kWh
    specs          jsonb not null default '{}'::jsonb,   -- stok_alanlari anahtarları

    quantity       numeric not null default 0,    -- eldeki miktar
    min_order      numeric,                       -- asgari sipariş

    -- fiyat: satır bazında açık ya da gizli
    price_visible  boolean not null default false,
    unit_price     numeric,
    currency       text not null default 'USD',   -- USD | TRY | EUR
    price_basis    text not null default 'adet',  -- adet | Wp | metre | kWh
    valid_until    date,                          -- fiyatın geçerlilik tarihi

    -- stok NEREDE: modülün asıl sebebi
    city           text not null,
    district       text,
    lead_time_days int,                           -- sevkiyat süresi

    source_url     text,
    note           text,
    status         text not null default 'pending',  -- pending | approved | rejected
    reject_reason  text,
    is_active      boolean not null default true,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists supplier_stock_sup_idx on public.supplier_stock (supplier_id, status);
create index if not exists supplier_stock_ara_idx on public.supplier_stock (category_key, city, status, is_active);

drop trigger if exists supplier_stock_touch on public.supplier_stock;
create trigger supplier_stock_touch before update on public.supplier_stock
    for each row execute function public.supplier_touch_updated_at();

-- Fiyat açıkken fiyatsız satır olmasın: kurulumcu "açık" rozetini görüp
-- fiyat bulamazsa bu, bilgi değil gürültüdür.
alter table public.supplier_stock drop constraint if exists supplier_stock_fiyat_ck;
alter table public.supplier_stock add constraint supplier_stock_fiyat_ck
    check (price_visible = false or (unit_price is not null and unit_price > 0));

alter table public.supplier_stock enable row level security;

drop policy if exists sstock_owner on public.supplier_stock;
create policy sstock_owner on public.supplier_stock for all
    using (supplier_id = auth.uid()) with check (supplier_id = auth.uid());

drop policy if exists sstock_admin on public.supplier_stock;
create policy sstock_admin on public.supplier_stock for all
    using (public.is_admin()) with check (public.is_admin());

-- ⚠️ Kurulumcuya DOĞRUDAN select yetkisi VERİLMEDİ. Erişim yalnız
-- list_supplier_stock() üzerinden; gizli fiyat orada null'lanıyor. Tabloya
-- doğrudan select açsaydık, "fiyatı gizle" seçeneği arayüzsel bir yalan olurdu.


-- ==========================================================================
--  5) KURULUMCU STOĞU — basit sayaç
--  Hareket defteri değil: elde kaç var, ortalama kaça alındı. Firma günceller.
-- ==========================================================================
create table if not exists public.company_stock (
    id           uuid primary key default gen_random_uuid(),
    company_id   uuid not null,
    category_key text not null,
    brand        text not null,
    model        text not null,
    unit         text not null default 'adet',
    specs        jsonb not null default '{}'::jsonb,

    quantity     numeric not null default 0,      -- elde
    avg_cost     numeric,                         -- ortalama alış (birim)
    currency     text not null default 'USD',
    last_supplier text,                           -- en son kimden alındı (serbest metin)
    last_price   numeric,                         -- en son birim alış fiyatı
    last_date    date,

    note         text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists company_stock_co_idx on public.company_stock (company_id, category_key);
create unique index if not exists company_stock_uniq
    on public.company_stock (company_id, category_key, lower(brand), lower(model));

drop trigger if exists company_stock_touch on public.company_stock;
create trigger company_stock_touch before update on public.company_stock
    for each row execute function public.supplier_touch_updated_at();

alter table public.company_stock enable row level security;

drop policy if exists cstock_own on public.company_stock;
create policy cstock_own on public.company_stock for all
    using (company_id = public.my_company_id())
    with check (company_id = public.my_company_id());

drop policy if exists cstock_admin on public.company_stock;
create policy cstock_admin on public.company_stock for all
    using (public.is_admin()) with check (public.is_admin());


-- ==========================================================================
--  6) TEDARİKÇİ STOĞU OKUMA — yakınlığa göre sıralı, fiyat kuralına uygun
-- ==========================================================================
drop function if exists public.list_supplier_stock(text, text, text, text);

create function public.list_supplier_stock(
    p_kategori text default null,
    p_il       text default null,
    p_ilce     text default null,
    p_arama    text default null
) returns table (
    id uuid, tedarikci text, kategori text, marka text, model text,
    birim text, ozellikler jsonb,
    miktar numeric, min_siparis numeric,
    fiyat_acik boolean, birim_fiyat numeric, para_birimi text, fiyat_baz text,
    gecerlilik date, il text, ilce text, termin int,
    yakinlik int, kaynak text, guncelleme timestamptz, supplier_id uuid
)
language sql
security definer
set search_path = public
as $$
    with hedef as (
        select p_il as il, p_ilce as ilce,
               (select b.bolge from public.il_bolge b where b.il = p_il) as bolge
    ),
    satir as (
    select s.id,
           sup.company_name,
           s.category_key, s.brand, s.model, s.unit, s.specs,
           s.quantity, s.min_order,
           s.price_visible,
           case when s.price_visible then s.unit_price else null end,
           s.currency, s.price_basis, s.valid_until,
           s.city, s.district, s.lead_time_days,
           case
               when h.ilce is not null and s.district is not null
                    and lower(s.district) = lower(h.ilce)
                    and lower(s.city) = lower(coalesce(h.il,'')) then 0
               when h.il is not null and lower(s.city) = lower(h.il)  then 1
               when h.bolge is not null and sb.bolge = h.bolge        then 2
               else 3
           end as yakinlik,
           s.source_url, s.updated_at, s.supplier_id
      from public.supplier_stock s
      join public.suppliers sup on sup.id = s.supplier_id
      left join public.il_bolge sb on sb.il = s.city
      cross join hedef h
     where s.status = 'approved'
       and s.is_active = true
       and s.quantity > 0
       and sup.status = 'approved'
       and coalesce(sup.banned, false) = false
       and (p_kategori is null or s.category_key = p_kategori)
       and (p_arama is null or p_arama = ''
            or s.brand ilike '%' || p_arama || '%'
            or s.model ilike '%' || p_arama || '%')
       -- Yalnız kurulumcu firma çalışanı ve admin görebilir.
       and (public.my_company_id() is not null or public.is_admin())
    )
    -- En yakın önce; eşitlikte fiyatı açık olan önce (kurulumcu beklemeden
    -- hesaplayabilsin), sonra en taze güncelleme.
    select * from satir
     order by yakinlik, price_visible desc, updated_at desc;
$$;

grant execute on function public.list_supplier_stock(text, text, text, text) to authenticated;


-- ==========================================================================
--  7) ADMIN — bekleyen stok satırlarını görmek ve onaylamak
-- ==========================================================================
drop function if exists public.set_supplier_stock_status(uuid, text, text);

create function public.set_supplier_stock_status(
    p_id uuid, p_status text, p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'Yetkiniz yok';
    end if;
    if p_status not in ('pending','approved','rejected') then
        raise exception 'Geçersiz durum: %', p_status;
    end if;
    update public.supplier_stock
       set status = p_status,
           reject_reason = case when p_status = 'rejected' then p_reason else null end,
           updated_at = now()
     where id = p_id;
end;
$$;

grant execute on function public.set_supplier_stock_status(uuid, text, text) to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA
--    select count(*) from public.il_bolge;            -- 81 dönmeli
--    select key, label from public.hardware_categories order by sort_order;
--    select kategori, count(*) from public.stok_alanlari group by 1;
--
--  Tedarikçi stok satırları 'pending' açılır; yönetici onaylayana kadar
--  kurulumcuya görünmez. Onaylamak için:
--    select public.set_supplier_stock_status('<id>', 'approved');
-- ============================================================================
