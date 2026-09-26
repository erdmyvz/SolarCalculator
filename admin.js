/* ============================================================================
   7. Süper Admin Kontrol Merkezi
   Bölünmüş modül dosyası. index.html'de core.js'ten sonra, ORİJİNAL SIRAYLA
   yüklenmelidir. Klasik script olduğu için tüm fonksiyonlar küresel kalır.
   ============================================================================ */

// ============================================================================
// 7. SÜPER ADMİN KONTROL MERKEZİ (Yalnızca ERDEM YAVUZ Yetkilidir)
// ============================================================================
document.getElementById('adminPanelCard')?.addEventListener('click', () => {
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('adminModule').classList.remove('hidden');
    fetchAdminData();
});
document.getElementById('btnBackToMenuFromAdmin')?.addEventListener('click', closeAllAndShowMenu);
document.getElementById('btnRefreshAdmin')?.addEventListener('click', fetchAdminData);

// Servis talebi durum seçenekleri (mevcut durum seçili gelir) — techservice.js de kullanır
function srStatusOptions(cur) {
    return [
        ['basvuru_iletildi', 'Başvuru İletildi'],
        ['inceleniyor',      'İnceleniyor'],
        ['planlandi',        'Planlandı'],
        ['tamamlandi',       'Tamamlandı'],
    ].map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('');
}


// admEscape yardımcısı core.js'te tanımlıdır.

async function fetchAdminData() {
    const leadsBox = document.getElementById('adminLeadsList');
    const ticketsBox = document.getElementById('adminTicketsList');
    if (!supabaseClient) return;

    // Atama açılır listesi için firmaları bir kez çek
    let companies = [];
    try {
        const { data } = await supabaseClient.from('companies').select('*').order('created_at');
        companies = data || [];
    } catch (e) { companies = []; }
    const companyOptions = companies.map(c => `<option value="${c.id}">${admEscape(c.name)}</option>`).join('');
    window.__admCompanyCount = companies.length; // Genel Bakis KPI icin gercek firma sayisi

    // 1) FİRMALAR — artık uye-yonetimi.js'teki adminFirmalarCiz() çiziyor.
    //    Buradaki tablo kaldırıldı: Plan/Durum sütunları veriye bakmadan sabit
    //    "Deneme"/"Aktif" basıyordu (engelli hesap bile Aktif görünüyordu),
    //    e-posta hiç yoktu ve "Düzenle" düğmesinin onclick'i tanımsızdı.

    // 2) GENEL HAVUZ = atanmamış başvurular (leads.company_id IS NULL)
    if (leadsBox) {
        leadsBox.innerHTML = '<p class="text-xs text-slate-400 italic">Yükleniyor...</p>';
        const { data: pool } = await supabaseClient
            .from('leads').select('*').is('company_id', null)
            .order('created_at', { ascending: false });

        // ⚠️ HAVUZ ARTIK İKİ TÜR KAYIT İÇERİYOR.
        // Yarışmalı atamada kazanan seçilene kadar company_id NULL kalıyor;
        // yani "en yakın 3 firmaya açılmış" kayıtlar da bu listeye düşüyor.
        // İşaretlemezsek yönetici bunları sahipsiz sanıp elle atar ve
        // yarışmayı farkında olmadan iptal eder.
        const _yarisma = {};
        try {
            const ids = (pool || []).map(l => l.id);
            if (ids.length) {
                const { data: la } = await supabaseClient
                    .from('lead_assignments').select('lead_id, company_id, durum').in('lead_id', ids);
                (la || []).forEach(r => {
                    if (!_yarisma[r.lead_id]) _yarisma[r.lead_id] = [];
                    _yarisma[r.lead_id].push(r);
                });
            }
        } catch (e) { /* tablo yoksa eski davranış */ }

        if (!pool || pool.length === 0) {
            leadsBox.innerHTML = '<p class="text-xs text-slate-400 italic">Genel havuzda atanmamış başvuru bulunmuyor.</p>';
        } else {
            leadsBox.innerHTML = '';
            pool.forEach(l => {
                const dateStr = new Date(l.created_at).toLocaleString('tr-TR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
                const yar = _yarisma[l.id] || [];
                const yarRozet = yar.length
                    ? `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">⚔️ ${yar.length} firmaya açık</span>`
                    : '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">sahipsiz</span>';
                const yarNot = yar.length
                    ? `<p class="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded p-2 mt-2">Bu kayıt ${yar.length} firmanın teklif yarışında. Yatırımcı seçimini kendisi yapacak; buradan elle atarsanız yarışma sonlanır ve diğer firmalara "başka firma seçildi" bildirimi gider.</p>`
                    : '';
                const assignUI = companies.length
                    ? `<select id="assign_${l.id}" class="flex-1 border border-slate-300 p-2 rounded text-xs">
                           <option value="">Firma seçin...</option>${companyOptions}
                       </select>
                       <button onclick="adminAssignLead('${l.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-xs font-bold">Firmaya Ata</button>`
                    : `<span class="text-[10px] text-amber-600 italic">Atama için önce sisteme kayıtlı bir firma olmalı.</span>`;

                leadsBox.innerHTML += `
                    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-xs mb-3">
                        <div class="flex justify-between items-start gap-3">
                            <div>
                                <div class="flex items-center gap-2 flex-wrap"><strong class="text-sm text-slate-800">${admEscape(l.full_name)}</strong>
                                    <span class="font-mono text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">${admEscape(l.tracking_code)}</span>${yarRozet}</div>
                                <p class="text-slate-500 mt-1 font-medium">📞 ${admEscape(l.phone)} | ✉️ ${admEscape(l.email) || '-'} | 📍 ${admEscape(l.address) || '-'}</p>
                                <p class="text-slate-400 mt-2 bg-slate-50 p-2 rounded text-[11px] font-medium border border-slate-100 whitespace-pre-line">${admEscape(l.notes)}</p>
                            </div>
                            <span class="text-[10px] text-slate-400 font-mono whitespace-nowrap">${dateStr}</span>
                        </div>
                        ${yarNot}
                        <div class="flex gap-2 mt-3 pt-3 border-t border-slate-100">${assignUI}</div>
                    </div>`;
            });
        }
    }

    // 3) SERVİS TALEPLERİ = service_requests
    if (ticketsBox) {
        ticketsBox.innerHTML = '<p class="text-xs text-slate-400 italic">Servis talepleri çekiliyor...</p>';
        const { data } = await supabaseClient
            .from('service_requests').select('*')
            .order('created_at', { ascending: false });

        if (!data || data.length === 0) {
            ticketsBox.innerHTML = '<p class="text-xs text-slate-400 italic">Sistemde servis talebi bulunmuyor.</p>';
        } else {
            ticketsBox.innerHTML = '';
            data.forEach(t => {
                const dateStr = new Date(t.created_at).toLocaleString('tr-TR');
                const imgBtn = (path, label) => path
                    ? `<button onclick="openStorageImage('${window.epcAttrJs(path)}')" class="bg-blue-600 text-white px-3 py-1.5 rounded text-[10px] font-bold">${label}</button>`
                    : '';
                const mediaButtons = `
                    <div class="flex gap-2 mt-3 pt-3 border-t border-slate-200 flex-wrap">
                        ${imgBtn(t.img_system, '📸 Sistem')}${imgBtn(t.img_pano, '⚡ Pano')}${imgBtn(t.img_ges, '☀️ GES Pano')}${imgBtn(t.img_code, '⚠️ Hata Kodu')}
                    </div>`;

                ticketsBox.innerHTML += `
                    <div class="p-5 border border-slate-200 rounded-xl bg-white shadow-sm text-xs mb-4">
                        <div class="flex justify-between items-center border-b pb-3 mb-3 flex-wrap gap-2">
                            <div class="flex items-center gap-3 flex-wrap">
                                <span class="bg-slate-900 text-white font-mono px-2 py-1 rounded">${admEscape(t.tracking_code)}</span>
                                <strong class="text-slate-800 text-base">${admEscape(t.full_name)}</strong>
                                <span class="text-[10px] text-slate-400 font-normal">🕒 ${dateStr}</span>
                            </div>
                            <span class="bg-red-100 text-red-800 font-bold px-3 py-1 rounded-full text-[10px] tracking-widest uppercase">DURUM: ${admEscape(t.status)}</span>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 bg-slate-50 p-4 rounded-lg border border-slate-100 text-[11px] text-slate-700">
                            <p><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">İletişim</strong>📞 ${admEscape(t.phone)} <br>✉️ ${admEscape(t.email)}</p>
                            <p><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Donanım</strong>${admEscape(t.inverter_model) || 'Belirtilmedi'}<br>${admEscape(t.battery_model) || 'Batarya Yok'}</p>
                            <p><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Kurulum Firması</strong>${admEscape(t.installer_name) || 'Bilinmiyor'}</p>
                            <p><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Tesis Kodu</strong>${t.facility_code
                                ? `<span class="font-mono">${admEscape(t.facility_code)}</span>${t.project_id ? ' <span class="text-emerald-600 font-bold">✓ tesis eşleşti</span>' : ' <span class="text-amber-600">⚠ eşleşmedi</span>'}`
                                : 'Belirtilmedi'}</p>
                            <p><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Tarihler</strong>Kurulum: ${t.install_date || '-'}<br>Arıza: ${t.problem_date || '-'}</p>
                            <p class="col-span-2"><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Açık Adres</strong>${admEscape(t.address) || 'Belirtilmedi'}</p>
                        </div>
                        <p class="text-slate-700 mb-4 border-l-4 border-red-400 pl-3 py-1 bg-red-50/50 rounded-r font-medium whitespace-pre-line">${admEscape(t.problem_desc)}</p>
                        ${mediaButtons}
                        ${!t.company_id ? `
                        <div class="flex gap-2 mt-4 pt-3 border-t border-slate-100 items-center">
                            <span class="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Havuzda</span>
                            <select id="srassign_${t.id}" class="flex-1 border border-slate-300 p-2 rounded-lg text-xs">
                                <option value="">Firmaya ata...</option>${companyOptions}
                            </select>
                            <button onclick="adminAssignService('${t.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 rounded-lg text-xs">Ata</button>
                        </div>` : ''}
                        <div class="flex gap-2 mt-3 items-center">
                            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Durum</span>
                            <select id="srstatus_${t.id}" class="border border-slate-300 p-2 rounded-lg text-xs">${srStatusOptions(t.status)}</select>
                            <button onclick="updateServiceStatus('${t.id}','srstatus_${t.id}')" class="bg-slate-700 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-lg text-xs">Durumu Güncelle</button>
                        </div>
                        <div class="flex gap-2 mt-3">
                            <input type="text" id="adm_resp_${t.id}" placeholder="Firmaya/Müşteriye yanıt..." value="${admEscape(t.admin_response)}" class="flex-1 p-3 border border-slate-300 rounded-lg text-sm outline-none shadow-inner">
                            <button onclick="adminRespondTicket('${t.id}')" class="bg-red-600 hover:bg-red-700 text-white font-bold px-6 rounded-lg text-sm transition shadow-lg">Yanıtı Kaydet</button>
                        </div>
                    </div>`;
            });
        }
    }

    // 4) POTANSİYEL MÜŞTERİLER (yalnız admin görür)
    await renderProspects();

    // 5) EĞİTİM İÇERİĞİ (yalnız admin görür)
    await renderEduAdmin();

    // 6) SÜREÇ ADIMLARI (yalnız admin görür)
    await renderProcessAdmin();
    await renderMevzuatAdmin();

    // 6b) FİRMA KONUMLARI — yarışmalı atamanın ön koşulu
    await renderFirmaKonumAdmin();

    // 7) DAĞITIM ŞİRKETLERİ (yalnız admin görür)
    await renderDiscoAdmin();

    // 7b) DONANIM KARŞILAŞTIRMA (yalnız admin görür)
    await renderHardwareAdmin();

    // 7c) TEDARİKÇİLER (profil · ürün · ilan onayları)
    await renderSuppliersAdmin();

    // 8) AYARLAR / PARAMETRELER (yalnız admin görür)
    await renderSettingsAdmin();

    // 8b) E-POSTA BİLDİRİM KUYRUĞU
    await renderEpostaAdmin();

    // 9) GENEL AŞAMA ETİKETLERİ (yalnız admin görür)
    await renderStageAdmin();

    // 10) DANIŞMAN BAŞVURULARI (onay akışı)
    await renderConsultantsAdmin();

    // 10b) ABONELİKLER
    await renderSubscriptions();

    // 10b-2) ÜYELER: firma/danışman/tedarikçi + abonelikleri tek listede
    if (typeof window.adminFirmalarCiz === 'function')     await window.adminFirmalarCiz();
    if (typeof window.adminDanismanlarCiz === 'function')  await window.adminDanismanlarCiz();
    if (typeof window.adminTedarikcilerCiz === 'function') await window.adminTedarikcilerCiz();

    // 10c) İŞ DEĞERİ VE KOMİSYON KAYDI
    await renderKomisyonAdmin();

    // 10d) DANIŞMAN DEĞER KAYDI
    await renderDanismanDeger();

    // 11) GENEL BAKIŞ ÖZET KPI'LARINI GÜNCELLE (sekmeli panel)
    renderAdminStats();

    // 12) AKSİYON KUYRUĞU
    renderActionQueue();

    // 13) HAKKIMDA DÜZENLEME KARTI (İçerik sekmesi)
    if (typeof renderAboutAdmin === 'function') renderAboutAdmin();
    if (typeof renderLegalAdmin === 'function') renderLegalAdmin();
}

// --- Potansiyel müşteriler bölümünü (bir kez) admin paneline enjekte eder ---
function ensureProspectsSection() {
    let list = document.getElementById('adminProspectsList');
    if (list) return list;
    const admin = document.getElementById('adminPaneOps') || document.getElementById('adminModule');
    if (!admin) return null;
    const card = document.createElement('div');
    card.className = 'mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
    card.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-black text-slate-800">🌱 Potansiyel Müşteriler</h3>
            <span id="adminProspectsCount" class="text-xs font-bold text-slate-400"></span>
        </div>
        <p class="text-xs text-slate-400 mb-4">Hesaplayıcıda raporunu alan, ilgili ama henüz başvurmamış kişiler. E-posta ısıtma çalışmaları için.</p>
        <div id="adminProspectsList" class="space-y-3"></div>`;
    admin.appendChild(card);
    return document.getElementById('adminProspectsList');
}

function prospectScore(p) {
    // Niyet/aksiyon ağırlıklı puan. Aksiyon en büyük paya sahip; ekonomik uyum ikincil.
    const parts = [];
    const src = (p.source || '').toLowerCase();
    // 1) AKSİYON / NİYET — en büyük ağırlık (0-50)
    let action = 10, aLabel = '👀 Göz attı';
    if (src.includes('danışman') || src.includes('danisman')) { action = 50; aLabel = '🎯 Danışman iletişimi aldı'; }
    else if (p.consent && p.phone && p.email) { action = 40; aLabel = '📝 Bilgi bıraktı'; }
    else if (p.recommended_kwp || p.monthly_bill || p.est_annual_saving) { action = 25; aLabel = '🧮 Hesaplama yaptı'; }
    parts.push([aLabel, action]);
    // 2) ULAŞILABİLİRLİK (izin + iletişim) (0-25)
    let reach = 0, rLabel = '';
    if (p.consent && p.phone) { reach = 25; rLabel = '✅ İzinli + telefon'; }
    else if (p.consent && p.email) { reach = 18; rLabel = '✅ İzinli + e-posta'; }
    else if (p.phone || p.email) { reach = 10; rLabel = '📇 İletişim var (izinsiz)'; }
    if (reach) parts.push([rLabel, reach]);
    // 3) GÜNCELLİK (0-15)
    const days = (Date.now() - new Date(p.created_at).getTime()) / 86400000;
    let rec = 2, recL = '🕐 30+ gün';
    if (days <= 3) { rec = 15; recL = '🔥 Son 3 gün'; }
    else if (days <= 7) { rec = 11; recL = '🕐 Son 7 gün'; }
    else if (days <= 30) { rec = 6; recL = '🕐 Son 30 gün'; }
    parts.push([recL, rec]);
    // 4) EKONOMİK UYUM — ikincil (0-10)
    const bill = Number(p.monthly_bill) || 0;
    let eco = 0, eL = '';
    if (bill >= 8000) { eco = 10; eL = '💰 Yüksek fatura'; }
    else if (bill >= 4000) { eco = 7; eL = '💰 Orta-üstü fatura'; }
    else if (bill >= 1500) { eco = 4; eL = '💰 Orta fatura'; }
    else if (bill > 0) { eco = 2; eL = '💰 Düşük fatura'; }
    if (eco) parts.push([eL, eco]);
    const total = Math.max(0, Math.min(100, action + reach + rec + eco));
    return { total, parts };
}
function scoreBand(s) {
    if (s >= 70) return { label: 'Sıcak', icon: '🔥', cls: 'bg-red-100 text-red-700 border-red-200' };
    if (s >= 40) return { label: 'Ilık', icon: '🌤️', cls: 'bg-amber-100 text-amber-800 border-amber-200' };
    return { label: 'Soğuk', icon: '❄️', cls: 'bg-sky-100 text-sky-700 border-sky-200' };
}

async function renderProspects() {
    const box = ensureProspectsSection();
    if (!box || !supabaseClient) return;
    box.innerHTML = '<p class="text-xs text-slate-400 italic">Yükleniyor...</p>';

    const { data, error } = await supabaseClient
        .from('prospects').select('*').order('created_at', { ascending: false });
    if (error) { box.innerHTML = `<p class="text-xs text-red-500">Yüklenemedi: ${error.message}</p>`; return; }

    const countEl = document.getElementById('adminProspectsCount');
    if (countEl) countEl.textContent = (data?.length || 0) + ' kişi';

    if (!data || data.length === 0) {
        box.innerHTML = '<p class="text-xs text-slate-400 italic">Henüz potansiyel müşteri kaydı yok.</p>';
        return;
    }

    data.forEach(p => { p._sc = prospectScore(p); p._score = p._sc.total; });
    data.sort((a, b) => b._score - a._score);

    const statusOpts = (cur) => [
        ['yeni', 'Yeni'], ['isitiliyor', 'Isıtılıyor'],
        ['donusturuldu', 'Dönüştürüldü'], ['ilgilenmiyor', 'İlgilenmiyor']
    ].map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('');

    const _hot = data.filter(p => p._score >= 70).length, _warm = data.filter(p => p._score >= 40 && p._score < 70).length, _cold = data.length - _hot - _warm;
    const _summary = `<div class="flex gap-2 mb-3 text-[11px] font-bold flex-wrap"><span class="bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1">🔥 ${_hot} Sıcak</span><span class="bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-3 py-1">🌤️ ${_warm} Ilık</span><span class="bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-3 py-1">❄️ ${_cold} Soğuk</span><span class="ml-auto text-slate-400 font-normal self-center">Yaptırma olasılığına göre sıralı</span></div>`;
    box.innerHTML = _summary + data.map(p => {
        const dateStr = new Date(p.created_at).toLocaleString('tr-TR', { day:'2-digit', month:'short', year:'2-digit' });
        const _band = scoreBand(p._score);
        const kwp    = p.recommended_kwp   ? `${p.recommended_kwp} kWp` : '-';
        const bill   = p.monthly_bill      ? `₺${Math.round(p.monthly_bill).toLocaleString('tr-TR')}/ay` : '-';
        const saving = p.est_annual_saving ? `₺${Math.round(p.est_annual_saving).toLocaleString('tr-TR')}/yıl` : '-';
        const pay    = p.payback_years     ? `${p.payback_years} yıl` : '-';
        return `
            <div class="border border-slate-200 rounded-xl p-4 text-xs">
                <div class="flex justify-between items-start gap-3 flex-wrap">
                    <div>
                        <div class="flex items-center gap-2 flex-wrap"><strong class="text-sm text-slate-800">${admEscape(p.full_name) || '(isim yok)'}</strong><span class="text-[10px] font-black px-2 py-0.5 rounded-full border ${_band.cls}">${_band.icon} ${_band.label} · ${p._score}/100</span></div>
                        <div class="mt-1.5 flex flex-wrap gap-1">${p._sc.parts.map(([l, v]) => `<span class="text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">${l} <b class="text-slate-800">+${v}</b></span>`).join('')}</div>
                        <p class="text-slate-500 mt-1 font-medium">✉️ ${admEscape(p.email)}${p.phone ? ' | 📞 ' + admEscape(p.phone) : ''}</p>
                        ${p.source ? `<p class="text-indigo-700 mt-1 text-[11px] font-bold bg-indigo-50 border border-indigo-100 rounded px-2 py-1 inline-block">🔎 ${admEscape(p.source)}</p>` : ''}
                        ${(p.recommended_kwp || p.monthly_bill || p.est_annual_saving) ? `<p class="text-slate-400 mt-2 bg-slate-50 border border-slate-100 rounded px-2 py-1 inline-block">☀️ ${kwp} · ${bill} · Tasarruf ${saving} · Amorti ${pay}</p>` : ''}
                    </div>
                    <span class="text-[10px] text-slate-400 whitespace-nowrap">${dateStr}${p.consent ? ' · ✅ izinli' : ' · ⚠️ izinsiz'}</span>
                </div>
                <div class="flex gap-2 mt-3 pt-3 border-t border-slate-100 items-center flex-wrap">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Durum</span>
                    <select id="prstatus_${p.id}" class="border border-slate-300 p-2 rounded-lg text-xs">${statusOpts(p.status)}</select>
                    <button onclick="updateProspectStatus('${p.id}','prstatus_${p.id}')" class="bg-slate-700 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-lg text-xs">Güncelle</button>
                    <a href="mailto:${admEscape(p.email)}" class="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-xs no-underline">✉️ E-posta At</a>
                </div>
            </div>`;
    }).join('');
}

window.updateProspectStatus = async function(id, selectId) {
    const sel = document.getElementById(selectId);
    const status = sel ? sel.value : '';
    if (!status) return;
    const { error } = await supabaseClient.from('prospects').update({ status }).eq('id', id);
    if (error) { alert("Durum güncellenemedi: " + error.message); return; }
    renderProspects();
};

// Merkezi havuzdaki başvuruyu seçilen firmaya ata
window.adminAssignLead = async function(leadId) {
    const sel = document.getElementById(`assign_${leadId}`);
    const companyId = sel ? sel.value : '';
    if (!companyId) { alert("Lütfen bir firma seçin."); return; }

    // ⚠️ Kayıt yarışmadaysa DOĞRUDAN company_id yazmak yanlış: lead_assignments
    // satırları 'davet'te kalır, kaybeden firmalara bildirim gitmez, danışan
    // kaydına kazanan yazılmaz. lead_kazanan() bunların hepsini yapıyor ve
    // admin'i de yetkili sayıyor.
    let yarismada = false;
    try {
        const { data } = await supabaseClient.from('lead_assignments')
            .select('company_id').eq('lead_id', leadId);
        yarismada = !!(data && data.length);
        if (yarismada && !data.some(r => r.company_id === companyId)) {
            alert('Bu firma bu talebe davet edilmemiş.\n\nYarışmadaki bir kaydı yalnız davet edilen firmalardan birine atayabilirsiniz.');
            return;
        }
    } catch (e) { /* tablo yoksa eski yola düş */ }

    if (yarismada) {
        if (!confirm('Bu kayıt firmaların teklif yarışında.\n\nElle atarsanız yarışma sonlanır, diğer firmalara "başka firma seçildi" bildirimi gider. Normalde bu seçimi yatırımcı yapar.\n\nDevam edilsin mi?')) return;
        const { error } = await supabaseClient.rpc('lead_kazanan', { p_lead_id: leadId, p_company_id: companyId });
        if (error) { alert("Atama hatası: " + error.message); return; }
        alert("Firma seçildi. Diğer firmalar bilgilendirildi.");
    } else {
        const { error } = await supabaseClient.from('leads').update({ company_id: companyId }).eq('id', leadId);
        if (error) { alert("Atama hatası: " + error.message); return; }
        alert("Başvuru firmaya atandı. Firma kendi CRM ekranında görecek.");
    }
    fetchAdminData();
};

// Servis talebine merkez yanıtı yaz
window.adminRespondTicket = async function(id) {
    const el = document.getElementById(`adm_resp_${id}`);
    const respValue = el ? el.value.trim() : '';
    if (!respValue) return;
    const { error } = await supabaseClient
        .from('service_requests')
        .update({ admin_response: respValue, status: 'inceleniyor' })
        .eq('id', id);
    if (error) { alert("Hata: " + error.message); return; }
    alert("Yanıt kaydedildi.");
    fetchAdminData();
};

// Merkezi havuzdaki servis talebini seçilen firmaya ata (yalnız admin)
window.adminAssignService = async function(id) {
    const sel = document.getElementById(`srassign_${id}`);
    const companyId = sel ? sel.value : '';
    if (!companyId) { alert("Lütfen bir firma seçin."); return; }
    const { error } = await supabaseClient.from('service_requests').update({ company_id: companyId }).eq('id', id);
    if (error) { alert("Atama hatası: " + error.message); return; }
    alert("Servis talebi firmaya atandı. Firma kendi 'Teknik Servis' ekranında görecek.");
    fetchAdminData();
};

// Servis talebinin durumunu ilerlet (admin veya talebi üstlenen firma) — global
window.updateServiceStatus = async function(id, selectId) {
    const sel = document.getElementById(selectId);
    const status = sel ? sel.value : '';
    if (!status) return;
    const { error } = await supabaseClient.from('service_requests').update({ status }).eq('id', id);
    if (error) { alert("Durum güncellenemedi: " + error.message); return; }
    alert("Durum güncellendi.");
    // Hangi ekran açıksa onu tazele
    const adminOpen = !document.getElementById('adminModule')?.classList.contains('hidden');
    if (adminOpen && typeof fetchAdminData === 'function') fetchAdminData();
    else if (typeof fetchMyTickets === 'function') fetchMyTickets();
};

// Özel (private) bucket'taki görseli imzalı (geçici) URL ile aç
window.openStorageImage = async function(path) {
    if (!path) return;
    const { data, error } = await supabaseClient.storage.from('support-images').createSignedUrl(path, 60);
    if (error || !data) { alert("Görsel açılamadı."); return; }
    window.open(data.signedUrl, '_blank');
};


// ============================================================================
// EĞİTİM İÇERİĞİ YÖNETİMİ (bölüm / ders / sözlük — yalnız admin)
// ============================================================================
let _eduChapters = [], _eduLessons = [], _eduGlossary = [];

function eduSlugify(s) {
    return String(s || '').toLowerCase()
        .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function ensureEduSection() {
    if (document.getElementById('eduAdminRoot')) return document.getElementById('eduAdminRoot');
    const admin = document.getElementById('adminPaneContent') || document.getElementById('adminModule');
    if (!admin) return null;
    const card = document.createElement('div');
    card.id = 'eduAdminRoot';
    card.className = 'mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
    card.innerHTML = `
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 class="text-lg font-black text-slate-800">📚 Eğitim İçeriği</h3>
            <div class="flex gap-2">
                <button onclick="eduNewChapter()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">+ Yeni Bölüm</button>
                <button onclick="eduNewGlossary()" class="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg">+ Yeni Terim</button>
            </div>
        </div>
        <p class="text-xs text-slate-400 mb-4">Bölümler, dersler ve sözlük burada yönetilir. Değişiklikler anında yayına girer (yayında olanlar ziyaretçiye görünür).</p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
                <div class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Bölümler & Dersler</div>
                <div id="eduChaptersAdmin"></div>
            </div>
            <div>
                <div class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Sözlük</div>
                <div id="eduGlossaryAdmin" class="space-y-2"></div>
            </div>
        </div>`;
    admin.appendChild(card);
    return card;
}

async function renderEduAdmin() {
    const wrap = ensureEduSection();
    if (!wrap || !supabaseClient) return;
    const chBox = document.getElementById('eduChaptersAdmin');
    const glBox = document.getElementById('eduGlossaryAdmin');
    chBox.innerHTML = '<p class="text-xs text-slate-400 italic">Yükleniyor...</p>';

    const [rc, rl, rg] = await Promise.all([
        supabaseClient.from('edu_chapters').select('*').order('sort_order'),
        supabaseClient.from('edu_lessons').select('*').order('sort_order'),
        supabaseClient.from('edu_glossary').select('*').order('sort_order')
    ]);
    if (rc.error) { chBox.innerHTML = `<p class="text-xs text-red-500">Yüklenemedi: ${rc.error.message}</p>`; return; }
    _eduChapters = rc.data || []; _eduLessons = rl.data || []; _eduGlossary = rg.data || [];

    chBox.innerHTML = _eduChapters.map(c => {
        const lessons = _eduLessons.filter(l => l.chapter_id === c.id);
        const rows = lessons.map(l => `
            <div class="flex items-center justify-between gap-2 pl-3 py-1.5 border-l-2 border-slate-100">
                <span class="text-xs text-slate-600">${admEscape(l.title)} ${l.is_published ? '' : '<span class="text-amber-600">(taslak)</span>'}</span>
                <span class="flex gap-1">
                    <button onclick="eduEditLesson('${l.id}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Düzenle</button>
                    <button onclick="eduDeleteLesson('${l.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Sil</button>
                </span>
            </div>`).join('') || '<p class="text-[11px] text-slate-400 pl-3 py-1">Ders yok.</p>';
        return `<div class="border border-slate-200 rounded-xl p-3 mb-3">
            <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
                <div class="min-w-0"><strong class="text-sm text-slate-800">${admEscape(c.title)}</strong> <span class="text-[10px] text-slate-400 font-mono">${admEscape(c.slug)}</span> ${c.is_published ? '' : '<span class="text-[10px] text-amber-600 font-bold">(taslak)</span>'}</div>
                <span class="flex gap-1 flex-shrink-0">
                    <button onclick="eduNewLesson('${c.id}')" class="text-[11px] bg-emerald-600 text-white px-2 py-1 rounded">+ Ders</button>
                    <button onclick="eduEditChapter('${c.id}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Düzenle</button>
                    <button onclick="eduDeleteChapter('${c.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Sil</button>
                </span>
            </div>
            ${rows}
        </div>`;
    }).join('') || '<p class="text-xs text-slate-400 italic">Henüz bölüm yok. "+ Yeni Bölüm" ile başlayın.</p>';

    glBox.innerHTML = _eduGlossary.map(g => `
        <div class="flex items-center justify-between gap-2 border border-slate-200 rounded-lg p-3">
            <strong class="text-xs text-slate-800 min-w-0">${admEscape(g.term)} ${g.is_published ? '' : '<span class="text-amber-600">(taslak)</span>'}</strong>
            <span class="flex gap-1 flex-shrink-0">
                <button onclick="eduEditGlossary('${g.id}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Düzenle</button>
                <button onclick="eduDeleteGlossary('${g.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Sil</button>
            </span>
        </div>`).join('') || '<p class="text-xs text-slate-400 italic">Henüz terim yok.</p>';
}

// --- Ortak modal kabuğu ---
function eduModal(inner) {
    const ex = document.getElementById('eduModal'); if (ex) ex.remove();
    const m = document.createElement('div');
    m.id = 'eduModal';
    m.className = 'fixed inset-0 z-[80] bg-slate-900/60 flex items-center justify-center p-4';
    m.innerHTML = `<div class="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">${inner}</div>`;
    document.body.appendChild(m);
    return m;
}
window.eduCloseModal = function () { const m = document.getElementById('eduModal'); if (m) m.remove(); };

// --- BÖLÜM ---
window.eduNewChapter = () => openChapterModal(null);
window.eduEditChapter = (id) => openChapterModal(_eduChapters.find(c => c.id === id));
function openChapterModal(c) {
    const e = c || {};
    eduModal(`
        <h3 class="text-lg font-black text-slate-800 mb-4">${c ? 'Bölümü Düzenle' : 'Yeni Bölüm'}</h3>
        <div class="space-y-3">
            <div><label class="text-xs font-bold text-slate-600">Başlık</label><input id="ecTitle" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.title)}"></div>
            <div><label class="text-xs font-bold text-slate-600">Slug (boş bırakırsan otomatik oluşur)</label><input id="ecSlug" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.slug)}"></div>
            <div><label class="text-xs font-bold text-slate-600">Açıklama</label><input id="ecDesc" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.description)}"></div>
            <div class="flex gap-3">
                <div class="flex-1"><label class="text-xs font-bold text-slate-600">İkon (opsiyonel)</label><input id="ecIcon" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.icon)}"></div>
                <div class="w-24"><label class="text-xs font-bold text-slate-600">Sıra</label><input id="ecOrder" type="number" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${e.sort_order ?? 0}"></div>
            </div>
            <label class="flex items-center gap-2 text-sm text-slate-600"><input id="ecPub" type="checkbox" ${(e.is_published !== false) ? 'checked' : ''}> Yayında</label>
        </div>
        <div class="flex gap-2 mt-5">
            <button onclick="eduCloseModal()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">İptal</button>
            <button onclick="eduSaveChapter('${c ? c.id : ''}')" class="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-lg">Kaydet</button>
        </div>`);
}
window.eduSaveChapter = async (id) => {
    const title = document.getElementById('ecTitle').value.trim();
    if (!title) { alert('Başlık gerekli.'); return; }
    const obj = {
        title,
        slug: document.getElementById('ecSlug').value.trim() || eduSlugify(title),
        description: document.getElementById('ecDesc').value.trim() || null,
        icon: document.getElementById('ecIcon').value.trim() || null,
        sort_order: parseInt(document.getElementById('ecOrder').value) || 0,
        is_published: document.getElementById('ecPub').checked
    };
    const { error } = id
        ? await supabaseClient.from('edu_chapters').update(obj).eq('id', id)
        : await supabaseClient.from('edu_chapters').insert([obj]);
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    eduCloseModal(); renderEduAdmin();
};
window.eduDeleteChapter = async (id) => {
    if (!confirm('Bu bölüm ve içindeki TÜM dersler silinecek. Emin misiniz?')) return;
    const { error } = await supabaseClient.from('edu_chapters').delete().eq('id', id);
    if (error) { alert('Silinemedi: ' + error.message); return; }
    renderEduAdmin();
};

// --- DERS ---
window.eduNewLesson = (chapterId) => openLessonModal(null, chapterId);
window.eduEditLesson = (id) => openLessonModal(_eduLessons.find(l => l.id === id), null);
function openLessonModal(l, chapterId) {
    const e = l || {};
    const cid = e.chapter_id || chapterId || (_eduChapters[0] && _eduChapters[0].id) || '';
    const opts = _eduChapters.map(c => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${admEscape(c.title)}</option>`).join('');
    eduModal(`
        <h3 class="text-lg font-black text-slate-800 mb-4">${l ? 'Dersi Düzenle' : 'Yeni Ders'}</h3>
        <div class="space-y-3">
            <div><label class="text-xs font-bold text-slate-600">Bölüm</label><select id="elChapter" class="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white">${opts}</select></div>
            <div><label class="text-xs font-bold text-slate-600">Başlık</label><input id="elTitle" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.title)}"></div>
            <div><label class="text-xs font-bold text-slate-600">Slug (boşsa otomatik)</label><input id="elSlug" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.slug)}"></div>
            <div><label class="text-xs font-bold text-slate-600">Ana metin (paragrafları alt satırla ayır)</label><textarea id="elBody" rows="5" class="w-full p-2 border border-slate-300 rounded-lg text-sm">${admEscape(e.body)}</textarea></div>
            <div><label class="text-xs font-bold text-slate-600">Benzetme (opsiyonel)</label><textarea id="elAnalogy" rows="2" class="w-full p-2 border border-slate-300 rounded-lg text-sm">${admEscape(e.analogy)}</textarea></div>
            <div><label class="text-xs font-bold text-slate-600">Özet (opsiyonel)</label><textarea id="elSummary" rows="2" class="w-full p-2 border border-slate-300 rounded-lg text-sm">${admEscape(e.summary)}</textarea></div>
            <div class="flex gap-3">
                <div class="w-28"><label class="text-xs font-bold text-slate-600">Okuma (dk)</label><input id="elMin" type="number" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${e.read_minutes ?? 2}"></div>
                <div class="w-24"><label class="text-xs font-bold text-slate-600">Sıra</label><input id="elOrder" type="number" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${e.sort_order ?? 0}"></div>
                <label class="flex items-end gap-2 text-sm text-slate-600 pb-2"><input id="elPub" type="checkbox" ${(e.is_published !== false) ? 'checked' : ''}> Yayında</label>
            </div>
        </div>
        <div class="flex gap-2 mt-5">
            <button onclick="eduCloseModal()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">İptal</button>
            <button onclick="eduSaveLesson('${l ? l.id : ''}')" class="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-lg">Kaydet</button>
        </div>`);
}
window.eduSaveLesson = async (id) => {
    const title = document.getElementById('elTitle').value.trim();
    const chapter_id = document.getElementById('elChapter').value;
    if (!title) { alert('Başlık gerekli.'); return; }
    if (!chapter_id) { alert('Önce bir bölüm oluşturun.'); return; }
    const obj = {
        chapter_id, title,
        slug: document.getElementById('elSlug').value.trim() || eduSlugify(title),
        body: document.getElementById('elBody').value.trim() || null,
        analogy: document.getElementById('elAnalogy').value.trim() || null,
        summary: document.getElementById('elSummary').value.trim() || null,
        read_minutes: parseInt(document.getElementById('elMin').value) || null,
        sort_order: parseInt(document.getElementById('elOrder').value) || 0,
        is_published: document.getElementById('elPub').checked
    };
    const { error } = id
        ? await supabaseClient.from('edu_lessons').update(obj).eq('id', id)
        : await supabaseClient.from('edu_lessons').insert([obj]);
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    eduCloseModal(); renderEduAdmin();
};
window.eduDeleteLesson = async (id) => {
    if (!confirm('Bu ders silinecek. Emin misiniz?')) return;
    const { error } = await supabaseClient.from('edu_lessons').delete().eq('id', id);
    if (error) { alert('Silinemedi: ' + error.message); return; }
    renderEduAdmin();
};

