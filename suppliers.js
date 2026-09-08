/* ============================================================================
   suppliers.js — TEDARİKÇİ PANELİ
   Platformun dördüncü rolü. Kalıp danışman paneliyle aynıdır (consultants.js):
   kendi kabına (#supplierPanelRoot) basar, kartlı bir menü sunar.

   Tedarikçinin platformdaki muhatabı KURULUMCU FİRMADIR; yatırımcıya doğrudan
   gösterilmez. Bu bilinçli bir konumlandırma: platform "satıcıdan bağımsız"
   iddiasını taşıyor, tedarikçiyi yatırımcının önüne koymak onu zayıflatırdı.

   Bölümler:
     · Pano            — durum, abonelik, dikkat listesi
     · Firma Profili   — marka/kategori/bölge; onaya gönderilir
     · Ürün Kataloğu   — onaydan geçince donanım karşılaştırmasını besler
     · Bayi İlanları   — hangi illerde bayi/kurulumcu aranıyor
     · Gelen Talepler  — kurulumcu firmalardan fiyat/stok talepleri

   tedarikci.sql çalıştırılmış olmalıdır.
   index.html'de consultants.js'ten SONRA yüklenir.
   ============================================================================ */
(function () {
    'use strict';

    const root = () => document.getElementById('supplierPanelRoot');
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    let S = null;                 // suppliers satırı
    let _email = '';
    let _view = 'menu';

    const KATEGORILER = ['Panel', 'İnverter', 'Batarya', 'Montaj Malzemesi', 'Kablo & Pano', 'Şarj İstasyonu', 'Diğer'];

    const DURUM = {
        draft:    { t: 'Taslak',            css: 'bg-slate-100 text-slate-700' },
        pending:  { t: 'Onay Bekliyor',     css: 'bg-amber-100 text-amber-800' },
        approved: { t: 'Onaylı · Yayında',  css: 'bg-emerald-100 text-emerald-800' },
        rejected: { t: 'Düzeltme İstendi',  css: 'bg-red-100 text-red-700' }
    };

    // ------------------------------------------------------------ panel girişi
    window.showSupplierPanel = function (sup, email) {
        document.getElementById('authContainer')?.classList.add('hidden');
        document.getElementById('landingContainer')?.classList.add('hidden');
        document.getElementById('gatewayContainer')?.classList.add('hidden');
        document.getElementById('appContainer')?.classList.remove('hidden');
        document.getElementById('mainMenu')?.classList.add('hidden');
        document.querySelector('#appContainer > div.w-full.max-w-7xl.mx-auto')?.classList.remove('hidden');

        ['crmModule','adminModule','calculatorModule','simulationModule','evCalcModule',
         'companyManagementModule','techSupportModule','salesAssistantModule','educationModule',
         'regulationsModule','amortizationModule','hardwareModule','consultantsModule',
         'consultantPanelModule','aboutModule','legalModule','messagesModule','investorModule',
         'campaignsModule','billAnalyzerModule','projectsModule','servicesModule','quoteModule',
         'dashboardModule','batteryModule','documentsModule']
            .forEach(id => document.getElementById(id)?.classList.add('hidden'));
        document.getElementById('supplierPanelModule')?.classList.remove('hidden');

        const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.textContent = v; };
        set('userNameDisplay', sup.company_name || 'Tedarikçi');
        set('userCompanyDisplay', 'Tedarikçi');
        if (email) set('userEmailDisplay', email);
        set('userInitials', (sup.company_name || 'T').charAt(0).toUpperCase());
        document.getElementById('adminPanelCard')?.classList.add('hidden');

        S = sup; _email = email || ''; _view = 'menu';
        renderMenu();
    };

    async function reload() {
        if (!supabaseClient || !S) return;
        const { data } = await supabaseClient.from('suppliers').select('*').eq('id', S.id).maybeSingle();
        if (data) { S = data; window.currentSupplier = data; }
    }

    // -------------------------------------------------------------------- pano
    function statusBanner() {
        const d = DURUM[S.status] || DURUM.draft;
        const eksik = eksikAlanlar();
        if (S.status === 'approved') {
            return `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-5">
                <p class="font-black text-emerald-800 text-sm">✅ Profiliniz onaylı ve yayında</p>
                <p class="text-xs text-emerald-700 mt-1">Kurulumcu firmalar sizi tedarikçi dizininde görüyor ve talep gönderebiliyor.</p>
            </div>`;
        }
        if (S.status === 'pending') {
            return `<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
                <p class="font-black text-amber-800 text-sm">⏳ Profiliniz onay bekliyor</p>
                <p class="text-xs text-amber-700 mt-1">Kontrol tamamlanınca tedarikçi dizininde görünmeye başlayacaksınız.</p>
            </div>`;
        }
        if (S.status === 'rejected') {
            return `<div class="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
                <p class="font-black text-red-800 text-sm">✏️ Düzeltme istendi</p>
                ${S.reject_reason ? `<p class="text-xs text-red-700 mt-1">${esc(S.reject_reason)}</p>` : ''}
                <p class="text-xs text-red-700 mt-1">Profilinizi güncelleyip tekrar onaya gönderin.</p>
            </div>`;
        }
        return `<div class="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5">
            <p class="font-black text-slate-800 text-sm">📝 Profiliniz henüz yayında değil</p>
            <p class="text-xs text-slate-600 mt-1">${eksik.length
                ? 'Şu alanlar eksik: <strong>' + eksik.map(esc).join(', ') + '</strong>. Tamamlayıp onaya gönderin.'
                : 'Profiliniz hazır görünüyor — onaya gönderebilirsiniz.'}</p>
        </div>`;
    }

    function eksikAlanlar() {
        const e = [];
        if (!S.company_name) e.push('Firma ünvanı');
        if (!S.about || S.about.length < 30) e.push('Tanıtım (en az 30 karakter)');
        if (!(S.categories || []).length) e.push('Ürün kategorileri');
        if (!S.city) e.push('Şehir');
        if (!S.phone) e.push('Telefon');
        return e;
    }

    function kart(icon, baslik, aciklama, fn, rozet) {
        return `<button onclick="${fn}" class="bg-white border border-slate-200 rounded-2xl p-5 text-left hover:shadow-lg hover:border-sky-300 transition w-full relative">
            ${rozet ? `<span class="absolute top-4 right-4 bg-sky-100 text-sky-800 text-[10px] font-black px-2 py-0.5 rounded-full">${esc(rozet)}</span>` : ''}
            <div class="text-3xl mb-2">${icon}</div>
            <h3 class="font-black text-slate-800 mb-1">${esc(baslik)}</h3>
            <p class="text-xs text-slate-500 leading-relaxed">${esc(aciklama)}</p>
        </button>`;
    }

    async function renderMenu() {
        _view = 'menu';
        const el = root(); if (!el) return;
        const d = DURUM[S.status] || DURUM.draft;

        // Rozet sayıları (tablo yoksa sessizce 0)
        let urun = 0, ilan = 0, talep = 0;
        try {
            const [p, a, r] = await Promise.all([
                supabaseClient.from('supplier_products').select('id', { count: 'exact', head: true }).eq('supplier_id', S.id),
                supabaseClient.from('supplier_dealer_ads').select('id', { count: 'exact', head: true }).eq('supplier_id', S.id),
                supabaseClient.from('supplier_requests').select('id', { count: 'exact', head: true }).eq('supplier_id', S.id).eq('status', 'open')
            ]);
            urun = p.count || 0; ilan = a.count || 0; talep = r.count || 0;
        } catch (e) { /* tablolar yoksa 0 kalir */ }

        el.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-2xl p-6 mb-5">
                <div class="flex items-start justify-between gap-3 flex-wrap mb-2">
                    <div>
                        <h2 class="text-2xl font-black text-slate-800">${esc(S.company_name || 'Tedarikçi')}</h2>
                        <p class="text-sm text-slate-500">${esc(_email)}</p>
                    </div>
                    <span class="text-[11px] font-black px-3 py-1 rounded-full ${d.css}">${d.t}</span>
                </div>
                ${(S.brands || []).length ? `<p class="text-xs text-slate-500 mt-2">Markalar: <strong class="text-slate-700">${(S.brands || []).map(esc).join(' · ')}</strong></p>` : ''}
            </div>

            ${statusBanner()}

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${kart('🏢', 'Firma Profili', 'Marka, kategori ve bölge bilgileriniz. Onaya buradan gönderilir.', "supplierOpen('profil')")}
                ${kart('📦', 'Ürün Kataloğu', 'Ürünlerinizi teknik değerleri ve kaynağıyla ekleyin.', "supplierOpen('katalog')", urun ? urun + ' ürün' : null)}
                ${kart('🤝', 'Bayi İlanları', 'Hangi illerde bayi veya yetkili kurulumcu arıyorsunuz?', "supplierOpen('ilan')", ilan ? ilan + ' ilan' : null)}
                ${kart('📨', 'Gelen Talepler', 'Kurulumcu firmalardan gelen fiyat ve stok talepleri.', "supplierOpen('talep')", talep ? talep + ' açık' : null)}
            </div>`;
    }

    window.supplierOpen = function (v) {
        if (v === 'profil') return renderProfil();
        if (v === 'katalog') return renderKatalog();
        if (v === 'ilan') return renderIlan();
        if (v === 'talep') return renderTalep();
        return renderMenu();
    };
    window.supplierBack = () => renderMenu();

    function baslik(t, alt) {
        return `<div class="flex items-center gap-3 mb-5">
            <button onclick="supplierBack()" class="text-slate-500 hover:text-sky-600 font-bold text-sm">← Panele dön</button>
            <span class="text-slate-300">|</span>
            <div><h2 class="font-black text-slate-800">${esc(t)}</h2>
            ${alt ? `<p class="text-xs text-slate-500">${esc(alt)}</p>` : ''}</div>
        </div>`;
    }

    // ---------------------------------------------------------------- profil
    function renderProfil() {
        _view = 'profil';
        const el = root(); if (!el) return;
        const kats = KATEGORILER.map(k => {
            const on = (S.categories || []).includes(k);
            return `<label class="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer">
                <input type="checkbox" class="supKat w-4 h-4 rounded" value="${esc(k)}" ${on ? 'checked' : ''}> ${esc(k)}</label>`;
        }).join('');

        el.innerHTML = baslik('Firma Profili', 'Onaydan sonra kurulumcu dizininde bu bilgiler görünür') + `
            <div class="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1.5">Firma Ünvanı *</label>
                        <input id="supCompany" class="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value="${esc(S.company_name)}"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1.5">Yetkili Ad Soyad</label>
                        <input id="supFullName" class="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value="${esc(S.full_name)}"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1.5">Telefon *</label>
                        <input id="supPhone" class="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value="${esc(S.phone)}"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1.5">Şehir *</label>
                        <input id="supCity" class="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value="${esc(S.city)}"></div>
                    <div class="md:col-span-2"><label class="block text-xs font-bold text-slate-600 mb-1.5">Web sitesi</label>
                        <input id="supWebsite" type="url" placeholder="https://..." class="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value="${esc(S.website)}"></div>
                </div>

                <div><label class="block text-xs font-bold text-slate-600 mb-1.5">Tanıtım * <span class="font-normal text-slate-400">(kurulumcu firmalar bunu okuyacak)</span></label>
                    <textarea id="supAbout" rows="4" class="w-full p-2.5 border border-slate-300 rounded-lg text-sm">${esc(S.about)}</textarea></div>

                <div><label class="block text-xs font-bold text-slate-600 mb-1.5">Ürün kategorileri *</label>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">${kats}</div></div>

                <div><label class="block text-xs font-bold text-slate-600 mb-1.5">Temsil ettiğiniz markalar <span class="font-normal text-slate-400">(virgülle ayırın)</span></label>
                    <input id="supBrands" class="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value="${esc((S.brands || []).join(', '))}"></div>

                <div class="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-100">
                    <button onclick="supplierSaveProfile(false)" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl">Kaydet</button>
                    <button onclick="supplierSaveProfile(true)" class="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-black py-3 rounded-xl">Kaydet ve Onaya Gönder</button>
                </div>
                <p class="text-[11px] text-slate-400">Onaya gönderdikten sonra profil kontrol edilir. Onaylanana kadar tedarikçi dizininde görünmezsiniz.</p>
            </div>`;
    }

    window.supplierSaveProfile = async function (submit) {
        if (!supabaseClient || !S) return;
        const g = (id) => (document.getElementById(id)?.value || '').trim();
        const kats = [...document.querySelectorAll('.supKat:checked')].map(c => c.value);
        const data = {
            company_name: g('supCompany'),
            full_name: g('supFullName') || null,
            phone: g('supPhone') || null,
            city: g('supCity') || null,
            website: g('supWebsite') || null,
            about: g('supAbout') || null,
            categories: kats,
            brands: g('supBrands').split(',').map(x => x.trim()).filter(Boolean)
        };
        if (!data.company_name) { alert('Firma ünvanı gerekli.'); return; }

        const { error } = await supabaseClient.from('suppliers').update(data).eq('id', S.id);
        if (error) { alert('Kaydedilemedi: ' + error.message); return; }
        Object.assign(S, data);

        if (submit) {
            const eksik = eksikAlanlar();
            if (eksik.length) { alert('Onaya göndermeden önce şunları tamamlayın:\n\n• ' + eksik.join('\n• ')); return; }
            const { error: rpcErr } = await supabaseClient.rpc('supplier_submit_for_review');
            if (rpcErr) { alert('Onaya gönderilemedi: ' + rpcErr.message); return; }
            await reload();
            alert('✅ Profiliniz onaya gönderildi.');
        } else {
            alert('Kaydedildi.');
        }
        renderMenu();
    };

    // --------------------------------------------------------------- katalog
    async function renderKatalog() {
        _view = 'katalog';
        const el = root(); if (!el) return;
        el.innerHTML = baslik('Ürün Kataloğu', 'Onaylanan ürünler donanım karşılaştırma tablosunda yayınlanır')
            + '<p class="text-sm text-slate-400">Yükleniyor...</p>';

        const [cats, prods] = await Promise.all([
            supabaseClient.from('hardware_categories').select('*').order('sort_order'),
            supabaseClient.from('supplier_products').select('*').eq('supplier_id', S.id).order('created_at', { ascending: false })
        ]);
        if (prods.error) {
            el.innerHTML = baslik('Ürün Kataloğu') + `<p class="text-sm text-red-500">Yüklenemedi: ${esc(prods.error.message)}</p>`;
            return;
        }
        window.__supCats = cats.data || [];
        const rows = prods.data || [];

        const durumRozet = (st) => ({
            pending:  '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Onay bekliyor</span>',
            approved: '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Yayında</span>',
            rejected: '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">Düzeltme istendi</span>'
        })[st] || '';

        el.innerHTML = baslik('Ürün Kataloğu', 'Onaylanan ürünler donanım karşılaştırma tablosunda yayınlanır') + `
            <div class="flex justify-end mb-3">
                <button onclick="supplierNewProduct()" class="bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold px-4 py-2 rounded-lg">+ Ürün Ekle</button>
            </div>
            <div class="space-y-2">
                ${rows.map(r => {
                    const cat = (window.__supCats || []).find(c => c.key === r.category_key);
                    return `<div class="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <strong class="text-sm text-slate-800">${esc(r.name)}</strong>
                                ${durumRozet(r.status)}
                                ${r.source_url ? '' : '<span class="text-[10px] font-bold text-red-500">kaynak yok</span>'}
                            </div>
                            <p class="text-[11px] text-slate-400 mt-0.5">${esc(cat ? cat.label : r.category_key)} · ${esc((r.cells || []).filter(Boolean).join(' · ')).slice(0, 90)}</p>
                            ${r.status === 'rejected' && r.reject_reason ? `<p class="text-[11px] text-red-600 mt-1">${esc(r.reject_reason)}</p>` : ''}
                        </div>
                        <span class="flex gap-1 flex-shrink-0">
                            <button onclick="supplierEditProduct('${r.id}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Düzenle</button>
                            <button onclick="supplierDeleteProduct('${r.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Sil</button>
                        </span>
                    </div>`;
                }).join('') || '<p class="text-sm text-slate-400 italic">Henüz ürün eklemediniz.</p>'}
            </div>`;
        window.__supProds = rows;
    }

    function supModal(inner) {
        const ex = document.getElementById('supModal'); if (ex) ex.remove();
        const m = document.createElement('div');
        m.id = 'supModal';
        m.className = 'fixed inset-0 z-[80] bg-slate-900/60 flex items-center justify-center p-4';
        m.innerHTML = `<div class="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">${inner}</div>`;
        document.body.appendChild(m);
    }
    window.supplierCloseModal = () => document.getElementById('supModal')?.remove();

    window.supplierNewProduct = () => openProductModal(null);
    window.supplierEditProduct = (id) => openProductModal((window.__supProds || []).find(p => p.id === id));

    function openProductModal(p) {
        const cats = window.__supCats || [];
        if (!cats.length) { alert('Ürün kategorileri bulunamadı. hardware.sql çalıştırıldı mı?'); return; }
        const e = p || {};
        const secili = e.category_key || cats[0].key;
        const catOpts = cats.map(c => `<option value="${esc(c.key)}" ${c.key === secili ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
        supModal(`
            <h3 class="text-lg font-black text-slate-800 mb-4">${p ? 'Ürünü Düzenle' : 'Yeni Ürün'}</h3>
            <div class="space-y-3">
                <div><label class="text-xs font-bold text-slate-600">Kategori</label>
                    <select id="spCat" onchange="supplierRenderCells()" class="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white">${catOpts}</select></div>
                <div id="spCells" class="space-y-3"></div>
                <div><label class="text-xs font-bold text-slate-600">Kaynak bağlantısı (üretici kataloğu)</label>
                    <input id="spSource" type="url" placeholder="https://..." class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${esc(e.source_url)}">
                    <p class="text-[10px] text-slate-400 mt-1">Kaynağı olan ürünler onaydan çok daha hızlı geçer.</p></div>
                <div><label class="text-xs font-bold text-slate-600">Onaylayana not (opsiyonel)</label>
                    <textarea id="spNote" rows="2" class="w-full p-2 border border-slate-300 rounded-lg text-sm">${esc(e.note)}</textarea></div>
            </div>
            <div class="flex gap-2 mt-5">
                <button onclick="supplierCloseModal()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">İptal</button>
                <button onclick="supplierSaveProduct('${p ? p.id : ''}')" class="flex-1 bg-sky-600 text-white font-bold py-2 rounded-lg">Kaydet</button>
            </div>`);
        window.__spEditing = e;
        supplierRenderCells();
    }

    // Alanlar seçilen kategorinin sütun tanımından üretilir.
    window.supplierRenderCells = function () {
        const cats = window.__supCats || [];
        const key = document.getElementById('spCat')?.value;
        const cat = cats.find(c => c.key === key);
        const box = document.getElementById('spCells');
        if (!cat || !box) return;
        const e = window.__spEditing || {};
        const ayni = e.category_key === key;
        const cells = ayni && Array.isArray(e.cells) ? e.cells : [];
        const cols = Array.isArray(cat.cols) ? cat.cols : [];
        box.innerHTML = cols.map((c, i) => `
            <div><label class="text-xs font-bold text-slate-600">${esc(c)}${i === 0 ? ' <span class="text-red-500">*</span>' : ''}</label>
                <input id="spCell${i}" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${esc(cells[i])}"></div>`).join('');
        box.dataset.count = cols.length;
    };

    window.supplierSaveProduct = async function (id) {
        const key = document.getElementById('spCat').value;
        const n = parseInt(document.getElementById('spCells').dataset.count, 10) || 0;
        const cells = [];
        for (let i = 0; i < n; i++) cells.push((document.getElementById('spCell' + i)?.value || '').trim());
        if (!cells[0]) { alert('İlk alan (marka/model) gerekli.'); return; }
        const base = {
            supplier_id: S.id,
            category_key: key,
            name: cells[0],
            cells,
            source_url: (document.getElementById('spSource').value || '').trim() || null,
            note: (document.getElementById('spNote').value || '').trim() || null,
            status: 'pending',        // her düzenleme yeniden onaya girer
            reject_reason: null
        };
        const { error } = id
            ? await supabaseClient.from('supplier_products').update(base).eq('id', id)
            : await supabaseClient.from('supplier_products').insert([base]);
        if (error) { alert('Kaydedilemedi: ' + error.message); return; }
        supplierCloseModal(); renderKatalog();
    };

    window.supplierDeleteProduct = async function (id) {
        if (!confirm('Bu ürün silinecek. Karşılaştırma tablosunda yayındaysa oradan da kaldırılır. Emin misiniz?')) return;
        const { error } = await supabaseClient.from('supplier_products').delete().eq('id', id);
        if (error) { alert('Silinemedi: ' + error.message); return; }
        renderKatalog();
    };

    // ------------------------------------------------------------ bayi ilanı
    async function renderIlan() {
        _view = 'ilan';
        const el = root(); if (!el) return;
        const { data, error } = await supabaseClient.from('supplier_dealer_ads')
            .select('*').eq('supplier_id', S.id).order('created_at', { ascending: false });
        if (error) { el.innerHTML = baslik('Bayi İlanları') + `<p class="text-sm text-red-500">Yüklenemedi: ${esc(error.message)}</p>`; return; }
        window.__supAds = data || [];

        el.innerHTML = baslik('Bayi İlanları', 'Kurulumcu firmalar bu ilanları görür') + `
            <div class="flex justify-end mb-3">
                <button onclick="supplierNewAd()" class="bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold px-4 py-2 rounded-lg">+ İlan Ver</button>
            </div>
            <div class="space-y-2">
                ${(data || []).map(a => `
                    <div class="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <strong class="text-sm text-slate-800">${esc(a.title)}</strong>
                            <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${a.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : a.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}">${a.status === 'approved' ? 'Yayında' : a.status === 'rejected' ? 'Reddedildi' : 'Onay bekliyor'}</span>
                            <p class="text-[11px] text-slate-400 mt-0.5">${esc((a.cities || []).join(', ')) || 'İl belirtilmemiş'}</p>
                        </div>
                        <button onclick="supplierDeleteAd('${a.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded flex-shrink-0">Sil</button>
                    </div>`).join('') || '<p class="text-sm text-slate-400 italic">Henüz ilan vermediniz.</p>'}
            </div>`;
    }

    window.supplierNewAd = function () {
        supModal(`
            <h3 class="text-lg font-black text-slate-800 mb-4">Bayi / Kurulumcu İlanı</h3>
            <div class="space-y-3">
                <div><label class="text-xs font-bold text-slate-600">Başlık *</label>
                    <input id="adTitle" placeholder="Örn: Ege Bölgesi'nde yetkili kurulumcu arıyoruz" class="w-full p-2 border border-slate-300 rounded-lg text-sm"></div>
                <div><label class="text-xs font-bold text-slate-600">Açıklama</label>
                    <textarea id="adBody" rows="4" class="w-full p-2 border border-slate-300 rounded-lg text-sm"></textarea></div>
                <div><label class="text-xs font-bold text-slate-600">İller <span class="font-normal text-slate-400">(virgülle ayırın)</span></label>
                    <input id="adCities" placeholder="İzmir, Manisa, Aydın" class="w-full p-2 border border-slate-300 rounded-lg text-sm"></div>
            </div>
            <div class="flex gap-2 mt-5">
                <button onclick="supplierCloseModal()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">İptal</button>
                <button onclick="supplierSaveAd()" class="flex-1 bg-sky-600 text-white font-bold py-2 rounded-lg">Onaya Gönder</button>
            </div>`);
    };

    window.supplierSaveAd = async function () {
        const title = (document.getElementById('adTitle').value || '').trim();
        if (!title) { alert('Başlık gerekli.'); return; }
        const { error } = await supabaseClient.from('supplier_dealer_ads').insert([{
            supplier_id: S.id,
            title,
            body: (document.getElementById('adBody').value || '').trim() || null,
            cities: (document.getElementById('adCities').value || '').split(',').map(x => x.trim()).filter(Boolean),
            status: 'pending'
        }]);
        if (error) { alert('Kaydedilemedi: ' + error.message); return; }
        supplierCloseModal(); renderIlan();
    };

    window.supplierDeleteAd = async function (id) {
        if (!confirm('Bu ilan silinecek. Emin misiniz?')) return;
        const { error } = await supabaseClient.from('supplier_dealer_ads').delete().eq('id', id);
        if (error) { alert('Silinemedi: ' + error.message); return; }
        renderIlan();
    };

    // --------------------------------------------------------- gelen talepler
    async function renderTalep() {
        _view = 'talep';
        const el = root(); if (!el) return;
        const { data, error } = await supabaseClient.from('supplier_requests')
            .select('*').eq('supplier_id', S.id).order('created_at', { ascending: false });
        if (error) { el.innerHTML = baslik('Gelen Talepler') + `<p class="text-sm text-red-500">Yüklenemedi: ${esc(error.message)}</p>`; return; }
        window.__supReqs = data || [];

        el.innerHTML = baslik('Gelen Talepler', 'Kurulumcu firmalardan gelen fiyat ve stok talepleri') + `
            <div class="space-y-2">
                ${(data || []).map(r => `
                    <div class="bg-white border border-slate-200 rounded-xl p-4">
                        <div class="flex items-start justify-between gap-3 mb-1 flex-wrap">
                            <strong class="text-sm text-slate-800">${esc(r.subject)}</strong>
                            <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${r.status === 'answered' ? 'bg-emerald-100 text-emerald-800' : r.status === 'closed' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}">${r.status === 'answered' ? 'Yanıtlandı' : r.status === 'closed' ? 'Kapalı' : 'Açık'}</span>
                        </div>
                        ${r.body ? `<p class="text-xs text-slate-600 leading-relaxed">${esc(r.body)}</p>` : ''}
                        <p class="text-[11px] text-slate-400 mt-1">${new Date(r.created_at).toLocaleDateString('tr-TR')}</p>
                        ${r.answer ? `<div class="mt-2 bg-emerald-50 border border-emerald-100 rounded-lg p-3"><p class="text-[11px] font-bold text-emerald-800 mb-0.5">Yanıtınız</p><p class="text-xs text-emerald-900">${esc(r.answer)}</p></div>` : ''}
                        ${r.status === 'open' ? `<button onclick="supplierAnswer('${r.id}')" class="mt-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">Yanıtla</button>` : ''}
                    </div>`).join('') || `<div class="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
                        <div class="text-3xl mb-2">📭</div>
                        <p class="text-sm font-bold text-slate-700">Henüz talep yok</p>
                        <p class="text-xs text-slate-500 mt-1">Profiliniz onaylandığında kurulumcu firmalar sizi dizinde görüp talep göndermeye başlar.</p>
                    </div>`}
            </div>`;
    }

    window.supplierAnswer = function (id) {
        const r = (window.__supReqs || []).find(x => x.id === id);
        if (!r) return;
        supModal(`
            <h3 class="text-lg font-black text-slate-800 mb-1">Talebi Yanıtla</h3>
            <p class="text-xs text-slate-500 mb-4">${esc(r.subject)}</p>
            <textarea id="reqAnswer" rows="5" class="w-full p-2 border border-slate-300 rounded-lg text-sm" placeholder="Fiyat, stok durumu ve teslim süresi..."></textarea>
            <div class="flex gap-2 mt-5">
                <button onclick="supplierCloseModal()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">İptal</button>
                <button onclick="supplierSaveAnswer('${id}')" class="flex-1 bg-sky-600 text-white font-bold py-2 rounded-lg">Gönder</button>
            </div>`);
    };

    window.supplierSaveAnswer = async function (id) {
        const a = (document.getElementById('reqAnswer').value || '').trim();
        if (!a) { alert('Yanıt boş olamaz.'); return; }
        const { error } = await supabaseClient.from('supplier_requests')
            .update({ answer: a, status: 'answered', answered_at: new Date().toISOString() }).eq('id', id);
        if (error) { alert('Gönderilemedi: ' + error.message); return; }
        supplierCloseModal(); renderTalep();
    };
})();
