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
// Aşağıdaki 14 dosya YALNIZCA giriş yapmış kullanıcının panelinde çalışıyor:
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
    'panel.js', 'crm.js', 'admin.js', 'sales.js', 'projects.js', 'maintenance.js',
    'services.js', 'quote.js', 'dashboard.js', 'suppliers.js', 'messaging.js',
    'investor.js', 'documents.js', 'campaigns.js', 'evrak.js', 'stok.js',
    'erisim.js', 'uye-yonetimi.js'
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


// --- ZİYARETÇİ MODÜLLERİ: İLK BOYAMADAN SONRA --------------------------------
// ⚠️ NEDEN: reklam trafiğinin neredeyse tamamı mobil olacak ve bu dosyaların
// hepsi ilk boyamayı bekletiyordu. 3D simülasyonu hiç açmayacak kişiye de
// 93 KB iniyordu. Panel paketi zaten böyle çalışıyor; aynı yöntem ziyaretçi
// tarafına da uygulandı.
//
// ⚠️ NEDEN "MODÜL BAŞINA" DEĞİL DE TEK PAKET: modül kimliğini dosyaya
// eşlemek elle kurulan ve kolayca yanlış kurulan bir harita gerektiriyordu;
// yanlış eşleşen tek bir satır, reklam yayındayken bir özelliği SESSİZCE
// kırardı. Tek paket + openPublicModule'ün beklemesi aynı ilk boyama
// kazancını veriyor, o riski taşımadan.
//
// ⚠️ sim3d.js BU LİSTEDE YOK: en büyük dosya (93 KB) ve en az açılan modül.
// Yalnız simülasyon açıldığında iniyor (router.js).
const EPC_ZIYARETCI_SCRIPTS = [
    'calculators.js', 'battery.js', 'education.js', 'process.js', 'mevzuat.js',
    'amortization.js', 'hardware.js', 'consultants.js', 'supplier_directory.js',
    'about.js', 'legal.js', 'bill_analyzer.js'
];
let _epcZiyaretciPromise = null;
window.epcZiyaretciHazir = false;
window.epcLoadZiyaretci = function () {
    if (_epcZiyaretciPromise) return _epcZiyaretciPromise;
    _epcZiyaretciPromise = (async () => {
        for (const d of EPC_ZIYARETCI_SCRIPTS) await window.epcLoadScript('/' + d);
        window.epcZiyaretciHazir = true;
    })().catch(err => { _epcZiyaretciPromise = null; throw err; });
    return _epcZiyaretciPromise;
};

// --- VEKİL FONKSİYONLAR ------------------------------------------------------
// ⚠️ Bu dört ad, satır içi onclick'lerden DOĞRUDAN çağrılıyor (altbilgideki
// yasal bağlantılar, hakkımızda, tedarikçi dizini) — openPublicModule'den
// geçmiyorlar. Betikleri tembelleştirince paket inmeden önceki tıklama
// hiçbir şey yapmazdı: hata da vermeyen, sessiz bir kırılma.
//
// Vekil, paketi yükleyip gerçek fonksiyona devrediyor. Gerçek dosya yüklenince
// window üzerindeki adı kendisi eziyor; vekil referansıyla karşılaştırma
// sonsuz döngüyü engelliyor (dosya o adı tanımlamazsa çağrı sessizce düşer,
// kendini tekrar çağırmaz).
(function () {
    const vekilKur = (ad) => {
        if (typeof window[ad] === 'function') return;
        const vekil = function () {
            const args = arguments;
            window.epcLoadZiyaretci().then(() => {
                const f = window[ad];
                if (typeof f === 'function' && f !== vekil) f.apply(null, args);
            }).catch(() => { /* tıklama yeniden denenebilir */ });
        };
        window[ad] = vekil;
    };
    ['openAboutPage', 'openLegalPage', 'openLegalTab', 'showSupplierDirectory'].forEach(vekilKur);
})();

// İlk boyama biter bitmez arka planda indirmeye başla: kullanıcı bir modüle
// tıkladığında çoğu zaman paket çoktan hazır olur, beklemez.
(function () {
    const basla = () => window.epcLoadZiyaretci().catch(() => { /* tıklamada yeniden denenir */ });
    if (document.readyState === 'complete') setTimeout(basla, 1);
    else window.addEventListener('load', () => setTimeout(basla, 1));
})();

