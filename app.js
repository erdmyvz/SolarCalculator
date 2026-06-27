/* ============================================================================
   SOLAR EPC YÖNETİM MERKEZİ - NİHAİ JAVASCRIPT MOTORU (SaaS)
   Yazan / Geliştiren: ERDEM YAVUZ
   Açıklama: Bu dosya, tüm uygulamanın iş mantığını, veritabanı bağlantılarını,
   hesaplama motorlarını ve kullanıcı etkileşimlerini yönetir.
   ============================================================================ */

// ============================================================================
// 1. VERİTABANI VE KÜRESEL DEĞİŞKENLER
// ============================================================================
// Supabase (Backend as a Service) bağlantı anahtarları (Frontend için güvenli anon_key)
const SUPABASE_URL = 'https://bxcghdbrafzudiigeeud.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_EiDGhm4bT-acQ8xrV9RU4w_4wkUQGys';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let currentUserProfile = null; // Sisteme giriş yapan firmanın bilgilerini tutar
let crmLeads = []; // CRM Müşteri Listesi İçin Küresel Hafıza (Veritabanı Simülasyonu)
window.isApp3DInitialized = false; // 3D Motorunun gereksiz yere birden fazla kez yüklenmesini engeller

// Sektörel Durum Etiketleri Eşleşme Sözlüğü
const crmStatusLabels = {
    'yeni_basvuru': { text: '1. Yeni Başvuru', css: 'bg-blue-100 text-blue-800' },
    'arandi_gorusuldu': { text: '2. İletişimde', css: 'bg-amber-100 text-amber-800' },
    'teklif_gonderildi': { text: '3. Teklif İletildi', css: 'bg-indigo-100 text-indigo-800' },
    'sozlesme_imzalandi': { text: '4. Sözleşme İmzalandı', css: 'bg-purple-100 text-purple-800' },
    'kurulum_basladi': { text: '5. Kurulum Süreci', css: 'bg-orange-100 text-orange-800' },
    'resmi_surec': { text: '6. TEDAŞ Kabulünde', css: 'bg-cyan-100 text-cyan-800' },
    'tamamlandi': { text: '7. Devreye Alındı 🚀', css: 'bg-emerald-100 text-emerald-800' }
};

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
        closeAllAndShowMenu(); // Panele girildiğinde önce ana menüyü (Dashboard) göster
    }
}

window.addEventListener('hashchange', handleSPA_Routing);

window.addEventListener('load', async () => {
    if(supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            await fetchUserProfile(session.user.id, session.user.email);
            if (window.location.hash === '#auth' || window.location.hash === '') {
                window.location.hash = '#app'; // Zaten giriş yapmışsa direkt panele al
            }
        }
    }
    handleSPA_Routing();
});

// Ziyaretçilerin landing page'den public hesaplayıcılara erişmesini sağlar
window.openPublicModule = function(moduleId) {
    document.getElementById('landingContainer').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    document.getElementById('mainMenu').classList.add('hidden');
    
    // YENİ: Ziyaretçi ekranındayken üstteki logolu/profilli barı tamamen gizle
    const header = document.querySelector('#appContainer > div.w-full.max-w-7xl.mx-auto');
    if(header) header.classList.add('hidden');

    // YENİ: Ziyaretçi girdiği için buton metinlerini dinamik olarak "Ana Sayfa" yap
    const btnTexts = {
        'calculatorModule': 'btnBackToMenu',
        'simulationModule': 'btnBackToMenuFromSim',
        'evCalcModule': 'btnBackToMenuFromEV'
    };
    const btnId = btnTexts[moduleId];
    if(btnId && document.getElementById(btnId)) {
        document.getElementById(btnId).textContent = "← Ana Sayfaya Dön";
    }

    document.getElementById(moduleId).classList.remove('hidden');
    
    if(moduleId === 'simulationModule' && !window.isApp3DInitialized && typeof initApp3DScene === 'function') {
        initApp3DScene(); 
        window.isApp3DInitialized = true;
    }
}

// Uygulama içindeki tüm modülleri kapatıp ana paneli veya ana sayfayı gösterir
window.closeAllAndShowMenu = function() {
    const mods = ['crmModule', 'adminModule', 'calculatorModule', 'simulationModule', 'evCalcModule', 'companyManagementModule', 'techSupportModule', 'salesAssistantModule', 'sectoralModule', 'educationModule', 'regulationsModule'];
    mods.forEach(id => { const el = document.getElementById(id); if(el) el.classList.add('hidden'); });
    
    const header = document.querySelector('#appContainer > div.w-full.max-w-7xl.mx-auto');
    
    // Sadece giriş yapmış yetkili kullanıcılar Main Menu'yü görebilir.
    if(currentUserProfile || !supabaseClient) {
        document.getElementById('mainMenu').classList.remove('hidden');
        // YENİ: Kurumsal paneldeyken üstteki barı geri getir
        if(header) header.classList.remove('hidden');
        
        // YENİ: Buton metinlerini kurumlar için tekrar "Yönetim Paneli"ne çevir
        if(document.getElementById('btnBackToMenu')) document.getElementById('btnBackToMenu').textContent = "← Yönetim Paneli";
        if(document.getElementById('btnBackToMenuFromSim')) document.getElementById('btnBackToMenuFromSim').textContent = "← Yönetim Paneli";
        if(document.getElementById('btnBackToMenuFromEV')) document.getElementById('btnBackToMenuFromEV').textContent = "← Yönetim Paneli";
        
    } else {
        // YENİ: Giriş yapmamış biriyse onu direkt Landing Page'e geri ışınla!
        window.location.hash = '#home';
    }
}

// ============================================================================
// 3. KURUMSAL AUTHENTICATION (KAYIT, GİRİŞ VE PROFİL YÖNETİMİ)
// ============================================================================
document.getElementById('tabLogin')?.addEventListener('click', () => {
    document.getElementById('loginForm').classList.remove('hidden'); 
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('tabLogin').classList.add('text-emerald-600', 'border-b-2', 'border-emerald-600'); 
    document.getElementById('tabLogin').classList.remove('text-gray-400');
    document.getElementById('tabRegister').classList.add('text-gray-400'); 
    document.getElementById('tabRegister').classList.remove('text-emerald-600', 'border-b-2', 'border-emerald-600');
});

document.getElementById('tabRegister')?.addEventListener('click', () => {
    document.getElementById('registerForm').classList.remove('hidden'); 
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('tabRegister').classList.add('text-emerald-600', 'border-b-2', 'border-emerald-600'); 
    document.getElementById('tabRegister').classList.remove('text-gray-400');
    document.getElementById('tabLogin').classList.add('text-gray-400'); 
    document.getElementById('tabLogin').classList.remove('text-emerald-600', 'border-b-2', 'border-emerald-600');
});

// YENİ FİRMA KAYIT İŞLEMİ
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const company = document.getElementById('regCompany').value;
    
    // Bireysel yatırımcıların girmesini engellemek için firma adı kontrolü
    if(!company || company.trim().length < 3) {
        alert("Geçerli bir EPC/Kurulum Firması ünvanı girmek zorunludur. Bireysel kayıt yasaktır."); return;
    }
    
    const btn = document.getElementById('btnRegisterSubmit'); btn.textContent = "Kaydediliyor..."; btn.disabled = true;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    
    if(supabaseClient) {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) { alert("Kayıt Hatası: " + error.message); } 
        else if (data.user) {
            // ERDEM YAVUZ kontrolü: Sadece kurucu admin olabilir. Diğerleri 'company' olur.
            const role = (email === 'erdem.yvz@hotmail.com' || document.getElementById('regName').value.toUpperCase() === 'ERDEM') ? 'admin' : 'company';
            await supabaseClient.from('profiles').insert([{ 
                id: data.user.id, 
                first_name: document.getElementById('regName').value, 
                last_name: document.getElementById('regSurname').value, 
                company_name: company, 
                phone: document.getElementById('regPhone').value, 
                role: role 
            }]);
            alert("Firma Kaydı Başarılı! Sisteme giriş yapabilirsiniz."); 
            document.getElementById('registerForm').reset(); document.getElementById('tabLogin').click();
        }
    } else {
        alert("Supabase veritabanı aktif değil, form simüle edildi.");
    }
    btn.textContent = "Firmayı Sisteme Kaydet"; btn.disabled = false;
});

// SİSTEME GİRİŞ İŞLEMİ
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnLoginSubmit'); btn.textContent = "Bağlanıyor..."; btn.disabled = true;
    
    if(supabaseClient) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: document.getElementById('loginEmail').value, password: document.getElementById('loginPassword').value,
        });
        if (error) { alert("Giriş Başarısız: E-posta veya şifre hatalı."); } 
        else if (data.user) {
            await fetchUserProfile(data.user.id, data.user.email);
            window.location.hash = '#app'; document.getElementById('loginForm').reset();
        }
    }
    btn.textContent = "Yönetim Paneline Gir"; btn.disabled = false;
});

