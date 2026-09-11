/* ============================================================================
   2. Sayfa Yönlendiricisi ve Güvenlik (SPA) + ana menü
   Bölünmüş modül dosyası. index.html'de core.js'ten sonra, ORİJİNAL SIRAYLA
   yüklenmelidir. Klasik script olduğu için tüm fonksiyonlar küresel kalır.
   ============================================================================ */

// ============================================================================
// 2. SAYFA YÖNLENDİRİCİSİ VE GÜVENLİK (SINGLE PAGE APPLICATION - SPA)
// ============================================================================
async function handleSPA_Routing() {
    const hash = window.location.hash || '#home';
    const gateway = document.getElementById('gatewayContainer'); // YENİ: 3 rol seçim ekranı
    const landing = document.getElementById('landingContainer');  // = yatırımcı funnel'ı
    const auth = document.getElementById('authContainer');
    const app = document.getElementById('appContainer');
    
    // Önce her yeri gizle
    if(gateway) gateway.classList.add('hidden');
    if(landing) landing.classList.add('hidden');
    if(auth) auth.classList.add('hidden');
    if(app) app.classList.add('hidden');
    
    // Hash'e göre ilgili alanı aç
    if ((hash === '#home' || hash === '') && gateway) {
        // AÇILIŞ: 3 rol butonu
        gateway.classList.remove('hidden');
        if (typeof renderGateway === 'function') renderGateway();
    } else if (hash === '#yatirimci' && landing) {
        // 1. buton → Yatırımcı funnel'ı (mevcut vitrin)
        landing.classList.remove('hidden');
    } else if (hash === '#kurulumcu' || hash === '#danisman' || hash === '#tedarikci') {
        // Rol funnel'ları statik, taranabilir sayfalara taşındı. Eski bağlantılar
        // (paylaşılmış linkler, yer imleri) yeni adrese kalıcı olarak yönlendirilir.
        window.location.replace(hash === '#kurulumcu' ? '/kurulumcu'
                              : hash === '#danisman'  ? '/danisman' : '/tedarikci');
        return;
    } else if ((hash === '#yatirimciauth' || hash === '#kurulumcuauth' || hash === '#danismanauth' || hash === '#tedarikciauth') && auth) {
        // ROLE ÖZEL giriş/kayıt ekranı — yalnız ilgili rol gösterilir, seçici gizli
        auth.classList.remove('hidden');
        const _role = hash === '#kurulumcuauth' ? 'firma'
                    : hash === '#danismanauth'  ? 'consultant'
                    : hash === '#tedarikciauth' ? 'supplier'
                    : 'investor';
        if (typeof openAuthForRole === 'function') openAuthForRole(_role);
    } else if (hash === '#auth' && auth) {
        // Genel giriş ekranı (yedek) — rol seçici görünür
        auth.classList.remove('hidden');
        if (typeof authUnlockRole === 'function') authUnlockRole();
    } else if (typeof legalOpenByHash === 'function' && legalOpenByHash(hash)) {
        // yasal metin sayfaları: #kvkk #gizlilik #cerez #kullanim-sartlari #abonelik-sozlesmesi #acik-riza
    } else if (EPC_HASH_MODULES[hash]) {
        // Ziyaretçi modülleri artık kendi adreslerinde. Hem doğrudan paylaşılan
        // bağlantı hem tarayıcı GERİ/İLERİ tuşu buradan geçiyor.
        const _mod = EPC_HASH_MODULES[hash];
        if (typeof openPublicModule === 'function') openPublicModule(_mod, true);
        const _init = EPC_MODULE_INIT[_mod];
        if (_init && typeof window[_init] === 'function') window[_init]();
    } else if (hash === '#app' && app) {
        // Eğer uygulama (panel) kısmına girmek istiyorsa, oturum (session) kontrolü yap
        if(supabaseClient) {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
                window.location.hash = '#auth'; // Oturum yoksa zorla giriş sayfasına at
                return;
            }
        }
        // Panel dosyaları normalde routeByInfo'da iniyor; ama bu dala oradan
        // geçmeden de gelinebilir (elle #app yazmak, önceki yüklemenin hata
        // vermesi). Aşağıdaki showSupplierPanel/showConsultantPanel/
        // showInvestorPanel çağrıları o pakete bağlı, o yüzden burada da
        // garantiye alıyoruz. Zaten yüklüyse anında dönüyor.
        try { await window.epcLoadPanel(); }
        catch (e) {
            alert('Panel dosyaları yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
            return;
        }
        app.classList.remove('hidden');
        if (window.currentSupplier && typeof showSupplierPanel === 'function') {
            showSupplierPanel(window.currentSupplier, window.__supplierEmail);
        } else if (window.currentConsultant && typeof showConsultantPanel === 'function') {
            showConsultantPanel(window.currentConsultant, window.__consultantEmail);
        } else if (!window.currentUserProfile && !window.currentSupplier && typeof showInvestorPanel === 'function') {
            // Yatırımcı: firma profili yok ve danışman değil → YATIRIMCI paneli (kurulumcu menüsü DEĞİL)
            showInvestorPanel();
        } else {
            closeAllAndShowMenu(); // firma/admin → yönetim menüsü (Dashboard)
        }
    }
}