// --- GÜVENLİ DIŞ BAĞLANTI ----------------------------------------------------
// Kullanıcı/tedarikçi tarafından girilen adresler doğrudan href'e basılıyordu.
// Kaçış yapmak yetmez: "javascript:..." şeması kaçıştan geçer ama tıklanınca
// kod çalıştırır. Yalnız http(s) geçiyor, gerisi boş dönüyor (bağlantı hiç
// basılmıyor). crm.js ve mevzuat.js'te ayrı kopyaları vardı, tek yere alındı.
window.epcGuvenliUrl = function (u) {
    try {
        const x = new URL(String(u == null ? '' : u).trim());
        return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : '';
    } catch (e) { return ''; }
};

// --- ÖZNİTELİK İÇİNE GÜVENLİ JS DİZGİSİ --------------------------------------
// ⚠️ admEscape() BU İŞ İÇİN YETMEZ.
// admEscape tek tırnağı &#39; yapıyor; ama tarayıcı bir onclick özniteliğini
// ÖNCE HTML olarak çözüyor, SONRA JS olarak ayrıştırıyor. Yani &#39; yeniden
// ' oluyor ve dizgiyi kapatıyor:
//     onclick="f('&#39;);alert(1);//')"   →   f('');alert(1);//')
// Müşteri adı gibi kullanıcı metinleri bu yolla kod çalıştırabiliyordu.
// Burada önce JS kaçışı, sonra HTML kaçışı yapılıyor — sıra önemli.
//
// EN İYİSİ: veriyi hiç onclick'e gömmemek; data-* özniteliği + olay devri
// kullanmak. Bu yardımcı, gömmenin kaçınılmaz olduğu yerler için.
window.epcAttrJs = function (deger) {
    return String(deger == null ? '' : deger)
        .replace(/\\/g, '\\\\')       // önce ters bölü
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, '\\n')
        .replace(/&/g, '&amp;')          // sonra HTML
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};

// --- YIL/AY METNİ ------------------------------------------------------------
// Geri ödeme süresi  Math.floor(y) + ' yıl ' + Math.round((y%1)*12) + ' ay'
// diye yazılıyordu. Ay kısmı yukarı yuvarlanınca 12 çıkabiliyor:
// 9,98 yıl → "9 yıl 12 ay". Müşteriye giden teklif PDF'inde böyle bir ifade
// hem yanlış hem de hesabın gözden geçirilmediği izlenimi veriyor.
// Burada 12 ay bir yıla taşınıyor ve "0 ay" hiç yazılmıyor.
window.epcSureMetni = function (yil) {
    const y = Number(yil);
    if (!isFinite(y) || y < 0) return '—';
    let tamYil = Math.floor(y);
    let ay = Math.round((y - tamYil) * 12);
    if (ay >= 12) { tamYil += 1; ay = 0; }       // taşıma
    if (tamYil === 0) return ay + ' ay';
    return ay === 0 ? tamYil + ' yıl' : tamYil + ' yıl ' + ay + ' ay';
};

// --- KISA BİLDİRİM (TOAST) ---------------------------------------------------
// Başarılı işlemler için alert() kullanılıyordu: kullanıcıyı durduruyor,
// tıklama bekliyor ve "kaydedildi" demek için ekranı kilitliyordu. Bu yardımcı
// aynı bilgiyi yol kesmeden veriyor. Yıkıcı işlemlerin confirm()'i DURUYOR —
// onlar bilerek yol kesmeli.
window.epcBildir = function (mesaj, tur) {
    let kutu = document.getElementById('epcToastKutu');
    if (!kutu) {
        kutu = document.createElement('div');
        kutu.id = 'epcToastKutu';
        kutu.setAttribute('role', 'status');       // ekran okuyucu duyursun
        kutu.setAttribute('aria-live', 'polite');
        kutu.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:120;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none';
        document.body.appendChild(kutu);
    }
    const renk = tur === 'hata' ? '#b91c1c' : (tur === 'uyari' ? '#b45309' : '#0f172a');
    const t = document.createElement('div');
    t.textContent = String(mesaj);
    t.style.cssText = `background:${renk};color:#fff;font-size:.875rem;font-weight:700;padding:10px 18px;border-radius:999px;box-shadow:0 10px 30px -10px rgba(15,23,42,.6);opacity:0;transition:opacity .18s ease,transform .18s ease;transform:translateY(6px);max-width:90vw;text-align:center`;
    kutu.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
    setTimeout(() => {
        t.style.opacity = '0'; t.style.transform = 'translateY(6px)';
        setTimeout(() => t.remove(), 220);
    }, tur === 'hata' ? 5000 : 2600);
};

