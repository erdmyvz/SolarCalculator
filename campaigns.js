/* ============================================================================
   campaigns.js — PAZARLAMA OTOMASYONU (altyapı)
   Kampanya oluşturma, izin-farkında hedef kitle süzme, şablon ve taslak arşivi.
   GÖNDERİM HENÜZ AKTİF DEĞİL: e-posta/SMS sağlayıcısı bağlanınca açılacak.
   campaigns.sql çalıştırılmış olmalıdır.
   ============================================================================ */
(function () {
    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s) : String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

    const SOURCES = {
        prospects: ['Potansiyel Müşteriler', 'Ziyaretçi sayfasından gelen adaylar (yalnız admin)'],
        leads:     ['Başvurularım',          'Kurulumu tamamlanmamış müşteri başvuruları'],
        clients:   ['Danışanlarım',          'Kurulum yaptırmamış danışanlar']
    };
    let _camps = [], _aud = [], _ctx = null, _hostId = 'campaignsRoot';

    function ctx() {
        if (_ctx) return _ctx;
        if (window.currentConsultant && window.currentConsultant.id) {
            _ctx = { role: 'consultant', consultant_id: window.currentConsultant.id, company_id: null, sources: ['clients'] };
        } else if (window.currentUserProfile && window.currentUserProfile.role === 'admin') {
            _ctx = { role: 'admin', consultant_id: null, company_id: null, sources: ['prospects', 'leads'] };
        } else if (window.currentUserProfile && window.currentUserProfile.company_id) {
            _ctx = { role: 'company', consultant_id: null, company_id: window.currentUserProfile.company_id, sources: ['leads'] };
        } else {
            _ctx = { role: 'admin', consultant_id: null, company_id: null, sources: ['prospects', 'leads'] };
        }
        return _ctx;
    }

    window.showCampaignsModule = function (hostId) {
        _ctx = null;
        if (hostId) { _hostId = hostId; }
        else {
            _hostId = 'campaignsRoot';
            document.getElementById('mainMenu')?.classList.add('hidden');
            ['crmModule','adminModule','companyManagementModule','techSupportModule','salesAssistantModule',
             'dashboardModule','projectsModule','servicesModule','educationModule','regulationsModule',
             'quoteModule','messagesModule','investorModule'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
            document.getElementById('campaignsModule')?.classList.remove('hidden');
        }
        renderCampaigns();
    };

    async function loadCamps() {
        try {
            const { data, error } = await supabaseClient.from('campaigns')
                .select('*').order('created_at', { ascending: false }).limit(50);
            if (error) throw error;
            _camps = data || [];
        } catch (e) { _camps = []; }
    }

    async function renderCampaigns() {
        const host = document.getElementById(_hostId); if (!host) return;
        const c = ctx();
        host.innerHTML = '<p class="text-sm text-slate-400 py-6">Yükleniyor...</p>';
        await loadCamps();
        const back = _hostId === 'campaignsRoot'
            ? `<button onclick="closeAllAndShowMenu()" class="text-slate-500 hover:text-indigo-600 font-bold">← Menüye Dön</button><span class="text-slate-300">/</span>`
            : (c.role === 'consultant' ? `<button onclick="consultantBackToMenu()" class="text-slate-500 hover:text-indigo-600 font-bold">← Panele Dön</button><span class="text-slate-300">/</span>` : '');

        const rows = _camps.length ? _camps.map(x => `
            <div class="bg-white border border-slate-200 rounded-xl p-4 mb-2 flex items-start justify-between gap-3 flex-wrap">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-black text-slate-800">${esc(x.name)}</span>
                        <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${x.channel === 'sms' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}">${x.channel === 'sms' ? 'SMS' : 'E-POSTA'}</span>
                        <span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${x.status === 'ready' ? 'Hazır' : 'Taslak'}</span>
                    </div>
                    <div class="text-[11px] text-slate-400 mt-0.5">${(SOURCES[x.audience] || ['—'])[0]} · ${x.recipient_count} alıcı · ${new Date(x.created_at).toLocaleDateString('tr-TR')}</div>
                    ${x.subject ? `<div class="text-xs text-slate-600 mt-1 truncate">${esc(x.subject)}</div>` : ''}
                </div>
                <div class="flex gap-1.5 shrink-0">
                    <button onclick="campEdit('${x.id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg">Aç</button>
                    <button onclick="campDelete('${x.id}')" title="Sil" class="text-slate-400 hover:text-red-600 px-1.5">🗑️</button>
                </div>
            </div>`).join('')
            : `<div class="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center">
                 <div class="text-4xl mb-2">📣</div>
                 <p class="font-black text-slate-700">Henüz kampanya yok</p>
                 <p class="text-sm text-slate-500 mt-1">Kurulum yaptırmamış müşterilerinize hatırlatma kampanyası hazırlayın.</p>
               </div>`;

        host.innerHTML = `
            <div class="flex items-center gap-3 mb-4 flex-wrap">
                ${back}
                <h2 class="text-lg md:text-xl font-black text-slate-800">📣 Pazarlama Kampanyaları</h2>
                <button onclick="campNew()" class="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg text-sm">+ Yeni Kampanya</button>
            </div>
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
                <b>Gönderim yakında.</b> Kampanyaları şimdiden hazırlayıp kaydedebilirsiniz; e-posta/SMS sağlayıcısı bağlandığında tek tuşla gönderilecek.
                Yalnızca <b>ticari ileti izni veren</b> kişilere gönderim yapılacaktır.
            </div>
            ${rows}`;
    }

    // ---------------------------------------------------------------- düzenleyici
    function editor(x) {
        const c = ctx();
        const srcOpts = c.sources.map(s => `<option value="${s}" ${x.audience === s ? 'selected' : ''}>${SOURCES[s][0]}</option>`).join('');
        return `
            <div class="flex items-center gap-3 mb-4 flex-wrap">
                <button onclick="renderCampaignsBack()" class="text-slate-500 hover:text-indigo-600 font-bold">← Kampanyalar</button>
                <h2 class="text-lg font-black text-slate-800">${x.id ? 'Kampanyayı Düzenle' : 'Yeni Kampanya'}</h2>
            </div>
            <div class="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Kampanya Adı *</label>
                        <input id="cpName" value="${esc(x.name || '')}" placeholder="örn. Bahar hatırlatması" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Kanal</label>
                        <select id="cpChannel" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">
                            <option value="email" ${x.channel !== 'sms' ? 'selected' : ''}>E-posta</option>
                            <option value="sms" ${x.channel === 'sms' ? 'selected' : ''}>SMS</option>
                        </select></div>
                </div>

                <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Hedef Kitle</label>
                    <select id="cpAudience" onchange="campPreview()" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${srcOpts}</select>
                    <label class="flex items-center gap-2 mt-2 cursor-pointer">
                        <input type="checkbox" id="cpConsent" ${x.only_consent === false ? '' : 'checked'} onchange="campPreview()" class="w-4 h-4 rounded">
                        <span class="text-xs font-bold text-slate-600">Yalnızca ticari ileti izni verenlere gönder</span>
                    </label>
                    <div id="cpPreview" class="mt-2"></div>
                </div>

                <div id="cpSubjectWrap"><label class="block text-xs font-bold text-slate-600 mb-1">Konu</label>
                    <input id="cpSubject" value="${esc(x.subject || '')}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>

                <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Mesaj</label>
                    <textarea id="cpBody" rows="7" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">${esc(x.body || '')}</textarea>
                    <p class="text-[11px] text-slate-400 mt-1">Kişiselleştirme: <code>{{ad}}</code> alıcının adıyla değiştirilir.</p>
                </div>

                <div class="flex gap-2 flex-wrap pt-2 border-t border-slate-100">
                    <button onclick="campSave('${x.id || ''}')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-2.5 rounded-lg">Kaydet</button>
                    <button disabled title="E-posta/SMS sağlayıcısı bağlanınca aktif olacak" class="bg-slate-100 text-slate-400 font-bold px-5 py-2.5 rounded-lg cursor-not-allowed">Gönder — Yakında</button>
                    <span id="cpResult" class="self-center text-sm"></span>
                </div>
            </div>`;
    }

    window.renderCampaignsBack = function () { renderCampaigns(); };
    window.campNew = function () {
        const host = document.getElementById(_hostId); if (!host) return;
        host.innerHTML = editor({ audience: ctx().sources[0], channel: 'email', only_consent: true });
        campPreview();
    };
    window.campEdit = function (id) {
        const x = _camps.find(c => String(c.id) === String(id)); if (!x) return;
        const host = document.getElementById(_hostId); if (!host) return;
        host.innerHTML = editor(x);
        campPreview();
    };

    window.campPreview = async function () {
        const box = document.getElementById('cpPreview'); if (!box) return;
        const src = document.getElementById('cpAudience').value;
        const onlyConsent = !!document.getElementById('cpConsent').checked;
        box.innerHTML = '<p class="text-xs text-slate-400">Alıcılar hesaplanıyor...</p>';
        try {
            const { data, error } = await supabaseClient.rpc('campaign_audience', { p_source: src });
            if (error) throw error;
            _aud = data || [];
        } catch (e) { _aud = []; }
        const chan = document.getElementById('cpChannel')?.value || 'email';
        const reachable = _aud.filter(r => chan === 'sms' ? !!r.phone : !!r.email);
        const eligible = onlyConsent ? reachable.filter(r => r.has_consent) : reachable;
        box.innerHTML = `
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                <div class="flex flex-wrap gap-x-4 gap-y-1">
                    <span class="text-slate-500">Kayıt: <b class="text-slate-800">${_aud.length}</b></span>
                    <span class="text-slate-500">${chan === 'sms' ? 'Telefonu' : 'E-postası'} olan: <b class="text-slate-800">${reachable.length}</b></span>
                    <span class="text-slate-500">İzinli: <b class="text-emerald-700">${reachable.filter(r => r.has_consent).length}</b></span>
                    <span class="ml-auto font-black ${eligible.length ? 'text-indigo-600' : 'text-red-500'}">Gönderilecek: ${eligible.length}</span>
                </div>
                ${onlyConsent && reachable.length && !reachable.filter(r => r.has_consent).length
                    ? '<p class="text-[11px] text-amber-700 mt-1.5">⚠️ İzinli alıcı yok. İzin kaydı olmayan kişilere ticari ileti göndermek hukuka aykırıdır.</p>' : ''}
                <p class="text-[11px] text-slate-400 mt-1">${SOURCES[src][1]}</p>
            </div>`;
    };

    window.campSave = async function (id) {
        const res = document.getElementById('cpResult');
        const name = (document.getElementById('cpName').value || '').trim();
        if (!name) { res.innerHTML = '<span class="text-red-500">Kampanya adı zorunlu.</span>'; return; }
        const c = ctx();
        const chan = document.getElementById('cpChannel').value;
        const onlyConsent = !!document.getElementById('cpConsent').checked;
        const reachable = _aud.filter(r => chan === 'sms' ? !!r.phone : !!r.email);
        const eligible = onlyConsent ? reachable.filter(r => r.has_consent) : reachable;

        const row = {
            owner_role: c.role, company_id: c.company_id, consultant_id: c.consultant_id,
            name, channel: chan,
            audience: document.getElementById('cpAudience').value,
            only_consent: onlyConsent,
            subject: (document.getElementById('cpSubject')?.value || '').trim() || null,
            body: (document.getElementById('cpBody').value || '').trim() || null,
            recipient_count: eligible.length,
            updated_at: new Date().toISOString()
        };
        res.innerHTML = '<span class="text-slate-400">Kaydediliyor...</span>';
        try {
            if (id) {
                const { error } = await supabaseClient.from('campaigns').update(row).eq('id', id);
                if (error) throw error;
            } else {
                const { data: ud } = await supabaseClient.auth.getUser();
                row.created_by = ud && ud.user ? ud.user.id : null;
                const { error } = await supabaseClient.from('campaigns').insert(row);
                if (error) throw error;
            }
            res.innerHTML = '<span class="text-emerald-600 font-bold">✅ Kaydedildi</span>';
            setTimeout(renderCampaigns, 700);
        } catch (e) { res.innerHTML = `<span class="text-red-500">${esc(e.message || e)}</span>`; }
    };

    window.campDelete = async function (id) {
        if (!confirm('Bu kampanya silinecek. Emin misiniz?')) return;
        try { await supabaseClient.from('campaigns').delete().eq('id', id); renderCampaigns(); }
        catch (e) { alert('Silinemedi: ' + (e.message || e)); }
    };

    window.consultantOpenCampaigns = function () { showCampaignsModule('consultantPanelRoot'); };
    document.getElementById('btnGoCampaigns')?.addEventListener('click', () => showCampaignsModule());
})();
