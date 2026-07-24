/* ============================================================================
   about.js — "HAKKIMDA" SAYFASI
   B) İçerik yükleyici · C) Ziyaretçi render · D) Admin düzenleme kartı
   site_content.sql çalıştırılmış olmalıdır. index.html'de EN SONA yüklenir.

   Yeni alan eklemek 3 adım: (1) index.html'e id'li boş etiket,
   (2) ABOUT_SCHEMA'ya bir satır, (3) renderAbout()'a bir doldurma satırı.
   Veritabanında değişiklik gerekmez.
   ============================================================================ */
(function () {
    const BUCKET = 'site-assets';

    // -------------------------------------------------- kod içi varsayılanlar
    const ABOUT_DEFAULTS = {
        about_photo_url: '',
        about_name:      'Hakkımda',
        about_title:     '',
        about_tagline:   '',
        about_location:  '',
        about_edu:       '',
        about_expertise: '',
        about_intro:     'Bu bölüm yönetim panelinden düzenlenir.',
        about_sec1_title: '', about_sec1_body: '',
        about_sec2_title: '', about_sec2_body: '',
        about_sec3_title: '', about_sec3_body: '',
        about_linkedin: '', about_youtube: '', about_instagram: '',
        about_phone: '', about_email: ''
    };

    window.EPC_CONTENT = window.EPC_CONTENT || {};            // veritabanı değerleri
    window.EPC_CONTENT_DEFAULTS = ABOUT_DEFAULTS;

    // Okuyucu: veritabanı → kod varsayılanı → boş
    function C(key) {
        const v = window.EPC_CONTENT[key];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
        const d = ABOUT_DEFAULTS[key];
        return (d === undefined || d === null) ? '' : String(d);
    }
    window.EPC_C = C;

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // KRİTİK: şemasız adres göreli sayılır → 404. Başına https:// ekle.
    function norm(u) {
        const s = String(u || '').trim();
        if (!s) return '';
        if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
        return 'https://' + s;
    }

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
    // boş opsiyonel alanın satırı tamamen gizlensin
    const setRow = (id, val) => {
        const el = document.getElementById(id); if (!el) return;
        const v = String(val || '').trim();
        el.textContent = v;
        const wrap = el.closest('[data-optional]') || el;
        wrap.classList.toggle('hidden', !v);
    };
    // çok satırlı: paragraf boşlukları korunsun
    const setMultiline = (id, val) => {
        const el = document.getElementById(id); if (!el) return;
        const v = String(val || '').trim();
        el.innerHTML = v ? esc(v).replace(/\r?\n/g, '<br>') : '';
        const wrap = el.closest('[data-optional]') || el;
        wrap.classList.toggle('hidden', !v);
    };

    // -------------------------------------------------- B) İÇERİK YÜKLEYİCİ
    window.loadSiteContent = async function () {
        if (!window.supabaseClient) return;
        try {
            const { data, error } = await supabaseClient.from('site_content').select('key,value');
            if (error) throw error;
            (data || []).forEach(r => { window.EPC_CONTENT[r.key] = r.value; });
        } catch (e) { /* tablo yoksa varsayılanlarla devam */ }
        try { window.dispatchEvent(new Event('epc-content-loaded')); } catch (e) {}
        // Yarış durumu: sayfa zaten açıksa yeniden çiz
        const m = document.getElementById('aboutModule');
        if (m && !m.classList.contains('hidden')) renderAbout();
    };

    // -------------------------------------------------- C) ZİYARETÇİ RENDER
    function renderAbout() {
        // kimlik
        const name = C('about_name');
        setTxt('abName', name);
        setRow('abTitle', C('about_title'));
        setRow('abTagline', C('about_tagline'));
        setRow('abLocation', C('about_location'));
        setRow('abEdu', C('about_edu'));
        setMultiline('abIntro', C('about_intro'));

        // fotoğraf / baş harf bloğu
        const url = C('about_photo_url'), img = document.getElementById('abPhoto'), ini = document.getElementById('abInitials');
        if (url && img) {
            img.src = url; img.classList.remove('hidden');
            if (ini) ini.classList.add('hidden');
        } else {
            if (img) img.classList.add('hidden');
            if (ini) {
                ini.classList.remove('hidden');
                ini.textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
            }
        }

        // uzmanlık rozetleri (virgülle ayrılmış tek metin)
        const exBox = document.getElementById('abExpertise');
        if (exBox) {
            const tags = C('about_expertise').split(',').map(s => s.trim()).filter(Boolean);
            exBox.innerHTML = tags.map(t =>
                `<span class="inline-block bg-white/15 border border-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full">${esc(t)}</span>`).join('');
            exBox.classList.toggle('hidden', !tags.length);
        }

        // üç içerik bölümü
        [1, 2, 3].forEach(i => {
            const t = C('about_sec' + i + '_title'), b = C('about_sec' + i + '_body');
            const wrap = document.getElementById('abSec' + i);
            if (wrap) wrap.classList.toggle('hidden', !(t || b));
            setTxt('abSec' + i + 'Title', t);
            setMultiline('abSec' + i + 'Body', b);
        });

        // iletişim kartları — yalnız dolu olanlar üretilir
        const cBox = document.getElementById('abContact');
        if (cBox) {
            const items = [
                ['about_linkedin',  '💼', 'LinkedIn',  true],
                ['about_youtube',   '▶️', 'YouTube',   true],
                ['about_instagram', '📸', 'Instagram', true],
                ['about_phone',     '📞', 'Telefon',   false],
                ['about_email',     '✉️', 'E-posta',   false]
            ];
            const cards = items.map(([k, icon, label, external]) => {
                const raw = C(k); if (!raw) return '';
                let href, target = '';
                if (k === 'about_phone') href = 'tel:' + raw.replace(/\s/g, '');
                else if (k === 'about_email') href = 'mailto:' + raw;
                else { href = norm(raw); target = ' target="_blank" rel="noopener noreferrer"'; }
                return `<a href="${esc(href)}"${target} class="group flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-md transition">
                    <span class="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition">${icon}</span>
                    <span class="min-w-0">
                        <span class="block text-[11px] uppercase tracking-wider text-slate-400 font-bold">${label}</span>
                        <span class="block text-sm font-bold text-slate-700 truncate">${esc(raw)}</span>
                    </span>
                </a>`;
            }).filter(Boolean);
            cBox.innerHTML = cards.join('');
            const sec = document.getElementById('abContactSection');
            if (sec) sec.classList.toggle('hidden', !cards.length);
        }
    }
    window.renderAbout = renderAbout;

    // Ziyaretçi sayfasından açılış
    window.openAboutPage = function () {
        if (typeof openPublicModule === 'function') openPublicModule('aboutModule');
        renderAbout();
        if (window.location.hash !== '#hakkimda') window.location.hash = '#hakkimda';
    };

    // -------------------------------------------------- D) ADMİN DÜZENLEME KARTI
    const ABOUT_SCHEMA = [
        ['about_photo_url', 'Profil Fotoğrafı', 'image'],
        ['about_name',      'Ad Soyad',         'text'],
        ['about_title',     'Unvan',            'text'],
        ['about_tagline',   'Kısa Slogan',      'text'],
        ['about_location',  'Konum',            'text'],
        ['about_edu',       'Eğitim / Sertifika', 'text'],
        ['about_expertise', 'Uzmanlık Alanları (virgülle ayırın)', 'text'],
        ['about_intro',     'Giriş Paragrafı',  'area'],
        ['about_sec1_title', '1. Bölüm Başlığı', 'text'],
        ['about_sec1_body',  '1. Bölüm Metni',   'area'],
        ['about_sec2_title', '2. Bölüm Başlığı', 'text'],
        ['about_sec2_body',  '2. Bölüm Metni',   'area'],
        ['about_sec3_title', '3. Bölüm Başlığı', 'text'],
        ['about_sec3_body',  '3. Bölüm Metni',   'area'],
        ['about_linkedin',  'LinkedIn adresi',  'text'],
        ['about_youtube',   'YouTube adresi',   'text'],
        ['about_instagram', 'Instagram adresi', 'text'],
        ['about_phone',     'Telefon',          'text'],
        ['about_email',     'E-posta',          'text']
    ];

    window.renderAboutAdmin = function () {
        const host = document.getElementById('adminPaneContent') || document.getElementById('adminModule');
        if (!host || document.getElementById('aboutAdminCard')) return;
        const card = document.createElement('div');
        card.id = 'aboutAdminCard';
        card.className = 'bg-white border border-slate-200 rounded-xl p-5';
        card.innerHTML = `
            <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h3 class="font-black text-slate-800">👤 Hakkımda Sayfası</h3>
                <button onclick="openAboutPage()" class="text-xs font-bold text-indigo-600 hover:underline">Sayfayı gör →</button>
            </div>
            <p class="text-xs text-slate-400 mb-4">Buradaki içerik ziyaretçi sayfasındaki Hakkımda bölümünde görünür. Boş bıraktığınız alanlar sayfada hiç gösterilmez.</p>
            <div id="aboutAdminFields" class="space-y-3"></div>
            <div class="flex items-center gap-3 mt-4">
                <button onclick="saveAboutContent()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-2.5 rounded-lg">Kaydet</button>
                <span id="aboutSaveMsg" class="text-sm"></span>
            </div>`;
        host.appendChild(card);

        const box = document.getElementById('aboutAdminFields');
        box.innerHTML = ABOUT_SCHEMA.map(([key, label, type]) => {
            const val = window.EPC_CONTENT[key] != null ? window.EPC_CONTENT[key] : '';
            if (type === 'image') {
                return `<div class="border border-slate-100 rounded-lg p-3">
                    <label class="block text-xs font-bold text-slate-600 mb-2">${label}</label>
                    <div class="flex items-center gap-3 flex-wrap">
                        <div id="abAdmPrev" class="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-slate-400 text-xs shrink-0">
                            ${val ? `<img src="${esc(val)}" class="w-full h-full object-cover">` : 'yok'}
                        </div>
                        <div>
                            <input type="file" accept="image/*" onchange="aboutUploadPhoto(this)" class="block text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:cursor-pointer">
                            <p id="abUploadMsg" class="text-[11px] text-slate-400 mt-1">JPG/PNG · yükledikten sonra <b>Kaydet</b>'e basın.</p>
                        </div>
                    </div>
                    <input type="hidden" id="fld_${key}" value="${esc(val)}">
                </div>`;
            }
            if (type === 'area') {
                return `<div><label class="block text-xs font-bold text-slate-600 mb-1">${label}</label>
                    <textarea id="fld_${key}" rows="4" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">${esc(val)}</textarea></div>`;
            }
            return `<div><label class="block text-xs font-bold text-slate-600 mb-1">${label}</label>
                <input id="fld_${key}" type="text" value="${esc(val)}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>`;
        }).join('');
    };

    // Fotoğraf yükleme — zaman damgalı ad (tarayıcı önbelleği eski fotoğrafı göstermesin)
    window.aboutUploadPhoto = async function (input) {
        const f = input.files && input.files[0];
        const msg = document.getElementById('abUploadMsg');
        if (!f || !window.supabaseClient) return;
        if (msg) { msg.textContent = 'Yükleniyor...'; msg.className = 'text-[11px] text-slate-500 mt-1'; }
        try {
            const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
            const path = 'about/profile-' + Date.now() + '.' + ext;
            const { error } = await supabaseClient.storage.from(BUCKET).upload(path, f, { upsert: true, cacheControl: '3600' });
            if (error) throw error;
            const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(path);
            const url = data && data.publicUrl ? data.publicUrl : '';
            const hidden = document.getElementById('fld_about_photo_url');
            if (hidden) hidden.value = url;
            const prev = document.getElementById('abAdmPrev');
            if (prev) prev.innerHTML = `<img src="${url}" class="w-full h-full object-cover">`;
            if (msg) { msg.innerHTML = '✅ Yüklendi — <b>Kaydet</b>\'e basmayı unutmayın.'; msg.className = 'text-[11px] text-emerald-600 mt-1'; }
        } catch (e) {
            if (msg) { msg.textContent = 'Yüklenemedi: ' + (e.message || e); msg.className = 'text-[11px] text-red-500 mt-1'; }
        }
    };

    window.saveAboutContent = async function () {
        const msg = document.getElementById('aboutSaveMsg');
        if (!window.supabaseClient) return;
        const rows = ABOUT_SCHEMA.map(([key]) => {
            const el = document.getElementById('fld_' + key);
            return { key, value: el ? el.value : '', updated_at: new Date().toISOString() };
        });
        if (msg) { msg.textContent = 'Kaydediliyor...'; msg.className = 'text-sm text-slate-400'; }
        try {
            const { error } = await supabaseClient.from('site_content').upsert(rows, { onConflict: 'key' });
            if (error) throw error;
            rows.forEach(r => { window.EPC_CONTENT[r.key] = r.value; });   // bellekteki sözlüğü de güncelle
            renderAbout();                                                // sayfa yenilenmeden yansısın
            if (msg) { msg.textContent = '✅ Kaydedildi'; msg.className = 'text-sm text-emerald-600 font-bold'; }
        } catch (e) {
            if (msg) { msg.textContent = 'Kaydedilemedi: ' + (e.message || e); msg.className = 'text-sm text-red-500'; }
        }
    };

    // -------------------------------------------------- başlangıç
    (function boot() {
        let tries = 0;
        const tick = () => {
            if (window.supabaseClient) { loadSiteContent(); return; }
            if (++tries < 40) setTimeout(tick, 250);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(tick, 200));
        else setTimeout(tick, 200);
    })();
})();
