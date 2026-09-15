/* ============================================================================
   evrak.js — BAŞVURU EVRAKLARI
   Kurulumcu firmanın dağıtım şirketine yapacağı lisanssız üretim bağlantı
   başvurusunda istenen evrakları listeler ve yatırımcıdan BİR KEZ alınan
   bilgilerle doldurur.

   TASARIM KARARI — NEYİ ÜRETİRİZ, NEYİ ÜRETMEYİZ
   Dağıtım şirketleri kendi form şablonlarını (Ek-1, teknik değerlendirme
   formu) yayımlıyor ve başvuruyu KENDİ şablonlarıyla istiyorlar. Bizim
   ürettiğimiz bir kâğıdı "Ek-1" diye sunmak kurulumcuyu reddedilen bir
   başvuruya sürükler. Bu yüzden:
     · Serbest metinli belgeleri TAM üretiriz  → dilekçe, beyan, muvafakatname
     · Resmi şablonlu formlar için BİLGİ FÖYÜ üretiriz: formun istediği tüm
       alanlar tek sayfada doldurulmuş hâlde. Kurulumcu resmi formu şirketin
       sitesinden indirip föyden kopyalar.
   Föyün üstünde bunun resmi form YERİNE GEÇMEDİĞİ yazar.

   Belge listesi mevzuat_belgeleri tablosundan gelir (basvuru-evraklari.sql).
   Her satırın kaynak bağlantısı ve doğrulama tarihi vardır; liste genel
   mevzuata göredir ve şirkete özel belgeler yönetici panelinden eklenir.
   ============================================================================ */
