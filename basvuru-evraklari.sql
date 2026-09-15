-- ============================================================================
--  basvuru-evraklari.sql — BAŞVURU EVRAKLARI MODÜLÜ
--
--  Ne yapar: kurulumcu firmanın dağıtım şirketine yapacağı lisanssız üretim
--  bağlantı başvurusunda istenen evrakları listeler ve yatırımcıdan BİR KEZ
--  alınan bilgilerle doldurur.
--
--  Altyapı zaten vardı: mevzuat_belgeleri tablosu mevzuat.sql ile açılmış ama
--  hiç doldurulmamış (0 kayıt). Bu dosya onu kullanılabilir hâle getiriyor.
--
--  ⚠️ KAYNAK DİSİPLİNİ
--  Aşağıdaki her satırın kaynak_url'i var ve dogrulama_tarihi 15.09.2026.
--  Liste GENEL MEVZUATA göre hazırlandı; her dağıtım şirketi ek belge
--  isteyebilir. Modül bunu kullanıcıya açıkça söylüyor ve şirketin kendi
--  başvuru sayfasına bağlantı veriyor. Şirkete özel belgeler yönetici
--  panelinden eklenir (sirket_id dolu satırlar).
-- ============================================================================

-- --------------------------------------------------------------- 1) ŞEMA EKİ
-- Hangi belgeyi biz üretebiliyoruz? (null = resmi şablon şirketten indirilir)
alter table public.mevzuat_belgeleri add column if not exists sablon_kod text;
-- Belge kime göre isteniyor: gercek | tuzel | hepsi
alter table public.mevzuat_belgeleri add column if not exists kisi_tipi text not null default 'hepsi';
-- Yalnız belirli güç aralığında isteniyorsa (kWe). null = sınır yok
alter table public.mevzuat_belgeleri add column if not exists min_kw numeric;
alter table public.mevzuat_belgeleri add column if not exists max_kw numeric;

-- Başvuru dosyası: yatırımcıdan bir kez alınan bilgiler + evrak durumu.
-- JSONB seçildi çünkü dağıtım şirketleri farklı alanlar istiyor; sabit kolon
-- açmak her yeni istekte şema değişikliği demek olurdu.
alter table public.leads add column if not exists basvuru_dosyasi jsonb;

-- --------------------------------------------------------- 2) ULUSAL BELGELER
-- Aynı dosya iki kez çalıştırılırsa satırlar çoğalmasın.
delete from public.mevzuat_belgeleri where sirket_id is null and asama = 'basvuru';

insert into public.mevzuat_belgeleri
 (sirket_id, tesis_tipi, asama, sira, belge_adi, aciklama, nereden_alinir,
  zorunlu_mu, kaynak_url, dogrulama_tarihi, yayinda, sablon_kod, kisi_tipi)
