-- ============================================================================
--  erisim-mesajlari.sql — Erişim sekmesinin mesaj şablonları
--
--  NEDEN AYRI TABLO?
--  Şablonlar site_content'e de konabilirdi, ama loadSiteContent() o tablonun
--  TAMAMINI her ziyaretçiye indiriyor (about.js:138, filtresiz select).
--  Satış metinleri hem herkese açık olurdu hem de her sayfa açılışına ağırlık
--  bindirirdi. Bu yüzden yalnız adminin okuyup yazdığı ayrı bir tablo.
--
--  metin      = kullanılan (düzenlenebilir) sürüm
--  varsayilan = kurulumdaki sürüm; "Sıfırla" düğmesi buraya döner
--
--  Betik tekrar çalıştırılabilir: başlık/kanal/varsayılan güncellenir,
--  ADMİNİN DÜZENLEDİĞİ 'metin' ALANINA DOKUNULMAZ.
-- ============================================================================

create table if not exists public.erisim_mesajlari (
    anahtar     text primary key,
    rol         text not null check (rol in ('kurulumcu','danisman','tedarikci')),
    baslik      text not null,
    aciklama    text,
    kanal       text,
    metin       text not null default '',
    varsayilan  text not null default '',
    sira        integer not null default 0,
    updated_at  timestamptz not null default now()
);

create index if not exists erisim_mesajlari_rol_sira_idx
    on public.erisim_mesajlari (rol, sira);

-- ---------------------------------------------------------------------------
--  RLS — yalnız admin. Ziyaretçi ve üye hiçbir satırı göremez.
-- ---------------------------------------------------------------------------
alter table public.erisim_mesajlari enable row level security;

drop policy if exists erisim_msj_admin on public.erisim_mesajlari;
create policy erisim_msj_admin on public.erisim_mesajlari
    for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- updated_at'i elle göndermeyi unutmak kolay; tetikleyici hallediyor.
create or replace function public.erisim_msj_dokun()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists erisim_msj_dokun_trg on public.erisim_mesajlari;
create trigger erisim_msj_dokun_trg
    before update on public.erisim_mesajlari
    for each row execute function public.erisim_msj_dokun();

-- ============================================================================
--  VARSAYILAN ŞABLONLAR
--
--  KIRMIZI ÇİZGİLER (metinleri düzenlerken de korunmalı):
--   • "Size müşteri getireceğiz" YOK — bugün doğru değil.
--   • "Onaylı danışmanlarımız" gibi çoğul YOK — tek onaylı danışman var.
--   • Uydurma sayı YOK (firma sayısı, müşteri sayısı, tasarruf oranı).
--   • "%0 komisyon" YOK → "işten pay almıyoruz, gelirimiz sabit abonelik".
--
--  Yer tutucular: {{ad}} {{firma}} {{sehir}} {{is}}
-- ============================================================================

insert into public.erisim_mesajlari (anahtar, rol, baslik, aciklama, kanal, sira, varsayilan, metin) values

-- ------------------------------------------------------------- KURULUMCU ----
('kur_ilk_dm', 'kurulumcu', 'İlk temas — DM / WhatsApp',
 'Kısa tutun. Tek amacı randevu almak, ürünü anlatmak değil.', 'DM', 10,
$m$Merhaba {{ad}},

Ben Erdem Yavuz, elektrik-elektronik mühendisiyim. {{firma}} olarak {{sehir}} tarafında yaptığınız işleri gördüm.

GES firmaları için bir yazılım geliştirdim: müşteri takibi, kendi logonuzla dakikalar içinde PDF teklif ve dağıtım şirketi süreç takibi tek panelde.

15 Kasım'a kadar ücretsiz. 20 dakikada göstermek isterim — beğenmezseniz bir daha rahatsız etmem.

epcmerkezim.com$m$, ''),

