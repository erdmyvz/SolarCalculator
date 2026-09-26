/* ============================================================================
   uye-yonetimi.js — Admin › Üyeler  (epcmerkezim)
   ----------------------------------------------------------------------------
   Firmalar / Danışmanlar / Tedarikçiler sekmelerini TEK kart bileşeniyle çizer
   ve abonelik kontrollerini (uzat · ayarla · engelle) doğrudan satırın içine
   koyar. Eskiden abonelik ayrı bir sekmedeydi; bir firmayı düzenlemek için
   sekme değiştirmek gerekiyordu.

   ⚠️ E-POSTA: firmalarda profiles."Mail" ve companies.email BOŞ. Gerçek adres
   auth.users'ta; admin_uye_epostalari() RPC'siyle çekilip kimlik üzerinden
   eşleniyor (kurulum: uye-yonetimi.sql). Kayıt tablosundaki e-posta varsa o da
   ayrıca gösterilir — ikisi farklıysa bu, bilinmesi gereken bir bilgidir.

   ⚠️ Eski tabloda "Plan: Deneme" ve "Durum: Aktif" SABİT METİNDİ; veriyle
   ilgisi yoktu ve engelli/süresi dolmuş hesap da "Aktif" görünüyordu.
   Artık rozetler sub_status / sub_ends_at / banned alanlarından üretiliyor.
   ============================================================================ */