async function fetchUserProfile(userId, displayEmail) {
    if(!supabaseClient) return;
    const { data } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    if (data) {
        currentUserProfile = data;
        document.getElementById('userNameDisplay').textContent = `${data.first_name} ${data.last_name}`;
        document.getElementById('userCompanyDisplay').textContent = data.company_name;
        if(document.getElementById('userEmailDisplay')) document.getElementById('userEmailDisplay').textContent = displayEmail;
        document.getElementById('userInitials').textContent = data.first_name.charAt(0).toUpperCase();

        const adminCard = document.getElementById('adminPanelCard');
        if(adminCard) adminCard.classList.toggle('hidden', data.role !== 'admin');
        
        if(document.getElementById('iframeCompanyId')) {
            document.getElementById('iframeCompanyId').textContent = data.id;
        }
    }
}

document.getElementById('btnProfile')?.addEventListener('click', () => document.getElementById('profileDropdown').classList.toggle('hidden'));
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    if(supabaseClient) await supabaseClient.auth.signOut(); 
    currentUserProfile = null;
    document.getElementById('profileDropdown').classList.add('hidden'); window.location.hash = '#home';
});

// ============================================================================
// 4. MÜŞTERİ YAKALAMA (LEAD GENERATION) VE TAKİP MODÜLÜ (ZİYARETÇİ EKRANI)
// ============================================================================
window.openLeadModal = function(type) {
    document.getElementById('leadType').value = type;
    document.getElementById('leadModalTitle').innerText = type === 'kurulum' ? 'Ücretsiz Çatı Keşfi Başvurusu' : 'Teknik Servis Müdahale Başvurusu';
    const extraFields = document.getElementById('kurulumExtraFields');
    type === 'kurulum' ? extraFields?.classList.remove('hidden') : extraFields?.classList.add('hidden');
    document.getElementById('leadModal')?.classList.remove('hidden');
};

window.closeLeadModal = function() { 
    document.getElementById('leadModal')?.classList.add('hidden'); 
    document.getElementById('leadPublicForm')?.reset();
};

document.getElementById('leadPublicForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('leadType').value;
    const randomCode = "EPC-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toLocaleString('tr-TR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

    let combinedDetails = document.getElementById('leadDetails').value;
    let outage = "Bilinmiyor", evHp = "Yok";

    if (type === 'kurulum') {
        outage = document.getElementById('leadOutage').value;
        evHp = document.getElementById('leadExtraConsumption').value || 'Yok';
        combinedDetails = `[Şebeke Kesintisi: ${outage}] | [Gelecekte İlave Yük: ${evHp}]\n\nMüşteri Notu: ${combinedDetails}`;
    }

    if(supabaseClient) {
        const leadData = {
            user_id: "00000000-0000-0000-0000-000000000000",
            full_name: document.getElementById('leadName').value,
            phone: document.getElementById('leadPhone').value,
            email: document.getElementById('leadEmail').value,
            address: document.getElementById('leadAddress').value,
            inverter_model: type === 'kurulum' ? 'Yeni Kurulum' : 'Servis Talebi',
            problem_desc: combinedDetails,
            installer_name: randomCode, 
            status: 'yeni_basvuru'
        };
        await supabaseClient.from('support_tickets').insert([leadData]);
    }

    const newLead = {
        id: randomCode, date: dateStr, name: document.getElementById('leadName').value,
        phone: document.getElementById('leadPhone').value, email: document.getElementById('leadEmail').value,
        address: document.getElementById('leadAddress').value, status: "yeni_basvuru", bill: "", consumptions: "",
        heatPump: evHp.toLowerCase().includes('ısı') ? 'Planlıyor' : 'Yok', heatPumpPower: "",
        ev: (evHp.toLowerCase().includes('araç') || evHp.toLowerCase().includes('ev')) ? 'Yakında' : 'Yok',
        blackout: outage === 'Evet' ? 'Sık' : 'Seyrek', storageIntent: outage === 'Evet' ? 'Evet' : 'Hayır',
        backupDetails: "", notes: combinedDetails, type: type
    };
    crmLeads.push(newLead);
    
    if(typeof crmCalculateStats === 'function') { crmCalculateStats(); crmRenderLeads(); }

    alert(`🎉 Başvurunuz Başarıyla İletildi!\n\nLütfen Proje Takip ID Kodunuzu Not Edin: ${randomCode}\nBu kod ile anasayfadan sürecinizi şeffafça izleyebilirsiniz.`);
    closeLeadModal();
    
    document.getElementById('leadTrackInput').value = randomCode;
    document.getElementById('btnTrackQuery').click();
});

document.getElementById('btnTrackQuery')?.addEventListener('click', async () => {
    const code = document.getElementById('leadTrackInput').value.trim();
    const display = document.getElementById('trackResultDisplay');
    if(!code) return;

    display.className = "mt-4 p-4 rounded-xl text-sm font-bold bg-white text-slate-800 border border-slate-200";
    display.innerHTML = "Sistemde aranıyor...";

    const localLead = crmLeads.find(l => l.id === code);
    
    if (localLead) {
        const statusObj = crmStatusLabels[localLead.status] || { text: "İşlem Bekliyor" };
        display.innerHTML = `
            <div class="flex flex-col space-y-2">
                <div class="flex justify-between border-b pb-2">
                    <span class="text-slate-500">Sayın ${localLead.name.split(' ')[0]}</span>
                    <span class="text-xs text-slate-400">${localLead.date}</span>
                </div>
                <div class="flex items-center gap-2 mt-2">
                    <span class="bg-emerald-100 text-emerald-800 px-3 py-1 rounded border border-emerald-200 text-xs uppercase tracking-wider">Durum:</span>
                    <span class="font-black text-slate-700">${statusObj.text}</span>
                </div>
                <p class="text-xs text-slate-500 mt-2 italic">Müşteri temsilcimiz dosyanız üzerinde çalışıyor, size en kısa sürede ulaşılacaktır.</p>
            </div>
        `;
    } else {
        display.innerHTML = `<span class="text-red-500 font-bold">Kayıt Bulunamadı.</span> Lütfen EPC- ile başlayan takip kodunuzu doğru girdiğinizden emin olun.`;
    }
    display.classList.remove('hidden');
});

// ============================================================================
// ANA MENÜ BUTONLARI VE SAYFA GEÇİŞLERİ YÖNETİMİ
// ============================================================================
const menuMap = {
    'btnGoEducation': 'educationModule',
    'btnGoSectoral': 'sectoralModule',
    'btnGoRegulations': 'regulationsModule',
    'btnGoCRM': 'crmModule',
    'btnGoCompanyMgmt': 'companyManagementModule',
    'btnGoCalculator': 'calculatorModule',
    'btnGoSimulation': 'simulationModule',
    'btnGoEVCalc': 'evCalcModule',
    'btnGoTechSupport': 'techSupportModule',
    'btnGoSalesAssistant': 'salesAssistantModule'
};

for (const [btnId, modId] of Object.entries(menuMap)) {
    const btn = document.getElementById(btnId);
    if(btn) {
        btn.addEventListener('click', () => {
            document.getElementById('mainMenu').classList.add('hidden');
            document.getElementById(modId).classList.remove('hidden');
            
            if(modId === 'simulationModule' && !window.isApp3DInitialized && typeof initApp3DScene === 'function') {
                initApp3DScene(); window.isApp3DInitialized = true;
            }
            if(modId === 'evCalcModule' && typeof calculateEVSolar === 'function') calculateEVSolar();
            if(modId === 'techSupportModule' && currentUserProfile) {
                document.getElementById('tsName').value = `${currentUserProfile.first_name} ${currentUserProfile.last_name}`;
                document.getElementById('tsPhone').value = currentUserProfile.phone;
            }
            if(modId === 'crmModule' && typeof crmCalculateStats === 'function') {
                crmCalculateStats(); crmRenderLeads();
            }
        });
    }
}

const backButtons = ['btnBackToMenu', 'btnBackToMenuFromSim', 'btnBackToMenuFromEV', 'btnBackToMenuFromSupport', 'btnBackToMenuFromSales', 'btnBackToMenuFromAdmin', 'btnBackToMenuFromCRM', 'btnBackToMenuFromCompanyMgmt', 'btnBackToMenuFromReg', 'btnBackToMenuFromSectoral', 'btnBackToMenuFromEdu'];
backButtons.forEach(id => { document.getElementById(id)?.addEventListener('click', closeAllAndShowMenu); });
// ============================================================================
// 5. SATIŞ CRM VE PROJE TAKİP MOTORU (SOLAR PIPELINE ENGINE)
// ============================================================================

/**
 * CRM Modülü ilk açıldığında veya bir veri güncellendiğinde tetiklenen ana fonksiyon.
 * Üst bar istatistiklerini hesaplar ve güncel müşteri listesini tabloya basar.
 */
function initCRMModule() {
    crmCalculateStats();
    crmRenderLeads();
}

/**
 * CRM Paneli üst kısmındaki 4 adet renkli özet kokpit kartının sayılarını hesaplar.
 */
