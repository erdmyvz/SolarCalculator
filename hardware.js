/* ============================================================================
   hardware.js — DONANIM KARŞILAŞTIRMA (Ziyaretçi Modülü)
   openPublicModule('hardwareModule') ile açılır.

   Veri Supabase'ten gelir (hardware_categories + hardware_items); kod içinde
   ürün verisi TUTULMAZ. Daha önce burada sabit kodlanmış bir tablo vardı ve
   gerçek marka adlarının yanında doğrulanmamış değerler gösteriyordu — bağımsız
   bilgi iddiasındaki bir platformda bu kabul edilemezdi.

   Veri yoksa araç ziyaretçiye hiç gösterilmez: vitrindeki başlatma kartı
   gizlenir, modül açılsa bile boş durum metni çıkar.

   hardware.sql çalıştırılmış olmalıdır.
   index.html'de core.js'ten sonra yüklenmelidir.
   ============================================================================ */
(function () {
    const root = document.getElementById('hardwareRoot');
    if (!root) return;

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    document.getElementById('btnBackFromHardware')?.addEventListener('click', () => {
        if (typeof closeAllAndShowMenu === 'function') closeAllAndShowMenu();
    });

    let CATS = [];          // hardware_categories satırları
    let ITEMS = {};         // { category_key: [item, ...] }
    let active = null;
    let loaded = false;

    // ---------------------------------------------------------------- veri
    async function fetchData() {
        if (typeof supabaseClient === 'undefined' || !supabaseClient) return false;
        const [cat, item] = await Promise.all([
            supabaseClient.from('hardware_categories').select('*').order('sort_order'),
            supabaseClient.from('hardware_items').select('*').order('sort_order')
        ]);
        if (cat.error || item.error) return false;

        ITEMS = {};
        (item.data || []).forEach(r => {
            (ITEMS[r.category_key] = ITEMS[r.category_key] || []).push(r);
        });
        // Yalnız içinde en az bir satır olan kategoriyi göster: başlıkları hazır
        // ama ürünü girilmemiş bir sekme ziyaretçi için boş vaattir.
        CATS = (cat.data || []).filter(c => (ITEMS[c.key] || []).length > 0);
        active = CATS.length ? CATS[0].key : null;
        loaded = true;
        return CATS.length > 0;
    }

    // ------------------------------------------------------------- görünüm
    function tabBtn(c) {
        const on = c.key === active;
        return `<button data-cat="${esc(c.key)}" class="hw-tab px-5 py-2.5 rounded-lg text-sm font-bold transition ${
            on ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }">${esc(c.label)}</button>`;
    }

    function renderTable() {
        const cat = CATS.find(c => c.key === active);
        if (!cat) return '';
        const cols = Array.isArray(cat.cols) ? cat.cols : [];
        const rows = ITEMS[cat.key] || [];

        // En son doğrulama tarihi — ziyaretçi verinin ne kadar taze olduğunu görsün.
        const tarihler = rows.map(r => r.verified_on).filter(Boolean).sort();
        const sonDogrulama = tarihler.length ? tarihler[tarihler.length - 1] : null;

        const kaynakVar = rows.some(r => r.source_url);

        return `
            ${cat.guide ? `<div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-800">💡 ${cat.guide}</div>` : ''}
            <div class="overflow-x-auto border border-slate-200 rounded-xl">
                <table class="w-full text-sm min-w-[720px]">
                    <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                        <tr>
                            ${cols.map((c, i) => `<th class="${i === 0 ? 'text-left' : 'text-center'} px-4 py-3">${esc(c)}</th>`).join('')}
                            ${kaynakVar ? '<th class="text-center px-4 py-3">Kaynak</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => {
                            const cells = Array.isArray(r.cells) ? r.cells : [];
                            return `
                            <tr class="border-t border-slate-100 hover:bg-slate-50">
                                ${cols.map((_, i) => i === 0
                                    ? `<td class="px-4 py-3 font-bold text-slate-800">${esc(cells[i])}</td>`
                                    : `<td class="px-4 py-3 text-center text-slate-600">${esc(cells[i])}</td>`).join('')}
                                ${kaynakVar ? `<td class="px-4 py-3 text-center">${
                                    r.source_url
                                        ? `<a href="${esc(r.source_url)}" target="_blank" rel="noopener nofollow" class="text-emerald-700 font-bold hover:underline">Katalog ↗</a>`
                                        : '<span class="text-slate-300">—</span>'
                                }</td>` : ''}
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            ${sonDogrulama ? `<p class="text-[11px] text-slate-400 mt-2">🗓️ Bu tablodaki değerler en son ${esc(sonDogrulama)} tarihinde üretici kataloglarından doğrulandı.</p>` : ''}
        `;
    }

    function bindTabs() {
        root.querySelectorAll('.hw-tab').forEach(b => {
            b.addEventListener('click', () => {
                active = b.getAttribute('data-cat');
                document.getElementById('hwTabs').innerHTML = CATS.map(tabBtn).join('');
                document.getElementById('hwBody').innerHTML = renderTable();
                bindTabs();
            });
        });
    }

    const uzmanCTA = `
        <div class="mt-6 bg-slate-900 text-white p-5 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3">
            <div>
                <p class="font-black">Hangi donanım size uygun, emin değil misiniz?</p>
                <p class="text-slate-300 text-sm">Uzmanlarımız çatınıza ve bütçenize göre doğru markayı önersin.</p>
            </div>
            <button onclick="openLeadModal('kurulum')" class="bg-emerald-500 hover:bg-emerald-600 text-white font-black px-5 py-3 rounded-lg whitespace-nowrap">Uzman Görüşü Al ›</button>
        </div>`;

    function renderBos() {
        root.innerHTML = `
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
                <div class="text-4xl mb-3">⚖️</div>
                <h3 class="text-lg font-black text-slate-800 mb-2">Donanım karşılaştırma tablosu hazırlanıyor</h3>
                <p class="text-sm text-slate-500 max-w-md mx-auto">Marka ve model verilerini yayınlamadan önce her satırı üretici kataloğundan doğruluyoruz. Doğrulanmamış hiçbir değeri buraya koymuyoruz.</p>
            </div>
            ${uzmanCTA}`;
    }

    function render() {
        if (!CATS.length) { renderBos(); return; }
        root.innerHTML = `
            <p class="text-slate-500 text-sm mb-2 font-medium">Sisteminizin kalbini oluşturan ekipmanları yan yana kıyaslayın; ihtiyacınıza en uygun donanımı seçin.</p>
            <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-[11px] text-amber-800 mb-5">📌 Değerler üretici kataloglarından alınmıştır ve bilgilendirme amaçlıdır; sipariş öncesi güncel teknik dokümanı satıcınızdan teyit edin.</div>
            <div id="hwTabs" class="flex flex-wrap gap-2 mb-5">${CATS.map(tabBtn).join('')}</div>
            <div id="hwBody">${renderTable()}</div>
            ${uzmanCTA}`;
        bindTabs();
    }

    // Modül açıldığında çağrılır (veri bir kez yüklenir, sonra önbellekten).
    window.openHardwareCompare = async function () {
        if (loaded) { render(); return; }
        root.innerHTML = '<p class="text-slate-400 text-sm">Donanım verileri yükleniyor...</p>';
        try { await fetchData(); } catch (e) { loaded = true; }
        render();
    };

    // ---- Vitrindeki başlatma kartı: veri yoksa hiç gösterme ----
    // Boş bir aracı ana sayfadan linklemek ziyaretçiyi boşa yönlendirir.
    (async function baslaticiKartiniAyarla() {
        const kart = document.getElementById('hwLauncher');
        if (!kart || typeof supabaseClient === 'undefined' || !supabaseClient) return;
        try {
            const { count, error } = await supabaseClient
                .from('hardware_items')
                .select('id', { count: 'exact', head: true })
                .eq('is_published', true);
            if (error) throw error;
            if (!count) kart.classList.add('hidden');
        } catch (e) {
            // Tablo yoksa/erişilemezse kartı gizle: boş araç göstermektense hiç gösterme.
            kart.classList.add('hidden');
        }
    })();
})();
