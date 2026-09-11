/* ============================================================================
   surum.js — SÜRÜM BİLGİSİ VE "TASLAK SÜRÜM" ŞERİDİ
   ⚠️ BU DOSYA ELLE DÜZENLENMEZ. surum-uret.sh tarafından git'ten üretilir.
   Son üretim: 11.09.2026 10:57
   ============================================================================ */
window.EPC_SURUM = {
    surum:  'v0.212',
    commit: '3d5f692',
    tarih:  '2026-09-11T10:57:36+03:00',
    kirli:  true,        // true = commit'lenmemiş değişiklikle üretildi
    taslak: true           // 1.0'a geçince false yapın, şerit kalkar
};

/* --- Şerit -----------------------------------------------------------------
   Dört sayfada da (index + üç rol sayfası) çalışması gerekiyor. Rol sayfaları
   Tailwind yüklemiyor, o yüzden kendi stilini enjekte ediyor; hiçbir dış
   sınıfa bağlı değil. Sticky üst çubukların üstünde, sayfanın en tepesinde
   durur ve kaydırınca yukarı kayar (sabitlenmez — okumayı engellemesin). */
(function () {
    'use strict';
    var S = window.EPC_SURUM || {};
    if (!S.taslak) return;                       // 1.0'a geçilince şerit çıkmaz

    function tarihSaat(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d)) return '';
        var p = function (n) { return String(n).padStart(2, '0'); };
        return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() +
               ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function ciz() {
        if (document.getElementById('epcSurumSerit')) return;
        var st = document.createElement('style');
        st.textContent =
            '#epcSurumSerit{position:fixed;top:0;left:0;right:0;z-index:60;' +
            'background:#78350f;color:#fde68a;font-size:12px;line-height:1.4;' +
            'font-weight:700;padding:7px 14px;display:flex;gap:10px;align-items:center;' +
            'justify-content:center;flex-wrap:wrap;text-align:center;' +
            'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
            'border-bottom:1px solid rgba(253,230,138,.25)}' +
            '#epcSurumSerit .epc-s-et{background:#fde68a;color:#78350f;padding:1px 8px;' +
            'border-radius:999px;font-weight:900;letter-spacing:.04em;white-space:nowrap}' +
            '#epcSurumSerit .epc-s-ay{opacity:.55}' +
            '#epcSurumSerit code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;' +
            'font-size:11px;opacity:.75}' +
            '@media(max-width:640px){#epcSurumSerit{font-size:11px;padding:5px 10px;gap:6px}' +
            // Dar ekranda açıklama cümlesi şeridi üç satıra çıkarıp ekranın
            // dörtte birini yiyordu. Sürüm ve tarih kalıyor, cümle gidiyor.
            '#epcSurumSerit .epc-s-aciklama,#epcSurumSerit .epc-s-ay{display:none}}';
        document.head.appendChild(st);

        var bar = document.createElement('div');
        bar.id = 'epcSurumSerit';
        bar.setAttribute('role', 'status');
        var ts = tarihSaat(S.tarih);
        bar.innerHTML =
            '<span class="epc-s-et">TASLAK SÜRÜM</span>' +
            '<span class="epc-s-aciklama">Bu sayfa geliştirme aşamasındadır; bilgiler değişebilir.</span>' +
            '<span class="epc-s-ay">·</span>' +
            '<span>' + (S.surum || '') + (ts ? ' <span class="epc-s-ay">·</span> ' + ts : '') +
            (S.commit ? ' <code>' + S.commit + (S.kirli ? '+' : '') + '</code>' : '') + '</span>';
        document.body.insertBefore(bar, document.body.firstChild);
        hizala();
        window.addEventListener('resize', hizala);
        // Şeridin yüksekliği yazı tipi yüklenince değişebiliyor; bir kez daha ölç.
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(hizala);
    }

    // Sayfanın üstüne YAPIŞIK duran çubuklar şeridi örtüyor: yatırımcı
    // vitrinindeki üst çubuk position:fixed; top:0 ve z-index:50. Akıştaki
    // şerit onun ALTINDA kalıyordu. Burada şerit yüksekliği kadar aşağı
    // itiyoruz. sticky çubuklar (gateway, rol sayfaları) akışta olduğu için
    // zaten doğru yerde; onlara dokunmuyoruz.
    // Şerit SABİT konumda duruyor. Alternatifi (akışta bırakıp kaydırmayı
    // dinlemek) scroll olayına bağımlıydı; bu sayfada body'nin kendi
    // overflow'u yüzünden scroll olayı güvenilir gelmiyor. Sabit şerit +
    // gövdeye üst dolgu, kaydırmadan tamamen bağımsız ve her durumda doğru.
    function hizala() {
        var bar = document.getElementById('epcSurumSerit');
        if (!bar) return;
        var h = Math.round(bar.getBoundingClientRect().height);
        document.documentElement.style.setProperty('--epc-serit-h', h + 'px');
        // Akıştaki içerik şeridin altından başlasın.
        document.body.style.paddingTop = h + 'px';
        // Tepeye yapışık SABİT çubuklar da şeridin altına insin.
        // (sticky çubuklar akışta olduğu için gövde dolgusuyla zaten doğru yerde)
        var hepsi = document.querySelectorAll('nav, header, .site-nav');
        for (var i = 0; i < hepsi.length; i++) {
            var e = hepsi[i], c = getComputedStyle(e);
            if (e.dataset.epcKaydirildi === '1') { e.style.top = h + 'px'; continue; }
            if (c.position !== 'fixed') continue;
            if (parseInt(c.top, 10) !== 0) continue;   // zaten tepede değilse karışma
            e.dataset.epcKaydirildi = '1';
            e.style.top = h + 'px';
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ciz);
    else ciz();
})();