function crmCalculateStats() {
    if(document.getElementById('crmStatNew')) {
        document.getElementById('crmStatNew').textContent = crmLeads.filter(l => l.status === 'yeni_basvuru').length;
    }
    if(document.getElementById('crmStatFollowUp')) {
        document.getElementById('crmStatFollowUp').textContent = crmLeads.filter(l => l.status === 'arandi_gorusuldu' || l.status === 'teklif_gonderildi').length;
    }
    if(document.getElementById('crmStatActive')) {
        document.getElementById('crmStatActive').textContent = crmLeads.filter(l => l.status === 'kurulum_basladi' || l.status === 'sozlesme_imzalandi').length;
    }
    if(document.getElementById('crmStatOfficial')) {
        document.getElementById('crmStatOfficial').textContent = crmLeads.filter(l => l.status === 'resmi_surec').length;
    }
}

/**
 * CRM Müşteri Listesini HTML tablosuna dinamik olarak basar.
 */
function crmRenderLeads() {
    const tableBody = document.getElementById('crmLeadsTableBody');
    const filterValue = document.getElementById('crmFilterStatus')?.value || 'all';
    
    if(!tableBody) return;
    tableBody.innerHTML = '';

    const filteredLeads = crmLeads.filter(lead => filterValue === 'all' || lead.status === filterValue);

    if(filteredLeads.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400 font-medium bg-white">Bu aşamada bekleyen müşteri kaydı bulunmuyor.</td></tr>`;
        return;
    }

    [...filteredLeads].reverse().forEach(lead => {
        const badge = crmStatusLabels[lead.status] || { text: lead.status, css: 'bg-slate-100 text-slate-800' };
        
        let techBadges = [];
        if(lead.ev === 'Var' || lead.ev === 'Yakında') techBadges.push('🚗 EV');
        if(lead.heatPump === 'Var' || lead.heatPump === 'Planlıyor') techBadges.push('🔥 Isı P.');
        if(lead.storageIntent === 'Evet') techBadges.push('🔋 Batarya');
        const techSummary = techBadges.length > 0 ? techBadges.join(' | ') : 'Standart (On-Grid)';

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-100 transition cursor-pointer";
        tr.onclick = (e) => { if(e.target.tagName !== 'BUTTON') crmOpenLeadDetails(lead.id); };

        tr.innerHTML = `
            <td class="p-4 pl-6 font-mono text-slate-400 text-[11px]">${lead.date || '-'}</td>
            <td class="p-4">
                <div class="font-black text-slate-900 text-sm mb-0.5">${lead.name}</div>
                <div class="text-[10px] text-slate-400 font-mono tracking-wider">Takip ID: ${lead.id} | Tel: ${lead.phone || '-'}</div>
            </td>
            <td class="p-4"><span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${badge.css}">${badge.text}</span></td>
            <td class="p-4 text-slate-600 font-bold text-[11px]">${techSummary}</td>
            <td class="p-4 text-right pr-6">
                <button class="bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 font-bold px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition text-xs">Müşteri Kartı</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

/**
 * Müşteri detay modalını açar ve verileri form alanlarına doldurur.
 */
window.crmOpenLeadDetails = function(id) {
    const lead = crmLeads.find(l => l.id == id);
    if(!lead) return;

    document.getElementById('modalLeadId').value = lead.id;
    document.getElementById('modalLeadName').textContent = lead.name;
    document.getElementById('modalLeadDate').textContent = "Başvuru Tarihi: " + (lead.date || '-');
    document.getElementById('modalLeadIdDisplay').textContent = "ID: " + lead.id;
    document.getElementById('modalLeadContact').innerHTML = `📞 <strong>Tel:</strong> ${lead.phone || '-'} &nbsp;|&nbsp; ✉️ <strong>E-posta:</strong> ${lead.email || '-'}<br>📍 <strong>Konum:</strong> ${lead.address || '-'}`;
    
    document.getElementById('modalStatusSelect').value = lead.status;
    document.getElementById('fieldBill').value = lead.bill || '';
    document.getElementById('fieldConsumptions').value = lead.consumptions || '';
    document.getElementById('fieldHeatPump').value = lead.heatPump || 'Yok';
    document.getElementById('fieldHeatPumpPower').value = lead.heatPumpPower || '';
    document.getElementById('fieldEV').value = lead.ev || 'Yok';
    document.getElementById('fieldBlackout').value = lead.blackout || 'Seyrek';
    document.getElementById('fieldStorageIntent').value = lead.storageIntent || 'Hayır';
    document.getElementById('fieldBackupDetails').value = lead.backupDetails || '';
    document.getElementById('fieldNotes').value = lead.notes || '';

    document.getElementById('crmDetailModal').classList.remove('hidden');
};

/**
 * Satış ekibinin manuel olarak sisteme müşteri eklemesi.
 */
window.crmOpenNewLeadModal = function() {
    const name = prompt("Lütfen eklenecek yeni müşterinin adını veya proje başlığını giriniz:");
    if(!name || !name.trim()) return;
    
    const randomCode = "EPC-MANUAL-" + Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toLocaleString('tr-TR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

    const newLead = { 
        id: randomCode, date: dateStr, name: name.trim(), status: "yeni_basvuru", 
        phone: "", email: "", address: "", bill: "", consumptions: "",
        heatPump: "Yok", heatPumpPower: "", ev: "Yok", blackout: "Seyrek", 
        storageIntent: "Hayır", backupDetails: "", notes: "Panelden manuel eklendi.", type: "kurulum" 
    };
    
    crmLeads.push(newLead);
    crmCalculateStats(); crmRenderLeads(); crmOpenLeadDetails(randomCode);
};

/**
 * Yapılan değişiklikleri (durum, notlar vb.) Müşteri kartına kaydeder.
 */
window.crmSaveLeadDetails = function() {
    const id = document.getElementById('modalLeadId').value;
    const leadIndex = crmLeads.findIndex(l => l.id == id);
    if(leadIndex === -1) return;

    crmLeads[leadIndex].status = document.getElementById('modalStatusSelect').value;
    crmLeads[leadIndex].bill = document.getElementById('fieldBill').value;
    crmLeads[leadIndex].consumptions = document.getElementById('fieldConsumptions').value;
    crmLeads[leadIndex].heatPump = document.getElementById('fieldHeatPump').value;
    crmLeads[leadIndex].heatPumpPower = document.getElementById('fieldHeatPumpPower').value;
    crmLeads[leadIndex].ev = document.getElementById('fieldEV').value;
    crmLeads[leadIndex].blackout = document.getElementById('fieldBlackout').value;
    crmLeads[leadIndex].storageIntent = document.getElementById('fieldStorageIntent').value;
    crmLeads[leadIndex].backupDetails = document.getElementById('fieldBackupDetails').value;
    crmLeads[leadIndex].notes = document.getElementById('fieldNotes').value;

    crmCloseModal(); crmCalculateStats(); crmRenderLeads();
};

window.crmCloseModal = function() { document.getElementById('crmDetailModal').classList.add('hidden'); };
window.crmOpenIntegrationModal = function() { document.getElementById('crmIntegrationModal').classList.remove('hidden'); };


// ============================================================================
// 6. YAPAY ZEKA (AI) ENTEGRASYONU VE PROMPT MOTORU
// ============================================================================

function generateAIPrompt(companyData) {
    return `Sen, Michael Gerber'in "E-Myth" prensiplerini ve Donald Miller'ın "StoryBrand" çerçevesini kusursuz bir şekilde benimsemiş, dünya çapında üst düzey bir "Kurumsal Dönüşüm ve İşletme Danışmanı"sın. Amacın, şirketlerin sistem kurmasına, kârlılığını artırmasına ve kurucuya bağımlı olmaktan kurtulmasına yardımcı olmaktır.

Şu an analiz edip reçete yazacağın firmanın temel profili aşağıdadır:
--------------------------------------------------
🏢 FİRMA BİLGİLERİ:
- Firma Adı: ${companyData.name}
- Temel Vaadi (Elevator Pitch): ${companyData.pitch}
- Eşsiz Satış Teklifi (USP): ${companyData.usp || "Belirtilmemiş - (Marka farklılaşma sorunu olabilir)"}
- Müşteride Çözdüğünüz Ana Acı/Sorun: ${companyData.pain || "Belirtilmemiş - (Müşteri empatisi eksik olabilir)"}
--------------------------------------------------

GÖREVİN:
Bu firmanın profiline bakarak, "Marketing", "Satış" ve "Operasyon" başta olmak üzere temel fonksiyonlarda neleri yanlış yapıyor olabileceğini (Teşhis) ve bu sorunları aşmak için hemen yarın sabah uygulamaya koyabilecekleri 3 adımlık acil bir eylem planını (Tedavi) yaz.

KURALLAR:
1. Kurumsal ve ilham verici bir ton kullan, ama asla akademik ve sıkıcı bir jargon kullanma.
2. Tavsiyelerin genel geçer olmasın. Firmanın profiline özel spesifik taktikler ver.
3. Çıktını şık bir HTML formatında, kalın yazılar (<strong>), başlıklar (<h3>), listeler (<ul>) ve emojiler kullanarak ver ki doğrudan web sitesindeki bir <div> içine basabilelim. Markdown kullanma.
4. Çıktının sonuna mutlaka firmanın "Hero (Kahraman)" değil, müşterinin "Guide (Rehberi)" olduğunu hatırlatan vurucu bir motivasyon cümlesi ekle.`;
}

// GEMINI API SUNUCU BAĞLANTISI
document.getElementById('btnRunAI')?.addEventListener('click', async () => {
    const companyData = {
        name: document.getElementById('cmName').value.trim(),
        pitch: document.getElementById('cmPitch').value.trim(),
        usp: document.getElementById('cmUSP').value.trim(),
        pain: document.getElementById('cmPain').value.trim()
    };
    
    if(!companyData.name || !companyData.pitch) {
        alert("Lütfen sağlıklı bir analiz için en azından Firma İsmi ve Temel Vaat alanlarını doldurun."); return;
    }
    
    const btn = document.getElementById('btnRunAI');
    btn.textContent = "Yapay Zeka Analiz Ediyor..."; btn.disabled = true; btn.classList.add('opacity-70', 'cursor-not-allowed');
    
    const resultArea = document.getElementById('cmMarketing');
    if (resultArea) {
        resultArea.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12">
                <div class="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p class="text-emerald-600 font-bold animate-pulse">Gemini firmanızı analiz ediyor, lütfen bekleyin...</p>
            </div>`;
    }

    try {
        const response = await fetch('/api/gemini', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: generateAIPrompt(companyData) })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Sunucu bağlantı hatası.");

        if (resultArea) {
            resultArea.innerHTML = `
                <div class="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                    <h4 class="font-black text-emerald-700 text-lg">✨ YZ Kurumsal Danışman Reçetesi</h4>
                </div>
                <div class="text-sm text-slate-700 space-y-4 pr-2 leading-relaxed">
                    ${data.result}
                </div>`;
        }
    } catch (error) {
        console.error("AI Hatası:", error);
        if (resultArea) resultArea.innerHTML = `<div class="text-red-600 font-bold p-4 bg-red-50 border border-red-200 rounded-lg">⚠️ Hata oluştu: ${error.message}</div>`;
    } finally {
        btn.textContent = "✨ Yapay Zeka Kurumsal Analiz Oluştur";
        btn.classList.remove('opacity-70', 'cursor-not-allowed'); btn.disabled = false;
    }
});


