/* ============================================================================
   consultants.js — DANIŞMANLIK AL (Ziyaretçi Modülü) — "YAKINDA"
   openPublicModule('consultantsModule') ile açılır.

   Akış (planlanan):
   - Danışmanlar "Kurumsal EPC Girişi"nden kayıt olur.
   - Ziyaretçi bu modülden kayıtlı danışmanları listeler:
     özgeçmiş, motivasyon, tamamlanan işler, uzmanlık etiketleri.
   Şimdilik tanıtım + örnek profil önizlemesi gösterilir.
   Gerçek listeleme aktif olunca SAMPLE yerine Supabase verisi bağlanır.
   ============================================================================ */
(function () {
    const root = document.getElementById('consultantsRoot');
    if (!root) return;

    document.getElementById('btnBackFromConsultants')?.addEventListener('click', () => {
        if (typeof closeAllAndShowMenu === 'function') closeAllAndShowMenu();
    });

    // Örnek danışman profilleri (yalnız önizleme amaçlı)
    const SAMPLE = [
        { initials: 'MA', name: 'Örnek Danışman', title: 'Elektrik Y. Müh. · GES Proje & Uygulama', rating: '4.9', jobs: 42, tags: ['Çatı GES', 'TEDAŞ Süreci', 'Hibrit Sistem'],
          bio: 'Konut ve ticari çatı kurulumlarında saha ve proje deneyimi. Fizibiliteden devreye almaya bağımsız danışmanlık.' },
        { initials: 'SB', name: 'Örnek Danışman', title: 'Enerji Yöneticisi · Batarya & Ada Sistemleri', rating: '5.0', jobs: 28, tags: ['Batarya', 'Off-grid', 'Enerji Verimliliği'],
          bio: 'Kesinti riski yüksek bölgelerde batarya boyutlandırma ve yedekleme senaryoları konusunda uzman.' },
        { initials: 'TK', name: 'Örnek Danışman', title: 'Mali Müşavir · Teşvik & Amortisman', rating: '4.8', jobs: 35, tags: ['Teşvikler', 'Amortisman', 'Vergi'],
          bio: 'GES yatırımlarının geri ödeme analizi, teşvik başvuruları ve muhasebe süreçlerinde rehberlik.' },
    ];

    function card(c) {
        return `
            <div class="relative bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <span class="absolute top-3 right-3 bg-slate-100 text-slate-400 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Örnek</span>
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg">${c.initials}</div>
                    <div>
                        <p class="font-black text-slate-800 leading-tight">${c.name}</p>
                        <p class="text-[11px] text-slate-500">${c.title}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3 text-xs text-slate-500 mb-3">
                    <span>⭐ ${c.rating}</span><span class="text-slate-300">•</span><span>${c.jobs} tamamlanan iş</span>
                </div>
                <p class="text-sm text-slate-600 mb-3">${c.bio}</p>
                <div class="flex flex-wrap gap-1.5 mb-4">
                    ${c.tags.map(t => `<span class="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-full">${t}</span>`).join('')}
                </div>
                <button disabled class="w-full bg-slate-100 text-slate-400 font-bold py-2.5 rounded-lg cursor-not-allowed">Profili Gör (yakında)</button>
            </div>
        `;
    }

    root.innerHTML = `
        <!-- Tanıtım / Hero -->
        <div class="bg-gradient-to-br from-indigo-600 to-slate-900 text-white rounded-2xl p-8 mb-8 text-center">
            <span class="inline-block bg-white/15 text-white text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider mb-4">🎯 Çok Yakında</span>
            <h2 class="text-2xl md:text-3xl font-black mb-3">Bağımsız Solar Danışmanları</h2>
            <p class="text-indigo-100 max-w-2xl mx-auto text-sm md:text-base">Yatırım kararınızı satıcıdan bağımsız, tarafsız uzmanlarla verin. Yakında; alanında deneyimli danışmanların <strong>özgeçmişini, motivasyonunu ve tamamladığı işleri</strong> inceleyip size en uygun profesyonelle iletişime geçebileceksiniz.</p>
        </div>

        <!-- Nasıl çalışacak -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-5">
                <div class="text-3xl mb-2">🔎</div><h3 class="font-black text-slate-800 mb-1">Keşfet</h3><p class="text-sm text-slate-500">Uzmanlık alanına, puana ve tamamlanan işe göre danışmanları filtreleyin.</p>
            </div>
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-5">
                <div class="text-3xl mb-2">📄</div><h3 class="font-black text-slate-800 mb-1">İncele</h3><p class="text-sm text-slate-500">Özgeçmiş, motivasyon yazısı ve referans projeleri şeffafça görün.</p>
            </div>
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-5">
                <div class="text-3xl mb-2">🤝</div><h3 class="font-black text-slate-800 mb-1">Bağlan</h3><p class="text-sm text-slate-500">Doğru danışmanla iletişime geçin, tarafsız görüş alın.</p>
            </div>
        </div>

        <!-- Örnek profil önizlemesi -->
        <div class="flex items-center gap-3 mb-4">
            <h3 class="text-lg font-black text-slate-800">Profiller böyle görünecek</h3>
            <span class="text-[11px] text-slate-400">(örnek önizleme)</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 opacity-90">
            ${SAMPLE.map(card).join('')}
        </div>

        <!-- CTA'lar -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-indigo-50 border border-indigo-200 rounded-2xl p-6">
                <h3 class="font-black text-slate-800 mb-1">Danışman mısınız?</h3>
                <p class="text-sm text-slate-600 mb-4">Sektörde danışmanlık veriyorsanız, Kurumsal EPC girişinden kayıt olarak profilinizi oluşturun; açıldığında ziyaretçilere görünün.</p>
                <a href="#auth" class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm">Kurumsal EPC Girişi ›</a>
            </div>
            <div class="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                <h3 class="font-black text-slate-800 mb-1">Haberdar olun</h3>
                <p class="text-sm text-slate-600 mb-4">Danışmanlık modülü aktif olduğunda haberdar olmak ister misiniz? Talebinizi bırakın.</p>
                <button id="btnConsultNotify" class="bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-lg text-sm">Beni Bilgilendir</button>
            </div>
        </div>
    `;

    document.getElementById('btnConsultNotify')?.addEventListener('click', () => {
        // Şimdilik yer tutucu; ileride e-posta yakalama / RPC bağlanabilir.
        alert('Teşekkürler! Danışmanlık modülü aktif olduğunda sizi bilgilendireceğiz.');
    });
})();
