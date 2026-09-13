/* ============================================================================
   dashboard.js — YÖNETİM PANOSU / ANALİTİK ÖZET
   Firmanın (admin ise tüm sistemin) genel durumunu tek ekranda özetler.
   Veri panel.js'teki epcPanelVeri()'den gelir; ana ekranın "Bugün" şeridi ve
   CRM ile AYNI kaynağı kullanır ki aynı oturumda farklı rakam görünmesin.

   ⚠️ DÜZELTİLEN EN BÜYÜK HATA: pano teklifleri 'quotes' tablosundan okuyordu.
   Teklif motoru (quote.js) 'firm_quotes'a yazıyor ve kod tabanında 'quotes'a
   YAZAN hiçbir yer yok. Yani "Kazanılan İş" ve "Dönüşüm Oranı" firma kaç
   teklif verirse versin ₺0 / %0 gösteriyordu. Sorgu panel.js'te düzeltildi.
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
    document.getElementById('btnRefreshDashboard')?.addEventListener('click', () => loadDashboard(true));

    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
    const para = (n) => '₺' + fmt(n);

    // --- Dönem yardımcıları -------------------------------------------------
    // Pano "şu ana kadar toplam" diyordu; yönetim için asıl soru "geçen aya
    // göre ne durumdayım". Ay sınırları yerel saate göre.
    function ayBasi(kaydirma) {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth() + (kaydirma || 0), 1).getTime();
    }
    function araliktaMi(tarih, bas, bit) {
        if (!tarih) return false;
        const t = new Date(tarih).getTime();
        return isFinite(t) && t >= bas && (bit == null || t < bit);
    }

    async function loadDashboard(_zorla) {
        if (!supabaseClient) { root.innerHTML = '<p class="text-slate-500 text-sm">Veritabanı bağlantısı yok.</p>'; return; }
        root.innerHTML = '<p class="text-slate-400 text-sm">Veriler toplanıyor...</p>';

        const v = (typeof window.epcPanelVeri === 'function') ? await window.epcPanelVeri(_zorla) : null;
        if (!v) { root.innerHTML = '<p class="text-slate-500 text-sm">Veriler alınamadı. Sayfayı yenileyip tekrar deneyin.</p>'; return; }

        const leads = v.leads || [];
        const quotes = v.quotes || [];       // panel.js'te normalize edildi (taslak/gonderildi/kabul/ret)
        const projects = v.projects || [];
        const services = v.services || [];

        // Süreç adımları CRM ile aynı olsun: pano eski 7'li aşama sözlüğünü
        // kullanıyordu, CRM ise yöneticinin tanımladığı adımları gösteriyordu.
        // Aynı müşteri iki ekranda iki farklı aşamada görünüyordu.
        let steps = [];
        try { if (typeof ensureProcessSteps === 'function') steps = await ensureProcessSteps() || []; } catch (e) { steps = []; }

        const adimSayilari = {};
        if (steps.length && typeof crmCurrentStep === 'function') {
            steps.forEach(s => { adimSayilari[s.slug] = 0; });
            leads.forEach(l => { const c = crmCurrentStep(l, steps); if (c) adimSayilari[c.slug] = (adimSayilari[c.slug] || 0) + 1; });
        }

        // Eski aşama kovaları (adım tanımlı değilse yedek)
        const leadByStatus = {};
        leads.forEach(l => { leadByStatus[l.status] = (leadByStatus[l.status] || 0) + 1; });

        // --- Teklifler
        const q = { count: quotes.length, taslak: 0, gonderildi: 0, kabul: 0, ret: 0, wonAmount: 0, totalAmount: 0 };
        quotes.forEach(x => {
            if (q[x.status] !== undefined) q[x.status]++;
            q.totalAmount += Number(x.total_amount) || 0;
            if (x.status === 'kabul') q.wonAmount += Number(x.total_amount) || 0;
        });
        // SONUÇLANAN = kabul + ret. Eskiden "gonderildi" de sayılıyordu: yanıt
        // bekleyen teklifler sonuçlanmış gibi paydaya giriyor, dönüşüm oranı
        // olduğundan düşük çıkıyordu.
        const sonuclanan = q.kabul + q.ret;
        const conversion = sonuclanan > 0 ? Math.round(q.kabul / sonuclanan * 100) : null;

        // --- Servisler
        const svcTotal = services.length;
        const svcDone = services.filter(s => s.status === 'tamamlandi').length;
        const svcActive = svcTotal - svcDone;

        // --- Bu ay / geçen ay
        const buAy = ayBasi(0), gecenAy = ayBasi(-1);
        const donem = {
            leadBu:   leads.filter(l => araliktaMi(l.created_at, buAy)).length,
            leadGec:  leads.filter(l => araliktaMi(l.created_at, gecenAy, buAy)).length,
            teklifBu: quotes.filter(x => araliktaMi(x.created_at, buAy)).length,
            teklifGec: quotes.filter(x => araliktaMi(x.created_at, gecenAy, buAy)).length,
            kazanBu:  quotes.filter(x => x.status === 'kabul' && araliktaMi(x.created_at, buAy)).reduce((a, x) => a + (Number(x.total_amount) || 0), 0),
            kazanGec: quotes.filter(x => x.status === 'kabul' && araliktaMi(x.created_at, gecenAy, buAy)).reduce((a, x) => a + (Number(x.total_amount) || 0), 0),
            tesisBu:  projects.filter(p => araliktaMi(p.created_at, buAy)).length
        };
        // Tarih alanı hiç gelmiyorsa dönem kutusunu basmıyoruz: sıfır göstermek
        // "bu ay hiç iş olmadı" demek olur, oysa bilmiyoruz.
        const tarihVar = leads.some(l => l.created_at) || quotes.some(x => x.created_at);

        const eksik = [];
        if (!v.leads) eksik.push('müşteri kayıtları');
        if (!v.quotes) eksik.push('teklifler');
        if (!v.projects) eksik.push('tesisler');
        if (!v.services) eksik.push('servis talepleri');

        render({
            eksik, steps, adimSayilari,
            leadTotal: leads.length, leadByStatus,
            q, conversion, sonuclanan,
            projects: projects.length,
            svcTotal, svcDone, svcActive,
            donem, tarihVar,
            adminMi: !!(window.currentUserProfile && window.currentUserProfile.role === 'admin')
        });
    }

    // KPI kartı. Değişim oku varsa yönü ve rengi de taşır.
    const kpi = (label, val, cls, alt) => `
        <div class="kart p-4 border-l-4 ${cls}">
            <div class="text-[11px] text-slate-400 font-bold uppercase tracking-wider">${label}</div>
            <div class="text-2xl font-black text-slate-800 mt-1">${val}</div>
            ${alt || ''}
        </div>`;

    // Değişim etiketi: "geçen aya göre" karşılaştırması.
    // Önceki dönem 0 iken yüzde hesaplamıyoruz (0'dan artış oransız olur);
    // bunun yerine sayıyı söylüyoruz.
    function fark(bu, gecen, birim) {
        if (!isFinite(bu) || !isFinite(gecen)) return '';
        if (gecen === 0 && bu === 0) return `<div class="text-[11px] text-slate-400 mt-0.5">Geçen ay da yoktu</div>`;
        if (gecen === 0) return `<div class="text-[11px] font-bold text-emerald-600 mt-0.5">↑ geçen ay hiç yoktu</div>`;
        const p = Math.round((bu - gecen) / gecen * 100);
        const renk = p > 0 ? 'text-emerald-600' : (p < 0 ? 'text-red-500' : 'text-slate-400');
        const ok = p > 0 ? '↑' : (p < 0 ? '↓' : '→');
        return `<div class="text-[11px] font-bold ${renk} mt-0.5">${ok} %${Math.abs(p)} <span class="text-slate-400 font-medium">geçen aya göre (${fmt(gecen)}${birim || ''})</span></div>`;
    }

    function render(a) {
        // --- Hat: yönetici adımları tanımladıysa onları, yoksa eski aşamaları
        const hatKalemleri = a.steps.length
            ? a.steps.map(s => ({ ad: `${s.step_no || ''}. ${s.title}`, sayi: a.adimSayilari[s.slug] || 0 }))
            : ['yeni_basvuru', 'arandi_gorusuldu', 'teklif_gonderildi', 'sozlesme_imzalandi', 'kurulum_basladi', 'resmi_surec', 'tamamlandi']
                .map(s => ({
                    ad: (typeof stageLabel === 'function') ? stageLabel(s)
                        : ((typeof crmStatusLabels !== 'undefined' && crmStatusLabels[s]) ? crmStatusLabels[s].text : s),
                    sayi: a.leadByStatus[s] || 0
                }));
        const maxc = Math.max(1, ...hatKalemleri.map(x => x.sayi));
        const funnel = hatKalemleri.map(x => {
            const w = Math.round((x.sayi / maxc) * 100);
            return `
                <div class="flex items-center gap-3 mb-2">
                    <div class="w-36 md:w-48 text-xs text-slate-600 font-bold shrink-0 truncate" title="${admEscape(x.ad)}">${admEscape(x.ad)}</div>
                    <div class="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden"><div class="h-full ${x.sayi ? 'bg-amber-500' : ''} rounded-full transition-all" style="width:${w}%"></div></div>
                    <div class="w-8 text-right text-sm font-black text-slate-700 tabular-nums">${x.sayi}</div>
                </div>`;
        }).join('');

        const qRow = (label, val, cls = 'text-slate-800') =>
            `<div class="flex justify-between py-1.5 border-b border-slate-50"><span class="text-slate-500">${label}</span><strong class="${cls}">${val}</strong></div>`;

        const uyari = (a.eksik && a.eksik.length) ? `
            <div class="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 mb-6 text-sm">
                <b>Eksik veri:</b> ${a.eksik.join(', ')} okunamadı. Aşağıdaki sayılar bu kaynakları
                <b>içermiyor</b>; eksik bölümleri sıfır olarak yorumlamayın.
            </div>` : '';

        const adminNotu = a.adminMi ? `
            <div class="bg-slate-900 text-slate-200 rounded-xl p-3 mb-4 text-xs">
                👑 <b>Admin görünümü:</b> bu sayılar tek bir firmanın değil, <b>tüm platformun</b> toplamıdır.
            </div>` : '';

        root.innerHTML = `
            ${uyari}${adminNotu}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                ${kpi('Toplam Müşteri', fmt(a.leadTotal), 'border-l-blue-500', a.tarihVar ? fark(a.donem.leadBu, a.donem.leadGec) : '')}
                ${kpi('Kazanılan İş', para(a.q.wonAmount), 'border-l-emerald-500', a.tarihVar ? fark(a.donem.kazanBu, a.donem.kazanGec, ' ₺') : '')}
                ${kpi('Kurulu Tesis', fmt(a.projects), 'border-l-amber-500', a.tarihVar && a.donem.tesisBu ? `<div class="text-[11px] font-bold text-emerald-600 mt-0.5">↑ bu ay ${a.donem.tesisBu}</div>` : '')}
                ${kpi('Aktif Servis', fmt(a.svcActive), 'border-l-slate-500', a.svcTotal ? `<div class="text-[11px] text-slate-400 mt-0.5">${a.svcDone} tamamlandı</div>` : '')}
            </div>

            <div class="kart p-5 mb-6">
                <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
                    <h3 class="text-sm font-black text-slate-800">📊 Müşteri Hattı</h3>
                    <span class="text-[11px] text-slate-400">${a.steps.length ? 'Yöneticinin tanımladığı süreç adımlarına göre — CRM ile aynı' : 'Aşamalara göre'}</span>
                </div>
                ${funnel}
                ${a.leadTotal === 0 ? '<p class="text-xs text-slate-400 mt-2">Henüz müşteri kaydı yok.</p>' : ''}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="kart p-5">
                    <h3 class="text-sm font-black text-slate-800 mb-3">📄 Teklif Özeti</h3>
                    <div class="text-center bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-3">
                        <div class="text-[11px] text-emerald-700 font-bold uppercase">Dönüşüm Oranı</div>
                        <div class="text-3xl font-black text-emerald-700">${a.conversion === null ? '—' : '%' + a.conversion}</div>
                        <div class="text-[11px] text-slate-500 mt-1">${a.conversion === null
                            ? 'Henüz sonuçlanmış (kabul/ret) teklif yok'
                            : `${a.q.kabul} kabul / ${a.sonuclanan} sonuçlanan teklif${a.q.gonderildi ? ` · ${a.q.gonderildi} yanıt bekliyor` : ''}`}</div>
                    </div>
                    <div class="text-xs">
                        ${qRow('Toplam teklif', fmt(a.q.count))}
                        ${qRow('Taslak', fmt(a.q.taslak))}
                        ${qRow('Gönderildi (yanıt bekliyor)', fmt(a.q.gonderildi), 'text-blue-700')}
                        ${qRow('Kabul', fmt(a.q.kabul), 'text-emerald-700')}
                        ${qRow('Ret', fmt(a.q.ret), 'text-red-600')}
                        ${qRow('Toplam teklif tutarı', para(a.q.totalAmount))}
                        ${qRow('Kazanılan iş', para(a.q.wonAmount), 'text-emerald-700')}
                    </div>
                    <p class="text-[10px] text-slate-400 mt-3">Tutarlar KDV dahildir; teklif çıktısında müşteriye gösterilen rakamla aynıdır.</p>
                </div>

                <div class="kart p-5">
                    <h3 class="text-sm font-black text-slate-800 mb-3">🔧 Servis Özeti</h3>
                    <div class="grid grid-cols-3 gap-3 text-center">
                        <div class="bg-slate-50 rounded-xl p-4"><div class="text-2xl font-black text-slate-800">${fmt(a.svcTotal)}</div><div class="text-[11px] text-slate-400 font-bold uppercase">Toplam</div></div>
                        <div class="bg-amber-50 rounded-xl p-4"><div class="text-2xl font-black text-amber-700">${fmt(a.svcActive)}</div><div class="text-[11px] text-slate-400 font-bold uppercase">Aktif</div></div>
                        <div class="bg-emerald-50 rounded-xl p-4"><div class="text-2xl font-black text-emerald-700">${fmt(a.svcDone)}</div><div class="text-[11px] text-slate-400 font-bold uppercase">Tamamlanan</div></div>
                    </div>
                    ${a.tarihVar ? `
                    <div class="mt-4 pt-4 border-t border-slate-100">
                        <h4 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Bu ay</h4>
                        <div class="grid grid-cols-3 gap-3 text-center text-xs">
                            <div><div class="text-lg font-black text-slate-800">${fmt(a.donem.leadBu)}</div><div class="text-[11px] text-slate-400">yeni müşteri</div></div>
                            <div><div class="text-lg font-black text-slate-800">${fmt(a.donem.teklifBu)}</div><div class="text-[11px] text-slate-400">teklif</div></div>
                            <div><div class="text-lg font-black text-emerald-700">${para(a.donem.kazanBu)}</div><div class="text-[11px] text-slate-400">kazanılan</div></div>
                        </div>
                    </div>` : ''}
                    <p class="text-[11px] text-slate-400 mt-4">Aktif servisler, tamamlanmamış bakım/temizlik/arıza talepleridir. Detay için "Bana Atanan Servisler" ekranını kullanın.</p>
                </div>
            </div>`;
    }

    window.loadDashboard = loadDashboard;
})();