window.addEventListener('hashchange', handleSPA_Routing);

/* ----------------------------------------------------------------------------
   Yol adı → uygulama görünümü eşlemesi
   /fatura-analizi, /hakkimda, /kvkk gibi adresler footer ve noscript'te
   bağlantı olarak veriliyor; vercel.json bunları index.html'e yönlendiriyor.
   Ziyaretçi (veya tarayıcı botu) bu adresi doğrudan açtığında rol seçim ekranı
   yerine vaat edilen içeriği görmeli. Bu tablo o eşlemeyi kurar.
   ---------------------------------------------------------------------------- */
// Ziyaretçi modüllerinin kendi adresleri. Eskiden openPublicModule hash'e
// hiç dokunmuyordu: kullanıcı #yatirimci'deyken bir araca girince adres
// #yatirimci kalıyor, tarayıcı geçmişine kayıt düşmüyordu. Sonuç: GERİ tuşu
// vitrine değil, bir önceki hash'e (#home) atıyordu.
// Adlar EPC_PATH_VIEWS'taki yollarla aynı tutuldu.
const EPC_MODULE_HASHES = {
    billAnalyzerModule: '#fatura-analizi',
    calculatorModule:   '#hesaplayici',
    simulationModule:   '#simulasyon',
    evCalcModule:       '#elektrikli-arac',
    amortizationModule: '#amortisman',
    educationModule:    '#akademi',
    regulationsModule:  '#kurulum-sureci',
    hardwareModule:     '#donanim',
    consultantsModule:  '#danismanlar',
    supplierDirModule:  '#tedarikci-rehberi',
    aboutModule:        '#hakkimda'
};
// Ters harita: hash → modül
const EPC_HASH_MODULES = Object.fromEntries(
    Object.entries(EPC_MODULE_HASHES).map(([m, h]) => [h, m]));
// Modül açılırken çalışması gereken hazırlık fonksiyonu (varsa)
const EPC_MODULE_INIT = {
    billAnalyzerModule: 'openBillAnalyzer',
    consultantsModule:  'renderConsultantsList',
    aboutModule:        'renderAbout',
    hardwareModule:     'openHardwareCompare',
    evCalcModule:       'calculateEVSolar'
};

const EPC_PATH_VIEWS = {
    '/fatura-analizi':      { module: 'billAnalyzerModule', init: 'openBillAnalyzer' },
    '/hesaplayici':         { module: 'calculatorModule' },
    '/akademi':             { module: 'educationModule' },
    '/kurulum-sureci':      { module: 'regulationsModule' },
    '/danismanlar':         { module: 'consultantsModule', init: 'renderConsultantsList' },
    '/hakkimda':            { hash: '#hakkimda' },
    '/kvkk':                { hash: '#kvkk' },
    '/gizlilik':            { hash: '#gizlilik' },
    '/cerez':               { hash: '#cerez' },
    '/kullanim-sartlari':   { hash: '#kullanim-sartlari' },
    '/abonelik-sozlesmesi': { hash: '#abonelik-sozlesmesi' },
    '/acik-riza':           { hash: '#acik-riza' }
};

// Adresteki yol bir görünüme karşılık geliyorsa onu açar. Hash zaten varsa
// kullanıcının niyeti önceliklidir; dokunulmaz. Açıldıysa true döner.
function applyPathView() {
    if (window.location.hash) return false;
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const view = EPC_PATH_VIEWS[path];
    if (!view) return false;

    if (view.hash) { window.location.hash = view.hash; return true; }
    if (typeof openPublicModule === 'function') {
        openPublicModule(view.module, true);   // temiz yol korunsun, hash eklenmesin
        if (view.init && typeof window[view.init] === 'function') window[view.init]();
        return true;
    }
    return false;
}

window.addEventListener('load', async () => {
    if(supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            let _r = 'installer';
            if (typeof routeAfterLogin === 'function') { _r = await routeAfterLogin(session.user); }
            else { await fetchUserProfile(session.user.id, session.user.email); }
            const _authHashes = ['#auth', '#yatirimciauth', '#kurulumcuauth', '#danismanauth', '#tedarikciauth', ''];
            if (_r !== 'expired' && _r !== 'banned' && _r !== 'panel-yuklenemedi' && _authHashes.includes(window.location.hash)) {
                window.location.hash = '#app'; // Zaten giriş yapmışsa direkt panele al
            }
        }
    }
    // Yol adı bir görünüme işaret ediyorsa onu aç; değilse normal hash yönlendirmesi.
    if (!applyPathView()) handleSPA_Routing();
});


