// --- MENÜ GEÇİŞLERİ ---
const mainMenu = document.getElementById('mainMenu');
const calculatorModule = document.getElementById('calculatorModule');

document.getElementById('btnGoCalculator').addEventListener('click', () => {
    mainMenu.classList.add('hidden');
    calculatorModule.classList.remove('hidden');
});

document.getElementById('btnBackToMenu').addEventListener('click', () => {
    calculatorModule.classList.add('hidden');
    mainMenu.classList.remove('hidden');
    document.getElementById('resultsModule').classList.add('hidden'); // Geri dönünce sonuçları gizle
});

// --- 12 AYLIK GİRİŞ TABLOSU OLUŞTURMA ---
const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const monthsGrid = document.getElementById('monthsGrid');

months.forEach((month, index) => {
    const div = document.createElement('div');
    div.innerHTML = `
        <label class="block text-xs text-gray-500 mb-1">${month}</label>
        <input type="number" class="month-input w-full p-2 border border-gray-300 rounded outline-none text-sm" value="300">
    `;
    monthsGrid.appendChild(div);
});

// --- EKRAN BÖLÜM SEÇİCİLERİ ---
const radioInputs = document.querySelectorAll('input[name="inputType"]');
const monthlyInputSection = document.getElementById('monthlyInputSection');
const yearlyInputSection = document.getElementById('yearlyInputSection');
const applianceInputSection = document.getElementById('applianceInputSection');

radioInputs.forEach(radio => {
    radio.addEventListener('change', (e) => {
        monthlyInputSection.classList.add('hidden');
        yearlyInputSection.classList.add('hidden');
        applianceInputSection.classList.add('hidden');
        
        if(e.target.value === 'monthly') monthlyInputSection.classList.remove('hidden');
        else if(e.target.value === 'yearly') yearlyInputSection.classList.remove('hidden');
        else if(e.target.value === 'appliances') applianceInputSection.classList.remove('hidden');
    });
});

// --- EŞYA BAZLI HESAPLAMA ---
const appliancesWrapper = document.getElementById('appliancesWrapper');
const quickAddSelect = document.getElementById('quickAddSelect');
const btnAddAppliance = document.getElementById('btnAddAppliance');

const defaultAppliances = [
    { name: 'Buzdolabı', qty: 1, kw: 0.15, hrs: 240 },
    { name: 'Televizyon', qty: 1, kw: 0.1, hrs: 120 },
    { name: 'Çamaşır Makinesi', qty: 1, kw: 0.8, hrs: 20 },
    { name: 'Bulaşık Makinesi', qty: 1, kw: 1.2, hrs: 15 },
    { name: 'Aydınlatma (Tüm Ev)', qty: 10, kw: 0.01, hrs: 150 }
];

function addApplianceRow(name = "", qty = 1, kw = "", hrs = "") {
    const row = document.createElement('div');
    row.className = "appliance-row grid grid-cols-12 gap-2 items-center mt-2 transition-all";
    row.innerHTML = `
        <div class="col-span-4"><input type="text" placeholder="Örn: Fırın" value="${name}" class="w-full p-2 border rounded text-sm"></div>
        <div class="col-span-2"><input type="number" value="${qty}" min="1" class="app-qty w-full p-2 border rounded text-sm text-center"></div>
        <div class="col-span-3"><input type="number" placeholder="kW" value="${kw}" step="0.01" class="app-kw w-full p-2 border rounded text-sm text-center"></div>
        <div class="col-span-2"><input type="number" placeholder="Saat" value="${hrs}" class="app-hrs w-full p-2 border rounded text-sm text-center"></div>
        <div class="col-span-1 text-center"><button class="btn-delete-app text-red-500 font-bold hover:text-red-700 text-lg">&times;</button></div>
    `;
    row.querySelector('.btn-delete-app').addEventListener('click', () => row.remove());
    appliancesWrapper.appendChild(row);
}

defaultAppliances.forEach(app => addApplianceRow(app.name, app.qty, app.kw, app.hrs));

btnAddAppliance.addEventListener('click', () => addApplianceRow());

quickAddSelect.addEventListener('change', (e) => {
    if (e.target.value !== "") {
        const [name, qty, kw, hrs] = e.target.value.split('|');
        addApplianceRow(name, qty, kw, hrs);
        e.target.value = ""; 
    }
});

// --- GELECEK YÜKLER KONTROLLERİ ---
document.getElementById('hasFutureLoads').addEventListener('change', (e) => {
    e.target.checked ? document.getElementById('futureLoadsContainer').classList.remove('hidden') : document.getElementById('futureLoadsContainer').classList.add('hidden');
});

document.getElementById('checkEV').addEventListener('change', (e) => {
    e.target.checked ? document.getElementById('wrapEV').classList.remove('hidden') : document.getElementById('wrapEV').classList.add('hidden');
});

