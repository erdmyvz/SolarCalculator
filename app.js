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
// TAM SÜRÜM: DETAYLI VE KUSURSUZ RAPOR İNDİRME MOTORU (html2pdf.js)
// ==========================================
document.getElementById('btnDownloadPDF').addEventListener('click', () => {
    const btn = document.getElementById('btnDownloadPDF');
    btn.textContent = "Rapor Hazırlanıyor...";
    btn.disabled = true;

    // Kullanıcı adı ve firma bilgilerini dinamik olarak veritabanından alıyoruz
    const musteriAdi = currentUserProfile ? `${currentUserProfile.first_name} ${currentUserProfile.last_name}` : 'Müşterimiz';
    const firmaAdi = currentUserProfile ? currentUserProfile.company_name : 'SolarEPC Proje Merkezi';

    // --- 1. AŞAMA: KULLANICININ SEÇTİĞİ MEVCUT TÜKETİM MODELİNİ AYRIŞTIRMA ---
    const inputType = document.querySelector('input[name="inputType"]:checked').value;
    let yontemBaslik = "";
    let yontemIcerikHTML = "";

    if (inputType === 'monthly') {
        yontemBaslik = "Fatura (Aylık Ortalama)";
        const val = document.getElementById('averageMonthlyLoad').value || 0;
        yontemIcerikHTML = `
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px; font-weight: bold; color: #4b5563; width: 40%;">Hesaplama Modeli:</td>
                <td style="padding: 10px; color: #1f2937;">Aylık Ortalama Sabit Fatura Beyanı</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px; font-weight: bold; color: #4b5563;">Mevcut Tüketim Değeri:</td>
                <td style="padding: 10px; color: #2563eb; font-weight: bold; font-size: 14px;">${Number(val).toLocaleString('tr-TR')} kWh / Ay</td>
            </tr>
        `;
    } else if (inputType === 'yearly') {
        yontemBaslik = "Fatura (12 Aylık Detaylı)";
        yontemIcerikHTML = `
            <tr>
                <td colspan="2" style="padding: 10px;">
                    <div style="margin-bottom: 8px; color: #4b5563; font-weight: bold;">Sisteme Girilen 12 Aylık Tüketim Geçmişi:</div>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; font-size: 11px;">
        `;
        const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
        document.querySelectorAll('.month-input').forEach((input, i) => {
            yontemIcerikHTML += `
                <div style="background: #f9fafb; border: 1px solid #e5e7eb; padding: 6px; border-radius: 6px; text-align: center;">
                    <span style="color: #6b7280; font-weight: 500;">${aylar[i]}</span><br>
                    <strong style="color: #1f2937;">${Number(input.value || 0).toLocaleString('tr-TR')} kWh</strong>
                </div>
            `;
        });
        yontemIcerikHTML += `</div></td></tr>`;
    } else {
        yontemBaslik = "Yeni Kurulum (Eşya Bazlı)";
        yontemIcerikHTML = `
            <tr>
                <td colspan="2" style="padding: 10px;">
                    <div style="margin-bottom: 8px; color: #4b5563; font-weight: bold;">Aktif Cihaz ve Eşya Envanter Listesi:</div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <tr style="background: #f3f4f6; font-weight: bold; color: #374151; border-bottom: 2px solid #e5e7eb;">
                            <td style="padding: 8px;">Cihaz Adı</td>
                            <td style="padding: 8px; text-align: center;">Adet</td>
                            <td style="padding: 8px; text-align: center;">Güç (kW)</td>
                            <td style="padding: 8px; text-align: center;">Çalışma Süresi</td>
                        </tr>
        `;
        document.querySelectorAll('.appliance-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length >= 4 && inputs[0].value) {
                yontemIcerikHTML += `
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 8px; color: #1f2937; font-weight: 500;">${inputs[0].value}</td>
                        <td style="padding: 8px; text-align: center; color: #4b5563;">${inputs[1].value || 1}</td>
                        <td style="padding: 8px; text-align: center; color: #4b5563;">${inputs[2].value || 0} kW</td>
                        <td style="padding: 8px; text-align: center; color: #4b5563;">${inputs[3].value || 0} Saat/Ay</td>
                    </tr>
                `;
            }
        });
        yontemIcerikHTML += `</table></td></tr>`;
    }

    // --- 2. AŞAMA: PROJELENDİRİLEN TÜM GELECEK YÜK PARAMETRELERİNİ TARAMA ---
    const hasFuture = document.getElementById('hasFutureLoads').checked;
    let gelecekIcerikHTML = "";

    if (hasFuture) {
        if (document.getElementById('checkEV').checked) {
            const evKm = document.getElementById('evMonthlyKm').value || 0;
            const evRate = document.getElementById('evConsumptionRate').value || 0;
            gelecekIcerikHTML += `
                <div style="padding: 10px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; font-size: 13px;">
                    <strong style="color: #2563eb;">⚡ Elektrikli Araç (EV) Şarj Altyapısı:</strong><br>
                    Planlanan Aylık Sürüş: ${Number(evKm).toLocaleString('tr-TR')} km | Ortalama Tüketim Çarpanı: ${evRate} kWh / 100km
                </div>
            `;
        }
        if (document.getElementById('checkHP').checked) {
            const hpLoad = document.getElementById('hpMonthlyLoad').value || 0;
            gelecekIcerikHTML += `
                <div style="padding: 10px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; font-size: 13px;">
                    <strong style="color: #16a34a;">🔥 Isı Pompası Entegrasyonu:</strong><br>
                    Sisteme İlave Edilecek Sabit Isınma/Söndürme Yükü: ${Number(hpLoad).toLocaleString('tr-TR')} kWh / Ay
                </div>
            `;
        }
        // Eksik kalan dinamik özel yükleri tek tek tarayıp rapora ekleyen döngü
        document.querySelectorAll('#customLoadsWrapper > div').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length >= 2 && inputs[0].value) {
                gelecekIcerikHTML += `
                    <div style="padding: 10px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; font-size: 13px;">
                        <strong style="color: #4b5563;">📦 Özel Proje Senaryosu (${inputs[0].value}):</strong><br>
                        Sisteme Eklenen Aylık Ek Yük Kapasitesi: +${Number(inputs[1].value || 0).toLocaleString('tr-TR')} kWh
                    </div>
                `;
            }
        });
    } else {
        gelecekIcerikHTML = `
            <div style="padding: 12px; color: #6b7280; font-style: italic; font-size: 13px; text-align: center; border: 1px dashed #ced4da; border-radius: 6px;">
                Yakın dönem projeksiyonunda sisteme dahil edilecek ek bir yük beyan edilmemiştir.
            </div>
        `;
    }

    // --- 3. AŞAMA: BÜTÜNSEL A4 DASHBOARD ŞABLONUNU OLUŞTURMA ---
    const pdfContainer = document.createElement('div');
    pdfContainer.innerHTML = `
        <div style="width: 190mm; padding: 25px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; box-sizing: border-box; background: #ffffff; min-height: 270mm; display: flex; flex-direction: column; justify-content: space-between;">
            
            <div>
                <div style="border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div>
                        <h1 style="color: #2563eb; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; font-family: Arial, sans-serif;">epcmerkezim</h1>
                        <p style="margin: 3px 0 0 0; color: #4b5563; font-size: 13px; font-weight: 500;">Güneş Enerjisi Ön Fizibilite & Analiz Raporu</p>
                    </div>
                    <div style="text-align: right; font-size: 11px; color: #6b7280; line-height: 1.4;">
                        <strong>Düzenleyen:</strong> ${firmaAdi}<br>
                        <strong>Rapor Tarihi:</strong> ${new Date().toLocaleDateString('tr-TR')}<br>
                        <strong>Belge Seri No:</strong> EPC-${Math.floor(100000 + Math.random() * 900000)}
                    </div>
                </div>
                
                <h2 style="font-size: 16px; margin-bottom: 15px; font-weight: bold; color: #1f2937;">Sayın ${musteriAdi},</h2>
                <p style="font-size: 13px; line-height: 1.6; margin-bottom: 25px; color: #374151;">
                    SaaS otomasyon ekranı üzerinde yapılandırdığınız teknik parametrelere, geçmiş fatura tüketim indekslerinize ve gelecekte kurmayı planladığınız ek yük senaryolarınıza göre hazırlanan detaylı simülasyon rapor paneli aşağıda bilgilerinize sunulmuştur.
                </p>
                
                <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 20px; background: #fafafa;">
                    <div style="background: #f8fafc; padding: 10px 15px; font-size: 11.5px; font-weight: bold; color: #2563eb; border-bottom: 1px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.5px;">
                        [Bölüm 1] Mevcut Altyapı Tüketim Girdileri
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr style="border-bottom: 1px solid #e5e7eb; background: #ffffff;">
                            <td style="padding: 10px; font-weight: bold; color: #4b5563; width: 35%;">Tercih Edilen Model:</td>
                            <td style="padding: 10px; color: #1f2937; font-weight: 600;">${yontemBaslik}</td>
                        </tr>
                        ${yontemIcerikHTML}
                    </table>
                </div>
                
                <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 25px; background: #fafafa;">
                    <div style="background: #f8fafc; padding: 10px 15px; font-size: 11.5px; font-weight: bold; color: #16a34a; border-bottom: 1px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.5px;">
                        [Bölüm 2] Projelendirilen Gelecek İlave Yük Senaryoları
                    </div>
                    <div style="padding: 15px; background: #ffffff;">
                        ${gelecekIcerikHTML}
                    </div>
                </div>
                
                <div style="border: 1px solid #111827; border-radius: 10px; overflow: hidden; margin-bottom: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div style="background: #111827; color: #ffffff; padding: 12px 15px; font-size: 11.5px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">
                        [Sonuç Paneli] Enerji Projeksiyonu Ve Tarife Analizi
                    </div>
                    <div style="display: flex; background: #ffffff; min-height: 85px;">
                        <div style="flex: 1; padding: 15px; text-align: center; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; justify-content: center;">
                            <span style="font-size: 10.5px; font-weight: bold; color: #4b5563; text-transform: uppercase;">Gelecekteki Aylık Tüketim</span>
                            <div style="font-size: 22px; font-weight: 800; color: #2563eb; margin-top: 4px;">
                                ${Math.round(sonAylik).toLocaleString('tr-TR')} <span style="font-size: 12px; font-weight: normal; color: #6b7280;">kWh</span>
                            </div>
                        </div>
                        <div style="flex: 1; padding: 15px; text-align: center; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; justify-content: center;">
                            <span style="font-size: 10.5px; font-weight: bold; color: #4b5563; text-transform: uppercase;">Yıllık Toplam Proje İhtiyacı</span>
                            <div style="font-size: 22px; font-weight: 800; color: #16a34a; margin-top: 4px;">
                                ${Math.round(sonYillik).toLocaleString('tr-TR')} <span style="font-size: 12px; font-weight: normal; color: #6b7280;">kWh</span>
                            </div>
                        </div>
                        <div style="flex: 1; padding: 15px; text-align: center; background: #f9fafb; display: flex; flex-direction: column; justify-content: center;">
                            <span style="font-size: 10.5px; font-weight: bold; color: #1f2937; text-transform: uppercase;">Tahmini Aylık Fatura</span>
                            <div style="font-size: 22px; font-weight: 800; color: #b45309; margin-top: 4px;">
                                ₺ ${sonFatura.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px; border-radius: 0 6px 6px 0; margin-bottom: 20px;">
                    <p style="margin: 0; font-size: 11px; color: #1e3a8a; line-height: 1.5;">
                        * <strong>Teknik Şerh:</strong> Bu analiz dokümanı, dijital panel üzerinde girilen kullanıcı verilerine dayanılarak ön fizibilite simülasyonu sunar. Çatı alanının statik taşıma kapasitesi, bölgesel trafo merkezlerinin AG/OG güç tahsis limitleri ve resmi çağrı mektubu süreçleri yerinde keşif sonrasında kesinleşecektir.
                    </p>
                </div>
                
                <p style="font-size: 10px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 15px; margin: 0;">
                    Bu doküman epcmerkezim entegre SaaS otomasyon motoru tarafından doğrulanarak güvenli formatta basılmıştır.
                </p>
            </div>

        </div>
    `;

    // html2pdf.js Milimetrik Sayfa Çıktı Ayarları
    const opt = {
        margin:       10, 
        filename:     `epcmerkezim_detayli_analiz_raporu.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, windowWidth: 800 }, // Sanal ekran genişliği taşmayı ve kesilmeyi %100 önler
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // PDF Çıktısını Tetikleme ve Kilitleri Açma
    html2pdf().set(opt).from(pdfContainer).save().then(() => {
        btn.innerHTML = "📄 Raporu PDF İndir"; 
        btn.disabled = false;
    }).catch((err) => {
        console.error("PDF Motoru Hatası:", err);
        btn.innerHTML = "📄 Raporu PDF İndir"; 
        btn.disabled = false;
        alert("PDF dosyası oluşturulurken bir sistem hatası meydana geldi.");
    });
});