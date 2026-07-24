/* ============================================================================
   5. Satış CRM ve Proje Takip Motoru
   Bölünmüş modül dosyası. index.html'de core.js'ten sonra, ORİJİNAL SIRAYLA
   yüklenmelidir. Klasik script olduğu için tüm fonksiyonlar küresel kalır.
   ============================================================================ */

// ============================================================================
// 5. SATIŞ CRM VE PROJE TAKİP MOTORU (SOLAR PIPELINE ENGINE)
// ============================================================================

/**
 * CRM Modülü ilk açıldığında veya bir veri güncellendiğinde tetiklenen ana fonksiyon.
 * Üst bar istatistiklerini hesaplar ve güncel müşteri listesini tabloya basar.
 */
function initCRMModule() {
    crmLoadLeads();
}

/**
 * Firmanın kendi başvurularını veritabanından yükler.
 * RLS sayesinde otomatik olarak yalnız bu firmaya atanmış kayıtlar gelir.
 */
// Teklif modülü aktif — veri kaynağı: firm_quotes (yeni teklif motoru).
const QUOTES_ENABLED = true;
let _quotesByLead = {};
let _quoteStats = { count: 0, taslak: 0, gonderildi: 0, kabul: 0, ret: 0, kabulTotal: 0 };

async function crmLoadLeads() {
    if (!supabaseClient) return;
    const tableBody = document.getElementById('crmLeadsTableBody');
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400">Yükleniyor...</td></tr>`;
    try {
        const { data, error } = await supabaseClient
            .from('leads').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        crmLeads = data || [];
    } catch (err) {
        crmLeads = [];
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500">Liste yüklenemedi: ${err.message}</td></tr>`;
        return;
    }

    // Teklif durumlarını yükle (liste rozetleri + özet çubuğu için)
    _quotesByLead = {};
    _quoteStats = { count: 0, taslak: 0, gonderildi: 0, kabul: 0, ret: 0, kabulTotal: 0 };
    if (QUOTES_ENABLED) {
        try {
            const { data: qs } = await supabaseClient
                .from('firm_quotes').select('lead_id, status, totals, created_at').order('created_at', { ascending: false });
            // firm_quotes durumları → CRM rozet anahtarları
            const _SMAP = { draft: 'taslak', sent: 'gonderildi', revised: 'gonderildi', accepted: 'kabul', rejected: 'ret' };
            (qs || []).forEach(row => {
                if (!row.lead_id) return;                    // elle açılmış teklifler CRM'e bağlı değil
                const q = {
                    lead_id: row.lead_id,
                    status: _SMAP[row.status] || 'taslak',
                    total_amount: (row.totals && (row.totals.total_try_vat || row.totals.total_try)) || 0,
                    created_at: row.created_at
                };
                if (!_quotesByLead[q.lead_id]) _quotesByLead[q.lead_id] = q; // en güncel teklif
                _quoteStats.count++;
                if (_quoteStats[q.status] !== undefined) _quoteStats[q.status]++;
                if (q.status === 'kabul') _quoteStats.kabulTotal += Number(q.total_amount) || 0;
            });
        } catch (e) { /* firm_quotes tablosu yoksa sessiz geç */ }
    }

    await ensureProcessSteps();   // sayaclar/filtre/rozetler 9 adima gore calissin
    crmRenderStepCounters();
    renderQuoteSummary();
    crmRenderLeads();
}

// Kokpit altına teklif özet çubuğunu enjekte eder
function renderQuoteSummary() {
    const bar = document.getElementById('crmQuoteSummary');
    if (!QUOTES_ENABLED) { if (bar) bar.innerHTML = ''; return; }
    const grid = document.getElementById('crmStatNew')?.closest('.grid');
    if (!grid) return;
    let b = bar;
    if (!b) {
        b = document.createElement('div');
        b.id = 'crmQuoteSummary';
        b.className = 'mb-6';
        grid.insertAdjacentElement('afterend', b);
    }
    const s = _quoteStats;
    b.innerHTML = `
        <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4 flex-wrap text-xs">
            <span class="font-black text-slate-700">📄 Teklifler</span>
            <span class="text-slate-500">Toplam: <strong class="text-slate-800">${s.count}</strong></span>
            <span class="text-slate-500">Gönderildi: <strong class="text-blue-700">${s.gonderildi}</strong></span>
            <span class="text-slate-500">Kabul: <strong class="text-emerald-700">${s.kabul}</strong></span>
            ${s.kabulTotal ? `<span class="ml-auto text-slate-500">Kazanılan iş: <strong class="text-emerald-700">₺${Math.round(s.kabulTotal).toLocaleString('tr-TR')}</strong></span>` : ''}
        </div>`;
}

