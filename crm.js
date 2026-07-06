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
    try {
        const { data: qs } = await supabaseClient
            .from('quotes').select('lead_id, status, total_amount, created_at').order('created_at', { ascending: false });
        (qs || []).forEach(q => {
            if (!_quotesByLead[q.lead_id]) _quotesByLead[q.lead_id] = q; // en güncel teklif
            _quoteStats.count++;
            if (_quoteStats[q.status] !== undefined) _quoteStats[q.status]++;
            if (q.status === 'kabul') _quoteStats.kabulTotal += Number(q.total_amount) || 0;
        });
    } catch (e) { /* quotes tablosu yoksa sessiz geç */ }

    crmCalculateStats();
    renderQuoteSummary();
    crmRenderLeads();
}

// Kokpit altına teklif özet çubuğunu enjekte eder
function renderQuoteSummary() {
    const grid = document.getElementById('crmStatNew')?.closest('.grid');
    if (!grid) return;
    let bar = document.getElementById('crmQuoteSummary');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'crmQuoteSummary';
        bar.className = 'mb-6';
        grid.insertAdjacentElement('afterend', bar);
    }
    const s = _quoteStats;
    bar.innerHTML = `
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
function crmRenderLeads() {
    const tableBody = document.getElementById('crmLeadsTableBody');
    const filterValue = document.getElementById('crmFilterStatus')?.value || 'all';

    if(!tableBody) return;
    tableBody.innerHTML = '';

    const filteredLeads = crmLeads.filter(lead => filterValue === 'all' || lead.status === filterValue);

    if(filteredLeads.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400 font-medium bg-white">Bu aşamada bekleyen müşteri kaydı bulunmuyor.</td></tr>`;
        return;
    }

    filteredLeads.forEach(lead => {
        const badge = crmStatusLabels[lead.status] || { text: lead.status, css: 'bg-slate-100 text-slate-800' };
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
        const qBadge = q && qMap[q.status]
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
            <td class="p-4"><span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${badge.css}">${badge.text}</span></td>
            <td class="p-4 text-slate-600 font-bold text-[11px]">${techSummary}</td>
            <td class="p-4 text-right pr-6">
                <button class="bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 font-bold px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition text-xs">Müşteri Kartı</button>
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
    document.getElementById('modalLeadContact').innerHTML = `📞 <strong>Tel:</strong> ${admEscape(lead.phone) || '-'} &nbsp;|&nbsp; ✉️ <strong>E-posta:</strong> ${admEscape(lead.email) || '-'}<br>📍 <strong>Konum:</strong> ${admEscape(lead.address) || '-'}`;

    document.getElementById('fieldBill').value = (lead.bill_amount ?? '');
    document.getElementById('fieldConsumptions').value = lead.consumptions || '';
    document.getElementById('fieldHeatPump').value = (!lead.has_heat_pump || lead.has_heat_pump === 'Yok') ? 'Yok' : 'Var';
    document.getElementById('fieldHeatPumpPower').value = lead.heat_pump_power || '';
    document.getElementById('fieldEV').value = (!lead.has_ev || lead.has_ev === 'Yok') ? 'Yok' : 'Var';
    document.getElementById('fieldBlackout').value = (lead.blackout_frequency === 'Sık') ? 'Sık' : 'Seyrek';
    document.getElementById('fieldStorageIntent').value = (lead.wants_storage === 'Evet') ? 'Evet' : 'Hayır';
    document.getElementById('fieldBackupDetails').value = lead.backup_details || '';
    document.getElementById('fieldNotes').value = lead.notes || '';

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
window.crmOpenNewLeadModal = async function() {
    const name = prompt("Lütfen eklenecek yeni müşterinin adını veya proje başlığını giriniz:");
    if(!name || !name.trim()) return;

    const code = "EPC-MANUAL-" + Date.now().toString().slice(-6);
    const row = {
        tracking_code: code,
        company_id: (currentUserProfile && currentUserProfile.company_id) ? currentUserProfile.company_id : null,
        source: 'manual',
        full_name: name.trim(),
        phone: '',
        status: 'yeni_basvuru',
        notes: 'Panelden manuel eklendi.'
    };

    const { data, error } = await supabaseClient.from('leads').insert([row]).select().single();
    if(error) { alert("Müşteri eklenemedi: " + error.message); return; }

    await crmLoadLeads();
    crmOpenLeadDetails(data.id);
};

/**
 * Müşteri kartındaki değişiklikleri veritabanına kalıcı olarak kaydeder.
 */
window.crmSaveLeadDetails = async function() {
    const id = document.getElementById('modalLeadId').value;
    if(!id) return;

    const billVal = document.getElementById('fieldBill').value;
    const patch = {
        bill_amount:        billVal === '' ? null : Number(billVal),
        consumptions:       document.getElementById('fieldConsumptions').value,
        has_heat_pump:      document.getElementById('fieldHeatPump').value,
        heat_pump_power:    document.getElementById('fieldHeatPumpPower').value,
        has_ev:             document.getElementById('fieldEV').value,
        blackout_frequency: document.getElementById('fieldBlackout').value,
        wants_storage:      document.getElementById('fieldStorageIntent').value,
        backup_details:     document.getElementById('fieldBackupDetails').value,
        notes:              document.getElementById('fieldNotes').value,
        updated_at:         new Date().toISOString()
    };

    const { error } = await supabaseClient.from('leads').update(patch).eq('id', id);
    if(error) { alert("Kaydedilemedi: " + error.message); return; }

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
        const body = document.getElementById('crmCardExtras') || document.getElementById('fieldNotes')?.parentElement;
        if (!body) return null;
        z = document.createElement('div');
        z.id = 'crmStepsZone';
        z.className = 'bg-white p-5 rounded-xl border border-slate-200';
        body.appendChild(z);
    }
    return z;
}

async function renderLeadSteps(lead) {
    const z = crmEnsureStepsZone();
    if (!z) return;
    z.innerHTML = '<p class="text-xs text-slate-400">Yükleniyor...</p>';

    const steps = await ensureProcessSteps();
    const done = Array.isArray(lead.completed_steps) ? lead.completed_steps : [];
    const doneCount = steps.filter(s => done.includes(s.slug)).length;
    const pct = steps.length ? Math.round(doneCount / steps.length * 100) : 0;

    const stageOpts = Object.entries(crmStatusLabels)
        .map(([k, v]) => `<option value="${k}" ${lead.status === k ? 'selected' : ''}>${v.text}</option>`).join('');

    const rows = steps.length ? steps.map(s => {
        const isDone = done.includes(s.slug);
        return `<button onclick="crmToggleStep('${lead.id}','${s.slug}')" class="w-full text-left flex items-start gap-2 px-2 py-2 rounded-lg ${isDone ? 'bg-emerald-50' : 'hover:bg-slate-50'} border-b border-slate-100">
            <span class="text-lg leading-none mt-0.5">${isDone ? '✅' : '⬜'}</span>
            <span class="flex-1 min-w-0">
                <span class="text-sm font-bold ${isDone ? 'text-emerald-800 line-through' : 'text-slate-700'}">${s.step_no || ''}. ${admEscape(s.title)}</span>
                ${s.short_desc ? `<span class="block text-[11px] text-slate-400">${admEscape(s.short_desc)}</span>` : ''}
            </span>
        </button>`;
    }).join('') : '<p class="text-xs text-slate-400 py-1">Süreç adımı tanımlı değil.</p>';

    z.innerHTML = `
        <div class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">📋 Süreç & Aşama</div>
        <div class="mb-3">
            <label class="text-xs font-bold text-slate-600">Genel Aşama</label>
            <select onchange="crmSetStage('${lead.id}', this.value)" class="w-full border border-slate-300 p-2 rounded-lg text-sm bg-white">${stageOpts}</select>
        </div>
        <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-bold text-slate-500">Detaylı süreç adımları</span>
            <span class="text-xs font-bold text-slate-500">${doneCount}/${steps.length} · %${pct}</span>
        </div>
        <div class="h-2 bg-slate-100 rounded-full overflow-hidden mb-3"><div class="h-full bg-amber-500" style="width:${pct}%"></div></div>
        ${rows}`;
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
    renderLeadSteps(lead);
    const { error } = await supabaseClient
        .from('leads').update({ completed_steps: done, updated_at: new Date().toISOString() }).eq('id', leadId);
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