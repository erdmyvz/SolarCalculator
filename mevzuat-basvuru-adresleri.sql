-- ============================================================================
--  mevzuat-basvuru-adresleri.sql
--  Kalan 15 dağıtım şirketinin lisanssız üretim başvuru sayfaları
--  + iki hatalı web adresinin düzeltilmesi.
--
--  NASIL BULUNDU: 15 şirketin resmi sitesi tek tek açıldı; başvuru sayfası
--  sitenin kendi menüsünden ya da sitemap'inden izlendi ve açılarak sınandı.
--  Hiçbiri tahmin edilmedi, hiçbiri arama sonucundan kopyalanmadı.
--  Kontrol tarihi: 13.09.2026 — 15 adresin 15'i de 200 döndü.
--
--  ⚠️ BU BETİK dogrulandi_mi ALANINA DOKUNMUYOR.
--  Adresin açılması, o satırın "teyit edilmiş" olduğu anlamına gelmez:
--  telefon numaralarını ve il listelerini sınamadım. Teyit beyanı admin
--  panelinden, bakan kişi tarafından verilmeli.
-- ============================================================================

-- -------------------------------------------------- 1) İKİ HATALI WEB ADRESİ
--  AKEDAŞ: kayıtlı adres (akedas.com.tr) açılıyor AMA yanlış şirket —
--  o site PERAKENDE SATIŞ tarafı (fatura ödeme, abonelik). Dağıtım şirketi
--  akedasdagitim.com.tr'de ve lisanssız üretim bölümü yalnız orada var.
--  Kurulumcu, başvuruyu perakende şirketine yapamaz; bu yüzden kritik.
update public.distribution_companies
   set website = 'https://www.akedasdagitim.com.tr',
       notes = coalesce(nullif(notes, '') || ' · ', '')
               || 'Web adresi 13.09.2026''da düzeltildi: akedas.com.tr perakende satış şirketine ait, dağıtım şirketi akedasdagitim.com.tr.'
 where abbr = 'AKEDAŞ';

--  ARAS EDAŞ: kayıtlı adres .com.tr idi ve yanıt vermiyordu. Çalışan resmi
--  adres .com uzantılı (arasedas.com). Önceki kontrolde düşülen "yanıt
--  vermiyor" notu artık geçersiz; yerine düzeltme notu yazılıyor.
update public.distribution_companies
   set website = 'https://www.arasedas.com',
       notes = 'Web adresi 13.09.2026''da düzeltildi: arasedas.com.tr yanıt vermiyor, çalışan resmi adres arasedas.com.'
 where abbr = 'Aras EDAŞ';

-- ------------------------------------------ 2) BAŞVURU ADRESLERİ (15 ŞİRKET)
update public.distribution_companies d
   set basvuru_url = v.url
  from (values
    ('Toroslar EDAŞ', 'https://www.toroslaredas.com.tr/yasal-bildirim/lisanssiz-elektrik-uretim-basvurulari'),
    ('DEDAŞ',         'https://www.dedas.com.tr/hizmetlerimiz/lisanssiz-elektrik-uretim'),
    ('ADM',           'https://www.admelektrik.com.tr/bilgi-merkezi/yasal-bildirimler/lisanssiz-elektrik-uretimi'),
    ('MEDAŞ',         'https://www.meramedas.com.tr/tr/lisanssiz-elektrik-uretimi-1'),
    ('SEDAŞ',         'https://www.sedas.com/Tr/icerik_lisanssiz-elektrik-uretimi_580'),
    ('OEDAŞ',         'https://www.osmangaziedas.com.tr/proje-basvurulari'),
    ('Aras EDAŞ',     'https://www.arasedas.com/bilgilendirme/lisanssiz_elektrik_uretimi'),
    ('VEDAŞ',         'https://www.vedas.com.tr/lisanssiz-elektrik-uretimi-TR.html'),
    ('Çoruh EDAŞ',    'https://www.coruhedas.com.tr/BilgiDanisma/LisanssizElektrikUretimi'),
    ('FEDAŞ',         'https://www.firatedas.com.tr/BilgiDanisma/LisanssizElektrikUretimi'),
    ('AKEDAŞ',        'https://www.akedasdagitim.com.tr/lisanssiz-elektrik-uretimi'),
    ('ÇEDAŞ',         'https://www.cedas.com.tr/lisanssiz-uretim'),
    ('TREDAŞ',        'https://www.tredas.com.tr/lisanssiz-uretim-basvurusu'),
    ('KCETAŞ',        'https://www.kcetas.com.tr/tr/lisanssiz-elektrik-uretim'),
    ('YEDAŞ',         'https://www.yedas.com/lisanssiz-elektrik-uretimi')
  ) as v(kisa_ad, url)
 where d.abbr = v.kisa_ad;

-- ------------------------------------------------------ 3) İKİ AÇIKLAMA NOTU
--  OEDAŞ tek başına ayrı duruyor: sitesinde "lisanssız elektrik üretimi"
--  başlıklı bir bölüm YOK. Başvurular genel "Proje Başvuruları" sayfasından
--  ayrı bir portala gidiyor. Yukarıdaki adres o sayfa; portalı da yazıyoruz
--  ki kurulumcu nereye düşeceğini bilsin.
update public.distribution_companies
   set notes = coalesce(nullif(notes, '') || ' · ', '')
               || 'Sitede ayrı bir "lisanssız üretim" bölümü yok; başvurular Proje Başvuruları sayfasından proje.oedas.com.tr portalına yönleniyor.'
 where abbr = 'OEDAŞ'
   and coalesce(notes, '') not like '%proje.oedas.com.tr%';

--  SEDAŞ'ın bilgi sayfası ayrı, başvuru portalı ayrı.
update public.distribution_companies
   set notes = coalesce(nullif(notes, '') || ' · ', '')
               || 'Başvuru portalı ayrı: sedas.com/Luy/Index (giriş gerektirir).'
 where abbr = 'SEDAŞ'
   and coalesce(notes, '') not like '%Luy/Index%';

-- ---------------------------------------------------------------------------
--  KONTROL
--    select count(*) from public.distribution_companies
--      where basvuru_url is not null;                                    -- 21
--    select abbr, website from public.distribution_companies
--      where abbr in ('AKEDAŞ','Aras EDAŞ');
--      -- akedasdagitim.com.tr  /  arasedas.com  olmalı
--    select count(*) from public.distribution_companies;                 -- 21
-- ---------------------------------------------------------------------------