/**
 * CRM Paneli üst kısmındaki 4 adet renkli özet kokpit kartının sayılarını hesaplar.
 */
function crmCalculateStats() {
    if(document.getElementById('crmStatNew')) {
        document.getElementById('crmStatNew').textContent = crmLeads.filter(l => l.status === 'yeni_basvuru').length;
    }
    if(document.getElementById('crmStatFollowUp')) {
        document.getElementById('crmStatFollowUp').textContent = crmLeads.filter(l => l.status === 'arandi_gorusuldu' || l.status === 'teklif_gonderildi').length;
    }
    if(document.getElementById('crmStatActive')) {
        document.getElementById('crmStatActive').textContent = crmLeads.filter(l => l.status === 'kurulum_basladi' || l.status === 'sozlesme_imzalandi').length;
    }
    if(document.getElementById('crmStatOfficial')) {
        document.getElementById('crmStatOfficial').textContent = crmLeads.filter(l => l.status === 'resmi_surec').length;
    }
}

/**
 * CRM Müşteri Listesini HTML tablosuna dinamik olarak basar.
 */
// === 9 ADIMLIK SÜREÇ: güncel adım, üst sayaçlar ve filtre (process_steps) ===

// Bir lead'in güncel adımı = ilk TAMAMLANMAMIŞ adım. Hiç adım işaretlenmemişse
// (eski kayıtlar) status'tan yaklaşık adım türetilir (geçiş dönemi sürekliliği).
function crmCurrentStep(lead, steps) {
    if (!steps || !steps.length) return null;
    const done = Array.isArray(lead.completed_steps) ? lead.completed_steps : [];
    if (done.length) {
        for (let i = 0; i < steps.length; i++) {
            if (!done.includes(steps[i].slug)) return steps[i];
        }
        return steps[steps.length - 1];   // hepsi tamam -> son adim
    }
    return crmStepFromStatus(lead.status, steps);
}

// Eski 7'li asama (status) -> ~9 adima orantisal geri esleme (yalniz completed_steps bossa)
function crmStepFromStatus(status, steps) {
    if (!steps || !steps.length) return null;
    const ORDER = ['yeni_basvuru','arandi_gorusuldu','teklif_gonderildi','sozlesme_imzalandi','kurulum_basladi','resmi_surec','tamamlandi'];
    if (status === 'tamamlandi') return steps[steps.length - 1];
    const si = Math.max(0, ORDER.indexOf(status));
    const idx = Math.min(steps.length - 1, Math.round(si / (ORDER.length - 1) * (steps.length - 1)));
    return steps[idx] || steps[0];
}

// Ust sayaclari (her adimda kac musteri) ve filtre menusunu 9 adima gore basar.
function crmRenderStepCounters() {
    const steps = _processSteps || [];
    const box = document.getElementById('crmStepCounters');

    const counts = {};
    steps.forEach(s => { counts[s.slug] = 0; });
    crmLeads.forEach(l => {
        const cur = crmCurrentStep(l, steps);
        if (cur) counts[cur.slug] = (counts[cur.slug] || 0) + 1;
    });

    const palette = ['border-blue-500','border-sky-500','border-cyan-500','border-teal-500','border-amber-500','border-orange-500','border-purple-500','border-fuchsia-500','border-emerald-500'];
    const activeFilter = document.getElementById('crmFilterStatus') ? document.getElementById('crmFilterStatus').value : 'all';

    if (box) {
        box.innerHTML = steps.length ? steps.map((s, i) => {
            const on = activeFilter === s.slug;
            return `<button onclick="crmFilterByStep('${s.slug}')" title="${admEscape(s.title)}" class="text-left bg-white rounded-xl shadow-sm border-l-4 ${palette[i % palette.length]} px-3 py-2.5 hover:shadow-md transition ${on ? 'ring-2 ring-slate-800' : ''}">
                <div class="text-[9px] text-slate-400 font-bold leading-tight truncate">${s.step_no || (i + 1)}. ${admEscape(s.title)}</div>
                <div class="text-xl font-black text-slate-800">${counts[s.slug] || 0}</div>
            </button>`;
        }).join('') : '<p class="text-xs text-slate-400 p-3 col-span-full">Süreç adımı tanımlı değil. Admin panelinden ekleyin.</p>';
    }

    const sel = document.getElementById('crmFilterStatus');
    if (sel) {
        const cur = sel.value || 'all';
        sel.innerHTML = '<option value="all">Tümü</option>' +
            steps.map(s => `<option value="${s.slug}">${s.step_no || ''}. ${admEscape(s.title)}</option>`).join('');
        sel.value = [...sel.options].some(o => o.value === cur) ? cur : 'all';
    }
}