// ============================================================================
// 7. SÜPER ADMİN KONTROL MERKEZİ (Yalnızca ERDEM YAVUZ Yetkilidir)
// ============================================================================
document.getElementById('adminPanelCard')?.addEventListener('click', () => {
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('adminModule').classList.remove('hidden');
    fetchAdminData();
});
document.getElementById('btnBackToMenuFromAdmin')?.addEventListener('click', closeAllAndShowMenu);
document.getElementById('btnRefreshAdmin')?.addEventListener('click', fetchAdminData);

async function fetchAdminData() {
    const usersBody = document.getElementById('usersTableBody');
    const leadsBox = document.getElementById('adminLeadsList');
    const ticketsBox = document.getElementById('adminTicketsList');
    
    // 1. FİRMALARI GETİR
    if(usersBody) {
        usersBody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-xs text-slate-400">Veritabanına bağlanılıyor...</td></tr>';
        if(supabaseClient) {
            const { data } = await supabaseClient.from('profiles').select('*');
            if(data) {
                usersBody.innerHTML = '';
                data.forEach(u => {
                    usersBody.innerHTML += `
                        <tr class="hover:bg-slate-50 text-xs">
                            <td class="p-3 pl-6 font-bold text-slate-800">${u.first_name} ${u.last_name}</td>
                            <td class="p-3 font-black text-emerald-700">${u.company_name}</td>
                            <td class="p-3 font-mono text-slate-500">${u.phone || '-'}</td>
                            <td class="p-3 font-bold text-slate-700">Deneme</td>
                            <td class="p-3"><span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">Aktif</span></td>
                            <td class="p-3"><span class="bg-slate-900 text-white font-mono text-[10px] px-2 py-0.5 rounded">${u.role}</span></td>
                            <td class="p-3"><button class="bg-slate-200 px-2 py-1 rounded text-[10px] font-bold">Düzenle</button></td>
                        </tr>`;
                });
            }
        } else {
            usersBody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-red-500">Veritabanı bağlantısı yok.</td></tr>';
        }
    }
    
    // 2. GENEL HAVUZ BAŞVURULARI
    if(leadsBox) {
        leadsBox.innerHTML = '';
        const organikLeads = crmLeads.filter(l => l.id && !l.id.includes('MANUAL'));
        if(organikLeads.length === 0) {
            leadsBox.innerHTML = '<p class="text-xs text-slate-400 italic">Genel havuzda başvuru bulunmuyor.</p>';
        } else {
            organikLeads.forEach(l => {
                leadsBox.innerHTML += `
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center text-xs">
                        <div>
                            <div class="flex items-center gap-2"><strong class="text-sm text-slate-800">${l.name}</strong> <span class="font-mono text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">${l.id}</span></div>
                            <p class="text-slate-500 mt-1 font-medium">📞 ${l.phone} | ✉️ ${l.email} | 📍 ${l.address}</p>
                            <p class="text-slate-400 mt-2 bg-slate-50 p-2 rounded text-[11px] font-medium border border-slate-100">${l.notes}</p>
                        </div>
                        <span class="bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-bold uppercase text-[9px] tracking-wider">Durum: ${l.status}</span>
                    </div>`;
            });
        }
    }

    // 3. TEKNİK SERVİS BİLETLERİ
    if(ticketsBox) {
        ticketsBox.innerHTML = '<p class="text-xs text-slate-400 italic">Arıza biletleri taranıyor...</p>';
        if(supabaseClient) {
            const { data } = await supabaseClient.from('support_tickets').select('*').neq('user_id', '00000000-0000-0000-0000-000000000000');
            ticketsBox.innerHTML = '';
            if(!data || data.length === 0) {
                ticketsBox.innerHTML = '<p class="text-xs text-slate-400 italic">Sistemde arıza talebi bulunmuyor.</p>'; return;
            }
            data.forEach(t => {
                ticketsBox.innerHTML += `
                    <div class="p-4 border border-slate-200 rounded-xl bg-white shadow-sm text-xs">
                        <div class="flex justify-between items-center border-b pb-2 mb-2">
                            <strong class="text-slate-800 text-sm">${t.full_name} (${t.inverter_model})</strong>
                            <span class="bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded text-[10px]">Durum: ${t.status}</span>
                        </div>
                        <p class="text-slate-600 mb-3 bg-slate-50 p-2 rounded font-medium">${t.problem_desc}</p>
                        <div class="flex gap-2">
                            <input type="text" id="adm_resp_${t.id}" placeholder="Firmaya/Müşteriye yanıt..." value="${t.admin_response||''}" class="flex-1 p-2 border rounded-lg text-xs outline-none focus:border-red-500">
                            <button onclick="adminRespondTicket(${t.id})" class="bg-red-600 hover:bg-red-700 text-white font-bold px-4 rounded-lg text-xs transition shadow">Yanıt Gönder</button>
                        </div>
                    </div>`;
            });
        } else {
            ticketsBox.innerHTML = '<p class="text-xs text-red-500 font-bold">Veritabanı bağlantısı yok.</p>';
        }
    }
}

window.adminRespondTicket = async function(id) {
    const respValue = document.getElementById(`adm_resp_${id}`).value.trim();
    if(!respValue) return;
    if(supabaseClient) {
        await supabaseClient.from('support_tickets').update({ admin_response: respValue, status: 'Dönüş Yapıldı' }).eq('id', id);
        alert("Teknik servis yanıtı başarıyla iletildi!");
        fetchAdminData();
    }
};
// ============================================================================
// 8. GÜÇ VE FATURA HESAPLAYICI MODÜLÜ (Çekirdek Algoritma)
// ============================================================================

const appliancesWrapper = document.getElementById('appliancesWrapper');

/**
 * Sıfır kurulum (faturası olmayan) evler için eşya bazlı tüketim satırı ekler.
 */
function addApplianceRow(name = "", qty = 1, kw = "", hrs = "") {
    if(!appliancesWrapper) return;
    const row = document.createElement('div'); 
    row.className = "appliance-row grid grid-cols-12 gap-2 items-center mt-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm";
    row.innerHTML = `
        <div class="col-span-4"><input type="text" placeholder="Cihaz Adı" value="${name}" class="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500"></div>
        <div class="col-span-2"><input type="number" value="${qty}" class="app-qty w-full p-2 border border-slate-300 rounded text-sm text-center outline-none focus:border-blue-500" title="Adet"></div>
        <div class="col-span-3"><input type="number" placeholder="Gücü (kW)" value="${kw}" step="0.01" class="app-kw w-full p-2 border border-slate-300 rounded text-sm text-center outline-none focus:border-blue-500"></div>
        <div class="col-span-2"><input type="number" placeholder="Aylık Saat" value="${hrs}" class="app-hrs w-full p-2 border border-slate-300 rounded text-sm text-center outline-none focus:border-blue-500"></div>
        <div class="col-span-1 text-center"><button class="btn-delete-app text-red-500 font-bold text-xl hover:text-red-700 transition">&times;</button></div>
    `;
    row.querySelector('.btn-delete-app').addEventListener('click', () => row.remove()); 
    appliancesWrapper.appendChild(row);
}

