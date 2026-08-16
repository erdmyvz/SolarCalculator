/* ============================================================================
   gateway.js — AÇILIŞ ROL SEÇİM EKRANI + KURULUMCU/DANIŞMAN FUNNEL SAYFALARI
   Kendi kendine yeten modül (about.js ile aynı desen): kendi CSS'ini enjekte
   eder, kendi HTML'ini #gatewayContainer içine basar. index.html'de public.js'
   ten SONRA yüklenir. Yönlendirme router.js tarafından yönetilir:
      #home       → renderGateway()          (3 rol butonu)
      #yatirimci  → mevcut yatırımcı funnel'ı (landingContainer)
      #kurulumcu  → renderInstallerFunnel()
      #danisman   → renderConsultantFunnel()
   ============================================================================ */
(function () {
    'use strict';

    // --- CSS'i yalnızca bir kez enjekte et ---
    function injectCSS() {
        if (document.getElementById('gwStyles')) return;
        const s = document.createElement('style');
        s.id = 'gwStyles';
        s.textContent = `
        #gatewayContainer { background:#0f172a; color:#e2e8f0; }
        .gw-wrap { min-height:100vh; display:flex; flex-direction:column; }
        .gw-nav { position:sticky; top:0; z-index:40; background:rgba(15,23,42,.92);
            backdrop-filter:blur(8px); border-bottom:1px solid #1e293b; }
        .gw-nav-inner { max-width:1120px; margin:0 auto; display:flex; align-items:center;
            justify-content:space-between; padding:16px; gap:12px; }
        .gw-logo { font-size:1.5rem; font-weight:800; letter-spacing:-.02em;
            background:linear-gradient(90deg,#34d399,#5eead4); -webkit-background-clip:text;
            background-clip:text; color:transparent; text-decoration:none; }
        .gw-nav-links { display:flex; align-items:center; gap:8px; }
        .gw-nav-link { font-size:.82rem; font-weight:700; color:#cbd5e1; text-decoration:none;
            padding:8px 10px; border-radius:8px; transition:.15s; }
        .gw-nav-link:hover { color:#fff; background:rgba(255,255,255,.05); }
        .gw-login { border:1px solid #475569; color:#e2e8f0; padding:8px 16px; border-radius:9px;
            font-weight:800; font-size:.82rem; transition:.15s; cursor:pointer; background:transparent; }
        .gw-login:hover { border-color:#94a3b8; color:#fff; }

        .gw-hero { flex:1; max-width:1120px; margin:0 auto; width:100%;
            padding:48px 20px 72px; text-align:center; }
        .gw-kicker { font-size:.72rem; text-transform:uppercase; letter-spacing:.22em;
            font-weight:800; color:#fbbf24; margin-bottom:14px; }
        .gw-title { font-size:2.1rem; line-height:1.15; font-weight:900; color:#fff; margin-bottom:14px; }
        .gw-title span { background:linear-gradient(90deg,#fcd34d,#34d399);
            -webkit-background-clip:text; background-clip:text; color:transparent; }
        .gw-sub { color:#94a3b8; max-width:640px; margin:0 auto 44px; font-size:1rem; }
        @media(min-width:768px){ .gw-title{ font-size:3rem; } }

        .gw-cards { display:grid; grid-template-columns:1fr; gap:20px; max-width:1000px; margin:0 auto; }
        @media(min-width:900px){ .gw-cards{ grid-template-columns:repeat(3,1fr); } }
        .gw-card { position:relative; text-align:left; background:linear-gradient(160deg,#1e293b,#0f172a);
            border:1px solid #334155; border-radius:22px; padding:30px 26px; cursor:pointer;
            transition:transform .18s, border-color .18s, box-shadow .18s; overflow:hidden; }
        .gw-card:hover { transform:translateY(-6px); border-color:var(--gw-accent,#34d399);
            box-shadow:0 24px 48px -20px rgba(0,0,0,.7); }
        .gw-card .gw-emoji { font-size:2.6rem; margin-bottom:16px; display:block; }
        .gw-card h3 { font-size:1.28rem; font-weight:900; color:#fff; margin-bottom:8px; line-height:1.25; }
        .gw-card p { font-size:.9rem; color:#94a3b8; line-height:1.5; margin-bottom:20px; min-height:54px; }
        .gw-card .gw-cta { display:inline-flex; align-items:center; gap:6px; font-weight:900;
            font-size:.9rem; color:var(--gw-accent,#34d399); }
        .gw-card .gw-glow { position:absolute; inset:0; opacity:0; transition:opacity .18s;
            background:radial-gradient(circle at 80% 0%, var(--gw-accent,#34d399) 0%, transparent 45%); }
        .gw-card:hover .gw-glow { opacity:.12; }

        /* ---- FUNNEL SAYFALARI (kurulumcu / danışman) ---- */
        .gw-funnel { max-width:1000px; margin:0 auto; width:100%; padding:40px 20px 72px; }
        .gw-back { display:inline-flex; align-items:center; gap:6px; color:#94a3b8;
            font-weight:700; font-size:.85rem; text-decoration:none; margin-bottom:26px; background:none;
            border:none; cursor:pointer; }
        .gw-back:hover { color:#e2e8f0; }
        .gw-fhead { text-align:center; margin-bottom:40px; }
        .gw-fhead h1 { font-size:2rem; font-weight:900; color:#fff; line-height:1.15; margin-bottom:14px; }
        .gw-fhead h1 span { background:linear-gradient(90deg,#fcd34d,#34d399);
            -webkit-background-clip:text; background-clip:text; color:transparent; }
        .gw-fhead p { color:#94a3b8; max-width:620px; margin:0 auto; font-size:1.02rem; }
        @media(min-width:768px){ .gw-fhead h1{ font-size:2.6rem; } }

        .gw-feat { display:grid; grid-template-columns:1fr; gap:16px; margin-bottom:38px; }
        @media(min-width:768px){ .gw-feat{ grid-template-columns:repeat(2,1fr); } }
        .gw-feat-item { display:flex; gap:14px; align-items:flex-start; background:#1e293b;
            border:1px solid #334155; border-radius:16px; padding:20px; }
        .gw-feat-item .ic { font-size:1.6rem; flex-shrink:0; line-height:1; }
        .gw-feat-item h4 { color:#fff; font-weight:800; font-size:1rem; margin-bottom:4px; }
        .gw-feat-item p { color:#94a3b8; font-size:.86rem; line-height:1.5; }

        .gw-pricebar { background:linear-gradient(120deg,#065f46,#0f766e); border-radius:20px;
            padding:28px 26px; text-align:center; margin-bottom:30px; border:1px solid #10b98155; }
        .gw-pricebar .trial { font-size:.78rem; text-transform:uppercase; letter-spacing:.16em;
            font-weight:800; color:#a7f3d0; margin-bottom:8px; }
        .gw-pricebar .price { font-size:2rem; font-weight:900; color:#fff; margin-bottom:4px; }
        .gw-pricebar .price small { font-size:.95rem; font-weight:700; color:#d1fae5; }
        .gw-pricebar .note { font-size:.85rem; color:#d1fae5; }

        .gw-actions { display:flex; flex-direction:column; gap:12px; max-width:440px; margin:0 auto; }
        @media(min-width:560px){ .gw-actions{ flex-direction:row; } }
        .gw-btn-primary { flex:1; background:linear-gradient(90deg,#f59e0b,#f97316); color:#111827;
            font-weight:900; padding:15px 20px; border-radius:13px; border:none; cursor:pointer;
            font-size:.98rem; transition:.15s; box-shadow:0 12px 24px -10px rgba(245,158,11,.6); }
        .gw-btn-primary:hover { filter:brightness(1.06); transform:translateY(-1px); }
        .gw-btn-ghost { flex:1; background:rgba(255,255,255,.04); border:1px solid #475569; color:#e2e8f0;
            font-weight:800; padding:15px 20px; border-radius:13px; cursor:pointer; font-size:.98rem; transition:.15s; }
        .gw-btn-ghost:hover { border-color:#94a3b8; color:#fff; }
        `;
        document.head.appendChild(s);
    }

    // Role özel auth ekranına git (yalnız o rolün giriş/kayıt sayfası açılır).
    function gwGoAuth(role, mode) {
        window.__authMode = (mode === 'register') ? 'register' : 'login';
        const h = role === 'firma' ? '#kurulumcuauth'
                : role === 'consultant' ? '#danismanauth'
                : '#yatirimciauth';
        if (window.location.hash === h) {
            // Aynı hash → hashchange tetiklenmez; doğrudan uygula
            if (typeof openAuthForRole === 'function') openAuthForRole(role);
        } else {
            window.location.hash = h;
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.gwGoAuth = gwGoAuth;

    function root() { return document.getElementById('gatewayContainer'); }

    // Ortak üst bar (funnel'larda "Giriş Yap" gizlenebilir)
    function navHTML(role) {
        const loginBtn = role
            ? `<button class="gw-login" onclick="gwGoAuth('${role}','login')">Giriş Yap</button>`
            : `<a href="#auth" class="gw-login" style="text-decoration:none">Giriş Yap</a>`;
        return `
        <nav class="gw-nav"><div class="gw-nav-inner">
            <a href="#home" class="gw-logo">epcmerkezim</a>
            <div class="gw-nav-links">
                <a href="/hakkimda" onclick="if(window.openAboutPage){openAboutPage();return false}" class="gw-nav-link">Hakkımda</a>
                <a href="/blog/" class="gw-nav-link">Solar Akademi</a>
                ${loginBtn}
            </div>
        </div></nav>`;
    }

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
                    <div class="gw-card" style="--gw-accent:#34d399" onclick="window.location.hash='#yatirimci'">
                        <span class="gw-glow"></span>
                        <span class="gw-emoji">☀️</span>
                        <h3>Yatırımcıyım,<br>GES kurdurmak istiyorum</h3>
                        <p>Evinize veya iş yerinize güneş enerjisi santrali (GES) kurdurmak
                           istiyorsanız buradasınız. Faturanızı yükleyin, size uygun sistemi ve
                           maliyeti görün, onaylı firmalardan ücretsiz teklif alın.</p>
                        <span class="gw-cta">Başla →</span>
                    </div>

                    <div class="gw-card" style="--gw-accent:#818cf8" onclick="window.location.hash='#kurulumcu'">
                        <span class="gw-glow"></span>
                        <span class="gw-emoji">🏗️</span>
                        <h3>Kurulumcu Firmayım,<br>GES kuruyorum</h3>
                        <p>GES kurulumu yapan bir firmaysanız buradasınız. Müşteri (CRM) ve teklif
                           yönetimi, TEDAŞ süreç takibi, servis talepleri ve size aktarılan yatırımcı
                           talepleri tek panelde.</p>
                        <span class="gw-cta">Firma panelini keşfet →</span>
                    </div>

                    <div class="gw-card" style="--gw-accent:#fbbf24" onclick="window.location.hash='#danisman'">
                        <span class="gw-glow"></span>
                        <span class="gw-emoji">🎯</span>
                        <h3>Danışmanlık<br>hizmeti veriyorum</h3>
                        <p>Güneş enerjisinde bağımsız danışmanlık veriyorsanız buradasınız. Onaylı
                           profiliniz yatırımcılara görünür; gelen danışmanlık taleplerine teklif verir,
                           danışanlarınızı takip edersiniz.</p>
                        <span class="gw-cta">Danışman panelini keşfet →</span>
                    </div>
                </div>
            </div>
        </div>`;
        window.scrollTo({ top: 0 });
    };

    // ===================== 2) KURULUMCU FUNNEL =====================
    window.renderInstallerFunnel = function () {
        injectCSS();
        const el = root(); if (!el) return;
        el.innerHTML = `
        <div class="gw-wrap">
            ${navHTML('firma')}
            <div class="gw-funnel">
                <button class="gw-back" onclick="window.location.hash='#home'">← Rol seçimine dön</button>
                <div class="gw-fhead">
                    <h1>Sahadaki işinizi <span>tek panelden</span> yönetin</h1>
                    <p>Excel ve WhatsApp kalabalığını bırakın. Lead'den TEDAŞ kabulüne, tekliften
                       kurulum sonrası servise kadar tüm sürecinizi epcmerkezim üstlensin.</p>
                </div>

                <div class="gw-feat">
                    <div class="gw-feat-item"><span class="ic">💼</span><div>
                        <h4>Satış CRM & Proje Takibi</h4>
                        <p>Lead'leri toplayın, 9 adımlı TEDAŞ/kurulum sürecini müşteri bazında adım adım takip edin.</p></div></div>
                    <div class="gw-feat-item"><span class="ic">📄</span><div>
                        <h4>Markalı Teklif Motoru</h4>
                        <p>Fiyat, kapasite ve donanım parametrelerini girin; dakikalar içinde profesyonel teklif çıkarın.</p></div></div>
                    <div class="gw-feat-item"><span class="ic">📥</span><div>
                        <h4>Size Aktarılan Yatırımcı Talepleri</h4>
                        <p>Admin tarafından firmanıza yönlendirilen GES talepleri doğrudan panelinize düşer.</p></div></div>
                    <div class="gw-feat-item"><span class="ic">🔧</span><div>
                        <h4>Servis & Bakım Yönetimi</h4>
                        <p>Kurduğunuz tesislerin bakım, temizlik ve arıza taleplerini tek yerden karşılayın.</p></div></div>
                    <div class="gw-feat-item"><span class="ic">☀️</span><div>
                        <h4>Kurulan Tesis & GES Kodu Takibi</h4>
                        <p>Tamamlanan tesisleri ve GES kodlarını kaydedin; yatırımcı süreci şeffaf görsün.</p></div></div>
                    <div class="gw-feat-item"><span class="ic">📊</span><div>
                        <h4>Yönetim Panosu</h4>
                        <p>Lead hattı, teklif dönüşümü, kazanılan iş ve servis özetini tek bakışta görün.</p></div></div>
                </div>

                <div class="gw-pricebar">
                    <p class="trial">30 gün ücretsiz deneme</p>
                    <p class="price">400$ <small>/ yıl</small></p>
                    <p class="note">Kayıt olun, 30 gün boyunca tüm modülleri sınırsız deneyin. Beğenirseniz ödemeyle uzatın.</p>
                </div>

                <div class="gw-actions">
                    <button class="gw-btn-primary" onclick="gwGoAuth('firma','register')">30 Gün Ücretsiz Başla</button>
                    <button class="gw-btn-ghost" onclick="gwGoAuth('firma','login')">Zaten üyeyim · Giriş Yap</button>
                </div>
            </div>
        </div>`;
        window.scrollTo({ top: 0 });
    };

    // ===================== 3) DANIŞMAN FUNNEL =====================
    window.renderConsultantFunnel = function () {
        injectCSS();
        const el = root(); if (!el) return;
        el.innerHTML = `
        <div class="gw-wrap">
            ${navHTML('consultant')}
            <div class="gw-funnel">
                <button class="gw-back" onclick="window.location.hash='#home'">← Rol seçimine dön</button>
                <div class="gw-fhead">
                    <h1>Bağımsız güneş enerjisi <span>danışmanı</span> mısınız?</h1>
                    <p>Yatırımcılar, satıcıdan bağımsız uzman görüşü arıyor. Onaylı profilinizle
                       platformda görünür olun, size gelen taleplere teklif verin.</p>
                </div>

                <div class="gw-feat">
                    <div class="gw-feat-item"><span class="ic">🪪</span><div>
                        <h4>Yatırımcı Arayüzünde Görünen Profil</h4>
                        <p>Uzmanlık alanınızı ve hizmetlerinizi anlatan profiliniz yatırımcılara sunulur.</p></div></div>
                    <div class="gw-feat-item"><span class="ic">📨</span><div>
                        <h4>Gelen Danışmanlık Talepleri</h4>
                        <p>Size ulaşan danışmanlık taleplerini görün ve doğrudan teklifinizi iletin.</p></div></div>
                    <div class="gw-feat-item"><span class="ic">🗂️</span><div>
                        <h4>Danışan Takip CRM'i</h4>
                        <p>Görüştüğünüz yatırımcıları ve süreçlerini düzenli biçimde takip edin.</p></div></div>
                    <div class="gw-feat-item"><span class="ic">✅</span><div>
                        <h4>Admin Onaylı Güven</h4>
                        <p>Her profil düzenlemesi admin kontrolünden geçer; yatırımcıya yalnızca onaylı bilgi gösterilir.</p></div></div>
                </div>

                <div class="gw-pricebar">
                    <p class="trial">30 gün ücretsiz deneme</p>
                    <p class="price">200$ <small>/ yıl</small></p>
                    <p class="note">Kayıt olun, 30 gün boyunca danışman panelini deneyin. Beğenirseniz ödemeyle uzatın.</p>
                </div>

                <div class="gw-actions">
                    <button class="gw-btn-primary" onclick="gwGoAuth('consultant','register')">30 Gün Ücretsiz Başla</button>
                    <button class="gw-btn-ghost" onclick="gwGoAuth('consultant','login')">Zaten üyeyim · Giriş Yap</button>
                </div>
            </div>
        </div>`;
        window.scrollTo({ top: 0 });
    };

})();
