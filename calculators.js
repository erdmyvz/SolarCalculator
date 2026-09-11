/* ============================================================================
   calculators.js — HESAPLAYICI MODÜLLERİ
   Güç/Fatura Hesaplayıcı (Bölüm 8) ve EV Yük & Solar Şarj Hesaplayıcı (Bölüm 10).
   index.html'de core.js'ten sonra, app.js'ten ÖNCE yüklenmelidir.
   (Klasik script; calculateEVSolar global kalır, app.js yönlendiricisi onu çağırır.)
   ============================================================================ */

// ============================================================================
// 8. GÜÇ VE FATURA HESAPLAYICI MODÜLÜ (Çekirdek Algoritma)
// ============================================================================

// --- GÜNEŞ ÇÖZÜMÜ REFERANS KATSAYILARI (kolayca güncellenebilir) ---
const SOLAR_YIELD_KWH_PER_KWP = 1500;   // yıllık üretim (Türkiye ortalaması, kWh/kWp)
const ROOF_M2_PER_KWP = 5.5;            // kWp başına yaklaşık çatı alanı (m²)
const KWP_PER_PANEL = 0.55;             // 550 W panel
const CO2_KG_PER_KWH = 0.45;            // şebeke ortalaması (kg CO₂/kWh)

// FİYAT: Fatura Analizi ile AYNI kaynaktan. Eskiden burası pricePerKwp (30.000
// TL/kWp) okuyordu, Fatura Analizi ise usdPerKwp × usdTry (1.000 × 42 = 42.000).
// Aynı ev için biri ₺76.800 diğeri ₺115.500 diyordu — %40 fark. Tek kaynağa alındı.
function tlPerKwp() { return window.epcTlPerKwp ? window.epcTlPerKwp() : 42000; }