// Hazır cihaz butonlarını dinle
if(document.getElementById('btnAddAppliance')) {
    const defaultApps = [{ name: 'Buzdolabı', qty: 1, kw: 0.15, hrs: 240 }, { name: 'Çamaşır Makinesi', qty: 1, kw: 0.8, hrs: 20 }, { name: 'Bulaşık Makinesi', qty: 1, kw: 1.2, hrs: 15 }, { name: 'Aydınlatma (LED)', qty: 10, kw: 0.01, hrs: 150 }];
    defaultApps.forEach(app => addApplianceRow(app.name, app.qty, app.kw, app.hrs));
    
    document.getElementById('btnAddAppliance').addEventListener('click', () => addApplianceRow());
    document.getElementById('quickAddSelect').addEventListener('change', e => { 
        if (e.target.value) { 
            const [n, q, k, h] = e.target.value.split('|'); 
            addApplianceRow(n, q, k, h); 
            e.target.value = ""; 
        } 
    });
}

// "12 Aylık Detaylı Fatura" Izgarasını Otomatik Oluştur (Eski Sürümdeki Hatanın Çözümü)
const monthsGridContainer = document.getElementById('monthsGrid');
if (monthsGridContainer) {
    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    monthNames.forEach(monthName => {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <label class="block text-[11px] font-bold text-slate-500 mb-1">${monthName}</label>
            <input type="number" class="month-input w-full p-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500" placeholder="kWh" value="350">
        `;
        monthsGridContainer.appendChild(wrap);
    });
}

// Radyo butonları (Aylık Fatura / Yıllık / Eşya Bazlı) geçişlerini dinle
document.querySelectorAll('input[name="inputType"]')?.forEach(radio => {
    radio.addEventListener('change', (e) => {
        document.querySelectorAll('.input-section').forEach(sec => sec.classList.add('hidden'));
        const targetEl = document.getElementById(e.target.value + 'InputSection');
        if (targetEl) targetEl.classList.remove('hidden');
    });
});

// Gelecekte eklenecek yükler (EV, Isı Pompası) için geçiş butonları
document.getElementById('hasFutureLoads')?.addEventListener('change', e => document.getElementById('futureLoadsContainer').classList.toggle('hidden', !e.target.checked));
document.getElementById('checkEV')?.addEventListener('change', e => document.getElementById('wrapEV').classList.toggle('hidden', !e.target.checked));
document.getElementById('checkHP')?.addEventListener('change', e => document.getElementById('wrapHP').classList.toggle('hidden', !e.target.checked));

document.getElementById('btnAddCustomLoad')?.addEventListener('click', () => {
    const row = document.createElement('div'); row.className = "flex space-x-2 bg-slate-50 p-3 rounded-lg border border-slate-200 shadow-sm items-center";
    row.innerHTML = `<input type="text" placeholder="Yükün Adı (Örn: Havuz)" class="w-1/2 p-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500"><input type="number" placeholder="Aylık Harcama (kWh)" class="custom-load-input w-1/3 p-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500" value="0"><button class="btn-delete-load text-red-500 font-bold px-3 hover:text-red-700 transition">Sil</button>`;
    row.querySelector('.btn-delete-load').addEventListener('click', () => row.remove()); 
    document.getElementById('customLoadsWrapper').appendChild(row);
});

// Ana Hesaplama Motoru
document.getElementById('btnCalculate')?.addEventListener('click', () => {
    let base = 0; 
    const type = document.querySelector('input[name="inputType"]:checked').value;
    
    // Tüketim bazını hesapla
    if (type === 'monthly') {
        base = parseFloat(document.getElementById('averageMonthlyLoad').value) || 0;
    } else if (type === 'yearly') { 
        let t = 0; document.querySelectorAll('.month-input').forEach(i => t += parseFloat(i.value) || 0); base = t / 12; 
    } else { 
        let t = 0; 
        document.querySelectorAll('.appliance-row').forEach(r => t += (parseFloat(r.querySelector('.app-qty').value)||0) * (parseFloat(r.querySelector('.app-kw').value)||0) * (parseFloat(r.querySelector('.app-hrs').value)||0)); 
        base = t; 
    }

    // Ekstra yükleri (EV, HP vb.) hesapla
    let extra = 0;
    if (document.getElementById('hasFutureLoads').checked) {
        if(document.getElementById('checkEV').checked) extra += (parseFloat(document.getElementById('evMonthlyKm').value)||0)/100 * (parseFloat(document.getElementById('evConsumptionRate').value)||0);
        if(document.getElementById('checkHP').checked) extra += parseFloat(document.getElementById('hpMonthlyLoad').value) || 0;
        document.querySelectorAll('.custom-load-input').forEach(i => extra += parseFloat(i.value) || 0);
    }

    // Toplam değerler
    let sonAylik = base + extra; 
    let sonYillik = sonAylik * 12; 
    let trf = parseFloat(document.getElementById('tariffSelect').value); 
    let sonFatura = sonAylik * trf;

    // Sonuçları ekrana bas
    document.getElementById('finalMonthlyLoad').textContent = Math.round(sonAylik).toLocaleString('tr-TR');
    document.getElementById('finalYearlyLoad').textContent = Math.round(sonYillik).toLocaleString('tr-TR');
    document.getElementById('finalMonthlyBill').textContent = sonFatura.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    document.getElementById('resultsModule').classList.remove('hidden'); 
    document.getElementById('resultsModule').scrollIntoView({ behavior: 'smooth' });
});

// Çıktı Alma: PDF İndirme (Düzeltildi)
document.getElementById('btnDownloadPDF')?.addEventListener('click', () => {
    const element = document.getElementById('reportContent');
    if (!element) return;
    if (typeof html2pdf === 'undefined') { alert('PDF kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.'); return; }
    const opt = {
        margin: 0.4,
        filename: 'Solar_GES_Teklif_Raporu.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
});

// Çıktı Alma: E-posta Gönderme (Düzeltildi)
document.getElementById('btnSendEmail')?.addEventListener('click', async () => {
    const toEmail = document.getElementById('customerEmail').value.trim();
    if (!toEmail) { alert('Lütfen müşterinin e-posta adresini girin.'); return; }
    
    // Geliştirici EmailJS Key'leri yoksa uyar
    if (typeof emailjs === 'undefined') {
        alert('EmailJS kütüphanesi bulunamadı.');
        return;
    }
    
    const btn = document.getElementById('btnSendEmail'); const originalText = btn.innerHTML;
    btn.textContent = 'Gönderiliyor...'; btn.disabled = true;
    
    // NOT: Gerçek gönderim için app.js en başına EMAILJS değişkenlerini girmiş olmanız gerekmektedir.
    try {
        /* ÖRNEK GÖNDERİM KODU
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_QUOTE_TEMPLATE_ID, {
            to_email: toEmail,
            monthly_kwh: document.getElementById('finalMonthlyLoad').textContent,
            yearly_kwh: document.getElementById('finalYearlyLoad').textContent,
            monthly_bill: document.getElementById('finalMonthlyBill').textContent
        });
        */
        alert('✅ Teklif müşteriye başarıyla e-posta ile iletildi!');
    } catch (err) {
        alert('⚠️ E-posta gönderilirken bir sorun oluştu.');
    } finally {
        btn.innerHTML = originalText; btn.disabled = false;
    }
});


// ============================================================================
// 9. 3D MİMARİ VE ENERJİ BAĞIMSIZLIK SİMÜLASYONU (Three.js Motoru)
// ============================================================================
let appScene, appCamera, appRenderer, appControls, appObjs;
let stateGES = false, stateHP = false;
let countBat = 0, countEV = 0;
let currentGrid = 100;

function createEcoSystem(scene) {
    const objs = {};

    // Zemin ve Ev
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x65a30d }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    const house = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 6), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
    house.position.set(-2, 2.25, 0); house.castShadow = true; house.receiveShadow = true; scene.add(house);
    
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.5, 6.5), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    roof.position.set(-2, 5.50, 0); roof.rotation.z = -0.25; roof.castShadow = true; scene.add(roof);

    // Carport (Otopark)
    const cpMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), cpMat); p1.position.set(7.5, 2, 3); p1.castShadow=true; scene.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), cpMat); p2.position.set(7.5, 2, -3); p2.castShadow=true; scene.add(p2);
    const cpRoof = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 7), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, transparent:true, opacity:0.8 }));
    cpRoof.position.set(4.8, 4, 0); cpRoof.castShadow=true; scene.add(cpRoof);

    // Şebeke Direği ve Kablosu
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 10, 16), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
    pole.position.set(-12, 5, -5); pole.castShadow = true; scene.add(pole);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.5), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
    crossbar.position.set(-12, 9, -5); scene.add(crossbar);

    const cableCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-12, 9, -5), new THREE.Vector3(-9, 6.5, -2.5), new THREE.Vector3(-6, 4.5, 0));
    const cableGeo = new THREE.BufferGeometry().setFromPoints(cableCurve.getPoints(20));
    objs.gridCableMat = new THREE.LineDashedMaterial({ color: 0xef4444, linewidth: 2, dashSize: 0.4, gapSize: 0.3, transparent: true });
    objs.gridCable = new THREE.Line(cableGeo, objs.gridCableMat);
    objs.gridCable.computeLineDistances(); scene.add(objs.gridCable);

    // Doğalgaz Hattı (Isı Pompası Yokken Aktif)
    objs.gasPipe = new THREE.Group();
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5), new THREE.MeshStandardMaterial({ color: 0xfacc15 })); pipe.position.set(0, 1.25, 0); 
    const meterBox = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x9ca3af })); meterBox.position.set(0, 2.5, 0.15); 
    objs.gasPipe.add(pipe); objs.gasPipe.add(meterBox); objs.gasPipe.position.set(-5.5, 0, 3.2); scene.add(objs.gasPipe);

    // Isı Pompası
    objs.hp = new THREE.Group();
    const hpBody = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x475569 })); hpBody.position.set(0, 0.9, 0);
    const hpFan = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.85, 16), new THREE.MeshStandardMaterial({ color: 0x0f172a })); hpFan.rotation.x = Math.PI/2; hpFan.position.set(0, 0.9, 0.4); 
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.2, 16), new THREE.MeshStandardMaterial({color: 0xe2e8f0})); boiler.position.set(1.2, 1.1, 0); 
    objs.hp.add(hpBody); objs.hp.add(hpFan); objs.hp.add(boiler); objs.hp.position.set(-3.5, 0, 3.6); objs.hp.scale.set(0,0,0); scene.add(objs.hp);

    // Güneş Panelleri
    objs.panels = new THREE.Group();
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x020617, metalness: 0.9, roughness: 0.1 });
    for(let x=0; x<3; x++) { 
        for(let z=0; z<2; z++) { 
            const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 2.8), panelMat); 
            p.position.set(-2.5 + (x*2.4), 0, -1.5 + (z*3)); 
            objs.panels.add(p); 
        } 
    }
    objs.panels.position.set(-2, 5.95, 0); objs.panels.rotation.z = -0.25; objs.panels.scale.set(0,0,0); scene.add(objs.panels);

    // İnverter (Evirici)
    objs.inverterGroup = new THREE.Group();
    const inverter = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.3), new THREE.MeshStandardMaterial({ color: 0xcbd5e1 })); 
    inverter.position.set(-5.2, 3.5, -3.2); 
    const solarCable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5), new THREE.MeshStandardMaterial({ color: 0x1f2937 })); 
    solarCable.position.set(-5.2, 4.85, -3.2); 
    objs.inverterGroup.add(inverter); objs.inverterGroup.add(solarCable); objs.inverterGroup.scale.set(0,0,0); scene.add(objs.inverterGroup);

    // Bataryalar
    objs.batteries = [];
    for(let i=0; i<4; i++) {
        const bat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.6), new THREE.MeshStandardMaterial({ color: 0xf1f5f9 }));
        bat.position.set(-0.5 - (i * 1.2), 1.1, -3.3); 
        bat.castShadow = true; bat.scale.set(0,0,0);
        scene.add(bat); objs.batteries.push(bat);
    }

    // Elektrikli Araçlar (EV)
    objs.evs = [];
    for(let i=0; i<2; i++) {
        const ev = new THREE.Group();
        const cBody = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.1, 1.8), new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness:0.4 })); cBody.position.y = 0.85; cBody.castShadow = true;
        const cTop = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 1.6), new THREE.MeshStandardMaterial({ color: 0x1e293b })); cTop.position.set(-0.4, 1.7, 0); cTop.castShadow = true;
        ev.add(cBody); ev.add(cTop);
        const wMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
        const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2, 16), wMat); w1.rotation.x = Math.PI/2; w1.position.set(-1.1, 0.4, 0);
        const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2, 16), wMat); w2.rotation.x = Math.PI/2; w2.position.set(1.2, 0.4, 0);
        ev.add(w1); ev.add(w2); ev.position.set(4.5, 0, -1.5 + (i*3)); ev.scale.set(0,0,0);
        scene.add(ev); objs.evs.push(ev);
    }
    return objs;
}

window.initApp3DScene = function() {
    const container = document.getElementById('three-canvas-container');
    if (!container || appScene) return;

    appScene = new THREE.Scene();
    appScene.background = new THREE.Color(0x0f172a); 
    appCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    appCamera.position.set(22, 16, 28); 

    appRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    appRenderer.setSize(container.clientWidth, container.clientHeight);
    appRenderer.shadowMap.enabled = true;
    appRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    appRenderer.domElement.style.position = 'absolute';
    container.appendChild(appRenderer.domElement);

    appControls = new THREE.OrbitControls(appCamera, appRenderer.domElement);
    appControls.enableDamping = true; appControls.dampingFactor = 0.05;
    appControls.maxPolarAngle = Math.PI / 2 - 0.05;

    appScene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.5);
    sunLight.position.set(15, 30, 15); sunLight.castShadow = true;
    appScene.add(sunLight);

    appObjs = createEcoSystem(appScene);
    const loadingEl = document.getElementById('loading3D');
    if(loadingEl) loadingEl.style.display = 'none';

    document.getElementById('btnSimGES')?.addEventListener('click', (e) => { stateGES = !stateGES; e.target.classList.toggle('bg-emerald-600'); updateAppScore(); });
    document.getElementById('btnSimHP')?.addEventListener('click', (e) => { stateHP = !stateHP; e.target.classList.toggle('bg-emerald-600'); updateAppScore(); });
    document.getElementById('btnSimBatPlus')?.addEventListener('click', () => { if(countBat < 4) { countBat++; updateAppScore(); }});
    document.getElementById('btnSimBatMinus')?.addEventListener('click', () => { if(countBat > 0) { countBat--; updateAppScore(); }});
    document.getElementById('btnSimEVPlus')?.addEventListener('click', () => { if(countEV < 2) { countEV++; updateAppScore(); }});
    document.getElementById('btnSimEVMinus')?.addEventListener('click', () => { if(countEV > 0) { countEV--; updateAppScore(); }});

    function animate() {
        requestAnimationFrame(animate);
        if (appObjs) {
            appObjs.panels.scale.lerp(new THREE.Vector3(stateGES?1:0, stateGES?1:0, stateGES?1:0), 0.1);
            appObjs.inverterGroup.scale.lerp(new THREE.Vector3(stateGES?1:0, stateGES?1:0, stateGES?1:0), 0.1);
            appObjs.hp.scale.lerp(new THREE.Vector3(stateHP?1:0, stateHP?1:0, stateHP?1:0), 0.1);
            appObjs.gasPipe.scale.lerp(new THREE.Vector3(stateHP?0:1, stateHP?0:1, stateHP?0:1), 0.1);
            appObjs.batteries.forEach((b, i) => b.scale.lerp(new THREE.Vector3(i<countBat?1:0, i<countBat?1:0, i<countBat?1:0), 0.1));
            appObjs.evs.forEach((v, i) => v.scale.lerp(new THREE.Vector3(i<countEV?1:0, i<countEV?1:0, i<countEV?1:0), 0.1));
            
            // Animasyon Düzeltildi
            if(appObjs.gridCableMat) {
                const pulse = 0.55 + Math.sin(Date.now() * 0.004) * 0.35;
                appObjs.gridCableMat.opacity = Math.max(0.2, Math.min(1, pulse));
            }
            if(appObjs.gridCable) {
                appObjs.gridCable.visible = currentGrid > 0;
                appObjs.gridCableMat.color.setHex(currentGrid > 50 ? 0xef4444 : 0x0ea5e9);
            }
        }
        appControls.update();
        appRenderer.render(appScene, appCamera);
    }
    animate();
}

function updateAppScore() {
    let score = 0; let grid = 100; let carbon = "Yüksek"; let fossil = "Aktif Kullanımda";
    
    if(document.getElementById('batCountDisplay')) document.getElementById('batCountDisplay').innerText = countBat;
    if(document.getElementById('evCountDisplay')) document.getElementById('evCountDisplay').innerText = countEV;
    
    if (stateGES) { score += 30; grid -= 30; carbon = "Orta Düzeyde"; }
    score += countBat * 10; grid -= countBat * 15;
    if (countBat > 0 && stateGES) carbon = "Düşük";
    score += countEV * 10;
    if (countEV > 0) carbon = "Sıfıra Yakın";
    if (stateHP) { score += 20; grid = Math.max(0, grid - 20); fossil = "İPTAL EDİLDİ"; carbon = "NET ZERO (Sıfır Karbon)"; }

    currentGrid = Math.max(0, grid);
    
    if(document.getElementById('scoreDisplay')) document.getElementById('scoreDisplay').innerText = "%" + score;
    if(document.getElementById('gridDepDisplay')) document.getElementById('gridDepDisplay').innerText = "%" + currentGrid;
    if(document.getElementById('fossilDisplay')) document.getElementById('fossilDisplay').innerText = fossil;
    if(document.getElementById('carbonDisplay')) document.getElementById('carbonDisplay').innerText = carbon;

    const sColor = document.getElementById('scoreDisplay');
    if(sColor) {
        sColor.className = "text-xs px-2 py-1 rounded text-white font-bold transition-colors duration-500 shadow";
        if(score < 30) sColor.classList.add('bg-red-500');
        else if(score < 70) sColor.classList.add('bg-orange-500');
        else if(score < 100) sColor.classList.add('bg-emerald-500');
        else sColor.classList.add('bg-emerald-600', 'animate-pulse');
    }
}


// ============================================================================
// 10. EV YÜK & SOLAR ŞARJ HESAPLAYICISI
// ============================================================================
let activeEVTab = 'tabBill';

document.querySelectorAll('.ev-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.ev-tab-btn').forEach(b => { 
            b.classList.remove('bg-teal-600', 'text-white'); 
            b.classList.add('bg-slate-100', 'text-slate-600'); 
        });
        e.target.classList.remove('bg-slate-100', 'text-slate-600'); 
        e.target.classList.add('bg-teal-600', 'text-white');
        
        document.querySelectorAll('.ev-tab-content').forEach(c => c.classList.add('hidden'));
        activeEVTab = e.target.getAttribute('data-target');
        document.getElementById(activeEVTab)?.classList.remove('hidden');
        calculateEVSolar(); 
    });
});

document.querySelectorAll('.ev-reactive-input').forEach(input => input.addEventListener('input', calculateEVSolar));

window.calculateEVSolar = function() {
    const tariff = parseFloat(document.getElementById('evCalcTariff')?.value) || 2.50;
    const evRange = parseFloat(document.getElementById('evCalcRange')?.value) || 1;
    const evBattery = parseFloat(document.getElementById('evCalcBattery')?.value) || 1;
    const evConsumption = parseFloat(document.getElementById('evCalcConsumption')?.value) || 1;
    const evACSpeed = parseFloat(document.getElementById('evCalcACSpeed')?.value) || 11; 
    const userRoof = parseFloat(document.getElementById('evInputRoof')?.value) || 0;
    const maxUsableRoof = userRoof * 0.8;
    
    const recommendationBox = document.getElementById('evChargerRecommendation');
    if (recommendationBox) {
        if (evACSpeed > 0 && evBattery > 0) {
            const chargeTime = (evBattery / evACSpeed).toFixed(1);
            recommendationBox.innerHTML = `<strong>💡 Şarj İstasyonu Önerisi:</strong> Aracınızın tam doluma (%0 - %100) ulaşması ${evACSpeed} kW'lık bir ev tipi (AC) şarj cihazı ile yaklaşık <strong>${chargeTime} saat</strong> sürecektir.`;
        } else {
            recommendationBox.innerHTML = "Lütfen geçerli bir batarya kapasitesi ve şarj hızı girin.";
        }
    }

    let requiredPowerKwp = 0, dailyProductionKwh = 0;
    let houseMonthlyKwh = 0, evMonthlyKwh = 0;

    if (activeEVTab === 'tabBill') {
        const monthlyBill = parseFloat(document.getElementById('evInputBill')?.value) || 0;
        houseMonthlyKwh = monthlyBill / tariff;
        evMonthlyKwh = 1500 * (evConsumption / 100);
    } 
    else if (activeEVTab === 'tabKwh') {
        houseMonthlyKwh = parseFloat(document.getElementById('evInputKwh')?.value) || 0;
        if(document.getElementById('dynamicBillEquiv')) {
            document.getElementById('dynamicBillEquiv').innerText = (houseMonthlyKwh * tariff).toFixed(2) + " TL";
        }
        evMonthlyKwh = 1500 * (evConsumption / 100); 
    } 
    else if (activeEVTab === 'tabKm') {
        const km = parseFloat(document.getElementById('evInputKm')?.value) || 0;
        evMonthlyKwh = km * (evConsumption / 100);
        houseMonthlyKwh = 350;
    }

    const totalMonthlyKwh = houseMonthlyKwh + evMonthlyKwh;
    dailyProductionKwh = totalMonthlyKwh / 30;
    requiredPowerKwp = dailyProductionKwh / 4; 
    const requiredAreaM2 = requiredPowerKwp * 5; 
    const totalMonthlyProduction = dailyProductionKwh * 30;

    if(document.getElementById('resPower')) document.getElementById('resPower').innerText = requiredPowerKwp.toFixed(2);
    if(document.getElementById('resArea')) document.getElementById('resArea').innerText = requiredAreaM2.toFixed(1);
    if(document.getElementById('resProduction')) document.getElementById('resProduction').innerText = Math.round(totalMonthlyProduction).toLocaleString('tr-TR');
    
    const surplusEnergy = Math.max(0, totalMonthlyProduction - houseMonthlyKwh);
    const solarRange = (surplusEnergy / evBattery) * evRange;
    if(document.getElementById('resSolarRange')) document.getElementById('resSolarRange').innerText = Math.round(solarRange).toLocaleString('tr-TR');
    
    const chargeRatio = evBattery > 0 ? (surplusEnergy / evBattery) * 100 : 0;
    const barWidth = Math.min(chargeRatio, 100); 
    
    const resBar = document.getElementById('resChargeBar');
    const resPercent = document.getElementById('resChargePercent');
    
    if(resBar) resBar.style.width = barWidth + '%';
    if(resPercent) resPercent.innerText = `%${Math.round(chargeRatio)}`;
    
    const warning = document.getElementById('roofWarningBanner');
    if(warning) {
        if (requiredAreaM2 > maxUsableRoof && maxUsableRoof > 0) {
            warning.classList.remove('hidden');
        } else {
            warning.classList.add('hidden');
        }
    }
}


