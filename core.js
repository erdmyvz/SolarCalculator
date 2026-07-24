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