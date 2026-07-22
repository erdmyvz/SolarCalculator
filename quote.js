/* ============================================================================
   quote.js — TEKLİF MODÜLÜ (kurulumcu firma)
   Faz 2: Ayar arayüzü (2. kısım) — firma; marka/logo, marj/kur/KDV, ödeme,
   kapsam/garanti/şart metinleri, açık bölümler ve KATALOG MALİYETLERİ tek ekrandan.
   Faz 3 (sihirbaz) ve Faz 5 (liste) yer tutucu. quote_module.sql çalıştırılmalı.
   ============================================================================ */
(function () {
    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s) : String(s == null ? '' : s));
    const qCompanyId = () => (typeof currentUserProfile !== 'undefined' && currentUserProfile && currentUserProfile.company_id) || null;
    let _qSettings = null, _qCatalog = null;

    const QSECTIONS = [['cover','Kapak'],['system','Sistem Özeti'],['production','Üretim-Tüketim'],['feasibility','Fizibilite / Geri Ödeme'],['price','Fiyat & Ödeme'],['bom','Malzeme Listesi'],['scope','Kapsam (Dahil/Hariç)'],['warranty','Garanti Tablosu'],['terms','Ticari Şartlar'],['references','Referans Projeler'],['signature','İmza']];
    const QCAT = { panel:'Panel', inverter:'İnverter', battery:'Batarya', construction:'Konstrüksiyon', cable:'Kablo/Tava', panel_board:'Pano', meter:'Sayaç', labor:'İşçilik', engineering:'Mühendislik', logistics:'Nakliye', grounding:'Topraklama', safety:'Güvenlik', monitoring:'İzleme', insurance:'Sigorta', other:'Diğer' };
    const UNITS = ['adet','kwp','set','metre','percent'];

    function defaults(cid) {
        return {
            company_id: cid, logo_data: null, brand_color: '4F46E5',
            address: '', phone: '', email: '', website: '', certificates: '',
            signatures: [], general_margin_pct: 25, usd_rate: 40, vat_pct: 20,
            payment_plan: [{label:'Sözleşme',pct:30},{label:'Malzeme Sevki',pct:50},{label:'Montaj',pct:15},{label:'Devreye Alma',pct:5}],
            validity_days: 7, scope_included: '', scope_excluded: '',
            warranty: [{component:'Güneş Paneli',product:'12 yıl',performance:'30 yıl / %87',life:'30+ yıl'},{component:'İnverter',product:'5 yıl',performance:'—',life:'10-15 yıl'},{component:'Batarya',product:'10 yıl',performance:'6.000 döngü',life:'12-15 yıl'}],
            terms_text: '', tariff_tl: 3.5, yield_increase_pct: 20,
            sections: { cover:true, system:true, production:true, feasibility:true, price:true, bom:false, scope:true, warranty:true, terms:true, references:false, signature:true }
        };
    }

    // ---------------------------------------------------- MODÜL AÇ/KAPA + NAV
    document.getElementById('btnGoQuotes')?.addEventListener('click', () => showQuoteModule());

    window.showQuoteModule = function (view) {
        document.getElementById('mainMenu')?.classList.add('hidden');
        ['crmModule','adminModule','companyManagementModule','techSupportModule','salesAssistantModule','dashboardModule','projectsModule','servicesModule','educationModule','regulationsModule'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
        document.getElementById('quoteModule')?.classList.remove('hidden');
        quoteView(view || 'settings');
    };

    function renderShell(active) {
        const root = document.getElementById('quoteRoot');
        if (!root) return;
        const tab = (id, label) => `<button onclick="quoteView('${id}')" class="px-4 py-2 rounded-lg text-sm font-bold transition ${active===id?'bg-indigo-600 text-white shadow':'text-slate-600 hover:bg-white'}">${label}</button>`;
        root.innerHTML = `
            <div class="flex items-center gap-3 mb-5 flex-wrap">
                <button onclick="closeAllAndShowMenu()" class="text-slate-500 hover:text-indigo-600 font-bold">← Menüye Dön</button>
                <h2 class="text-2xl font-black text-slate-800">📄 Teklifler</h2>
                <div class="flex gap-1 ml-auto bg-slate-100 p-1 rounded-xl">${tab('new','＋ Yeni Teklif')}${tab('list','Tekliflerim')}${tab('settings','⚙️ Ayarlar')}</div>
            </div>
            <div id="quoteView"></div>`;
    }

    window.quoteView = async function (v) {
        renderShell(v);
        const box = document.getElementById('quoteView');
        if (!box) return;
        if (v === 'settings') {
            box.innerHTML = '<p class="text-slate-400 text-sm py-6">Yükleniyor...</p>';
            if (!_qSettings) await loadQuoteData();
            renderSettings();
        } else if (v === 'new') {
            if (!_qSettings) await loadQuoteData();
            renderWizard();
        } else {
            await renderQuoteList();
        }
    };

    // ---------------------------------------------------- VERİ YÜKLE
    async function loadQuoteData() {
        const cid = qCompanyId();
        const d = defaults(cid);
        if (!cid || !supabaseClient) { _qSettings = d; _qCatalog = []; return; }
        try {
            const [rs, rp, rf] = await Promise.all([
                supabaseClient.from('firm_quote_settings').select('*').eq('company_id', cid).maybeSingle(),
                supabaseClient.from('quote_products').select('*').eq('is_active', true).order('sort'),
                supabaseClient.from('firm_catalog').select('*').eq('company_id', cid)
            ]);
            _qSettings = rs.data || d;
            ['signatures','payment_plan','warranty'].forEach(k => { if (!Array.isArray(_qSettings[k])) _qSettings[k] = d[k]; });
            if (!_qSettings.sections || typeof _qSettings.sections !== 'object') _qSettings.sections = d.sections;
            const ov = {}, custom = [];
            (rf.data || []).forEach(r => { if (r.product_id) ov[r.product_id] = r; else custom.push(r); });
            _qCatalog = (rp.data || []).map(p => { const o = ov[p.id] || {}; return { id: p.id, _custom: false, _fcId: o.id || null, category: p.category, name: p.name, brand: p.brand, unit: p.unit, specs: p.specs || {}, cost_usd: (o.cost_usd != null ? o.cost_usd : p.default_cost_usd), margin_pct: (o.margin_pct != null ? o.margin_pct : null), hidden: !!o.hidden, default_cost: p.default_cost_usd }; })
                .concat(custom.map(c => ({ id: c.id, _custom: true, _fcId: c.id, category: c.category || 'other', name: c.name || '', brand: c.brand || '', unit: c.unit || 'adet', specs: c.specs || {}, cost_usd: c.cost_usd || 0, margin_pct: (c.margin_pct != null ? c.margin_pct : null), hidden: !!c.hidden, default_cost: 0 })));
        } catch (e) { console.error('quote load', e); _qSettings = d; _qCatalog = []; }
    }

    // ---------------------------------------------------- DOM -> STATE (kaybolmasın)
    function capture() {
        const g = id => document.getElementById(id), s = _qSettings;
        if (!g('qsMargin')) return;
        s.address = g('qsAddress').value; s.phone = g('qsPhone').value; s.email = g('qsEmail').value;
        s.website = g('qsWebsite').value; s.certificates = g('qsCerts').value; s.brand_color = g('qsColor').value.replace('#','');
        s.general_margin_pct = parseFloat(g('qsMargin').value) || 0; s.usd_rate = parseFloat(g('qsRate').value) || 0;
        s.vat_pct = parseFloat(g('qsVat').value) || 0; s.tariff_tl = parseFloat(g('qsTariff').value) || 0;
        s.yield_increase_pct = parseFloat(g('qsYinc').value) || 0; s.validity_days = parseInt(g('qsValidity').value) || 7;
        s.scope_included = g('qsScopeIn').value; s.scope_excluded = g('qsScopeEx').value; s.terms_text = g('qsTerms').value;
        s.sections = {}; QSECTIONS.forEach(([k]) => { const c = g('qsec_' + k); s.sections[k] = c ? c.checked : false; });
        s.payment_plan = Array.from(document.querySelectorAll('.qpay-row')).map(r => ({ label: r.querySelector('.qpay-label').value, pct: parseFloat(r.querySelector('.qpay-pct').value) || 0 }));
        s.signatures = Array.from(document.querySelectorAll('.qsig-row')).map(r => ({ name: r.querySelector('.qsig-name').value, title: r.querySelector('.qsig-title').value }));
        s.warranty = Array.from(document.querySelectorAll('.qwar-row')).map(r => { const i = r.querySelectorAll('input'); return { component: i[0].value, product: i[1].value, performance: i[2].value, life: i[3].value }; });
        document.querySelectorAll('.qcat-row').forEach(r => {
            const item = _qCatalog.find(x => String(x.id) === r.getAttribute('data-id')); if (!item) return;
            item.cost_usd = parseFloat(r.querySelector('.qcat-cost').value) || 0;
            const mv = r.querySelector('.qcat-margin').value; item.margin_pct = mv === '' ? null : parseFloat(mv);
            item.hidden = r.querySelector('.qcat-hidden').checked;
            if (item._custom) { item.name = r.querySelector('.qcat-name').value; item.brand = r.querySelector('.qcat-brand').value; item.category = r.querySelector('.qcat-cat').value; item.unit = r.querySelector('.qcat-unit').value; }
        });
    }

    // ---------------------------------------------------- FORM
    function renderSettings() {
        const box = document.getElementById('quoteView'); if (!box) return;
        const s = _qSettings;
        const input = (id, val, ph, type) => `<input id="${id}" type="${type||'text'}" value="${esc(val == null ? '' : val)}" placeholder="${ph||''}" class="w-full border border-slate-300 p-2 rounded-lg text-sm outline-none focus:border-indigo-500">`;
        const card = (title, body) => `<div class="bg-white border border-slate-200 rounded-xl p-5 mb-4"><h3 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3">${title}</h3>${body}</div>`;

        const pay = (s.payment_plan || []).map((p, i) => `<div class="qpay-row flex gap-2 mb-1.5"><input class="qpay-label flex-1 border border-slate-300 p-2 rounded-lg text-sm" value="${esc(p.label)}" placeholder="Dilim"><input class="qpay-pct w-20 border border-slate-300 p-2 rounded-lg text-sm" type="number" value="${p.pct}" placeholder="%"><button onclick="qsDel('payment_plan',${i})" class="text-red-400 hover:text-red-600 px-2">✕</button></div>`).join('');
        const sig = (s.signatures || []).map((x, i) => `<div class="qsig-row flex gap-2 mb-1.5"><input class="qsig-name flex-1 border border-slate-300 p-2 rounded-lg text-sm" value="${esc(x.name)}" placeholder="Ad Soyad"><input class="qsig-title flex-1 border border-slate-300 p-2 rounded-lg text-sm" value="${esc(x.title)}" placeholder="Unvan"><button onclick="qsDel('signatures',${i})" class="text-red-400 hover:text-red-600 px-2">✕</button></div>`).join('');
        const war = (s.warranty || []).map((w, i) => `<div class="qwar-row grid grid-cols-1 md:grid-cols-4 gap-1.5 mb-1.5"><input class="border border-slate-300 p-2 rounded-lg text-sm" value="${esc(w.component)}" placeholder="Bileşen"><input class="border border-slate-300 p-2 rounded-lg text-sm" value="${esc(w.product)}" placeholder="Ürün gar."><input class="border border-slate-300 p-2 rounded-lg text-sm" value="${esc(w.performance)}" placeholder="Performans"><div class="flex gap-1"><input class="flex-1 border border-slate-300 p-2 rounded-lg text-sm" value="${esc(w.life)}" placeholder="Ömür"><button onclick="qsDel('warranty',${i})" class="text-red-400 hover:text-red-600 px-2">✕</button></div></div>`).join('');
        const secs = QSECTIONS.map(([k, l]) => `<label class="flex items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer"><input type="checkbox" id="qsec_${k}" ${s.sections && s.sections[k] ? 'checked' : ''}> ${l}</label>`).join('');
        const catRows = (_qCatalog || []).map(it => `
            <tr class="qcat-row border-b border-slate-100" data-id="${it.id}">
                ${it._custom
                    ? `<td class="p-1"><select class="qcat-cat border border-slate-200 rounded p-1 text-xs">${Object.entries(QCAT).map(([v,l])=>`<option value="${v}" ${it.category===v?'selected':''}>${l}</option>`).join('')}</select></td>
                       <td class="p-1"><input class="qcat-name w-full border border-slate-200 rounded p-1 text-xs" value="${esc(it.name)}" placeholder="Ürün adı"><input class="qcat-brand w-full border border-slate-200 rounded p-1 text-[10px] mt-0.5" value="${esc(it.brand)}" placeholder="Marka"></td>
                       <td class="p-1"><select class="qcat-unit border border-slate-200 rounded p-1 text-xs">${UNITS.map(u=>`<option value="${u}" ${it.unit===u?'selected':''}>${u}</option>`).join('')}</select></td>`
                    : `<td class="p-1 text-[11px] text-slate-500">${QCAT[it.category]||it.category}</td>
                       <td class="p-1 text-xs"><div class="font-bold text-slate-700">${esc(it.name)}</div>${it.brand?`<div class="text-[10px] text-slate-400">${esc(it.brand)}</div>`:''}<span class="qcat-cat" data-v="${it.category}" style="display:none"></span></td>
                       <td class="p-1 text-[11px] text-slate-500">${it.unit}<span class="qcat-unit" data-v="${it.unit}" style="display:none"></span></td>`}
                <td class="p-1"><input class="qcat-cost w-20 border border-slate-200 rounded p-1 text-xs text-right" type="number" step="0.01" value="${it.cost_usd}"></td>
                <td class="p-1"><input class="qcat-margin w-16 border border-slate-200 rounded p-1 text-xs text-right" type="number" value="${it.margin_pct==null?'':it.margin_pct}" placeholder="genel"></td>
                <td class="p-1 text-center"><input class="qcat-hidden" type="checkbox" ${it.hidden?'checked':''}></td>
            </tr>`).join('');

        box.innerHTML = `
            ${card('Firma Kimliği', `
                <div class="flex items-center gap-4 mb-3">
                    <div id="qsLogoPrev" class="h-14 min-w-[90px] flex items-center justify-center border border-slate-200 rounded-lg bg-slate-50 px-2">${s.logo_data ? `<img src="${s.logo_data}" class="h-12 object-contain">` : '<span class="text-xs text-slate-400">Logo yok</span>'}</div>
                    <div><input type="file" accept="image/*" onchange="qsLogoPick(this)" class="block text-xs file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:cursor-pointer"><button onclick="qsLogoClear()" class="mt-1 text-[11px] text-slate-400 hover:text-red-500 underline">Kaldır</button></div>
                    <div class="ml-auto"><label class="block text-xs font-bold text-slate-600 mb-1">Marka rengi</label><input id="qsColor" type="color" value="#${(s.brand_color||'4F46E5').replace('#','')}" class="w-16 h-9 rounded border border-slate-300"></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>${input('qsPhone', s.phone, 'Telefon')}</div><div>${input('qsEmail', s.email, 'E-posta')}</div>
                    <div>${input('qsWebsite', s.website, 'Web sitesi')}</div><div>${input('qsAddress', s.address, 'Adres')}</div>
                    <div class="md:col-span-2"><textarea id="qsCerts" rows="1" placeholder="Sertifikalar (ISO 9001, 14001…)" class="w-full border border-slate-300 p-2 rounded-lg text-sm">${esc(s.certificates||'')}</textarea></div>
                </div>
                <div class="mt-3"><div class="flex items-center justify-between mb-1"><span class="text-xs font-bold text-slate-600">İmza sahipleri</span><button onclick="qsAdd('signatures')" class="text-xs font-bold text-indigo-600 hover:underline">+ Ekle</button></div>${sig || '<p class="text-xs text-slate-400">Yok</p>'}</div>`)}

            ${card('Fiyatlandırma', `
                <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Genel Marj %</label>${input('qsMargin', s.general_margin_pct, '', 'number')}</div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Kur (USD→TL)</label>${input('qsRate', s.usd_rate, '', 'number')}</div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">KDV %</label>${input('qsVat', s.vat_pct, '', 'number')}</div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Tarife TL/kWh</label>${input('qsTariff', s.tariff_tl, '', 'number')}</div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Yıllık zam %</label>${input('qsYinc', s.yield_increase_pct, '', 'number')}</div>
                </div>
                <p class="text-[11px] text-slate-400 mt-2">Maliyet USD tabanlıdır; satış = maliyet × (1 + marj). Kur ile TL karşılığı ve KDV otomatik hesaplanır. Maliyet/kâr müşteriye gösterilmez.</p>`)}

            ${card('Ödeme Planı & Geçerlilik', `
                <div class="flex items-center justify-between mb-2"><span class="text-xs font-bold text-slate-600">Ödeme dilimleri (%)</span><button onclick="qsAdd('payment_plan')" class="text-xs font-bold text-indigo-600 hover:underline">+ Dilim</button></div>
                ${pay || '<p class="text-xs text-slate-400 mb-2">Dilim yok</p>'}
                <div class="mt-2 flex items-center gap-2"><label class="text-xs font-bold text-slate-600">Teklif geçerlilik (gün)</label><div class="w-24">${input('qsValidity', s.validity_days, '', 'number')}</div></div>`)}

            ${card('Kapsam ve Şartlar', `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Dahil olanlar</label><textarea id="qsScopeIn" rows="4" placeholder="Her satır bir madde…" class="w-full border border-slate-300 p-2 rounded-lg text-sm">${esc(s.scope_included||'')}</textarea></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Hariç olanlar</label><textarea id="qsScopeEx" rows="4" placeholder="Resmi harçlar, statik güçlendirme…" class="w-full border border-slate-300 p-2 rounded-lg text-sm">${esc(s.scope_excluded||'')}</textarea></div>
                </div>
                <div class="mt-3"><label class="block text-xs font-bold text-slate-600 mb-1">Ticari şartlar / notlar</label><textarea id="qsTerms" rows="4" class="w-full border border-slate-300 p-2 rounded-lg text-sm">${esc(s.terms_text||'')}</textarea></div>
                <div class="mt-3"><div class="flex items-center justify-between mb-1"><span class="text-xs font-bold text-slate-600">Garanti tablosu</span><button onclick="qsAdd('warranty')" class="text-xs font-bold text-indigo-600 hover:underline">+ Satır</button></div>${war || '<p class="text-xs text-slate-400">Yok</p>'}</div>`)}

            ${card('Teklif Bölümleri (varsayılan açık)', `<div class="grid grid-cols-2 md:grid-cols-3 gap-2">${secs}</div>`)}

            ${card('Katalog & Maliyetler', `
                <p class="text-[11px] text-slate-400 mb-2">Maliyet USD girin. Marj boşsa genel marj uygulanır. "Gizle" işaretli kalem tekliflerde çıkmaz.</p>
                <div class="overflow-x-auto max-h-[420px] overflow-y-auto border border-slate-100 rounded-lg">
                    <table class="w-full text-sm"><thead class="bg-slate-50 sticky top-0"><tr class="text-[11px] text-slate-500 text-left"><th class="p-2">Kategori</th><th class="p-2">Ürün</th><th class="p-2">Birim</th><th class="p-2 text-right">Maliyet $</th><th class="p-2 text-right">Marj %</th><th class="p-2 text-center">Gizle</th></tr></thead>
                    <tbody>${catRows}</tbody></table>
                </div>
                <button onclick="qsAddProduct()" class="mt-2 text-xs font-bold text-indigo-600 hover:underline">+ Kendi ürününü ekle</button>`)}

            <div class="sticky bottom-2 flex justify-end">
                <button onclick="saveQuoteSettings()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-8 py-3 rounded-xl shadow-lg">Kaydet</button>
            </div>`;
    }

    // ---------------------------------------------------- DİNAMİK SATIR + LOGO
    window.qsAdd = function (key) { capture(); if (key === 'payment_plan') _qSettings.payment_plan.push({ label: '', pct: 0 }); else if (key === 'signatures') _qSettings.signatures.push({ name: '', title: '' }); else if (key === 'warranty') _qSettings.warranty.push({ component: '', product: '', performance: '', life: '' }); renderSettings(); };
    window.qsDel = function (key, i) { capture(); _qSettings[key].splice(i, 1); renderSettings(); };
    window.qsAddProduct = function () { capture(); _qCatalog.push({ id: 'new_' + Date.now(), _custom: true, _fcId: null, category: 'other', name: '', brand: '', unit: 'adet', cost_usd: 0, margin_pct: null, hidden: false, default_cost: 0 }); renderSettings(); };
    window.qsLogoPick = function (input) {
        const f = input.files && input.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = e => { const img = new Image(); img.onload = () => { let w = img.width, h = img.height, m = 400; if (w > h) { if (w > m) { h = Math.round(h * m / w); w = m; } } else { if (h > m) { w = Math.round(w * m / h); h = m; } } const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); _qSettings.logo_data = cv.toDataURL('image/png'); const p = document.getElementById('qsLogoPrev'); if (p) p.innerHTML = `<img src="${_qSettings.logo_data}" class="h-12 object-contain">`; }; img.src = e.target.result; };
        rd.readAsDataURL(f);
    };
    window.qsLogoClear = function () { _qSettings.logo_data = null; const p = document.getElementById('qsLogoPrev'); if (p) p.innerHTML = '<span class="text-xs text-slate-400">Logo yok</span>'; };

    // ---------------------------------------------------- KAYDET
    window.saveQuoteSettings = async function () {
        capture();
        const cid = qCompanyId();
        if (!cid || !supabaseClient) { alert('Firma bulunamadı. Kurulumcu firma hesabıyla giriş yapın.'); return; }
        const s = Object.assign({}, _qSettings); s.company_id = cid; s.updated_at = new Date().toISOString();
        try {
            const { error } = await supabaseClient.from('firm_quote_settings').upsert(s, { onConflict: 'company_id' });
            if (error) throw error;
            for (const it of _qCatalog) {
                const unchanged = !it._custom && it.margin_pct == null && !it.hidden && Number(it.cost_usd) === Number(it.default_cost);
                if (unchanged && !it._fcId) continue;
                const row = { company_id: cid, cost_usd: it.cost_usd, margin_pct: it.margin_pct, hidden: it.hidden, updated_at: new Date().toISOString() };
                if (it._custom) { row.product_id = null; row.category = it.category; row.name = it.name; row.brand = it.brand; row.unit = it.unit; }
                else { row.product_id = it.id; }
                if (it._fcId && String(it._fcId).indexOf('new_') !== 0) { const { error: e2 } = await supabaseClient.from('firm_catalog').update(row).eq('id', it._fcId); if (e2) throw e2; }
                else { const { data, error: e3 } = await supabaseClient.from('firm_catalog').insert(row).select('id').single(); if (e3) throw e3; if (data) it._fcId = data.id; }
            }
            alert('Ayarlar kaydedildi ✅');
        } catch (e) { alert('Kaydedilemedi: ' + (e.message || e)); }
    };

    // ============================ FAZ 3: TEKLİF SİHİRBAZI ============================
    const CITY_YIELD = {"Adana":1650,"Adıyaman":1620,"Afyonkarahisar":1560,"Ağrı":1520,"Aksaray":1600,"Amasya":1450,"Ankara":1560,"Antalya":1680,"Ardahan":1480,"Artvin":1350,"Aydın":1620,"Balıkesir":1500,"Bartın":1300,"Batman":1640,"Bayburt":1450,"Bilecik":1480,"Bingöl":1520,"Bitlis":1540,"Bolu":1350,"Burdur":1600,"Bursa":1480,"Çanakkale":1500,"Çankırı":1480,"Çorum":1460,"Denizli":1600,"Diyarbakır":1650,"Düzce":1320,"Edirne":1480,"Elazığ":1560,"Erzincan":1520,"Erzurum":1520,"Eskişehir":1540,"Gaziantep":1640,"Giresun":1300,"Gümüşhane":1420,"Hakkari":1560,"Hatay":1620,"Iğdır":1560,"Isparta":1600,"İstanbul":1450,"İzmir":1600,"Kahramanmaraş":1620,"Karabük":1350,"Karaman":1620,"Kars":1500,"Kastamonu":1330,"Kayseri":1580,"Kırıkkale":1540,"Kırklareli":1460,"Kırşehir":1560,"Kilis":1650,"Kocaeli":1420,"Konya":1620,"Kütahya":1520,"Malatya":1560,"Manisa":1580,"Mardin":1680,"Mersin":1660,"Muğla":1620,"Muş":1520,"Nevşehir":1580,"Niğde":1600,"Ordu":1300,"Osmaniye":1630,"Rize":1250,"Sakarya":1400,"Samsun":1350,"Siirt":1640,"Sinop":1320,"Sivas":1520,"Şanlıurfa":1700,"Şırnak":1660,"Tekirdağ":1470,"Tokat":1440,"Trabzon":1300,"Tunceli":1520,"Uşak":1560,"Van":1560,"Yalova":1440,"Yozgat":1520,"Zonguldak":1300};
    let _wz = null, _wzLeads = null;

    function wzYield(c) { return CITY_YIELD[c] || 1500; }
    function wzCat(cat) { return (_qCatalog || []).filter(x => x.category === cat && !x.hidden); }
    function wzById(id) { return (_qCatalog || []).find(x => String(x.id) === String(id)); }
    function wzBestInv(kwp) { const a = wzCat('inverter'); if (!a.length) return null; let b = a[0], bd = 1e9; a.forEach(x => { const k = (x.specs && x.specs.kwe) || 10; const d = Math.abs(k - kwp); if (k >= kwp * 0.8 && d < bd) { bd = d; b = x; } }); return b; }
    function wzBestBat(kwh) { const a = wzCat('battery'); if (!a.length) return null; let b = a[0], bd = 1e9; a.forEach(x => { const k = (x.specs && x.specs.kwh) || 5; const d = Math.abs(k - kwh); if (d < bd) { bd = d; b = x; } }); return b; }

    function wzInit(lead) {
        const tariff = Number(_qSettings.tariff_tl) || 3.5;
        let cons = 0;
        if (lead) { const mc = Number(lead.monthly_consumption) || 0, mb = Number(lead.monthly_bill || lead.bill_amount) || 0; cons = mc > 0 ? Math.round(mc * 12) : (mb > 0 ? Math.round(mb / tariff * 12) : 0); }
        _wz = { step: 1, lead_id: lead ? lead.id : null, name: lead ? (lead.full_name || lead.name || '') : '', phone: lead ? (lead.phone || '') : '', email: lead ? (lead.email || '') : '', city: (lead && (lead.city || lead.il)) || 'İstanbul', location: '', annualCons: cons, kwp: 0, panelId: null, inverterId: null, batteryKwh: 0, batteryId: null, discount: 0, bom: [] };
        const p0 = wzCat('panel')[0]; _wz.panelId = p0 ? p0.id : null;
        wzRecalcKwp();
    }
    function wzRecalcKwp() { const y = wzYield(_wz.city); _wz.kwp = _wz.annualCons > 0 ? Math.round(_wz.annualCons / y * 10) / 10 : 0; }
    function wzPanelWatt() { const p = wzById(_wz.panelId) || wzCat('panel')[0]; return (p && p.specs && p.specs.watt) || 615; }
    function wzPanels() { return Math.max(0, Math.ceil((Number(_wz.kwp) || 0) * 1000 / wzPanelWatt())); }
    function wzKwe() { const inv = wzById(_wz.inverterId) || wzBestInv(Number(_wz.kwp) || 0); return inv && inv.specs ? (inv.specs.kwe || 0) : 0; }

    async function renderWizard() {
        const box = document.getElementById('quoteView'); if (!box) return;
        if (!_wz) wzInit(null);
        if (_wzLeads === null && supabaseClient) { try { const { data } = await supabaseClient.from('leads').select('*').eq('company_id', qCompanyId()).order('created_at', { ascending: false }); _wzLeads = data || []; } catch (e) { _wzLeads = []; } }
        const step = _wz.step;
        const dot = (n, l) => `<div class="flex items-center gap-2 ${step===n?'text-indigo-600':'text-slate-400'}"><span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${step>=n?'bg-indigo-600 text-white':'bg-slate-200'}">${n}</span><span class="text-xs font-bold hidden sm:inline">${l}</span></div>`;
        let body = '';
        if (step === 1) body = wzStep1();
        else if (step === 2) body = wzStep2();
        else body = wzStep3();
        box.innerHTML = `
            <div class="flex items-center gap-3 mb-5">${dot(1,'Müşteri')}<div class="flex-1 h-px bg-slate-200"></div>${dot(2,'Sistem')}<div class="flex-1 h-px bg-slate-200"></div>${dot(3,'Malzeme & Fiyat')}</div>
            <div class="bg-white border border-slate-200 rounded-xl p-5">${body}</div>`;
    }

    // -------- ADIM 1: MÜŞTERİ
    function wzStep1() {
        const w = _wz;
        const leadOpts = (_wzLeads || []).map(l => `<option value="${l.id}" ${w.lead_id===l.id?'selected':''}>${esc(l.full_name || l.name || '(isimsiz)')}${l.phone?' · '+esc(l.phone):''}</option>`).join('');
        const inp = (id, v, ph, t) => `<input id="${id}" type="${t||'text'}" value="${esc(v==null?'':v)}" placeholder="${ph||''}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">`;
        const cities = Object.keys(CITY_YIELD).map(c => `<option value="${c}" ${w.city===c?'selected':''}>${c}</option>`).join('');
        return `
            <h3 class="font-black text-slate-800 mb-3">Müşteri Bilgileri</h3>
            ${(_wzLeads && _wzLeads.length) ? `<div class="mb-4"><label class="block text-xs font-bold text-slate-600 mb-1">CRM müşterisinden doldur (opsiyonel)</label><select onchange="wzPickLead(this.value)" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white"><option value="">— Elle gir —</option>${leadOpts}</select></div>` : ''}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Ad Soyad *</label>${inp('wzName', w.name, '')}</div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Telefon</label>${inp('wzPhone', w.phone, '')}</div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">E-posta</label>${inp('wzEmail', w.email, '')}</div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Konum / İlçe</label>${inp('wzLoc', w.location, '')}</div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">İl</label><select id="wzCity" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${cities}</select></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Yıllık Tüketim (kWh)</label>${inp('wzCons', w.annualCons, 'örn. 7500', 'number')}</div>
            </div>
            <p class="text-[11px] text-slate-400 mt-2">Yıllık tüketim bilinmiyorsa CRM'den fatura verisi ile tahmin edilir; buradan düzeltebilirsiniz.</p>
            <div class="flex justify-end mt-5"><button onclick="wzNext()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-lg">Devam →</button></div>`;
    }
    window.wzPickLead = function (id) {
        wzCaptureStep1();
        const l = (_wzLeads || []).find(x => String(x.id) === String(id));
        if (!l) { _wz.lead_id = null; renderWizard(); return; }
        const tariff = Number(_qSettings.tariff_tl) || 3.5;
        const mc = Number(l.monthly_consumption) || 0, mb = Number(l.monthly_bill || l.bill_amount) || 0;
        _wz.lead_id = l.id; _wz.name = l.full_name || l.name || ''; _wz.phone = l.phone || ''; _wz.email = l.email || '';
        if (l.city || l.il) _wz.city = l.city || l.il;
        _wz.annualCons = mc > 0 ? Math.round(mc * 12) : (mb > 0 ? Math.round(mb / tariff * 12) : _wz.annualCons);
        wzRecalcKwp(); renderWizard();
    };
    function wzCaptureStep1() {
        const g = id => document.getElementById(id); if (!g('wzName')) return;
        _wz.name = g('wzName').value; _wz.phone = g('wzPhone').value; _wz.email = g('wzEmail').value;
        _wz.location = g('wzLoc').value; _wz.city = g('wzCity').value; _wz.annualCons = parseFloat(g('wzCons').value) || 0;
    }

    // -------- ADIM 2: SİSTEM
    function wzStep2() {
        const w = _wz, y = wzYield(w.city);
        const panelOpts = wzCat('panel').map(p => `<option value="${p.id}" ${w.panelId===p.id?'selected':''}>${esc(p.name)}${p.specs&&p.specs.watt?' ('+p.specs.watt+'W)':''}</option>`).join('');
        const invOpts = ['<option value="">— Otomatik —</option>'].concat(wzCat('inverter').map(i => `<option value="${i.id}" ${w.inverterId===i.id?'selected':''}>${esc(i.name)}${i.specs&&i.specs.kwe?' ('+i.specs.kwe+'kW)':''}</option>`)).join('');
        const batOpts = ['<option value="">— Otomatik —</option>'].concat(wzCat('battery').map(b => `<option value="${b.id}" ${w.batteryId===b.id?'selected':''}>${esc(b.name)}${b.specs&&b.specs.kwh?' ('+b.specs.kwh+'kWh)':''}</option>`)).join('');
        return `
            <h3 class="font-black text-slate-800 mb-1">Sistem Boyutlandırma</h3>
            <p class="text-xs text-slate-500 mb-4">${esc(w.city)} özgül üretim: <b>${y} kWh/kWp/yıl</b> · Yıllık tüketim: <b>${w.annualCons || 0} kWh</b></p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Sistem Gücü (kWp)</label><input id="wzKwp" type="number" step="0.1" value="${w.kwp}" oninput="wzKwpLive()" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Panel</label><select id="wzPanel" onchange="wzCaptureStep2();renderWizard()" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${panelOpts}</select></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">İnverter</label><select id="wzInv" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${invOpts}</select></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Batarya (kWh) — 0 = yok</label><input id="wzBat" type="number" step="0.1" value="${w.batteryKwh}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Batarya Ürünü</label><select id="wzBatP" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${batOpts}</select></div>
            </div>
            <div class="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
                <span>Panel adedi: <b id="wzPanelCnt" class="text-slate-800">${wzPanels()}</b> × ${wzPanelWatt()}W</span>
                <span>Önerilen inverter: <b class="text-slate-800">${(wzBestInv(Number(w.kwp)||0)||{}).name ? esc(wzBestInv(Number(w.kwp)||0).name) : '—'}</b></span>
                <span>Tahmini yıllık üretim: <b class="text-slate-800">${Math.round((Number(w.kwp)||0)*y)} kWh</b></span>
            </div>
            <div class="flex justify-between mt-5"><button onclick="wzBack()" class="text-slate-500 font-bold px-4">← Geri</button><button onclick="wzNext()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-lg">Malzeme & Fiyat →</button></div>`;
    }
    window.wzKpwLive = null;
    window.wzKwpLive = function () { const v = parseFloat(document.getElementById('wzKwp').value) || 0; _wz.kwp = v; const c = document.getElementById('wzPanelCnt'); if (c) c.textContent = wzPanels(); };
    function wzCaptureStep2() {
        const g = id => document.getElementById(id); if (!g('wzKwp')) return;
        _wz.kwp = parseFloat(g('wzKwp').value) || 0; _wz.panelId = g('wzPanel').value || _wz.panelId;
        _wz.inverterId = g('wzInv').value || null; _wz.batteryKwh = parseFloat(g('wzBat').value) || 0; _wz.batteryId = g('wzBatP').value || null;
    }

    // -------- ADIM 3: MALZEME & FİYAT
    function wzBuildBom() {
        const w = _wz, out = [], kwp = Number(w.kwp) || 0;
        const line = (it, qty) => ({ id: it.id, category: it.category, name: it.name, brand: it.brand, unit: it.unit, qty: Math.round((qty + Number.EPSILON) * 100) / 100, cost: Number(it.cost_usd) || 0, margin: (it.margin_pct == null ? null : it.margin_pct) });
        const panel = wzById(w.panelId) || wzCat('panel')[0]; if (panel) out.push(line(panel, wzPanels()));
        const inv = wzById(w.inverterId) || wzBestInv(kwp); if (inv) out.push(line(inv, 1));
        if (Number(w.batteryKwh) > 0) { const bat = wzById(w.batteryId) || wzBestBat(Number(w.batteryKwh)); if (bat) { const bk = (bat.specs && bat.specs.kwh) || 5; out.push(line(bat, Math.max(1, Math.round(Number(w.batteryKwh) / bk)))); } }
        wzCat('construction').slice(0, 1).forEach(x => out.push(line(x, kwp)));
        const dc = wzCat('cable').find(x => /dc/i.test(x.name)); if (dc) out.push(line(dc, Math.max(20, wzPanels() * 2)));
        const ac = wzCat('cable').find(x => /ac|ag/i.test(x.name) && !/dc/i.test(x.name)); if (ac) out.push(line(ac, 30));
        wzCat('cable').filter(x => /tava/i.test(x.name)).slice(0, 1).forEach(x => out.push(line(x, 20)));
        wzCat('panel_board').slice(0, 1).forEach(x => out.push(line(x, 1)));
        wzCat('meter').slice(0, 1).forEach(x => out.push(line(x, 1)));
        wzCat('labor').forEach(x => out.push(line(x, /kwp/i.test(x.unit) ? kwp : 1)));
        ['engineering', 'logistics', 'grounding', 'safety', 'monitoring'].forEach(c => wzCat(c).slice(0, 1).forEach(x => out.push(line(x, 1))));
        wzCat('insurance').slice(0, 1).forEach(x => out.push(line(x, Number(x.cost_usd) || 1)));
        _wz.bom = out;
    }
    function wzTotals() {
        const w = _wz, gm = Number(_qSettings.general_margin_pct) || 0; let base = 0; const lines = [];
        (w.bom || []).forEach(l => { const m = (l.margin == null ? gm : Number(l.margin)); const us = (Number(l.cost) || 0) * (1 + m / 100); let sale = 0; if (l.unit !== 'percent') { sale = (Number(l.qty) || 0) * us; base += sale; } lines.push(Object.assign({}, l, { m, sale })); });
        lines.forEach(l => { if (l.unit === 'percent') l.sale = base * (Number(l.qty) || 0) / 100 * (1 + l.m / 100); });
        const subtotal = lines.reduce((s, l) => s + l.sale, 0), discount = Number(w.discount) || 0;
        const totalUsd = Math.max(0, subtotal - discount), rate = Number(_qSettings.usd_rate) || 0, vat = Number(_qSettings.vat_pct) || 0;
        return { lines, subtotal, discount, totalUsd, rate, vat, totalTry: totalUsd * rate, totalTryVat: totalUsd * rate * (1 + vat / 100) };
    }
    function wzStep3() {
        if (!_wz.bom || !_wz.bom.length) wzBuildBom();
        const t = wzTotals(), fmt = n => (Math.round(n)).toLocaleString('tr-TR');
        const rows = _wz.bom.map((l, i) => `
            <tr class="border-b border-slate-100">
                <td class="p-2 text-xs"><div class="font-bold text-slate-700">${esc(l.name)}</div>${l.brand?`<div class="text-[10px] text-slate-400">${esc(l.brand)}</div>`:''}</td>
                <td class="p-2"><input class="wzq w-16 border border-slate-200 rounded p-1 text-xs text-right" data-i="${i}" type="number" step="0.01" value="${l.qty}" oninput="wzQtyLive()"> <span class="text-[10px] text-slate-400">${l.unit}</span></td>
                <td class="p-2 text-xs text-right text-slate-500">$${fmt(t.lines[i].sale)}</td>
                <td class="p-2 text-center"><button onclick="wzDelLine(${i})" class="text-red-400 hover:text-red-600 text-xs">✕</button></td>
            </tr>`).join('');
        const addOpts = (_qCatalog || []).filter(x => !x.hidden).map(x => `<option value="${x.id}">${esc((QCAT[x.category]||x.category)+' · '+x.name)}</option>`).join('');
        return `
            <h3 class="font-black text-slate-800 mb-3">Malzeme Listesi & Fiyat</h3>
            <div class="overflow-x-auto border border-slate-100 rounded-lg mb-3">
                <table class="w-full text-sm"><thead class="bg-slate-50"><tr class="text-[11px] text-slate-500 text-left"><th class="p-2">Kalem</th><th class="p-2">Miktar</th><th class="p-2 text-right">Satış $</th><th class="p-2"></th></tr></thead><tbody id="wzBomBody">${rows}</tbody></table>
            </div>
            <div class="flex items-center gap-2 mb-4"><select id="wzAddSel" class="flex-1 border border-slate-300 p-2 rounded-lg text-sm bg-white">${addOpts}</select><button onclick="wzAddLine()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-sm">+ Kalem Ekle</button></div>
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div class="flex justify-between items-center text-sm mb-1"><span class="text-slate-500">Ara Toplam (satış)</span><span class="font-bold" id="wzSub">$${fmt(t.subtotal)}</span></div>
                <div class="flex justify-between items-center text-sm mb-1"><span class="text-slate-500">İskonto (USD)</span><input id="wzDisc" type="number" value="${_wz.discount||0}" oninput="wzQtyLive()" class="w-28 border border-slate-300 p-1.5 rounded text-sm text-right"></div>
                <div class="border-t border-slate-200 mt-2 pt-2 flex justify-between items-baseline"><span class="font-black text-slate-800">Teklif Bedeli (KDV hariç)</span><span class="text-right"><div class="text-xl font-black text-indigo-600" id="wzUsd">$${fmt(t.totalUsd)}</div><div class="text-xs text-slate-500" id="wzTry">≈ ₺${fmt(t.totalTry)}</div></span></div>
                <div class="flex justify-between text-sm mt-1"><span class="text-slate-500">KDV Dahil (%${t.vat})</span><span class="font-bold text-slate-700" id="wzVat">₺${fmt(t.totalTryVat)}</span></div>
                <p class="text-[10px] text-slate-400 mt-1">Kur: ${t.rate} · Maliyet/kâr müşteriye gösterilmez.</p>
            </div>
            <div class="flex justify-between mt-5"><button onclick="wzBack()" class="text-slate-500 font-bold px-4">← Geri</button><button onclick="wzSave()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-2.5 rounded-lg">💾 Teklifi Kaydet</button></div>`;
    }
    window.wzQtyLive = function () {
        document.querySelectorAll('.wzq').forEach(inp => { const i = +inp.getAttribute('data-i'); if (_wz.bom[i]) _wz.bom[i].qty = parseFloat(inp.value) || 0; });
        const d = document.getElementById('wzDisc'); if (d) _wz.discount = parseFloat(d.value) || 0;
        const t = wzTotals(), fmt = n => (Math.round(n)).toLocaleString('tr-TR');
        document.querySelectorAll('#wzBomBody tr').forEach((tr, i) => { const c = tr.children[2]; if (c && t.lines[i]) c.textContent = '$' + fmt(t.lines[i].sale); });
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('wzSub', '$' + fmt(t.subtotal)); set('wzUsd', '$' + fmt(t.totalUsd)); set('wzTry', '≈ ₺' + fmt(t.totalTry)); set('wzVat', '₺' + fmt(t.totalTryVat));
    };
    window.wzDelLine = function (i) { wzQtyLive(); _wz.bom.splice(i, 1); renderWizard(); };
    window.wzAddLine = function () { wzQtyLive(); const it = wzById(document.getElementById('wzAddSel').value); if (it) _wz.bom.push({ id: it.id, category: it.category, name: it.name, brand: it.brand, unit: it.unit, qty: 1, cost: Number(it.cost_usd) || 0, margin: (it.margin_pct == null ? null : it.margin_pct) }); renderWizard(); };

    // -------- NAV + KAYDET
    window.wzNext = function () { if (_wz.step === 1) { wzCaptureStep1(); if (!(_wz.name || '').trim()) { alert('Ad soyad zorunludur.'); return; } wzRecalcKwp(); _wz.step = 2; } else if (_wz.step === 2) { wzCaptureStep2(); _wz.bom = []; _wz.step = 3; } renderWizard(); };
    window.wzBack = function () { if (_wz.step === 3) wzQtyLive(); else if (_wz.step === 2) wzCaptureStep2(); _wz.step = Math.max(1, _wz.step - 1); renderWizard(); };
    window.wzSave = async function () {
        wzQtyLive();
        const cid = qCompanyId(); if (!cid || !supabaseClient) { alert('Firma bulunamadı.'); return; }
        const t = wzTotals(), w = _wz, y = wzYield(w.city);
        const row = {
            company_id: cid, lead_id: w.lead_id || null,
            quote_no: w.revise_no ? nextRev(w.revise_no) : ('TKF-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(Math.random() * 9000 + 1000)),
            customer_name: w.name, customer_phone: w.phone, customer_email: w.email, city: w.city, location: w.location,
            system: { kwp: Number(w.kwp) || 0, kwe: wzKwe(), battery_kwh: Number(w.batteryKwh) || 0, panels: wzPanels(), annual_cons: Number(w.annualCons) || 0, annual_prod: Math.round((Number(w.kwp) || 0) * y) },
            items: t.lines.map(l => ({ name: l.name, brand: l.brand, category: l.category, unit: l.unit, qty: l.qty, cost: l.cost, margin: (l.margin == null ? null : l.margin), sale: Math.round(l.sale * 100) / 100 })),
            totals: { subtotal_usd: Math.round(t.subtotal * 100) / 100, discount: t.discount, total_usd: Math.round(t.totalUsd * 100) / 100, usd_rate: t.rate, vat_pct: t.vat, total_try: Math.round(t.totalTry), total_try_vat: Math.round(t.totalTryVat) },
            sections: _qSettings.sections || {}, status: 'draft', updated_at: new Date().toISOString()
        };
        const reviseId = w.reviseFromId || null;
        try { const { data, error } = await supabaseClient.from('firm_quotes').insert(row).select('*').single(); if (error) throw error; if (reviseId) { try { await supabaseClient.from('firm_quotes').update({ status: 'revised', updated_at: new Date().toISOString() }).eq('id', reviseId); } catch (e2) {} } _wz = null; quoteOpenPreview(data); } catch (e) { alert('Kaydedilemedi: ' + (e.message || e)); }
    };

    // -------- CRM ENTEGRASYONU
    window.QUOTES_ENABLED = true;
    window.crmOpenQuote = async function (leadId) {
        let lead = null; try { const { data } = await supabaseClient.from('leads').select('*').eq('id', leadId).maybeSingle(); lead = data; } catch (e) {}
        if (!_qSettings) await loadQuoteData();
        _wzLeads = null; wzInit(lead); showQuoteModule('new');
    };


    // ============================ FAZ 4: MARKALI ÇIKTI + FAZ 5 (liste) ============================
    let _qList = null;

    async function renderQuoteList() {
        const box = document.getElementById('quoteView'); if (!box) return;
        box.innerHTML = '<p class="text-slate-400 text-sm py-6">Yükleniyor...</p>';
        try { const { data } = await supabaseClient.from('firm_quotes').select('*').eq('company_id', qCompanyId()).order('created_at', { ascending: false }); _qList = data || []; }
        catch (e) { box.innerHTML = `<p class="text-red-500 text-sm">Yüklenemedi: ${esc(e.message || e)}</p>`; return; }
        if (!_qList.length) { box.innerHTML = '<div class="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center"><div class="text-4xl mb-2">🗂️</div><p class="font-black text-slate-700">Henüz teklif yok</p><p class="text-sm text-slate-500 mt-1">＋ Yeni Teklif ile ilk teklifinizi oluşturun.</p></div>'; return; }
        const ST = { draft: ['Taslak', 'bg-slate-100 text-slate-600'], sent: ['Gönderildi', 'bg-blue-100 text-blue-700'], accepted: ['Kabul', 'bg-emerald-100 text-emerald-700'], rejected: ['Ret', 'bg-red-100 text-red-700'], revised: ['Revize', 'bg-amber-100 text-amber-800'] };
        box.innerHTML = _qList.map(q => { const b = ST[q.status] || ST.draft, sys = q.system || {}, tot = q.totals || {}; return `
            <div class="bg-white border border-slate-200 rounded-xl p-4 mb-2 flex items-center justify-between gap-3 flex-wrap">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap"><span class="font-black text-slate-800">${esc(q.customer_name || '—')}</span><span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">${esc(q.quote_no || '')}</span><span class="text-[10px] font-black px-2 py-0.5 rounded-full ${b[1]}">${b[0]}</span></div>
                    <div class="text-[11px] text-slate-400 mt-0.5">${esc(q.city || '')} · ${sys.kwp || 0} kWp${sys.battery_kwh ? ' + ' + sys.battery_kwh + ' kWh' : ''} · ₺${(tot.total_try_vat || 0).toLocaleString('tr-TR')} KDV dahil · ${new Date(q.created_at).toLocaleDateString('tr-TR')}</div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <select onchange="quoteSetStatus('${q.id}', this.value)" class="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${q.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
                    <button onclick="quoteOpenById('${q.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg text-sm">Aç / Yazdır</button>
                </div>
            </div>`; }).join('');
    }
    window.quoteOpenById = function (id) { const q = (_qList || []).find(x => String(x.id) === String(id)); if (q) quoteOpenPreview(q); };
    window.quoteSetStatus = async function (id, status) { try { await supabaseClient.from('firm_quotes').update({ status, updated_at: new Date().toISOString() }).eq('id', id); const q = (_qList || []).find(x => String(x.id) === String(id)); if (q) q.status = status; } catch (e) { alert('Güncellenemedi: ' + (e.message || e)); } };

    window.quoteOpenPreview = function (q) {
        _qPreview = q;
        renderShell('list');
        const box = document.getElementById('quoteView'); if (!box) return;
        const html = buildQuoteHtml(q, _qSettings);
        box.innerHTML = `
            <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                <button onclick="quoteView('list')" class="text-slate-500 hover:text-indigo-600 font-bold">← Tekliflere Dön</button>
                <div class="flex gap-2 flex-wrap items-center"><span class="text-xs text-slate-400 self-center">${esc(q.quote_no || '')}</span><button onclick="quoteRevise(_qPreview)" class="bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-4 py-2 rounded-lg text-sm">✎ Revize</button><button onclick="quoteShare(_qPreview)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-sm">🔗 Paylaş</button><button onclick="quotePrint()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-lg text-sm">🖨️ Yazdır / PDF</button></div>
            </div>
            <iframe id="quoteFrame" class="w-full bg-white border border-slate-200 rounded-lg shadow" style="height:78vh"></iframe>`;
        const f = document.getElementById('quoteFrame'); if (f) f.srcdoc = html;
    };
    window.quotePrint = function () { const f = document.getElementById('quoteFrame'); if (f && f.contentWindow) { f.contentWindow.focus(); f.contentWindow.print(); } };

    function buildQuoteHtml(q, s) {
        s = s || {};
        const BR = '#' + ((s.brand_color || '4F46E5').replace('#', ''));
        const on = k => q.sections ? (q.sections[k] !== false) : true;
        const sys = q.system || {}, tot = q.totals || {}, items = q.items || [];
        const fmt = n => (Math.round(Number(n) || 0)).toLocaleString('tr-TR');
        const e2 = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const lines = t => e2(t).split(/\r?\n/).filter(x => x.trim());
        const today = new Date().toLocaleDateString('tr-TR'), valid = s.validity_days || 7;
        const curve = [0.045, 0.055, 0.075, 0.095, 0.11, 0.115, 0.12, 0.11, 0.095, 0.075, 0.05, 0.04];
        const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
        const annualProd = Number(sys.annual_prod) || 0, annualCons = Number(sys.annual_cons) || 0;
        const tariff = Number(s.tariff_tl) || 3.5, annualSaving = Math.round(annualProd * tariff);
        const totalTryVat = Number(tot.total_try_vat) || 0, paybackY = annualSaving > 0 ? totalTryVat / annualSaving : 0;
        const paybackTxt = annualSaving > 0 ? Math.floor(paybackY) + ' yıl ' + Math.round((paybackY % 1) * 12) + ' ay' : '—';
        const pay = (s.payment_plan || []).map(p => `<tr><td>${e2(p.label)}</td><td class="r">%${p.pct}</td><td class="r">₺${fmt(totalTryVat * (Number(p.pct) || 0) / 100)}</td></tr>`).join('');
        const war = (s.warranty || []).map(w => `<tr><td>${e2(w.component)}</td><td>${e2(w.product)}</td><td>${e2(w.performance)}</td><td>${e2(w.life)}</td></tr>`).join('');
        const sig = (s.signatures || []).map(x => `<div style="text-align:center;min-width:170px"><div style="border-top:1px solid #94a3b8;width:150px;margin:36px auto 6px"></div><div style="font-weight:bold">${e2(x.name)}</div><div style="font-size:10px;color:#64748b">${e2(x.title)}</div></div>`).join('');
        return `<!doctype html><html><head><meta charset="utf-8"><style>
        @page{size:A4;margin:14mm}*{box-sizing:border-box}
        body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;font-size:12px;line-height:1.5;margin:0}
        h1{font-size:21px;margin:0 0 6px}h2{font-size:14px;color:${BR};border-bottom:2px solid ${BR};padding-bottom:5px;margin:20px 0 8px}
        table{width:100%;border-collapse:collapse;margin:6px 0}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px}th{background:#f1f5f9;color:#475569}
        .section{page-break-inside:avoid}.muted{color:#64748b}.r{text-align:right}
        .band{background:${BR};color:#fff;padding:22px;border-radius:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
        .pricebox{background:${BR};color:#fff;padding:16px;border-radius:10px;text-align:center;margin:8px 0}
        .grid2{display:flex;gap:16px}.grid2>div{flex:1}
        .logo{max-height:52px;max-width:170px;object-fit:contain;background:#fff;padding:4px 8px;border-radius:6px}
        ul{margin:6px 0;padding-left:18px}li{margin:2px 0}
        </style></head><body>
        ${on('cover') ? `<div class="band"><div><div style="font-size:11px;letter-spacing:1px;opacity:.85;font-weight:bold">ANAHTAR TESLİM GÜNEŞ ENERJİSİ SİSTEMİ TEKLİFİ</div><h1>${e2(q.customer_name || '')}</h1><div style="opacity:.92">${e2(q.city || '')}${q.location ? ' · ' + e2(q.location) : ''} · ${sys.kwp || 0} kWp${sys.battery_kwh ? ' + ' + sys.battery_kwh + ' kWh Batarya' : ''}</div></div><div style="text-align:right">${s.logo_data ? `<img class="logo" src="${s.logo_data}"><br>` : ''}<div style="font-size:11px;margin-top:8px;opacity:.92">Teklif No: ${e2(q.quote_no || '')}<br>Tarih: ${today}<br>Geçerlilik: ${valid} gün</div></div></div>` : ''}
        ${on('system') ? `<div class="section"><h2>Sistem Özeti</h2><table><tr><th>Kurulu Güç (DC)</th><td>${sys.kwp || 0} kWp</td><th>İnverter (AC)</th><td>${sys.kwe || 0} kW</td></tr><tr><th>Panel Adedi</th><td>${sys.panels || 0}</td><th>Batarya</th><td>${sys.battery_kwh ? sys.battery_kwh + ' kWh' : '—'}</td></tr><tr><th>Konum</th><td>${e2(q.city || '')}</td><th>Yıllık Üretim (öngörü)</th><td>${fmt(annualProd)} kWh</td></tr></table></div>` : ''}
        ${on('production') ? `<div class="section"><h2>Aylık Üretim Öngörüsü</h2><table><tr><th>Ay</th>${months.map(m => `<th class="r">${m}</th>`).join('')}</tr><tr><td>Üretim (kWh)</td>${curve.map(c => `<td class="r">${fmt(annualProd * c)}</td>`).join('')}</tr></table><div class="muted" style="font-size:10px">Toplam yıllık öngörü: ${fmt(annualProd)} kWh · Yıllık tüketim: ${fmt(annualCons)} kWh</div></div>` : ''}
        ${on('feasibility') ? `<div class="section"><h2>Fizibilite & Geri Ödeme</h2><div class="grid2"><div class="pricebox"><div style="font-size:19px;font-weight:bold">₺${fmt(annualSaving)}</div><div style="font-size:11px;opacity:.9">İlk yıl tahmini tasarruf</div></div><div class="pricebox"><div style="font-size:19px;font-weight:bold">${paybackTxt}</div><div style="font-size:11px;opacity:.9">Tahmini geri ödeme süresi</div></div></div><div class="muted" style="font-size:10px">Elektrik birim fiyatı ${tariff} TL/kWh baz alınmıştır; yıllık ~%${s.yield_increase_pct || 20} zam ile süre kısalır. Göstergedir.</div></div>` : ''}
        ${on('price') ? `<div class="section"><h2>Yatırım Bedeli & Ödeme</h2><div class="pricebox"><div style="font-size:12px;opacity:.85">Anahtar Teslim Bedel (KDV hariç)</div><div style="font-size:25px;font-weight:bold">$${fmt(tot.total_usd)} <span style="font-size:15px;opacity:.85">≈ ₺${fmt(tot.total_try)}</span></div><div style="font-size:11px;opacity:.9;margin-top:4px">KDV Dahil: ₺${fmt(tot.total_try_vat)} · Kur: ${tot.usd_rate}</div></div>${pay ? `<table><tr><th>Ödeme Dilimi</th><th class="r">Oran</th><th class="r">Tutar (KDV dahil)</th></tr>${pay}</table>` : ''}</div>` : ''}
        ${on('bom') ? `<div class="section"><h2>Malzeme Listesi</h2><table><tr><th>Kalem</th><th>Marka</th><th class="r">Miktar</th></tr>${items.filter(it => it.unit !== 'percent').map(it => `<tr><td>${e2(it.name)}</td><td>${e2(it.brand || '')}</td><td class="r">${it.qty} ${it.unit === 'adet' ? 'adet' : it.unit}</td></tr>`).join('')}</table></div>` : ''}
        ${on('scope') ? `<div class="section"><h2>Kapsam</h2><div class="grid2"><div><b style="color:#059669">✓ Dahil</b><ul>${lines(s.scope_included).map(x => `<li>${x}</li>`).join('') || '<li class="muted">—</li>'}</ul></div><div><b style="color:#dc2626">✕ Hariç</b><ul>${lines(s.scope_excluded).map(x => `<li>${x}</li>`).join('') || '<li class="muted">—</li>'}</ul></div></div></div>` : ''}
        ${on('warranty') && war ? `<div class="section"><h2>Garanti ve Ömür</h2><table><tr><th>Bileşen</th><th>Ürün Garantisi</th><th>Performans</th><th>Beklenen Ömür</th></tr>${war}</table></div>` : ''}
        ${on('terms') && (s.terms_text || '').trim() ? `<div class="section"><h2>Ticari Şartlar</h2><div style="font-size:11px;white-space:pre-line">${e2(s.terms_text)}</div></div>` : ''}
        ${on('references') ? `<div class="section"><h2>Referanslar & Sertifikalar</h2><div class="muted" style="font-size:11px">${e2(s.certificates || '') || '—'}</div></div>` : ''}
        ${on('signature') ? `<div class="section" style="margin-top:18px">${sig ? `<div style="display:flex;justify-content:space-around;flex-wrap:wrap">${sig}</div>` : ''}<div style="margin-top:22px;border-top:1px solid #e2e8f0;padding-top:10px;font-size:10px;color:#64748b;text-align:center">${e2(s.phone || '')}${s.email ? ' · ' + e2(s.email) : ''}${s.website ? ' · ' + e2(s.website) : ''}${s.address ? '<br>' + e2(s.address) : ''}</div></div>` : ''}
        </body></html>`;
    }


    // ============================ FAZ 5: REVİZYON + PAYLAŞIM ============================
    let _qPreview = null;

    function nextRev(no) { if (!no) return 'TKF-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(Math.random() * 9000 + 1000); const m = no.match(/-R(\d+)$/); return m ? no.replace(/-R\d+$/, '-R' + (parseInt(m[1]) + 1)) : (no + '-R2'); }

    window.quoteRevise = function (q) {
        if (!q) return;
        const sys = q.system || {}, tot = q.totals || {};
        _wz = {
            step: 3, revise_no: q.quote_no || '', reviseFromId: q.id || null,
            lead_id: q.lead_id || null, name: q.customer_name || '', phone: q.customer_phone || '', email: q.customer_email || '',
            city: q.city || 'İstanbul', location: q.location || '', annualCons: Number(sys.annual_cons) || 0,
            kwp: Number(sys.kwp) || 0, panelId: null, inverterId: null, batteryKwh: Number(sys.battery_kwh) || 0, batteryId: null,
            discount: Number(tot.discount) || 0,
            bom: (q.items || []).map(it => ({ id: 'rev_' + Math.random().toString(36).slice(2, 9), category: it.category, name: it.name, brand: it.brand, unit: it.unit, qty: it.qty, cost: it.cost, margin: (it.margin == null ? null : it.margin) }))
        };
        showQuoteModule('new');
    };

    window.quoteShare = async function (q) {
        if (!q || !supabaseClient) return;
        let token = q.share_token;
        if (!token) {
            token = 't' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2, 8);
            try { const { error } = await supabaseClient.from('firm_quotes').update({ share_token: token, updated_at: new Date().toISOString() }).eq('id', q.id); if (error) throw error; q.share_token = token; } catch (e) { alert('Paylaşım linki oluşturulamadı: ' + (e.message || e)); return; }
        }
        const url = location.origin + location.pathname + '#q=' + token;
        try { await navigator.clipboard.writeText(url); } catch (e) {}
        window.prompt('Paylaşılabilir teklif linki (panoya kopyalandı). Müşteri giriş yapmadan görüntüler:', url);
    };

    // -------- PUBLIC SALT-OKUNUR TEKLİF
    async function quoteRenderShared(token) {
        let box = document.getElementById('sharedQuoteView');
        if (!box) { box = document.createElement('div'); box.id = 'sharedQuoteView'; box.style.cssText = 'position:fixed;inset:0;z-index:200;background:#f1f5f9;overflow:auto;font-family:sans-serif'; document.body.appendChild(box); }
        box.innerHTML = '<div style="padding:50px;text-align:center;color:#64748b">Teklif yükleniyor…</div>';
        let tries = 0; while (!window.supabaseClient && tries < 25) { await new Promise(r => setTimeout(r, 150)); tries++; }
        if (!window.supabaseClient) { box.innerHTML = '<div style="padding:60px;text-align:center;color:#64748b">Bağlantı kurulamadı.</div>'; return; }
        try {
            const { data, error } = await supabaseClient.rpc('get_shared_quote', { p_token: token });
            if (error || !data || !data.quote) { box.innerHTML = '<div style="padding:60px;text-align:center"><h2 style="color:#1e293b">Teklif bulunamadı</h2><p style="color:#64748b">Bağlantı geçersiz veya kaldırılmış olabilir.</p></div>'; return; }
            const html = buildQuoteHtml(data.quote, data.settings || {});
            box.innerHTML = '<div style="max-width:920px;margin:0 auto;padding:16px"><div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button id="shPrint" style="background:#4F46E5;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-weight:bold;cursor:pointer">🖨️ Yazdır / PDF</button></div><iframe id="sharedQuoteFrame" style="width:100%;height:84vh;border:1px solid #e2e8f0;border-radius:8px;background:#fff"></iframe></div>';
            document.getElementById('sharedQuoteFrame').srcdoc = html;
            document.getElementById('shPrint').onclick = function () { const f = document.getElementById('sharedQuoteFrame'); if (f && f.contentWindow) { f.contentWindow.focus(); f.contentWindow.print(); } };
        } catch (e) { box.innerHTML = '<div style="padding:60px;text-align:center;color:#64748b">Yüklenemedi.</div>'; }
    }
    function maybeShared() { const m = (location.hash || '').match(/[#&]q=([A-Za-z0-9_-]+)/); if (m) { quoteRenderShared(m[1]); return true; } const b = document.getElementById('sharedQuoteView'); if (b) b.remove(); return false; }
    window.addEventListener('DOMContentLoaded', () => setTimeout(maybeShared, 200));
    window.addEventListener('hashchange', maybeShared);
    if (document.readyState !== 'loading') setTimeout(maybeShared, 200);

})();
