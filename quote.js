/* ============================================================================
   quote.js — OTONOM TEKLİF MOTORU (kurulumcu firma)
   CRM müşteri kartından açılır. Müşterinin verisinden otomatik sistem boyutu ve
   finansal analiz üretir; düzenlenebilir maliyet kalemleri + AI ile yazılmış
   teklif metni + markalı PDF sunar. core.js'ten sonra yüklenir.
   (crmLeads, currentUserProfile, html2pdf globaldir. DB'ye yazmaz.)
   ============================================================================ */
(function () {
    // Referans katsayılar (kolayca güncellenebilir)
    const Q_YIELD = 1500;          // yıllık üretim kWh/kWp
    const Q_KWP_PER_PANEL = 0.55;  // 550 W panel
    const Q_TARIFF = 2.5;          // TL/kWh (tüketim tahmini için)
    const Q_PRICE_PER_KWP = 30000; // referans anahtar-teslim TL/kWp (kalemlere dağıtılır)

    let _qLead = null;
    let _qQuotes = [];
    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const companyName = () => (currentUserProfile && currentUserProfile.companies && currentUserProfile.companies.name)
        || (currentUserProfile && currentUserProfile.company_name) || 'Firmamız';

    window.crmOpenQuote = function (leadId) {
        const lead = (typeof crmLeads !== 'undefined' ? crmLeads : []).find(l => l.id === leadId);
        if (!lead) { alert('Müşteri bulunamadı.'); return; }
        _qLead = lead;

        // --- Otomatik boyutlandırma (değerler admin Ayarlar'dan; yoksa varsayılan) ---
        const _S = window.EPC_SETTINGS || {};
        const _TARIFF = _S.tariff       || Q_TARIFF;
        const _YIELD  = _S.solarYield   || Q_YIELD;
        const _PANELK = _S.kwpPerPanel  || Q_KWP_PER_PANEL;
        const _PRICE  = _S.pricePerKwp  || Q_PRICE_PER_KWP;

        const yearlyKwh = lead.bill_amount ? (lead.bill_amount / _TARIFF) * 12 : 0;
        let kwp = yearlyKwh > 0 ? yearlyKwh / _YIELD : 5;
        kwp = Math.max(1, Math.round(kwp * 10) / 10);
        const panels = Math.max(1, Math.ceil(kwp / _PANELK));
        const annualSaving = lead.bill_amount ? Math.round(lead.bill_amount * 12) : Math.round(yearlyKwh * _TARIFF);

        // --- Otomatik maliyet kalemleri ---
        const items = [
            { name: 'Güneş Paneli', qty: panels, unit: Math.round(_PRICE * 0.40 * kwp / panels) },
            { name: 'İnverter (Evirici)', qty: 1, unit: Math.round(_PRICE * 0.15 * kwp) },
            { name: 'Montaj & Konstrüksiyon', qty: 1, unit: Math.round(_PRICE * 0.15 * kwp) },
            { name: 'Kablolama & Pano', qty: 1, unit: Math.round(_PRICE * 0.10 * kwp) },
            { name: 'Proje, Ruhsat & İşçilik', qty: 1, unit: Math.round(_PRICE * 0.20 * kwp) }
        ];
        if (lead.wants_storage === 'Evet') items.push({ name: 'Batarya (Enerji Depolama)', qty: 1, unit: 40000 });

        openModal(lead, kwp, panels, annualSaving, items);
    };

    function itemRow(it) {
        return `
            <div data-row class="grid grid-cols-12 gap-2 items-center mb-2">
                <input class="q-name col-span-5 border border-slate-300 p-2 rounded-lg text-xs" value="${esc(it.name)}">
                <input class="q-qty col-span-2 border border-slate-300 p-2 rounded-lg text-xs text-center" type="number" value="${it.qty}">
                <input class="q-unit col-span-3 border border-slate-300 p-2 rounded-lg text-xs text-right" type="number" value="${it.unit}">
                <span class="q-line col-span-1 text-xs text-right font-bold text-slate-700"></span>
                <button onclick="this.closest('[data-row]').remove(); qRecompute();" class="col-span-1 text-red-500 text-lg leading-none">&times;</button>
            </div>`;
    }

    function openModal(lead, kwp, panels, annualSaving, items) {
        const ex = document.getElementById('quoteModal'); if (ex) ex.remove();
        const m = document.createElement('div');
        m.id = 'quoteModal';
        m.className = 'fixed inset-0 z-[90] bg-slate-900/60 flex items-center justify-center p-4';
        m.innerHTML = `
            <div class="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
                <div class="px-6 py-5 bg-slate-900 text-white flex justify-between items-start gap-4 sticky top-0 z-10">
                    <div>
                        <h3 class="text-xl font-black">📄 Teklif Oluştur</h3>
                        <p class="text-xs text-slate-400 mt-1">${esc(lead.full_name)} · ${companyName()}</p>
                    </div>
                    <button onclick="document.getElementById('quoteModal').remove()" class="text-2xl text-slate-400 hover:text-white leading-none">&times;</button>
                </div>

                <div class="p-6 space-y-5 bg-slate-50" id="qBody">
                    <div id="qHistory"></div>
                    <div class="bg-white p-5 rounded-xl border border-slate-200">
                        <h4 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3">Önerilen Sistem</h4>
                        <div class="grid grid-cols-3 gap-3">
                            <div><label class="block text-xs font-bold text-slate-600 mb-1">Güç (kWp)</label><input id="qKwp" type="number" step="0.1" value="${kwp}" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                            <div><label class="block text-xs font-bold text-slate-600 mb-1">Panel (adet)</label><input id="qPanels" type="number" value="${panels}" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                            <div><label class="block text-xs font-bold text-slate-600 mb-1">Yıllık Tasarruf (₺)</label><input id="qSaving" type="number" value="${annualSaving}" oninput="qRecompute()" class="w-full border border-slate-300 p-2 rounded-lg text-sm"></div>
                        </div>
                    </div>

                    <div class="bg-white p-5 rounded-xl border border-slate-200">
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Maliyet Kalemleri</h4>
                            <button onclick="qAddRow()" class="text-[11px] bg-slate-100 hover:bg-slate-200 font-bold px-2 py-1 rounded">+ Kalem</button>
                        </div>
                        <div class="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-400 uppercase mb-1 px-1">
                            <span class="col-span-5">Kalem</span><span class="col-span-2 text-center">Adet</span><span class="col-span-3 text-right">Birim ₺</span><span class="col-span-1 text-right">Tutar</span><span class="col-span-1"></span>
                        </div>
                        <div id="qItems">${items.map(itemRow).join('')}</div>
                        <div class="flex justify-between items-center mt-3 pt-3 border-t border-slate-200">
                            <span class="text-sm font-bold text-slate-600">Toplam Yatırım</span>
                            <span class="text-xl font-black text-slate-800">₺<span id="qTotal">0</span></span>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div class="bg-white p-3 rounded-xl border border-slate-200"><p class="text-[10px] text-slate-400 font-bold uppercase">Yatırım</p><p class="text-sm font-black text-slate-800">₺<span id="qInvest">0</span></p></div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200"><p class="text-[10px] text-slate-400 font-bold uppercase">Yıllık Tasarruf</p><p class="text-sm font-black text-emerald-600">₺<span id="qSaving2">0</span></p></div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200"><p class="text-[10px] text-slate-400 font-bold uppercase">Amorti</p><p class="text-sm font-black text-slate-800"><span id="qPayback">-</span> yıl</p></div>
                        <div class="bg-white p-3 rounded-xl border border-slate-200"><p class="text-[10px] text-slate-400 font-bold uppercase">25 Yıl Tasarruf</p><p class="text-sm font-black text-slate-800">₺<span id="q25">0</span></p></div>
                    </div>

                    <div class="bg-white p-5 rounded-xl border border-slate-200">
                        <div class="flex items-center justify-between mb-2">
                            <h4 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Teklif Sunuş Metni</h4>
                            <button id="qAiBtn" onclick="qGenerateAI()" class="text-[11px] bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded-lg">🤖 AI ile Oluştur</button>
                        </div>
                        <textarea id="qNarrative" rows="6" placeholder="Müşteriye sunulacak ikna edici metin. 'AI ile Oluştur' ile otomatik yazdırabilir veya elle girebilirsiniz." class="w-full border border-slate-300 p-3 rounded-lg text-sm outline-none focus:border-amber-500"></textarea>
                    </div>
                </div>

                <div class="px-6 py-4 border-t border-slate-200 bg-white flex justify-end gap-2 sticky bottom-0 flex-wrap">
                    <button onclick="document.getElementById('quoteModal').remove()" class="bg-slate-100 text-slate-700 font-bold px-5 py-2.5 rounded-lg text-sm">Kapat</button>
                    <button onclick="qSaveQuote()" class="bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-lg text-sm">💾 Teklifi Kaydet</button>
                    <button onclick="qDownloadPDF()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-lg text-sm">📥 PDF İndir</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        m.querySelector('#qItems').addEventListener('input', qRecompute);
        qRecompute();
        loadQuoteHistory(lead.id);
    }

    window.qAddRow = function () {
        const box = document.getElementById('qItems');
        if (!box) return;
        box.insertAdjacentHTML('beforeend', itemRow({ name: '', qty: 1, unit: 0 }));
        qRecompute();
    };

    window.qRecompute = function () {
        let total = 0;
        document.querySelectorAll('#qItems [data-row]').forEach(row => {
            const qty = parseFloat(row.querySelector('.q-qty').value) || 0;
            const unit = parseFloat(row.querySelector('.q-unit').value) || 0;
            const line = qty * unit;
            row.querySelector('.q-line').textContent = fmt(line);
            total += line;
        });
        const saving = parseFloat(document.getElementById('qSaving').value) || 0;
        document.getElementById('qTotal').textContent = fmt(total);
        document.getElementById('qInvest').textContent = fmt(total);
        document.getElementById('qSaving2').textContent = fmt(saving);
        document.getElementById('qPayback').textContent = saving > 0 ? (total / saving).toFixed(1) : '-';
        document.getElementById('q25').textContent = fmt(saving * 25);
    };

    function currentTotal() {
        let total = 0;
        document.querySelectorAll('#qItems [data-row]').forEach(row => {
            total += (parseFloat(row.querySelector('.q-qty').value) || 0) * (parseFloat(row.querySelector('.q-unit').value) || 0);
        });
        return total;
    }

    window.qGenerateAI = async function () {
        const lead = _qLead; if (!lead) return;
        const btn = document.getElementById('qAiBtn'); const t = btn.textContent;
        btn.textContent = 'Yazılıyor...'; btn.disabled = true;
        try {
            const kwp = document.getElementById('qKwp').value;
            const panels = document.getElementById('qPanels').value;
            const saving = document.getElementById('qSaving').value;
            const total = Math.round(currentTotal());
            const extras = [];
            if (lead.has_ev === 'Var' || lead.has_ev === 'Yakında') extras.push('elektrikli araç şarjı');
            if (lead.wants_storage === 'Evet') extras.push('batarya ile yedekleme');
            if (lead.has_heat_pump === 'Var' || lead.has_heat_pump === 'Planlıyor') extras.push('ısı pompası');

            const prompt = `Sen deneyimli bir güneş enerjisi satış danışmanısın. Aşağıdaki bilgilere göre müşteriye sunulacak SICAK, İKNA EDİCİ ve PROFESYONEL bir teklif sunuş metni yaz. 3-4 kısa paragraf, Türkçe, abartısız ama güven veren bir üslupla; rakamları metne doğal şekilde yerleştir. Sadece metni döndür, başlık ekleme.
Müşteri adı: ${lead.full_name}
Firma: ${companyName()}
Önerilen sistem: ${kwp} kWp (${panels} panel)
Yıllık tahmini tasarruf: ${saving} TL
Yaklaşık yatırım: ${total} TL
Öne çıkan ihtiyaçlar: ${extras.join(', ') || 'standart ev tüketimi'}`;

            const response = await fetch('/api/gemini', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Sunucu bağlantı hatası.');
            document.getElementById('qNarrative').value = (data.result || '').trim();
        } catch (err) {
            alert('AI metni oluşturulamadı: ' + (err.message || err));
        } finally {
            btn.textContent = t; btn.disabled = false;
        }
    };

    // Formdaki teklifi tek bir veri nesnesine toplar
    function collectQuoteData() {
        const items = [];
        document.querySelectorAll('#qItems [data-row]').forEach(row => {
            const name = row.querySelector('.q-name').value.trim();
            const qty = parseFloat(row.querySelector('.q-qty').value) || 0;
            const unit = parseFloat(row.querySelector('.q-unit').value) || 0;
            if (!name && !unit) return;
            items.push({ name, qty, unit });
        });
        const total = items.reduce((s, i) => s + i.qty * i.unit, 0);
        const saving = parseFloat(document.getElementById('qSaving').value) || 0;
        return {
            customer_name: _qLead ? _qLead.full_name : '',
            kwp: parseFloat(document.getElementById('qKwp').value) || 0,
            panels: parseInt(document.getElementById('qPanels').value) || 0,
            saving, total,
            payback: saving > 0 ? +(total / saving).toFixed(1) : 0,
            narrative: document.getElementById('qNarrative').value.trim(),
            items
        };
    }

    // Verilen teklif verisinden markalı PDF üretir (canlı form veya kayıtlı teklif)
    function downloadQuotePDF(d) {
        if (typeof html2pdf === 'undefined') { alert('PDF kütüphanesi yüklenemedi.'); return; }
        const payback = d.payback ? d.payback : (d.saving > 0 ? (d.total / d.saving).toFixed(1) : '-');
        const rowsHtml = (d.items || []).map(i => `<tr>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(i.name)}</td>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center">${i.qty}</td>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">₺${fmt(i.unit)}</td>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">₺${fmt(i.qty * i.unit)}</td>
            </tr>`).join('');
        const today = new Date().toLocaleDateString('tr-TR');
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;padding:32px;font-family:Manrope,Arial,sans-serif;color:#1e293b;background:#fff';
        el.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #F59E0B;padding-bottom:16px;margin-bottom:24px">
                <div><div style="font-size:22px;font-weight:800;color:#0A1A2F">${esc(companyName())}</div><div style="color:#64748b;font-size:13px">Güneş Enerjisi Çözüm Teklifi</div></div>
                <div style="text-align:right;font-size:12px;color:#64748b">Tarih: ${today}<br>Müşteri: <strong>${esc(d.customer_name)}</strong></div>
            </div>
            <div style="display:flex;gap:12px;margin-bottom:24px">
                <div style="flex:1;background:#FFF8EB;border:1px solid #FDE08A;border-radius:10px;padding:14px"><div style="font-size:11px;color:#92400E;font-weight:700">ÖNERİLEN SİSTEM</div><div style="font-size:22px;font-weight:800;color:#B45309">${esc(d.kwp)} kWp</div><div style="font-size:12px;color:#64748b">${esc(d.panels)} panel</div></div>
                <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><div style="font-size:11px;color:#64748b;font-weight:700">YILLIK TASARRUF</div><div style="font-size:22px;font-weight:800;color:#059669">₺${fmt(d.saving)}</div></div>
                <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><div style="font-size:11px;color:#64748b;font-weight:700">AMORTİ SÜRESİ</div><div style="font-size:22px;font-weight:800;color:#0A1A2F">${payback} yıl</div></div>
            </div>
            ${d.narrative ? `<div style="font-size:14px;line-height:1.7;color:#334155;margin-bottom:24px;white-space:pre-line">${esc(d.narrative)}</div>` : ''}
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
                <thead><tr style="background:#0A1A2F;color:#fff"><th style="padding:10px;text-align:left">Kalem</th><th style="padding:10px;text-align:center">Adet</th><th style="padding:10px;text-align:right">Birim</th><th style="padding:10px;text-align:right">Tutar</th></tr></thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot><tr><td colspan="3" style="padding:12px;text-align:right;font-weight:700;font-size:15px">TOPLAM</td><td style="padding:12px;text-align:right;font-weight:800;font-size:16px;color:#B45309">₺${fmt(d.total)}</td></tr></tfoot>
            </table>
            <div style="font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:8px">
                Bu teklif bilgilendirme amaçlıdır ve kesin proje ile keşif sonrası netleşir. Fiyatlara KDV dahil değildir. Teklif geçerlilik süresi 15 gündür. · ${esc(companyName())}
            </div>`;
        document.body.appendChild(el);
        const opt = {
            margin: 0.4, filename: `Teklif_${(d.customer_name || 'musteri').replace(/\s+/g, '_')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(el).save().then(() => el.remove()).catch(() => el.remove());
    }

    window.qDownloadPDF = function () {
        if (!_qLead) return;
        downloadQuotePDF(collectQuoteData());
    };

    // --- Teklif kaydı + geçmiş ---
    window.qSaveQuote = async function () {
        if (!_qLead || !supabaseClient) return;
        const d = collectQuoteData();
        const row = {
            lead_id: _qLead.id,
            company_id: (currentUserProfile && currentUserProfile.company_id) || null,
            customer_name: d.customer_name,
            system_kwp: d.kwp, panel_count: d.panels,
            total_amount: d.total, annual_saving: d.saving, payback_years: d.payback,
            narrative: d.narrative || null, items: d.items, status: 'taslak'
        };
        const { error } = await supabaseClient.from('quotes').insert([row]);
        if (error) { alert('Teklif kaydedilemedi: ' + error.message); return; }
        alert('Teklif kaydedildi.');
        loadQuoteHistory(_qLead.id);
    };

    async function loadQuoteHistory(leadId) {
        const box = document.getElementById('qHistory');
        if (!box || !supabaseClient) return;
        const { data, error } = await supabaseClient
            .from('quotes').select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
        if (error) { box.innerHTML = ''; return; }
        _qQuotes = data || [];
        if (!_qQuotes.length) { box.innerHTML = ''; return; }
        const statusMap = { taslak: 'Taslak', gonderildi: 'Gönderildi', kabul: 'Kabul', ret: 'Ret' };
        const opts = (cur) => Object.entries(statusMap).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${v}</option>`).join('');
        box.innerHTML = `
            <div class="bg-white p-4 rounded-xl border border-slate-200">
                <div class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Teklif Geçmişi (${_qQuotes.length})</div>
                <div class="space-y-2">
                    ${_qQuotes.map(q => `
                        <div class="flex items-center justify-between gap-2 border border-slate-100 rounded-lg p-2 flex-wrap">
                            <div class="text-xs"><strong class="text-slate-800">₺${fmt(q.total_amount)}</strong><span class="text-slate-400"> · ${q.system_kwp || '-'} kWp · ${new Date(q.created_at).toLocaleDateString('tr-TR')}</span></div>
                            <div class="flex items-center gap-1">
                                <select onchange="qHistStatus('${q.id}', this.value)" class="border border-slate-300 p-1 rounded text-[11px] bg-white">${opts(q.status)}</select>
                                <button onclick="qHistPdf('${q.id}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">PDF</button>
                                <button onclick="qHistDelete('${q.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Sil</button>
                            </div>
                        </div>`).join('')}
                </div>
            </div>`;
    }

    window.qHistStatus = async function (id, val) {
        const { error } = await supabaseClient.from('quotes').update({ status: val }).eq('id', id);
        if (error) alert('Güncellenemedi: ' + error.message);
    };
    window.qHistPdf = function (id) {
        const q = _qQuotes.find(x => x.id === id); if (!q) return;
        downloadQuotePDF({
            customer_name: q.customer_name, kwp: q.system_kwp, panels: q.panel_count,
            saving: q.annual_saving, total: q.total_amount, payback: q.payback_years,
            narrative: q.narrative || '', items: Array.isArray(q.items) ? q.items : []
        });
    };
    window.qHistDelete = async function (id) {
        if (!confirm('Bu teklif silinecek. Emin misiniz?')) return;
        const { error } = await supabaseClient.from('quotes').delete().eq('id', id);
        if (error) { alert('Silinemedi: ' + error.message); return; }
        if (_qLead) loadQuoteHistory(_qLead.id);
    };
})();
