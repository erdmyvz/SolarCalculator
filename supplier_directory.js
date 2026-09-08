/* ============================================================================
   supplier_directory.js — TEDARİKÇİ DİZİNİ (kurulumcu firma ekranı)

   Tedarikçi rolünün kurulumcu tarafındaki karşılığı. suppliers.js tedarikçinin
   kendi panelidir; bu dosya kurulumcu firmanın gördüğü taraftır:
     · Tedarikçiler   — onaylı tedarikçiler, kategori ve il süzgeciyle
     · Ürün kataloğu  — tedarikçinin onaylanmış ürünleri
     · Fiyat/stok talebi — supplier_requests'e yazar, tedarikçi panelinden yanıtlar
     · Bayi ilanları  — onaylı bayi/yetkili kurulumcu ilanları
     · Taleplerim     — firmanın açtığı talepler ve gelen yanıtlar

   RLS gereği yalnız ONAYLI tedarikçi ve içerik görünür; talep açabilmek için
   kullanıcının bir kurulumcu firmaya bağlı olması gerekir (profiles.company_id).
   tedarikci.sql çalıştırılmış olmalıdır.
   index.html'de suppliers.js'ten SONRA yüklenir.
   ============================================================================ */
(function () {
    'use strict';

    const root = () => document.getElementById('supplierDirRoot');
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    let _sups = [], _prods = [], _ads = [], _reqs = [];
    let _tab = 'dizin';
    let _fKat = '', _fIl = '';

    const companyId = () => (window.currentUserProfile && window.currentUserProfile.company_id) || null;

    // ------------------------------------------------------------ modül girişi
    window.showSupplierDirectory = function () {
        document.getElementById('mainMenu')?.classList.add('hidden');
        ['crmModule','adminModule','companyManagementModule','techSupportModule','salesAssistantModule',
         'dashboardModule','projectsModule','servicesModule','educationModule','regulationsModule',
         'quoteModule','messagesModule','supplierPanelModule']
            .forEach(id => document.getElementById(id)?.classList.add('hidden'));
        document.getElementById('supplierDirModule')?.classList.remove('hidden');
        _tab = 'dizin';
        load();
    };
    document.getElementById('btnGoSuppliers')?.addEventListener('click', () => showSupplierDirectory());
    document.getElementById('btnBackFromSuppliers')?.addEventListener('click', () => {
        if (typeof closeAllAndShowMenu === 'function') closeAllAndShowMenu();
    });

    async function load() {
        const el = root(); if (!el || !supabaseClient) return;
        el.innerHTML = '<p class="text-sm text-slate-400">Tedarikçiler yükleniyor...</p>';

        const [sup, prod, ads, reqs] = await Promise.all([
            supabaseClient.from('suppliers').select('*').eq('status', 'approved').eq('banned', false).order('company_name'),
            supabaseClient.from('supplier_products').select('*').eq('status', 'approved'),
            supabaseClient.from('supplier_dealer_ads').select('*').eq('status', 'approved').order('created_at', { ascending: false }),
            companyId()
                ? supabaseClient.from('supplier_requests').select('*').eq('company_id', companyId()).order('created_at', { ascending: false })
                : Promise.resolve({ data: [], error: null })
        ]);

        if (sup.error) {
            el.innerHTML = `<div class="bg-white border border-slate-200 rounded-xl p-6">
                <p class="text-sm text-red-500">Yüklenemedi: ${esc(sup.error.message)}</p>
                <p class="text-xs text-slate-400 mt-1">tedarikci.sql çalıştırıldı mı?</p></div>`;
            return;
        }
        _sups = sup.data || []; _prods = prod.data || []; _ads = ads.data || []; _reqs = reqs.data || [];
        render();
    }

    // -------------------------------------------------------------- görünüm
    function sekmeler() {
        const t = (k, ad, n) => `<button onclick="supDirTab('${k}')" class="px-4 py-2 rounded-lg text-sm font-bold transition ${
            _tab === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
        }">${esc(ad)}${n ? ` <span class="opacity-70">(${n})</span>` : ''}</button>`;
        return `<div class="flex flex-wrap gap-2 mb-5">
            ${t('dizin', 'Tedarikçiler', _sups.length)}
            ${t('ilan', 'Bayi İlanları', _ads.length)}
            ${t('talep', 'Taleplerim', _reqs.length)}
        </div>`;
    }

    window.supDirTab = function (k) { _tab = k; render(); };

    function suzgec() {
        const kats = [...new Set(_sups.flatMap(s => s.categories || []))].sort();
        const iller = [...new Set(_sups.map(s => s.city).filter(Boolean))].sort();
        const opt = (v, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(v)}</option>`;
        return `<div class="flex flex-wrap gap-2 mb-4">
            <select onchange="supDirFilter('kat', this.value)" class="p-2 border border-slate-300 rounded-lg text-sm bg-white">
                <option value="">Tüm kategoriler</option>${kats.map(k => opt(k, _fKat)).join('')}
            </select>
            <select onchange="supDirFilter('il', this.value)" class="p-2 border border-slate-300 rounded-lg text-sm bg-white">
                <option value="">Tüm iller</option>${iller.map(i => opt(i, _fIl)).join('')}
            </select>
            ${(_fKat || _fIl) ? '<button onclick="supDirFilter(\'sifirla\')" class="text-xs font-bold text-slate-500 hover:text-slate-800 px-2">Süzgeci temizle</button>' : ''}
        </div>`;
    }

    window.supDirFilter = function (tip, v) {
        if (tip === 'kat') _fKat = v;
        else if (tip === 'il') _fIl = v;
        else { _fKat = ''; _fIl = ''; }
        render();
    };

    function suzulmus() {
        return _sups.filter(s =>
            (!_fKat || (s.categories || []).includes(_fKat)) &&
            (!_fIl || s.city === _fIl));
    }

    function tedarikciKarti(s) {
        const urunler = _prods.filter(p => p.supplier_id === s.id);
        return `
        <div class="bg-white border border-slate-200 rounded-2xl p-5">
            <div class="flex items-start justify-between gap-3 flex-wrap mb-2">
                <div class="min-w-0">
                    <h3 class="font-black text-slate-800">${esc(s.company_name)}</h3>
                    <p class="text-xs text-slate-400">${esc(s.city) || 'Şehir belirtilmemiş'}${s.website ? ` · <a href="${esc(s.website)}" target="_blank" rel="noopener nofollow" class="text-sky-700 font-bold">Web sitesi ↗</a>` : ''}</p>
                </div>
                <button onclick="supDirAskPrice('${s.id}')" class="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex-shrink-0">Fiyat / Stok Sor</button>
            </div>
            ${(s.categories || []).length ? `<div class="flex flex-wrap gap-1 mb-2">${(s.categories || []).map(k =>
                `<span class="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">${esc(k)}</span>`).join('')}</div>` : ''}
            ${s.about ? `<p class="text-xs text-slate-600 leading-relaxed mb-2">${esc(s.about)}</p>` : ''}
            ${(s.brands || []).length ? `<p class="text-[11px] text-slate-500 mb-2">Markalar: <strong class="text-slate-700">${(s.brands || []).map(esc).join(' · ')}</strong></p>` : ''}
            ${urunler.length
                ? `<details class="mt-2">
                     <summary class="text-xs font-bold text-sky-700 cursor-pointer">${urunler.length} ürün · kataloğu gör</summary>
                     <div class="mt-2 space-y-1">
                        ${urunler.map(p => `<div class="text-[11px] text-slate-600 border-l-2 border-slate-200 pl-2">
                            <strong class="text-slate-800">${esc(p.name)}</strong>
                            ${p.source_url ? `<a href="${esc(p.source_url)}" target="_blank" rel="noopener nofollow" class="text-emerald-700 font-bold ml-1">Katalog ↗</a>` : ''}
                            <div class="text-slate-400">${esc((p.cells || []).slice(1).filter(Boolean).join(' · '))}</div>
                        </div>`).join('')}
                     </div>
                   </details>`
                : '<p class="text-[11px] text-slate-400 italic">Bu tedarikçi henüz ürün yayınlamamış.</p>'}
        </div>`;
    }

    function ilanKarti(a) {
        const s = _sups.find(x => x.id === a.supplier_id);
        return `
        <div class="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 class="font-black text-slate-800 mb-1">${esc(a.title)}</h3>
            <p class="text-xs text-slate-400 mb-2">${esc(s ? s.company_name : 'Tedarikçi')}${(a.cities || []).length ? ' · ' + esc((a.cities || []).join(', ')) : ''}</p>
            ${a.body ? `<p class="text-xs text-slate-600 leading-relaxed mb-3">${esc(a.body)}</p>` : ''}
            ${s ? `<button onclick="supDirAskPrice('${s.id}', 'Bayilik başvurusu: ${esc(a.title)}')" class="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-3 py-2 rounded-lg">Bu ilana başvur</button>` : ''}
        </div>`;
    }

    function talepKarti(r) {
        const s = _sups.find(x => x.id === r.supplier_id);
        const rozet = r.status === 'answered'
            ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Yanıtlandı</span>'
            : r.status === 'closed'
            ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Kapalı</span>'
            : '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Yanıt bekliyor</span>';
        return `
        <div class="bg-white border border-slate-200 rounded-2xl p-5">
            <div class="flex items-start justify-between gap-2 flex-wrap mb-1">
                <strong class="text-sm text-slate-800">${esc(r.subject)}</strong> ${rozet}
            </div>
            <p class="text-[11px] text-slate-400 mb-2">${esc(s ? s.company_name : 'Tedarikçi')} · ${new Date(r.created_at).toLocaleDateString('tr-TR')}</p>
            ${r.body ? `<p class="text-xs text-slate-600 leading-relaxed">${esc(r.body)}</p>` : ''}
            ${r.answer
                ? `<div class="mt-3 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                     <p class="text-[11px] font-bold text-emerald-800 mb-0.5">Tedarikçi yanıtı</p>
                     <p class="text-xs text-emerald-900 leading-relaxed">${esc(r.answer)}</p>
                   </div>`
                : ''}
        </div>`;
    }

    function bosDurum(baslik, metin) {
        return `<div class="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
            <div class="text-3xl mb-2">📦</div>
            <p class="text-sm font-bold text-slate-700">${esc(baslik)}</p>
            <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">${esc(metin)}</p>
        </div>`;
    }

    function render() {
        const el = root(); if (!el) return;
        let govde = '';

        if (_tab === 'dizin') {
            const liste = suzulmus();
            govde = (_sups.length ? suzgec() : '') + (liste.length
                ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${liste.map(tedarikciKarti).join('')}</div>`
                : bosDurum(
                    _sups.length ? 'Süzgece uyan tedarikçi yok' : 'Henüz onaylı tedarikçi yok',
                    _sups.length ? 'Kategori veya il seçimini değiştirin.' : 'Tedarikçiler kaydolup profilleri onaylandıkça burada listelenecek.'));
        } else if (_tab === 'ilan') {
            govde = _ads.length
                ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${_ads.map(ilanKarti).join('')}</div>`
                : bosDurum('Yayında bayi ilanı yok', 'Tedarikçiler bayi veya yetkili kurulumcu aradıklarında ilanları burada görünür.');
        } else {
            if (!companyId()) {
                govde = bosDurum('Firma kaydınız görünmüyor', 'Tedarikçilere talep gönderebilmek için hesabınızın bir kurulumcu firmaya bağlı olması gerekir.');
            } else {
                govde = _reqs.length
                    ? `<div class="space-y-3">${_reqs.map(talepKarti).join('')}</div>`
                    : bosDurum('Henüz talep göndermediniz', 'Tedarikçiler sekmesinden "Fiyat / Stok Sor" ile ilk talebinizi oluşturun.');
            }
        }

        el.innerHTML = sekmeler() + govde;
    }

    // ------------------------------------------------------------ talep açma
    function modal(inner) {
        const ex = document.getElementById('supDirModal'); if (ex) ex.remove();
        const m = document.createElement('div');
        m.id = 'supDirModal';
        m.className = 'fixed inset-0 z-[80] bg-slate-900/60 flex items-center justify-center p-4';
        m.innerHTML = `<div class="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">${inner}</div>`;
        document.body.appendChild(m);
    }
    window.supDirCloseModal = () => document.getElementById('supDirModal')?.remove();

    window.supDirAskPrice = function (supplierId, konu) {
        if (!companyId()) {
            alert('Talep gönderebilmek için hesabınızın bir kurulumcu firmaya bağlı olması gerekiyor.');
            return;
        }
        const s = _sups.find(x => x.id === supplierId);
        if (!s) return;
        modal(`
            <h3 class="text-lg font-black text-slate-800 mb-1">Fiyat / Stok Talebi</h3>
            <p class="text-xs text-slate-500 mb-4">${esc(s.company_name)}</p>
            <div class="space-y-3">
                <div><label class="text-xs font-bold text-slate-600">Konu *</label>
                    <input id="sdSubject" class="w-full p-2 border border-slate-300 rounded-lg text-sm"
                           placeholder="Örn: 20 adet 590Wp panel fiyat talebi" value="${esc(konu || '')}"></div>
                <div><label class="text-xs font-bold text-slate-600">Detay</label>
                    <textarea id="sdBody" rows="5" class="w-full p-2 border border-slate-300 rounded-lg text-sm"
                              placeholder="Ürün, adet, teslim yeri ve termin bilginizi yazın."></textarea></div>
            </div>
            <div class="flex gap-2 mt-5">
                <button onclick="supDirCloseModal()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">İptal</button>
                <button onclick="supDirSendRequest('${supplierId}')" class="flex-1 bg-sky-600 text-white font-bold py-2 rounded-lg">Gönder</button>
            </div>`);
    };

    window.supDirSendRequest = async function (supplierId) {
        const subject = (document.getElementById('sdSubject').value || '').trim();
        if (!subject) { alert('Konu gerekli.'); return; }
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) { alert('Oturum bulunamadı.'); return; }

        const { error } = await supabaseClient.from('supplier_requests').insert([{
            supplier_id: supplierId,
            company_id: companyId(),
            created_by: session.user.id,
            subject,
            body: (document.getElementById('sdBody').value || '').trim() || null,
            status: 'open'
        }]);
        if (error) { alert('Gönderilemedi: ' + error.message); return; }
        supDirCloseModal();
        alert('✅ Talebiniz iletildi. Yanıt geldiğinde "Taleplerim" sekmesinde görünecek.');
        _tab = 'talep';
        load();
    };
})();
