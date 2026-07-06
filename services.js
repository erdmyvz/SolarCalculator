/* ============================================================================
   services.js — BANA ATANAN SERVİSLER (kurulumcu firma ekranı)
   Firmaya atanan servis taleplerini (bakım/temizlik/arıza) listeler; firma
   durumu günceller ve müşteriye yanıt yazar. RLS sayesinde her firma yalnız
   kendine atanmış talepleri görür. core.js'ten sonra yüklenir.
   (openStorageImage admin.js'te, admEscape/closeAllAndShowMenu global.)
   ============================================================================ */
(function () {
    const root = document.getElementById('servicesList');
    if (!root) return;

    // Menü kartı: ekranı aç
    document.getElementById('btnGoServices')?.addEventListener('click', () => {
        window.openedFromPublic = false;
        document.getElementById('mainMenu').classList.add('hidden');
        document.getElementById('servicesModule').classList.remove('hidden');
        loadServices();
    });
    document.getElementById('btnBackToMenuFromServices')?.addEventListener('click', () => {
        document.getElementById('servicesModule')?.classList.add('hidden');
        closeAllAndShowMenu();
    });
    document.getElementById('btnRefreshServices')?.addEventListener('click', () => loadServices());

    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const typeLabels = {
        ariza: '🔧 Arıza / Teknik Servis', bakim: '🛠️ Periyodik Bakım',
        temizlik: '🧽 Panel Temizliği', test: '📊 Test & Ölçüm'
    };
    const statusMap = {
        basvuru_iletildi: { t: 'Başvuru İletildi', c: 'bg-slate-100 text-slate-700' },
        inceleniyor:      { t: 'İnceleniyor',      c: 'bg-blue-100 text-blue-800' },
        planlandi:        { t: 'Planlandı',        c: 'bg-amber-100 text-amber-800' },
        tamamlandi:       { t: 'Tamamlandı',       c: 'bg-emerald-100 text-emerald-800' }
    };
    const statusOptions = (cur) => Object.entries(statusMap)
        .map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${v.t}</option>`).join('');

    async function loadServices() {
        if (!supabaseClient) { root.innerHTML = '<p class="text-slate-500 text-sm">Veritabanı bağlantısı yok.</p>'; return; }
        root.innerHTML = '<p class="text-slate-400 text-sm">Yükleniyor...</p>';

        // RLS otomatik olarak yalnız bu firmaya atanmış talepleri döndürür
        const { data, error } = await supabaseClient
            .from('service_requests').select('*').order('created_at', { ascending: false });
        if (error) { root.innerHTML = `<p class="text-red-500 text-sm">Yüklenemedi: ${error.message}</p>`; return; }
        if (!data || data.length === 0) {
            root.innerHTML = '<p class="text-slate-500 text-sm font-medium">Firmanıza atanmış bir servis talebi bulunmuyor. Merkezi havuzdan atama yapıldığında burada görünür.</p>';
            return;
        }

        const imgBtn = (path, label) => path
            ? `<button onclick="openStorageImage('${path}')" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-[10px] font-bold">${label}</button>`
            : '';

        root.innerHTML = data.map(t => {
            const st = statusMap[t.status] || { t: t.status, c: 'bg-slate-100 text-slate-700' };
            const dateStr = new Date(t.created_at).toLocaleString('tr-TR');
            const media = [imgBtn(t.img_system, '📸 Sistem'), imgBtn(t.img_pano, '⚡ Pano'), imgBtn(t.img_ges, '☀️ GES Pano'), imgBtn(t.img_code, '⚠️ Hata Kodu')].join('');
            return `
                <div class="p-5 border border-slate-200 rounded-xl bg-white shadow-sm text-xs">
                    <div class="flex justify-between items-center border-b border-slate-100 pb-3 mb-3 flex-wrap gap-2">
                        <div class="flex items-center gap-3 flex-wrap">
                            <span class="bg-slate-900 text-white font-mono px-2 py-1 rounded">${esc(t.tracking_code)}</span>
                            <strong class="text-slate-800 text-base">${esc(t.full_name)}</strong>
                            <span class="text-[11px] font-bold text-slate-500">${typeLabels[t.request_type] || esc(t.request_type)}</span>
                            <span class="text-[10px] text-slate-400">🕒 ${dateStr}</span>
                        </div>
                        <span class="${st.c} font-bold px-3 py-1 rounded-full text-[10px] tracking-widest uppercase">${st.t}</span>
                    </div>

                    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 bg-slate-50 p-4 rounded-lg border border-slate-100 text-[11px] text-slate-700">
                        <p><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">İletişim</strong>📞 ${esc(t.phone)}<br>✉️ ${esc(t.email) || '-'}</p>
                        <p><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Donanım</strong>${esc(t.inverter_model) || 'Belirtilmedi'}<br>${esc(t.battery_model) || 'Batarya yok'}</p>
                        <p><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Kurulum Firması</strong>${esc(t.installer_name) || 'Bilinmiyor'}</p>
                        <p><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Tarihler</strong>Kurulum: ${t.install_date || '-'}<br>Sorun: ${t.problem_date || '-'}</p>
                        <p class="col-span-2"><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Açık Adres</strong>${esc(t.address) || 'Belirtilmedi'}</p>
                    </div>

                    <p class="text-slate-700 mb-3 border-l-4 border-amber-400 pl-3 py-1 bg-amber-50/50 rounded-r font-medium whitespace-pre-line">${esc(t.problem_desc) || 'Açıklama girilmemiş.'}</p>

                    ${media.trim() ? `<div class="flex gap-2 mb-4 flex-wrap">${media}</div>` : ''}

                    <div class="flex gap-2 items-center flex-wrap pt-3 border-t border-slate-100">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Durum</span>
                        <select id="svcstatus_${t.id}" class="border border-slate-300 p-2 rounded-lg text-xs bg-white">${statusOptions(t.status)}</select>
                        <input type="text" id="svcresp_${t.id}" placeholder="Müşteriye yanıt (takip ekranında görünür)..." value="${esc(t.admin_response)}" class="flex-1 min-w-[180px] p-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-amber-500">
                        <button onclick="svcSave('${t.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 rounded-lg text-xs">Kaydet</button>
                    </div>
                </div>`;
        }).join('');
    }

    window.svcSave = async function (id) {
        const status = document.getElementById(`svcstatus_${id}`)?.value;
        const resp = (document.getElementById(`svcresp_${id}`)?.value || '').trim() || null;
        const { error } = await supabaseClient
            .from('service_requests').update({ status, admin_response: resp }).eq('id', id);
        if (error) { alert('Kaydedilemedi: ' + error.message); return; }
        alert('Servis talebi güncellendi.');
        loadServices();
    };

    // ekran adım adım açıldığında yüklenir; burada global bırakmaya gerek yok
    window.loadServices = loadServices;
})();
