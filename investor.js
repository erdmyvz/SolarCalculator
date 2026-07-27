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

    // --- Teklif alan okuyucuları (şema savunmacı: alan yoksa null döner) ---
    const qSys = (q) => (q && q.system) || {};
    const qTot = (q) => (q && q.totals) || {};
    const pos = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
    // KDV dahil TL fiyat: doğrudan yoksa KDV'siz veya USD×kur üzerinden türet
    function qPrice(q) {
        const t = qTot(q);
        let v = pos(t.total_try_vat);
        if (v) return v;
        const net = pos(t.total_try) || (pos(t.total_usd) && pos(t.usd_rate) ? t.total_usd * t.usd_rate : null);
        if (!net) return null;
        const vat = Number(t.vat_pct);
        return isFinite(vat) && vat > 0 ? net * (1 + vat / 100) : net;
    }
    const qKwp = (q) => pos(qSys(q).kwp);
    // Birim fiyat (₺/kWp): teklifleri kıyaslamanın en dürüst tek ölçüsü
    function qUnit(q) { const p = qPrice(q), k = qKwp(q); return (p && k) ? p / k : null; }
    // Yıllık tasarruf tahmini: mahsuplaşan üretim × tarife (ayarlardan)
    function qSaving(q) {
        const s = qSys(q), prod = pos(s.annual_prod), cons = pos(s.annual_cons);
        if (!prod) return null;
        const S = window.EPC_SETTINGS || {};
        const unit = Number(S.tariffMesken) || Number(S.tariff) || 2.5;
        return (cons ? Math.min(prod, cons) : prod) * unit;
    }
    function qPayback(q) { const p = qPrice(q), sv = qSaving(q); return (p && sv) ? p / sv : null; }
    function qCoverage(q) { const s = qSys(q), prod = pos(s.annual_prod), cons = pos(s.annual_cons); return (prod && cons) ? Math.min(Math.round(prod / cons * 100), 100) : null; }

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
        if (!_quotes.length) {
            qBox.innerHTML = `
                <p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Gelen Teklifler</p>
                <div class="bg-white border border-dashed border-slate-300 rounded-xl p-5 text-center">
                    <div class="text-3xl mb-1">📄</div>
                    <p class="text-sm font-bold text-slate-600">Henüz teklif gelmedi</p>
                    <p class="text-xs text-slate-400 mt-1">Firmalar teklifini gönderdikçe burada listelenir ve <b>yan yana karşılaştırabilirsiniz</b>.</p>
                </div>`;
            return;
        }

        // En iyi birim fiyat (₺/kWp) rozeti için referans
        const units = _quotes.map(qUnit).filter(v => v != null);
        const bestUnit = units.length ? Math.min(...units) : null;

        qBox.innerHTML = `
            <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                <p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Gelen Teklifler (${_quotes.length})</p>
                ${_quotes.length > 1 ? `<button onclick="investorCompareQuotes()" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black px-3.5 py-1.5 rounded-lg shadow-sm">⚖️ Teklifleri Karşılaştır</button>` : ''}
            </div>
            ${_quotes.map(q => {
                const sys = qSys(q), price = qPrice(q), unit = qUnit(q), cov = qCoverage(q);
                const isBest = unit != null && bestUnit != null && Math.abs(unit - bestUnit) < 0.01;
                return `<div class="bg-white border ${isBest ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-slate-200'} rounded-xl p-4 mb-2">
                    <div class="flex items-start justify-between gap-3 flex-wrap">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-black text-slate-800">${esc(q.company_name || 'Kurulumcu Firma')}</span>
                                ${isBest ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">EN İYİ BİRİM FİYAT</span>' : ''}
                            </div>
                            <div class="text-[11px] text-slate-400">${esc(q.quote_no || '')}${q.created_at ? ' · ' + new Date(q.created_at).toLocaleDateString('tr-TR') : ''}</div>
                            <div class="text-xs text-slate-600 mt-1">${sys.kwp || 0} kWp${sys.panels ? ' · ' + sys.panels + ' panel' : ''}${sys.battery_kwh ? ' + ' + sys.battery_kwh + ' kWh batarya' : ''}${sys.annual_prod ? ' · ~' + fmt(sys.annual_prod) + ' kWh/yıl' : ''}${cov != null ? ' · ihtiyacın %' + cov + "'i" : ''}</div>
                        </div>
                        <div class="text-right shrink-0">
                            <div class="text-lg font-black text-indigo-600">${price != null ? '₺' + fmt(price) : '—'}</div>
                            <div class="text-[10px] text-slate-400">KDV dahil</div>
                            ${unit != null ? `<div class="text-[11px] font-bold text-slate-500 mt-0.5">₺${fmt(unit)}/kWp</div>` : ''}
                        </div>
                    </div>
                    ${q.share_token ? `<div class="border-t border-slate-100 mt-3 pt-2"><a href="#q=${esc(q.share_token)}" class="text-xs font-bold text-indigo-600 hover:underline">Teklif detayını görüntüle →</a></div>` : ''}
                </div>`;
            }).join('')}
            ${_quotes.length > 1 ? `<button onclick="investorCompareQuotes()" class="w-full mt-1 bg-slate-800 hover:bg-slate-900 text-white font-black py-3 rounded-xl text-sm">⚖️ ${_quotes.length} Teklifi Yan Yana Karşılaştır</button>` : ''}
            <p class="text-[11px] text-slate-400 mt-2">Teklif detayları ve pazarlık için ilgili firmayla iletişime geçebilirsiniz.</p>`;
    }

    // ------------------------------------------------------ TEKLİF KARŞILAŞTIRMA
    // Panel genişliğini karşılaştırma tablosu için geçici olarak genişletir.
    function setPanelWide(on) {
        const m = document.getElementById('investorModule'); if (!m) return;
        m.classList.toggle('max-w-4xl', !on);
        m.classList.toggle('max-w-6xl', on);
    }

    window.investorCompareQuotes = function () {
        const root = document.getElementById('investorRoot'); if (!root || !_quotes.length) return;
        setPanelWide(true);

        // Her ölçüt için "en iyi" değeri bul (fiyat/birim fiyat/geri ödeme → düşük iyi; üretim → yüksek iyi)
        const vals = (fn) => _quotes.map(fn).filter(v => v != null);
        const min = (a) => a.length ? Math.min(...a) : null;
        const max = (a) => a.length ? Math.max(...a) : null;
        const best = {
            price:   min(vals(qPrice)),
            unit:    min(vals(qUnit)),
            payback: min(vals(qPayback)),
            prod:    max(vals(q => pos(qSys(q).annual_prod))),
            kwp:     max(vals(qKwp))
        };
        const isBest = (v, b) => v != null && b != null && Math.abs(v - b) < 0.01;

        // Satır üretici: her teklif için bir hücre
        const row = (label, fn, opts) => {
            opts = opts || {};
            const cells = _quotes.map(q => {
                const raw = fn(q);
                const good = opts.bestKey ? isBest(raw, best[opts.bestKey]) : false;
                const txt = raw == null ? '<span class="text-slate-300">—</span>'
                    : (opts.render ? opts.render(raw) : esc(String(raw)));
                return `<td class="px-3 py-2.5 text-sm text-center whitespace-nowrap ${good ? 'bg-emerald-50 font-black text-emerald-700' : 'text-slate-700'}">
                    ${txt}${good ? '<span class="block text-[9px] font-black text-emerald-600 tracking-wide">EN İYİ</span>' : ''}</td>`;
            }).join('');
            return `<tr class="border-b border-slate-100 ${opts.highlight ? 'bg-indigo-50/40' : ''}">
                <td class="px-3 py-2.5 text-xs font-bold ${opts.highlight ? 'text-indigo-800' : 'text-slate-500'} whitespace-nowrap sticky left-0 ${opts.highlight ? 'bg-indigo-50' : 'bg-white'} z-10 border-r border-slate-100">
                    ${esc(label)}${opts.hint ? `<span class="block text-[10px] font-medium text-slate-400">${esc(opts.hint)}</span>` : ''}</td>
                ${cells}</tr>`;
        };

        const heads = _quotes.map(q => {
            const u = qUnit(q), topBest = isBest(u, best.unit);
            return `<th class="px-3 py-3 text-center min-w-[150px] ${topBest ? 'bg-emerald-50' : 'bg-slate-50'} border-b-2 ${topBest ? 'border-emerald-400' : 'border-slate-200'}">
                <div class="font-black text-slate-800 text-sm leading-tight">${esc(q.company_name || 'Firma')}</div>
                <div class="text-[10px] text-slate-400 mt-0.5">${esc(q.quote_no || '')}</div>
                ${topBest ? '<div class="text-[9px] font-black text-emerald-700 mt-1 tracking-wide">⭐ EN İYİ BİRİM FİYAT</div>' : ''}
            </th>`;
        }).join('');

        root.innerHTML = `
            <button onclick="investorBack()" class="text-slate-500 hover:text-indigo-600 font-bold mb-4">← Panele Dön</button>
            <div class="mb-4">
                <h2 class="text-xl md:text-2xl font-black text-slate-800">⚖️ Teklif Karşılaştırma</h2>
                <p class="text-sm text-slate-500 mt-0.5">${_quotes.length} teklifi aynı ölçütlerle yan yana inceleyin. Yeşil hücreler o satırdaki en iyi değeri gösterir.</p>
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div class="overflow-x-auto">
                    <table class="w-full border-collapse">
                        <thead><tr>
                            <th class="px-3 py-3 text-left text-[11px] uppercase tracking-wider text-slate-400 font-bold sticky left-0 bg-slate-50 z-10 border-b-2 border-slate-200 border-r border-slate-100 min-w-[150px]">Ölçüt</th>
                            ${heads}
                        </tr></thead>
                        <tbody>
                            ${row('Fiyat (KDV dahil)', qPrice, { bestKey: 'price', highlight: true, render: v => '₺' + fmt(v) })}
                            ${row('Birim fiyat', qUnit, { bestKey: 'unit', highlight: true, hint: 'kWp başına — asıl kıyas ölçütü', render: v => '₺' + fmt(v) + '<span class="text-[10px] font-medium text-slate-400">/kWp</span>' })}
                            ${row('Sistem gücü', qKwp, { bestKey: 'kwp', render: v => v + ' <span class="text-[10px] text-slate-400">kWp</span>' })}
                            ${row('Panel sayısı', q => pos(qSys(q).panels), { render: v => v + ' <span class="text-[10px] text-slate-400">adet</span>' })}
                            ${row('İnverter gücü', q => pos(qSys(q).kwe), { render: v => v + ' <span class="text-[10px] text-slate-400">kWe</span>' })}
                            ${row('Batarya', q => pos(qSys(q).battery_kwh), { render: v => v + ' <span class="text-[10px] text-slate-400">kWh</span>' })}
                            ${row('Yıllık üretim', q => pos(qSys(q).annual_prod), { bestKey: 'prod', render: v => fmt(v) + ' <span class="text-[10px] text-slate-400">kWh</span>' })}
                            ${row('İhtiyacı karşılama', qCoverage, { render: v => '%' + v })}
                            ${row('Yıllık tasarruf', qSaving, { hint: 'tahmini', render: v => '₺' + fmt(v) })}
                            ${row('Geri ödeme', qPayback, { bestKey: 'payback', hint: 'tahmini', render: v => v.toFixed(1) + ' <span class="text-[10px] text-slate-400">yıl</span>' })}
                            ${row('KDV hariç fiyat', q => pos(qTot(q).total_try), { render: v => '₺' + fmt(v) })}
                            ${row('Teklif tarihi', q => q.created_at || null, { render: v => new Date(v).toLocaleDateString('tr-TR') })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
                <p class="text-xs font-black text-amber-800 uppercase tracking-wider mb-2">Karar Verirken Dikkat Edin</p>
                <ul class="space-y-1.5">
                    <li class="text-sm text-amber-900 flex gap-2"><span>•</span><span><b>En ucuz her zaman en iyisi değildir.</b> Panel ve inverter markası, hücre teknolojisi ve ekipman kalitesi 25 yıllık üretiminizi doğrudan etkiler.</span></li>
                    <li class="text-sm text-amber-900 flex gap-2"><span>•</span><span><b>Garanti sürelerini karşılaştırın:</b> panel ürün/performans garantisi, inverter garantisi ve işçilik garantisi tekliften teklife değişir.</span></li>
                    <li class="text-sm text-amber-900 flex gap-2"><span>•</span><span><b>Kapsama bakın:</b> proje onayı, TEDAŞ/dağıtım şirketi işlemleri, sayaç ve montaj işçiliği fiyata dahil mi?</span></li>
                    <li class="text-sm text-amber-900 flex gap-2"><span>•</span><span><b>Ödeme planı ve teklif geçerlilik süresi</b> firmalar arasında farklılık gösterir; sözleşme öncesi netleştirin.</span></li>
                    <li class="text-sm text-amber-900 flex gap-2"><span>•</span><span>Tasarruf ve geri ödeme değerleri <b>ortalama tarifeye göre tahminidir</b>; gerçek fatura tarifenize ve tüketim profilinize göre değişir.</span></li>
                </ul>
                <p class="text-xs text-amber-900 mt-3">Kararsız kaldıysanız <button onclick="investorGoConsultants()" class="font-black underline hover:text-amber-950">bağımsız bir danışmandan destek alabilirsiniz</button>.</p>
            </div>

            <button onclick="investorBack()" class="mt-4 text-sm text-slate-500 hover:text-indigo-600 underline">← Panele dön</button>`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.investorGoConsultants = function () {
        if (typeof openPublicModule === 'function') openPublicModule('consultantsModule');
        if (typeof renderConsultantsList === 'function') renderConsultantsList();
    };

    // ---------------------------------------------------------------- süreç detayı
    window.investorOpenProject = async function (id) {
        const root = document.getElementById('investorRoot'); if (!root) return;
        const p = _projects.find(x => String(x.id) === String(id)); if (!p) return;
        setPanelWide(false);
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

    window.investorBack = function () { setPanelWide(false); renderInvestorHome(); };
})();
