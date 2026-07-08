/* ============================================================================
   hardware.js — DONANIM KARŞILAŞTIRMA (Ziyaretçi Modülü)
   openPublicModule('hardwareModule') ile açılır.
   İnverter / Batarya / Panel kategorilerini yan yana kıyaslar.

   ⚠️ NOT: Aşağıdaki HW_DATA tablosu ÖRNEK/PLACEHOLDER verilerdir.
   Gerçek katalog, spesifikasyon ve fiyat verilerinizle güncelleyin.
   (İleride bu veri Supabase'ten de çekilebilir.)
   index.html'de core.js'ten sonra yüklenmelidir.
   ============================================================================ */
(function () {
    const root = document.getElementById('hardwareRoot');
    if (!root) return;

    document.getElementById('btnBackFromHardware')?.addEventListener('click', () => {
        if (typeof closeAllAndShowMenu === 'function') closeAllAndShowMenu();
    });

    // --- ÖRNEK VERİ (buradan güncelleyin) ---
    const HW_DATA = {
        inverter: {
            label: 'İnverter',
            guide: 'Şebeke bağlantılı basit sistemlerde string inverter yeterlidir. Kesintide çalışmak veya batarya kullanmak istiyorsanız <strong>hibrit inverter</strong> seçmelisiniz.',
            cols: ['Marka / Model', 'Tip', 'Güç (kW)', 'MPPT', 'Verim', 'Hibrit', 'Garanti', 'Öne Çıkan'],
            rows: [
                ['Fronius Symo GEN24', 'Hibrit', '3–10', '2', '%98,2', '✅', '10 yıl', 'Yüksek verim + yedekleme'],
                ['Victron MultiPlus-II', 'Hibrit', '3–10', '2', '%96,5', '✅', '5 yıl', 'Off-grid / ada modda güçlü'],
                ['Deye SUN-Hybrid', 'Hibrit', '5–12', '2', '%97,6', '✅', '5 yıl', 'Fiyat / performans'],
                ['Solax X3-Hybrid G4', 'Hibrit', '5–15', '2', '%97,8', '✅', '10 yıl', 'Geniş batarya uyumu'],
            ],
        },
        battery: {
            label: 'Batarya',
            guide: 'Kesinti sırasında evi ayakta tutmak için batarya kapasitesi (kWh) ve deşarj derinliği (DoD) önemlidir. LiFePO4 kimyası uzun ömür ve güvenlik sağlar.',
            cols: ['Marka / Model', 'Kimya', 'Kapasite', 'DoD', 'Çevrim', 'Modüler', 'Garanti', 'Öne Çıkan'],
            rows: [
                ['Pylontech US5000', 'LiFePO4', '4,8 kWh', '%95', '6000+', '✅', '10 yıl', 'Yaygın, kanıtlanmış'],
                ['Deye BOS-G', 'LiFePO4', '5,1 kWh', '%95', '6000+', '✅', '10 yıl', 'Yüksek akım desteği'],
                ['Solax T-BAT H', 'LiFePO4', '5,8 kWh', '%90', '6000+', '✅', '10 yıl', 'Solax inverter uyumu'],
                ['Victron 12.8/200', 'LiFePO4', '2,56 kWh', '%90', '5000+', '✅', '10 yıl', 'Ada/karavan sistemleri'],
            ],
        },
        panel: {
            label: 'Panel',
            guide: 'Aynı çatı alanında daha çok üretim için panel <strong>verimi (%)</strong> ve gölge/sıcak iklim performansına bakın. Tier-1 üreticiler uzun vadeli üretim garantisi verir.',
            cols: ['Marka / Seri', 'Hücre', 'Güç (Wp)', 'Verim', 'Tip', 'Sıcaklık Katsayısı', 'Garanti (Üretim)', 'Öne Çıkan'],
            rows: [
                ['Jinko Tiger Neo', 'N-Type', '580–620', '%22,5', 'Monofasial', '−0,29%/°C', '30 yıl', 'Düşük ışıkta güçlü'],
                ['LONGi Hi-MO 6', 'N-Type', '570–590', '%22,8', 'Monofasial', '−0,29%/°C', '25 yıl', 'Yüksek verim'],
                ['Trina Vertex S+', 'N-Type', '440–450', '%22,3', 'Monofasial', '−0,30%/°C', '25 yıl', 'Konut çatısına ideal boyut'],
                ['Canadian TOPHiKu6', 'N-Type', '575–595', '%22,5', 'Bifasial', '−0,30%/°C', '30 yıl', 'Bifasial ekstra üretim'],
            ],
        },
    };

    const CATS = ['inverter', 'battery', 'panel'];
    let active = 'inverter';

    function tabBtn(cat) {
        const on = cat === active;
        return `<button data-cat="${cat}" class="hw-tab px-5 py-2.5 rounded-lg text-sm font-bold transition ${on ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${HW_DATA[cat].label}</button>`;
    }

    function renderTable() {
        const d = HW_DATA[active];
        return `
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-800">💡 ${d.guide}</div>
            <div class="overflow-x-auto border border-slate-200 rounded-xl">
                <table class="w-full text-sm min-w-[720px]">
                    <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                        <tr>${d.cols.map((c, i) => `<th class="${i === 0 ? 'text-left' : 'text-center'} px-4 py-3">${c}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${d.rows.map(r => `
                            <tr class="border-t border-slate-100 hover:bg-slate-50">
                                ${r.map((cell, i) => i === 0
                                    ? `<td class="px-4 py-3 font-bold text-slate-800">${cell}</td>`
                                    : `<td class="px-4 py-3 text-center text-slate-600">${cell}</td>`).join('')}
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function render() {
        root.innerHTML = `
            <p class="text-slate-500 text-sm mb-2 font-medium">Sisteminizin kalbini oluşturan ekipmanları yan yana kıyaslayın; ihtiyacınıza en uygun donanımı seçin.</p>
            <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-[11px] text-amber-800 mb-5">📌 Aşağıdaki değerler örnek referans verilerdir; kesin karar öncesi güncel üretici kataloglarını doğrulayın.</div>
            <div id="hwTabs" class="flex flex-wrap gap-2 mb-5">${CATS.map(tabBtn).join('')}</div>
            <div id="hwBody">${renderTable()}</div>
            <div class="mt-6 bg-slate-900 text-white p-5 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3">
                <div>
                    <p class="font-black">Hangi donanım size uygun, emin değil misiniz?</p>
                    <p class="text-slate-300 text-sm">Uzmanlarımız çatınıza ve bütçenize göre doğru markayı önersin.</p>
                </div>
                <button onclick="openLeadModal('kurulum')" class="bg-emerald-500 hover:bg-emerald-600 text-white font-black px-5 py-3 rounded-lg whitespace-nowrap">Uzman Görüşü Al ›</button>
            </div>
        `;
        root.querySelectorAll('.hw-tab').forEach(b => {
            b.addEventListener('click', () => {
                active = b.getAttribute('data-cat');
                // Yalnız sekme + tablo alanını tazele
                document.getElementById('hwTabs').innerHTML = CATS.map(tabBtn).join('');
                document.getElementById('hwBody').innerHTML = renderTable();
                bindTabs();
            });
        });
    }

    function bindTabs() {
        document.querySelectorAll('.hw-tab').forEach(b => {
            b.addEventListener('click', () => {
                active = b.getAttribute('data-cat');
                document.getElementById('hwTabs').innerHTML = CATS.map(tabBtn).join('');
                document.getElementById('hwBody').innerHTML = renderTable();
                bindTabs();
            });
        });
    }

    render();
})();
