/* ============================================================================
   4. Ziyaretçi: başvuru (lead) + takip modülü
   Bölünmüş modül dosyası. index.html'de core.js'ten sonra, ORİJİNAL SIRAYLA
   yüklenmelidir. Klasik script olduğu için tüm fonksiyonlar küresel kalır.
   ============================================================================ */

// ============================================================================
// 4. MÜŞTERİ YAKALAMA (LEAD GENERATION) VE TAKİP MODÜLÜ (ZİYARETÇİ EKRANI)
// ============================================================================
// Modal açma fonksiyonunu güncelleyelim
window.openLeadModal = function(type) {
    const modal = document.getElementById('leadModal');
    if (!modal) return;
    
    document.getElementById('leadType').value = type;
    document.getElementById('leadModalTitle').innerText = type === 'kurulum' ? 'Ücretsiz Çatı Keşfi Başvurusu' : 'Teknik Servis Müdahale Başvurusu';
    
    // Z-index ve görünürlük zorunlu kılınsıyor
    modal.classList.remove('hidden');
    modal.classList.add('flex'); // hidden yerine flex kullanarak gösteriyoruz
    
    const kurulumFields = document.getElementById('kurulumExtraFields');
    const servisFields = document.getElementById('servisExtraFields');
    const servisWarning = document.getElementById('servisWarningBanner');
    
    if (type === 'kurulum') {
        kurulumFields?.classList.remove('hidden');
        servisFields?.classList.add('hidden');
        servisWarning?.classList.add('hidden');
        document.getElementById('leadDetailsLabel').innerText = "Detaylar / Notlar";
    } else {
        kurulumFields?.classList.add('hidden');
        servisFields?.classList.remove('hidden');
        servisWarning?.classList.remove('hidden');
        document.getElementById('leadDetailsLabel').innerText = "Yaşadığınız Sorunun Detaylı Özeti";
    }
};

