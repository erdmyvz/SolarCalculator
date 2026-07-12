/* ============================================================================
   consultants.js — DANIŞMANLIK MODÜLÜ
   - Ziyaretçi: onaylı danışmanları listeler (iletişim GİZLİ); yatırımcı bilgi +
     reklam onayı verince iletişim açılır ve "potansiyel müşteri"ye kaydedilir.
   - Danışman arayüzü: menü butonları (Profili Düzenle / Mesajlaşma-Yakında /
     Danışan Takibi CRM-Yakında). Profil düzenlenip onaya gönderilir.
   consultants.sql + consultant_leads.sql çalıştırılmış olmalıdır.
   ============================================================================ */
(function () {
    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s) : String(s == null ? '' : s));
    let _approvedConsultants = [];
    let _contactConsultant = null;
    let _consData = null;   // giriş yapan danışmanın kaydı

    document.getElementById('btnBackFromConsultants')?.addEventListener('click', () => {
        if (typeof closeAllAndShowMenu === 'function') closeAllAndShowMenu();
    });

    // ================================================================ ZİYARETÇİ LİSTESİ
    async function renderConsultantsList() {
        const root = document.getElementById('consultantsRoot');
        if (!root) return;
        root.innerHTML = '<p class="text-slate-400 text-sm py-6 text-center">Yükleniyor...</p>';
        if (!supabaseClient) { root.innerHTML = '<p class="text-slate-400 text-sm">Bağlantı yok.</p>'; return; }

        let list = [];
        try {
            const { data, error } = await supabaseClient.rpc('list_approved_consultants');
            if (error) throw error;
            list = data || [];
        } catch (e) {
            root.innerHTML = `<p class="text-red-500 text-sm">Liste yüklenemedi: ${esc(e.message || e)}</p>`;
            return;
        }
        _approvedConsultants = list;

        const card = (c) => `
            <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg">${esc(c.avatar_initials || (c.full_name || '?').charAt(0))}</div>
                    <div class="min-w-0">
                        <p class="font-black text-slate-800 leading-tight truncate">${esc(c.full_name || 'Danışman')}</p>
                        <p class="text-[11px] text-slate-500 truncate">${esc(c.title || '')}</p>
                    </div>
                </div>
                ${c.completed_jobs ? `<div class="text-xs text-slate-500 mb-2">✅ ${c.completed_jobs} tamamlanan iş</div>` : ''}
                ${c.bio ? `<p class="text-sm text-slate-600 mb-3">${esc(c.bio)}</p>` : ''}
                ${c.expertise ? `<div class="flex flex-wrap gap-1.5 mb-4">${String(c.expertise).split(',').map(t => t.trim()).filter(Boolean).map(t => `<span class="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-full">${esc(t)}</span>`).join('')}</div>` : ''}
                <button onclick="consultantContact('${c.id}')" class="mt-auto w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg">📞 İletişim Bilgilerini Al</button>
            </div>`;

        root.innerHTML = `
            <div class="bg-gradient-to-br from-indigo-600 to-slate-900 text-white rounded-2xl p-8 mb-8 text-center">
                <h2 class="text-2xl md:text-3xl font-black mb-3">Bağımsız Solar Danışmanları</h2>
                <p class="text-indigo-100 max-w-2xl mx-auto text-sm md:text-base">Yatırım kararınızı satıcıdan bağımsız, tarafsız uzmanlarla verin. Uygun danışmanı seçip iletişim bilgilerine ulaşın.</p>
            </div>
            ${list.length
                ? `<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">${list.map(card).join('')}</div>`
                : `<div class="bg-slate-50 border border-slate-200 rounded-2xl p-10 text-center mb-8"><div class="text-4xl mb-3">🎯</div><p class="font-black text-slate-700 mb-1">Henüz onaylı danışman yok</p><p class="text-sm text-slate-500">Danışmanlar başvurularını tamamladıkça burada listelenecek.</p></div>`}

            <div class="bg-indigo-50 border border-indigo-200 rounded-2xl p-6">
                <h3 class="font-black text-slate-800 mb-1">Danışman mısınız?</h3>
                <p class="text-sm text-slate-600 mb-4">Sektörde danışmanlık veriyorsanız, Kurumsal Giriş'ten "Danışman" olarak kayıt olun; profilinizi doldurup onaya gönderin, onaylandığında burada listelenin.</p>
                <a href="#auth" class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm">Kurumsal Giriş ›</a>
            </div>`;
    }
    window.renderConsultantsList = renderConsultantsList;

    // ================================================================ İLETİŞİM BİLGİSİ AL (lead capture)
    function ensureContactModal() {
        let m = document.getElementById('consContactModal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'consContactModal';
        m.className = 'fixed inset-0 bg-black/50 z-[70] hidden flex items-center justify-center p-4';
        m.innerHTML = '<div class="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"><div id="consContactBody" class="p-6"></div></div>';
        document.body.appendChild(m);
        m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
        return m;
    }
    window.consultantContact = function (cid) {
        const c = _approvedConsultants.find(x => x.id === cid);
        if (!c) return;
        _contactConsultant = c;
        const m = ensureContactModal();
        document.getElementById('consContactBody').innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <h3 class="font-black text-lg text-slate-800 truncate">İletişim Bilgilerini Al</h3>
                <button onclick="document.getElementById('consContactModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 text-xl leading-none ml-2">✕</button>
            </div>
            <p class="text-sm text-slate-500 mb-4"><strong>${esc(c.full_name || 'Danışman')}</strong> ile iletişime geçmek için bilgilerinizi bırakın.</p>
            <div class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Ad</label><input id="ctName" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Soyad</label><input id="ctSurname" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                </div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Telefon</label><input id="ctPhone" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">E-posta</label><input id="ctEmail" type="email" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                <label class="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3 cursor-pointer">
                    <input type="checkbox" id="ctConsent" class="mt-0.5">
                    <span class="text-xs text-slate-600">İletişim bilgilerimin, tarafıma <strong>tanıtım/reklam</strong> amaçlı ulaşmak için kullanılmasına onay veriyorum. (Onay vermeden danışman bilgilerine ulaşılamaz.)</span>
                </label>
                <button onclick="contactSubmit()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-lg">Bilgileri Gönder ve İletişime Ulaş</button>
                <div id="ctResult"></div>
            </div>`;
        m.classList.remove('hidden');
    };
    window.contactSubmit = async function () {
        if (!_contactConsultant || !supabaseClient) return;
        const name = (document.getElementById('ctName').value || '').trim();
        const surname = (document.getElementById('ctSurname').value || '').trim();
        const phone = (document.getElementById('ctPhone').value || '').trim();
        const email = (document.getElementById('ctEmail').value || '').trim();
        const consent = document.getElementById('ctConsent').checked;
        const res = document.getElementById('ctResult');
        if (!name || !email) { res.innerHTML = '<p class="text-red-500 text-sm">Ad ve e-posta zorunludur.</p>'; return; }
        if (!consent) { res.innerHTML = '<p class="text-amber-600 text-sm">Devam etmek için onay kutusunu işaretlemelisiniz.</p>'; return; }
        res.innerHTML = '<p class="text-xs text-slate-400">Gönderiliyor...</p>';
        try {
            const { data, error } = await supabaseClient.rpc('capture_consultant_lead', {
                p_name: (name + ' ' + surname).trim(), p_email: email, p_phone: phone,
                p_consultant: _contactConsultant.id, p_consent: true
            });
            if (error) throw error;
            const info = (typeof data === 'string') ? JSON.parse(data) : data;
            res.innerHTML = `
                <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-900">
                    <p class="font-black mb-2">✅ İletişim bilgileri</p>
                    <p><strong>${esc(info.full_name || _contactConsultant.full_name)}</strong></p>
                    ${info.email ? `<p class="mt-1">✉️ <a href="mailto:${esc(info.email)}" class="underline font-bold">${esc(info.email)}</a></p>` : ''}
                    ${info.phone ? `<p class="mt-1">📞 <a href="tel:${esc(info.phone)}" class="underline font-bold">${esc(info.phone)}</a></p>` : ''}
                    <p class="text-[11px] text-emerald-700 mt-2">Danışmanla doğrudan iletişime geçebilirsiniz.</p>
                </div>`;
        } catch (e) {
            res.innerHTML = `<p class="text-red-500 text-sm">Gönderilemedi: ${esc(e.message || e)}</p>`;
        }
    };

    // ================================================================ DANIŞMAN ARAYÜZÜ
    function statusBanner(c) {
        const s = c.status || 'draft';
        if (s === 'approved') return `<div class="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-sm font-bold">✅ Profiliniz onaylandı — ziyaretçi sayfasında listeleniyorsunuz.</div>`;
        if (s === 'pending')  return `<div class="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm font-bold">⏳ Profiliniz onay bekliyor. Admin incelemesinden sonra yayınlanacak.</div>`;
        if (s === 'rejected') return `<div class="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm"><strong>❌ Profiliniz reddedildi.</strong>${c.reject_reason ? `<br>Gerekçe: ${esc(c.reject_reason)}` : ''}<br><span class="text-xs">Düzenleyip tekrar onaya gönderebilirsiniz.</span></div>`;
        return `<div class="bg-slate-100 border border-slate-200 text-slate-600 rounded-xl p-4 text-sm">📝 Taslak — profilinizi doldurup "Onaya Gönder" ile yayına başvurun.</div>`;
    }

    // 1. seviye: menü (kurulumcu firmalardaki gibi buton/kart menüsü)
    function renderConsultantMenu() {
        const root = document.getElementById('consultantPanelRoot');
        if (!root || !_consData) return;
        const c = _consData;
        const soonCard = (icon, title, desc) => `
            <div class="bg-white border border-slate-200 rounded-2xl p-6 opacity-70 relative">
                <span class="absolute top-3 right-3 bg-slate-100 text-slate-400 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Yakında</span>
                <div class="text-4xl mb-3">${icon}</div>
                <h3 class="font-black text-slate-800 mb-1">${title}</h3>
                <p class="text-sm text-slate-500">${desc}</p>
            </div>`;
        root.innerHTML = `
            <div class="mb-5"><h2 class="text-xl md:text-2xl font-black text-slate-800">🎯 Danışman Panelim</h2></div>
            <div class="mb-6">${statusBanner(c)}</div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button onclick="consultantEditProfile()" class="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:shadow-lg hover:-translate-y-1 hover:border-indigo-300 transition">
                    <div class="text-4xl mb-3">📝</div>
                    <h3 class="font-black text-slate-800 mb-1">Profili Düzenle</h3>
                    <p class="text-sm text-slate-500">Ziyaretçi sayfasında görünen profilinizi düzenleyin ve onaya gönderin.</p>
                </button>
                ${soonCard('💬', 'Mesajlaşma', 'Yatırımcılarla mesajlaşma yakında burada olacak.')}
                ${soonCard('👥', 'Danışan Takibi (CRM)', 'Görüştüğünüz yatırımcıları takip edin — yakında.')}
            </div>`;
    }
    window.renderConsultantMenu = renderConsultantMenu;
    window.consultantEditProfile = function () { renderConsultantProfile(); };
    window.consultantBackToMenu = function () { renderConsultantMenu(); };

    // 2. seviye: profil düzenleme
    function renderConsultantProfile() {
        const root = document.getElementById('consultantPanelRoot');
        if (!root || !_consData) return;
        const c = _consData;
        try {
            root.innerHTML = `
                <div class="flex items-center gap-3 mb-5">
                    <button onclick="consultantBackToMenu()" class="text-slate-500 hover:text-indigo-600 font-bold">← Panele Dön</button>
                    <span class="text-slate-300">/</span>
                    <h2 class="text-lg md:text-xl font-black text-slate-800">📝 Profili Düzenle</h2>
                </div>
                <div class="mb-5">${statusBanner(c)}</div>

                <div class="bg-white border border-slate-200 rounded-xl p-5 md:p-6 mb-5">
                    <h3 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-1">Ziyaretçi Profili</h3>
                    <p class="text-xs text-slate-400 mb-4">Bu bilgiler onaylandıktan sonra ziyaretçi sayfasında "Danışmanlık Al" bölümünde görünür.</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label class="block text-xs font-bold text-slate-600 mb-1">Ad Soyad</label><input id="consName" value="${esc(c.full_name || '')}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500"></div>
                        <div><label class="block text-xs font-bold text-slate-600 mb-1">Unvan</label><input id="consTitle" value="${esc(c.title || '')}" placeholder="örn. Elektrik Y. Müh. · GES Uzmanı" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500"></div>
                        <div><label class="block text-xs font-bold text-slate-600 mb-1">Baş Harfler (avatar)</label><input id="consInitials" maxlength="2" value="${esc(c.avatar_initials || '')}" placeholder="örn. MA" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500"></div>
                        <div><label class="block text-xs font-bold text-slate-600 mb-1">Tamamlanan İş Sayısı</label><input id="consJobs" type="number" value="${c.completed_jobs || 0}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500"></div>
                        <div class="md:col-span-2"><label class="block text-xs font-bold text-slate-600 mb-1">Uzmanlık Etiketleri (virgülle)</label><input id="consExpertise" value="${esc(c.expertise || '')}" placeholder="Çatı GES, Batarya, TEDAŞ Süreci" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500"></div>
                        <div class="md:col-span-2"><label class="block text-xs font-bold text-slate-600 mb-1">Özgeçmiş / Hakkında</label><textarea id="consBio" rows="3" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500">${esc(c.bio || '')}</textarea></div>
                        <div class="md:col-span-2"><label class="block text-xs font-bold text-slate-600 mb-1">Motivasyon</label><textarea id="consMotivation" rows="2" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500">${esc(c.motivation || '')}</textarea></div>
                    </div>
                </div>

                <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5 text-xs text-blue-800">
                    ℹ️ Her değişiklikten sonra <strong>"Onaya Gönder"</strong> ile admin onayına iletilir. Onaylanınca ziyaretçi sayfasındaki profiliniz güncellenir.
                </div>

                <div class="flex flex-wrap gap-3">
                    <button onclick="consultantSave(false)" class="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold px-5 py-2.5 rounded-lg">Taslağı Kaydet</button>
                    <button onclick="consultantSave(true)" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-2.5 rounded-lg">Onaya Gönder ›</button>
                </div>`;
        } catch (e) {
            console.error('renderConsultantProfile:', e);
            root.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">Profil yüklenirken hata: ' + ((e && e.message) || e) + '</div>';
        }
    }
    window.renderConsultantProfile = renderConsultantProfile;

    window.showConsultantPanel = function (cons, email) {
        document.getElementById('authContainer')?.classList.add('hidden');
        document.getElementById('landingContainer')?.classList.add('hidden');
        document.getElementById('appContainer')?.classList.remove('hidden');
        document.getElementById('mainMenu')?.classList.add('hidden');
        document.querySelector('#appContainer > div.w-full.max-w-7xl.mx-auto')?.classList.remove('hidden'); // üst bar
        ['crmModule','adminModule','companyManagementModule','techSupportModule','salesAssistantModule','educationModule','regulationsModule','dashboardModule'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
        document.getElementById('consultantPanelModule')?.classList.remove('hidden');

        const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.textContent = v; };
        set('userNameDisplay', cons.full_name || 'Danışman');
        set('userCompanyDisplay', 'Danışman');
        if (email) set('userEmailDisplay', email);
        set('userInitials', (cons.avatar_initials || (cons.full_name || 'D').charAt(0)).toUpperCase());
        document.getElementById('adminPanelCard')?.classList.add('hidden');

        _consData = cons;
        renderConsultantMenu();
    };

    window.consultantSave = async function (submit) {
        if (!window.currentConsultant || !supabaseClient) return;
        const g = (id) => (document.getElementById(id)?.value || '').trim();
        const data = {
            full_name: g('consName'),
            title: g('consTitle'),
            avatar_initials: (g('consInitials') || g('consName').charAt(0) || 'D').toUpperCase().slice(0, 2),
            expertise: g('consExpertise'),
            completed_jobs: parseInt(g('consJobs'), 10) || 0,
            bio: g('consBio'),
            motivation: g('consMotivation'),
            updated_at: new Date().toISOString()
        };
        if (submit) {
            if (!data.full_name || !data.title) { alert('Lütfen en az ad soyad ve unvan girin.'); return; }
            data.status = 'pending';
            data.reject_reason = null;
        }
        try {
            const { data: upd, error } = await supabaseClient.from('consultants')
                .update(data).eq('id', window.currentConsultant.id).select().single();
            if (error) throw error;
            window.currentConsultant = upd;
            _consData = upd;
            renderConsultantProfile();
            alert(submit ? 'Profiliniz onaya gönderildi. Admin onayından sonra ziyaretçi sayfasında görünür/güncellenir.' : 'Taslak kaydedildi.');
        } catch (e) {
            alert('Kaydedilemedi: ' + (e.message || e));
        }
    };

    if (document.getElementById('consultantsRoot')) renderConsultantsList();
})();