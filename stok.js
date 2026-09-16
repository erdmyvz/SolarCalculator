/* ============================================================================
   stok.js — STOK & MALİYET (Kurulumcu Firma Modülü)

   Üç ekran, tek soruyu cevaplıyor: "Bu işi yapmak bana kaça mal olur?"
     · Depom            — elimde ne var, ortalama kaça aldım (basit sayaç)
     · Tedarikçi Stoğu  — hangi üründen NEREDE kaç adet var, fiyatı ne
     · Fiyatlandırma    — ihtiyaç − elde = eksik → en yakın tedarikçi → maliyet

   KONUM MODÜLÜN SEBEBİ. En yakın depodan alan firma nakliyeden ve süreden
   kazanır; liste bu yüzden fiyata değil ÖNCE yakınlığa göre sıralanır
   (aynı ilçe → aynı il → aynı bölge → diğer).

   FİYAT GÖRÜNÜRLÜĞÜ tedarikçinin kararıdır ve sunucuda uygulanır. Gizli
   fiyat buraya hiç gelmez; "fiyat teklifi iste" düğmesi çıkar.

   stok-fiyatlandirma.sql çalıştırılmış olmalıdır.
   ============================================================================ */
(function () {
    'use strict';

    const kok = () => document.getElementById('stokRoot');
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const sayi = (n, b) => (n == null || n === '' || isNaN(n)) ? '—'
        : Number(n).toLocaleString('tr-TR', { maximumFractionDigits: b == null ? 2 : b });

    // Beş ürün ailesiyle başlıyoruz — kullanıcının saydığı sırayla.
    const KAT = [
        ['panel',    'Güneş Paneli'],
        ['inverter', 'İnverter'],
        ['battery',  'Depolama'],
        ['cable',    'Kablo ve Bağlantı'],
        ['mounting', 'Konstrüksiyon']
    ];
    const katAd = (k) => (KAT.find(x => x[0] === k) || [k, k])[1];

    const BIRIMLER = ['adet', 'metre', 'takım', 'kWh'];
    // EUR kuru sistemde tutulmuyor; uydurulmuş bir kurla toplam çıkarmaktansa
    // para birimini ikiyle sınırlıyoruz. Kur geldiğinde buraya eklenir.
    const PARALAR = ['USD', 'TRY'];

    const YAKINLIK = [
        ['Aynı ilçe',  'bg-emerald-100 text-emerald-700'],
        ['Aynı il',    'bg-sky-100 text-sky-700'],
        ['Aynı bölge', 'bg-amber-100 text-amber-800'],
        ['Uzak',       'bg-slate-100 text-slate-500']
    ];

    let _alanlar = {};           // kategori -> [{anahtar,etiket,birim,tip,secenek}]
    let _depo = [];              // company_stock
    let _tedarik = [];           // list_supplier_stock sonucu
    let _sekme = 'depo';
    let _hata = null;
    let _tedarikHata = null;
    let _filtre = { kategori: 'panel', il: '', ilce: '', arama: '' };
    let _fiyat = { kwp: 10, satirlar: null };
    let _yuklendi = false;

    const firmaId = () => (window.currentUserProfile && window.currentUserProfile.company_id) || null;
    const kur = () => (typeof window.epcKur === 'function' ? Number(window.epcKur()) : 0) || 0;

    // USD'ye çevir. Kur yoksa çevirme — yanlış toplam, toplam olmamasından kötüdür.
    // ⚠️ null/boş MUTLAKA null dönmeli: Number(null) = 0'dır ve maliyeti
    // girilmemiş bir kalem "0 $" diye toplama girip teklifi olduğundan ucuz
    // gösterirdi. Bilinmeyen maliyet, sıfır maliyet DEĞİLDİR.
    function usd(tutar, para) {
        if (tutar == null || tutar === '') return null;
        const v = Number(tutar);
        if (!isFinite(v)) return null;
        if (para === 'USD' || !para) return v;
        if (para === 'TRY') { const k = kur(); return k > 0 ? v / k : null; }
        return null;
    }

    // ------------------------------------------------------------------ veri
    async function yukleAlanlar() {
        if (Object.keys(_alanlar).length) return;
        try {
            const { data } = await supabaseClient.from('stok_alanlari')
                .select('kategori,anahtar,etiket,birim,tip,secenek,sira').order('sira');
            (data || []).forEach(a => { (_alanlar[a.kategori] = _alanlar[a.kategori] || []).push(a); });
        } catch (e) { /* tablo yoksa teknik alanlar boş geçer */ }
    }

    async function yukleDepo() {
        const cid = firmaId();
        if (!cid) { _depo = []; _hata = 'Hesabınız bir firmaya bağlı görünmüyor.'; return; }
        try {
            const { data, error } = await supabaseClient.from('company_stock')
                .select('*').eq('company_id', cid).order('category_key').order('brand');
            if (error) throw error;
            _depo = data || []; _hata = null;
        } catch (e) { _hata = e.message || String(e); _depo = []; }
    }

    async function yukleTedarik() {
        try {
            const { data, error } = await supabaseClient.rpc('list_supplier_stock', {
                p_kategori: _filtre.kategori || null,
                p_il:       _filtre.il || null,
                p_ilce:     _filtre.ilce || null,
                p_arama:    _filtre.arama || null
            });
            if (error) throw error;
            _tedarik = data || []; _tedarikHata = null;
        } catch (e) { _tedarikHata = e.message || String(e); _tedarik = []; }
    }

    // ---------------------------------------------------------------- ortak
    function ust() {
        const sek = (k, ad, ek) => `<button onclick="stokSekme('${k}')" class="q-tab ${_sekme === k ? 'q-tab-on' : ''}">${ad}${ek ? ` <span class="opacity-60">${ek}</span>` : ''}</button>`;
        return `
            <div class="flex items-center gap-3 mb-4 flex-wrap">
                <button onclick="closeAllAndShowMenu()" class="text-slate-500 hover:text-indigo-600 font-bold text-sm">← Panele dön</button>
                <span class="text-slate-300">|</span>
                <div>
                    <h2 class="font-black text-slate-800 text-lg">Stok & Maliyet</h2>
                    <p class="text-xs text-slate-500">Elinizdeki malzeme, en yakın tedarikçi stoğu ve teklif öncesi maliyet tablosu.</p>
                </div>
            </div>
            <div class="flex gap-2 mb-4 flex-wrap">
                ${sek('depo', 'Depom', _depo.length || '')}
                ${sek('tedarik', 'Tedarikçi Stoğu', '')}
                ${sek('fiyat', 'Fiyatlandırma', '')}
            </div>`;
    }

    const hataKutu = (m) => m
        ? `<div class="bg-red-50 border border-red-100 rounded-xl p-4 mb-3"><p class="text-sm font-bold text-red-700">${esc(m)}</p></div>`
        : '';

    function bos(ikon, baslik, alt, dugme) {
        return `<div class="bos-durum"><span class="bos-durum-ico">${ikon}</span>
            <h4>${esc(baslik)}</h4><p>${esc(alt)}</p>${dugme || ''}</div>`;
    }

    // =========================================================== SEKME: DEPOM
    function cizDepo() {
        const r = kok();
        const grup = {};
        _depo.forEach(d => { (grup[d.category_key] = grup[d.category_key] || []).push(d); });

        const govde = _depo.length ? KAT.filter(k => grup[k[0]]).map(([k, ad]) => `
            <div class="mb-4">
                <h3 class="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">${esc(ad)}</h3>
                <div class="kart overflow-hidden">
                    ${grup[k].map(d => `
                        <div class="p-3.5 border-b border-slate-50 last:border-0 flex items-start justify-between gap-3 flex-wrap">
                            <div class="min-w-0">
                                <div class="font-bold text-slate-800 text-sm">${esc(d.brand)} ${esc(d.model)}</div>
                                <div class="text-[11px] text-slate-400 mt-0.5">${ozetMetin(d.specs, k)}</div>
                            </div>
                            <div class="flex items-center gap-4 shrink-0">
                                <div class="text-right">
                                    <div class="text-sm font-black text-slate-800">${sayi(d.quantity)} <span class="text-[11px] font-normal text-slate-400">${esc(d.unit)}</span></div>
                                    <div class="text-[11px] text-slate-400">${d.avg_cost != null ? 'ort. ' + sayi(d.avg_cost) + ' ' + esc(d.currency) : 'maliyet girilmemiş'}</div>
                                </div>
                                <button onclick="stokDuzenle('${d.id}')" title="Düzenle" class="text-slate-400 hover:text-indigo-600 px-1.5">✏️</button>
                                <button onclick="stokSil('${d.id}')" title="Sil" class="text-slate-400 hover:text-red-600 px-1.5">🗑️</button>
                            </div>
                        </div>`).join('')}
                </div>
            </div>`).join('')
            : bos('📦', 'Depo boş', 'Elinizdeki malzemeyi ekleyin; teklif hazırlarken eksik miktar buradan hesaplanır.',
                  '<button onclick="stokYeni()" class="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-lg text-sm">+ Kalem ekle</button>');

        r.innerHTML = ust() + hataKutu(_hata) + `
            <div class="flex justify-between items-center mb-3 flex-wrap gap-2">
                <p class="text-[11px] text-slate-400">Basit sayaç: elde kaç var, ortalama kaça alındı. Giriş/çıkış hareketi tutulmaz, siz güncellersiniz.</p>
                ${_depo.length ? '<button onclick="stokYeni()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg text-sm">+ Kalem ekle</button>' : ''}
            </div>` + govde;
    }

    function ozetMetin(specs, kat) {
        const alanlar = _alanlar[kat] || [];
        const s = specs || {};
        const par = alanlar.map(a => (s[a.anahtar] == null || s[a.anahtar] === '') ? null
            : `${esc(a.etiket)}: ${esc(s[a.anahtar])}${a.birim ? ' ' + esc(a.birim) : ''}`).filter(Boolean);
        return par.length ? par.join(' · ') : '<span class="italic">teknik bilgi girilmemiş</span>';
    }

    // ================================================ SEKME: TEDARİKÇİ STOĞU
    function cizTedarik() {
        const r = kok();
        const iller = Object.keys(window.EPC_IL_VERIM || {}).sort((a, b) => a.localeCompare(b, 'tr'));
        const ilOpt = '<option value="">— Tüm iller —</option>' +
            iller.map(i => `<option value="${esc(i)}" ${_filtre.il === i ? 'selected' : ''}>${esc(i)}</option>`).join('');
        const katOpt = KAT.map(([k, a]) => `<option value="${k}" ${_filtre.kategori === k ? 'selected' : ''}>${esc(a)}</option>`).join('');

        const satirlar = _tedarik.length ? _tedarik.map(t => {
            const y = YAKINLIK[Math.min(3, Number(t.yakinlik) || 0)];
            const konum = [t.ilce, t.il].filter(Boolean).join(' / ');
            const fiyat = t.fiyat_acik
                ? `<div class="text-sm font-black text-slate-800">${sayi(t.birim_fiyat)} ${esc(t.para_birimi)}<span class="text-[11px] font-normal text-slate-400">/${esc(t.fiyat_baz)}</span></div>
                   ${t.gecerlilik ? `<div class="text-[10px] text-slate-400">geçerlilik ${new Date(t.gecerlilik).toLocaleDateString('tr-TR')}</div>` : ''}`
                : `<button onclick="stokFiyatIste('${t.id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs whitespace-nowrap">Fiyat teklifi iste</button>`;
            return `
            <div class="p-3.5 border-b border-slate-50 last:border-0 flex items-start justify-between gap-3 flex-wrap">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-slate-800 text-sm">${esc(t.marka)} ${esc(t.model)}</span>
                        <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${y[1]}">${y[0]}</span>
                    </div>
                    <div class="text-[11px] text-slate-500 mt-0.5">📍 ${esc(konum)} · ${esc(t.tedarikci)}${t.termin ? ' · ' + t.termin + ' gün termin' : ''}</div>
                    <div class="text-[11px] text-slate-400 mt-0.5">${ozetMetin(t.ozellikler, t.kategori)}</div>
                </div>
                <div class="text-right shrink-0">
                    <div class="text-sm font-bold text-slate-700">${sayi(t.miktar)} <span class="text-[11px] font-normal text-slate-400">${esc(t.birim)}</span></div>
                    ${t.min_siparis ? `<div class="text-[10px] text-slate-400 mb-1">min. ${sayi(t.min_siparis)}</div>` : '<div class="mb-1"></div>'}
                    ${fiyat}
                </div>
            </div>`; }).join('')
            : bos('🔍', 'Eşleşen stok yok', 'Filtreyi genişletin. Tedarikçi stokları yönetici onayından sonra listede görünür.');

        r.innerHTML = ust() + hataKutu(_tedarikHata) + `
            <div class="kart p-3 mb-3">
                <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <select id="stKat" onchange="stokFiltre()" class="border border-slate-300 p-2 rounded-lg text-sm bg-white">${katOpt}</select>
                    <select id="stIl" onchange="stokFiltre()" class="border border-slate-300 p-2 rounded-lg text-sm bg-white">${ilOpt}</select>
                    <input id="stIlce" value="${esc(_filtre.ilce)}" oninput="stokFiltreGec()" placeholder="İlçe" class="border border-slate-300 p-2 rounded-lg text-sm">
                    <input id="stArama" value="${esc(_filtre.arama)}" oninput="stokFiltreGec()" placeholder="Marka veya model" class="border border-slate-300 p-2 rounded-lg text-sm">
                </div>
                <p class="text-[11px] text-slate-400 mt-2">Liste önce YAKINLIĞA göre sıralanır — en yakın depo nakliyeden ve süreden kazandırır. İlinizi seçmezseniz yakınlık hesaplanamaz.</p>
            </div>
            <div class="kart overflow-hidden">${satirlar}</div>`;
    }

    // ================================================= SEKME: FİYATLANDIRMA
    // İhtiyacı kullanıcı girer; uydurulmuş miktar üretmiyoruz. Panel adedi
    // kWp'den TÜRETİLİR (gerçek aritmetik), diğerleri elle girilir.
    function fiyatSatirlariKur() {
        if (_fiyat.satirlar) return;
        _fiyat.satirlar = KAT.map(([k, ad]) => ({ kategori: k, ad, ihtiyac: 0, birim: k === 'cable' ? 'metre' : 'adet' }));
    }

    function enUygunTedarik(kat) {
        // Fiyatı AÇIK olanlar arasından en yakın, eşitlikte en ucuz.
        const aday = _tedarik.filter(t => t.kategori === kat && t.fiyat_acik && usd(t.birim_fiyat, t.para_birimi) != null);
        if (!aday.length) return null;
        aday.sort((a, b) => (a.yakinlik - b.yakinlik) || (usd(a.birim_fiyat, a.para_birimi) - usd(b.birim_fiyat, b.para_birimi)));
        return aday[0];
    }

    function depoToplam(kat) {
        const satir = _depo.filter(d => d.category_key === kat);
        const adet = satir.reduce((s, d) => s + (Number(d.quantity) || 0), 0);
        let maliyet = 0, bilinen = 0;
        satir.forEach(d => {
            const u = usd(d.avg_cost, d.currency);
            if (u != null && Number(d.quantity) > 0) { maliyet += u * Number(d.quantity); bilinen += Number(d.quantity); }
        });
        return { adet, ortalama: bilinen > 0 ? maliyet / bilinen : null, bilinen };
    }

    function cizFiyat() {
        const r = kok();
        fiyatSatirlariKur();
        const k = kur();
        let toplam = 0, eksikBilinmeyen = 0;

        const satirlar = _fiyat.satirlar.map((s, i) => {
            const d = depoToplam(s.kategori);
            const ihtiyac = Number(s.ihtiyac) || 0;
            const elden = Math.min(ihtiyac, d.adet);
            const eksik = Math.max(0, ihtiyac - d.adet);
            const ted = enUygunTedarik(s.kategori);
            const tedFiyat = ted ? usd(ted.birim_fiyat, ted.para_birimi) : null;

            const eldenMaliyet = (d.ortalama != null) ? elden * d.ortalama : null;
            const eksikMaliyet = (tedFiyat != null) ? eksik * tedFiyat : null;
            let satirMaliyet = null;
            if ((elden === 0 || eldenMaliyet != null) && (eksik === 0 || eksikMaliyet != null)) {
                satirMaliyet = (eldenMaliyet || 0) + (eksikMaliyet || 0);
                toplam += satirMaliyet;
            } else if (ihtiyac > 0) { eksikBilinmeyen++; }

            const tedHucre = eksik === 0
                ? '<span class="text-slate-300">—</span>'
                : (ted
                    ? `<div class="text-xs font-bold text-slate-700">${sayi(tedFiyat)} $</div>
                       <div class="text-[10px] text-slate-400">${esc(ted.marka)} · ${esc([ted.ilce, ted.il].filter(Boolean).join(' / '))}</div>`
                    : `<div class="text-[10px] text-amber-700 font-bold">açık fiyat yok</div>
                       <button onclick="stokSekme('tedarik')" class="text-[10px] text-indigo-600 font-bold hover:underline">tedarikçi ara →</button>`);

            return `
            <tr class="border-b border-slate-100">
                <td class="p-2.5">
                    <div class="font-bold text-slate-700 text-sm">${esc(s.ad)}</div>
                    <div class="text-[10px] text-slate-400">${esc(s.birim)}</div>
                </td>
                <td class="p-2.5"><input class="fq w-20 border border-slate-200 rounded p-1 text-sm text-right" data-i="${i}" type="number" min="0" step="0.01" value="${s.ihtiyac}" oninput="stokFiyatLive()"></td>
                <td class="p-2.5 text-right text-sm">
                    <div class="font-bold ${elden > 0 ? 'text-emerald-700' : 'text-slate-300'}">${sayi(elden)}</div>
                    <div class="text-[10px] text-slate-400">${d.ortalama != null ? sayi(d.ortalama) + ' $' : (d.adet > 0 ? 'maliyet yok' : '')}</div>
                </td>
                <td class="p-2.5 text-right text-sm font-bold ${eksik > 0 ? 'text-amber-700' : 'text-slate-300'}">${sayi(eksik)}</td>
                <td class="p-2.5 text-right">${tedHucre}</td>
                <td class="p-2.5 text-right text-sm font-black ${satirMaliyet != null ? 'text-slate-800' : 'text-slate-300'}">${satirMaliyet != null ? sayi(satirMaliyet, 0) + ' $' : '—'}</td>
            </tr>`;
        }).join('');

        r.innerHTML = ust() + `
            <div class="kart p-4 mb-3">
                <div class="flex items-end gap-3 flex-wrap">
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Sistem gücü (kWp)</label>
                        <input id="fqKwp" type="number" min="0" step="0.1" value="${_fiyat.kwp}" class="w-28 border border-slate-300 p-2 rounded-lg text-sm">
                    </div>
                    <button onclick="stokPanelHesapla()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-sm">Panel adedini hesapla</button>
                    <p class="text-[11px] text-slate-400 flex-1 min-w-[16rem]">Panel adedi kWp ve seçtiğiniz panelin gücünden hesaplanır. Kablo, konstrüksiyon ve diğer miktarları projeye göre siz girersiniz — tahmini rakam üretmiyoruz.</p>
                </div>
            </div>

            <div class="kart overflow-x-auto mb-3">
                <table class="w-full text-sm min-w-[42rem]">
                    <thead class="bg-slate-50">
                        <tr class="text-[11px] text-slate-500 text-left">
                            <th class="p-2.5">Kalem</th><th class="p-2.5">İhtiyaç</th>
                            <th class="p-2.5 text-right">Depodan</th><th class="p-2.5 text-right">Eksik</th>
                            <th class="p-2.5 text-right">Tedarik birim</th><th class="p-2.5 text-right">Maliyet</th>
                        </tr>
                    </thead>
                    <tbody id="fqBody">${satirlar}</tbody>
                </table>
            </div>

            <div class="kart p-4">
                <div class="flex justify-between items-baseline">
                    <span class="font-black text-slate-800">Tahmini malzeme maliyeti</span>
                    <span class="text-right">
                        <div class="text-xl font-black text-indigo-600" id="fqToplam">${sayi(toplam, 0)} $</div>
                        <div class="text-xs text-slate-500">${k > 0 ? '≈ ₺' + sayi(toplam * k, 0) : 'kur bilinmiyor'}</div>
                    </span>
                </div>
                ${eksikBilinmeyen ? `<p class="text-[11px] text-amber-700 font-bold mt-2">${eksikBilinmeyen} kalemin fiyatı bilinmiyor — toplam eksik. Tedarikçi stoğundan fiyat teklifi isteyin veya depo maliyetini girin.</p>` : ''}
                <p class="text-[11px] text-slate-400 mt-2">Bu tablo yalnız MALZEME maliyetidir; işçilik, nakliye, mühendislik ve marj teklif sihirbazında eklenir. Kur: ${k > 0 ? sayi(k) : '—'}</p>
                <div class="flex justify-end mt-3">
                    <button onclick="stokTeklifeAktar()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2.5 rounded-lg text-sm">Teklif sihirbazına geç →</button>
                </div>
            </div>`;
    }

    // -------------------------------------------------------------- olaylar
    window.stokSekme = async function (s) {
        _sekme = s;
        if (s === 'tedarik') { await yukleTedarik(); cizTedarik(); }
        else if (s === 'fiyat') { if (!_tedarik.length) await yukleTedarik(); cizFiyat(); }
        else cizDepo();
    };

    window.stokFiltre = async function () {
        _filtre.kategori = document.getElementById('stKat').value || null;
        _filtre.il = document.getElementById('stIl').value || '';
        await yukleTedarik(); cizTedarik();
    };
    let _gec = null;
    window.stokFiltreGec = function () {
        clearTimeout(_gec);
        _gec = setTimeout(async () => {
            const a = document.getElementById('stIlce'), b = document.getElementById('stArama');
            _filtre.ilce = a ? a.value.trim() : ''; _filtre.arama = b ? b.value.trim() : '';
            await yukleTedarik(); cizTedarik();
        }, 320);
    };

    window.stokFiyatLive = function () {
        document.querySelectorAll('.fq').forEach(inp => {
            const i = +inp.getAttribute('data-i');
            if (_fiyat.satirlar[i]) _fiyat.satirlar[i].ihtiyac = parseFloat(inp.value) || 0;
        });
        cizFiyat();
    };

    window.stokPanelHesapla = function () {
        const el = document.getElementById('fqKwp');
        const kwp = parseFloat(el ? el.value : 0) || 0;
        _fiyat.kwp = kwp;
        // Panel gücü: önce depodaki panelden, yoksa tedarikçi listesinden, yoksa ayar.
        let wp = null;
        const dp = _depo.find(d => d.category_key === 'panel' && d.specs && Number(d.specs.guc) > 0);
        if (dp) wp = Number(dp.specs.guc);
        if (!wp) { const tp = _tedarik.find(t => t.kategori === 'panel' && t.ozellikler && Number(t.ozellikler.guc) > 0); if (tp) wp = Number(tp.ozellikler.guc); }
        if (!wp) wp = (Number(window.EPC_SETTINGS && window.EPC_SETTINGS.kwpPerPanel) || 0.55) * 1000;
        fiyatSatirlariKur();
        const s = _fiyat.satirlar.find(x => x.kategori === 'panel');
        if (s) s.ihtiyac = Math.ceil(kwp * 1000 / wp);
        const inv = _fiyat.satirlar.find(x => x.kategori === 'inverter');
        if (inv && !inv.ihtiyac) inv.ihtiyac = 1;
        cizFiyat();
    };

    window.stokTeklifeAktar = function () {
        const b = document.getElementById('btnGoQuotes');
        if (b) { b.click(); return; }
        alert('Teklif modülü bulunamadı.');
    };

    // Fiyatı gizli satır için talep aç — mevcut supplier_requests akışı.
    window.stokFiyatIste = async function (id) {
        const t = _tedarik.find(x => String(x.id) === String(id)); if (!t) return;
        const adet = prompt(`${t.marka} ${t.model} — kaç ${t.birim} için fiyat istiyorsunuz?`, '');
        if (adet === null) return;
        try {
            const { error } = await supabaseClient.from('supplier_requests').insert([{
                supplier_id: t.supplier_id,
                company_id: firmaId(),
                created_by: (window.currentUserProfile && window.currentUserProfile.id) || null,
                subject: `Fiyat talebi — ${t.marka} ${t.model}`,
                body: `Stok kaydı: ${t.marka} ${t.model} (${katAd(t.kategori)})\n`
                    + `Konum: ${[t.ilce, t.il].filter(Boolean).join(' / ')}\n`
                    + `İstenen miktar: ${adet || 'belirtilmedi'} ${t.birim}`
            }]);
            if (error) throw error;
            alert('Talebiniz tedarikçiye iletildi. Yanıt geldiğinde Tedarikçiler ekranında görünür.');
        } catch (e) { alert('Talep gönderilemedi: ' + (e.message || e)); }
    };

    // ------------------------------------------------------- depo düzenleme
    function pencere() {
        let m = document.getElementById('stokModal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'stokModal';
        m.className = 'tema-koyu pencere-koyu fixed inset-0 bg-black/50 z-[80] hidden flex items-center justify-center p-4';
        m.innerHTML = '<div class="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"><div id="stokModalBody" class="p-6"></div></div>';
        document.body.appendChild(m);
        m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
        return m;
    }

    function alanFormu(kat, specs) {
        const s = specs || {};
        return (_alanlar[kat] || []).map(a => {
            const v = s[a.anahtar] == null ? '' : s[a.anahtar];
            const alan = a.tip === 'secim' && (a.secenek || []).length
                ? `<select id="sp_${a.anahtar}" class="w-full border border-slate-300 p-2 rounded-lg text-sm bg-white"><option value="">—</option>${a.secenek.map(o => `<option ${String(v) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
                : `<input id="sp_${a.anahtar}" value="${esc(v)}" type="${a.tip === 'sayi' ? 'number' : 'text'}" step="any" class="w-full border border-slate-300 p-2 rounded-lg text-sm">`;
            return `<div><label class="block text-[11px] font-bold text-slate-600 mb-1">${esc(a.etiket)}${a.birim ? ' (' + esc(a.birim) + ')' : ''}</label>${alan}</div>`;
        }).join('');
    }

    function formCiz(d) {
        const ed = !!d;
        const kat = (d && d.category_key) || 'panel';
        // ⚠️ ÖNCE pencereyi kur: gövde ondan sonra var oluyor. Tersi sırada
        // ilk "Kalem ekle" tıklaması null'a innerHTML yazıp patlıyordu.
        const m = pencere();
        document.getElementById('stokModalBody').innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-black text-lg text-slate-800">${ed ? 'Kalemi Düzenle' : 'Depoya Kalem Ekle'}</h3>
                <button onclick="document.getElementById('stokModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <input type="hidden" id="skId" value="${ed ? d.id : ''}">
            <div class="space-y-3">
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Kategori</label>
                    <select id="skKat" onchange="stokKatDegisti()" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">
                        ${KAT.map(([k, a]) => `<option value="${k}" ${kat === k ? 'selected' : ''}>${esc(a)}</option>`).join('')}
                    </select></div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Üretici *</label><input id="skBrand" value="${ed ? esc(d.brand) : ''}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Model *</label><input id="skModel" value="${ed ? esc(d.model) : ''}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                </div>
                <div class="grid grid-cols-3 gap-3">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Elde</label><input id="skQty" type="number" step="any" value="${ed ? d.quantity : 0}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Birim</label><select id="skUnit" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${BIRIMLER.map(b => `<option ${ed && d.unit === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Ort. alış</label><input id="skCost" type="number" step="any" value="${ed && d.avg_cost != null ? d.avg_cost : ''}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                </div>
                <div class="grid grid-cols-3 gap-3">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Para birimi</label><select id="skCur" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${PARALAR.map(p => `<option ${ed && d.currency === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Son alınan yer</label><input id="skSup" value="${ed && d.last_supplier ? esc(d.last_supplier) : ''}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Son alış tarihi</label><input id="skDate" type="date" value="${ed && d.last_date ? d.last_date : ''}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                </div>
                <div class="border-t border-slate-100 pt-3">
                    <p class="text-[11px] font-bold text-slate-500 mb-2">Teknik bilgiler</p>
                    <div id="skSpecs" class="grid grid-cols-2 gap-3">${alanFormu(kat, ed ? d.specs : null)}</div>
                </div>
                <button onclick="stokKaydet()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 rounded-lg">Kaydet</button>
                <div id="skSonuc"></div>
            </div>`;
        m.classList.remove('hidden');
    }

    window.stokKatDegisti = function () {
        const k = document.getElementById('skKat').value;
        document.getElementById('skSpecs').innerHTML = alanFormu(k, null);
    };
    window.stokYeni = function () { formCiz(null); };
    window.stokDuzenle = function (id) { const d = _depo.find(x => String(x.id) === String(id)); if (d) formCiz(d); };

    window.stokKaydet = async function () {
        const g = (id) => document.getElementById(id);
        const sonuc = g('skSonuc');
        const brand = (g('skBrand').value || '').trim();
        const model = (g('skModel').value || '').trim();
        if (!brand || !model) { sonuc.innerHTML = '<p class="text-red-500 text-sm mt-2">Üretici ve model zorunludur.</p>'; return; }
        const cid = firmaId();
        if (!cid) { sonuc.innerHTML = '<p class="text-red-500 text-sm mt-2">Hesabınız bir firmaya bağlı değil.</p>'; return; }

        const kat = g('skKat').value;
        const specs = {};
        (_alanlar[kat] || []).forEach(a => {
            const el = g('sp_' + a.anahtar);
            if (el && el.value !== '') specs[a.anahtar] = a.tip === 'sayi' ? Number(el.value) : el.value;
        });

        const row = {
            company_id: cid, category_key: kat, brand, model,
            unit: g('skUnit').value,
            quantity: parseFloat(g('skQty').value) || 0,
            avg_cost: g('skCost').value === '' ? null : parseFloat(g('skCost').value),
            currency: g('skCur').value,
            last_supplier: (g('skSup').value || '').trim() || null,
            last_date: g('skDate').value || null,
            specs
        };
        sonuc.innerHTML = '<p class="text-xs text-slate-400 mt-2">Kaydediliyor…</p>';
        try {
            const id = g('skId').value;
            if (id) { const { error } = await supabaseClient.from('company_stock').update(row).eq('id', id); if (error) throw error; }
            else { const { error } = await supabaseClient.from('company_stock').insert([row]); if (error) throw error; }
            document.getElementById('stokModal').classList.add('hidden');
            await yukleDepo(); _sekme = 'depo'; cizDepo();
        } catch (e) {
            const m = String(e.message || e);
            sonuc.innerHTML = `<p class="text-red-500 text-sm mt-2">${esc(/duplicate|unique/i.test(m) ? 'Bu üretici ve model zaten depoda kayıtlı. Mevcut kaydı düzenleyin.' : m)}</p>`;
        }
    };

    window.stokSil = async function (id) {
        const d = _depo.find(x => String(x.id) === String(id)); if (!d) return;
        if (!confirm(`"${d.brand} ${d.model}" depodan silinsin mi?`)) return;
        try {
            const { error } = await supabaseClient.from('company_stock').delete().eq('id', id);
            if (error) throw error;
            await yukleDepo(); cizDepo();
        } catch (e) { alert('Silinemedi: ' + (e.message || e)); }
    };

    // --------------------------------------------------------- modül girişi
    window.showStokModule = async function (_adrestenGeldi) {
        if (typeof window.epcTumModulleriGizle === 'function') window.epcTumModulleriGizle();
        document.getElementById('mainMenu')?.classList.add('hidden');
        document.getElementById('stokModule')?.classList.remove('hidden');
        if (window.epcAdresYaz) window.epcAdresYaz('stok', null, _adrestenGeldi);

        const r = kok(); if (!r) return;
        r.innerHTML = '<p class="text-sm text-slate-400 py-6">Yükleniyor…</p>';
        if (!_yuklendi) { await yukleAlanlar(); _yuklendi = true; }
        await yukleDepo();
        // Yakınlık sıralaması firmanın ili bilinmeden çalışmaz; profilden bir
        // kez okuyup filtreye ön değer koyuyoruz. Firma il girmediyse boş kalır
        // ve ekranda "ilinizi seçin" uyarısı çıkar — varsayılan il UYDURMUYORUZ.
        if (!_filtre.il && firmaId()) {
            try {
                const { data } = await supabaseClient.from('companies')
                    .select('city').eq('id', firmaId()).maybeSingle();
                if (data && data.city) _filtre.il = data.city;
            } catch (e) { /* okunamazsa filtre boş kalır */ }
        }
        _sekme = 'depo';
        cizDepo();
    };

    document.getElementById('btnGoStok')?.addEventListener('click', function () {
        window.openedFromPublic = false;
        window.showStokModule(false);
    });
})();