// ============================================================================
// 11. TEKNİK SERVİS MODÜLÜ (Sadece Firmalar Arıza Bildirebilir)
// ============================================================================
document.getElementById('tabNewTicket')?.addEventListener('click', () => {
    document.getElementById('ticketForm').classList.remove('hidden'); 
    document.getElementById('myTicketsArea').classList.add('hidden');
    document.getElementById('tabNewTicket').classList.add('text-red-600', 'border-b-2', 'bg-red-50/50'); 
    document.getElementById('tabNewTicket').classList.remove('text-slate-500');
    document.getElementById('tabMyTickets').classList.add('text-slate-500'); 
    document.getElementById('tabMyTickets').classList.remove('text-red-600', 'border-b-2', 'bg-red-50/50');
});

document.getElementById('tabMyTickets')?.addEventListener('click', () => {
    document.getElementById('ticketForm').classList.add('hidden'); 
    document.getElementById('myTicketsArea').classList.remove('hidden');
    document.getElementById('tabMyTickets').classList.add('text-red-600', 'border-b-2', 'bg-red-50/50'); 
    document.getElementById('tabMyTickets').classList.remove('text-slate-500');
    document.getElementById('tabNewTicket').classList.add('text-slate-500'); 
    document.getElementById('tabNewTicket').classList.remove('text-red-600', 'border-b-2', 'bg-red-50/50');
    fetchMyTickets(); 
});

