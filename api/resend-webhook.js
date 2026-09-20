// Dosya Yolu: api/resend-webhook.js
//
// RESEND TESLİM OLAYLARI — kuyruğun "gönderildi" yalanını düzelten uç.
//
// Kuyruk, Resend'den HTTP 2xx alınca satırı 'gonderildi' işaretliyor. Ama 2xx
// "kabul ettim" demek, "teslim ettim" demek değil: canlıda kuyruk 'gonderildi'
// derken Resend kaydı 'Failed' göstermişti. Gerçek teslim durumu ancak
// Resend'in webhook olaylarıyla öğreniliyor; bu uç onları alıp veritabanına
// yazar.
//
// ⚠️ EDGE ÇALIŞMA ZAMANI KULLANILIYOR. Sebebi tek: imza doğrulaması için
// gövdenin HAM HÂLİ gerekiyor. Node tarafında Vercel gövdeyi JSON olarak
// ayrıştırıyor ve yeniden JSON.stringify etmek bayt bayt aynı sonucu
// vermiyor — imza tutmuyordu. Edge'de req.text() ham gövdeyi veriyor.
//
// GEREKEN ORTAM DEĞİŞKENLERİ (Vercel → Settings → Environment Variables):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   ← veritabanının tamamına yetkili; asla tarayıcıya verilmez
//   RESEND_WEBHOOK_SECRET       ← Resend webhook eklerken verilen whsec_…

export const config = { runtime: 'edge' };

const ILGILENDIGIMIZ = new Set([
    'email.sent',
    'email.delivered',
    'email.delivery_delayed',
    'email.bounced',
    'email.complained'
]);

// Zaman damgası toleransı: tekrar saldırısını (replay) sınırlar.
const TOLERANS_SN = 5 * 60;

function b64ToBytes(b64) {
    const ikili = atob(b64);
    const out = new Uint8Array(ikili.length);
    for (let i = 0; i < ikili.length; i++) out[i] = ikili.charCodeAt(i);
    return out;
}

function bytesToB64(buf) {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
}

// ⚠️ Sabit süreli karşılaştırma. `a === b` imzanın kaç karakterinin doğru
// olduğunu süreden sızdırır; imza doğrulamada erken çıkış yapılmaz.
function esitMi(a, b) {
    if (a.length !== b.length) return false;
    let fark = 0;
    for (let i = 0; i < a.length; i++) fark |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return fark === 0;
}

async function imzaDogru(gizliAnahtar, svixId, svixTs, hamGovde, imzaBasligi) {
    // whsec_ öneki taşınıyorsa atılır; geri kalanı base64 anahtardır.
    const anahtarB64 = gizliAnahtar.startsWith('whsec_') ? gizliAnahtar.slice(6) : gizliAnahtar;
    const key = await crypto.subtle.importKey(
        'raw', b64ToBytes(anahtarB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

    const imzalanan = `${svixId}.${svixTs}.${hamGovde}`;
    const hesaplanan = bytesToB64(
        await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(imzalanan)));

    // Başlık "v1,xxx v1,yyy" biçiminde birden çok imza taşıyabilir
    // (anahtar döndürülürken ikisi bir arada gönderilir).
    return String(imzaBasligi).split(' ').some((parca) => {
        const i = parca.indexOf(',');
        if (i < 0) return false;
        return esitMi(parca.slice(i + 1), hesaplanan);
    });
}

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response('Sadece POST', { status: 405 });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SECRET       = process.env.RESEND_WEBHOOK_SECRET;

    if (!SUPABASE_URL || !SERVICE_KEY || !SECRET) {
        // Eksik yapılandırmayı 200 ile geçiştirmiyoruz: Resend yeniden dener
        // ve Webhooks → Logs'ta hata görünür. Sessizce yutulursa olaylar
        // kaybolur ve kimse fark etmez.
        console.error('[resend-webhook] ortam değişkenleri eksik');
        return new Response('Yapılandırma eksik', { status: 500 });
    }

    const svixId  = req.headers.get('svix-id');
    const svixTs  = req.headers.get('svix-timestamp');
    const svixSig = req.headers.get('svix-signature');
    if (!svixId || !svixTs || !svixSig) {
        return new Response('İmza başlıkları yok', { status: 400 });
    }

    const yas = Math.abs(Math.floor(Date.now() / 1000) - Number(svixTs));
    if (!Number.isFinite(yas) || yas > TOLERANS_SN) {
        return new Response('Zaman damgası aralık dışı', { status: 400 });
    }

    const hamGovde = await req.text();

    let gecerli = false;
    try {
        gecerli = await imzaDogru(SECRET, svixId, svixTs, hamGovde, svixSig);
    } catch (e) {
        console.error('[resend-webhook] imza doğrulanamadı:', e && e.message);
        return new Response('İmza doğrulanamadı', { status: 400 });
    }
    if (!gecerli) return new Response('İmza geçersiz', { status: 401 });

    let olay;
    try { olay = JSON.parse(hamGovde); }
    catch (e) { return new Response('Gövde JSON değil', { status: 400 }); }

    const tur = olay && olay.type;
    if (!ILGILENDIGIMIZ.has(tur)) {
        // opened/clicked gibi olaylar geliyorsa kabul edip yok sayıyoruz;
        // hata dönersek Resend bunları tekrar tekrar dener.
        return new Response(JSON.stringify({ durum: 'yoksayildi', tur }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });
    }

    const veri = olay.data || {};
    const resendId = veri.email_id || veri.id;
    if (!resendId) return new Response('email_id yok', { status: 400 });

    // Geri dönüş/şikâyet sebebi varsa taşınır: yönetim ekranında "neden
    // gitmedi" sorusunun cevabı bu alandan çıkıyor.
    const detay = [veri.bounce_type, veri.bounce && veri.bounce.subType,
                   veri.reason, veri.message]
        .filter(Boolean).join(' · ') || null;

    const yanit = await fetch(`${SUPABASE_URL}/rest/v1/rpc/eposta_teslim_kaydet`, {
        method: 'POST',
        headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_resend_id: resendId, p_olay: tur, p_detay: detay })
    });

    if (!yanit.ok) {
        const metin = await yanit.text();
        console.error('[resend-webhook] veritabanı yazılamadı:', yanit.status, metin);
        // 500 dönüyoruz ki Resend yeniden denesin; olay kaybolmasın.
        return new Response('Veritabanı yazılamadı', { status: 500 });
    }

    return new Response(JSON.stringify({ durum: 'islendi', tur }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
    });
}
