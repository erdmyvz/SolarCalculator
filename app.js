// ==========================================
// SUPABASE VERİTABANI BAĞLANTISI
// ==========================================
const SUPABASE_URL = 'https://bxcghdbrafzudiigeeud.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_EiDGhm4bT-acQ8xrV9RU4w_4wkUQGys'; 

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUserProfile = null;

// ==========================================
// SEKMELER VE AUTH GEÇİŞLERİ
// ==========================================
const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

tabLogin.addEventListener('click', () => {
    loginForm.classList.remove('hidden'); registerForm.classList.add('hidden');
    tabLogin.classList.add('text-blue-600', 'border-b-2', 'border-blue-600'); tabLogin.classList.remove('text-gray-400');
    tabRegister.classList.add('text-gray-400'); tabRegister.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
});

tabRegister.addEventListener('click', () => {
    registerForm.classList.remove('hidden'); loginForm.classList.add('hidden');
    tabRegister.classList.add('text-blue-600', 'border-b-2', 'border-blue-600'); tabRegister.classList.remove('text-gray-400');
    tabLogin.classList.add('text-gray-400'); tabLogin.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
});

// ==========================================
// 1. KAYIT OL (REGISTER) - GÜVENLİ E-POSTA
// ==========================================
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnRegisterSubmit');
    btn.textContent = "Kaydediliyor..."; btn.disabled = true;

    const name = document.getElementById('regName').value;
    const surname = document.getElementById('regSurname').value;
    const company = document.getElementById('regCompany').value;
    const phone = document.getElementById('regPhone').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    // Supabase Auth Sistemine Kayıt
    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
    });

    if (error) {
        alert("Kayıt Hatası: " + error.message);
        btn.textContent = "Hesap Oluştur"; btn.disabled = false;
        return;
    }

    // Doğrulama maili gittiyse profil tablosuna da ekleyelim
    if (data.user) {
        const userRole = (email === 'erdem.yvz@hotmail.com') ? 'admin' : 'user';
        
        const { error: dbError } = await supabaseClient.from('profiles').insert([{
            id: data.user.id, 
            first_name: name, 
            last_name: surname, 
            company_name: company, 
            phone: phone, 
            role: userRole
        }]);

        if (dbError) {
            console.error(dbError);
            alert("Profil kaydedilemedi. SQL tablosunu sıfırladığınızdan emin olun!");
        } else {
            alert("Kayıt Başarılı! E-postanıza bir onay linki gönderdik. Lütfen mailinize gidip onayladıktan sonra giriş yapınız.");
            registerForm.reset();
            tabLogin.click(); // Giriş ekranına at
        }
    }
    
    btn.textContent = "Hesap Oluştur"; btn.disabled = false;
});

// ==========================================
// 2. GİRİŞ YAP (LOGIN) - ONAY KONTROLLÜ
// ==========================================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnLoginSubmit');
    btn.textContent = "Giriş Yapılıyor..."; btn.disabled = true;

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value,
    });

    if (error) {
        // Eğer email onaylanmamışsa Supabase otomatik olarak hata mesajı fırlatır!
        alert("Giriş Başarısız: E-postanızı onayladığınızdan veya şifrenizin doğru olduğundan emin olun.");
        btn.textContent = "Sisteme Giriş Yap"; btn.disabled = false;
        return;
    }

    if (data.user) {
        fetchUserProfile(data.user.id, data.user.email);
    }
});

// ==========================================
// PROFİL VE OTURUM KONTROLLERİ
// ==========================================
async function fetchUserProfile(userId, displayEmail) {
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    
    if (data) {
        currentUserProfile = data;
        document.getElementById('userNameDisplay').textContent = `${data.first_name} ${data.last_name}`;
        document.getElementById('userCompanyDisplay').textContent = data.company_name;
        document.getElementById('userEmailDisplay').textContent = displayEmail;
        document.getElementById('userInitials').textContent = data.first_name.charAt(0).toUpperCase();

        document.getElementById('adminPanelCard').classList.toggle('hidden', data.role !== 'admin');
        
        authContainer.classList.add('hidden'); 
        appContainer.classList.remove('hidden');
    } else {
        alert("Kullanıcı profiliniz okunamadı. Veritabanı hatası.");
    }

    document.getElementById('btnLoginSubmit').textContent = "Sisteme Giriş Yap"; 
    document.getElementById('btnLoginSubmit').disabled = false;
}

