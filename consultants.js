/* ============================================================================
   consultants.js — DANIŞMANLIK MODÜLÜ (Faz 1 + Faz 2)
   Faz 1: danışman onboarding + admin onayı + ziyaretçi listesi
   Faz 2: randevu akışı — yatırımcı müsait slottan talep eder (takip kodu alır),
          danışman panelinden onaylayıp Google Meet linkini yapıştırır,
          yatırımcı kodla durumu + Meet linkini görür.
   consultants.sql + appointments.sql çalıştırılmış olmalıdır.
   ============================================================================ */
(function () {
    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s) : String(s == null ? '' : s));
    const CONS_DAYS = [['mon','Pzt'],['tue','Sal'],['wed','Çar'],['thu','Per'],['fri','Cum'],['sat','Cmt'],['sun','Paz']];
    const CONS_HOURS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
    const DOW = { 0:'sun', 1:'mon', 2:'tue', 3:'wed', 4:'thu', 5:'fri', 6:'sat' };
    let _consAvail = {};
    let _approvedConsultants = [];
    let _bookConsultant = null, _bookTime = null;

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
            const { data, error } = await supabaseClient.from('consultants')
                .select('*').eq('status', 'approved').order('completed_jobs', { ascending: false });
            if (error) throw error;
            list = data || [];
        } catch (e) {
            root.innerHTML = `<p class="text-red-500 text-sm">Liste yüklenemedi: ${esc(e.message || e)}</p>`;
            return;
        }
        _approvedConsultants = list;

        const card = (c) => `
            <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
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
                <button onclick="consultantBook('${c.id}')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg">📅 Randevu Al</button>
            </div>`;

        root.innerHTML = `
            <div class="bg-gradient-to-br from-indigo-600 to-slate-900 text-white rounded-2xl p-8 mb-8 text-center">
                <h2 class="text-2xl md:text-3xl font-black mb-3">Bağımsız Solar Danışmanları</h2>
                <p class="text-indigo-100 max-w-2xl mx-auto text-sm md:text-base">Yatırım kararınızı satıcıdan bağımsız, tarafsız uzmanlarla verin. Uygun danışmandan online görüşme için randevu alın.</p>
            </div>
            ${list.length
                ? `<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">${list.map(card).join('')}</div>`
                : `<div class="bg-slate-50 border border-slate-200 rounded-2xl p-10 text-center mb-8"><div class="text-4xl mb-3">🎯</div><p class="font-black text-slate-700 mb-1">Henüz onaylı danışman yok</p><p class="text-sm text-slate-500">Danışmanlar başvurularını tamamladıkça burada listelenecek.</p></div>`}

            <div class="bg-white border border-slate-200 rounded-2xl p-6 mb-4">
                <h3 class="font-black text-slate-800 mb-1">📋 Randevunu Sorgula</h3>
                <p class="text-sm text-slate-500 mb-3">Randevu aldıktan sonra size verilen takip kodunu girin; durumu ve onaylandıysa Google Meet linkini görün.</p>
                <div class="flex flex-col sm:flex-row gap-2">
                    <input id="apptLookupCode" placeholder="örn. RND-1A2B3C4D" class="flex-1 border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500">
                    <button onclick="consultantLookup()" class="bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-lg text-sm">Sorgula</button>
                </div>
                <div id="apptLookupResult" class="mt-3"></div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white border border-slate-200 rounded-2xl p-6">
                    <h3 class="font-black text-slate-800 mb-1">💬 İsimsiz Talep Bırak</h3>
                    <p class="text-sm text-slate-600 mb-3">İsim vermeden sorunuzu yazın; danışmanlar yanıtlasın. Takip kodunuzla yazışmayı sürdürün.</p>
                    <div class="flex flex-col gap-2">
                        <button onclick="investorRequestNew()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-lg text-sm">Yeni Talep Oluştur</button>
                        <div class="flex gap-2"><input id="reqLookupCode" placeholder="TLP-… (talebini aç)" class="flex-1 border border-slate-300 p-2.5 rounded-lg text-sm"><button onclick="investorThreadOpen()" class="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2.5 rounded-lg text-sm">Aç</button></div>
                    </div>
                </div>
                <div class="bg-indigo-50 border border-indigo-200 rounded-2xl p-6">
                    <h3 class="font-black text-slate-800 mb-1">Danışman mısınız?</h3>
                    <p class="text-sm text-slate-600 mb-4">Kurumsal Giriş'ten "Danışman" olarak kayıt olun, profilinizi doldurup onaya gönderin.</p>
                    <a href="#auth" class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm">Kurumsal Giriş ›</a>
                </div>
            </div>`;
    }
    window.renderConsultantsList = renderConsultantsList;

    // ================================================================ RANDEVU AL (booking)
    function ensureBookModal() {
        let m = document.getElementById('consBookModal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'consBookModal';
        m.className = 'fixed inset-0 bg-black/50 z-50 hidden flex items-center justify-center p-4';
        m.innerHTML = '<div class="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"><div id="consBookBody" class="p-6"></div></div>';
        document.body.appendChild(m);
        m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
        return m;
    }

    window.consultantBook = function (cid) {
        const c = _approvedConsultants.find(x => x.id === cid);
        if (!c) return;
        _bookConsultant = c; _bookTime = null;
        const m = ensureBookModal();
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('consBookBody').innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-black text-lg text-slate-800 min-w-0 truncate">Randevu · ${esc(c.full_name)}</h3>
                <button onclick="document.getElementById('consBookModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 text-xl leading-none shrink-0 ml-2">✕</button>
            </div>
            <div class="space-y-3">
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Tarih</label><input type="date" id="bookDate" min="${today}" onchange="bookDateChange()" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Uygun Saat</label><div id="bookTimes" class="flex flex-wrap gap-2"><span class="text-xs text-slate-400">Önce tarih seçin.</span></div></div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Ad Soyad</label><input id="bookName" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Telefon</label><input id="bookPhone" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                </div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">E-posta</label><input id="bookEmail" type="email" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Notunuz (opsiyonel)</label><textarea id="bookNote" rows="2" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></textarea></div>
                <button onclick="bookingSubmit()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-lg">Randevu Talebi Gönder</button>
                <div id="bookResult"></div>
            </div>`;
        m.classList.remove('hidden');
    };

    window.bookDateChange = function () {
        const d = document.getElementById('bookDate').value;
        const box = document.getElementById('bookTimes');
        _bookTime = null;
        if (!d || !_bookConsultant) { box.innerHTML = '<span class="text-xs text-slate-400">Önce tarih seçin.</span>'; return; }
        const day = DOW[new Date(d + 'T00:00:00').getDay()];
        const times = (_bookConsultant.availability && _bookConsultant.availability[day]) || [];
        if (!times.length) { box.innerHTML = '<span class="text-xs text-amber-600">Bu gün için müsait saat yok, başka gün deneyin.</span>'; return; }
        box.innerHTML = times.slice().sort().map(t => `<button type="button" onclick="bookPickTime('${t}', this)" class="px-3 py-1.5 rounded-lg text-sm font-bold border border-slate-300 hover:bg-indigo-50">${t}</button>`).join('');
    };
    window.bookPickTime = function (t, el) {
        _bookTime = t;
        document.querySelectorAll('#bookTimes button').forEach(b => b.className = 'px-3 py-1.5 rounded-lg text-sm font-bold border border-slate-300 hover:bg-indigo-50');
        if (el) el.className = 'px-3 py-1.5 rounded-lg text-sm font-bold border-2 border-indigo-600 bg-indigo-600 text-white';
    };
    window.bookingSubmit = async function () {
        if (!_bookConsultant || !supabaseClient) return;
        const date = document.getElementById('bookDate').value;
        const name = (document.getElementById('bookName').value || '').trim();
        const email = (document.getElementById('bookEmail').value || '').trim();
        const phone = (document.getElementById('bookPhone').value || '').trim();
        const note = (document.getElementById('bookNote').value || '').trim();
        if (!date || !_bookTime) { alert('Lütfen tarih ve uygun bir saat seçin.'); return; }
        if (!name || !email) { alert('Lütfen ad soyad ve e-posta girin.'); return; }
        const day = DOW[new Date(date + 'T00:00:00').getDay()];
        const res = document.getElementById('bookResult');
        res.innerHTML = '<p class="text-xs text-slate-400">Gönderiliyor...</p>';
        try {
            const { data, error } = await supabaseClient.rpc('book_appointment', {
                p_consultant: _bookConsultant.id, p_name: name, p_email: email, p_phone: phone,
                p_day: day, p_time: _bookTime, p_date: date, p_note: note
            });
            if (error) throw error;
            res.innerHTML = `<div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-800">
                ✅ Randevu talebiniz alındı! Takip kodunuz:
                <div class="text-lg font-black my-1 tracking-wider">${esc(data)}</div>
                Danışman onayladığında bu kodla yukarıdaki <strong>"Randevunu Sorgula"</strong> alanından durumu ve Google Meet linkini görebilirsiniz. Lütfen kodu not alın.
            </div>`;
        } catch (e) {
            res.innerHTML = `<p class="text-red-500 text-sm">Gönderilemedi: ${esc(e.message || e)}</p>`;
        }
    };

    // ================================================================ RANDEVU SORGULA (investor)
    window.consultantLookup = async function () {
        const code = (document.getElementById('apptLookupCode')?.value || '').trim();
        const res = document.getElementById('apptLookupResult');
        if (!res) return;
        if (!code) { res.innerHTML = '<p class="text-xs text-slate-400">Takip kodunuzu girin.</p>'; return; }
        if (!supabaseClient) { res.innerHTML = '<p class="text-slate-400 text-sm">Bağlantı yok.</p>'; return; }
        res.innerHTML = '<p class="text-xs text-slate-400">Sorgulanıyor...</p>';
        try {
            const { data, error } = await supabaseClient.rpc('get_appointment_by_code', { p_code: code });
            if (error) throw error;
            const a = Array.isArray(data) ? data[0] : data;
            if (!a) { res.innerHTML = '<p class="text-sm text-amber-700">Bu koda ait randevu bulunamadı.</p>'; return; }
            const bm = { pending:['Onay bekliyor','bg-amber-100 text-amber-800'], approved:['Onaylandı','bg-emerald-100 text-emerald-700'], rejected:['Reddedildi','bg-red-100 text-red-700'], done:['Tamamlandı','bg-slate-200 text-slate-700'] }[a.status] || ['—','bg-slate-100 text-slate-600'];
            res.innerHTML = `<div class="bg-white border border-slate-200 rounded-xl p-4 text-sm">
                <div class="flex items-center justify-between mb-2"><span class="font-black text-slate-800">${esc(a.consultant_name || 'Danışman')}</span><span class="text-[10px] font-black px-2 py-1 rounded-full ${bm[1]}">${bm[0]}</span></div>
                <p class="text-slate-600">📅 ${esc(a.slot_date || '')} · ${esc(a.slot_time || '')}</p>
                ${a.status === 'approved' && a.meet_link ? `<a href="${esc(a.meet_link)}" target="_blank" rel="noopener" class="mt-3 inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-sm">🎥 Google Meet'e Katıl</a>` : ''}
                ${a.status === 'pending' ? '<p class="text-xs text-slate-400 mt-2">Danışman onayı bekleniyor. Onaylanınca Meet linki burada görünecek.</p>' : ''}
                ${a.status === 'rejected' ? '<p class="text-xs text-red-500 mt-2">Bu randevu reddedildi. Başka bir tarih/saat deneyebilirsiniz.</p>' : ''}
            </div>`;
        } catch (e) {
            res.innerHTML = `<p class="text-red-500 text-sm">${esc(e.message || e)}</p>`;
        }
    };

    // ================================================================ DANIŞMAN PANELİ
    function availGridInner() {
        let h = `<table class="border-collapse"><thead><tr><th class="p-1"></th>${CONS_DAYS.map(d => `<th class="p-1 text-[10px] text-slate-500 font-bold">${d[1]}</th>`).join('')}</tr></thead><tbody>`;
        CONS_HOURS.forEach(hour => {
            h += `<tr><td class="p-1 text-[10px] text-slate-400 font-bold pr-2 whitespace-nowrap">${hour}</td>`;
            CONS_DAYS.forEach(d => {
                const on = (Array.isArray(_consAvail[d[0]]) ? _consAvail[d[0]] : []).includes(hour);
                h += `<td class="p-0.5"><button type="button" onclick="consAvailToggle('${d[0]}','${hour}')" class="w-9 h-7 rounded ${on ? 'bg-emerald-500' : 'bg-slate-100 hover:bg-slate-200'} transition"></button></td>`;
            });
            h += `</tr>`;
        });
        return h + `</tbody></table>`;
    }
    window.consAvailToggle = function (day, hour) {
        if (!Array.isArray(_consAvail[day])) _consAvail[day] = [];
        const i = _consAvail[day].indexOf(hour);
        if (i >= 0) _consAvail[day].splice(i, 1); else _consAvail[day].push(hour);
        const g = document.getElementById('consAvailGrid');
        if (g) g.innerHTML = availGridInner();
    };

    function statusBanner(c) {
        const s = c.status || 'draft';
        if (s === 'approved') return `<div class="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-sm font-bold">✅ Profiliniz onaylandı — ziyaretçi sayfasında listeleniyorsunuz.</div>`;
        if (s === 'pending')  return `<div class="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm font-bold">⏳ Profiliniz onay bekliyor. Admin incelemesinden sonra yayınlanacak.</div>`;
        if (s === 'rejected') return `<div class="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm"><strong>❌ Profiliniz reddedildi.</strong>${c.reject_reason ? `<br>Gerekçe: ${esc(c.reject_reason)}` : ''}<br><span class="text-xs">Düzenleyip tekrar onaya gönderebilirsiniz.</span></div>`;
        return `<div class="bg-slate-100 border border-slate-200 text-slate-600 rounded-xl p-4 text-sm">📝 Taslak — profilinizi doldurup "Onaya Gönder" ile yayına başvurun.</div>`;
    }

    function renderConsultantPanel(c) {
        const root = document.getElementById('consultantPanelRoot');
        if (!root) return;
        _consAvail = (c.availability && typeof c.availability === 'object') ? JSON.parse(JSON.stringify(c.availability)) : {};

        let _gridHtml = '<p class="text-xs text-red-500">Müsaitlik ızgarası yüklenemedi.</p>';
        try { _gridHtml = availGridInner(); } catch (e) { console.error('availGridInner:', e); }

        try {
        root.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h2 class="text-xl md:text-2xl font-black text-slate-800">🎯 Danışman Panelim</h2>
            </div>
            <div class="mb-5">${statusBanner(c)}</div>

            <div class="bg-white border border-slate-200 rounded-xl p-5 md:p-6 mb-5">
                <h3 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-4">Profil Bilgileri</h3>
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

            <div class="bg-white border border-slate-200 rounded-xl p-5 md:p-6 mb-5">
                <h3 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Müsaitlik (haftalık)</h3>
                <p class="text-xs text-slate-400 mb-3">Görüşmeye açık olduğunuz gün ve saatleri işaretleyin. Yatırımcılar yalnız bu saatlerden randevu alabilir.</p>
                <div class="overflow-x-auto"><div id="consAvailGrid">${_gridHtml}</div></div>
            </div>

            <div class="flex flex-wrap gap-3 mb-6">
                <button onclick="consultantSave(false)" class="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold px-5 py-2.5 rounded-lg">Taslağı Kaydet</button>
                <button onclick="consultantSave(true)" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-2.5 rounded-lg">Onaya Gönder ›</button>
            </div>

            <div class="bg-white border border-slate-200 rounded-xl p-5 md:p-6 mb-5">
                <h3 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-4">📅 Randevu Talepleri</h3>
                <div id="consApptInbox"><p class="text-sm text-slate-400">Yükleniyor...</p></div>
            </div>

            <div class="bg-white border border-slate-200 rounded-xl p-5 md:p-6 mb-5">
                <h3 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-4">💬 Yatırımcı Talepleri (Anonim)</h3>
                <div id="consRequestsInbox"><p class="text-sm text-slate-400">Yükleniyor...</p></div>
            </div>`;
        } catch (e) {
            console.error('renderConsultantPanel:', e);
            root.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">Panel yüklenirken bir hata oluştu: ' + ((e && e.message) || e) + '. Lütfen sayfayı yenileyin.</div>';
        }

        try { loadConsultantAppointments(c.id); } catch (e) { console.error(e); }
        if (window.loadConsultantRequests) { try { loadConsultantRequests('consRequestsInbox'); } catch (e) { console.error(e); } }
    }
    window.renderConsultantPanel = renderConsultantPanel;

    async function loadConsultantAppointments(cid) {
        const box = document.getElementById('consApptInbox');
        if (!box || !supabaseClient) return;
        let list = [];
        try {
            const { data, error } = await supabaseClient.from('appointments')
                .select('*').eq('consultant_id', cid).order('created_at', { ascending: false });
            if (error) throw error;
            list = data || [];
        } catch (e) { box.innerHTML = `<p class="text-red-500 text-sm">${esc(e.message || e)}</p>`; return; }
        if (!list.length) { box.innerHTML = '<p class="text-sm text-slate-400">Henüz randevu talebi yok.</p>'; return; }
        const badge = (s) => ({ pending:['Onay Bekliyor','bg-amber-100 text-amber-800'], approved:['Onaylandı','bg-emerald-100 text-emerald-700'], rejected:['Reddedildi','bg-red-100 text-red-700'], done:['Tamamlandı','bg-slate-200 text-slate-700'] }[s] || ['—','bg-slate-100 text-slate-600']);
        box.innerHTML = list.map(a => {
            const b = badge(a.status);
            return `<div class="border border-slate-100 rounded-lg p-4 mb-2">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 mb-1"><span class="font-black text-slate-800">${esc(a.investor_name || 'Yatırımcı')}</span><span class="text-[10px] font-black px-2 py-1 rounded-full ${b[1]}">${b[0]}</span></div>
                        <p class="text-xs text-slate-500">📅 ${esc(a.slot_date || '')} · ${esc(a.slot_time || '')}</p>
                        <p class="text-[11px] text-slate-400 mt-1">${esc(a.investor_email || '')} ${a.investor_phone ? '· ' + esc(a.investor_phone) : ''}</p>
                        ${a.note ? `<p class="text-xs text-slate-600 mt-1">"${esc(a.note)}"</p>` : ''}
                        ${a.status === 'approved' && a.meet_link ? `<p class="text-[11px] text-emerald-700 mt-1 break-all">🎥 ${esc(a.meet_link)}</p>` : ''}
                    </div>
                    <div class="flex flex-col gap-2 shrink-0">
                        ${a.status === 'pending' ? `<button onclick="consApptApprove('${a.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap">Onayla + Meet</button><button onclick="consApptReject('${a.id}')" class="bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold px-3 py-1.5 rounded-lg">Reddet</button>` : ''}
                        ${a.status === 'approved' ? `<button onclick="consApptApprove('${a.id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap">Meet'i güncelle</button>` : ''}
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    window.consApptApprove = async function (id) {
        const link = prompt("Google Meet linkini yapıştırın (yatırımcıya bu link gösterilecek):", "https://meet.google.com/");
        if (link === null) return;
        if (!link.trim()) { alert("Meet linki gerekli."); return; }
        try {
            const { error } = await supabaseClient.from('appointments')
                .update({ status: 'approved', meet_link: link.trim(), updated_at: new Date().toISOString() }).eq('id', id);
            if (error) throw error;
            // E-posta bildirimi: 'notify-appointment' Edge Function deploy edildiyse gönderir, yoksa sessiz geçer
            try { await supabaseClient.functions.invoke('notify-appointment', { body: { appointment_id: id } }); } catch (_) {}
            if (window.currentConsultant) loadConsultantAppointments(window.currentConsultant.id);
        } catch (e) { alert('Hata: ' + (e.message || e)); }
    };
    window.consApptReject = async function (id) {
        if (!confirm('Bu randevu talebini reddetmek istediğinize emin misiniz?')) return;
        try {
            const { error } = await supabaseClient.from('appointments')
                .update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', id);
            if (error) throw error;
            if (window.currentConsultant) loadConsultantAppointments(window.currentConsultant.id);
        } catch (e) { alert('Hata: ' + (e.message || e)); }
    };

    window.showConsultantPanel = function (cons, email) {
        document.getElementById('authContainer')?.classList.add('hidden');
        document.getElementById('landingContainer')?.classList.add('hidden');
        document.getElementById('appContainer')?.classList.remove('hidden');
        document.getElementById('mainMenu')?.classList.add('hidden');
        document.querySelector('#appContainer > div.w-full.max-w-7xl.mx-auto')?.classList.remove('hidden'); // üst bar (profil/çıkış) görünsün
        ['crmModule','adminModule','companyManagementModule','techSupportModule','salesAssistantModule','educationModule','regulationsModule'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
        document.getElementById('consultantPanelModule')?.classList.remove('hidden');

        const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.textContent = v; };
        set('userNameDisplay', cons.full_name || 'Danışman');
        set('userCompanyDisplay', 'Danışman');
        if (email) set('userEmailDisplay', email);
        set('userInitials', (cons.avatar_initials || (cons.full_name || 'D').charAt(0)).toUpperCase());
        document.getElementById('adminPanelCard')?.classList.add('hidden');

        renderConsultantPanel(cons);
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
            availability: _consAvail,
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
            renderConsultantPanel(upd);
            alert(submit ? 'Profiliniz onaya gönderildi. Admin onayından sonra ziyaretçi sayfasında görüneceksiniz.' : 'Taslak kaydedildi.');
        } catch (e) {
            alert('Kaydedilemedi: ' + (e.message || e));
        }
    };

    if (document.getElementById('consultantsRoot')) renderConsultantsList();
})();