/* ============================================================================
   about.js — "HAKKIMDA" SAYFASI (yeniden tasarım)
   Tüm sayfa JS ile #aboutRoot içine basılır. Bileşen CSS'i bu dosya tarafından
   <head>'e enjekte edilir → index.html'de ayrı CSS düzenlemesi GEREKMEZ.

   index.html'de karşılığı sadece:
     <div id="aboutModule" class="hidden w-full max-w-5xl mx-auto mt-4 px-4 animate-fade-in">
        <div id="aboutRoot"></div>
     </div>

   • Metinler (ad, unvan, tanıtım, sayılar, video linki, iletişim) admin panelinden
     düzenlenir → Supabase 'site_content' tablosu (key/value).
   • YOL HARİTASI aşağıdaki JOURNEY dizisinde koda gömülüdür; adım eklemek/çıkarmak
     için diziye satır ekleyin/çıkarın (son adıma now:true → tam parlayan güneş).
   • about.js index.html'de EN SONA (mevcut konumunda) yüklenir.
   ============================================================================ */
(function () {
    const BUCKET = 'site-assets';

    // -------------------------------------------------- kod içi varsayılanlar
    // (Taze DB'de bile sayfa dolu görünsün. Adminde kaydedilen değerler bunları ezer.)
    const ABOUT_DEFAULTS = {
        about_photo_url: '',
        about_name:      'Erdem Yavuz',
        about_title:     'Dijital Dönüşüm Uzmanı · Elektrik Mühendisi · Güneş Enerjisi',
        about_tagline:   'Güneş enerjisi sistemlerindeki teknik konuları müşterilerime sade ve anlaşılır şekilde aktarıyorum. Güneş enerjisi sektörünü dijitalleştirerek sistematikleştiriyor, tüm paydaşlarımın işlerini hızlandırıyorum.',
        about_location:  'İstanbul ve Antalya',
        about_edu:       'Marmara Üniversitesi',
        about_intro:     'GES projelerinde hibrit inverterler, bataryalı sistemler, satış sonrası teknik destek, teklif öncesi teknik değerlendirme ve müşteri teknik yönlendirme süreçlerinde aktif rol alan bir Elektrik-Elektronik Mühendisiyim. Solplanet ve Jinko inverter markalarının Türkiye operasyonlarında toplam 1.400+ kurulum kapsamında teknik destek ve süreç kurgulama görevlerinde yer aldım.\n\nTeknik uzmanlığımı satış, iş geliştirme, teknik eğitim, dijital içerik ve proje tanıtımı ile birleştiriyorum. Hedefim; saha ile ofis entegrasyonunu güçlendiren, teknik ve ticari süreçleri birlikte yöneten bir rolde şeffaf ve ölçülebilir katma değer üretmek.',
        about_stat1_value: '4+',     about_stat1_label: 'Yıl Deneyim',
        about_stat2_value: '5.000+', about_stat2_label: 'Teknik Destek',
        about_stat3_value: '500+',   about_stat3_label: 'Teknik Video Üretimi',
        about_video:     '',                       // YouTube linki veya ID (boşsa "Yakında" görünür)
        about_phone:     '+90 531 995 69 30',
        about_whatsapp:  '905319956930',           // wa.me formatı: yalnız rakamlar
        about_email:     'erdem.yvz@hotmail.com',
        about_linkedin: '', about_youtube: '', about_instagram: ''
    };

    window.EPC_CONTENT = window.EPC_CONTENT || {};            // veritabanı değerleri
    window.EPC_CONTENT_DEFAULTS = ABOUT_DEFAULTS;

    // -------------------------------------------------- YOL HARİTASI (koda gömülü)
    const JOURNEY = [
        { year:"2017", title:"İlk saha adımı",
          org:"Türk Ytong Sanayi · Sabiha Gökçen Havaalanı — Elektrik-Elektronik Stajyeri",
          desc:"Aydınlatma panoları, bakım süreçleri ve arıza önleyici kontrollerle mühendisliğin sahadaki temeliyle tanıştım." },
        { year:"2020", title:"İki yol birden",
          org:"Marmara Üniversitesi (Elektrik-Elektronik Müh.) · Teknik Uçuş'un kuruluşu",
          desc:"Teknik altyapımı kurarken Teknik Uçuş ile drone çekimi ve video prodüksiyonuna başladım; projeleri görünür kılmayı öğrendim." },
        { year:"2022", title:"Güneş enerjisine geçiş",
          org:"Technicall Yenilenebilir Enerji — Teknik Destek & İçerik Üretimi",
          desc:"Solplanet ve Jinko inverterlerinin Türkiye operasyonlarında satış sonrası teknik desteği kurguladım; 3.000+ müşteri vakasında yer aldım." },
        { year:"BUGÜN", title:"GES Sistemleri Uzmanı",
          org:"Yatırımcı · EPC · Saha ekipleri arasında köprü",
          desc:"1.400+ kurulum, 3.000+ müşteri vakası ve 500+ teknik içerikle; teknik konuları ticari değere çeviren bir rolde çalışıyorum.",
          now:true }
    ];

    // -------------------------------------------------- yardımcılar
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
    const digits  = (s) => String(s || '').replace(/[^\d]/g, '');
    const telHref = (p) => String(p || '').replace(/[^\d+]/g, '');

    // YouTube: link ya da 11 haneli ID'den video ID çıkar (tanınmazsa boş → "Yakında")
    function youTubeId(s) {
        s = String(s || '').trim();
        if (!s) return '';
        const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/);
        if (m) return m[1];
        if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
        return '';
    }

    // -------------------------------------------------- BİLEŞEN CSS (bir kez enjekte)
    function injectStyles() {
        if (document.getElementById('aboutStyles')) return;
        const css = `
#aboutRoot .ab-orb{position:absolute;left:74%;top:-240px;transform:translateX(-50%);width:560px;height:560px;border-radius:9999px;pointer-events:none;z-index:0;background:radial-gradient(circle,rgba(252,211,77,.30) 0%,rgba(245,158,11,.15) 34%,transparent 68%);filter:blur(6px);}

#aboutRoot .ab-journey{position:relative;padding-left:38px;}
#aboutRoot .ab-journey::before{content:"";position:absolute;left:13px;top:8px;bottom:8px;width:3px;border-radius:3px;background:linear-gradient(to bottom,rgba(148,163,184,.35) 0%,#FCD34D 55%,#F59E0B 100%);}
#aboutRoot .ab-j-row{position:relative;padding-bottom:34px;}
#aboutRoot .ab-j-row:last-child{padding-bottom:0;}
#aboutRoot .ab-j-node{position:absolute;left:-31px;top:2px;width:20px;height:20px;border-radius:9999px;background:#CBD5E1;box-shadow:0 0 0 4px #F9FAFB;}
#aboutRoot .ab-j-row:nth-child(2) .ab-j-node{background:#FDE08A;}
#aboutRoot .ab-j-row:nth-child(3) .ab-j-node{background:#FBBF24;}
#aboutRoot .ab-j-row.is-now .ab-j-node{background:radial-gradient(circle,#FEF3C7 0%,#FBBF24 45%,#F59E0B 100%);box-shadow:0 0 0 4px #F9FAFB,0 0 26px rgba(245,158,11,.85);width:24px;height:24px;left:-33px;}
#aboutRoot .ab-j-year{font-size:12px;font-weight:700;letter-spacing:.06em;color:#B45309;}
#aboutRoot .ab-j-title{font-size:1.12rem;font-weight:800;color:#0f172a;margin-top:2px;}
#aboutRoot .ab-j-org{font-size:.82rem;font-weight:700;color:#F59E0B;margin-top:2px;}
#aboutRoot .ab-j-desc{font-size:.92rem;color:#475569;line-height:1.6;margin-top:6px;max-width:46rem;}

#aboutRoot .ab-video-poster{position:relative;aspect-ratio:16/9;border-radius:1rem;overflow:hidden;cursor:pointer;background:radial-gradient(700px 300px at 70% -20%,rgba(245,158,11,.22),transparent 60%),linear-gradient(140deg,#0A1A2F,#0E2540 60%,#0B1B2E);border:1px solid rgba(251,191,36,.16);}
#aboutRoot .ab-video-poster::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(circle at 50% 40%,#000 5%,transparent 70%);mask-image:radial-gradient(circle at 50% 40%,#000 5%,transparent 70%);}
#aboutRoot .ab-play{position:absolute;inset:0;margin:auto;width:78px;height:78px;border-radius:9999px;border:0;cursor:pointer;background-image:linear-gradient(100deg,#F59E0B,#FBBF24 40%,#10B981);color:#fff;font-size:26px;padding-left:6px;display:flex;align-items:center;justify-content:center;box-shadow:0 18px 40px -14px rgba(245,158,11,.75);transition:transform .2s ease;z-index:2;}
#aboutRoot .ab-play:hover{transform:scale(1.07);}
#aboutRoot .ab-soon{position:absolute;top:14px;right:14px;z-index:2;font-size:11px;font-weight:800;letter-spacing:.08em;background:rgba(251,191,36,.16);color:#FCD34D;border:1px solid rgba(251,191,36,.3);padding:5px 11px;border-radius:9999px;}

#aboutRoot .ab-contact-card{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #E2E8F0;border-radius:.9rem;padding:15px;transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease;}
#aboutRoot .ab-contact-card:hover{border-color:#FDE08A;box-shadow:0 14px 30px -18px rgba(245,158,11,.5);transform:translateY(-2px);}
#aboutRoot .ab-cc-icon{width:44px;height:44px;border-radius:.7rem;background:#FFF8EB;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}

@media (prefers-reduced-motion: no-preference){
  #aboutRoot .ab-reveal{opacity:0;transform:translateY(20px);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1);}
  #aboutRoot .ab-reveal.is-visible{opacity:1;transform:none;}
  #aboutRoot .ab-orb{animation:abBreathe 9s ease-in-out infinite alternate;}
  @keyframes abBreathe{from{opacity:.7;transform:translateX(-50%) scale(1);}to{opacity:1;transform:translateX(-50%) scale(1.08);}}
}`;
        const style = document.createElement('style');
        style.id = 'aboutStyles';
        style.textContent = css;
        document.head.appendChild(style);
    }

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

    // -------------------------------------------------- C) ZİYARETÇİ RENDER (parça üreticiler)
    function heroHTML() {
        const name = C('about_name'), title = C('about_title'), tagline = C('about_tagline');
        const loc = C('about_location'), edu = C('about_edu'), photo = C('about_photo_url');
        const phone = C('about_phone'), wa = digits(C('about_whatsapp')), email = C('about_email');
        const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

        let meta = '';
        if (loc) meta += `<span class="flex items-center gap-1.5">📍 ${esc(loc)}</span>`;
        if (edu) meta += `<span class="flex items-center gap-1.5">🎓 ${esc(edu)}</span>`;

        let cta = '';
        if (phone) cta += `<a href="tel:${esc(telHref(phone))}" class="btn-sun font-black text-sm px-6 py-3 rounded-xl inline-flex items-center gap-2">📞 Hemen Ara</a>`;
        if (wa)    cta += `<a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener noreferrer" class="glass-panel font-bold text-sm px-6 py-3 rounded-xl inline-flex items-center gap-2 text-white"><span style="color:#4ade80;">✆</span> WhatsApp</a>`;
        if (email) cta += `<a href="mailto:${esc(email)}" class="glass-panel font-bold text-sm px-6 py-3 rounded-xl inline-flex items-center gap-2 text-white">✉️ E-posta</a>`;

        const photoBlock = photo
            ? `<img src="${esc(photo)}" alt="${esc(name)}" class="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover object-top ring-4 ring-white/15 shadow-2xl" style="background:#fff;">`
            : `<div class="w-32 h-32 md:w-40 md:h-40 rounded-full ring-4 ring-white/15 flex items-center justify-center text-5xl font-black text-white" style="background:radial-gradient(circle at 30% 25%, rgba(252,211,77,.35), rgba(255,255,255,.06));">${esc(initials)}</div>`;

        return `
    <section class="tech-gradient rounded-3xl p-7 md:p-11 text-white shadow-2xl mb-6 overflow-hidden">
      <div class="ab-orb"></div>
      <div class="flex flex-col md:flex-row items-center md:items-start gap-7 text-center md:text-left">
        <div class="shrink-0">${photoBlock}</div>
        <div class="min-w-0 flex-1">
          <h1 class="text-3xl md:text-5xl font-black mb-1">${esc(name)}</h1>
          ${title ? `<p class="text-lg md:text-xl font-bold mb-2" style="color:#FCD34D;">${esc(title)}</p>` : ''}
          ${tagline ? `<p class="text-slate-300 text-sm md:text-base mb-4 max-w-2xl">${esc(tagline)}</p>` : ''}
          ${meta ? `<div class="flex flex-wrap gap-x-5 gap-y-1 justify-center md:justify-start text-sm text-slate-400 mb-5">${meta}</div>` : ''}
          ${cta ? `<div class="flex flex-wrap gap-3 justify-center md:justify-start">${cta}</div>` : ''}
        </div>
      </div>
      ${statsHTML()}
    </section>`;
    }

    function statsHTML() {
        const items = [
            [C('about_stat1_value'), C('about_stat1_label')],
            [C('about_stat2_value'), C('about_stat2_label')],
            [C('about_stat3_value'), C('about_stat3_label')]
        ].filter(p => p[0]);
        if (!items.length) return '';
        const cols = items.length === 1 ? 'grid-cols-1' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
        const cells = items.map(([v, l]) =>
            `<div><div class="font-mono text-2xl md:text-3xl font-bold" style="color:#FCD34D;">${esc(v)}</div><div class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mt-1">${esc(l)}</div></div>`
        ).join('');
        return `<div class="mt-8 pt-6 border-t border-white/10 grid ${cols} gap-4 text-center">${cells}</div>`;
    }

    function videoHTML() {
        const id = youTubeId(C('about_video'));
        const inner = id
            ? `<iframe style="position:absolute;inset:0;width:100%;height:100%;border:0;" src="https://www.youtube.com/embed/${esc(id)}" title="Tanıtım videosu" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
            : `<span class="ab-soon">YAKINDA</span><button class="ab-play" type="button" aria-label="Videoyu oynat" onclick="abVideoNote(this)">▶</button>`;
        const sub = id
            ? 'Kısa tanıtım videom.'
            : "Kısa tanıtım videosu yakında burada — YouTube'a yüklenip doğrudan sitede oynatılacak.";
        return `
    <section class="ab-reveal mb-6">
      <p class="text-[11px] uppercase tracking-[0.18em] font-black text-amber-600 mb-3">Tanıtım</p>
      <div class="ab-video-poster">${inner}</div>
      <p class="mt-3 text-base md:text-lg font-black text-slate-800">Beni birkaç dakikada tanıyın</p>
      <p class="text-sm text-slate-500">${sub}</p>
    </section>`;
    }

    function introHTML() {
        const intro = C('about_intro');
        if (!intro) return '';
        const body = esc(intro)
            .replace(/\r?\n\r?\n/g, '</p><p class="text-base text-slate-600 leading-relaxed mb-4">')
            .replace(/\r?\n/g, '<br>');
        return `
    <section class="bg-white border border-slate-200 rounded-2xl p-7 md:p-10 shadow-sm mb-8 ab-reveal">
      <h2 class="text-xl md:text-2xl font-black text-slate-800 mb-3">Hakkımda</h2>
      <p class="text-base text-slate-600 leading-relaxed mb-4">${body}</p>
    </section>`;
    }

    function journeyHTML() {
        const rows = JOURNEY.map(m => `
        <div class="ab-j-row ab-reveal${m.now ? ' is-now' : ''}">
          <span class="ab-j-node"></span>
          <div class="ab-j-year font-mono">${esc(m.year)}</div>
          <div class="ab-j-title">${esc(m.title)}</div>
          <div class="ab-j-org">${esc(m.org)}</div>
          <div class="ab-j-desc">${esc(m.desc)}</div>
        </div>`).join('');
        return `
    <section class="mb-8">
      <div class="mb-5">
        <p class="text-[11px] uppercase tracking-[0.18em] font-black text-amber-600 mb-1">Yol Haritası</p>
        <h2 class="text-2xl md:text-3xl font-black text-slate-800">Yolculuğum</h2>
        <p class="text-sm text-slate-500 mt-1">Her adım, bugün olduğum yere doğru bir ışık.</p>
      </div>
      <div class="ab-journey">${rows}</div>
    </section>`;
    }

    function contactHTML() {
        const phone = C('about_phone'), wa = digits(C('about_whatsapp')), email = C('about_email');
        const li = C('about_linkedin'), yt = C('about_youtube'), ig = C('about_instagram');
        const items = [];
        const blank = ' target="_blank" rel="noopener noreferrer"';
        if (phone) items.push(['📞', 'Telefon',   phone,          'tel:' + telHref(phone),   '']);
        if (wa)    items.push(['✆', 'WhatsApp',  'Mesaj gönder',  'https://wa.me/' + wa,     blank]);
        if (email) items.push(['✉️', 'E-posta',   email,           'mailto:' + email,         '']);
        if (li)    items.push(['💼', 'LinkedIn',  'Profili gör',   norm(li),                  blank]);
        if (yt)    items.push(['▶️', 'YouTube',   'Videolar',      norm(yt),                  blank]);
        if (ig)    items.push(['📸', 'Instagram', 'Takip et',      norm(ig),                  blank]);
        if (!items.length) return '';
        const cards = items.map(([icon, label, val, href, tgt]) => `
        <a href="${esc(href)}"${tgt} class="ab-contact-card">
          <span class="ab-cc-icon">${icon}</span>
          <span class="min-w-0">
            <span class="block text-[11px] uppercase tracking-wider text-slate-400 font-bold">${label}</span>
            <span class="block text-sm font-bold text-slate-700 truncate">${esc(val)}</span>
          </span>
        </a>`).join('');
        return `
    <section class="tech-gradient rounded-3xl p-7 md:p-10 text-white shadow-2xl mb-10 overflow-hidden ab-reveal">
      <div class="text-center max-w-2xl mx-auto mb-7">
        <h2 class="text-2xl md:text-3xl font-black mb-2">Projeniz için doğrudan bana ulaşın</h2>
        <p class="text-slate-300 text-sm md:text-base">Sorularınızı arayarak ya da WhatsApp'tan yazarak iletebilirsiniz — hızlıca dönüş yapıyorum.</p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${cards}</div>
    </section>`;
    }

    function renderAbout() {
        const root = document.getElementById('aboutRoot');
        if (!root) return;
        injectStyles();
        root.innerHTML =
            `<button onclick="window.location.hash='#home'" class="text-slate-500 hover:text-amber-600 font-bold mb-4 text-sm">← Ana Sayfaya Dön</button>`
            + heroHTML()
            + videoHTML()
            + introHTML()
            + journeyHTML()
            + contactHTML();
        wireReveal();
    }
    window.renderAbout = renderAbout;

    // Kaydırınca beliren bölümler (about sayfasına özel, kapsamlı; hareket hassasiyetine saygılı)
    function wireReveal() {
        const root = document.getElementById('aboutRoot');
        if (!root) return;
        const els = root.querySelectorAll('.ab-reveal');
        const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced || !('IntersectionObserver' in window)) {
            els.forEach(el => el.classList.add('is-visible'));
            return;
        }
        const io = new IntersectionObserver((entries) => {
            entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
        els.forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.top < window.innerHeight) el.classList.add('is-visible');   // ekrandakiler hemen görünür
            else io.observe(el);
        });
    }

    // Video henüz eklenmemişken küçük bilgilendirme
    window.abVideoNote = function (el) {
        const poster = el.closest('.ab-video-poster') || el.parentElement;
        if (!poster || poster.dataset.noted) return;
        poster.dataset.noted = '1';
        const n = document.createElement('div');
        n.textContent = '🎬 Tanıtım videosu yakında eklenecek';
        n.style.cssText = 'position:absolute;left:0;right:0;bottom:0;z-index:3;background:rgba(10,26,47,.82);color:#FCD34D;font-weight:800;font-size:13px;text-align:center;padding:12px;';
        poster.appendChild(n);
    };

    // Ziyaretçi sayfasından açılış
    window.openAboutPage = function () {
        if (typeof openPublicModule === 'function') openPublicModule('aboutModule');
        renderAbout();
        if (window.location.hash !== '#hakkimda') window.location.hash = '#hakkimda';
    };

    // -------------------------------------------------- D) ADMİN DÜZENLEME KARTI
    const ABOUT_SCHEMA = [
        ['about_photo_url',  'Profil Fotoğrafı',                         'image'],
        ['about_name',       'Ad Soyad',                                 'text'],
        ['about_title',      'Unvan (· ile ayırabilirsiniz)',           'text'],
        ['about_tagline',    'Kısa Tanıtım (üst banttaki cümle)',       'area'],
        ['about_location',   'Konum',                                    'text'],
        ['about_edu',        'Eğitim',                                   'text'],
        ['about_intro',      'Hakkımda Metni (paragraf için boş satır)', 'area'],
        ['about_stat1_value','1. Sayı — Değer (ör. 4+)',                'text'],
        ['about_stat1_label','1. Sayı — Etiket (ör. Yıl Deneyim)',      'text'],
        ['about_stat2_value','2. Sayı — Değer (ör. 5.000+)',            'text'],
        ['about_stat2_label','2. Sayı — Etiket (ör. Teknik Destek)',    'text'],
        ['about_stat3_value','3. Sayı — Değer (ör. 500+)',              'text'],
        ['about_stat3_label','3. Sayı — Etiket (ör. Teknik Video Üretimi)', 'text'],
        ['about_video',      'Tanıtım Videosu (YouTube linki veya ID — boşsa "Yakında" görünür)', 'text'],
        ['about_phone',      'Telefon',                                  'text'],
        ['about_whatsapp',   'WhatsApp (yalnız rakam, ör. 905319956930)','text'],
        ['about_email',      'E-posta',                                  'text'],
        ['about_linkedin',   'LinkedIn adresi',                          'text'],
        ['about_youtube',    'YouTube adresi',                           'text'],
        ['about_instagram',  'Instagram adresi',                         'text']
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
            <p class="text-xs text-slate-400 mb-4">Buradaki içerik ziyaretçi sayfasındaki Hakkımda bölümünde görünür. Boş bıraktığınız alanlar sayfada gösterilmez. (Yol haritası koddan düzenlenir.)</p>
            <div id="aboutAdminFields" class="space-y-3"></div>
            <div class="flex items-center gap-3 mt-4">
                <button onclick="saveAboutContent()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-2.5 rounded-lg">Kaydet</button>
                <span id="aboutSaveMsg" class="text-sm"></span>
            </div>`;
        host.appendChild(card);

        const box = document.getElementById('aboutAdminFields');
        box.innerHTML = ABOUT_SCHEMA.map(([key, label, type]) => {
            // Admin alanı: DB değeri varsa onu, yoksa kod varsayılanını göster (mevcut görünen içerik)
            const dbv = window.EPC_CONTENT[key];
            const val = (dbv != null && String(dbv).trim() !== '') ? dbv : (ABOUT_DEFAULTS[key] != null ? ABOUT_DEFAULTS[key] : '');
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