('kur_ilk_eposta', 'kurulumcu', 'İlk temas — E-posta',
 'DM''e göre uzun olabilir. Konu satırı dahil kopyalanır.', 'E-posta', 20,
$m$Konu: {{firma}} için teklif ve süreç takibi — 20 dakika

Merhaba {{ad}},

Ben Erdem Yavuz, elektrik-elektronik mühendisi. {{sehir}} ve çevresinde yaptığınız çatı GES işlerini takip ediyorum.

Görüştüğüm kurulumcu firmalarda sürekli aynı üç sıkıntıyı duyuyorum:

• Teklifler Word/Excel'de hazırlanıyor, her biri yarım saat alıyor
• Hangi müşteri hangi aşamada — bilgi WhatsApp gruplarına dağılmış
• Dağıtım şirketi evrakının nerede olduğunu kimse net söyleyemiyor

epcmerkezim tam bu üçü için yapıldı:

• Kendi logonuz, marka renginiz ve kâr marjınızla dakikalar içinde PDF teklif
• Müşteri hattı: ilk görüşmeden devreye alışa kadar tek ekranda
• 9 adımlı dağıtım/TEDAŞ süreç takibi — müşteri kendi panelinden ilerlemeyi görüyor, sizi aramasına gerek kalmıyor

Net olmak isterim: platform yeni. Size düzenli müşteri akışı sözü VERMİYORUM. Panel, kendi müşterilerinizi düzgün yönetmeniz için.

İki şey de baştan açık olsun:
• Sisteme girdiğiniz müşteri size ait. Başka hiçbir firmaya görünmez; bu yetki veritabanı seviyesinde uygulanıyor, ayar meselesi değil.
• İşin tutarından pay almıyoruz. Gelirimiz yalnız sabit aylık abonelik.

15 Kasım 2026'ya kadar ücretsiz kullanabilirsiniz. Bu hafta 20 dakikalık bir görüşmede canlı gösterebilir miyim?

Erdem Yavuz
Elektrik-Elektronik Mühendisi
epcmerkezim.com$m$, ''),

('kur_randevu', 'kurulumcu', 'Randevu onayı / hatırlatma',
 'Görüşmeden bir gün önce gönderin. İptali azaltır.', 'WhatsApp', 30,
$m$Merhaba {{ad}},

Yarın {{is}} için görüşmemizi teyit ediyorum.

Yanınızda gerçek bir müşteri dosyası olsun (tüketim ve adres yeterli) — anlatmak yerine sizin kendi müşterinizle, kendi logonuzla bir teklif çıkaralım. 20 dakika sürer.

Erdem Yavuz$m$, ''),

('kur_takip_48', 'kurulumcu', 'Görüşme sonrası — 48 saat',
 'Satış burada kapanıyor. Atlanırsa görüşme boşa gider.', 'WhatsApp', 40,
$m$Merhaba {{ad}},

Önceki gün çıkardığımız teklifi bir daha denediniz mi?

Takıldığınız bir yer varsa yazın, ekranı paylaşıp beraber bakarız. Bir şey satmaya çalışmıyorum — 15 Kasım'a kadar ücretsiz zaten. Sadece işinize yarayıp yaramadığını öğrenmek istiyorum.

Yaramadıysa nedenini söylemeniz benim için daha değerli.

Erdem Yavuz$m$, ''),

('kur_son_dokunus', 'kurulumcu', 'Cevap yok — son dokunuş',
 'Üçüncü mesajı ASLA göndermeyin. Söz verdiyseniz durun.', 'DM', 50,
$m$Merhaba {{ad}},

Yoğun olduğunuzu tahmin ediyorum, son bir kez yazıyorum — söz verdiğim gibi bir daha rahatsız etmeyeceğim.

Panel 15 Kasım'a kadar ücretsiz, kayıt 2 dakika: epcmerkezim.com/kurulumcu

İlginiz olursa kapı her zaman açık. Kolay gelsin.

Erdem Yavuz$m$, ''),