(function () {
    'use strict';

    const esc = (s) => (typeof admEscape === 'function' ? admEscape(s) : String(s == null ? '' : s));

    let _epostalar = {};     // auth kimliği -> e-posta
    let _veri = { companies: [], consultants: [], suppliers: [] };

    // -------------------------------------------------------- E-POSTA HARİTASI
    async function epostalariYukle() {
        try {
            const { data, error } = await supabaseClient.rpc('admin_uye_epostalari');
            if (error) throw error;
            _epostalar = {};
            (data || []).forEach(r => { _epostalar[r.id] = r.eposta; });
            return true;
        } catch (e) {
            _epostalar = {};
            return false;                  // RPC yoksa panel yine çalışsın
        }
    }

    // ------------------------------------------------------- ABONELİK ROZETİ --
    // Tek doğru kaynak: banned > süre doldu > active > deneme.
    function abonelikBilgi(s) {
        const end = s.sub_ends_at ? new Date(s.sub_ends_at) : null;
        const gun = end ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null;
        const doldu = gun !== null && gun < 0;
        if (s.banned) return { gun, doldu, cls: 'bg-red-600 text-white', etiket: '⛔ ENGELLİ', end };
        if (doldu)    return { gun, doldu, cls: 'bg-red-100 text-red-700', etiket: 'Süresi Doldu', end };
        if (s.sub_status === 'active') return { gun, doldu, cls: 'bg-emerald-100 text-emerald-700', etiket: 'Aktif', end };
        return { gun, doldu, cls: 'bg-amber-100 text-amber-800', etiket: 'Deneme', end };
    }

    function tarihSatiri(i) {
        if (!i.end) return 'Bitiş tarihi yok';
        const t = i.end.toLocaleDateString('tr-TR');
        if (i.gun === null) return 'Bitiş: ' + t;
        return 'Bitiş: ' + t + (i.gun >= 0 ? ' · ' + i.gun + ' gün kaldı' : ' · ' + Math.abs(i.gun) + ' gün geçti');
    }

    // ------------------------------------------------------------- KART ------
    // tablo: companies | consultants | suppliers
    function kart(x, tablo) {
        const i = abonelikBilgi(x);
        const authPosta = x.__eposta || '';
        const kayitPosta = x.email || '';
        // İkisi de varsa ve FARKLIYSA ikisini birden göster: giriş adresi ile
        // iletişim adresi ayrıştığında e-posta neden ulaşmadığı burada görünür.
        const farkli = authPosta && kayitPosta && authPosta.toLowerCase() !== kayitPosta.toLowerCase();

        const postaHtml = authPosta || kayitPosta
            ? `<div class="text-[11px] mt-0.5 space-y-0.5">
                 ${authPosta ? `<div class="text-slate-600"><span class="text-slate-400">giriş:</span>
                    <a href="mailto:${esc(authPosta)}" class="font-mono hover:underline text-indigo-600">${esc(authPosta)}</a></div>` : ''}
                 ${farkli || (!authPosta && kayitPosta) ? `<div class="text-slate-600"><span class="text-slate-400">kayıt:</span>
                    <a href="mailto:${esc(kayitPosta)}" class="font-mono hover:underline text-slate-600">${esc(kayitPosta)}</a></div>` : ''}
               </div>`
            : `<div class="text-[11px] text-amber-600 mt-0.5">⚠️ E-posta yok — bu hesaba ulaşılamaz</div>`;

        const altBilgi = [x.phone, x.city].filter(Boolean).map(esc).join(' · ');

        return `
        <div class="border ${x.banned ? 'border-red-200 bg-red-50/30' : 'border-slate-200'} rounded-xl p-3.5 mb-2" data-uye="${tablo}:${x.id}">
            <div class="flex items-start justify-between gap-3 flex-wrap">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-black text-slate-800 text-sm">${esc(x.__ad || '(isimsiz)')}</span>
                        ${x.__rol ? `<span class="text-[10px] font-mono bg-slate-900 text-white px-2 py-0.5 rounded">${esc(x.__rol)}</span>` : ''}
                        <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${i.cls}">${i.etiket}</span>
                        ${x.__durum || ''}
                    </div>
                    ${x.__altbaslik ? `<div class="text-[11px] text-slate-500 mt-0.5">${esc(x.__altbaslik)}</div>` : ''}
                    ${postaHtml}
                    ${altBilgi ? `<div class="text-[11px] text-slate-400 mt-0.5">${altBilgi}</div>` : ''}
                    <div class="text-[11px] text-slate-400 mt-1">${tarihSatiri(i)}</div>
                    ${x.banned && x.ban_reason ? `<div class="text-[11px] text-red-600 font-bold mt-1">Engel gerekçesi: ${esc(x.ban_reason)}</div>` : ''}
                </div>
                <div class="flex flex-wrap gap-1.5 shrink-0">
                    <button data-ey="uzat" data-ay="1"  class="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg">+1 Ay</button>
                    <button data-ey="uzat" data-ay="3"  class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-2.5 py-1.5 rounded-lg">+3 Ay</button>
                    <button data-ey="ayarla" class="bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 text-[11px] font-bold px-2.5 py-1.5 rounded-lg">⚙️ Abonelik</button>
                    <button data-ey="duzenle" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold px-2.5 py-1.5 rounded-lg">✎ Düzenle</button>
                    ${x.banned
                        ? `<button data-ey="engelkaldir" class="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[11px] font-bold px-2.5 py-1.5 rounded-lg">Engeli Kaldır</button>`
                        : `<button data-ey="engelle" class="bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-bold px-2.5 py-1.5 rounded-lg">⛔ Engelle</button>`}
                </div>
            </div>
            <p class="text-[11px] mt-2 h-4 font-bold" data-uyedurum="${tablo}:${x.id}"></p>
        </div>`;
    }

    function sarmala(baslik, aciklama, liste, tablo, ekBilgi) {
        const aktif  = liste.filter(x => !abonelikBilgi(x).doldu && x.sub_status === 'active' && !x.banned).length;
        const deneme = liste.filter(x => !abonelikBilgi(x).doldu && x.sub_status !== 'active' && !x.banned).length;
        const doldu  = liste.filter(x => abonelikBilgi(x).doldu && !x.banned).length;
        const engelli = liste.filter(x => x.banned).length;
        const postasiz = liste.filter(x => !x.__eposta && !x.email).length;
        return `
        <div class="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <div class="flex items-start justify-between gap-3 flex-wrap mb-1">
                <div>
                    <h3 class="font-black text-lg text-slate-800">${baslik} <span class="text-sm font-normal text-slate-400">· ${liste.length} kayıt</span></h3>
                    <p class="text-xs text-slate-500 mt-0.5">${aciklama}</p>
                </div>
                <div class="flex gap-1.5 text-[11px] font-bold flex-wrap">
                    <span class="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-1">${aktif} Aktif</span>
                    <span class="bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2.5 py-1">${deneme} Deneme</span>
                    ${doldu ? `<span class="bg-red-50 text-red-700 border border-red-200 rounded-full px-2.5 py-1">${doldu} Doldu</span>` : ''}
                    ${engelli ? `<span class="bg-red-600 text-white rounded-full px-2.5 py-1">${engelli} Engelli</span>` : ''}
                </div>
            </div>
            ${postasiz ? `<p class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 my-2">
                ⚠️ ${postasiz} kaydın e-posta adresi yok — bu hesaplara bildirim gönderilemez.</p>` : ''}
            ${ekBilgi || ''}
            <div class="mt-3">${liste.length ? liste.map(x => kart(x, tablo)).join('') : '<p class="text-sm text-slate-400 italic py-4 text-center">Kayıt yok.</p>'}</div>
        </div>`;
    }

    // ------------------------------------------------------------ ÇİZİMLER ---
    window.adminFirmalarCiz = async function () {
        const pane = document.getElementById('adminPaneCompanies');
        const kutu = document.getElementById('admFirmalarRoot');
        if (!kutu || !supabaseClient) return;
        kutu.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">Yükleniyor...</p>';
        await epostalariYukle();
        try {
            const [pr, co] = await Promise.all([
                supabaseClient.from('profiles').select('*, companies(id, name, email, phone, city, sub_status, sub_ends_at, banned, ban_reason)'),
                supabaseClient.from('companies').select('id, name, email, phone, city, sub_status, sub_ends_at, banned, ban_reason')
            ]);
            if (pr.error) throw pr.error;
            const firmalar = co.error ? [] : (co.data || []);
            window.__admCompanyCount = firmalar.length;

            // Satır = PROFİL (giriş yapan kişi). Firma bilgisi varsa iliştirilir;
            // abonelik firmaya ait olduğu için kontroller firma kaydına bağlanır.
            const liste = (pr.data || []).map(u => {
                const f = u.companies || null;
                const ad = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
                return Object.assign({}, f || {}, {
                    id: f ? f.id : u.id,
                    __authId: u.id,
                    __ad: ad || '(isimsiz)',
                    __rol: u.role || '',
                    __altbaslik: f ? f.name : (u.company_name || 'Firma kaydı yok'),
                    __tablo: f ? 'companies' : null,
                    email: (f && f.email) || u.Mail || '',
                    phone: (f && f.phone) || u.phone || '',
                    city: (f && f.city) || ''
                });
            });
            // ⚠️ E-postayı paylaşılan _epostalar haritasına FİRMA kimliğiyle yazmak
            // hataya yol açıyordu: epostalariYukle() haritayı sıfırladığı için
            // danışman/tedarikçi çizimi bu takma adları siliyor, ardından açılan
            // "Düzenle" kutusu e-postayı bulamıyordu. Değer artık satırın kendisinde.
            liste.forEach(x => { x.__eposta = _epostalar[x.__authId] || ''; });

            _veri.companies = liste;
            const yetim = liste.filter(x => !x.__tablo).length;
            const ek = yetim ? `<p class="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2 my-2">
                ${yetim} kullanıcının firma kaydı yok (yatırımcı/admin hesapları). Abonelik kontrolleri yalnız firma kaydı olanlarda çalışır.</p>` : '';
            kutu.innerHTML = sarmala('🏢 Firmalar ve Abonelikleri',
                'Abonelik firmaya aittir; satırdaki düğmeler doğrudan firma kaydını günceller.', liste, 'companies', ek);
        } catch (e) {
            kutu.innerHTML = `<div class="bg-white border border-red-200 rounded-2xl p-5">
                <p class="text-sm text-red-600 font-bold">Firmalar yüklenemedi</p>
                <p class="text-xs text-slate-500 mt-1">${esc(e.message || e)}</p></div>`;
        }
        if (pane) pane.dataset.hazir = '1';
    };

    window.adminDanismanlarCiz = async function () {
        const kutu = document.getElementById('admConsultantsRoot');
        if (!kutu || !supabaseClient) return;
        kutu.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">Yükleniyor...</p>';
        await epostalariYukle();
        try {
            const { data, error } = await supabaseClient.from('consultants').select('*').order('updated_at', { ascending: false });
            if (error) throw error;
            const liste = (data || []).map(c => Object.assign({}, c, {
                __eposta: _epostalar[c.id] || '',
                __ad: c.full_name || '(isimsiz)',
                __rol: '',
                __altbaslik: [c.title, c.expertise].filter(Boolean).join(' · '),
                __durum: onayRozeti(c.status) + (c.reject_reason ? '' : '')
            }));
            _veri.consultants = liste;
            kutu.innerHTML = sarmala('🎯 Danışmanlar ve Abonelikleri',
                'Onay durumu ile abonelik ayrı şeylerdir: onaylı bir danışmanın aboneliği dolmuş olabilir.',
                liste, 'consultants', onayDugmeleriAciklama());
        } catch (e) {
            kutu.innerHTML = `<div class="bg-white border border-red-200 rounded-2xl p-5">
                <p class="text-sm text-red-600 font-bold">Danışmanlar yüklenemedi</p>
                <p class="text-xs text-slate-500 mt-1">${esc(e.message || e)}</p></div>`;
        }
    };

    window.adminTedarikcilerCiz = async function () {
        const kutu = document.getElementById('admSuppliersRoot');
        if (!kutu || !supabaseClient) return;
        kutu.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">Yükleniyor...</p>';
        await epostalariYukle();
        try {
            const { data, error } = await supabaseClient.from('suppliers').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            const liste = (data || []).map(s => Object.assign({}, s, {
                __eposta: _epostalar[s.id] || '',
                __ad: s.company_name || '(isimsiz)',
                __rol: '',
                __altbaslik: [s.full_name, (s.categories || []).join(', ')].filter(Boolean).join(' · '),
                __durum: onayRozeti(s.status)
            }));
            _veri.suppliers = liste;
            kutu.innerHTML = sarmala('📦 Tedarikçiler ve Abonelikleri',
                'Onaylanan tedarikçiler kurulumcu firmaların gördüğü dizine girer.',
                liste, 'suppliers', onayDugmeleriAciklama());
        } catch (e) {
            kutu.innerHTML = `<div class="bg-white border border-red-200 rounded-2xl p-5">
                <p class="text-sm text-red-600 font-bold">Tedarikçiler yüklenemedi</p>
                <p class="text-xs text-slate-500 mt-1">${esc(e.message || e)}</p></div>`;
        }
    };

    function onayRozeti(st) {
        const m = {
            draft:    ['Taslak', 'bg-slate-100 text-slate-600'],
            pending:  ['Onay Bekliyor', 'bg-amber-100 text-amber-800'],
            approved: ['Onaylı', 'bg-indigo-100 text-indigo-700'],
            rejected: ['Reddedildi', 'bg-red-100 text-red-700']
        }[st];
        return m ? `<span class="text-[10px] font-black px-2 py-0.5 rounded-full ${m[1]}">${m[0]}</span>` : '';
    }
    function onayDugmeleriAciklama() {
        return `<p class="text-[11px] text-slate-400 mt-1">Onaylama/reddetme işlemleri kendi bölümlerinde; buradaki düğmeler abonelik ve kayıt bilgisi içindir.</p>`;
    }

    // ----------------------------------------------------------- EYLEMLER ----
    function durum(anahtar, mesaj, renk) {
        const el = document.querySelector(`[data-uyedurum="${anahtar}"]`);
        if (el) { el.textContent = mesaj; el.className = `text-[11px] mt-2 h-4 font-bold ${renk}`; }
    }

    function tazele(tablo) {
        if (tablo === 'companies') return window.adminFirmalarCiz();
        if (tablo === 'consultants') return window.adminDanismanlarCiz();
        if (tablo === 'suppliers') return window.adminTedarikcilerCiz();
    }

    async function uzat(tablo, id, ay, anahtar) {
        durum(anahtar, 'Güncelleniyor...', 'text-slate-400');
        try {
            const { data: mevcut } = await supabaseClient.from(tablo).select('sub_ends_at').eq('id', id).single();
            let taban = Date.now();
            if (mevcut && mevcut.sub_ends_at) {
                const e = new Date(mevcut.sub_ends_at).getTime();
                if (e > taban) taban = e;          // kalan süre yanmasın
            }
            const d = new Date(taban); d.setMonth(d.getMonth() + ay);
            const { error } = await supabaseClient.from(tablo)
                .update({ sub_ends_at: d.toISOString(), sub_status: 'active' }).eq('id', id);
            if (error) throw error;
            await tazele(tablo);
        } catch (e) { durum(anahtar, 'Başarısız: ' + (e.message || e), 'text-red-600'); }
    }

    async function engelDegistir(tablo, id, engelle, anahtar) {
        let gerekce = null;
        if (engelle) {
            gerekce = prompt('Engel gerekçesi (kullanıcıya gösterilir):', '');
            if (gerekce === null) return;
        } else if (!confirm('Engel kaldırılsın mı?')) return;
        durum(anahtar, 'Güncelleniyor...', 'text-slate-400');
        try {
            const { error } = await supabaseClient.from(tablo)
                .update({ banned: engelle, ban_reason: engelle ? gerekce : null }).eq('id', id);
            if (error) throw error;
            await tazele(tablo);
        } catch (e) { durum(anahtar, 'Başarısız: ' + (e.message || e), 'text-red-600'); }
    }

    // --------------------------------------------------------------- MODAL ---
    function modalAc(icerik) {
        let m = document.getElementById('uyeModal');
        if (!m) {
            m = document.createElement('div'); m.id = 'uyeModal'; document.body.appendChild(m);
            m.addEventListener('click', e => { if (e.target === m) m.remove(); });
        }
        m.className = 'fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4';
        m.innerHTML = `<div class="bg-white rounded-2xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">${icerik}</div>`;
        return m;
    }
    window.uyeModalKapat = function () { const m = document.getElementById('uyeModal'); if (m) m.remove(); };

    function abonelikModal(tablo, id) {
        const x = satirBul(tablo, id); if (!x) return;
        const iso = (x.sub_ends_at ? new Date(x.sub_ends_at) : new Date()).toISOString().split('T')[0];
        modalAc(`
            <div class="flex items-center justify-between mb-1">
                <h3 class="font-black text-slate-800">Abonelik Ayarla</h3>
                <button onclick="uyeModalKapat()" class="text-slate-400 hover:text-slate-700 text-xl leading-none">✕</button>
            </div>
            <p class="text-sm text-slate-500 mb-4">${esc(x.__ad)}</p>
            <label class="block text-xs font-bold text-slate-600 mb-1">Bitiş tarihi</label>
            <input type="date" id="uyeSubTarih" value="${iso}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm mb-3">
            <button id="uyeSubKaydet" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg mb-3">Tarihi Kaydet</button>
            <button id="uyeSubBitir" class="w-full bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs py-2 rounded-lg">Hemen Sonlandır</button>
            <p class="text-[11px] text-slate-400 mt-3">Geçmiş bir tarih seçilirse abonelik "deneme"ye döner.</p>`);
        document.getElementById('uyeSubKaydet').onclick = async () => {
            const v = document.getElementById('uyeSubTarih').value;
            if (!v) { alert('Tarih seçin.'); return; }
            await tarihYaz(tablo, id, new Date(v + 'T23:59:59').toISOString());
        };
        document.getElementById('uyeSubBitir').onclick = async () => {
            if (!confirm('Abonelik hemen sonlandırılsın mı?')) return;
            await tarihYaz(tablo, id, new Date(Date.now() - 60000).toISOString());
        };
    }

    async function tarihYaz(tablo, id, iso) {
        const ileri = new Date(iso).getTime() > Date.now();
        const { error } = await supabaseClient.from(tablo)
            .update({ sub_ends_at: iso, sub_status: ileri ? 'active' : 'trial' }).eq('id', id);
        if (error) { alert('İşlem başarısız: ' + error.message); return; }
        window.uyeModalKapat();
        await tazele(tablo);
    }

    // Eskiden bu düğmenin onclick'i HİÇ YOKTU: tıklanıyor, hiçbir şey olmuyordu.
    const ALANLAR = {
        companies:   [['name', 'Firma adı'], ['email', 'E-posta (kayıt)'], ['phone', 'Telefon'], ['city', 'Şehir']],
        consultants: [['full_name', 'Ad soyad'], ['email', 'E-posta'], ['title', 'Unvan'], ['phone', 'Telefon']],
        suppliers:   [['company_name', 'Firma adı'], ['full_name', 'Yetkili'], ['email', 'E-posta'], ['phone', 'Telefon'], ['city', 'Şehir']]
    };

    function duzenleModal(tablo, id) {
        const x = satirBul(tablo, id); if (!x) return;
        if (tablo === 'companies' && !x.__tablo) {
            alert('Bu kullanıcının firma kaydı yok (yatırımcı veya admin hesabı).\n\nDüzenlenecek firma bilgisi bulunmuyor.');
            return;
        }
        const alanlar = ALANLAR[tablo] || [];
        const authPosta = x.__eposta || '';
        modalAc(`
            <div class="flex items-center justify-between mb-1">
                <h3 class="font-black text-slate-800">Kaydı Düzenle</h3>
                <button onclick="uyeModalKapat()" class="text-slate-400 hover:text-slate-700 text-xl leading-none">✕</button>
            </div>
            <p class="text-sm text-slate-500 mb-3">${esc(x.__ad)}</p>
            ${authPosta ? `<p class="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2 mb-3">
                Giriş e-postası <b class="font-mono">${esc(authPosta)}</b> — bu adres buradan değiştirilemez,
                kullanıcının kendi hesap ayarlarından değişir.</p>` : ''}
            ${alanlar.map(([k, l]) => `
                <label class="block mb-2.5">
                    <span class="block text-xs font-bold text-slate-600 mb-1">${l}</span>
                    <input type="text" data-alan="${k}" value="${esc(x[k] || '')}"
                        class="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none focus:border-emerald-500">
                </label>`).join('')}
            <button id="uyeDuzKaydet" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg mt-2">Kaydet</button>
            <p id="uyeDuzDurum" class="text-[11px] mt-2 h-4"></p>`);
        document.getElementById('uyeDuzKaydet').onclick = async () => {
            const yama = {};
            document.querySelectorAll('#uyeModal [data-alan]').forEach(i => { yama[i.dataset.alan] = i.value.trim() || null; });
            const d = document.getElementById('uyeDuzDurum');
            d.textContent = 'Kaydediliyor...'; d.className = 'text-[11px] mt-2 h-4 text-slate-400';
            const { error } = await supabaseClient.from(tablo).update(yama).eq('id', id);
            if (error) { d.textContent = 'Başarısız: ' + error.message; d.className = 'text-[11px] mt-2 h-4 text-red-600'; return; }
            window.uyeModalKapat();
            await tazele(tablo);
        };
    }

    function satirBul(tablo, id) { return (_veri[tablo] || []).find(x => x.id === id); }

    // ---------------------------------------------------------- DELEGASYON ---
    // Satır içi onclick yerine tek dinleyici: her çizimde yeniden bağlamak
    // gerekmiyor ve kapanış içindeki isimler global kapsamda aranmıyor.
    document.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-ey]');
        if (!btn) return;
        const kutu = btn.closest('[data-uye]');
        if (!kutu) return;
        const [tablo, id] = kutu.dataset.uye.split(':');
        const anahtar = kutu.dataset.uye;
        const x = satirBul(tablo, id);
        if (tablo === 'companies' && x && !x.__tablo && btn.dataset.ey !== 'duzenle') {
            durum(anahtar, 'Bu kullanıcının firma kaydı yok — abonelik uygulanamaz.', 'text-amber-600');
            return;
        }
        switch (btn.dataset.ey) {
            case 'uzat':        uzat(tablo, id, +btn.dataset.ay, anahtar); break;
            case 'ayarla':      abonelikModal(tablo, id); break;
            case 'duzenle':     duzenleModal(tablo, id); break;
            case 'engelle':     engelDegistir(tablo, id, true, anahtar); break;
            case 'engelkaldir': engelDegistir(tablo, id, false, anahtar); break;
        }
    });
})();
