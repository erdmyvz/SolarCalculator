/* ============================================================================
   process.js — YATIRIMCI SÜREÇ REHBERİ (TEDAŞ Mevzuatı & Teknik Süreçler)
   İçeriği Supabase'ten (process_steps) çeker ve #processRoot içine baştan sona
   bir zaman çizelgesi olarak basar. core.js'ten sonra yüklenir.
   ============================================================================ */
(function () {
    const root = document.getElementById('processRoot');
    if (!root) return;

    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const paras = (t) => esc(t).split(/\n+/).filter(Boolean).map(p => `<p class="text-sm text-slate-600 leading-relaxed mb-2">${p}</p>`).join('');

    function actorPill(a) {
        const s = (a || '').toLowerCase();
        let cls = 'bg-slate-100 text-slate-700';
        if (s.includes('yatırımcı')) cls = 'bg-blue-100 text-blue-800';
        if (s.includes('firma')) cls = 'bg-amber-100 text-amber-800';
        if (s.includes('dağıtım')) cls = 'bg-slate-200 text-slate-700';
        if (a && a.includes('+')) cls = 'bg-indigo-100 text-indigo-800';
        return a ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded ${cls} whitespace-nowrap">${esc(a)}</span>` : '';
    }

    async function load() {
        if (!supabaseClient) { root.innerHTML = '<p class="text-slate-500 text-sm">Veritabanı bağlantısı yok.</p>'; return; }
        root.innerHTML = '<p class="text-slate-400 text-sm">Süreç adımları yükleniyor...</p>';
        const { data, error } = await supabaseClient
            .from('process_steps').select('*').order('sort_order');
        if (error) { root.innerHTML = `<p class="text-red-500 text-sm">Yüklenemedi: ${error.message}</p>`; return; }
        render(data || []);
    }

    function render(steps) {
        const intro = `
            <div class="mb-6 bg-gradient-to-br from-blue-50 to-amber-50 border border-blue-100 rounded-xl p-6">
                <h3 class="text-lg font-black text-slate-800 mb-2">🗺️ Güneş enerjisi kurulum süreci — baştan sona</h3>
                <p class="text-sm text-slate-600 leading-relaxed">Güneş enerjisine geçmek birkaç resmi ve teknik adımdan oluşur. Aşağıda tüm yolculuğu, hiç teknik bilgi gerektirmeyen sade bir dille, sırasıyla bulacaksın — hangi adımı kimin yaptığı dahil. Not: bu genel bir yol haritasıdır; adımların sırası ve süreleri bölgene ve dağıtım şirketine göre değişebilir.</p>
            </div>`;

        if (!steps.length) { root.innerHTML = intro + '<p class="text-slate-400 text-sm">Henüz süreç adımı eklenmemiş.</p>'; return; }

        const timeline = steps.map((s, i) => {
            const last = i === steps.length - 1;
            const connector = last ? '' : '<div class="w-0.5 flex-1 bg-slate-200 my-1"></div>';
            return `
                <div class="flex gap-4">
                    <div class="flex flex-col items-center">
                        <div class="w-10 h-10 rounded-full bg-amber-500 text-white font-black flex items-center justify-center flex-shrink-0">${s.step_no || (i + 1)}</div>
                        ${connector}
                    </div>
                    <div class="flex-1 min-w-0 pb-6">
                        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                            <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
                                <h3 class="text-lg font-black text-slate-800">${esc(s.title)}</h3>
                                ${actorPill(s.actor)}
                            </div>
                            ${s.short_desc ? `<p class="text-sm text-slate-500 font-medium mb-3">${esc(s.short_desc)}</p>` : ''}
                            ${paras(s.detail)}
                            ${s.tip ? `<div class="flex gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3 mt-2"><span>💡</span><p class="text-xs text-amber-900 leading-relaxed m-0">${esc(s.tip)}</p></div>` : ''}
                            ${s.duration ? `<p class="text-[11px] text-slate-400 mt-2">⏱️ Yaklaşık süre: ${esc(s.duration)}</p>` : ''}
                        </div>
                    </div>
                </div>`;
        }).join('');

        const cta = `
            <div class="mt-2 bg-emerald-600 text-white p-5 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3">
                <div>
                    <p class="font-black">Tüm bu süreci senin yerine yöneten bir firmayla ilerle.</p>
                    <p class="text-emerald-100 text-xs">Sen sadece keyfini çıkar; evrak, başvuru ve takip firmanın işi.</p>
                </div>
                <button onclick="openLeadModal('kurulum')" class="bg-white text-emerald-700 font-black px-5 py-3 rounded-lg whitespace-nowrap hover:bg-emerald-50">Ücretsiz keşif başvurusu ›</button>
            </div>`;

        root.innerHTML = intro + `<div>${timeline}</div>` + cta;
    }

    load();
})();
