/* ============================================================================
   consultants.js — DANIŞMANLIK MODÜLÜ
   - Ziyaretçi: onaylı danışmanları listeler (iletişim GİZLİ); yatırımcı bilgi +
     reklam onayı verince iletişim açılır ve "potansiyel müşteri"ye kaydedilir.
    - Danışman arayüzü: pano (özet + dikkat listesi + profil gücü) ve kartlar
      (Profili Düzenle / Mesajlaşma / Danışan Takibi CRM). Profil onaya gönderilir.
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
        m.className = 'tema-koyu pencere-koyu fixed inset-0 bg-black/50 z-[70] hidden flex items-center justify-center p-4';
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
    // ⚠️ BU KUTU BİR ZAMANLAR SADECE SÜSTÜ. Reddedilmiş danışman kırmızı kutuyu
    // görüyor, altındaki bütün araçları SONUNA KADAR kullanabiliyordu: danışan
    // ekleyip CRM'e aktarabiliyor, üç firma davet ediliyor, bildirim gidiyordu.
    // Kapı danisman-onay-kapisi.sql ile sunucuya kondu; buradaki cümle o
    // kuralın aynısını SÖYLÜYOR. İkisi birlikte değişmeli — biri değişip
    // öteki kalırsa ekran yine yalan söyler.
    const ONAYSIZ_KISIT = 'Onaylanana kadar <strong>danışan aktarımı</strong> ve <strong>teklif değerlendirme talepleri</strong> kapalıdır — danışanlarınızı kaydedip hazırlayabilirsiniz.';

    function statusBanner(c) {
        const s = c.status || 'draft';
        if (c && c.banned) return `<div class="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm"><strong>⛔ Hesabınız askıya alındı.</strong>${c.ban_reason ? `<br>Gerekçe: ${esc(c.ban_reason)}` : ''}<br><span class="text-xs">Danışan aktarımı ve değerlendirme talepleri kapalıdır.</span></div>`;
        if (s === 'approved') return `<div class="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-sm font-bold">✅ Profiliniz onaylandı — ziyaretçi sayfasında listeleniyorsunuz.</div>`;
        if (s === 'pending')  return `<div class="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm"><strong>⏳ Profiliniz onay bekliyor.</strong> Admin incelemesinden sonra yayınlanacak.<br><span class="text-xs font-normal">${ONAYSIZ_KISIT}</span></div>`;
        if (s === 'rejected') return `<div class="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm"><strong>❌ Profiliniz reddedildi.</strong>${c.reject_reason ? `<br>Gerekçe: ${esc(c.reject_reason)}` : ''}<br><span class="text-xs">Düzenleyip tekrar onaya gönderebilirsiniz. ${ONAYSIZ_KISIT}</span></div>`;
        return `<div class="bg-slate-100 border border-slate-200 text-slate-600 rounded-xl p-4 text-sm">📝 Taslak — profilinizi doldurup "Onaya Gönder" ile yayına başvurun.<br><span class="text-xs">${ONAYSIZ_KISIT}</span></div>`;
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
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onclick="consultantEditProfile()" class="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:shadow-lg hover:-translate-y-1 hover:border-indigo-300 transition">
                    <div class="text-4xl mb-3">📝</div>
                    <h3 class="font-black text-slate-800 mb-1">Profili Düzenle</h3>
                    <p class="text-sm text-slate-500">Ziyaretçi sayfasında görünen profilinizi düzenleyin ve onaya gönderin.</p>
                </button>
                <button onclick="consultantOpenCRM()" class="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:shadow-lg hover:-translate-y-1 hover:border-indigo-300 transition">
                    <div class="text-4xl mb-3">👥</div>
                    <h3 class="font-black text-slate-800 mb-1">Danışan Takibi (CRM)</h3>
                    <p class="text-sm text-slate-500">Görüştüğünüz yatırımcıları/danışanları ekleyin, durumlarını takip edin.</p>
                </button>
                <button onclick="consultantQuoteReviews()" class="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:shadow-lg hover:-translate-y-1 hover:border-indigo-300 transition">
                    <div class="text-4xl mb-3">⚖️</div>
                    <h3 class="font-black text-slate-800 mb-1">Teklif Değerlendirme</h3>
                    <p class="text-sm text-slate-500">Yatırımcıların aldığı teklifleri karşılaştırıp görüş verin.</p>
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
    window.consultantEditProfile = function (_adrestenGeldi) {
        if (window.epcAdresYaz) window.epcAdresYaz('profil-duzenle', null, _adrestenGeldi);
        renderConsultantProfile();
    };
    window.consultantBackToMenu = function () {
        const _kok = (typeof window.epcPanelAdresi === 'function') ? window.epcPanelAdresi() : '#app';
        if (window.location.hash && window.location.hash !== _kok) {
            window.__epcPanelHash = _kok;
            window.location.hash = _kok;
        }
        renderConsultantMenu();
    };

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
        ['supplierDirModule','crmModule','adminModule','calculatorModule','simulationModule','evCalcModule','companyManagementModule','techSupportModule','salesAssistantModule','educationModule','regulationsModule','amortizationModule','hardwareModule','consultantsModule','dashboardModule'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
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

    // Danışan Takibi'nin kendi adresi var: yenileyince ekran kaybolmasın,
    // GERİ tuşu paneli terk etmesin diye. (Kurulumcu tarafında da aynısı.)
    window.consultantOpenCRM = function (_adrestenGeldi) {
        if (window.epcAdresYaz) window.epcAdresYaz('danisan-takip', null, _adrestenGeldi);
        renderConsultantCRM();
    };

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
                    ${!c.lead_id
                        ? `<span class="text-[11px] text-slate-400">Henüz CRM'e aktarılmadı</span>
                           <button onclick="consultantClientEdit('${c.id}')" class="ml-auto text-xs font-bold text-indigo-600 hover:underline">Konumu gir ve aktar →</button>`
                        : (c.assigned_company_id
                            ? `<span class="text-[11px] text-slate-400">Seçilen firma:</span>
                               <span class="text-xs font-bold text-slate-700">🏢 ${esc(c.assigned_company_name || 'Firma')}</span>
                               <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${INSTALL_BADGE[c.install_status] || 'bg-slate-100 text-slate-500'}">${esc(instLabel(c.install_status) || 'Durum yok')}</span>
                               ${c.tracking_code ? `<span class="ml-auto text-[10px] font-mono text-slate-400 tracking-wider">${esc(c.tracking_code)}</span>` : ''}`
                            : `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">⏳ Teklif bekleniyor</span>
                               <span class="text-[11px] text-slate-400">firmalar davet edildi</span>
                               <button onclick="consultantKazananAc('${c.id}')" class="text-xs font-bold text-indigo-600 hover:underline">Müşteri hangi firmayı seçti? →</button>
                               ${c.tracking_code ? `<span class="ml-auto text-[10px] font-mono text-slate-400 tracking-wider">${esc(c.tracking_code)}</span>` : ''}`)}
                </div>
            </div>`).join('');
    }

    // ======================================================== KAZANANI KAYDET
    // ⚠️ DANIŞMAN FİRMA SEÇMİYOR. Müşterinin seçtiğini KAYDEDİYOR. Ayrım
    // danisman-rolu.sql'deki kuralın ta kendisi: danışman firma seçebilseydi
    // "en yakın 3 firma" kuralı danışman üzerinden delinirdi. Buradaki bütün
    // metinler bu yüzden "siz seçin" değil "müşteri hangisini seçti" diyor.
    //
    // Sunucu tarafı (danisman-kazanan-kaydi.sql) dört koşul arıyor: kayıt
    // danışmanın kendi danışanı, müşterinin platform hesabı yok, kazanan
    // henüz yazılmamış, danışman profili onaylı. Buradaki kontroller yalnız
    // kullanıcıya kolaylık — kural sunucuda.
    function ensureKazananModal() {
        let m = document.getElementById('consKazananModal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'consKazananModal';
        m.className = 'tema-koyu pencere-koyu fixed inset-0 bg-black/50 z-[70] hidden flex items-center justify-center p-4';
        m.innerHTML = '<div class="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"><div id="consKazananBody" class="p-6"></div></div>';
        document.body.appendChild(m);
        m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
        return m;
    }

    const _kzPara = (n) => (n == null || isNaN(n)) ? null
        : '₺' + Math.round(Number(n)).toLocaleString('tr-TR');

    window.consultantKazananAc = async function (clientId) {
        const m = ensureKazananModal();
        const kutu = document.getElementById('consKazananBody');
        const kapat = `<button onclick="document.getElementById('consKazananModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>`;
        kutu.innerHTML = `<div class="flex items-center justify-between mb-4"><h3 class="font-black text-lg text-slate-800">Müşteri hangi firmayı seçti?</h3>${kapat}</div>
            <p class="text-xs text-slate-400">Yükleniyor...</p>`;
        m.classList.remove('hidden');

        const { data, error } = await supabaseClient.rpc('danisan_firma_secenekleri', { p_client_id: clientId });
        if (error) {
            // ⚠️ "Firma bulunamadı" demiyoruz: hata ile boşluk ayrı şeyler.
            kutu.innerHTML = `<div class="flex items-center justify-between mb-4"><h3 class="font-black text-lg text-slate-800">Müşteri hangi firmayı seçti?</h3>${kapat}</div>
                <div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p class="text-sm font-bold text-amber-800">Firma listesi alınamadı</p>
                    <p class="text-xs text-amber-700 mt-1">${esc(error.message)}</p></div>`;
            return;
        }

        const firmalar = data || [];
        const teklifli = firmalar.filter(f => f.teklif_var);

        kutu.innerHTML = `
            <div class="flex items-center justify-between mb-1"><h3 class="font-black text-lg text-slate-800">Müşteri hangi firmayı seçti?</h3>${kapat}</div>
            <p class="text-xs text-slate-500 mb-4">Seçimi yapan müşterinizdir; siz yalnız sonucu kaydediyorsunuz. <strong>Kayıt geri alınamaz</strong> — yanlışlıkla kaydederseniz yönetime bildirin.</p>
            ${!firmalar.length
                ? '<p class="text-sm text-slate-500">Bu kayda henüz firma davet edilmemiş.</p>'
                : `<div class="space-y-2">${firmalar.map(f => {
                    const yer = [f.ilce, f.il].filter(Boolean).join(' / ') || 'konum yok';
                    const puan = (f.puan == null) ? 'puan yok' : `★ ${Number(f.puan).toFixed(1)} (${f.puan_adedi})`;
                    const bedel = _kzPara(f.bedel_try);
                    return `<div class="border ${f.teklif_var ? 'border-slate-200' : 'border-slate-100 bg-slate-50'} rounded-xl p-3 flex items-center justify-between gap-3">
                        <div class="min-w-0">
                            <div class="text-sm font-black text-slate-800">${esc(f.firma || '—')}</div>
                            <div class="text-[11px] text-slate-500">${esc(yer)} · ${esc(puan)}</div>
                            ${f.teklif_var
                                ? `<div class="text-[11px] text-slate-700 mt-0.5"><strong>${bedel || 'bedel okunamadı'}</strong> <span class="text-slate-400">KDV hariç</span></div>`
                                : '<div class="text-[11px] text-amber-700 mt-0.5">Bu firma teklif göndermedi</div>'}
                        </div>
                        ${f.teklif_var
                            ? `<button onclick="consultantKazananKaydet('${esc(clientId)}','${esc(f.company_id)}',this)" class="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-2 rounded-lg">Bunu seçti</button>`
                            // ⚠️ Teklif göndermemiş firma KAYDEDİLEMİYOR. Aynı kural
                            // yatırımcı ekranında da var; danışman yolu o kuralın
                            // etrafından dolaşmak için kullanılamaz.
                            : '<span class="shrink-0 text-[10px] text-slate-400 text-right leading-tight">teklif<br>olmadan<br>kaydedilemez</span>'}
                    </div>`; }).join('')}</div>
                   ${teklifli.length ? '' : '<p class="text-[11px] text-amber-700 mt-3">Davet edilen firmaların hiçbiri henüz teklif göndermemiş. Teklif gelmeden kazanan kaydedilemez.</p>'}`}`;
    };

    window.consultantKazananKaydet = async function (clientId, companyId, btn) {
        const c = (_clients || []).find(x => String(x.id) === String(clientId));
        const lead = c ? c.lead_id : null;
        if (!lead) { alert('Bu danışanın CRM kaydı bulunamadı.'); return; }
        if (!window.confirm('Müşterinin bu firmayı seçtiğini kaydediyorsunuz.\n\nKayıt geri alınamaz ve firmalara bildirim gider. Devam edilsin mi?')) return;

        const eski = btn.textContent;
        btn.disabled = true; btn.textContent = 'Kaydediliyor...';
        try {
            const { data, error } = await supabaseClient.rpc('lead_kazanan',
                { p_lead_id: lead, p_company_id: companyId });
            if (error) throw error;
            // ⚠️ "Kaydedildi" demeden ÖNCE gerçekten yazıldı mı bakıyoruz.
            // Bu projede en çok tekrar eden kusur, ekranın yazılmamış bir şeye
            // "oldu" demesiydi.
            await loadClients();
            const y = (_clients || []).find(x => String(x.id) === String(clientId));
            if (!y || !y.assigned_company_id) {
                alert('Kayıt doğrulanamadı — firma yazılmamış görünüyor. Sayfayı yenileyip tekrar bakın.');
            } else {
                alert('✅ Kaydedildi: ' + ((data && data.kazanan) || y.assigned_company_name || 'firma'));
            }
            document.getElementById('consKazananModal').classList.add('hidden');
            applyClientFilters();
        } catch (e) {
            alert('Kaydedilemedi: ' + (e.message || e));
            btn.disabled = false; btn.textContent = eski;
        }
    };

    function ensureClientModal() {
        let m = document.getElementById('consClientModal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'consClientModal';
        m.className = 'tema-koyu pencere-koyu fixed inset-0 bg-black/50 z-[70] hidden flex items-center justify-center p-4';
        m.innerHTML = '<div class="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"><div id="consClientBody" class="p-6"></div></div>';
        document.body.appendChild(m);
        m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
        return m;
    }
    function openClientForm(c) {
        const m = ensureClientModal();
        const ed = !!c;
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
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Kurulum Adresi</label><input id="clAddress" value="${ed && c.address ? esc(c.address) : ''}" placeholder="İlçe / il yazmanız yeterli" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"><p class="text-[11px] text-slate-400 mt-1">Firma atadığınızda bu adres kurulumcunun müşteri kartına geçer.</p></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Danışan Durumu</label><select id="clStatus" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${CLIENT_ST.map(x => `<option value="${x[0]}" ${ed && c.status === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></div>
                <div class="border-t border-slate-100 pt-3">
                    <label class="block text-xs font-bold text-slate-600 mb-1">📍 Tesis Konumu</label>
                    <div class="grid grid-cols-2 gap-2">
                        <select id="clCity" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${ilSecenekleri(ed ? c.city : null)}</select>
                        <input id="clDistrict" value="${ed && c.district ? esc(c.district) : ''}" placeholder="İlçe" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
                    </div>
                    <p class="text-[11px] text-slate-400 mt-1">Danışanınız CRM'e aktarıldığında bu konuma <strong>en yakın 3 kurulumcu firma</strong> teklif vermeye davet edilir. Firmayı siz seçmezsiniz — yatırımcı teklifleri karşılaştırıp kendisi seçer.</p>
                </div>
                ${ed && c.lead_id
                    ? `<div class="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                           <p class="text-xs font-bold text-emerald-800">✓ Bu danışan firmanın CRM listesinde</p>
                           <p class="text-[11px] text-emerald-700 mt-0.5">Kurulum durumunu artık firma süreç adımlarıyla güncelliyor; her değişimde size bildirim düşer.${c.tracking_code ? ' Takip kodu: <span class="font-mono">' + esc(c.tracking_code) + '</span>' : ''}</p>
                       </div>
                       <input type="hidden" id="clInstall" value="${esc(c.install_status || '')}">`
                    : `<div><label class="block text-xs font-bold text-slate-600 mb-1">Kurulum Durumu</label><select id="clInstall" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${instOpts}</select></div>`}
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Notlar</label><textarea id="clNotes" rows="2" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">${ed && c.notes ? esc(c.notes) : ''}</textarea></div>
                <button onclick="consultantClientSave()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 rounded-lg">Kaydet</button>
                <div id="clResult"></div>
            </div>`;
        m.classList.remove('hidden');
        consFirmaAra();   // alt bilgi satırını bir kez bas
    }

    // FİRMA SEÇİCİ — eskiden düz bir açılır listeydi; firma sayısı arttıkça
    // aradığını bulmak imkânsızlaşıyordu. Artık ad, il ve ilçe ile aranıyor.
    // ⚠️ İl/ilçe yalnız firma bu bilgiyi girdiyse gösterilir; olmayan yerde
    // arama ada göre çalışır — uydurma konum gösterilmez.
    function consFirmaMetni(x) {
        const yer = [x.city, x.district].filter(Boolean).join(' / ');
        return x.name + (yer ? ' — ' + yer : '');
    }
    function consFirmaSecenekleri(seciliId, q) {
        const ara = String(q || '').trim().toLocaleLowerCase('tr-TR');
        const uygun = _companies.filter(x => {
            if (!ara) return true;
            return [x.name, x.city, x.district]
                .some(v => String(v || '').toLocaleLowerCase('tr-TR').includes(ara));
        });
        // Seçili firma aramaya uymasa bile listede kalmalı; yoksa Kaydet'e
        // basıldığında sessizce "firma atanmadı"ya düşerdi.
        if (seciliId && !uygun.some(x => x.id === seciliId)) {
            const sec = _companies.find(x => x.id === seciliId);
            if (sec) uygun.unshift(sec);
        }
        return '<option value="">— Firma atanmadı —</option>' +
            uygun.map(x => `<option value="${x.id}" ${seciliId === x.id ? 'selected' : ''}>${esc(consFirmaMetni(x))}</option>`).join('');
    }
    window.consFirmaAra = function () {
        const sel = document.getElementById('clCompany');
        const ara = document.getElementById('clCompanyAra');
        const not = document.getElementById('clCompanyNot');
        if (!sel) return;
        const secili = sel.value || null;
        sel.innerHTML = consFirmaSecenekleri(secili, ara ? ara.value : '');
        if (not) {
            const n = sel.options.length - 1;
            const konumluMu = _companies.some(x => x.city);
            not.textContent = !n ? 'Eşleşen firma yok.'
                : (n + ' firma' + (konumluMu ? ' · il veya ilçe yazarak daraltabilirsiniz' : ' · firmalar henüz il/ilçe girmediği için arama ada göre çalışıyor'));
        }
    };

    // 81 il — hesaplayıcıyla aynı kaynak. Konum olmadan en yakın firma bulunamaz.
    function ilSecenekleri(secili) {
        const iller = Object.keys(window.EPC_IL_VERIM || {}).sort((a, b) => a.localeCompare(b, 'tr'));
        return '<option value="">İl seçiniz…</option>' +
            iller.map(i => `<option value="${esc(i)}" ${secili === i ? 'selected' : ''}>${esc(i)}</option>`).join('');
    }

    window.consultantClientNew = function () { openClientForm(null); };
    window.consultantClientEdit = function (id) { const c = _clients.find(x => x.id === id); if (c) openClientForm(c); };

    // ⚠️ GERİ DÜŞÜŞ: danisman-crm-koprusu.sql henüz çalıştırılmadıysa address /
    // lead_id kolonları ve assign_client_to_company() yoktur. O durumda kaydetme
    // tamamen kırılmasın; eksik alanı atıp devam edelim, kullanıcıya da ne
    // eksik kaldığını söyleyelim. (PostgREST: yazmada PGRST204, okumada 42703.)
    const _kolonYok = (e) => {
        const k = String((e && e.code) || '');
        const m = String((e && e.message) || '');
        return k === 'PGRST204' || k === '42703' || /does not exist|schema cache/i.test(m);
    };
    const _rpcYok = (e) => String((e && e.code) || '') === 'PGRST202'
        || /Could not find the function/i.test(String((e && e.message) || ''));

    window.consultantClientSave = async function () {
        const id = document.getElementById('clId').value;
        const name = (document.getElementById('clName').value || '').trim();
        const res = document.getElementById('clResult');
        if (!name) { res.innerHTML = '<p class="text-red-500 text-sm">Ad soyad zorunludur.</p>'; return; }
        const il   = (document.getElementById('clCity').value || '').trim();
        const ilce = (document.getElementById('clDistrict').value || '').trim();
        const mevcut = id ? _clients.find(x => x.id === id) : null;
        const bagli  = !!(mevcut && mevcut.lead_id);

        const row = {
            name,
            phone:   (document.getElementById('clPhone').value || '').trim() || null,
            email:   (document.getElementById('clEmail').value || '').trim() || null,
            address: (document.getElementById('clAddress').value || '').trim() || null,
            city:    il || null,
            district: ilce || null,
            status:  document.getElementById('clStatus').value,
            notes:   (document.getElementById('clNotes').value || '').trim() || null,
            updated_at: new Date().toISOString()
        };

        // ⚠️ DANIŞMAN ARTIK FİRMA SEÇMİYOR. assigned_company_id buradan yazılmaz;
        // kazanan firmayı lead_kazanan() yatırımcının seçimiyle yazar. Danışmanın
        // işi yatırımcıya sistemi anlatmak, teklifleri yorumlamak.
        if (!bagli) {
            const ins = document.getElementById('clInstall');
            if (ins && ins.tagName === 'SELECT') row.install_status = ins.value || null;
        }

        res.innerHTML = '<p class="text-xs text-slate-400">Kaydediliyor...</p>';
        let clientId = id, adresDustu = false;
        const yaz = async (govde) => {
            if (id) {
                const { error } = await supabaseClient.from('consultant_clients').update(govde).eq('id', id);
                if (error) throw error;
                return id;
            }
            govde.consultant_id = window.currentConsultant.id;
            const { data, error } = await supabaseClient
                .from('consultant_clients').insert(govde).select('id').single();
            if (error) throw error;
            return data.id;
        };
        try {
            try {
                clientId = await yaz(row);
            } catch (e) {
                if (!_kolonYok(e)) throw e;
                // Şema güncellemesi henüz yapılmadıysa yeni alanları atla.
                ['address', 'city', 'district'].forEach(k => { delete row[k]; });
                adresDustu = true;
                clientId = await yaz(row);
            }
        } catch (e) {
            res.innerHTML = `<p class="text-red-500 text-sm">${esc(e.message || e)}</p>`;
            return;
        }

        // CRM'E AKTAR — yarışmalı atamayı çalıştırır (en yakın 3 firma).
        let bilgi = '';
        if (!bagli && il) {
            res.innerHTML = '<p class="text-xs text-slate-400">En yakın firmalar bulunuyor...</p>';
            try {
                const { data, error } = await supabaseClient.rpc('danisan_crm_e_aktar', {
                    p_client_id: clientId, p_il: il, p_ilce: ilce || null, p_kapsam: 2
                });
                if (error) throw error;
                if (data && data.durum === 'aktarildi') {
                    const n = Number(data.atanan_firma) || 0;
                    bilgi = n > 0
                        ? `✓ ${n} kurulumcu firma teklif vermeye davet edildi · ${data.takip_kodu}`
                        : `Kayıt açıldı ama bölgede kayıtlı firma bulunamadı · ${data.takip_kodu}`;
                }
            } catch (e) {
                if (_rpcYok(e)) {
                    res.innerHTML = `<p class="text-amber-600 text-sm font-bold">Danışan kaydedildi, CRM'e aktarılamadı.</p>
                                     <p class="text-xs text-slate-500 mt-1">Veritabanı güncellemesi (danisman-rolu.sql) henüz çalıştırılmamış.</p>`;
                    await loadClients(); applyClientFilters();
                    return;
                }
                // ⚠️ "Tekrar denerseniz olur" cümlesi HER hataya uymaz. Engel
                // profil onayıysa tekrar denemek hiçbir şey değiştirmez; o
                // cümleyi göstermek danışmanı boşuna uğraştırmak olur.
                const onayEngeli = /onay|reddedil|askıya/i.test(String(e.message || e));
                res.innerHTML = `<p class="text-amber-600 text-sm font-bold">Danışan kaydedildi, CRM'e aktarılamadı.</p>
                                 <p class="text-xs text-slate-500 mt-1">${esc(e.message || e)}</p>
                                 <p class="text-xs text-slate-400 mt-1">${onayEngeli
                                    ? 'Kaydınız duruyor; profiliniz onaylandıktan sonra bu danışanı açıp kaydederek firmalara iletebilirsiniz.'
                                    : 'Kaydı açıp tekrar kaydederseniz aktarım yeniden denenir.'}</p>`;
                await loadClients(); applyClientFilters();
                return;
            }
        } else if (!bagli && !il) {
            bilgi = 'Kaydedildi. İl seçilmediği için henüz firmalara iletilmedi.';
        }

        await loadClients(); applyClientFilters();
        if (adresDustu) bilgi = (bilgi ? bilgi + ' · ' : '') + 'Konum kaydedilemedi (veritabanı güncellemesi bekleniyor).';
        if (bilgi) {
            res.innerHTML = `<p class="text-emerald-600 text-sm font-bold">${esc(bilgi)}</p>`;
            setTimeout(() => { const m = document.getElementById('consClientModal'); if (m) m.classList.add('hidden'); }, 1800);
        } else {
            document.getElementById('consClientModal').classList.add('hidden');
        }
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


/* ============================================================================
   TEKLİF DEĞERLENDİRME DANIŞMANLIĞI — danışman tarafı
   Yatırımcı üç firmadan teklif aldıktan sonra danışmandan görüş isteyebilir.
   Danışman burada teklifleri yan yana görür ve görüşünü yazar.

   ⚠️ DANIŞMAN MALİYET GÖRMEZ. Sunucudaki danisman_teklif_ozeti() firm_quotes
   items alanını hiç döndürmüyor; orada firmanın alış maliyeti (cost) ve kâr
   marjı (margin) duruyor. Danışman yalnız yatırımcıya zaten söylenmiş bedeli
   ve sistem özetini görür.
   ============================================================================ */
