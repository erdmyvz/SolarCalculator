/* ============================================================================
   messaging.js — MESAJLAŞMA v1 (Danışman ↔ Kurulumcu Firma)
   Aynı çekirdek iki arayüzde kullanılır:
     · Danışman  → panel içinde  (consultantPanelRoot)
     · Kurulumcu → kendi modülü  (messagesRoot)
   messaging.sql çalıştırılmış olmalıdır.
   ============================================================================ */
(function () {
    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s) : String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

    let _convs = [], _active = null, _msgs = [], _companies = [], _poll = null;
    let _tab = 'msgs', _refs = [];   // firma tarafı: Mesajlar / Yönlendirmeler

    // ---------------------------------------------------------------- kimlik
    function me() {
        if (window.currentConsultant && window.currentConsultant.id) {
            return { role: 'consultant', id: window.currentConsultant.id,
                     name: window.currentConsultant.full_name || 'Danışman' };
        }
        const p = window.currentUserProfile;
        if (p && p.company_id) {
            return { role: 'company', id: p.id, company_id: p.company_id,
                     name: (p.full_name || p.first_name || 'Firma') + '' };
        }
        return null;
    }

    function timeAgo(ts) {
        const d = (Date.now() - new Date(ts).getTime()) / 1000;
        if (d < 60) return 'az önce';
        if (d < 3600) return Math.floor(d / 60) + ' dk';
        if (d < 86400) return Math.floor(d / 3600) + ' sa';
        if (d < 604800) return Math.floor(d / 86400) + ' gün';
        return new Date(ts).toLocaleDateString('tr-TR');
    }

    function unread(c, u) {
        const seen = u.role === 'consultant' ? c.consultant_read_at : c.company_read_at;
        if (!c.last_message_at) return false;
        return !seen || new Date(c.last_message_at) > new Date(seen);
    }

    // ---------------------------------------------------------------- veri
    async function loadConvs() {
        if (!window.supabaseClient) return;
        try {
            const { data, error } = await supabaseClient.from('conversations')
                .select('*').order('last_message_at', { ascending: false }).limit(60);
            if (error) throw error;
            _convs = data || [];
        } catch (e) { _convs = []; }
    }
    async function loadMsgs(convId) {
        try {
            const { data, error } = await supabaseClient.from('messages')
                .select('*').eq('conversation_id', convId).order('created_at');
            if (error) throw error;
            _msgs = data || [];
        } catch (e) { _msgs = []; }
    }
    async function markRead(conv) {
        const u = me(); if (!u || !conv) return;
        const field = u.role === 'consultant' ? 'consultant_read_at' : 'company_read_at';
        const patch = {}; patch[field] = new Date().toISOString();
        try { await supabaseClient.from('conversations').update(patch).eq('id', conv.id); conv[field] = patch[field]; } catch (e) {}
    }

    // ---------------------------------------------------------------- görünüm
    let _hostId = 'messagesRoot';

    window.msgRender = async function (hostId) {
        if (hostId) _hostId = hostId;
        const host = document.getElementById(_hostId); if (!host) return;
        const u = me();
        if (!u) { host.innerHTML = '<p class="text-sm text-slate-400">Mesajlaşma için giriş yapmanız gerekir.</p>'; return; }
        host.innerHTML = '<p class="text-sm text-slate-400 py-6">Mesajlar yükleniyor...</p>';
        await loadConvs();
        drawList(u);
        startPoll();
    };

    function drawList(u) {
        const host = document.getElementById(_hostId); if (!host) return;
        const backBtn = u.role === 'consultant'
            ? `<button onclick="msgStop();consultantBackToMenu()" class="text-slate-500 hover:text-indigo-600 font-bold">← Panele Dön</button>`
            : `<button onclick="msgStop();closeAllAndShowMenu()" class="text-slate-500 hover:text-indigo-600 font-bold">← Menüye Dön</button>`;
        const newBtn = u.role === 'consultant'
            ? `<button onclick="msgNew()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg text-sm">+ Yeni Mesaj</button>` : '';

        const rows = _convs.length ? _convs.map(c => {
            const un = unread(c, u);
            const who = u.role === 'consultant' ? (c.company_name || 'Kurulumcu Firma') : 'Danışman';
            return `<button onclick="msgOpen('${c.id}')" class="w-full text-left p-4 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition flex gap-3 ${un ? 'bg-indigo-50/40' : ''}">
                <span class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-lg shrink-0">${u.role === 'consultant' ? '🏢' : '🎯'}</span>
                <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-2 mb-0.5">
                        <span class="font-black text-slate-800 text-sm truncate">${esc(who)}</span>
                        <span class="text-[11px] text-slate-400 truncate">· ${esc(c.subject || 'Genel')}</span>
                        ${un ? '<span class="w-2 h-2 bg-indigo-500 rounded-full shrink-0"></span>' : ''}
                        <span class="ml-auto text-[10px] text-slate-400 shrink-0">${timeAgo(c.last_message_at)}</span>
                    </span>
                    ${c.client_name ? `<span class="block text-[11px] text-amber-700 font-bold">👤 ${esc(c.client_name)}</span>` : ''}
                    <span class="block text-xs text-slate-500 truncate">${esc(c.last_message_body || '—')}</span>
                </span>
            </button>`;
        }).join('') : `<div class="p-10 text-center"><div class="text-4xl mb-2">💬</div>
            <p class="font-black text-slate-700">Henüz mesaj yok</p>
            <p class="text-sm text-slate-500 mt-1">${u.role === 'consultant' ? 'Danışanınızı atadığınız firmayla buradan iletişim kurabilirsiniz.' : 'Danışmanlar size buradan mesaj gönderebilir.'}</p></div>`;

        const tabs = u.role === 'company' ? `
            <div class="flex gap-1 bg-slate-100 p-1 rounded-xl mb-4">
                <button onclick="msgSetTab('msgs')" class="px-4 py-2 rounded-lg text-sm font-bold transition ${_tab === 'msgs' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-white'}">Mesajlar</button>
                <button onclick="msgSetTab('refs')" class="px-4 py-2 rounded-lg text-sm font-bold transition ${_tab === 'refs' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-white'}">Yönlendirilen Danışanlar</button>
            </div>` : '';

        host.innerHTML = `
            <div class="flex items-center gap-3 mb-5 flex-wrap">
                ${backBtn}<span class="text-slate-300">/</span>
                <h2 class="text-lg md:text-xl font-black text-slate-800">${u.role === 'company' ? '🤝 Danışman Kanalı' : '💬 Mesajlaşma'}</h2>
                <div class="ml-auto">${newBtn}</div>
            </div>
            ${tabs}
            <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">${rows}</div>`;
    }

    const INST = [['atandi','Atandı'],['iletisim','İletişime Geçildi'],['kesif','Keşif Yapıldı'],['teklif','Teklif Verildi'],['sozlesme','Sözleşme'],['kurulum','Kurulum Aşamasında'],['tamamlandi','Tamamlandı']];
    const INST_CLS = { atandi:'bg-slate-100 text-slate-600', iletisim:'bg-blue-100 text-blue-700', kesif:'bg-cyan-100 text-cyan-700', teklif:'bg-amber-100 text-amber-800', sozlesme:'bg-violet-100 text-violet-700', kurulum:'bg-orange-100 text-orange-700', tamamlandi:'bg-emerald-100 text-emerald-700' };

    window.msgSetTab = async function (t) {
        _tab = t; _active = null;
        const u = me(); if (!u) return;
        if (t === 'refs') { await loadRefs(); drawRefs(u); } else { await loadConvs(); drawList(u); }
    };

    async function loadRefs() {
        try { const { data, error } = await supabaseClient.rpc('list_assigned_clients'); if (error) throw error; _refs = data || []; }
        catch (e) { _refs = []; }
    }

    function drawRefs(u) {
        const host = document.getElementById(_hostId); if (!host) return;
        const opts = (sel) => INST.map(x => `<option value="${x[0]}" ${x[0] === sel ? 'selected' : ''}>${x[1]}</option>`).join('');
        const body = _refs.length ? _refs.map(r => `
            <div class="p-4 border-b border-slate-50 last:border-0">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap mb-0.5">
                            <span class="font-black text-slate-800">${esc(r.name)}</span>
                            <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${INST_CLS[r.install_status] || 'bg-slate-100 text-slate-500'}">${esc((INST.find(x => x[0] === r.install_status) || ['','Durum yok'])[1])}</span>
                        </div>
                        <div class="text-[11px] text-slate-400">${r.phone ? esc(r.phone) : ''}${r.phone && r.email ? ' · ' : ''}${r.email ? esc(r.email) : ''}</div>
                        <div class="text-[11px] text-indigo-600 font-bold mt-0.5">🎯 Yönlendiren: ${esc(r.consultant_name || 'Danışman')}</div>
                    </div>
                    <select onchange="msgSetInstall('${r.id}', this.value)" class="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white shrink-0">${opts(r.install_status)}</select>
                </div>
            </div>`).join('')
            : `<div class="p-10 text-center"><div class="text-4xl mb-2">🤝</div>
                <p class="font-black text-slate-700">Henüz yönlendirme yok</p>
                <p class="text-sm text-slate-500 mt-1">Danışmanlar size danışan yönlendirdiğinde burada görünür.</p></div>`;

        host.innerHTML = `
            <div class="flex items-center gap-3 mb-5 flex-wrap">
                <button onclick="msgStop();closeAllAndShowMenu()" class="text-slate-500 hover:text-indigo-600 font-bold">← Menüye Dön</button>
                <span class="text-slate-300">/</span>
                <h2 class="text-lg md:text-xl font-black text-slate-800">🤝 Danışman Kanalı</h2>
            </div>
            <div class="flex gap-1 bg-slate-100 p-1 rounded-xl mb-4">
                <button onclick="msgSetTab('msgs')" class="px-4 py-2 rounded-lg text-sm font-bold transition text-slate-600 hover:bg-white">Mesajlar</button>
                <button onclick="msgSetTab('refs')" class="px-4 py-2 rounded-lg text-sm font-bold transition bg-indigo-600 text-white shadow">Yönlendirilen Danışanlar</button>
            </div>
            <p class="text-[11px] text-slate-400 mb-2">Durumu güncellediğinizde yönlendiren danışman bildirim alır — süreç şeffaf kalır.</p>
            <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">${body}</div>`;
    }

    window.msgSetInstall = async function (clientId, status) {
        try {
            const { data, error } = await supabaseClient.rpc('set_client_install_status', { p_client_id: clientId, p_status: status });
            if (error) throw error;
            if (data === false) { alert('Bu kayıt için yetkiniz yok.'); return; }
            const r = _refs.find(x => String(x.id) === String(clientId)); if (r) r.install_status = status;
            drawRefs(me());
        } catch (e) { alert('Güncellenemedi: ' + (e.message || e)); }
    };

    window.msgOpen = async function (id) {
        const u = me(); if (!u) return;
        _active = _convs.find(c => String(c.id) === String(id)); if (!_active) return;
        await loadMsgs(_active.id);
        await markRead(_active);
        drawThread(u);
    };

    function drawThread(u) {
        const host = document.getElementById(_hostId); if (!host || !_active) return;
        const bubbles = _msgs.length ? _msgs.map(m => {
            const mine = String(m.sender_id) === String(u.id);
            return `<div class="flex ${mine ? 'justify-end' : 'justify-start'} mb-2.5">
                <div class="max-w-[78%]">
                    ${!mine ? `<div class="text-[10px] text-slate-400 font-bold mb-0.5">${esc(m.sender_name || '')}</div>` : ''}
                    <div class="${mine ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'} rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line">${esc(m.body)}</div>
                    <div class="text-[10px] text-slate-400 mt-0.5 ${mine ? 'text-right' : ''}">${timeAgo(m.created_at)}</div>
                </div>
            </div>`;
        }).join('') : '<p class="text-center text-sm text-slate-400 py-8">İlk mesajı siz yazın.</p>';

        host.innerHTML = `
            <div class="flex items-center gap-3 mb-4 flex-wrap">
                <button onclick="msgBack()" class="text-slate-500 hover:text-indigo-600 font-bold">← Mesajlar</button>
                <span class="text-slate-300">/</span>
                <div class="min-w-0">
                    <h2 class="text-base md:text-lg font-black text-slate-800 truncate">${esc(_active.subject || 'Genel')}</h2>
                    ${_active.client_name ? `<p class="text-[11px] text-amber-700 font-bold">👤 ${esc(_active.client_name)}</p>` : ''}
                </div>
            </div>
            <div class="bg-white border border-slate-200 rounded-xl p-4">
                <div id="msgThread" class="max-h-[46vh] overflow-y-auto mb-3 pr-1">${bubbles}</div>
                <div class="flex gap-2 border-t border-slate-100 pt-3">
                    <textarea id="msgInput" rows="2" placeholder="Mesajınızı yazın..." class="flex-1 border border-slate-300 p-2.5 rounded-lg text-sm resize-none"></textarea>
                    <button onclick="msgSend()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-5 rounded-lg shrink-0">Gönder</button>
                </div>
            </div>`;
        const t = document.getElementById('msgThread'); if (t) t.scrollTop = t.scrollHeight;
    }

    window.msgBack = async function () { _active = null; await loadConvs(); drawList(me()); };

    window.msgSend = async function () {
        const u = me(); const el = document.getElementById('msgInput');
        if (!u || !el || !_active) return;
        const body = (el.value || '').trim(); if (!body) return;
        el.value = '';
        try {
            const { error } = await supabaseClient.from('messages').insert({
                conversation_id: _active.id, sender_id: u.id, sender_name: u.name, sender_role: u.role, body
            });
            if (error) throw error;
            await loadMsgs(_active.id);
            drawThread(u);
        } catch (e) { alert('Mesaj gönderilemedi: ' + (e.message || e)); }
    };

    // ------------------------------------------------- yeni konuşma (danışman)
    window.msgNew = async function () {
        const u = me(); if (!u || u.role !== 'consultant') return;
        if (!_companies.length) { try { const { data } = await supabaseClient.rpc('list_companies'); _companies = data || []; } catch (e) {} }
        let clients = [];
        try {
            const { data } = await supabaseClient.from('consultant_clients')
                .select('id,name,assigned_company_id,assigned_company_name').eq('consultant_id', u.id);
            clients = data || [];
        } catch (e) {}

        let m = document.getElementById('msgNewModal');
        if (!m) { m = document.createElement('div'); m.id = 'msgNewModal'; document.body.appendChild(m);
                  m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }); }
        m.className = 'fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4';
        m.innerHTML = `<div class="bg-white rounded-2xl max-w-md w-full p-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-black text-lg text-slate-800">Yeni Mesaj</h3>
                <button onclick="document.getElementById('msgNewModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <div class="space-y-3">
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Kurulumcu Firma *</label>
                    <select id="msgNewCompany" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">
                        ${_companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('') || '<option value="">Kayıtlı firma yok</option>'}
                    </select></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">İlgili Danışan (opsiyonel)</label>
                    <select id="msgNewClient" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">
                        <option value="">— Genel —</option>
                        ${clients.map(c => `<option value="${c.id}" data-name="${esc(c.name)}">${esc(c.name)}</option>`).join('')}
                    </select></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Konu</label>
                    <input id="msgNewSubject" placeholder="örn. Keşif planlaması" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Mesaj *</label>
                    <textarea id="msgNewBody" rows="4" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></textarea></div>
                <button onclick="msgCreate()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 rounded-lg">Gönder</button>
                <div id="msgNewResult"></div>
            </div>
        </div>`;
        m.classList.remove('hidden');
    };

    window.msgCreate = async function () {
        const u = me(); const res = document.getElementById('msgNewResult');
        const companyId = document.getElementById('msgNewCompany').value;
        const clientSel = document.getElementById('msgNewClient');
        const clientId = clientSel.value || null;
        const clientName = clientId ? (clientSel.options[clientSel.selectedIndex].getAttribute('data-name') || null) : null;
        const subject = (document.getElementById('msgNewSubject').value || '').trim() || 'Genel';
        const body = (document.getElementById('msgNewBody').value || '').trim();
        if (!companyId) { res.innerHTML = '<p class="text-red-500 text-sm">Firma seçin.</p>'; return; }
        if (!body) { res.innerHTML = '<p class="text-red-500 text-sm">Mesaj yazın.</p>'; return; }
        res.innerHTML = '<p class="text-xs text-slate-400">Gönderiliyor...</p>';
        try {
            const { data: conv, error: e1 } = await supabaseClient.from('conversations').insert({
                consultant_id: u.id, company_id: companyId, client_id: clientId,
                client_name: clientName, company_name: (_companies.find(x => String(x.id) === String(companyId)) || {}).name || null, subject
            }).select('*').single();
            if (e1) throw e1;
            const { error: e2 } = await supabaseClient.from('messages').insert({
                conversation_id: conv.id, sender_id: u.id, sender_name: u.name, sender_role: 'consultant', body
            });
            if (e2) throw e2;
            document.getElementById('msgNewModal').classList.add('hidden');
            await loadConvs();
            _active = _convs.find(c => c.id === conv.id) || conv;
            await loadMsgs(_active.id);
            drawThread(u);
        } catch (e) { res.innerHTML = `<p class="text-red-500 text-sm">${esc(e.message || e)}</p>`; }
    };

    // ---------------------------------------------------------------- yoklama
    function startPoll() {
        msgStop();
        _poll = setInterval(async () => {
            const u = me(); if (!u) return;
            if (_active) { const before = _msgs.length; await loadMsgs(_active.id); if (_msgs.length !== before) drawThread(u); }
            else if (_tab === 'msgs') { await loadConvs(); drawList(u); }
        }, 20000);
    }
    window.msgStop = function () { if (_poll) { clearInterval(_poll); _poll = null; } };

    // ---------------------------------------------------------------- girişler
    window.consultantOpenMessages = function () { _active = null; msgRender('consultantPanelRoot'); };

    window.showMessagesModule = function () {
        document.getElementById('mainMenu')?.classList.add('hidden');
        ['crmModule','adminModule','companyManagementModule','techSupportModule','salesAssistantModule',
         'dashboardModule','projectsModule','servicesModule','educationModule','regulationsModule','quoteModule']
            .forEach(id => document.getElementById(id)?.classList.add('hidden'));
        document.getElementById('messagesModule')?.classList.remove('hidden');
        _active = null;
        msgRender('messagesRoot');
    };
    document.getElementById('btnGoMessages')?.addEventListener('click', () => showMessagesModule());
})();
