/* ============================================================================
   settings.js — REFERANS AYAR YÜKLEYİCİ
   window.EPC_SETTINGS'i önce varsayılanlarla senkron kurar, sonra DB'den
   (app_settings) güncel değerleri çekip üzerine yazar. Hesaplayıcı/teklif/batarya
   modülleri değerleri HESAP ANINDA buradan okur (varsayılana düşüş korumalı).
   index.html'de core.js'ten HEMEN SONRA yüklenmelidir.
   ============================================================================ */
window.EPC_SETTINGS = {
    solarYield: 1406,      // 81 ilin PVGIS ortalaması; yalnız il tanınmadığında yedek
    roofM2PerKwp: 5.5,
    kwpPerPanel: 0.55,
    pricePerKwp: 30000,
    co2PerKwh: 0.45,
    // tariff / tariff* anahtarları aşağıda core.js'in yedek tablosundan kuruluyor
    batteryDod: 0.9,
    inverterEff: 0.95,
    batteryModule: 5,
    inverterSurge: 1.3,
    // Fatura Analizi modülü (admin panelinden düzenlenir)
    usdTry: 48.43,         // core.js → EPC_KUR_YEDEK üzerine yazar; asıl değer app_settings'te
    usdPerKwp: 1000,
    batteryUsdPerKwh: 300,
    tariffDogrulandi: 0
};

// TARİFELER — EPDK "4 Nisan 2026'dan itibaren geçerli" tablosu, AG tek terim.
//   toplam = (enerji + dağıtım + enerji×%1 fon + enerji×BTV) × 1,20 KDV
//   BTV: mesken/ticarethanede %5, sanayi ve tarımda %1
// Enerji ve dağıtım bedelleri RESMİ TABLODAN — kesin. Vergi katmanı yukarıdaki
// kurala göre hesaplandı, bir faturayla karşılaştırılmadı; bu yüzden
// tariffDogrulandi = 0 ve yönetici panelinde uyarı duruyor.
// Sayılar core.js → EPC_TARIFE_YEDEK'te tek yerde tutuluyor; burası onu kopyalar.
// Asıl kaynak yine de veritabanıdır (app_settings), aşağıdaki yükleyici üzerine yazar.
Object.assign(window.EPC_SETTINGS, window.EPC_TARIFE_YEDEK || {});
if (Number(window.EPC_KUR_YEDEK) > 0) window.EPC_SETTINGS.usdTry = Number(window.EPC_KUR_YEDEK);


// ⚠️ YARIŞ: ayarların gelmesi ile modül dosyalarının yüklenmesi arasında
// garantili bir sıra yok. Yalnızca 'epc-settings-loaded' olayını dinleyen bir
// modül, olay kendisi yüklenmeden ÖNCE atıldıysa haberi hiç almıyor ve koddaki
// varsayılan değerlerde takılı kalıyordu — yönetici panelinden girilen tarife
// arayüze hiç yansımayabiliyordu. Bayrak + yardımcı iki yönü de kapatır.
window.EPC_SETTINGS_HAZIR = false;

// Ayarlar hazır olduğunda cb'yi çalıştırır ve SONRAKİ tazelemelere de abone eder.
// İki iş birden: geç yüklenen modül kaçırdığı olayı hemen alır (yoksa koddaki
// varsayılanda takılı kalırdı), erken yüklenen de yöneticinin sonradan yaptığı
// değişikliği görür. Yalnızca birini yapmak modüllerin bir kısmını bayatlatıyordu.
window.epcAyarlarHazir = function (cb) {
    if (typeof cb !== 'function') return;
    window.addEventListener('epc-settings-loaded', function () { try { cb(); } catch (e) {} });
    if (window.EPC_SETTINGS_HAZIR) { try { cb(); } catch (e) {} }
};

(async function loadSettings() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { data } = await supabaseClient.from('app_settings').select('key, value');
            (data || []).forEach(r => {
                const v = Number(r.value);
                if (!isNaN(v)) window.EPC_SETTINGS[r.key] = v;
            });
        } catch (e) { /* DB yoksa/erişilemezse varsayılanlar kullanılır */ }
    }
    // Ayarlar sayfa açıldıktan SONRA geliyor; koddaki varsayılanlarla kurulmuş
    // arayüzler (ör. hesaplayıcının tarife listesi) bu olayla kendini tazeler.
    // DB'ye hiç ulaşılamasa bile bayrak kalkar: bekleyenler sonsuza kadar
    // asılı kalmaz, varsayılanlarla çizerler.
    window.EPC_SETTINGS_HAZIR = true;
    try { window.dispatchEvent(new Event('epc-settings-loaded')); } catch (e) {}
})();


/* --- Genel aşama etiketleri (admin düzenlenebilir isim + açıklama) --- */
window.EPC_STAGES = {}; // { key: { label, description } }

