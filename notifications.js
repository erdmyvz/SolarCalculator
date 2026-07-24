/* ============================================================================
   notifications.js — UYGULAMA İÇİ BİLDİRİMLER (admin + kurulumcu + danışman)
   Topbar'a zil ekler, okunmamış sayısını gösterir, 60 sn'de bir yeniler.
   notifications.sql çalıştırılmış olmalıdır. index.html'de EN SONA yüklenir.
   ============================================================================ */
(function () {
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let _items = [], _open = false, _timer = null, _started = false, _busy = false;

    function host() { return document.getElementById('notifBell'); }

    function timeAgo(ts) {
        const d = (Date.now() - new Date(ts).getTime()) / 1000;
        if (d < 60) return 'az önce';
        if (d < 3600) return Math.floor(d / 60) + ' dk önce';
        if (d < 86400) return Math.floor(d / 3600) + ' sa önce';
        if (d < 604800) return Math.floor(d / 86400) + ' gün önce';
        return new Date(ts).toLocaleDateString('tr-TR');
    }

    async function fetchNotifs() {
        if (_busy || !window.supabaseClient) return;
        _busy = true;
        try {
            const { data, error } = await supabaseClient
                .from('notifications').select('*')
                .order('created_at', { ascending: false }).limit(30);
            if (error) throw error;
            _items = data || [];
            render();
        } catch (e) { /* tablo yoksa veya yetki yoksa sessiz geç */ }
        finally { _busy = false; }
    }

    function render() {
        const h = host(); if (!h) return;
        const unread = _items.filter(n => !n.is_read).length;
        h.innerHTML = `
            <div class="relative">
                <button onclick="notifToggle()" title="Bildirimler" class="relative w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition">
                    <span class="text-xl">🔔</span>
                    ${unread ? `<span class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white">${unread > 99 ? '99+' : unread}</span>` : ''}
                </button>
                ${_open ? panelHtml(unread) : ''}
            </div>`;
    }

    function panelHtml(unread) {
        const list = _items.length ? _items.map(n => `
            <button onclick="notifOpen('${n.id}', '${esc(n.link || '')}')" class="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex gap-3 ${n.is_read ? '' : 'bg-indigo-50/40'}">
                <span class="text-xl shrink-0">${esc(n.icon || '🔔')}</span>
                <span class="min-w-0 flex-1">
                    <span class="block text-sm font-bold text-slate-800 ${n.is_read ? '' : 'flex items-center gap-1.5'}">${esc(n.title)}${n.is_read ? '' : '<span class="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0"></span>'}</span>
                    ${n.body ? `<span class="block text-xs text-slate-500 mt-0.5">${esc(n.body)}</span>` : ''}
                    <span class="block text-[10px] text-slate-400 mt-1">${timeAgo(n.created_at)}</span>
                </span>
            </button>`).join('')
            : '<div class="px-4 py-10 text-center"><div class="text-3xl mb-2">🔕</div><p class="text-sm font-bold text-slate-600">Bildiriminiz yok</p><p class="text-xs text-slate-400 mt-1">Yeni müşteri, servis talebi ve onaylar burada görünecek.</p></div>';
        return `
            <div class="absolute right-0 mt-2 w-80 md:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[80] overflow-hidden">
                <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <span class="font-black text-slate-800 text-sm">Bildirimler</span>
                    ${unread ? '<button onclick="notifMarkAll(event)" class="text-xs font-bold text-indigo-600 hover:underline">Tümünü okundu işaretle</button>' : ''}
                </div>
                <div class="max-h-[380px] overflow-y-auto">${list}</div>
            </div>`;
    }

    window.notifToggle = function () { _open = !_open; render(); if (_open) fetchNotifs(); };

    window.notifMarkAll = async function (ev) {
        if (ev) ev.stopPropagation();
        const ids = _items.filter(n => !n.is_read).map(n => n.id);
        if (!ids.length) return;
        _items.forEach(n => { n.is_read = true; });
        render();
        try { await supabaseClient.from('notifications').update({ is_read: true }).in('id', ids); } catch (e) {}
    };

    const ROUTES = {
        crm:           () => document.getElementById('btnGoCRM')?.click(),
        quote:         () => document.getElementById('btnGoQuotes')?.click(),
        services:      () => document.getElementById('btnGoServices')?.click(),
        consultantCrm: () => { if (typeof consultantOpenCRM === 'function') consultantOpenCRM(); }
    };

    window.notifOpen = async function (id, link) {
        const n = _items.find(x => String(x.id) === String(id));
        if (n && !n.is_read) {
            n.is_read = true;
            try { await supabaseClient.from('notifications').update({ is_read: true }).eq('id', id); } catch (e) {}
        }
        _open = false; render();
        if (link && ROUTES[link]) { try { ROUTES[link](); } catch (e) {} }
    };

    // panel dışına tıklayınca kapat
    document.addEventListener('click', (e) => {
        if (!_open) return;
        const h = host();
        if (h && !h.contains(e.target)) { _open = false; render(); }
    });

    // ---------------------------------------------------------------- başlat
    async function start() {
        if (_started || !window.supabaseClient || !host()) return;
        try {
            const { data } = await supabaseClient.auth.getSession();
            if (!data || !data.session) return;      // giriş yoksa zil görünmez
        } catch (e) { return; }
        _started = true;
        render();
        fetchNotifs();
        _timer = setInterval(fetchNotifs, 60000);
        window.addEventListener('focus', () => { if (_started) fetchNotifs(); });
    }

    function stop() {
        _started = false; _open = false; _items = [];
        if (_timer) { clearInterval(_timer); _timer = null; }
        const h = host(); if (h) h.innerHTML = '';
    }

    // Oturum durumuna bağlan: giriş yapılınca başlat, çıkışta temizle.
    // (Önceki sürüm yalnızca sayfa açılışında 20 sn deniyordu; geç giriş yapan
    //  kullanıcıda zil hiç başlamıyordu.)
    let _wired = false;
    function wireAuth() {
        if (_wired || !window.supabaseClient || !supabaseClient.auth) return;
        _wired = true;
        try {
            supabaseClient.auth.onAuthStateChange((event, session) => {
                if (session) { _started = false; start(); }
                else { stop(); }
            });
        } catch (e) { _wired = false; }
    }

    (function boot() {
        let tries = 0;
        const tick = () => {
            if (window.supabaseClient) { wireAuth(); start(); }
            if (!_wired && ++tries < 60) setTimeout(tick, 500);   // yalnız bağlanana kadar dene
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(tick, 400));
        else setTimeout(tick, 400);
    })();

    // Teşhis: konsolda `notifDiag()` yazarak durumu görebilirsiniz.
    window.notifDiag = async function () {
        const out = { zilAlani: !!host(), supabase: !!window.supabaseClient, baslatildi: _started, oturum: false, tabloOkunuyor: false, kayit: 0, hata: null };
        try { const { data } = await supabaseClient.auth.getSession(); out.oturum = !!(data && data.session); } catch (e) {}
        try {
            const { data, error } = await supabaseClient.from('notifications').select('id').limit(1);
            if (error) throw error;
            out.tabloOkunuyor = true; out.kayit = (data || []).length;
        } catch (e) { out.hata = e.message || String(e); }
        console.table(out);
        return out;
    };
})();
