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

    // ÇİZİM JETONU — geciken ekranın yenisinin üstüne yazmasını engeller.
    //
    // Menüden bir karta basınca iki şey aynı anda oluyordu:
    //   1) supplierGoto ilgili ekranı çiziyor (örn. renderProfil)
    //   2) adres değiştiği için hashchange → yönlendirici → showSupplierPanel
    //      → renderMenu()
    // renderMenu async: dört sayaç sorgusunu BEKLEYİP sonra innerHTML yazıyor.
    // Sonuç: ekran açılıyor, ~1 sn sonra menü üstüne biniyordu. Adres doğru
    // ekranı gösteriyor, kullanıcı menüde kalıyordu. İkinci tıklamada adres
    // değişmediği için hashchange olmuyor ve ekran açılıyordu — "bir basışta
    // olmuyor, iki basışta oluyor" şikâyetinin kaynağı buydu.
    //
    // Her çizim isteği sıra numarası alır; beklemeden dönen istek kendi
    // numarası hâlâ güncel mi diye bakar, değilse yazmadan çıkar.
    let _cizim = 0;
    const jetonAl    = (v) => { _view = v; return ++_cizim; };
    const jetonGecti = (j) => j !== _cizim;   // true → araya yeni ekran girdi

    const KATEGORILER = ['Panel', 'İnverter', 'Batarya', 'Montaj Malzemesi', 'Kablo & Pano', 'Şarj İstasyonu', 'Diğer'];

    const DURUM = {
        draft:    { t: 'Taslak',            css: 'bg-slate-100 text-slate-700' },
        pending:  { t: 'Onay Bekliyor',     css: 'bg-amber-100 text-amber-800' },
        approved: { t: 'Onaylı · Yayında',  css: 'bg-emerald-100 text-emerald-800' },
        rejected: { t: 'Düzeltme İstendi',  css: 'bg-red-100 text-red-700' }
    };

    // Satır durumu rozeti — katalog ve stok ekranlarının ikisi de kullanıyor.
    const durumRozet = (st) => ({
        pending:  '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Onay bekliyor</span>',
        approved: '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Yayında</span>',
        rejected: '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">Düzeltme istendi</span>'
    })[st] || '';

    // ------------------------------------------------------------ panel girişi
    window.showSupplierPanel = function (sup, email) {
        document.getElementById('authContainer')?.classList.add('hidden');
        document.getElementById('landingContainer')?.classList.add('hidden');
        document.getElementById('gatewayContainer')?.classList.add('hidden');
        document.getElementById('appContainer')?.classList.remove('hidden');
        document.getElementById('mainMenu')?.classList.add('hidden');
        document.querySelector('#appContainer > div.w-full.max-w-7xl.mx-auto')?.classList.remove('hidden');

        ['supplierDirModule','crmModule','adminModule','calculatorModule','simulationModule','evCalcModule',
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

    // -----------------------------------------------------------------------
    // ⚠️ ŞEHİR SERBEST METİN OLAMAZ.
    // Tedarikçi dizini ili TAM DİZGİ olarak karşılaştırıyor. "İstanbul",
    // "istanbul" ve "Istanbul" üç ayrı il gibi davranıyor: süzgeç kutusunda üç
    // satır çıkıyor ve birini seçen kurulumcu diğer iki tedarikçiyi hiç
    // göremiyor. Kaynağı kapatmak için alan 81 illik listeden seçiliyor.
    //
    // Listede olmayan eski bir değer varsa SİLİNMİYOR; ayrı bir seçenek olarak
    // korunuyor ki tedarikçi kaydettiğinde verisi sessizce değişmesin.
    // -----------------------------------------------------------------------
    function ilSecici(id, deger) {
        const liste = Object.keys(window.EPC_IL_VERIM || {}).sort((a, b) => a.localeCompare(b, 'tr'));
        const mevcut = (deger || '').trim();
        const listede = liste.some(i => i === mevcut);
        return `<select id="${id}" class="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">— İl seçin —</option>
            ${(!listede && mevcut) ? `<option selected value="${esc(mevcut)}">${esc(mevcut)} (listede yok)</option>` : ''}
            ${liste.map(i => `<option ${i === mevcut ? 'selected' : ''}>${esc(i)}</option>`).join('')}
        </select>`;
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
        const _j = jetonAl('menu');
        const el = root(); if (!el) return;
        const d = DURUM[S.status] || DURUM.draft;

        // Rozet sayıları (tablo yoksa sessizce 0)
        let urun = 0, ilan = 0, talep = 0, stok = 0;
        try {
            const [p, a, r, k] = await Promise.all([
                supabaseClient.from('supplier_products').select('id', { count: 'exact', head: true }).eq('supplier_id', S.id),
                supabaseClient.from('supplier_dealer_ads').select('id', { count: 'exact', head: true }).eq('supplier_id', S.id),
                supabaseClient.from('supplier_requests').select('id', { count: 'exact', head: true }).eq('supplier_id', S.id).eq('status', 'open'),
                supabaseClient.from('supplier_stock').select('id', { count: 'exact', head: true }).eq('supplier_id', S.id).eq('is_active', true)
            ]);
            urun = p.count || 0; ilan = a.count || 0; talep = r.count || 0; stok = k.count || 0;
        } catch (e) { /* tablolar yoksa 0 kalir */ }
        // Sayaçlar gelene kadar kullanıcı bir karta basmış olabilir.
        if (jetonGecti(_j)) return;

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
                ${kart('🏷️', 'Stok & Fiyat', 'Hangi üründen NEREDE kaç adet var, fiyatı açık mı? Kurulumcular en yakın depoyu görür.', "supplierOpen('stok')", stok ? stok + ' kalem' : null)}
                ${kart('📨', 'Gelen Talepler', 'Kurulumcu firmalardan gelen fiyat ve stok talepleri.', "supplierOpen('talep')", talep ? talep + ' açık' : null)}
            </div>`;
    }

    // Tedarikçi panelinin dört ekranı da kendi adresinde:
    //   #tedarikci-panel/tedarikci-profil · /katalog · /ilanlarim · /gelen-talepler
    // Eskiden dördü de #app'ti: yenileyince menüye düşülüyordu.
    const SUP_SLUG = { profil: 'tedarikci-profil', katalog: 'katalog', ilan: 'ilanlarim', talep: 'gelen-talepler', stok: 'stok-fiyat' };

    window.supplierOpen = function (v) { return window.supplierGoto(v, false); };

    // _adrestenGeldi: yönlendirici çağırdıysa adrese dokunulmaz.
    window.supplierGoto = function (v, _adrestenGeldi) {
        if (SUP_SLUG[v] && window.epcAdresYaz) window.epcAdresYaz(SUP_SLUG[v], null, _adrestenGeldi);
        if (v === 'profil') return renderProfil();
        if (v === 'katalog') return renderKatalog();
        if (v === 'ilan') return renderIlan();
        if (v === 'talep') return renderTalep();
        if (v === 'stok') return renderStok();
        return renderMenu();
    };
    window.supplierBack = () => {
        if (window.epcPanelAdresi && window.location.hash !== window.epcPanelAdresi()) {
            window.__epcPanelHash = window.epcPanelAdresi();
            window.location.hash = window.__epcPanelHash;
        }
        renderMenu();
    };

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
        jetonAl('profil');
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
                        ${ilSecici('supCity', S.city)}</div>
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
            const { data: yeniDurum, error: rpcErr } = await supabaseClient.rpc('supplier_submit_for_review');
            if (rpcErr) { alert('Onaya gönderilemedi: ' + rpcErr.message); return; }
            await reload();
            // ⚠️ "Hata gelmedi" ile "oldu" aynı şey değil. Fonksiyon eskiden void
            // dönüyordu ve suppliers_guard tetikleyicisi güncellemeyi sessizce geri
            // alıyordu: ekran "✅ onaya gönderildi" diyor, kayıt 'draft' kalıyordu.
            // Artık oluşan durum hem dönüş değerinden hem tablodan doğrulanıyor.
            if (yeniDurum !== 'pending' && S.status !== 'pending') {
                alert('Onaya GÖNDERİLEMEDİ. Kaydınız "' + (DURUM[S.status] || DURUM.draft).t
                    + '" durumunda kaldı.\n\nBilgileriniz kaydedildi; lütfen tekrar deneyin.');
                renderMenu(); return;
            }
            alert('✅ Profiliniz onaya gönderildi.');
        } else {
            alert('Kaydedildi.');
        }
        renderMenu();
    };

    // --------------------------------------------------------------- katalog
    async function renderKatalog() {
        const _j = jetonAl('katalog');
        const el = root(); if (!el) return;
        el.innerHTML = baslik('Ürün Kataloğu', 'Onaylanan ürünler donanım karşılaştırma tablosunda yayınlanır')
            + '<p class="text-sm text-slate-400">Yükleniyor...</p>';

        const [cats, prods] = await Promise.all([
            supabaseClient.from('hardware_categories').select('*').order('sort_order'),
            supabaseClient.from('supplier_products').select('*').eq('supplier_id', S.id).order('created_at', { ascending: false })
        ]);
        if (jetonGecti(_j)) return;   // araya başka ekran girdi
        if (prods.error) {
            el.innerHTML = baslik('Ürün Kataloğu') + `<p class="text-sm text-red-500">Yüklenemedi: ${esc(prods.error.message)}</p>`;
            return;
        }
        window.__supCats = cats.data || [];
        const rows = prods.data || [];

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
        const _j = jetonAl('ilan');
        const el = root(); if (!el) return;
        const { data, error } = await supabaseClient.from('supplier_dealer_ads')
            .select('*').eq('supplier_id', S.id).order('created_at', { ascending: false });
        if (jetonGecti(_j)) return;   // araya başka ekran girdi
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
    // ⚠️ TALEBİ KİMİN GÖNDERDİĞİ YAZMIYORDU.
    // Kart yalnız konu, metin ve tarih gösteriyordu; company_id satırda duruyor
    // ama hiç çözülmüyordu. Tedarikçi fiyat verirken karşısındaki firmayı
    // görmüyor — hangi firma, nerede, daha önce ne istemiş bilmiyordu.
    // list_companies() zaten SECURITY DEFINER ve authenticated'a açık; firma
    // adını oradan çözüyoruz (companies tablosuna doğrudan erişim gerekmiyor).
    let _firmaHarita = null;
    async function firmalariYukle() {
        if (_firmaHarita) return _firmaHarita;
        _firmaHarita = new Map();
        try {
            const { data } = await supabaseClient.rpc('list_companies');
            (data || []).forEach(c => _firmaHarita.set(c.id, c));
        } catch (e) { /* çözülemezse kart "Kurulumcu firma" der, akış durmaz */ }
        return _firmaHarita;
    }
    function firmaEtiketi(companyId) {
        const f = _firmaHarita && _firmaHarita.get(companyId);
        if (!f) return 'Kurulumcu firma';
        const konum = [f.district, f.city].filter(Boolean).join(' / ');
        return f.name + (konum ? ' · ' + konum : '');
    }

    async function renderTalep() {
        const _j = jetonAl('talep');
        const el = root(); if (!el) return;
        const [{ data, error }] = await Promise.all([
            supabaseClient.from('supplier_requests')
                .select('*').eq('supplier_id', S.id).order('created_at', { ascending: false }),
            firmalariYukle()
        ]);
        if (jetonGecti(_j)) return;   // araya başka ekran girdi
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
                        <p class="text-[11px] font-bold text-sky-700 mb-1">🏢 ${esc(firmaEtiketi(r.company_id))}</p>
                        ${r.body ? `<p class="text-xs text-slate-600 leading-relaxed whitespace-pre-line">${esc(r.body)}</p>` : ''}
                        <p class="text-[11px] text-slate-400 mt-1">${new Date(r.created_at).toLocaleDateString('tr-TR')}</p>
                        ${r.answer ? `<div class="mt-2 bg-emerald-50 border border-emerald-100 rounded-lg p-3"><p class="text-[11px] font-bold text-emerald-800 mb-0.5">Yanıtınız</p><p class="text-xs text-emerald-900 whitespace-pre-line">${esc(r.answer)}</p></div>` : ''}
                        ${r.status === 'closed' ? '' : `<button onclick="supplierAnswer('${r.id}')" class="mt-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">${r.answer ? 'Yanıtı güncelle' : 'Yanıtla'}</button>`}
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
            <h3 class="text-lg font-black text-slate-800 mb-1">${r.answer ? 'Yanıtı Güncelle' : 'Talebi Yanıtla'}</h3>
            <p class="text-xs font-bold text-sky-700">🏢 ${esc(firmaEtiketi(r.company_id))}</p>
            <p class="text-xs text-slate-500 mb-3">${esc(r.subject)}</p>
            ${r.body ? `<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3"><p class="text-[11px] text-slate-600 whitespace-pre-line">${esc(r.body)}</p></div>` : ''}
            <textarea id="reqAnswer" rows="5" class="w-full p-2 border border-slate-300 rounded-lg text-sm" placeholder="Fiyat, stok durumu ve teslim süresi...">${esc(r.answer || '')}</textarea>
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
    // ======================================================== STOK & FİYAT
    // Kataloğun (teknik karşılaştırma) ticari karşılığı. Bir ürün birden çok
    // depoda bulunabildiği için her (ürün × konum) ayrı satırdır.
    //
    // FİYAT GÖRÜNÜRLÜĞÜ satır bazında sizin kararınız: açarsanız kurulumcu
    // firma fiyatı doğrudan görüp maliyetini anında hesaplar; kapatırsanız
    // "fiyat teklifi iste" düğmesi çıkar ve talep size düşer. Gizli fiyat
    // sunucuda saklanır, kurulumcunun tarayıcısına hiç gitmez.
    const STOK_KAT = [['panel','Güneş Paneli'],['inverter','İnverter'],['battery','Depolama'],
                      ['cable','Kablo ve Bağlantı'],['mounting','Konstrüksiyon']];
    const STOK_BIRIM = ['adet', 'metre', 'takım', 'kWh'];
    // EUR kuru sistemde tutulmadığı için iki para birimiyle sınırlı; uydurma
    // kurla hesaplanan bir maliyet tablosu kurulumcuyu yanıltırdı.
    const STOK_PARA = ['USD', 'TRY'];
    const STOK_BAZ = ['adet', 'Wp', 'metre', 'kWh'];
    let _stokAlan = {};

    async function stokAlanlariYukle() {
        if (Object.keys(_stokAlan).length) return;
        try {
            const { data } = await supabaseClient.from('stok_alanlari')
                .select('kategori,anahtar,etiket,birim,tip,secenek,sira').order('sira');
            (data || []).forEach(a => { (_stokAlan[a.kategori] = _stokAlan[a.kategori] || []).push(a); });
        } catch (e) { /* tablo yoksa teknik alanlar gösterilmez */ }
    }

    // -----------------------------------------------------------------------
    // VARSAYILAN DEPO
    // Tedarikçinin stoğu çoğunlukla tek noktadan çıkıyor. Her kalemde il/ilçe
    // sormak, yüz kalemlik bir listeyi girilemez hâle getiriyordu. Bir kez
    // seçiliyor, yeni satırlar otomatik alıyor; farklı depodan çıkan kalem
    // satır detayından değiştirilebiliyor.
    // -----------------------------------------------------------------------
    let _stokDepo = null;
    let _stokKirli = {};          // id -> satır içinde kaydedilmemiş değişiklik var

    function depoAnahtar() { return 'epcSupDepo_' + (S ? S.id : 'x'); }
    function depoOku() {
        // Önbellek hesaba bağlı: başka bir tedarikçi oturumu açılırsa
        // öncekinin deposu taşınmasın.
        if (_stokDepo && _stokDepo.__anahtar === depoAnahtar()) return _stokDepo;
        try {
            const h = JSON.parse(localStorage.getItem(depoAnahtar()) || 'null');
            if (h && h.city) { _stokDepo = { city: h.city, district: h.district || '', __anahtar: depoAnahtar() }; return _stokDepo; }
        } catch (e) { /* depo erişimi yoksa profildeki ile düşülür */ }
        _stokDepo = { city: (S && S.city) || '', district: '', __anahtar: depoAnahtar() };
        return _stokDepo;
    }
    window.supplierDepoKaydet = function () {
        const il = document.getElementById('depoIl')?.value || '';
        const ilce = (document.getElementById('depoIlce')?.value || '').trim();
        if (!il) { alert('Depo ili seçilmeden yeni kalem eklenemez.'); return; }
        _stokDepo = { city: il, district: ilce, __anahtar: depoAnahtar() };
        try { localStorage.setItem(depoAnahtar(), JSON.stringify(_stokDepo)); } catch (e) { }
        renderStok();
    };

    // -----------------------------------------------------------------------
    // YAPIŞTIRILAN SAYIYI OKU — ⚠️ NOKTA İKİ ANLAMA GELİYOR
    // Türkçe Excel binlik ayırıcı olarak nokta veriyor ("1.200" = bin iki yüz);
    // İngilizce yerelde aynı nokta ondalık ("1.5" = bir buçuk). Körlemesine
    // noktaları silmek "1.5 metre"yi 15 metre yapar — sessiz ve tehlikeli.
    // Kural:
    //   · virgül varsa → virgül ondalıktır, noktalar binliktir
    //   · virgül yoksa → nokta YALNIZCA tam binlik kalıbındaysa (1.200,
    //     12.000, 1.200.000) binliktir; değilse ondalıktır
    //
    // ⚠️ Binlik kalıbı SIFIRLA BAŞLAYAMAZ. Aksi hâlde panel fiyatı olan
    // "0.099" (USD/Wp) binlik sanılıp 99 oluyordu — teklifleri bin katına
    // çıkaran bir hata. Binlikte ilk grup her zaman 1-9 ile başlar.
    // -----------------------------------------------------------------------
    function sayiOku(ham) {
        let t = String(ham == null ? '' : ham).trim().replace(/\s/g, '');
        if (t === '') return null;
        if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
        else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
        const s = parseFloat(t);
        return isNaN(s) ? null : s;
    }

    const katAd = (k) => (STOK_KAT.find(x => x[0] === k) || [k, k])[1];
    const ilListesi = () => Object.keys(window.EPC_IL_VERIM || {}).sort((a, b) => a.localeCompare(b, 'tr'));
    const secKutu = (id, liste, deger, ekSinif) =>
        `<select id="${id}" class="${ekSinif || 'w-full border border-slate-300 p-2 rounded-lg text-sm bg-white'}">` +
        liste.map(x => `<option ${deger === x ? 'selected' : ''}>${esc(x)}</option>`).join('') + '</select>';

    // -----------------------------------------------------------------------
    // ⚠️ ONAY NEYİ KAPSAR — ÖNEMLİ KURAL
    // Onay, İLANIN KENDİSİ içindir: kategori, üretici, model, teknik değerler
    // ve kaynak belgesi. Bunlar değişirse satır yeniden onaya girer.
    //
    // MİKTAR ve FİYAT onay kapsamı DIŞINDADIR. Eskiden her kayıt satırı
    // 'pending' yapıyordu; tedarikçi günlük stok güncellemesi yaptığında satır
    // yayından düşüyor ve admin onaylayana kadar hiçbir kurulumcu göremiyordu.
    // Stok pazarının çalışabilmesi için rakamlar tedarikçinin kendi
    // sorumluluğunda, anında yayında.
    // -----------------------------------------------------------------------
    const KIMLIK_ALANLARI = ['category_key', 'brand', 'model', 'source_url'];
    function kimlikDegistiMi(eski, yeni) {
        if (!eski) return true;
        if (KIMLIK_ALANLARI.some(a => String(eski[a] == null ? '' : eski[a]) !== String(yeni[a] == null ? '' : yeni[a]))) return true;
        return JSON.stringify(eski.specs || {}) !== JSON.stringify(yeni.specs || {});
    }

    async function renderStok() {
        const _j = jetonAl('stok');
        const el = root(); if (!el) return;
        el.innerHTML = baslik('Stok & Fiyat', 'Yükleniyor…');
        await stokAlanlariYukle();

        let rows = [], hata = null;
        try {
            const { data, error } = await supabaseClient.from('supplier_stock')
                .select('*').eq('supplier_id', S.id).order('category_key').order('brand');
            if (error) throw error;
            rows = data || [];
        } catch (e) { hata = e.message || String(e); }
        if (jetonGecti(_j)) return;   // araya başka ekran girdi
        window.__supStok = rows;
        _stokKirli = {};

        const depo = depoOku();
        const iller = ilListesi();
        const yayinda = rows.filter(r => r.status === 'approved' && r.is_active && Number(r.quantity) > 0).length;
        const bekleyen = rows.filter(r => r.status === 'pending').length;

        el.innerHTML = baslik('Stok & Fiyat', 'Hangi üründen nerede kaç adet var; fiyatı açık mı, talebe mi bağlı.') +
            (hata ? `<div class="bg-red-50 border border-red-100 rounded-xl p-4 mb-3">
                <p class="text-sm font-bold text-red-700">${esc(hata)}</p>
                <p class="text-xs text-red-600 mt-1">stok-fiyatlandirma.sql çalıştırıldı mı?</p></div>` : '') + `

            <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="bg-white border border-slate-200 rounded-xl p-3 text-center">
                    <div class="text-2xl font-black text-slate-800">${rows.length}</div>
                    <div class="text-[11px] text-slate-500">kalem</div></div>
                <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                    <div class="text-2xl font-black text-emerald-700">${yayinda}</div>
                    <div class="text-[11px] text-emerald-700">kurulumcuya görünen</div></div>
                <div class="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                    <div class="text-2xl font-black text-amber-700">${bekleyen}</div>
                    <div class="text-[11px] text-amber-700">onay bekleyen</div></div>
            </div>

            <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
                <div class="flex items-end gap-2 flex-wrap">
                    <div>
                        <label class="block text-[11px] font-bold text-slate-600 mb-1">📍 Varsayılan depo — il *</label>
                        <select id="depoIl" class="border border-slate-300 p-2 rounded-lg text-sm bg-white w-44">
                            <option value="">— Seçin —</option>
                            ${iller.map(i => `<option ${depo.city === i ? 'selected' : ''}>${esc(i)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-[11px] font-bold text-slate-600 mb-1">İlçe</label>
                        <input id="depoIlce" value="${esc(depo.district || '')}" class="border border-slate-300 p-2 rounded-lg text-sm w-40">
                    </div>
                    <button onclick="supplierDepoKaydet()" class="bg-slate-700 hover:bg-slate-800 text-white font-bold px-3 py-2 rounded-lg text-sm">Depoyu kaydet</button>
                </div>
                <p class="text-[11px] text-slate-500 mt-2">Kurulumcu firmalar stok listesini önce yakınlığa göre görür — aynı ilçe, aynı il, aynı bölge. Yeni eklediğiniz kalemler bu depoyu otomatik alır.</p>
            </div>

            ${depo.city ? hizliEkleKutusu(depo) : `
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p class="text-sm font-bold text-amber-800">Önce depo ilinizi seçin</p>
                <p class="text-xs text-amber-700 mt-1">Stok kaleminin hangi ilden çıkacağı bu modülün asıl bilgisi; il seçilmeden kalem eklenemez.</p>
            </div>`}

            <div class="flex justify-between items-center mb-2 flex-wrap gap-2">
                <p class="text-[11px] text-slate-400">Miktar ve fiyat değişiklikleri <strong>anında yayında</strong>. Üretici, model veya teknik değer değişirse satır yeniden onaya girer.</p>
                <button onclick="supplierNewStok()" class="text-xs bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold px-3 py-1.5 rounded-lg">+ Detaylı ekle</button>
            </div>
            <div id="stokListe" class="space-y-2">${stokListeHtml(rows)}</div>`;
    }

    function hizliEkleKutusu(depo) {
        return `<div class="bg-white border-2 border-sky-200 rounded-xl p-4 mb-4">
            <div class="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <p class="text-sm font-black text-slate-800">⚡ Hızlı ekle</p>
                <span class="text-[11px] text-slate-500">📍 ${esc([depo.district, depo.city].filter(Boolean).join(' / '))}</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
                <div class="col-span-2 md:col-span-1">
                    <label class="block text-[11px] font-bold text-slate-600 mb-1">Kategori</label>
                    <select id="hzCat" class="w-full border border-slate-300 p-2 rounded-lg text-sm bg-white">
                        ${STOK_KAT.map(([k, a]) => `<option value="${k}">${esc(a)}</option>`).join('')}
                    </select>
                </div>
                <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Üretici *</label>
                    <input id="hzBrand" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Model *</label>
                    <input id="hzModel" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Miktar</label>
                    <input id="hzQty" type="number" step="any" value="0" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Birim</label>
                    ${secKutu('hzUnit', STOK_BIRIM, 'adet')}</div>
                <div><button onclick="supplierHizliEkle()" class="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2 rounded-lg text-sm">+ Ekle</button></div>
            </div>

            <div class="mt-3 pt-3 border-t border-slate-100">
                <label class="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" id="hzVis" onchange="supplierHizliFiyatAc()" class="mt-0.5">
                    <span>
                        <span class="text-sm font-bold text-slate-800">Fiyatı kurulumcu firmalara açık göster</span>
                        <span class="block text-[11px] text-slate-500">Kapalıyken kurulumcu "fiyat teklifi iste" düğmesi görür, talep size düşer.</span>
                    </span>
                </label>
                <div id="hzFiyatAlan" class="hidden grid grid-cols-3 gap-2 mt-2 max-w-md">
                    <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Birim fiyat</label>
                        <input id="hzPrice" type="number" step="any" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                    <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Para</label>${secKutu('hzCur', STOK_PARA, 'USD')}</div>
                    <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Başına</label>${secKutu('hzBasis', STOK_BAZ, 'adet')}</div>
                </div>
            </div>
            <div id="hzMsg" class="mt-2"></div>

            <details class="mt-3 pt-3 border-t border-slate-100">
                <summary class="text-xs font-bold text-slate-600 cursor-pointer">📋 Excel'den toplu yapıştır</summary>
                <p class="text-[11px] text-slate-500 mt-2">Excel'de <strong>Üretici · Model · Miktar · Fiyat</strong> sütunlarını seçip kopyalayın, aşağıya yapıştırın. Fiyat sütunu boş bırakılırsa o kalem "teklif üzerine" olur. Kategori, birim, para birimi ve depo yukarıdaki seçimlerden alınır.</p>
                <textarea id="hzToplu" rows="5" placeholder="Jinko&#9;Tiger Neo 580W&#9;240&#9;0.11&#10;Huawei&#9;SUN2000-50KTL&#9;6&#9;1850" class="w-full border border-slate-300 p-2 rounded-lg text-xs font-mono mt-2"></textarea>
                <button onclick="supplierTopluEkle()" class="mt-2 bg-slate-700 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-lg text-sm">Satırları ekle</button>
                <div id="hzTopluMsg" class="mt-2"></div>
            </details>
        </div>`;
    }

    window.supplierHizliFiyatAc = function () {
        const a = document.getElementById('hzFiyatAlan');
        if (a) a.classList.toggle('hidden', !document.getElementById('hzVis').checked);
    };

    function stokListeHtml(rows) {
        if (!rows.length) return '<p class="text-sm text-slate-400 italic">Henüz stok kalemi eklemediniz. Yukarıdaki hızlı ekle satırından başlayın.</p>';

        const ozet = (r) => (_stokAlan[r.category_key] || [])
            .map(a => (r.specs && r.specs[a.anahtar] != null && r.specs[a.anahtar] !== '')
                ? `${a.etiket}: ${r.specs[a.anahtar]}${a.birim ? ' ' + a.birim : ''}` : null)
            .filter(Boolean).join(' · ');

        return rows.map(r => {
            const konum = [r.district, r.city].filter(Boolean).join(' / ');
            const acik = !!r.price_visible;
            const gorunur = r.status === 'approved' && r.is_active && Number(r.quantity) > 0;
            return `<div class="bg-white border ${gorunur ? 'border-slate-200' : 'border-slate-200 bg-slate-50'} rounded-xl p-3">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                            <strong class="text-sm text-slate-800">${esc(r.brand)} ${esc(r.model)}</strong>
                            ${durumRozet(r.status)}
                            ${r.is_active ? '' : '<span class="text-[10px] font-bold text-slate-400">yayında değil</span>'}
                        </div>
                        <p class="text-[11px] text-slate-500 mt-0.5">${esc(katAd(r.category_key))} · 📍 ${esc(konum || 'konum girilmemiş')}${r.lead_time_days ? ' · ' + r.lead_time_days + ' gün termin' : ''}</p>
                        ${ozet(r) ? `<p class="text-[11px] text-slate-400 mt-0.5">${esc(ozet(r))}</p>` : ''}
                        ${r.status === 'rejected' && r.reject_reason ? `<p class="text-[11px] text-red-600 mt-1">${esc(r.reject_reason)}</p>` : ''}
                    </div>

                    <div class="flex items-end gap-2 flex-wrap">
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 mb-0.5">Miktar</label>
                            <div class="flex items-center gap-1">
                                <input id="q_${r.id}" type="number" step="any" value="${r.quantity != null ? r.quantity : 0}"
                                       oninput="supplierStokKirlet('${r.id}')" onkeydown="if(event.key==='Enter')supplierStokSatirKaydet('${r.id}')"
                                       class="w-24 border border-slate-300 p-1.5 rounded-lg text-sm text-right">
                                <span class="text-[11px] text-slate-400">${esc(r.unit)}</span>
                            </div>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 mb-0.5">Fiyat</label>
                            ${acik ? `<div class="flex items-center gap-1">
                                <input id="p_${r.id}" type="number" step="any" value="${r.unit_price != null ? r.unit_price : ''}"
                                       oninput="supplierStokKirlet('${r.id}')" onkeydown="if(event.key==='Enter')supplierStokSatirKaydet('${r.id}')"
                                       class="w-24 border border-slate-300 p-1.5 rounded-lg text-sm text-right">
                                <span class="text-[11px] text-slate-400">${esc(r.currency)}/${esc(r.price_basis)}</span>
                            </div>`
                            : `<div class="w-24 p-1.5 text-[11px] text-slate-400 italic text-right">teklif üzerine</div>`}
                        </div>
                        <button id="s_${r.id}" onclick="supplierStokSatirKaydet('${r.id}')"
                                class="hidden bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs">Kaydet</button>
                    </div>
                </div>

                <div class="flex items-center gap-1 mt-2 pt-2 border-t border-slate-100 flex-wrap">
                    <button onclick="supplierFiyatModu('${r.id}')"
                            class="text-[11px] font-bold px-2 py-1 rounded ${acik ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}">
                        ${acik ? '🟢 Fiyat açık' : '🔒 Teklif üzerine'} · değiştir
                    </button>
                    <span class="flex-1"></span>
                    <button onclick="supplierEditStok('${r.id}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Detay</button>
                    <button onclick="supplierCopyStok('${r.id}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Benzerini ekle</button>
                    <button onclick="supplierDeleteStok('${r.id}')" class="text-[11px] bg-red-50 text-red-600 hover:bg-red-100 px-2 py-1 rounded">Sil</button>
                </div>
            </div>`;
        }).join('');
    }

    window.supplierStokKirlet = function (id) {
        _stokKirli[id] = true;
        const b = document.getElementById('s_' + id);
        if (b) b.classList.remove('hidden');
    };

    // Satır içi kaydet: YALNIZ miktar ve fiyat. Onay durumuna DOKUNMAZ.
    window.supplierStokSatirKaydet = async function (id) {
        const r = (window.__supStok || []).find(x => x.id === id);
        if (!r) return;
        const qEl = document.getElementById('q_' + id);
        const pEl = document.getElementById('p_' + id);
        const btn = document.getElementById('s_' + id);

        const miktar = qEl && qEl.value !== '' ? parseFloat(qEl.value) : 0;
        if (!(miktar >= 0)) { alert('Miktar sayı olmalı.'); return; }

        const yama = { quantity: miktar };
        if (r.price_visible) {
            const f = pEl && pEl.value !== '' ? parseFloat(pEl.value) : null;
            if (!(f > 0)) { alert('Fiyatı açık gösteriyorsanız birim fiyat girmelisiniz.\n\nFiyat vermeyecekseniz "Teklif üzerine"ye çevirin.'); return; }
            yama.unit_price = f;
        }

        if (btn) { btn.textContent = '…'; btn.disabled = true; }
        try {
            const { error } = await supabaseClient.from('supplier_stock').update(yama).eq('id', id);
            if (error) throw error;
            Object.assign(r, yama);
            delete _stokKirli[id];
            if (btn) { btn.textContent = '✓'; setTimeout(() => { btn.classList.add('hidden'); btn.textContent = 'Kaydet'; btn.disabled = false; }, 900); }
        } catch (e) {
            alert('Kaydedilemedi: ' + (e.message || e));
            if (btn) { btn.textContent = 'Kaydet'; btn.disabled = false; }
        }
    };

    // Fiyat açık ↔ teklif üzerine. Açığa çevirirken fiyat yoksa sorulur.
    window.supplierFiyatModu = async function (id) {
        const r = (window.__supStok || []).find(x => x.id === id);
        if (!r) return;
        const yeni = !r.price_visible;
        let fiyat = r.unit_price;

        if (yeni) {
            const pEl = document.getElementById('p_' + id);
            if (pEl && pEl.value !== '') fiyat = parseFloat(pEl.value);
            if (!(fiyat > 0)) {
                const c = prompt(`"${r.brand} ${r.model}" için kurulumculara gösterilecek birim fiyat (${r.currency}/${r.price_basis}):`, '');
                if (c === null) return;
                fiyat = sayiOku(c);
                if (!(fiyat > 0)) { alert('Geçerli bir fiyat girilmedi.'); return; }
            }
        }

        const yama = yeni ? { price_visible: true, unit_price: fiyat } : { price_visible: false, unit_price: null };
        try {
            const { error } = await supabaseClient.from('supplier_stock').update(yama).eq('id', id);
            if (error) throw error;
            Object.assign(r, yama);
            const liste = document.getElementById('stokListe');
            if (liste) liste.innerHTML = stokListeHtml(window.__supStok || []);
        } catch (e) { alert('Değiştirilemedi: ' + (e.message || e)); }
    };

    // -------------------------------------------------------------- HIZLI EKLE
    window.supplierHizliEkle = async function () {
        const g = (x) => document.getElementById(x);
        const msg = g('hzMsg');
        const yaz = (t, kotu) => { if (msg) msg.innerHTML = `<p class="text-xs font-bold ${kotu ? 'text-red-600' : 'text-emerald-600'}">${t}</p>`; };
        const depo = depoOku();
        if (!depo.city) { yaz('Önce depo ilini seçin.', true); return; }

        const brand = (g('hzBrand').value || '').trim();
        const model = (g('hzModel').value || '').trim();
        if (!brand || !model) { yaz('Üretici ve model zorunludur.', true); return; }

        const acik = !!g('hzVis').checked;
        const fiyat = acik && g('hzPrice').value !== '' ? parseFloat(g('hzPrice').value) : null;
        if (acik && !(fiyat > 0)) { yaz('Fiyatı açık gösteriyorsanız birim fiyat girin.', true); return; }

        const row = {
            supplier_id: S.id, category_key: g('hzCat').value, brand, model,
            unit: g('hzUnit').value, quantity: parseFloat(g('hzQty').value) || 0,
            city: depo.city, district: depo.district || null,
            price_visible: acik, unit_price: acik ? fiyat : null,
            currency: acik ? g('hzCur').value : 'USD',
            price_basis: acik ? g('hzBasis').value : 'adet',
            specs: {}, is_active: true, status: 'pending'
        };

        yaz('Ekleniyor…');
        try {
            const { error } = await supabaseClient.from('supplier_stock').insert([row]);
            if (error) throw error;
            g('hzBrand').value = ''; g('hzModel').value = ''; g('hzQty').value = '0';
            if (g('hzPrice')) g('hzPrice').value = '';
            await renderStok();
            g('hzBrand')?.focus();
        } catch (e) { yaz('Eklenemedi: ' + (e.message || e), true); }
    };

    // ------------------------------------------------------------ TOPLU EKLEME
    window.supplierTopluEkle = async function () {
        const g = (x) => document.getElementById(x);
        const msg = g('hzTopluMsg');
        const yaz = (t, kotu) => { if (msg) msg.innerHTML = `<p class="text-xs font-bold ${kotu ? 'text-red-600' : 'text-emerald-600'}">${t}</p>`; };
        const depo = depoOku();
        if (!depo.city) { yaz('Önce depo ilini seçin.', true); return; }

        const ham = (g('hzToplu').value || '').trim();
        if (!ham) { yaz('Yapıştırılan bir şey yok.', true); return; }

        const kat = g('hzCat').value, birim = g('hzUnit').value;
        const acikVarsayilan = !!g('hzVis').checked;
        const para = g('hzCur') ? g('hzCur').value : 'USD';
        const baz  = g('hzBasis') ? g('hzBasis').value : 'adet';

        const satirlar = [];
        const hatalar = [];
        ham.split(/\r?\n/).forEach((satir, i) => {
            if (!satir.trim()) return;
            // Excel sekme verir; noktalı virgül de kabul ediliyor.
            const p = satir.includes('\t') ? satir.split('\t') : satir.split(';');
            const brand = (p[0] || '').trim();
            const model = (p[1] || '').trim();
            if (!brand || !model) { hatalar.push((i + 1) + '. satır: üretici veya model boş'); return; }
            const miktar = sayiOku(p[2]) || 0;
            const fiyat = sayiOku(p[3]);
            // ⚠️ Fiyatı olmayan satır AÇIK olamaz — sunucu kısıtı da bunu ister.
            // Bu yüzden karar satırın kendi fiyatına bakar, yukarıdaki kutuya değil.
            const acik = fiyat > 0;
            if (acikVarsayilan && !acik) hatalar.push((i + 1) + '. satır: fiyat boş, "teklif üzerine" olarak eklendi');
            satirlar.push({
                supplier_id: S.id, category_key: kat, brand, model, unit: birim,
                quantity: miktar, city: depo.city, district: depo.district || null,
                price_visible: !!acik, unit_price: acik ? fiyat : null,
                currency: para, price_basis: baz,
                specs: {}, is_active: true, status: 'pending'
            });
        });

        if (!satirlar.length) { yaz('Okunabilir satır bulunamadı. ' + hatalar.join(' · '), true); return; }
        yaz(satirlar.length + ' satır ekleniyor…');
        try {
            const { error } = await supabaseClient.from('supplier_stock').insert(satirlar);
            if (error) throw error;
            g('hzToplu').value = '';
            await renderStok();
            alert(satirlar.length + ' kalem eklendi.' + (hatalar.length ? '\n\nAtlanan satırlar:\n' + hatalar.join('\n') : ''));
        } catch (e) { yaz('Eklenemedi: ' + (e.message || e), true); }
    };

    function stokAlanFormu(kat, specs) {
        const s = specs || {};
        return (_stokAlan[kat] || []).map(a => {
            const v = s[a.anahtar] == null ? '' : s[a.anahtar];
            const alan = a.tip === 'secim' && (a.secenek || []).length
                ? `<select id="ss_${a.anahtar}" class="w-full border border-slate-300 p-2 rounded-lg text-sm bg-white"><option value="">—</option>${a.secenek.map(o => `<option ${String(v) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
                : `<input id="ss_${a.anahtar}" value="${esc(v)}" type="${a.tip === 'sayi' ? 'number' : 'text'}" step="any" class="w-full border border-slate-300 p-2 rounded-lg text-sm">`;
            return `<div><label class="block text-[11px] font-bold text-slate-600 mb-1">${esc(a.etiket)}${a.birim ? ' (' + esc(a.birim) + ')' : ''}</label>${alan}</div>`;
        }).join('');
    }

    window.supplierNewStok = () => openStokModal(null);
    window.supplierEditStok = (id) => openStokModal((window.__supStok || []).find(x => x.id === id));
    // "Benzerini ekle": aynı markadan farklı güçte kalem girerken tüm alanları
    // yeniden doldurmayı önler. id düşürülür, satır YENİ olarak kaydedilir.
    window.supplierCopyStok = (id) => {
        const r = (window.__supStok || []).find(x => x.id === id);
        if (!r) return;
        const kopya = Object.assign({}, r);
        delete kopya.id; delete kopya.status; delete kopya.reject_reason;
        delete kopya.created_at; delete kopya.updated_at;
        openStokModal(kopya);
    };

    function openStokModal(r) {
        const e = r || {};
        const yeni = !(r && r.id);
        const kat = e.category_key || 'panel';
        const depo = depoOku();
        const iller = ilListesi();
        const sec = (id, liste, deg) => secKutu(id, liste, deg);

        supModal(`
            <h3 class="text-lg font-black text-slate-800 mb-1">${yeni ? 'Yeni Stok Kalemi' : 'Stok Kalemini Düzenle'}</h3>
            <p class="text-xs text-slate-500 mb-4">${yeni ? 'Yeni satır yönetici onayından sonra yayına girer.' : 'Miktar ve fiyat anında yayında. Üretici, model veya teknik değer değişirse satır yeniden onaya girer.'}</p>
            <div class="space-y-3">
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Kategori</label>
                    <select id="skCat" onchange="supplierStokKatDegisti()" class="w-full border border-slate-300 p-2 rounded-lg text-sm bg-white">
                        ${STOK_KAT.map(([k, a]) => `<option value="${k}" ${kat === k ? 'selected' : ''}>${esc(a)}</option>`).join('')}
                    </select></div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Üretici *</label><input id="skBrand" value="${esc(e.brand || '')}" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Model / Seri *</label><input id="skModel" value="${esc(e.model || '')}" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                </div>

                <div class="border-t border-slate-100 pt-3">
                    <p class="text-[11px] font-bold text-slate-500 mb-2">Stok ve konum</p>
                    <div class="grid grid-cols-3 gap-3">
                        <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Miktar *</label><input id="skQty" type="number" step="any" value="${e.quantity != null ? e.quantity : 0}" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                        <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Birim</label>${sec('skUnit', STOK_BIRIM, e.unit || 'adet')}</div>
                        <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Asgari sipariş</label><input id="skMin" type="number" step="any" value="${e.min_order != null ? e.min_order : ''}" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                    </div>
                    <div class="grid grid-cols-3 gap-3 mt-3">
                        <div><label class="block text-[11px] font-bold text-slate-600 mb-1">İl *</label>
                            <select id="skCity" class="w-full border border-slate-300 p-2 rounded-lg text-sm bg-white"><option value="">— Seçin —</option>${iller.map(i => `<option ${(e.city || depo.city) === i ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select></div>
                        <div><label class="block text-[11px] font-bold text-slate-600 mb-1">İlçe</label><input id="skDist" value="${esc(e.district != null ? e.district : depo.district || '')}" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                        <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Termin (gün)</label><input id="skLead" type="number" value="${e.lead_time_days != null ? e.lead_time_days : ''}" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                    </div>
                </div>

                <div class="border-t border-slate-100 pt-3">
                    <label class="flex items-start gap-2 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <input type="checkbox" id="skVis" ${e.price_visible ? 'checked' : ''} onchange="supplierStokFiyatAc()" class="mt-0.5">
                        <span>
                            <span class="text-sm font-bold text-slate-800">Fiyatı kurulumcu firmalara açık göster</span>
                            <span class="block text-[11px] text-slate-500 mt-0.5">Açarsanız fiyatınız maliyet tablosuna doğrudan girer ve iş size daha hızlı gelir; rakip tedarikçiler de görebilir. Kapatırsanız kurulumcuya "fiyat teklifi iste" düğmesi çıkar, talep size düşer.</span>
                        </span>
                    </label>
                    <div id="skFiyatAlan" class="grid grid-cols-4 gap-3 mt-3 ${e.price_visible ? '' : 'hidden'}">
                        <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Birim fiyat</label><input id="skPrice" type="number" step="any" value="${e.unit_price != null ? e.unit_price : ''}" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                        <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Para</label>${sec('skCur', STOK_PARA, e.currency || 'USD')}</div>
                        <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Başına</label>${sec('skBasis', STOK_BAZ, e.price_basis || 'adet')}</div>
                        <div><label class="block text-[11px] font-bold text-slate-600 mb-1">Geçerlilik</label><input id="skValid" type="date" value="${e.valid_until || ''}" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                    </div>
                </div>

                <div class="border-t border-slate-100 pt-3">
                    <p class="text-[11px] font-bold text-slate-500 mb-2">Teknik bilgiler</p>
                    <div id="skSpecWrap" class="grid grid-cols-2 gap-3">${stokAlanFormu(kat, e.specs)}</div>
                </div>

                <div><label class="block text-xs font-bold text-slate-600 mb-1">Teknik doküman bağlantısı</label><input id="skSrc" value="${esc(e.source_url || '')}" placeholder="https://" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                <label class="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" id="skActive" ${e.is_active === false ? '' : 'checked'}> Yayında</label>
            </div>
            <div class="flex gap-2 mt-5">
                <button onclick="supplierCloseModal()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">İptal</button>
                <button onclick="supplierSaveStok('${(r && r.id) ? r.id : ''}')" class="flex-1 bg-sky-600 text-white font-bold py-2 rounded-lg">Kaydet</button>
            </div>
            <div id="skMsg"></div>`);
    }

    window.supplierStokKatDegisti = function () {
        const k = document.getElementById('skCat').value;
        document.getElementById('skSpecWrap').innerHTML = stokAlanFormu(k, null);
    };
    window.supplierStokFiyatAc = function () {
        const a = document.getElementById('skFiyatAlan');
        if (a) a.classList.toggle('hidden', !document.getElementById('skVis').checked);
    };

    window.supplierSaveStok = async function (id) {
        const g = (x) => document.getElementById(x);
        const msg = g('skMsg');
        const brand = (g('skBrand').value || '').trim();
        const model = (g('skModel').value || '').trim();
        const city  = g('skCity').value || '';
        const acik  = !!g('skVis').checked;
        const fiyat = g('skPrice').value === '' ? null : parseFloat(g('skPrice').value);

        if (!brand || !model) { msg.innerHTML = '<p class="text-red-500 text-sm mt-2">Üretici ve model zorunludur.</p>'; return; }
        if (!city) { msg.innerHTML = '<p class="text-red-500 text-sm mt-2">İl zorunludur — stok konumu bu modülün asıl bilgisi.</p>'; return; }
        // Sunucuda da kısıt var; burada erken ve anlaşılır söylüyoruz.
        if (acik && !(fiyat > 0)) { msg.innerHTML = '<p class="text-red-500 text-sm mt-2">Fiyatı açık gösteriyorsanız birim fiyat girmelisiniz. Fiyat vermeyecekseniz kutuyu kapatın.</p>'; return; }

        const kat = g('skCat').value;
        const specs = {};
        (_stokAlan[kat] || []).forEach(a => {
            const el = g('ss_' + a.anahtar);
            if (el && el.value !== '') specs[a.anahtar] = a.tip === 'sayi' ? Number(el.value) : el.value;
        });

        const row = {
            supplier_id: S.id, category_key: kat, brand, model,
            unit: g('skUnit').value,
            quantity: parseFloat(g('skQty').value) || 0,
            min_order: g('skMin').value === '' ? null : parseFloat(g('skMin').value),
            city, district: (g('skDist').value || '').trim() || null,
            lead_time_days: g('skLead').value === '' ? null : parseInt(g('skLead').value, 10),
            price_visible: acik,
            unit_price: acik ? fiyat : null,
            currency: g('skCur').value,
            price_basis: g('skBasis').value,
            valid_until: g('skValid').value || null,
            specs,
            source_url: (g('skSrc').value || '').trim() || null,
            is_active: !!g('skActive').checked
        };

        // Onay YALNIZ ilan kimliği değişirse sıfırlanır — yukarıdaki kurala bakın.
        const eski = id ? (window.__supStok || []).find(x => x.id === id) : null;
        if (!id || kimlikDegistiMi(eski, row)) row.status = 'pending';

        msg.innerHTML = '<p class="text-xs text-slate-400 mt-2">Kaydediliyor…</p>';
        try {
            if (id) { const { error } = await supabaseClient.from('supplier_stock').update(row).eq('id', id); if (error) throw error; }
            else { const { error } = await supabaseClient.from('supplier_stock').insert([row]); if (error) throw error; }
            supplierCloseModal(); renderStok();
        } catch (e) { msg.innerHTML = `<p class="text-red-500 text-sm mt-2">${esc(e.message || e)}</p>`; }
    };

    window.supplierDeleteStok = async function (id) {
        const r = (window.__supStok || []).find(x => x.id === id);
        if (!confirm(`"${r ? r.brand + ' ' + r.model : 'Bu kalem'}" silinsin mi?`)) return;
        const { error } = await supabaseClient.from('supplier_stock').delete().eq('id', id);
        if (error) { alert('Silinemedi: ' + error.message); return; }
        renderStok();
    };
})();
