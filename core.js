/* ============================================================================
   core.js — PAYLAŞILAN ÇEKİRDEK
   Bu dosya index.html'de app.js'ten ÖNCE yüklenmelidir.
   İçindekiler tüm modüllerin ortak kullandığı: veritabanı bağlantısı,
   ayarlar, durum etiketleri ve yardımcı fonksiyonlar.
   (Klasik script olduğu için buradaki tanımlar app.js'te de kullanılabilir.)
   ============================================================================ */

// --- Supabase bağlantısı (anon anahtar herkese açıktır; asıl koruma RLS'tir) ---
const SUPABASE_URL = 'https://bxcghdbrafzudiigeeud.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_EiDGhm4bT-acQ8xrV9RU4w_4wkUQGys';
// "Beni hatırla" kapalıyken oturum sessionStorage'da tutulur (sekme kapanınca biter).
// Açıkken localStorage'da kalır (varsayılan davranış).
const _epcSessionOnly = (function () {
    try { return Object.keys(sessionStorage).some(k => /^sb-.*-auth-token$/.test(k)); }
    catch (e) { return false; }
})();
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: _epcSessionOnly ? window.sessionStorage : window.localStorage
    }
}) : null;

// --- ⚠️ KÜRESEL KÖPRÜ (silme!) ----------------------------------------------
// Klasik <script> içinde `const`/`let` ile tanımlanan değişkenler window
// nesnesine YAZILMAZ (yalnız `var` ve fonksiyon bildirimleri yazılır).
// Sonradan eklenen modüller (profile, notifications, about, legal, documents,
// messaging, campaigns, quote, public) bağlantıyı `window.supabaseClient`
// üzerinden yokluyor; bu köprü olmadan hepsi sessizce devre dışı kalır.
window.supabaseClient = supabaseClient;

// --- CRM aşama etiketleri (leads.status) ---
const crmStatusLabels = {
    'yeni_basvuru':      { text: '1. Yeni Başvuru',      css: 'bg-blue-100 text-blue-800' },
    'arandi_gorusuldu':  { text: '2. İletişimde',        css: 'bg-amber-100 text-amber-800' },
    'teklif_gonderildi': { text: '3. Teklif İletildi',   css: 'bg-indigo-100 text-indigo-800' },
    'sozlesme_imzalandi':{ text: '4. Sözleşme İmzalandı', css: 'bg-purple-100 text-purple-800' },
    'kurulum_basladi':   { text: '5. Kurulum Süreci',    css: 'bg-orange-100 text-orange-800' },
    'resmi_surec':       { text: '6. TEDAŞ Kabulünde',   css: 'bg-cyan-100 text-cyan-800' },
    'tamamlandi':        { text: '7. Devreye Alındı 🚀', css: 'bg-emerald-100 text-emerald-800' }
};

// --- HTML kaçış yardımcısı (kullanıcı metinlerini güvenli basmak için) ---
function admEscape(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// --- Uygulama genelinde paylaşılan değişkenler (tüm modüller kullanır) ---
let currentUserProfile = null;      // Giriş yapan firmanın profili
let crmLeads = [];                  // CRM müşteri listesi (veritabanından yüklenir)
window.isApp3DInitialized = false;  // 3D sahnesinin tekrar tekrar yüklenmesini engeller

// --- ⚠️ KÜRESEL KÖPRÜ (silme!) ----------------------------------------------
// Yukarıdaki `let` bildirimleri de window'a yazılmaz. profile/messaging/
// documents/campaigns modülleri `window.currentUserProfile` okuyor. Düz atama
// yetmez (auth.js girişte değişkeni yeniden atıyor), bu yüzden erişimci
// tanımlıyoruz: okuma da yazma da tek kaynağa gider.
Object.defineProperty(window, 'currentUserProfile', {
    get: () => currentUserProfile,
    set: (v) => { currentUserProfile = v; },
    configurable: true
});
Object.defineProperty(window, 'crmLeads', {
    get: () => crmLeads,
    set: (v) => { crmLeads = v; },
    configurable: true
});

// --- TEMBEL KÜTÜPHANE YÜKLEYİCİ ---------------------------------------------
// Three.js (589 KB), OrbitControls (25 KB) ve html2pdf (884 KB) ilk açılışta
// gerekmiyor: birincisi yalnız 3D simülasyon açılınca, ikincisi yalnız kullanıcı
// "PDF indir" deyince lazım. Bunları <script> etiketiyle en baştan yüklemek her
// ziyaretçiye ~1,5 MB fatura çıkarıyordu. Artık ihtiyaç anında geliyorlar.
//
// Aynı URL iki kez istenirse tek bir Promise paylaşılır; başarısız yükleme
// önbellekten silinir ki kullanıcı tekrar denediğinde yeniden istensin.
const _epcScriptCache = new Map();
window.epcLoadScript = function (url) {
    if (_epcScriptCache.has(url)) return _epcScriptCache.get(url);
    const p = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.async = false;             // birden çok betik sırayla çalışsın
        s.onload = () => resolve();
        s.onerror = () => { _epcScriptCache.delete(url); s.remove(); reject(new Error(url + ' yüklenemedi')); };
        document.head.appendChild(s);
    });
    _epcScriptCache.set(url, p);
    return p;
};

