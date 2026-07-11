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
    const landing = document.getElementById('landingContainer');
    const auth = document.getElementById('authContainer');
    const app = document.getElementById('appContainer');
    
    // Önce her yeri gizle
    if(landing) landing.classList.add('hidden');
    if(auth) auth.classList.add('hidden');
    if(app) app.classList.add('hidden');
    
    // Hash'e göre ilgili alanı aç
    if (hash === '#home' && landing) {
        landing.classList.remove('hidden');
    } else if (hash === '#auth' && auth) {
        auth.classList.remove('hidden');
    } else if (hash === '#app' && app) {
        // Eğer uygulama (panel) kısmına girmek istiyorsa, oturum (session) kontrolü yap
        if(supabaseClient) {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
                window.location.hash = '#auth'; // Oturum yoksa zorla giriş sayfasına at
                return;
            }
        }
        app.classList.remove('hidden');
        if (window.currentConsultant && typeof showConsultantPanel === 'function') {
            showConsultantPanel(window.currentConsultant, window.__consultantEmail);
        } else {
            closeAllAndShowMenu(); // Panele girildiğinde önce ana menüyü (Dashboard) göster
        }
    }
}

window.addEventListener('hashchange', handleSPA_Routing);

window.addEventListener('load', async () => {
    if(supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            window.currentConsultant = null;
            let role = null;
            try {
                const { data: prof } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
                if (prof) role = prof.role;
            } catch (e) { /* profiles okunamadı */ }
            if (role !== 'admin') {
                try {
                    const { data: cons } = await supabaseClient.from('consultants').select('*').eq('id', session.user.id).maybeSingle();
                    if (cons) { window.currentConsultant = cons; window.__consultantEmail = session.user.email; }
                } catch (e) { /* consultants tablosu yoksa sessiz gec */ }
            }
            if (!window.currentConsultant) { await fetchUserProfile(session.user.id, session.user.email); }
            if (window.location.hash === '#auth' || window.location.hash === '') {
                window.location.hash = '#app'; // Zaten giriş yapmışsa direkt panele al
            }
        }
    }
    handleSPA_Routing();
});


window.openPublicModule = function(moduleId) {
    window.openedFromPublic = true; // YENİ: Kullanıcının vitrinden (ziyaretçi olarak) girdiğini hafızaya aldık

    // Başka bir panel açık kalmasın diye önce TÜM modülleri gizle (admin paneli + ziyaretçi sayfası üst üste binmesin)
    ['crmModule','adminModule','calculatorModule','simulationModule','evCalcModule','companyManagementModule','techSupportModule','salesAssistantModule','educationModule','regulationsModule','amortizationModule','hardwareModule','consultantsModule','consultantPanelModule'].forEach(id => { const el = document.getElementById(id); if(el) el.classList.add('hidden'); });

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
    const mods = ['crmModule', 'adminModule', 'calculatorModule', 'simulationModule', 'evCalcModule', 'companyManagementModule', 'techSupportModule', 'salesAssistantModule', 'educationModule', 'regulationsModule', 'amortizationModule', 'hardwareModule', 'consultantsModule', 'consultantPanelModule'];
    mods.forEach(id => { const el = document.getElementById(id); if(el) el.classList.add('hidden'); });
    
    const header = document.querySelector('#appContainer > div.w-full.max-w-7xl.mx-auto');
    
    if (window.openedFromPublic) {
        // DURUM 1: Eğer ziyaretçi vitrininden girdiyse, geri dönünce tekrar VİTRİNE gitsin.
        document.getElementById('appContainer').classList.add('hidden');
        document.getElementById('landingContainer').classList.remove('hidden');
        window.openedFromPublic = false; // İşlem bitince hafızayı sıfırla
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