values
 -- ---- Formlar (resmi şablon şirketten indirilir) ----
 (null,'mesken','basvuru',10,
  'Lisanssız Üretim Bağlantı Başvuru Formu (Ek-1)',
  'Yönetmeliğin Ek-1 formu. Başvuru sahibi, üretim tesisi ve tüketim tesisi bilgilerini içerir. Dağıtım şirketleri kendi şablonlarını yayımlar; mutlaka şirketin sitesindeki güncel dosya kullanılmalıdır.',
  'Dağıtım şirketinin lisanssız üretim sayfası',
  true,'https://www.epdk.gov.tr/Detay/Icerik/3-0-92/elektriklisanssiz-uretim','2026-09-15',true,null,'hepsi'),

 (null,'mesken','basvuru',20,
  'Faaliyet Yasağına İlişkin Beyan',
  '6446 sayılı Kanun kapsamında faaliyet yasağı bulunmadığına dair imzalı beyan. 25 kW altı başvurular için şirketler ayrı bir örnek (Ek-2) yayımlayabilir.',
  'Dağıtım şirketinin sitesi veya bu modülden hazır metin',
  true,'https://www.baskentedas.com.tr/yasal-bildirim/lisanssiz-elektrik-uretim-basvurulari','2026-09-15',true,'beyan','hepsi'),

 (null,'mesken','basvuru',30,
  'Teknik Değerlendirme Formu (GES)',
  'Şebeke etkisinin değerlendirilmesi için doldurulan teknik form. Genellikle Excel olarak yayımlanır ve elektrik projesini hazırlayan mühendis doldurur.',
  'Dağıtım şirketinin lisanssız üretim sayfası',
  true,'https://www.osmangaziedas.com.tr/lisanssiz-basvuru-icin-gerekli-evraklar','2026-09-15',true,null,'hepsi'),

 (null,'mesken','basvuru',40,
  'Tek Hat Şeması',
  'Üretim tesisinin elektriksel bağlantısını gösteren şema. Elektrik mühendisi tarafından hazırlanır ve imzalanır.',
  'Projeyi hazırlayan elektrik mühendisi',
  true,'https://www.epdk.gov.tr/Detay/Icerik/3-0-92/elektriklisanssiz-uretim','2026-09-15',true,null,'hepsi'),

 -- ---- Mülkiyet / kullanım hakkı ----
 (null,'mesken','basvuru',50,
  'Tapu · Kira Sözleşmesi veya Kullanım Hakkı Belgesi',
  'Üretim tesisinin kurulacağı yerin tapusu; kiralıksa EN AZ İKİ YIL süreli kira sözleşmesi; ya da kullanım hakkının alındığını gösteren belge. Kira sözleşmesinde imza sirküleri/imza beyanı da istenir.',
  'Tapu Müdürlüğü / mülk sahibi',
  true,'https://www.lexpera.com.tr/mevzuat/yonetmelikler/elektrik-piyasasinda-lisanssiz-elektrik-uretime-iliskin-yonetmelik','2026-09-15',true,null,'hepsi'),

 (null,'mesken','basvuru',60,
  'Kat Malikleri Kurulu Kararı (Muvafakatname)',
  'Birden fazla bağımsız bölümü olan bina veya sitede: çatıya güneş enerjisi üretim tesisi kurulabileceğine dair karar defterinden onaylı örnek. Müstakil yapılarda istenmez.',
  'Bina/site yönetimi — karar defteri',
  true,'https://www.lexpera.com.tr/mevzuat/yonetmelikler/elektrik-piyasasinda-lisanssiz-elektrik-uretime-iliskin-yonetmelik','2026-09-15',true,'muvafakat','hepsi'),

 -- ---- Tüketim tesisi ----
 (null,'mesken','basvuru',70,
  'Tüketim Tesisine Ait Abonelik Bilgisi (Tekil Kod)',
  'Mahsuplaşmanın yapılacağı tüketim aboneliğinin tekil kodu. Elektrik faturasının üzerinde yazar.',
  'Elektrik faturası',
  true,'https://www.epdk.gov.tr/Detay/Icerik/3-0-92/elektriklisanssiz-uretim','2026-09-15',true,null,'hepsi'),

 -- ---- Kimlik / yetki ----
 (null,'mesken','basvuru',80,
  'Kimlik Belgesi Fotokopisi',
  'Başvuru sahibi gerçek kişi ise kimlik fotokopisi.',
  'Başvuru sahibi',
  true,'https://www.osmangaziedas.com.tr/lisanssiz-basvuru-icin-gerekli-evraklar','2026-09-15',true,null,'gercek'),

 (null,'mesken','basvuru',90,
  'Ticaret Sicil Gazetesi · İmza Sirküleri · Yetki Belgesi',
  'Tüzel kişilerde: ortaklık yapısını gösteren sicil gazetesi, tüzel kişiyi temsile yetkili kişilerin imza sirküleri ve yetki belgeleri.',
  'Ticaret Sicil Müdürlüğü / noter',
  true,'https://www.solar.ist/lisanssiz-elektrik-uretim-basvurularinda-sunulmasi-gereken-bilgi-ve-belgeler-yayimlandi/','2026-09-15',true,null,'tuzel'),

 (null,'mesken','basvuru',100,
  'Vekaletname',
  'Başvuru, yatırımcı adına kurulumcu firma veya başka bir vekil tarafından yapılacaksa noterden vekaletname gerekir.',
  'Noter',
  false,'https://www.osmangaziedas.com.tr/lisanssiz-basvuru-icin-gerekli-evraklar','2026-09-15',true,'vekalet','hepsi'),

 -- ---- Ödeme ----
 (null,'mesken','basvuru',110,
  'Başvuru Bedeli Dekontu',
  'Başvuru bedelinin ilgili şebeke işletmecisinin hesabına yatırıldığını gösteren dekont. Tutar ve hesap bilgisi her şirkette farklıdır, şirketin sayfasından teyit edin.',
  'Banka dekontu',
  true,'https://www.osmangaziedas.com.tr/lisanssiz-basvuru-icin-gerekli-evraklar','2026-09-15',true,null,'hepsi'),

 -- ---- Yapı / yer uygunluğu ----
 (null,'mesken','basvuru',120,
  'Tesis Yeri Uygunluk Belgesi',
  'Çatı/cephe uygulamalarında ilgili belediye veya Çevre, Şehircilik ve İklim Değişikliği İl Müdürlüğünden alınan "çatıya GES kurulması uygundur" yazısı. Her şirkette istenmeyebilir.',
  'Belediye / Çevre ve Şehircilik İl Müdürlüğü',
  false,'https://www.baskentedas.com.tr/yasal-bildirim/lisanssiz-elektrik-uretim-basvurulari','2026-09-15',true,null,'hepsi'),

 -- ---- Yalnız arazi uygulamaları ----
 (null,'mesken','basvuru',130,
  'Koordinatlı Aplikasyon Krokisi',
  'ARAZİ uygulamaları için. Çatı ve cephe uygulamalarında istenmez.',
  'Harita mühendisi / kadastro',
  false,'https://www.solar.ist/lisanssiz-elektrik-uretim-basvurularinda-sunulmasi-gereken-bilgi-ve-belgeler-yayimlandi/','2026-09-15',true,null,'hepsi'),

 (null,'mesken','basvuru',140,
  'Tarım Arazisi Uygunluk Yazısı',
  'ARAZİ uygulamalarında, tarım arazisi ise Tarım ve Orman Bakanlığı görüşü. Çatı uygulamalarında istenmez.',
  'İl Tarım ve Orman Müdürlüğü',
  false,'https://www.solar.ist/lisanssiz-elektrik-uretim-basvurularinda-sunulmasi-gereken-bilgi-ve-belgeler-yayimlandi/','2026-09-15',true,null,'hepsi'),

 -- ---- Bizim ürettiğimiz ----
 (null,'mesken','basvuru',5,
  'Başvuru Dilekçesi',
  'Başvuruyu ileten üst yazı. Bu modül yatırımcı bilgileriyle doldurulmuş hâlini üretir.',
  'Bu modülden üretilir',
  true,'https://www.epdk.gov.tr/Detay/Icerik/3-0-92/elektriklisanssiz-uretim','2026-09-15',true,'dilekce','hepsi'),

 (null,'mesken','basvuru',15,
  'Başvuru Bilgi Föyü',
  'Formların istediği TÜM alanların tek sayfada doldurulmuş hâli. Resmi formu doldururken buradan kopyalanır; resmi form yerine GEÇMEZ.',
  'Bu modülden üretilir',
  false,'https://www.epdk.gov.tr/Detay/Icerik/3-0-92/elektriklisanssiz-uretim','2026-09-15',true,'foy','hepsi');