// Three.js + OrbitControls (OrbitControls global THREE'ye bağlı, sırayla gelmeli)
window.epcLoadThree = function () {
    if (window.THREE && window.THREE.OrbitControls) return Promise.resolve();
    return window.epcLoadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js')
        .then(() => window.epcLoadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'));
};

// html2pdf (tek dosyalık bundle)
window.epcLoadPdf = function () {
    if (typeof window.html2pdf !== 'undefined') return Promise.resolve();
    return window.epcLoadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
};

// --- PANEL PAKETİ ------------------------------------------------------------
// Aşağıdaki 13 dosya YALNIZCA giriş yapmış kullanıcının panelinde çalışıyor:
// CRM, teklif motoru, admin, tedarikçi/yatırımcı panelleri, mesajlaşma… Toplamı
// ~370 KB ve ziyaretçilerin hiçbiri kullanmıyordu. Artık rol tespitinden hemen
// sonra (auth.js → routeByInfo) tek seferde yükleniyor.
//
// SIRA ÖNEMLİ: liste, dosyaların index.html'deki eski yükleme sırasını birebir
// koruyor. Aralarındaki bağımlılıklar buna dayanıyor — sırayı değiştirmeyin,
// yeni bir panel dosyasını da doğru yere ekleyin.
//
// NOT: services.js, admin.js'teki openStorageImage'ı kullanıyor. Bu yüzden
// admin.js paketten ayrı yüklenemez; ayırmak isterseniz önce o fonksiyonu
// paylaşılan bir dosyaya taşıyın.
const EPC_PANEL_SCRIPTS = [
    'crm.js', 'admin.js', 'sales.js', 'projects.js', 'maintenance.js',
    'services.js', 'quote.js', 'dashboard.js', 'suppliers.js', 'messaging.js',
    'investor.js', 'documents.js', 'campaigns.js'
];
let _epcPanelPromise = null;
window.epcPanelReady = false;
window.epcLoadPanel = function () {
    if (_epcPanelPromise) return _epcPanelPromise;
    _epcPanelPromise = (async () => {
        for (const dosya of EPC_PANEL_SCRIPTS) await window.epcLoadScript('/' + dosya);
        window.epcPanelReady = true;
    })().catch(err => {
        _epcPanelPromise = null;           // tekrar denenebilsin
        throw err;
    });
    return _epcPanelPromise;
};


// --- ABONELİK FİYATLARI — TEK KAYNAK ----------------------------------------
// Fiyat dört ayrı yerde elle yazılıydı ve hepsi 299 $ diyordu; rol sayfaları
// ise 400/200/600 diyordu. Artık hepsi buradan okuyor, tek yerden değişiyor.
//
// DİKKAT: /kurulumcu, /danisman ve /tedarikci statik sayfaları core.js
// yüklemiyor; oradaki fiyatlar HTML'de sabit. Burayı değiştirirseniz o üç
// sayfayı ve schema.org Offer bloklarını da elle güncelleyin.
const EPC_PRICING = {
    firma:      { usd: 400, ad: 'Kurulumcu Firma' },
    consultant: { usd: 200, ad: 'Danışman' },
    supplier:   { usd: 600, ad: 'Tedarikçi' }
};
window.EPC_PRICING = EPC_PRICING;

// Rol anahtarı. Argüman verilirse o kullanılır — routeByInfo, currentConsultant/
// currentSupplier globallerini atamadan ÖNCE yenileme ekranını çağırdığı için
// oradan info.type geçmek şart. Argümansız çağrıda oturum globallerine bakılır.
window.epcRoleKey = function (rol) {
    if (rol) return (rol === 'installer' || rol === 'admin') ? 'firma' : rol;
    if (window.currentSupplier)   return 'supplier';
    if (window.currentConsultant) return 'consultant';
    return 'firma';
};
window.epcPrice = function (rol) {
    return EPC_PRICING[window.epcRoleKey(rol)] || EPC_PRICING.firma;
};
// "400$" gibi tek parça metin isteyen yerler için
window.epcPriceLabel = function (rol) { return '$' + window.epcPrice(rol).usd; };

// --- ŞEHİR VE GERİ ÖDEME — İKİ ARACIN ORTAK TEMELİ ---------------------------
// Fatura Analizi ile Amortisman Hesaplayıcı aynı girdiye farklı cevap
// veriyordu (11,2 yıl / 6,1 yıl): biri düz bölme yapıyor, diğeri zam ve
// yıpranmayı modelliyordu. İkisi de artık epcPayback'i çağırıyor.

// Şehir listesi sim3d.js'teki CITIES ile aynı.
// verimKey: app_settings'te o şehrin ölçülmüş verimi (kWh/kWp/yıl).
//
// ⚠️ ÖNEMLİ: Buraya şehir başına verim SAYISI GÖMÜLMEDİ. Açık hava
// geometrisiyle hesaplanınca şehirler arası fark yalnız %1,5 çıkıyor; gerçek
// ~%25'lik fark bulutluluktan geliyor ve enlemden türetilemiyor. Uydurma sayı
// yerine yapı kuruldu: admin panelinden GEPA/PVGIS'ten okunan gerçek değer
// girilene kadar her şehir ulusal ortalamaya (solarYield) düşer.
const EPC_CITIES = [
    { ad: 'Antalya',  key: 'antalya'  }, { ad: 'Adana',    key: 'adana'    },
    { ad: 'İzmir',    key: 'izmir'    }, { ad: 'Konya',    key: 'konya'    },
    { ad: 'Ankara',   key: 'ankara'   }, { ad: 'İstanbul', key: 'istanbul' },
    { ad: 'Erzurum',  key: 'erzurum'  }, { ad: 'Trabzon',  key: 'trabzon'  },
    { ad: 'Edirne',   key: 'edirne'   }
];
window.EPC_CITIES = EPC_CITIES;

// Şehrin yıllık özgül üretimi. Ayar yoksa ulusal ortalama.
window.epcCityYield = function (sehirKey) {
    const s = window.EPC_SETTINGS || {};
    const ulusal = Number(s.solarYield) > 0 ? Number(s.solarYield) : 1500;
    if (!sehirKey) return { verim: ulusal, kaynak: 'ulusal' };
    const v = Number(s['solarYield_' + sehirKey]);
    return v > 0 ? { verim: v, kaynak: 'sehir' } : { verim: ulusal, kaynak: 'ulusal' };
};

// Zam ve panel yıpranmasını modelleyen geri ödeme. amortization.js'teki
// 25 yıllık birikimli nakit akışının aynısı; kesirli yıl döndürür.
// Geri dönmüyorsa null.
window.epcPayback = function (o) {
    const yatirim  = Number(o.yatirim) || 0;
    const uretim   = Number(o.yillikUretim) || 0;   // kWh/yıl (1. yıl)
    const fiyat    = Number(o.birimFiyat) || 0;     // ₺/kWh (1. yıl)
    const zam      = o.zamOrani   != null ? Number(o.zamOrani)   : window.epcEnflasyon();
    const yipranma = o.yipranma   != null ? Number(o.yipranma)   : window.epcYipranma();
    const yilSayisi = Number(o.yil) || 25;
    if (yatirim <= 0 || uretim <= 0 || fiyat <= 0) return { yil: null, satirlar: [], birikim: 0 };

    let birikim = 0, onceki = 0, sonuc = null;
    const satirlar = [];
    for (let i = 1; i <= yilSayisi; i++) {
        const u = uretim * Math.pow(1 - yipranma, i - 1);
        const f = fiyat  * Math.pow(1 + zam, i - 1);
        const tasarruf = u * f;
        onceki = birikim; birikim += tasarruf;
        if (sonuc === null && birikim >= yatirim) {
            const kesir = tasarruf > 0 ? (yatirim - onceki) / tasarruf : 0;
            sonuc = (i - 1) + Math.min(Math.max(kesir, 0), 1);
        }
        satirlar.push({ yil: i, uretim: u, birimFiyat: f, tasarruf, birikim });
    }
    return { yil: sonuc, satirlar, birikim, ilkYilTasarruf: satirlar[0] ? satirlar[0].tasarruf : 0 };
};

// Zam ve yıpranma varsayılanları da ayarlardan gelsin ki iki araç aynı
// varsayımı kullansın (amortization.js'in form varsayılanları: %25 / %0,7).
window.epcEnflasyon = function () {
    const v = Number((window.EPC_SETTINGS || {}).tariffInflationPct);
    return (v > 0 ? v : 25) / 100;
};
window.epcYipranma = function () {
    const v = Number((window.EPC_SETTINGS || {}).panelDegradationPct);
    return (v > 0 ? v : 0.7) / 100;
};