// Modal kapatma fonksiyonu
window.closeLeadModal = function() { 
    const modal = document.getElementById('leadModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.getElementById('leadPublicForm')?.reset();
};



document.getElementById('leadPublicForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('leadType').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = btn.textContent;
    btn.textContent = "Gönderiliyor...";
    btn.disabled = true;

    if (!supabaseClient) {
        alert("Veritabanı bağlantısı yok. Lütfen daha sonra tekrar deneyin.");
        btn.textContent = originalBtnText; btn.disabled = false;
        return;
    }

    try {
        // =====================================================================
        // A. TEKNİK SERVİS / BAKIM BAŞVURUSU  ->  submit_service_request RPC
        // =====================================================================
        if (type === 'servis') {
            // 1) Görselleri Storage'a yükle (varsa)
            async function uploadImage(inputId, prefix) {
                const fileInput = document.getElementById(inputId);
                if (!fileInput || !fileInput.files || fileInput.files.length === 0) return null;
                const file = fileInput.files[0];
                const fileName = `${prefix}_${Date.now()}.${file.name.split('.').pop()}`;
                const { error } = await supabaseClient.storage.from('support-images').upload(fileName, file);
                return error ? null : fileName;
            }
            const [imgSys, imgPano, imgGes, imgCode] = await Promise.all([
                uploadImage('srvImgSystem', 'sistem'),
                uploadImage('srvImgPano', 'pano'),
                uploadImage('srvImgGes', 'ges'),
                uploadImage('srvImgCode', 'hata')
            ]);

            // 2) Güvenli RPC fonksiyonunu çağır -> geriye takip kodu döner
            const { data: code, error } = await supabaseClient.rpc('submit_service_request', {
                p_request_type: document.getElementById('srvRequestType')?.value || 'ariza',
                p_full_name:    document.getElementById('leadName').value,
                p_phone:        document.getElementById('leadPhone').value,
                p_email:        document.getElementById('leadEmail').value,
                p_address:      document.getElementById('leadAddress').value,
                p_inverter_model: document.getElementById('srvInverter').value,
                p_battery_model:  document.getElementById('srvBattery').value,
                p_installer_name: document.getElementById('srvInstaller').value,
                p_install_date:   document.getElementById('srvInstallDate').value || null,
                p_problem_date:   document.getElementById('srvProblemDate').value || null,
                p_problem_desc:   document.getElementById('leadDetails').value,
                p_img_system: imgSys, p_img_pano: imgPano, p_img_ges: imgGes, p_img_code: imgCode,
                p_facility_code: (document.getElementById('srvFacilityCode')?.value || '').trim() || null,
                p_company_id: null
            });
            if (error) throw error;

            alert(`🔧 Servis talebiniz iletildi!\n\nTakip Kodunuz: ${code}\nBu kod ile anasayfadan durumu izleyebilirsiniz.`);
            closeLeadModal();
            document.getElementById('srvTrackBox')?.setAttribute('open', '');
            document.getElementById('leadTrackInput').value = code;
            document.getElementById('btnTrackQuery').click();
            return;
        }

        // =====================================================================
        // B. YENİ GES KURULUM BAŞVURUSU  ->  submit_lead RPC (Merkezi Havuz)
        // =====================================================================
        const outage = document.getElementById('leadOutage').value;
        const evHp   = document.getElementById('leadExtraConsumption').value || 'Yok';
        const notes  = `[Şebeke Kesintisi: ${outage}] | [Gelecekte İlave Yük: ${evHp}]\n\nMüşteri Notu: ${document.getElementById('leadDetails').value}`;

        const { data: code, error } = await supabaseClient.rpc('submit_lead', {
            p_full_name: document.getElementById('leadName').value,
            p_phone:     document.getElementById('leadPhone').value,
            p_email:     document.getElementById('leadEmail').value,
            p_address:   document.getElementById('leadAddress').value,
            p_outage:    outage,
            p_extra_consumption: evHp,
            p_notes:     notes,
            p_company_id: null,       // null = Merkezi Havuz (admin bir firmaya atar)
            p_source:    'website'
        });
        if (error) throw error;

        // KVKK onay kaydı (ispat yükü) — hata olsa bile başvuruyu engellemez
        try {
            await supabaseClient.rpc('log_consent', {
                p_context:  'lead',
                p_full_name: document.getElementById('leadName').value,
                p_phone:     document.getElementById('leadPhone').value,
                p_email:     document.getElementById('leadEmail').value,
                p_reference: String(code || ''),
                p_kvkk:      !!document.getElementById('leadKvkk')?.checked,
                p_marketing: !!document.getElementById('leadConsent')?.checked,
                p_version:   'v1',
                p_agent:     navigator.userAgent
            });
        } catch (e) { /* sessiz geç */ }

        // Takip kodu yerine hesap-temelli takip: e-postaya tek tıklık giriş bağlantısı.
        // ÖNEMLİ: Değerleri formu KAPATMADAN önce oku — closeLeadModal() formu .reset() ile sıfırlıyor.
        const _lEmail = document.getElementById('leadEmail').value;
        const _lName  = document.getElementById('leadName').value;
        const _lPhone = document.getElementById('leadPhone').value;
        closeLeadModal();
        let _mail = { ok: false, error: '' };
        try { _mail = await sendInvestorMagicLink(_lEmail, _lName, _lPhone); } catch (e) { _mail = { ok: false, error: String(e && e.message || e) }; }
        if (_mail.ok) {
            alert(`🎉 Başvurunuz Başarıyla İletildi!\n\n📬 ${_lEmail} adresine YATIRIMCI PANELİ giriş bağlantısı gönderdik.\nE-postanızdaki bağlantıya tıklayın: başvurunuz hesabınıza otomatik bağlanır; süreci adım adım izler, gelen teklifleri tek ekranda karşılaştırırsınız.\n\nBağlantı birkaç dakika içinde gelmezse spam/gereksiz klasörünü kontrol edin.`);
        } else {
            alert(`🎉 Başvurunuz Başarıyla İletildi!\n\nSüreci takip etmek için ana sayfadaki "Giriş Yap" ile ${_lEmail} adresinizi kullanarak hesap oluşturabilirsiniz.` + (_mail.error ? `\n\n(Not: Giriş bağlantısı gönderilemedi — ${_mail.error})` : ''));
        }

    } catch (err) {
        alert("Başvuru gönderilemedi: " + (err.message || err));
    } finally {
        btn.textContent = originalBtnText;
        btn.disabled = false;
    }
});


