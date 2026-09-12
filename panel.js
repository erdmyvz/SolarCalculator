/* ============================================================================
   panel.js — KURULUMCU PANELİ ANA EKRANI (canlı özet)

   Ana ekran eskiden yalnız bir menüydü: yedi kart, hiçbiri firmanın o anki
   durumu hakkında tek kelime etmiyordu. "Yönetim paneli" adını taşıyan bir
   ekranın, yönetilecek şeyin durumunu göstermesi gerekir. Bu dosya ana ekrana
   günün gerçek sayılarını basar.

   İKİ KURAL:
   1) SAYILAR TEK KAYNAKTAN. Panoyu (dashboard.js) ve ana ekranı aynı sorgular
      besler — epcPanelVeri(). İkisi ayrı ayrı çekseydi aynı oturumda farklı
      sayı görünebilirdi. 60 sn önbellek; "Yenile" zorla tazeler.
   2) UYDURMA SAYI YOK. Bir sorgu hata verirse o alan "—" kalır, rozet hiç
      basılmaz. Eksik bilgi, yanlış bilgiden iyidir.

   RLS sayesinde her firma yalnız kendi kayıtlarını sayar; admin hepsini görür.
   ============================================================================ */
(function () {
    'use strict';

    const menu = document.getElementById('mainMenu');
    if (!menu) return;

    // ---------------------------------------------------- ORTAK VERİ KAYNAĞI
    let _kayit = null, _zaman = 0;
    const OMUR_MS = 60000;

    window.epcPanelVeri = async function (tazele) {
        if (!window.supabaseClient) return null;
        if (!tazele && _kayit && Date.now() - _zaman < OMUR_MS) return _kayit;

        const [lr, qr, pr, sr] = await Promise.all([
            supabaseClient.from('leads').select('status'),
            supabaseClient.from('quotes').select('status, total_amount'),
            supabaseClient.from('projects').select('id'),
            supabaseClient.from('service_requests').select('status')
        ]);

        // Hata alan tablo null kalır — 0 DEĞİL. "Bilinmiyor" ile "yok" aynı şey
        // değil; biri boş kutu gösterir, diğeri firmanın işi yok sanmasına yol açar.
        _kayit = {
            leads:    lr.error ? null : (lr.data || []),
            quotes:   qr.error ? null : (qr.data || []),
            projects: pr.error ? null : (pr.data || []),
            services: sr.error ? null : (sr.data || [])
        };
        _zaman = Date.now();
        return _kayit;
    };

    // Aşama sözlüğü core.js'teki crmStatusLabels ile aynı olmalı; "açık" demek
    // "devreye alınmamış" demek. Pano da aynı tanımı kullanıyor.
    const acikLead   = (v) => v.filter(l => l.status !== 'tamamlandi').length;
    const yeniLead   = (v) => v.filter(l => l.status === 'yeni_basvuru').length;
    const bekleyenTk = (v) => v.filter(q => q.status === 'gonderildi').length;
    const acikServis = (v) => v.filter(s => s.status !== 'tamamlandi').length;

    // ------------------------------------------------------------ KARŞILAMA
    function selamla() {
        const h = new Date().getHours();
        if (h < 6)  return 'İyi geceler';
        if (h < 12) return 'Günaydın';
        if (h < 18) return 'İyi günler';
        return 'İyi akşamlar';
    }

    function bugunYazisi() {
        const s = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
        // Türkçe yerelde gün/ay adları küçük geliyor; ilk harfi Türkçe kurala
        // göre büyütüyoruz (toUpperCase() 'i' harfini bozardı).
        return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
    }

    function basligiYaz() {
        const tarihEl = document.getElementById('panelDate');
        const selamEl = document.getElementById('panelGreeting');
        if (tarihEl) tarihEl.textContent = bugunYazisi();
        if (selamEl) {
            const ad = (window.currentUserProfile && window.currentUserProfile.first_name) || '';
            selamEl.textContent = ad ? `${selamla()}, ${ad}` : selamla();
        }
    }

    // ---------------------------------------------------------- BUGÜN ŞERİDİ
    const sayiHtml = (deger, etiket, hedef, vurgu) => `
        <button type="button" class="panel-stat" data-git="${hedef}" style="--accent:${vurgu}">
            <span class="panel-stat-num"${deger === null ? ' data-bos="1"' : ''}>${deger === null ? '—' : deger}</span>
            <span class="panel-stat-lbl">${etiket}</span>
        </button>`;

    function seridiYaz(v) {
        const kutu = document.getElementById('panelStats');
        if (!kutu) return;

        // Dört kaynağın dördü de düştüyse şeridi hiç gösterme; dört tane "—"
        // basmak kullanıcıya bir şey anlatmaz, sadece ekranı kirletir.
        if (!v || (!v.leads && !v.quotes && !v.projects && !v.services)) { kutu.hidden = true; return; }

        kutu.innerHTML =
            sayiHtml(v.leads    ? acikLead(v.leads)       : null, 'Açık müşteri',   'btnGoCRM',       '#047857') +
            sayiHtml(v.quotes   ? bekleyenTk(v.quotes)    : null, 'Bekleyen teklif','btnGoQuotes',    '#4f46e5') +
            sayiHtml(v.services ? acikServis(v.services)  : null, 'Açık servis',    'btnGoServices',  '#dc2626') +
            sayiHtml(v.projects ? v.projects.length       : null, 'Kurulu tesis',   'btnGoProjects',  '#b45309');
        kutu.hidden = false;

        kutu.querySelectorAll('[data-git]').forEach(b => {
            b.addEventListener('click', () => document.getElementById(b.dataset.git)?.click());
        });
    }

    // ------------------------------------------------------------- ROZETLER
    // Sayı rozeti klasik bildirim rozeti gibi davranır: sıfırsa basılmaz.
    // Sıfırların yeri "Bugün" şeridi — orada sıfır da bilgidir.
    function rozetYaz(ad, sayi, aciklama) {
        const el = menu.querySelector(`[data-rozet="${ad}"]`);
        if (!el) return;
        if (sayi === null || sayi === 0) { el.textContent = ''; el.removeAttribute('title'); return; }
        el.textContent = String(sayi);
        el.setAttribute('title', `${sayi} ${aciklama}`);
        const kart = el.closest('.panel-card');
        if (kart) kart.setAttribute('aria-label', `${kart.querySelector('.panel-card-title')?.textContent || ''} — ${sayi} ${aciklama}`);
    }

    function rozetleriYaz(v) {
        if (!v) return;
        rozetYaz('lead',   v.leads    ? acikLead(v.leads)      : null, 'açık müşteri kaydı');
        rozetYaz('teklif', v.quotes   ? bekleyenTk(v.quotes)   : null, 'teklif yanıt bekliyor');
        rozetYaz('servis', v.services ? acikServis(v.services) : null, 'açık servis talebi');
        rozetYaz('tesis',  v.projects ? v.projects.length      : null, 'kurulu tesis');
    }

    // ---------------------------------------------------------- ÖZET CÜMLESİ
    function ozetiYaz(v) {
        const el = document.getElementById('panelSummary');
        if (!el || !v) return;

        const parcalar = [];
        if (v.leads    && yeniLead(v.leads) > 0)      parcalar.push(`<b>${yeniLead(v.leads)}</b> yeni başvuru`);
        if (v.quotes   && bekleyenTk(v.quotes) > 0)   parcalar.push(`<b>${bekleyenTk(v.quotes)}</b> teklif yanıt bekliyor`);
        if (v.services && acikServis(v.services) > 0) parcalar.push(`<b>${acikServis(v.services)}</b> servis talebi açık`);

        if (parcalar.length) { el.innerHTML = parcalar.join(' · '); return; }
        // Hiç iş yoksa bunu söylemek de bilgidir — ama yalnız veri gerçekten
        // geldiyse. Sorgular düştüyse sabit metin yerinde kalır.
        if (v.leads && v.quotes && v.services) el.textContent = 'Bekleyen işiniz yok; her şey güncel.';
    }

    // ------------------------------------------------------------ TAZELEME
    let _calisiyor = false;
    window.epcPanelHomeTazele = async function (zorla) {
        basligiYaz();
        if (_calisiyor) return;
        _calisiyor = true;
        try {
            const v = await window.epcPanelVeri(zorla);
            seridiYaz(v);
            rozetleriYaz(v);
            ozetiYaz(v);
        } catch (e) {
            // Sessiz geç: ana ekran menü olarak çalışmaya devam etsin.
            if (typeof window.logError === 'function') window.logError('Panel özeti yüklenemedi', e, 'panel.js');
        } finally { _calisiyor = false; }
    };

    // Ana ekran her görünür olduğunda tazelensin (menüye dönüş, modül kapanışı…).
    // Böylece 12 ayrı dosyaya çağrı eklemek gerekmiyor.
    new MutationObserver(() => {
        if (!menu.classList.contains('hidden')) window.epcPanelHomeTazele();
    }).observe(menu, { attributes: true, attributeFilter: ['class'] });

    // Admin kartı <div>; klavyeyle de açılabilsin.
    const admK = document.getElementById('adminPanelCard');
    admK?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); admK.click(); }
    });

    // Açılışta buradan ÇAĞIRMIYORUZ: panel paketi rol ayrımından önce iniyor ve
    // yatırımcı/danışman/tedarikçi de bu dosyayı yüklüyor. İlk tazelemeyi
    // auth.js'teki fetchUserProfile tetikler — oraya yalnız firma ve admin
    // hesapları ulaşıyor, yani sorgular yalnız karşılığı olan rolde atılıyor.
})();