document.getElementById('checkHP').addEventListener('change', (e) => {
    e.target.checked ? document.getElementById('wrapHP').classList.remove('hidden') : document.getElementById('wrapHP').classList.add('hidden');
});

document.getElementById('btnAddCustomLoad').addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = "flex items-center space-x-2 bg-gray-50 p-2 rounded border border-gray-200";
    row.innerHTML = `
        <input type="text" placeholder="Yük Adı (Örn: Havuz)" class="w-1/2 p-2 border border-gray-300 rounded outline-none text-sm">
        <input type="number" placeholder="Aylık (kWh)" class="custom-load-input w-1/3 p-2 border border-gray-300 rounded outline-none text-sm" value="0">
        <button class="btn-delete-load text-red-500 hover:text-red-700 font-bold px-2">X</button>
    `;
    row.querySelector('.btn-delete-load').addEventListener('click', () => row.remove());
    document.getElementById('customLoadsWrapper').appendChild(row);
});

// --- HESAPLAMA MOTORU ---
document.getElementById('btnCalculate').addEventListener('click', () => {
    let baseMonthlyLoad = 0;

    // 1. Baz Yük Hesabı
    const inputType = document.querySelector('input[name="inputType"]:checked').value;
    
    if (inputType === 'monthly') {
        baseMonthlyLoad = parseFloat(document.getElementById('averageMonthlyLoad').value) || 0;
    } 
    else if (inputType === 'yearly') {
        let totalYearlyBase = 0;
        document.querySelectorAll('.month-input').forEach(input => totalYearlyBase += parseFloat(input.value) || 0);
        baseMonthlyLoad = totalYearlyBase / 12;
    }
    else if (inputType === 'appliances') {
        let totalApplianceLoad = 0;
        document.querySelectorAll('.appliance-row').forEach(row => {
            let qty = parseFloat(row.querySelector('.app-qty').value) || 0;
            let kw = parseFloat(row.querySelector('.app-kw').value) || 0;
            let hrs = parseFloat(row.querySelector('.app-hrs').value) || 0;
            totalApplianceLoad += (qty * kw * hrs); 
        });
        baseMonthlyLoad = totalApplianceLoad;
    }

    // 2. Gelecek Yükler Hesabı
    let extraMonthlyLoad = 0;
    if (document.getElementById('hasFutureLoads').checked) {
        if(document.getElementById('checkEV').checked) {
            let evRate = parseFloat(document.getElementById('evConsumptionRate').value) || 0;
            let evKm = parseFloat(document.getElementById('evMonthlyKm').value) || 0;
            extraMonthlyLoad += (evKm / 100) * evRate;
        }
        if(document.getElementById('checkHP').checked) {
            extraMonthlyLoad += parseFloat(document.getElementById('hpMonthlyLoad').value) || 0;
        }
        document.querySelectorAll('.custom-load-input').forEach(input => {
            extraMonthlyLoad += parseFloat(input.value) || 0;
        });
    }

    // 3. Tarife ve Fatura Hesabı
    let totalFinalMonthly = baseMonthlyLoad + extraMonthlyLoad;
    let totalFinalYearly = totalFinalMonthly * 12;
    
    // Seçilen tarifeyi alıyoruz
    let tariffRate = parseFloat(document.getElementById('tariffSelect').value);
    let estimatedMonthlyBill = totalFinalMonthly * tariffRate;

    // 4. Ekrana Yazdırma (Türkçe formatında)
    document.getElementById('finalMonthlyLoad').textContent = Math.round(totalFinalMonthly).toLocaleString('tr-TR');
    document.getElementById('finalYearlyLoad').textContent = Math.round(totalFinalYearly).toLocaleString('tr-TR');
    
    // Faturayı kuruş hanesiyle göster
    document.getElementById('finalMonthlyBill').textContent = estimatedMonthlyBill.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Animasyonla göster ve kaydır
    const results = document.getElementById('resultsModule');
    results.classList.remove('hidden');
    // Animasyonu tetiklemek için ufak bir hile (DOM reflow)
    void results.offsetWidth; 
    results.classList.add('animate-fade-in');
    
    setTimeout(() => {
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
});

// --- PDF E-POSTA SİMÜLASYONU ---
document.getElementById('btnSendPDF').addEventListener('click', () => {
    const email = document.getElementById('customerEmail').value;
    
    if(!email || !email.includes('@')) {
        alert("Lütfen geçerli bir müşteri e-posta adresi giriniz.");
        return;
    }

    const btn = document.getElementById('btnSendPDF');
    btn.innerHTML = "Gönderiliyor...";
    btn.classList.add('bg-gray-500');
    btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
    
    setTimeout(() => {
        btn.innerHTML = `
            <span>✅ Gönderildi</span>
        `;
        btn.classList.remove('bg-gray-500');
        btn.classList.add('bg-green-600', 'hover:bg-green-700');
        alert(`Analiz raporu PDF formatında ${email} adresine başarıyla iletildi.`);
    }, 1500);
});