document.getElementById('ticketForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!supabaseClient) { alert("Supabase veritabanı aktif değil. Test ortamındasınız."); return; }

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
        alert("Oturumunuz sona ermiş görünüyor. Lütfen tekrar giriş yapın.");
        window.location.hash = '#auth';
        return;
    }
    
    const btn = document.getElementById('btnSubmitTicket'); 
    btn.innerHTML = "Gönderiliyor..."; btn.disabled = true;

    const { error } = await supabaseClient.from('support_tickets').insert([{
        user_id: userData.user.id,
        full_name: document.getElementById('tsName').value,
        phone: document.getElementById('tsPhone').value,
        email: document.getElementById('tsEmail').value,
        address: document.getElementById('tsAddress').value,
        inverter_model: document.getElementById('tsInverter').value,
        battery_model: document.getElementById('tsBattery').value,
        installer_name: document.getElementById('tsInstaller').value,
        install_date: document.getElementById('tsInstallDate').value,
        problem_date: document.getElementById('tsProblemDate').value,
        problem_desc: document.getElementById('tsProblemDesc').value,
        status: 'Başvuru İletildi'
    }]);

    if (error) alert("Hata: " + error.message);
    else { 
        alert("Arıza kaydınız başarıyla merkeze iletildi. En kısa sürede dönüş sağlanacaktır."); 
        document.getElementById('ticketForm').reset(); 
        document.getElementById('tabMyTickets').click(); 
    }
    btn.innerHTML = "<span>📨</span> Yetkili Servis Talebini Merkeze Gönder"; 
    btn.disabled = false;
});