// --- ABONELİK FİYATLARI — TEK KAYNAK ----------------------------------------
// Fiyat dört ayrı yerde elle yazılıydı ve hepsi 299 $ diyordu; rol sayfaları
// ise 400/200/600 diyordu. Artık hepsi buradan okuyor, tek yerden değişiyor.
//
// DİKKAT: /kurulumcu, /danisman ve /tedarikci statik sayfaları core.js
// yüklemiyor; oradaki fiyatlar HTML'de sabit. Burayı değiştirirseniz o üç
// sayfayı ve schema.org Offer bloklarını da elle güncelleyin.
// --- ÖLÇÜM (Vercel Web Analytics) -------------------------------------------
// ⚠️ Ölçüm yüklenmemişse (reklam engelleyici, ağ hatası, Vercel'de Analytics
// kapalı) sessizce hiçbir şey yapmaz. Ölçüm kodu yüzünden akış kırılamaz —
// bu projede en pahalı hatalar hep "yan iş ana işi düşürdü" biçiminde çıktı.
//
// va() kuyruğu index.html'de betikten ÖNCE tanımlanıyor, bu yüzden betik
// henüz yüklenmemişken gönderilen olaylar da kaybolmuyor.
//
// ⚠️ OLAY ADI VE ÖZELLİKLERİNE KİŞİSEL VERİ YAZILMAZ. Ad, telefon, e-posta,
// adres, takip kodu — hiçbiri. Ölçüm "kaç kişi" sorusunu yanıtlar, "kim"
// sorusunu değil; ikisini karıştırmak KVKK tarafında gereksiz yük doğurur.
// Kim sorusunun cevabı zaten veritabanında, rızasıyla duruyor.
// --- KAMPANYA KAYNAĞI (UTM) -------------------------------------------------
// ⚠️ NEDEN GEREKTİ: Vercel sayfa görüntülemesinde adres çubuğundaki UTM
// parametreleri duruyor, ama DÖNÜŞÜM OLAYI ayrı bir olay ve sorgu dizesini
// taşımıyor. Üstelik kullanıcı ilk sayfadan sonra gezindiğinde UTM adresten
// düşüyor. Bu hâliyle "Instagram'dan trafik geldi" görülür ama "HANGİ VİDEO
// kayıt getirdi" görülemez — oysa 12 videoyu karşılaştırmanın tek yolu bu.
//
// Çözüm: ilk girişte UTM'i oturum deposuna al, sonraki her olaya iliştir.
// Meta Pixel yerine UTM seçildiği için ölçümün omurgası burası.
//
// ⚠️ sessionStorage bilerek: sekme kapanınca silinir. Kalıcı depoda tutmak
// kullanıcıyı ziyaretler arası izlemek olurdu; çerezsiz kalma sözümüz
// (Çerez Politikası'nda yazılı) bunu dışlıyor.
const EPC_UTM_ANAHTAR = 'epcUtm';

window.epcUtmYakala = function () {
    try {
        const q = new URLSearchParams(window.location.search);
        const al = {};
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(k => {
            const v = q.get(k);
            if (v) al[k.replace('utm_', '')] = String(v).slice(0, 40);
        });
        if (Object.keys(al).length) {
            sessionStorage.setItem(EPC_UTM_ANAHTAR, JSON.stringify(al));
        }
    } catch (e) { /* depo kapalıysa ölçüm kaynaksız devam eder */ }
};

window.epcUtmOku = function () {
    try {
        const h = sessionStorage.getItem(EPC_UTM_ANAHTAR);
        return h ? JSON.parse(h) : {};
    } catch (e) { return {}; }
};

window.epcOlay = function (ad, ozellikler) {
    try {
        if (typeof window.va !== 'function') return;
        const veri = Object.assign({}, window.epcUtmOku(), ozellikler || {});
        window.va('event', Object.keys(veri).length ? { name: ad, data: veri } : { name: ad });
    } catch (e) { /* ölçüm hatası kullanıcıya yansımaz */ }
};

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
// --- YAYIN ÖNCESİ ÜCRETSİZ DÖNEM --------------------------------------------
// Tek doğru kaynak sunucudaki public.ucretsiz_donem(). Burada yalnız
// ÖNBELLEKLENİYOR; kural iki yerde ayrı yorumlanırsa bir gün ayrışır.
//
// ⚠️ Sunucuya ulaşılamazsa varsayılan "ücretsiz DEĞİL" olmalı, çünkü yanlış
// tarafa düşmenin bedeli asimetrik: ücretsizken fiyat göstermek yalnız
// utandırır, ücretli dönemde "ücretsiz" demek tutulamayan bir söz olur.
window.__ucretsizDonem = { aktif: false, bitis: null, yuklendi: false };

