/* ============================================================================
   erisim.js — Admin › Günlük İş › Erişim  (epcmerkezim)
   ----------------------------------------------------------------------------
   Kurulumcu / danışman / tedarikçi firmalara gönderilecek hazır mesaj
   şablonlarını düzenler ve panoya kopyalar.

   • Şablonlar public.erisim_mesajlari tablosunda (yalnız admin okur/yazar).
     Kurulum: erisim-mesajlari.sql
   • GÖNDERİM YOK, BİLEREK: Instagram/WhatsApp toplu otomatik mesaj hem resmî
     API'de yok hem de hesabı yakan en net spam imzası. Metin hazırlanır,
     gönderimi insan yapar.
   • Yer tutucular ({{ad}} {{firma}} {{sehir}} {{is}}) kopyalama ANINDA
     doldurulur; doldurulmamış yer tutucu kalırsa kopyalama UYARIR — "Merhaba
     {{ad}}" diye mesaj gitmesi toplu gönderimde en kolay yapılan hata.

   ⚠️ Olay bağlama: satır içi onclick yerine delegasyon kullanılıyor. Satır içi
   handler'lar isimleri GLOBAL kapsamda arar; kapanış içindeki bir fonksiyon
   adı yazıldığında hata sessizce yalnız çalışma anında ortaya çıkıyor
   (bkz. quote.js/wzCaptureStep2 vakası).
   ============================================================================ */