// --- SÖZLÜK ---
window.eduNewGlossary = () => openGlossaryModal(null);
window.eduEditGlossary = (id) => openGlossaryModal(_eduGlossary.find(g => g.id === id));
function openGlossaryModal(g) {
    const e = g || {};
    const opts = ['<option value="">(bağlantı yok)</option>']
        .concat(_eduChapters.map(c => `<option value="${admEscape(c.slug)}" ${c.slug === e.related_chapter_slug ? 'selected' : ''}>${admEscape(c.title)}</option>`)).join('');
    eduModal(`
        <h3 class="text-lg font-black text-slate-800 mb-4">${g ? 'Terimi Düzenle' : 'Yeni Terim'}</h3>
        <div class="space-y-3">
            <div><label class="text-xs font-bold text-slate-600">Terim</label><input id="egTerm" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.term)}"></div>
            <div><label class="text-xs font-bold text-slate-600">Tanım</label><textarea id="egDef" rows="4" class="w-full p-2 border border-slate-300 rounded-lg text-sm">${admEscape(e.definition)}</textarea></div>
            <div><label class="text-xs font-bold text-slate-600">İlgili bölüm (opsiyonel)</label><select id="egChapter" class="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white">${opts}</select></div>
            <div class="flex gap-3">
                <div class="w-24"><label class="text-xs font-bold text-slate-600">Sıra</label><input id="egOrder" type="number" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${e.sort_order ?? 0}"></div>
                <label class="flex items-end gap-2 text-sm text-slate-600 pb-2"><input id="egPub" type="checkbox" ${(e.is_published !== false) ? 'checked' : ''}> Yayında</label>
            </div>
        </div>
        <div class="flex gap-2 mt-5">
            <button onclick="eduCloseModal()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">İptal</button>
            <button onclick="eduSaveGlossary('${g ? g.id : ''}')" class="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-lg">Kaydet</button>
        </div>`);
}
window.eduSaveGlossary = async (id) => {
    const term = document.getElementById('egTerm').value.trim();
    const definition = document.getElementById('egDef').value.trim();
    if (!term || !definition) { alert('Terim ve tanım gerekli.'); return; }
    const obj = {
        term, definition,
        related_chapter_slug: document.getElementById('egChapter').value || null,
        sort_order: parseInt(document.getElementById('egOrder').value) || 0,
        is_published: document.getElementById('egPub').checked
    };
    const { error } = id
        ? await supabaseClient.from('edu_glossary').update(obj).eq('id', id)
        : await supabaseClient.from('edu_glossary').insert([obj]);
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    eduCloseModal(); renderEduAdmin();
};
window.eduDeleteGlossary = async (id) => {
    if (!confirm('Bu terim silinecek. Emin misiniz?')) return;
    const { error } = await supabaseClient.from('edu_glossary').delete().eq('id', id);
    if (error) { alert('Silinemedi: ' + error.message); return; }
    renderEduAdmin();
};


// ============================================================================
// SÜREÇ ADIMI YÖNETİMİ (process_steps — yalnız admin)
// Not: eduModal/eduCloseModal/eduSlugify yardımcıları yukarıda tanımlıdır.
// ============================================================================
let _psSteps = [];

function ensureProcessSection() {
    if (document.getElementById('psAdminRoot')) return document.getElementById('psAdminRoot');
    const admin = document.getElementById('adminPaneContent') || document.getElementById('adminModule');
    if (!admin) return null;
    const card = document.createElement('div');
    card.id = 'psAdminRoot';
    card.className = 'mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
    card.innerHTML = `
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 class="text-lg font-black text-slate-800">🗺️ Süreç Adımları</h3>
            <button onclick="psNew()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">+ Yeni Adım</button>
        </div>
        <p class="text-xs text-slate-400 mb-4">Yatırımcı rehberinde ve firma proje takibinde kullanılan kurulum süreci adımları.</p>
        <div id="psList" class="space-y-2"></div>`;
    admin.appendChild(card);
    return card;
}

async function renderProcessAdmin() {
    const wrap = ensureProcessSection();
    if (!wrap || !supabaseClient) return;
    const box = document.getElementById('psList');
    box.innerHTML = '<p class="text-xs text-slate-400 italic">Yükleniyor...</p>';
    const { data, error } = await supabaseClient.from('process_steps').select('*').order('sort_order');
    if (error) { box.innerHTML = `<p class="text-xs text-red-500">Yüklenemedi: ${error.message}</p>`; return; }
    _psSteps = data || [];
    box.innerHTML = _psSteps.map(s => `
        <div class="flex items-center justify-between gap-2 border border-slate-200 rounded-lg p-3">
            <div class="min-w-0">
                <strong class="text-sm text-slate-800">${s.step_no || ''}. ${admEscape(s.title)}</strong> ${s.is_published ? '' : '<span class="text-[10px] text-amber-600 font-bold">(taslak)</span>'}
                <div class="text-[11px] text-slate-400 truncate">${admEscape(s.short_desc)}</div>
            </div>
            <span class="flex gap-1 flex-shrink-0">
                <button onclick="psEdit('${s.id}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Düzenle</button>
                <button onclick="psDelete('${s.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Sil</button>
            </span>
        </div>`).join('') || '<p class="text-xs text-slate-400 italic">Henüz adım yok.</p>';
}

window.psNew = () => openStepModal(null);
window.psEdit = (id) => openStepModal(_psSteps.find(s => s.id === id));
function openStepModal(s) {
    const e = s || {};
    const actors = ['Yatırımcı', 'Firma', 'Dağıtım Şirketi', 'Yatırımcı + Firma', 'Yatırımcı + Dağıtım Şirketi', 'Dağıtım Şirketi + Firma'];
    const actorOpts = actors.map(a => `<option ${e.actor === a ? 'selected' : ''}>${a}</option>`).join('');
    eduModal(`
        <h3 class="text-lg font-black text-slate-800 mb-4">${s ? 'Adımı Düzenle' : 'Yeni Adım'}</h3>
        <div class="space-y-3">
            <div class="flex gap-3">
                <div class="w-20"><label class="text-xs font-bold text-slate-600">No</label><input id="psNo" type="number" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${e.step_no ?? 0}"></div>
                <div class="flex-1"><label class="text-xs font-bold text-slate-600">Başlık</label><input id="psTitle" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.title)}"></div>
            </div>
            <div><label class="text-xs font-bold text-slate-600">Kısa açıklama (tek cümle)</label><input id="psShort" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.short_desc)}"></div>
            <div><label class="text-xs font-bold text-slate-600">Detay (paragrafları alt satırla ayır)</label><textarea id="psDetail" rows="4" class="w-full p-2 border border-slate-300 rounded-lg text-sm">${admEscape(e.detail)}</textarea></div>
            <div><label class="text-xs font-bold text-slate-600">Kim yapar</label><select id="psActor" class="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white">${actorOpts}</select></div>
            <div><label class="text-xs font-bold text-slate-600">İpucu (opsiyonel)</label><textarea id="psTip" rows="2" class="w-full p-2 border border-slate-300 rounded-lg text-sm">${admEscape(e.tip)}</textarea></div>
            <div class="flex gap-3">
                <div class="flex-1"><label class="text-xs font-bold text-slate-600">Yaklaşık süre (opsiyonel)</label><input id="psDur" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.duration)}"></div>
                <div class="w-24"><label class="text-xs font-bold text-slate-600">Sıra</label><input id="psOrder" type="number" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${e.sort_order ?? 0}"></div>
                <label class="flex items-end gap-2 text-sm text-slate-600 pb-2"><input id="psPub" type="checkbox" ${(e.is_published !== false) ? 'checked' : ''}> Yayında</label>
            </div>
        </div>
        <div class="flex gap-2 mt-5">
            <button onclick="eduCloseModal()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">İptal</button>
            <button onclick="psSave('${s ? s.id : ''}')" class="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-lg">Kaydet</button>
        </div>`);
}
window.psSave = async (id) => {
    const title = document.getElementById('psTitle').value.trim();
    if (!title) { alert('Başlık gerekli.'); return; }
    const base = {
        title,
        step_no: parseInt(document.getElementById('psNo').value) || 0,
        short_desc: document.getElementById('psShort').value.trim() || null,
        detail: document.getElementById('psDetail').value.trim() || null,
        actor: document.getElementById('psActor').value || null,
        tip: document.getElementById('psTip').value.trim() || null,
        duration: document.getElementById('psDur').value.trim() || null,
        sort_order: parseInt(document.getElementById('psOrder').value) || 0,
        is_published: document.getElementById('psPub').checked
    };
    let error;
    if (id) {
        ({ error } = await supabaseClient.from('process_steps').update(base).eq('id', id));
    } else {
        // slug adım anahtarıdır (projelerdeki ilerleme buna bağlı); yeni adımda benzersiz üretilir
        const slug = (eduSlugify(title) || 'adim') + '-' + Math.random().toString(36).slice(2, 6);
        ({ error } = await supabaseClient.from('process_steps').insert([{ ...base, slug }]));
    }
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    eduCloseModal(); renderProcessAdmin();
};
window.psDelete = async (id) => {
    if (!confirm('Bu süreç adımı silinecek. Projelerde bu adımın işareti de artık görünmeyecek. Emin misiniz?')) return;
    const { error } = await supabaseClient.from('process_steps').delete().eq('id', id);
    if (error) { alert('Silinemedi: ' + error.message); return; }
    renderProcessAdmin();
};


// ============================================================================
// TEDARİKÇİ YÖNETİMİ (suppliers + supplier_products + supplier_dealer_ads)
// Profil onayı, ürün onayı ve bayi ilanı onayı. Onaylanan ürün
// approve_supplier_product() RPC'si ile donanım karşılaştırmasına taşınır.
// tedarikci.sql çalıştırılmış olmalıdır.
// ============================================================================
let _supList = [], _supProds = [], _supAds = [], _supStock = [];