('kur_itiraz_musteri', 'kurulumcu', 'İtiraz: "Müşterilerimi alırsınız"',
 'En sık gelen itiraz. Cevabı teknik ve doğrulanabilir — güçlü yanınız burası.', 'Sözlü', 60,
$m$Haklı bir endişe, çoğu platform tam bunu yapıyor.

Bizde durum şöyle: sisteme kendi girdiğiniz müşteri yalnız size görünür. Bunu "söz veriyoruz" diye söylemiyorum — yetkilendirme veritabanı seviyesinde tanımlı, yani başka bir firmanın o kaydı görmesi teknik olarak mümkün değil. Benim bile açıp değiştirebileceğim bir ayar değil.

İkinci nokta: işin tutarından pay almıyoruz. Gelirimiz sabit aylık abonelik. Hangi firma kazanırsa kazansın bize aynı para geliyor — müşterinizi başka yere yönlendirmenin bize hiçbir faydası yok.

İsterseniz iki hesap açıp deneyelim: birinden müşteri girin, diğerinden görünüp görünmediğine bakın.$m$, ''),

('kur_itiraz_sayi', 'kurulumcu', 'İtiraz: "Kaç müşteri getireceksiniz?"',
 'Rakam UYDURMAYIN. Dürüstlük burada satış argümanı — herkes şişiriyor.', 'Sözlü', 70,
$m$Dürüst cevap: bilmiyorum, ve bugün bir sayı söylesem uydurmuş olurum.

Platform yeni; siz ilk firmalardansınız. Bölgenizden başvuru gelirse size iletilir, ama düzenli bir akış sözü vermiyorum.

Panelin bugün size vadettiği şey başka: teklif hazırlama süreniz yarım saatten dakikalara iniyor, hangi müşterinin hangi aşamada olduğunu tek ekrandan görüyorsunuz ve müşteri evrak sormak için sizi aramıyor.

Bu üçü bugün çalışıyor. Müşteri akışı olursa üstüne gelir — ama satışını yaptığım şey bu değil.$m$, ''),

-- -------------------------------------------------------------- DANIŞMAN ----
('dan_ilk_dm', 'danisman', 'İlk temas — LinkedIn / DM',
 'Danışman müşteri değil, MEŞRUİYET arıyor. Vurgu oraya.', 'DM', 10,
$m$Merhaba {{ad}},

Ben Erdem Yavuz, elektrik-elektronik mühendisiyim. Bağımsız enerji danışmanlığı yaptığınızı gördüm.

GES yatırımcılarıyla firmaları buluşturan bir platform geliştirdim ve danışman rolünü özellikle tarafsızlık korunacak şekilde kurdum: danışan portföyünüzü panelden yönetiyorsunuz, teklifleri firmaların kâr marjını görmeden değerlendiriyorsunuz.

15 Kasım'a kadar ücretsiz. Kısaca anlatabilir miyim?

epcmerkezim.com/danisman$m$, ''),

('dan_ilk_eposta', 'danisman', 'İlk temas — E-posta',
 'Danışmana "müşteri getiririz" demeyin; zemin ve tarafsızlık satın alıyor.', 'E-posta', 20,
$m$Konu: Bağımsız GES danışmanlığı için bir çalışma zemini

Merhaba {{ad}},

Ben Erdem Yavuz, elektrik-elektronik mühendisi. GES yatırımcıları ile kurulumcu firmaları buluşturan epcmerkezim'i geliştirdim.

Bağımsız danışmanlıkta en zor kısmın tarafsızlığı kanıtlamak olduğunu düşünüyorum. Platformda danışman rolünü buna göre kurdum:

• Danışan portföyünüz panelde — görüşme geçmişi, aşama, notlar tek yerde
• Teklifleri firmaların kâr marjını görmeden değerlendiriyorsunuz
• Verdiğiniz görüş kayda geçiyor; danışan da aynı kaydı görüyor

Açık olmak adına: platform henüz yayında değil, danışman tarafı da yeni. Size danışan akışı sözü vermiyorum. Sunduğum şey, işinizi yürüttüğünüz zeminin kendisi.

15 Kasım 2026'ya kadar ücretsiz. 20 dakikada gösterebilir miyim?

Erdem Yavuz
epcmerkezim.com/danisman$m$, ''),