// _adresGuncelleme: router kendi çağırdığında true geçer; o zaman hash'e
// dokunulmaz (zaten hash yüzünden buradayız, yoksa sonsuz döngü olur).
window.openPublicModule = function(moduleId, _adrestenGeldi) {
    window.openedFromPublic = true; // YENİ: Kullanıcının vitrinden (ziyaretçi olarak) girdiğini hafızaya aldık

    // Modülün kendi adresi varsa geçmişe kaydet ki GERİ tuşu vitrine dönsün.
    const _h = EPC_MODULE_HASHES[moduleId];
    if (_h && !_adrestenGeldi && window.location.hash !== _h) {
        window.__epcModulAcikHash = _h;   // hashchange bunu görünce yeniden açmaz
        window.location.hash = _h;
    }

    // Başka bir panel açık kalmasın diye önce TÜM modülleri gizle (admin paneli + ziyaretçi sayfası üst üste binmesin)
    ['supplierDirModule','crmModule','adminModule','calculatorModule','simulationModule','evCalcModule','companyManagementModule','techSupportModule','salesAssistantModule','educationModule','regulationsModule','amortizationModule','hardwareModule','consultantsModule','consultantPanelModule','supplierPanelModule','aboutModule','legalModule','messagesModule','investorModule','campaignsModule','billAnalyzerModule'].forEach(id => { const el = document.getElementById(id); if(el) el.classList.add('hidden'); });

    document.getElementById('landingContainer').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    document.getElementById('mainMenu').classList.add('hidden');
    
    const header = document.querySelector('#appContainer > div.w-full.max-w-7xl.mx-auto');
    if(header) header.classList.add('hidden');

    const publicBtns = ['btnBackFromCalc', 'btnBackFromSim', 'btnBackFromEV', 'btnBackFromEdu'];
    publicBtns.forEach(id => {
        const btn = document.getElementById(id);
        if(btn) btn.textContent = "← Ziyaretçi Sayfasına Dön";
    });

    document.getElementById(moduleId).classList.remove('hidden');
    
    if(moduleId === 'simulationModule' && !window.isApp3DInitialized && typeof initApp3DScene === 'function') {
        initApp3DScene(); 
        window.isApp3DInitialized = true;
    }
}


window.closeAllAndShowMenu = function() {
    const mods = ['supplierDirModule','crmModule', 'adminModule', 'calculatorModule', 'simulationModule', 'evCalcModule', 'companyManagementModule', 'techSupportModule', 'salesAssistantModule', 'educationModule', 'regulationsModule', 'amortizationModule', 'hardwareModule', 'consultantsModule', 'consultantPanelModule','supplierPanelModule', 'quoteModule', 'aboutModule', 'legalModule', 'messagesModule', 'investorModule', 'campaignsModule', 'billAnalyzerModule'];
    mods.forEach(id => { const el = document.getElementById(id); if(el) el.classList.add('hidden'); });
    
    const header = document.querySelector('#appContainer > div.w-full.max-w-7xl.mx-auto');
    
    if (window.openedFromPublic) {
        // DURUM 1: Ziyaretçi vitrininden girdiyse vitrine dönsün.
        // Doğrudan DOM'u göstermek yerine adresi değiştiriyoruz; böylece
        // sayfa içi "geri dön" ile tarayıcının GERİ tuşu aynı yere gidiyor
        // ve adres çubuğu gerçekten görünen ekranı yansıtıyor.
        window.openedFromPublic = false;
        if (window.location.hash !== '#yatirimci') { window.location.hash = '#yatirimci'; return; }
        document.getElementById('appContainer').classList.add('hidden');
        document.getElementById('landingContainer').classList.remove('hidden');
    } else {
        // DURUM 2: Eğer yönetim panelinden girdiyse, geri dönünce YÖNETİM PANELİNE gitsin.
        document.getElementById('mainMenu').classList.remove('hidden');
        if(header) header.classList.remove('hidden');
        
        // Kurumsal girişte butonları tekrar Yönetim Paneli yazısına çevir
        const adminBtns = ['btnBackFromCalc', 'btnBackFromSim', 'btnBackFromEV', 'btnBackFromEdu'];
        adminBtns.forEach(id => {
            const btn = document.getElementById(id);
            if(btn) btn.textContent = "← Yönetim Paneline Dön";
        });
    }
}
