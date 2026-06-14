// ==========================================
// 1. SUPABASE BAĞLANTISI
// ==========================================
const SUPABASE_URL = 'https://bxcghdbrafzudiigeeud.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_EiDGhm4bT-acQ8xrV9RU4w_4wkUQGys'; 

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUserProfile = null;

// ==========================================
// 2. EMAILJS BAĞLANTISI
// ==========================================
emailjs.init("qrBU4c3EChsaZhBZS");

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

// Kayıt İşlemi
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

    const { data, error } = await supabaseClient.auth.signUp({ email: email, password: password });

    if (error) { alert("Kayıt Hatası: " + error.message); btn.textContent = "Hesap Oluştur"; btn.disabled = false; return; }

    if (data.user) {
        const userRole = (email === 'erdem.yvz@hotmail.com') ? 'admin' : 'user';
        const { error: dbError } = await supabaseClient.from('profiles').insert([{ id: data.user.id, first_name: name, last_name: surname, company_name: company, phone: phone, role: userRole }]);
        
        if (dbError) { alert("Veritabanı hatası!"); } 
        else { alert("Kayıt Başarılı! E-postanıza gönderilen onay linkine tıklayın."); registerForm.reset(); tabLogin.click(); }
    }
    btn.textContent = "Hesap Oluştur"; btn.disabled = false;
});

// Giriş İşlemi
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnLoginSubmit');
    btn.textContent = "Giriş Yapılıyor..."; btn.disabled = true;

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value,
    });

    if (error) { alert("Giriş Başarısız: E-postanızı onayladığınızdan emin olun."); btn.textContent = "Sisteme Giriş Yap"; btn.disabled = false; return; }
    if (data.user) fetchUserProfile(data.user.id, data.user.email);
});

// Profil Yükleme
async function fetchUserProfile(userId, displayEmail) {
    const { data } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    if (data) {
        currentUserProfile = data;
        document.getElementById('userNameDisplay').textContent = `${data.first_name} ${data.last_name}`;
        document.getElementById('userCompanyDisplay').textContent = data.company_name;
        document.getElementById('userEmailDisplay').textContent = displayEmail;
        document.getElementById('userInitials').textContent = data.first_name.charAt(0).toUpperCase();

        document.getElementById('adminPanelCard').classList.toggle('hidden', data.role !== 'admin');
        authContainer.classList.add('hidden'); appContainer.classList.remove('hidden');
    }
    document.getElementById('btnLoginSubmit').textContent = "Sisteme Giriş Yap"; document.getElementById('btnLoginSubmit').disabled = false;
}

// Menüler ve Çıkış
const btnProfile = document.getElementById('btnProfile');
const profileDropdown = document.getElementById('profileDropdown');
btnProfile.addEventListener('click', () => profileDropdown.classList.toggle('hidden'));
document.addEventListener('click', e => { if (!btnProfile.contains(e.target) && !profileDropdown.contains(e.target)) profileDropdown.classList.add('hidden'); });

document.getElementById('btnLogout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    appContainer.classList.add('hidden'); authContainer.classList.remove('hidden'); profileDropdown.classList.add('hidden');
    loginForm.reset(); document.getElementById('adminModule').classList.add('hidden'); document.getElementById('mainMenu').classList.remove('hidden');
});

// Admin Paneli
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
    const { data } = await supabaseClient.from('profiles').select('*').order('first_name');
    if(data) {
        tbody.innerHTML = '';
        data.forEach(u => {
            const row = document.createElement('tr');
            row.innerHTML = `<td class="py-3 px-4 border-b text-sm">${u.first_name} ${u.last_name}</td><td class="py-3 px-4 border-b text-sm">${u.company_name}</td><td class="py-3 px-4 border-b text-sm">${u.phone}</td><td class="py-3 px-4 border-b"><span class="${u.role==='admin'?'bg-red-100 text-red-800':'bg-blue-100 text-blue-800'} px-2 py-1 rounded text-xs">${u.role}</span></td>`;
            tbody.appendChild(row);
        });
    }
}

// ==========================================
// GÜÇ HESAPLAYICI - SEÇİM VE LİSTELEME
// ==========================================
const monthsGrid = document.getElementById('monthsGrid');
["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"].forEach(m => {
    const div = document.createElement('div'); div.innerHTML = `<label class="block text-xs text-gray-500 mb-1">${m}</label><input type="number" class="month-input w-full p-2 border border-gray-300 rounded outline-none text-sm" value="300">`;
    if(monthsGrid) monthsGrid.appendChild(div);
});