(function () {
    'use strict';

    const ROLLER = [
        { id: 'kurulumcu', ad: '🔧 Kurulumcu', not: 'Öncelik burada: arz olmadan pazaryeri kurulmaz.' },
        { id: 'danisman',  ad: '🎯 Danışman',  not: 'Danışman müşteri değil, tarafsız bir çalışma zemini arıyor.' },
        { id: 'tedarikci', ad: '📦 Tedarikçi', not: 'Değeri aktif kurulumcu sayısına bağlı — erken gönderim boş vaat olur.' }
    ];

    const YER_TUTUCULAR = [
        { k: 'ad',    ad: 'Kişi adı',   ipucu: 'Ahmet Bey' },
        { k: 'firma', ad: 'Firma adı',  ipucu: 'DP Solar Enerji' },
        { k: 'sehir', ad: 'Şehir/ilçe', ipucu: 'Kartal' },
        { k: 'is',    ad: 'İş/konu',    ipucu: '45 kWp çatı GES' }
    ];

    let _satirlar = [];              // DB'den gelen şablonlar
    let _aktifRol = 'kurulumcu';
    let _yuklendi = false;
    const _deger = {};               // yer tutucu değerleri (bellekte; firma başına yenilenir)
    const _kirli = {};               // anahtar -> kaydedilmemiş değişiklik var mı
    const _taslak = {};              // anahtar -> kaydedilmemiş metin. ciz() pane'i
                                     // baştan kurduğu için (rol değişimi, kaydetme)
                                     // metin alanındaki düzenleme buradan geri gelir;
                                     // yoksa sessizce kaybolurdu.

    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s) : String(s == null ? '' : s));

    // ---------------------------------------------------------------- VERİ ---
    async function yukle() {
        const { data, error } = await supabaseClient
            .from('erisim_mesajlari')
            .select('anahtar, rol, baslik, aciklama, kanal, metin, varsayilan, sira')
            .order('rol').order('sira');
        if (error) throw error;
        _satirlar = data || [];
    }

    const satir = (anahtar) => _satirlar.find(r => r.anahtar === anahtar);

    // ------------------------------------------------------------- RENDER ----
    function ciz() {
        const pane = document.getElementById('adminPaneErisim');
        if (!pane) return;

        const rolDugmeleri = ROLLER.map(r => {
            const on = r.id === _aktifRol;
            const adet = _satirlar.filter(x => x.rol === r.id).length;
            return `<button type="button" data-rol="${r.id}"
                class="erisim-rol text-xs font-bold px-3 py-1.5 rounded-full border transition
                ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}">
                ${r.ad} <span class="opacity-60">${adet}</span></button>`;
        }).join('');

        const rol = ROLLER.find(r => r.id === _aktifRol);

        const tutucuAlanlari = YER_TUTUCULAR.map(y => `
            <label class="block">
                <span class="block text-[11px] font-bold text-slate-500 mb-1">${y.ad}
                    <code class="font-mono text-[10px] text-slate-400">{{${y.k}}}</code></span>
                <input type="text" data-tutucu="${y.k}" value="${esc(_deger[y.k] || '')}"
                    placeholder="${y.ipucu}"
                    class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500">
            </label>`).join('');

        const kartlar = _satirlar.filter(r => r.rol === _aktifRol).map(kart).join('')
            || `<p class="text-sm text-slate-400 italic text-center py-8">Bu rol için şablon yok.</p>`;

        pane.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <div class="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h3 class="text-base font-black text-slate-800">📣 Erişim — Hazır Mesajlar</h3>
                    <p class="text-xs text-slate-500 mt-0.5">Metinler düzenlenebilir. Gönderimi siz yaparsınız; sistem otomatik mesaj atmaz.</p>
                </div>
                <button type="button" data-eylem="yenile"
                    class="text-xs font-bold text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1.5">↻ Yenile</button>
            </div>

            <div class="flex gap-2 mt-4 flex-wrap">${rolDugmeleri}</div>
            <p class="text-[11px] text-slate-500 mt-2 pl-0.5">${esc(rol ? rol.not : '')}</p>

            <div class="mt-4 pt-4 border-t border-slate-100">
                <p class="text-[11px] font-black text-slate-600 uppercase tracking-wide mb-2">
                    Yer tutucular — kopyalarken doldurulur</p>
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5">${tutucuAlanlari}</div>
                <p class="text-[11px] text-slate-400 mt-2">Her firma için bu alanları değiştirip ilgili mesajı kopyalayın.
                    Boş bırakılan yer tutucu kopyalamada uyarı verir.</p>
            </div>
        </div>

        <div class="space-y-3">${kartlar}</div>`;
    }

    function kart(r) {
        const kirli = !!_kirli[r.anahtar];
        const deger = Object.prototype.hasOwnProperty.call(_taslak, r.anahtar)
            ? _taslak[r.anahtar] : (r.metin || '');
        const ozgun = (r.metin || '') === (r.varsayilan || '');
        return `
        <div class="bg-white border ${kirli ? 'border-amber-300' : 'border-slate-200'} rounded-2xl p-4" data-kart="${r.anahtar}">
            <div class="flex items-start justify-between gap-3 flex-wrap">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h4 class="text-sm font-black text-slate-800">${esc(r.baslik)}</h4>
                        ${r.kanal ? `<span class="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">${esc(r.kanal)}</span>` : ''}
                        ${kirli ? '<span class="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">kaydedilmedi</span>' : ''}
                        ${!ozgun && !kirli ? '<span class="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">düzenlenmiş</span>' : ''}
                    </div>
                    ${r.aciklama ? `<p class="text-[11px] text-slate-500 mt-1">${esc(r.aciklama)}</p>` : ''}
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button type="button" data-eylem="kopyala" data-anahtar="${r.anahtar}"
                        class="text-xs font-bold bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700">📋 Kopyala</button>
                    <button type="button" data-eylem="kaydet" data-anahtar="${r.anahtar}"
                        class="text-xs font-bold ${kirli ? 'bg-slate-900 text-white hover:bg-slate-700' : 'bg-slate-100 text-slate-400'} rounded-lg px-3 py-1.5">Kaydet</button>
                    <button type="button" data-eylem="sifirla" data-anahtar="${r.anahtar}" title="Varsayılan metne dön"
                        class="text-xs font-bold text-slate-400 hover:text-red-600 border border-slate-200 rounded-lg px-2 py-1.5">↺</button>
                </div>
            </div>
            <textarea data-metin="${r.anahtar}" rows="${Math.min(22, Math.max(6, deger.split('\n').length + 1))}"
                class="w-full mt-3 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono leading-relaxed outline-none focus:border-emerald-500 resize-y bg-slate-50/60"
            >${esc(deger)}</textarea>
            <p class="text-[11px] mt-1.5 h-4" data-durum="${r.anahtar}"></p>
        </div>`;
    }

    function durum(anahtar, mesaj, renk) {
        const el = document.querySelector(`[data-durum="${anahtar}"]`);
        if (el) { el.textContent = mesaj; el.className = `text-[11px] mt-1.5 h-4 font-bold ${renk}`; }
    }

    // ------------------------------------------------------------ EYLEMLER ---
    function doldur(metin) {
        let s = metin || '';
        YER_TUTUCULAR.forEach(y => {
            const v = (_deger[y.k] || '').trim();
            if (v) s = s.split('{{' + y.k + '}}').join(v);
        });
        return s;
    }

    async function kopyala(anahtar) {
        const ta = document.querySelector(`[data-metin="${anahtar}"]`);
        if (!ta) return;
        const metin = doldur(ta.value);

        // Doldurulmamış yer tutucu kalırsa kopyalamayı yine yap ama AÇIKÇA uyar:
        // toplu gönderimde "Merhaba {{ad}}" göndermek en kolay yapılan hata.
        const kalan = (metin.match(/\{\{[a-z_]+\}\}/gi) || []);
        try {
            await navigator.clipboard.writeText(metin);
        } catch (e) {
            ta.value = metin; ta.select();
            try { document.execCommand('copy'); } catch (e2) {
                durum(anahtar, 'Panoya kopyalanamadı — metni elle seçin.', 'text-red-600'); return;
            }
        }
        if (kalan.length) {
            durum(anahtar, `⚠️ Kopyalandı ama ${kalan.length} yer tutucu boş kaldı: ${kalan.join(' ')} — göndermeden önce doldurun!`, 'text-amber-600');
        } else {
            durum(anahtar, '✅ Panoya kopyalandı, yer tutucular dolu.', 'text-emerald-600');
        }
    }

    async function kaydet(anahtar) {
        const ta = document.querySelector(`[data-metin="${anahtar}"]`);
        const r = satir(anahtar);
        if (!ta || !r) return;
        const yeni = ta.value;
        durum(anahtar, 'Kaydediliyor...', 'text-slate-400');
        try {
            const { error } = await supabaseClient
                .from('erisim_mesajlari').update({ metin: yeni }).eq('anahtar', anahtar);
            if (error) throw error;
            r.metin = yeni;
            delete _kirli[anahtar];
            delete _taslak[anahtar];      // artık kayıtlı değerle aynı
            ciz();                                   // rozetler güncellensin
            durum(anahtar, '✅ Kaydedildi', 'text-emerald-600');   // ciz() sonrası, yoksa siliniyor
        } catch (e) {
            durum(anahtar, 'Kaydedilemedi: ' + (e.message || e), 'text-red-600');
        }
    }

    function sifirla(anahtar) {
        const r = satir(anahtar);
        if (!r) return;
        if (!confirm('Bu şablon varsayılan metne dönecek. Düzenlemeleriniz kaybolur.\n\nDevam edilsin mi?')) return;
        const ta = document.querySelector(`[data-metin="${anahtar}"]`);
        if (ta) ta.value = r.varsayilan || '';
        _taslak[anahtar] = r.varsayilan || '';
        _kirli[anahtar] = (r.varsayilan || '') !== (r.metin || '');
        // ⚠️ Burada ciz() ÇAĞIRMAYIN. ciz() pane'i _satirlar'dan yeniden kurar
        // ve metin alanına KAYITLI değeri geri yazar — sıfırlama aynı karede
        // geri alınır, üstelik sessizce: ekranda "yüklendi" yazar ama metin
        // eskisidir. Yalnız rozeti tazelemek yeterli.
        rozetTazele(anahtar);
        durum(anahtar, 'Varsayılan metin yüklendi — kalıcı olması için Kaydet.', 'text-amber-600');
    }

    // ---------------------------------------------------------- DELEGASYON ---
    // Tek dinleyici: ciz() innerHTML'i baştan yazdığı için düğme başına
    // dinleyici bağlamak her çizimde yeniden bağlamak demekti.
    function baglantilariKur() {
        const pane = document.getElementById('adminPaneErisim');
        if (!pane || pane.dataset.erisimBagli === '1') return;
        pane.dataset.erisimBagli = '1';

        pane.addEventListener('click', (ev) => {
            const rolBtn = ev.target.closest('.erisim-rol');
            if (rolBtn) { _aktifRol = rolBtn.dataset.rol; ciz(); return; }
            const btn = ev.target.closest('[data-eylem]');
            if (!btn) return;
            const a = btn.dataset.anahtar;
            switch (btn.dataset.eylem) {
                case 'kopyala': kopyala(a); break;
                case 'kaydet':  kaydet(a);  break;
                case 'sifirla': sifirla(a); break;
                case 'yenile':  window.adminErisimInit(true); break;
            }
        });

        pane.addEventListener('input', (ev) => {
            const t = ev.target;
            if (t.dataset && t.dataset.tutucu) { _deger[t.dataset.tutucu] = t.value; return; }
            if (t.dataset && t.dataset.metin) {
                const r = satir(t.dataset.metin);
                _taslak[t.dataset.metin] = t.value;
                const kirliydi = !!_kirli[t.dataset.metin];
                _kirli[t.dataset.metin] = !!r && t.value !== (r.metin || '');
                // Kirli durumu DEĞİŞTİYSE kartı yeniden çizmek yerine yalnız
                // sınırı/rozeti güncelle: her tuş vuruşunda ciz() çağırmak
                // metin alanındaki imleci başa atıyordu.
                if (kirliydi !== _kirli[t.dataset.metin]) rozetTazele(t.dataset.metin);
            }
        });
    }

    function rozetTazele(anahtar) {
        const kart = document.querySelector(`[data-kart="${anahtar}"]`);
        if (!kart) return;
        const kirli = !!_kirli[anahtar];
        kart.classList.toggle('border-amber-300', kirli);
        kart.classList.toggle('border-slate-200', !kirli);
        const kaydetBtn = kart.querySelector('[data-eylem="kaydet"]');
        if (kaydetBtn) {
            kaydetBtn.className = `text-xs font-bold ${kirli ? 'bg-slate-900 text-white hover:bg-slate-700' : 'bg-slate-100 text-slate-400'} rounded-lg px-3 py-1.5`;
        }
    }

    // ---------------------------------------------------------------- GİRİŞ --
    window.adminErisimInit = async function (zorla) {
        const pane = document.getElementById('adminPaneErisim');
        if (!pane) return;
        baglantilariKur();
        if (_yuklendi && !zorla) { ciz(); return; }

        pane.innerHTML = '<p class="text-sm text-slate-400 text-center py-10">Şablonlar yükleniyor...</p>';
        try {
            await yukle();
            _yuklendi = true;
            Object.keys(_kirli).forEach(k => delete _kirli[k]);
            Object.keys(_taslak).forEach(k => delete _taslak[k]);
            ciz();
        } catch (e) {
            pane.innerHTML = `<div class="bg-white border border-red-200 rounded-2xl p-5 text-center">
                <p class="text-sm text-red-600 font-bold">Şablonlar okunamadı</p>
                <p class="text-xs text-slate-500 mt-1">${esc(e.message || e)}</p>
                <p class="text-[11px] text-slate-400 mt-2">Supabase'te <code class="font-mono">erisim-mesajlari.sql</code> çalıştırıldı mı?</p>
            </div>`;
        }
    };
})();
