/* ============================================================================
   mevzuat.js — DAĞITIM ŞİRKETİ REHBERİ + BELGE LİSTESİ + MEVZUAT TAKİBİ
   process.js'in bastığı genel süreç çizelgesinin ALTINA eklenir.

   TASARIMIN TEMEL KURALI:
   Bu ekran para ve zaman kararı verdiren bir ekran. Elimizde doğrulanmış veri
   yoksa, BOŞLUĞU DOLDURMAYIZ — eksik olduğunu söyler ve resmi kaynağa
   yönlendiririz. Doğrulanmamış veya bayatlamış satır asla kesin bilgi gibi
   basılmaz. Yanlış yönlendirmenin maliyeti, eksik bilgi vermekten yüksektir.
   ============================================================================ */
(function () {
    'use strict';

    const BAYATLAMA_GUN = 180;   // bu süreden eski doğrulama "tazelenmeli" sayılır

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Kullanıcı metninden gelen adresi yalnız http(s) ise bağlantıya çeviririz.
    function guvenliUrl(u) {
        const t = String(u || '').trim();
        return /^https?:\/\//i.test(t) ? t : null;
    }
    const tarihTr = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : null;
    function gunFarki(d) {
        if (!d) return null;
        return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    }

    let _sirketler = [], _guncellemeler = [], _secili = null;

    function root() { return document.getElementById('mevzuatRoot'); }

    window.renderMevzuat = async function () {
        const r = root(); if (!r) return;
        if (!window.supabaseClient) { r.innerHTML = ''; return; }
        r.innerHTML = '<p class="text-slate-400 text-sm">Dağıtım şirketi bilgileri yükleniyor…</p>';
        try {
            const [s, g] = await Promise.all([
                supabaseClient.from('dagitim_sirketleri').select('*').order('sort_order'),
                supabaseClient.from('mevzuat_guncellemeler').select('*').order('tarih', { ascending: false }).limit(20)
            ]);
            if (s.error) throw s.error;
            _sirketler = s.data || [];
            _guncellemeler = (g && !g.error && g.data) ? g.data : [];
        } catch (e) {
            // Tablo henüz kurulmadıysa bölümü hiç gösterme — yarım arayüz çıkmasın.
            r.innerHTML = ''; return;
        }
        if (!_sirketler.length) { r.innerHTML = ''; return; }
        ciz();
    };

    function ciz() {
        const r = root(); if (!r) return;
        const iller = [];
        _sirketler.forEach(s => (s.iller || []).forEach(il => iller.push({ il, kod: s.kod })));
        iller.sort((a, b) => a.il.localeCompare(b.il, 'tr'));

        r.innerHTML = `
        <div class="mt-10 pt-8 border-t border-slate-200">
            <h3 class="text-lg font-black text-slate-800 mb-1">🏢 Bölgenizdeki dağıtım şirketi</h3>
            <p class="text-sm text-slate-500 mb-4" style="max-width:var(--measure)">Başvuru kanalı, istenen evrak ve süreler <b>her dağıtım şirketinde
               farklıdır</b>. İlinizi seçin; muhatabınızın kim olduğunu ve resmi kaynağını görün.</p>
            <select id="mevzuatIl" onchange="mevzuatIlSec(this.value)"
                class="w-full md:w-80 border border-slate-300 p-2.5 rounded-lg text-sm bg-white">
                <option value="">İlinizi seçin…</option>
                ${iller.map(x => `<option value="${esc(x.kod)}">${esc(x.il)}</option>`).join('')}
            </select>
            <div id="mevzuatSirket" class="mt-4"></div>
            <div id="mevzuatBelge" class="mt-4"></div>
        </div>
        ${guncellemelerHtml()}`;
        if (_secili) { const s = document.getElementById('mevzuatIl'); if (s) s.value = _secili; mevzuatIlSec(_secili); }
    }

    function tazelikRozeti(sirket) {
        if (!sirket.dogrulandi_mi) {
            return `<span class="text-[11px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">⚠️ Teyit edilmedi</span>`;
        }
        const g = gunFarki(sirket.dogrulama_tarihi);
        if (g == null) return '';
        if (g > BAYATLAMA_GUN) {
            return `<span class="text-[11px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">⚠️ ${g} gündür tazelenmedi</span>`;
        }
        return `<span class="text-[11px] font-black px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">✓ ${tarihTr(sirket.dogrulama_tarihi)} tarihinde teyit edildi</span>`;
    }

    window.mevzuatIlSec = async function (kod) {
        _secili = kod || null;
        const kutu = document.getElementById('mevzuatSirket');
        const belgeKutu = document.getElementById('mevzuatBelge');
        if (!kutu) return;
        if (!kod) { kutu.innerHTML = ''; if (belgeKutu) belgeKutu.innerHTML = ''; return; }
        const s = _sirketler.find(x => x.kod === kod);
        if (!s) { kutu.innerHTML = ''; return; }

        const site = guvenliUrl(s.web_site), basvuru = guvenliUrl(s.basvuru_url);
        const eksik = !site && !basvuru;

        kutu.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-xl p-5">
            <div class="flex items-start justify-between gap-3 flex-wrap mb-2">
                <div class="min-w-0">
                    <p class="font-black text-slate-800">${esc(s.ad)}${s.kisa_ad ? ` <span class="text-slate-400 font-bold">(${esc(s.kisa_ad)})</span>` : ''}</p>
                    <p class="text-xs text-slate-500 mt-0.5">${(s.iller || []).map(esc).join(' · ')}</p>
                </div>
                ${tazelikRozeti(s)}
            </div>
            ${eksik ? `
                <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 mt-2">
                    Bu şirketin başvuru kanalı ve iletişim bilgileri <b>sistemimizde henüz doğrulanmadı</b>.
                    Uydurma bilgi vermemek için boş bırakıyoruz. Güncel bilgiyi şirketin <b>kendi resmi
                    sitesinden</b> teyit edin; danışmanımız da süreci sizin adınıza yürütebilir.
                </div>` : `
                <div class="flex flex-wrap gap-2 mt-3">
                    ${site ? `<a href="${esc(site)}" target="_blank" rel="noopener noreferrer"
                        class="text-xs font-bold px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Resmi site ↗</a>` : ''}
                    ${basvuru ? `<a href="${esc(basvuru)}" target="_blank" rel="noopener noreferrer"
                        class="text-xs font-bold px-3 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700">Lisanssız üretim başvurusu ↗</a>` : ''}
                    ${s.telefon ? `<span class="text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 text-slate-600">☎ ${esc(s.telefon)}</span>` : ''}
                </div>`}
            ${s.notlar ? `<p class="text-xs text-slate-500 mt-3 leading-relaxed">${esc(s.notlar)}</p>` : ''}
        </div>`;

        if (belgeKutu) { belgeKutu.innerHTML = '<p class="text-slate-400 text-sm">Belge listesi yükleniyor…</p>'; belgeleriGetir(kod); }
    };

    const ASAMA_AD = { basvuru: 'Başvuru', proje: 'Proje ve onay', kurulum: 'Kurulum', kabul: 'Kabul ve devreye alma', isletme: 'İşletme' };

    async function belgeleriGetir(kod) {
        const kutu = document.getElementById('mevzuatBelge'); if (!kutu) return;
        let veri = [];
        try {
            // Hem bu şirkete özel hem tüm Türkiye için ortak (sirket_kod null) satırlar
            const { data, error } = await supabaseClient.from('mevzuat_belgeleri')
                .select('*').or(`sirket_kod.eq.${kod},sirket_kod.is.null`)
                .order('asama').order('sira');
            if (error) throw error;
            veri = data || [];
        } catch (e) { kutu.innerHTML = ''; return; }

        if (!veri.length) {
            kutu.innerHTML = `
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-5">
                <p class="font-bold text-slate-700 text-sm mb-1">Belge listesi henüz yayınlanmadı</p>
                <p class="text-sm text-slate-500 leading-relaxed">Bu şirket için istenen evrak listesini,
                   resmi kaynaktan teyit etmeden yayınlamıyoruz. Eksik listeyle yola çıkmak, olmayan bir
                   belgeyi zorunlu sanmanıza ya da gerçekten gereken birini atlamanıza yol açar.
                   Yukarıdaki genel süreç adımları yol haritası olarak geçerlidir.</p>
            </div>`;
            return;
        }

        const gruplar = {};
        veri.forEach(b => { (gruplar[b.asama] = gruplar[b.asama] || []).push(b); });
        const enEskiDogrulama = veri.map(b => b.dogrulama_tarihi).filter(Boolean).sort()[0];
        const bayat = enEskiDogrulama ? gunFarki(enEskiDogrulama) > BAYATLAMA_GUN : true;

        kutu.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-xl p-5">
            <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
                <p class="font-black text-slate-800">📄 İstenen belgeler</p>
                ${bayat ? '<span class="text-[11px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-800">⚠️ Listeyi resmi kaynaktan teyit edin</span>'
                        : `<span class="text-[11px] font-black px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">✓ ${tarihTr(enEskiDogrulama)} itibarıyla</span>`}
            </div>
            ${Object.keys(gruplar).map(as => `
                <div class="mb-4">
                    <p class="text-[11px] uppercase tracking-wider font-black text-slate-400 mb-2">${esc(ASAMA_AD[as] || as)}</p>
                    <ul class="space-y-1.5">
                        ${gruplar[as].map(b => {
                            const k = guvenliUrl(b.kaynak_url);
                            return `<li class="flex gap-2 text-sm">
                                <span class="${b.zorunlu_mu ? 'text-emerald-600' : 'text-slate-300'} shrink-0">${b.zorunlu_mu ? '●' : '○'}</span>
                                <span class="min-w-0">
                                    <b class="text-slate-700">${esc(b.belge_adi)}</b>
                                    ${b.zorunlu_mu ? '' : ' <span class="text-[11px] text-slate-400">(opsiyonel)</span>'}
                                    ${b.aciklama ? `<span class="block text-xs text-slate-500 leading-relaxed">${esc(b.aciklama)}</span>` : ''}
                                    ${b.nereden_alinir ? `<span class="block text-[11px] text-slate-400">Nereden: ${esc(b.nereden_alinir)}</span>` : ''}
                                    ${k ? `<a href="${esc(k)}" target="_blank" rel="noopener noreferrer" class="text-[11px] font-bold text-indigo-600 hover:underline">kaynak ↗</a>` : ''}
                                </span></li>`;
                        }).join('')}
                    </ul>
                </div>`).join('')}
            <p class="text-[11px] text-slate-400 leading-relaxed border-t border-slate-100 pt-3">
                Bu liste bilgilendirme amaçlıdır ve dağıtım şirketinin güncel uygulamasıyla farklılık gösterebilir.
                Başvuru öncesi şirketin resmi kaynağından teyit edin.</p>
        </div>`;
    }

    function guncellemelerHtml() {
        if (!_guncellemeler.length) return '';
        const onemCls = { kritik: 'bg-red-100 text-red-800', normal: 'bg-slate-100 text-slate-700', bilgi: 'bg-blue-100 text-blue-800' };
        // toUpperCase() Türkçe'de "kritik" → "KRITIK" yapıyor (noktasız İ sorunu);
        // etiketleri elle yazıyoruz.
        const onemAd = { kritik: 'KRİTİK', normal: 'NORMAL', bilgi: 'BİLGİ' };
        return `
        <div class="mt-8 pt-6 border-t border-slate-200">
            <h3 class="text-lg font-black text-slate-800 mb-1">📌 Mevzuat güncellemeleri</h3>
            <p class="text-sm text-slate-500 mb-4">Süreci etkileyen değişiklikler, kaynağıyla birlikte.</p>
            <div class="space-y-2">
                ${_guncellemeler.map(g => {
                    const k = guvenliUrl(g.kaynak_url);
                    return `<div class="bg-white border border-slate-200 rounded-lg p-4">
                        <div class="flex items-center gap-2 flex-wrap mb-1">
                            <span class="text-[11px] font-black px-2 py-0.5 rounded ${onemCls[g.onem] || onemCls.normal}">${esc(onemAd[g.onem] || onemAd.normal)}</span>
                            <span class="text-[11px] text-slate-400">${tarihTr(g.tarih)}${g.kaynak_kurum ? ' · ' + esc(g.kaynak_kurum) : ''}</span>
                            ${g.yururluk_tarihi ? `<span class="text-[11px] font-bold text-amber-700">yürürlük: ${tarihTr(g.yururluk_tarihi)}</span>` : ''}
                        </div>
                        <p class="font-bold text-slate-800 text-sm">${esc(g.baslik)}</p>
                        ${g.ozet ? `<p class="text-sm text-slate-600 leading-relaxed mt-1">${esc(g.ozet)}</p>` : ''}
                        ${(g.etkilenen_sirketler || []).length ? `<p class="text-[11px] text-slate-400 mt-1">Etkilenen: ${g.etkilenen_sirketler.map(k2 => {
                            const s = _sirketler.find(x => x.kod === k2); return esc(s ? (s.kisa_ad || s.ad) : k2); }).join(' · ')}</p>` : ''}
                        ${k ? `<a href="${esc(k)}" target="_blank" rel="noopener noreferrer" class="text-[11px] font-bold text-indigo-600 hover:underline">kaynağı aç ↗</a>` : ''}
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }
})();
