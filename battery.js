/* ============================================================================
   battery.js — KESİNTİ & BATARYA BOYUTLANDIRMA (ziyaretçi aracı)
   Ziyaretçi, kesintide çalışsın istediği cihazları ve süreyi seçer; ihtiyacı
   olan batarya kapasitesini/ünite sayısını ve inverter gücünü anında görür.
   #batteryRoot içine kendini basar. core.js'ten sonra yüklenir. (DB'ye yazmaz.)
   ============================================================================ */
(function () {
    const root = document.getElementById('batteryRoot');
    if (!root) return;

    document.getElementById('btnBackFromBattery')?.addEventListener('click', () => {
        document.getElementById('batteryModule')?.classList.add('hidden');
        closeAllAndShowMenu();
    });

    const DOD = 0.9, EFF = 0.95, MODULE = 5, SURGE = 1.3;
    const appliances = [
        ['Buzdolabı', 0.15, true],
        ['Derin Dondurucu', 0.2, false],
        ['LED Aydınlatma', 0.1, true],
        ['Modem / Wifi', 0.02, true],
        ['Televizyon', 0.12, false],
        ['Telefon / Laptop Şarj', 0.1, false],
        ['Su Pompası (Hidrofor)', 0.75, false],
        ['Kombi (Doğalgaz)', 0.12, false]
    ];
    const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('tr-TR');

    root.innerHTML = `
        <div class="mb-6 flex items-center gap-2">
            <span class="mx-2 text-slate-300">/</span><span class="text-slate-800 font-black text-xl">🔋 Kesinti & Batarya</span>
        </div>

        <div class="mb-6 bg-gradient-to-br from-amber-50 to-slate-50 border border-amber-100 rounded-xl p-6">
            <h3 class="text-lg font-black text-slate-800 mb-2">Kesintide evinizi ayakta tutun</h3>
            <p class="text-sm text-slate-600 leading-relaxed">Sık elektrik kesintisi yaşıyorsanız, hibrit bir güneş sistemine eklenen batarya, kesinti anında evinizin en gerekli cihazlarını çalışır tutar. Aşağıdan kesintide çalışmasını istediğiniz cihazları ve kaç saat dayanmak istediğinizi seçin; ihtiyacınız olan batarya kapasitesini anında görün. Kayıt gerekmez.</p>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-6 mb-6">
            <label class="block text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3">Kesintide çalışsın istediğiniz cihazlar</label>
            <div id="batChips" class="flex flex-wrap gap-2 mb-5">
                ${appliances.map(a => `<button type="button" data-kw="${a[1]}" class="bat-chip border px-3 py-2 rounded-lg text-xs font-bold ${a[2] ? 'bat-on bg-amber-500 text-white border-amber-500' : 'bg-slate-100 text-slate-600 border-slate-200'}">${a[0]} <span class="opacity-70">(${a[1]} kW)</span></button>`).join('')}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Ek yük (opsiyonel, kW)</label>
                    <input id="batCustom" type="number" step="0.1" value="0" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-amber-500">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Kaç saat dayanmak istiyorsunuz?</label>
                    <input id="batHours" type="number" step="1" value="4" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-amber-500">
                </div>
            </div>
        </div>

        <div id="batteryResults"></div>
    `;

    function compute() {
        const _S = window.EPC_SETTINGS || {};
        const _DOD = _S.batteryDod || DOD, _EFF = _S.inverterEff || EFF, _MOD = _S.batteryModule || MODULE, _SURGE = _S.inverterSurge || SURGE;

        let load = 0;
        root.querySelectorAll('.bat-chip.bat-on').forEach(b => { load += parseFloat(b.dataset.kw) || 0; });
        load += parseFloat(document.getElementById('batCustom').value) || 0;
        const hours = Math.max(0, parseFloat(document.getElementById('batHours').value) || 0);
        const energy = load * hours;
        const capacity = energy > 0 ? energy / _DOD / _EFF : 0;
        const units = capacity > 0 ? Math.ceil(capacity / _MOD) : 0;
        const invPower = load > 0 ? Math.ceil(load * _SURGE * 10) / 10 : 0;

        const box = document.getElementById('batteryResults');
        if (load <= 0 || hours <= 0) {
            box.innerHTML = '<p class="text-sm text-slate-400 bg-slate-50 border border-slate-200 rounded-xl p-4">Sonucu görmek için en az bir cihaz seçin ve süreyi girin.</p>';
            return;
        }
        box.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div class="bg-slate-50 border border-slate-200 p-4 rounded-xl"><p class="text-[11px] text-slate-500 font-bold">Kritik Yük</p><p class="text-2xl font-black text-slate-800">${fmt1(load)}<span class="text-sm"> kW</span></p></div>
                <div class="bg-slate-50 border border-slate-200 p-4 rounded-xl"><p class="text-[11px] text-slate-500 font-bold">Gerekli Enerji</p><p class="text-2xl font-black text-slate-800">${fmt1(energy)}<span class="text-sm"> kWh</span></p></div>
                <div class="bg-amber-50 border border-amber-100 p-4 rounded-xl"><p class="text-[11px] text-amber-700 font-bold">Önerilen Batarya</p><p class="text-2xl font-black text-amber-700">${fmt1(capacity)}<span class="text-sm"> kWh</span></p></div>
                <div class="bg-slate-50 border border-slate-200 p-4 rounded-xl"><p class="text-[11px] text-slate-500 font-bold">İnverter Gücü</p><p class="text-2xl font-black text-slate-800">${fmt1(invPower)}<span class="text-sm"> kW</span></p></div>
            </div>
            <div class="bg-slate-900 text-white p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3">
                <div>
                    <p class="font-black">Yaklaşık ${units} adet ${_MOD} kWh batarya ünitesi (~${units * _MOD} kWh) önerilir.</p>
                    <p class="text-slate-300 text-xs">Seçtiğiniz cihazları kesinti boyunca çalıştırır. Cihazlar aralıklı çalıştığından gerçekte daha uzun dayanabilir.</p>
                </div>
                <button onclick="openLeadModal('kurulum')" class="bg-amber-500 hover:bg-amber-600 text-white font-black px-5 py-3 rounded-lg whitespace-nowrap">Ücretsiz Keşif ›</button>
            </div>
            <p class="text-[11px] text-slate-400 mt-3">Değerler referans tahmindir; kesin sistem, cihaz kalkış akımları ve kullanım alışkanlıklarına göre keşifte netleşir.</p>
        `;
    }

    root.addEventListener('click', (e) => {
        const chip = e.target.closest('.bat-chip');
        if (!chip) return;
        chip.classList.toggle('bat-on');
        ['bg-amber-500', 'text-white', 'border-amber-500', 'bg-slate-100', 'text-slate-600', 'border-slate-200'].forEach(c => chip.classList.toggle(c));
        compute();
    });
    root.addEventListener('input', (e) => { if (e.target.id === 'batCustom' || e.target.id === 'batHours') compute(); });

    compute();
})();