document.getElementById('btnTrackQuery')?.addEventListener('click', async () => {
    const code = document.getElementById('leadTrackInput').value.trim();
    const display = document.getElementById('trackResultDisplay');
    if(!code) return;

    display.className = "mt-4 p-4 rounded-xl text-sm font-bold bg-white text-slate-800 border border-slate-200";
    display.innerHTML = "Sistemde aranıyor...";
    display.classList.remove('hidden');

    if (!supabaseClient) {
        display.innerHTML = `<span class="text-red-500 font-bold">Veritabanı bağlantısı yok.</span>`;
        return;
    }

    // Durum kodunu okunabilir etikete çevirmek için ortak sözlük
    const statusText = (s) => (crmStatusLabels[s] && crmStatusLabels[s].text) || s;

    try {
        // Tek güvenli fonksiyon hem EPC- (kurulum) hem SRV- (servis) kodlarını çözer
        const { data, error } = await supabaseClient.rpc('track_application', { p_code: code });
        if (error) throw error;

        if (!data) {
            display.innerHTML = `<span class="text-red-500 font-bold">Kayıt Bulunamadı.</span> Lütfen EPC- veya SRV- ile başlayan takip kodunuzu doğru girdiğinizden emin olun.`;
            return;
        }

        const dateText = new Date(data.created_at).toLocaleString('tr-TR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
        const firstName = (data.full_name || '').split(' ')[0];

        if (data.kind === 'service') {
            display.innerHTML = `
                <div class="flex flex-col space-y-2">
                    <div class="flex justify-between border-b pb-2">
                        <span class="text-slate-500">Sayın ${firstName}</span>
                        <span class="text-xs text-slate-400 font-mono">${dateText}</span>
                    </div>
                    <div class="flex items-center gap-2 mt-2">
                        <span class="bg-red-100 text-red-800 px-3 py-1 rounded border border-red-200 text-xs uppercase tracking-wider">Durum:</span>
                        <span class="font-black text-slate-700">${statusText(data.status)}</span>
                    </div>
                    ${data.admin_response
                        ? `<p class="text-xs bg-slate-50 p-2 rounded mt-2 border border-slate-200"><strong>🔧 Merkez Yanıtı:</strong> ${data.admin_response}</p>`
                        : `<p class="text-xs text-slate-500 mt-2 italic">Teknik ekibimiz dosyanızı inceliyor, size geri dönüş yapılacaktır.</p>`}
                </div>`;
        } else {
            display.innerHTML = `
                <div class="flex flex-col space-y-2">
                    <div class="flex justify-between border-b pb-2">
                        <span class="text-slate-500">Sayın ${firstName}</span>
                        <span class="text-xs text-slate-400 font-mono">${dateText}</span>
                    </div>
                    <div class="flex items-center gap-2 mt-2">
                        <span class="bg-emerald-100 text-emerald-800 px-3 py-1 rounded border border-emerald-200 text-xs uppercase tracking-wider">Durum:</span>
                        <span class="font-black text-slate-700">${statusText(data.status)}</span>
                    </div>
                    <p class="text-xs text-slate-500 mt-2 italic">Müşteri temsilcimiz dosyanız üzerinde çalışıyor, size en kısa sürede ulaşılacaktır.</p>
                </div>`;
        }
    } catch (err) {
        display.innerHTML = `<span class="text-red-500 font-bold">Sorgu hatası:</span> ${err.message || err}`;
    }
});






// ============================================================================
// ANA MENÜ BUTONLARI VE SAYFA GEÇİŞLERİ YÖNETİMİ
// ============================================================================
const menuMap = {
    'btnGoEducation': 'educationModule',
    'btnGoRegulations': 'regulationsModule',
    'btnGoCRM': 'crmModule',
    'btnGoCalculator': 'calculatorModule',
    'btnGoSimulation': 'simulationModule',
    'btnGoEVCalc': 'evCalcModule',
    'btnGoTechSupport': 'techSupportModule'
};

for (const [btnId, modId] of Object.entries(menuMap)) {
    const btn = document.getElementById(btnId);
    if(btn) {
        btn.addEventListener('click', () => {
            window.openedFromPublic = false; // YENİ: Kullanıcının yönetim panelinden girdiğini belirttik
            
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
            if(modId === 'crmModule' && typeof crmLoadLeads === 'function') {
                crmLoadLeads();
            }
        });
    }
}

// Geri dön butonlarının id listesi
const backButtons = [
    'btnBackFromCalc', 'btnBackFromSim', 'btnBackFromEV', 'btnBackFromEdu',
    'btnBackToMenuFromSupport', 'btnBackToMenuFromSales', 'btnBackToMenuFromAdmin',
    'btnBackToMenuFromCRM', 'btnBackToMenuFromCompanyMgmt', 'btnBackToMenuFromReg'
];
backButtons.forEach(id => { 
    document.getElementById(id)?.addEventListener('click', closeAllAndShowMenu); 
});

// ============================================================================
// HERO HIZLI HESAP — ziyaretçi ilk ekran (ana hesaplayıcıyla aynı formül)
// ============================================================================
window.heroQuickCalc = function () {
    const billEl = document.getElementById('heroBill'), box = document.getElementById('heroResult');
    if (!billEl || !box) return;
    const bill = parseFloat(billEl.value) || 0;
    const tariff = parseFloat(document.getElementById('heroTariff')?.value) || 2.5;
    box.classList.remove('hidden');
    if (bill <= 0) { box.innerHTML = '<p class="mt-4 text-amber-300 text-sm font-bold">Lütfen aylık fatura tutarınızı girin.</p>'; return; }

    const S = window.EPC_SETTINGS || {};
    const YIELD = S.solarYield  || (typeof SOLAR_YIELD_KWH_PER_KWP !== 'undefined' ? SOLAR_YIELD_KWH_PER_KWP : 1500);
    // ⚠️ EskiDEN pricePerKwp (30.000 TL/kWp) okuyordu; hesaplayıcılar ve fatura
    // analizi ise epcTlPerKwp() (usdPerKwp × usdTry) kullanıyor. Ziyaretçi ana
    // sayfada bir yatırım tutarı, hesaplayıcıda %40 farklı bir tutar görüyordu.
    // Tek kaynak: core.js.
    const PRICE = window.epcTlPerKwp ? window.epcTlPerKwp()
                : (S.pricePerKwp || (typeof REF_PRICE_PER_KWP_TL !== 'undefined' ? REF_PRICE_PER_KWP_TL : 30000));
    const PANEL = S.kwpPerPanel || (typeof KWP_PER_PANEL           !== 'undefined' ? KWP_PER_PANEL           : 0.55);

    const monthlyKwh = bill / tariff, yearlyKwh = monthlyKwh * 12;
    const kwp = yearlyKwh / YIELD;
    const panels = Math.max(1, Math.ceil(kwp / PANEL));
    const investment = kwp * PRICE;
    const annualSaving = bill * 12;

    // EPDK kaynakları tek yerde: hem buradaki madde listesi hem yönetici uyarısı
    // aynı bağlantıyı gösteriyor.
    const EPDK_TABLO  = 'https://www.epdk.gov.tr/Detay/Icerik/3-1327/elektrik-faturalarina-esas-tarife-tablolari';
    const EPDK_FATURA = 'https://lisans.epdk.gov.tr/epvys-web/faces/pages/online/tarifeFatura/tarifeFatura.xhtml';
    const TARIFE_TARIHI = '4 Nisan 2026';

    // Panel başına ~2,5 m² (çerçeve + montaj boşluğu dahil kaba değer).
    const PANEL_M2 = 2.5;
    const roofM2 = panels * PANEL_M2;

    // AMORTİSMAN — sitenin her yerindeki motorla aynı (core.js/epcPayback):
    // elektrik zammı ve panel yıpranması modellenir. Buradaki hesap ESKİDEN
    // düz bölme yapıyordu (yatırım ÷ yıllık tasarruf); aynı fatura için ana
    // sayfa ~10,7 yıl, hesaplayıcı ~5,5 yıl diyordu. Tek motor.
    let payback = null;
    if (window.epcPayback && annualSaving > 0) {
        const r = window.epcPayback({ yatirim: investment, yillikUretim: yearlyKwh, birimFiyat: tariff, yil: 25 });
        payback = r && r.yil;
    }
    if (payback == null && annualSaving > 0) payback = investment / annualSaving;

    const fmt = n => Math.round(n).toLocaleString('tr-TR');
    const sure = (y) => (y == null) ? '—' : (window.epcSureMetni ? window.epcSureMetni(y) : y.toFixed(1) + ' yıl');

    // Ana hesaplayıcıyla aynı özet nesnesi (rapor/lead akışları bunu kullanır)
    window.lastCalc = {
        monthly_kwh: Math.round(monthlyKwh), yearly_kwh: Math.round(yearlyKwh),
        monthly_bill: Math.round(bill), recommended_kwp: +kwp.toFixed(2),
        est_investment: Math.round(investment), est_annual_saving: Math.round(annualSaving),
        payback_years: payback == null ? null : +payback.toFixed(1), tariff: tariff,
        est_roof_m2: Math.round(roofM2), panels: panels
    };

    // Kutucuk. Beş kutu yan yana geldiği için değer yazısı sabit büyük
    // olamıyordu: "₺233.088" ve "4 yıl 4 ay" komşu kutunun üstüne taşıyordu.
    // Boyut kutuya göre küçülüyor ve metin kırılabiliyor.
    const tile = (label, value, unit, accent) =>
        `<div class="bg-white/10 border border-white/15 rounded-xl px-2 py-3 text-center min-w-0">
            <p class="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1 leading-tight">${label}</p>
            <p class="font-black ${accent} leading-tight whitespace-nowrap" style="font-size:clamp(.95rem,2vw,1.4rem)">${value}<span class="text-[11px] font-bold text-slate-300 ml-0.5">${unit}</span></p>
        </div>`;

    box.innerHTML = `
        <div class="mt-5 pt-5 border-t border-white/15 animate-fade-in">
            <!-- DÜZEN: sol sütun fiziksel (ne kurulacak), sağ sütun finansal
                 (ne kazandırır). Sistem maliyeti tek başına tam genişlikte —
                 müşterinin ilk baktığı rakam ve uzun bir sayı. -->
            <div class="grid grid-cols-2 gap-2 mb-2">
                ${tile('Önerilen Sistem', kwp.toFixed(1), 'kWp', 'text-emerald-300')}
                ${tile('Tahmini Tasarruf', '₺' + fmt(annualSaving), '/yıl', 'text-amber-300')}
                ${tile('Tahmini Çatı Alanı', fmt(roofM2), 'm²', 'text-white')}
                ${tile('Amortisman', sure(payback), '', 'text-white')}
            </div>
            <div class="mb-4">
                ${tile('Sistem Maliyeti (kabaca)', '₺' + fmt(investment), '', 'text-white')}
            </div>

            <ul class="text-[11px] text-slate-400 leading-relaxed mb-4 space-y-1.5">
                <li class="flex gap-2"><span class="text-amber-400/70 shrink-0">•</span><span>Birim fiyatlar <b class="text-slate-300">EPDK ${TARIFE_TARIHI}</b> tarifesinden (vergiler dahil).</span></li>
                <li class="flex gap-2"><span class="text-amber-400/70 shrink-0">•</span><span><a href="${EPDK_TABLO}" target="_blank" rel="noopener noreferrer" class="text-amber-300 font-bold underline">Güncel tarife tablosu ↗</a></span></li>
                <li class="flex gap-2"><span class="text-amber-400/70 shrink-0">•</span><span><a href="${EPDK_FATURA}" target="_blank" rel="noopener noreferrer" class="text-amber-300 font-bold underline">Faturanızı EPDK'dan doğrulayın ↗</a></span></li>
                <li class="flex gap-2"><span class="text-amber-400/70 shrink-0">•</span><span>Sistem, yıllık ${fmt(yearlyKwh)} kWh tüketiminizi karşılayacak biçimde boyutlandırıldı (${fmt(YIELD)} kWh/kWp Türkiye ortalaması).</span></li>
                <li class="flex gap-2"><span class="text-amber-400/70 shrink-0">•</span><span>Çatı alanı, ≈ ${panels} panel × ~${PANEL_M2} m² kabulüyle hesaplanmıştır; çatı yönü ve gölgelenme gerçek alanı değiştirir.</span></li>
                <li class="flex gap-2"><span class="text-amber-400/70 shrink-0">•</span><span><b class="text-slate-300">Sistem maliyeti kabaca hesaplanmıştır</b> — kurulacak marka/model, çatı tipi, mesafe ve işçiliğe göre belirgin biçimde değişir; bağlayıcı değildir.</span></li>
                <li class="flex gap-2"><span class="text-amber-400/70 shrink-0">•</span><span>Amortisman, yıllık %${Math.round((window.epcEnflasyon ? window.epcEnflasyon() : 0.25) * 100)} elektrik zammı ve panel yıpranması varsayımıyla hesaplanır.</span></li>
                <li class="flex gap-2"><span class="text-amber-400/70 shrink-0">•</span><span>Tasarruf, üretilen elektriğin tamamının kendi tüketiminizi karşıladığı kabulüyle; fazla üretimin şebekeye satışı farklı fiyatlanır.</span></li>
                <li class="flex gap-2"><span class="text-amber-400/70 shrink-0">•</span><span>Tümü Türkiye ortalama değerleriyle <b class="text-slate-300">yaklaşık hesaptır</b>; kesin sonuç için çatı keşfi gerekir.</span></li>
            </ul>

            <div class="flex flex-col sm:flex-row gap-2">
                <button onclick="openPublicModule('calculatorModule')" class="flex-1 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold py-3 rounded-xl transition">🔎 Detaylı Hesap Yap</button>
                <button onclick="heroGoLead()" class="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-black py-3 rounded-xl transition shadow-lg">📩 Ücretsiz Çatı Keşfi İste</button>
            </div>
        </div>`;
};

// Hesap sonucundan doğrudan keşif başvurusu — hesap özeti nota işlenir
window.heroGoLead = function () {
    if (typeof openLeadModal === 'function') openLeadModal('kurulum');
    const c = window.lastCalc;
    if (!c) return;
    const summary = `[Hızlı hesap] Aylık fatura: ${c.monthly_bill} TL · Önerilen sistem: ${c.recommended_kwp} kWp · Tahmini çatı alanı: ${c.est_roof_m2} m² (${c.panels} panel) · Tahmini yıllık tasarruf: ${c.est_annual_saving} TL · Amortisman: ${c.payback_years == null ? '—' : c.payback_years + ' yıl'}`;
    const dt = document.getElementById('leadDetails') || document.getElementById('leadNotes') || document.querySelector('#leadPublicForm textarea');
    if (dt && !String(dt.value || '').trim()) dt.value = summary;
};

// ============================================================================
// GÜVEN ŞERİDİ — canlı sayaçlar (yalnızca anlamlı seviyede gösterilir)
// ============================================================================
const TRUST_MIN = 3;   // bu sayının altındaki değerler gösterilmez (rakam şişirmemek için)

function trustCountUp(el, target) {
    const dur = 900, t0 = performance.now();
    const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

window.loadTrustStrip = async function () {
    const box = document.getElementById('trustCounts');
    if (!box || !window.supabaseClient) return;
    try {
        const [rc, rf] = await Promise.all([
            supabaseClient.rpc('list_approved_consultants'),
            supabaseClient.rpc('list_companies')
        ]);
        const nc = (rc && rc.data ? rc.data.length : 0);
        const nf = (rf && rf.data ? rf.data.length : 0);
        const tiles = [];
        if (nc >= TRUST_MIN) tiles.push(['🎯', nc, 'Onaylı Bağımsız Danışman', 'text-emerald-300']);
        if (nf >= TRUST_MIN) tiles.push(['🏢', nf, 'Kayıtlı Kurulumcu Firma', 'text-amber-300']);
        if (!tiles.length) return;   // yeterli veri yoksa şerit hiç görünmez
        box.className = 'grid gap-3 mb-5 mx-auto ' + (tiles.length === 1 ? 'grid-cols-1 max-w-xs' : 'grid-cols-2 max-w-xl');
        box.innerHTML = tiles.map((t, i) => `
            <div class="bg-white/5 border border-white/10 rounded-xl py-4 px-3 text-center">
                <div class="text-2xl mb-1">${t[0]}</div>
                <p class="text-2xl md:text-3xl font-black ${t[3]}"><span id="trustN${i}">0</span></p>
                <p class="text-[11px] text-slate-400 font-bold mt-0.5">${t[2]}</p>
            </div>`).join('');
        tiles.forEach((t, i) => { const el = document.getElementById('trustN' + i); if (el) trustCountUp(el, t[1]); });
    } catch (e) { /* sessiz geç — şerit görünmez */ }
};

(function initTrustStrip() {
    let tries = 0;
    const go = () => {
        if (!document.getElementById('trustCounts')) return;
        if (window.supabaseClient) { loadTrustStrip(); return; }
        if (++tries < 30) setTimeout(go, 200);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(go, 300));
    else setTimeout(go, 300);
})();

// ============================================================================
// GÖRSEL CİLA — bölümler kaydırıldıkça yumuşak belirir (ilerlemeli iyileştirme)
// ============================================================================
(function initReveal() {
    const start = () => {
        const host = document.getElementById('landingContainer');
        if (!host || !('IntersectionObserver' in window)) return;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const targets = Array.from(host.children).filter(el =>
            el.tagName !== 'NAV' && !el.classList.contains('tech-gradient') && el.offsetHeight > 40
        );
        if (!targets.length) return;

        const io = new IntersectionObserver((entries) => {
            entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
        }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

        targets.forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.top < window.innerHeight) { el.classList.add('reveal', 'is-visible'); return; } // ekrandakiler direkt görünür
            el.classList.add('reveal');
            io.observe(el);
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 250));
    else setTimeout(start, 250);
})();

// Hızlı hesap alanına odaklan (Nasıl Çalışır → 1. adım)
window.heroFocusCalc = function () {
    const el = document.getElementById('heroBill');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => el.focus({ preventScroll: true }), 450);
};

