/* ============================================================================
   consultants.js — DANIŞMANLIK MODÜLÜ (Faz 1)
   - Ziyaretçi: onaylı danışmanları listeler (consultantsModule / consultantsRoot)
   - Danışman: kendi profilini + müsaitliğini doldurur, onaya gönderir
     (consultantPanelModule / consultantPanelRoot)
   consultants.sql çalıştırılmış olmalıdır. index.html'de core.js'ten sonra yüklenir.
   ============================================================================ */
(function () {
    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s) : String(s == null ? '' : s));

    // Ziyaretçi "geri dön" butonu
    document.getElementById('btnBackFromConsultants')?.addEventListener('click', () => {
        if (typeof closeAllAndShowMenu === 'function') closeAllAndShowMenu();
    });

    const CONS_DAYS = [['mon','Pzt'],['tue','Sal'],['wed','Çar'],['thu','Per'],['fri','Cum'],['sat','Cmt'],['sun','Paz']];
    const CONS_HOURS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
    let _consAvail = {};   // {mon:['09:00',...]}

    // ---------------------------------------------------------------- VİZİTÖR LİSTESİ
    async function renderConsultantsList() {
        const root = document.getElementById('consultantsRoot');
        if (!root) return;
        root.innerHTML = '<p class="text-slate-400 text-sm py-6 text-center">Yükleniyor...</p>';
        if (!supabaseClient) { root.innerHTML = '<p class="text-slate-400 text-sm">Bağlantı yok.</p>'; return; }

        let list = [];
        try {
            const { data, error } = await supabaseClient.from('consultants')
                .select('*').eq('status', 'approved').order('completed_jobs', { ascending: false });
            if (error) throw error;
            list = data || [];
        } catch (e) {
            root.innerHTML = `<p class="text-red-500 text-sm">Liste yüklenemedi: ${esc(e.message || e)}</p>`;
            return;
        }

        const card = (c) => `
            <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg">${esc(c.avatar_initials || (c.full_name || '?').charAt(0))}</div>
                    <div class="min-w-0">
                        <p class="font-black text-slate-800 leading-tight truncate">${esc(c.full_name || 'Danışman')}</p>
                        <p class="text-[11px] text-slate-500 truncate">${esc(c.title || '')}</p>
                    </div>
                </div>
                ${c.completed_jobs ? `<div class="text-xs text-slate-500 mb-2">✅ ${c.completed_jobs} tamamlanan iş</div>` : ''}
                ${c.bio ? `<p class="text-sm text-slate-600 mb-3">${esc(c.bio)}</p>` : ''}
                ${c.expertise ? `<div class="flex flex-wrap gap-1.5 mb-4">${String(c.expertise).split(',').map(t => t.trim()).filter(Boolean).map(t => `<span class="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-full">${esc(t)}</span>`).join('')}</div>` : ''}
                <button disabled title="Yakında" class="w-full bg-slate-100 text-slate-400 font-bold py-2.5 rounded-lg cursor-not-allowed">📅 Randevu Al (Yakında)</button>
            </div>`;

        root.innerHTML = `
            <div class="bg-gradient-to-br from-indigo-600 to-slate-900 text-white rounded-2xl p-8 mb-8 text-center">
                <h2 class="text-2xl md:text-3xl font-black mb-3">Bağımsız Solar Danışmanları</h2>
                <p class="text-indigo-100 max-w-2xl mx-auto text-sm md:text-base">Yatırım kararınızı satıcıdan bağımsız, tarafsız uzmanlarla verin. Aşağıdaki danışmanlar başvurularını tamamlamış ve onaylanmıştır.</p>
            </div>
            ${list.length
                ? `<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">${list.map(card).join('')}</div>`
                : `<div class="bg-slate-50 border border-slate-200 rounded-2xl p-10 text-center mb-8"><div class="text-4xl mb-3">🎯</div><p class="font-black text-slate-700 mb-1">Henüz onaylı danışman yok</p><p class="text-sm text-slate-500">Danışmanlar başvurularını tamamladıkça burada listelenecek.</p></div>`}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                    <span class="inline-block bg-slate-200 text-slate-600 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider mb-2">Yakında</span>
                    <h3 class="font-black text-slate-800 mb-1">İsimsiz Talep Bırak</h3>
                    <p class="text-sm text-slate-600">Yakında; isim vermeden talebinizi yazabilecek, danışmanlarla anonim yazışabileceksiniz.</p>
                </div>
                <div class="bg-indigo-50 border border-indigo-200 rounded-2xl p-6">
                    <h3 class="font-black text-slate-800 mb-1">Danışman mısınız?</h3>
                    <p class="text-sm text-slate-600 mb-4">Kurumsal Giriş'ten "Danışman" olarak kayıt olun, profilinizi doldurup onaya gönderin.</p>
                    <a href="#auth" class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm">Kurumsal Giriş ›</a>
                </div>
            </div>`;
    }
    window.renderConsultantsList = renderConsultantsList;

    // ---------------------------------------------------------------- DANIŞMAN PANELİ
    function availGridInner() {
        let h = `<table class="border-collapse"><thead><tr><th class="p-1"></th>${CONS_DAYS.map(d => `<th class="p-1 text-[10px] text-slate-500 font-bold">${d[1]}</th>`).join('')}</tr></thead><tbody>`;
        CONS_HOURS.forEach(hour => {
            h += `<tr><td class="p-1 text-[10px] text-slate-400 font-bold pr-2 whitespace-nowrap">${hour}</td>`;
            CONS_DAYS.forEach(d => {
                const on = (_consAvail[d[0]] || []).includes(hour);
                h += `<td class="p-0.5"><button type="button" onclick="consAvailToggle('${d[0]}','${hour}')" class="w-9 h-7 rounded ${on ? 'bg-emerald-500' : 'bg-slate-100 hover:bg-slate-200'} transition"></button></td>`;
            });
            h += `</tr>`;
        });
        return h + `</tbody></table>`;
    }
    window.consAvailToggle = function (day, hour) {
        if (!_consAvail[day]) _consAvail[day] = [];
        const i = _consAvail[day].indexOf(hour);
        if (i >= 0) _consAvail[day].splice(i, 1); else _consAvail[day].push(hour);
        const g = document.getElementById('consAvailGrid');
        if (g) g.innerHTML = availGridInner();
    };

    function statusBanner(c) {
        const s = c.status || 'draft';
        if (s === 'approved') return `<div class="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-sm font-bold">✅ Profiliniz onaylandı — ziyaretçi sayfasında listeleniyorsunuz.</div>`;
        if (s === 'pending')  return `<div class="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm font-bold">⏳ Profiliniz onay bekliyor. Admin incelemesinden sonra yayınlanacak.</div>`;
        if (s === 'rejected') return `<div class="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm"><strong>❌ Profiliniz reddedildi.</strong>${c.reject_reason ? `<br>Gerekçe: ${esc(c.reject_reason)}` : ''}<br><span class="text-xs">Düzenleyip tekrar onaya gönderebilirsiniz.</span></div>`;
        return `<div class="bg-slate-100 border border-slate-200 text-slate-600 rounded-xl p-4 text-sm">📝 Taslak — profilinizi doldurup "Onaya Gönder" ile yayına başvurun.</div>`;
    }

    function renderConsultantPanel(c) {
        const root = document.getElementById('consultantPanelRoot');
        if (!root) return;
        _consAvail = (c.availability && typeof c.availability === 'object') ? JSON.parse(JSON.stringify(c.availability)) : {};

        root.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h2 class="text-xl md:text-2xl font-black text-slate-800">🎯 Danışman Panelim</h2>
            </div>
            <div class="mb-5">${statusBanner(c)}</div>

            <div class="bg-white border border-slate-200 rounded-xl p-5 md:p-6 mb-5">
                <h3 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-4">Profil Bilgileri</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Ad Soyad</label><input id="consName" value="${esc(c.full_name || '')}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Unvan</label><input id="consTitle" value="${esc(c.title || '')}" placeholder="örn. Elektrik Y. Müh. · GES Uzmanı" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Baş Harfler (avatar)</label><input id="consInitials" maxlength="2" value="${esc(c.avatar_initials || '')}" placeholder="örn. MA" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Tamamlanan İş Sayısı</label><input id="consJobs" type="number" value="${c.completed_jobs || 0}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500"></div>
                    <div class="md:col-span-2"><label class="block text-xs font-bold text-slate-600 mb-1">Uzmanlık Etiketleri (virgülle)</label><input id="consExpertise" value="${esc(c.expertise || '')}" placeholder="Çatı GES, Batarya, TEDAŞ Süreci" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500"></div>
                    <div class="md:col-span-2"><label class="block text-xs font-bold text-slate-600 mb-1">Özgeçmiş / Hakkında</label><textarea id="consBio" rows="3" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500">${esc(c.bio || '')}</textarea></div>
                    <div class="md:col-span-2"><label class="block text-xs font-bold text-slate-600 mb-1">Motivasyon</label><textarea id="consMotivation" rows="2" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-indigo-500">${esc(c.motivation || '')}</textarea></div>
                </div>
            </div>

            <div class="bg-white border border-slate-200 rounded-xl p-5 md:p-6 mb-5">
                <h3 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Müsaitlik (haftalık)</h3>
                <p class="text-xs text-slate-400 mb-3">Görüşmeye açık olduğunuz gün ve saatleri işaretleyin.</p>
                <div class="overflow-x-auto"><div id="consAvailGrid">${availGridInner()}</div></div>
            </div>

            <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-5">
                <span class="inline-block bg-slate-200 text-slate-600 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider mb-2">Yakında</span>
                <h3 class="font-black text-slate-700 mb-1">Randevu Talepleri & Yazışmalar</h3>
                <p class="text-sm text-slate-500">Yakında; size gelen randevu taleplerini görecek, onaylayıp Google Meet linkini paylaşacak ve yatırımcılarla yazışabileceksiniz.</p>
            </div>

            <div class="flex flex-wrap gap-3">
                <button onclick="consultantSave(false)" class="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold px-5 py-2.5 rounded-lg">Taslağı Kaydet</button>
                <button onclick="consultantSave(true)" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-2.5 rounded-lg">Onaya Gönder ›</button>
            </div>`;
    }
    window.renderConsultantPanel = renderConsultantPanel;

    window.showConsultantPanel = function (cons, email) {
        document.getElementById('authContainer')?.classList.add('hidden');
        document.getElementById('landingContainer')?.classList.add('hidden');
        document.getElementById('appContainer')?.classList.remove('hidden');
        document.getElementById('mainMenu')?.classList.add('hidden');
        document.querySelector('#appContainer > div.w-full.max-w-7xl.mx-auto')?.classList.remove('hidden'); // üst bar (profil/çıkış) görünsün
        ['crmModule','adminModule','companyManagementModule','techSupportModule','salesAssistantModule','educationModule','regulationsModule'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
        document.getElementById('consultantPanelModule')?.classList.remove('hidden');

        const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.textContent = v; };
        set('userNameDisplay', cons.full_name || 'Danışman');
        set('userCompanyDisplay', 'Danışman');
        if (email) set('userEmailDisplay', email);
        set('userInitials', (cons.avatar_initials || (cons.full_name || 'D').charAt(0)).toUpperCase());
        document.getElementById('adminPanelCard')?.classList.add('hidden');

        renderConsultantPanel(cons);
    };

    window.consultantSave = async function (submit) {
        if (!window.currentConsultant || !supabaseClient) return;
        const g = (id) => (document.getElementById(id)?.value || '').trim();
        const data = {
            full_name: g('consName'),
            title: g('consTitle'),
            avatar_initials: (g('consInitials') || g('consName').charAt(0) || 'D').toUpperCase().slice(0, 2),
            expertise: g('consExpertise'),
            completed_jobs: parseInt(g('consJobs'), 10) || 0,
            bio: g('consBio'),
            motivation: g('consMotivation'),
            availability: _consAvail,
            updated_at: new Date().toISOString()
        };
        if (submit) {
            if (!data.full_name || !data.title) { alert('Lütfen en az ad soyad ve unvan girin.'); return; }
            data.status = 'pending';
            data.reject_reason = null;
        }
        try {
            const { data: upd, error } = await supabaseClient.from('consultants')
                .update(data).eq('id', window.currentConsultant.id).select().single();
            if (error) throw error;
            window.currentConsultant = upd;
            renderConsultantPanel(upd);
            alert(submit ? 'Profiliniz onaya gönderildi. Admin onayından sonra ziyaretçi sayfasında görüneceksiniz.' : 'Taslak kaydedildi.');
        } catch (e) {
            alert('Kaydedilemedi: ' + (e.message || e));
        }
    };

    // Ziyaretçi listesini sayfa yüklenince hazırla (modül açıldığında hazır olur)
    if (document.getElementById('consultantsRoot')) {
        renderConsultantsList();
    }
})();
