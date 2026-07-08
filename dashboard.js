/* ============================================================================
   dashboard.js — YÖNETİM PANOSU / ANALİTİK ÖZET
   Firmanın (admin ise tüm sistemin) genel durumunu tek ekranda özetler.
   Tamamen mevcut verilerden (leads, quotes, projects, service_requests) beslenir;
   RLS sayesinde her firma yalnız kendi verisini görür. core.js'ten sonra yüklenir.
   ============================================================================ */
(function () {
    const root = document.getElementById('dashboardRoot');
    if (!root) return;

    document.getElementById('btnGoDashboard')?.addEventListener('click', () => {
        window.openedFromPublic = false;
        document.getElementById('mainMenu').classList.add('hidden');
        document.getElementById('dashboardModule').classList.remove('hidden');
        loadDashboard();
    });
    document.getElementById('btnBackToMenuFromDashboard')?.addEventListener('click', () => {
        document.getElementById('dashboardModule')?.classList.add('hidden');
        closeAllAndShowMenu();
    });
    document.getElementById('btnRefreshDashboard')?.addEventListener('click', () => loadDashboard());

    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

    async function loadDashboard() {
        if (!supabaseClient) { root.innerHTML = '<p class="text-slate-500 text-sm">Veritabanı bağlantısı yok.</p>'; return; }
        root.innerHTML = '<p class="text-slate-400 text-sm">Veriler toplanıyor...</p>';

        const [lr, qr, pr, sr] = await Promise.all([
            supabaseClient.from('leads').select('status'),
            supabaseClient.from('quotes').select('status, total_amount'),
            supabaseClient.from('projects').select('id'),
            supabaseClient.from('service_requests').select('status')
        ]);

        const leads = lr.data || [];
        const quotes = qr.data || [];
        const projects = pr.data || [];
        const services = sr.data || [];

        // Lead hattı
        const leadByStatus = {};
        leads.forEach(l => { leadByStatus[l.status] = (leadByStatus[l.status] || 0) + 1; });

        // Teklifler
        const q = { count: quotes.length, taslak: 0, gonderildi: 0, kabul: 0, ret: 0, wonAmount: 0, totalAmount: 0 };
        quotes.forEach(x => {
            if (q[x.status] !== undefined) q[x.status]++;
            q.totalAmount += Number(x.total_amount) || 0;
            if (x.status === 'kabul') q.wonAmount += Number(x.total_amount) || 0;
        });
        const sent = q.gonderildi + q.kabul + q.ret;
        const conversion = sent > 0 ? Math.round(q.kabul / sent * 100) : 0;

        // Servisler
        const svcTotal = services.length;
        const svcDone = services.filter(s => s.status === 'tamamlandi').length;
        const svcActive = svcTotal - svcDone;

        render({
            leadTotal: leads.length, leadByStatus,
            q, conversion,
            projects: projects.length,
            svcTotal, svcDone, svcActive
        });
    }

    const kpi = (label, val, cls) => `
        <div class="bg-white p-4 rounded-xl border border-slate-200 border-l-4 ${cls}">
            <div class="text-[11px] text-slate-400 font-bold uppercase tracking-wider">${label}</div>
            <div class="text-2xl font-black text-slate-800 mt-1">${val}</div>
        </div>`;

    function render(a) {
        const stages = ['yeni_basvuru', 'arandi_gorusuldu', 'teklif_gonderildi', 'sozlesme_imzalandi', 'kurulum_basladi', 'resmi_surec', 'tamamlandi'];
        const maxc = Math.max(1, ...stages.map(s => a.leadByStatus[s] || 0));
        const funnel = stages.map(s => {
            const c = a.leadByStatus[s] || 0;
            const lbl = (typeof stageLabel === 'function') ? stageLabel(s)
                : ((typeof crmStatusLabels !== 'undefined' && crmStatusLabels[s]) ? crmStatusLabels[s].text : s);
            const w = Math.round((c / maxc) * 100);
            return `
                <div class="flex items-center gap-3 mb-2">
                    <div class="w-36 md:w-44 text-xs text-slate-600 font-bold shrink-0">${lbl}</div>
                    <div class="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden"><div class="h-full bg-amber-500 rounded-full" style="width:${w}%"></div></div>
                    <div class="w-8 text-right text-sm font-black text-slate-700">${c}</div>
                </div>`;
        }).join('');

        const qRow = (label, val, cls = 'text-slate-800') =>
            `<div class="flex justify-between py-1.5 border-b border-slate-50"><span class="text-slate-500">${label}</span><strong class="${cls}">${val}</strong></div>`;

        root.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                ${kpi('Toplam Müşteri', a.leadTotal, 'border-l-blue-500')}
                ${kpi('Kazanılan İş', '₺' + fmt(a.q.wonAmount), 'border-l-emerald-500')}
                ${kpi('Kurulu Tesis', a.projects, 'border-l-amber-500')}
                ${kpi('Aktif Servis', a.svcActive, 'border-l-slate-500')}
            </div>

            <div class="bg-white p-5 rounded-xl border border-slate-200 mb-6">
                <h3 class="text-sm font-black text-slate-800 mb-4">📊 Lead Hattı (Aşamalara Göre)</h3>
                ${funnel}
                ${a.leadTotal === 0 ? '<p class="text-xs text-slate-400 mt-2">Henüz müşteri kaydı yok.</p>' : ''}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="bg-white p-5 rounded-xl border border-slate-200">
                    <h3 class="text-sm font-black text-slate-800 mb-3">📄 Teklif Özeti</h3>
                    <div class="text-center bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-3">
                        <div class="text-[11px] text-emerald-700 font-bold uppercase">Dönüşüm Oranı</div>
                        <div class="text-3xl font-black text-emerald-700">%${a.conversion}</div>
                        <div class="text-[11px] text-slate-500 mt-1">${a.q.kabul} kabul / ${(a.q.gonderildi + a.q.kabul + a.q.ret)} sonuçlanan teklif</div>
                    </div>
                    <div class="text-xs">
                        ${qRow('Toplam teklif', a.q.count)}
                        ${qRow('Taslak', a.q.taslak)}
                        ${qRow('Gönderildi', a.q.gonderildi, 'text-blue-700')}
                        ${qRow('Kabul', a.q.kabul, 'text-emerald-700')}
                        ${qRow('Ret', a.q.ret, 'text-red-600')}
                        ${qRow('Toplam teklif tutarı', '₺' + fmt(a.q.totalAmount))}
                        ${qRow('Kazanılan iş', '₺' + fmt(a.q.wonAmount), 'text-emerald-700')}
                    </div>
                </div>

                <div class="bg-white p-5 rounded-xl border border-slate-200">
                    <h3 class="text-sm font-black text-slate-800 mb-3">🔧 Servis Özeti</h3>
                    <div class="grid grid-cols-3 gap-3 text-center">
                        <div class="bg-slate-50 rounded-xl p-4"><div class="text-2xl font-black text-slate-800">${a.svcTotal}</div><div class="text-[11px] text-slate-400 font-bold uppercase">Toplam</div></div>
                        <div class="bg-amber-50 rounded-xl p-4"><div class="text-2xl font-black text-amber-700">${a.svcActive}</div><div class="text-[11px] text-slate-400 font-bold uppercase">Aktif</div></div>
                        <div class="bg-emerald-50 rounded-xl p-4"><div class="text-2xl font-black text-emerald-700">${a.svcDone}</div><div class="text-[11px] text-slate-400 font-bold uppercase">Tamamlanan</div></div>
                    </div>
                    <p class="text-[11px] text-slate-400 mt-4">Aktif servisler, tamamlanmamış bakım/temizlik/arıza talepleridir. Detay için "Bana Atanan Servisler" ekranını kullanın.</p>
                </div>
            </div>`;
    }

    window.loadDashboard = loadDashboard;
})();
