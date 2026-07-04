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
}

// --- Potansiyel müşteriler bölümünü (bir kez) admin paneline enjekte eder ---
function ensureProspectsSection() {
    let list = document.getElementById('adminProspectsList');
    if (list) return list;
    const admin = document.getElementById('adminModule');
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

    const statusOpts = (cur) => [
        ['yeni', 'Yeni'], ['isitiliyor', 'Isıtılıyor'],
        ['donusturuldu', 'Dönüştürüldü'], ['ilgilenmiyor', 'İlgilenmiyor']
    ].map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('');

    box.innerHTML = data.map(p => {
        const dateStr = new Date(p.created_at).toLocaleString('tr-TR', { day:'2-digit', month:'short', year:'2-digit' });
        const kwp    = p.recommended_kwp   ? `${p.recommended_kwp} kWp` : '-';
        const bill   = p.monthly_bill      ? `₺${Math.round(p.monthly_bill).toLocaleString('tr-TR')}/ay` : '-';
        const saving = p.est_annual_saving ? `₺${Math.round(p.est_annual_saving).toLocaleString('tr-TR')}/yıl` : '-';
        const pay    = p.payback_years     ? `${p.payback_years} yıl` : '-';
        return `
            <div class="border border-slate-200 rounded-xl p-4 text-xs">
                <div class="flex justify-between items-start gap-3 flex-wrap">
                    <div>
                        <strong class="text-sm text-slate-800">${admEscape(p.full_name) || '(isim yok)'}</strong>
                        <p class="text-slate-500 mt-1 font-medium">✉️ ${admEscape(p.email)}${p.phone ? ' | 📞 ' + admEscape(p.phone) : ''}</p>
                        <p class="text-slate-400 mt-2 bg-slate-50 border border-slate-100 rounded px-2 py-1 inline-block">☀️ ${kwp} · ${bill} · Tasarruf ${saving} · Amorti ${pay}</p>
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