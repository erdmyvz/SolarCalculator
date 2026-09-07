/* ============================================================================
   gateway.js — AÇILIŞ ROL SEÇİM EKRANI + KURULUMCU/DANIŞMAN FUNNEL SAYFALARI
   Kendi kendine yeten modül (about.js ile aynı desen): kendi CSS'ini enjekte
   eder, kendi HTML'ini #gatewayContainer içine basar. index.html'de public.js'
   ten SONRA yüklenir. Yönlendirme router.js tarafından yönetilir:
      #home       → renderGateway()          (3 rol butonu)
      #yatirimci  → mevcut yatırımcı funnel'ı (landingContainer)
      #kurulumcu  → /kurulumcu  (statik sayfa, router yönlendirir)
      #danisman   → /danisman   (statik sayfa, router yönlendirir)
   ============================================================================ */
(function () {
    'use strict';

    // --- CSS'i yalnızca bir kez enjekte et ---
    function injectCSS() {
        if (document.getElementById('gwStyles')) return;
        const s = document.createElement('style');
        s.id = 'gwStyles';
        s.textContent = `
        /* ---- Altın oran ölçeği (index.html'deki :root değişkenleri) ---- */
        #gatewayContainer {
            background:
                radial-gradient(1000px 460px at 50% -8%, rgba(245,158,11,.10), transparent 62%),
                linear-gradient(180deg,#0B1B2E 0%,#081524 100%);
            color:#e2e8f0;
        }
        .gw-wrap { min-height:100vh; display:flex; flex-direction:column; }

        /* Üst çubuk */
        .gw-nav { position:sticky; top:0; z-index:40; background:rgba(11,27,46,.82);
            backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
            border-bottom:1px solid rgba(251,191,36,.12); }
        .gw-nav-inner { max-width:1120px; margin:0 auto; display:flex; align-items:center;
            justify-content:space-between; gap:var(--s4); padding:var(--s3) var(--s4); }
        .gw-logo { font-size:var(--fs-md); font-weight:800; letter-spacing:-.03em;
            background:linear-gradient(90deg,#fcd34d,#34d399);
            -webkit-background-clip:text; background-clip:text; color:transparent; text-decoration:none; }
        .gw-nav-links { display:flex; align-items:center; gap:var(--s2); }
        .gw-nav-link { font-size:var(--fs-sm); font-weight:700; color:#cbd5e1; text-decoration:none;
            padding:var(--s2) var(--s3); border-radius:var(--r-sm); transition:color .15s,background .15s; }
        .gw-nav-link:hover { color:#fff; background:rgba(255,255,255,.06); }
        .gw-login { border:1px solid #475569; color:#e2e8f0; padding:var(--s2) var(--s4);
            border-radius:var(--r-sm); font-size:var(--fs-sm); font-weight:700; background:none;
            cursor:pointer; transition:border-color .15s,color .15s; white-space:nowrap; }
        .gw-login:hover { border-color:#94a3b8; color:#fff; }
        /* Dar ekran: ikincil bağlantılar gizlenir, üst çubuk taşmaz */
        @media(max-width:640px){
            .gw-nav-inner { padding:var(--s3); gap:var(--s3); }
            .gw-nav-link { display:none; }
            .gw-login { padding:var(--s2) var(--s3); font-size:var(--fs-xs); }
        }

        /* Kahraman alan — dikey ritim Fibonacci */
        .gw-hero { flex:1; max-width:1120px; margin:0 auto; width:100%;
            padding:clamp(var(--s6),8vw,var(--s8)) var(--s4) var(--s7); text-align:center; }
        .gw-kicker { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.22em;
            font-weight:900; color:#fbbf24; margin-bottom:var(--s3); }
        .gw-title { font-size:clamp(2.1rem,5.4vw,var(--fs-2xl)); line-height:1.08; font-weight:900;
            color:#fff; letter-spacing:-.035em; margin-bottom:var(--s4); text-wrap:balance; }
        .gw-title span { background:linear-gradient(90deg,#fcd34d,#34d399);
            -webkit-background-clip:text; background-clip:text; color:transparent; }
        .gw-sub { color:#94a3b8; max-width:var(--measure); margin:0 auto var(--s7);
            font-size:var(--fs-base); line-height:1.6; }

        /* Rol kartları — eşit yükseklik, eylem satırı hep altta */
        .gw-cards { display:grid; grid-template-columns:1fr; gap:var(--s4);
            max-width:1000px; margin:0 auto; }
        @media(min-width:900px){ .gw-cards{ grid-template-columns:repeat(3,1fr); } }
        .gw-card { position:relative; display:flex; flex-direction:column; text-align:left;
            background:linear-gradient(160deg,#12263D,#0B1B2E);
            border:1px solid #1e3350; border-radius:var(--r-lg); padding:var(--s5);
            cursor:pointer; overflow:hidden; transition:transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
        .gw-card:hover { transform:translateY(-6px); border-color:var(--gw-accent,#34d399);
            box-shadow:0 26px 52px -30px rgba(0,0,0,.85); }
        .gw-card .gw-emoji { font-size:var(--fs-2xl); line-height:1; margin-bottom:var(--s4); display:block; }
        .gw-card h3 { font-size:var(--fs-lg); font-weight:900; color:#fff;
            letter-spacing:-.025em; margin-bottom:var(--s2); line-height:1.2; }
        .gw-card p { font-size:var(--fs-sm); color:#94a3b8; line-height:1.6; flex:1 1 auto; margin:0; }
        .gw-card .gw-cta { display:inline-flex; align-items:center; gap:var(--s1); font-weight:900;
            font-size:var(--fs-sm); color:var(--gw-accent,#34d399); margin-top:var(--s4); }
        .gw-card .gw-glow { position:absolute; inset:0; opacity:0; transition:opacity .18s;
            background:radial-gradient(circle at 80% 0%, var(--gw-accent,#34d399) 0%, transparent 45%); }
        .gw-card:hover .gw-glow { opacity:.12; }

        /* Funnel sayfaları */
        .gw-funnel { max-width:1000px; margin:0 auto; width:100%;
            padding:var(--s6) var(--s4) var(--s7); }
        .gw-back { display:inline-flex; align-items:center; gap:var(--s1); color:#94a3b8;
            background:none; border:none; cursor:pointer; font-size:var(--fs-sm); font-weight:700;
            margin-bottom:var(--s5); padding:var(--s2) 0; transition:color .15s; }
        .gw-back:hover { color:#e2e8f0; }
        .gw-fhead { text-align:center; margin-bottom:var(--s7); }
        .gw-fhead h1 { font-size:clamp(1.9rem,4.6vw,var(--fs-2xl)); font-weight:900; color:#fff;
            line-height:1.1; letter-spacing:-.03em; margin-bottom:var(--s4); text-wrap:balance; }
        .gw-fhead h1 span { background:linear-gradient(90deg,#fcd34d,#34d399);
            -webkit-background-clip:text; background-clip:text; color:transparent; }
        .gw-fhead p { color:#94a3b8; max-width:var(--measure); margin:0 auto;
            font-size:var(--fs-base); line-height:1.6; }

        /* Özellik ızgarası */
        .gw-feat { display:grid; grid-template-columns:1fr; gap:var(--s3); margin-bottom:var(--s6); }
        @media(min-width:768px){ .gw-feat{ grid-template-columns:repeat(2,1fr); gap:var(--s4); } }
        .gw-feat-item { display:flex; gap:var(--s3); align-items:flex-start; background:#12263D;
            border:1px solid #1e3350; border-radius:var(--r-md); padding:var(--s4); }
        .gw-feat-item .ic { font-size:var(--fs-lg); flex-shrink:0; line-height:1; }
        .gw-feat-item h4 { color:#fff; font-weight:800; font-size:var(--fs-base); margin-bottom:var(--s1); }
        .gw-feat-item p { color:#94a3b8; font-size:var(--fs-sm); line-height:1.55; margin:0; }

        /* Fiyat şeridi — altın oranlı iç dolgu */
        .gw-pricebar { background:linear-gradient(120deg,#065f46,#0f766e); border-radius:var(--r-lg);
            padding:var(--s5) var(--s4); text-align:center; margin-bottom:var(--s5); }
        .gw-pricebar .trial { font-size:var(--fs-xs); text-transform:uppercase; letter-spacing:.16em;
            font-weight:900; color:#6ee7b7; margin-bottom:var(--s2); }
        .gw-pricebar .price { font-size:var(--fs-xl); font-weight:900; color:#fff;
            letter-spacing:-.03em; margin-bottom:var(--s1); }
        .gw-pricebar .price small { font-size:var(--fs-base); font-weight:700; color:#d1fae5; }
        .gw-pricebar .note { font-size:var(--fs-sm); color:#d1fae5; line-height:1.55;
            max-width:var(--measure); margin-inline:auto; }

        /* Eylem çifti: birincil / ikincil genişlik oranı φ : 1 */
        .gw-actions { display:flex; gap:var(--s3); max-width:36rem; margin:0 auto; }
        .gw-actions > *:first-child { flex:0 0 calc(61.8% - var(--s3) * .618); min-width:0; }
        .gw-actions > *:last-child  { flex:0 0 calc(38.2% - var(--s3) * .382); min-width:0; }
        @media(max-width:560px){ .gw-actions{ flex-direction:column; }
            .gw-actions > *:first-child, .gw-actions > *:last-child { flex:0 0 auto; } }
        .gw-btn-primary { background:linear-gradient(100deg,#f59e0b,#fbbf24 38%,#f97316); color:#111827;
            border:none; border-radius:var(--r-md); padding:var(--s3) var(--s4); min-height:var(--s6);
            font-size:var(--fs-base); font-weight:900; cursor:pointer; white-space:nowrap;
            box-shadow:0 14px 30px -14px rgba(245,158,11,.7);
            transition:filter .18s, transform .18s, box-shadow .18s; }
        .gw-btn-primary:hover { filter:brightness(1.06); transform:translateY(-1px);
            box-shadow:0 18px 36px -14px rgba(245,158,11,.8); }
        .gw-btn-ghost { background:rgba(255,255,255,.04); border:1px solid #475569; color:#e2e8f0;
            border-radius:var(--r-md); padding:var(--s3); min-height:var(--s6);
            font-size:var(--fs-sm); font-weight:800; cursor:pointer; white-space:nowrap;
            overflow:hidden; text-overflow:ellipsis;
            transition:border-color .15s, color .15s; }
        .gw-btn-ghost:hover { border-color:#94a3b8; color:#fff; }
        `;
        document.head.appendChild(s);
    }

    /* gwGoAuth kaldırıldı: rol funnel'ları statik sayfalara taşındığından
       giriş/kayıt niyeti artık /kurulumcu · /danisman CTA'larından sessionStorage
       ile taşınıyor ve auth.js'teki openAuthForRole onu okuyor. */

    function root() { return document.getElementById('gatewayContainer'); }

    // ===================== 1) ROL SEÇİM EKRANI =====================
    window.renderGateway = function () {
        injectCSS();
        const el = root(); if (!el) return;
        el.innerHTML = `
        <div class="gw-wrap">
            <nav class="gw-nav"><div class="gw-nav-inner" style="justify-content:center">
                <a href="#home" class="gw-logo">epcmerkezim</a>
            </div></nav>
            <div class="gw-hero">
                <p class="gw-kicker">Türkiye'nin bağımsız güneş enerjisi platformu</p>
                <h1 class="gw-title">Size uygun yolu <span>seçin</span></h1>

                <div class="gw-cards">
                    <a href="#yatirimci" class="gw-card" style="--gw-accent:#34d399">
                        <span class="gw-glow"></span>
                        <span class="gw-emoji" aria-hidden="true">☀️</span>
                        <h3>Yatırımcıyım,<br>GES kurdurmak istiyorum</h3>
                        <p>Evinize veya iş yerinize güneş enerjisi santrali (GES) kurdurmak
                           istiyorsanız buradasınız. Faturanızı yükleyin, size uygun sistemi ve
                           maliyeti görün, onaylı firmalardan ücretsiz teklif alın.</p>
                        <span class="gw-cta">Başla →</span>
                    </a>

                    <a href="/kurulumcu" class="gw-card" style="--gw-accent:#818cf8">
                        <span class="gw-glow"></span>
                        <span class="gw-emoji" aria-hidden="true">🏗️</span>
                        <h3>Kurulumcu Firmayım,<br>GES kuruyorum</h3>
                        <p>GES kurulumu yapan bir firmaysanız buradasınız. Müşteri (CRM) ve teklif
                           yönetimi, TEDAŞ süreç takibi, servis talepleri ve size aktarılan yatırımcı
                           talepleri tek panelde.</p>
                        <span class="gw-cta">Firma panelini keşfet →</span>
                    </a>

                    <a href="/danisman" class="gw-card" style="--gw-accent:#fbbf24">
                        <span class="gw-glow"></span>
                        <span class="gw-emoji" aria-hidden="true">🎯</span>
                        <h3>Danışmanlık<br>hizmeti veriyorum</h3>
                        <p>Güneş enerjisinde bağımsız danışmanlık veriyorsanız buradasınız. Onaylı
                           profiliniz yatırımcılara görünür; gelen danışmanlık taleplerine teklif verir,
                           danışanlarınızı takip edersiniz.</p>
                        <span class="gw-cta">Danışman panelini keşfet →</span>
                    </a>
                </div>
            </div>
        </div>`;
        window.scrollTo({ top: 0 });
    };

    /* Kurulumcu ve danışman funnel'ları artık statik, taranabilir sayfalar:
       /kurulumcu.html ve /danisman.html (rol kartları doğrudan oraya bağlanır).
       Eski #kurulumcu / #danisman bağlantılarını router.js aynı adreslere yönlendirir. */

})();