(function () {
    'use strict';

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    let _lead = null;         // açık başvurunun lead satırı
    let _dosya = null;        // leads.basvuru_dosyasi (bir kez alınan bilgiler)
    let _sirketler = [];      // distribution_companies
    let _belgeler = [];       // mevzuat_belgeleri (ulusal + seçili şirket)
    let _hata = null;
    let _sirketAdaylari = [];   // adrese uyan şirketler (birden fazlaysa kullanıcı seçer)

    function kok() { return document.getElementById('evrakRoot'); }

    // Boş başvuru dosyası — alan adları formlarda istenen bilgilerle birebir.
    function bosDosya(lead) {
        return {
            sirket_id: null,
            kisi_tipi: 'gercek',          // gercek | tuzel
            yerlesim: 'cati',             // cati | arazi
            ad_unvan: (lead && lead.full_name) || '',
            tckn_vkn: '',
            telefon: (lead && lead.phone) || '',
            eposta: (lead && lead.email) || '',
            kep: '',
            iban: '',
            yazisma_adresi: (lead && lead.address) || '',
            // tüketim tesisi
            tuketim_tekil_kod: '',
            tuketim_abone_no: '',
            tuketim_adresi: (lead && lead.address) || '',
            tarife_grubu: (lead && lead.tariff_group) || 'mesken',
            // üretim tesisi
            uretim_adresi: (lead && lead.address) || '',
            il: '', ilce: '',
            ada: '', parsel: '',
            kurulu_guc_ac: '', kurulu_guc_dc: '', panel_sayisi: '',
            // mülkiyet
            mulkiyet: 'tapu',             // tapu | kira | kullanim_hakki
            kat_malikleri_gerekli: false,
            // vekalet
            vekil_var: false, vekil_unvan: '', vekil_yetkili: '',
            // durum
            evrak_durumu: {},             // { belgeId: true }
            guncelleme: null
        };
    }

    // ----------------------------------------------------------------- VERİ
    async function yukle(leadId) {
        _hata = null;
        if (!supabaseClient) { _hata = 'Bağlantı yok.'; return; }
        try {
            const { data, error } = await supabaseClient.from('leads')
                .select('*').eq('id', leadId).maybeSingle();
            if (error) throw error;
            if (!data) { _hata = 'Müşteri kaydı bulunamadı.'; return; }
            _lead = data;
            _dosya = Object.assign(bosDosya(data), data.basvuru_dosyasi || {});
        } catch (e) { _hata = e.message || String(e); return; }

        try {
            const { data } = await supabaseClient.from('distribution_companies')
                .select('id, name, abbr, provinces, website, basvuru_url, phone')
                .eq('is_published', true).order('sort_order');
            _sirketler = data || [];
        } catch (e) { _sirketler = []; }

        // Şirket seçilmemişse adresten tahmin et — ama KİLİTLEMEZ, kullanıcı değiştirir.
        if (!_dosya.sirket_id) {
            const aday = sirketAdaylari(_lead.address || '');
            // ⚠️ TEK aday varsa seç. Birden fazlaysa SEÇME.
            // İstanbul'da BEDAŞ (Avrupa) ve AYEDAŞ (Anadolu) ikisi de "İstanbul"
            // içeriyor; sessizce birini seçmek kurulumcuyu yanlış şirkete
            // başvurmaya gönderir — haftalar kaybettirir. Kullanıcı seçer.
            if (aday.length === 1) _dosya.sirket_id = aday[0].id;
            _sirketAdaylari = aday;
        }
        await belgeleriYukle();
    }

    // Adreste geçen il adına uyan TÜM şirketler.
    function sirketAdaylari(adres) {
        const a = String(adres || '').toLocaleLowerCase('tr-TR');
        if (!a) return [];
        const bulunan = [];
        for (const s of _sirketler) {
            const iller = String(s.provinces || '').split(',').map(x => x.trim()).filter(Boolean);
            const uyan = iller.some(il => {
                const sade = il.replace(/\(.*?\)/g, '').trim().toLocaleLowerCase('tr-TR');
                return sade && a.includes(sade);
            });
            if (uyan) bulunan.push(s);
        }
        return bulunan;
    }

    async function belgeleriYukle() {
        if (!supabaseClient) return;
        try {
            let q = supabaseClient.from('mevzuat_belgeleri')
                .select('*').eq('asama', 'basvuru').eq('yayinda', true);
            const { data, error } = await q.order('sira');
            if (error) throw error;
            // Ulusal (sirket_id null) + seçili şirkete ait olanlar
            _belgeler = (data || []).filter(b =>
                !b.sirket_id || b.sirket_id === _dosya.sirket_id);
        } catch (e) { _belgeler = []; }
    }

    // Kişi tipi ve yerleşime göre süz. Arazi belgeleri çatıda gösterilmez:
    // kurulumcuya gereksiz iş çıkarmak, eksik belge kadar zarar verir.
    function gecerliBelgeler() {
        const araziOzel = /koordinatlı aplikasyon|tarım arazisi/i;
        return _belgeler.filter(b => {
            const kt = b.kisi_tipi || 'hepsi';
            if (kt !== 'hepsi' && kt !== _dosya.kisi_tipi) return false;
            if (_dosya.yerlesim === 'cati' && araziOzel.test(b.belge_adi || '')) return false;
            if (!_dosya.kat_malikleri_gerekli && /kat malikleri/i.test(b.belge_adi || '')) return false;
            if (!_dosya.vekil_var && /vekaletname/i.test(b.belge_adi || '')) return false;
            return true;
        });
    }

    async function kaydet(sessiz) {
        if (!supabaseClient || !_lead) return false;
        _dosya.guncelleme = new Date().toISOString();
        try {
            const { error } = await supabaseClient.from('leads')
                .update({ basvuru_dosyasi: _dosya, updated_at: _dosya.guncelleme })
                .eq('id', _lead.id);
            if (error) throw error;
            if (!sessiz && window.epcBildir) window.epcBildir('Başvuru dosyası kaydedildi.');
            return true;
        } catch (e) {
            alert('Kaydedilemedi: ' + (e.message || e));
            return false;
        }
    }

    // ---------------------------------------------------------------- EKRAN
    window.showEvrakModule = async function (leadId, _adrestenGeldi) {
        if (typeof window.epcTumModulleriGizle === 'function') window.epcTumModulleriGizle();
        document.getElementById('mainMenu')?.classList.add('hidden');
        document.getElementById('appContainer')?.classList.remove('hidden');
        document.getElementById('evrakModule')?.classList.remove('hidden');
        if (window.epcAdresYaz) window.epcAdresYaz('evraklar', leadId || null, _adrestenGeldi);
        window.scrollTo(0, 0);

        const r = kok(); if (!r) return;
        if (!leadId) { await secimEkrani(); return; }
        r.innerHTML = '<div class="kart p-6"><p class="text-sm text-slate-400">Başvuru dosyası yükleniyor…</p></div>';
        await yukle(leadId);
        ciz();
    };

    // Panel menüsündeki kart. Müşteri seçilmeden girilirse liste ekranı açılır.
    document.getElementById('btnGoEvrak')?.addEventListener('click', function () {
        window.openedFromPublic = false;
        window.showEvrakModule(null, false);
    });

    // Müşteri seçme ekranı — modüle menüden girildiğinde.
    async function secimEkrani() {
        const r = kok(); if (!r) return;
        r.innerHTML = ust('Başvuru Evrakları', 'Dağıtım şirketine yapılacak bağlantı başvurusunun evraklarını hazırlayın.') +
            '<div class="kart p-6"><p class="text-sm text-slate-400">Müşteriler yükleniyor…</p></div>';
        let liste = [];
        try {
            const { data, error } = await supabaseClient.from('leads')
                .select('id, full_name, address, tracking_code, basvuru_dosyasi')
                .order('created_at', { ascending: false });
            if (error) throw error;
            liste = data || [];
        } catch (e) {
            r.innerHTML = ust('Başvuru Evrakları', '') +
                `<div class="kart p-6"><p class="text-red-500 text-sm">Müşteri listesi yüklenemedi: ${esc(e.message || e)}</p></div>`;
            return;
        }
        const satir = (l) => {
            const d = l.basvuru_dosyasi || null;
            const n = d && d.evrak_durumu ? Object.values(d.evrak_durumu).filter(Boolean).length : 0;
            return `<button onclick="showEvrakModule('${esc(l.id)}')" class="w-full text-left kart p-4 mb-2 flex items-center justify-between gap-3 hover:border-amber-400/40 transition">
                <span class="min-w-0">
                    <span class="block font-black text-slate-800">${esc(l.full_name || '—')}</span>
                    <span class="block text-[11px] text-slate-400">${esc(l.address || 'adres girilmemiş')}</span>
                </span>
                <span class="text-[11px] font-bold shrink-0 ${n ? 'text-emerald-600' : 'text-slate-400'}">${n ? n + ' evrak işaretli' : 'başlanmadı'}</span>
            </button>`;
        };
        r.innerHTML = ust('Başvuru Evrakları', 'Hangi müşterinin başvurusunu hazırlıyorsunuz?') +
            (liste.length
                ? `<div>${liste.map(satir).join('')}</div>`
                : `<div class="kart bos-durum"><span class="bos-durum-ico">📄</span><h4>Müşteri kaydınız yok</h4><p>Önce Satış CRM'den bir müşteri açın; başvuru dosyası o kayda bağlanır.</p></div>`);
    }

    function ust(baslik, alt) {
        return `<div class="modul-ust">
                <button onclick="closeAllAndShowMenu()" class="modul-geri">← Menüye Dön</button>
                <div class="modul-eylem">
                    <button onclick="evrakKaydet()" class="btn-birincil">Kaydet</button>
                </div>
            </div>
            <div class="modul-basligi"><h2>${esc(baslik)}</h2>${alt ? `<p>${esc(alt)}</p>` : ''}</div>`;
    }

    function ciz() {
        const r = kok(); if (!r) return;
        if (_hata) {
            r.innerHTML = ust('Başvuru Evrakları', '') +
                `<div class="kart p-6"><p class="text-red-500 text-sm">${esc(_hata)}</p></div>`;
            return;
        }
        const s = _sirketler.find(x => x.id === _dosya.sirket_id) || null;
        r.innerHTML =
            ust('Başvuru Evrakları', (_lead.full_name || '') + ' · ' + (_lead.tracking_code || '')) +
            sirketKarti(s) +
            bilgiKarti() +
            belgeKarti(s);
    }

    // --- 1) Dağıtım şirketi ---
    function sirketKarti(s) {
        const opts = '<option value="">— Seçilmedi —</option>' + _sirketler.map(x =>
            `<option value="${esc(x.id)}" ${_dosya.sirket_id === x.id ? 'selected' : ''}>${esc(x.name)}${x.abbr ? ' (' + esc(x.abbr) + ')' : ''}</option>`).join('');
        const bag = s && window.epcGuvenliUrl ? window.epcGuvenliUrl(s.basvuru_url || s.website) : '';
        return `<div class="kart mb-4">
            <div class="kart-ust"><h3>🔌 Dağıtım Şirketi</h3></div>
            <div class="p-4">
                ${(!_dosya.sirket_id && _sirketAdaylari.length > 1) ? `
                    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                        <p class="text-[11px] text-amber-900 leading-relaxed m-0">⚠️ Bu adrese <b>${_sirketAdaylari.length} şirket</b> uyuyor
                        (${esc(_sirketAdaylari.map(x => x.abbr || x.name).join(' · '))}). Aynı ilde bölge ayrımı olabilir —
                        hangisinin sorumlu olduğunu <b>186</b>'yı arayarak veya faturanızdan teyit edip seçin.
                        Yanlış şirkete yapılan başvuru reddedilir.</p>
                    </div>` : ''}
                <p class="text-[11px] text-slate-400 mb-2">${_dosya.sirket_id ? 'Müşterinin adresine göre önerildi; yanlışsa değiştirin.' : 'Evrak listesi seçilen şirkete göre değişir.'}</p>
                <select id="evSirket" onchange="evrakSirketDegisti(this.value)" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${opts}</select>
                ${s ? `<p class="text-[11px] text-slate-500 mt-2">${esc(s.provinces || '')}${s.phone ? ' · ☎ ' + esc(s.phone) : ''}</p>` : ''}
                ${bag ? `<a href="${esc(bag)}" target="_blank" rel="noopener" class="inline-block mt-2 text-xs font-bold text-amber-600 hover:underline">${esc(s.abbr || s.name)} lisanssız üretim sayfası ↗</a>` : ''}
            </div>
        </div>`;
    }

    // --- 2) Tek seferlik bilgi formu ---
    function bilgiKarti() {
        const g = (id, etiket, deger, tip, ipucu) => `
            <div>
                <label class="block text-xs font-bold text-slate-600 mb-1">${esc(etiket)}</label>
                <input id="${id}" type="${tip || 'text'}" value="${esc(deger || '')}" ${ipucu ? `placeholder="${esc(ipucu)}"` : ''}
                       oninput="evrakAlan('${id}')" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
            </div>`;
        const sec = (id, etiket, deger, secenekler) => `
            <div>
                <label class="block text-xs font-bold text-slate-600 mb-1">${esc(etiket)}</label>
                <select id="${id}" onchange="evrakAlan('${id}')" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">
                    ${secenekler.map(o => `<option value="${esc(o[0])}" ${deger === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}
                </select>
            </div>`;
        const kutu = (id, etiket, deger, not) => `
            <label class="flex items-start gap-2 cursor-pointer">
                <input id="${id}" type="checkbox" ${deger ? 'checked' : ''} onchange="evrakAlan('${id}')" class="mt-0.5 w-4 h-4">
                <span><span class="text-sm font-bold text-slate-700">${esc(etiket)}</span>${not ? `<span class="block text-[11px] text-slate-400">${esc(not)}</span>` : ''}</span>
            </label>`;

        return `<div class="kart mb-4">
            <div class="kart-ust"><h3>📝 Başvuru Bilgileri</h3><span class="text-[11px] text-slate-400">Bir kez doldurun — tüm belgelerde kullanılır</span></div>
            <div class="p-4 space-y-4">

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    ${sec('kisi_tipi', 'Başvuru sahibi', _dosya.kisi_tipi, [['gercek', 'Gerçek kişi'], ['tuzel', 'Tüzel kişi (şirket)']])}
                    ${sec('yerlesim', 'Tesis yerleşimi', _dosya.yerlesim, [['cati', 'Çatı / cephe'], ['arazi', 'Arazi']])}
                </div>

                <div class="border-t border-slate-100 pt-3">
                    <p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Başvuru Sahibi</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${g('ad_unvan', _dosya.kisi_tipi === 'tuzel' ? 'Ünvan' : 'Ad Soyad', _dosya.ad_unvan)}
                        ${g('tckn_vkn', _dosya.kisi_tipi === 'tuzel' ? 'Vergi Kimlik No' : 'T.C. Kimlik No', _dosya.tckn_vkn, 'text', _dosya.kisi_tipi === 'tuzel' ? '10 hane' : '11 hane')}
                        ${g('telefon', 'Telefon', _dosya.telefon)}
                        ${g('eposta', 'E-posta', _dosya.eposta, 'email')}
                        ${g('kep', 'KEP adresi (tüzel kişide istenir)', _dosya.kep)}
                        ${g('iban', 'IBAN', _dosya.iban, 'text', 'TR…')}
                    </div>
                    <div class="mt-3">${g('yazisma_adresi', 'Yazışma adresi', _dosya.yazisma_adresi)}</div>
                </div>

                <div class="border-t border-slate-100 pt-3">
                    <p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Tüketim Tesisi (mahsuplaşma yapılacak abonelik)</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${g('tuketim_tekil_kod', 'Tekil kod', _dosya.tuketim_tekil_kod, 'text', 'Faturanın üzerinde yazar')}
                        ${g('tuketim_abone_no', 'Abone / sözleşme no', _dosya.tuketim_abone_no)}
                    </div>
                    <div class="mt-3">${g('tuketim_adresi', 'Tüketim tesisi adresi', _dosya.tuketim_adresi)}</div>
                </div>

                <div class="border-t border-slate-100 pt-3">
                    <p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Üretim Tesisi</p>
                    <div class="mt-0">${g('uretim_adresi', 'Üretim tesisi adresi', _dosya.uretim_adresi)}</div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                        ${g('il', 'İl', _dosya.il)}
                        ${g('ilce', 'İlçe', _dosya.ilce)}
                        ${g('ada', 'Ada', _dosya.ada)}
                        ${g('parsel', 'Parsel', _dosya.parsel)}
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                        ${g('kurulu_guc_ac', 'Kurulu güç — AC (kWe)', _dosya.kurulu_guc_ac)}
                        ${g('kurulu_guc_dc', 'Panel gücü — DC (kWp)', _dosya.kurulu_guc_dc)}
                        ${g('panel_sayisi', 'Panel sayısı', _dosya.panel_sayisi)}
                    </div>
                    <p class="text-[11px] text-slate-400 mt-2">⚠️ Başvuru AC gücü üzerinden değerlendirilir; ÇED eşiği ise DC güce bakar. İkisini de girin.</p>
                </div>

                <div class="border-t border-slate-100 pt-3">
                    <p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Mülkiyet ve Yetki</p>
                    ${sec('mulkiyet', 'Yerin kullanım durumu', _dosya.mulkiyet, [['tapu', 'Tapu (mülk sahibi)'], ['kira', 'Kira sözleşmesi (en az 2 yıl)'], ['kullanim_hakki', 'Kullanım hakkı belgesi']])}
                    <div class="mt-3 space-y-2">
                        ${kutu('kat_malikleri_gerekli', 'Binada birden fazla bağımsız bölüm var', 'Kat malikleri kurulu kararı gerekir')}
                        ${kutu('vekil_var', 'Başvuruyu firmamız vekaleten yapacak', 'Noterden vekaletname gerekir')}
                    </div>
                    ${_dosya.vekil_var ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        ${g('vekil_unvan', 'Vekil firma ünvanı', _dosya.vekil_unvan)}
                        ${g('vekil_yetkili', 'Yetkili kişi', _dosya.vekil_yetkili)}
                    </div>` : ''}
                </div>
            </div>
        </div>`;
    }

    // --- 3) Evrak listesi ---
    function belgeKarti(s) {
        const liste = gecerliBelgeler();
        if (!liste.length) {
            return `<div class="kart bos-durum">
                <span class="bos-durum-ico">📂</span>
                <h4>Evrak listesi boş</h4>
                <p>Belge tanımları henüz yüklenmemiş. Yönetici panelinden ekleyebilir veya basvuru-evraklari.sql dosyasını çalıştırabilirsiniz.</p>
            </div>`;
        }
        const zorunlu = liste.filter(b => b.zorunlu_mu).length;
        const tamam = liste.filter(b => _dosya.evrak_durumu[b.id]).length;
        const bag = s && window.epcGuvenliUrl ? window.epcGuvenliUrl(s.basvuru_url || s.website) : '';

        const satir = (b) => {
            const isaretli = !!_dosya.evrak_durumu[b.id];
            const kaynak = window.epcGuvenliUrl ? window.epcGuvenliUrl(b.kaynak_url) : '';
            return `<div class="flex items-start gap-3 p-3 rounded-lg border ${isaretli ? 'bg-emerald-50 border-emerald-200' : 'border-slate-100'} mb-2">
                <input type="checkbox" ${isaretli ? 'checked' : ''} onchange="evrakIsaretle('${esc(b.id)}', this.checked)" class="mt-1 w-4 h-4 shrink-0">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-sm font-bold ${isaretli ? 'text-emerald-800' : 'text-slate-700'}">${esc(b.belge_adi)}</span>
                        ${b.zorunlu_mu ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-50 text-red-700">zorunlu</span>'
                                       : '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">koşullu</span>'}
                        ${b.sirket_id ? '<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">şirkete özel</span>' : ''}
                    </div>
                    ${b.aciklama ? `<p class="text-[11px] text-slate-500 mt-1">${esc(b.aciklama)}</p>` : ''}
                    <div class="flex items-center gap-3 mt-1.5 flex-wrap">
                        ${b.nereden_alinir ? `<span class="text-[11px] text-slate-400">📍 ${esc(b.nereden_alinir)}</span>` : ''}
                        ${kaynak ? `<a href="${esc(kaynak)}" target="_blank" rel="noopener" class="text-[11px] font-bold text-amber-600 hover:underline">kaynak ↗</a>` : ''}
                        ${b.dogrulama_tarihi ? `<span class="text-[11px] text-slate-400">son kontrol ${esc(new Date(b.dogrulama_tarihi).toLocaleDateString('tr-TR'))}</span>` : ''}
                    </div>
                </div>
                ${b.sablon_kod ? `<button onclick="evrakUret('${esc(b.sablon_kod)}')" class="btn-ikincil shrink-0">Hazırla</button>` : ''}
            </div>`;
        };

        return `<div class="kart">
            <div class="kart-ust">
                <h3>📋 Evrak Listesi</h3>
                <span class="text-[11px] font-bold ${tamam >= zorunlu ? 'text-emerald-600' : 'text-slate-500'}">${tamam} / ${liste.length} işaretli · ${zorunlu} zorunlu</span>
            </div>
            <div class="p-4">
                <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    <p class="text-[11px] text-amber-900 leading-relaxed m-0">
                        <b>Bu liste genel mevzuata göre hazırlanmıştır.</b> Her dağıtım şirketi ek belge isteyebilir veya
                        kendi form şablonunu kullanmanızı şart koşabilir. Başvurudan önce
                        ${bag ? `<a href="${esc(bag)}" target="_blank" rel="noopener" class="font-bold underline">şirketin kendi sayfasından ↗</a>` : 'şirketin kendi sayfasından'}
                        güncel listeyi teyit edin.
                    </p>
                </div>
                ${liste.map(satir).join('')}
            </div>
        </div>`;
    }

    // ------------------------------------------------------------- EYLEMLER
    window.evrakAlan = function (id) {
        const el = document.getElementById(id); if (!el) return;
        const yeni = (el.type === 'checkbox') ? el.checked : el.value;
        const eski = _dosya[id];
        _dosya[id] = yeni;
        // Bu alanlar hangi belgelerin isteneceğini değiştiriyor → yeniden çiz.
        if (['kisi_tipi', 'yerlesim', 'kat_malikleri_gerekli', 'vekil_var'].includes(id) && eski !== yeni) {
            ciz();
        }
    };

    window.evrakSirketDegisti = async function (id) {
        _dosya.sirket_id = id || null;
        await belgeleriYukle();
        ciz();
    };

    window.evrakIsaretle = function (belgeId, durum) {
        _dosya.evrak_durumu[belgeId] = !!durum;
        ciz();
        kaydet(true);
    };

    window.evrakKaydet = function () { kaydet(false); };

    // ------------------------------------------------------- BELGE ÜRETİMİ
    const AY = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    function bugun() { const d = new Date(); return d.getDate() + ' ' + AY[d.getMonth()] + ' ' + d.getFullYear(); }
    function sirketAdi() {
        const s = _sirketler.find(x => x.id === _dosya.sirket_id);
        return s ? (s.name + (s.abbr ? ' (' + s.abbr + ')' : '')) : '…………………… Elektrik Dağıtım A.Ş.';
    }
    const dolu = (v, u) => (v === '' || v == null) ? '<span style="color:#b91c1c">……………</span>' : esc(v) + (u || '');

    window.evrakUret = function (kod) {
        const uretici = { dilekce: dilekceHtml, beyan: beyanHtml, muvafakat: muvafakatHtml,
                          vekalet: vekaletHtml, foy: foyHtml }[kod];
        if (!uretici) return;
        yazdir(uretici());
    };

    // Belge penceresi: aynı sekmede tam ekran, yazdır/kapat düğmeli.
    // Ayrı sekme yerine iframe: açılır pencere engelleyiciler yüzünden
    // kullanıcı bazen hiçbir şey göremiyordu.
    function yazdir(govde) {
        let k = document.getElementById('evrakYazdirKatman');
        if (!k) {
            k = document.createElement('div');
            k.id = 'evrakYazdirKatman';
            k.style.cssText = 'position:fixed;inset:0;z-index:200;background:#0B1B2E;display:flex;flex-direction:column';
            document.body.appendChild(k);
        }
        k.innerHTML = `
            <div style="display:flex;gap:8px;justify-content:flex-end;padding:10px 14px;background:#12263D">
                <button onclick="evrakYazdirKapat()" style="background:rgba(255,255,255,.1);color:#E8EEF7;border:0;padding:9px 16px;border-radius:8px;font-weight:700;cursor:pointer">Kapat</button>
                <button onclick="document.getElementById('evrakCerceve').contentWindow.print()" style="background:#FBBF24;color:#0B1B2E;border:0;padding:9px 18px;border-radius:8px;font-weight:800;cursor:pointer">🖨️ Yazdır / PDF</button>
            </div>
            <iframe id="evrakCerceve" style="flex:1;width:100%;border:0;background:#fff"></iframe>`;
        const f = document.getElementById('evrakCerceve');
        f.srcdoc = sayfa(govde);
        k.style.display = 'flex';
    }
    window.evrakYazdirKapat = function () {
        const k = document.getElementById('evrakYazdirKatman'); if (k) k.style.display = 'none';
    };

    // Belgeler beyaz kâğıt: koyu tema yazıcıya gitmez.
    function sayfa(govde) {
        return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
        <style>
          @page { size: A4; margin: 20mm 18mm; }
          body { font: 12pt/1.6 "Times New Roman", Georgia, serif; color:#111; margin:0; padding:24px; }
          h1 { font-size: 14pt; text-align:center; margin:0 0 4px; letter-spacing:.02em; }
          h2 { font-size: 12pt; margin: 18px 0 6px; border-bottom:1px solid #999; padding-bottom:3px; }
          .ust { text-align:right; font-size:11pt; margin-bottom:22px; }
          .muhatap { font-weight:bold; margin-bottom:18px; line-height:1.4; }
          table { width:100%; border-collapse:collapse; margin:8px 0 14px; font-size:11pt; }
          td { border:1px solid #bbb; padding:6px 8px; vertical-align:top; }
          td.k { width:38%; background:#f3f4f6; font-weight:bold; }
          .imza { margin-top:42px; display:flex; justify-content:space-between; font-size:11pt; }
          .not { font-size:9.5pt; color:#444; border:1px solid #bbb; background:#fafafa; padding:8px 10px; margin-top:18px; }
          p { margin:0 0 10px; text-align:justify; }
        </style></head><body>${govde}</body></html>`;
    }

    function imzaBloku(kim) {
        return `<div class="imza"><div>${esc(bugun())}</div>
            <div style="text-align:center">${esc(kim || 'Başvuru Sahibi')}<br>Ad Soyad / Ünvan<br><br>………………………<br>İmza</div></div>`;
    }

    function dilekceHtml() {
        const vekil = _dosya.vekil_var && _dosya.vekil_unvan;
        return `
        <div class="ust">${esc(bugun())}</div>
        <div class="muhatap">${esc(sirketAdi())}<br>Lisanssız Üretim Başvuruları Birimine</div>
        <p>Aşağıda bilgileri verilen tüketim tesisimde, Elektrik Piyasasında Lisanssız Elektrik Üretim Yönetmeliği
        kapsamında <b>${dolu(_dosya.kurulu_guc_ac, ' kWe')}</b> kurulu gücünde bir güneş enerjisine dayalı üretim tesisi
        kurmak istiyorum. Bağlantı başvurumun değerlendirilmesini ve tarafıma bağlantı görüşü bildirilmesini
        arz ederim.</p>
        ${vekil ? `<p>Başvuru işlemleri, tarafımdan yetkilendirilen <b>${esc(_dosya.vekil_unvan)}</b> tarafından
        vekaleten yürütülecektir.</p>` : ''}
        <table>
          <tr><td class="k">Başvuru sahibi</td><td>${dolu(_dosya.ad_unvan)}</td></tr>
          <tr><td class="k">${_dosya.kisi_tipi === 'tuzel' ? 'Vergi kimlik no' : 'T.C. kimlik no'}</td><td>${dolu(_dosya.tckn_vkn)}</td></tr>
          <tr><td class="k">Tüketim tesisi tekil kodu</td><td>${dolu(_dosya.tuketim_tekil_kod)}</td></tr>
          <tr><td class="k">Üretim tesisi adresi</td><td>${dolu(_dosya.uretim_adresi)}</td></tr>
          <tr><td class="k">Kurulu güç (AC / DC)</td><td>${dolu(_dosya.kurulu_guc_ac, ' kWe')} / ${dolu(_dosya.kurulu_guc_dc, ' kWp')}</td></tr>
          <tr><td class="k">Telefon · E-posta</td><td>${dolu(_dosya.telefon)} · ${dolu(_dosya.eposta)}</td></tr>
        </table>
        ${imzaBloku(_dosya.ad_unvan)}`;
    }

    function beyanHtml() {
        return `
        <h1>FAALİYET YASAĞINA İLİŞKİN BEYAN</h1>
        <div class="ust">${esc(bugun())}</div>
        <div class="muhatap">${esc(sirketAdi())}</div>
        <p>6446 sayılı Elektrik Piyasası Kanunu'nun 5 inci maddesinin sekizinci fıkrası kapsamında,
        hakkımda/şirketimiz hakkında elektrik piyasasında faaliyet göstermeye engel bir yasak bulunmadığını;
        bu beyanın gerçeğe aykırı olması hâlinde doğacak hukuki ve cezai sorumluluğun tarafıma ait olduğunu
        beyan ederim.</p>
        <table>
          <tr><td class="k">Beyan sahibi</td><td>${dolu(_dosya.ad_unvan)}</td></tr>
          <tr><td class="k">${_dosya.kisi_tipi === 'tuzel' ? 'Vergi kimlik no' : 'T.C. kimlik no'}</td><td>${dolu(_dosya.tckn_vkn)}</td></tr>
          <tr><td class="k">Adres</td><td>${dolu(_dosya.yazisma_adresi)}</td></tr>
        </table>
        ${imzaBloku(_dosya.ad_unvan)}
        <div class="not">⚠️ Dağıtım şirketiniz bu beyan için kendi örneğini (25 kW altı başvurularda Ek-2) yayımlamış
        olabilir. Şirketin sitesinde bir örnek varsa onu kullanın.</div>`;
    }

    function muvafakatHtml() {
        return `
        <h1>KAT MALİKLERİ MUVAFAKATNAMESİ</h1>
        <div class="ust">${esc(bugun())}</div>
        <p>Aşağıda adresi belirtilen taşınmazın kat malikleri olarak, binanın çatısında
        <b>${dolu(_dosya.ad_unvan)}</b> adına güneş enerjisine dayalı elektrik üretim tesisi kurulmasına,
        tesisin işletilmesine ve bu amaçla ortak alanların kullanılmasına muvafakat ettiğimizi beyan ederiz.</p>
        <table>
          <tr><td class="k">Taşınmaz adresi</td><td>${dolu(_dosya.uretim_adresi)}</td></tr>
          <tr><td class="k">Ada / Parsel</td><td>${dolu(_dosya.ada)} / ${dolu(_dosya.parsel)}</td></tr>
          <tr><td class="k">Kurulu güç</td><td>${dolu(_dosya.kurulu_guc_ac, ' kWe')}</td></tr>
        </table>
        <h2>Kat Malikleri</h2>
        <table>
          <tr><td class="k">Bağımsız bölüm</td><td class="k">Ad Soyad</td><td class="k">İmza</td></tr>
          ${Array.from({ length: 8 }).map(() => '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>').join('')}
        </table>
        <div class="not">⚠️ Dağıtım şirketleri çoğunlukla bu muvafakat yerine <b>kat malikleri kurulu kararının
        karar defterinden onaylı örneğini</b> ister. Hangisinin kabul edildiğini başvurudan önce teyit edin.</div>`;
    }

    function vekaletHtml() {
        return `
        <h1>VEKALETNAME İÇİN BİLGİ NOTU</h1>
        <p>Aşağıdaki bilgiler, noterde düzenlenecek vekaletnamede yer alması gereken asgari unsurları içerir.
        <b>Bu belge vekaletname değildir</b>; noterde düzenlenmesi zorunludur.</p>
        <table>
          <tr><td class="k">Vekalet veren</td><td>${dolu(_dosya.ad_unvan)}</td></tr>
          <tr><td class="k">${_dosya.kisi_tipi === 'tuzel' ? 'Vergi kimlik no' : 'T.C. kimlik no'}</td><td>${dolu(_dosya.tckn_vkn)}</td></tr>
          <tr><td class="k">Vekil</td><td>${dolu(_dosya.vekil_unvan)}</td></tr>
          <tr><td class="k">Vekilin yetkilisi</td><td>${dolu(_dosya.vekil_yetkili)}</td></tr>
          <tr><td class="k">Yetki kapsamı</td><td>${esc(sirketAdi())} nezdinde lisanssız elektrik üretimi bağlantı başvurusu yapmak, evrak vermek ve almak, başvuru bedelini yatırmak, çağrı mektubunu teslim almak, bağlantı ve sistem kullanım anlaşmalarını imzalamak</td></tr>
          <tr><td class="k">Üretim tesisi</td><td>${dolu(_dosya.uretim_adresi)}</td></tr>
        </table>`;
    }

    function foyHtml() {
        const mulk = { tapu: 'Tapu (mülk sahibi)', kira: 'Kira sözleşmesi (en az 2 yıl)', kullanim_hakki: 'Kullanım hakkı belgesi' }[_dosya.mulkiyet] || '—';
        return `
        <h1>BAŞVURU BİLGİ FÖYÜ</h1>
        <div class="ust">${esc(bugun())} · ${esc(sirketAdi())}</div>
        <div class="not" style="margin-top:0;margin-bottom:16px">
          ⚠️ <b>Bu föy resmi başvuru formu YERİNE GEÇMEZ.</b> Dağıtım şirketinin kendi Ek-1 formunu ve teknik
          değerlendirme formunu şirketin sitesinden indirip, aşağıdaki bilgilerle doldurun.
        </div>
        <h2>Başvuru Sahibi</h2>
        <table>
          <tr><td class="k">Ad Soyad / Ünvan</td><td>${dolu(_dosya.ad_unvan)}</td></tr>
          <tr><td class="k">Kişi tipi</td><td>${_dosya.kisi_tipi === 'tuzel' ? 'Tüzel kişi' : 'Gerçek kişi'}</td></tr>
          <tr><td class="k">${_dosya.kisi_tipi === 'tuzel' ? 'Vergi kimlik no' : 'T.C. kimlik no'}</td><td>${dolu(_dosya.tckn_vkn)}</td></tr>
          <tr><td class="k">Telefon</td><td>${dolu(_dosya.telefon)}</td></tr>
          <tr><td class="k">E-posta</td><td>${dolu(_dosya.eposta)}</td></tr>
          <tr><td class="k">KEP adresi</td><td>${dolu(_dosya.kep)}</td></tr>
          <tr><td class="k">IBAN</td><td>${dolu(_dosya.iban)}</td></tr>
          <tr><td class="k">Yazışma adresi</td><td>${dolu(_dosya.yazisma_adresi)}</td></tr>
        </table>
        <h2>Tüketim Tesisi</h2>
        <table>
          <tr><td class="k">Tekil kod</td><td>${dolu(_dosya.tuketim_tekil_kod)}</td></tr>
          <tr><td class="k">Abone / sözleşme no</td><td>${dolu(_dosya.tuketim_abone_no)}</td></tr>
          <tr><td class="k">Adres</td><td>${dolu(_dosya.tuketim_adresi)}</td></tr>
          <tr><td class="k">Tarife grubu</td><td>${dolu(_dosya.tarife_grubu)}</td></tr>
        </table>
        <h2>Üretim Tesisi</h2>
        <table>
          <tr><td class="k">Adres</td><td>${dolu(_dosya.uretim_adresi)}</td></tr>
          <tr><td class="k">İl / İlçe</td><td>${dolu(_dosya.il)} / ${dolu(_dosya.ilce)}</td></tr>
          <tr><td class="k">Ada / Parsel</td><td>${dolu(_dosya.ada)} / ${dolu(_dosya.parsel)}</td></tr>
          <tr><td class="k">Yerleşim</td><td>${_dosya.yerlesim === 'arazi' ? 'Arazi' : 'Çatı / cephe'}</td></tr>
          <tr><td class="k">Kurulu güç (AC)</td><td>${dolu(_dosya.kurulu_guc_ac, ' kWe')}</td></tr>
          <tr><td class="k">Panel gücü (DC)</td><td>${dolu(_dosya.kurulu_guc_dc, ' kWp')}</td></tr>
          <tr><td class="k">Panel sayısı</td><td>${dolu(_dosya.panel_sayisi)}</td></tr>
          <tr><td class="k">Kaynak türü</td><td>Güneş</td></tr>
        </table>
        <h2>Mülkiyet ve Yetki</h2>
        <table>
          <tr><td class="k">Kullanım durumu</td><td>${esc(mulk)}</td></tr>
          <tr><td class="k">Kat malikleri kararı</td><td>${_dosya.kat_malikleri_gerekli ? 'Gerekli' : 'Gerekmiyor (müstakil yapı)'}</td></tr>
          <tr><td class="k">Vekaleten başvuru</td><td>${_dosya.vekil_var ? esc(_dosya.vekil_unvan || 'Evet') : 'Hayır'}</td></tr>
        </table>
        <div class="not">Kırmızı ……… ile görünen alanlar doldurulmamıştır. Başvurudan önce tamamlayın.</div>`;
    }
})();
