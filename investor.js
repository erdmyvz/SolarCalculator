/* ============================================================================
   investor.js — YATIRIMCI PANOSU
   Faz 1 RPC'lerini kullanır: list_my_projects · list_my_project_steps · list_my_quotes
   Yatırımcı yalnız KENDİ kayıtlarını görür (RPC'ler auth.uid() ile sınırlı).
   ============================================================================ */
(function () {
    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s) : String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

    let _projects = [], _quotes = [], _me = null;

    const LEAD_ST = {
        yeni: ['Yeni Başvuru', 'bg-slate-100 text-slate-600'],
        gorusuluyor: ['Görüşülüyor', 'bg-blue-100 text-blue-700'],
        teklif: ['Teklif Aşaması', 'bg-amber-100 text-amber-800'],
        sozlesme: ['Sözleşme', 'bg-violet-100 text-violet-700'],
        kurulum: ['Kurulum', 'bg-orange-100 text-orange-700'],
        tamamlandi: ['Tamamlandı', 'bg-emerald-100 text-emerald-700'],
        iptal: ['İptal', 'bg-red-100 text-red-700']
    };
    const stBadge = (s) => LEAD_ST[s] || ['Süreçte', 'bg-slate-100 text-slate-600'];
    const fmt = (n) => (Math.round(Number(n) || 0)).toLocaleString('tr-TR');

    async function whoAmI() {
        if (_me) return _me;
        try {
            const { data } = await supabaseClient.auth.getUser();
            const u = data && data.user;
            const meta = (u && u.user_metadata) || {};
            _me = { id: u ? u.id : null, email: u ? u.email : '', name: meta.full_name || (u ? u.email : '') || 'Yatırımcı' };
        } catch (e) { _me = { id: null, email: '', name: 'Yatırımcı' }; }
        return _me;
    }

    function paintTopbar(me) {
        const n = document.getElementById('userNameDisplay');
        const c = document.getElementById('userCompanyDisplay');
        const i = document.getElementById('userInitials');
        if (n) n.textContent = me.name;
        if (c) c.textContent = 'Yatırımcı';
        if (i) i.textContent = String(me.name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
        document.getElementById('dashboardHeader')?.classList.remove('hidden');
    }

    // ---------------------------------------------------------------- açılış
    window.showInvestorPanel = async function () {
        document.getElementById('landingContainer')?.classList.add('hidden');
        document.getElementById('authContainer')?.classList.add('hidden');
        document.getElementById('appContainer')?.classList.remove('hidden');
        document.getElementById('mainMenu')?.classList.add('hidden');
        ['crmModule','adminModule','companyManagementModule','techSupportModule','salesAssistantModule',
         'dashboardModule','projectsModule','servicesModule','educationModule','regulationsModule',
         'quoteModule','messagesModule','consultantPanelModule','consultantsModule','aboutModule','legalModule']
            .forEach(id => document.getElementById(id)?.classList.add('hidden'));
        document.getElementById('investorModule')?.classList.remove('hidden');

        const me = await whoAmI();
        paintTopbar(me);
        renderInvestorHome();
    };

    async function loadData() {
        try { const { data } = await supabaseClient.rpc('list_my_projects'); _projects = data || []; } catch (e) { _projects = []; }
        try { const { data } = await supabaseClient.rpc('list_my_quotes');   _quotes   = data || []; } catch (e) { _quotes = []; }
    }

    // ---------------------------------------------------------------- ana ekran
    async function renderInvestorHome() {
        const root = document.getElementById('investorRoot'); if (!root) return;
        const me = await whoAmI();
        const first = String(me.name).trim().split(' ')[0] || 'Yatırımcı';
        root.innerHTML = `
            <div class="mb-5">
                <h2 class="text-xl md:text-2xl font-black text-slate-800">Merhaba ${esc(first)} 👋</h2>
                <p class="text-sm text-slate-500 mt-0.5">Güneş enerjisi yatırım sürecinizi buradan şeffafça takip edin.</p>
            </div>
            <div id="invStats" class="mb-5"></div>
            <div id="invProjects" class="mb-6"></div>
            <div id="invQuotes"></div>`;
        document.getElementById('invProjects').innerHTML = '<p class="text-sm text-slate-400">Yükleniyor...</p>';

        await loadData();

        // özet
        const done = _projects.filter(p => p.status === 'tamamlandi').length;
        const tile = (icon, n, label, cls) => `
            <div class="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <div class="text-xl mb-1">${icon}</div>
                <p class="text-2xl font-black ${cls}">${n}</p>
                <p class="text-[11px] text-slate-500 font-bold mt-0.5">${label}</p>
            </div>`;
        document.getElementById('invStats').innerHTML = `<div class="grid grid-cols-3 gap-3">
            ${tile('📋', _projects.length, 'Başvurum', 'text-slate-800')}
            ${tile('✅', done, 'Tamamlanan', 'text-emerald-600')}
            ${tile('📄', _quotes.length, 'Gelen Teklif', 'text-indigo-600')}
        </div>`;

        // projeler
        const pBox = document.getElementById('invProjects');
        if (!_projects.length) {
            pBox.innerHTML = `
                <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-6 text-center">
                    <div class="text-4xl mb-2">☀️</div>
                    <p class="font-black text-slate-700 mb-1">Henüz başvurunuz yok</p>
                    <p class="text-sm text-slate-500 mb-4">Ücretsiz çatı keşfi talebi oluşturun; süreciniz burada adım adım görünsün.</p>
                    <button onclick="openLeadModal('kurulum')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-lg text-sm">Ücretsiz Keşif Talebi Oluştur</button>
                </div>`;
        } else {
            pBox.innerHTML = `
                <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Başvurularım</p>
                    <button onclick="openLeadModal('kurulum')" class="text-xs font-bold text-indigo-600 hover:underline">+ Yeni Başvuru</button>
                </div>
                ${_projects.map(p => {
                    const b = stBadge(p.status);
                    const total = Number(p.steps_total) || 0, dn = Number(p.steps_done) || 0;
                    const pct = total ? Math.round(dn / total * 100) : 0;
                    return `<button onclick="investorOpenProject('${p.id}')" class="w-full text-left bg-white border border-slate-200 rounded-xl p-4 mb-2 hover:shadow-md hover:border-indigo-300 transition">
                        <div class="flex items-start justify-between gap-3 flex-wrap mb-2">
                            <div class="min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="font-black text-slate-800">${esc(p.address || 'Başvuru')}</span>
                                    <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${b[1]}">${b[0]}</span>
                                </div>
                                <div class="text-[11px] text-slate-400 mt-0.5">
                                    ${p.tracking_code ? 'Takip: <b class="text-slate-600">' + esc(p.tracking_code) + '</b> · ' : ''}
                                    ${new Date(p.created_at).toLocaleDateString('tr-TR')}
                                </div>
                                <div class="text-[11px] mt-1 ${p.company_name ? 'text-emerald-700 font-bold' : 'text-slate-400 italic'}">
                                    ${p.company_name ? '🏢 ' + esc(p.company_name) : 'Firma ataması bekleniyor'}
                                </div>
                            </div>
                            <span class="text-slate-300 text-sm shrink-0">→</span>
                        </div>
                        ${total ? `
                        <div class="flex items-center gap-2">
                            <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-emerald-500 rounded-full" style="width:${pct}%"></div></div>
                            <span class="text-[11px] font-bold text-slate-500 shrink-0">${dn}/${total}</span>
                        </div>
                        ${p.current_step ? `<p class="text-[11px] text-slate-500 mt-1.5">Sıradaki: <b>${esc(p.current_step)}</b></p>` : ''}` : ''}
                    </button>`;
                }).join('')}`;
        }

        // teklifler
        const qBox = document.getElementById('invQuotes');
        if (!_quotes.length) { qBox.innerHTML = ''; return; }
        qBox.innerHTML = `
            <p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Gelen Teklifler</p>
            ${_quotes.map(q => {
                const sys = q.system || {}, tot = q.totals || {};
                return `<div class="bg-white border border-slate-200 rounded-xl p-4 mb-2">
                    <div class="flex items-start justify-between gap-3 flex-wrap">
                        <div class="min-w-0">
                            <div class="font-black text-slate-800">${esc(q.company_name || 'Kurulumcu Firma')}</div>
                            <div class="text-[11px] text-slate-400">${esc(q.quote_no || '')} · ${new Date(q.created_at).toLocaleDateString('tr-TR')}</div>
                            <div class="text-xs text-slate-600 mt-1">${sys.kwp || 0} kWp${sys.battery_kwh ? ' + ' + sys.battery_kwh + ' kWh batarya' : ''}${sys.annual_prod ? ' · ~' + fmt(sys.annual_prod) + ' kWh/yıl' : ''}</div>
                        </div>
                        <div class="text-right shrink-0">
                            <div class="text-lg font-black text-indigo-600">₺${fmt(tot.total_try_vat)}</div>
                            <div class="text-[10px] text-slate-400">KDV dahil</div>
                        </div>
                    </div>
                </div>`;
            }).join('')}
            <p class="text-[11px] text-slate-400 mt-1">Teklif detayları için ilgili firmayla iletişime geçebilirsiniz.</p>`;
    }

    // ---------------------------------------------------------------- süreç detayı
    window.investorOpenProject = async function (id) {
        const root = document.getElementById('investorRoot'); if (!root) return;
        const p = _projects.find(x => String(x.id) === String(id)); if (!p) return;
        root.innerHTML = '<p class="text-sm text-slate-400 py-6">Süreç yükleniyor...</p>';

        let steps = [];
        try { const { data } = await supabaseClient.rpc('list_my_project_steps', { p_lead_id: id }); steps = data || []; } catch (e) {}

        const b = stBadge(p.status);
        const timeline = steps.length ? steps.map((s, i) => `
            <div class="flex gap-3 pb-5 last:pb-0 relative">
                ${i < steps.length - 1 ? '<div class="absolute left-[13px] top-7 bottom-0 w-0.5 bg-slate-200"></div>' : ''}
                <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 z-10 ${s.is_done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}">${s.is_done ? '✓' : i + 1}</div>
                <div class="min-w-0 flex-1">
                    <p class="font-bold text-sm ${s.is_done ? 'text-slate-800' : 'text-slate-500'}">${esc(s.title || 'Adım ' + (i + 1))}</p>
                    ${s.note ? `<p class="text-xs text-slate-500 mt-0.5">${esc(s.note)}</p>` : ''}
                    ${s.is_done ? `<p class="text-[10px] text-emerald-600 font-bold mt-0.5">Tamamlandı</p>` : ''}
                </div>
            </div>`).join('')
            : '<p class="text-sm text-slate-400 text-center py-6">Süreç adımları firma tarafından oluşturulunca burada görünecek.</p>';

        root.innerHTML = `
            <button onclick="investorBack()" class="text-slate-500 hover:text-indigo-600 font-bold mb-4">← Panele Dön</button>
            <div class="bg-white border border-slate-200 rounded-2xl p-6 mb-4">
                <div class="flex items-start justify-between gap-3 flex-wrap mb-3">
                    <div class="min-w-0">
                        <h2 class="text-xl font-black text-slate-800">${esc(p.address || 'Başvurum')}</h2>
                        <p class="text-[11px] text-slate-400 mt-0.5">${p.tracking_code ? 'Takip kodu: <b class="text-slate-600">' + esc(p.tracking_code) + '</b> · ' : ''}${new Date(p.created_at).toLocaleDateString('tr-TR')}</p>
                    </div>
                    <span class="text-[10px] font-black px-2.5 py-1 rounded-full ${b[1]} shrink-0">${b[0]}</span>
                </div>
                <div class="border-t border-slate-100 pt-3 text-sm ${p.company_name ? 'text-emerald-700 font-bold' : 'text-slate-400 italic'}">
                    ${p.company_name ? '🏢 Kurulumcu firmanız: ' + esc(p.company_name) : 'Kurulumcu firma ataması bekleniyor.'}
                </div>
            </div>
            <div class="bg-white border border-slate-200 rounded-2xl p-6">
                <p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-4">Süreç Adımları</p>
                ${timeline}
            </div>`;
    };

    window.investorBack = function () { renderInvestorHome(); };
})();