window.epcUcretsizDonemYukle = async function () {
    if (!window.supabaseClient) return window.__ucretsizDonem;
    try {
        const { data, error } = await supabaseClient.rpc('ucretsiz_donem');
        if (error) throw error;
        const r = Array.isArray(data) ? data[0] : data;
        if (r) window.__ucretsizDonem = { aktif: !!r.aktif, bitis: r.bitis, yuklendi: true };
    } catch (e) { /* sessiz: varsayılan "ücretli" kalır */ }
    return window.__ucretsizDonem;
};

window.epcUcretsizMi = function () { return !!(window.__ucretsizDonem && window.__ucretsizDonem.aktif); };

// UTM'i mümkün olan en erken anda yakala: kullanıcı gezinmeye başlamadan.
window.epcUtmYakala();

// Açılışta bir kez oku: rozet, fiyat penceresi ve abonelik ekranı senkron
// çalıştıkları için değeri beklemek yerine hazır bulmaları gerekiyor.
(function () {
    let deneme = 0;
    const go = () => {
        if (window.supabaseClient) { window.epcUcretsizDonemYukle(); return; }
        if (++deneme < 30) setTimeout(go, 200);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(go, 200));
    else setTimeout(go, 200);
})();

window.epcUcretsizBitisMetni = function () {
    const b = window.__ucretsizDonem && window.__ucretsizDonem.bitis;
    if (!b) return '';
    try { return new Date(b).toLocaleDateString('tr-TR'); } catch (e) { return String(b); }
};

// Fiyat etiketi: ücretsiz dönemde rakam göstermek yanlış olur — ekranda
// yazan şey ile tahsil edilen şey aynı olmalı.
window.epcPriceLabel = function (rol) {
    if (window.epcUcretsizMi()) return 'Ücretsiz';
    return '$' + window.epcPrice(rol).usd;
};

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
// --- İL BAZLI ÖZGÜL ÜRETİM — TEK KAYNAK -------------------------------------
// KAYNAK: PVGIS v5.2 — Avrupa Komisyonu Ortak Araştırma Merkezi (JRC).
//   · Radyasyon  : PVGIS-SARAH2 uydu verisi, 2005–2020 ortalaması
//   · Meteoroloji: ERA5 · Ufuk gölgelemesi: sayısal yükseklik modelinden
//   · Sistem     : kristal silisyum, optimal eğim ve azimut, %14 sistem kaybı
//   · Konum      : ilin OpenStreetMap sınır merkezi
//   Sorgu: re.jrc.ec.europa.eu/api/v5_2/PVcalc?peakpower=1&loss=14&optimalangles=1
//   Çekim tarihi: 13.09.2026
//
// ⚠️ ÖNCEKİ DEĞERLER UYDURMAYDI. Bu tablo quote.js içinde kaynaksız sabit
// sayılarla duruyordu ve SİSTEMATİK OLARAK YÜKSEKTİ — 81 ilin ortalamasında
// %7 fazla, en uçta Trabzon'de %32. Teklif verilen müşteriye olmayan bir
// üretim vaat ediliyordu.
//
// SIRALAMA: admin ayarı (app_settings.solarYield_<il>) > bu tablo > ulusal
// ortalama. Yönetici bir il için yerinde ölçüm/PVsyst değeri girerse o kazanır.
//
// NOT: Bunlar OPTİMAL eğimli, gölgesiz bir sistemin değerleridir. Gerçek çatı
// yönü, eğimi ve gölgelenme üretimi düşürür; arayüz bu değeri "bölgesel tahmin"
// olarak etiketler ve kesin bilgi gibi göstermez.
const EPC_IL_VERIM = {
    'Adana':1523, 'Adıyaman':1569, 'Afyonkarahisar':1480, 'Aksaray':1563,
    'Amasya':1219, 'Ankara':1485, 'Antalya':1618, 'Ardahan':1241,
    'Artvin':1011, 'Aydın':1541, 'Ağrı':1239, 'Balıkesir':1427,
    'Bartın':1285, 'Batman':1452, 'Bayburt':1370, 'Bilecik':1374,
    'Bingöl':1446, 'Bitlis':1388, 'Bolu':1343, 'Burdur':1591,
    'Bursa':1392, 'Denizli':1538, 'Diyarbakır':1493, 'Düzce':1254,
    'Edirne':1401, 'Elazığ':1483, 'Erzincan':1374, 'Erzurum':1274,
    'Eskişehir':1473, 'Gaziantep':1572, 'Giresun':1064, 'Gümüşhane':1382,
    'Hakkari':1428, 'Hatay':1528, 'Isparta':1550, 'Iğdır':1312,
    'İstanbul':1354, 'İzmir':1595, 'Kahramanmaraş':1511, 'Karabük':1327,
    'Karaman':1579, 'Kars':1284, 'Kastamonu':1307, 'Kayseri':1380,
    'Kilis':1574, 'Kocaeli':1246, 'Konya':1572, 'Kütahya':1424,
    'Kırklareli':1380, 'Kırıkkale':1457, 'Kırşehir':1483, 'Malatya':1515,
    'Manisa':1556, 'Mardin':1547, 'Mersin':1595, 'Muğla':1568,
    'Muş':1383, 'Nevşehir':1511, 'Niğde':1579, 'Ordu':1086,
    'Osmaniye':1486, 'Rize':971, 'Sakarya':1259, 'Samsun':1247,
    'Siirt':1486, 'Sinop':1311, 'Sivas':1385, 'Tekirdağ':1373,
    'Tokat':1367, 'Trabzon':889, 'Tunceli':1389, 'Uşak':1580,
    'Van':1421, 'Yalova':1323, 'Yozgat':1474, 'Zonguldak':1242,
    'Çanakkale':1381, 'Çankırı':1410, 'Çorum':1376, 'Şanlıurfa':1579,
    'Şırnak':1444
};
window.EPC_IL_VERIM = EPC_IL_VERIM;

