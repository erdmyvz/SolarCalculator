/* ============================================================================
   amortization.js — AMORTİSMAN & GERİ ÖDEME ANALİZİ (Ziyaretçi Modülü)
   openPublicModule('amortizationModule') ile açılır.
   Referans katsayıları window.EPC_SETTINGS'ten okur (yoksa varsayılana düşer),
   böylece admin Ayarlar'dan güncellenen değerlerle otomatik uyumludur.
   index.html'de settings.js'ten SONRA yüklenmelidir.
   ============================================================================ */
(function () {
    const root = document.getElementById('amortRoot');
    if (!root) return;

    // Geri dön butonu (modül yalnız ziyaretçi vitrininden açılır)
    document.getElementById('btnBackFromAmort')?.addEventListener('click', () => {
        if (typeof closeAllAndShowMenu === 'function') closeAllAndShowMenu();
    });

    const fmt  = n => Math.round(n).toLocaleString('tr-TR');
    const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    // Form iskeleti (bir kez basılır)
    root.innerHTML = `
        <p class="text-slate-500 text-sm mb-6 font-medium">Faturanıza veya sistem gücünüze göre GES yatırımınızın kaç yılda kendini amorti edeceğini, elektrik zammı ve panel yıpranması dahil olarak hesaplayın.</p>

        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <!-- SOL: GİRDİLER -->
            <div class="lg:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-2">Hesaplama Yöntemi</label>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <label class="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2 cursor-pointer"><input type="radio" name="amortMode" value="bill" checked> Aylık Fatura</label>
                        <label class="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2 cursor-pointer"><input type="radio" name="amortMode" value="kwp"> Sistem Gücü</label>
                    </div>
                </div>

                <div id="amortBillWrap">
                    <label class="block text-xs font-bold text-slate-500 mb-1">Ortalama Aylık Elektrik Faturası (TL)</label>
                    <input id="amortBill" type="number" value="3000" class="amort-in w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-emerald-500">
                </div>

                <div id="amortKwpWrap" class="hidden">
                    <label class="block text-xs font-bold text-slate-500 mb-1">Kurulacak Sistem Gücü (kWp)</label>
                    <input id="amortKwp" type="number" value="10" step="0.1" class="amort-in w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-emerald-500">
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-1">Elektrik Birim Fiyatı (TL/kWh)</label>
                        <input id="amortPrice" type="number" step="0.01" class="amort-in w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-emerald-500">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-1">Yıllık Elektrik Zammı (%)</label>
                        <input id="amortInflation" type="number" step="1" value="25" class="amort-in w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-emerald-500">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-1">Anahtar Teslim Bedel (TL/kWp)</label>
                        <input id="amortSystemPrice" type="number" step="500" class="amort-in w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-emerald-500">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-1">Yıllık Panel Yıpranması (%)</label>
                        <input id="amortDegradation" type="number" step="0.1" value="0.7" class="amort-in w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-emerald-500">
                    </div>
                </div>

                <p class="text-[11px] text-slate-400 leading-relaxed">Varsayılan üretim ve bedel değerleri sistem ayarlarınızdan gelir. Sonuçlar <strong>referans tahminlerdir</strong>; kesin proje için ücretsiz çatı keşfi gerekir.</p>
            </div>

            <!-- SAĞ: SONUÇLAR -->
            <div class="lg:col-span-3 space-y-4">
                <div id="amortKpi" class="grid grid-cols-2 md:grid-cols-3 gap-3"></div>
                <div id="amortBreakeven"></div>
                <div id="amortCta"></div>
                <details class="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <summary class="cursor-pointer select-none px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">📅 Yıl yıl geri ödeme tablosunu göster</summary>
                    <div id="amortTable" class="overflow-x-auto"></div>
                </details>
            </div>
        </div>
    `;

    // --- Yöntem geçişi (fatura / kWp) ---
    root.querySelectorAll('input[name="amortMode"]').forEach(r => {
        r.addEventListener('change', () => {
            const mode = root.querySelector('input[name="amortMode"]:checked').value;
            document.getElementById('amortBillWrap').classList.toggle('hidden', mode !== 'bill');
            document.getElementById('amortKwpWrap').classList.toggle('hidden', mode !== 'kwp');
            calc();
        });
    });
    root.querySelectorAll('.amort-in').forEach(i => i.addEventListener('input', calc));

    function calc() {
        const S = window.EPC_SETTINGS || {};
        const yieldKwh = Number(S.solarYield)  || 1500;   // kWh/kWp/yıl
        const defPrice = Number(S.tariff)       || 2.5;    // TL/kWh
        const defSys   = Number(S.pricePerKwp)  || 30000;  // TL/kWp

        // Girdileri oku (birim fiyat & bedel boşsa ayarlardan doldur)
        const priceEl = document.getElementById('amortPrice');
        const sysEl   = document.getElementById('amortSystemPrice');
        if (priceEl && priceEl.value === '') priceEl.value = defPrice;
        if (sysEl && sysEl.value === '')     sysEl.value = defSys;

        const price      = parseFloat(priceEl.value) || defPrice;
        const systemPrice= parseFloat(sysEl.value)   || defSys;
        const inflation  = (parseFloat(document.getElementById('amortInflation').value) || 0) / 100;
        const degr       = (parseFloat(document.getElementById('amortDegradation').value) || 0) / 100;
        const mode       = root.querySelector('input[name="amortMode"]:checked').value;

        // Sistem gücünü belirle
        let kwp;
        if (mode === 'bill') {
            const bill = parseFloat(document.getElementById('amortBill').value) || 0;
            const yearlyKwh = (bill / price) * 12;
            kwp = yearlyKwh / yieldKwh;
        } else {
            kwp = parseFloat(document.getElementById('amortKwp').value) || 0;
        }

        const investment = kwp * systemPrice;

        // 25 yıllık projeksiyon
        const YEARS = 25;
        let cumulative = 0, breakevenYears = null, prevCum = 0;
        const rows = [];
        for (let i = 1; i <= YEARS; i++) {
            const production = kwp * yieldKwh * Math.pow(1 - degr, i - 1);
            const yearPrice  = price * Math.pow(1 + inflation, i - 1);
            const saving     = production * yearPrice;
            prevCum = cumulative;
            cumulative += saving;
            if (breakevenYears === null && cumulative >= investment && investment > 0) {
                const frac = saving > 0 ? (investment - prevCum) / saving : 0;
                breakevenYears = (i - 1) + Math.min(Math.max(frac, 0), 1);
            }
            rows.push({ year: i, production, yearPrice, saving, cumulative });
        }
        const firstYearSaving = rows[0] ? rows[0].saving : 0;
        const net25 = cumulative - investment;

        // --- KPI kartları ---
        document.getElementById('amortKpi').innerHTML = `
            <div class="bg-emerald-50 border border-emerald-100 p-4 rounded-xl"><p class="text-[11px] text-slate-500 font-bold mb-1">Sistem Gücü</p><p class="text-2xl font-black text-emerald-700">${fmt1(kwp)}<span class="text-sm"> kWp</span></p></div>
            <div class="bg-white border border-slate-200 p-4 rounded-xl"><p class="text-[11px] text-slate-500 font-bold mb-1">Tahmini Yatırım</p><p class="text-2xl font-black text-slate-800">₺${fmt(investment)}</p></div>
            <div class="bg-white border border-slate-200 p-4 rounded-xl"><p class="text-[11px] text-slate-500 font-bold mb-1">1. Yıl Tasarrufu</p><p class="text-2xl font-black text-emerald-600">₺${fmt(firstYearSaving)}</p></div>
            <div class="bg-slate-900 text-white p-4 rounded-xl"><p class="text-[11px] text-slate-300 font-bold mb-1">Amortisman Süresi</p><p class="text-2xl font-black text-yellow-400">${breakevenYears ? fmt1(breakevenYears) : '>25'}<span class="text-sm text-slate-300"> yıl</span></p></div>
            <div class="bg-emerald-600 text-white p-4 rounded-xl col-span-2 md:col-span-1"><p class="text-[11px] text-emerald-100 font-bold mb-1">25 Yıllık Net Kazanç</p><p class="text-2xl font-black">₺${fmt(net25)}</p></div>
        `;

        // --- Geri ödeme çizgisi (25 yıl içinde amorti noktası) ---
        const pct = breakevenYears ? Math.min((breakevenYears / YEARS) * 100, 100) : 100;
        document.getElementById('amortBreakeven').innerHTML = `
            <div class="bg-white border border-slate-200 rounded-xl p-4">
                <div class="flex justify-between text-[11px] font-bold text-slate-500 mb-2">
                    <span>Geri Ödeme Çizgisi (25 yıl)</span>
                    <span>${breakevenYears ? 'Amorti: ~' + fmt1(breakevenYears) + '. yıl' : '25 yılda amorti olmuyor'}</span>
                </div>
                <div class="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                    <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-yellow-400 to-emerald-500 rounded-full" style="width:${pct}%"></div>
                </div>
                <div class="flex justify-between text-[10px] text-slate-400 mt-1"><span>0. yıl</span><span>25. yıl</span></div>
            </div>
        `;

        // --- CTA ---
        document.getElementById('amortCta').innerHTML = `
            <div class="bg-slate-900 text-white p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3">
                <p class="text-sm">Bu rakamlar tüketiminize göre üretilmiş referans tahminlerdir. Çatınıza özel kesin analiz için:</p>
                <button onclick="openLeadModal('kurulum')" class="bg-emerald-500 hover:bg-emerald-600 text-white font-black px-5 py-3 rounded-lg whitespace-nowrap">Ücretsiz Çatı Keşfi ›</button>
            </div>
        `;

        // --- Yıl yıl tablo ---
        const beYear = breakevenYears ? Math.ceil(breakevenYears) : -1;
        document.getElementById('amortTable').innerHTML = `
            <table class="w-full text-sm min-w-[520px]">
                <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-4 py-2">Yıl</th>
                        <th class="text-right px-4 py-2">Üretim (kWh)</th>
                        <th class="text-right px-4 py-2">Birim Fiyat</th>
                        <th class="text-right px-4 py-2">Yıllık Tasarruf</th>
                        <th class="text-right px-4 py-2">Kümülatif</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                        <tr class="border-t border-slate-100 ${r.year === beYear ? 'bg-emerald-50 font-bold' : ''}">
                            <td class="px-4 py-2">${r.year}${r.year === beYear ? ' 🎯' : ''}</td>
                            <td class="text-right px-4 py-2">${fmt(r.production)}</td>
                            <td class="text-right px-4 py-2">₺${(Math.round(r.yearPrice * 100) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="text-right px-4 py-2 text-emerald-700">₺${fmt(r.saving)}</td>
                            <td class="text-right px-4 py-2">₺${fmt(r.cumulative)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        `;
    }

    // İlk açılışta varsayılanlarla sonucu göster
    try { calc(); } catch (e) { /* DOM hazır değilse sessiz geç */ }
})();