('dan_hosgeldin', 'danisman', 'Onay sonrası hoş geldin',
 'Başvuru onaylandıktan sonra. Kayıt ile ilk kullanım arasındaki boşluğu kapatır.', 'E-posta', 30,
$m$Merhaba {{ad}},

Danışman başvurunuz onaylandı, hoş geldiniz.

Panele girdiğinizde ilk yapmanızı önerdiğim iki şey:
1. Profilinizi tamamlayın — uzmanlık alanları ve şehir, eşleşmede kullanılıyor
2. Mevcut danışanlarınızdan birini sisteme girin; akışı gerçek bir dosyayla görmek en hızlı yol

Platform henüz yayında değil; yayına kadar ücretsiz kullanıyorsunuz. Takıldığınız yerde doğrudan bana yazın.

Erdem Yavuz$m$, ''),

-- ------------------------------------------------------------ TEDARİKÇİ -----
('ted_ilk_eposta', 'tedarikci', 'İlk temas — E-posta',
 'DİKKAT: Tedarikçi satışı, aktif kurulumcu sayısına bağlı. 10 aktif firmaya ulaşmadan göndermeyin — boş vaat olur.', 'E-posta', 10,
$m$Konu: Kurulumcu teklif hazırlarken ürününüzün orada olması

Merhaba {{ad}},

Ben Erdem Yavuz, elektrik-elektronik mühendisi. GES kurulumcu firmalarının müşteri ve teklif süreçlerini yönettiği epcmerkezim'i geliştirdim.

Gözlemim şu: tedarikçi için sorun katalog göndermek değil — kurulumcu teklifi hazırladığı ANDA ürünün aklında olmaması.

Platformda kurulumcu teklifi panelde hazırlıyor. Ürün listeniz oraya tanımlıysa, karar anında karşısında oluyor.

Nerede olduğumuzu olduğu gibi söylüyorum: platform yeni, kurulumcu tarafı büyüyor. Bugün size sipariş hacmi sözü vermiyorum. Erken girmenin avantajı, ürün verinizin sistemde yerleşmiş olması.

15 Kasım 2026'ya kadar ücretsiz. Kısa bir görüşme yapabilir miyiz?

Erdem Yavuz
epcmerkezim.com/tedarikci$m$, ''),

('ted_takip', 'tedarikci', 'Takip — cevap yok',
 'Tek takip mesajı yeterli.', 'E-posta', 20,
$m$Merhaba {{ad}},

Geçen haftaki e-postama ek olarak kısa bir not — cevap gelmezse takip etmeyeceğim.

Ürün listenizi sisteme tanımlamak ücretsiz ve bir taahhüt oluşturmuyor: epcmerkezim.com/tedarikci

Zamanlaması uygun değilse ilerleyen aylarda tekrar konuşabiliriz.

Erdem Yavuz$m$, '')

on conflict (anahtar) do update set
    rol        = excluded.rol,
    baslik     = excluded.baslik,
    aciklama   = excluded.aciklama,
    kanal      = excluded.kanal,
    sira       = excluded.sira,
    varsayilan = excluded.varsayilan;
    -- metin'e BİLEREK dokunulmuyor: betik tekrar çalışsa da düzenlemeler durur

-- İlk kurulumda metin boşsa varsayılanla doldur (sonraki çalışmalarda etkisiz).
update public.erisim_mesajlari
   set metin = varsayilan
 where coalesce(metin, '') = '';

-- ---------------------------------------------------------------------------
--  DOĞRULAMA — Run'dan sonra 12 satır ve boş metin OLMAMALI
-- ---------------------------------------------------------------------------
select rol, count(*) as adet, sum((coalesce(metin,'') = '')::int) as bos_metin
  from public.erisim_mesajlari group by rol order by rol;