// Radyo Butonu ile Sekme Geçişleri
document.querySelectorAll('input[name="inputType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        document.querySelectorAll('.input-section').forEach(sec => sec.classList.add('hidden'));
        const targetEl = document.getElementById(e.target.value + 'InputSection');
        if (targetEl) targetEl.classList.remove('hidden');
    });
});

// Eşya Ekleme Mantığı ve Varsayılan Liste
const appliancesWrapper = document.getElementById('appliancesWrapper');
function addApplianceRow(name = "", qty = 1, kw = "", hrs = "") {
    const row = document.createElement('div'); row.className = "appliance-row grid grid-cols-12 gap-2 items-center mt-2";
    row.innerHTML = `<div class="col-span-4"><input type="text" placeholder="Adı" value="${name}" class="w-full p-2 border rounded text-sm"></div><div class="col-span-2"><input type="number" value="${qty}" class="app-qty w-full p-2 border rounded text-sm text-center"></div><div class="col-span-3"><input type="number" placeholder="kW" value="${kw}" step="0.01" class="app-kw w-full p-2 border rounded text-sm text-center"></div><div class="col-span-2"><input type="number" placeholder="Saat" value="${hrs}" class="app-hrs w-full p-2 border rounded text-sm text-center"></div><div class="col-span-1 text-center"><button class="btn-delete-app text-red-500 font-bold text-lg">&times;</button></div>`;
    row.querySelector('.btn-delete-app').addEventListener('click', () => row.remove()); if(appliancesWrapper) appliancesWrapper.appendChild(row);
}

if(document.getElementById('btnAddAppliance')) {
    // Sayfa açıldığında standart yüklenecek cihazlar
    const defaultAppliances = [
        { name: 'Buzdolabı', qty: 1, kw: 0.15, hrs: 240 }, 
        { name: 'Televizyon', qty: 1, kw: 0.1, hrs: 120 }, 
        { name: 'Çamaşır Makinesi', qty: 1, kw: 0.8, hrs: 20 }, 
        { name: 'Bulaşık Makinesi', qty: 1, kw: 1.2, hrs: 15 },
        { name: 'Aydınlatma (Ev)', qty: 10, kw: 0.01, hrs: 150 }
    ];
    defaultAppliances.forEach(app => addApplianceRow(app.name, app.qty, app.kw, app.hrs));
    
    document.getElementById('btnAddAppliance').addEventListener('click', () => addApplianceRow());
    document.getElementById('quickAddSelect').addEventListener('change', e => { 
        if (e.target.value) { 
            const [name, qty, kw, hrs] = e.target.value.split('|'); 
            addApplianceRow(name, qty, kw, hrs); 
            e.target.value = ""; 
        } 
    });
}

// Gelecek Yükler
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

// HESAPLAMA MOTORU VE SONUÇLAR
let sonAylik = 0, sonYillik = 0, sonFatura = 0; 

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

        sonAylik = base + extra; 
        sonYillik = sonAylik * 12; 
        let trf = parseFloat(document.getElementById('tariffSelect').value);
        sonFatura = sonAylik * trf;

        document.getElementById('finalMonthlyLoad').textContent = Math.round(sonAylik).toLocaleString('tr-TR');
        document.getElementById('finalYearlyLoad').textContent = Math.round(sonYillik).toLocaleString('tr-TR');
        document.getElementById('finalMonthlyBill').textContent = sonFatura.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        document.getElementById('resultsModule').classList.remove('hidden'); 
        document.getElementById('resultsModule').scrollIntoView({ behavior: 'smooth' });
    });
}

