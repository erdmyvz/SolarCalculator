-- ============================================================================
--  mevzuat.sql — DAĞITIM ŞİRKETLERİ, BELGE LİSTELERİ VE MEVZUAT GÜNCELLEMELERİ
--  Supabase SQL Editor'de bir kez çalıştırın.
--
--  NEDEN BU TABLOLAR:
--  "TEDAŞ Mevzuatı & Teknik Süreçler" bölümü bir yatırımcının parasal karar
--  verirken okuduğu yer. Türkiye'de 21 dağıtım şirketi var ve belge listeleri,
--  başvuru kanalları ve süreler şirketten şirkete DEĞİŞİYOR; mevzuat da
--  değişiyor. Sabit kodlanmış tek bir "genel süreç" anlatmak insanları yanlış
--  yönlendirir.
--
--  TASARIMIN TEMEL KURALI — DOĞRULANMAMIŞ VERİ GERÇEK GİBİ GÖSTERİLMEZ:
--  Her satırda kaynak bağlantısı ve doğrulama tarihi alanı var. Arayüz
--  doğrulanmamış veya bayatlamış satırı olduğu gibi basmaz; "teyit edilmedi"
--  uyarısıyla ve resmi kaynağa yönlendirerek gösterir. Bu, bilerek böyle:
--  eksik bilgi vermek, yanlış bilgi vermekten iyidir.
-- ============================================================================

-- ------------------------------------------------------ 1) DAĞITIM ŞİRKETLERİ
create table if not exists public.dagitim_sirketleri (
    kod                text primary key,              -- bedas, gediz, ...
    ad                 text not null,                 -- resmi ünvan
    kisa_ad            text,                          -- BEDAŞ
    iller              text[] not null default '{}',  -- hizmet verdiği iller
    web_site           text,                          -- resmi site
    basvuru_url        text,                          -- lisanssız üretim başvuru sayfası
    telefon            text,
    notlar             text,
    -- ⚠️ Aşağıdaki üç alan bu tablonun en önemli kısmı.
    dogrulandi_mi      boolean not null default false,
    dogrulama_tarihi   date,
    dogrulayan         text,
    sort_order         int not null default 0
);

comment on column public.dagitim_sirketleri.dogrulandi_mi is
'Bu satırın bilgileri şirketin RESMİ sitesinden teyit edildi mi? false ise arayüz veriyi kesin bilgi olarak sunmaz.';

-- ------------------------------------------------- 2) BELGE / EVRAK LİSTELERİ
create table if not exists public.mevzuat_belgeleri (
    id               uuid primary key default gen_random_uuid(),
    sirket_kod       text references public.dagitim_sirketleri(kod) on delete cascade,
    -- sirket_kod NULL ise: tüm Türkiye için ortak belge
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
create index if not exists mevzuat_belgeleri_sirket_idx on public.mevzuat_belgeleri (sirket_kod, tesis_tipi, asama, sira);

-- ------------------------------------- 3) MEVZUAT GÜNCELLEMELERİ (tek takip yeri)
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
create index if not exists mevzuat_guncellemeler_tarih_idx on public.mevzuat_guncellemeler (tarih desc);

-- ------------------------------------------------------------------------ RLS
alter table public.dagitim_sirketleri   enable row level security;
alter table public.mevzuat_belgeleri    enable row level security;
alter table public.mevzuat_guncellemeler enable row level security;

-- Okuma herkese açık: ziyaretçi de görebilmeli. Ama belge ve güncellemelerde
-- yalnız YAYINDA olanlar. Şirket listesi doğrulanmamış olsa da okunur; arayüz
-- rozetle "teyit edilmedi" diye gösterir (liste boş kalmasın diye).
drop policy if exists ds_read on public.dagitim_sirketleri;
create policy ds_read on public.dagitim_sirketleri for select to anon, authenticated using (true);

drop policy if exists mb_read on public.mevzuat_belgeleri;
create policy mb_read on public.mevzuat_belgeleri for select to anon, authenticated using (yayinda = true);

drop policy if exists mg_read on public.mevzuat_guncellemeler;
create policy mg_read on public.mevzuat_guncellemeler for select to anon, authenticated using (yayinda = true);

