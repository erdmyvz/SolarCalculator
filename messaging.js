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
    let _refLead = {};               // consultant_client_id -> { id, status } (CRM'e aktarılmış yönlendirmeler)

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
    // Yükleme hataları SESSİZCE BOŞ LİSTEYE dönüşüyordu: sorgu patlayınca
    // ekranda "Henüz mesaj yok" yazıyordu. Kullanıcı mesajının silindiğini ya
    // da karşı tarafın hiç yazmadığını sanıyordu. Artık hata ayrı tutuluyor.
    let _convHata = null, _msgHata = null, _refHata = null;

    async function loadConvs() {
        if (!window.supabaseClient) { _convHata = 'Bağlantı yok'; return; }
        try {
            const { data, error } = await supabaseClient.from('conversations')
                .select('*').order('last_message_at', { ascending: false }).limit(60);
            if (error) throw error;
            _convs = data || []; _convHata = null;
        } catch (e) { _convHata = e.message || String(e); }   // eldeki listeyi SİLMİYORUZ
    }
    async function loadMsgs(convId) {
        try {
            const { data, error } = await supabaseClient.from('messages')
                .select('*').eq('conversation_id', convId).order('created_at');
            if (error) throw error;
            _msgs = data || []; _msgHata = null;
        } catch (e) { _msgHata = e.message || String(e); }
    }

    const hataKutusu = (m) => m ? `<div class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-3 text-xs"><b>Yüklenemedi:</b> ${esc(m)} — bu liste eksik olabilir. "Yenile" ile tekrar deneyin.</div>` : '';
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
        // ESKİDEN her açılışta drawList çağrılıyordu ama _tab değeri korunuyordu:
        // "Yönlendirilen Danışanlar" sekmesindeyken çıkıp dönünce sekme seçili
        // görünüyor, altında mesaj listesi duruyordu. Artık seçili sekme basılır.
        if (u.role === 'company' && _tab === 'refs') { await loadRefs(); drawRefs(u); }
        else { _tab = 'msgs'; await loadConvs(); drawList(u); }
        startPoll();
    };

    // Ortak başlık: modül kabuğu CRM / Teklifler ile aynı dilde.
    function ustBar(u, aktifSekme) {
        const geri = u.role === 'consultant'
            ? `<button onclick="msgStop();consultantBackToMenu()" class="modul-geri">← Panele Dön</button>`
            : `<button onclick="msgStop();closeAllAndShowMenu()" class="modul-geri">← Menüye Dön</button>`;
        const eylem = u.role === 'consultant'
            ? `<button onclick="msgYenile()" class="btn-ikincil">↻ Yenile</button><button onclick="msgNew()" class="btn-birincil">+ Yeni Mesaj</button>`
            : `<button onclick="msgYenile()" class="btn-ikincil">↻ Yenile</button>`;
        const sekme = (id, ad) => `<button onclick="msgSetTab('${id}')" role="tab" aria-selected="${aktifSekme === id}" class="q-tab ${aktifSekme === id ? 'q-tab-on' : ''}">${ad}</button>`;
        const sekmeler = u.role === 'company'
            ? `<div class="modul-eylem mb-4" role="tablist">${sekme('msgs', 'Mesajlar')}${sekme('refs', 'Yönlendirilen Danışanlar')}</div>` : '';
        return `
            <div class="modul-ust">${geri}<div class="modul-eylem">${eylem}</div></div>
            <div class="modul-basligi">
                <h2>${u.role === 'company' ? 'Danışman Kanalı' : 'Mesajlaşma'}</h2>
                <p>${u.role === 'company'
                    ? 'Bağımsız danışmanlardan gelen mesajlar ve size yönlendirilen danışanların kurulum durumu.'
                    : 'Danışanınızı atadığınız kurulumcu firmayla doğrudan iletişim.'}</p>
            </div>
            ${sekmeler}`;
    }

    window.msgYenile = async function () {
        const u = me(); if (!u) return;
        if (_active) { await loadMsgs(_active.id); drawThread(u, true); }
        else if (_tab === 'refs') { await loadRefs(); drawRefs(u); }
        else { await loadConvs(); drawList(u); }
    };

    function drawList(u) {
        const host = document.getElementById(_hostId); if (!host) return;

        const okunmamis = _convs.filter(c => unread(c, u)).length;

        const rows = _convs.length ? _convs.map(c => {
            const un = unread(c, u);
            const who = u.role === 'consultant' ? (c.company_name || 'Kurulumcu Firma') : 'Danışman';
            return `<button onclick="msgOpen('${c.id}')" class="w-full text-left p-4 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition flex gap-3 ${un ? 'bg-indigo-50/40' : ''}">
                <span class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-lg shrink-0">${u.role === 'consultant' ? '🏢' : '🎯'}</span>
                <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-2 mb-0.5">
                        <span class="font-black text-slate-800 text-sm truncate">${esc(who)}</span>
                        <span class="text-[11px] text-slate-400 truncate">· ${esc(c.subject || 'Genel')}</span>
                        ${un ? '<span class="w-2 h-2 bg-indigo-500 rounded-full shrink-0" title="Okunmamış"></span>' : ''}
                        <span class="ml-auto text-[10px] text-slate-400 shrink-0">${timeAgo(c.last_message_at)}</span>
                    </span>
                    ${c.client_name ? `<span class="block text-[11px] text-amber-700 font-bold">👤 ${esc(c.client_name)}</span>` : ''}
                    <span class="block text-xs text-slate-500 truncate">${esc(c.last_message_body || '—')}</span>
                </span>
            </button>`;
        }).join('') : `<div class="bos-durum"><span class="bos-durum-ico">💬</span>
            <h4>Henüz mesaj yok</h4>
            <p>${u.role === 'consultant' ? 'Danışanınızı atadığınız firmayla buradan iletişim kurabilirsiniz.' : 'Danışmanlar size buradan mesaj gönderebilir; yeni mesaj geldiğinde burada görünür.'}</p></div>`;

        host.innerHTML = `
            ${ustBar(u, 'msgs')}
            ${hataKutusu(_convHata)}
            ${okunmamis ? `<p class="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-3">${okunmamis} okunmamış konuşma</p>` : ''}
            <div class="kart overflow-hidden">${rows}</div>`;
    }

    const INST = [['atandi','Atandı'],['iletisim','İletişime Geçildi'],['kesif','Keşif Yapıldı'],['teklif','Teklif Verildi'],['sozlesme','Sözleşme'],['kurulum','Kurulum Aşamasında'],['tamamlandi','Tamamlandı']];
    const INST_CLS = { atandi:'bg-slate-100 text-slate-600', iletisim:'bg-blue-100 text-blue-700', kesif:'bg-cyan-100 text-cyan-700', teklif:'bg-amber-100 text-amber-800', sozlesme:'bg-violet-100 text-violet-700', kurulum:'bg-orange-100 text-orange-700', tamamlandi:'bg-emerald-100 text-emerald-700' };

    window.msgSetTab = async function (t) {
        _tab = t; _active = null;
        const u = me(); if (!u) return;
        if (t === 'refs') { await loadRefs(); drawRefs(u); } else { await loadConvs(); drawList(u); }
    };

    async function loadRefs() {
        try { const { data, error } = await supabaseClient.rpc('list_assigned_clients'); if (error) throw error; _refs = data || []; _refHata = null; }
        catch (e) { _refHata = e.message || String(e); }

        // Hangi yönlendirmeler CRM'e aktarıldı? RLS zaten yalnız kendi firmamızın
        // kayıtlarını döndürür, ayrıca süzmeye gerek yok. Bu bilgi olmadan ekran
        // CRM'de ilerleyen bir müşteri için eski kurulum durumunu gösteriyordu.
        _refLead = {};
        try {
            const { data } = await supabaseClient
                .from('leads').select('id,status,consultant_client_id')
                .not('consultant_client_id', 'is', null);
            (data || []).forEach(l => { _refLead[l.consultant_client_id] = { id: l.id, status: l.status }; });
        } catch (e) { /* kolon yoksa (SQL çalıştırılmadıysa) eski davranış sürer */ }
    }

    function drawRefs(u) {
        const host = document.getElementById(_hostId); if (!host) return;
        const opts = (sel) => INST.map(x => `<option value="${x[0]}" ${x[0] === sel ? 'selected' : ''}>${x[1]}</option>`).join('');
        const body = _refs.length ? _refs.map(r => {
            // CRM'e aktarılmış yönlendirmede tek doğru kaynak müşteri kartıdır.
            // Buradaki açılır liste ile kart birbiriyle çelişebiliyordu; artık
            // aktarılmış kayıtta liste yerine CRM aşaması gösterilip karta
            // yönlendiriyoruz. Aktarılmamış (eski) kayıtlarda liste duruyor.
            const bag = _refLead[r.id];
            const asama = bag
                ? (typeof stageLabel === 'function' ? stageLabel(bag.status) : bag.status)
                : null;
            const sag = bag
                ? `<div class="flex items-center gap-2 shrink-0">
                       <span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">${esc(asama)}</span>
                       <button onclick="msgCrmAc('${bag.id}')" class="text-xs font-bold text-indigo-600 hover:underline whitespace-nowrap">Müşteri kartı →</button>
                   </div>`
                : `<select onchange="msgSetInstall('${r.id}', this.value)" class="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white shrink-0">${opts(r.install_status)}</select>`;
            return `
            <div class="p-4 border-b border-slate-50 last:border-0">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap mb-0.5">
                            <span class="font-black text-slate-800">${esc(r.name)}</span>
                            ${bag ? '' : `<span class="text-[10px] font-black px-2 py-0.5 rounded-full ${INST_CLS[r.install_status] || 'bg-slate-100 text-slate-500'}">${esc((INST.find(x => x[0] === r.install_status) || ['','Durum yok'])[1])}</span>`}
                        </div>
                        <div class="text-[11px] text-slate-400">${r.phone ? esc(r.phone) : ''}${r.phone && r.email ? ' · ' : ''}${r.email ? esc(r.email) : ''}</div>
                        <div class="text-[11px] text-indigo-600 font-bold mt-0.5">🎯 Yönlendiren: ${esc(r.consultant_name || 'Danışman')}</div>
                    </div>
                    ${sag}
                </div>
            </div>`; }).join('')
            : `<div class="bos-durum"><span class="bos-durum-ico">🤝</span>
                <h4>Henüz yönlendirme yok</h4>
                <p>Danışmanlar size danışan yönlendirdiğinde burada görünür.</p></div>`;

        host.innerHTML = `
            ${ustBar(u, 'refs')}
            ${hataKutusu(_refHata)}
            <p class="text-[11px] text-slate-400 mb-2">CRM'e aktarılan yönlendirmelerde aşama müşteri kartındaki süreç adımlarından ilerler; her değişimde yönlendiren danışman bildirim alır.</p>
            <div class="kart overflow-hidden">${body}</div>`;
    }

    // Yönlendirme satırından müşteri kartına geçiş. CRM modülü kapalıyken
    // crmOpenLeadDetails tek başına yetmiyor (kart görünmeyen modülün içinde
    // açılıyordu); önce menü kartına basıp modülü açıyoruz.
    window.msgCrmAc = function (leadId) {
        const btn = document.getElementById('btnGoCRM');
        if (btn) btn.click();
        setTimeout(() => { if (typeof window.crmOpenLeadDetails === 'function') window.crmOpenLeadDetails(leadId); }, 260);
    };

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

    function drawThread(u, koru) {
        const host = document.getElementById(_hostId); if (!host || !_active) return;
        // YOKLAMA TASLAĞI SİLİYORDU: yeni mesaj geldiğinde tüm kutu yeniden
        // çiziliyor, kullanıcının yazmakta olduğu metin uçuyordu. Aynı şekilde
        // geçmişi okumak için yukarı kaydırmışsa aşağı fırlatılıyordu.
        const eskiInput = koru ? document.getElementById('msgInput') : null;
        const taslak = eskiInput ? eskiInput.value : '';
        const odakVar = eskiInput ? (document.activeElement === eskiInput) : false;
        const secBas = eskiInput ? eskiInput.selectionStart : 0;
        const eskiThread = koru ? document.getElementById('msgThread') : null;
        // Kullanıcı en altta mıydı? (20 px tolerans) Altındaysa yeni mesaja kaydır.
        const alttaydi = eskiThread ? (eskiThread.scrollHeight - eskiThread.scrollTop - eskiThread.clientHeight < 20) : true;
        const eskiScroll = eskiThread ? eskiThread.scrollTop : 0;
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
            <div class="modul-ust">
                <button onclick="msgBack()" class="modul-geri">← Mesajlar</button>
                <div class="modul-eylem"><button onclick="msgYenile()" class="btn-ikincil">↻ Yenile</button></div>
            </div>
            <div class="modul-basligi">
                <h2 class="truncate">${esc(_active.subject || 'Genel')}</h2>
                <p>${_active.client_name ? `👤 <b class="text-amber-700">${esc(_active.client_name)}</b> · ` : ''}${esc(u.role === 'consultant' ? (_active.company_name || 'Kurulumcu Firma') : 'Danışman')}</p>
            </div>
            ${hataKutusu(_msgHata)}
            <div class="kart p-4">
                <div id="msgThread" class="max-h-[46vh] overflow-y-auto mb-3 pr-1">${bubbles}</div>
                <div class="flex gap-2 border-t border-slate-100 pt-3">
                    <textarea id="msgInput" rows="2" placeholder="Mesajınızı yazın..." class="flex-1 border border-slate-300 p-2.5 rounded-lg text-sm resize-none"></textarea>
                    <button onclick="msgSend()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-5 rounded-lg shrink-0">Gönder</button>
                </div>
            </div>`;
        const t = document.getElementById('msgThread');
        if (t) t.scrollTop = (koru && !alttaydi) ? eskiScroll : t.scrollHeight;
        const yeniInput = document.getElementById('msgInput');
        if (yeniInput && taslak) {
            yeniInput.value = taslak;
            if (odakVar) { yeniInput.focus(); try { yeniInput.setSelectionRange(secBas, secBas); } catch (e) {} }
        }
    }

    window.msgBack = async function () { _active = null; await loadConvs(); drawList(me()); };

    const MESAJ_SINIR = 4000;
    window.msgSend = async function () {
        const u = me(); const el = document.getElementById('msgInput');
        if (!u || !el || !_active) return;
        const body = (el.value || '').trim(); if (!body) return;
        if (body.length > MESAJ_SINIR) {
            alert(`Mesaj çok uzun (${body.length} karakter). En fazla ${MESAJ_SINIR} karakter gönderebilirsiniz.`);
            return;
        }
        // Metni HENÜZ silmiyoruz. Eskiden gönderimden ÖNCE temizleniyordu:
        // insert başarısız olursa uyarı çıkıyor ama yazılan mesaj gitmiş
        // oluyordu, kullanıcı baştan yazmak zorunda kalıyordu.
        el.disabled = true;
        try {
            const { error } = await supabaseClient.from('messages').insert({
                conversation_id: _active.id, sender_id: u.id, sender_name: u.name, sender_role: u.role, body
            });
            if (error) throw error;
            el.value = '';                       // ancak başarıdan SONRA
            await loadMsgs(_active.id);
            drawThread(u);
        } catch (e) {
            el.disabled = false;
            alert('Mesaj gönderilemedi: ' + (e.message || e) + '\n\nYazdığınız metin kutuda duruyor, tekrar deneyebilirsiniz.');
        }
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
                    <select id="msgNewCompany" onchange="msgNewFiltre()" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">
                        ${_companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('') || '<option value="">Kayıtlı firma yok</option>'}
                    </select></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">İlgili Danışan (opsiyonel)</label>
                    <select id="msgNewClient" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">
                        <option value="">— Genel —</option>
                    </select>
                    <p class="text-[11px] text-slate-400 mt-1">Yalnızca seçili firmaya atadığınız danışanlar listelenir.</p></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Konu</label>
                    <input id="msgNewSubject" placeholder="örn. Keşif planlaması" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Mesaj *</label>
                    <textarea id="msgNewBody" rows="4" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></textarea></div>
                <button onclick="msgCreate()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 rounded-lg">Gönder</button>
                <div id="msgNewResult"></div>
            </div>
        </div>`;
        m.classList.remove('hidden');
        _msgNewClients = clients;
        window.msgNewFiltre();
    };

    // Danışan listesi firmaya göre SÜZÜLMÜYORDU: danışman, A firmasına atadığı
    // danışanı B firmasıyla açtığı konuşmaya iliştirebiliyordu — danışanın adı
    // ilgisiz bir firmaya gidiyordu. Artık yalnız seçili firmaya ait olanlar.
    let _msgNewClients = [];
    window.msgNewFiltre = function () {
        const sel = document.getElementById('msgNewClient');
        const firma = document.getElementById('msgNewCompany');
        if (!sel || !firma) return;
        const fid = String(firma.value || '');
        const uygun = _msgNewClients.filter(c => String(c.assigned_company_id || '') === fid);
        sel.innerHTML = '<option value="">— Genel —</option>' +
            uygun.map(c => `<option value="${c.id}" data-name="${esc(c.name)}">${esc(c.name)}</option>`).join('');
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
            // Sekme arkadaysa sorgu atmıyoruz: kullanıcı bakmadığı ekran için
            // her 20 saniyede bir veritabanını yoklamanın kimseye faydası yok.
            if (document.visibilityState === 'hidden') return;
            // Modül kapandıysa yoklamayı kendimiz durduruyoruz. Eskiden yalnız
            // "← Menüye Dön" düğmesi durduruyordu; tarayıcı geri tuşuyla veya
            // başka bir modüle geçilince zamanlayıcı sonsuza kadar çalışıyordu.
            const host = document.getElementById(_hostId);
            if (!host || !host.offsetParent) { msgStop(); return; }

            const u = me(); if (!u) return;
            if (_active) {
                const once = _msgs.length;
                await loadMsgs(_active.id);
                if (_msgs.length !== once) drawThread(u, true);   // true = taslağı koru
            } else if (_tab === 'msgs') { await loadConvs(); drawList(u); }
            else if (_tab === 'refs') { await loadRefs(); drawRefs(u); }
        }, 20000);
    }
    window.msgStop = function () { if (_poll) { clearInterval(_poll); _poll = null; } };

    // Sekme yeniden öne gelince bir kez hemen tazele (20 sn beklemesin).
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible' || !_poll) return;
        const u = me(); if (!u) return;
        const host = document.getElementById(_hostId);
        if (!host || !host.offsetParent) return;
        if (_active) loadMsgs(_active.id).then(() => drawThread(u, true));
        else if (_tab === 'msgs') loadConvs().then(() => drawList(u));
    });

    // ---------------------------------------------------------------- girişler
    window.consultantOpenMessages = function () { _active = null; msgRender('consultantPanelRoot'); };

    window.showMessagesModule = function () {
        document.getElementById('mainMenu')?.classList.add('hidden');
        ['supplierDirModule','crmModule','adminModule','companyManagementModule','techSupportModule','salesAssistantModule',
         'dashboardModule','projectsModule','servicesModule','educationModule','regulationsModule','quoteModule']
            .forEach(id => document.getElementById(id)?.classList.add('hidden'));
        document.getElementById('messagesModule')?.classList.remove('hidden');
        _active = null;
        msgRender('messagesRoot');
    };
    document.getElementById('btnGoMessages')?.addEventListener('click', () => showMessagesModule());
})();
