-- ============================================================================
--  mevzuat-birlestir.sql — İKİ DAĞITIM ŞİRKETİ KAYDINI TEKE İNDİRİR
--
--  NE OLDU: Uygulamada zaten 'distribution_companies' tablosu vardı ve
--  kurulumcu paneli (crm.js) onu kullanıyordu — 21 şirket, hepsinin adresi ve
--  telefonu dolu. Mevzuat bölümünü yazarken bunu görmedim ve paralel bir
--  'dagitim_sirketleri' tablosu kurdum. İki kayıt tutmak, bu projede üç
--  hesaplayıcıda düzelttiğimiz hatanın aynısı: er ya da geç ayrışırlar.
--
--  BU BETİK: eksik olanı (başvuru adresi + teyit alanları) ESKİ tabloya ekler,
--  doğrulanmış 6 başvuru adresini taşır, sonra benim kurduğum tabloyu siler.
--  Kaybolan veri yok — yeni tablodaki her şey eskisinde zaten var ya da
--  aşağıda taşınıyor.
-- ============================================================================

-- ------------------------------------------------- 1) EKSİK KOLONLARI EKLE
alter table public.distribution_companies
    add column if not exists basvuru_url      text,
    add column if not exists dogrulandi_mi    boolean not null default false,
    add column if not exists dogrulama_tarihi date,
    add column if not exists dogrulayan       text;

comment on column public.distribution_companies.dogrulandi_mi is
'Bu satır şirketin RESMİ sitesinden teyit edildi mi? false ise ziyaretçiye "teyit edilmedi" uyarısıyla gösterilir.';

-- --------------------------- 2) DOĞRULANMIŞ BAŞVURU ADRESLERİNİ TAŞI
--  Altı adresin tamamı açılarak sınandı (hepsi 200 döndü).
--  dogrulandi_mi yine de false bırakılıyor — o beyan admin panelinden verilir.
update public.distribution_companies set basvuru_url = 'https://www.bedas.com.tr/lisanssiz-uretim'
    where website like '%bedas.com.tr%';
update public.distribution_companies set basvuru_url = 'https://www.ayedas.com.tr/yasal-bildirim/lisanssiz-elektrik-uretim-basvurulari'
    where website like '%ayedas.com.tr%';
update public.distribution_companies set basvuru_url = 'https://www.baskentedas.com.tr/yasal-bildirim/lisanssiz-elektrik-uretim-basvurulari'
    where website like '%baskentedas.com.tr%';
update public.distribution_companies set basvuru_url = 'https://www.gdzelektrik.com.tr/bilgi-merkezi/yasal-bildirimler/lisanssiz-elektrik-uretimi'
    where website like '%gdzelektrik.com.tr%';
update public.distribution_companies set basvuru_url = 'https://www.akdenizedas.com.tr/lisanssiz-uretim'
    where website like '%akdenizedas.com.tr%';
update public.distribution_companies set basvuru_url = 'https://www.uedas.com.tr/tr/lisanssiz-elektrik-uretimi'
    where website like '%uedas.com.tr%';

-- ⚠️ ARAS EDAŞ: kayıtlı adres (arasedas.com.tr) AÇILMIYOR — sınandı, bağlantı
-- kurulamadı. Doğrusunu bulup güncelleyene kadar not düşülüyor.
update public.distribution_companies
   set notes = coalesce(notes || ' · ', '') || 'Kayıtlı web adresi yanıt vermiyor (11.09.2026 kontrolü) — güncellenmeli.'
 where website like '%arasedas.com.tr%'
   and coalesce(notes, '') not like '%yanıt vermiyor%';

-- ------------------------- 3) BELGE TABLOSUNU YENİ KAYDA BAĞLA
--  mevzuat_belgeleri.sirket_kod, silinecek tabloya işaret ediyordu. Tablo boş
--  olduğu için kolonu güvenle yeniden tanımlıyoruz.
alter table public.mevzuat_belgeleri drop column if exists sirket_kod;
alter table public.mevzuat_belgeleri
    add column if not exists sirket_id uuid references public.distribution_companies(id) on delete cascade;
create index if not exists mevzuat_belgeleri_sirket_idx2
    on public.mevzuat_belgeleri (sirket_id, tesis_tipi, asama, sira);

-- ----------------------------------- 4) PARALEL TABLOYU KALDIR
--  İçindeki her şey distribution_companies'te zaten var; bu tablo yalnızca
--  bu oturumda oluşturuldu ve başka hiçbir yer kullanmıyor.
drop table if exists public.dagitim_sirketleri cascade;

-- ---------------------------------------------------------------------------
--  KONTROL
--    select count(*) from public.distribution_companies;                 -- 21
--    select count(*) from public.distribution_companies
--      where basvuru_url is not null;                                    -- 6
--    select to_regclass('public.dagitim_sirketleri');                    -- null
-- ---------------------------------------------------------------------------