-- ------------------------------------------------------------------- 3) RLS
-- Okuma: giriş yapmış herkes yayındaki belgeleri görebilir.
-- Yazma: yalnız admin (mevzuat.sql'deki politika korunuyor; yoksa ekleniyor).
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'mevzuat_belgeleri'
          and policyname = 'mevzuat_belgeleri_okuma'
    ) then
        create policy mevzuat_belgeleri_okuma on public.mevzuat_belgeleri
            for select to authenticated using (yayinda = true);
    end if;
end $$;

notify pgrst, 'reload schema';

-- ============================================================================
--  KONTROL
--    select sira, belge_adi, zorunlu_mu, sablon_kod, kisi_tipi
--      from public.mevzuat_belgeleri
--     where sirket_id is null and asama = 'basvuru'
--     order by sira;
--
--  ŞİRKETE ÖZEL BELGE EKLEME (yönetici panelinden de yapılabilir):
--    insert into public.mevzuat_belgeleri
--      (sirket_id, tesis_tipi, asama, sira, belge_adi, aciklama, zorunlu_mu,
--       kaynak_url, dogrulama_tarihi, yayinda)
--    select id, 'mesken', 'basvuru', 200, 'Şirkete özel belge adı', 'Açıklama',
--           true, 'https://...', current_date, true
--      from public.distribution_companies where abbr = 'BEDAŞ';
-- ============================================================================
