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
                        <div class="flex gap-2 mt-4">
                            <input type="text" id="adm_resp_${t.id}" placeholder="Firmaya/Müşteriye yanıt..." value="${admEscape(t.admin_response)}" class="flex-1 p-3 border border-slate-300 rounded-lg text-sm outline-none shadow-inner">
                            <button onclick="adminRespondTicket('${t.id}')" class="bg-red-600 hover:bg-red-700 text-white font-bold px-6 rounded-lg text-sm transition shadow-lg">Yanıtı Kaydet</button>
                        </div>
                    </div>`;
            });
        }
    }
}

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

// Özel (private) bucket'taki görseli imzalı (geçici) URL ile aç
window.openStorageImage = async function(path) {
    if (!path) return;
    const { data, error } = await supabaseClient.storage.from('support-images').createSignedUrl(path, 60);
    if (error || !data) { alert("Görsel açılamadı."); return; }
    window.open(data.signedUrl, '_blank');
};
