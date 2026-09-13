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

    let _talepler = [], _hata = null;

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

    // ⚠️ TIRNAK DA KAÇIRILMALI. Buradaki esc() yalnız & < > kaçırıyordu ama
    // değer bir öznitelik içinde basılıyor: value="${esc(...)}".
    // Firmanın yazdığı  Müşteri "arıza yok" dedi  gibi bir yanıt, ikinci
    // tırnakta özniteliği kapatıyor ve metnin geri kalanı EKRANDAN KAYBOLUYORDU.
    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s)
        : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

    const tarihKisa = (d) => {
        if (!d) return '—';
        const t = new Date(d);
        return isFinite(t.getTime()) ? t.toLocaleDateString('tr-TR') : esc(d);
    };

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
        const { data, error } = await supabaseClient
            .from('service_requests').select('*').order('created_at', { ascending: false });
        if (error) { _hata = error.message; _talepler = []; }
        else { _hata = null; _talepler = data || []; }
        ciz();
    }

    function eslesti(t, q) {
        if (!q) return true;
        return [t.tracking_code, t.full_name, t.phone, t.email, t.address, t.problem_desc, t.inverter_model]
            .some(v => String(v || '').toLocaleLowerCase('tr-TR').includes(q));
    }

    // Yeniden çizmeden ÖNCE, kaydedilmemiş yanıt taslaklarını topla.
    // Firma birden çok talebe yanıt yazıp birini kaydettiğinde diğerlerinin
    // yazdıkları siliniyordu; arama yapınca da aynısı oluyordu.
    function taslaklariTopla() {
        const out = {};
        document.querySelectorAll('textarea[id^="svcresp_"]').forEach(el => {
            const id = el.id.slice('svcresp_'.length);
            const t = _talepler.find(x => String(x.id) === id);
            const kayitli = (t && t.admin_response) || '';
            if (el.value !== kayitli) out[id] = el.value;     // yalnız DEĞİŞMİŞ olanlar
        });
        return out;
    }
    function taslaklariGeriYaz(taslak) {
        Object.keys(taslak).forEach(id => {
            const el = document.getElementById('svcresp_' + id);
            if (el) el.value = taslak[id];
        });
    }

    function ciz() {
        const taslak = taslaklariTopla();
        if (_hata) {
            root.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm"><b>Yüklenemedi:</b> ${esc(_hata)}</div>`;
            return;
        }
        if (!_talepler.length) {
            root.innerHTML = `<div class="kart bos-durum"><span class="bos-durum-ico">🔧</span>
                <h4>Atanmış servis talebi yok</h4>
                <p>Merkezi havuzdan firmanıza bir bakım, temizlik veya arıza talebi atandığında burada görünür.</p></div>`;
            return;
        }

        const q = (document.getElementById('svcArama')?.value || '').trim().toLocaleLowerCase('tr-TR');
        const durum = document.getElementById('svcDurum')?.value || 'acik';
        const liste = _talepler.filter(t => {
            if (!eslesti(t, q)) return false;
            if (durum === 'acik') return t.status !== 'tamamlandi';
            if (durum === 'all') return true;
            return t.status === durum;
        });

        const acik = _talepler.filter(t => t.status !== 'tamamlandi').length;
        const bekleyen = _talepler.filter(t => t.status === 'basvuru_iletildi').length;

        const ust = `
            <div class="kart flex items-center gap-4 flex-wrap text-xs mb-4" style="padding:var(--s3) var(--s4)">
                <span class="font-black text-slate-700">🔧 Özet</span>
                <span class="text-slate-500">Toplam: <strong class="text-slate-800">${_talepler.length}</strong></span>
                <span class="text-slate-500">Açık: <strong class="text-amber-700">${acik}</strong></span>
                ${bekleyen ? `<span class="text-slate-500">Henüz incelenmedi: <strong class="text-red-600">${bekleyen}</strong></span>` : ''}
                <span class="text-slate-500">Tamamlanan: <strong class="text-emerald-700">${_talepler.length - acik}</strong></span>
            </div>
            <div class="kart mb-4" style="padding:var(--s3) var(--s4)">
                <div class="flex items-center gap-2 flex-wrap">
                    <label class="arama"><input id="svcArama" type="search" autocomplete="off"
                        value="${esc(document.getElementById('svcArama')?.value || '')}"
                        placeholder="Takip kodu, müşteri, telefon veya sorun"></label>
                    <select id="svcDurum" class="p-2 rounded-lg text-xs border border-slate-300 bg-white">
                        <option value="acik" ${durum === 'acik' ? 'selected' : ''}>Açık talepler</option>
                        <option value="all" ${durum === 'all' ? 'selected' : ''}>Tümü</option>
                        ${Object.entries(statusMap).map(([k, v]) => `<option value="${k}" ${durum === k ? 'selected' : ''}>${v.t}</option>`).join('')}
                    </select>
                    <span class="text-xs font-bold text-slate-400 ml-auto">${liste.length} kayıt</span>
                </div>
            </div>`;

        // openStorageImage admin.js'te tanımlı. Paket eksik yüklenirse düğme
        // sessizce patlamasın diye varlığını kontrol ediyoruz.
        const gorselVar = typeof window.openStorageImage === 'function';
        const imgBtn = (path, label) => (path && gorselVar)
            ? `<button type="button" class="svc-gorsel bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-[10px] font-bold" data-yol="${esc(path)}">${label}</button>`
            : '';

        const kartlar = liste.length ? liste.map(t => {
            const st = statusMap[t.status] || { t: t.status, c: 'bg-slate-100 text-slate-700' };
            const dateStr = new Date(t.created_at).toLocaleString('tr-TR');
            const gun = Math.floor((Date.now() - new Date(t.created_at).getTime()) / 86400000);
            const bekleme = (t.status !== 'tamamlandi' && isFinite(gun) && gun >= 3)
                ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${gun >= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}" title="${gun} gündür açık">⏳ ${gun} gün</span>` : '';
            const media = [imgBtn(t.img_system, '📸 Sistem'), imgBtn(t.img_pano, '⚡ Pano'), imgBtn(t.img_ges, '☀️ GES Pano'), imgBtn(t.img_code, '⚠️ Hata Kodu')].join('');
            const tel = String(t.phone || '').replace(/[^\d+]/g, '');
            return `
                <div class="kart p-5 mb-3 text-xs">
                    <div class="flex justify-between items-center border-b border-slate-100 pb-3 mb-3 flex-wrap gap-2">
                        <div class="flex items-center gap-3 flex-wrap">
                            <span class="bg-slate-900 text-white font-mono px-2 py-1 rounded">${esc(t.tracking_code)}</span>
                            <strong class="text-slate-800 text-base">${esc(t.full_name)}</strong>
                            <span class="text-[11px] font-bold text-slate-500">${typeLabels[t.request_type] || esc(t.request_type)}</span>
                            <span class="text-[10px] text-slate-400">🕒 ${dateStr}</span>
                            ${bekleme}
                        </div>
                        <span class="${st.c} font-bold px-3 py-1 rounded-full text-[10px] tracking-widest uppercase">${esc(st.t)}</span>
                    </div>

                    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 bg-slate-50 p-4 rounded-lg border border-slate-100 text-[11px] text-slate-700">
                        <p><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">İletişim</strong>
                           ${tel ? `<a href="tel:${esc(tel)}" class="text-emerald-700 font-bold">📞 ${esc(t.phone)}</a>` : '📞 —'}<br>
                           ${t.email ? `<a href="mailto:${esc(t.email)}" class="text-indigo-700">✉️ ${esc(t.email)}</a>` : '✉️ —'}</p>
                        <p><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Donanım</strong>${esc(t.inverter_model) || 'Belirtilmedi'}<br>${esc(t.battery_model) || 'Batarya yok'}</p>
                        <p><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Kurulum Firması</strong>${esc(t.installer_name) || 'Bilinmiyor'}</p>
                        <p><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Tarihler</strong>Kurulum: ${tarihKisa(t.install_date)}<br>Sorun: ${tarihKisa(t.problem_date)}</p>
                        <p class="col-span-2"><strong class="block text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Açık Adres</strong>${esc(t.address) || 'Belirtilmedi'}</p>
                    </div>

                    <p class="text-slate-700 mb-3 border-l-4 border-amber-400 pl-3 py-1 bg-amber-50/50 rounded-r font-medium whitespace-pre-line">${esc(t.problem_desc) || 'Açıklama girilmemiş.'}</p>

                    ${media.trim() ? `<div class="flex gap-2 mb-4 flex-wrap">${media}</div>` : ''}

                    <div class="pt-3 border-t border-slate-100">
                        <div class="flex gap-2 items-center flex-wrap mb-2">
                            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Durum</span>
                            <select id="svcstatus_${esc(t.id)}" class="border border-slate-300 p-2 rounded-lg text-xs bg-white">${statusOptions(t.status)}</select>
                            <button type="button" class="svc-kaydet btn-birincil ml-auto" data-id="${esc(t.id)}">Kaydet</button>
                        </div>
                        <textarea id="svcresp_${esc(t.id)}" rows="2"
                            placeholder="Müşteriye yanıt — takip ekranında görünür (örn. Cuma 14:00 için planlandı)."
                            class="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-amber-500">${esc(t.admin_response)}</textarea>
                    </div>
                </div>`;
        }).join('') : `<div class="kart bos-durum"><span class="bos-durum-ico">🔍</span>
            <h4>Eşleşen talep yok</h4><p>Arama veya durum filtresine uyan kayıt bulunamadı.</p></div>`;

        root.innerHTML = ust + kartlar;
        taslaklariGeriYaz(taslak);

        const ara = document.getElementById('svcArama');
        if (ara) {
            let z = null;
            ara.addEventListener('input', () => { clearTimeout(z); z = setTimeout(ciz, 180); });
            ara.addEventListener('search', ciz);
            if (q) { ara.focus(); ara.setSelectionRange(ara.value.length, ara.value.length); }
        }
        document.getElementById('svcDurum')?.addEventListener('change', ciz);
    }

    // Tek dinleyici (olay devri) — düğmelere veri gömmüyoruz.
    root.addEventListener('click', (e) => {
        const g = e.target.closest('.svc-gorsel');
        if (g) { if (typeof window.openStorageImage === 'function') window.openStorageImage(g.dataset.yol); return; }
        const k = e.target.closest('.svc-kaydet');
        if (k) svcSave(k.dataset.id, k);
    });

    async function svcSave(id, btn) {
        const status = document.getElementById('svcstatus_' + id)?.value;
        const resp = (document.getElementById('svcresp_' + id)?.value || '').trim() || null;
        if (!status) return;
        if (btn) { btn.disabled = true; btn.textContent = 'Kaydediliyor...'; }   // çift tıklama olmasın
        const { error } = await supabaseClient
            .from('service_requests').update({ status, admin_response: resp }).eq('id', id);
        if (btn) { btn.disabled = false; btn.textContent = 'Kaydet'; }
        if (error) { alert('Kaydedilemedi: ' + error.message); return; }

        // ESKİDEN loadServices() çağrılıyordu: tüm liste yeniden çiziliyor ve
        // DİĞER taleplere yazılmış ama henüz kaydedilmemiş yanıtlar siliniyordu.
        // Artık yalnız bellekteki satırı güncelleyip o kartı tazeliyoruz.
        const t = _talepler.find(x => String(x.id) === String(id));
        if (t) { t.status = status; t.admin_response = resp; }
        ciz();   // kaydedilen satırın taslağı artık kayıtlı değere eşit, kendiliğinden düşer
        if (typeof window.epcBildir === 'function') window.epcBildir('Servis talebi güncellendi.');
        else alert('Servis talebi güncellendi.');
    }

    window.svcSave = svcSave;
    window.loadServices = loadServices;
})();