// Sayac kartina tiklayinca o adima gore filtrele (tekrar tiklayinca kaldir).
window.crmFilterByStep = function (slug) {
    const sel = document.getElementById('crmFilterStatus');
    if (sel) sel.value = (sel.value === slug) ? 'all' : slug;
    crmRenderLeads();
    crmRenderStepCounters();
};

function crmRenderLeads() {
    const tableBody = document.getElementById('crmLeadsTableBody');
    const filterValue = document.getElementById('crmFilterStatus')?.value || 'all';

    if(!tableBody) return;
    tableBody.innerHTML = '';

    const _steps = _processSteps || [];
    const filteredLeads = crmLeads.filter(lead => {
        if (filterValue === 'all') return true;
        const cur = crmCurrentStep(lead, _steps);
        return cur && cur.slug === filterValue;
    });

    if(filteredLeads.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400 font-medium bg-white">Bu aşamada bekleyen müşteri kaydı bulunmuyor.</td></tr>`;
        return;
    }

    filteredLeads.forEach(lead => {
        const _curStep = crmCurrentStep(lead, _steps);
        const _total = _steps.length;
        const _doneCount = _steps.filter(s => (lead.completed_steps || []).includes(s.slug)).length;
        const _allDone = _total > 0 && _doneCount >= _total;
        const _bb = crmStatusLabels[lead.status] || { text: lead.status, css: 'bg-slate-100 text-slate-800' };
        const badge = _curStep
            ? { text: `${_curStep.step_no || ''}. ${_curStep.title}`, css: _allDone ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800' }
            : { text: (typeof stageLabel === 'function' ? stageLabel(lead.status) : _bb.text), css: _bb.css };
        const dateStr = lead.created_at
            ? new Date(lead.created_at).toLocaleString('tr-TR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
            : '-';

        let techBadges = [];
        if(lead.has_ev === 'Var' || lead.has_ev === 'Yakında') techBadges.push('🚗 EV');
        if(lead.has_heat_pump === 'Var' || lead.has_heat_pump === 'Planlıyor') techBadges.push('🔥 Isı P.');
        if(lead.wants_storage === 'Evet') techBadges.push('🔋 Batarya');
        const techSummary = techBadges.length > 0 ? techBadges.join(' | ') : 'Standart (On-Grid)';

        const q = _quotesByLead[lead.id];
        const qMap = {
            taslak:     ['📄 Teklif: Taslak',    'bg-slate-100 text-slate-600'],
            gonderildi: ['📄 Teklif: Gönderildi', 'bg-blue-100 text-blue-700'],
            kabul:      ['✅ Teklif: Kabul',      'bg-emerald-100 text-emerald-700'],
            ret:        ['❌ Teklif: Ret',        'bg-red-100 text-red-700']
        };
        const qBadge = (QUOTES_ENABLED && q && qMap[q.status])
            ? `<span class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${qMap[q.status][1]}">${qMap[q.status][0]}</span>`
            : '';

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-100 transition cursor-pointer";
        tr.onclick = (e) => { if(e.target.tagName !== 'BUTTON') crmOpenLeadDetails(lead.id); };

        tr.innerHTML = `
            <td class="p-4 pl-6 font-mono text-slate-400 text-[11px]">${dateStr}</td>
            <td class="p-4">
                <div class="font-black text-slate-900 text-sm mb-0.5">${admEscape(lead.full_name)}</div>
                <div class="text-[10px] text-slate-400 font-mono tracking-wider">Takip ID: ${admEscape(lead.tracking_code)} | Tel: ${admEscape(lead.phone) || '-'}</div>
                ${qBadge}
            </td>
            <td class="p-4"><span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${badge.css}">${admEscape(badge.text)}</span></td>
            <td class="p-4 text-slate-600 font-bold text-[11px]">${techSummary}</td>
            <td class="p-4 text-right pr-6">
                <button onclick="event.stopPropagation(); crmCreateQuoteForLead('${lead.id}')" class="bg-slate-800 hover:bg-slate-900 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm transition text-xs">📄 Teklif Oluştur</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

/**
 * Modal içine (index.html'e dokunmadan) tesis alanını enjekte eder / bulur.
 */
function crmEnsureFacilityZone() {
    let zone = document.getElementById('crmFacilityZone');
    if (!zone) {
        const body = document.getElementById('crmCardExtras') || document.getElementById('fieldNotes')?.parentElement;
        if (!body) return null;
        zone = document.createElement('div');
        zone.id = 'crmFacilityZone';
        zone.className = 'bg-white p-5 rounded-xl border border-slate-200';
        body.appendChild(zone);
    }
    return zone;
}

/**
 * Müşteri detay modalını açar, alanları doldurur ve tesis durumunu gösterir.
 */
window.crmOpenLeadDetails = async function(id) {
    const lead = crmLeads.find(l => l.id === id);
    if(!lead) return;

    const dateStr = lead.created_at ? new Date(lead.created_at).toLocaleString('tr-TR') : '-';

    document.getElementById('modalLeadId').value = lead.id;
    document.getElementById('modalLeadName').textContent = lead.full_name || '-';
    if(document.getElementById('modalLeadDate')) document.getElementById('modalLeadDate').textContent = "Başvuru Tarihi: " + dateStr;
    if(document.getElementById('modalLeadIdDisplay')) document.getElementById('modalLeadIdDisplay').textContent = "ID: " + (lead.tracking_code || '');
    document.getElementById('fieldName').value = lead.full_name || '';
    document.getElementById('fieldPhone').value = lead.phone || '';
    document.getElementById('fieldEmail').value = lead.email || '';
    document.getElementById('fieldAddress').value = lead.address || '';

    const setV = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    setV('fieldTariff', lead.tariff_group || 'mesken');
    setV('fieldBill', (lead.bill_amount ?? ''));
    setV('fieldHeatPump', (!lead.has_heat_pump || lead.has_heat_pump === 'Yok') ? 'Yok' : 'Var');
    setV('fieldHeatPumpPower', lead.heat_pump_power || '');
    setV('fieldHpKwh', (lead.heat_pump_kwh ?? ''));
    setV('fieldEV', (!lead.has_ev || lead.has_ev === 'Yok') ? 'Yok' : 'Var');
    setV('fieldEvBattery', (lead.ev_battery_kwh ?? ''));
    setV('fieldEvCharge', (lead.ev_charge_kw ?? ''));
    setV('fieldBlackout', (lead.blackout_frequency === 'Sık') ? 'Sık' : 'Seyrek');
    setV('fieldStorageIntent', (lead.wants_storage === 'Evet') ? 'Evet' : 'Hayır');
    setV('fieldNotes', lead.notes || '');
    if (typeof crmRecalcKwh === 'function') crmRecalcKwh();
    if (typeof crmSyncConsumptionUI === 'function') crmSyncConsumptionUI();

    document.getElementById('crmDetailModal').classList.remove('hidden');

    // Birleşik ilerleme: tesis + (aşama + süreç adımları)
    renderFacilityZone(lead);
    renderLeadSteps(lead);
};

/**
 * Tesis (kurulu GES) alanını basar. Aşama değişince de yeniden çağrılır.
 */
async function renderFacilityZone(lead) {
    const zone = crmEnsureFacilityZone();
    if (!zone) return;
    zone.innerHTML = '<p class="text-xs text-slate-400">Tesis bilgisi kontrol ediliyor...</p>';
    try {
        const { data: proj } = await supabaseClient
            .from('projects').select('facility_code').eq('lead_id', lead.id).maybeSingle();

        if (proj && proj.facility_code) {
            zone.innerHTML = `
                <div class="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">☀️ Kurulu Tesis</div>
                        <div class="font-mono text-lg font-black text-emerald-700">${admEscape(proj.facility_code)}</div>
                        <p class="text-[11px] text-slate-500 mt-1">Yatırımcı bu kod ile bakım / temizlik / servis talebi açabilir.</p>
                    </div>
                    <button onclick="crmCopyText('${admEscape(proj.facility_code)}')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-bold">Kodu Kopyala</button>
                </div>`;
        } else if (lead.status === 'tamamlandi') {
            zone.innerHTML = `
                <div class="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <div class="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Tesis Kaydı</div>
                        <p class="text-sm text-slate-600">Bu proje devreye alındı. Yatırımcıya kalıcı bir tesis kodu vermek için tesisi oluşturun.</p>
                    </div>
                    <button onclick="crmCreateFacility('${lead.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold whitespace-nowrap">☀️ Tesis Oluştur</button>
                </div>`;
        } else {
            zone.innerHTML = `<p class="text-xs text-slate-400">Tesis kodu, müşteri <strong>"7. Bitti"</strong> aşamasına gelince oluşturulabilir.</p>`;
        }
    } catch (err) {
        zone.innerHTML = `<p class="text-xs text-red-500">Tesis bilgisi alınamadı: ${err.message}</p>`;
    }
}

/**
 * Tamamlanan müşteriyi kalıcı tesise dönüştürür (GES kodu üretir).
 */
window.crmCreateFacility = async function(leadId) {
    if (!confirm("Bu müşteriyi kalıcı bir tesise dönüştürmek istediğinize emin misiniz?\nYatırımcıya verilecek GES tesis kodu oluşturulacak.")) return;
    try {
        const { data: code, error } = await supabaseClient.rpc('create_project_from_lead', { p_lead_id: leadId });
        if (error) throw error;
        alert(`✅ Tesis oluşturuldu!\n\nTesis Kodu: ${code}\n\nBu kodu yatırımcıya verin; bakım/temizlik/servis taleplerinde kullanacak.`);
        await crmLoadLeads();
        crmOpenLeadDetails(leadId);
    } catch (err) {
        alert("Tesis oluşturulamadı: " + (err.message || err));
    }
};

/**
 * Bir metni panoya kopyalar.
 */
window.crmCopyText = function(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(
            () => alert("Kopyalandı: " + text),
            () => alert("Tesis Kodu: " + text)
        );
    } else {
        alert("Tesis Kodu: " + text);
    }
};

/**
 * Satış ekibinin manuel olarak sisteme müşteri eklemesi (veritabanına yazar).
 */
window.crmOpenNewLeadModal = function() {
    // Yeni müşteri: kartı BOŞ, tüm alanlar düzenlenebilir aç. Kayıt "Kaydet" ile oluşur.
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    document.getElementById('modalLeadId').value = '';           // boş = yeni kayıt modu
    set('fieldName', ''); set('fieldPhone', ''); set('fieldEmail', ''); set('fieldAddress', '');
    set('fieldTariff', 'mesken');
    set('fieldBill', ''); set('fieldMonthlyKwh', '');
    set('fieldHeatPump', 'Yok'); set('fieldHeatPumpPower', ''); set('fieldHpKwh', '');
    set('fieldEV', 'Yok'); set('fieldEvBattery', ''); set('fieldEvCharge', '');
    set('fieldBlackout', 'Seyrek'); set('fieldStorageIntent', 'Hayır');
    set('fieldNotes', '');
    if (typeof crmRecalcKwh === 'function') crmRecalcKwh();
    if (typeof crmSyncConsumptionUI === 'function') crmSyncConsumptionUI();

    const nm = document.getElementById('modalLeadName'); if (nm) nm.textContent = 'Yeni Müşteri';
    const idd = document.getElementById('modalLeadIdDisplay'); if (idd) idd.textContent = '';
    const dt = document.getElementById('modalLeadDate'); if (dt) dt.textContent = 'Bilgileri girip Kaydet’e basın';
    crmRenderStepsPreview(); // yeni kayıt: 9 adım en üstte önizleme olarak gösterilir
    const ex = document.getElementById('crmCardExtras'); if (ex) ex.innerHTML = '';   // kayıt oluşmadan tesis yok

    document.getElementById('crmDetailModal').classList.remove('hidden');
};

/**
 * Müşteri kartını kaydeder. modalLeadId boşsa YENİ kayıt oluşturur, doluysa günceller.
 */
window.crmSaveLeadDetails = async function() {
    const id = document.getElementById('modalLeadId').value;
    const name = (document.getElementById('fieldName').value || '').trim();
    if (!name) { alert('Lütfen müşteri adı / proje başlığı girin.'); return; }

    const numOrNull = (id) => { const v = document.getElementById(id) ? document.getElementById(id).value : ''; return (v === '' || v == null) ? null : Number(v); };
    const billVal = document.getElementById('fieldBill').value;
    const hasEV = document.getElementById('fieldEV').value;
    const hasHP = document.getElementById('fieldHeatPump').value;
    const data = {
        full_name:          name,
        phone:              document.getElementById('fieldPhone').value.trim(),
        email:              document.getElementById('fieldEmail').value.trim(),
        address:            document.getElementById('fieldAddress').value.trim(),
        tariff_group:       document.getElementById('fieldTariff').value,
        bill_amount:        billVal === '' ? null : Number(billVal),
        monthly_kwh:        numOrNull('fieldMonthlyKwh'),
        has_heat_pump:      hasHP,
        heat_pump_power:    document.getElementById('fieldHeatPumpPower').value,
        heat_pump_kwh:      hasHP === 'Var' ? numOrNull('fieldHpKwh') : null,
        has_ev:             hasEV,
        ev_battery_kwh:     hasEV === 'Var' ? numOrNull('fieldEvBattery') : null,
        ev_charge_kw:       hasEV === 'Var' ? numOrNull('fieldEvCharge') : null,
        blackout_frequency: document.getElementById('fieldBlackout').value,
        wants_storage:      document.getElementById('fieldStorageIntent').value,
        notes:              document.getElementById('fieldNotes').value,
        updated_at:         new Date().toISOString()
    };

    if (!id) {
        data.tracking_code = 'EPC-MANUAL-' + Date.now().toString().slice(-6);
        data.company_id = (currentUserProfile && currentUserProfile.company_id) ? currentUserProfile.company_id : null;
        data.source = 'manual';
        data.status = 'yeni_basvuru';
        const { error } = await supabaseClient.from('leads').insert([data]);
        if (error) { alert('Müşteri eklenemedi: ' + error.message); return; }
    } else {
        const { error } = await supabaseClient.from('leads').update(data).eq('id', id);
        if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    }

    crmCloseModal();
    await crmLoadLeads();
};

window.crmCloseModal = function() { document.getElementById('crmDetailModal').classList.add('hidden'); };
window.crmOpenIntegrationModal = function() { document.getElementById('crmIntegrationModal').classList.remove('hidden'); };


// ============================================================================
// SÜREÇ ADIMLARI — firma, her proje için adımları işaretler (process_steps)
// ============================================================================
let _processSteps = null;

async function ensureProcessSteps() {
    if (_processSteps) return _processSteps;
    if (!supabaseClient) return [];
    const { data } = await supabaseClient.from('process_steps').select('*').order('sort_order');
    _processSteps = data || [];
    return _processSteps;
}

function crmEnsureStepsZone() {
    let z = document.getElementById('crmStepsZone');
    if (!z) {
        const body = document.getElementById('crmProcessZone') || document.getElementById('crmCardExtras') || document.getElementById('fieldNotes')?.parentElement;
        if (!body) return null;
        z = document.createElement('div');
        z.id = 'crmStepsZone';
        z.className = 'bg-white p-5 rounded-xl border border-slate-200';
        body.appendChild(z);
    }
    return z;
}

let _stepsOpen = false;
window.crmToggleSteps = function () {
    _stepsOpen = !_stepsOpen;
    const d = document.getElementById('crmDetailSteps');
    if (d) d.classList.toggle('hidden', !_stepsOpen);
    const a = document.getElementById('crmStepsArrow');
    if (a) a.textContent = _stepsOpen ? '▲' : '▼';
};

// Genel aşama (leads.status) artık 9 adımdan TÜRETİLİR. Böylece KPI sayaçları,
// ziyaretçi takibi ve pano özeti eski 7'li aşama kovasında çalışmaya devam eder.
function crmStatusFromSteps(steps, doneSlugs) {
    const ORDER = ['yeni_basvuru','arandi_gorusuldu','teklif_gonderildi','sozlesme_imzalandi','kurulum_basladi','resmi_surec','tamamlandi'];
    let maxNo = 0;
    (steps || []).forEach(s => { if (doneSlugs.includes(s.slug)) maxNo = Math.max(maxNo, Number(s.step_no) || 0); });
    const total = (steps && steps.length) ? steps.length : maxNo;
    if (maxNo <= 0 || total <= 0) return 'yeni_basvuru';
    if (maxNo >= total) return 'tamamlandi';                        // son adım → Devreye Alındı
    let idx = Math.ceil(maxNo / total * (ORDER.length - 1)) - 1;    // ilk 6 aşamaya orantısal
    idx = Math.max(0, Math.min(ORDER.length - 2, idx));
    return ORDER[idx];
}

// Tek liste: 9 adımlık süreç (admin yönetir). İşaretledikçe aşama otomatik türetilir.
async function renderLeadSteps(lead) {
    const z = crmEnsureStepsZone();
    if (!z) return;
    z.innerHTML = '<p class="text-xs text-slate-400">Yükleniyor...</p>';

    const steps = await ensureProcessSteps();
    const done = Array.isArray(lead.completed_steps) ? lead.completed_steps : [];
    const total = steps.length;
    const doneCount = steps.filter(s => done.includes(s.slug)).length;
    const pct = total ? Math.round(doneCount / total * 100) : 0;

    const rows = total ? steps.map(s => {
        const isDone = done.includes(s.slug);
        return `<button onclick="crmToggleStep('${lead.id}','${s.slug}')" class="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg ${isDone ? 'bg-emerald-50 border-emerald-200' : 'hover:bg-slate-50 border-slate-100'} border mb-1.5 transition">
            <span class="text-lg leading-none mt-0.5">${isDone ? '✅' : '⬜'}</span>
            <span class="flex-1 min-w-0">
                <span class="text-sm font-bold ${isDone ? 'text-emerald-800' : 'text-slate-700'}">${s.step_no || ''}. ${admEscape(s.title)}</span>
                ${s.short_desc ? `<span class="block text-[11px] text-slate-400">${admEscape(s.short_desc)}</span>` : ''}
            </span>
        </button>`;
    }).join('') : '<p class="text-xs text-slate-400 py-2">Henüz süreç adımı tanımlı değil. Admin panelinden ekleyebilirsiniz.</p>';

    z.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <div class="text-[11px] uppercase tracking-wider text-slate-400 font-bold">📋 Süreç & Aşama</div>
            <span class="text-xs font-bold text-slate-500">${doneCount}/${total} · %${pct}</span>
        </div>
        <div class="h-2 bg-slate-100 rounded-full overflow-hidden mb-4"><div class="h-full bg-amber-500 transition-all" style="width:${pct}%"></div></div>
        ${rows}
        <p class="text-[10px] text-slate-400 mt-2">Adımları işaretledikçe müşterinin genel aşaması ve panodaki sayaçlar otomatik güncellenir.</p>`;
}

// Yeni (henüz kaydedilmemiş) müşteri için: 9 adımın salt-okunur önizlemesi.
async function crmRenderStepsPreview() {
    const z = crmEnsureStepsZone();
    if (!z) return;
    const steps = await ensureProcessSteps();
    const rows = (steps && steps.length) ? steps.map(s => `
        <div class="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-slate-100 mb-1.5 opacity-60">
            <span class="text-lg leading-none mt-0.5">⬜</span>
            <span class="flex-1 min-w-0"><span class="text-sm font-bold text-slate-600">${s.step_no || ''}. ${admEscape(s.title)}</span></span>
        </div>`).join('') : '<p class="text-xs text-slate-400 py-2">Henüz süreç adımı tanımlı değil.</p>';
    z.innerHTML = `
        <div class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-3">📋 Süreç & Aşama</div>
        ${rows}
        <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2 mt-2">Müşteriyi kaydettikten sonra adımları işaretleyebilir, aşamayı ilerletebilirsiniz.</p>`;
}

// Genel aşamayı değiştir (birleşik blok içinden) — anında kaydeder.
window.crmSetStage = async function(leadId, value) {
    const lead = crmLeads.find(l => l.id === leadId);
    if (!lead) return;
    lead.status = value;
    const { error } = await supabaseClient
        .from('leads').update({ status: value, updated_at: new Date().toISOString() }).eq('id', leadId);
    if (error) { alert('Aşama kaydedilemedi: ' + error.message); return; }
    renderFacilityZone(lead);   // "7. Bitti" olunca Tesis Oluştur çıksın
    renderLeadSteps(lead);
};

window.crmToggleStep = async function(leadId, slug) {
    const lead = crmLeads.find(l => l.id === leadId);
    if (!lead) return;
    let done = Array.isArray(lead.completed_steps) ? [...lead.completed_steps] : [];
    done = done.includes(slug) ? done.filter(x => x !== slug) : done.concat(slug);
    lead.completed_steps = done;            // iyimser güncelleme

    // Genel aşama (status) 9 adımdan türetilir → KPI sayaçları & ziyaretçi takibi güncel kalır
    const steps = await ensureProcessSteps();
    const newStatus = crmStatusFromSteps(steps, done);
    lead.status = newStatus;

    renderLeadSteps(lead);
    renderFacilityZone(lead);               // son adımda "Tesis Oluştur" çıksın
    crmRenderStepCounters();  // ust sayaclari (9 adim) tazele

    const { error } = await supabaseClient
        .from('leads').update({ completed_steps: done, status: newStatus, updated_at: new Date().toISOString() }).eq('id', leadId);
    if (error) { alert('Adım kaydedilemedi: ' + error.message); }
};


// ============================================================================
// DAĞITIM ŞİRKETİ REFERANSI — firma, projenin ilini arayıp başvuru şirketini bulur
// ============================================================================
let _disco = null;

async function ensureDisco() {
    if (_disco) return _disco;
    if (!supabaseClient) return [];
    const { data } = await supabaseClient.from('distribution_companies').select('*').order('sort_order');
    _disco = data || [];
    return _disco;
}

window.crmOpenDisco = async function () {
    let m = document.getElementById('discoModal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'discoModal';
        m.className = 'fixed inset-0 z-[80] bg-slate-900/60 flex items-center justify-center p-4';
        m.innerHTML = `
            <div class="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] flex flex-col">
                <div class="flex justify-between items-start mb-3 gap-3">
                    <div>
                        <h3 class="text-lg font-black text-slate-800">🔌 Dağıtım Şirketleri</h3>
                        <p class="text-xs text-slate-500">Projenin ilini yazın; başvuru yapılacak dağıtım şirketini bulun. Ulusal arıza/şikayet hattı: <strong>186</strong>.</p>
                    </div>
                    <button onclick="document.getElementById('discoModal').classList.add('hidden')" class="text-2xl text-slate-400 leading-none">&times;</button>
                </div>
                <input id="discoSearch" type="text" placeholder="🔎 İl veya şirket ara (örn. Ankara)" class="w-full p-3 border border-slate-300 rounded-lg mb-3 outline-none focus:border-amber-500">
                <div id="discoList" class="overflow-y-auto space-y-2 flex-1"></div>
            </div>`;
        document.body.appendChild(m);
        m.querySelector('#discoSearch').addEventListener('input', renderDiscoList);
    }
    m.classList.remove('hidden');
    m.querySelector('#discoSearch').value = '';
    await ensureDisco();
    renderDiscoList();
};

function renderDiscoList() {
    const box = document.getElementById('discoList');
    if (!box) return;
    const q = (document.getElementById('discoSearch')?.value || '').trim().toLowerCase();
    const items = (_disco || []).filter(d =>
        !q || (d.provinces || '').toLowerCase().includes(q)
           || (d.name || '').toLowerCase().includes(q)
           || (d.abbr || '').toLowerCase().includes(q));
    box.innerHTML = items.length ? items.map(d => `
        <div class="border border-slate-200 rounded-xl p-4">
            <div class="flex items-center justify-between gap-2 flex-wrap">
                <strong class="text-sm text-slate-800">${admEscape(d.name)}${d.abbr ? ` <span class="text-slate-400 font-mono text-[11px]">${admEscape(d.abbr)}</span>` : ''}</strong>
                <span class="flex gap-2">
                    ${d.phone ? `<a href="tel:${admEscape(d.phone)}" class="text-[11px] bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded no-underline">📞 ${admEscape(d.phone)}</a>` : ''}
                    ${d.website ? `<a href="${admEscape(d.website)}" target="_blank" rel="noopener" class="text-[11px] bg-blue-50 text-blue-700 font-bold px-2 py-1 rounded no-underline">🌐 Web sitesi</a>` : ''}
                </span>
            </div>
            <p class="text-[11px] text-slate-500 mt-1">${admEscape(d.provinces)}</p>
        </div>`).join('') : '<p class="text-slate-400 text-sm p-2">Eşleşen dağıtım şirketi bulunamadı.</p>';
}


// ============================================================================
// MÜŞTERİ KARTI: otomatik tüketim hesabı + koşullu alan görünürlüğü + teklif (yakında)
// ============================================================================
window.crmCreateQuoteForLead = function (id) {
    if (typeof QUOTES_ENABLED !== 'undefined' && QUOTES_ENABLED && typeof crmOpenQuote === 'function') {
        crmOpenQuote(id);
    } else {
        alert('📄 Teklif oluşturma özelliği çok yakında aktif olacak.\nMüşteri kaydınız hazır; teklif modülü açıldığında buradan oluşturabileceksiniz.');
    }
};

function crmTariffRate() {
    const sel = document.getElementById('fieldTariff');
    if (!sel || sel.selectedIndex < 0) return 2.5;
    const opt = sel.options[sel.selectedIndex];
    return (opt && opt.dataset && parseFloat(opt.dataset.rate)) || 2.5;
}

window.crmRecalcKwh = function () {
    const billEl = document.getElementById('fieldBill');
    const outEl = document.getElementById('fieldMonthlyKwh');
    if (!billEl || !outEl) return;
    const bill = parseFloat(billEl.value) || 0;
    const rate = crmTariffRate();
    outEl.value = (bill > 0 && rate > 0) ? Math.round(bill / rate) : '';
};

window.crmSyncConsumptionUI = function () {
    const toggle = (id, cond) => { const e = document.getElementById(id); if (e) e.classList.toggle('hidden', !cond); };
    const val = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
    toggle('crmBatteryTip', val('fieldBlackout') === 'Sık');
    toggle('crmEvDetails', val('fieldEV') === 'Var');
    toggle('crmHpDetails', val('fieldHeatPump') === 'Var');
};

// Modal alanlarını bir kez dinle (statik HTML; crm.js modal'dan sonra yüklenir)
(function crmWireConsumptionForm() {
    const bill = document.getElementById('fieldBill');
    if (bill) bill.addEventListener('input', crmRecalcKwh);
    const tar = document.getElementById('fieldTariff');
    if (tar) tar.addEventListener('change', crmRecalcKwh);
    ['fieldBlackout', 'fieldEV', 'fieldHeatPump'].forEach(function (id) {
        const e = document.getElementById(id);
        if (e) e.addEventListener('change', crmSyncConsumptionUI);
    });
})();