// Aşama görünen adını döndürür: önce DB (admin), sonra koddaki varsayılan, sonra anahtar.
window.stageLabel = function (k) {
    return (window.EPC_STAGES[k] && window.EPC_STAGES[k].label)
        || (typeof crmStatusLabels !== 'undefined' && crmStatusLabels[k] && crmStatusLabels[k].text)
        || k;
};

(async function loadStages() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
        const { data } = await supabaseClient.from('stage_labels').select('key, label, description');
        (data || []).forEach(r => { window.EPC_STAGES[r.key] = { label: r.label, description: r.description }; });
    } catch (e) { /* tablo yoksa koddaki varsayılanlar kullanılır */ }
})();

/* --- Site içeriği (Hakkımda vb.) — admin panelinden düzenlenir --- */
window.EPC_CONTENT = {}; // { key: value } — DB'den dolar

// Kod içi varsayılanlar: DB boş/erişilemezse sayfa yine dolu görünür.
window.EPC_CONTENT_DEFAULTS = {
    about_name: 'Erdem Yavuz',
    about_title: 'Elektrik-Elektronik Mühendisi',
    about_tagline: 'Yenilenebilir enerji, dijital otomasyon ve görsel prodüksiyon',
    about_location: 'İstanbul, Türkiye',
    about_edu: 'Marmara Üniversitesi Teknoloji Fakültesi — Elektrik-Elektronik Mühendisliği',
    about_expertise: 'Fotovoltaik (PV) Sistemler, İnverter Teknolojileri, Batarya Depolama, EŞ Şarj İstasyonları, Drone Videografi, n8n Otomasyon',
    about_intro: 'Erdem Yavuz; yenilenebilir enerji, dijital otomasyon ve görsel prodüksiyon alanlarında yenilikçi projeler üreten bir Elektrik-Elektronik Mühendisidir. Marmara Üniversitesi Teknoloji Fakültesi Elektrik-Elektronik Mühendisliği bölümünden mezun olduktan sonra, mühendislik disiplinini teknoloji, estetik ve modern iş modelleriyle harmanlayarak çok yönlü bir kariyer inşa etmiştir.',
    about_sec1_title: 'Mühendislik Vizyonu ve EPCMERKEZİM',
    about_sec1_body: 'Güneş enerjisi sektöründe fotovoltaik (PV) sistemler, evirici (inverter) teknolojileri, batarya depolama ve elektrikli araç şarj istasyonları üzerine derin bir uzmanlığa sahiptir. Temiz enerji çözümlerinin uçtan uca mimarisini kurguladığı EPCMERKEZİM projesi ile, enerji sektöründeki mühendislik, tedarik ve kurulum vizyonunu dijitalleştirerek sektöre değer katmaya odaklanmaktadır. Sistem boyutlandırmadan, on-grid/off-grid sistem yol haritalarına ve ısı pompası entegrasyonlarına kadar geleceğin enerji ekosistemleri üzerinde aktif olarak çalışmaktadır.',
    about_sec2_title: 'Havadan Prodüksiyon ve Estetik: Teknik Uçuş',
    about_sec2_body: 'Mühendislik perspektifini yaratıcı görsel hikaye anlatıcılığı ile birleştirdiği Teknik Uçuş markasının kurucusudur. Teknik Uçuş çatısı altında; gayrimenkul profesyonelleri, inşaat şirketleri ve mimari projeler için üst düzey drone videografisi hizmeti sunmaktadır. Lüks villalar, detaylı arazi/parsel çekimleri ve büyük endüstriyel tesislerin tanıtımları için profesyonel havadan görüntüleme ve kurgu çalışmaları gerçekleştirerek projelerin pazarlama gücünü artırmaktadır.',
    about_sec3_title: 'Dijital Sistemler ve Otomasyon',
    about_sec3_body: 'Sadece sahada değil, dijital arka planda da modern iş modelleri inşa eden Erdem Yavuz; n8n gibi platformlar üzerinden iş akışlarını otomatikleştirerek, satış temsilcisi botları, veri izleme sistemleri ve kendi kendini yürüten dijital ürün teslimat boru hatları (pipeline) tasarlamaktadır.',
    about_instagram: 'https://www.instagram.com/erdm.yvz',
    about_phone: '0 531 995 69 30',
    about_email: 'erdem.yvz@hotmail.com'
};

// Değer okuyucu: önce DB (admin), sonra kod varsayılanı, sonra boş.
window.siteContent = function (key) {
    const v = window.EPC_CONTENT[key];
    if (v !== undefined && v !== null && String(v).length) return v;
    const d = window.EPC_CONTENT_DEFAULTS[key];
    return (d !== undefined && d !== null) ? d : '';
};

(async function loadContent() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
        const { data } = await supabaseClient.from('site_content').select('key, value');
        (data || []).forEach(r => { window.EPC_CONTENT[r.key] = r.value; });
        const mod = document.getElementById('aboutModule');
        if (typeof window.renderAbout === 'function' && mod && !mod.classList.contains('hidden')) {
            window.renderAbout();
        }
    } catch (e) { /* tablo yoksa varsayılanlar kullanılır */ }
})();