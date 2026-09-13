/* ============================================================================
   projects.js — TESİSLERİM EKRANI
   Firmanın kurulumu tamamlanan tesislerini (projects) ve GES kodlarını listeler.
   RLS sayesinde yalnız kendi tesisleri gelir.

   ⚠️ GÜVENLİK NOTU: bu ekran eskiden müşteri adını doğrudan bir onclick
   özniteliğinin içine gömüyordu. admEscape tek tırnağı &#39; yapıyor ama
   tarayıcı özniteliği ÖNCE HTML çözüyor, SONRA JS ayrıştırıyor: &#39; yeniden
   ' oluyor ve dizgiyi kapatıyordu. Müşteri adı başvuru formundan geldiği için
   bu, dışarıdan kod çalıştırma yoluydu. Artık veri onclick'e HİÇ gömülmüyor;
   data-* özniteliği + olay devri kullanılıyor.
   ============================================================================ */
(function () {
    let _tesisler = [];
    let _hata = null;

    // --- Menü kartı: Tesislerim ekranını aç ---
    document.getElementById('btnGoProjects')?.addEventListener('click', () => {
        window.openedFromPublic = false;
        document.getElementById('mainMenu').classList.add('hidden');
        document.getElementById('projectsModule').classList.remove('hidden');
        loadProjects();
    });

    document.getElementById('btnBackToMenuFromProjects')?.addEventListener('click', () => {
        document.getElementById('projectsModule')?.classList.add('hidden');
        closeAllAndShowMenu();
    });

    document.getElementById('btnRefreshProjects')?.addEventListener('click', () => loadProjects());

    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s) : String(s == null ? '' : s));
    const fmt = (n) => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString('tr-TR');

    // Durum etiketi: ham slug basılıyordu ("KURULUM_BASLADI"). Uygulamanın geri
    // kalanıyla aynı sözlüğü kullanıyoruz.
    function durumEtiketi(s) {
        if (typeof stageLabel === 'function') { const t = stageLabel(s); if (t) return t; }
        if (typeof crmStatusLabels !== 'undefined' && crmStatusLabels[s]) return crmStatusLabels[s].text;
        return s ? String(s).replace(/_/g, ' ') : 'Durum yok';
    }

    async function loadProjects() {
        if (!supabaseClient) return;
        const box = document.getElementById('projectsList');
        if (!box) return;
        box.innerHTML = '<p class="text-slate-400 text-sm">Yükleniyor...</p>';

        const { data, error } = await supabaseClient
            .from('projects').select('*').order('created_at', { ascending: false });

        if (error) { _hata = error.message; _tesisler = []; }
        else { _hata = null; _tesisler = data || []; }
        cizListe();
    }

    function aramaEslesti(p, q) {
        if (!q) return true;
        return [p.facility_code, p.customer_name, p.address, p.inverter_model, p.battery_model]
            .some(v => String(v || '').toLocaleLowerCase('tr-TR').includes(q));
    }

    function cizListe() {
        const box = document.getElementById('projectsList');
        if (!box) return;

        if (_hata) {
            box.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm"><b>Yüklenemedi:</b> ${esc(_hata)}</div>`;
            return;
        }
        if (!_tesisler.length) {
            // "7. Bitti" YAZIYORDU. Süreç adımlarını yönetici tanımlıyor; o
            // isimde bir adım yok. Gerçek son adımın adını basıyoruz.
            const steps = (typeof _processSteps !== 'undefined' && _processSteps) || [];
            const son = steps.length ? `${steps[steps.length - 1].step_no || steps.length}. ${esc(steps[steps.length - 1].title)}` : 'son';
            box.innerHTML = `<div class="kart bos-durum"><span class="bos-durum-ico">☀️</span>
                <h4>Henüz tesis kaydınız yok</h4>
                <p>CRM'de bir müşteriyi <b>${son}</b> adımına getirip "Tesis Oluştur" dediğinizde tesis burada görünür ve yatırımcının hesabına bağlanır.</p></div>`;
            return;
        }

        const q = (document.getElementById('prjArama')?.value || '').trim().toLocaleLowerCase('tr-TR');
        const liste = _tesisler.filter(p => aramaEslesti(p, q));

        // Özet: firma "kaç tesis, toplam kaç kWp" sorusunu listeyi toplayarak
        // cevaplıyordu.
        const toplamKwp = _tesisler.reduce((a, p) => a + (Number(p.system_kwp) || 0), 0);
        const toplamPanel = _tesisler.reduce((a, p) => a + (Number(p.panel_count) || 0), 0);
        const ozet = `
            <div class="kart flex items-center gap-4 flex-wrap text-xs mb-4" style="padding:var(--s3) var(--s4)">
                <span class="font-black text-slate-700">☀️ Özet</span>
                <span class="text-slate-500">Tesis: <strong class="text-slate-800">${_tesisler.length}</strong></span>
                ${toplamKwp ? `<span class="text-slate-500">Toplam kurulu güç: <strong class="text-emerald-700">${fmt(toplamKwp)} kWp</strong></span>` : ''}
                ${toplamPanel ? `<span class="text-slate-500">Panel: <strong class="text-slate-800">${toplamPanel.toLocaleString('tr-TR')}</strong></span>` : ''}
                <span class="ml-auto text-slate-400">${liste.length === _tesisler.length ? '' : liste.length + ' / ' + _tesisler.length + ' gösteriliyor'}</span>
            </div>`;

        const arama = `
            <div class="kart mb-4" style="padding:var(--s3) var(--s4)">
                <label class="arama" style="max-width:100%"><input id="prjArama" type="search" autocomplete="off"
                    value="${esc(document.getElementById('prjArama')?.value || '')}"
                    placeholder="GES kodu, müşteri, adres veya cihaz"></label>
            </div>`;

        const kartlar = liste.length ? liste.map(p => {
            const inst = p.install_date ? new Date(p.install_date).toLocaleDateString('tr-TR') : '—';
            const specs = [];
            if (p.system_kwp)     specs.push(`${fmt(p.system_kwp)} kWp`);
            if (p.panel_count)    specs.push(`${p.panel_count} panel`);
            if (p.inverter_model) specs.push(esc(p.inverter_model));
            if (p.battery_model)  specs.push('🔋 ' + esc(p.battery_model));
            const specStr = specs.length ? specs.join(' · ') : 'Teknik detay girilmemiş';

            // ⚠️ Hiçbir değer onclick'in içine gömülmüyor; data-* ile taşınıyor.
            return `
                <div class="kart p-5 mb-3">
                    <div class="flex justify-between items-start gap-3 flex-wrap">
                        <div class="min-w-0">
                            <div class="font-mono text-lg font-black text-emerald-700">☀️ ${esc(p.facility_code)}</div>
                            <div class="font-bold text-slate-800 mt-1">${esc(p.customer_name)}</div>
                            <p class="text-xs text-slate-500 mt-1">📍 ${esc(p.address) || 'Adres girilmemiş'}</p>
                            <p class="text-[11px] text-slate-500 mt-2 bg-slate-50 border border-slate-100 rounded px-2 py-1 inline-block">${specStr}</p>
                        </div>
                        <div class="text-right whitespace-nowrap shrink-0">
                            <span class="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">${esc(durumEtiketi(p.status))}</span>
                            <p class="text-[10px] text-slate-400 mt-2">Kurulum: ${inst}</p>
                            <div class="flex gap-1.5 justify-end mt-2">
                                <button type="button" class="prj-eylem bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg text-[11px] font-bold"
                                        data-eylem="evrak" data-id="${esc(p.id)}" data-kod="${esc(p.facility_code)}" data-ad="${esc(p.customer_name)}">📁 Evraklar</button>
                                <button type="button" class="prj-eylem bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-[11px] font-bold"
                                        data-eylem="kopyala" data-kod="${esc(p.facility_code)}">Kodu Kopyala</button>
                            </div>
                        </div>
                    </div>
                </div>`;
        }).join('') : `<div class="kart bos-durum"><span class="bos-durum-ico">🔍</span>
                <h4>Eşleşen tesis yok</h4><p>${_tesisler.length} tesisiniz var ama aramaya uyan yok.</p></div>`;

        box.innerHTML = ozet + arama + kartlar;

        const ara = document.getElementById('prjArama');
        if (ara) {
            let z = null;
            ara.addEventListener('input', () => { clearTimeout(z); z = setTimeout(cizListe, 180); });
            ara.addEventListener('search', cizListe);
            if (q) { ara.focus(); ara.setSelectionRange(ara.value.length, ara.value.length); }
        }
    }

    // Tek dinleyici, tüm kartlar için (olay devri).
    document.getElementById('projectsList')?.addEventListener('click', (e) => {
        const b = e.target.closest('.prj-eylem');
        if (!b) return;
        if (b.dataset.eylem === 'kopyala') {
            if (typeof crmCopyText === 'function') crmCopyText(b.dataset.kod);
        } else if (b.dataset.eylem === 'evrak') {
            if (typeof openProjectDocs === 'function') openProjectDocs(b.dataset.id, b.dataset.kod, b.dataset.ad);
        }
    });

    window.loadProjects = loadProjects;
})();