(function () {
    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s) : String(s == null ? '' : s));
    const say = (n) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('tr-TR');
    let _talepler = [], _acik = null, _teklifler = [];

    window.consultantQuoteReviews = async function (_adrestenGeldi) {
        if (window.epcAdresYaz) window.epcAdresYaz('teklif-degerlendirme', null, _adrestenGeldi);
        _acik = null;
        await yukle();
        ciz();
    };

    async function yukle() {
        if (!supabaseClient) return;
        try {
            const { data, error } = await supabaseClient.rpc('danisman_talepleri');
            if (error) throw error;
            _talepler = data || [];
        } catch (e) { _talepler = []; }
    }

    function ust() {
        return `
            <div class="flex items-center gap-3 mb-5">
                <button onclick="consultantBackToMenu()" class="text-slate-500 hover:text-indigo-600 font-bold">← Panele Dön</button>
                <span class="text-slate-300">/</span>
                <h2 class="text-lg md:text-xl font-black text-slate-800">⚖️ Teklif Değerlendirme</h2>
            </div>`;
    }

    function ciz() {
        const root = document.getElementById('consultantPanelRoot');
        if (!root) return;

        if (!_talepler.length) {
            root.innerHTML = ust() + `
                <div class="bos-durum"><span class="bos-durum-ico">⚖️</span>
                    <h4>Henüz değerlendirme talebi yok</h4>
                    <p>Yatırımcılar aldıkları teklifleri değerlendirmenizi istediğinde burada görünür.</p></div>`;
            return;
        }

        const kart = (t) => `
            <div class="kart p-4 mb-2">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-black text-slate-800">${esc(t.yatirimci || 'Yatırımcı')}</span>
                            <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${t.durum === 'acik' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}">${t.durum === 'acik' ? 'Görüş bekleniyor' : 'Görüş verildi'}</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${t.teklif_sayisi || 0} teklif</span>
                        </div>
                        <div class="text-[11px] text-slate-400 mt-0.5">${esc([t.ilce, t.il].filter(Boolean).join(' / ') || '')}</div>
                        ${t.gorus ? `<p class="text-xs text-slate-600 mt-1.5" style="white-space:pre-wrap">${esc(t.gorus)}</p>` : ''}
                    </div>
                    <button onclick="consultantReviewOpen('${t.request_id}')" class="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-lg text-xs">
                        ${t.durum === 'acik' ? 'Teklifleri incele' : 'Görüşü düzenle'}
                    </button>
                </div>
            </div>`;

        root.innerHTML = ust() + `
            <p class="text-[11px] text-slate-400 mb-3">Teklifleri karşılaştırıp yatırımcıya görüş yazın. Firmaların maliyet ve kâr bilgisi size gösterilmez; yalnız yatırımcıya sunulan bedeller görünür.</p>
            ${_talepler.map(kart).join('')}`;
    }

    window.consultantReviewOpen = async function (rid) {
        _acik = _talepler.find(t => t.request_id === rid) || null;
        if (!_acik) return;
        try {
            const { data, error } = await supabaseClient.rpc('danisman_teklif_ozeti', { p_request_id: rid });
            if (error) throw error;
            _teklifler = data || [];
        } catch (e) { alert('Teklifler alınamadı: ' + (e.message || e)); return; }
        cizDetay();
    };

    function cizDetay() {
        const root = document.getElementById('consultantPanelRoot');
        if (!root || !_acik) return;

        const enUcuz = _teklifler.reduce((m, q) => (m == null || (Number(q.bedel_try_kdv) || Infinity) < m) ? (Number(q.bedel_try_kdv) || Infinity) : m, null);

        const satir = (q) => {
            const kwp = Number(q.kwp) || 0;
            const birim = (kwp > 0 && q.bedel_try_kdv) ? Math.round(Number(q.bedel_try_kdv) / kwp) : null;
            const ucuz = enUcuz != null && Math.abs((Number(q.bedel_try_kdv) || 0) - enUcuz) < 1;
            return `
            <tr class="border-b border-slate-100">
                <td class="p-2">
                    <div class="font-bold text-slate-800 text-sm">${esc(q.firma || '')}</div>
                    <div class="text-[10px] text-slate-400">${esc(q.teklif_no || '')}</div>
                    ${(q.firma_puani != null && Number(q.firma_puan_adedi) > 0)
                        ? `<div class="text-[11px] text-amber-600">★ ${Number(q.firma_puani).toFixed(1)} <span class="text-slate-400">(${q.firma_puan_adedi})</span></div>`
                        : '<div class="text-[11px] text-slate-400">puan yok</div>'}
                </td>
                <td class="p-2 text-xs text-slate-600">${kwp} kWp${q.panel_sayisi ? `<br><span class="text-slate-400">${q.panel_sayisi} panel</span>` : ''}${Number(q.batarya_kwh) > 0 ? `<br><span class="text-slate-400">+${q.batarya_kwh} kWh</span>` : ''}</td>
                <td class="p-2 text-xs text-slate-600">${say(q.yillik_uretim)} kWh</td>
                <td class="p-2 text-right">
                    <div class="font-black text-slate-800 text-sm">₺${say(q.bedel_try_kdv)}</div>
                    ${birim ? `<div class="text-[11px] text-slate-400">₺${say(birim)}/kWp</div>` : ''}
                    ${ucuz ? '<div class="text-[10px] font-black text-emerald-600">EN DÜŞÜK</div>' : ''}
                </td>
            </tr>`;
        };

        const firmaSec = '<option value="">— Firma öne çıkarma —</option>' +
            _teklifler.map(q => `<option value="${q.company_id}" ${_acik.onerilen_company_id === q.company_id ? 'selected' : ''}>${esc(q.firma)}</option>`).join('');

        root.innerHTML = `
            <div class="flex items-center gap-3 mb-5">
                <button onclick="consultantQuoteReviews()" class="text-slate-500 hover:text-indigo-600 font-bold">← Taleplere Dön</button>
                <span class="text-slate-300">/</span>
                <h2 class="text-lg md:text-xl font-black text-slate-800">${esc(_acik.yatirimci || 'Yatırımcı')}</h2>
            </div>

            ${_teklifler.length ? `
            <div class="kart overflow-x-auto mb-4">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50"><tr class="text-[11px] text-slate-500 text-left">
                        <th class="p-2">Firma</th><th class="p-2">Sistem</th><th class="p-2">Yıllık üretim</th><th class="p-2 text-right">Bedel (KDV dahil)</th>
                    </tr></thead>
                    <tbody>${_teklifler.map(satir).join('')}</tbody>
                </table>
            </div>`
            : '<div class="kart p-5 mb-4"><p class="text-sm text-slate-500">Bu başvuruya henüz teklif gelmemiş.</p></div>'}

            ${!_teklifler.length
            // ⚠️ TEKLİF YOKKEN FORM AÇILMIYOR. Eskiden ekran "henüz teklif
            // gelmemiş" derken formu açık bırakıyordu; gönderilen görüş
            // consultant_credits'e "değerlendirme" olarak düşüyordu —
            // değerlendirilmiş hiçbir teklif olmadan. Aynı kural sunucuda da
            // var (danisman_gorus_yaz); ikisi birlikte değişmeli.
            ? `<div class="kart p-4">
                <p class="text-sm font-bold text-slate-700">Görüş yazmak için önce teklif gerekiyor</p>
                <p class="text-xs text-slate-500 mt-1">Değerlendirilecek bir teklif olmadan görüş yazılamaz. Davet edilen firmalar tekliflerini gönderdiğinde bu sayfa açılır ve size bildirim gelir.</p>
               </div>`
            : `<div class="kart p-4">
                <label class="block text-xs font-bold text-slate-600 mb-1">Görüşünüz</label>
                <textarea id="consGorus" rows="5" placeholder="Teklifleri neye göre karşılaştırdınız? Yatırımcının dikkat etmesi gereken farklar neler?" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">${esc(_acik.gorus || '')}</textarea>
                <label class="block text-xs font-bold text-slate-600 mt-3 mb-1">Öne çıkardığınız firma (isteğe bağlı)</label>
                <select id="consOneri" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${firmaSec}</select>
                <p class="text-[11px] text-slate-400 mt-1">Yatırımcıya "bu bir görüştür, karar sizindir" notuyla gösterilir.</p>
                <button onclick="consultantReviewSave()" class="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-lg">Görüşü Gönder</button>
                <div id="consGorusSonuc" class="mt-2"></div>
               </div>`}`;
    }

    window.consultantReviewSave = async function () {
        if (!_acik) return;
        const g = (document.getElementById('consGorus').value || '').trim();
        const sonuc = document.getElementById('consGorusSonuc');
        if (!g) { sonuc.innerHTML = '<p class="text-red-500 text-sm">Görüş boş olamaz.</p>'; return; }
        const oneri = document.getElementById('consOneri').value || null;
        sonuc.innerHTML = '<p class="text-xs text-slate-400">Gönderiliyor…</p>';
        try {
            const { error } = await supabaseClient.rpc('danisman_gorus_yaz',
                { p_request_id: _acik.request_id, p_gorus: g, p_onerilen: oneri });
            if (error) throw error;
            sonuc.innerHTML = '<p class="text-emerald-600 text-sm font-bold">Görüşünüz yatırımcıya iletildi.</p>';
            setTimeout(() => window.consultantQuoteReviews(), 1200);
        } catch (e) { sonuc.innerHTML = `<p class="text-red-500 text-sm">${esc(e.message || e)}</p>`; }
    };
})();
