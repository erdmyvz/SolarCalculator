// ==========================================
// 1. KİMLİK DOĞRULAMA (AUTH) & PROFİL YÖNETİMİ
// ==========================================
const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');

const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

// Giriş ve Kayıt sekmeleri arası geçiş
tabLogin.addEventListener('click', () => {
   loginForm.classList.remove('hidden');
   registerForm.classList.add('hidden');
   tabLogin.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
   tabLogin.classList.remove('text-gray-400');
   tabRegister.classList.add('text-gray-400');
   tabRegister.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
});

tabRegister.addEventListener('click', () => {
   registerForm.classList.remove('hidden');
   loginForm.classList.add('hidden');
   tabRegister.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
   tabRegister.classList.remove('text-gray-400');
   tabLogin.classList.add('text-gray-400');
   tabLogin.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
});

// Admin Bilgileri (Simülasyon İçin Hardcoded - İleride DB'ye geçecek)
const ADMIN_EMAIL = "erdem.yvz@hotmail.com";
const ADMIN_PASS = "Testdeneme123";

// Giriş İşlemi
loginForm.addEventListener('submit', (e) => {
   e.preventDefault();
   const email = document.getElementById('loginEmail').value;
   const password = document.getElementById('loginPassword').value;

   if (!email || !password) {
       alert("Lütfen e-posta ve şifrenizi giriniz.");
       return;
   }

   // Başarılı Giriş Simülasyonu
   authContainer.classList.add('hidden');
   appContainer.classList.remove('hidden');
   appContainer.classList.add('animate-fade-in');

   // Admin Kontrolü
   if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
       document.getElementById('adminPanelCard').classList.remove('hidden');
       setupProfile("Erdem", "Yavuz", "Teknik Uçuş / Technicall", email);
   } else {
       document.getElementById('adminPanelCard').classList.add('hidden');
       setupProfile("Test", "Kullanıcı", "Örnek EPC Firması", email);
   }
});

// Kayıt İşlemi (Simülasyon)
registerForm.addEventListener('submit', (e) => {
   e.preventDefault();
   const name = document.getElementById('regName').value;
   const surname = document.getElementById('regSurname').value;
   const company = document.getElementById('regCompany').value;
   const email = document.getElementById('regEmail').value;

   if (!name || !email) { alert("Lütfen zorunlu alanları doldurun."); return; }

   authContainer.classList.add('hidden');
   appContainer.classList.remove('hidden');
   document.getElementById('adminPanelCard').classList.add('hidden');

   setupProfile(name, surname, company, email);
});

// Profil Menüsü İşlemleri
const btnProfile = document.getElementById('btnProfile');
const profileDropdown = document.getElementById('profileDropdown');

btnProfile.addEventListener('click', () => {
   profileDropdown.classList.toggle('hidden');
});

// Ekranda başka yere tıklayınca menüyü kapat
document.addEventListener('click', (e) => {
   if (!btnProfile.contains(e.target) && !profileDropdown.contains(e.target)) {
       profileDropdown.classList.add('hidden');
   }
});

// Çıkış Yap
document.getElementById('btnLogout').addEventListener('click', () => {
   appContainer.classList.add('hidden');
   authContainer.classList.remove('hidden');
   profileDropdown.classList.add('hidden');
   document.getElementById('loginForm').reset();
   document.getElementById('registerForm').reset();
});

// Profili Doldurma Fonksiyonu
function setupProfile(name, surname, company, email) {
   const fullName = `${name} ${surname}`;
   document.getElementById('userNameDisplay').textContent = fullName;
   document.getElementById('userCompanyDisplay').textContent = company;
   document.getElementById('userEmailDisplay').textContent = email;
   document.getElementById('userInitials').textContent = name.charAt(0).toUpperCase();
}


// ==========================================
// 2. MODÜL VE HESAPLAMA MANTIĞI (Önceki Kodlar)
// ==========================================

const mainMenu = document.getElementById('mainMenu');
const calculatorModule = document.getElementById('calculatorModule');

document.getElementById('btnGoCalculator').addEventListener('click', () => {
   mainMenu.classList.add('hidden');
   calculatorModule.classList.remove('hidden');
});

document.getElementById('btnBackToMenu').addEventListener('click', () => {
   calculatorModule.classList.add('hidden');
   mainMenu.classList.remove('hidden');
   document.getElementById('resultsModule').classList.add('hidden');
});

// 12 Aylık Giriş Tablosu
const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const monthsGrid = document.getElementById('monthsGrid');
months.forEach((month, index) => {
   const div = document.createElement('div');
   div.innerHTML = `<label class="block text-xs text-gray-500 mb-1">${month}</label><input type="number" class="month-input w-full p-2 border border-gray-300 rounded outline-none text-sm" value="300">`;
   monthsGrid.appendChild(div);
});

// Ekran Bölüm Seçicileri
const radioInputs = document.querySelectorAll('input[name="inputType"]');
const sections = {
   monthly: document.getElementById('monthlyInputSection'),
   yearly: document.getElementById('yearlyInputSection'),
   appliances: document.getElementById('applianceInputSection')
};

radioInputs.forEach(radio => {
   radio.addEventListener('change', (e) => {
       Object.values(sections).forEach(sec => sec.classList.add('hidden'));
       sections[e.target.value].classList.remove('hidden');
   });
});

