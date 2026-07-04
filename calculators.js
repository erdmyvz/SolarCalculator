/* ============================================================================
   calculators.js — HESAPLAYICI MODÜLLERİ
   Güç/Fatura Hesaplayıcı (Bölüm 8) ve EV Yük & Solar Şarj Hesaplayıcı (Bölüm 10).
   index.html'de core.js'ten sonra, app.js'ten ÖNCE yüklenmelidir.
   (Klasik script; calculateEVSolar global kalır, app.js yönlendiricisi onu çağırır.)
   ============================================================================ */

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