// İl adını ayar anahtarına çevirir. Türkçe küçültme şart: 'İstanbul' →
// toLowerCase() ile 'i̇stanbul' (noktalı i) olur, ayar anahtarı tutmaz.
window.epcIlAnahtar = function (ilAdi) {
    return String(ilAdi || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, '');
};

// Bir ilin özgül üretimi + değerin NEREDEN geldiği.
// kaynak: 'ayar'   → yönetici girdi (yerinde ölçüm / PVsyst), en güvenilir
//         'pvgis'  → yukarıdaki tablo (JRC PVGIS, optimal eğim, gölgesiz)
//         'ulusal' → il tanınmadı, ortalamaya düşüldü
window.epcIlVerim = function (ilAdi) {
    const s = window.EPC_SETTINGS || {};
    const anahtar = window.epcIlAnahtar(ilAdi);
    const ayar = Number(s['solarYield_' + anahtar]);
    if (ayar > 0) return { verim: ayar, kaynak: 'ayar' };
    const pv = Number(EPC_IL_VERIM[ilAdi]);
    if (pv > 0) return { verim: pv, kaynak: 'pvgis' };
    const ulusal = Number(s.solarYield) > 0 ? Number(s.solarYield) : 1500;
    return { verim: ulusal, kaynak: 'ulusal' };
};

const EPC_CITIES = [
    { ad: 'Antalya',  key: 'antalya'  }, { ad: 'Adana',    key: 'adana'    },
    { ad: 'İzmir',    key: 'izmir'    }, { ad: 'Konya',    key: 'konya'    },
    { ad: 'Ankara',   key: 'ankara'   }, { ad: 'İstanbul', key: 'istanbul' },
    { ad: 'Erzurum',  key: 'erzurum'  }, { ad: 'Trabzon',  key: 'trabzon'  },
    { ad: 'Edirne',   key: 'edirne'   }
];
window.EPC_CITIES = EPC_CITIES;