// Eşya Bazlı Hesaplama
const appliancesWrapper = document.getElementById('appliancesWrapper');
const defaultAppliances = [
   { name: 'Buzdolabı', qty: 1, kw: 0.15, hrs: 240 },
   { name: 'Televizyon', qty: 1, kw: 0.1, hrs: 120 },
   { name: 'Çamaşır Makinesi', qty: 1, kw: 0.8, hrs: 20 },
   { name: 'Bulaşık Makinesi', qty: 1, kw: 1.2, hrs: 15 },
   { name: 'Aydınlatma (Ev)', qty: 10, kw: 0.01, hrs: 150 }
];

function addApplianceRow(name = "", qty = 1, kw = "", hrs = "") {
   const row = document.createElement('div');
   row.className = "appliance-row grid grid-cols-12 gap-2 items-center mt-2";
   row.innerHTML = `
       <div class="col-span-4"><input type="text" placeholder="Adı" value="${name}" class="w-full p-2 border rounded text-sm"></div>
       <div class="col-span-2"><input type="number" value="${qty}" class="app-qty w-full p-2 border rounded text-sm text-center"></div>
       <div class="col-span-3"><input type="number" placeholder="kW" value="${kw}" step="0.01" class="app-kw w-full p-2 border rounded text-sm text-center"></div>
       <div class="col-span-2"><input type="number" placeholder="Saat" value="${hrs}" class="app-hrs w-full p-2 border rounded text-sm text-center"></div>
       <div class="col-span-1 text-center"><button class="btn-delete-app text-red-500 font-bold text-lg">&times;</button></div>
   `;
   row.querySelector('.btn-delete-app').addEventListener('click', () => row.remove());
   appliancesWrapper.appendChild(row);
}

defaultAppliances.forEach(app => addApplianceRow(app.name, app.qty, app.kw, app.hrs));
document.getElementById('btnAddAppliance').addEventListener('click', () => addApplianceRow());

document.getElementById('quickAddSelect').addEventListener('change', (e) => {
   if (e.target.value) {
       const [name, qty, kw, hrs] = e.target.value.split('|');
       addApplianceRow(name, qty, kw, hrs);
       e.target.value = "";
   }
});

// Gelecek Yükler
document.getElementById('hasFutureLoads').addEventListener('change', (e) => {
   document.getElementById('futureLoadsContainer').classList.toggle('hidden', !e.target.checked);
});
document.getElementById('checkEV').addEventListener('change', (e) => {
   document.getElementById('wrapEV').classList.toggle('hidden', !e.target.checked);
});
document.getElementById('checkHP').addEventListener('change', (e) => {
   document.getElementById('wrapHP').classList.toggle('hidden', !e.target.checked);
});
document.getElementById('btnAddCustomLoad').addEventListener('click', () => {
   const row = document.createElement('div');
   row.className = "flex space-x-2 bg-gray-50 p-2 rounded border border-gray-200";
   row.innerHTML = `<input type="text" placeholder="Yük Adı" class="w-1/2 p-2 border rounded text-sm"><input type="number" placeholder="Aylık kWh" class="custom-load-input w-1/3 p-2 border rounded text-sm" value="0"><button class="btn-delete-load text-red-500 font-bold px-2">X</button>`;
   row.querySelector('.btn-delete-load').addEventListener('click', () => row.remove());
   document.getElementById('customLoadsWrapper').appendChild(row);
});

// Hesaplama
document.getElementById('btnCalculate').addEventListener('click', () => {
   let baseMonthlyLoad = 0;
   const inputType = document.querySelector('input[name="inputType"]:checked').value;

   if (inputType === 'monthly') {
       baseMonthlyLoad = parseFloat(document.getElementById('averageMonthlyLoad').value) || 0;
   } else if (inputType === 'yearly') {
       let total = 0; document.querySelectorAll('.month-input').forEach(i => total += parseFloat(i.value) || 0);
       baseMonthlyLoad = total / 12;
   } else {
       let total = 0; document.querySelectorAll('.appliance-row').forEach(row => {
           total += (parseFloat(row.querySelector('.app-qty').value)||0) * (parseFloat(row.querySelector('.app-kw').value)||0) * (parseFloat(row.querySelector('.app-hrs').value)||0);
       });
       baseMonthlyLoad = total;
   }

   let extraMonthlyLoad = 0;
   if (document.getElementById('hasFutureLoads').checked) {
       if(document.getElementById('checkEV').checked) extraMonthlyLoad += (parseFloat(document.getElementById('evMonthlyKm').value)||0)/100 * (parseFloat(document.getElementById('evConsumptionRate').value)||0);
       if(document.getElementById('checkHP').checked) extraMonthlyLoad += parseFloat(document.getElementById('hpMonthlyLoad').value) || 0;
       document.querySelectorAll('.custom-load-input').forEach(i => extraMonthlyLoad += parseFloat(i.value) || 0);
   }

   let totalMonthly = baseMonthlyLoad + extraMonthlyLoad;
   let totalYearly = totalMonthly * 12;
   let tariff = parseFloat(document.getElementById('tariffSelect').value);

   document.getElementById('finalMonthlyLoad').textContent = Math.round(totalMonthly).toLocaleString('tr-TR');
   document.getElementById('finalYearlyLoad').textContent = Math.round(totalYearly).toLocaleString('tr-TR');
   document.getElementById('finalMonthlyBill').textContent = (totalMonthly * tariff).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

   const results = document.getElementById('resultsModule');
   results.classList.remove('hidden');
   results.scrollIntoView({ behavior: 'smooth' });
});