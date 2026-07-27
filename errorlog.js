/* ============================================================================
   errorlog.js — Global istemci hata yakalayıcı (epcmerkezim)
   ----------------------------------------------------------------------------
   • Yakalanmamış JS hataları (window.onerror), reddedilen promise'ler
     (unhandledrejection) ve elle raporları (window.logError) Supabase'e yazar.
   • AKILLI FİLTRELEME: gürültü (eklenti/ağ/CDN kaynaklı) elenir, aynı hata
     bastırılır (oturumda 1 kez), oturum başına üst sınır uygulanır.
   • Supabase'e RPC ile yazar (log_error, SECURITY DEFINER). Bağlantı yoksa
     sessizce kuyruğa alır; hazır olunca gönderir. Hata izleme, hata üretmez.
   • MÜMKÜN OLDUĞUNCA ERKEN yüklenmeli (core.js'ten hemen sonra).
   ============================================================================ */
(function () {
    'use strict';

    var MAX_PER_SESSION = 25;      // bir oturumda en çok bu kadar farklı hata gönder
    var sent = 0;
    var seen = {};                 // parmak izi → true (oturumda tekrar gönderme)
    var queue = [];                // supabase hazır değilken bekletilenler
    var flushing = false;

    // --- Gürültü filtreleri: kullanıcı/altyapı kaynaklı, bizi ilgilendirmeyen ---
    var NOISE = [
        /ResizeObserver loop/i,                       // zararsız tarayıcı uyarısı
        /Script error\.?(\s|$)/i,                      // CORS'lu 3. taraf script (detay yok)
        /extension\//i, /chrome-extension:/i, /moz-extension:/i, /safari-extension/i,
        /cdn\.tailwindcss\.com/i,                      // Tailwind CDN "production" uyarısı vb.
        /Failed to fetch dynamically imported module/i,
        /Load failed/i,                                // genelde ağ/iptal kaynaklı
        /NetworkError when attempting to fetch/i,
        /The operation was aborted/i,
        /AbortError/i,
        /Non-Error promise rejection captured/i,
        /getReadModeConfig|getReadModeRender|getReadModeExtract/i // bazı mobil tarayıcı eklentileri
    ];
    function isNoise(msg, stack) {
        var s = (msg || '') + ' ' + (stack || '');
        for (var i = 0; i < NOISE.length; i++) if (NOISE[i].test(s)) return true;
        return false;
    }

    function fingerprint(msg, src) {
        // mesajdaki değişken kısımları (sayı, url, uuid) sadeleştir → tekrarları grupla
        var m = String(msg || '')
            .replace(/https?:\/\/[^\s)]+/g, '<url>')
            .replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '<id>')
            .replace(/\d+/g, '<n>')
            .slice(0, 160);
        return (src || '') + '|' + m;
    }

    function report(o) {
        try {
            var msg = o.message || 'Bilinmeyen hata';
            var stack = o.stack || '';
            if (isNoise(msg, stack)) return;

            var fp = fingerprint(msg, o.source);
            if (seen[fp]) return;                 // bu oturumda zaten gönderildi
            if (sent >= MAX_PER_SESSION) return;  // oturum sınırı
            seen[fp] = true; sent++;

            var payload = {
                p_message: msg,
                p_source: o.source || 'manual',
                p_stack: stack,
                p_url: (location && location.href) || '',
                p_user_agent: (navigator && navigator.userAgent) || '',
                p_fingerprint: fp
            };

            var sb = window.supabaseClient;
            if (sb && sb.rpc) {
                sb.rpc('log_error', payload).then(function (r) {
                    if (r && r.error) { /* yazılamadıysa sessiz geç, döngü olmasın */ }
                }, function () { /* sessiz */ });
            } else {
                if (queue.length < 50) queue.push(payload);   // bağlantı gelince gönder
            }
        } catch (e) {
            // Yakalayıcının kendisi asla hata fırlatmamalı.
        }
    }

    // Supabase geç yüklenirse kuyruğu boşalt (birkaç kez dene)
    function flush() {
        if (flushing) return; flushing = true;
        var tries = 0;
        var iv = setInterval(function () {
            tries++;
            var sb = window.supabaseClient;
            if (sb && sb.rpc && queue.length) {
                var batch = queue.splice(0, queue.length);
                batch.forEach(function (p) { try { sb.rpc('log_error', p).then(function () {}, function () {}); } catch (e) {} });
            }
            if (!queue.length || tries > 20) { clearInterval(iv); }
        }, 1500);
    }

    // --- Global dinleyiciler ---
    window.addEventListener('error', function (e) {
        // Kaynak yükleme hatası (img/script/link) → e.message olmaz, e.target olur
        if (e && e.target && (e.target.src || e.target.href) && e.target.tagName) {
            report({ message: 'Kaynak yüklenemedi: ' + (e.target.src || e.target.href), source: 'resource' });
            return;
        }
        report({
            message: e && e.message ? e.message : 'window.onerror',
            stack: e && e.error && e.error.stack ? e.error.stack : ((e ? (e.filename || '') + ':' + (e.lineno || '') + ':' + (e.colno || '') : '')),
            source: 'window.onerror'
        });
    }, true); // capture: kaynak hatalarını da yakala

    window.addEventListener('unhandledrejection', function (e) {
        var r = e && e.reason;
        report({
            message: (r && r.message) ? r.message : String(r || 'unhandledrejection'),
            stack: (r && r.stack) ? r.stack : '',
            source: 'unhandledrejection'
        });
    });

    // Elle raporlama API'si: window.logError('mesaj', errObj?, 'kaynak?')
    window.logError = function (message, errOrStack, source) {
        var stack = '';
        if (errOrStack) stack = errOrStack.stack || String(errOrStack);
        report({ message: String(message), stack: stack, source: source || 'manual' });
    };

    flush();
})();
