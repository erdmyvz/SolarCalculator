-- ============================================================================
--  mevzuat.sql — BELGE LİSTELERİ VE MEVZUAT GÜNCELLEMELERİ
--  Sıfırdan kurulum için. MEVCUT veritabanında mevzuat-birlestir.sql çalıştırın.
--
--  ⚠️ DAĞITIM ŞİRKETİ TABLOSU BURADA DEĞİL.
--  Uygulamada zaten 'distribution_companies' var ve kurulumcu paneli (crm.js)
--  onu kullanıyor. Bu dosyanın ilk sürümü paralel bir 'dagitim_sirketleri'
--  kuruyordu — iki kayıt er ya da geç ayrışır. Hata mevzuat-birlestir.sql ile
--  geri alındı; şirket bilgileri ve teyit alanları distribution_companies'te.
--
--  TASARIMIN TEMEL KURALI — DOĞRULANMAMIŞ VERİ GERÇEK GİBİ GÖSTERİLMEZ:
--  Her satırda kaynak bağlantısı ve doğrulama tarihi var. Arayüz doğrulanmamış
--  veya bayatlamış satırı kesin bilgi gibi basmaz; "teyit edilmedi" uyarısıyla
--  ve resmi kaynağa yönlendirerek gösterir. Eksik bilgi, yanlış bilgiden iyidir.
-- ============================================================================

-- Şirket tablosuna teyit alanları (birleştirme betiği de ekler; burada
-- sıfırdan kurulumda eksik kalmasın diye tekrarlanıyor).
alter table public.distribution_companies
    add column if not exists basvuru_url      text,
    add column if not exists dogrulandi_mi    boolean not null default false,
    add column if not exists dogrulama_tarihi date,
    add column if not exists dogrulayan       text;

-- ------------------------------------------------- 1) BELGE / EVRAK LİSTELERİ
create table if not exists public.mevzuat_belgeleri (
    id               uuid primary key default gen_random_uuid(),
    sirket_id        uuid references public.distribution_companies(id) on delete cascade,
    -- sirket_id NULL ise: tüm Türkiye için ortak belge
    tesis_tipi       text not null default 'mesken',  -- mesken|ticari|sanayi|tarimsal
    asama            text not null default 'basvuru', -- basvuru|proje|kurulum|kabul|isletme
    sira             int  not null default 0,
    belge_adi        text not null,
    aciklama         text,
    nereden_alinir   text,
    zorunlu_mu       boolean not null default true,
    kaynak_url       text,                            -- ⚠️ resmi kaynak
    dogrulama_tarihi date,
    yayinda          boolean not null default false
);
create index if not exists mevzuat_belgeleri_sirket_idx2
    on public.mevzuat_belgeleri (sirket_id, tesis_tipi, asama, sira);

-- ------------------------------------- 2) MEVZUAT GÜNCELLEMELERİ (tek takip yeri)
create table if not exists public.mevzuat_guncellemeler (
    id                   uuid primary key default gen_random_uuid(),
    tarih                date not null default current_date,  -- duyuru tarihi
    yururluk_tarihi      date,                                -- yürürlüğe giriş
    baslik               text not null,
    ozet                 text,
    kaynak_url           text not null,                       -- ⚠️ zorunlu: kaynaksız kayıt girilmez
    kaynak_kurum         text,                                -- EPDK | TEDAŞ | Resmî Gazete | dağıtım şirketi
    etkilenen_sirketler  text[] not null default '{}',        -- boş = tüm şirketler
    onem                 text not null default 'normal',      -- kritik|normal|bilgi
    yayinda              boolean not null default false
);
create index if not exists mevzuat_guncellemeler_tarih_idx
    on public.mevzuat_guncellemeler (tarih desc);

-- ------------------------------------------------------------------------ RLS
alter table public.mevzuat_belgeleri     enable row level security;
alter table public.mevzuat_guncellemeler enable row level security;

-- Okuma herkese açık ama yalnız YAYINDA olanlar.
drop policy if exists mb_read on public.mevzuat_belgeleri;
create policy mb_read on public.mevzuat_belgeleri
    for select to anon, authenticated using (yayinda = true);

drop policy if exists mg_read on public.mevzuat_guncellemeler;
create policy mg_read on public.mevzuat_guncellemeler
    for select to anon, authenticated using (yayinda = true);

-- Yazma yalnız admin.
drop policy if exists mb_write on public.mevzuat_belgeleri;
create policy mb_write on public.mevzuat_belgeleri
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists mg_write on public.mevzuat_guncellemeler;
create policy mg_write on public.mevzuat_guncellemeler
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
--  Belge listeleri ve güncellemeler BİLEREK BOŞ. Bu içerik resmi kaynaktan
--  okunup girilmeli; hafızadan yazılan bir belge listesi, olmayan bir evrakı
--  zorunlu göstererek yatırımcıyı da kurulumcuyu da yanıltır.
-- ---------------------------------------------------------------------------