const btnProfile = document.getElementById('btnProfile');
const profileDropdown = document.getElementById('profileDropdown');
btnProfile.addEventListener('click', () => profileDropdown.classList.toggle('hidden'));
document.addEventListener('click', e => { if (!btnProfile.contains(e.target) && !profileDropdown.contains(e.target)) profileDropdown.classList.add('hidden'); });

document.getElementById('btnLogout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    appContainer.classList.add('hidden'); 
    authContainer.classList.remove('hidden'); 
    profileDropdown.classList.add('hidden');
    loginForm.reset(); 
    document.getElementById('adminModule').classList.add('hidden'); 
    document.getElementById('mainMenu').classList.remove('hidden');
});

// ==========================================
// ADMİN PANELİ VE HESAPLAYICI GEÇİŞLERİ
// ==========================================
const adminPanelCard = document.getElementById('adminPanelCard');
const adminModule = document.getElementById('adminModule');
const mainMenu = document.getElementById('mainMenu');
const calculatorModule = document.getElementById('calculatorModule');

adminPanelCard.addEventListener('click', () => { mainMenu.classList.add('hidden'); adminModule.classList.remove('hidden'); fetchUsersForAdmin(); });
document.getElementById('btnBackToMenuFromAdmin').addEventListener('click', () => { adminModule.classList.add('hidden'); mainMenu.classList.remove('hidden'); });
document.getElementById('btnGoCalculator').addEventListener('click', () => { mainMenu.classList.add('hidden'); calculatorModule.classList.remove('hidden'); });
document.getElementById('btnBackToMenu').addEventListener('click', () => { calculatorModule.classList.add('hidden'); mainMenu.classList.remove('hidden'); document.getElementById('resultsModule').classList.add('hidden'); });
document.getElementById('btnRefreshUsers').addEventListener('click', fetchUsersForAdmin);

async function fetchUsersForAdmin() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-gray-500">Yükleniyor...</td></tr>';
    
    // Tablodan tüm kullanıcıları çek
    const { data, error } = await supabaseClient.from('profiles').select('*').order('first_name');
    
    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-red-500">Hata: ${error.message}</td></tr>`;
        return;
    }

    if(data) {
        tbody.innerHTML = '';
        data.forEach(u => {
            const row = document.createElement('tr');
            row.innerHTML = `<td class="py-3 px-4 border-b text-sm font-medium text-gray-800">${u.first_name} ${u.last_name}</td><td class="py-3 px-4 border-b text-sm text-gray-600">${u.company_name}</td><td class="py-3 px-4 border-b text-sm text-gray-600">${u.phone}</td><td class="py-3 px-4 border-b"><span class="${u.role==='admin'?'bg-red-100 text-red-800':'bg-blue-100 text-blue-800'} px-2 py-1 rounded text-xs font-bold">${u.role}</span></td>`;
            tbody.appendChild(row);
        });
    }
}

// ==========================================
// GÜÇ HESAPLAYICI HESAP MOTORU (Aynen Korundu)
// ==========================================
const monthsGrid = document.getElementById('monthsGrid');
["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"].forEach(m => {
    const div = document.createElement('div'); div.innerHTML = `<label class="block text-xs text-gray-500 mb-1">${m}</label><input type="number" class="month-input w-full p-2 border border-gray-300 rounded outline-none text-sm" value="300">`;
    if(monthsGrid) monthsGrid.appendChild(div);
});

document.querySelectorAll('input[name="inputType"]').forEach(r => {
    r.addEventListener('change', e => {
        ['monthly', 'yearly', 'appliances'].forEach(id => document.getElementById(id + 'InputSection').classList.add('hidden'));
        document.getElementById(e.target.value + 'InputSection').classList.remove('hidden');
    });
});