async function renderSuppliersAdmin() {
    // Artık pane'in TAMAMINI değil, yalnız onay bölümünü çiziyor; üye+abonelik
    // listesi aynı sekmede admSuppliersRoot'ta duruyor (uye-yonetimi.js).
    const pane = document.getElementById('admSuppliersOnay');
    if (!pane || !supabaseClient) return;
    pane.innerHTML = '<p class="text-xs text-slate-400 italic">Yükleniyor...</p>';

    const [sup, prod, ads, stk] = await Promise.all([
        supabaseClient.from('suppliers').select('*').order('created_at', { ascending: false }),
        supabaseClient.from('supplier_products').select('*').order('created_at', { ascending: false }),
        supabaseClient.from('supplier_dealer_ads').select('*').order('created_at', { ascending: false }),
        supabaseClient.from('supplier_stock').select('*').order('created_at', { ascending: false })
    ]);
    if (sup.error) {
        pane.innerHTML = `<div class="bg-white border border-slate-200 rounded-xl p-5">
            <p class="text-sm text-red-500">Yüklenemedi: ${admEscape(sup.error.message)}</p>
            <p class="text-xs text-slate-400 mt-1">tedarikci.sql çalıştırıldı mı?</p></div>`;
        return;
    }
    _supList = sup.data || []; _supProds = prod.data || []; _supAds = ads.data || [];
    // stok-fiyatlandirma.sql henüz çalışmadıysa bu tablo yoktur; bölüm gizlenir.
    _supStock = (stk && !stk.error) ? (stk.data || []) : [];
    const stokTablosuVar = !(stk && stk.error);

    const bekleyenP = _supList.filter(x => x.status === 'pending');
    const bekleyenU = _supProds.filter(x => x.status === 'pending');
    const bekleyenI = _supAds.filter(x => x.status === 'pending');
    const bekleyenS = _supStock.filter(x => x.status === 'pending');

    const rozet = (st) => ({
        draft:    '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">Taslak</span>',
        pending:  '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Onay bekliyor</span>',
        approved: '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Onaylı</span>',
        rejected: '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">Reddedildi</span>'
    })[st] || '';

    const supAd = (id) => { const x = _supList.find(s => s.id === id); return x ? x.company_name : '—'; };

    pane.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 class="text-lg font-black text-slate-800 mb-1">📦 Tedarikçi Profilleri</h3>
        <p class="text-xs text-slate-400 mb-4">Onaylanan tedarikçiler kurulumcu firmaların gördüğü dizine girer. Yatırımcıya gösterilmez.</p>
        ${bekleyenP.length ? `<p class="text-xs font-bold text-amber-700 mb-2">${bekleyenP.length} profil onay bekliyor</p>` : ''}
        <div class="space-y-2">
            ${_supList.map(x => `
                <div class="border border-slate-200 rounded-lg p-3">
                    <div class="flex items-start justify-between gap-2 flex-wrap">
                        <div class="min-w-0">
                            <strong class="text-sm text-slate-800">${admEscape(x.company_name)}</strong> ${rozet(x.status)}
                            ${x.banned ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white">ENGELLİ</span>' : ''}
                            <div class="text-[11px] text-slate-400">${admEscape(x.city)} · ${admEscape(x.email)} · ${admEscape(x.phone)}</div>
                            ${(x.categories || []).length ? `<div class="text-[11px] text-slate-500 mt-0.5">${(x.categories || []).map(admEscape).join(' · ')}</div>` : ''}
                            ${(x.brands || []).length ? `<div class="text-[11px] text-slate-400">Markalar: ${(x.brands || []).map(admEscape).join(', ')}</div>` : ''}
                            ${x.about ? `<div class="text-[11px] text-slate-500 mt-1 max-w-xl">${admEscape(x.about).slice(0, 200)}</div>` : ''}
                        </div>
                        <span class="flex gap-1 flex-shrink-0">
                            ${x.status !== 'approved' ? `<button onclick="supAdminApprove('${x.id}')" class="text-[11px] bg-emerald-600 text-white font-bold px-2 py-1 rounded">Onayla</button>` : ''}
                            ${x.status === 'pending' ? `<button onclick="supAdminReject('${x.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Düzeltme İste</button>` : ''}
                            <button onclick="supAdminToggleBan('${x.id}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">${x.banned ? 'Engeli Kaldır' : 'Engelle'}</button>
                        </span>
                    </div>
                </div>`).join('') || '<p class="text-xs text-slate-400 italic">Henüz tedarikçi kaydı yok.</p>'}
        </div>
    </div>

    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 class="text-lg font-black text-slate-800 mb-1">⚖️ Ürün Onayları</h3>
        <p class="text-xs text-slate-400 mb-4">Onaylanan ürün donanım karşılaştırma tablosuna eklenir. Değerleri kaynak dokümanla karşılaştırın.</p>
        ${bekleyenU.length ? `<p class="text-xs font-bold text-amber-700 mb-2">${bekleyenU.length} ürün onay bekliyor</p>` : ''}
        <div class="space-y-2">
            ${_supProds.map(x => `
                <div class="border border-slate-200 rounded-lg p-3 flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <strong class="text-sm text-slate-800">${admEscape(x.name)}</strong> ${rozet(x.status)}
                        ${x.source_url ? `<a href="${admEscape(x.source_url)}" target="_blank" rel="noopener nofollow" class="text-[11px] text-emerald-700 font-bold ml-1">Kaynak ↗</a>`
                                       : '<span class="text-[10px] font-bold text-red-500 ml-1">kaynak yok</span>'}
                        <div class="text-[11px] text-slate-400">${admEscape(supAd(x.supplier_id))} · ${admEscape(x.category_key)}</div>
                        <div class="text-[11px] text-slate-500">${admEscape((x.cells || []).filter(Boolean).join(' · '))}</div>
                        ${x.note ? `<div class="text-[11px] text-slate-400 italic mt-0.5">Not: ${admEscape(x.note)}</div>` : ''}
                    </div>
                    <span class="flex gap-1 flex-shrink-0">
                        ${x.status !== 'approved' ? `<button onclick="supAdminApproveProduct('${x.id}')" class="text-[11px] bg-emerald-600 text-white font-bold px-2 py-1 rounded">Onayla &amp; Yayınla</button>` : ''}
                        ${x.status === 'pending' ? `<button onclick="supAdminRejectProduct('${x.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Düzeltme İste</button>` : ''}
                    </span>
                </div>`).join('') || '<p class="text-xs text-slate-400 italic">Ürün kaydı yok.</p>'}
        </div>
    </div>

    ${stokTablosuVar ? `
    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 class="text-lg font-black text-slate-800 mb-1">🏷️ Stok & Fiyat Onayları</h3>
        <p class="text-xs text-slate-400 mb-4">Onaylanan stok satırları kurulumcu firmalara konuma göre sıralı gösterilir. Fiyatı gizli satırlarda kurulumcuya yalnız "fiyat teklifi iste" düğmesi çıkar.</p>
        ${bekleyenS.length ? `<p class="text-xs font-bold text-amber-700 mb-2">${bekleyenS.length} stok satırı onay bekliyor</p>` : ''}
        <div class="space-y-2">
            ${_supStock.map(x => `
                <div class="border border-slate-200 rounded-lg p-3 flex items-start justify-between gap-2 flex-wrap">
                    <div class="min-w-0">
                        <strong class="text-sm text-slate-800">${admEscape(x.brand)} ${admEscape(x.model)}</strong> ${rozet(x.status)}
                        ${x.price_visible
                            ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">fiyat açık</span>'
                            : '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">fiyat gizli</span>'}
                        ${x.source_url ? `<a href="${admEscape(x.source_url)}" target="_blank" rel="noopener nofollow" class="text-[11px] text-emerald-700 font-bold ml-1">Kaynak ↗</a>` : ''}
                        <div class="text-[11px] text-slate-400">${admEscape(supAd(x.supplier_id))} · ${admEscape(x.category_key)} · 📍 ${admEscape([x.district, x.city].filter(Boolean).join(' / ') || 'konum yok')}</div>
                        <div class="text-[11px] text-slate-500">${Number(x.quantity).toLocaleString('tr-TR')} ${admEscape(x.unit)}${x.price_visible && x.unit_price != null ? ' · ' + Number(x.unit_price).toLocaleString('tr-TR') + ' ' + admEscape(x.currency) + '/' + admEscape(x.price_basis) : ''}${x.valid_until ? ' · geçerlilik ' + admEscape(x.valid_until) : ''}</div>
                        ${x.status === 'rejected' && x.reject_reason ? `<div class="text-[11px] text-red-600 mt-0.5">${admEscape(x.reject_reason)}</div>` : ''}
                    </div>
                    <span class="flex gap-1 flex-shrink-0">
                        ${x.status !== 'approved' ? `<button onclick="supAdminApproveStock('${x.id}')" class="text-[11px] bg-emerald-600 text-white font-bold px-2 py-1 rounded">Onayla</button>` : ''}
                        ${x.status === 'pending' ? `<button onclick="supAdminRejectStock('${x.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Düzeltme İste</button>` : ''}
                    </span>
                </div>`).join('') || '<p class="text-xs text-slate-400 italic">Stok kaydı yok.</p>'}
        </div>
    </div>` : ''}

    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 class="text-lg font-black text-slate-800 mb-1">🤝 Bayi İlanı Onayları</h3>
        <p class="text-xs text-slate-400 mb-4">Onaylanan ilanlar kurulumcu firmalara gösterilir.</p>
        ${bekleyenI.length ? `<p class="text-xs font-bold text-amber-700 mb-2">${bekleyenI.length} ilan onay bekliyor</p>` : ''}
        <div class="space-y-2">
            ${_supAds.map(x => `
                <div class="border border-slate-200 rounded-lg p-3 flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <strong class="text-sm text-slate-800">${admEscape(x.title)}</strong> ${rozet(x.status)}
                        <div class="text-[11px] text-slate-400">${admEscape(supAd(x.supplier_id))} · ${admEscape((x.cities || []).join(', '))}</div>
                        ${x.body ? `<div class="text-[11px] text-slate-500 mt-0.5 max-w-xl">${admEscape(x.body).slice(0, 200)}</div>` : ''}
                    </div>
                    <span class="flex gap-1 flex-shrink-0">
                        ${x.status !== 'approved' ? `<button onclick="supAdminApproveAd('${x.id}')" class="text-[11px] bg-emerald-600 text-white font-bold px-2 py-1 rounded">Onayla</button>` : ''}
                        ${x.status === 'pending' ? `<button onclick="supAdminRejectAd('${x.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Reddet</button>` : ''}
                    </span>
                </div>`).join('') || '<p class="text-xs text-slate-400 italic">İlan yok.</p>'}
        </div>
    </div>`;

    if (typeof setTabBadge === 'function') setTabBadge('suppliers', bekleyenP.length + bekleyenU.length + bekleyenI.length + bekleyenS.length);
}

window.supAdminApprove = async (id) => {
    const { error } = await supabaseClient.from('suppliers').update({ status: 'approved', reject_reason: null }).eq('id', id);
    if (error) { alert('Onaylanamadı: ' + error.message); return; }
    renderSuppliersAdmin();
};
window.supAdminReject = async (id) => {
    const r = prompt('Tedarikçiye iletilecek düzeltme notu:');
    if (r === null) return;
    const { error } = await supabaseClient.from('suppliers').update({ status: 'rejected', reject_reason: r || null }).eq('id', id);
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    renderSuppliersAdmin();
};
window.supAdminToggleBan = async (id) => {
    const x = _supList.find(s => s.id === id); if (!x) return;
    let reason = null;
    if (!x.banned) { reason = prompt('Engelleme sebebi:'); if (reason === null) return; }
    const { error } = await supabaseClient.from('suppliers')
        .update({ banned: !x.banned, ban_reason: x.banned ? null : (reason || null) }).eq('id', id);
    if (error) { alert('İşlem başarısız: ' + error.message); return; }
    renderSuppliersAdmin();
};

window.supAdminApproveProduct = async (id) => {
    const x = _supProds.find(p => p.id === id);
    if (x && !x.source_url && !confirm('Bu üründe kaynak bağlantısı yok. Değerleri doğrulanmamış veri olarak yayınlamak platformun bağımsızlık iddiasını zayıflatır.\n\nYine de yayınlansın mı?')) return;
    const { error } = await supabaseClient.rpc('approve_supplier_product', { p_id: id });
    if (error) { alert('Yayınlanamadı: ' + error.message); return; }
    renderSuppliersAdmin();
    if (typeof renderHardwareAdmin === 'function') renderHardwareAdmin();
};
window.supAdminRejectProduct = async (id) => {
    const r = prompt('Tedarikçiye iletilecek düzeltme notu:');
    if (r === null) return;
    const { error } = await supabaseClient.from('supplier_products').update({ status: 'rejected', reject_reason: r || null }).eq('id', id);
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    renderSuppliersAdmin();
};

window.supAdminApproveStock = async (id) => {
    const x = _supStock.find(p => p.id === id);
    // Konum bu modülün asıl bilgisi: ilsiz satır yakınlık sıralamasına giremez.
    if (x && !x.city) { alert('Bu satırda il yok. Konumsuz stok, kurulumcuya en yakın depoyu gösteremez — tedarikçiden düzeltme isteyin.'); return; }
    const { error } = await supabaseClient.rpc('set_supplier_stock_status', { p_id: id, p_status: 'approved' });
    if (error) { alert('Onaylanamadı: ' + error.message); return; }
    renderSuppliersAdmin();
};
window.supAdminRejectStock = async (id) => {
    const r = prompt('Tedarikçiye iletilecek düzeltme notu:');
    if (r === null) return;
    const { error } = await supabaseClient.rpc('set_supplier_stock_status', { p_id: id, p_status: 'rejected', p_reason: r || null });
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    renderSuppliersAdmin();
};

window.supAdminApproveAd = async (id) => {
    const { error } = await supabaseClient.from('supplier_dealer_ads').update({ status: 'approved', reject_reason: null }).eq('id', id);
    if (error) { alert('Onaylanamadı: ' + error.message); return; }
    renderSuppliersAdmin();
};
window.supAdminRejectAd = async (id) => {
    const r = prompt('Red sebebi:');
    if (r === null) return;
    const { error } = await supabaseClient.from('supplier_dealer_ads').update({ status: 'rejected', reject_reason: r || null }).eq('id', id);
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    renderSuppliersAdmin();
};


// ============================================================================
// DONANIM KARŞILAŞTIRMA YÖNETİMİ (hardware_categories + hardware_items)
// Ziyaretçiye gösterilen tablo buradan doldurulur. Ürün verisi kodda TUTULMAZ;
// her satır üretici kataloğundan doğrulanıp kaynağıyla birlikte girilir.
// hardware.sql çalıştırılmış olmalıdır.
// ============================================================================
let _hwCats = [];
let _hwItems = {};

function ensureHardwareSection() {
    if (document.getElementById('hwAdminRoot')) return document.getElementById('hwAdminRoot');
    const admin = document.getElementById('adminPaneContent') || document.getElementById('adminModule');
    if (!admin) return null;
    const card = document.createElement('div');
    card.id = 'hwAdminRoot';
    card.className = 'mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
    card.innerHTML = `
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 class="text-lg font-black text-slate-800">⚖️ Donanım Karşılaştırma</h3>
            <button onclick="hwNewCat()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg">+ Kategori</button>
        </div>
        <p class="text-xs text-slate-400 mb-4">Ziyaretçi "Donanım Karşılaştırma" aracındaki tablo. Yayında satır yoksa araç ana sayfada hiç görünmez.</p>
        <div id="hwList" class="space-y-4"></div>`;
    admin.appendChild(card);
    return card;
}

async function renderHardwareAdmin() {
    const wrap = ensureHardwareSection();
    if (!wrap || !supabaseClient) return;
    const box = document.getElementById('hwList');
    box.innerHTML = '<p class="text-xs text-slate-400 italic">Yükleniyor...</p>';

    const [cat, item] = await Promise.all([
        supabaseClient.from('hardware_categories').select('*').order('sort_order'),
        supabaseClient.from('hardware_items').select('*').order('sort_order')
    ]);
    if (cat.error) {
        box.innerHTML = `<p class="text-xs text-red-500">Yüklenemedi: ${admEscape(cat.error.message)}<br><span class="text-slate-400">hardware.sql çalıştırıldı mı?</span></p>`;
        return;
    }
    _hwCats = cat.data || [];
    _hwItems = {};
    (item.data || []).forEach(r => { (_hwItems[r.category_key] = _hwItems[r.category_key] || []).push(r); });

    if (!_hwCats.length) { box.innerHTML = '<p class="text-xs text-slate-400 italic">Henüz kategori yok.</p>'; return; }

    box.innerHTML = _hwCats.map(c => {
        const rows = _hwItems[c.key] || [];
        const cols = Array.isArray(c.cols) ? c.cols : [];
        const satirlar = rows.map(r => {
            const cells = Array.isArray(r.cells) ? r.cells : [];
            return `
            <div class="flex items-center justify-between gap-2 border border-slate-200 rounded-lg p-2 pl-3">
                <div class="min-w-0">
                    <strong class="text-sm text-slate-800">${admEscape(cells[0])}</strong>
                    ${r.is_published ? '' : '<span class="text-[10px] text-amber-600 font-bold ml-1">(taslak)</span>'}
                    ${r.source_url ? '<span class="text-[10px] text-emerald-600 font-bold ml-1">kaynaklı</span>' : '<span class="text-[10px] text-red-500 font-bold ml-1">kaynak yok</span>'}
                    <div class="text-[11px] text-slate-400 truncate">${admEscape(cells.slice(1).filter(Boolean).join(' · '))}</div>
                </div>
                <span class="flex gap-1 flex-shrink-0">
                    <button onclick="hwEditItem('${r.id}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Düzenle</button>
                    <button onclick="hwDeleteItem('${r.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Sil</button>
                </span>
            </div>`;
        }).join('') || '<p class="text-[11px] text-slate-400 italic pl-1">Bu kategoride satır yok — sekme ziyaretçiye gösterilmiyor.</p>';

        return `
        <div class="border border-slate-200 rounded-xl p-3">
            <div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div class="min-w-0">
                    <strong class="text-sm text-slate-800">${admEscape(c.label)}</strong>
                    <span class="text-[11px] text-slate-400 ml-1">${cols.length} sütun · ${rows.length} satır</span>
                </div>
                <span class="flex gap-1 flex-shrink-0">
                    <button onclick="hwNewItem('${admEscape(c.key)}')" class="text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded">+ Ürün</button>
                    <button onclick="hwEditCat('${admEscape(c.key)}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Kategori</button>
                    <button onclick="hwDeleteCat('${admEscape(c.key)}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Sil</button>
                </span>
            </div>
            <div class="space-y-1.5">${satirlar}</div>
        </div>`;
    }).join('');
}

// ------------------------------------------------------------------ kategori
window.hwNewCat = () => openHwCatModal(null);
window.hwEditCat = (key) => openHwCatModal(_hwCats.find(c => c.key === key));
function openHwCatModal(c) {
    const e = c || {};
    const cols = Array.isArray(e.cols) ? e.cols : [];
    eduModal(`
        <h3 class="text-lg font-black text-slate-800 mb-4">${c ? 'Kategoriyi Düzenle' : 'Yeni Kategori'}</h3>
        <div class="space-y-3">
            <div class="flex gap-3">
                <div class="flex-1"><label class="text-xs font-bold text-slate-600">Sekme adı</label><input id="hwCatLabel" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.label)}"></div>
                <div class="w-24"><label class="text-xs font-bold text-slate-600">Sıra</label><input id="hwCatOrder" type="number" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${e.sort_order ?? 0}"></div>
            </div>
            <div><label class="text-xs font-bold text-slate-600">Açıklama (tablonun üstünde çıkar)</label><textarea id="hwCatGuide" rows="3" class="w-full p-2 border border-slate-300 rounded-lg text-sm">${admEscape(e.guide)}</textarea></div>
            <div>
                <label class="text-xs font-bold text-slate-600">Sütun başlıkları (her satıra bir tane)</label>
                <textarea id="hwCatCols" rows="8" class="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono">${admEscape(cols.join('\n'))}</textarea>
                <p class="text-[10px] text-slate-400 mt-1">İlk sütun marka/model olmalı; tabloda kalın gösterilir. Sütunu değiştirirsen mevcut ürün satırlarını da güncelle.</p>
            </div>
            <label class="flex items-center gap-2 text-sm text-slate-600"><input id="hwCatPub" type="checkbox" ${(e.is_published !== false) ? 'checked' : ''}> Yayında</label>
        </div>
        <div class="flex gap-2 mt-5">
            <button onclick="eduCloseModal()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">İptal</button>
            <button onclick="hwSaveCat('${c ? admEscape(c.key) : ''}')" class="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-lg">Kaydet</button>
        </div>`);
}
window.hwSaveCat = async (key) => {
    const label = document.getElementById('hwCatLabel').value.trim();
    if (!label) { alert('Sekme adı gerekli.'); return; }
    const cols = document.getElementById('hwCatCols').value.split('\n').map(x => x.trim()).filter(Boolean);
    if (!cols.length) { alert('En az bir sütun başlığı gerekli.'); return; }
    const base = {
        label,
        guide: document.getElementById('hwCatGuide').value.trim() || null,
        cols,
        sort_order: parseInt(document.getElementById('hwCatOrder').value) || 0,
        is_published: document.getElementById('hwCatPub').checked
    };
    let error;
    if (key) {
        ({ error } = await supabaseClient.from('hardware_categories').update(base).eq('key', key));
    } else {
        const yeniKey = eduSlugify(label) || ('kat-' + Math.random().toString(36).slice(2, 6));
        ({ error } = await supabaseClient.from('hardware_categories').insert([{ ...base, key: yeniKey }]));
    }
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    eduCloseModal(); renderHardwareAdmin();
};
window.hwDeleteCat = async (key) => {
    const n = (_hwItems[key] || []).length;
    if (!confirm(`Bu kategori ve içindeki ${n} ürün satırı silinecek. Emin misiniz?`)) return;
    const { error } = await supabaseClient.from('hardware_categories').delete().eq('key', key);
    if (error) { alert('Silinemedi: ' + error.message); return; }
    renderHardwareAdmin();
};

// --------------------------------------------------------------------- ürün
window.hwNewItem = (catKey) => openHwItemModal(catKey, null);
window.hwEditItem = (id) => {
    for (const k in _hwItems) {
        const it = _hwItems[k].find(r => r.id === id);
        if (it) return openHwItemModal(k, it);
    }
};
function openHwItemModal(catKey, it) {
    const cat = _hwCats.find(c => c.key === catKey);
    if (!cat) { alert('Kategori bulunamadı.'); return; }
    const cols = Array.isArray(cat.cols) ? cat.cols : [];
    const e = it || {};
    const cells = Array.isArray(e.cells) ? e.cells : [];

    // Alanlar kategorinin sütunlarından üretilir; şema değişince form da değişir.
    const alanlar = cols.map((c, i) => `
        <div>
            <label class="text-xs font-bold text-slate-600">${admEscape(c)}${i === 0 ? ' <span class="text-red-500">*</span>' : ''}</label>
            <input id="hwCell${i}" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(cells[i])}">
        </div>`).join('');

    eduModal(`
        <h3 class="text-lg font-black text-slate-800 mb-1">${it ? 'Ürünü Düzenle' : 'Yeni Ürün'}</h3>
        <p class="text-xs text-slate-400 mb-4">${admEscape(cat.label)} · ${cols.length} alan</p>
        <div class="space-y-3">
            ${alanlar}
            <div class="border-t border-slate-100 pt-3 space-y-3">
                <div>
                    <label class="text-xs font-bold text-slate-600">Kaynak bağlantısı (üretici kataloğu)</label>
                    <input id="hwSource" type="url" placeholder="https://..." class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.source_url)}">
                    <p class="text-[10px] text-slate-400 mt-1">Ziyaretçiye "Katalog ↗" bağlantısı olarak gösterilir. Doğrulanabilirlik platformun iddiası — boş bırakmamaya çalışın.</p>
                </div>
                <div class="flex gap-3">
                    <div class="flex-1"><label class="text-xs font-bold text-slate-600">Doğrulama tarihi</label><input id="hwVerified" type="date" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.verified_on)}"></div>
                    <div class="w-24"><label class="text-xs font-bold text-slate-600">Sıra</label><input id="hwOrder" type="number" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${e.sort_order ?? 0}"></div>
                    <label class="flex items-end gap-2 text-sm text-slate-600 pb-2"><input id="hwPub" type="checkbox" ${(e.is_published !== false) ? 'checked' : ''}> Yayında</label>
                </div>
            </div>
        </div>
        <div class="flex gap-2 mt-5">
            <button onclick="eduCloseModal()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">İptal</button>
            <button onclick="hwSaveItem('${admEscape(catKey)}','${it ? it.id : ''}',${cols.length})" class="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-lg">Kaydet</button>
        </div>`);
}
window.hwSaveItem = async (catKey, id, colCount) => {
    const cells = [];
    for (let i = 0; i < colCount; i++) cells.push(document.getElementById('hwCell' + i).value.trim());
    if (!cells[0]) { alert('İlk alan (marka/model) gerekli.'); return; }
    const base = {
        category_key: catKey,
        cells,
        source_url: document.getElementById('hwSource').value.trim() || null,
        verified_on: document.getElementById('hwVerified').value || null,
        sort_order: parseInt(document.getElementById('hwOrder').value) || 0,
        is_published: document.getElementById('hwPub').checked
    };
    const { error } = id
        ? await supabaseClient.from('hardware_items').update(base).eq('id', id)
        : await supabaseClient.from('hardware_items').insert([base]);
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    eduCloseModal(); renderHardwareAdmin();
};
window.hwDeleteItem = async (id) => {
    if (!confirm('Bu ürün satırı silinecek. Emin misiniz?')) return;
    const { error } = await supabaseClient.from('hardware_items').delete().eq('id', id);
    if (error) { alert('Silinemedi: ' + error.message); return; }
    renderHardwareAdmin();
};


// ============================================================================
// FİRMA KONUMLARI (yalnız admin)
//
// ⚠️ YARIŞMALI ATAMANIN TEK ÖN KOŞULU BU.
// en_yakin_firmalar() "where c.city is not null" diyor. Konumu olmayan firma
// hiçbir yatırımcıya eşleşmez — ne davet alır ne teklif verir. Canlıda
// ölçüldü: tek kayıtlı firmanın city'si NULL, en_yakin_firmalar(...,kapsam=4)
// yani TÜM TÜRKİYE kapsamında bile [] dönüyordu.
//
// Kayıt formuna il/ilçe eklendi ama ondan önce kaydolmuş firmalar boş kaldı
// ve panelde konum girilecek hiçbir ekran yoktu ("Firmalar" sekmesi profil
// listeliyor, "Düzenle" düğmesinin onclick'i bile yok).
//
// firma-konum-admin.sql çalıştırılmış olmalıdır.
// ============================================================================
let _fkFirmalar = [];

function fkKok() {
    if (document.getElementById('fkRoot')) return document.getElementById('fkRoot');
    const admin = document.getElementById('adminPaneCompanies') || document.getElementById('adminModule');
    if (!admin) return null;
    const card = document.createElement('div');
    card.id = 'fkRoot';
    card.className = 'mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
    card.innerHTML = `
        <h3 class="text-lg font-black text-slate-800 mb-1">📍 Firma Konumları</h3>
        <p class="text-xs text-slate-500 mb-3">Yatırımcıya <strong>en yakın 3 firma</strong> bu alanlardan hesaplanıyor. İli boş olan firma hiçbir başvuruya eşleşmez — ne davet alır ne teklif verir.</p>
        <div id="fkOzet" class="mb-3"></div>
        <div id="fkList" class="space-y-2"></div>`;
    // Firmalar tablosunun hemen altına koy: sekmenin en acil işi bu.
    admin.insertBefore(card, admin.children[1] || null);
    return card;
}

async function renderFirmaKonumAdmin() {
    const wrap = fkKok();
    if (!wrap || !supabaseClient) return;
    const box = document.getElementById('fkList');
    const ozet = document.getElementById('fkOzet');
    box.innerHTML = '<p class="text-xs text-slate-400 italic">Yükleniyor...</p>';

    const { data, error } = await supabaseClient.rpc('firmalar_konum');
    if (error) {
        box.innerHTML = `<p class="text-xs text-red-500">Yüklenemedi: ${admEscape(error.message)}</p>
            <p class="text-[11px] text-slate-400 mt-1">firma-konum-admin.sql çalıştırıldı mı?</p>`;
        return;
    }
    _fkFirmalar = data || [];

    const eksik = _fkFirmalar.filter(f => !f.il).length;
    ozet.innerHTML = _fkFirmalar.length === 0
        ? '<p class="text-xs text-slate-400 italic">Kayıtlı firma yok.</p>'
        : (eksik
            ? `<div class="bg-red-50 border border-red-200 rounded-lg p-3">
                 <p class="text-xs font-black text-red-700">${eksik} firmanın konumu yok</p>
                 <p class="text-[11px] text-red-600 mt-0.5">Bu firmalar eşleştirmeye hiç girmiyor. Doldurulana kadar o bölgelerde yarışma başlamaz.</p>
               </div>`
            : `<div class="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                 <p class="text-xs font-black text-emerald-700">Tüm firmaların konumu tanımlı</p>
                 <p class="text-[11px] text-emerald-600 mt-0.5">${_fkFirmalar.length} firma eşleştirmeye giriyor.</p>
               </div>`);

    const iller = Object.keys(window.EPC_IL_VERIM || {}).sort((a, b) => a.localeCompare(b, 'tr'));
    box.innerHTML = _fkFirmalar.map(f => `
        <div class="border ${f.il ? 'border-slate-200' : 'border-red-300 bg-red-50/40'} rounded-lg p-3">
            <div class="flex items-center gap-2 flex-wrap mb-2">
                <strong class="text-sm text-slate-800">${admEscape(f.ad || 'Firma')}</strong>
                ${f.il
                    ? `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">${admEscape([f.ilce, f.il].filter(Boolean).join(' / '))}${f.bolge ? ' · ' + admEscape(f.bolge) : ''}</span>`
                    : '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">konum yok</span>'}
                ${f.banned ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-800 text-white">engelli</span>' : ''}
                <span class="text-[11px] text-slate-400">${f.basvuru || 0} başvuru</span>
            </div>
            <div class="flex items-end gap-2 flex-wrap">
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 mb-0.5">İl *</label>
                    <select id="fkIl_${f.id}" class="border border-slate-300 p-1.5 rounded-lg text-xs bg-white w-40">
                        <option value="">— Seçin —</option>
                        ${iller.map(i => `<option ${f.il === i ? 'selected' : ''}>${admEscape(i)}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 mb-0.5">İlçe</label>
                    <input id="fkIlce_${f.id}" value="${admEscape(f.ilce || '')}" class="border border-slate-300 p-1.5 rounded-lg text-xs w-36">
                </div>
                <button onclick="fkKaydet('${f.id}')" class="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">Kaydet</button>
                <span id="fkMsg_${f.id}" class="text-[11px]"></span>
            </div>
        </div>`).join('') || '<p class="text-xs text-slate-400 italic">Kayıtlı firma yok.</p>';
}

window.fkKaydet = async function (id) {
    const il = document.getElementById('fkIl_' + id)?.value || '';
    const ilce = (document.getElementById('fkIlce_' + id)?.value || '').trim();
    const msg = document.getElementById('fkMsg_' + id);
    const yaz = (t, kotu) => { if (msg) msg.innerHTML = `<span class="font-bold ${kotu ? 'text-red-600' : 'text-emerald-600'}">${admEscape(t)}</span>`; };
    if (!il) { yaz('İl seçin.', true); return; }

    yaz('Kaydediliyor…');
    try {
        const { data, error } = await supabaseClient.rpc('firma_konum_admin', {
            p_company_id: id, p_il: il, p_ilce: ilce || null
        });
        if (error) throw error;
        yaz('✓ ' + ((data && data.il) || il) + ((data && data.ilce) ? ' / ' + data.ilce : ''));
        await renderFirmaKonumAdmin();
    } catch (e) { yaz(e.message || String(e), true); }
};

// ============================================================================
// DAĞITIM ŞİRKETİ YÖNETİMİ (distribution_companies — yalnız admin)
// ============================================================================
let _discoAdmin = [];

function ensureDiscoSection() {
    if (document.getElementById('dcAdminRoot')) return document.getElementById('dcAdminRoot');
    const admin = document.getElementById('adminPaneCompanies') || document.getElementById('adminModule');
    if (!admin) return null;
    const card = document.createElement('div');
    card.id = 'dcAdminRoot';
    card.className = 'mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
    card.innerHTML = `
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 class="text-lg font-black text-slate-800">🔌 Dağıtım Şirketleri</h3>
            <button onclick="dcNew()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">+ Yeni Şirket</button>
        </div>
        <p class="text-xs text-slate-400 mb-3">Hem kurulumcu paneli hem ziyaretçinin "TEDAŞ Mevzuatı" sayfası buradan besleniyor. Verileri güncel tutun.</p>
        <div id="dcOzet"></div>
        <div id="dcList" class="space-y-2"></div>`;
    admin.appendChild(card);
    return card;
}

async function renderDiscoAdmin() {
    const wrap = ensureDiscoSection();
    if (!wrap || !supabaseClient) return;
    const box = document.getElementById('dcList');
    box.innerHTML = '<p class="text-xs text-slate-400 italic">Yükleniyor...</p>';
    const { data, error } = await supabaseClient.from('distribution_companies').select('*').order('sort_order');
    if (error) { box.innerHTML = `<p class="text-xs text-red-500">Yüklenemedi: ${error.message}</p>`; return; }
    _discoAdmin = data || [];
    box.innerHTML = _discoAdmin.map(d => `
        <div class="flex items-center justify-between gap-2 border border-slate-200 rounded-lg p-3">
            <div class="min-w-0">
                <strong class="text-sm text-slate-800">${admEscape(d.name)}</strong> ${d.abbr ? `<span class="text-[10px] text-slate-400 font-mono">${admEscape(d.abbr)}</span>` : ''} ${d.is_published ? '' : '<span class="text-[10px] text-amber-600 font-bold">(gizli)</span>'}
                <div class="text-[11px] text-slate-400 truncate">${admEscape(d.provinces)}</div>
            </div>
            <span class="flex gap-1 flex-shrink-0">
                <button onclick="dcEdit('${d.id}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Düzenle</button>
                <button onclick="dcDelete('${d.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Sil</button>
            </span>
        </div>`).join('') || '<p class="text-xs text-slate-400 italic">Henüz kayıt yok.</p>';
}

window.dcNew = () => openDiscoModal(null);
window.dcEdit = (id) => openDiscoModal(_discoAdmin.find(d => d.id === id));
function openDiscoModal(d) {
    const e = d || {};
    eduModal(`
        <h3 class="text-lg font-black text-slate-800 mb-4">${d ? 'Şirketi Düzenle' : 'Yeni Dağıtım Şirketi'}</h3>
        <div class="space-y-3">
            <div><label class="text-xs font-bold text-slate-600">Şirket adı</label><input id="dcName" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.name)}"></div>
            <div><label class="text-xs font-bold text-slate-600">Kısa ad (opsiyonel)</label><input id="dcAbbr" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.abbr)}"></div>
            <div><label class="text-xs font-bold text-slate-600">İller (virgülle ayır)</label><textarea id="dcProv" rows="2" class="w-full p-2 border border-slate-300 rounded-lg text-sm">${admEscape(e.provinces)}</textarea></div>
            <div class="flex gap-3">
                <div class="flex-1"><label class="text-xs font-bold text-slate-600">Telefon</label><input id="dcPhone" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.phone)}"></div>
                <div class="w-24"><label class="text-xs font-bold text-slate-600">Sıra</label><input id="dcOrder" type="number" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${e.sort_order ?? 0}"></div>
            </div>
            <div><label class="text-xs font-bold text-slate-600">Web sitesi</label><input id="dcWeb" class="w-full p-2 border border-slate-300 rounded-lg text-sm" value="${admEscape(e.website)}"></div>
            <div><label class="text-xs font-bold text-slate-600">Lisanssız üretim başvuru sayfası</label><input id="dcBasvuru" value="${admEscape(e.basvuru_url || '')}" placeholder="https://..." class="w-full p-2 border border-slate-300 rounded-lg text-sm"></div>
            <label class="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 cursor-pointer">
                <input type="checkbox" id="dcDogru" ${e.dogrulandi_mi ? 'checked' : ''} class="mt-0.5 w-4 h-4 shrink-0">
                <span class="text-xs text-amber-900 leading-relaxed"><b>Bu bilgileri şirketin resmi sitesinden teyit ettim.</b>
                İşaretlemezseniz ziyaretçiye "teyit edilmedi" uyarısıyla çıkar. 180 gün sonra kendiliğinden
                "tazelenmeli" durumuna döner — mevzuat ve şirket siteleri değişiyor.</span>
            </label>
            <label class="flex items-center gap-2 text-sm text-slate-600"><input id="dcPub" type="checkbox" ${(e.is_published !== false) ? 'checked' : ''}> Yayında</label>
        </div>
        <div class="flex gap-2 mt-5">
            <button onclick="eduCloseModal()" class="flex-1 bg-slate-100 text-slate-700 font-bold py-2 rounded-lg">İptal</button>
            <button onclick="dcSave('${d ? d.id : ''}')" class="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-lg">Kaydet</button>
        </div>`);
}
window.dcSave = async (id) => {
    const name = document.getElementById('dcName').value.trim();
    if (!name) { alert('Şirket adı gerekli.'); return; }
    const obj = {
        name,
        abbr: document.getElementById('dcAbbr').value.trim() || null,
        provinces: document.getElementById('dcProv').value.trim() || null,
        phone: document.getElementById('dcPhone').value.trim() || null,
        website: document.getElementById('dcWeb').value.trim() || null,
        basvuru_url: document.getElementById('dcBasvuru').value.trim() || null,
        sort_order: parseInt(document.getElementById('dcOrder').value) || 0,
        is_published: document.getElementById('dcPub').checked
    };
    // Teyit işareti: tarih ve kimin verdiği otomatik yazılır, elle girilmez.
    const _dogru = document.getElementById('dcDogru').checked;
    obj.dogrulandi_mi = _dogru;
    obj.dogrulama_tarihi = _dogru ? new Date().toISOString().slice(0, 10) : null;
    obj.dogrulayan = _dogru ? (window.currentUserProfile?.email || 'admin') : null;
    const { error } = id
        ? await supabaseClient.from('distribution_companies').update(obj).eq('id', id)
        : await supabaseClient.from('distribution_companies').insert([obj]);
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    eduCloseModal(); renderDiscoAdmin();
};
window.dcDelete = async (id) => {
    // Bu kayıt CRM'deki "Dağıtım Şirketi Bul" ekranını ve mevzuat belgelerini
    // besliyor; belge tablosu sirket_id üzerinden CASCADE bağlı. Silmenin
    // nereye dokunduğu yazılmadan onay istenmesi yanıltıcıydı.
    const _dc = (typeof _discoAdmin !== 'undefined' ? _discoAdmin : []).find(x => String(x.id) === String(id));
    if (!confirm(`"${(_dc && _dc.name) || 'Bu dağıtım şirketi'}" kaydı silinecek.\n\n· Kurulumcuların "Dağıtım Şirketi Bul" ekranından kalkar\n· Bu şirkete bağlı mevzuat belgeleri de silinir\n· Geri alınamaz\n\nDevam edilsin mi?`)) return;
    const { error } = await supabaseClient.from('distribution_companies').delete().eq('id', id);
    if (error) { alert('Silinemedi: ' + error.message); return; }
    renderDiscoAdmin();
};


// ============================================================================
// AYARLAR / PARAMETRE YÖNETİMİ (app_settings — yalnız admin)
// Hesaplayıcı, teklif ve batarya modülleri bu değerleri hesap anında okur.
// ============================================================================
const SETTINGS_SCHEMA = [
    // 81 il artık core.js'te (PVGIS). Bu değer yalnız il tanınmadığında yedek.
    { key: 'solarYield',    label: 'Ulusal ortalama üretim (kWh/kWp) — yedek', cat: 'Güneş Sistemi', step: '1',    def: 1406 },
    { key: 'roofM2PerKwp',  label: 'Çatı alanı (m²/kWp)',              cat: 'Güneş Sistemi', step: '0.1',  def: 5.5 },
    { key: 'kwpPerPanel',   label: 'Panel gücü (kWp/panel)',           cat: 'Güneş Sistemi', step: '0.01', def: 0.5 },
    // ⚠️ ARTIK HESAPLARDA KULLANILMIYOR. Kurulum bedeli tek yerden geliyor:
    // usdPerKwp × usdTry (core.js → epcTlPerKwp). Bu alan eski kurulumlar
    // bozulmasın diye duruyor; değiştirmek hiçbir hesabı etkilemez.
    { key: 'pricePerKwp',   label: 'Kurulum bedeli TL/kWp (KULLANILMIYOR)', cat: 'Eski / Kullanılmayan', step: '500',  def: 30000 },
    { key: 'co2PerKwh',     label: 'CO₂ katsayısı (kg/kWh)',           cat: 'Güneş Sistemi', step: '0.01', def: 0.45 },
    // ⚠️ 'tariffMesken' ile AYNI İŞİ yapıyordu ve ikisi ayrı ayrı
    // düzenlenebildiği için birbirinden ayrışıyordu. Artık her yer
    // tariffMesken okuyor; bu yalnız yedek.
    { key: 'tariff',        label: 'Elektrik tarifesi TL/kWh (yedek — mesken tarifesini kullanın)', cat: 'Eski / Kullanılmayan', step: '0.1',  def: 5.32 },

    // İl bazlı özgül üretim ÜSTÜNE YAZMA (kWh/kWp/yıl).
    // Boş bırakılırsa core.js'teki PVGIS değeri kullanılır — etiketteki sayı
    // o değerdir. Yalnızca yerinde ölçüm veya PVsyst raporu varsa doldurun;
    // tahminî bir sayı girmek PVGIS'ten daha iyi değil, daha kötüdür.
    // Eskiden yalnız 9 şehir için alan vardı; kalan 72 il düzeltilemiyordu.
    { key: 'solarYield_adana', label: 'Adana (1523 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_adıyaman', label: 'Adıyaman (1569 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_afyonkarahisar', label: 'Afyonkarahisar (1480 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_aksaray', label: 'Aksaray (1563 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_amasya', label: 'Amasya (1219 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_ankara', label: 'Ankara (1485 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_antalya', label: 'Antalya (1618 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_ardahan', label: 'Ardahan (1241 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_artvin', label: 'Artvin (1011 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_aydın', label: 'Aydın (1541 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_ağrı', label: 'Ağrı (1239 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_balıkesir', label: 'Balıkesir (1427 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_bartın', label: 'Bartın (1285 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_batman', label: 'Batman (1452 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_bayburt', label: 'Bayburt (1370 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_bilecik', label: 'Bilecik (1374 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_bingöl', label: 'Bingöl (1446 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_bitlis', label: 'Bitlis (1388 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_bolu', label: 'Bolu (1343 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_burdur', label: 'Burdur (1591 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_bursa', label: 'Bursa (1392 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_denizli', label: 'Denizli (1538 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_diyarbakır', label: 'Diyarbakır (1493 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_düzce', label: 'Düzce (1254 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_edirne', label: 'Edirne (1401 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_elazığ', label: 'Elazığ (1483 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_erzincan', label: 'Erzincan (1374 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_erzurum', label: 'Erzurum (1274 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_eskişehir', label: 'Eskişehir (1473 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_gaziantep', label: 'Gaziantep (1572 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_giresun', label: 'Giresun (1064 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_gümüşhane', label: 'Gümüşhane (1382 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_hakkari', label: 'Hakkari (1428 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_hatay', label: 'Hatay (1528 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_ısparta', label: 'Isparta (1550 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_ığdır', label: 'Iğdır (1312 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_istanbul', label: 'İstanbul (1354 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_izmir', label: 'İzmir (1595 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_kahramanmaraş', label: 'Kahramanmaraş (1511 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_karabük', label: 'Karabük (1327 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_karaman', label: 'Karaman (1579 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_kars', label: 'Kars (1284 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_kastamonu', label: 'Kastamonu (1307 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_kayseri', label: 'Kayseri (1380 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_kilis', label: 'Kilis (1574 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_kocaeli', label: 'Kocaeli (1246 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_konya', label: 'Konya (1572 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_kütahya', label: 'Kütahya (1424 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_kırklareli', label: 'Kırklareli (1380 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_kırıkkale', label: 'Kırıkkale (1457 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_kırşehir', label: 'Kırşehir (1483 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_malatya', label: 'Malatya (1515 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_manisa', label: 'Manisa (1556 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_mardin', label: 'Mardin (1547 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_mersin', label: 'Mersin (1595 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_muğla', label: 'Muğla (1568 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_muş', label: 'Muş (1383 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_nevşehir', label: 'Nevşehir (1511 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_niğde', label: 'Niğde (1579 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_ordu', label: 'Ordu (1086 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_osmaniye', label: 'Osmaniye (1486 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_rize', label: 'Rize (971 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_sakarya', label: 'Sakarya (1259 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_samsun', label: 'Samsun (1247 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_siirt', label: 'Siirt (1486 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_sinop', label: 'Sinop (1311 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_sivas', label: 'Sivas (1385 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_tekirdağ', label: 'Tekirdağ (1373 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_tokat', label: 'Tokat (1367 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_trabzon', label: 'Trabzon (889 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_tunceli', label: 'Tunceli (1389 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_uşak', label: 'Uşak (1580 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_van', label: 'Van (1421 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_yalova', label: 'Yalova (1323 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_yozgat', label: 'Yozgat (1474 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_zonguldak', label: 'Zonguldak (1242 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_çanakkale', label: 'Çanakkale (1381 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_çankırı', label: 'Çankırı (1410 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_çorum', label: 'Çorum (1376 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_şanlıurfa', label: 'Şanlıurfa (1579 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'solarYield_şırnak', label: 'Şırnak (1444 kWh/kWp)', cat: 'İl Verimleri (boş = PVGIS değeri)', step: '10', def: '' },
    { key: 'batteryDod',    label: 'Batarya deşarj derinliği (0-1)',   cat: 'Batarya',       step: '0.05', def: 0.9 },
    { key: 'inverterEff',   label: 'İnverter verimi (0-1)',            cat: 'Batarya',       step: '0.01', def: 0.95 },
    { key: 'batteryModule', label: 'Batarya ünite boyutu (kWh)',       cat: 'Batarya',       step: '1',    def: 5 },
    { key: 'inverterSurge', label: 'İnverter kalkış katsayısı',        cat: 'Batarya',       step: '0.1',  def: 1.3 },
    { key: 'tariffInflationPct', label: 'Yıllık elektrik zammı (%)',      cat: 'Güneş Sistemi', step: '1',   def: 25 },
    { key: 'panelDegradationPct',label: 'Panel yıpranması (%/yıl)',        cat: 'Güneş Sistemi', step: '0.1', def: 0.7 },
    { key: 'usdTry',            label: 'USD/TRY kuru (₺)',                cat: 'Fatura Analizi', step: '0.5', def: 48.43 },
    { key: 'usdPerKwp',         label: 'Panel + inverter ($/kWp)',        cat: 'Fatura Analizi', step: '50',  def: 1000 },
    { key: 'batteryUsdPerKwh',  label: 'Batarya ($/kWh)',                 cat: 'Fatura Analizi', step: '25',  def: 300 },
    // ⚠️ VERGİLER DAHİL birim fiyat girin (enerji + dağıtım + fon + BTV + KDV).
    // Faturanızdan "toplam tutar ÷ tüketilen kWh" ile bulabilirsiniz.
    { key: 'tariffMesken',         label: 'Mesken — 8 kWh/gün üstü (TL/kWh)',      cat: 'Fatura Analizi', step: '0.1', def: 5.32 },
    { key: 'tariffMeskenDusuk',    label: 'Mesken — 8 kWh/gün altı (TL/kWh)',      cat: 'Fatura Analizi', step: '0.1', def: 3.54 },
    { key: 'tariffTicarethane',    label: 'Ticarethane — 30 kWh/gün altı (TL/kWh)', cat: 'Fatura Analizi', step: '0.1', def: 6.63 },
    { key: 'tariffTicarethaneUst', label: 'Ticarethane — 30 kWh/gün üstü (TL/kWh)', cat: 'Fatura Analizi', step: '0.1', def: 7.37 },
    { key: 'tariffSanayi',         label: 'Sanayi tarifesi (TL/kWh)',              cat: 'Fatura Analizi', step: '0.1', def: 5.85 },
    { key: 'tariffTarimsal',       label: 'Tarımsal tarife (TL/kWh)',              cat: 'Fatura Analizi', step: '0.1', def: 5.30 },
    // Tarifeler doğrulanana kadar 0 kalır; 1 yapıldığında uyarı kalkar.
    { key: 'tariffDogrulandi',  label: 'Tarifeleri faturadan teyit ettim (1 = evet)', cat: 'Fatura Analizi', step: '1', def: 0 },
    { key: 'maint_clean_months',   label: 'Panel temizliği periyodu (ay)',  cat: 'Bakım Hatırlatma', step: '1', def: 6 },
    { key: 'maint_service_months', label: 'Yıllık bakım periyodu (ay)',      cat: 'Bakım Hatırlatma', step: '1', def: 12 }
];
let _settingsVals = {};

function ensureSettingsSection() {
    if (document.getElementById('settingsAdminRoot')) return document.getElementById('settingsAdminRoot');
    const admin = document.getElementById('adminPaneSettings') || document.getElementById('adminModule');
    if (!admin) return null;
    const card = document.createElement('div');
    card.id = 'settingsAdminRoot';
    card.className = 'mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
    card.innerHTML = `
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 class="text-lg font-black text-slate-800">⚙️ Ayarlar / Referans Değerler</h3>
            <button onclick="saveSettings()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg">Kaydet</button>
        </div>
        <p class="text-xs text-slate-400 mb-4">Hesaplayıcılar, teklif motoru ve batarya aracı bu değerleri kullanır. Değişiklikler kaydedildiğinde hemen geçerli olur.</p>
        <div id="settingsList"></div>`;
    admin.appendChild(card);
    return card;
}

async function renderSettingsAdmin() {
    const wrap = ensureSettingsSection();
    if (!wrap || !supabaseClient) return;
    const box = document.getElementById('settingsList');
    box.innerHTML = '<p class="text-xs text-slate-400 italic">Yükleniyor...</p>';
    const { data, error } = await supabaseClient.from('app_settings').select('key, value');
    if (error) { box.innerHTML = `<p class="text-xs text-red-500">Yüklenemedi: ${error.message}</p>`; return; }
    _settingsVals = {};
    (data || []).forEach(r => { _settingsVals[r.key] = Number(r.value); });

    // TARİFE UYARISI — "şimdilik herhangi bir değer olsun, sonra düzeltirim"
    // denen değerler sessizce yayına gitmesin diye. tariffDogrulandi 1
    // yapılana kadar bu şerit duruyor.
    const _tarifeTeyit = Number(_settingsVals.tariffDogrulandi) === 1;
    const tarifeUyari = _tarifeTeyit ? '' : `
        <div class="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-5">
            <p class="font-black text-amber-900 text-sm mb-1">⚠️ Elektrik tarifeleri henüz doğrulanmadı</p>
            <p class="text-xs text-amber-800 leading-relaxed">
                Enerji ve dağıtım bedelleri <b>EPDK'nın 4 Nisan 2026 resmi tarife tablosundan</b> alındı.
                Üzerine eklenen vergi katmanı (fon %1, BTV %5/%1, KDV %20) <b>hesaplanarak</b> bulundu;
                kendi faturanızla teyit edilmedi.
                Bu değerler <b>faturadan kWh türetiyor ve tasarrufu paraya çeviriyor</b> — yani
                hesaplayıcıların, fatura analizinin ve teklif fizibilitesinin altında duruyorlar.
            </p>
            <p class="text-xs text-amber-800 leading-relaxed mt-2">
                <b>Teyit edin:</b> kendi faturanızda <i>toplam tutar ÷ tüketilen kWh</i> hesaplayın
                ya da <a href="https://lisans.epdk.gov.tr/epvys-web/faces/pages/online/tarifeFatura/tarifeFatura.xhtml"
                target="_blank" rel="noopener noreferrer" class="underline font-bold">EPDK fatura hesaplama modülünü</a> kullanın.
                Güncel tablo: <a href="https://www.epdk.gov.tr/Detay/Icerik/3-1327/elektrik-faturalarina-esas-tarife-tablolari"
                target="_blank" rel="noopener noreferrer" class="underline font-bold">EPDK tarife tabloları</a>.
                Düzelttikten sonra <b>"Tarifeleri faturadan teyit ettim"</b> alanına <b>1</b> yazıp
                kaydedin; bu uyarı kalkar.
            </p>
        </div>`;

    const cats = [...new Set(SETTINGS_SCHEMA.map(s => s.cat))];
    box.innerHTML = tarifeUyari + cats.map(cat => `
        <div class="mb-4">
            <div class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">${cat}</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                ${SETTINGS_SCHEMA.filter(s => s.cat === cat).map(s => {
                    const val = (_settingsVals[s.key] !== undefined && !isNaN(_settingsVals[s.key])) ? _settingsVals[s.key] : s.def;
                    return `<div class="flex items-center gap-2">
                        <label class="text-xs text-slate-600 flex-1">${admEscape(s.label)}</label>
                        <input id="set_${s.key}" type="number" step="${s.step}" value="${val}" class="w-28 border border-slate-300 p-2 rounded-lg text-sm text-right">
                    </div>`;
                }).join('')}
            </div>
        </div>`).join('');
}

window.saveSettings = async function () {
    const rows = SETTINGS_SCHEMA.map(s => {
        const el = document.getElementById(`set_${s.key}`);
        const v = el ? parseFloat(el.value) : NaN;
        return { key: s.key, value: (isNaN(v) ? s.def : v), label: s.label, category: s.cat };
    });
    const { error } = await supabaseClient.from('app_settings').upsert(rows);
    if (error) { alert('Ayarlar kaydedilemedi: ' + error.message); return; }
    // Anında geçerli olsun (sayfa yenilemeden)
    if (window.EPC_SETTINGS) rows.forEach(r => { window.EPC_SETTINGS[r.key] = r.value; });
    alert('Ayarlar kaydedildi ve uygulandı.');
    renderSettingsAdmin();
};


// ============================================================================
// GENEL AŞAMA ETİKETLERİ (stage_labels — yalnız admin)
// CRM "Genel Aşama" adımlarının görünen adı ve açıklaması buradan düzenlenir.
// Anahtarlar sabittir; yalnız etiket + açıklama değişir.
// ============================================================================
const STAGE_KEYS = ['yeni_basvuru', 'arandi_gorusuldu', 'teklif_gonderildi', 'sozlesme_imzalandi', 'kurulum_basladi', 'resmi_surec', 'tamamlandi'];
let _stageVals = {};

function ensureStageSection() {
    if (document.getElementById('stageAdminRoot')) return document.getElementById('stageAdminRoot');
    const admin = document.getElementById('adminPaneContent') || document.getElementById('adminModule');
    if (!admin) return null;
    const card = document.createElement('div');
    card.id = 'stageAdminRoot';
    card.className = 'mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
    card.innerHTML = `
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 class="text-lg font-black text-slate-800">🚦 Genel Aşamalar</h3>
            <button onclick="saveStages()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-1.5 rounded-lg">Kaydet</button>
        </div>
        <p class="text-xs text-slate-400 mb-4">CRM müşteri kartındaki "Genel Aşama" menüsünde görünen adları ve açıklamaları düzenleyin. Sıra ve sayı sabittir.</p>
        <div id="stageList"></div>`;
    admin.appendChild(card);
    return card;
}

async function renderStageAdmin() {
    const wrap = ensureStageSection();
    if (!wrap || !supabaseClient) return;
    const box = document.getElementById('stageList');
    box.innerHTML = '<p class="text-xs text-slate-400 italic">Yükleniyor...</p>';
    const { data, error } = await supabaseClient.from('stage_labels').select('*');
    if (error) { box.innerHTML = `<p class="text-xs text-red-500">Yüklenemedi: ${error.message}</p>`; return; }
    _stageVals = {};
    (data || []).forEach(r => { _stageVals[r.key] = r; });

    box.innerHTML = STAGE_KEYS.map((k, i) => {
        const v = _stageVals[k] || {};
        const label = (v.label !== undefined && v.label !== null) ? v.label : '';
        const desc = (v.description !== undefined && v.description !== null) ? v.description : '';
        return `
            <div class="border border-slate-200 rounded-lg p-3 mb-2">
                <div class="text-[10px] text-slate-400 font-mono mb-1">${i + 1}. aşama · <span class="uppercase">${k}</span></div>
                <input id="stg_label_${k}" value="${admEscape(label)}" placeholder="Görünen ad" class="w-full border border-slate-300 p-2 rounded-lg text-sm mb-2 font-bold">
                <input id="stg_desc_${k}" value="${admEscape(desc)}" placeholder="Açıklama (kart içi/iç referans)" class="w-full border border-slate-300 p-2 rounded-lg text-xs text-slate-600">
            </div>`;
    }).join('');
}

window.saveStages = async function () {
    const rows = STAGE_KEYS.map((k, i) => ({
        key: k,
        label: (document.getElementById(`stg_label_${k}`).value || '').trim() || k,
        description: (document.getElementById(`stg_desc_${k}`).value || '').trim() || null,
        sort_order: i + 1
    }));
    const { error } = await supabaseClient.from('stage_labels').upsert(rows);
    if (error) { alert('Aşamalar kaydedilemedi: ' + error.message); return; }
    // Anında geçerli olsun
    if (window.EPC_STAGES) rows.forEach(r => { window.EPC_STAGES[r.key] = { label: r.label, description: r.description }; });
    alert('Aşamalar kaydedildi ve uygulandı.');
    renderStageAdmin();
};


// ============================================================================
// SEKMELİ PANEL YÖNETİMİ + GENEL BAKIŞ ÖZET KPI'LARI
// (index.html'deki .admin-tab-btn ve .admin-pane öğeleriyle çalışır.)
// ============================================================================
// --- SEKME GRUPLARI ---------------------------------------------------------
// 10 sekme tek sırada yan yanaydı: dar ekranda yatay kayıyor, geniş ekranda
// bile hangi işin nerede olduğu anlaşılmıyordu. Üç gruba ayrıldı; grup
// rozetleri alt sekmelerin bekleyen iş sayısını toplar, böylece kapalı
// gruptaki iş görünmez olmuyor.
const ADMIN_GRUPLAR = [
    { id: 'gunluk', ad: 'Günlük İş', ikon: '⚡', sekmeler: [
        { id: 'overview',    ad: '📊 Genel Bakış' },
        { id: 'ops',         ad: '📥 Operasyon' },
        { id: 'search',      ad: '🔍 Ara', init: 'adminSearchInit' },
        { id: 'erisim',      ad: '📣 Erişim', init: 'adminErisimInit' }
    ] },
    { id: 'uyeler', ad: 'Üyeler', ikon: '👥', sekmeler: [
        { id: 'companies',   ad: '🏢 Firmalar' },
        { id: 'consultants', ad: '🎯 Danışmanlar' },
        { id: 'suppliers',   ad: '📦 Tedarikçiler' },
        { id: 'subs',        ad: '💳 Abonelikler' }
    ] },
    { id: 'sistem', ad: 'Sistem', ikon: '⚙️', sekmeler: [
        { id: 'content',     ad: '📚 İçerik & Süreç' },
        { id: 'settings',    ad: '⚙️ Ayarlar' },
        { id: 'errors',      ad: '🐛 Hatalar', init: 'adminErrorsInit' }
    ] }
];
const ADMIN_SEKME_GRUBU = {};
ADMIN_GRUPLAR.forEach(g => g.sekmeler.forEach(t => { ADMIN_SEKME_GRUBU[t.id] = g.id; }));

let _admAktifSekme = 'overview';
const _admRozet = {};                 // sekme -> bekleyen iş sayısı

function admTabBarCiz() {
    const kutu = document.getElementById('adminTabBar');
    if (!kutu) return;
    const aktifGrup = ADMIN_SEKME_GRUBU[_admAktifSekme] || 'gunluk';

    const grupRozet = (g) => g.sekmeler.reduce((a, t) => a + (_admRozet[t.id] || 0), 0);
    const rozetHtml = (n, koyu) => n
        ? `<span class="ml-1.5 inline-block min-w-[18px] text-center px-1.5 py-0.5 rounded-full text-[10px] font-black ${koyu ? 'bg-white/25 text-white' : 'bg-red-100 text-red-700'}">${n}</span>` : '';

    const gruplar = ADMIN_GRUPLAR.map(g => {
        const on = g.id === aktifGrup;
        const n = grupRozet(g);
        return `<button type="button" onclick="adminShowGroup('${g.id}')" role="tab" aria-selected="${on}"
            class="adm-grup ${on ? 'adm-grup-on' : ''}">${g.ikon} ${g.ad}${rozetHtml(n, on)}</button>`;
    }).join('');

    const grup = ADMIN_GRUPLAR.find(g => g.id === aktifGrup) || ADMIN_GRUPLAR[0];
    const sekmeler = grup.sekmeler.map(t => {
        const on = t.id === _admAktifSekme;
        return `<button type="button" onclick="adminShowTab('${t.id}')" role="tab" aria-selected="${on}"
            data-tab="${t.id}" class="admin-tab-btn ${on ? 'admin-tab-on' : ''}">${t.ad}${rozetHtml(_admRozet[t.id] || 0, on)}</button>`;
    }).join('');

    kutu.innerHTML = `
        <div class="adm-grup-cubugu" role="tablist">${gruplar}</div>
        <div class="adm-sekme-cubugu" role="tablist">${sekmeler}</div>`;
}

// Gruba tıklanınca o grubun İLK sekmesi açılır.
window.adminShowGroup = function (gid) {
    const g = ADMIN_GRUPLAR.find(x => x.id === gid);
    if (g && g.sekmeler.length) window.adminShowTab(g.sekmeler[0].id);
};

window.adminShowTab = function (key) {
    _admAktifSekme = key;
    document.querySelectorAll('.admin-pane').forEach(p => p.classList.add('hidden'));
    const pane = document.getElementById('adminPane' + key.charAt(0).toUpperCase() + key.slice(1));
    if (pane) pane.classList.remove('hidden');
    admTabBarCiz();

    // Sekmenin ilk açılışta çalıştırması gereken kurulum varsa çağır.
    // Eskiden bu, sekme düğmesinin onclick'ine elle yazılıydı; yeni bir sekme
    // eklerken unutmak kolaydı.
    const t = ADMIN_GRUPLAR.flatMap(g => g.sekmeler).find(x => x.id === key);
    if (t && t.init && typeof window[t.init] === 'function') window[t.init]();
};

// Panel her açıldığında "Genel Bakış" sekmesiyle başlasın
document.getElementById('adminPanelCard')?.addEventListener('click', () => {
    if (typeof adminShowTab === 'function') adminShowTab('overview');
});

// Genel Bakış özet sayıları (fetchAdminData render'ından sonra çalışır)
function renderAdminStats() {
    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const countCards = (id) => { const b = document.getElementById(id); return b ? b.querySelectorAll(':scope > div').length : 0; };
    const companies = (typeof window.__admCompanyCount === 'number')
        ? window.__admCompanyCount
        : 0;   // eski #usersTableBody kaldırıldı; sayı __admCompanyCount'tan gelir
    setTxt('admStatCompanies', companies);
    setTxt('admStatLeads', countCards('adminLeadsList'));
    setTxt('admStatTickets', countCards('adminTicketsList'));
    let prospects = countCards('adminProspectsList');
    const c = document.getElementById('adminProspectsCount');
    if (c) { const m = (c.textContent || '').match(/\d+/); if (m) prospects = +m[0]; }
    setTxt('admStatProspects', prospects);
}


// ============================================================================
// DANIŞMAN BAŞVURULARI — admin onay akışı (adminPaneConsultants)
// ============================================================================
async function renderConsultantsAdmin() {
    const root = document.getElementById('admConsultantsOnay');
    if (!root || !supabaseClient) return;
    root.innerHTML = '<p class="text-slate-400 text-sm">Yükleniyor...</p>';
    let list = [];
    try {
        const { data, error } = await supabaseClient.from('consultants').select('*').order('updated_at', { ascending: false });
        if (error) throw error;
        list = data || [];
    } catch (e) {
        root.innerHTML = '<p class="text-red-500 text-sm">Danışmanlar yüklenemedi: ' + (e.message || e) + '</p>';
        return;
    }
    const badge = (s) => {
        const m = { draft: ['Taslak', 'bg-slate-100 text-slate-600'], pending: ['Onay Bekliyor', 'bg-amber-100 text-amber-800'], approved: ['Onaylı', 'bg-emerald-100 text-emerald-700'], rejected: ['Reddedildi', 'bg-red-100 text-red-700'] };
        const x = m[s] || m.draft;
        return '<span class="text-[10px] font-black px-2 py-1 rounded-full ' + x[1] + '">' + x[0] + '</span>';
    };
    const pending = list.filter(c => c.status === 'pending').length;
    root.innerHTML =
        '<div class="bg-white border border-slate-200 rounded-xl p-5">' +
            '<div class="flex items-center justify-between mb-4">' +
                '<h3 class="font-black text-lg text-slate-800">🎯 Danışman Başvuruları</h3>' +
                (pending ? '<span class="text-xs font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded-full">' + pending + ' onay bekliyor</span>' : '') +
            '</div>' +
            (list.length ? list.map(c =>
                '<div class="border border-slate-100 rounded-lg p-4 mb-2">' +
                    '<div class="flex items-start justify-between gap-3 flex-wrap">' +
                        '<div class="min-w-0">' +
                            '<div class="flex items-center gap-2 mb-1"><span class="font-black text-slate-800">' + admEscape(c.full_name || '—') + '</span> ' + badge(c.status) + '</div>' +
                            '<p class="text-xs text-slate-500">' + admEscape(c.title || '') + '</p>' +
                            '<p class="text-[11px] text-slate-400 mt-1">' + admEscape(c.email || '') + ' · ' + (c.completed_jobs || 0) + ' iş · ' + (c.expertise ? admEscape(c.expertise) : 'etiket yok') + '</p>' +
                            (c.bio ? '<p class="text-xs text-slate-600 mt-2">' + admEscape(c.bio) + '</p>' : '') +
                            (c.reject_reason ? '<p class="text-[11px] text-red-500 mt-1">Ret gerekçesi: ' + admEscape(c.reject_reason) + '</p>' : '') +
                        '</div>' +
                        '<div class="flex gap-2 shrink-0">' +
                            (c.status !== 'approved'
                                ? '<button onclick="adminApproveConsultant(\'' + c.id + '\')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">Onayla</button>'
                                : '<button onclick="adminUnpublishConsultant(\'' + c.id + '\')" class="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg">Yayından Kaldır</button>') +
                            (c.status !== 'rejected'
                                ? '<button onclick="adminRejectConsultant(\'' + c.id + '\')" class="bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold px-3 py-1.5 rounded-lg">Reddet</button>'
                                : '') +
                        '</div>' +
                    '</div>' +
                '</div>').join('') : '<p class="text-sm text-slate-400">Henüz danışman kaydı yok.</p>') +
        '</div>';
}

async function _consUpdate(id, patch) {
    patch.updated_at = new Date().toISOString();
    const { error } = await supabaseClient.from('consultants').update(patch).eq('id', id);
    if (error) { alert('İşlem başarısız: ' + error.message); return false; }
    await renderConsultantsAdmin();
    return true;
}
window.adminApproveConsultant = (id) => _consUpdate(id, { status: 'approved', reject_reason: null });
window.adminUnpublishConsultant = (id) => _consUpdate(id, { status: 'pending' });
window.adminRejectConsultant = (id) => {
    const reason = prompt('Ret gerekçesi (danışmana gösterilecek):', '');
    if (reason === null) return;
    _consUpdate(id, { status: 'rejected', reject_reason: reason });
};

// ============================================================================
// ABONELİKLER — admin: firma & danışman abonelik durumu + aktifleştir/uzat
// ============================================================================
let _allSubs = [];
async function renderSubscriptions() {
    const root = document.getElementById('admSubsRoot');
    if (!root || !supabaseClient) return;
    root.innerHTML = '<p class="text-slate-400 text-sm">Yükleniyor...</p>';
    try {
        const [r1, r2] = await Promise.all([
            supabaseClient.from('companies').select('id, name, sub_status, sub_ends_at, banned, ban_reason'),
            supabaseClient.from('consultants').select('id, full_name, email, sub_status, sub_ends_at, banned, ban_reason')
        ]);
        if (r1.error) throw r1.error; if (r2.error) throw r2.error;
        _allSubs = [
            ...(r1.data || []).map(x => ({ table: 'companies', id: x.id, name: x.name || '(firma)', email: '', type: 'Firma', sub_status: x.sub_status, sub_ends_at: x.sub_ends_at, banned: !!x.banned, ban_reason: x.ban_reason })),
            ...(r2.data || []).map(x => ({ table: 'consultants', id: x.id, name: x.full_name || '(danışman)', email: x.email || '', type: 'Danışman', sub_status: x.sub_status, sub_ends_at: x.sub_ends_at, banned: !!x.banned, ban_reason: x.ban_reason }))
        ];
    } catch (e) { root.innerHTML = `<p class="text-red-500 text-sm">Yüklenemedi: ${e.message}</p>`; return; }
    const info = (s) => {
        const end = s.sub_ends_at ? new Date(s.sub_ends_at) : null;
        const days = end ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null;
        const expired = days !== null && days < 0;
        let cls = 'bg-amber-100 text-amber-800', label = 'Deneme';
        if (s.banned) return { days, expired, cls: 'bg-red-600 text-white', label: '⛔ ENGELLİ', end };
        if (expired) { cls = 'bg-red-100 text-red-700'; label = 'Süresi Doldu'; }
        else if (s.sub_status === 'active') { cls = 'bg-emerald-100 text-emerald-700'; label = 'Aktif'; }
        return { days, expired, cls, label, end };
    };
    const active = _allSubs.filter(s => !info(s).expired && s.sub_status === 'active').length;
    const trial = _allSubs.filter(s => !info(s).expired && s.sub_status !== 'active').length;
    const expiredN = _allSubs.filter(s => info(s).expired).length;
    _allSubs.sort((a, b) => new Date(a.sub_ends_at || 0) - new Date(b.sub_ends_at || 0));
    root.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-xl p-5">
            <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 class="font-black text-lg text-slate-800">💳 Abonelikler <span class="text-sm font-normal text-slate-400">· ${Object.values(window.EPC_PRICING).map(f => f.ad + ' $' + f.usd).join(' · ')}/ay · KDV hariç</span></h3>
                <div class="flex gap-2 text-[11px] font-bold flex-wrap">
                    <span class="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1">${active} Aktif</span>
                    <span class="bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-3 py-1">${trial} Deneme</span>
                    <span class="bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1">${expiredN} Süresi Doldu</span>
                </div>
            </div>
            <p class="text-xs text-slate-400 mb-4">Havale/EFT geldikçe hesabı <b>+1 Ay</b> ile aktifleştir/uzat. Deneme 7 gündür. (En yakın biten üstte.)</p>
            ${_allSubs.length ? _allSubs.map(s => { const i = info(s); return `
                <div class="border border-slate-100 rounded-lg p-3 mb-2 flex items-center justify-between gap-3 flex-wrap">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-slate-800">${admEscape(s.name)}</span><span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">${s.type}</span><span class="text-[10px] font-black px-2 py-0.5 rounded-full ${i.cls}">${i.label}</span></div>
                        <div class="text-[11px] text-slate-400 mt-0.5">${s.banned && s.ban_reason ? '<span class="text-red-600 font-bold">Gerekçe: ' + admEscape(s.ban_reason) + '</span> · ' : ''}${s.email ? admEscape(s.email) + ' · ' : ''}Bitiş: ${i.end ? i.end.toLocaleDateString('tr-TR') : '—'}${i.days !== null ? (i.days >= 0 ? ' · ' + i.days + ' gün kaldı' : ' · ' + Math.abs(i.days) + ' gün geçti') : ''}</div>
                    </div>
                    <div class="flex gap-1.5 shrink-0">
                        <button onclick="adminExtendSub('${s.table}','${s.id}',1)" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">+1 Ay</button>
                        <button onclick="adminExtendSub('${s.table}','${s.id}',3)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg">+3 Ay</button>
                        <button onclick="adminSubManage('${s.table}','${s.id}')" class="bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg">⚙️ Ayarla</button>
                        ${s.banned
                            ? `<button onclick="adminUnban('${s.table}','${s.id}')" class="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-lg">Engeli Kaldır</button>`
                            : `<button onclick="adminBan('${s.table}','${s.id}')" class="bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold px-3 py-1.5 rounded-lg">⛔ Engelle</button>`}
                    </div>
                </div>`; }).join('') : '<p class="text-sm text-slate-400">Kayıt yok.</p>'}
        </div>`;
}
window.adminExtendSub = async function (table, id, months) {
    const item = _allSubs.find(x => x.table === table && x.id === id);
    let base = Date.now();
    if (item && item.sub_ends_at) { const e = new Date(item.sub_ends_at).getTime(); if (e > base) base = e; }
    const d = new Date(base); d.setMonth(d.getMonth() + months);
    const { error } = await supabaseClient.from(table).update({ sub_ends_at: d.toISOString(), sub_status: 'active' }).eq('id', id);
    if (error) { alert('İşlem başarısız: ' + error.message); return; }
    await renderSubscriptions();
};

// Abonelik süresi ayarla / geri al / sonlandır (yanlış uzatmaları düzeltmek için)
window.adminSubManage = function (table, id) {
    const s = _allSubs.find(x => x.table === table && x.id === id);
    if (!s) return;
    const cur = s.sub_ends_at ? new Date(s.sub_ends_at) : new Date();
    const iso = cur.toISOString().split('T')[0];
    let m = document.getElementById('subManageModal');
    if (!m) { m = document.createElement('div'); m.id = 'subManageModal'; document.body.appendChild(m); m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }); }
    m.className = 'fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4';
    m.innerHTML = `<div class="bg-white rounded-2xl max-w-sm w-full p-6">
        <div class="flex items-center justify-between mb-2"><h3 class="font-black text-slate-800">Abonelik Ayarla</h3><button onclick="document.getElementById('subManageModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button></div>
        <p class="text-sm text-slate-500 mb-4">${admEscape(s.name)} <span class="text-xs text-slate-400">(${s.type})</span></p>
        <label class="block text-xs font-bold text-slate-600 mb-1">Bitiş tarihi</label>
        <input type="date" id="subMngDate" value="${iso}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm mb-3">
        <button onclick="adminSubSetDate('${table}','${id}')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg mb-3">Tarihi Kaydet</button>
        <div class="flex gap-2">
            <button onclick="adminSubReduce('${table}','${id}',1)" class="flex-1 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-xs py-2 rounded-lg">− 1 Ay Geri Al</button>
            <button onclick="adminSubEnd('${table}','${id}')" class="flex-1 bg-red-100 hover:bg-red-200 text-red-700 font-bold text-xs py-2 rounded-lg">Hemen Sonlandır</button>
        </div>
    </div>`;
    m.classList.remove('hidden');
};
async function _subUpdate(table, id, isoDate) {
    const future = new Date(isoDate).getTime() > Date.now();
    const { error } = await supabaseClient.from(table).update({ sub_ends_at: isoDate, sub_status: future ? 'active' : 'trial' }).eq('id', id);
    if (error) { alert('İşlem başarısız: ' + error.message); return; }
    const mm = document.getElementById('subManageModal'); if (mm) mm.classList.add('hidden');
    await renderSubscriptions();
}
window.adminSubSetDate = function (table, id) {
    const v = document.getElementById('subMngDate').value;
    if (!v) { alert('Tarih seçin.'); return; }
    _subUpdate(table, id, new Date(v + 'T23:59:59').toISOString());
};
window.adminSubReduce = function (table, id, months) {
    const s = _allSubs.find(x => x.table === table && x.id === id);
    const base = s && s.sub_ends_at ? new Date(s.sub_ends_at) : new Date();
    base.setMonth(base.getMonth() - months);
    _subUpdate(table, id, base.toISOString());
};
window.adminSubEnd = function (table, id) {
    if (!confirm('Bu aboneliği hemen sonlandırmak (süresini bugüne çekmek) istediğinize emin misiniz?')) return;
    _subUpdate(table, id, new Date(Date.now() - 60000).toISOString());
};

// ============================================================================
// AKSİYON KUYRUĞU — Genel Bakış'ın üstünde "şu an neye bakmalıyım?" listesi
// Mevcut render fonksiyonlarına dokunmaz; kendi hafif sorgularını yapar.
// ============================================================================
async function renderActionQueue() {
    const box = document.getElementById('admActionQueue');
    if (!box || !supabaseClient) return;
    box.innerHTML = '<div class="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-400">Aksiyon kuyruğu yükleniyor...</div>';

    const rows = [];      // [ikon, başlık, sayı, sekme, renk]
    let hot = [];
    // Kontroller tek tek try/catch içinde. Hepsi sessizce yutulunca sorgular
    // patlasa bile ekranda "Bekleyen aksiyon yok ✅" yazıyordu: admin her
    // şeyin temiz olduğunu sanıyordu. Artık başarısız kontroller sayılıyor.
    const basarisiz = [];

    // 1) Onay bekleyen danışmanlar
    try {
        const { data } = await supabaseClient.from('consultants').select('id').eq('status', 'pending');
        if (data && data.length) rows.push(['📝', 'Danışman onay bekliyor', data.length, 'consultants', 'bg-amber-100 text-amber-800']);
    } catch (e) { basarisiz.push('danışman onayları'); }

    // 2) Abonelik durumu (renderSubscriptions'ın yüklediği veriden)
    try {
        if (typeof _allSubs !== 'undefined' && _allSubs && _allSubs.length) {
            const now = Date.now(), DAY = 86400000;
            let expired = 0, soon = 0;
            _allSubs.forEach(s => {
                if (!s.sub_ends_at) return;
                const d = Math.ceil((new Date(s.sub_ends_at).getTime() - now) / DAY);
                if (d < 0) expired++; else if (d <= 7) soon++;
            });
            if (expired) rows.push(['⛔', 'Aboneliği dolmuş hesap', expired, 'subs', 'bg-red-100 text-red-700']);
            if (soon)    rows.push(['⏳', '7 gün içinde bitecek abonelik', soon, 'subs', 'bg-amber-100 text-amber-800']);
        }
    } catch (e) { basarisiz.push('abonelikler'); }

    // 3) Firmaya atanmamış başvurular
    try {
        const { data } = await supabaseClient.from('leads').select('id').is('company_id', null);
        if (data && data.length) rows.push(['📥', 'Firmaya atanmamış başvuru', data.length, 'ops', 'bg-blue-100 text-blue-700']);
    } catch (e) { basarisiz.push('atanmamış başvurular'); }

    // 4) Sıcak potansiyel müşteriler (mevcut puanlama ile)
    try {
        const { data } = await supabaseClient.from('prospects').select('*').order('created_at', { ascending: false }).limit(120);
        if (data && data.length && typeof prospectScore === 'function') {
            hot = data.map(p => Object.assign({}, p, { _s: prospectScore(p).total })).filter(p => p._s >= 70).sort((a, b) => b._s - a._s);
            if (hot.length) rows.push(['🔥', 'Sıcak potansiyel müşteri', hot.length, 'ops', 'bg-red-100 text-red-700']);
        }
    } catch (e) { basarisiz.push('potansiyel müşteriler'); }

    // 5) Doğrulanmamış tarife — kuyruğa düşsün ki admin panele girer girmez görsün.
    //    "Sonra düzeltirim" denen ayar, düzeltilene kadar burada durur.
    try {
        const s = window.EPC_SETTINGS || {};
        if (Number(s.tariffDogrulandi) !== 1) {
            rows.push(['⚡', 'Elektrik tarifeleri doğrulanmadı (tüm hesapları etkiler)', 1, 'settings', 'bg-amber-100 text-amber-800']);
        }
    } catch (e) {}

    // sekme rozetleri — aynı sayılardan beslenir, ek sorgu yok
    const byTab = {};
    rows.forEach(r => { byTab[r[3]] = (byTab[r[3]] || 0) + r[2]; });
    ['consultants', 'subs', 'ops', 'companies', 'content', 'settings'].forEach(t => setTabBadge(t, byTab[t] || 0));

    const uyariHtml = basarisiz.length ? `
        <div class="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 mb-3 text-xs">
            <b>Kontrol edilemedi:</b> ${admEscape(basarisiz.join(', '))}. Bu kuyruklar
            <b>okunamadı</b> — aşağıdaki liste eksik olabilir, "temiz" diye yorumlamayın.
        </div>` : '';

    const total = rows.reduce((s, r) => s + r[2], 0);
    if (!total) {
        box.innerHTML = uyariHtml + (basarisiz.length
            ? '<div class="bg-white border border-slate-200 rounded-xl p-5 text-center text-sm text-slate-500">Okunabilen kuyruklarda bekleyen iş yok.</div>'
            : '<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center"><div class="text-2xl mb-1">✅</div><p class="font-black text-emerald-800">Bekleyen aksiyon yok</p><p class="text-xs text-emerald-700/70 mt-0.5">Onay, abonelik ve atama kuyrukları temiz.</p></div>');
        return;
    }

    const hotHtml = hot.length ? `
        <div class="border-t border-slate-100 mt-3 pt-3">
            <p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">🔥 En sıcak 3 aday</p>
            ${hot.slice(0, 3).map(p => `
                <div class="flex items-center justify-between gap-3 py-1.5">
                    <span class="min-w-0">
                        <span class="block text-sm font-bold text-slate-700 truncate">${admEscape(p.full_name) || '(isim yok)'}</span>
                        <span class="block text-[11px] text-slate-400">${admEscape(p.phone || p.email || '')}</span>
                    </span>
                    <span class="text-[10px] font-black px-2 py-1 rounded-full bg-red-100 text-red-700 shrink-0">${p._s}/100</span>
                </div>`).join('')}
        </div>` : '';

    box.innerHTML = uyariHtml + `
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 class="font-black text-slate-800">⚡ Aksiyon Kuyruğu <span class="text-slate-400">(${total})</span></h3>
                <span class="text-[11px] text-slate-400">Önce bunlara bakın</span>
            </div>
            <div class="space-y-1.5">
                ${rows.map(r => `
                    <button onclick="adminShowTab('${r[3]}')" class="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition text-left">
                        <span class="flex items-center gap-3 min-w-0">
                            <span class="text-lg shrink-0">${r[0]}</span>
                            <span class="text-sm font-bold text-slate-700 truncate">${r[1]}</span>
                        </span>
                        <span class="flex items-center gap-2 shrink-0">
                            <span class="text-[11px] font-black px-2.5 py-1 rounded-full ${r[4]}">${r[2]}</span>
                            <span class="text-slate-300 text-sm">→</span>
                        </span>
                    </button>`).join('')}
            </div>
            ${hotHtml}
        </div>`;
}
window.renderActionQueue = renderActionQueue;


// Sekme üzerindeki bekleyen-iş rozeti (adminShowTab yalnız className yazar, innerHTML'e dokunmaz)
// Rozet artık doğrudan DOM'a yazılmıyor: sayıyı sözlüğe koyup çubuğu yeniden
// çiziyoruz. Böylece kapalı gruptaki sekmenin rozeti de GRUP başlığında
// toplanıp görünüyor — eskiden başka gruptaki bekleyen iş fark edilmiyordu.
function setTabBadge(tab, n) {
    _admRozet[tab] = Number(n) || 0;
    admTabBarCiz();
}
window.setTabBadge = setTabBadge;


// ---------------------------------------------------------------- ENGELLEME
window.adminBan = async function (table, id) {
    const s = _allSubs.find(x => x.table === table && x.id === id);
    const reason = window.prompt('Engelleme gerekçesi (kullanıcıya gösterilecek):', '');
    if (reason === null) return;
    if (!String(reason).trim()) { alert('Gerekçe zorunludur.'); return; }
    if (!confirm(`"${s ? s.name : ''}" hesabı engellenecek ve giriş yapamayacak. Onaylıyor musunuz?`)) return;
    try {
        const { error } = await supabaseClient.from(table)
            .update({ banned: true, ban_reason: String(reason).trim(), banned_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        await renderSubscriptions();
    } catch (e) { alert('Engellenemedi: ' + (e.message || e)); }
};

window.adminUnban = async function (table, id) {
    if (!confirm('Bu hesabın engeli kaldırılacak. Onaylıyor musunuz?')) return;
    try {
        const { error } = await supabaseClient.from(table)
            .update({ banned: false, ban_reason: null, banned_at: null }).eq('id', id);
        if (error) throw error;
        await renderSubscriptions();
    } catch (e) { alert('İşlem başarısız: ' + (e.message || e)); }
};

// ============================================================================
// GLOBAL ARAMA + TOPLU İŞLEM  (yalnız admin)
// Çalışan fetchAdminData'ya dokunmaz; verileri bağımsız çeker, tek indekste arar.
// ============================================================================
(function () {
    let _idx = [];          // birleşik arama indeksi
    let _loaded = false;
    let _filter = 'all';
    let _sel = new Set();    // seçili lead id'leri (toplu atama)
    let _companies = [];

    const esc = (v) => (typeof admEscape === 'function' ? admEscape(v) : String(v == null ? '' : v));
    const low = (v) => String(v == null ? '' : v).toLocaleLowerCase('tr');

    // Tailwind Play CDN dinamik (string-birleşimi) sınıfları GÖREMEZ; tam sınıf adları sabit yazılır.
    const TYPE_META = {
        lead:       { label: 'Başvuru',    icon: '📥', badge: 'bg-emerald-100 text-emerald-700', hov: 'hover:border-emerald-300', tab: 'ops' },
        service:    { label: 'Servis',     icon: '🔧', badge: 'bg-red-100 text-red-700',         hov: 'hover:border-red-300',     tab: 'ops' },
        prospect:   { label: 'Potansiyel', icon: '🌱', badge: 'bg-amber-100 text-amber-700',     hov: 'hover:border-amber-300',   tab: 'ops' },
        user:       { label: 'Kullanıcı',  icon: '👤', badge: 'bg-slate-200 text-slate-700',     hov: 'hover:border-slate-400',   tab: 'companies' },
        consultant: { label: 'Danışman',   icon: '🎯', badge: 'bg-indigo-100 text-indigo-700',   hov: 'hover:border-indigo-300',  tab: 'consultants' }
    };

    window.adminSearchInit = async function () {
        if (_loaded) return;
        await loadIndex();
    };
    window.adminSearchReload = async function () { _loaded = false; _sel.clear(); await loadIndex(); adminSearchRun(); };

    async function loadIndex() {
        const box = document.getElementById('admSearchResults');
        if (box) box.innerHTML = '<p class="text-sm text-slate-400 text-center py-10">Veriler yükleniyor...</p>';
        _idx = [];
        if (!supabaseClient) return;

        // Firmalar (hem indeks hem toplu atama açılırı için)
        try { const { data } = await supabaseClient.from('companies').select('id, name').order('name'); _companies = data || []; } catch (e) { _companies = []; }
        const compName = {}; _companies.forEach(c => compName[c.id] = c.name);

        const pull = async (table, sel) => { try { const { data } = await supabaseClient.from(table).select(sel); return data || []; } catch (e) { return []; } };

        const [leads, srv, prospects, profiles, consultants] = await Promise.all([
            pull('leads', '*'),
            pull('service_requests', '*'),
            pull('prospects', '*').catch(() => []),
            pull('profiles', '*, companies(name)'),
            pull('consultants', '*').catch(() => [])
        ]);

        leads.forEach(l => _idx.push({
            type: 'lead', id: l.id, title: l.full_name, sub: (compName[l.company_id] ? '→ ' + compName[l.company_id] : 'Havuzda'),
            code: l.tracking_code, phone: l.phone, email: l.email, addr: l.address, notes: l.notes,
            assignable: !l.company_id, created: l.created_at, raw: l
        }));
        srv.forEach(t => _idx.push({
            type: 'service', id: t.id, title: t.full_name, sub: 'Durum: ' + (t.status || '-'),
            code: t.tracking_code, phone: t.phone, email: t.email, addr: t.address, notes: t.problem_desc,
            created: t.created_at, raw: t
        }));
        prospects.forEach(p => _idx.push({
            type: 'prospect', id: p.id, title: p.full_name, sub: 'Kaynak: ' + (p.source || '-'),
            phone: p.phone, email: p.email, notes: p.status, created: p.created_at, raw: p
        }));
        profiles.forEach(u => _idx.push({
            type: 'user', id: u.id, title: ((u.first_name || '') + ' ' + (u.last_name || '')).trim() || u.email,
            sub: (u.companies && u.companies.name ? u.companies.name + ' · ' : '') + (u.role || ''),
            phone: u.phone, email: u.email, created: u.created_at, raw: u
        }));
        consultants.forEach(c => _idx.push({
            type: 'consultant', id: c.id, title: c.full_name || c.name || c.email,
            sub: 'Durum: ' + (c.status || '-'), phone: c.phone, email: c.email, created: c.created_at, raw: c
        }));

        _loaded = true;
        // toplu atama firma açılırı
        const csel = document.getElementById('admBulkCompany');
        if (csel) csel.innerHTML = '<option value="">Firma seçin...</option>' + _companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    }

    window.adminSearchFilter = function (f) {
        _filter = f;
        document.querySelectorAll('.admSearchChip').forEach(b => {
            const on = b.getAttribute('data-f') === f;
            b.className = 'admSearchChip text-xs font-bold px-3 py-1.5 rounded-full ' + (on ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600');
        });
        adminSearchRun();
    };

    window.adminSearchRun = function () {
        const box = document.getElementById('admSearchResults');
        const q = low((document.getElementById('admSearchInput') || {}).value).trim();
        if (!box) return;
        if (!_loaded) { box.innerHTML = '<p class="text-sm text-slate-400 text-center py-10">Yükleniyor...</p>'; return; }

        let rows = _idx;
        if (_filter !== 'all') rows = rows.filter(r => r.type === _filter);
        if (q) {
            const terms = q.split(/\s+/).filter(Boolean);
            rows = rows.filter(r => {
                const hay = low([r.title, r.sub, r.code, r.phone, r.email, r.addr, r.notes].join(' '));
                return terms.every(t => hay.includes(t));
            });
        }
        // en yeni önce
        rows = rows.slice().sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));

        const total = rows.length;
        rows = rows.slice(0, 60); // performans: ilk 60

        if (!total) { box.innerHTML = `<p class="text-sm text-slate-400 text-center py-10">Eşleşen kayıt yok${q ? ' — "' + esc(q) + '"' : ''}.</p>`; updateBulkBar(); return; }

        box.innerHTML = `<p class="text-xs text-slate-400 px-1">${total} sonuç${total > 60 ? ' (ilk 60 gösteriliyor, aramayı daraltın)' : ''}</p>` + rows.map(rowHtml).join('');
        updateBulkBar();
    };

    function rowHtml(r) {
        const m = TYPE_META[r.type];
        const checkbox = (r.type === 'lead' && r.assignable)
            ? `<input type="checkbox" onclick="event.stopPropagation()" onchange="adminSearchToggle('${esc(r.id)}', this.checked)" ${_sel.has(r.id) ? 'checked' : ''} class="w-4 h-4 rounded shrink-0 mt-1" title="Toplu atama için seç">`
            : `<span class="w-4 shrink-0"></span>`;
        const bits = [r.phone && '📞 ' + esc(r.phone), r.email && '✉️ ' + esc(r.email), r.code && '🔖 ' + esc(r.code), r.addr && '📍 ' + esc(r.addr)].filter(Boolean).join('  ·  ');
        const dt = r.created ? new Date(r.created).toLocaleDateString('tr-TR') : '';
        return `<div class="flex items-start gap-3 bg-white border border-slate-200 rounded-xl p-3 ${m.hov} hover:shadow-sm transition cursor-pointer" onclick="adminSearchGoto('${r.type}')">
            ${checkbox}
            <span class="text-lg shrink-0">${m.icon}</span>
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-black text-slate-800 text-sm">${esc(r.title) || '(isimsiz)'}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${m.badge}">${m.label}</span>
                    ${r.sub ? `<span class="text-[11px] text-slate-400">${esc(r.sub)}</span>` : ''}
                </div>
                ${bits ? `<p class="text-[11px] text-slate-500 mt-1 truncate">${bits}</p>` : ''}
            </div>
            <span class="text-[10px] text-slate-400 whitespace-nowrap shrink-0">${dt}</span>
        </div>`;
    }

    window.adminSearchGoto = function (type) {
        const m = TYPE_META[type]; if (m && typeof adminShowTab === 'function') adminShowTab(m.tab);
    };

    window.adminSearchToggle = function (id, on) {
        if (on) _sel.add(id); else _sel.delete(id);
        updateBulkBar();
    };
    window.adminSearchClearSel = function () { _sel.clear(); adminSearchRun(); };

    function updateBulkBar() {
        const bar = document.getElementById('admBulkBar'), cnt = document.getElementById('admBulkCount');
        if (!bar) return;
        // seçili ama artık listede olmayanları koru; sadece sayaç güncelle
        if (cnt) cnt.textContent = _sel.size;
        bar.classList.toggle('hidden', _sel.size === 0);
    }

    window.adminBulkAssign = async function () {
        const sel = document.getElementById('admBulkCompany');
        const companyId = sel ? sel.value : '';
        if (!companyId) { alert('Lütfen atanacak firmayı seçin.'); return; }
        if (!_sel.size) return;
        const ids = [..._sel];
        const cname = _companies.find(c => String(c.id) === String(companyId));
        if (!confirm(`${ids.length} başvuru "${cname ? cname.name : 'seçili firma'}" firmasına atanacak. Onaylıyor musunuz?`)) return;

        // ⚠️ Yarışmadaki kayıt toplu atamaya KARIŞTIRILMAZ. Doğrudan company_id
        // yazmak lead_assignments'ı 'davet'te bırakır, kaybeden firmalara
        // bildirim gitmez. Bunlar tek tek, uyarıyla atanmalı.
        let yarismalilar = [];
        try {
            const { data } = await supabaseClient.from('lead_assignments')
                .select('lead_id').in('lead_id', ids);
            yarismalilar = [...new Set((data || []).map(r => r.lead_id))];
        } catch (e) { /* tablo yoksa eski davranış */ }

        const temiz = ids.filter(id => !yarismalilar.includes(id));
        if (yarismalilar.length && !temiz.length) {
            alert('Seçtiğiniz kayıtların hepsi firmaların teklif yarışında.\n\nBunları Operasyon sekmesinden tek tek atayın; orada ne olacağı açıklanıyor.');
            return;
        }
        if (yarismalilar.length) {
            if (!confirm(`${yarismalilar.length} kayıt firmaların teklif yarışında ve toplu atamaya DAHİL EDİLMEYECEK.\n\nKalan ${temiz.length} kayıt atanacak. Devam edilsin mi?`)) return;
        }

        try {
            const { error } = await supabaseClient.from('leads').update({ company_id: companyId }).in('id', temiz);
            if (error) throw error;
            // indeksten güncelle: bu leadler artık atanmış
            _idx.forEach(r => { if (r.type === 'lead' && temiz.includes(r.id)) { r.assignable = false; r.sub = '→ ' + (cname ? cname.name : ''); r.raw.company_id = companyId; } });
            _sel.clear();
            adminSearchRun();
            alert(`✅ ${temiz.length} başvuru firmaya atandı.` + (yarismalilar.length ? `\n${yarismalilar.length} yarışmadaki kayıt atlandı.` : ''));
            // Operasyon sekmesindeki havuz da güncellensin
            if (typeof fetchAdminData === 'function') fetchAdminData();
        } catch (err) {
            alert('Atama başarısız: ' + (err.message || err));
        }
    };
})();

// ============================================================================
// HATA KAYITLARI  (yalnız admin) — error_logs tablosunu görüntüle/yönet
// ============================================================================
(function () {
    let _init = false;
    const esc = (v) => (typeof admEscape === 'function' ? admEscape(v) : String(v == null ? '' : v));

    const SRC_LABEL = {
        'window.onerror': ['JS Hatası', 'bg-red-100 text-red-700'],
        'unhandledrejection': ['Promise', 'bg-amber-100 text-amber-700'],
        'resource': ['Kaynak', 'bg-indigo-100 text-indigo-700'],
        'manual': ['Elle', 'bg-slate-200 text-slate-700']
    };
    const ROLE_LABEL = { admin: 'Admin', investor: 'Yatırımcı', installer: 'Kurulumcu', consultant: 'Danışman', visitor: 'Ziyaretçi' };

    window.adminErrorsInit = async function () {
        if (_init) { adminErrorsRun(); return; }
        _init = true;
        await adminErrorsRun();
    };

    window.adminErrorsRun = async function () {
        const box = document.getElementById('admErrorsList');
        if (!box || !supabaseClient) return;
        const onlyUnseen = !!(document.getElementById('admErrUnseen') || {}).checked;
        box.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Yükleniyor...</p>';
        try {
            const { data, error } = await supabaseClient.rpc('list_error_logs', { p_only_unseen: onlyUnseen, p_limit: 150 });
            if (error) throw error;
            renderList(data || []);
        } catch (err) {
            box.innerHTML = `<p class="text-sm text-red-500 text-center py-8">Hata kayıtları okunamadı: ${esc(err.message || err)}<br><span class="text-xs text-slate-400">error_logs.sql çalıştırıldı mı?</span></p>`;
        }
        adminErrorsBadge();
    };

    function renderList(rows) {
        const box = document.getElementById('admErrorsList');
        if (!rows.length) { box.innerHTML = '<div class="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center"><div class="text-3xl mb-1">✅</div><p class="text-sm font-bold text-slate-600">Kayıtlı hata yok</p><p class="text-xs text-slate-400 mt-1">Her şey yolunda görünüyor.</p></div>'; return; }
        box.innerHTML = rows.map(r => {
            const sl = SRC_LABEL[r.source] || SRC_LABEL.manual;
            const dt = r.created_at ? new Date(r.created_at).toLocaleString('tr-TR') : '';
            const path = (() => { try { return new URL(r.url).hash || new URL(r.url).pathname; } catch (e) { return r.url || ''; } })();
            return `<div class="bg-white border ${r.seen ? 'border-slate-200' : 'border-red-200 ring-1 ring-red-100'} rounded-xl p-4">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap mb-1">
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${sl[1]}">${sl[0]}</span>
                            ${r.hit_count > 1 ? `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-900 text-white">×${r.hit_count}</span>` : ''}
                            ${!r.seen ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white">YENİ</span>' : ''}
                            <span class="text-[11px] text-slate-400">${esc(ROLE_LABEL[r.role] || r.role || 'Ziyaretçi')}</span>
                        </div>
                        <p class="text-sm font-bold text-slate-800 break-words">${esc(r.message)}</p>
                        ${path ? `<p class="text-[11px] text-slate-400 mt-1 font-mono break-all">📍 ${esc(path)}</p>` : ''}
                        ${r.stack ? `<details class="mt-2"><summary class="text-[11px] text-slate-500 cursor-pointer font-bold">Yığın izi (stack)</summary><pre class="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2 mt-1 overflow-x-auto whitespace-pre-wrap break-all">${esc(r.stack)}</pre></details>` : ''}
                        ${r.user_agent ? `<p class="text-[10px] text-slate-300 mt-1 truncate" title="${esc(r.user_agent)}">${esc(r.user_agent)}</p>` : ''}
                    </div>
                    <span class="text-[10px] text-slate-400 whitespace-nowrap shrink-0">${dt}</span>
                </div>
            </div>`;
        }).join('');
    }

    window.adminErrorsMarkSeen = async function () {
        if (!supabaseClient) return;
        try { await supabaseClient.rpc('mark_errors_seen'); await adminErrorsRun(); } catch (e) { alert('İşlem başarısız: ' + (e.message || e)); }
    };

    window.adminErrorsClear = async function () {
        if (!supabaseClient) return;
        if (!confirm('Tüm hata kayıtları kalıcı olarak silinecek. Onaylıyor musunuz?')) return;
        try { await supabaseClient.rpc('clear_error_logs', { p_older_than_days: 0 }); await adminErrorsRun(); } catch (e) { alert('Silme başarısız: ' + (e.message || e)); }
    };

    // Sekme rozeti: okunmamış hata sayısı
    window.adminErrorsBadge = async function () {
        if (!supabaseClient) return;
        try {
            const { data } = await supabaseClient.rpc('count_unseen_errors');
            const n = Number(data) || 0;
            // #admErrBadge sabit düğümüne yazılıyordu; sekme çubuğu artık
            // JS'te üretildiği için ortak rozet yoluna bağlandı.
            if (typeof setTabBadge === 'function') setTabBadge('errors', n);
        } catch (e) { /* sessiz */ }
    };
})();

// Admin paneli her açıldığında hata rozetini bir kez güncelle (giriş sonrası)
setTimeout(function () {
    const card = document.getElementById('adminPanelCard');
    if (card) card.addEventListener('click', function () { if (window.adminErrorsBadge) setTimeout(window.adminErrorsBadge, 400); });
}, 0);

// ============================================================================
// MEVZUAT YÖNETİMİ — dağıtım şirketleri, belge listeleri, güncellemeler
// Tablolar: mevzuat.sql. Ziyaretçi arayüzü: mevzuat.js
//
// Buradaki en önemli alan "doğrulandı" işareti. Ziyaretçi arayüzü
// doğrulanmamış ya da 180 günden eski satırı kesin bilgi gibi basmıyor;
// uyarı rozetiyle gösterip resmi kaynağa yönlendiriyor. Bu yüzden bir satırı
// doğrulanmış işaretlemeden önce gerçekten resmi kaynaktan teyit edin.
// ============================================================================
let _mvSirketler = [], _mvGuncellemeler = [];

function mvKok() {
    if (document.getElementById('mvAdminRoot')) return document.getElementById('mvAdminRoot');
    const admin = document.getElementById('adminPaneContent') || document.getElementById('adminModule');
    if (!admin) return null;
    const card = document.createElement('div');
    card.id = 'mvAdminRoot';
    card.className = 'mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
    card.innerHTML = `
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 class="text-lg font-black text-slate-800">⚖️ Mevzuat & Dağıtım Şirketleri</h3>
            <span class="flex gap-2">
                <button onclick="mvYeniBelge()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg">+ Belge</button>
                <button onclick="mvYeniGuncelleme()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">+ Mevzuat Güncellemesi</button>
            </span>
        </div>
        <p class="text-xs text-slate-400 mb-4">Belge listeleri ve mevzuat değişiklikleri.
           Dağıtım şirketlerinin kendi bilgileri (adres, telefon, teyit) <b>Firmalar</b> sekmesindeki
           "🔌 Dağıtım Şirketleri" bölümünde — tek kayıt, iki yerde tutulmuyor.</p>
        <h4 class="font-black text-slate-700 text-sm mb-2">Son mevzuat güncellemeleri</h4>
        <div id="mvGuncList" class="space-y-2"></div>`;
    admin.appendChild(card);
    return card;
}

async function renderMevzuatAdmin() {
    if (!mvKok() || !supabaseClient) return;
    // Şirket listesi artık burada DEĞİL — distribution_companies tek kayıt,
    // onu 🔌 Dağıtım Şirketleri bölümü yönetiyor. Burada yalnız güncellemeler var.
    const [s, g] = await Promise.all([
        supabaseClient.from('distribution_companies').select('id,name,abbr').order('sort_order'),
        supabaseClient.from('mevzuat_guncellemeler').select('*').order('tarih', { ascending: false }).limit(15)
    ]);
    _mvSirketler = (s && !s.error && s.data) ? s.data.map(x => ({ kod: x.id, ad: x.name, kisa_ad: x.abbr })) : [];
    _mvGuncellemeler = (g && !g.error && g.data) ? g.data : [];

    document.getElementById('mvGuncList').innerHTML = _mvGuncellemeler.map(g2 => `
        <div class="flex items-center justify-between gap-2 border border-slate-200 rounded-lg p-3">
            <div class="min-w-0">
                <strong class="text-sm text-slate-800">${admEscape(g2.baslik)}</strong>
                ${g2.yayinda ? '' : '<span class="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">taslak</span>'}
                <div class="text-[11px] text-slate-400 truncate">${g2.tarih} · ${admEscape(g2.kaynak_kurum || '')}</div>
            </div>
            <span class="flex gap-1 flex-shrink-0">
                <button onclick="mvGuncDuzenle('${g2.id}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">Düzenle</button>
                <button onclick="mvGuncSil('${g2.id}')" class="text-[11px] bg-red-50 text-red-600 px-2 py-1 rounded">Sil</button>
            </span>
        </div>`).join('') || '<p class="text-xs text-slate-400 italic">Henüz güncelleme kaydı yok.</p>';
}
window.renderMevzuatAdmin = renderMevzuatAdmin;

// ------------------------------------------------------------ belge ve güncelleme
window.mvYeniBelge = function () {
    const opts = _mvSirketler.map(x => `<option value="${x.kod}">${admEscape(x.kisa_ad || x.ad)}</option>`).join('');
    eduModal(`
        <h3 class="text-lg font-black text-slate-800 mb-4">Yeni Belge Satırı</h3>
        <div class="space-y-3">
            <div><label class="text-xs font-bold text-slate-600">Dağıtım şirketi</label>
                <select id="mvbSirket" class="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white">
                    <option value="">Tüm Türkiye (ortak belge)</option>${opts}</select></div>
            <div class="flex gap-3">
                <div class="flex-1"><label class="text-xs font-bold text-slate-600">Tesis tipi</label>
                    <select id="mvbTip" class="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white">
                        <option value="mesken">Mesken</option><option value="ticari">Ticari</option>
                        <option value="sanayi">Sanayi</option><option value="tarimsal">Tarımsal</option></select></div>
                <div class="flex-1"><label class="text-xs font-bold text-slate-600">Aşama</label>
                    <select id="mvbAsama" class="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white">
                        <option value="basvuru">Başvuru</option><option value="proje">Proje ve onay</option>
                        <option value="kurulum">Kurulum</option><option value="kabul">Kabul</option>
                        <option value="isletme">İşletme</option></select></div>
                <div class="w-16"><label class="text-xs font-bold text-slate-600">Sıra</label>
                    <input id="mvbSira" type="number" value="0" class="w-full p-2 border border-slate-300 rounded-lg text-sm"></div>
            </div>
            <div><label class="text-xs font-bold text-slate-600">Belge adı</label>
                <input id="mvbAd" class="w-full p-2 border border-slate-300 rounded-lg text-sm"></div>
            <div><label class="text-xs font-bold text-slate-600">Açıklama</label>
                <textarea id="mvbAciklama" rows="2" class="w-full p-2 border border-slate-300 rounded-lg text-sm"></textarea></div>
            <div><label class="text-xs font-bold text-slate-600">Nereden alınır</label>
                <input id="mvbNereden" class="w-full p-2 border border-slate-300 rounded-lg text-sm"></div>
            <div><label class="text-xs font-bold text-slate-600">Kaynak bağlantısı (resmi sayfa)</label>
                <input id="mvbKaynak" placeholder="https://..." class="w-full p-2 border border-slate-300 rounded-lg text-sm"></div>
            <div class="flex gap-4">
                <label class="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" id="mvbZorunlu" checked class="w-4 h-4"> Zorunlu belge</label>
                <label class="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" id="mvbYayin" class="w-4 h-4"> Yayınla</label>
            </div>
        </div>
        <div class="flex gap-2 mt-5">
            <button onclick="eduCloseModal()" class="flex-1 bg-slate-100 text-slate-600 font-bold py-2.5 rounded-lg text-sm">Vazgeç</button>
            <button onclick="mvBelgeKaydet()" class="flex-1 bg-emerald-600 text-white font-bold py-2.5 rounded-lg text-sm">Kaydet</button>
        </div>`);
};

window.mvBelgeKaydet = async function () {
    const ad = document.getElementById('mvbAd').value.trim();
    if (!ad) { alert('Belge adı gerekli.'); return; }
    const veri = {
        sirket_kod: document.getElementById('mvbSirket').value || null,
        tesis_tipi: document.getElementById('mvbTip').value,
        asama:      document.getElementById('mvbAsama').value,
        sira:       parseInt(document.getElementById('mvbSira').value, 10) || 0,
        belge_adi:  ad,
        aciklama:   document.getElementById('mvbAciklama').value.trim() || null,
        nereden_alinir: document.getElementById('mvbNereden').value.trim() || null,
        kaynak_url: document.getElementById('mvbKaynak').value.trim() || null,
        zorunlu_mu: document.getElementById('mvbZorunlu').checked,
        yayinda:    document.getElementById('mvbYayin').checked,
        dogrulama_tarihi: new Date().toISOString().slice(0, 10)
    };
    const { error } = await supabaseClient.from('mevzuat_belgeleri').insert([veri]);
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    eduCloseModal(); renderMevzuatAdmin();
};

window.mvYeniGuncelleme = () => mvGuncModal(null);
window.mvGuncDuzenle = (id) => mvGuncModal(_mvGuncellemeler.find(g => g.id === id));
function mvGuncModal(g) {
    const e = g || {};
    eduModal(`
        <h3 class="text-lg font-black text-slate-800 mb-4">${g ? 'Güncellemeyi Düzenle' : 'Yeni Mevzuat Güncellemesi'}</h3>
        <div class="space-y-3">
            <div class="flex gap-3">
                <div class="flex-1"><label class="text-xs font-bold text-slate-600">Duyuru tarihi</label>
                    <input id="mvgTarih" type="date" value="${e.tarih || new Date().toISOString().slice(0,10)}" class="w-full p-2 border border-slate-300 rounded-lg text-sm"></div>
                <div class="flex-1"><label class="text-xs font-bold text-slate-600">Yürürlük tarihi</label>
                    <input id="mvgYururluk" type="date" value="${e.yururluk_tarihi || ''}" class="w-full p-2 border border-slate-300 rounded-lg text-sm"></div>
            </div>
            <div><label class="text-xs font-bold text-slate-600">Başlık</label>
                <input id="mvgBaslik" value="${admEscape(e.baslik || '')}" class="w-full p-2 border border-slate-300 rounded-lg text-sm"></div>
            <div><label class="text-xs font-bold text-slate-600">Özet</label>
                <textarea id="mvgOzet" rows="3" class="w-full p-2 border border-slate-300 rounded-lg text-sm">${admEscape(e.ozet || '')}</textarea></div>
            <div class="flex gap-3">
                <div class="flex-1"><label class="text-xs font-bold text-slate-600">Kaynak kurum</label>
                    <input id="mvgKurum" value="${admEscape(e.kaynak_kurum || '')}" placeholder="EPDK / TEDAŞ / Resmî Gazete" class="w-full p-2 border border-slate-300 rounded-lg text-sm"></div>
                <div class="w-32"><label class="text-xs font-bold text-slate-600">Önem</label>
                    <select id="mvgOnem" class="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white">
                        <option value="kritik" ${e.onem === 'kritik' ? 'selected' : ''}>Kritik</option>
                        <option value="normal" ${!e.onem || e.onem === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="bilgi" ${e.onem === 'bilgi' ? 'selected' : ''}>Bilgi</option></select></div>
            </div>
            <div><label class="text-xs font-bold text-slate-600">Kaynak bağlantısı <span class="text-red-500">*</span></label>
                <input id="mvgKaynak" value="${admEscape(e.kaynak_url || '')}" placeholder="https://..." class="w-full p-2 border border-slate-300 rounded-lg text-sm">
                <p class="text-[11px] text-slate-400 mt-1">Zorunlu. Kaynaksız mevzuat kaydı, okuyanın doğrulayamayacağı bir iddiadır.</p></div>
            <label class="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" id="mvgYayin" ${e.yayinda ? 'checked' : ''} class="w-4 h-4"> Yayınla</label>
        </div>
        <div class="flex gap-2 mt-5">
            <button onclick="eduCloseModal()" class="flex-1 bg-slate-100 text-slate-600 font-bold py-2.5 rounded-lg text-sm">Vazgeç</button>
            <button onclick="mvGuncKaydet(${g ? `'${g.id}'` : 'null'})" class="flex-1 bg-emerald-600 text-white font-bold py-2.5 rounded-lg text-sm">Kaydet</button>
        </div>`);
}

window.mvGuncKaydet = async function (id) {
    const baslik = document.getElementById('mvgBaslik').value.trim();
    const kaynak = document.getElementById('mvgKaynak').value.trim();
    if (!baslik) { alert('Başlık gerekli.'); return; }
    if (!/^https?:\/\//i.test(kaynak)) { alert('Geçerli bir kaynak bağlantısı gerekli (https:// ile başlamalı).'); return; }
    const veri = {
        tarih: document.getElementById('mvgTarih').value || new Date().toISOString().slice(0, 10),
        yururluk_tarihi: document.getElementById('mvgYururluk').value || null,
        baslik, ozet: document.getElementById('mvgOzet').value.trim() || null,
        kaynak_url: kaynak,
        kaynak_kurum: document.getElementById('mvgKurum').value.trim() || null,
        onem: document.getElementById('mvgOnem').value,
        yayinda: document.getElementById('mvgYayin').checked
    };
    const { error } = id
        ? await supabaseClient.from('mevzuat_guncellemeler').update(veri).eq('id', id)
        : await supabaseClient.from('mevzuat_guncellemeler').insert([veri]);
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    eduCloseModal(); renderMevzuatAdmin();
};

window.mvGuncSil = async function (id) {
    if (!confirm('Bu güncelleme kaydı silinsin mi?')) return;
    const { error } = await supabaseClient.from('mevzuat_guncellemeler').delete().eq('id', id);
    if (error) { alert('Silinemedi: ' + error.message); return; }
    renderMevzuatAdmin();
};


/* ============================================================================
   YORUM ONAYLARI
   Puan anında sayılır; YORUM onaydan geçer. Bir firmanın itibarını tek bir
   onaysız yorum kalıcı olarak zedeleyebilir — bu yüzden yayın öncesi kontrol.
   Reddedilen yorumun PUANI silinmez, yalnız metni yayınlanmaz.
   ============================================================================ */
(function () {
    let _yorumlar = [];

    const TIP = { platform: ['epcmerkezim', 'bg-slate-800 text-white'],
                  company:  ['Kurulumcu firma', 'bg-amber-100 text-amber-800'],
                  consultant: ['Danışman', 'bg-emerald-100 text-emerald-700'] };

    async function yukle() {
        if (!window.supabaseClient) return;
        try {
            const { data, error } = await supabaseClient.rpc('bekleyen_yorumlar');
            if (error) throw error;
            _yorumlar = data || [];
        } catch (e) { _yorumlar = []; }
    }

    function ciz() {
        const kart = document.getElementById('adminYorumKart');
        const liste = document.getElementById('adminYorumList');
        if (!kart || !liste) return;
        if (!_yorumlar.length) { kart.classList.add('hidden'); liste.innerHTML = ''; return; }
        kart.classList.remove('hidden');

        liste.innerHTML = _yorumlar.map(y => {
            const t = TIP[y.hedef_tip] || TIP.platform;
            return `
            <div class="border border-slate-200 rounded-lg p-3">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                    <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${t[1]}">${t[0]}</span>
                    <strong class="text-sm text-slate-800">${admEscape(y.hedef_ad || '')}</strong>
                    <span class="text-amber-500 text-sm">${'★'.repeat(Number(y.puan) || 0)}</span>
                    <span class="text-[11px] text-slate-400 ml-auto">${y.tarih ? new Date(y.tarih).toLocaleDateString('tr-TR') : ''}</span>
                </div>
                <p class="text-sm text-slate-600 mb-2">${admEscape(y.yorum)}</p>
                <div class="flex gap-1.5">
                    <button onclick="admYorumKarar('${y.id}','approved')" class="text-[11px] bg-emerald-600 text-white font-bold px-2.5 py-1 rounded">Yayınla</button>
                    <button onclick="admYorumKarar('${y.id}','rejected')" class="text-[11px] bg-red-50 text-red-600 font-bold px-2.5 py-1 rounded">Yayınlama</button>
                </div>
            </div>`;
        }).join('');
    }

    window.admYorumKarar = async function (id, karar) {
        if (karar === 'rejected' && !confirm('Bu yorum yayınlanmayacak. Puanı silinmez, yalnız metni gizlenir. Onaylıyor musunuz?')) return;
        try {
            const { error } = await supabaseClient.rpc('yorum_karari', { p_id: id, p_karar: karar });
            if (error) throw error;
            _yorumlar = _yorumlar.filter(x => x.id !== id);
            ciz();
        } catch (e) { alert('İşlenemedi: ' + (e.message || e)); }
    };

    window.admYorumlariTazele = async function () { await yukle(); ciz(); };

    // Yönetim paneli açıldığında bir kez yükle.
    const kart = document.getElementById('adminPanelCard');
    if (kart) kart.addEventListener('click', () => setTimeout(() => window.admYorumlariTazele(), 600));
    document.addEventListener('DOMContentLoaded', () => {
        const m = document.getElementById('adminModule');
        if (m && !m.classList.contains('hidden')) window.admYorumlariTazele();
    });
})();


// ============================================================================
// E-POSTA BİLDİRİM KUYRUĞU (yalnız admin)
// Boru hattı veritabanında çalışıyor; hiçbir ekranda izi olmazsa sessizce
// tıkanır ve kimse fark etmez. Bu kutu tek soruyu cevaplıyor: bildirimler
// gerçekten gidiyor mu?
// eposta-bildirimleri.sql çalıştırılmış olmalıdır.
// ============================================================================
function epKok() {
    if (document.getElementById('epRoot')) return document.getElementById('epRoot');
    const admin = document.getElementById('adminPaneSettings') || document.getElementById('adminModule');
    if (!admin) return null;
    const card = document.createElement('div');
    card.id = 'epRoot';
    card.className = 'mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
    card.innerHTML = `
        <div class="flex items-start justify-between gap-3 flex-wrap mb-1">
            <h3 class="text-lg font-black text-slate-800">📧 Bildirim E-postaları</h3>
            <button onclick="epDeneme(this)" class="text-xs bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold px-3 py-1.5 rounded-lg">Bana deneme gönder</button>
        </div>
        <p class="text-xs text-slate-500 mb-3">Panele düşen her bildirim e-posta olarak da gidiyor. Gönderilemeyenler burada görünür.</p>
        <div id="epOzet"></div>
        <div id="epTeslim" class="mt-3"></div>
        <div id="epHatalar" class="mt-3"></div>
        <div id="epEngelli" class="mt-3"></div>`;
    admin.appendChild(card);
    return card;
}

// Teslim durumu — kuyruk durumundan AYRI bir gerçek.
// 'Gönderildi' yalnız "Resend isteği kabul etti" demek; postanın kutuya
// düşüp düşmediğini webhook söylüyor. İki sayaç bilerek yan yana duruyor.
const EP_TESLIM = {
    kabul:      ['Kabul edildi',  'bg-slate-100 text-slate-700', 'Resend aldı, teslim henüz doğrulanmadı'],
    teslim:     ['Teslim edildi', 'bg-emerald-100 text-emerald-800', 'Alıcı sunucusu kabul etti'],
    gecikti:    ['Gecikiyor',     'bg-amber-100 text-amber-800', 'Alıcı sunucusu erteledi, yeniden deneniyor'],
    basarisiz:  ['Gönderilemedi', 'bg-red-100 text-red-700', 'Resend hiç gönderemedi (alan adı/adres sorunu)'],
    dondu:      ['Geri döndü',    'bg-red-100 text-red-700', 'Adres yok, kutu dolu veya reddedildi'],
    sikayet:    ['Spam denildi',  'bg-red-100 text-red-700', 'Alıcı "istenmeyen" işaretledi'],
    bilinmiyor: ['Bilinmiyor',    'bg-slate-100 text-slate-500', 'Webhook kurulu değil ya da olay gelmedi']
};

const EP_ETIKET = {
    bekliyor:     ['Sırada',       'bg-slate-100 text-slate-700'],
    gonderiliyor: ['Gönderiliyor', 'bg-amber-100 text-amber-800'],
    gonderildi:   ['Gönderildi',   'bg-emerald-100 text-emerald-800'],
    hata:         ['Hata',         'bg-red-100 text-red-700'],
    iptal:        ['İptal',        'bg-slate-100 text-slate-500']
};

async function renderEpostaAdmin() {
    const wrap = epKok();
    if (!wrap || !supabaseClient) return;
    const ozet = document.getElementById('epOzet');
    const hataKutu = document.getElementById('epHatalar');
    if (!ozet) return;

    const { data, error } = await supabaseClient.rpc('eposta_kuyruk_ozeti');
    if (error) {
        // ⚠️ "0 e-posta" YAZMIYORUZ: kurulmamış bir boru hattını "her şey yolunda"
        // diye göstermek, bildirimlerin gittiğini sandırırdı.
        ozet.innerHTML = `<div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p class="text-sm font-bold text-amber-800">E-posta bildirimleri kurulu değil</p>
            <p class="text-xs text-amber-700 mt-1">eposta-bildirimleri.sql çalıştırılmamış. Bildirimler yalnız panel içinde görünüyor.</p>
            <p class="text-[11px] text-amber-600 mt-1 font-mono">${admEscape(error.message)}</p></div>`;
        if (hataKutu) hataKutu.innerHTML = '';
        return;
    }

    const satirlar = data || [];
    if (!satirlar.length) {
        ozet.innerHTML = '<p class="text-xs text-slate-400 italic">Kuyruk boş — henüz e-posta üretilmemiş.</p>';
    } else {
        ozet.innerHTML = `<div class="flex flex-wrap gap-2">${satirlar.map(s => {
            const [ad, css] = EP_ETIKET[s.durum] || [s.durum, 'bg-slate-100 text-slate-700'];
            // ⚠️ 'Sırada' ile 'gönderilemedi, tekrar denenecek' aynı şey değil.
            // Hata metni olan satır sırf durumu 'bekliyor' diye sorunsuz
            // görünüyordu; ilk deneme postasında bu yüzden hiçbir şey çıkmadı.
            const h = Number(s.hatali || 0);
            return `<div class="px-3 py-2 rounded-lg ${h > 0 ? 'bg-red-100 text-red-700' : css}">
                <div class="text-lg font-black leading-none">${s.adet}</div>
                <div class="text-[10px] font-bold mt-0.5">${admEscape(ad)}</div>
                ${h > 0 ? `<div class="text-[10px] font-bold mt-0.5">${h} hatalı</div>` : ''}</div>`;
        }).join('')}</div>`;
    }

    // --- TESLİM DURUMU (webhook'tan) ---
    const teslimKutu = document.getElementById('epTeslim');
    if (teslimKutu) {
        const { data: tes, error: tErr } = await supabaseClient.rpc('eposta_teslim_ozeti');
        if (tErr) {
            teslimKutu.innerHTML = `<div class="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <p class="text-xs font-bold text-amber-800">Teslim doğrulaması kurulu değil</p>
                <p class="text-[11px] text-amber-700 mt-0.5">eposta-teslim-webhook.sql çalıştırılmamış. Yukarıdaki “Gönderildi” sayısı yalnız <strong>Resend isteği kabul etti</strong> demek; postanın kutuya düştüğü anlamına gelmez.</p></div>`;
        } else if (tes && tes.length) {
            teslimKutu.innerHTML = `<p class="text-xs font-bold text-slate-600 mb-1.5">Teslim durumu <span class="font-normal text-slate-400">— gerçekte ne oldu</span></p>
                <div class="flex flex-wrap gap-2">${tes.map(x => {
                    const [ad, css, aciklama] = EP_TESLIM[x.teslim_durum] || [x.teslim_durum, 'bg-slate-100 text-slate-700', ''];
                    return `<div class="px-3 py-2 rounded-lg ${css}" title="${admEscape(aciklama)}">
                        <div class="text-lg font-black leading-none">${x.adet}</div>
                        <div class="text-[10px] font-bold mt-0.5">${admEscape(ad)}</div></div>`;
                }).join('')}</div>`;
        } else {
            teslimKutu.innerHTML = '';
        }
    }

    // --- KARA LİSTE ---
    const engelliKutu = document.getElementById('epEngelli');
    if (engelliKutu) {
        const { data: eng, error: eErr } = await supabaseClient.rpc('eposta_engelli_liste', { p_limit: 20 });
        if (!eErr && eng && eng.length) {
            engelliKutu.innerHTML = `<p class="text-xs font-bold text-slate-600 mb-1.5">Gönderim durdurulan adresler</p>
                <div class="space-y-1.5">${eng.map(x => `
                    <div class="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-start justify-between gap-2 flex-wrap">
                        <div class="min-w-0">
                            <div class="text-xs font-bold text-slate-700">${admEscape(x.adres)}</div>
                            <div class="text-[10px] text-slate-500">${x.sebep === 'complained' ? 'alıcı spam dedi' : 'posta geri döndü'}${x.detay ? ' · ' + admEscape(x.detay) : ''}</div>
                        </div>
                        <button onclick="epEngelKaldir('${window.epcAttrJs ? window.epcAttrJs(x.adres) : x.adres}', this)" class="text-[11px] bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 font-bold px-2.5 py-1 rounded-lg flex-shrink-0">Engeli kaldır</button>
                    </div>`).join('')}</div>
                <p class="text-[10px] text-slate-400 mt-1.5">Geri dönen ve şikâyet edilen adreslere göndermeye devam etmek gönderen itibarını düşürür; bu yüzden otomatik durduruluyor.</p>`;
        } else {
            engelliKutu.innerHTML = '';
        }
    }

    if (!hataKutu) return;
    const { data: hatalar } = await supabaseClient.rpc('eposta_son_hatalar', { p_limit: 10 });
    if (!hatalar || !hatalar.length) { hataKutu.innerHTML = ''; return; }
    hataKutu.innerHTML = `<p class="text-xs font-bold text-slate-600 mb-1.5">Gönderilemeyenler</p>
        <div class="space-y-1.5">${(hatalar || []).map(h => `
            <div class="bg-red-50 border border-red-100 rounded-lg p-2.5">
                <div class="text-xs font-bold text-red-800">${admEscape(h.alici)}</div>
                <div class="text-[11px] text-red-600">${admEscape(h.konu)}</div>
                <div class="text-[10px] text-red-500 mt-0.5 font-mono">HTTP ${h.http_kod == null ? '—' : h.http_kod} · ${admEscape(h.hata || '')}</div>
                ${h.durum ? `<div class="text-[10px] text-red-400 mt-0.5">${admEscape(h.durum === 'hata' ? 'vazgeçildi' : 'tekrar denenecek')} · ${h.deneme || 0}. deneme</div>` : ''}
            </div>`).join('')}</div>`;
}

window.epDeneme = async function (btn) {
    const eski = btn.textContent;
    btn.disabled = true; btn.textContent = 'Gönderiliyor…';
    try {
        const { data, error } = await supabaseClient.rpc('eposta_deneme');
        if (error) throw error;
        alert('Deneme postası kuyruğa alındı:\n' + data + '\n\nBirkaç dakika içinde gelmezse aşağıdaki "Gönderilemeyenler" listesine bakın.');
    } catch (e) {
        alert('Gönderilemedi: ' + (e.message || e));
    } finally {
        btn.disabled = false; btn.textContent = eski;
        renderEpostaAdmin();
    }
};

window.epEngelKaldir = async function (adres, btn) {
    if (!window.confirm(adres + ' adresine yeniden gönderilsin mi?\n\nAdres geri döndüğü veya şikâyet edildiği için durdurulmuştu. Sorun giderilmediyse tekrar duracak ve gönderen itibarınız düşer.')) return;
    btn.disabled = true;
    try {
        const { error } = await supabaseClient.rpc('eposta_engeli_kaldir', { p_adres: adres });
        if (error) throw error;
    } catch (e) {
        alert('Kaldırılamadı: ' + (e.message || e));
    } finally {
        btn.disabled = false;
        renderEpostaAdmin();
    }
};


// ============================================================================
// İŞ DEĞERİ VE KOMİSYON KAYDI (yalnız admin)
// ⚠️ Bu ekran FATURA DEĞİL. Kimseden para istenmiyor, firmalara
// gösterilmiyor. Amaç: ortalama iş büyüklüğü, kazanma oranı ve tamamlanma
// oranı sorularını üç ay sonra veriyle cevaplayabilmek.
// komisyon-kaydi.sql çalıştırılmış olmalıdır.
// ============================================================================
function komKok() {
    if (document.getElementById('komRoot')) return document.getElementById('komRoot');
    const admin = document.getElementById('adminPaneSubs') || document.getElementById('adminModule');
    if (!admin) return null;
    const card = document.createElement('div');
    card.id = 'komRoot';
    card.className = 'mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
    card.innerHTML = `
        <h3 class="text-lg font-black text-slate-800 mb-1">💰 İş Değeri ve Komisyon Kaydı</h3>
        <p class="text-xs text-slate-500 mb-3">Platformdan geçen işlerin gerçek büyüklüğü. <strong>Bu bir kayıttır, fatura değildir</strong> — firmalardan tahsil edilmiyor ve firmalara gösterilmiyor.</p>
        <div id="komOzet"></div>
        <div id="komMetrik" class="mt-3"></div>
        <div id="komListe" class="mt-3"></div>`;
    admin.appendChild(card);
    return card;
}

const KOM_ETIKET = {
    beklemede: ['Devam eden', 'bg-amber-100 text-amber-800', 'Firma seçildi, iş henüz tamamlanmadı'],
    hakedildi: ['Tamamlanan', 'bg-emerald-100 text-emerald-800', 'İş devreye alındı'],
    iptal:     ['İptal',      'bg-slate-100 text-slate-500', 'Yönetici gerekçeyle düşürdü']
};

const komPara = (n) => (n == null || isNaN(n)) ? '—'
    : '₺' + Math.round(Number(n)).toLocaleString('tr-TR');

async function renderKomisyonAdmin() {
    const wrap = komKok();
    if (!wrap || !supabaseClient) return;
    const ozetEl = document.getElementById('komOzet');
    if (!ozetEl) return;

    const { data: ozet, error } = await supabaseClient.rpc('komisyon_ozeti');
    if (error) {
        // ⚠️ "0 kayıt" YAZMIYORUZ: kurulmamış bir ölçümü "hiç iş yok" diye
        // göstermek, platformun boş çalıştığını sandırırdı.
        ozetEl.innerHTML = `<div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p class="text-sm font-bold text-amber-800">Komisyon kaydı kurulu değil</p>
            <p class="text-xs text-amber-700 mt-1">komisyon-kaydi.sql çalıştırılmamış. İşlerin parasal büyüklüğü hiçbir yerde tutulmuyor.</p>
            <p class="text-[11px] text-amber-600 mt-1 font-mono">${admEscape(error.message)}</p></div>`;
        ['komMetrik', 'komListe'].forEach(id => { const e = document.getElementById(id); if (e) e.innerHTML = ''; });
        return;
    }

    const satirlar = ozet || [];
    if (!satirlar.length) {
        // ⚠️ BOŞ İKİ ANLAMA GELİR: hiç iş kazanılmadı, ya da kazanılan her iş
        // TEST kaydı. İkisini aynı cümleyle geçiştirmek, üç ay sonra fiyat
        // kararı verirken en pahalı yanlış anlama olurdu.
        let testAdet = 0;
        try {
            const { count } = await supabaseClient.from('commissions')
                .select('id', { count: 'exact', head: true }).eq('test_mi', true);
            testAdet = count || 0;
        } catch (e) { /* kolon yoksa 0 kalır */ }
        ozetEl.innerHTML = testAdet
            ? `<div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
                 <p class="text-xs font-bold text-slate-600">Henüz gerçek iş yok</p>
                 <p class="text-[11px] text-slate-500 mt-1">${testAdet} kayıt var ama hepsi <strong>test</strong> olarak işaretli ve ortalamalara girmiyor. Gerçek bir müşteri firmaya bağlandığında rakamlar burada birikmeye başlar.</p></div>`
            : '<p class="text-xs text-slate-400 italic">Henüz kazanılmış iş yok — firma seçildiğinde kayıt buraya düşer.</p>';
        ['komMetrik', 'komListe'].forEach(id => { const e = document.getElementById(id); if (e) e.innerHTML = ''; });
        return;
    }

    const toplamIs  = satirlar.filter(s => s.durum !== 'iptal')
                              .reduce((a, s) => a + Number(s.toplam_is_try || 0), 0);
    const toplamKom = satirlar.filter(s => s.durum !== 'iptal')
                              .reduce((a, s) => a + Number(s.toplam_komisyon_try || 0), 0);

    ozetEl.innerHTML = `
        <div class="flex flex-wrap gap-2 mb-3">
            <div class="px-4 py-3 rounded-lg bg-slate-800 text-white">
                <div class="text-xl font-black leading-none">${komPara(toplamIs)}</div>
                <div class="text-[10px] font-bold mt-1 opacity-80">Platformdan geçen iş</div>
            </div>
            <div class="px-4 py-3 rounded-lg bg-indigo-50 border border-indigo-100">
                <div class="text-xl font-black leading-none text-indigo-700">${komPara(toplamKom)}</div>
                <div class="text-[10px] font-bold mt-1 text-indigo-500">Hesaplanan komisyon · tahsil edilmiyor</div>
            </div>
        </div>
        <div class="flex flex-wrap gap-2">${satirlar.map(s => {
            const [ad, css, aciklama] = KOM_ETIKET[s.durum] || [s.durum, 'bg-slate-100 text-slate-700', ''];
            return `<div class="px-3 py-2 rounded-lg ${css}" title="${admEscape(aciklama)}">
                <div class="text-lg font-black leading-none">${s.adet}</div>
                <div class="text-[10px] font-bold mt-0.5">${admEscape(ad)}</div>
                <div class="text-[10px] mt-0.5 opacity-80">${komPara(s.toplam_is_try)}</div></div>`;
        }).join('')}</div>`;

    // --- Liste ve türetilen ölçüler ---
    const { data: liste } = await supabaseClient.rpc('komisyon_listesi', { p_limit: 25 });
    const kayitlar = liste || [];

    const metrikEl = document.getElementById('komMetrik');
    if (metrikEl) {
        // ⚠️ Ortalama YALNIZ tutarı bilinen işler üzerinden. Teklifi olmayan
        // işi 0 sayıp ortalamayı aşağı çekmek, tabloyu yalanlamak olurdu.
        const tutarli = kayitlar.filter(k => k.tutar_try != null && k.durum !== 'iptal');
        const ort = tutarli.length
            ? tutarli.reduce((a, k) => a + Number(k.tutar_try), 0) / tutarli.length : null;
        const yarismali = kayitlar.filter(k => k.kaynak === 'yarisma' && Number(k.rakip_sayisi) > 1);
        const ortRakip = yarismali.length
            ? yarismali.reduce((a, k) => a + Number(k.rakip_sayisi || 0), 0) / yarismali.length : null;
        const eksikTutar = kayitlar.filter(k => k.tutar_try == null).length;

        metrikEl.innerHTML = `<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1">
            <div><strong>Ortalama iş:</strong> ${ort == null ? '—' : komPara(ort)}
                 <span class="text-slate-400">(tutarı bilinen ${tutarli.length} iş üzerinden)</span></div>
            ${ortRakip == null ? '' : `<div><strong>Yarışmalı işlerde kazanma şansı:</strong> ortalama ${ortRakip.toFixed(1)} firma davet ediliyor
                 <span class="text-slate-400">→ ≈ %${Math.round(100 / ortRakip)} kazanma oranı</span></div>`}
            ${eksikTutar ? `<div class="text-amber-700"><strong>${eksikTutar} işin tutarı bilinmiyor</strong> — firma seçildi ama sihirbazdan teklif geçmedi. Ortalamaya dâhil değil.</div>` : ''}
        </div>`;
    }

    const listeEl = document.getElementById('komListe');
    if (!listeEl) return;
    if (!kayitlar.length) { listeEl.innerHTML = ''; return; }

    listeEl.innerHTML = `<p class="text-xs font-bold text-slate-600 mb-1.5">Kayıtlar</p>
        <div class="space-y-1.5">${kayitlar.map(k => {
            const [ad, css] = KOM_ETIKET[k.durum] || [k.durum, 'bg-slate-100 text-slate-700'];
            return `<div class="bg-white border border-slate-200 rounded-lg p-2.5 flex items-start justify-between gap-3 flex-wrap">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-black text-slate-800">${admEscape(k.firma)}</span>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${css}">${admEscape(ad)}</span>
                        ${k.kaynak === 'yarisma'
                            ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">${k.rakip_sayisi} firmalı yarışma</span>`
                            : '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-500">doğrudan atama</span>'}
                    </div>
                    <div class="text-[11px] text-slate-500 mt-0.5">${admEscape(k.musteri || '—')} · ${admEscape([k.ilce, k.il].filter(Boolean).join(' / ') || 'konum yok')}</div>
                    ${k.teklif_var
                        ? `<div class="text-[11px] text-slate-700 mt-0.5"><strong>${komPara(k.tutar_try)}</strong> <span class="text-slate-400">KDV hariç · %${k.oran} → ${komPara(k.komisyon_try)}</span></div>`
                        : '<div class="text-[11px] text-amber-700 mt-0.5">Teklif yok — tutar bilinmiyor</div>'}
                </div>
                ${k.durum === 'iptal' ? '' : `<button onclick="komIptal('${window.epcAttrJs ? window.epcAttrJs(k.id) : k.id}', this)" class="text-[11px] bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 font-bold px-2.5 py-1 rounded-lg flex-shrink-0">Düş</button>`}
            </div>`;
        }).join('')}</div>
        <p class="text-[10px] text-slate-400 mt-2">Tutarlar KDV hariç, teklifin gönderildiği andaki hâliyle dondurulmuştur. Oran her kayda ayrı yazılır; ayarı değiştirmek geçmişi etkilemez.</p>`;
}

window.komIptal = async function (id, btn) {
    const sebep = window.prompt('İşi kayıttan düşme gerekçesi (zorunlu):\n\nÖrn. "iş iptal oldu", "yatırımcı vazgeçti", "platform dışında tamamlandı"');
    if (sebep === null) return;
    if (!String(sebep).trim()) { alert('Gerekçe zorunlu.'); return; }
    btn.disabled = true;
    try {
        const { error } = await supabaseClient.rpc('komisyon_iptal', { p_id: id, p_sebep: sebep });
        if (error) throw error;
    } catch (e) {
        alert('Düşülemedi: ' + (e.message || e));
    } finally {
        btn.disabled = false;
        renderKomisyonAdmin();
    }
};


// ============================================================================
// DANIŞMAN DEĞER KAYDI (yalnız admin)
// ⚠️ Bu ekran da HAKEDİŞ DEĞİL. Danışmana ödeme yapılmıyor, danışmana
// gösterilmiyor. Cevaplamaya çalıştığı soru tek: danışman platformdan para
// mı almalı, platforma para mı ödemeli? Bugün sistem ikincisini varsayıyor
// (sub_status), ama bunu ölçen hiçbir şey yoktu.
// danisman-deger-kaydi.sql çalıştırılmış olmalıdır.
// ============================================================================
function ddKok() {
    if (document.getElementById('ddRoot')) return document.getElementById('ddRoot');
    const admin = document.getElementById('adminPaneSubs') || document.getElementById('adminModule');
    if (!admin) return null;
    const card = document.createElement('div');
    card.id = 'ddRoot';
    card.className = 'mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm';
    card.innerHTML = `
        <h3 class="text-lg font-black text-slate-800 mb-1">🧭 Danışman Değer Kaydı</h3>
        <p class="text-xs text-slate-500 mb-3">Danışmanın platforma getirdiği iş ve harcadığı emek. <strong>Ödeme yapılmıyor, danışmana gösterilmiyor</strong> — ücretlendirme kararı bu veriyle verilecek.</p>
        <div id="ddKarsilastirma"></div>
        <div id="ddOzet" class="mt-3"></div>
        <div id="ddListe" class="mt-3"></div>`;
    admin.appendChild(card);
    return card;
}

const ddPara = (n) => (n == null || isNaN(n) || Number(n) === 0) ? '—'
    : '₺' + Math.round(Number(n)).toLocaleString('tr-TR');

// Onay ve abonelik AYRI iki şey: abonelik parayı, onay yetkiyi anlatır.
const DD_ONAY = {
    approved: ['Onaylı',       'bg-emerald-100 text-emerald-700'],
    pending:  ['Onay bekliyor','bg-amber-100 text-amber-800'],
    rejected: ['Reddedildi',   'bg-red-100 text-red-700'],
    askida:   ['Askıda',       'bg-red-100 text-red-700'],
    draft:    ['Taslak',       'bg-slate-100 text-slate-600']
};

const DD_TUR = {
    yonlendirme:   ['Yönlendirme', 'bg-indigo-100 text-indigo-700'],
    degerlendirme: ['Değerlendirme', 'bg-sky-100 text-sky-700']
};

async function renderDanismanDeger() {
    const wrap = ddKok();
    if (!wrap || !supabaseClient) return;
    const ozetEl = document.getElementById('ddOzet');
    if (!ozetEl) return;

    const { data: ozet, error } = await supabaseClient.rpc('danisman_deger_ozeti');
    if (error) {
        // ⚠️ Kurulmamış ölçümü "danışman değer üretmiyor" gibi göstermiyoruz.
        ozetEl.innerHTML = `<div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p class="text-sm font-bold text-amber-800">Danışman değer kaydı kurulu değil</p>
            <p class="text-xs text-amber-700 mt-1">danisman-deger-kaydi.sql çalıştırılmamış. Danışmanın getirdiği iş ve harcadığı emek hiçbir yerde tutulmuyor.</p>
            <p class="text-[11px] text-amber-600 mt-1 font-mono">${admEscape(error.message)}</p></div>`;
        ['ddKarsilastirma', 'ddListe'].forEach(id => { const e = document.getElementById(id); if (e) e.innerHTML = ''; });
        return;
    }

    // --- Karar ölçeği ---
    // ⚠️ "Veri biriksin" kararı, dönüp bakmayı gerektirir. Dönüp bakmayı
    // hatırlatacak tek şey rakamın kendisi: ne gerekiyor, nerede duruyoruz.
    try {
        const { data: olcek } = await supabaseClient.rpc('danisman_karar_olcegi');
        const o = (olcek || [])[0];
        if (o) {
            const y = Number(o.gercek_yonlendirme) || 0;
            const g = Number(o.gercek_degerlendirme) || 0;
            const gun = Number(o.gecen_gun) || 0;
            const yeter = y >= 10 || gun >= 90;
            // ⚠️ Her render'da yeniden ekleniyor; öncekini kaldırmazsak
            // kutular üst üste birikir (fetchAdminData birden çok kez çalışır).
            const varsa = document.getElementById('ddKararOlcegi');
            if (varsa) varsa.remove();
            const kutu = document.createElement('div');
            kutu.id = 'ddKararOlcegi';
            kutu.className = `rounded-lg p-3 mb-3 border ${yeter ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`;
            kutu.innerHTML = `
                <p class="text-xs font-bold ${yeter ? 'text-emerald-800' : 'text-slate-700'}">
                    ${yeter ? '✅ Danışman fiyatı için yeterli veri birikti' : '⏳ Danışman fiyatı kararı veri bekliyor'}</p>
                <p class="text-[11px] ${yeter ? 'text-emerald-700' : 'text-slate-500'} mt-1">
                    Gerçek veri: <strong>${y}</strong> yönlendirme · <strong>${g}</strong> değerlendirme · <strong>${o.aktif_danisman || 0}</strong> onaylı danışman
                    ${gun ? ` · ilk kayıttan bu yana <strong>${gun}</strong> gün` : ' · henüz gerçek kayıt yok'}</p>
                <p class="text-[10px] ${yeter ? 'text-emerald-600' : 'text-slate-400'} mt-1">
                    Eşik: 10 yönlendirme ya da 90 gün. Test kayıtları bu sayıma dâhil değil.</p>`;
            ozetEl.parentElement.insertBefore(kutu, ozetEl.parentElement.querySelector('#ddKarsilastirma'));
        }
    } catch (e) { /* ölçek kurulmamışsa ekranın geri kalanı çalışsın */ }

    // --- Karşılaştırma: danışman yönlendirmesi vs doğrudan başvuru ---
    const { data: karsi } = await supabaseClient.rpc('danisman_karsilastirma');
    const kEl = document.getElementById('ddKarsilastirma');
    if (kEl) {
        const dan = (karsi || []).find(k => k.kaynak === 'danisman');
        const dog = (karsi || []).find(k => k.kaynak === 'dogrudan');
        if (!dan && !dog) {
            kEl.innerHTML = '';
        } else {
            const kutu = (etiket, k, vurgu) => {
                if (!k) return `<div class="px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 flex-1 min-w-[180px]">
                    <div class="text-[10px] font-bold text-slate-500">${etiket}</div>
                    <div class="text-xs text-slate-400 italic mt-1">Henüz kazanılmış iş yok</div></div>`;
                const oran = Number(k.adet) ? Math.round(Number(k.tamamlanan) / Number(k.adet) * 100) : null;
                return `<div class="px-4 py-3 rounded-lg flex-1 min-w-[180px] ${vurgu ? 'bg-indigo-50 border border-indigo-200' : 'bg-slate-50 border border-slate-200'}">
                    <div class="text-[10px] font-bold ${vurgu ? 'text-indigo-600' : 'text-slate-500'}">${etiket}</div>
                    <div class="text-xl font-black leading-none mt-1 ${vurgu ? 'text-indigo-700' : 'text-slate-800'}">${k.adet} iş</div>
                    <div class="text-[11px] mt-1 ${vurgu ? 'text-indigo-600' : 'text-slate-500'}">
                        ${oran == null ? '' : `%${oran} tamamlandı · `}ort. ${ddPara(k.ortalama_is_try)}</div></div>`;
            };
            kEl.innerHTML = `<div class="flex flex-wrap gap-2">
                ${kutu('Danışman yönlendirmesi', dan, true)}
                ${kutu('Doğrudan başvuru', dog, false)}</div>
            <p class="text-[10px] text-slate-400 mt-1.5">Ücretlendirme kararının dayanağı bu karşılaştırma: danışmanın getirdiği iş daha çok tamamlanıyor ya da daha büyükse, o danışmandan <strong>abonelik almak</strong> yanlış taraftan para istemek olur.</p>`;
        }
    }

    // --- Danışman başına ---
    const satirlar = ozet || [];
    if (!satirlar.length) {
        ozetEl.innerHTML = '<p class="text-xs text-slate-400 italic">Kayıtlı danışman yok.</p>';
        const l = document.getElementById('ddListe'); if (l) l.innerHTML = '';
        return;
    }

    // ⚠️ Hiç hareketi olmayan danışman gizlenmiyor, AYRI sayılıyor: "5 danışman
    // var" deyip hepsini üretken göstermek tabloyu yalanlardı.
    const hareketli = satirlar.filter(d => Number(d.getirdigi) || Number(d.degerlendirme));
    const atil = satirlar.length - hareketli.length;

    ozetEl.innerHTML = `
        <p class="text-xs font-bold text-slate-600 mb-1.5">Danışman başına</p>
        <div class="space-y-1.5">${(hareketli.length ? hareketli : satirlar).map(d => {
            const getirdi  = Number(d.getirdigi) || 0;
            const baglanan = Number(d.baglanan) || 0;
            const donusum  = getirdi ? Math.round(baglanan / getirdi * 100) : null;
            const oneriS   = Number(d.oneri_sayisi) || 0;
            const oneriT   = Number(d.oneri_tutan) || 0;
            const abone    = d.abonelik === 'active' ? 'Abone' : 'Deneme';
            // ⚠️ ONAY DURUMU ZORUNLU. Yalnız abonelik rozetini gösterdiğimde
            // reddedilmiş bir danışman ekranda "Abone" diye görünüyordu —
            // yönetici onu çalışan bir danışman sanırdı. İki ayrı şey: abonelik
            // parayı, onay yetkiyi anlatır.
            const [onayAd, onayCss] = DD_ONAY[d.onay] || [d.onay || '—', 'bg-slate-100 text-slate-600'];
            return `<div class="bg-white border border-slate-200 rounded-lg p-2.5">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-black text-slate-800">${admEscape(d.danisman || '(isimsiz danışman)')}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${onayCss}">${admEscape(onayAd)}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${d.abonelik === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}">${abone}</span>
                    ${d.eposta ? `<span class="text-[10px] text-slate-400">${admEscape(d.eposta)}</span>` : ''}
                </div>
                <div class="text-[11px] text-slate-600 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span><strong>${getirdi}</strong> kayıt getirdi${donusum == null ? '' : ` · <strong>${baglanan}</strong> firmaya bağlandı (%${donusum})`}</span>
                    ${Number(d.tamamlanan) ? `<span class="text-emerald-700"><strong>${d.tamamlanan}</strong> tamamlandı</span>` : ''}
                    ${Number(d.degerlendirme) ? `<span class="text-sky-700"><strong>${d.degerlendirme}</strong> teklif değerlendirdi${d.ort_cevap_saat == null ? '' : ` · ort. ${Number(d.ort_cevap_saat)} saatte cevap`}</span>` : ''}
                    ${/* ⚠️ Teklifsiz görüş AYRI sayılır. Danışmanlık olarak
                          geçerli ("henüz teklif yok, bekleyin") ama
                          "kaç teklif değerlendirdi" sorusunun cevabı değil;
                          ortalamaya da girmiyor. */
                      Number(d.teklifsiz_gorus) ? `<span class="text-slate-500"><strong>${d.teklifsiz_gorus}</strong> teklifsiz görüş</span>` : ''}
                    ${oneriS ? `<span>önerisi <strong>${oneriT}/${oneriS}</strong> tuttu</span>` : ''}
                </div>
                ${Number(d.is_hacmi_try)
                    ? `<div class="text-[11px] text-slate-700 mt-0.5">Getirdiği iş: <strong>${ddPara(d.is_hacmi_try)}</strong>
                        <span class="text-slate-400">· platform komisyonu ${ddPara(d.komisyon_try)}
                        ${Number(d.pay_try) ? `· payı olsaydı ${ddPara(d.pay_try)}` : ''}</span></div>`
                    : (getirdi ? '<div class="text-[11px] text-amber-700 mt-0.5">Getirdiği kayıtların hiçbiri henüz firmaya bağlanmadı — parasal karşılık yok.</div>' : '')}
            </div>`;
        }).join('')}</div>
        ${!atil ? ''
            : hareketli.length
                // Hareketlileri gösterdik, geri kalanı gizledik: doğru cümle bu.
                ? `<p class="text-[11px] text-slate-400 mt-1.5">${atil} danışmanın henüz hiç hareketi yok (kayıt getirmemiş, değerlendirme yapmamış) — listede gösterilmiyor.</p>`
                // ⚠️ Hiç hareketli yoksa HEPSİNİ gösteriyoruz; burada
                // "gösterilmiyor" demek ekranın kendi gösterdiğini yalanlamaktı.
                : `<p class="text-[11px] text-slate-400 mt-1.5">Hiçbir danışmanın henüz hareketi yok — kayıt getirdiklerinde ya da teklif değerlendirdiklerinde rakamlar burada dolar.</p>`}`;

    // --- Ham kayıtlar ---
    const { data: liste } = await supabaseClient.rpc('danisman_deger_listesi', { p_limit: 25 });
    const kayitlar = liste || [];
    const listeEl = document.getElementById('ddListe');
    if (!listeEl) return;
    if (!kayitlar.length) {
        listeEl.innerHTML = '<p class="text-[11px] text-slate-400 italic mt-2">Henüz kayıt yok — danışman bir danışan aktarıp o kayıt firmaya bağlandığında ya da bir teklife görüş yazdığında burada görünür.</p>';
        return;
    }

    listeEl.innerHTML = `<p class="text-xs font-bold text-slate-600 mb-1.5">Kayıtlar</p>
        <div class="space-y-1.5">${kayitlar.map(k => {
            const [tad, tcss] = DD_TUR[k.tur] || [k.tur, 'bg-slate-100 text-slate-700'];
            return `<div class="bg-white border border-slate-200 rounded-lg p-2.5 flex items-start justify-between gap-3 flex-wrap">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-black text-slate-800">${admEscape(k.danisman || '—')}</span>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${tcss}">${admEscape(tad)}</span>
                        ${k.durum === 'iptal' ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">İptal</span>'
                          : k.durum === 'hakedildi' ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Tamamlandı</span>'
                          : '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Devam eden</span>'}
                    </div>
                    <div class="text-[11px] text-slate-500 mt-0.5">${admEscape(k.musteri || '—')}${k.firma ? ' · ' + admEscape(k.firma) : ''}</div>
                    ${k.tur === 'yonlendirme'
                        ? (k.is_tutari_try != null
                            ? `<div class="text-[11px] text-slate-700 mt-0.5"><strong>${ddPara(k.is_tutari_try)}</strong>
                                <span class="text-slate-400">KDV hariç · komisyon ${ddPara(k.komisyon_try)} · payı %${k.oran} → ${ddPara(k.pay_try)}</span></div>`
                            : '<div class="text-[11px] text-amber-700 mt-0.5">Teklif yok — tutar bilinmiyor, pay hesaplanamıyor</div>')
                        : `<div class="text-[11px] text-slate-500 mt-0.5">
                            ${k.cevap_saat == null ? 'cevap süresi bilinmiyor' : `<strong>${Number(k.cevap_saat)} saatte</strong> cevapladı`}
                            ${k.oneri_tuttu === true ? ' · <span class="text-emerald-700 font-bold">önerdiği firma seçildi</span>'
                              : k.oneri_tuttu === false ? ' · <span class="text-slate-500">başka firma seçildi</span>'
                              : ' · <span class="text-slate-400">firma önermedi ya da seçim yapılmadı</span>'}
                            ${Number(k.pay_try) ? ` · ${ddPara(k.pay_try)}` : ' · <span class="text-slate-400">ücretlendirilmedi</span>'}</div>`}
                </div>
                ${k.durum === 'iptal' ? '' : `<button onclick="ddIptal('${window.epcAttrJs ? window.epcAttrJs(k.id) : k.id}', this)" class="text-[11px] bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 font-bold px-2.5 py-1 rounded-lg flex-shrink-0">Düş</button>`}
            </div>`;
        }).join('')}</div>
        <p class="text-[10px] text-slate-400 mt-2">Pay, iş bedelinin değil <strong>platform komisyonunun</strong> yüzdesidir: danışman müşterinin ya da firmanın cebinden değil, platformun kendi payından kazanır. Oran her kayda ayrı yazılır; ayarı değiştirmek geçmişi etkilemez.</p>`;
}

window.ddIptal = async function (id, btn) {
    const sebep = window.prompt('Kaydı düşme gerekçesi (zorunlu):\n\nÖrn. "iş iptal oldu", "yönlendirme gerçek değil", "danışman katkısı yok"');
    if (sebep === null) return;
    if (!String(sebep).trim()) { alert('Gerekçe zorunlu.'); return; }
    btn.disabled = true;
    try {
        const { error } = await supabaseClient.rpc('danisman_kaydi_iptal', { p_id: id, p_sebep: sebep });
        if (error) throw error;
    } catch (e) {
        alert('Düşülemedi: ' + (e.message || e));
    } finally {
        btn.disabled = false;
        renderDanismanDeger();
    }
};