// TARİFE: açılır liste artık ayarlardan doluyor. Eskiden değerler HTML'e
// gömülüydü ve ayarlarla çelişiyordu (ticarethane 4,00 yazıyordu ama ayar 3,50;
// sanayi 3,50 yazıyordu ama ayar 3,00; tarımsal hiç yoktu).
const TARIFE_GRUPLARI = [
    { key: 'tariffMesken',      ad: '🏠 Mesken / Ev',        vars: 2.5 },
    { key: 'tariffTicarethane', ad: '🏢 Ticarethane',        vars: 3.5 },
    { key: 'tariffSanayi',      ad: '🏭 Sanayi',             vars: 3.0 },
    { key: 'tariffTarimsal',    ad: '🌾 Tarımsal sulama',    vars: 2.2 }
];
function tarifeListesiniDoldur() {
    const sel = document.getElementById('tariffSelect');
    if (!sel) return;
    const s = window.EPC_SETTINGS || {};
    const secili = sel.value;
    sel.innerHTML = TARIFE_GRUPLARI.map(function (g) {
        const v = Number(s[g.key]) > 0 ? Number(s[g.key]) : g.vars;
        return '<option value="' + v + '">' + g.ad + ' (' +
               v.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' TL/kWh)</option>';
    }).join('');
    if (secili) sel.value = secili;
}

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
            <input type="number" min="0" class="month-input w-full p-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500" placeholder="kWh">
        `;
        monthsGridContainer.appendChild(wrap);
    });
}

// Radyo butonları (Aylık Fatura / Yıllık / Eşya Bazlı) geçişlerini dinle
function girisSekmesiTazele() {
    document.querySelectorAll('input[name="inputType"]').forEach(r => {
        const et = r.closest('.calc-secenek');
        if (et) et.classList.toggle('secili', r.checked);
    });
}
document.querySelectorAll('input[name="inputType"]')?.forEach(radio => {
    radio.addEventListener('change', (e) => {
        document.querySelectorAll('.input-section').forEach(sec => sec.classList.add('hidden'));
        const targetEl = document.getElementById(e.target.value + 'InputSection');
        if (targetEl) targetEl.classList.remove('hidden');
        girisSekmesiTazele();
    });
});
girisSekmesiTazele();

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
// hesapla(sessiz): sessiz=true ise kullanıcı yazarken canlı çalışır — hata
// mesajı basmaz, sonucu da kendiliğinden kaydırmaz.
function hesapla(sessiz) {
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
    let trf = parseFloat(document.getElementById('tariffSelect').value);

    // DOĞRULAMA — eskiden yoktu: -50 kWh girilince "-₺125 fatura" ve 0 kWp'lik
    // bir sonuç paneli çıkıyordu; boş bırakılınca da 0'larla dolu bir rapor.
    const uyari = document.getElementById('calcUyari');
    if (!(sonAylik > 0)) {
        if (!sessiz && uyari) {
            uyari.innerHTML = '<div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 font-bold">' +
                (sonAylik < 0 ? 'Tüketim negatif olamaz.' : 'Hesap için tüketiminizi girin.') + '</div>';
            uyari.classList.remove('hidden');
        }
        document.getElementById('resultsModule').classList.add('hidden');
        return false;
    }
    if (uyari) { uyari.innerHTML = ''; uyari.classList.add('hidden'); }

    let sonYillik = sonAylik * 12;
    let sonFatura = sonAylik * trf;

    // Sonuçları ekrana bas
    if (window.epcSay) {
        window.epcSay(document.getElementById('finalMonthlyLoad'), sonAylik, 0);
        window.epcSay(document.getElementById('finalYearlyLoad'), sonYillik, 0);
        window.epcSay(document.getElementById('finalMonthlyBill'), sonFatura, 2);
    } else {
        document.getElementById('finalMonthlyLoad').textContent = Math.round(sonAylik).toLocaleString('tr-TR');
        document.getElementById('finalYearlyLoad').textContent = Math.round(sonYillik).toLocaleString('tr-TR');
        document.getElementById('finalMonthlyBill').textContent = sonFatura.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // --- GÜNEŞ ÇÖZÜMÜ (referans hesap; değerler admin Ayarlar'dan gelir, yoksa varsayılan) ---
    const _S = window.EPC_SETTINGS || {};
    const _YIELD = Number(_S.solarYield)   > 0 ? Number(_S.solarYield)   : SOLAR_YIELD_KWH_PER_KWP;
    const _ROOF  = Number(_S.roofM2PerKwp) > 0 ? Number(_S.roofM2PerKwp) : ROOF_M2_PER_KWP;
    const _PANEL = Number(_S.kwpPerPanel)  > 0 ? Number(_S.kwpPerPanel)  : KWP_PER_PANEL;
    const _CO2   = Number(_S.co2PerKwh)    > 0 ? Number(_S.co2PerKwh)    : CO2_KG_PER_KWH;

    // Panel adedine yuvarlanıp gerçek güç ondan türetiliyor (Fatura Analizi ile aynı).
    const hamKwp     = sonYillik / _YIELD;
    const panels     = Math.max(1, Math.round(hamKwp / _PANEL));
    const kwp        = panels * _PANEL;
    const roofArea   = kwp * _ROOF;
    const investment = kwp * tlPerKwp();
    const uretim     = kwp * _YIELD;
    const annualSaving = Math.min(uretim, sonYillik) * trf;   // fazla üretim değerlenmez

    // GERİ ÖDEME — core.js'teki ortak model. Eskiden düz bölme yapıyordu
    // (yatırım ÷ yıllık tasarruf) ve aynı girdide Fatura Analizi 6,1 yıl derken
    // burası 8,0 yıl diyordu. Artık ikisi de aynı fonksiyonu çağırıyor.
    const _pb = (window.epcPayback
        ? window.epcPayback({ yatirim: investment, yillikUretim: uretim, birimFiyat: trf })
        : { yil: annualSaving > 0 ? investment / annualSaving : 0, birikim: annualSaving * 25 });
    const payback    = _pb.yil;
    // 25 yıllık toplam BUGÜNKÜ fiyatlarla. epcPayback'in birikimi %25 zamla
    // şişip ₺9,4 milyon gibi nominal bir rakam veriyordu; okuyan bunu bugünkü
    // parayla karıştırır. Aynı gerekçeyle Fatura Analizi'nden de çıkarılmıştı.
    const saving25   = annualSaving * 25;
    const co2Annual  = uretim * _CO2;

    // Raporu (indir/e-posta) ile birlikte kaydedilecek özet
    window.lastCalc = {
        monthly_kwh: Math.round(sonAylik), yearly_kwh: Math.round(sonYillik),
        monthly_bill: Math.round(sonFatura), recommended_kwp: +kwp.toFixed(2),
        est_investment: Math.round(investment), est_annual_saving: Math.round(annualSaving),
        payback_years: payback != null ? +payback.toFixed(1) : null, tariff: trf
    };
    renderSolarSolution({ kwp, roofArea, panels, investment, annualSaving, payback, saving25, co2Annual });

    document.getElementById('resultsModule').classList.remove('hidden');
    if (!sessiz) document.getElementById('resultsModule').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
}

document.getElementById('btnCalculate')?.addEventListener('click', () => hesapla(false));

// ============================================================================
// GÜNEŞ ÇÖZÜMÜ RAPORU + POTANSİYEL MÜŞTERİ YAKALAMA
// (rapor ve form JS ile enjekte edilir; index.html'e dokunulmaz)
// ============================================================================

// Güneş çözümü panelini rapor içine basar
function renderSolarSolution(v) {
    const report = document.getElementById('reportContent');
    if (!report) return;
    let block = document.getElementById('solarSolutionBlock');
    if (!block) {
        block = document.createElement('div');
        block.id = 'solarSolutionBlock';
        block.className = 'mt-6 pt-6 border-t border-slate-200';
        report.appendChild(block);
    }
    const fmt = n => Math.round(n).toLocaleString('tr-TR');
    block.innerHTML = `
        <h3 class="text-lg font-black text-slate-800 mb-1">☀️ Size Özel Güneş Çözümü</h3>
        <p class="text-xs text-slate-400 mb-4">Aşağıdaki değerler tüketiminize göre üretilmiş <strong>referans tahminlerdir</strong>; kesin proje ve fiyat için ücretsiz çatı keşfi gerekir.</p>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-emerald-50 border border-emerald-100 p-4 rounded-xl"><p class="text-[11px] text-slate-500 font-bold mb-1">Önerilen Sistem</p><p class="text-2xl font-black text-emerald-700">${v.kwp.toFixed(1)}<span class="text-sm"> kWp</span></p></div>
            <div class="bg-slate-50 border border-slate-100 p-4 rounded-xl"><p class="text-[11px] text-slate-500 font-bold mb-1">Panel Sayısı</p><p class="text-2xl font-black text-slate-700">${v.panels}<span class="text-sm"> adet</span></p></div>
            <div class="bg-slate-50 border border-slate-100 p-4 rounded-xl"><p class="text-[11px] text-slate-500 font-bold mb-1">Gerekli Çatı Alanı</p><p class="text-2xl font-black text-slate-700">${Math.round(v.roofArea)}<span class="text-sm"> m²</span></p></div>
            <div class="bg-slate-50 border border-slate-100 p-4 rounded-xl"><p class="text-[11px] text-slate-500 font-bold mb-1">Yıllık CO₂ Azaltımı</p><p class="text-2xl font-black text-slate-700">${(v.co2Annual/1000).toFixed(1)}<span class="text-sm"> ton</span></p></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div class="bg-white border border-slate-200 p-4 rounded-xl"><p class="text-[11px] text-slate-500 font-bold mb-1">Tahmini Yatırım (referans)</p><p class="text-2xl font-black text-slate-800">₺${fmt(v.investment)}</p></div>
            <div class="bg-white border border-slate-200 p-4 rounded-xl"><p class="text-[11px] text-slate-500 font-bold mb-1">Yıllık Tasarruf</p><p class="text-2xl font-black text-emerald-600">₺${fmt(v.annualSaving)}</p></div>
            <div class="bg-slate-900 text-white p-4 rounded-xl"><p class="text-[11px] text-slate-300 font-bold mb-1">Kendini Amorti (yaklaşık)</p><p class="text-2xl font-black text-yellow-400">${v.payback>0?v.payback.toFixed(1):'25+'}<span class="text-sm text-slate-300"> yıl</span></p></div>
        </div>
        <div class="mt-4 bg-emerald-600 text-white p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3">
            <div><p class="font-black">25 yılda tahmini toplam tasarruf: ₺${fmt(v.saving25)} <span class="font-medium text-emerald-100">(bugünkü fiyatlarla)</span></p><p class="text-emerald-100 text-xs">Güneş her gün bedava; beklemek fatura ödemeye devam etmek demektir.</p></div>
            <button onclick="openLeadModal('kurulum')" class="bg-white text-emerald-700 font-black px-5 py-3 rounded-lg whitespace-nowrap hover:bg-emerald-50">Ücretsiz Çatı Keşfi ›</button>
        </div>`;
}

// Gerçek PDF indirme
async function runPdfDownload() {
    const element = document.getElementById('reportContent');
    if (!element) return;
    // html2pdf (884 KB) artık ilk açılışta gelmiyor; yalnız burada indiriliyor.
    try { await window.epcLoadPdf(); }
    catch (e) { alert('PDF kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.'); return; }
    const opt = {
        margin: 0.4, filename: 'Solar_GES_Raporu.pdf',
        image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}

// Bilgi toplama modalını (bir kez) oluşturur
function ensureProspectModal() {
    let m = document.getElementById('prospectModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'prospectModal';
    m.className = 'hidden fixed inset-0 z-[70] bg-slate-900/60 flex items-center justify-center p-4';
    m.innerHTML = `
        <div class="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div class="flex justify-between items-start mb-1">
                <h3 class="text-lg font-black text-slate-800">Raporunuz hazır 🎉</h3>
                <button type="button" id="pmClose" class="text-2xl text-slate-400 leading-none">&times;</button>
            </div>
            <p class="text-xs text-slate-500 mb-4">Raporunuzu iletebilmemiz ve size özel değerlendirme sunabilmemiz için bilgilerinizi bırakın.</p>
            <div class="space-y-3">
                <input id="pmName" type="text" placeholder="Ad Soyad" class="w-full p-3 border border-slate-300 rounded-lg text-sm">
                <input id="pmEmail" type="email" placeholder="E-posta *" class="w-full p-3 border border-slate-300 rounded-lg text-sm">
                <input id="pmPhone" type="tel" placeholder="Telefon" class="w-full p-3 border border-slate-300 rounded-lg text-sm">
                <label class="flex items-start gap-2 text-[11px] text-slate-500"><input id="pmConsent" type="checkbox" class="mt-0.5"> <span>Güneş enerjisi çözümleri hakkında bilgilendirme e-postaları almayı kabul ediyorum.</span></label>
            </div>
            <button type="button" id="pmSubmit" class="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg">Raporu Al</button>
            <p class="text-[10px] text-slate-400 mt-2 text-center">Bilgileriniz yalnız size dönüş amacıyla kullanılır.</p>
        </div>`;
    document.body.appendChild(m);
    m.querySelector('#pmClose').addEventListener('click', () => m.classList.add('hidden'));
    m.querySelector('#pmSubmit').addEventListener('click', submitProspectCapture);
    return m;
}

let prospectIntent = 'pdf';
window.openProspectCapture = function(intent) {
    if (!window.lastCalc) { alert('Lütfen önce "SİSTEMİ HESAPLA" ile raporu oluşturun.'); return; }
    prospectIntent = intent || 'pdf';
    const m = ensureProspectModal();
    const pre = document.getElementById('customerEmail')?.value?.trim();
    if (pre) m.querySelector('#pmEmail').value = pre;
    m.querySelector('#pmSubmit').textContent = intent === 'email' ? 'Raporu İste' : 'Raporu İndir';
    m.classList.remove('hidden');
};

async function submitProspectCapture() {
    const m = document.getElementById('prospectModal');
    const name = m.querySelector('#pmName').value.trim();
    const email = m.querySelector('#pmEmail').value.trim();
    const phone = m.querySelector('#pmPhone').value.trim();
    const consent = m.querySelector('#pmConsent').checked;
    if (!email) { alert('Lütfen e-posta adresinizi girin.'); return; }
    if (!consent) { alert('Devam etmek için bilgilendirme onayını işaretleyin.'); return; }

    const btn = m.querySelector('#pmSubmit'); const t = btn.textContent;
    btn.textContent = 'Gönderiliyor...'; btn.disabled = true;
    try {
        const c = window.lastCalc || {};
        if (supabaseClient) {
            const { error } = await supabaseClient.rpc('submit_prospect', {
                p_full_name: name || null, p_email: email, p_phone: phone || null, p_city: null,
                p_monthly_kwh: c.monthly_kwh ?? null, p_yearly_kwh: c.yearly_kwh ?? null,
                p_monthly_bill: c.monthly_bill ?? null, p_recommended_kwp: c.recommended_kwp ?? null,
                p_est_investment: c.est_investment ?? null, p_est_annual_saving: c.est_annual_saving ?? null,
                p_payback_years: c.payback_years ?? null, p_tariff: c.tariff ?? null,
                p_consent: consent, p_company_id: null
            });
            if (error) throw error;
        }
        m.classList.add('hidden');
        if (prospectIntent === 'email') {
            alert('✅ Bilgileriniz alındı! Uzman ekibimiz raporunuz ve size özel değerlendirmeyle en kısa sürede ulaşacak.');
        } else {
            // await: html2pdf tembel yükleniyor, buton "İndiriliyor" halinde kalsın
            await runPdfDownload();
        }
    } catch (err) {
        alert('Bir sorun oluştu: ' + (err.message || err));
    } finally {
        btn.textContent = t; btn.disabled = false;
    }
}

// Rapor butonları artık önce bilgi toplar
document.getElementById('btnDownloadPDF')?.addEventListener('click', () => openProspectCapture('pdf'));
document.getElementById('btnSendEmail')?.addEventListener('click', () => openProspectCapture('email'));

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

document.querySelectorAll('.ev-reactive-input').forEach(input => input.addEventListener('input', () => calculateEVSolar()));

window.calculateEVSolar = function() {
    // Tarife varsayılanı da ayarlardan (tariffMesken); sabit 2,50 ayarla çelişiyordu.
    const _vt = Number((window.EPC_SETTINGS || {}).tariffMesken) > 0 ? Number(window.EPC_SETTINGS.tariffMesken) : 2.50;
    const tariff = parseFloat(document.getElementById('evCalcTariff')?.value) || _vt;
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

// İlk yüklemede "Akıllı öneri sistemi yükleniyor..." placeholder'ı yerine
// varsayılan değerlerle gerçek öneri/sonuçları göster (tüm erişimler korumalı).
try { calculateEVSolar(); } catch (e) { /* modül DOM'da yoksa sessiz geç */ }

// ============================================================================
// CANLI HESAPLAMA VE SAYI ANİMASYONU
// Eskiden kullanıcı her şeyi doldurup "Hesapla"ya basmadan hiçbir şey
// görmüyordu — bir girdiyi değiştirip etkisini merak ettiğinde yine butona
// basması gerekiyordu. Artık yazdıkça sonuç güncelleniyor; buton, sonucu
// görünür kılmak ve oraya kaydırmak için duruyor.
// ============================================================================
(function () {
    'use strict';
    var kalem = null;

    function canli() {
        clearTimeout(kalem);
        kalem = setTimeout(function () {
            // Sonuç daha hiç açılmadıysa canlı güncelleme yapma: kullanıcı
            // ilk sonucu kendi iradesiyle (butonla) görsün.
            var res = document.getElementById('resultsModule');
            if (!res || res.classList.contains('hidden')) return;
            hesapla(true);
        }, 260);
    }

    function bagla() {
        var kap = document.getElementById('calculatorModule');
        if (!kap || kap.dataset.canliBagli === '1') return;
        kap.dataset.canliBagli = '1';
        kap.addEventListener('input', function (e) {
            if (e.target.matches('input,select')) canli();
        });
        kap.addEventListener('change', function (e) {
            if (e.target.matches('input,select')) canli();
        });
    }

    // --- Sayıların hedefe doğru sayması ---------------------------------
    // Sonuç kutuları bir anda değişince göz fark etmiyor; kısa bir sayma
    // animasyonu neyin değiştiğini görünür kılıyor.
    function say(el, hedef, ondalik, sure) {
        if (!el) return;
        var bas = parseFloat(String(el.dataset.sayiSon || '0')) || 0;
        if (bas === hedef) return;
        el.dataset.sayiSon = String(hedef);

        // Animasyonu ATLAMA durumları: hareket azaltma tercihi ya da sekme
        // arka planda. Arka planda requestAnimationFrame çalışmaz; animasyona
        // güvenirsek ekranda ESKİ değer kalır — yanlış sayı göstermektense
        // animasyonsuz doğru sayı göstermek yeğdir.
        if (document.visibilityState === 'hidden' ||
            (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
            el.textContent = bicim(hedef, ondalik); return;
        }

        var t0 = performance.now(), sr = sure || 420;
        var bitti = false;
        function adim(t) {
            if (bitti) return;
            var o = Math.min(1, (t - t0) / sr);
            var e = 1 - Math.pow(1 - o, 3);                 // yumuşak yavaşlama
            el.textContent = bicim(bas + (hedef - bas) * e, ondalik);
            if (o < 1) requestAnimationFrame(adim); else bitti = true;
        }
        requestAnimationFrame(adim);
        // GÜVENLİK AĞI: rAF hiç çalışmazsa (sekme gizlenirse, tarayıcı
        // kısarsa) doğru değer yine de yazılsın.
        clearTimeout(el._sayiSon);
        el._sayiSon = setTimeout(function () {
            if (bitti) return;
            bitti = true;
            el.textContent = bicim(hedef, ondalik);
        }, sr + 80);
    }
    function bicim(n, ondalik) {
        return ondalik
            ? n.toLocaleString('tr-TR', { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik })
            : Math.round(n).toLocaleString('tr-TR');
    }
    window.epcSay = say;

    function baslat() { bagla(); tarifeListesiniDoldur(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', baslat);
    else baslat();
    // Ayarlar Supabase'ten sonradan gelirse tarife listesini tazele.
    window.addEventListener('epc-settings-loaded', tarifeListesiniDoldur);
})();
