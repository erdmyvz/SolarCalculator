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
    } else if ((hash === '#app' || (hash in EPC_PANEL_ROTALARI)) && app) {
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
        } else if (hash === '#app') {
            closeAllAndShowMenu(); // firma/admin → yönetim menüsü (Dashboard)
        }
        // ⚠️ Adres bir MODÜLÜ işaret ediyorsa closeAllAndShowMenu ÇAĞRILMAZ:
        // o fonksiyon menüye dönerken adresi #app'e çekiyor, yani istenen
        // modül açılmadan adres geri yazılıyor ve sayfa menüde kalıyordu.

        // Adres bir panel modülünü işaret ediyorsa onu aç. Menü kartına
        // tıklanarak gelindiyse modül zaten açıldı; bayrak ikinci açılışı
        // engelliyor (aksi hâlde liste iki kez yüklenirdi).
        if (hash in EPC_PANEL_ROTALARI) {
            const _btn = EPC_PANEL_ROTALARI[hash];
            if (_btn === null) {
                // Menü düğmesi olmayan ekranlar (profil, danışan takibi).
                // ⚠️ Bunlar HER ZAMAN yeniden açılır: yukarıdaki rol dalı
                // showConsultantPanel'i çağırıp panel menüsünü çiziyor ve
                // alt ekranın üstünü kapatıyordu. "Zaten açıldı" kısayolu
                // burada kullanılamaz.
                window.__epcPanelHash = null;
                if (hash === '#profilim' && typeof window.openProfileModal === 'function') {
                    await window.openProfileModal(true);
                } else if (hash === '#danisan-takip' && typeof window.consultantOpenCRM === 'function') {
                    window.consultantOpenCRM(true);
                }
            }
            else if (window.__epcPanelHash === hash) { window.__epcPanelHash = null; }
            else { await epcPanelRotasiniAc(hash); }
        }
    }
}

window.addEventListener('hashchange', handleSPA_Routing);

/* ----------------------------------------------------------------------------
   PANEL MODÜLLERİNİN ADRESLERİ
   Panel içinde gezinirken adres hep #app kalıyordu. Sonuçları:
     · Sayfayı yenileyince açık modül kapanıp ana menüye düşülüyordu.
     · Tarayıcının GERİ tuşu modülden çıkmıyor, paneli tümden terk ediyordu.
     · "Şu ekrana bak" diye bir bağlantı paylaşmak mümkün değildi.
   Ziyaretçi modüllerinde (EPC_MODULE_HASHES) bu zaten çözülmüştü; panel
   tarafı dışarıda kalmıştı. Aynı yaklaşım buraya da getiriliyor: her modülün
   kendi adresi var, adres ile ekran birbirini takip ediyor.

   Modüller kendi dosyalarında zaten bir menü düğmesine bağlı; burada o
   düğmeyi yeniden kullanıyoruz — açılış mantığı tek yerde kalsın diye.
   ---------------------------------------------------------------------------- */
const EPC_PANEL_ROTALARI = {
    '#profilim':        null,          // profile.js kendi açıyor (menü düğmesi yok)
    '#danisan-takip':   null,          // danışman paneli — consultants.js açıyor
    '#crm':             'btnGoCRM',
    '#teklifler':       'btnGoQuotes',
    '#panom':           'btnGoDashboard',
    '#danisman-kanali': 'btnGoMessages',
    '#tesislerim':      'btnGoProjects',
    '#servisler':       'btnGoServices',
    '#tedarikciler':    'btnGoSuppliers'
};
const EPC_ROTA_BUTONLARI = Object.fromEntries(
    Object.entries(EPC_PANEL_ROTALARI).map(([h, b]) => [b, h]));

// Menü kartına tıklandığında adresi de güncelle. Düğmenin kendi dinleyicisi
// modülü zaten açıyor; burada yalnız adres yazılıyor ve hashchange'in aynı
// modülü ikinci kez açmasını engelleyen bayrak konuyor.
document.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest && e.target.closest('button[id^="btnGo"]');
    if (!btn) return;
    const h = EPC_ROTA_BUTONLARI[btn.id];
    if (!h || window.location.hash === h) return;
    window.__epcPanelHash = h;
    window.location.hash = h;
});

// Panel modülünü adresten aç. Menü düğmesi henüz DOM'da değilse (panel paketi
// yeni indi) kısa bir süre bekler; sonsuza kadar denemez.
async function epcPanelRotasiniAc(hash) {
    const btnId = EPC_PANEL_ROTALARI[hash];
    if (!btnId) return false;
    for (let i = 0; i < 20; i++) {
        const btn = document.getElementById(btnId);
        if (btn) { btn.click(); return true; }
        await new Promise(r => setTimeout(r, 100));
    }
    return false;
}

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
    regulationsModule:  'renderMevzuat',
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


/* ----------------------------------------------------------------------------
   MODÜLLERİ GİZLE
   Eskiden iki ayrı yerde elle yazılmış modül id listesi vardı ve ikisi de
   gerçekle uyuşmuyordu: batteryModule, quoteModule, servicesModule,
   projectsModule ve dashboardModule hiçbirinde yoktu — yani yeni bir modül
   açıldığında bunlar GİZLENMİYOR, yeni modülün altında açık kalıyordu.
   (Listede olmayan techSupportModule ise artık DOM'da bile yok.)
   Liste elle tutuldukça her yeni modülde aynı hata tekrarlanacaktı; artık
   DOM'un kendisi kaynak: #appContainer'ın DOĞRUDAN çocuğu olan ve id'si
   "Module" ile biten her kutu bir modüldür. İç içe olanlar (resultsModule
   hesaplayıcının içinde) doğrudan çocuk olmadığı için kapsam dışı kalır.
   ---------------------------------------------------------------------------- */
function epcTumModulleriGizle() {
    const kap = document.getElementById('appContainer');
    if (!kap) return;
    Array.prototype.forEach.call(kap.children, function (el) {
        if (el.id && /Module$/.test(el.id)) el.classList.add('hidden');
    });
}
window.epcTumModulleriGizle = epcTumModulleriGizle;

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

    // Başka bir panel açık kalmasın diye önce TÜM modülleri gizle
    // (admin paneli + ziyaretçi sayfası üst üste binmesin)
    epcTumModulleriGizle();

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
    epcTumModulleriGizle();
    
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
        // Adres de menüye dönmeli; yoksa yenilemede kapalı bir modüle geri düşülür.
        // Yönlendirici bu fonksiyonu yalnız #app için çağırır, o yüzden buraya
        // gelen "modül adresi" mutlaka kullanıcının menüye dönüşüdür.
        if (window.location.hash && window.location.hash !== '#app'
            && (window.location.hash in EPC_PANEL_ROTALARI)) {
            window.__epcPanelHash = '#app';
            window.location.hash = '#app';
        }
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
