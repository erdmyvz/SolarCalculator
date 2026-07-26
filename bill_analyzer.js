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
    function S() {
        const d = { solarYield: 1500, roofM2PerKwp: 5.5, kwpPerPanel: 0.55, pricePerKwp: 30000, co2PerKwh: 0.45, tariff: 2.5 };
        const s = window.EPC_SETTINGS || {};
        return {
            solarYield:  Number(s.solarYield)  || d.solarYield,
            roofM2PerKwp:Number(s.roofM2PerKwp)|| d.roofM2PerKwp,
            kwpPerPanel: Number(s.kwpPerPanel) || d.kwpPerPanel,
            pricePerKwp: Number(s.pricePerKwp) || d.pricePerKwp,
            co2PerKwh:   Number(s.co2PerKwh)   || d.co2PerKwh,
            tariff:      Number(s.tariff)      || d.tariff
        };
    }

    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
    const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '')); return isNaN(n) ? null : n; };

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
            source
        };
    }

    // --- Türk elektrik faturası sezgisel ayrıştırıcı (best-effort) ---
    function parseBillText(text) {
        const t = ' ' + text.replace(/\r/g, ' ').replace(/\u00a0/g, ' ') + ' ';
        const low = t.toLowerCase();
        const grabNum = (re) => { const m = low.match(re); return m ? num(m[1]) : null; };

        // Tüketim (kWh) — birkaç yaygın kalıp
        let yearlyKwh = grabNum(/y[ıi]ll[ıi]k[^0-9]{0,20}?([0-9][0-9\.\, ]{1,12})\s*kwh/);
        let monthlyKwh =
            grabNum(/toplam\s*t[üu]ketim[^0-9]{0,15}?([0-9][0-9\.\, ]{1,10})\s*kwh/) ||
            grabNum(/t[üu]ketim[^0-9]{0,15}?([0-9][0-9\.\, ]{1,10})\s*kwh/) ||
            grabNum(/aktif\s*enerji[^0-9]{0,15}?([0-9][0-9\.\, ]{1,10})\s*kwh/) ||
            grabNum(/([0-9][0-9\.\, ]{1,10})\s*kwh/);

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

        return { monthlyKwh, yearlyKwh, contractPower, name, address, totalAmount, source: 'ocr' };
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
                        <label class="block text-xs font-bold text-slate-600 mb-1">Son fatura tutarı (₺) ${foundBadge(e.totalAmount)}</label>
                        <input id="baAmount" type="number" inputmode="decimal" value="${e.totalAmount != null ? e.totalAmount : ''}" placeholder="opsiyonel" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
                    </div>
                </div>
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

                <p class="block text-xs font-bold text-slate-600 mb-2">Aşağıdaki belgelerden hangileri sizde mevcut?</p>
                <div class="space-y-2 mb-2">
                    ${docRow('baDocIskan', 'İskân / Yapı Kullanma İzni', 'GES başvurusunda çoğunlukla zorunludur', true)}
                    ${docRow('baDocTapu', 'Tapu veya kira sözleşmesi', 'Mülk sahipliği / kullanım hakkı')}
                    ${docRow('baDocFatura', 'Güncel elektrik aboneliği / son fatura', 'Yüklediğiniz belge bunu karşılıyor olabilir')}
                </div>
                <p class="text-[11px] text-slate-400">Belgeniz yoksa da devam edebilirsiniz; firma temin sürecinde yardımcı olur.</p>
            </div>

            <div class="flex flex-col sm:flex-row gap-3">
                <button onclick="baBackToUpload()" class="sm:w-auto px-5 py-3 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-50">← Farklı fatura yükle</button>
                <button onclick="baComputeDesign()" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl shadow-lg shadow-emerald-600/25">Sistemimi Tasarla →</button>
            </div>
            <div id="baConfirmErr"></div>
        </div>`;
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
        const amount  = num(document.getElementById('baAmount')?.value);
        const roof    = num(document.getElementById('baRoof')?.value);
        const roofType= document.getElementById('baRoofType')?.value || '';
        const docs = {
            iskan:  document.getElementById('baDocIskan')?.value || 'unsure',
            tapu:   document.getElementById('baDocTapu')?.value || 'unsure',
            fatura: document.getElementById('baDocFatura')?.value || 'unsure'
        };

        _ex = Object.assign(_ex || {}, {
            monthlyKwh: monthly, yearlyKwh: Math.round(yearly), contractPower: power, totalAmount: amount,
            roofM2: roof, roofType, docs
        });

        const s = S();
        const notes = [];

        // İhtiyaç, çatı ve güç kısıtlarının minimumu
        const kwpNeed = yearly / s.solarYield;
        let kwp = kwpNeed;
        let limited = null;
        if (roof != null && roof > 0) {
            const kwpRoof = roof / s.roofM2PerKwp;
            if (kwpRoof < kwp) { kwp = kwpRoof; limited = 'roof'; }
        }
        if (power != null && power > 0) {
            if (power < kwp) { kwp = power; limited = limited ? 'both' : 'power'; }
        }
        kwp = Math.max(0.5, kwp);

        const panels = Math.max(1, Math.ceil(kwp / s.kwpPerPanel));
        const requiredRoof = kwp * s.roofM2PerKwp;
        const production = kwp * s.solarYield;
        const offset = Math.min(production, yearly);          // mahsuplaşan üretim
        const coverage = Math.round(production / yearly * 100);
        const investment = kwp * s.pricePerKwp;
        // Yıllık tasarruf: fatura tutarı varsa ondan kWh başı birim türet, yoksa tarife
        const unit = (amount != null && monthly != null && monthly > 0) ? (amount / monthly) : s.tariff;
        const annualSaving = offset * unit;
        const payback = annualSaving > 0 ? investment / annualSaving : 0;
        const co2 = production * s.co2PerKwh;

        if (limited === 'roof') notes.push('Girdiğiniz çatı alanı, yıllık ihtiyacınızın tamamını karşılayacak sistemden küçük. Önerilen sistem çatınıza sığacak şekilde küçültüldü — kalan tüketimi şebekeden alırsınız.');
        if (limited === 'power') notes.push('Sözleşme gücünüz, ihtiyaç duyulan kurulu güçten düşük. Sistem sözleşme gücüne göre sınırlandı; daha büyük sistem için güç artırımı gerekebilir.');
        if (limited === 'both') notes.push('Hem çatı alanı hem sözleşme gücü sınırlayıcı oldu; sistem ikisinin izin verdiği en küçük değere göre önerildi.');
        if (coverage >= 98 && limited == null) notes.push('Önerilen sistem yıllık tüketiminizin neredeyse tamamını karşılıyor. Mahsuplaşma mantığı gereği ihtiyacın çok üstünde sistem önermiyoruz.');
        if (docs.iskan === 'no') notes.push('İskân (yapı kullanma izni) belgeniz yok görünüyor. Bu belge çoğu başvuruda zorunludur; kurulumdan önce temin edilmesi gerekir. Firma bu süreçte yönlendirebilir.');
        if (docs.iskan === 'unsure') notes.push('İskân belgesi durumundan emin değilsiniz. Başvuru öncesi bu belgenin mevcut olup olmadığını netleştirmek önemlidir.');

        _design = { kwp, panels, requiredRoof, production, offset, coverage, investment, annualSaving, payback, co2, unit, limited, notes };
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
                ${stat('Önerilen Güç', d.kwp.toFixed(1), 'kWp', 'text-emerald-400')}
                ${stat('Panel Sayısı', '≈' + d.panels, 'adet', 'text-white')}
                ${stat('Yıllık Üretim', fmt(d.production), 'kWh', 'text-white')}
                ${stat('İhtiyacı Karşılama', Math.min(d.coverage, 100), '%', 'text-emerald-400')}
            </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
            ${identity}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                ${stat('Gerekli Çatı Alanı', '≈' + fmt(d.requiredRoof), 'm²')}
                ${stat('Tahmini Yatırım', '₺' + fmt(d.investment), '')}
                ${stat('Yıllık Tasarruf', '₺' + fmt(d.annualSaving), '', 'text-emerald-600')}
                ${stat('Geri Ödeme', d.payback ? d.payback.toFixed(1) : '—', 'yıl')}
            </div>
            <div class="grid grid-cols-2 gap-3 mb-2">
                ${stat('Yıllık CO₂ Tasarrufu', '≈' + fmt(d.co2), 'kg')}
                ${stat('Sözleşme Gücü', e.contractPower != null ? e.contractPower : '—', 'kW')}
            </div>
            ${notesHtml}
            <p class="text-[11px] text-slate-400 mt-4 leading-relaxed">
                Bu rapor; Türkiye ortalama değerleri (${s.solarYield} kWh/kWp yıllık verim, ${s.roofM2PerKwp} m²/kWp alan, ${fmt(s.pricePerKwp)} ₺/kWp maliyet) ve girdiğiniz bilgilerle hazırlanmış <b>gösterge niteliğinde</b> bir ön çalışmadır. Kesin sistem tasarımı, üretim ve fiyat; saha keşfi, çatı yönü/eğimi ve güncel ekipman fiyatlarıyla firma tarafından netleştirilir.
            </p>
        </div>

        <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mt-5">
            <h3 class="font-black text-slate-800 text-lg mb-1">Bu sistem için gerçek teklif almak ister misiniz?</h3>
            <p class="text-sm text-slate-600 mb-4">Talebinizi, alanında uzman kurulumcu firmalara ileterek size özel keşif ve fiyat almanızı sağlayabiliriz. Ücretsiz ve bağlayıcı değildir.</p>
            <div class="flex flex-col sm:flex-row gap-3">
                <button onclick="baOpenQuote()" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl shadow-lg shadow-emerald-600/25">📩 Bu Sistem İçin Teklif İste</button>
                <button onclick="baDownloadReport()" class="sm:w-auto px-5 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 bg-white">⬇️ Raporu PDF indir</button>
            </div>
        </div>
        <button onclick="baBackToConfirm()" class="mt-4 text-sm text-slate-500 hover:text-emerald-600 underline">← Bilgileri düzenle</button>`;
    }

    window.baBackToConfirm = function () { renderConfirm(); setTimeout(prefillConfirm, 30); };
    function prefillConfirm() {
        const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
        set('baMonthly', _ex.monthlyKwh); set('baYearly', _ex.yearlyKwh); set('baPower', _ex.contractPower);
        set('baAmount', _ex.totalAmount); set('baRoof', _ex.roofM2);
        if (_ex.roofType) { const rt = document.getElementById('baRoofType'); if (rt) rt.value = _ex.roofType; }
        if (_ex.docs) { for (const k of ['iskan', 'tapu', 'fatura']) { const el = document.getElementById('baDoc' + k[0].toUpperCase() + k.slice(1)); if (el) el.value = _ex.docs[k]; } }
    }

    window.baDownloadReport = function () {
        const card = document.getElementById('baReportCard')?.parentElement;
        const el = document.getElementById('baReportCard');
        if (!el || typeof html2pdf === 'undefined') { window.print(); return; }
        // Rapor kartı + detay kartını birlikte al
        const wrap = document.createElement('div');
        wrap.style.cssText = 'background:#fff;padding:20px';
        wrap.appendChild(el.cloneNode(true));
        const detail = el.nextElementSibling; if (detail) wrap.appendChild(detail.cloneNode(true));
        html2pdf().set({ margin: 8, filename: 'GES-On-Rapor.pdf', image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4' } }).from(wrap).save();
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
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">E-posta</label><input id="bqEmail" type="email" placeholder="opsiyonel" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                </div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Adres / İl-İlçe *</label><input id="bqAddress" value="${esc(e.address || '')}" placeholder="Kurulum yeri" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>

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
        const L = [];
        L.push('[Fatura Analizi ile oluşturuldu]');
        L.push(`Yıllık tüketim: ${fmt(e.yearlyKwh)} kWh · Aylık: ${e.monthlyKwh != null ? fmt(e.monthlyKwh) + ' kWh' : '—'}`);
        L.push(`Sözleşme gücü: ${e.contractPower != null ? e.contractPower + ' kW' : '—'} · Son fatura: ${e.totalAmount != null ? '₺' + fmt(e.totalAmount) : '—'}`);
        L.push(`Çatı alanı: ${e.roofM2 != null ? e.roofM2 + ' m²' : '—'} · Çatı tipi: ${e.roofType || '—'}`);
        if (e.docs) L.push(`Belgeler → İskân: ${yn(e.docs.iskan)} · Tapu/kira: ${yn(e.docs.tapu)} · Abonelik: ${yn(e.docs.fatura)}`);
        L.push('—');
        L.push(`Önerilen sistem: ${g.kwp ? g.kwp.toFixed(1) : '—'} kWp · ≈${g.panels || '—'} panel · Yıllık üretim ${g.production != null ? fmt(g.production) + ' kWh' : '—'}`);
        L.push(`Tahmini yatırım: ${g.investment != null ? '₺' + fmt(g.investment) : '—'} · Yıllık tasarruf: ${g.annualSaving != null ? '₺' + fmt(g.annualSaving) : '—'} · Geri ödeme: ${g.payback ? g.payback.toFixed(1) + ' yıl' : '—'}`);
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

        if (!name || !phone || !address) { res.innerHTML = '<p class="text-red-500 text-sm font-bold">Ad, telefon ve adres zorunludur.</p>'; return; }
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

            res.innerHTML = `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center mt-1">
                <div class="text-3xl mb-1">🎉</div>
                <p class="font-black text-slate-800">Talebiniz iletildi!</p>
                <p class="text-sm text-slate-600 mt-1">Takip kodunuz: <b class="text-emerald-700">${esc(String(code || ''))}</b></p>
                <p class="text-xs text-slate-400 mt-1">Bu kodla ana sayfadan sürecinizi izleyebilirsiniz.</p>
                <button onclick="baAfterQuote('${esc(String(code || ''))}')" class="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm">Tamam</button>
            </div>`;
        } catch (err) {
            res.innerHTML = `<p class="text-red-500 text-sm font-bold">Gönderilemedi: ${esc(err.message || err)}</p>`;
        }
    };

    window.baAfterQuote = function (code) {
        document.getElementById('baQuoteModal')?.classList.add('hidden');
        // Ana sayfadaki takip alanına kodu yaz ve sorgula (mevcut akış)
        const ti = document.getElementById('leadTrackInput');
        if (ti && code) { ti.value = code; }
        window.location.hash = '#home';
        setTimeout(() => { const b = document.getElementById('btnTrackQuery'); if (b && code) b.click(); }, 300);
    };

})();