// Şehrin yıllık özgül üretimi — EPC_CITIES anahtarıyla (örn. 'istanbul').
// epcIlVerim ile AYNI kaynağa bakar: eskiden hesaplayıcı ayar yoksa doğrudan
// ulusal ortalamaya düşüyor, teklif motoru ise kendi tablosunu kullanıyordu;
// aynı şehir için iki farklı sayı çıkıyordu.
window.epcCityYield = function (sehirKey) {
    const s = window.EPC_SETTINGS || {};
    if (!sehirKey) {
        const ulusal = Number(s.solarYield) > 0 ? Number(s.solarYield) : 1500;
        return { verim: ulusal, kaynak: 'ulusal' };
    }
    const il = (window.EPC_CITIES || []).find(c => c.key === sehirKey);
    return window.epcIlVerim(il ? il.ad : sehirKey);
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

// kWp başına kurulum bedeli (TL) — ÜÇ hesaplayıcının ortak kaynağı.
// Eskiden Tüketim Hesaplayıcı ve Amortisman 'pricePerKwp' (30.000 TL/kWp),
// Fatura Analizi ise usdPerKwp × usdTry (1.000 × 42 = 42.000) okuyordu. Aynı ev
// için biri ₺76.800 diğeri ₺115.500 diyordu. Kur bazlı olan doğru kabul edildi:
// ekipman fiyatları dövize endeksli, sabit TL değer hızla bayatlıyor.
window.epcTlPerKwp = function () {
    const s = window.EPC_SETTINGS || {};
    const usd = Number(s.usdPerKwp) > 0 ? Number(s.usdPerKwp) : 1000;
    return usd * window.epcKur();
};

// --- TARİFE VE KUR: tek yedek tablo ---------------------------------------
// Ayarlar (app_settings) asıl kaynaktır; burası yalnız ayarlara HIÇ ulaşılamadığında
// devreye girer. Eskiden her dosya kendi yedeğini taşıyordu (2,5 · 3,5 · 4,0 · 2,2 ·
// 42) ve bunlar ayarlarla çelişiyordu: ayar okunamayan bir oturumda mesken 5,32
// yerine 2,50'den hesaplanıyor, müşteriye iki kat büyük sistem öneriliyordu.
// settings.js varsayılanlarını bu tablodan kurar — sayılar tek yerde durur.
// KAYNAK: EPDK 4 Nisan 2026 AG tek terim tarifesi (enerji + dağıtım + fon + BTV + KDV).
window.EPC_TARIFE_YEDEK = {
    tariffMesken:         5.32,   // 8 kWh/gün üstü
    tariffMeskenDusuk:    3.54,   // 8 kWh/gün ve altı
    tariffTicarethane:    6.63,   // 30 kWh/gün ve altı
    tariffTicarethaneUst: 7.37,   // 30 kWh/gün üstü
    tariffSanayi:         5.85,
    tariffTarimsal:       5.30,
    tariff:               5.32    // eski yedek anahtar
};
window.EPC_KUR_YEDEK = 48.43;     // TCMB 11.09.2026

// Tarife (TL/kWh): önce ayar, sonra yedek tablo. Anahtar verilmezse mesken.
window.epcTarife = function (anahtar) {
    const a = anahtar || 'tariffMesken';
    const s = window.EPC_SETTINGS || {};
    const v = Number(s[a]);
    if (v > 0) return v;
    const y = Number(window.EPC_TARIFE_YEDEK[a]);
    return y > 0 ? y : window.EPC_TARIFE_YEDEK.tariffMesken;
};

// USD/TRY: önce ayar, sonra yedek.
window.epcKur = function () {
    const v = Number((window.EPC_SETTINGS || {}).usdTry);
    return v > 0 ? v : window.EPC_KUR_YEDEK;
};

// PDF dışa aktarımı için temayı geçici olarak kaldırır.
// html2canvas, sayfanın EKRANDAKİ görünümünü yakalar: koyu tema açıkken
// rapor beyaz tuvale açık renk metinle basılıyor, PDF boş görünüyordu.
// (Fatura analizi raporu klonlanıp gövdeye eklendiği için etkilenmiyor;
// hesaplayıcı raporu ise canlı düğümden üretiliyor.) Dışa aktarma bitince
// sınıflar geri konur — hata olsa bile, finally ile.
window.epcTemasiz = async function (isle) {
    const kutular = Array.prototype.slice.call(
        document.querySelectorAll('.modul-koyu, .tema-koyu'));
    const eski = kutular.map(function (e) { return e.className; });
    kutular.forEach(function (e) { e.classList.remove('modul-koyu', 'tema-koyu'); });
    try { return await isle(); }
    finally { kutular.forEach(function (e, i) { e.className = eski[i]; }); }
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
