/* ============================================================================
   bill_analyzer.js — FATURA ANALİZİ & GES TASARIM SİHİRBAZI (ziyaretçi)
   ----------------------------------------------------------------------------
   Akış:
     1) Kullanıcı elektrik faturasını PDF veya görsel olarak yükler.
        - PDF (metin tabanlı e-fatura)  → pdf.js ile metin çıkarılır
        - Görsel / taranmış PDF         → Tesseract.js OCR (Türkçe, tembel yükleme)
        - İsteğe bağlı sunucu ucu        → window.EPC_BILL_AI_ENDPOINT (Gemini görüntü)
     2) Çıkan değerler DÜZENLENEBİLİR onay formunda önden dolu gelir
        (aylık/yıllık kWh, sözleşme gücü, ad, adres) + eksik alanlar sorulur.
     3) İskân belgesi vb. evrak durumu + tahmini kullanılabilir çatı alanı sorulur.
     4) settings.js sabitleriyle kaba GES tasarımı hesaplanır (çatı/güç kısıtlı).
     5) Taslak rapor gösterilir; "Teklif İste" → KVKK onayı → submit_lead + log_consent.
   ----------------------------------------------------------------------------
   core.js + settings.js'ten SONRA yüklenir. html2pdf ve (tembel) pdf.js/Tesseract
   CDN'den gelir. Yeni tablo/RPC gerekmez: mevcut submit_lead & log_consent kullanılır.
   ============================================================================ */
