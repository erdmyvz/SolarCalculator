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
    const usersBody = document.getElementById('usersTableBody');
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

    // 1) FİRMALAR  (profiles + companies join)
    if (usersBody) {
        usersBody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-xs text-slate-400">Yükleniyor...</td></tr>';
        const { data } = await supabaseClient.from('profiles').select('*, companies(name, is_active)');
        usersBody.innerHTML = '';
        (data || []).forEach(u => {
            const compName = (u.companies && u.companies.name) || u.company_name || '-';
            usersBody.innerHTML += `
                <tr class="hover:bg-slate-50 text-xs">
                    <td class="p-3 pl-6 font-bold text-slate-800">${admEscape(u.first_name)} ${admEscape(u.last_name)}</td>
                    <td class="p-3 font-black text-emerald-700">${admEscape(compName)}</td>
                    <td class="p-3 font-mono text-slate-500">${admEscape(u.phone) || '-'}</td>
                    <td class="p-3 font-bold text-slate-700">Deneme</td>
                    <td class="p-3"><span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">Aktif</span></td>
                    <td class="p-3"><span class="bg-slate-900 text-white font-mono text-[10px] px-2 py-0.5 rounded">${admEscape(u.role)}</span></td>
                    <td class="p-3"><button class="bg-slate-200 px-2 py-1 rounded text-[10px] font-bold">Düzenle</button></td>
                </tr>`;
        });
    }

    // 2) GENEL HAVUZ = atanmamış başvurular (leads.company_id IS NULL)
    if (leadsBox) {
        leadsBox.innerHTML = '<p class="text-xs text-slate-400 italic">Yükleniyor...</p>';
        const { data: pool } = await supabaseClient
            .from('leads').select('*').is('company_id', null)
            .order('created_at', { ascending: false });

        if (!pool || pool.length === 0) {
            leadsBox.innerHTML = '<p class="text-xs text-slate-400 italic">Genel havuzda atanmamış başvuru bulunmuyor.</p>';
        } else {
            leadsBox.innerHTML = '';
            pool.forEach(l => {
                const dateStr = new Date(l.created_at).toLocaleString('tr-TR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
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
                                <div class="flex items-center gap-2"><strong class="text-sm text-slate-800">${admEscape(l.full_name)}</strong>
                                    <span class="font-mono text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">${admEscape(l.tracking_code)}</span></div>
                                <p class="text-slate-500 mt-1 font-medium">📞 ${admEscape(l.phone)} | ✉️ ${admEscape(l.email) || '-'} | 📍 ${admEscape(l.address) || '-'}</p>
                                <p class="text-slate-400 mt-2 bg-slate-50 p-2 rounded text-[11px] font-medium border border-slate-100 whitespace-pre-line">${admEscape(l.notes)}</p>
                            </div>
                            <span class="text-[10px] text-slate-400 font-mono whitespace-nowrap">${dateStr}</span>
                        </div>
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
                    ? `<button onclick="openStorageImage('${path}')" class="bg-blue-600 text-white px-3 py-1.5 rounded text-[10px] font-bold">${label}</button>`
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

    // 7) DAĞITIM ŞİRKETLERİ (yalnız admin görür)
    await renderDiscoAdmin();

    // 8) AYARLAR / PARAMETRELER (yalnız admin görür)
    await renderSettingsAdmin();

    // 9) GENEL AŞAMA ETİKETLERİ (yalnız admin görür)
    await renderStageAdmin();

    // 10) DANIŞMAN BAŞVURULARI (onay akışı)
    await renderConsultantsAdmin();

    // 10b) ABONELİKLER
    await renderSubscriptions();

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
    const { error } = await supabaseClient.from('leads').update({ company_id: companyId }).eq('id', leadId);
    if (error) { alert("Atama hatası: " + error.message); return; }
    alert("Başvuru firmaya atandı. Firma kendi CRM ekranında görecek.");
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
        <p class="text-xs text-slate-400 mb-4">Firmalar proje yönetiminde ilini arayıp buradan başvuru şirketini bulur. Verileri güncel tutun.</p>
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
        sort_order: parseInt(document.getElementById('dcOrder').value) || 0,
        is_published: document.getElementById('dcPub').checked
    };
    const { error } = id
        ? await supabaseClient.from('distribution_companies').update(obj).eq('id', id)
        : await supabaseClient.from('distribution_companies').insert([obj]);
    if (error) { alert('Kaydedilemedi: ' + error.message); return; }
    eduCloseModal(); renderDiscoAdmin();
};
window.dcDelete = async (id) => {
    if (!confirm('Bu dağıtım şirketi kaydı silinecek. Emin misiniz?')) return;
    const { error } = await supabaseClient.from('distribution_companies').delete().eq('id', id);
    if (error) { alert('Silinemedi: ' + error.message); return; }
    renderDiscoAdmin();
};


// ============================================================================
// AYARLAR / PARAMETRE YÖNETİMİ (app_settings — yalnız admin)
// Hesaplayıcı, teklif ve batarya modülleri bu değerleri hesap anında okur.
// ============================================================================
const SETTINGS_SCHEMA = [
    { key: 'solarYield',    label: 'Yıllık üretim (kWh/kWp)',          cat: 'Güneş Sistemi', step: '1',    def: 1500 },
    { key: 'roofM2PerKwp',  label: 'Çatı alanı (m²/kWp)',              cat: 'Güneş Sistemi', step: '0.1',  def: 5.5 },
    { key: 'kwpPerPanel',   label: 'Panel gücü (kWp/panel)',           cat: 'Güneş Sistemi', step: '0.01', def: 0.55 },
    { key: 'pricePerKwp',   label: 'Kurulum bedeli (TL/kWp)',          cat: 'Güneş Sistemi', step: '500',  def: 30000 },
    { key: 'co2PerKwh',     label: 'CO₂ katsayısı (kg/kWh)',           cat: 'Güneş Sistemi', step: '0.01', def: 0.45 },
    { key: 'tariff',        label: 'Elektrik tarifesi (TL/kWh)',       cat: 'Güneş Sistemi', step: '0.1',  def: 2.5 },
    { key: 'batteryDod',    label: 'Batarya deşarj derinliği (0-1)',   cat: 'Batarya',       step: '0.05', def: 0.9 },
    { key: 'inverterEff',   label: 'İnverter verimi (0-1)',            cat: 'Batarya',       step: '0.01', def: 0.95 },
    { key: 'batteryModule', label: 'Batarya ünite boyutu (kWh)',       cat: 'Batarya',       step: '1',    def: 5 },
    { key: 'inverterSurge', label: 'İnverter kalkış katsayısı',        cat: 'Batarya',       step: '0.1',  def: 1.3 },
    { key: 'usdTry',            label: 'USD/TRY kuru (₺)',                 cat: 'Fatura Analizi', step: '0.5', def: 42 },
    { key: 'usdPerKwp',         label: 'Panel + inverter ($/kWp)',         cat: 'Fatura Analizi', step: '50',  def: 1000 },
    { key: 'batteryUsdPerKwh',  label: 'Batarya ($/kWh)',                  cat: 'Fatura Analizi', step: '25',  def: 300 },
    { key: 'tariffMesken',      label: 'Mesken tarifesi (TL/kWh)',         cat: 'Fatura Analizi', step: '0.1', def: 2.5 },
    { key: 'tariffTicarethane', label: 'Ticarethane tarifesi (TL/kWh)',    cat: 'Fatura Analizi', step: '0.1', def: 3.5 },
    { key: 'tariffSanayi',      label: 'Sanayi tarifesi (TL/kWh)',         cat: 'Fatura Analizi', step: '0.1', def: 3.0 },
    { key: 'tariffTarimsal',    label: 'Tarımsal tarife (TL/kWh)',         cat: 'Fatura Analizi', step: '0.1', def: 2.2 }
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

    const cats = [...new Set(SETTINGS_SCHEMA.map(s => s.cat))];
    box.innerHTML = cats.map(cat => `
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
window.adminShowTab = function (key) {
    document.querySelectorAll('.admin-pane').forEach(p => p.classList.add('hidden'));
    const pane = document.getElementById('adminPane' + key.charAt(0).toUpperCase() + key.slice(1));
    if (pane) pane.classList.remove('hidden');
    document.querySelectorAll('.admin-tab-btn').forEach(b => {
        const on = b.getAttribute('data-tab') === key;
        b.className = 'admin-tab-btn px-4 py-2 rounded-lg text-sm font-bold transition ' +
            (on ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100');
    });
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
        : document.querySelectorAll('#usersTableBody tr').length;
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
    const root = document.getElementById('admConsultantsRoot');
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
                <h3 class="font-black text-lg text-slate-800">💳 Abonelikler <span class="text-sm font-normal text-slate-400">· $299/ay · KDV hariç</span></h3>
                <div class="flex gap-2 text-[11px] font-bold flex-wrap">
                    <span class="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1">${active} Aktif</span>
                    <span class="bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-3 py-1">${trial} Deneme</span>
                    <span class="bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1">${expiredN} Süresi Doldu</span>
                </div>
            </div>
            <p class="text-xs text-slate-400 mb-4">Havale/EFT geldikçe hesabı <b>+1 Ay</b> ile aktifleştir/uzat. Deneme 30 gündür. (En yakın biten üstte.)</p>
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

    // 1) Onay bekleyen danışmanlar
    try {
        const { data } = await supabaseClient.from('consultants').select('id').eq('status', 'pending');
        if (data && data.length) rows.push(['📝', 'Danışman onay bekliyor', data.length, 'consultants', 'bg-amber-100 text-amber-800']);
    } catch (e) {}

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
    } catch (e) {}

    // 3) Firmaya atanmamış başvurular
    try {
        const { data } = await supabaseClient.from('leads').select('id').is('company_id', null);
        if (data && data.length) rows.push(['📥', 'Firmaya atanmamış başvuru', data.length, 'ops', 'bg-blue-100 text-blue-700']);
    } catch (e) {}

    // 4) Sıcak potansiyel müşteriler (mevcut puanlama ile)
    try {
        const { data } = await supabaseClient.from('prospects').select('*').order('created_at', { ascending: false }).limit(120);
        if (data && data.length && typeof prospectScore === 'function') {
            hot = data.map(p => Object.assign({}, p, { _s: prospectScore(p).total })).filter(p => p._s >= 70).sort((a, b) => b._s - a._s);
            if (hot.length) rows.push(['🔥', 'Sıcak potansiyel müşteri', hot.length, 'ops', 'bg-red-100 text-red-700']);
        }
    } catch (e) {}

    // sekme rozetleri — aynı sayılardan beslenir, ek sorgu yok
    const byTab = {};
    rows.forEach(r => { byTab[r[3]] = (byTab[r[3]] || 0) + r[2]; });
    ['consultants', 'subs', 'ops', 'companies', 'content', 'settings'].forEach(t => setTabBadge(t, byTab[t] || 0));

    const total = rows.reduce((s, r) => s + r[2], 0);
    if (!total) {
        box.innerHTML = '<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center"><div class="text-2xl mb-1">✅</div><p class="font-black text-emerald-800">Bekleyen aksiyon yok</p><p class="text-xs text-emerald-700/70 mt-0.5">Onay, abonelik ve atama kuyrukları temiz.</p></div>';
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

    box.innerHTML = `
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
function setTabBadge(tab, n) {
    const btn = document.querySelector('.admin-tab-btn[data-tab="' + tab + '"]');
    if (!btn) return;
    let b = btn.querySelector('.tab-badge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'tab-badge'; btn.appendChild(b); }
    b.textContent = n > 99 ? '99+' : String(n);
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
