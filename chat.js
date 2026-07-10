/* ============================================================================
   chat.js — DANIŞMANLIK FAZ 3a: Anonim yatırımcı talepleri + sohbet
   - Yatırımcı (ziyaretçi): isimsiz talep açar, takip kodu (TLP-xxxx) alır,
     kodla yazışmayı sürdürür (RPC + 5sn polling).
   - Danışman (panel): açık talepleri görür, yanıtlar (Realtime yerine polling).
   chat.sql çalıştırılmış olmalı. index.html'de consultants.js'ten sonra yüklenir.
   ============================================================================ */
(function () {
    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s) : String(s == null ? '' : s));
    let _thread = null;   // {mode:'investor'|'consultant', code, reqId, me}
    let _poll = null;

    function ensureModal() {
        let m = document.getElementById('chatModal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'chatModal';
        m.className = 'fixed inset-0 bg-black/50 z-[70] hidden flex items-center justify-center p-4';
        m.innerHTML = '<div class="bg-white rounded-2xl w-full max-w-lg flex flex-col max-h-[90vh]"><div id="chatModalBody" class="p-5 md:p-6 flex flex-col min-h-0"></div></div>';
        document.body.appendChild(m);
        m.addEventListener('click', (e) => { if (e.target === m) window.chatClose(); });
        return m;
    }
    window.chatClose = function () {
        const m = document.getElementById('chatModal');
        if (m) m.classList.add('hidden');
        if (_poll) { clearInterval(_poll); _poll = null; }
        _thread = null;
    };

    function bubble(msg, me) {
        const mine = msg.sender_type === me;
        const who = msg.sender_type === 'consultant' ? (msg.consultant_name || 'Danışman') : 'Yatırımcı';
        return `<div class="flex ${mine ? 'justify-end' : 'justify-start'} mb-2"><div class="max-w-[80%] ${mine ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'} rounded-2xl px-3.5 py-2"><div class="text-[10px] ${mine ? 'text-indigo-200' : 'text-slate-400'} font-bold mb-0.5">${esc(who)}</div><div class="text-sm whitespace-pre-wrap break-words">${esc(msg.body)}</div></div></div>`;
    }
    function renderMessages(messages) {
        const box = document.getElementById('chatMessages');
        if (!box || !_thread) return;
        box.innerHTML = (messages && messages.length) ? messages.map(m => bubble(m, _thread.me)).join('') : '<p class="text-xs text-slate-400 text-center py-4">Henüz mesaj yok. İlk mesajı siz yazın.</p>';
        box.scrollTop = box.scrollHeight;
    }
    async function fetchMessages() {
        if (!_thread || !supabaseClient) return;
        try {
            if (_thread.mode === 'investor') {
                const { data, error } = await supabaseClient.rpc('get_request_thread', { p_code: _thread.code });
                if (error) throw error;
                if (data) renderMessages(data.messages || []);
            } else {
                const { data, error } = await supabaseClient.from('request_messages')
                    .select('*').eq('request_id', _thread.reqId).order('created_at', { ascending: true });
                if (error) throw error;
                renderMessages(data || []);
            }
        } catch (e) { /* sessiz — sonraki poll dener */ }
    }

    function openThreadModal(opts) {
        _thread = { mode: opts.mode, code: opts.code, reqId: opts.reqId, me: opts.me };
        const m = ensureModal();
        document.getElementById('chatModalBody').innerHTML = `
            <div class="flex items-center justify-between mb-3 shrink-0">
                <h3 class="font-black text-lg text-slate-800 truncate">${esc(opts.title || 'Yazışma')}</h3>
                <button onclick="chatClose()" class="text-slate-400 hover:text-slate-600 text-xl leading-none ml-2">✕</button>
            </div>
            ${opts.requestBody ? `<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 text-sm text-slate-700 shrink-0"><span class="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">Talep</span>${esc(opts.requestBody)}</div>` : ''}
            <div id="chatMessages" class="flex-1 overflow-y-auto min-h-[160px] max-h-[45vh] pr-1 mb-3"></div>
            <div class="flex gap-2 shrink-0">
                <input id="chatInput" placeholder="Mesaj yazın..." onkeydown="if(event.key==='Enter')chatSend()" class="flex-1 border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500">
                <button onclick="chatSend()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 rounded-lg">Gönder</button>
            </div>`;
        m.classList.remove('hidden');
        fetchMessages();
        if (_poll) clearInterval(_poll);
        _poll = setInterval(fetchMessages, 5000);
    }

    window.chatSend = async function () {
        if (!_thread || !supabaseClient) return;
        const inp = document.getElementById('chatInput');
        const body = (inp.value || '').trim();
        if (!body) return;
        inp.value = '';
        try {
            if (_thread.mode === 'investor') {
                const { error } = await supabaseClient.rpc('post_investor_message', { p_code: _thread.code, p_body: body });
                if (error) throw error;
            } else {
                const cons = window.currentConsultant || {};
                const { error } = await supabaseClient.from('request_messages').insert({
                    request_id: _thread.reqId, sender_type: 'consultant',
                    consultant_id: cons.id, consultant_name: cons.full_name || 'Danışman', body
                });
                if (error) throw error;
            }
            fetchMessages();
        } catch (e) { alert('Gönderilemedi: ' + (e.message || e)); inp.value = body; }
    };

    // ---------------- YATIRIMCI: yeni isimsiz talep ----------------
    window.investorRequestNew = function () {
        const m = ensureModal();
        if (_poll) { clearInterval(_poll); _poll = null; } _thread = null;
        document.getElementById('chatModalBody').innerHTML = `
            <div class="flex items-center justify-between mb-3"><h3 class="font-black text-lg text-slate-800">İsimsiz Talep Oluştur</h3><button onclick="chatClose()" class="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button></div>
            <p class="text-xs text-slate-500 mb-3">İsim vermeden sorunuzu yazın. Danışmanlar görüp yanıtlayabilir; size verilecek takip koduyla yazışmayı sürdürürsünüz.</p>
            <input id="reqSubject" placeholder="Konu (opsiyonel)" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm mb-2">
            <textarea id="reqBody" rows="4" placeholder="Sorunuz / talebiniz..." class="w-full border border-slate-300 p-2.5 rounded-lg text-sm mb-3"></textarea>
            <button onclick="investorRequestSubmit()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-lg">Talebi Gönder</button>
            <div id="reqResult" class="mt-3"></div>`;
        m.classList.remove('hidden');
    };
    window.investorRequestSubmit = async function () {
        const subject = (document.getElementById('reqSubject').value || '').trim();
        const body = (document.getElementById('reqBody').value || '').trim();
        if (!body) { alert('Lütfen talebinizi yazın.'); return; }
        const res = document.getElementById('reqResult');
        res.innerHTML = '<p class="text-xs text-slate-400">Gönderiliyor...</p>';
        try {
            const { data, error } = await supabaseClient.rpc('create_investor_request', { p_subject: subject, p_body: body });
            if (error) throw error;
            res.innerHTML = `<div class="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">✅ Talebiniz alındı. Takip kodunuz:<div class="text-lg font-black my-1 tracking-wider">${esc(data)}</div>Bu kodu saklayın. Danışman yanıtladığında aynı koddan yazışmayı açabilirsiniz.<br><button onclick="investorThreadOpen('${esc(data)}')" class="mt-2 bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg">Yazışmayı Aç ›</button></div>`;
        } catch (e) { res.innerHTML = `<p class="text-red-500 text-sm">${esc(e.message || e)}</p>`; }
    };

    // ---------------- YATIRIMCI: talebi aç / yanıtla ----------------
    window.investorThreadOpen = async function (code) {
        code = (code || (document.getElementById('reqLookupCode')?.value || '')).trim();
        if (!code) { alert('Takip kodunuzu girin.'); return; }
        if (!supabaseClient) return;
        try {
            const { data, error } = await supabaseClient.rpc('get_request_thread', { p_code: code });
            if (error) throw error;
            if (!data) { alert('Bu koda ait talep bulunamadı.'); return; }
            openThreadModal({ title: 'Talebiniz', requestBody: data.body, mode: 'investor', code: code, me: 'investor' });
        } catch (e) { alert(e.message || e); }
    };

    // ---------------- DANIŞMAN: talep gelen kutusu ----------------
    window.loadConsultantRequests = async function (mountId) {
        const box = document.getElementById(mountId || 'consRequestsInbox');
        if (!box || !supabaseClient) return;
        let list = [];
        try {
            const { data, error } = await supabaseClient.from('investor_requests')
                .select('*').eq('status', 'open').order('created_at', { ascending: false });
            if (error) throw error;
            list = data || [];
        } catch (e) { box.innerHTML = `<p class="text-red-500 text-sm">${esc(e.message || e)}</p>`; return; }
        if (!list.length) { box.innerHTML = '<p class="text-sm text-slate-400">Şu an açık yatırımcı talebi yok.</p>'; return; }
        box.innerHTML = list.map(r => `
            <div class="border border-slate-100 rounded-lg p-4 mb-2">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="min-w-0">
                        ${r.subject ? `<p class="font-bold text-slate-800 text-sm">${esc(r.subject)}</p>` : ''}
                        <p class="text-sm text-slate-600 line-clamp-2">${esc(r.body)}</p>
                        <p class="text-[10px] text-slate-400 mt-1">${new Date(r.created_at).toLocaleString('tr-TR')}</p>
                    </div>
                    <button onclick="consultantOpenRequest('${r.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shrink-0">Yanıtla / Sohbet</button>
                </div>
            </div>`).join('');
    };
    window.consultantOpenRequest = async function (reqId) {
        if (!supabaseClient) return;
        try {
            const { data, error } = await supabaseClient.from('investor_requests').select('*').eq('id', reqId).single();
            if (error) throw error;
            openThreadModal({ title: data.subject || 'Yatırımcı Talebi', requestBody: data.body, mode: 'consultant', reqId: reqId, me: 'consultant' });
        } catch (e) { alert(e.message || e); }
    };
})();
