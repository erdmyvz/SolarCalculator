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
    let _consAvatar = null; // profil düzenlemedeki fotoğrafın base64'ü

    function resizeToBase64(file, maxSize, cb) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } }
                else { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; } }
                const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
                cv.getContext('2d').drawImage(img, 0, 0, w, h);
                cb(cv.toDataURL('image/jpeg', 0.85));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    function consAvatarInner() {
        if (_consAvatar) return `<img src="${_consAvatar}" class="w-16 h-16 rounded-full object-cover border border-slate-200">`;
        return `<div class="w-16 h-16 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xl">${esc((_consData && _consData.avatar_initials) || 'D')}</div>`;
    }
    window.consAvatarPick = function (input) {
        const f = input.files && input.files[0]; if (!f) return;
        resizeToBase64(f, 256, (b64) => { _consAvatar = b64; const p = document.getElementById('consAvatarPreview'); if (p) p.innerHTML = consAvatarInner(); });
    };
    window.consAvatarClear = function () {
        _consAvatar = null;
        const fi = document.getElementById('consAvatarFile'); if (fi) fi.value = '';
        const p = document.getElementById('consAvatarPreview'); if (p) p.innerHTML = consAvatarInner();
    };

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
                    ${c.avatar_data ? `<img src="${c.avatar_data}" class="w-12 h-12 rounded-full object-cover shrink-0">` : `<div class="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg shrink-0">${esc(c.avatar_initials || (c.full_name || '?').charAt(0))}</div>`}
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

    // 1. seviye: PANO (özet + dikkat gerektirenler + kısayollar)
    const CST_LBL = { yeni:'Yeni', gorusuluyor:'Görüşülüyor', teklif:'Teklif Aşaması', karar:'Karar Verdi', kuruldu:'Kuruldu', ilgilenmiyor:'İlgilenmiyor' };

    function consProfileScore(c) {
        const checks = [
            ['Profil fotoğrafı', !!c.avatar_data],
            ['Unvan', !!String(c.title || '').trim()],
            ['Uzmanlık alanları', !!String(c.expertise || '').trim()],
            ['Hakkımda', !!String(c.bio || '').trim()],
            ['Motivasyon', !!String(c.motivation || '').trim()],
            ['Tamamlanan iş sayısı', Number(c.completed_jobs) > 0]
        ];
        const done = checks.filter(x => x[1]).length;
        return { pct: Math.round(done / checks.length * 100), missing: checks.filter(x => !x[1]).map(x => x[0]) };
    }

    function renderConsultantMenu() {
        const root = document.getElementById('consultantPanelRoot');
        if (!root || !_consData) return;
        const c = _consData;
        const first = String(c.full_name || '').trim().split(' ')[0] || 'Danışman';
        const soonCard = (icon, title, desc) => `
            <div class="bg-white border border-slate-200 rounded-2xl p-6 opacity-70 relative">
                <span class="absolute top-3 right-3 bg-slate-100 text-slate-400 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Yakında</span>
                <div class="text-4xl mb-3">${icon}</div>
                <h3 class="font-black text-slate-800 mb-1">${title}</h3>
                <p class="text-sm text-slate-500">${desc}</p>
            </div>`;
        root.innerHTML = `
            <div class="mb-5">
                <h2 class="text-xl md:text-2xl font-black text-slate-800">Merhaba ${esc(first)} 👋</h2>
                <p class="text-sm text-slate-500 mt-0.5">Danışman panelinize hoş geldiniz — bugünün özeti aşağıda.</p>
            </div>
            <div class="mb-5">${statusBanner(c)}</div>
            <div id="consDashStats" class="mb-5"></div>
            <div id="consDashAttention" class="mb-5"></div>
            <div id="consDashProfile" class="mb-6"></div>
            <p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Araçlar</p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button onclick="consultantEditProfile()" class="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:shadow-lg hover:-translate-y-1 hover:border-indigo-300 transition">
                    <div class="text-4xl mb-3">📝</div>
                    <h3 class="font-black text-slate-800 mb-1">Profili Düzenle</h3>
                    <p class="text-sm text-slate-500">Ziyaretçi sayfasında görünen profilinizi düzenleyin ve onaya gönderin.</p>
                </button>
                <button onclick="consultantOpenMessages()" class="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:shadow-lg hover:-translate-y-1 hover:border-indigo-300 transition">
                    <div class="text-4xl mb-3">💬</div>
                    <h3 class="font-black text-slate-800 mb-1">Mesajlaşma</h3>
                    <p class="text-sm text-slate-500">Danışanınızı yönlendirdiğiniz kurulumcu firmalarla yazışın.</p>
                </button>
                <button onclick="consultantOpenCRM()" class="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:shadow-lg hover:-translate-y-1 hover:border-indigo-300 transition">
                    <div class="text-4xl mb-3">👥</div>
                    <h3 class="font-black text-slate-800 mb-1">Danışan Takibi (CRM)</h3>
                    <p class="text-sm text-slate-500">Görüştüğünüz yatırımcıları/danışanları ekleyin, durumlarını takip edin.</p>
                </button>
            </div>`;
        fillConsultantDash();   // istatistikler arkadan dolar (kabuk asla beklemez)
    }

    async function fillConsultantDash() {
        const c = _consData;
        // --- profil gücü ---
        const pBox = document.getElementById('consDashProfile');
        if (pBox && c) {
            const p = consProfileScore(c);
            if (p.pct < 100) {
                pBox.innerHTML = `
                    <div class="bg-white border border-slate-200 rounded-xl p-4">
                        <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                            <span class="text-sm font-bold text-slate-700">Profil gücü — %${p.pct}</span>
                            <button onclick="consultantEditProfile()" class="text-xs font-bold text-indigo-600 hover:underline">Tamamla →</button>
                        </div>
                        <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2"><div class="h-full bg-indigo-500 rounded-full transition-all" style="width:${p.pct}%"></div></div>
                        <p class="text-[11px] text-slate-500">Eksik: ${p.missing.map(m => esc(m)).join(' · ')} — dolu profiller ziyaretçi listesinde daha güvenilir görünür.</p>
                    </div>`;
            } else { pBox.innerHTML = ''; }
        }

        // --- danışan istatistikleri ---
        const sBox = document.getElementById('consDashStats'), aBox = document.getElementById('consDashAttention');
        if (!sBox || !supabaseClient || !window.currentConsultant) return;
        sBox.innerHTML = '<p class="text-xs text-slate-400">Özet yükleniyor...</p>';
        let rows = [];
        try {
            const { data, error } = await supabaseClient.from('consultant_clients')
                .select('id,name,status,install_status,assigned_company_id,assigned_company_name,updated_at')
                .eq('consultant_id', window.currentConsultant.id);
            if (error) throw error;
            rows = data || [];
        } catch (e) { sBox.innerHTML = ''; return; }

        const total = rows.length;
        const active = rows.filter(r => r.status !== 'kuruldu' && r.status !== 'ilgilenmiyor').length;
        const assigned = rows.filter(r => r.assigned_company_id).length;
        const done = rows.filter(r => r.install_status === 'tamamlandi' || r.status === 'kuruldu').length;
        const tile = (icon, n, label, cls) => `
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <div class="text-xl mb-1">${icon}</div>
                <p class="text-2xl font-black ${cls}">${n}</p>
                <p class="text-[11px] text-slate-500 font-bold mt-0.5">${label}</p>
            </div>`;
        sBox.innerHTML = `<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            ${tile('👥', total, 'Toplam Danışan', 'text-slate-800')}
            ${tile('🔄', active, 'Süreçte', 'text-blue-600')}
            ${tile('🏢', assigned, 'Firmaya Atandı', 'text-amber-600')}
            ${tile('✅', done, 'Tamamlandı', 'text-emerald-600')}
        </div>`;

        // --- dikkat gerektirenler ---
        if (!aBox) return;
        if (!total) {
            aBox.innerHTML = `<div class="bg-indigo-50 border border-indigo-100 rounded-xl p-5 text-center">
                <p class="font-bold text-slate-700 mb-1">Henüz danışan eklemediniz</p>
                <p class="text-sm text-slate-500 mb-3">Görüştüğünüz yatırımcıları ekleyin; süreçlerini buradan takip edin.</p>
                <button onclick="consultantOpenCRM()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-lg text-sm">İlk danışanı ekle</button>
            </div>`;
            return;
        }
        const now = Date.now(), DAY = 86400000, items = [];
        rows.forEach(r => {
            if (r.status === 'kuruldu' || r.status === 'ilgilenmiyor') return;
            const days = r.updated_at ? Math.floor((now - new Date(r.updated_at).getTime()) / DAY) : 0;
            if (r.status === 'yeni') items.push([r.name, 'Henüz görüşülmedi', days, 'bg-amber-100 text-amber-800']);
            else if (r.assigned_company_id && !r.install_status) items.push([r.name, 'Firma atandı, kurulum durumu girilmemiş', days, 'bg-blue-100 text-blue-700']);
            else if (days >= 7) items.push([r.name, days + ' gündür güncellenmedi', days, 'bg-slate-100 text-slate-600']);
        });
        items.sort((a, b) => b[2] - a[2]);
        if (!items.length) {
            aBox.innerHTML = `<div class="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-sm text-emerald-800 font-bold">✅ Bekleyen işiniz yok — tüm danışanlarınız güncel.</div>`;
            return;
        }
        aBox.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-xl p-4">
                <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <span class="text-sm font-black text-slate-800">🔔 Dikkat gerektirenler <span class="text-slate-400 font-bold">(${items.length})</span></span>
                    <button onclick="consultantOpenCRM()" class="text-xs font-bold text-indigo-600 hover:underline">Tümünü aç →</button>
                </div>
                ${items.slice(0, 5).map(it => `
                    <div class="flex items-center justify-between gap-3 py-2 border-b border-slate-50 last:border-0">
                        <span class="font-bold text-sm text-slate-700 truncate">${esc(it[0])}</span>
                        <span class="text-[10px] font-black px-2 py-1 rounded-full shrink-0 ${it[3]}">${esc(it[1])}</span>
                    </div>`).join('')}
                ${items.length > 5 ? `<p class="text-[11px] text-slate-400 mt-2">+${items.length - 5} tane daha</p>` : ''}
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
        _consAvatar = c.avatar_data || null;
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
                        <div class="md:col-span-2 flex items-center gap-4">
                            <div id="consAvatarPreview" class="shrink-0">${consAvatarInner()}</div>
                            <div>
                                <label class="block text-xs font-bold text-slate-600 mb-1">Profil Fotoğrafı</label>
                                <input type="file" id="consAvatarFile" accept="image/*" onchange="consAvatarPick(this)" class="block text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:cursor-pointer">
                                <button type="button" onclick="consAvatarClear()" class="mt-1 text-[11px] text-slate-400 hover:text-red-500 underline">Fotoğrafı kaldır</button>
                            </div>
                        </div>
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
        ['crmModule','adminModule','calculatorModule','simulationModule','evCalcModule','companyManagementModule','techSupportModule','salesAssistantModule','educationModule','regulationsModule','amortizationModule','hardwareModule','consultantsModule','dashboardModule'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
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
            avatar_data: _consAvatar,
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

    // ---------- DANIŞAN TAKİBİ (CRM) ----------
    const CLIENT_ST = [['yeni','Yeni'],['gorusuluyor','Görüşülüyor'],['teklif','Teklif Aşaması'],['karar','Karar Verdi'],['kuruldu','Kuruldu'],['ilgilenmiyor','İlgilenmiyor']];
    const CLIENT_BADGE = { yeni:'bg-slate-100 text-slate-600', gorusuluyor:'bg-blue-100 text-blue-700', teklif:'bg-amber-100 text-amber-800', karar:'bg-indigo-100 text-indigo-700', kuruldu:'bg-emerald-100 text-emerald-700', ilgilenmiyor:'bg-red-100 text-red-700' };
    const INSTALL_ST = [['atandi','Atandı'],['iletisim','İletişime Geçildi'],['kesif','Keşif Yapıldı'],['teklif','Teklif Verildi'],['sozlesme','Sözleşme'],['kurulum','Kurulum Aşamasında'],['tamamlandi','Tamamlandı']];
    const INSTALL_BADGE = { atandi:'bg-slate-100 text-slate-600', iletisim:'bg-blue-100 text-blue-700', kesif:'bg-cyan-100 text-cyan-700', teklif:'bg-amber-100 text-amber-800', sozlesme:'bg-violet-100 text-violet-700', kurulum:'bg-orange-100 text-orange-700', tamamlandi:'bg-emerald-100 text-emerald-700' };
    const stLabel = (v) => (CLIENT_ST.find(x => x[0] === v) || ['','—'])[1];
    const instLabel = (v) => (INSTALL_ST.find(x => x[0] === v) || ['',''])[1];
    let _clients = [], _companies = [];

    window.consultantOpenCRM = function () { renderConsultantCRM(); };

    async function renderConsultantCRM() {
        const root = document.getElementById('consultantPanelRoot');
        if (!root || !window.currentConsultant || !supabaseClient) return;
        root.innerHTML = `
            <div class="flex items-center gap-3 mb-5">
                <button onclick="consultantBackToMenu()" class="text-slate-500 hover:text-indigo-600 font-bold">← Panele Dön</button>
                <span class="text-slate-300">/</span>
                <h2 class="text-lg md:text-xl font-black text-slate-800">👥 Danışan Takibi</h2>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div id="consClientStats" class="text-sm text-slate-500"></div>
                <button onclick="consultantClientNew()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg text-sm">+ Yeni Danışan</button>
            </div>
            <div id="consClientFilters" class="mb-4"></div>
            <div id="consClientList"><p class="text-sm text-slate-400">Yükleniyor...</p></div>`;
        await Promise.all([loadClients(), loadCompanies()]);
        renderFilters();
        applyClientFilters();
    }
    async function loadClients() {
        try {
            const { data, error } = await supabaseClient.from('consultant_clients').select('*').eq('consultant_id', window.currentConsultant.id).order('updated_at', { ascending: false });
            if (error) throw error;
            _clients = data || [];
        } catch (e) { const l = document.getElementById('consClientList'); if (l) l.innerHTML = `<p class="text-red-500 text-sm">${esc(e.message || e)}</p>`; }
    }
    async function loadCompanies() {
        try { const { data } = await supabaseClient.rpc('list_companies'); _companies = data || []; } catch (e) { _companies = []; }
    }

    function renderFilters() {
        const box = document.getElementById('consClientFilters');
        if (!box) return;
        const stOpts = '<option value="">Tüm durumlar</option>' + CLIENT_ST.map(x => `<option value="${x[0]}">${x[1]}</option>`).join('');
        const fmOpts = '<option value="">Tüm firmalar</option><option value="__none__">Atanmamış</option>' + _companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        box.innerHTML = `
            <div class="flex flex-col sm:flex-row gap-2">
                <input id="clSearch" oninput="applyClientFilters()" placeholder="🔍 Ara: ad, telefon, e-posta, firma" class="flex-1 border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500">
                <select id="clStatusFilter" onchange="applyClientFilters()" class="border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${stOpts}</select>
                <select id="clFirmFilter" onchange="applyClientFilters()" class="border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${fmOpts}</select>
            </div>`;
    }
    window.applyClientFilters = function () {
        const q = (document.getElementById('clSearch')?.value || '').toLowerCase().trim();
        const st = document.getElementById('clStatusFilter')?.value || '';
        const fm = document.getElementById('clFirmFilter')?.value || '';
        const filtered = _clients.filter(c => {
            if (st && c.status !== st) return false;
            if (fm === '__none__' && c.assigned_company_id) return false;
            if (fm && fm !== '__none__' && c.assigned_company_id !== fm) return false;
            if (q) { const hay = [c.name, c.phone, c.email, c.assigned_company_name].filter(Boolean).join(' ').toLowerCase(); if (!hay.includes(q)) return false; }
            return true;
        });
        renderClientList(filtered);
    };

    function renderClientList(arr) {
        const list = document.getElementById('consClientList');
        const stats = document.getElementById('consClientStats');
        arr = arr || _clients;
        if (stats) stats.textContent = `${_clients.length} danışan · ${_clients.filter(c => c.install_status === 'tamamlandi').length} tamamlandı · ${_clients.filter(c => c.assigned_company_id).length} firmaya atandı`;
        if (!list) return;
        if (!_clients.length) { list.innerHTML = '<div class="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm">Henüz danışan eklemediniz. "+ Yeni Danışan" ile başlayın.</div>'; return; }
        if (!arr.length) { list.innerHTML = '<div class="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-slate-400 text-sm">Filtreye uyan danışan yok.</div>'; return; }
        const stOpts = (sel) => CLIENT_ST.map(x => `<option value="${x[0]}" ${x[0] === sel ? 'selected' : ''}>${x[1]}</option>`).join('');
        const instOpts = (sel) => INSTALL_ST.map(x => `<option value="${x[0]}" ${x[0] === sel ? 'selected' : ''}>${x[1]}</option>`).join('');
        list.innerHTML = arr.map(c => `
            <div class="bg-white border border-slate-200 rounded-xl p-4 mb-2">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 mb-1"><span class="font-black text-slate-800">${esc(c.name)}</span><span class="text-[10px] font-black px-2 py-0.5 rounded-full ${CLIENT_BADGE[c.status] || 'bg-slate-100'}">${esc(stLabel(c.status))}</span></div>
                        <div class="text-[11px] text-slate-400">${c.phone ? esc(c.phone) : ''}${c.phone && c.email ? ' · ' : ''}${c.email ? esc(c.email) : ''}</div>
                        ${c.notes ? `<div class="text-xs text-slate-600 mt-1">${esc(c.notes)}</div>` : ''}
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <select onchange="consultantClientStatus('${c.id}', this.value)" title="Danışan durumu" class="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">${stOpts(c.status)}</select>
                        <button onclick="consultantClientEdit('${c.id}')" title="Düzenle" class="text-slate-400 hover:text-indigo-600 px-1.5 py-1">✏️</button>
                        <button onclick="consultantClientDelete('${c.id}')" title="Sil" class="text-slate-400 hover:text-red-600 px-1.5 py-1">🗑️</button>
                    </div>
                </div>
                <div class="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <span class="text-[11px] text-slate-400">Kurulumcu firma:</span>
                    ${c.assigned_company_id
                        ? `<span class="text-xs font-bold text-slate-700">🏢 ${esc(c.assigned_company_name || 'Firma')}</span>
                           <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${INSTALL_BADGE[c.install_status] || 'bg-slate-100 text-slate-500'}">${esc(instLabel(c.install_status) || 'Durum yok')}</span>
                           <select onchange="consultantClientInstall('${c.id}', this.value)" title="Kurulum durumu" class="ml-auto text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white">${instOpts(c.install_status)}</select>`
                        : `<span class="text-xs text-slate-400 italic">atanmadı</span><button onclick="consultantClientEdit('${c.id}')" class="ml-auto text-xs font-bold text-indigo-600 hover:underline">Firma ata →</button>`}
                </div>
            </div>`).join('');
    }

    function ensureClientModal() {
        let m = document.getElementById('consClientModal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'consClientModal';
        m.className = 'fixed inset-0 bg-black/50 z-[70] hidden flex items-center justify-center p-4';
        m.innerHTML = '<div class="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"><div id="consClientBody" class="p-6"></div></div>';
        document.body.appendChild(m);
        m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
        return m;
    }
    function openClientForm(c) {
        const m = ensureClientModal();
        const ed = !!c;
        const compOpts = '<option value="">— Firma atanmadı —</option>' + _companies.map(x => `<option value="${x.id}" ${ed && c.assigned_company_id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
        const instOpts = '<option value="">— Durum yok —</option>' + INSTALL_ST.map(x => `<option value="${x[0]}" ${ed && c.install_status === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('');
        document.getElementById('consClientBody').innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-black text-lg text-slate-800">${ed ? 'Danışanı Düzenle' : 'Yeni Danışan'}</h3>
                <button onclick="document.getElementById('consClientModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <input type="hidden" id="clId" value="${ed ? c.id : ''}">
            <div class="space-y-3">
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Ad Soyad *</label><input id="clName" value="${ed ? esc(c.name) : ''}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Telefon</label><input id="clPhone" value="${ed && c.phone ? esc(c.phone) : ''}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">E-posta</label><input id="clEmail" value="${ed && c.email ? esc(c.email) : ''}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                </div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Danışan Durumu</label><select id="clStatus" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${CLIENT_ST.map(x => `<option value="${x[0]}" ${ed && c.status === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></div>
                <div class="border-t border-slate-100 pt-3"><label class="block text-xs font-bold text-slate-600 mb-1">🏢 Atanan Kurulumcu Firma</label><select id="clCompany" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${compOpts}</select></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Kurulum Durumu</label><select id="clInstall" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${instOpts}</select></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Notlar</label><textarea id="clNotes" rows="2" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">${ed && c.notes ? esc(c.notes) : ''}</textarea></div>
                <button onclick="consultantClientSave()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 rounded-lg">Kaydet</button>
                <div id="clResult"></div>
            </div>`;
        m.classList.remove('hidden');
    }
    window.consultantClientNew = function () { openClientForm(null); };
    window.consultantClientEdit = function (id) { const c = _clients.find(x => x.id === id); if (c) openClientForm(c); };

    window.consultantClientSave = async function () {
        const id = document.getElementById('clId').value;
        const name = (document.getElementById('clName').value || '').trim();
        const res = document.getElementById('clResult');
        if (!name) { res.innerHTML = '<p class="text-red-500 text-sm">Ad soyad zorunludur.</p>'; return; }
        const compId = document.getElementById('clCompany').value || null;
        const comp = _companies.find(x => x.id === compId);
        const row = {
            name,
            phone: (document.getElementById('clPhone').value || '').trim() || null,
            email: (document.getElementById('clEmail').value || '').trim() || null,
            status: document.getElementById('clStatus').value,
            assigned_company_id: compId,
            assigned_company_name: comp ? comp.name : null,
            install_status: (document.getElementById('clInstall').value || null),
            notes: (document.getElementById('clNotes').value || '').trim() || null,
            updated_at: new Date().toISOString()
        };
        res.innerHTML = '<p class="text-xs text-slate-400">Kaydediliyor...</p>';
        try {
            if (id) { const { error } = await supabaseClient.from('consultant_clients').update(row).eq('id', id); if (error) throw error; }
            else { row.consultant_id = window.currentConsultant.id; const { error } = await supabaseClient.from('consultant_clients').insert(row); if (error) throw error; }
            document.getElementById('consClientModal').classList.add('hidden');
            await loadClients(); applyClientFilters();
        } catch (e) { res.innerHTML = `<p class="text-red-500 text-sm">${esc(e.message || e)}</p>`; }
    };
    async function _clientPatch(id, patch) {
        patch.updated_at = new Date().toISOString();
        const { error } = await supabaseClient.from('consultant_clients').update(patch).eq('id', id);
        if (error) { alert('Güncellenemedi: ' + error.message); return; }
        const c = _clients.find(x => x.id === id); if (c) Object.assign(c, patch);
        applyClientFilters();
    }
    window.consultantClientStatus = (id, status) => _clientPatch(id, { status });
    window.consultantClientInstall = (id, install_status) => _clientPatch(id, { install_status: install_status || null });
    window.consultantClientDelete = async function (id) {
        if (!confirm('Bu danışanı silmek istediğinize emin misiniz?')) return;
        try { const { error } = await supabaseClient.from('consultant_clients').delete().eq('id', id); if (error) throw error; await loadClients(); applyClientFilters(); }
        catch (e) { alert('Silinemedi: ' + (e.message || e)); }
    };


    if (document.getElementById('consultantsRoot')) renderConsultantsList();
})();