async function fetchMyTickets() {
    if(!supabaseClient) return;
    const list = document.getElementById('myTicketsList');
    if(!list) return;
    
    list.innerHTML = '<p class="text-slate-500 text-sm font-medium">Biletleriniz veritabanından çekiliyor...</p>';

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
        list.innerHTML = '<p class="text-red-500 text-sm font-medium">Oturumunuz bulunamadı, lütfen tekrar giriş yapın.</p>';
        return;
    }

    const { data, error } = await supabaseClient.from('support_tickets').select('*').eq('user_id', userData.user.id).order('created_at', { ascending: false });

    if (error || !data || data.length === 0) { 
        list.innerHTML = '<p class="text-slate-500 text-sm font-medium">Daha önce açılmış bir arıza kaydınız (biletiniz) bulunmuyor.</p>'; 
        return; 
    }
    
    list.innerHTML = data.map(t => {
        let sc = "bg-slate-100 text-slate-800"; 
        if(t.status === "Değerlendiriliyor") sc = "bg-blue-100 text-blue-800 border border-blue-200"; 
        if(t.status === "Dönüş Yapıldı") sc = "bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm";
        
        return `
            <div class="p-6 bg-white border border-slate-200 rounded-xl mb-3 shadow-sm hover:shadow transition">
                <div class="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                    <h4 class="font-black text-slate-800 text-lg">${t.inverter_model} <span class="text-xs text-slate-400 font-normal tracking-widest block mt-1">${new Date(t.created_at).toLocaleDateString('tr-TR')}</span></h4>
                    <span class="${sc} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">${t.status}</span>
                </div>
                <p class="text-sm bg-slate-50 border border-slate-100 p-3 rounded-lg text-slate-600 mb-2 font-medium">${t.problem_desc}</p>
                ${t.admin_response ? `
                <div class="mt-4 bg-emerald-50 p-4 rounded-lg border border-emerald-200">
                    <p class="text-sm text-emerald-900 leading-relaxed"><strong>🔧 Merkez Yanıtı:</strong> ${t.admin_response}</p>
                </div>` : '<p class="text-xs text-slate-400 mt-2 italic flex items-center gap-1"><span>⏳</span> Henüz teknisyen yanıtı bekleniyor...</p>'}
            </div>
        `;
    }).join('');
}


// ============================================================================
// 12. SATIŞ ASİSTANI (COPILOT) VE DİNAMİK İTİRAZ YÖNETİMİ
// ============================================================================
const salesScenarios = {
    kurulum: {
        "300 m² evim var, GES istiyorum": "Sadece metrekare üzerinden verimli bir güneş enerjisi sistemi hesaplayamayız. Tüketim alışkanlıklarınızdan veya faturanızdan yola çıkarsak sizi doğru yönlendirmiş olurum.",
        "3.000 TL fatura ödüyorum": "Bu faturaya göre yaklaşık 10 kW kapasiteli bir sistem tavsiye edebilirim. Çatınızda yaklaşık 50 metrekare yer kaplar. Peki bölgenizde çok sık elektrik kesiliyor mu?",
        "Evet, sık kesiliyor": "Elektrik kesintisinin sık yaşandığı yerlerde mutlaka bataryalı hibrit sistem tavsiye etmekteyiz. Kesinti esnasında ne kadar süre ve hangi cihazları çalıştırmak istersiniz?",
        "Peki maliyeti nedir?": "Sizin için hesapladığımız 10 kW sistem ve 5 kWh batarya için referans bedel toplam <strong>{totalPrice} Dolar</strong> civarıdır. Kesin fiyat için teknik ekibimizle bir keşif planlayalım.",
        "X firması Çin malı panelle yarı fiyat verdi": "Haklısınız, dışarıdan bakıldığında hepsi cam ve silikon gibi görünüyor. Ancak güneş paneli çatınızda 25 yıl duracak ciddi bir yatırımdır. X firmasından 3 yıl sonra muhatap bulamadığınızda yaşayacağınız zarar, şu anki fiyat farkından çok daha büyük olacaktır.",
        "Eşimle görüşmem gerekiyor": "Kesinlikle, bu durum aileniz için çok önemli. Ancak düşünün; eşinizin akşamları şebeke kesintisinden dolayı karanlıkta kalmasını veya sürekli artan faturalarla strese girmesini ister misiniz?",
        "Haklısınız fakat şu an param yok": "Sizi çok iyi anlıyorum. Kredi veya ödeme planı konusunda yardımcı olabiliriz. Kurulum öncesi %40, kurulum sonrası %60 şeklinde esnek koşullar oluşturabiliriz.",
        "Şu an kendimi hazır hissetmiyorum": "Güneş her gün doğup batıyor. O enerjiyi her gün bedava üretip faturanızı sıfırlamak varken neden bekleyerek para kaybetmeye devam edelim?"
    },
    danismanlik: {
        "GES kurdurmak istiyorum ama birden fazla teklif var": "Sizi çok iyi anlıyorum. Her şeyden önce, biz doğrudan 'tüketim hesabı' ile başlıyoruz. Ardından gelen teklifleri elma ile elma olarak kıyaslamanızı sağlıyoruz.",
        "Sürece nasıl başlayabilirim / Maliyeti nedir?": "Sizi tüm karmaşadan ve yanlış kurulum riskinden kurtaran teknik danışmanlık hizmetimizin bedeli <strong>{consultPrice} TL</strong>'dir.",
        "Bu fiyat çok fazla geldi": "Haklısınız, başlangıçta ekstra bir maliyet gibi görünebilir. Ancak sizi ucuz ve kısa sürede çöp olacak sistemlerden koruyoruz. İnanın çöpe gidecek yüzbinlerce liradan tasarruf edeceksiniz.",
        "Eşimle görüşmem gerekiyor": "İsterseniz ödemeyi aldıktan sonra hemen bir e-toplantı organize edelim. Eşiniz de katılsın ve aklındaki tüm soru işaretlerini ben doğrudan cevaplayayım."
    }
};

document.querySelectorAll('input[name="companyType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const isKurulum = e.target.value === 'kurulum';
        document.getElementById('setupKurulumPrices')?.classList.toggle('hidden', !isKurulum);
        document.getElementById('setupDanismanlikPrices')?.classList.toggle('hidden', isKurulum);
    });
});

document.getElementById('btnSaveNewObjection')?.addEventListener('click', async () => {
    const objection = document.getElementById('newObjectionInput').value.trim();
    const response = document.getElementById('newResponseInput').value.trim();
    const compType = document.querySelector('input[name="companyType"]:checked').value;

    if (!objection || !response) {
        alert("Lütfen hem müşterinin itiraz cümlesini hem de asistanın vermesi gereken taktiksel yanıtı doldurun."); return;
    }
    const btn = document.getElementById('btnSaveNewObjection');
    btn.innerHTML = "Ortak Havuza Kaydediliyor..."; btn.disabled = true;

    if(supabaseClient) {
        const { error } = await supabaseClient.from('sales_copilot_scripts').insert([{
            company_type: compType, objection: objection, response: response
        }]);
        if (error) { alert("Hata: Kayıt yapılamadı."); console.error(error); } 
        else {
            alert("🎉 Yeni hazır cevap senaryosu başarıyla ortak arşive eklendi!");
            document.getElementById('newObjectionInput').value = ''; document.getElementById('newResponseInput').value = '';
        }
    } else {
        alert("Test ortamındasınız. Veri yerel havuza simüle edildi.");
    }
    btn.innerHTML = "<span>☁️</span> Cevabı Tüm Satış Ekipleri İçin Kaydet"; btn.disabled = false;
});

document.getElementById('btnStartCall')?.addEventListener('click', async () => {
    document.getElementById('salesSetupArea').classList.add('hidden');
    document.getElementById('activeCallArea').classList.remove('hidden');
    
    const compType = document.querySelector('input[name="companyType"]:checked').value;
    document.getElementById('activeStrategyLabel').textContent = "Seçili Strateji: " + (compType === 'kurulum' ? "EPC (Anahtar Teslim)" : "Danışmanlık");

    const kwPrice = parseFloat(document.getElementById('baseKwPrice').value) || 0;
    const batPrice = parseFloat(document.getElementById('baseBatPrice').value) || 0;
    const consultPrice = parseFloat(document.getElementById('baseConsultPrice').value) || 0;
    
    const container = document.getElementById('objectionButtonsContainer');
    container.innerHTML = '<p class="text-sm text-slate-400 italic p-2 text-center">Güncel veritabanı senkronize ediliyor...</p>';
    
    let mergedScenarios = { ...salesScenarios[compType] };

    if(supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('sales_copilot_scripts').select('*').eq('company_type', compType);
            if (!error && data) {
                data.forEach(item => { mergedScenarios[item.objection] = item.response; });
            }
        } catch (err) { console.warn("Dinamik senaryolara erişilemedi."); }
    }

    container.innerHTML = '';
    for (const [objection, response] of Object.entries(mergedScenarios)) {
        const btn = document.createElement('button');
        btn.className = "text-left w-full bg-white hover:bg-orange-50 border border-slate-200 p-4 rounded-xl shadow-sm font-bold text-slate-700 transition-all text-sm leading-relaxed";
        btn.innerHTML = `💬 "${objection}"`; // Escaped elsewhere if dynamic
        
        btn.addEventListener('click', () => {
            const finalRes = response
                .replace('{totalPrice}', ((10 * kwPrice) + (5 * batPrice)).toLocaleString('tr-TR'))
                .replace('{consultPrice}', consultPrice.toLocaleString('tr-TR'));
            
            document.getElementById('scriptDisplayArea').innerHTML = `<p class="text-white text-3xl leading-snug font-medium animate-fade-in">${finalRes}</p>`;
        });
        container.appendChild(btn);
    }
});

document.getElementById('btnEndCall')?.addEventListener('click', () => {
    document.getElementById('activeCallArea').classList.add('hidden');
    document.getElementById('salesSetupArea').classList.remove('hidden');
    document.getElementById('scriptDisplayArea').innerHTML = `<p class="text-slate-600 text-lg font-medium italic animate-pulse">Sol taraftan müşterinin söylediği itirazı seçtiğinizde, okumanız gereken psikolojik yanıt burada belirecektir.</p>`;
});