(function () {
    'use strict';

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // --- Ayar okuyucu (hesap anında EPC_SETTINGS'ten; varsayılana düşüş korumalı) ---
    // Ayar okuyucu. Eskiden altı alan okunuyordu ama beşi S()'in dışına hiç
    // çıkmıyordu — yani admin panelindeki "Çatı alanı (m²/kWp)" ve "CO₂" gibi
    // ayarlar bu modülde sessizce etkisizdi. Artık okunan her alan kullanılıyor.
    function S() {
        const d = { solarYield: 1500, roofM2PerKwp: 5.5, kwpPerPanel: 0.5, co2PerKwh: 0.45 };
        const s = window.EPC_SETTINGS || {};
        return {
            solarYield:   Number(s.solarYield)   || d.solarYield,
            roofM2PerKwp: Number(s.roofM2PerKwp) || d.roofM2PerKwp,
            kwpPerPanel:  Number(s.kwpPerPanel)  || d.kwpPerPanel,
            co2PerKwh:    Number(s.co2PerKwh)    || d.co2PerKwh
        };
    }

    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
    // Türkçe (1.250,75) ve İngilizce/OCR (1,250.75) biçimlerini ayırt eder.
    // Eskiden her zaman Türkçe varsayılıyordu; "1,250.75 kWh" → 1,25 kWh oluyordu.
    const num = (v) => {
        let t = String(v == null ? '' : v).trim().replace(/[^0-9.,]/g, '');
        if (!t) return null;
        const sonNokta = t.lastIndexOf('.'), sonVirgul = t.lastIndexOf(',');
        if (sonNokta >= 0 && sonVirgul >= 0) {
            // İkisi de varsa SONDAKİ ondalık ayraçtır, diğeri binlik.
            if (sonNokta > sonVirgul) t = t.replace(/,/g, '');          // 1,250.75
            else t = t.replace(/\./g, '').replace(',', '.');            // 1.250,75
        } else if (sonVirgul >= 0) {
            // Yalnız virgül: 3+ hane izliyorsa binlik (1,250), değilse ondalık (12,5)
            t = /,\d{3}(?:\D|$)/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
        } else if (sonNokta >= 0) {
            // Yalnız nokta: 3+ hane izliyorsa binlik (1.250), değilse ondalık (12.5)
            t = /\.\d{3}(?:\D|$)/.test(t) ? t.replace(/\./g, '') : t;
        }
        const n = parseFloat(t.replace(/[^0-9.]/g, ''));
        return isNaN(n) ? null : n;
    };

    // --- Modül sabitleri (kullanıcı talebine göre) ------------------------------
    // Panel gücü admin ayarından (kwpPerPanel), fiziksel alanı ondan türetiliyor.
    // Çatı KISITI ise ayrı bir ayardan (roofM2PerKwp) geliyor: yürüme payı ve
    // gölgelenme aralığı dahil kullanılabilir alan, çıplak panel alanından
    // büyüktür. Eskiden ikisi de 5,0'a sabitlenmişti ve ayar boşa gidiyordu.
    function panelKwp()  { return S().kwpPerPanel; }
    function panelM2()   { return panelKwp() * 5.0; }      // ~5 m²/kWp çıplak panel
    function m2PerKwp()  { return S().roofM2PerKwp; }      // yerleşim payı dahil
    // Fiyat/tarife değerleri admin panelinden (app_settings) yönetilir; yoksa varsayılan.
    const TARIFF_DEFAULTS = { mesken: 2.50, ticarethane: 3.50, sanayi: 3.00, tarimsal: 2.20 };
    const TARIFF_KEYS = { mesken: 'tariffMesken', ticarethane: 'tariffTicarethane', sanayi: 'tariffSanayi', tarimsal: 'tariffTarimsal' };
    function tariffOf(g) { const v = Number((window.EPC_SETTINGS || {})[TARIFF_KEYS[g]]); return v > 0 ? v : (TARIFF_DEFAULTS[g] || TARIFF_DEFAULTS.mesken); }
    function priceUsdPerKwp() { const v = Number((window.EPC_SETTINGS || {}).usdPerKwp); return v > 0 ? v : 1000; }        // panel + inverter, $/kWp
    function batteryUsdPerKwh() { const v = Number((window.EPC_SETTINGS || {}).batteryUsdPerKwh); return v > 0 ? v : 300; } // batarya, $/kWh
    const TARIFF_LABEL = { mesken: 'Mesken (konut)', ticarethane: 'Ticarethane / iş yeri', sanayi: 'Sanayi', tarimsal: 'Tarımsal sulama' };
    function usdTry() { const v = Number((window.EPC_SETTINGS || {}).usdTry); return v > 0 ? v : 42; } // yaklaşık kur (ayarlardan gelebilir)

    // Modül durumu (her açılışta sıfırlanır)
    let _ex = null;      // çıkarılan/onaylanan alanlar
    let _design = null;  // hesaplanan tasarım

    function root() { return document.getElementById('billAnalyzerRoot'); }

    // ------------------------------------------------------------------ AÇILIŞ
    window.openBillAnalyzer = function () {
        _ex = null; _design = null;
        const r = root(); if (!r) return;
        r.innerHTML = shellHtml() + stepUpload();
    };

    function shellHtml() {
        return `
        <div class="mb-6">
            <p class="text-[11px] uppercase tracking-[0.18em] font-black text-emerald-600 mb-2">Akıllı Ön Değerlendirme</p>
            <h1 class="text-3xl md:text-4xl font-black text-slate-800 mb-1">Faturanızı Yükleyin, GES Sisteminizi Görün</h1>
            <p class="text-slate-500 font-medium">Elektrik faturanızı yükleyin; tüketiminizi analiz edip size uygun güneş enerjisi sistemini birkaç soruyla tasarlayalım. Ücretsiz ve bağlayıcı değildir.</p>
        </div>`;
    }

    // ---------------------------------------------------------------- 1) YÜKLEME
    function stepUpload() {
        return `
        <div id="baStepUpload" class="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
            <div class="flex items-center gap-2 mb-4">
                <span class="w-7 h-7 rounded-full bg-emerald-600 text-white text-sm font-black flex items-center justify-center">1</span>
                <h2 class="font-black text-lg text-slate-800">Elektrik Faturanızı Yükleyin</h2>
            </div>

            <label id="baDrop" class="block border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition">
                <input id="baFile" type="file" accept="application/pdf,image/*" class="hidden" onchange="baHandleFile(this)">
                <div class="text-4xl mb-2">🧾</div>
                <p class="font-bold text-slate-700">Faturanızı sürükleyin veya <span class="text-emerald-600 underline">dosya seçin</span></p>
                <p class="text-xs text-slate-400 mt-1">PDF veya görsel (JPG/PNG) · En fazla 15 MB</p>
            </label>

            <div id="baFileMeta" class="hidden mt-3 text-sm text-slate-600"></div>
            <div id="baProgress" class="hidden mt-4"></div>

            <div class="mt-5 flex items-center gap-2 text-[11px] text-slate-400">
                <span>🔒</span><span>Faturanız yalnızca bu tarayıcıda çözümlenir; siz "Teklif İste" demeden hiçbir veri gönderilmez.</span>
            </div>

            <button onclick="baSkipToForm()" class="mt-4 text-sm text-slate-500 hover:text-emerald-600 underline">Faturam yanımda değil — bilgileri elle gireyim</button>
        </div>`;
    }

    // Sürükle-bırak
    setTimeout(function wireDrop() {
        document.addEventListener('dragover', (e) => { if (document.getElementById('baDrop')) e.preventDefault(); });
        document.addEventListener('drop', (e) => {
            const drop = document.getElementById('baDrop');
            if (!drop) return;
            e.preventDefault();
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) { const inp = document.getElementById('baFile'); if (inp) { const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files; baHandleFile(inp); } }
        });
    }, 0);

    function setProgress(html) {
        const p = document.getElementById('baProgress');
        if (p) { p.classList.remove('hidden'); p.innerHTML = html; }
    }
    function spinner(text) {
        return `<div class="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div class="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
            <span class="text-sm font-bold text-slate-700">${esc(text)}</span></div>`;
    }

    window.baSkipToForm = function () {
        _ex = { monthlyKwh: null, yearlyKwh: null, contractPower: null, name: '', address: '', totalAmount: null, source: 'manual' };
        renderConfirm();
    };

    window.baHandleFile = async function (input) {
        const f = input.files && input.files[0]; if (!f) return;
        if (f.size > 15 * 1024 * 1024) { setProgress(`<p class="text-sm text-red-500 font-bold">Dosya çok büyük (15 MB üstü). Lütfen daha küçük bir dosya deneyin.</p>`); return; }
        const meta = document.getElementById('baFileMeta');
        if (meta) { meta.classList.remove('hidden'); meta.innerHTML = `📎 <b>${esc(f.name)}</b> · ${(f.size / 1024 / 1024).toFixed(2)} MB`; }

        try {
            const data = await analyzeBill(f, setProgress);
            _ex = data;
            setProgress(`<div class="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800 font-bold">✅ Fatura okundu. Lütfen aşağıdaki bilgileri kontrol edip eksikleri tamamlayın.</div>`);
            setTimeout(renderConfirm, 400);
        } catch (err) {
            setProgress(`<div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                Faturayı otomatik okuyamadık (${esc(err.message || err)}). Sorun değil — değerleri birlikte elle girelim.</div>`);
            _ex = { monthlyKwh: null, yearlyKwh: null, contractPower: null, name: '', address: '', totalAmount: null, source: 'manual-fallback' };
            setTimeout(renderConfirm, 700);
        }
    };

    // ------------------------------------------------------ OKUMA HATTI (extract)
    async function analyzeBill(file, prog) {
        // 0) İsteğe bağlı sunucu ucu (Gemini görüntü) — tanımlıysa öncelikli.
        if (window.EPC_BILL_AI_ENDPOINT) {
            prog(spinner('Fatura yapay zekâ ile çözümleniyor...'));
            try {
                const b64 = await fileToBase64(file);
                const resp = await fetch(window.EPC_BILL_AI_ENDPOINT, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mime: file.type, data: b64 })
                });
                const j = await resp.json();
                if (resp.ok && j) return normalizeExtract(j, 'ai');
            } catch (e) { /* uç yoksa/başarısızsa tarayıcı hattına düş */ }
        }

        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        let text = '';

        if (isPdf) {
            prog(spinner('PDF metni çıkarılıyor...'));
            text = await pdfExtractText(file);
            if (!text || text.replace(/\s/g, '').length < 40) {
                // Taranmış PDF → ilk sayfayı görüntüye çevirip OCR
                prog(spinner('Fatura taranmış görünüyor, görüntü olarak okunuyor... (biraz sürebilir)'));
                const canvas = await pdfFirstPageToCanvas(file);
                text = await ocrImage(canvas, prog);
            }
        } else {
            prog(spinner('Fatura görüntüsü okunuyor... (biraz sürebilir)'));
            text = await ocrImage(file, prog);
        }

        if (!text || text.replace(/\s/g, '').length < 20) throw new Error('metin bulunamadı');
        return parseBillText(text);
    }

    function normalizeExtract(j, source) {
        return {
            monthlyKwh:    num(j.monthlyKwh ?? j.monthly_kwh),
            yearlyKwh:     num(j.yearlyKwh ?? j.yearly_kwh),
            contractPower: num(j.contractPower ?? j.contract_power ?? j.sozlesme_gucu),
            name:          j.name || j.full_name || '',
            address:       j.address || '',
            totalAmount:   num(j.totalAmount ?? j.total_amount ?? j.tutar),
            tariffGroup:   j.tariffGroup || j.tariff_group || null,
            source
        };
    }

    // --- Türk elektrik faturası sezgisel ayrıştırıcı (best-effort) ---
    function parseBillText(text) {
        const t = ' ' + text.replace(/\r/g, ' ').replace(/\u00a0/g, ' ') + ' ';
        const low = t.toLowerCase();
        const grabNum = (re) => { const m = low.match(re); return m ? num(m[1]) : null; };

        // ENDEKS TUZAĞI: faturada "Eski/İlk Endeks 12.480 kWh · Yeni/Son Endeks
        // 12.800 kWh" satırları var. Eskiden genel yedek kalıp bunlardan ilkini
        // tüketim sanıp 12.480 kWh/ay okuyordu → 100 kWp'lik konut önerisi.
        // Endeks satırlarını önce ayıklıyoruz; ikisi de okunursa FARKI alıyoruz.
        const endeksler = [...low.matchAll(/(?:ilk|son|eski|yeni|önceki|onceki|ge[çc]en|ge[çc]erli)\s*endeks[^0-9]{0,15}?([0-9][0-9\.\, ]{1,12})/g)]
            .map(m => num(m[1])).filter(x => x != null);
        let endeksFarki = null;
        if (endeksler.length >= 2) {
            const f = Math.max(...endeksler) - Math.min(...endeksler);
            if (f > 0) endeksFarki = f;
        }
        // Yedek kalıbı ararken endeks bağlamındaki sayıları görmezden gel.
        const lowSade = low.replace(/(?:ilk|son|eski|yeni|önceki|onceki|ge[çc]en|ge[çc]erli)\s*endeks[^0-9]{0,15}?[0-9][0-9\.\, ]{1,12}\s*(?:kwh)?/g, ' ');
        const grabSade = (re) => { const m = lowSade.match(re); return m ? num(m[1]) : null; };

        // Tüketim (kWh) — birkaç yaygın kalıp
        let yearlyKwh = grabNum(/y[ıi]ll[ıi]k[^0-9]{0,20}?([0-9][0-9\.\, ]{1,12})\s*kwh/);
        let monthlyKwh =
            grabNum(/toplam\s*t[üu]ketim[^0-9]{0,15}?([0-9][0-9\.\, ]{1,10})\s*kwh/) ||
            grabNum(/t[üu]ketim[^0-9]{0,15}?([0-9][0-9\.\, ]{1,10})\s*kwh/) ||
            grabNum(/aktif\s*enerji[^0-9]{0,15}?([0-9][0-9\.\, ]{1,10})\s*kwh/) ||
            endeksFarki ||
            grabSade(/([0-9][0-9\.\, ]{1,10})\s*kwh/);

        // Zamanlı tarife (T1+T2+T3) toplamı — daha güvenilir aylık tüketim
        const touMatches = [...low.matchAll(/t[123][^0-9]{0,8}?([0-9][0-9\.\, ]{1,10})\s*kwh/g)].map(m => num(m[1])).filter(x => x != null);
        if (touMatches.length >= 2) { const sum = touMatches.reduce((a, b) => a + b, 0); if (sum > 0) monthlyKwh = sum; }

        if (yearlyKwh == null && monthlyKwh != null) yearlyKwh = monthlyKwh * 12;
        if (monthlyKwh == null && yearlyKwh != null) monthlyKwh = Math.round(yearlyKwh / 12);

        // Sözleşme / bağlantı gücü (kW veya kVA)
        const contractPower =
            grabNum(/s[öo]zle[şs]me\s*g[üu]c[üu][^0-9]{0,15}?([0-9][0-9\.\, ]{1,8})\s*k?(?:w|va)/) ||
            grabNum(/ba[ğg]lant[ıi]\s*g[üu]c[üu][^0-9]{0,15}?([0-9][0-9\.\, ]{1,8})\s*k?(?:w|va)/) ||
            grabNum(/g[üu][çc][^0-9]{0,10}?([0-9][0-9\.\, ]{1,8})\s*k(?:w|va)/);

        // Toplam tutar (TL)
        const totalAmount =
            grabNum(/[öo]denecek\s*tutar[^0-9]{0,15}?([0-9][0-9\.\, ]{1,12})/) ||
            grabNum(/fatura\s*tutar[ıi][^0-9]{0,15}?([0-9][0-9\.\, ]{1,12})/) ||
            grabNum(/genel\s*toplam[^0-9]{0,15}?([0-9][0-9\.\, ]{1,12})/);

        // Ad Soyad — "Sayın ..." veya "Abone Adı ..."
        let name = '';
        const NAME_STOP = '(?: {2,}|[\\n\\r,]|Adres|Tesisat|Abone|Fatura|M[üu][şs]teri\\s*No)';
        let mn = t.match(new RegExp('Say[ıi]n[:\\s]+([A-ZÇĞİÖŞÜa-zçğıöşü. ]{4,50}?)' + NAME_STOP));
        if (!mn) mn = t.match(new RegExp('Abone\\s*Ad[ıi][:\\s]+([A-ZÇĞİÖŞÜa-zçğıöşü. ]{4,50}?)' + NAME_STOP));
        if (!mn) mn = t.match(new RegExp('M[üu][şs]teri\\s*Ad[ıi][:\\s]+([A-ZÇĞİÖŞÜa-zçğıöşü. ]{4,50}?)' + NAME_STOP));
        if (mn) name = mn[1].replace(/\s+/g, ' ').trim();

        // Adres
        let address = '';
        let ma = t.match(/(?:Tesisat\s*Adresi|Adres)[:\s]+([^\n]{8,120})/i);
        if (ma) address = ma[1].replace(/\s+/g, ' ').trim();

        // Abonelik (tarife) grubu
        let tariffGroup = null;
        if (/sanayi/.test(low)) tariffGroup = 'sanayi';
        else if (/ticaret|iş\s*yeri|isyeri|ticarethane/.test(low)) tariffGroup = 'ticarethane';
        else if (/tar[ıi]m|sulama/.test(low)) tariffGroup = 'tarimsal';
        else if (/mesken|konut/.test(low)) tariffGroup = 'mesken';

        return { monthlyKwh, yearlyKwh, contractPower, name, address, totalAmount, tariffGroup, source: 'ocr' };
    }

    // ------------------------------------------------------ pdf.js / Tesseract
    let _pdfjs = null, _tess = false;

    function loadScript(src) {
        return new Promise((res, rej) => {
            const s = document.createElement('script'); s.src = src;
            s.onload = res; s.onerror = () => rej(new Error('kütüphane yüklenemedi'));
            document.head.appendChild(s);
        });
    }

    async function ensurePdfjs() {
        if (_pdfjs) return _pdfjs;
        if (!window.pdfjsLib) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        if (!window.pdfjsLib) throw new Error('pdf.js yüklenemedi');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        _pdfjs = window.pdfjsLib;
        return _pdfjs;
    }

    async function pdfExtractText(file) {
        const lib = await ensurePdfjs();
        const buf = await file.arrayBuffer();
        const pdf = await lib.getDocument({ data: buf }).promise;
        let out = '';
        const pages = Math.min(pdf.numPages, 3);
        for (let i = 1; i <= pages; i++) {
            const page = await pdf.getPage(i);
            const tc = await page.getTextContent();
            out += tc.items.map(it => it.str).join(' ') + '\n';
        }
        return out;
    }

    async function pdfFirstPageToCanvas(file) {
        const lib = await ensurePdfjs();
        const buf = await file.arrayBuffer();
        const pdf = await lib.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        return canvas;
    }

    async function ensureTesseract() {
        if (_tess) return;
        if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
        if (!window.Tesseract) throw new Error('OCR motoru yüklenemedi');
        _tess = true;
    }

    async function ocrImage(imageOrCanvas, prog) {
        await ensureTesseract();
        const { data } = await window.Tesseract.recognize(imageOrCanvas, 'tur', {
            logger: (m) => {
                if (m.status === 'recognizing text' && prog) {
                    prog(spinner('Fatura okunuyor... %' + Math.round((m.progress || 0) * 100)));
                }
            }
        });
        return (data && data.text) || '';
    }

    function fileToBase64(file) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result).split(',')[1] || '');
            r.onerror = () => rej(new Error('dosya okunamadı'));
            r.readAsDataURL(file);
        });
    }

    // ---------------------------------------------------- 2+3) ONAY + SORULAR
    function renderConfirm() {
        const r = root(); if (!r) return;
        const e = _ex || {};
        const foundBadge = (v) => v != null && v !== '' ? '<span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded ml-1">faturadan</span>' : '';

        r.innerHTML = shellHtml() + `
        <div class="space-y-5">
            <div class="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
                <div class="flex items-center gap-2 mb-1">
                    <span class="w-7 h-7 rounded-full bg-emerald-600 text-white text-sm font-black flex items-center justify-center">2</span>
                    <h2 class="font-black text-lg text-slate-800">Faturanızdan Okuduklarımız</h2>
                </div>
                <p class="text-xs text-slate-400 mb-5 ml-9">Değerleri kontrol edin, yanlış veya eksik olanları düzeltin. Doğru hesap için tüketim önemlidir.</p>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Aylık ortalama tüketim (kWh) ${foundBadge(e.monthlyKwh)}</label>
                        <input id="baMonthly" type="number" inputmode="decimal" value="${e.monthlyKwh != null ? e.monthlyKwh : ''}" oninput="baSyncKwh('m')" placeholder="örn. 450" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Yıllık toplam tüketim (kWh) ${foundBadge(e.yearlyKwh)}</label>
                        <input id="baYearly" type="number" inputmode="decimal" value="${e.yearlyKwh != null ? e.yearlyKwh : ''}" oninput="baSyncKwh('y')" placeholder="örn. 5400" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Sözleşme (bağlantı) gücü (kW) ${foundBadge(e.contractPower)}</label>
                        <input id="baPower" type="number" inputmode="decimal" value="${e.contractPower != null ? e.contractPower : ''}" placeholder="örn. 5" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
                        <p class="text-[11px] text-slate-400 mt-1">Çatı GES'te kurulu güç genelde sözleşme gücünü aşamaz.</p>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Abonelik (tarife) tipi ${e.tariffGroup ? '<span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded ml-1">faturadan</span>' : ''}</label>
                        <select id="baTariff" onchange="baUpdateBillEstimate()" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">
                            <option value="mesken">Mesken (konut)</option>
                            <option value="ticarethane">Ticarethane / iş yeri</option>
                            <option value="sanayi">Sanayi</option>
                            <option value="tarimsal">Tarımsal sulama</option>
                        </select>
                        <p class="text-[11px] text-slate-400 mt-1">Faturadan okunamazsa lütfen seçin.</p>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Şehir</label>
                        <select id="baCity" onchange="baUpdateBillEstimate()" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">
                            <option value="">Türkiye ortalaması</option>
                            ${(window.EPC_CITIES || []).map(c => `<option value="${c.key}">${esc(c.ad)}</option>`).join('')}
                        </select>
                        <p class="text-[11px] text-slate-400 mt-1">Aynı panel Antalya'da ve Trabzon'da farklı üretir.</p>
                    </div>
                </div>
                <div id="baBillEstimate" class="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600"></div>
            </div>

            <div class="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
                <div class="flex items-center gap-2 mb-5">
                    <span class="w-7 h-7 rounded-full bg-emerald-600 text-white text-sm font-black flex items-center justify-center">3</span>
                    <h2 class="font-black text-lg text-slate-800">Kurulum İçin Birkaç Soru</h2>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Tahmini kullanılabilir çatı alanı (m²)</label>
                        <input id="baRoof" type="number" inputmode="decimal" placeholder="örn. 60" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
                        <p class="text-[11px] text-slate-400 mt-1">Gölgesiz, panele uygun kabaca alan. Bilmiyorsanız boş bırakın.</p>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Çatı tipi</label>
                        <select id="baRoofType" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">
                            <option value="">Seçiniz (opsiyonel)</option>
                            <option>Kiremit (eğimli)</option>
                            <option>Sac / metal (eğimli)</option>
                            <option>Teras (düz beton)</option>
                            <option>Arazi / tarla</option>
                        </select>
                    </div>
                </div>

                <div class="border border-slate-200 rounded-lg p-4 mb-5 bg-slate-50/60">
                    <div class="flex items-center justify-between gap-3 flex-wrap">
                        <div class="min-w-0">
                            <p class="text-sm font-bold text-slate-700">🔋 Batarya (enerji depolama) istiyor musunuz?</p>
                            <p class="text-[11px] text-slate-400">Gece kullanımı ve elektrik kesintisinde yedek için. Maliyeti artırır.</p>
                        </div>
                        <select id="baBattery" onchange="baToggleBattery()" class="text-sm border border-slate-300 rounded-lg p-2 bg-white shrink-0">
                            <option value="no">Hayır, istemiyorum</option>
                            <option value="yes">Evet, istiyorum</option>
                        </select>
                    </div>
                    <div id="baBatteryKwhWrap" class="hidden mt-3">
                        <label class="block text-xs font-bold text-slate-600 mb-1">Batarya kapasitesi (kWh)</label>
                        <input id="baBatteryKwh" type="number" inputmode="decimal" placeholder="örn. 10" class="w-full md:w-60 border border-slate-300 p-2.5 rounded-lg text-sm">
                        <p class="text-[11px] text-slate-400 mt-1">Bilmiyorsanız günlük tüketiminize yakın bir değer önerilir.</p>
                    </div>
                </div>

                <!-- Belge soruları (iskân/tapu/fatura) BURADAN KALDIRILDI.
                     Hesabı hiç etkilemiyorlardı — yalnız uyarı metni ve lead notu
                     üretiyorlardı — ama sonucu görmeden önce üç soru daha sormak
                     gereksiz sürtünmeydi. Artık "Teklif İste" adımında soruluyor. -->
            </div>

            <div class="flex flex-col sm:flex-row gap-3">
                <button onclick="baBackToUpload()" class="sm:w-auto px-5 py-3 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-50">← Farklı fatura yükle</button>
                <button onclick="baComputeDesign()" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl shadow-lg shadow-emerald-600/25">Sistemimi Tasarla →</button>
            </div>
            <div id="baConfirmErr"></div>
        </div>`;
        // Açılış ilklemesi: tarife grubu (faturadan gelmişse) + tahmini fatura + batarya durumu
        if (_ex && _ex.tariffGroup) { const t = document.getElementById('baTariff'); if (t) t.value = _ex.tariffGroup; }
        baUpdateBillEstimate();
        baToggleBattery();
    }

    function docRow(id, title, hint, emphasize) {
        return `<label class="flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${emphasize ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200'} hover:bg-slate-50">
            <select id="${id}" class="text-xs border border-slate-300 rounded-md p-1.5 bg-white shrink-0 mt-0.5">
                <option value="unsure">Emin değilim</option>
                <option value="yes">Var</option>
                <option value="no">Yok</option>
            </select>
            <span class="min-w-0"><span class="block text-sm font-bold text-slate-700">${esc(title)}${emphasize ? ' <span class="text-[10px] text-amber-700 font-black">ÖNEMLİ</span>' : ''}</span>
            <span class="block text-[11px] text-slate-400">${esc(hint)}</span></span>
        </label>`;
    }

    // Aylık ↔ yıllık otomatik senkron (kullanıcı birini yazınca diğerini öner)
    window.baSyncKwh = function (which) {
        const m = document.getElementById('baMonthly'), y = document.getElementById('baYearly');
        if (!m || !y) return;
        if (which === 'm' && m.value !== '') { const v = num(m.value); if (v != null && (y.value === '' || y.dataset.auto)) { y.value = Math.round(v * 12); y.dataset.auto = '1'; } }
        if (which === 'y' && y.value !== '') { const v = num(y.value); if (v != null && (m.value === '' || m.dataset.auto)) { m.value = Math.round(v / 12); m.dataset.auto = '1'; } y.dataset.auto = ''; }
        if (which === 'm') m.dataset.auto = '';
        baUpdateBillEstimate();
    };

    // Abonelik tipine göre tahmini aylık fatura (otomatik hesap, ortalama tarife)
    window.baUpdateBillEstimate = function () {
        const box = document.getElementById('baBillEstimate'); if (!box) return;
        const monthly = num(document.getElementById('baMonthly')?.value);
        const g = document.getElementById('baTariff')?.value || 'mesken';
        const unit = tariffOf(g);
        if (monthly == null || monthly <= 0) {
            box.innerHTML = 'Aylık tüketiminizi girince tahmini fatura tutarınızı <b>abonelik tipine göre otomatik</b> hesaplarız.';
            return;
        }
        const est = monthly * unit;
        box.innerHTML = `Tahmini aylık faturanız: <b class="text-slate-800">₺${fmt(est)}</b>
            <span class="text-slate-400">(${esc(TARIFF_LABEL[g])} · ortalama ${unit.toFixed(2).replace('.', ',')} ₺/kWh)</span>
            <span class="block text-[11px] text-slate-400 mt-0.5">Bu tutar <b>ortalama tarifeyle</b> tahmindir; gerçek faturanız kademe ve vergilere göre değişebilir.</span>`;
    };

    // Batarya seçimi: kWh alanını göster/gizle, öneri doldur
    window.baToggleBattery = function () {
        const on = document.getElementById('baBattery')?.value === 'yes';
        const wrap = document.getElementById('baBatteryKwhWrap'); if (wrap) wrap.classList.toggle('hidden', !on);
        if (on) {
            const kwhEl = document.getElementById('baBatteryKwh');
            if (kwhEl && !kwhEl.value) { const y = num(document.getElementById('baYearly')?.value); if (y) kwhEl.value = Math.max(5, Math.round(y / 365)); }
        }
    };

    window.baBackToUpload = function () { openBillAnalyzer(); };

    // ---------------------------------------------------------- 4) TASARIM
    window.baComputeDesign = function () {
        const err = document.getElementById('baConfirmErr');
        const monthly = num(document.getElementById('baMonthly')?.value);
        let yearly = num(document.getElementById('baYearly')?.value);
        if (yearly == null && monthly != null) yearly = monthly * 12;
        if (yearly == null || yearly <= 0) {
            if (err) err.innerHTML = '<p class="text-red-500 text-sm font-bold mt-1">Hesap için en az aylık ya da yıllık tüketiminizi (kWh) girmelisiniz.</p>';
            return;
        }
        const power   = num(document.getElementById('baPower')?.value);
        const roof    = num(document.getElementById('baRoof')?.value);
        const roofType= document.getElementById('baRoofType')?.value || '';
        const tariffGroup = document.getElementById('baTariff')?.value || 'mesken';
        const batteryOn = document.getElementById('baBattery')?.value === 'yes';
        const batteryKwh = batteryOn ? num(document.getElementById('baBatteryKwh')?.value) : null;
        // Belgeler artık teklif adımında soruluyor; hesabı etkilemiyorlar.
        const docs = (_ex && _ex.docs) || { iskan: 'unsure', tapu: 'unsure', fatura: 'unsure' };
        const city = document.getElementById('baCity')?.value || '';

        const s = S();
        const unit = tariffOf(tariffGroup);                       // ortalama ₺/kWh (admin ayarlı)
        const monthlyBill = monthly != null ? monthly * unit : null;
        const cy = window.epcCityYield(city);                     // şehir verimi (yoksa ulusal)
        const verim = cy.verim;

        // MAKULLÜK KONTROLÜ — endeks/OCR hatası ya da elle yazım hatası
        // saçma bir sisteme dönüşmeden önce kullanıcıya sorulur. Eskiden
        // 12.480 kWh/ay girdisi sessizce 100 kWp / 200 panel öneriyordu.
        const aylikEsdeger = yearly / 12;
        const UST = { mesken: 2000, ticarethane: 20000, sanayi: 500000, tarimsal: 50000 };
        const ust = UST[tariffGroup] || UST.mesken;
        if (aylikEsdeger > ust && !window.__baMakulOnay) {
            window.__baMakulOnay = true;   // ikinci "Hesapla" onay sayılır
            if (err) err.innerHTML = '<div class="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">' +
                '<b>Bu tüketim olağandışı görünüyor.</b> ' + fmt(aylikEsdeger) + ' kWh/ay, ' +
                esc(TARIFF_LABEL[tariffGroup] || tariffGroup).toLowerCase() + ' için beklenenin çok üstünde. ' +
                'Faturadaki <b>sayaç endeksini</b> (ör. 12.480) tüketim yerine yazmış olabilirsiniz — tüketim, iki endeksin farkıdır. ' +
                'Değer doğruysa “Hesapla”ya tekrar basın.</div>';
            return;
        }
        window.__baMakulOnay = false;

        _ex = Object.assign(_ex || {}, {
            monthlyKwh: monthly, yearlyKwh: Math.round(yearly), contractPower: power,
            tariffGroup, unit, totalAmount: monthlyBill, city, cityYield: verim,
            roofM2: roof, roofType, batteryOn, batteryKwh, docs
        });

        const notes = [];

        // Kurulu güç = ihtiyaç, çatı ve sözleşme gücü kısıtlarının en küçüğü
        const pKwp = panelKwp();
        const kwpNeed = yearly / verim;
        let kwp = kwpNeed, limited = null;
        if (roof != null && roof > 0) { const kwpRoof = roof / m2PerKwp(); if (kwpRoof < kwp) { kwp = kwpRoof; limited = 'roof'; } }
        if (power != null && power > 0) { if (power < kwp) { kwp = power; limited = limited ? 'both' : 'power'; } }
        kwp = Math.max(pKwp, kwp);

        const panels = Math.max(1, Math.round(kwp / pKwp));
        const kwpReal = panels * pKwp;
        const requiredRoof = kwpReal * m2PerKwp();                // yerleşim payı dahil
        const production = kwpReal * verim;                       // yıllık üretim (kWh)
        const offset = Math.min(production, yearly);
        const coverage = Math.round(production / yearly * 100);

        // İnverter: DC/AC oranı 1,15 (panel dizisi inverterden büyük seçilir;
        // yıl içinde çok az saat kırpma olur, karşılığında inverter ucuzlar).
        const DC_AC = 1.15;
        const inverterKw = Math.round((kwpReal / DC_AC) * 10) / 10;

        // Maliyet (USD, ortalama fiyat) → geri ödeme için TL'ye çevrilir
        const rate = usdTry();
        const usdKwp = priceUsdPerKwp(), usdBatKwh = batteryUsdPerKwh();
        const panelInverterUsd = kwpReal * usdKwp;                // $/kWp (panel + inverter, admin ayarlı)
        const batteryUsd = (batteryOn && batteryKwh) ? batteryKwh * usdBatKwh : 0;
        const totalUsd = panelInverterUsd + batteryUsd;
        const totalTl = totalUsd * rate;
        const annualSaving = offset * unit;                       // ₺/yıl (1. yıl)
        const monthlySaving = annualSaving / 12;
        const co2 = production * S().co2PerKwh;                   // kg/yıl

        // GERİ ÖDEME — artık core.js'teki ortak modelle: elektrik zammı ve panel
        // yıpranması yıl yıl işleniyor. Düz bölme (yatırım ÷ yıllık tasarruf)
        // aynı girdide 11,2 yıl derken bu model 6,1 yıl diyordu; Amortisman
        // Hesaplayıcı zaten ikincisini kullanıyordu, ikisi çelişiyordu.
        const pbSistem = window.epcPayback({ yatirim: panelInverterUsd * rate, yillikUretim: production, birimFiyat: unit });
        const pbToplam = batteryUsd > 0
            ? window.epcPayback({ yatirim: totalTl, yillikUretim: production, birimFiyat: unit })
            : pbSistem;
        const payback = pbToplam.yil;
        const paybackSistem = pbSistem.yil;
        const duzPayback = annualSaving > 0 ? totalTl / annualSaving : null;   // karşılaştırma için

        // --- Dikkat edilmesi gerekenler (detaylı + satışa yönlendirici) ---
        if (limited === 'roof') notes.push('Girdiğiniz çatı alanı, yıllık ihtiyacınızın tamamını karşılayacak sistemden küçük görünüyor. Sistem çatınıza sığacak şekilde küçültüldü; kalan tüketimi şebekeden karşılarsınız. Keşifte kullanılabilir alan netleşince kapasite güncellenebilir.');
        if (limited === 'power') notes.push('Kurulu güç, sözleşme (bağlantı) gücünüze göre sınırlandı. Daha büyük sistem için dağıtım şirketinden güç artırımı gerekebilir; firma bu başvuruyu sizin adınıza yürütebilir.');
        if (limited === 'both') notes.push('Hem çatı alanı hem sözleşme gücü sınırlayıcı oldu; sistem ikisinin izin verdiği en küçük değere göre önerildi. Keşifte ikisi de yeniden değerlendirilir.');
        if (coverage >= 98 && limited == null) notes.push('Önerilen sistem yıllık tüketiminizin neredeyse tamamını karşılıyor. Mahsuplaşma (net-metering) mantığı gereği ihtiyacın çok üstünde panel önermiyoruz; fazla üretim düşük bedelle değerlenir.');
        if (coverage < 70) notes.push('Bu sistem tüketiminizin bir kısmını karşılıyor. Faturanızı büyük ölçüde sıfırlamak için çatı/güç kısıtlarının aşılması gerekir; danışmanımız alternatif senaryoları (güç artırımı, ek alan, arazi) sizinle netleştirebilir.');
        if (docs.soruldu && docs.iskan === 'no') notes.push('İskân (yapı kullanma izni) belgeniz yok görünüyor. Bu belge çoğu GES başvurusunda zorunludur ve kurulumdan önce temini gerekir. Firma/danışman bu süreçte size yol gösterir.');
        if (docs.soruldu && docs.iskan === 'unsure') notes.push('İskân belgesi durumundan emin değilsiniz — başvuru öncesi netleştirilmesi gereken ilk konudur. Danışmanımız gerekli evrak listesini çıkarıp eksikleri tamamlamanıza yardımcı olur.');
        if (batteryOn && batteryKwh) notes.push('Batarya (' + batteryKwh + ' kWh) maliyete dahil edildi; geri ödeme hesabında ise BİR GETİRİSİ SAYILMADI. Sebebi: mahsuplaşmada fazla üretim zaten faturanızdan düşülüyor, dolayısıyla bataryanın parasal katkısı sınırlı kalıyor. Bataryanın asıl değeri kesintide devrede kalmak ve şebekeden bağımsızlık. Yukarıda hem bataryasız hem bataryalı geri ödemeyi ayrı gösteriyoruz ki farkı görün.');
        if (cy.kaynak === 'ulusal') notes.push('Üretim hesabı Türkiye ortalaması (' + fmt(verim) + ' kWh/kWp/yıl) ile yapıldı' + (city ? ' — seçtiğiniz şehir için ölçülmüş verim henüz sisteme girilmemiş' : '; şehrinizi seçerseniz varsa yerel değer kullanılır') + '. Gerçek üretim bölgeye göre %20-25 oynayabilir.');
        notes.push('Geri ödeme; elektrik zammı yıllık %' + Math.round(window.epcEnflasyon() * 100) + ' ve panel yıpranması yıllık %' + (window.epcYipranma() * 100).toFixed(1) + ' varsayımıyla, 25 yıllık birikimli tasarruf üzerinden hesaplandı. Zam oranı gerçekleşmezse süre uzar.');
        notes.push('Kesin sistem büyüklüğü; çatının yönü (güney ideal), eğimi ve gölgelenme durumuna göre değişir. Bunlar ancak saha keşfiyle netleşir.');
        notes.push('Fiyatlar ortalama/gösterge niteliğindedir; marka-model seçimi, güncel ekipman fiyatları ve döviz kuruna göre farklılaşır. Size özel net fiyat, keşif sonrası verilir.');
        notes.push('Devlet teşvikleri, vergi avantajları ve mahsuplaşma başvuru süreçleri bölgeye ve mevzuata göre değişir; güncel durumu firma/danışman aktarır.');

        _design = { kwp: kwpReal, panels, requiredRoof, production, offset, coverage, unit, monthlyBill,
                    rate, usdKwp, usdBatKwh, panelInverterUsd, batteryUsd, totalUsd, totalTl,
                    annualSaving, monthlySaving, payback, paybackSistem, duzPayback, co2,
                    inverterKw, verim, cityKaynak: cy.kaynak, city,
                    batteryOn, batteryKwh, tariffGroup, limited, notes };
        renderReport();
    };

    // ---------------------------------------------------------- 5) RAPOR
    function renderReport() {
        const r = root(); if (!r) return;
        const d = _design, e = _ex, s = S();
        const stat = (label, val, unit, accent) =>
            `<div class="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p class="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1">${label}</p>
                <p class="text-2xl font-black ${accent || 'text-slate-800'}">${val}<span class="text-xs font-bold text-slate-400 ml-0.5">${unit || ''}</span></p>
            </div>`;

        const notesHtml = d.notes.length ? `
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
                <p class="text-xs font-black text-amber-800 uppercase tracking-wider mb-2">Dikkat Edilmesi Gerekenler</p>
                <ul class="space-y-1.5">${d.notes.map(n => `<li class="text-sm text-amber-900 flex gap-2"><span>•</span><span>${esc(n)}</span></li>`).join('')}</ul>
            </div>` : '';

        const identity = (e.name || e.address) ? `
            <div class="text-sm text-slate-500 mb-4">
                ${e.name ? `<p><b class="text-slate-700">İlgili:</b> ${esc(e.name)}</p>` : ''}
                ${e.address ? `<p><b class="text-slate-700">Adres:</b> ${esc(e.address)}</p>` : ''}
            </div>` : '';

        r.innerHTML = shellHtml() + `
        <div id="baReportCard" class="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-6 md:p-8 shadow-2xl mb-5">
            <p class="text-[11px] uppercase tracking-[0.2em] font-black text-emerald-400 mb-1">Kaba Sistem Önerisi</p>
            <h2 class="text-2xl md:text-3xl font-black mb-1">Size Önerilen GES: <span class="text-emerald-400">${d.kwp.toFixed(1)} kWp</span></h2>
            <p class="text-slate-300 text-sm mb-5">Yıllık ${fmt(e.yearlyKwh)} kWh tüketiminize göre hazırlanmış ön değerlendirme.</p>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                ${stat('Önerilen Güç', d.kwp.toFixed(1), 'kWp', 'text-emerald-600')}
                ${stat('Panel Sayısı', '≈' + d.panels, 'adet', 'text-slate-800')}
                ${stat('Yıllık Üretim', fmt(d.production), 'kWh', 'text-slate-800')}
                ${stat('İhtiyacı Karşılama', Math.min(d.coverage, 100), '%', 'text-emerald-600')}
            </div>
                <p class="text-[11px] text-slate-400 mt-3"><b class="text-slate-300">${(panelKwp()*1000).toFixed(0)} Wp</b> panel · inverter <b class="text-slate-300">≈${d.inverterKw} kW</b> (DC/AC ≈1,15) · yerleşim <b class="text-slate-300">${m2PerKwp()} m²/kWp</b> · verim <b class="text-slate-300">${fmt(d.verim)} kWh/kWp/yıl</b>${d.cityKaynak === 'sehir' ? ' (şehrinize özel)' : ' (Türkiye ort.)'}</p>
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
            ${identity}
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-3">
                <p class="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1">Tahmini Yatırım <span class="text-emerald-600">(ortalama fiyat)</span></p>
                <p class="text-3xl font-black text-slate-800">$${fmt(d.totalUsd)} <span class="text-base font-bold text-slate-400">≈ ₺${fmt(d.totalTl)}</span></p>
                <p class="text-xs text-slate-500 mt-1">Panel + inverter: <b>$${fmt(d.panelInverterUsd)}</b> (${d.kwp.toFixed(1)} kWp × ${fmt(d.usdKwp)} $/kWp)${d.batteryUsd ? ` &nbsp;·&nbsp; Batarya: <b>$${fmt(d.batteryUsd)}</b> (${d.batteryKwh} kWh × ${fmt(d.usdBatKwh)} $/kWh)` : ''}</p>
                <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1 mt-2 inline-block">⚠️ Bu bir <b>ortalama / gösterge</b> fiyattır. Net fiyat; marka, ekipman ve güncel döviz kuruna göre değişir.</p>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                ${stat('Aylık Tasarruf', '₺' + fmt(d.monthlySaving), '', 'text-emerald-600')}
                ${stat('Yıllık Tasarruf', '₺' + fmt(d.annualSaving), '', 'text-emerald-600')}
                ${stat('Geri Ödeme', d.payback ? d.payback.toFixed(1) : '25+', 'yıl', 'text-emerald-600')}
                ${stat('Gerekli Çatı Alanı', '≈' + fmt(d.requiredRoof), 'm²')}
                ${stat('İnverter', d.inverterKw, 'kW')}
                ${stat('Yıllık CO₂ Tasarrufu', fmt(d.co2), 'kg')}
            </div>
            ${d.batteryUsd > 0 && d.paybackSistem ? `
            <div class="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
                <p class="font-bold text-slate-700 mb-1">Bataryanın geri ödemeye etkisi</p>
                <p class="text-slate-600">Bataryasız: <b class="text-emerald-700">${d.paybackSistem.toFixed(1)} yıl</b> ·
                   Bataryalı: <b class="text-slate-800">${d.payback ? d.payback.toFixed(1) + ' yıl' : '25 yılda dönmüyor'}</b>.
                   Batarya maliyete giriyor, mahsuplaşma nedeniyle parasal getirisi sayılmıyor.</p>
            </div>` : ''}
            ${notesHtml}
            <p class="text-[11px] text-slate-400 mt-4 leading-relaxed">
                Bu rapor; ${fmt(d.verim)} kWh/kWp/yıl verim${d.cityKaynak === 'sehir' ? ' (şehrinize özel ayar)' : ' (Türkiye ortalaması)'}, ${(panelKwp()*1000).toFixed(0)} Wp panel, ${m2PerKwp()} m²/kWp yerleşim ve ortalama fiyatlarla ($${fmt(d.usdKwp)}/kWp panel+inverter, kur ${fmt(d.rate)} ₺/$) hazırlanmış bir ÖN DEĞERLENDİRMEDİR. Geri ödeme, yıllık %${Math.round(window.epcEnflasyon()*100)} elektrik zammı ve %${(window.epcYipranma()*100).toFixed(1)} panel yıpranması varsayımıyla 25 yıllık birikimli tasarruf üzerinden bulunur. Bağlayıcı teklif değildir.
            </p>
        </div>

        <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mt-5">
            <h3 class="font-black text-slate-800 text-lg mb-1">Net fiyat için son adım: uzmanla devam edin</h3>
            <p class="text-sm text-slate-600 mb-4">Bu ön rapor tahminidir. Size özel <b>kesin keşif ve net fiyat</b> için ya doğrudan kurulumcu firmalardan teklif isteyin ya da bir danışmanla adım adım ilerleyin — ikisi de ücretsiz ve bağlayıcı değildir.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onclick="baOpenQuote()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl shadow-lg shadow-emerald-600/25 text-left px-5">
                    <span class="block">📩 Net Teklif İste</span>
                    <span class="block text-[11px] font-medium text-emerald-100 mt-0.5">Talebiniz uzman firmalara iletilir, size fiyat gelir</span>
                </button>
                <button onclick="baGoConsultants()" class="bg-slate-800 hover:bg-slate-900 text-white font-black py-3.5 rounded-xl shadow-lg text-left px-5">
                    <span class="block">👤 Danışmanla Devam Et</span>
                    <span class="block text-[11px] font-medium text-slate-300 mt-0.5">Bir uzman tüm süreci baştan sona sizin için yönetsin</span>
                </button>
            </div>
            <button onclick="baDownloadReport()" class="mt-3 text-sm text-slate-600 hover:text-emerald-700 underline">⬇️ Bu raporu PDF olarak indir</button>
        </div>
        <button onclick="baBackToConfirm()" class="mt-4 text-sm text-slate-500 hover:text-emerald-600 underline">← Bilgileri düzenle</button>`;
    }

    // Danışman listesine yönlendir (satış hunisinin ikinci yolu)
    window.baGoConsultants = function () {
        if (typeof openPublicModule === 'function') openPublicModule('consultantsModule');
        if (typeof renderConsultantsList === 'function') renderConsultantsList();
    };

    window.baBackToConfirm = function () { renderConfirm(); setTimeout(prefillConfirm, 30); };
    function prefillConfirm() {
        const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
        set('baMonthly', _ex.monthlyKwh); set('baYearly', _ex.yearlyKwh); set('baPower', _ex.contractPower);
        set('baRoof', _ex.roofM2);
        if (_ex.tariffGroup) { const t = document.getElementById('baTariff'); if (t) t.value = _ex.tariffGroup; }
        if (_ex.roofType) { const rt = document.getElementById('baRoofType'); if (rt) rt.value = _ex.roofType; }
        if (_ex.batteryOn) { const b = document.getElementById('baBattery'); if (b) b.value = 'yes'; set('baBatteryKwh', _ex.batteryKwh); }
        if (_ex.docs) { for (const k of ['iskan', 'tapu', 'fatura']) { const el = document.getElementById('baDoc' + k[0].toUpperCase() + k.slice(1)); if (el) el.value = _ex.docs[k]; } }
        baUpdateBillEstimate(); baToggleBattery();
    }

    window.baDownloadReport = async function () {
        const el = document.getElementById('baReportCard');
        if (!el) { window.print(); return; }
        // html2pdf (884 KB) tembel yükleniyor; gelmezse tarayıcı yazdırmasına düş.
        try { await window.epcLoadPdf(); } catch (e) { window.print(); return; }

        const btn = document.querySelector('[onclick*="baDownloadReport"]');
        const btnEski = btn ? btn.innerHTML : null;
        if (btn) { btn.innerHTML = '⏳ PDF hazırlanıyor…'; btn.style.pointerEvents = 'none'; }

        // ⚠️ SAYFA BAŞA ALINIYOR — bunu kaldırmayın.
        // html2canvas yakalamayı pencere kaydırmasına göre ötelediği için,
        // kullanıcı rapora kadar kaydırıp butona bastığında ilk sayfa boş
        // çıkıyor ve içerik ortadan kesiliyordu. scrollY telafisi güvenilir
        // çalışmadı; en sağlamı üretim boyunca sayfayı başa almak.
        const eskiKaydirma = window.scrollY || document.documentElement.scrollTop || 0;
        const eskiDavranis = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 120));

        // Genişlik A4'ün basılabilir alanına göre seçildi. Daha genişinde
        // tuval kâğıttan taşıyor ve sağ kenar (ör. başlıktaki tarih) kırpılıyor.
        const SAYFA_PX = 744;
        const wrap = document.createElement('div');
        wrap.style.cssText = 'width:' + SAYFA_PX + 'px;background:#fff;padding:16px 20px;' +
                             'box-sizing:border-box;overflow:hidden';

        const e = _ex || {};
        const baslik = document.createElement('div');
        baslik.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-end;' +
            'border-bottom:2px solid #0B1B2E;padding-bottom:9px;margin-bottom:14px';
        baslik.innerHTML =
            '<div><div style="font-size:18px;font-weight:800;color:#0B1B2E;letter-spacing:-.02em">epcmerkezim</div>' +
            '<div style="font-size:11px;color:#64748b">GES Ön Değerlendirme Raporu</div></div>' +
            '<div style="text-align:right;font-size:10px;color:#64748b">' +
            new Date().toLocaleDateString('tr-TR') +
            (e.name ? '<br><b style="color:#0B1B2E">' + esc(e.name) + '</b>' : '') + '</div>';
        wrap.appendChild(baslik);

        // Rapor kartı + detay kartı. Teklif/CTA bloğu kâğıda basılmaz.
        wrap.appendChild(el.cloneNode(true));
        const detay = el.nextElementSibling;
        if (detay) wrap.appendChild(detay.cloneNode(true));

        const dip = document.createElement('div');
        dip.style.cssText = 'margin-top:12px;padding-top:8px;border-top:1px solid #e2e8f0;' +
                            'font-size:9px;color:#94a3b8;line-height:1.5';
        dip.textContent = 'Bu rapor bağlayıcı bir teklif değildir; ön değerlendirme amaçlıdır. ' +
                          'Kesin sistem ve fiyat saha keşfi sonrası netleşir. epcmerkezim.com';
        wrap.appendChild(dip);

        // Bölünmeyi YALNIZ küçük bloklarda engelle. Büyük beyaz kart bir
        // sayfadan uzun; ona avoid koymak koca bir boşluk bırakıyordu.
        wrap.querySelectorAll('#baReportCard, li, .grid > div').forEach(k => {
            k.style.breakInside = 'avoid'; k.style.pageBreakInside = 'avoid';
        });

        document.body.appendChild(wrap);
        try {
            await html2pdf().set({
                margin: [8, 8, 10, 8],
                filename: 'GES-On-Rapor-' + new Date().toISOString().slice(0, 10) + '.pdf',
                image: { type: 'jpeg', quality: 0.92 },
                html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'legacy'] }
            }).from(wrap).save();
        } catch (err) {
            alert('PDF oluşturulamadı. Tarayıcının yazdırma ekranını açıyoruz.');
            window.print();
        } finally {
            wrap.remove();
            window.scrollTo(0, eskiKaydirma);
            document.documentElement.style.scrollBehavior = eskiDavranis;
            if (btn) { btn.innerHTML = btnEski; btn.style.pointerEvents = ''; }
        }
    };

    // ------------------------------------------------ 6) TEKLİF (onay + submit_lead)
    window.baOpenQuote = function () {
        const e = _ex || {};
        let m = document.getElementById('baQuoteModal');
        if (!m) { m = document.createElement('div'); m.id = 'baQuoteModal'; document.body.appendChild(m); m.addEventListener('click', ev => { if (ev.target === m) m.classList.add('hidden'); }); }
        m.className = 'fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4 overflow-y-auto';
        m.innerHTML = `<div class="bg-white rounded-2xl w-full max-w-md my-8">
            <div class="flex items-center justify-between px-6 pt-6 pb-2">
                <h3 class="font-black text-lg text-slate-800">📩 Teklif Talebi</h3>
                <button onclick="document.getElementById('baQuoteModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>
            <div class="px-6 pb-6 space-y-3">
                <p class="text-sm text-slate-500">İletişim bilgilerinizi paylaşın; talebiniz ${d(_design) ? '<b>' + _design.kwp.toFixed(1) + ' kWp</b> önerisiyle birlikte ' : ''}uzman firmalara iletilsin.</p>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Ad Soyad *</label><input id="bqName" value="${esc(e.name || '')}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Telefon *</label><input id="bqPhone" type="tel" placeholder="05..." class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">E-posta *</label><input id="bqEmail" type="email" placeholder="ornek@eposta.com" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                </div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Adres / İl-İlçe *</label><input id="bqAddress" value="${esc(e.address || '')}" placeholder="Kurulum yeri" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>

                <div class="border-t border-slate-200 pt-3">
                    <p class="block text-xs font-bold text-slate-600 mb-2">Bu belgelerden hangileri sizde mevcut? <span class="font-medium text-slate-400">(opsiyonel — firma evrak sürecini buna göre planlar)</span></p>
                    <div class="space-y-2">
                        ${docRow('baDocIskan', 'İskân / Yapı Kullanma İzni', 'GES başvurusunda çoğunlukla zorunludur', true)}
                        ${docRow('baDocTapu', 'Tapu veya kira sözleşmesi', 'Mülk sahipliği / kullanım hakkı')}
                        ${docRow('baDocFatura', 'Güncel elektrik aboneliği / son fatura', 'Yüklediğiniz belge bunu karşılıyor olabilir')}
                    </div>
                </div>
                <p class="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-md px-2.5 py-2">📬 E-postanıza <b>tek tıklık yatırımcı paneli giriş bağlantısı</b> göndereceğiz; başvurunuzu ve gelen teklifleri oradan takip edersiniz.</p>
                <label class="flex items-start gap-2.5 cursor-pointer pt-1">
                    <input type="checkbox" id="bqKvkk" class="mt-0.5 w-4 h-4 rounded shrink-0">
                    <span class="text-[11px] text-slate-500 leading-relaxed"><button type="button" onclick="openLegalTab('kvkk')" class="text-emerald-700 font-bold underline">KVKK Aydınlatma Metni</button>'ni okudum; bilgilerimin talebimin karşılanması için kurulumcu firmalarla paylaşılmasına onay veriyorum. <span class="text-red-500">*</span></span>
                </label>
                <label class="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" id="bqMarketing" class="mt-0.5 w-4 h-4 rounded shrink-0">
                    <span class="text-[11px] text-slate-500 leading-relaxed">Kampanya ve bilgilendirme amaçlı elektronik ileti almayı kabul ediyorum. (opsiyonel)</span>
                </label>

                <button onclick="baSubmitQuote()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl mt-1">Talebi Gönder</button>
                <div id="bqResult"></div>
            </div>
        </div>`;
        m.classList.remove('hidden');
    };
    function d(x) { return x; }

    function buildLeadNotes() {
        const e = _ex || {}, g = _design || {};
        const yn = (v) => v === 'yes' ? 'Var' : v === 'no' ? 'Yok' : 'Emin değil';
        const tl = (v) => v != null ? '₺' + fmt(v) : '—';
        const L = [];
        L.push('[Fatura Analizi ile oluşturuldu]');
        L.push(`Yıllık tüketim: ${fmt(e.yearlyKwh)} kWh · Aylık: ${e.monthlyKwh != null ? fmt(e.monthlyKwh) + ' kWh' : '—'}`);
        L.push(`Abonelik tipi: ${e.tariffGroup ? (TARIFF_LABEL[e.tariffGroup] || e.tariffGroup) : '—'} · Tahmini aylık fatura: ${tl(e.totalAmount)}`);
        L.push(`Sözleşme gücü: ${e.contractPower != null ? e.contractPower + ' kW' : '—'}`);
        L.push(`Çatı alanı: ${e.roofM2 != null ? e.roofM2 + ' m²' : '—'} · Çatı tipi: ${e.roofType || '—'}`);
        L.push(`Şehir: ${e.city ? ((window.EPC_CITIES || []).find(c => c.key === e.city) || {}).ad || e.city : '— (Türkiye ort.)'} · Kullanılan verim: ${e.cityYield ? fmt(e.cityYield) + ' kWh/kWp/yıl' : '—'}`);
        L.push(`Batarya isteği: ${e.batteryOn ? 'Evet (' + (e.batteryKwh || '?') + ' kWh)' : 'Hayır'}`);
        if (e.docs) L.push(`Belgeler → İskân: ${yn(e.docs.iskan)} · Tapu/kira: ${yn(e.docs.tapu)} · Abonelik: ${yn(e.docs.fatura)}`);
        L.push('—');
        L.push(`Önerilen sistem: ${g.kwp ? g.kwp.toFixed(1) : '—'} kWp · ≈${g.panels || '—'} panel (${(panelKwp()*1000).toFixed(0)} Wp) · İnverter ≈${g.inverterKw || '—'} kW · Yıllık üretim: ${g.production != null ? fmt(g.production) + ' kWh' : '—'} · Karşılama: %${g.coverage != null ? Math.min(g.coverage,100) : '—'}`);
        L.push(`Tahmini yatırım (ortalama): $${g.totalUsd != null ? fmt(g.totalUsd) : '—'} (≈${tl(g.totalTl)})${g.batteryUsd ? ' — batarya $' + fmt(g.batteryUsd) + ' dahil' : ''}`);
        L.push(`Yıllık tasarruf: ${tl(g.annualSaving)} · Geri ödeme: ${g.payback ? g.payback.toFixed(1) + ' yıl' : '—'}`);
        return L.join('\n');
    }

    window.baSubmitQuote = async function () {
        const res = document.getElementById('bqResult');
        const name = (document.getElementById('bqName').value || '').trim();
        const phone = (document.getElementById('bqPhone').value || '').trim();
        const email = (document.getElementById('bqEmail').value || '').trim();
        const address = (document.getElementById('bqAddress').value || '').trim();
        const kvkk = !!document.getElementById('bqKvkk').checked;
        const marketing = !!document.getElementById('bqMarketing').checked;
        // Belge yanıtları artık bu adımda soruluyor; lead notuna buradan giriyor.
        _ex = Object.assign(_ex || {}, { docs: {
            soruldu: true,
            iskan:  document.getElementById('baDocIskan')?.value  || 'unsure',
            tapu:   document.getElementById('baDocTapu')?.value   || 'unsure',
            fatura: document.getElementById('baDocFatura')?.value || 'unsure'
        }});

        if (!name || !phone || !address || !email) { res.innerHTML = '<p class="text-red-500 text-sm font-bold">Ad, telefon, e-posta ve adres zorunludur.</p>'; return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.innerHTML = '<p class="text-red-500 text-sm font-bold">Geçerli bir e-posta adresi girin.</p>'; return; }
        if (!kvkk) { res.innerHTML = '<p class="text-red-500 text-sm font-bold">Devam etmek için KVKK onayı gereklidir.</p>'; return; }
        if (!window.supabaseClient) { res.innerHTML = '<p class="text-red-500 text-sm font-bold">Bağlantı yok, lütfen sonra tekrar deneyin.</p>'; return; }

        res.innerHTML = '<p class="text-xs text-slate-400">Gönderiliyor...</p>';
        try {
            const { data: code, error } = await supabaseClient.rpc('submit_lead', {
                p_full_name: name,
                p_phone: phone,
                p_email: email,
                p_address: address,
                p_outage: 'Belirtilmedi',
                p_extra_consumption: 'Yok',
                p_notes: buildLeadNotes(),
                p_company_id: null,          // merkezi havuz → admin firmaya atar
                p_source: 'fatura-analizi'
            });
            if (error) throw error;

            // KVKK / açık rıza onay kaydı (ispat yükü) — başvuruyu engellemez
            try {
                await supabaseClient.rpc('log_consent', {
                    p_context: 'lead', p_full_name: name, p_phone: phone, p_email: email,
                    p_reference: String(code || ''), p_kvkk: kvkk, p_marketing: marketing,
                    p_version: 'v1', p_agent: navigator.userAgent
                });
            } catch (e) { /* sessiz geç */ }

            // Hesap-temelli takip: e-postaya tek tıklık giriş bağlantısı gönder.
            let _mail = { ok: false, error: '' };
            try { _mail = await sendInvestorMagicLink(email, name, phone); } catch (e) { _mail = { ok: false, error: String(e && e.message || e) }; }
            res.innerHTML = `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center mt-1">
                <div class="text-3xl mb-1">🎉</div>
                <p class="font-black text-slate-800">Talebiniz iletildi!</p>
                ${_mail.ok
                    ? `<p class="text-sm text-slate-600 mt-1">📬 <b class="text-emerald-700">${esc(email)}</b> adresine yatırımcı paneli <b>giriş bağlantısı</b> gönderdik.</p>
                       <p class="text-xs text-slate-400 mt-1">Bağlantıya tıklayın: başvurunuz hesabınıza bağlanır; süreci izler, gelen teklifleri karşılaştırırsınız. Gelmezse spam klasörüne bakın.</p>`
                    : `<p class="text-sm text-slate-600 mt-1">Süreci takip etmek için "Yatırımcı Girişi" ile <b>${esc(email)}</b> adresinizi kullanın.</p>
                       ${_mail.error ? `<p class="text-xs text-amber-600 mt-1">(Giriş bağlantısı gönderilemedi: ${esc(_mail.error)})</p>` : ''}`}
                <button onclick="baAfterQuote()" class="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm">Tamam</button>
            </div>`;
        } catch (err) {
            res.innerHTML = `<p class="text-red-500 text-sm font-bold">Gönderilemedi: ${esc(err.message || err)}</p>`;
        }
    };

    window.baAfterQuote = function () {
        // Takip artık hesap üzerinden: modalı kapat, kullanıcı e-postasındaki bağlantıyla girer.
        document.getElementById('baQuoteModal')?.classList.add('hidden');
    };

})();