// ============================================================================
// VİTRİN SÜTUNLARI — arkası boş olan vaadi gösterme
// ----------------------------------------------------------------------------
// Platform pazaryeri mantığıyla çalışıyor: danışman listesi, donanım tablosu ve
// tedarikçi dizini ancak içerik girildikçe anlam kazanıyor. İçerik yokken bu
// bölümleri vitrinde bırakmak ziyaretçiye karşılıksız bir vaat oluyor —
// "Danışmanları gör" deyip boş listeye düşürmek güveni aşındırır.
//
// Kural: LİSTELER içerik yoksa gizlenir; ROL ÇAĞRILARI (gateway'deki kurulumcu/
// danışman/tedarikçi kartları) her zaman kalır, çünkü onlar davet, liste değil.
// İlk kayıt girildiği anda bölümler kendiliğinden geri gelir.
// ============================================================================
(function () {
    async function danismanSayisi() {
        if (typeof supabaseClient === 'undefined' || !supabaseClient) return 0;
        try {
            const { data, error } = await supabaseClient.rpc('list_approved_consultants');
            if (error) throw error;
            return (data || []).length;
        } catch (e) { return 0; }   // erişilemezse yok say → gizle
    }

    function adimlariYenidenNumarala() {
        const gorunur = [...document.querySelectorAll('.step-no')]
            .filter(el => { const k = el.closest('.phi-card'); return k && !k.classList.contains('hidden'); });
        gorunur.forEach((el, i) => { el.textContent = String(i + 1); });
    }

    async function uygula() {
        const n = await danismanSayisi();
        if (n > 0) return;   // içerik var → hiçbir şeye dokunma

        // 1) "Nasıl Çalışır" içindeki danışman adımı
        document.getElementById('stepConsultant')?.classList.add('hidden');
        adimlariYenidenNumarala();

        // 2) "Profesyonel Destek" içindeki danışman kartı (3 sütun → 2)
        const kart = document.getElementById('supportConsultant');
        if (kart) {
            kart.classList.add('hidden');
            const izgara = document.getElementById('supportGrid');
            if (izgara) izgara.classList.replace('md:grid-cols-3', 'md:grid-cols-2');
        }

        // 3) Bölüm açıklamaları adım/kart sayısıyla tutarlı kalsın
        const lede = document.getElementById('stepsLede');
        if (lede) lede.textContent = 'İlk hesaptan kurulum sonrası bakıma kadar üç adım — hepsi tek platformda.';
        const sLede = document.getElementById('supportLede');
        if (sLede) sLede.textContent = 'Kurulum teklifi veya mevcut sisteminiz için teknik servis — hangisine ihtiyacınız varsa buradan başlayın.';
    }

    document.addEventListener('DOMContentLoaded', () => { uygula(); });
})();