// ==========================================
// LOKAL DÜZELTME: DETAYLI DASHBOARD TASARIMLI PDF AKTARIMI
// ==========================================
document.getElementById('btnDownloadPDF').addEventListener('click', () => {
    const btn = document.getElementById('btnDownloadPDF');
    btn.textContent = "Hazırlanıyor...";

    const musteriAdi = currentUserProfile ? `${currentUserProfile.first_name} ${currentUserProfile.last_name}` : 'Müşterimiz';
    const firmaAdi = currentUserProfile ? currentUserProfile.company_name : 'EPC Firma Merkezi';
    
    // --- 1. DİNAMİK VERİ GİRİŞ YÖNTEMİ PANELİ OLUŞTURMA ---
    const inputType = document.querySelector('input[name="inputType"]:checked').value;
    let secilenYontemBaslik = "";
    let secilenYontemIcerikHTML = "";

    if (inputType === 'monthly') {
        secilenYontemBaslik = "Fatura (Aylık Ortalama Giriş)";
        const val = document.getElementById('averageMonthlyLoad').value || 0;
        secilenYontemIcerikHTML = `<div style="padding:12px; background:#f3f4f6; border-radius:6px; font-size:13px;"><strong>Beyan Edilen Sabit Tüketim:</strong> ${val} kWh / Ay</div>`;
    } else if (inputType === 'yearly') {
        secilenYontemBaslik = "Fatura (12 Aylık Detaylı Veri Seti)";
        secilenYontemIcerikHTML = `<div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; font-size:11px;">`;
        const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
        document.querySelectorAll('.month-input').forEach((input, i) => {
            secilenYontemIcerikHTML += `<div style="background:#f3f4f6; padding:6px; border-radius:4px; text-align:center;"><strong>${aylar[i]}:</strong><br>${input.value || 0} kWh</div>`;
        });
        secilenYontemIcerikHTML += `</div>`;
    } else {
        secilenYontemBaslik = "Yeni Kurulum (Aktif Cihaz ve Eşya Envanteri)";
        secilenYontemIcerikHTML = `<table style="width:100%; font-size:12px; border-collapse:collapse;">
            <tr style="background:#f3f4f6; font-weight:bold;"><td style="padding:6px;">Cihaz Adı</td><td style="padding:6px;text-align:center;">Adet</td><td style="padding:6px;text-align:center;">Güç (kW)</td><td style="padding:6px;text-align:center;">Süre (Saat/Ay)</td></tr>`;
        document.querySelectorAll('.appliance-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if(inputs.length >= 3 && inputs[0].value) {
                secilenYontemIcerikHTML += `<tr>
                    <td style="padding:6px; border-bottom:1px solid #e5e7eb;">${inputs[0].value}</td>
                    <td style="padding:6px; border-bottom:1px solid #e5e7eb; text-align:center;">${inputs[1].value || 0}</td>
                    <td style="padding:6px; border-bottom:1px solid #e5e7eb; text-align:center;">${inputs[2].value || 0} kW</td>
                    <td style="padding:6px; border-bottom:1px solid #e5e7eb; text-align:center;">${inputs[3].value || 0} Sa</td>
                </tr>`;
            }
        });
        secilenYontemIcerikHTML += `</table>`;
    }

    // --- 2. DİNAMİK GELECEK YÜKLER PANELİ OLUŞTURMA ---
    const hasFuture = document.getElementById('hasFutureLoads').checked;
    let gelecekYukIcerikHTML = "";

    if (hasFuture) {
        gelecekYukIcerikHTML += `<ul style="margin:0; padding-left:20px; font-size:13px; color:#374151;">`;
        if (document.getElementById('checkEV').checked) {
            const evKm = document.getElementById('evMonthlyKm').value || 0;
            const evRate = document.getElementById('evConsumptionRate').value || 0;
            gelecekYukIcerikHTML += `<li style="margin-bottom:6px;"><strong>Elektrikli Araç Entegrasyonu:</strong> Aylık ${evKm} km sürüş hedefi (${evRate} kWh/100km tüketim oranı)</li>`;
        }
        if (document.getElementById('checkHP').checked) {
            const hpLoad = document.getElementById('hpMonthlyLoad').value || 0;
            gelecekYukIcerikHTML += `<li style="margin-bottom:6px;"><strong>Isı Pompası (İklimlendirme):</strong> Sisteme eklenecek aylık sabit ${hpLoad} kWh yük</li>`;
        }
        document.querySelectorAll('#customLoadsWrapper > div').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if(inputs.length >= 2 && inputs[0].value) {
                gelecekYukIcerikHTML += `<li style="margin-bottom:6px;"><strong>Özel Proje Yükü (${inputs[0].value}):</strong> Aylık +${inputs[1].value || 0} kWh ek tüketim</li>`;
            }
        });
        gelecekYukIcerikHTML += `</ul>`;
    } else {
        gelecekYukIcerikHTML = `<p style="margin:0; font-size:13px; color:#6b7280; font-style:italic;">Yakın vadede sisteme dahil edilmesi planlanan ek bir yük beyan edilmemiştir.</p>`;
    }

    // --- 3. SANAL A4 EKRAN snapshot TASARIMI ---
    const pdfContainer = document.createElement('div');
    pdfContainer.innerHTML = `
        <div style="width: 190mm; padding: 25px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; box-sizing: border-box; background:#ffffff;">
            <div style="border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; display:flex; justify-content:space-between; align-items:flex-end;">
                <div>
                    <h1 style="color: #2563eb; margin: 0; font-size: 26px; font-weight: 800; letter-spacing:-0.5px;">epcmerkezim</h1>
                    <p style="margin: 3px 0 0 0; color: #4b5563; font-size: 13px; font-weight:500;">Mühendislik & Fizibilite Operasyon Raporu</p>
                </div>
                <div style="text-align:right; font-size:11px; color:#6b7280;">
                    <strong>Düzenleyen:</strong> ${firmaAdi}<br>
                    <strong>Tarih:</strong> ${new Date().toLocaleDateString('tr-TR')}
                </div>
            </div>
            
            <p style="font-size: 14px; line-height: 1.5; margin-bottom: 20px;">
                Sayın <strong>${musteriAdi}</strong>, simülasyon ekranında yapılandırdığınız teknik parametrelere ve envanter analizine dayalı oluşturulan detaylı rapor çıktı paneli aşağıda sunulmuştur.
            </p>
            
            <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 20px; background:#fafafa;">
                <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid #e5e7eb; padding-bottom:6px;">
                    <span style="font-size:13px; font-weight:bold; color:#2563eb; text-transform:uppercase;">[Aşama 1] Ekran Veri Giriş Modeli</span>
                    <span style="font-size:12px; background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:4px; font-weight:bold;">${secilenYontemBaslik}</span>
                </div>
                ${secilenYontemIcerikHTML}
            </div>
            
            <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 25px; background:#fafafa;">
                <div style="margin-bottom:12px; border-bottom:1px solid #e5e7eb; padding-bottom:6px; font-size:13px; font-weight:bold; color:#16a34a; text-transform:uppercase;">
                    [Aşama 2] Simüle Edilen Gelecek Yük Senaryoları
                </div>
                ${gelecekYukIcerikHTML}
            </div>
            
            <div style="border: 1px solid #111827; border-radius: 10px; overflow:hidden; margin-bottom: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="background:#111827; color:#ffffff; padding:12px 15px; font-size:13px; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px;">
                    [Sonuç Paneli] Teknik Analiz Ve Tarife Projeksiyonu
                </div>
                <div style="display:flex; background:#ffffff;">
                    <div style="flex:1; padding:20px; text-align:center; border-right:1px solid #e5e7eb;">
                        <span style="font-size:11px; font-weight:bold; color:#4b5563; text-transform:uppercase;">Gelecekteki Aylık</span>
                        <div style="font-size:24px; font-weight:800; color:#2563eb; margin-top:5px;">${Math.round(sonAylik).toLocaleString('tr-TR')} <span style="font-size:13px; font-weight:normal; color:#6b7280;">kWh</span></div>
                    </div>
                    <div style="flex:1; padding:20px; text-align:center; border-right:1px solid #e5e7eb;">
                        <span style="font-size:11px; font-weight:bold; color:#4b5563; text-transform:uppercase;">Yıllık Toplam Proje</span>
                        <div style="font-size:24px; font-weight:800; color:#16a34a; margin-top:5px;">${Math.round(sonYillik).toLocaleString('tr-TR')} <span style="font-size:13px; font-weight:normal; color:#6b7280;">kWh</span></div>
                    </div>
                    <div style="flex:1; padding:20px; text-align:center; background:#f9fafb;">
                        <span style="font-size:11px; font-weight:bold; color:#1f2937; text-transform:uppercase;">Tahmini Aylık Fatura</span>
                        <div style="font-size:24px; font-weight:800; color:#b45309; margin-top:5px;">₺ ${sonFatura.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                </div>
            </div>
            
            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px; border-radius:0 6px 6px 0;">
                <p style="margin: 0; font-size: 12px; color: #1e3a8a; line-height: 1.5;">
                    * Bu evrak ekran üzerinde girilen beyanlar doğrultusunda ön fizibilite amacıyla üretilmiştir. Resmi teklif ve çatı mekanik uygunluk onayı için yerinde keşif yapılması kanuni zorunluluktur.
                </p>
            </div>
            
            <p style="font-size:10px; color:#9ca3af; text-align:center; border-top:1px solid #e5e7eb; padding-top:15px; margin-top:40px;">
                Bu rapor altyapısı epcmerkezim platformu otomasyon motoru ile mühürlenmiştir.
            </p>
        </div>
    `;

    const opt = {
      margin:       10, 
      filename:     `epcmerkezim_analiz_raporu.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, windowWidth: 800 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(pdfContainer).save().then(() => {
        btn.innerHTML = "📄 Raporu PDF İndir"; 
        btn.disabled = false;
    });
});

// ==========================================
// LOKAL DÜZELTME: DETAYLI RAPOR METNİ İÇEREN E-POSTA MOTORU
// ==========================================
document.getElementById('btnSendEmail').addEventListener('click', async () => {
    const emailTo = document.getElementById('customerEmail').value;
    if(!emailTo || !emailTo.includes('@')) {
        alert("Lütfen geçerli bir müşteri e-posta adresi girin.");
        return;
    }

    const btn = document.getElementById('btnSendEmail');
    btn.textContent = "Gönderiliyor...";
    btn.disabled = true;

    // --- MAİL İÇİN ADIM ADIM SEÇİM METNİ DETAYI OLUŞTURMA ---
    let detayMetni = "";
    const inputType = document.querySelector('input[name="inputType"]:checked').value;
    
    detayMetni += "1. TÜKETİM MODELİ GİRİŞ PARAMETRELERİ:\n";
    if (inputType === 'monthly') {
        const val = document.getElementById('averageMonthlyLoad').value || 0;
        detayMetni += `   - Yöntem: Aylık Ortalama Fatura Girişi\n   - Tüketim Değeri: ${val} kWh / Ay\n`;
    } else if (inputType === 'yearly') {
        detayMetni += "   - Yöntem: 12 Aylık Detaylı Fatura Veri Girişi\n   - Girilen Aylık Değerler listelenerek veritabanına işlenmiştir.\n";
    } else {
        detayMetni += "   - Yöntem: Yeni Kurulum (Cihaz/Eşya Listesi Hesaplaması)\n   - Dahil Edilen Aktif Cihazlar:\n";
        document.querySelectorAll('.appliance-row').forEach(row => {
            const ins = row.querySelectorAll('input');
            if(ins.length >= 3 && ins[0].value) {
                detayMetni += `     * ${ins[0].value}: ${ins[1].value || 0} Adet (${ins[2].value || 0} kW)\n`;
            }
        });
    }

    detayMetni += "\n2. GELECEKTEKİ İLAVE YÜK SENARYOLARI:\n";
    if (document.getElementById('hasFutureLoads').checked) {
        if (document.getElementById('checkEV').checked) {
            detayMetni += `   - Elektrikli Araç (EV): Aylık ${document.getElementById('evMonthlyKm').value || 0} km sürüş senaryosu eklenmiştir.\n`;
        }
        if (document.getElementById('checkHP').checked) {
            detayMetni += `   - Isı Pompası: Aylık sabit +${document.getElementById('hpMonthlyLoad').value || 0} kWh tüketim eklenmiştir.\n`;
        }
    } else {
        detayMetni += "   - İlave bir gelecek yük planlanmadı.\n";
    }

    // EmailJS şablon parametreleri paketleniyor
    const templateParams = {
        to_email: emailTo,
        aylik_tuketim: Math.round(sonAylik).toLocaleString('tr-TR') + " kWh",
        yillik_tuketim: Math.round(sonYillik).toLocaleString('tr-TR') + " kWh",
        tahmini_fatura: sonFatura.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TL",
        detay_raporu: detayMetni // EmailJS panelinde {{detay_raporu}} kelimesiyle basılacak alan!
    };

    try {
        await emailjs.send('service_en0v19k', 'template_d57vo2b', templateParams);
        alert(emailTo + " adresine detaylı ekran veri özeti mail olarak uçuruldu!");
        document.getElementById('customerEmail').value = ''; 
    } catch (error) {
        console.error("EmailJS Hatası:", error);
        alert("E-posta gönderilemedi! Bilgilerinizi doğrulayın.");
    } finally {
        btn.textContent = "✉️ Analizi Mail At";
        btn.disabled = false;
    }
});