const appliancesWrapper = document.getElementById('appliancesWrapper');
function addApplianceRow(name = "", qty = 1, kw = "", hrs = "") {
    const row = document.createElement('div'); row.className = "appliance-row grid grid-cols-12 gap-2 items-center mt-2";
    row.innerHTML = `<div class="col-span-4"><input type="text" placeholder="Adı" value="${name}" class="w-full p-2 border rounded text-sm"></div><div class="col-span-2"><input type="number" value="${qty}" class="app-qty w-full p-2 border rounded text-sm text-center"></div><div class="col-span-3"><input type="number" placeholder="kW" value="${kw}" step="0.01" class="app-kw w-full p-2 border rounded text-sm text-center"></div><div class="col-span-2"><input type="number" placeholder="Saat" value="${hrs}" class="app-hrs w-full p-2 border rounded text-sm text-center"></div><div class="col-span-1 text-center"><button class="btn-delete-app text-red-500 font-bold text-lg">&times;</button></div>`;
    row.querySelector('.btn-delete-app').addEventListener('click', () => row.remove()); if(appliancesWrapper) appliancesWrapper.appendChild(row);
}
if(document.getElementById('btnAddAppliance')) {
    const defaultAppliances = [{ name: 'Buzdolabı', qty: 1, kw: 0.15, hrs: 240 }, { name: 'Televizyon', qty: 1, kw: 0.1, hrs: 120 }, { name: 'Çamaşır Makinesi', qty: 1, kw: 0.8, hrs: 20 }, { name: 'Bulaşık Makinesi', qty: 1, kw: 1.2, hrs: 15 }, { name: 'Aydınlatma', qty: 10, kw: 0.01, hrs: 150 }];
    defaultAppliances.forEach(app => addApplianceRow(app.name, app.qty, app.kw, app.hrs));
    document.getElementById('btnAddAppliance').addEventListener('click', () => addApplianceRow());
    document.getElementById('quickAddSelect').addEventListener('change', e => { if (e.target.value) { const [name, qty, kw, hrs] = e.target.value.split('|'); addApplianceRow(name, qty, kw, hrs); e.target.value = ""; } });
}

if(document.getElementById('hasFutureLoads')) {
    document.getElementById('hasFutureLoads').addEventListener('change', e => document.getElementById('futureLoadsContainer').classList.toggle('hidden', !e.target.checked));
    document.getElementById('checkEV').addEventListener('change', e => document.getElementById('wrapEV').classList.toggle('hidden', !e.target.checked));
    document.getElementById('checkHP').addEventListener('change', e => document.getElementById('wrapHP').classList.toggle('hidden', !e.target.checked));
    document.getElementById('btnAddCustomLoad').addEventListener('click', () => {
        const row = document.createElement('div'); row.className = "flex space-x-2 bg-gray-50 p-2 rounded border border-gray-200";
        row.innerHTML = `<input type="text" placeholder="Yük Adı" class="w-1/2 p-2 border rounded text-sm"><input type="number" placeholder="Aylık" class="custom-load-input w-1/3 p-2 border rounded text-sm" value="0"><button class="btn-delete-load text-red-500 font-bold px-2">X</button>`;
        row.querySelector('.btn-delete-load').addEventListener('click', () => row.remove()); document.getElementById('customLoadsWrapper').appendChild(row);
    });
}

if(document.getElementById('btnCalculate')) {
    document.getElementById('btnCalculate').addEventListener('click', () => {
        let base = 0; const type = document.querySelector('input[name="inputType"]:checked').value;
        if (type === 'monthly') base = parseFloat(document.getElementById('averageMonthlyLoad').value) || 0;
        else if (type === 'yearly') { let t = 0; document.querySelectorAll('.month-input').forEach(i => t += parseFloat(i.value) || 0); base = t / 12; }
        else { let t = 0; document.querySelectorAll('.appliance-row').forEach(r => t += (parseFloat(r.querySelector('.app-qty').value)||0) * (parseFloat(r.querySelector('.app-kw').value)||0) * (parseFloat(r.querySelector('.app-hrs').value)||0)); base = t; }

        let extra = 0;
        if (document.getElementById('hasFutureLoads').checked) {
            if(document.getElementById('checkEV').checked) extra += (parseFloat(document.getElementById('evMonthlyKm').value)||0)/100 * (parseFloat(document.getElementById('evConsumptionRate').value)||0);
            if(document.getElementById('checkHP').checked) extra += parseFloat(document.getElementById('hpMonthlyLoad').value) || 0;
            document.querySelectorAll('.custom-load-input').forEach(i => extra += parseFloat(i.value) || 0);
        }

        let tM = base + extra, tY = tM * 12, trf = parseFloat(document.getElementById('tariffSelect').value);
        document.getElementById('finalMonthlyLoad').textContent = Math.round(tM).toLocaleString('tr-TR');
        document.getElementById('finalYearlyLoad').textContent = Math.round(tY).toLocaleString('tr-TR');
        document.getElementById('finalMonthlyBill').textContent = (tM * trf).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('resultsModule').classList.remove('hidden'); document.getElementById('resultsModule').scrollIntoView({ behavior: 'smooth' });
    });
}