-- Yazma yalnız admin.
drop policy if exists ds_write on public.dagitim_sirketleri;
create policy ds_write on public.dagitim_sirketleri for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists mb_write on public.mevzuat_belgeleri;
create policy mb_write on public.mevzuat_belgeleri for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists mg_write on public.mevzuat_guncellemeler;
create policy mg_write on public.mevzuat_guncellemeler for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
--  BAŞLANGIÇ VERİSİ — 21 DAĞITIM ŞİRKETİ
--
--  ⚠️ HEPSİ dogrulandi_mi = false OLARAK GİRİLİYOR. BİLEREK.
--  Şirket adları ve il dağılımı derlenmiş bir kaynaktan alındı ve 81 ilin
--  tamamını kapsadığı doğrulandı; ancak web adresleri, başvuru kanalları ve
--  telefonlar DOĞRULANMADI — o yüzden boş bırakıldı.
--
--  YAPILMASI GEREKEN: her şirketin resmi sitesine girip web_site, basvuru_url
--  ve telefon alanlarını doldurun, sonra dogrulandi_mi = true ve
--  dogrulama_tarihi = bugün yapın. Doğrulanmayan satır ziyaretçiye "teyit
--  edilmedi" rozetiyle çıkar ve kesin bilgi gibi sunulmaz.
-- ============================================================================
insert into public.dagitim_sirketleri (kod, ad, kisa_ad, iller, sort_order) values
 ('bedas',    'Boğaziçi Elektrik Dağıtım A.Ş.',              'BEDAŞ',    array['İstanbul (Avrupa)'], 1),
 ('ayedas',   'İstanbul Anadolu Yakası Elektrik Dağıtım A.Ş.','AYEDAŞ',  array['İstanbul (Anadolu)'], 2),
 ('tredas',   'Trakya Elektrik Dağıtım A.Ş.',                'TREDAŞ',   array['Tekirdağ','Kırklareli','Edirne'], 3),
 ('uludag',   'Uludağ Elektrik Dağıtım A.Ş.',                'UEDAŞ',    array['Bursa','Balıkesir','Çanakkale','Yalova'], 4),
 ('sedas',    'Sakarya Elektrik Dağıtım A.Ş.',               'SEDAŞ',    array['Kocaeli','Sakarya','Düzce','Bolu'], 5),
 ('gediz',    'Gediz Elektrik Dağıtım A.Ş.',                 'GEDİZ',    array['İzmir','Manisa'], 6),
 ('aydem',    'Aydem Elektrik Dağıtım A.Ş.',                 'AYDEM',    array['Aydın','Denizli','Muğla'], 7),
 ('akdeniz',  'Akdeniz Elektrik Dağıtım A.Ş.',               'AEDAŞ',    array['Antalya','Isparta','Burdur'], 8),
 ('oedas',    'Osmangazi Elektrik Dağıtım A.Ş.',             'OEDAŞ',    array['Eskişehir','Afyonkarahisar','Kütahya','Uşak','Bilecik'], 9),
 ('baskent',  'Başkent Elektrik Dağıtım A.Ş.',               'BAŞKENT',  array['Ankara','Zonguldak','Kastamonu','Kırıkkale','Karabük','Çankırı','Bartın'], 10),
 ('meram',    'Meram Elektrik Dağıtım A.Ş.',                 'MEDAŞ',    array['Konya','Aksaray','Niğde','Nevşehir','Karaman','Kırşehir'], 11),
 ('kcetas',   'Kayseri ve Civarı Elektrik Türk A.Ş.',        'KCETAŞ',   array['Kayseri'], 12),
 ('camlibel', 'Çamlıbel Elektrik Dağıtım A.Ş.',              'ÇEDAŞ',    array['Sivas','Tokat','Yozgat'], 13),
 ('yedas',    'Yeşilırmak Elektrik Dağıtım A.Ş.',            'YEDAŞ',    array['Samsun','Ordu','Çorum','Amasya','Sinop'], 14),
 ('coruh',    'Çoruh Elektrik Dağıtım A.Ş.',                 'ÇORUH',    array['Trabzon','Giresun','Rize','Artvin','Gümüşhane'], 15),
 ('aras',     'Aras Elektrik Dağıtım A.Ş.',                  'ARAS',     array['Erzurum','Ağrı','Kars','Erzincan','Iğdır','Ardahan','Bayburt'], 16),
 ('firat',    'Fırat Elektrik Dağıtım A.Ş.',                 'FIRAT',    array['Malatya','Elazığ','Bingöl','Tunceli'], 17),
 ('vedas',    'Vangölü Elektrik Dağıtım A.Ş.',               'VEDAŞ',    array['Van','Muş','Bitlis','Hakkâri'], 18),
 ('dicle',    'Dicle Elektrik Dağıtım A.Ş.',                 'DEDAŞ',    array['Şanlıurfa','Diyarbakır','Mardin','Batman','Şırnak','Siirt'], 19),
 ('toroslar', 'Toroslar Elektrik Dağıtım A.Ş.',              'TOROSLAR', array['Adana','Gaziantep','Mersin','Hatay','Osmaniye','Kilis'], 20),
 ('akedas',   'Akedaş Elektrik Dağıtım A.Ş.',                'AKEDAŞ',   array['Kahramanmaraş','Adıyaman'], 21)
on conflict (kod) do nothing;

-- ---------------------------------------------------------------------------
--  DOĞRULAMA
--    select count(*) from public.dagitim_sirketleri;              -- 21
--    select count(*) from public.dagitim_sirketleri
--      where dogrulandi_mi;                                       -- 0 (siz doldurana kadar)
--
--  Belge listeleri ve güncellemeler BİLEREK BOŞ bırakıldı. Bu içerik resmi
--  kaynaktan okunup girilmeli; hafızadan yazılan bir belge listesi, olmayan
--  bir evrakı zorunlu göstererek yatırımcıyı da kurulumcuyu da yanıltır.
-- ---------------------------------------------------------------------------
