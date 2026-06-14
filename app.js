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
// 3D SİMÜLASYON GEÇİŞLERİ (YENİ)
// ==========================================
const simulationModule = document.getElementById('simulationModule');
const btnGoSimulation = document.getElementById('btnGoSimulation');
const btnBackToMenuFromSim = document.getElementById('btnBackToMenuFromSim');

if (btnGoSimulation) {
    btnGoSimulation.addEventListener('click', () => {
        document.getElementById('mainMenu').classList.add('hidden');
        simulationModule.classList.remove('hidden');
    });
}

if (btnBackToMenuFromSim) {
    btnBackToMenuFromSim.addEventListener('click', () => {
        simulationModule.classList.add('hidden');
        document.getElementById('mainMenu').classList.remove('hidden');
    });
}


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
        // Elektrikli Araç Kontrolü
        if (document.getElementById('checkEV').checked) {
            detayMetni += `   - Elektrikli Araç (EV): Aylık ${document.getElementById('evMonthlyKm').value || 0} km sürüş senaryosu eklenmiştir.\n`;
        }
        // Isı Pompası Kontrolü
        if (document.getElementById('checkHP').checked) {
            detayMetni += `   - Isı Pompası: Aylık sabit +${document.getElementById('hpMonthlyLoad').value || 0} kWh tüketim eklenmiştir.\n`;
        }
        // YENİ/DÜZELTME: Ekran üzerindeki tüm dinamik Özel Yükleri tarayıp maile ekleyen döngü
        document.querySelectorAll('#customLoadsWrapper > div').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if(inputs.length >= 2 && inputs[0].value) {
                detayMetni += `   - Özel Proje Yükü (${inputs[0].value}): Aylık +${inputs[1].value || 0} kWh ek tüketim\n`;
            }
        });
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
// ==========================================
// YENİ VE KESİN ÇÖZÜM: DOĞAL (NATIVE) PDF YAZDIRMA MOTORU
// ==========================================
document.getElementById('btnDownloadPDF').addEventListener('click', () => {
    
    // 1. Yazdırma Alanı Yoksa Oluştur (Görünmez Kapsayıcı)
    let printArea = document.getElementById('printArea');
    if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'printArea';
        document.body.appendChild(printArea);
    }

    // 2. Müşteri Bilgileri
    const musteriAdi = currentUserProfile ? `${currentUserProfile.first_name} ${currentUserProfile.last_name}` : 'Müşterimiz';
    const firmaAdi = currentUserProfile ? currentUserProfile.company_name : 'SolarEPC Proje Merkezi';
    const tarih = new Date().toLocaleDateString('tr-TR');

    // 3. Veri Giriş Yöntemi Ayrıştırma
    const inputType = document.querySelector('input[name="inputType"]:checked').value;
    let yontemHTML = "";

    if (inputType === 'monthly') {
        const val = document.getElementById('averageMonthlyLoad').value || 0;
        yontemHTML = `<p><strong>Kullanılan Yöntem:</strong> Aylık Sabit Fatura Tüketimi</p><p><strong>Beyan Edilen Değer:</strong> ${val} kWh / Ay</p>`;
    } else if (inputType === 'yearly') {
        yontemHTML = `<p><strong>Kullanılan Yöntem:</strong> 12 Aylık Fatura Detayı</p><table style="width:100%; border-collapse:collapse; margin-top:10px;"><tr>`;
        const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
        document.querySelectorAll('.month-input').forEach((input, i) => {
            yontemHTML += `<td style="border:1px solid #ddd; padding:5px; text-align:center; font-size:12px;"><strong>${aylar[i]}</strong><br>${input.value || 0} kWh</td>`;
            if ((i + 1) % 6 === 0 && i !== 11) yontemHTML += `</tr><tr>`; // 6 ayda bir alt satıra geç
        });
        yontemHTML += `</tr></table>`;
    } else {
        yontemHTML = `<p><strong>Kullanılan Yöntem:</strong> Yeni Kurulum Cihaz Envanteri</p><ul style="font-size:13px; line-height:1.6;">`;
        document.querySelectorAll('.appliance-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length >= 3 && inputs[0].value) {
                yontemHTML += `<li>${inputs[0].value}: ${inputs[1].value} Adet (${inputs[2].value} kW) - Ayda ${inputs[3].value} Saat</li>`;
            }
        });
        yontemHTML += `</ul>`;
    }

    // 4. Gelecek Yükler Ayrıştırma
    let gelecekHTML = "";
    if (document.getElementById('hasFutureLoads').checked) {
        gelecekHTML += `<ul style="font-size:13px; line-height:1.6;">`;
        if (document.getElementById('checkEV').checked) gelecekHTML += `<li>Elektrikli Araç (EV): Aylık ${document.getElementById('evMonthlyKm').value || 0} km</li>`;
        if (document.getElementById('checkHP').checked) gelecekHTML += `<li>Isı Pompası: Aylık +${document.getElementById('hpMonthlyLoad').value || 0} kWh</li>`;
        document.querySelectorAll('#customLoadsWrapper > div').forEach(row => {
            const ins = row.querySelectorAll('input');
            if (ins.length >= 2 && ins[0].value) gelecekHTML += `<li>Özel Yük (${ins[0].value}): Aylık +${ins[1].value} kWh</li>`;
        });
        gelecekHTML += `</ul>`;
    } else {
        gelecekHTML = `<p style="font-size:13px; color:#555;">Sisteme ilave edilecek ek yük senaryosu planlanmamıştır.</p>`;
    }

    // 5. Tertemiz Resmi Belge Tasarımı (HTML & Inline CSS)
    printArea.innerHTML = `
        <div style="font-family: Arial, sans-serif; color: #222; max-width: 800px; margin: 0 auto; line-height: 1.5;">
            <div style="border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 20px;">
                <div style="float: right; text-align: right; font-size: 12px; color: #666;">
                    <strong>Tarih:</strong> ${tarih}<br>
                    <strong>Düzenleyen:</strong> ${firmaAdi}
                </div>
                <h1 style="color: #2563eb; margin: 0; font-size: 24px;">epcmerkezim</h1>
                <p style="margin: 0; font-size: 14px; color: #555;">Güneş Enerjisi Tüketim Analiz Raporu</p>
            </div>
            <p><strong>Sayın ${musteriAdi},</strong></p>
            <p style="font-size: 14px; color: #444;">Sistem üzerinden girmiş olduğunuz parametrelere göre hesaplanan teknik ve mali simülasyon özetiniz aşağıda yer almaktadır.</p>
            <div style="margin-top: 30px;">
                <h3 style="color: #2563eb; border-bottom: 1px solid #ddd; padding-bottom: 5px; font-size: 16px;">1. Mevcut Tüketim Parametreleri</h3>
                ${yontemHTML}
            </div>
            <div style="margin-top: 20px;">
                <h3 style="color: #16a34a; border-bottom: 1px solid #ddd; padding-bottom: 5px; font-size: 16px;">2. Gelecek İlave Yük Senaryoları</h3>
                ${gelecekHTML}
            </div>
            <div style="margin-top: 40px;">
                <h3 style="background-color: #1f2937; color: white; padding: 10px; font-size: 16px; margin: 0;">3. Sonuç ve Projeksiyon</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 16px;">
                    <tr>
                        <td style="padding: 15px; border: 1px solid #ddd; background-color: #f9fafb; font-weight: bold; width: 50%;">Gelecekteki Aylık Tüketim:</td>
                        <td style="padding: 15px; border: 1px solid #ddd;">${Math.round(sonAylik).toLocaleString('tr-TR')} kWh</td>
                    </tr>
                    <tr>
                        <td style="padding: 15px; border: 1px solid #ddd; background-color: #f9fafb; font-weight: bold;">Yıllık Toplam Sistem İhtiyacı:</td>
                        <td style="padding: 15px; border: 1px solid #ddd; color: #16a34a; font-weight: bold;">${Math.round(sonYillik).toLocaleString('tr-TR')} kWh</td>
                    </tr>
                    <tr>
                        <td style="padding: 15px; border: 1px solid #ddd; background-color: #fef3c7; font-weight: bold; color: #92400e;">Tahmini Aylık Fatura Bedeli:</td>
                        <td style="padding: 15px; border: 1px solid #ddd; background-color: #fef3c7; font-weight: bold; color: #b45309; font-size: 20px;">₺ ${sonFatura.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                </table>
            </div>
            <div style="margin-top: 50px; padding-top: 20px; border-top: 1px dashed #ccc; font-size: 11px; color: #777; text-align: center;">
                <p>Bu rapor ön fizibilite amacıyla üretilmiştir. Kesin değerler ve mekanik uygunluk saha keşfi sonrasında netleşecektir.</p>
                <p><strong>epcmerkezim © ${new Date().getFullYear()}</strong></p>
            </div>
        </div>
    `;

    // 6. Tarayıcının Kendi PDF/Yazdırma Ekranını Tetikle
    setTimeout(() => {
        window.print();
        // ÇÖZÜM: Yazdırma ekranı kapandığında arka plandaki raporu tamamen sil
        if (printArea) {
            printArea.remove();
        }
    }, 200);
});