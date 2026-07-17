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

        alert(`🎉 Başvurunuz Başarıyla İletildi!\n\nLütfen Proje Takip Kodunuzu Not Edin: ${code}\nBu kod ile anasayfadan sürecinizi şeffafça izleyebilirsiniz.`);
        closeLeadModal();
        document.getElementById('leadTrackInput').value = code;
        document.getElementById('btnTrackQuery').click();

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

/* ============================================================================
   HAKKIMDA (site_content) — ziyaretçi görünümü. Değerleri siteContent() okur.
   ============================================================================ */
window.renderAbout = function () {
    const S = window.siteContent || (() => '');
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
    const setOpt = (wrapId, id, val) => {
        const wrap = document.getElementById(wrapId), el = document.getElementById(id);
        if (el) el.textContent = val || '';
        if (wrap) { wrap.classList.toggle('hidden', !val); if (val) wrap.classList.add('inline-flex'); }
    };
    const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    // Foto (yoksa EY baş harf bloğu görünür)
    const photo = document.getElementById('aboutPhoto');
    const fallback = document.getElementById('aboutPhotoFallback');
    const url = S('about_photo_url');
    if (photo && fallback) {
        if (url) { photo.src = url; photo.classList.remove('hidden'); fallback.classList.add('hidden'); }
        else { photo.classList.add('hidden'); fallback.classList.remove('hidden'); }
    }

    setText('aboutName', S('about_name'));
    setText('aboutTitle', S('about_title'));
    setText('aboutTagline', S('about_tagline'));
    setOpt('aboutLocationWrap', 'aboutLocation', S('about_location'));
    setOpt('aboutEduWrap', 'aboutEdu', S('about_edu'));
    setText('aboutIntro', S('about_intro'));
    setText('aboutSec1Title', S('about_sec1_title'));
    setText('aboutSec1Body',  S('about_sec1_body'));
    setText('aboutSec2Title', S('about_sec2_title'));
    setText('aboutSec2Body',  S('about_sec2_body'));
    setText('aboutSec3Title', S('about_sec3_title'));
    setText('aboutSec3Body',  S('about_sec3_body'));

    // Uzmanlık etiketleri (virgülle ayrılmış → chip)
    const exp = document.getElementById('aboutExpertise');
    if (exp) {
        const chips = String(S('about_expertise') || '').split(',').map(s => s.trim()).filter(Boolean);
        exp.innerHTML = chips.map(c =>
            `<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-3 py-1 rounded-full">${esc(c)}</span>`
        ).join('');
    }

    // İletişim kartları (yalnız dolu olanlar; renkler literal)
    const box = document.getElementById('aboutContacts');
    if (box) {
        // Şema (https://) eksikse tamamla; tel/mailto'ya dokunma.
        const norm = (u) => {
            u = String(u || '').trim();
            if (!u) return '';
            return /^(https?:|mailto:|tel:)/i.test(u) ? u : 'https://' + u.replace(/^\/+/, '');
        };
        const items = [
            { v:S('about_linkedin'),  icon:'💼', label:'LinkedIn',              sub:'Profesyonel geçmişim ve iş ağım', href:norm(S('about_linkedin')),  cls:'hover:border-blue-400' },
            { v:S('about_youtube'),   icon:'▶️', label:'YouTube — Teknik Uçuş', sub:'Drone projeleri & video içerikler', href:norm(S('about_youtube')),   cls:'hover:border-red-400' },
            { v:S('about_instagram'), icon:'📸', label:'Instagram',             sub:'Günlük profesyonel paylaşımlar', href:norm(S('about_instagram')), cls:'hover:border-pink-400' },
            { v:S('about_phone'),     icon:'📞', label:'Telefon',               sub:S('about_phone'), href:'tel:' + String(S('about_phone')).replace(/\s/g,''), cls:'hover:border-emerald-400' },
            { v:S('about_email'),     icon:'✉️', label:'E-posta',               sub:S('about_email'), href:'mailto:' + S('about_email'), cls:'hover:border-emerald-400' }
        ].filter(i => i.v);
        box.innerHTML = items.map(i => `
            <a href="${esc(i.href)}" ${/^https?:/.test(i.href) ? 'target="_blank" rel="noopener"' : ''} class="flex items-center gap-3 bg-white border border-slate-200 ${i.cls} hover:shadow-md rounded-xl p-4 transition no-underline">
                <span class="text-2xl">${i.icon}</span>
                <div><p class="font-bold text-slate-800 text-sm">${esc(i.label)}</p><p class="text-xs text-slate-500">${esc(i.sub)}</p></div>
            </a>`).join('');
    }
};