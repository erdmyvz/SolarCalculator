/* ============================================================================
   documents.js — PROJE BAZLI EVRAK DEPOSU
   Tesis kartındaki "📁 Evraklar" butonundan açılır.
   Dosyalar ÖZEL kovada (project-docs); indirme imzalı bağlantı ile yapılır.
   project_documents.sql çalıştırılmış olmalıdır.
   ============================================================================ */
(function () {
    const BUCKET = 'project-docs';
    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s) : String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

    const CATS = [
        ['basvuru',   '📄 Başvuru & Dilekçe'],
        ['proje',     '📐 Proje & Çizim'],
        ['sozlesme',  '📝 Sözleşme'],
        ['fatura',    '🧾 Fatura & Ödeme'],
        ['ruhsat',    '🏛️ Ruhsat & Onay'],
        ['kabul',     '✅ Kabul & Devreye Alma'],
        ['fotograf',  '📷 Saha Fotoğrafı'],
        ['diger',     '📁 Diğer']
    ];
    const catLabel = (v) => (CATS.find(c => c[0] === v) || ['', '📁 Diğer'])[1];

    let _proj = null, _docs = [];

    const humanSize = (b) => {
        const n = Number(b) || 0;
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
        return (n / 1048576).toFixed(1) + ' MB';
    };

    function modal() {
        let m = document.getElementById('docsModal');
        if (!m) {
            m = document.createElement('div'); m.id = 'docsModal'; document.body.appendChild(m);
            m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
        }
        return m;
    }

    window.openProjectDocs = async function (projectId, facilityCode, customerName) {
        if (!window.supabaseClient) return;
        _proj = { id: projectId, code: facilityCode || '', customer: customerName || '' };
        const m = modal();
        m.className = 'fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4 overflow-y-auto';
        m.innerHTML = `<div class="bg-white rounded-2xl w-full max-w-2xl my-8">
            <div class="flex items-start justify-between px-6 pt-6 pb-3 gap-3">
                <div class="min-w-0">
                    <h3 class="font-black text-lg text-slate-800">📁 Evraklar</h3>
                    <p class="text-xs text-slate-500 truncate">${esc(_proj.code)}${_proj.customer ? ' · ' + esc(_proj.customer) : ''}</p>
                </div>
                <button onclick="document.getElementById('docsModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 text-xl leading-none shrink-0">✕</button>
            </div>
            <div class="px-6 pb-6">
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                        <select id="docCat" class="border border-slate-300 p-2.5 rounded-lg text-sm bg-white">
                            ${CATS.map(c => `<option value="${c[0]}">${c[1]}</option>`).join('')}
                        </select>
                        <input type="file" id="docFile" class="text-xs file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold file:cursor-pointer">
                    </div>
                    <button onclick="uploadProjectDoc()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-sm">Yükle</button>
                    <div id="docUploadMsg" class="mt-2"></div>
                </div>
                <div id="docList"><p class="text-sm text-slate-400">Yükleniyor...</p></div>
            </div>
        </div>`;
        m.classList.remove('hidden');
        await loadDocs();
    };

    async function loadDocs() {
        const box = document.getElementById('docList'); if (!box) return;
        try {
            const { data, error } = await supabaseClient.from('project_documents')
                .select('*').eq('project_id', _proj.id).order('created_at', { ascending: false });
            if (error) throw error;
            _docs = data || [];
        } catch (e) {
            box.innerHTML = `<p class="text-sm text-red-500">Liste yüklenemedi: ${esc(e.message || e)}</p>`;
            return;
        }
        if (!_docs.length) {
            box.innerHTML = '<div class="text-center py-8"><div class="text-3xl mb-2">📂</div><p class="text-sm font-bold text-slate-600">Henüz evrak yok</p><p class="text-xs text-slate-400 mt-1">Yukarıdan ilk evrağı yükleyebilirsiniz.</p></div>';
            return;
        }
        // kategoriye göre grupla
        const groups = {};
        _docs.forEach(d => { (groups[d.category] = groups[d.category] || []).push(d); });
        box.innerHTML = `<p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">${_docs.length} evrak</p>` +
            Object.keys(groups).map(cat => `
                <div class="mb-3">
                    <p class="text-xs font-black text-slate-600 mb-1">${catLabel(cat)}</p>
                    ${groups[cat].map(d => `
                        <div class="flex items-center justify-between gap-3 border border-slate-100 rounded-lg p-3 mb-1.5">
                            <div class="min-w-0">
                                <p class="text-sm font-bold text-slate-800 truncate">${esc(d.name)}</p>
                                <p class="text-[11px] text-slate-400">${humanSize(d.file_size)} · ${new Date(d.created_at).toLocaleDateString('tr-TR')}${d.uploaded_by_name ? ' · ' + esc(d.uploaded_by_name) : ''}</p>
                            </div>
                            <div class="flex gap-1.5 shrink-0">
                                <button onclick="downloadProjectDoc('${d.id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg">İndir</button>
                                <button onclick="deleteProjectDoc('${d.id}')" title="Sil" class="text-slate-400 hover:text-red-600 px-1.5">🗑️</button>
                            </div>
                        </div>`).join('')}
                </div>`).join('');
    }

    window.uploadProjectDoc = async function () {
        const msg = document.getElementById('docUploadMsg');
        const input = document.getElementById('docFile');
        const f = input && input.files && input.files[0];
        if (!f) { msg.innerHTML = '<p class="text-xs text-red-500">Dosya seçin.</p>'; return; }
        if (f.size > 20 * 1024 * 1024) { msg.innerHTML = '<p class="text-xs text-red-500">Dosya 20 MB\'tan büyük olamaz.</p>'; return; }
        msg.innerHTML = '<p class="text-xs text-slate-500">Yükleniyor...</p>';
        try {
            // proje sahibi firma (RLS ile uyumlu klasör)
            let companyId = (window.currentUserProfile && window.currentUserProfile.company_id) || null;
            try {
                const { data } = await supabaseClient.rpc('get_project_company', { p_project_id: _proj.id });
                if (data) companyId = data;
            } catch (e) {}
            if (!companyId) throw new Error('Firma bilgisi bulunamadı.');

            const safeName = f.name.replace(/[^\w.\-]+/g, '_');
            const path = `${companyId}/${_proj.id}/${Date.now()}-${safeName}`;
            const { error: upErr } = await supabaseClient.storage.from(BUCKET).upload(path, f, { upsert: false });
            if (upErr) throw upErr;

            const { data: ud } = await supabaseClient.auth.getUser();
            const uname = (window.currentUserProfile && (window.currentUserProfile.first_name || '') + ' ' + (window.currentUserProfile.last_name || '')).trim()
                || (ud && ud.user ? ud.user.email : '');

            const { error: insErr } = await supabaseClient.from('project_documents').insert({
                project_id: _proj.id, company_id: companyId,
                name: f.name, category: document.getElementById('docCat').value,
                file_path: path, file_size: f.size, mime_type: f.type || null,
                uploaded_by: ud && ud.user ? ud.user.id : null, uploaded_by_name: uname || null
            });
            if (insErr) throw insErr;

            input.value = '';
            msg.innerHTML = '<p class="text-xs text-emerald-600 font-bold">✅ Yüklendi</p>';
            await loadDocs();
        } catch (e) {
            msg.innerHTML = `<p class="text-xs text-red-500">Yüklenemedi: ${esc(e.message || e)}</p>`;
        }
    };

    window.downloadProjectDoc = async function (id) {
        const d = _docs.find(x => String(x.id) === String(id)); if (!d) return;
        try {
            const { data, error } = await supabaseClient.storage.from(BUCKET).createSignedUrl(d.file_path, 120);
            if (error) throw error;
            window.open(data.signedUrl, '_blank', 'noopener');
        } catch (e) { alert('İndirilemedi: ' + (e.message || e)); }
    };

    window.deleteProjectDoc = async function (id) {
        const d = _docs.find(x => String(x.id) === String(id)); if (!d) return;
        if (!confirm(`"${d.name}" silinecek. Emin misiniz?`)) return;
        try {
            await supabaseClient.storage.from(BUCKET).remove([d.file_path]);
            const { error } = await supabaseClient.from('project_documents').delete().eq('id', id);
            if (error) throw error;
            await loadDocs();
        } catch (e) { alert('Silinemedi: ' + (e.message || e)); }
    };
})();
