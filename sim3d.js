/* ============================================================================
   sim3d.js — 3D ENERJİ BAĞIMSIZLIĞI SİMÜLASYONU (Three.js r128)

   Simülasyon gerçek mühendislik modelleri üzerine kuruludur; gösterdiği
   sayılar bir GES tasarımcısının kullandığı yöntemlerle hesaplanır:

     · Güneş konumu   — deklinasyon + saat açısı; enleme ve günün sırasına bağlı
                        gerçek gökyüzü yayı (yazın kuzeydoğudan doğar)
     · Yerel saat     — boylam ve zaman denklemi düzeltmesiyle Türkiye saati
     · Işınım         — ASHRAE açık hava modeli, Kasten-Young hava kütlesi
     · Eğik yüzey     — gelme açısı + gökyüzü difüzü + yerden yansıma
     · PV             — NOCT hücre sıcaklığı, sıcaklık katsayısı, sistem kayıpları
     · İnverter       — verim ve DC/AC oranına bağlı tepe kırpma
     · Ev yükü        — saatlik profil; akşam zirvesi üretim bittikten sonra gelir
     · Batarya        — kWh kapasite, güç sınırı, DoD, gidiş-dönüş verimi
     · Skor           — günün gerçek enerji bilançosundan türer (uydurma puan yok)

   Kullanıcı şehri, mevsimi ve bulutluluğu değiştirebilir; üretim buna göre
   değişir. Amaç "öğlen üretiyorum, akşam tüketiyorum" gerçeğini göstermek —
   bataryanın neden gerektiği ancak böyle anlaşılır.

   Sahne: 3D "+" butonlarıyla kademeli bileşen ekleme, animasyonlu şebeke hattı,
   sağda canlı enerji akış paneli ve günlük kWh bilançosu.
   ============================================================================ */

let appScene, appCamera, appRenderer, appControls, appObjs;
let panelCount = 0, countBat = 0, countEV = 0, hpOn = false;
let batteryLevel = 0, carLevel = 0, waterTemp = 0;   // 0..1 — yalnız görsel geri bildirim için
let prodKW = 0, gridFlow = 0, houseLoadKW = 0.4;
let dayTime = 12, autoDay = true;
let sprites = [];
const MAX_PANELS = 8, MAX_BAT = 4, MAX_EV = 2;

/* ============================================================================
   FİZİK ÇEKİRDEĞİ
   ----------------------------------------------------------------------------
   Simülasyon artık uydurma bir sinüs eğrisi değil; sektörde kullanılan standart
   modellerin sadeleştirilmiş ama doğru uygulamaları üzerine kurulu:

     · Güneş konumu   — Cooper deklinasyon denklemi + saat açısı (enleme bağlı)
     · Işınım         — ASHRAE açık hava modeli (aylık A/B/C katsayıları)
     · Eğik yüzey     — gelme açısı + gökyüzü ve yerden yansıyan difüz bileşen
     · PV çıkışı      — NOCT hücre sıcaklığı ve sıcaklık katsayısıyla derating
     · İnverter       — verim ve DC/AC oranına bağlı tepe kırpma (clipping)
     · Ev yükü        — saatlik profil (akşam zirvesi dahil), sabit değil
     · Batarya        — kWh kapasite, güç sınırı, gidiş-dönüş verimi, DoD

   Amaç, ziyaretçinin "öğlen üretiyorum ama akşam tüketiyorum" gerçeğini
   gözüyle görmesi. Bataryanın neden gerekli olduğu ancak böyle anlaşılır.
   ============================================================================ */

const SIM = {
    // Konum (varsayılan İstanbul). Enlem güneşin yükseldiği açıyı belirler.
    lat: 41.0,
    lon: 29.0,
    cityName: 'İstanbul',
    dayOfYear: 172,          // 21 Haziran — yaz gündönümü
    cloud: 0,                // 0 açık · 0.45 parçalı · 0.8 kapalı

    // Donanım
    panelWp: 500,            // tek panel tepe gücü (W)
    tiltDeg: 18.3,           // sahnedeki panel eğimi (rotation.x = 0.32 rad)
    azimuthDeg: 0,           // 0 = tam güney (sahnede +z güney)
    tempCoeff: -0.0035,      // %/°C — N-type panel
    noct: 45,
    systemLoss: 0.92,        // kirlenme + kablo + uyumsuzluk
    invEff: 0.97,
    dcAcRatio: 1.2,          // inverter = dizi kWp / 1.2 → tepede kırpma olur

    batKwhPer: 5.1,          // modül başına kapasite (Pylontech/Deye sınıfı)
    batKwPer: 2.5,           // modül başına şarj/deşarj gücü
    batMinSoc: 0.10,         // deşarj derinliği sınırı
    batEff: 0.96,            // tek yön (gidiş-dönüş ≈ %92)

    evKwh: 60,               // araç batarya kapasitesi
    evChargerKw: 7.4,        // ev tipi AC şarj

    tankLitre: 200,
    tankSet: 52,             // termostat üst sınırı (°C)
    tankOn: 45,              // altına düşünce ısıtmaya başlar
    hpCop: 3.2,              // ısı pompası performans katsayısı
    hpKw: 0.7,               // elektriksel çekiş
    tankLossPerH: 0.6        // °C/saat duruş kaybı
};

// Enerji durumu — gerçek birimlerle
const E = {
    batKwh: 0,               // bataryadaki enerji
    evKwh: 12,               // araçtaki enerji (başlangıçta %20)
    tankC: 18,               // depo su sıcaklığı
    pvDc: 0, pvAc: 0, clipped: 0,
    load: 0, batFlow: 0, evFlow: 0, hpFlow: 0, grid: 0,
    poa: 0, cellT: 0, ambT: 0, sunElDeg: 0, sunAzDeg: 0,
    sunrise: 6, sunset: 18,
    // Günlük sayaçlar (kWh)
    dProd: 0, dCons: 0, dImp: 0, dExp: 0,
    lastHour: -1
};

const RAD = Math.PI / 180;

// Türkiye'den örnek enlemler — kuzey-güney farkı kışın belirgin şekilde ayrışır.
const CITIES = [
    { ad: 'Antalya',   lat: 36.9, lon: 30.7 },
    { ad: 'Adana',     lat: 37.0, lon: 35.3 },
    { ad: 'İzmir',     lat: 38.4, lon: 27.1 },
    { ad: 'Konya',     lat: 37.9, lon: 32.5 },
    { ad: 'Ankara',    lat: 39.9, lon: 32.9 },
    { ad: 'İstanbul',  lat: 41.0, lon: 29.0 },
    { ad: 'Erzurum',   lat: 39.9, lon: 41.3 },
    { ad: 'Trabzon',   lat: 41.0, lon: 39.7 },
    { ad: 'Edirne',    lat: 41.7, lon: 26.6 }
];

// Türkiye kalıcı UTC+3 kullanır → standart meridyen 45°E.
// Kaydırıcıdaki saat YEREL saattir; güneş hesabı güneş saatiyle yapılır.
const STD_MERIDIAN = 45;
function solarTime(n, localHour, lonDeg) {
    const B = 2 * Math.PI * (n - 81) / 365;
    const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // dakika
    return localHour - (STD_MERIDIAN - lonDeg) / 15 + eot / 60;
}

// --- Saatlik ev yükü profili (kW). Gece taban ~0,16 · akşam zirvesi ~1,0 ---
// Toplam ≈ 10,2 kWh/gün — elektrikli beyaz eşyası olan bir Türk konutu.
const LOAD_PROFILE = [
    0.19, 0.18, 0.17, 0.16, 0.16, 0.18, 0.26, 0.46,
    0.55, 0.41, 0.34, 0.32, 0.36, 0.39, 0.35, 0.32,
    0.36, 0.49, 0.72, 0.96, 1.02, 0.90, 0.61, 0.32
];
function loadAt(h) {
    const i = Math.floor(h) % 24, j = (i + 1) % 24, f = h - Math.floor(h);
    return LOAD_PROFILE[i] + (LOAD_PROFILE[j] - LOAD_PROFILE[i]) * f;
}

// --- ASHRAE açık hava katsayıları (Ocak→Aralık) ---
const ASH_A = [1230, 1215, 1186, 1136, 1104, 1088, 1085, 1107, 1151, 1192, 1221, 1233];
const ASH_B = [0.142, 0.144, 0.156, 0.180, 0.196, 0.205, 0.207, 0.201, 0.177, 0.160, 0.149, 0.142];
const ASH_C = [0.058, 0.060, 0.071, 0.097, 0.121, 0.134, 0.136, 0.122, 0.092, 0.073, 0.063, 0.057];
function monthIndex(n) { return Math.min(11, Math.max(0, Math.floor(((n - 1) / 365) * 12))); }

// --- Güneş konumu: deklinasyon + saat açısı → yükseklik ve azimut ---
function sunPosition(n, hour, latDeg) {
    const dec = 23.45 * Math.sin(2 * Math.PI * (284 + n) / 365) * RAD;
    const lat = latDeg * RAD;
    const st = solarTime(n, hour, SIM.lon);                    // yerel saat → güneş saati
    const kayma = st - hour;                                   // güneş saati ile yerel saat farkı
    const omega = (st - 12) * 15 * RAD;                        // saat açısı
    const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(omega);
    const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));    // yükseklik
    // Azimut güneyden ölçülür, batıya doğru pozitif
    let az = Math.atan2(Math.sin(omega), Math.cos(omega) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat));
    // Gündoğumu / günbatımı saat açısı.
    // Yayınlanan saatler geometrik ufku değil, -0.833°'yi (atmosferik kırılma +
    // güneş diskinin yarıçapı) esas alır; bu düzeltme olmadan 4-5 dakika sapar.
    const h0 = -0.833 * RAD;
    let cosOs = (Math.sin(h0) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
    cosOs = Math.max(-1, Math.min(1, cosOs));
    const os = Math.acos(cosOs) / RAD / 15;                    // saat cinsinden yarı gün
    // Gündoğumu/batımı kullanıcıya YEREL saatle gösterilir
    return { el, az, dec, sunrise: 12 - os - kayma, sunset: 12 + os - kayma };
}

// --- Ortam sıcaklığı: mevsimlik ortalama + günlük salınım (tepe 15:00) ---
function ambientC(n, hour, latDeg) {
    const mean = 14.5 + 9.5 * Math.cos(2 * Math.PI * (n - 200) / 365);   // tepe ≈ 19 Temmuz
    const enlemDuzeltme = (41 - latDeg) * 0.35;                              // güneyde daha sıcak
    return mean + enlemDuzeltme + 5 * Math.cos(2 * Math.PI * (hour - 15) / 24);
}

// --- Eğik panel yüzeyine düşen ışınım (W/m²) ---
function irradiance(n, hour, latDeg, cloud) {
    const sp = sunPosition(n, hour, latDeg);
    E.sunrise = sp.sunrise; E.sunset = sp.sunset;
    E.sunElDeg = sp.el / RAD; E.sunAzDeg = sp.az / RAD;
    if (sp.el <= 0.5 * RAD) return { poa: 0, sp: sp };

    const m = monthIndex(n);
    const am = 1 / (Math.sin(sp.el) + 0.50572 * Math.pow(sp.el / RAD + 6.07995, -1.6364)); // Kasten-Young
    const dni = ASH_A[m] * Math.exp(-ASH_B[m] * am);      // doğrudan normal
    const dhi = ASH_C[m] * dni;                            // yatay difüz
    const ghi = dni * Math.sin(sp.el) + dhi;

    // Gelme açısı: eğim β, yüzey azimutu γ (güneyden)
    const beta = SIM.tiltDeg * RAD, gamma = SIM.azimuthDeg * RAD;
    const cosTheta = Math.cos(sp.el) * Math.cos(sp.az - gamma) * Math.sin(beta)
                   + Math.sin(sp.el) * Math.cos(beta);

    const beam = dni * Math.max(0, cosTheta);
    const sky = dhi * (1 + Math.cos(beta)) / 2;            // gökyüzü difüzü
    const gnd = ghi * 0.20 * (1 - Math.cos(beta)) / 2;     // yerden yansıyan (albedo 0.20)

    // Bulut: doğrudan bileşeni büyük ölçüde, difüzü az söndürür
    const k = 1 - cloud;
    const poa = beam * k * k + sky * (1 - cloud * 0.35) + gnd * k;
    return { poa: Math.max(0, poa), sp: sp };
}

function mat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.7, metalness: 0.05 }, opts || {}));
}
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function lerpStops(t, stops) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i][0] && t <= stops[i + 1][0]) {
            const f = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
            const a = stops[i][1], b = stops[i + 1][1];
            return new THREE.Color(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
        }
    }
    return new THREE.Color(stops[stops.length - 1][1][0], stops[stops.length - 1][1][1], stops[stops.length - 1][1][2]);
}
const SKY_STOPS = [[0, [0.04, 0.06, 0.12]], [0.15, [0.22, 0.16, 0.24]], [0.32, [0.78, 0.44, 0.20]], [0.6, [0.50, 0.66, 0.81]], [1, [0.62, 0.75, 0.88]]];

// --- 3D "+" buton sprite'ı (kameraya dönük, etiketli) ---
function makePlusSprite(label, onClick) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(15,23,42,0.88)'; roundRect(x, 3, 3, 314, 122, 20); x.fill();
    x.strokeStyle = '#f59e0b'; x.lineWidth = 4; roundRect(x, 3, 3, 314, 122, 20); x.stroke();
    x.fillStyle = '#f59e0b'; x.beginPath(); x.arc(46, 64, 30, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.font = 'bold 46px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('+', 46, 64);
    x.fillStyle = '#fff'; x.font = 'bold 22px Arial'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(label, 88, 64);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, depthWrite: false }));
    spr.scale.set(3.6, 1.44, 1);
    spr.userData.onClick = onClick;
    spr.renderOrder = 999;
    return spr;
}

function buildHouse(scene) {
    const o = {};
    const g = new THREE.Group();
    const wallMat = mat(0xEDE6DA, { roughness: 0.9 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 4.2, 6), wallMat);
    body.position.set(0, 2.1, 0); body.castShadow = true; body.receiveShadow = true; g.add(body);

    const base = new THREE.Mesh(new THREE.BoxGeometry(8.25, 0.45, 6.25), mat(0x3a4150, { roughness: 0.9 }));
    base.position.set(0, 0.22, 0); base.castShadow = true; base.receiveShadow = true; g.add(base);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.3, 6.1), mat(0x2b3240, { roughness: 0.85 }));
    roof.position.set(0, 4.35, 0); roof.castShadow = true; roof.receiveShadow = true; g.add(roof);

    // Temiz parapet (çatı eşiği) — ince ve düzgün
    const par = mat(0xDCD5C8, { roughness: 0.9 });
    const ph = 0.45, pt = 0.18;
    [[0, 4.7, 3.0, 8.1, ph, pt], [0, 4.7, -3.0, 8.1, ph, pt], [4.0, 4.7, 0, pt, ph, 6.1], [-4.0, 4.7, 0, pt, ph, 6.1]]
        .forEach(p => { const m = new THREE.Mesh(new THREE.BoxGeometry(p[3], p[4], p[5]), par); m.position.set(p[0], p[1], p[2]); m.castShadow = true; g.add(m); });

    // Ön cephe (+z): TEK kapı + TEK pencere
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.4, 0.16), mat(0x263041, { roughness: 0.5 }));
    door.position.set(-2.0, 1.2, 3.02); g.add(door);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 12), mat(0xcaa15a, { metalness: 0.7, roughness: 0.3 }));
    handle.position.set(-1.5, 1.2, 3.12); g.add(handle);

    const glass = mat(0x1b3550, { roughness: 0.1, metalness: 0.4 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.7, 0.12), mat(0x263041));
    frame.position.set(1.6, 2.4, 3.0); g.add(frame);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 0.16), glass);
    gl.position.set(1.6, 2.4, 3.02); g.add(gl);

    scene.add(g); o.house = g;

    // --- Çatı üstü paneller (DÜZELTİLMİŞ yön: öne/yukarı bakar), kademeli görünür ---
    o.panelGroup = new THREE.Group();
    o.panelTiles = [];
    const panelMat = mat(0x0a1a3a, { roughness: 0.22, metalness: 0.55 });
    const cellLine = mat(0x21447e, { roughness: 0.3, metalness: 0.4 });
    const railMat = mat(0x9aa3ad, { metalness: 0.6, roughness: 0.4 });
    const cols = 4, rows = 2, pw = 1.5, pd = 1.85, tilt = 0.32;
    const sx = -((cols - 1) * (pw + 0.2)) / 2, sz = -((rows - 1) * (pd + 0.3)) / 2;
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            const tile = new THREE.Group();
            tile.add(new THREE.Mesh(new THREE.BoxGeometry(pw, 0.06, pd), railMat));
            const gp = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.12, 0.07, pd - 0.12), panelMat); gp.position.y = 0.02; tile.add(gp);
            for (let k = -1; k <= 1; k++) { const ln = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.12, 0.075, 0.025), cellLine); ln.position.set(0, 0.021, k * (pd / 3)); tile.add(ln); }
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.4, 0.07), railMat); leg.position.set(0, -0.22, -pd / 2 + 0.12); tile.add(leg);
            tile.rotation.x = tilt; // öne/yukarı bakar (düzeltildi)
            tile.position.set(sx + i * (pw + 0.2), 0.5, sz + j * (pd + 0.3));
            tile.traverse(m => { if (m.isMesh) m.castShadow = true; });
            tile.scale.set(0, 0, 0);
            o.panelGroup.add(tile); o.panelTiles.push(tile);
        }
    }
    o.panelGroup.position.set(0, 4.35, 0);
    scene.add(o.panelGroup);

    // İnverter (yan duvar +x) — panel varken görünür
    o.inverter = new THREE.Group();
    o.inverter.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.0, 0.65), mat(0xF2F4F6, { roughness: 0.5 })));
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.34), new THREE.MeshStandardMaterial({ color: 0x0a2a3a, emissive: 0x1b5e79, emissiveIntensity: 0.7 })); scr.position.set(0.14, 0.18, 0); o.inverter.add(scr);
    o.inverter.position.set(4.18, 2.4, 1.9); o.inverter.traverse(m => { if (m.isMesh) m.castShadow = true; }); o.inverter.scale.set(0, 0, 0);
    scene.add(o.inverter);

    // Bataryalar (yan duvar +x)
    o.batteries = [];
    o.batAccent = new THREE.MeshStandardMaterial({ color: 0xF59E0B, emissive: 0xF59E0B, emissiveIntensity: 0.2, roughness: 0.4 });
    for (let i = 0; i < MAX_BAT; i++) {
        const b = new THREE.Group();
        b.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.85), mat(0x20262f, { roughness: 0.4, metalness: 0.3 })));
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.85), o.batAccent); strip.position.y = 0.35; b.add(strip);
        b.position.set(4.2, 1.05, 0.4 - i * 1.0); b.traverse(m => { if (m.isMesh) m.castShadow = true; }); b.scale.set(0, 0, 0);
        scene.add(b); o.batteries.push(b);
    }
    return o;
}

function buildEV(color) {
    const g = new THREE.Group();
    const bm = mat(color, { metalness: 0.55, roughness: 0.35 });
    const lower = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.85, 1.95), bm); lower.position.y = 0.78; lower.castShadow = true; g.add(lower);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.3, 2.0), mat(0x1a1f27, { roughness: 0.7 })); skirt.position.y = 0.42; g.add(skirt);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.72, 1.78), bm); cabin.position.set(-0.15, 1.5, 0); cabin.castShadow = true; g.add(cabin);
    const wind = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.6, 1.82), mat(0x0e1a26, { roughness: 0.15, metalness: 0.4 })); wind.position.set(-0.15, 1.5, 0); g.add(wind);
    const rf = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 1.7), bm); rf.position.set(-0.15, 1.83, 0); g.add(rf);
    const hl = new THREE.MeshStandardMaterial({ color: 0xfff6da, emissive: 0xffe9a8, emissiveIntensity: 0.9 });
    [-0.7, 0.7].forEach(z => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.4), hl); l.position.set(2.0, 0.85, z); g.add(l); });
    const tyre = mat(0x0f1114, { roughness: 0.85 }), rim = mat(0xcbd5e1, { metalness: 0.7, roughness: 0.3 });
    [[1.25, 0.95], [1.25, -0.95], [-1.25, 0.95], [-1.25, -0.95]].forEach(p => {
        const w = new THREE.Group();
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.32, 22), tyre); t.rotation.x = Math.PI / 2;
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.34, 16), rim); r.rotation.x = Math.PI / 2;
        w.add(t); w.add(r); w.position.set(p[0], 0.46, p[1]); w.castShadow = true; g.add(w);
    });
    return g;
}

function buildHeatPump() {
    const g = new THREE.Group();
    const bm = mat(0x4b5563, { roughness: 0.5, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.15, 0.7), bm); body.position.y = 0.75; body.castShadow = true; g.add(body);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 28), mat(0x1f2937)); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.8, 0.37); g.add(ring);
    const fan = new THREE.Group();
    for (let i = 0; i < 4; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.14), mat(0x9ca3af)); bl.rotation.y = (i * Math.PI) / 2; fan.add(bl); }
    fan.position.set(0, 0.8, 0.4); fan.rotation.x = Math.PI / 2; g.add(fan); g.userData.fan = fan;
    [-0.6, 0.6].forEach(x => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), bm); f.position.set(x, 0.17, 0); g.add(f); });
    g.position.set(5.6, 0, 2.4); g.scale.set(0, 0, 0);
    return g;
}

function buildHotWaterTank() {
    const g = new THREE.Group();
    g.userData.mat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.4, metalness: 0.3, emissive: 0x0a1a3a, emissiveIntensity: 0.15 });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.7, 24), g.userData.mat); tank.position.y = 1.05; tank.castShadow = true; g.add(tank);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.1, 24), mat(0xcbd5e1, { metalness: 0.6, roughness: 0.3 })));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.12, 24), mat(0xcbd5e1, { metalness: 0.6, roughness: 0.3 })); cap.position.y = 1.9; g.add(cap);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 12), mat(0x9ca3af, { metalness: 0.5 })); pipe.rotation.z = Math.PI / 2; pipe.position.set(-0.6, 1.4, 0); g.add(pipe);
    g.position.set(6.9, 0, 2.4); g.scale.set(0, 0, 0);
    return g;
}

function buildGasMeter() {
    const g = new THREE.Group();
    const meter = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.4), mat(0xEAB308, { roughness: 0.6 })); meter.position.set(0, 1.6, 0.2); meter.castShadow = true; g.add(meter);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 14), mat(0x9ca3af, { metalness: 0.5 })));
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 14), mat(0x9ca3af, { metalness: 0.5 })); p2.rotation.z = Math.PI / 2; p2.position.set(0.25, 1.3, 0.2); g.add(p2);
    g.position.set(4.15, 1.0, 3.6);
    return g;
}

function buildGrid(scene) {
    const o = {};
    const pm = mat(0x6b5644, { roughness: 0.8 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 9, 16), pm); pole.position.set(-11, 4.5, -4); pole.castShadow = true; scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 2.6), pm); arm.position.set(-11, 8.2, -4); scene.add(arm);
    o.curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-11, 8.2, -3.2), new THREE.Vector3(-7, 6.0, -1.5), new THREE.Vector3(-4, 4.4, 0));
    const geo = new THREE.BufferGeometry().setFromPoints(o.curve.getPoints(24));
    o.cable = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x475569 })); scene.add(o.cable);
    // akış noktaları
    o.dots = [];
    for (let i = 0; i < 5; i++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.2 }));
        d.visible = false; scene.add(d); o.dots.push(d);
    }
    o.phase = 0;
    return o;
}

// ---------- EKRAN ÜSTÜ ARAYÜZ (kontrol çubuğu + enerji paneli) ----------
function injectOverlays(container) {
    if (!document.getElementById('efFlowStyle')) {
        const st = document.createElement('style');
        st.id = 'efFlowStyle';
        st.textContent = '@keyframes efflow{from{background-position:0 0}to{background-position:16px 0}}.ef-line{height:4px;border-radius:4px;background:#334155}.ef-line.on{background-image:repeating-linear-gradient(90deg,#f59e0b 0,#f59e0b 7px,transparent 7px,transparent 16px);animation:efflow .5s linear infinite}.ef-line.imp{background-image:repeating-linear-gradient(90deg,#ef4444 0,#ef4444 7px,transparent 7px,transparent 16px);animation:efflow .5s linear infinite}.ef-line.exp{background-image:repeating-linear-gradient(90deg,#22c55e 0,#22c55e 7px,transparent 7px,transparent 16px);animation:efflow .5s linear infinite reverse}';
        document.head.appendChild(st);
    }

    // Sağ: Enerji Akış Paneli
    if (!document.getElementById('energyFlowPanel')) {
        const ef = document.createElement('div');
        ef.id = 'energyFlowPanel';
        ef.className = 'absolute top-4 right-4 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-white w-64 shadow-2xl z-10';
        ef.style.pointerEvents = 'none';
        const row = (icon, id, bar) => `<div class="mb-2">
            <div class="flex justify-between text-xs font-bold mb-1"><span>${icon}</span><span id="${id}">-</span></div>
            ${bar ? `<div class="w-full h-1.5 bg-white/15 rounded-full overflow-hidden"><div id="${id}Bar" class="h-full bg-amber-400 rounded-full" style="width:0%"></div></div><div id="${id}Line" class="ef-line mt-1"></div>` : `<div id="${id}Line" class="ef-line mt-1"></div>`}
        </div>`;
        ef.innerHTML = `
            <h4 class="font-black mb-1 text-sm">⚡ Enerji Akışı</h4>
            <div class="bg-amber-500/20 border border-amber-400/40 rounded-lg p-2 text-center mb-2">
                <div class="text-[10px] text-amber-200 font-bold">☀️ ANLIK ÜRETİM</div>
                <div class="text-xl font-black text-amber-300"><span id="efProd">0.0</span> kW</div>
                <div class="text-[9px] text-amber-100/80 leading-tight" id="efIrr">—</div>
            </div>
            <div class="bg-white/15 rounded-lg py-1 text-center mb-2 font-black text-[11px] border border-white/20">🔌 İNVERTER <span id="efClip" class="text-red-300 font-bold"></span></div>
            ${row('🔋 Batarya', 'efBat', true)}
            ${row('🚗 Araç', 'efCar', true)}
            ${row('♨️ Sıcak Su', 'efWater', true)}
            ${row('🏠 Ev', 'efHouse', false)}
            ${row('🔗 Şebeke', 'efGrid', false)}
            <div class="mt-3 pt-2 border-t border-white/15">
                <div class="text-[10px] font-black text-white/70 mb-1">BUGÜN (kWh)</div>
                <div class="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-bold">
                    <span class="text-amber-300">Üretim</span><span id="efDProd" class="text-right">0.0</span>
                    <span class="text-sky-300">Tüketim</span><span id="efDCons" class="text-right">0.0</span>
                    <span class="text-red-300">Şebekeden</span><span id="efDImp" class="text-right">0.0</span>
                    <span class="text-emerald-300">Şebekeye</span><span id="efDExp" class="text-right">0.0</span>
                </div>
            </div>
        `;
        container.appendChild(ef);
    }

    // Alt: Zaman/kontrol çubuğu
    if (!document.getElementById('simControlBar')) {
        const cb = document.createElement('div');
        cb.id = 'simControlBar';
        cb.className = 'absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/15 shadow-2xl z-10 flex items-center gap-3';
        cb.innerHTML = `
            <button id="simReset" class="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-lg">↺ Sıfırla</button>
            <div class="w-px h-6 bg-white/20"></div>
            <button id="simPlay" class="text-white text-lg leading-none w-7">⏸</button>
            <span id="simClock" class="text-white text-xs font-mono w-16 text-center">☀️ 12:00</span>
            <input id="simTime" type="range" min="0" max="24" step="0.1" value="12" class="w-32 accent-amber-500">
            <div class="w-px h-6 bg-white/20"></div>
            <select id="simCity" class="bg-slate-800 text-white text-[11px] font-bold rounded-lg px-2 py-1 border border-white/20 outline-none"></select>
            <select id="simSeason" class="bg-slate-800 text-white text-[11px] font-bold rounded-lg px-2 py-1 border border-white/20 outline-none">
                <option value="172">☀️ 21 Haziran</option>
                <option value="265">🍂 22 Eylül</option>
                <option value="355">❄️ 21 Aralık</option>
                <option value="80">🌱 21 Mart</option>
            </select>
            <select id="simCloud" class="bg-slate-800 text-white text-[11px] font-bold rounded-lg px-2 py-1 border border-white/20 outline-none">
                <option value="0">☀️ Açık</option>
                <option value="0.45">⛅ Parçalı</option>
                <option value="0.8">☁️ Kapalı</option>
            </select>
        `;
        container.appendChild(cb);
        document.getElementById('simReset').addEventListener('click', resetSim);
        document.getElementById('simPlay').addEventListener('click', () => { autoDay = !autoDay; document.getElementById('simPlay').textContent = autoDay ? '⏸' : '▶'; });
        document.getElementById('simTime').addEventListener('input', (e) => { dayTime = parseFloat(e.target.value); autoDay = false; document.getElementById('simPlay').textContent = '▶'; updateClock(); });

        // Konum: enlem güneşin ne kadar yükseleceğini belirler — üretimin
        // Antalya ile Trabzon arasındaki farkı buradan görünür hale gelir.
        const sehirSel = document.getElementById('simCity');
        CITIES.forEach((c, i) => {
            const o = document.createElement('option');
            o.value = String(i); o.textContent = '📍 ' + c.ad;
            if (c.ad === SIM.cityName) o.selected = true;
            sehirSel.appendChild(o);
        });
        sehirSel.addEventListener('change', e => {
            const c = CITIES[parseInt(e.target.value, 10)];
            SIM.lat = c.lat; SIM.lon = c.lon; SIM.cityName = c.ad; updateScore();
        });
        document.getElementById('simSeason').addEventListener('change', e => { SIM.dayOfYear = parseInt(e.target.value, 10); updateScore(); });
        document.getElementById('simCloud').addEventListener('change', e => { SIM.cloud = parseFloat(e.target.value); updateScore(); });
    }
}

function updateClock() {
    const el = document.getElementById('simClock'); if (!el) return;
    const hh = Math.floor(dayTime), mm = Math.floor((dayTime - hh) * 60);
    const icon = (dayTime > E.sunrise && dayTime < E.sunset) ? '☀️' : '🌙';
    el.textContent = `${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const s = document.getElementById('simTime'); if (s && document.activeElement !== s) s.value = dayTime;
}

function updateEnergyPanel() {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const bar = (id, pct) => { const e = document.getElementById(id + 'Bar'); if (e) e.style.width = Math.round(Math.max(0, Math.min(100, pct))) + '%'; };
    const line = (id, cls) => { const e = document.getElementById(id + 'Line'); if (e) e.className = 'ef-line mt-1' + (cls ? ' ' + cls : ''); };

    set('efProd', E.pvAc.toFixed(2));
    set('efIrr', panelCount
        ? `${Math.round(E.poa)} W/m² · panel ${Math.round(E.cellT)}°C · hava ${Math.round(E.ambT)}°C`
        : 'panel yok');
    set('efClip', E.clipped > 0.05 ? `· ${E.clipped.toFixed(1)} kW kırpıldı` : '');

    const batKap = countBat * SIM.batKwhPer;
    set('efBat', countBat > 0 ? `${Math.round(batteryLevel * 100)}% · ${E.batKwh.toFixed(1)}/${batKap.toFixed(1)} kWh` : 'yok');
    bar('efBat', countBat > 0 ? batteryLevel * 100 : 0);

    const evKap = countEV * SIM.evKwh;
    // ~6 km/kWh ortalama menzil
    set('efCar', countEV > 0 ? `${Math.round(carLevel * 100)}% · ${Math.round(E.evKwh * 6)} km` : 'yok');
    bar('efCar', countEV > 0 ? carLevel * 100 : 0);

    set('efWater', hpOn ? `${Math.round(E.tankC)}°C${E.hpFlow > 0 ? ' ısıtıyor' : ''}` : 'yok');
    bar('efWater', hpOn ? waterTemp * 100 : 0);

    set('efHouse', E.load.toFixed(2) + ' kW');

    if (E.grid > 0.02) set('efGrid', 'çekiliyor ' + E.grid.toFixed(2) + ' kW');
    else if (E.grid < -0.02) set('efGrid', 'veriliyor ' + (-E.grid).toFixed(2) + ' kW');
    else set('efGrid', 'dengede');

    set('efDProd', E.dProd.toFixed(1));
    set('efDCons', E.dCons.toFixed(1));
    set('efDImp', E.dImp.toFixed(1));
    set('efDExp', E.dExp.toFixed(1));

    line('efBat', E.batFlow > 0.02 ? 'on' : (E.batFlow < -0.02 ? 'exp' : ''));
    line('efCar', E.evFlow > 0.02 ? 'on' : '');
    line('efWater', E.hpFlow > 0 ? 'on' : '');
    line('efHouse', E.load > 0.01 ? 'on' : '');
    line('efGrid', E.grid > 0.02 ? 'imp' : (E.grid < -0.02 ? 'exp' : ''));
}

// ---------- BİLEŞEN EKLEME ----------
function refreshSprites() {
    sprites.forEach(s => {
        if (s.userData.kind === 'panel') s.visible = panelCount < MAX_PANELS;
        if (s.userData.kind === 'bat') s.visible = countBat < MAX_BAT;
        if (s.userData.kind === 'ev') s.visible = countEV < MAX_EV;
        if (s.userData.kind === 'hp') s.visible = !hpOn;
    });
}
function addPanel() { if (panelCount < MAX_PANELS) { panelCount++; refreshSprites(); updateScore(); } }
function addBat() { if (countBat < MAX_BAT) { countBat++; refreshSprites(); updateScore(); } }
function addEV() { if (countEV < MAX_EV) { countEV++; refreshSprites(); updateScore(); } }
function addHP() { if (!hpOn) { hpOn = true; refreshSprites(); updateScore(); } }
function resetSim() {
    panelCount = 0; countBat = 0; countEV = 0; hpOn = false;
    batteryLevel = 0; carLevel = 0; waterTemp = 0;
    E.batKwh = 0; E.evKwh = 12; E.tankC = 18;
    E.dProd = E.dCons = E.dImp = E.dExp = 0; E.lastHour = -1;
    E.pvDc = E.pvAc = E.clipped = E.batFlow = E.evFlow = E.hpFlow = E.grid = 0;
    refreshSprites(); updateScore();
}

window.initApp3DScene = function () {
    const container = document.getElementById('three-canvas-container');
    if (!container || appScene) return;
    container.style.position = 'relative';

    appScene = new THREE.Scene();
    appScene.fog = new THREE.Fog(0x1c2b45, 40, 110);

    const w = container.clientWidth || 800, h = container.clientHeight || 500;
    appCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    appCamera.position.set(16, 10, 18);

    appRenderer = new THREE.WebGLRenderer({ antialias: true });
    appRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    appRenderer.setSize(w, h);
    appRenderer.shadowMap.enabled = true; appRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.sRGBEncoding) appRenderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping) { appRenderer.toneMapping = THREE.ACESFilmicToneMapping; appRenderer.toneMappingExposure = 1.1; }
    appRenderer.domElement.style.position = 'absolute'; appRenderer.domElement.style.inset = '0';
    container.appendChild(appRenderer.domElement);

    appObjs = {};
    appObjs.hemi = new THREE.HemisphereLight(0xbcd2f0, 0x2b2f38, 0.6); appScene.add(appObjs.hemi);
    appObjs.sun = new THREE.DirectionalLight(0xfff2df, 1.6);
    appObjs.sun.castShadow = true;
    appObjs.sun.shadow.mapSize.set(2048, 2048);
    appObjs.sun.shadow.camera.near = 0.5; appObjs.sun.shadow.camera.far = 90;
    appObjs.sun.shadow.camera.left = -22; appObjs.sun.shadow.camera.right = 22;
    appObjs.sun.shadow.camera.top = 22; appObjs.sun.shadow.camera.bottom = -22;
    appObjs.sun.shadow.bias = -0.0004;
    appScene.add(appObjs.sun); appScene.add(appObjs.sun.target);
    appObjs.sunOrb = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    appScene.add(appObjs.sunOrb);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), mat(0x3a4250, { roughness: 0.97, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; appScene.add(ground);
    const grid = new THREE.GridHelper(140, 70, 0x2a3140, 0x2a3140); grid.material.transparent = true; grid.material.opacity = 0.22; grid.position.y = 0.01; appScene.add(grid);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 8), mat(0x2f3540, { roughness: 0.9 })); pad.position.set(1, 0.04, 7); pad.receiveShadow = true; appScene.add(pad);

    const house = buildHouse(appScene);
    Object.assign(appObjs, house);
    appObjs.hp = buildHeatPump(); appScene.add(appObjs.hp);
    appObjs.tank = buildHotWaterTank(); appScene.add(appObjs.tank);
    appObjs.gas = buildGasMeter(); appScene.add(appObjs.gas);
    Object.assign(appObjs, buildGrid(appScene));

    appObjs.evs = [];
    const evColors = [0x2b3a4a, 0xb0b8c0];
    for (let i = 0; i < MAX_EV; i++) { const ev = buildEV(evColors[i]); ev.position.set(-1.6 + i * 3.4, 0, 7); ev.rotation.y = Math.PI / 2; ev.scale.set(0, 0, 0); appScene.add(ev); appObjs.evs.push(ev); }

    // 3D "+" butonları
    sprites = [];
    const sp1 = makePlusSprite('Güneş paneli ekle', addPanel); sp1.position.set(0, 7.3, 0); sp1.userData.kind = 'panel'; appScene.add(sp1); sprites.push(sp1);
    const sp2 = makePlusSprite('Batarya ekle', addBat); sp2.position.set(4.3, 2.9, -1.3); sp2.userData.kind = 'bat'; appScene.add(sp2); sprites.push(sp2);
    const sp3 = makePlusSprite('Elektrikli araç ekle', addEV); sp3.position.set(1, 2.6, 7); sp3.userData.kind = 'ev'; appScene.add(sp3); sprites.push(sp3);
    const sp4 = makePlusSprite('Isı pompası ekle', addHP); sp4.position.set(5.9, 2.4, 2.4); sp4.userData.kind = 'hp'; appScene.add(sp4); sprites.push(sp4);

    appControls = new THREE.OrbitControls(appCamera, appRenderer.domElement);
    appControls.enableDamping = true; appControls.dampingFactor = 0.06; appControls.enablePan = false;
    appControls.minDistance = 12; appControls.maxDistance = 46; appControls.maxPolarAngle = Math.PI / 2 - 0.04;
    appControls.autoRotate = false; // KAPALI
    appControls.target.set(0, 2.4, 0); appControls.update();

    injectOverlays(container);
    const loadingEl = document.getElementById('loading3D'); if (loadingEl) loadingEl.style.display = 'none';

    // "+" tıklama (sürükleme ile karışmasın)
    const ray = new THREE.Raycaster(), pt = new THREE.Vector2();
    let dx = 0, dy = 0;
    appRenderer.domElement.addEventListener('pointerdown', e => { dx = e.clientX; dy = e.clientY; });
    appRenderer.domElement.addEventListener('pointerup', e => {
        if (Math.abs(e.clientX - dx) > 6 || Math.abs(e.clientY - dy) > 6) return;
        const r = appRenderer.domElement.getBoundingClientRect();
        pt.x = ((e.clientX - r.left) / r.width) * 2 - 1; pt.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        ray.setFromCamera(pt, appCamera);
        const hit = ray.intersectObjects(sprites.filter(s => s.visible), false);
        if (hit.length) hit[0].object.userData.onClick();
    });

    window.addEventListener('resize', onWindowResize3D);
    refreshSprites(); updateScore(); updateClock();

    const V = t => new THREE.Vector3(t, t, t);
    let last = performance.now(), acc = 0;
    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;

        const dtH = autoDay ? dt * (24 / 55) : 0;          // geçen simüle saat
        if (autoDay) { dayTime += dtH; if (dayTime >= 24) dayTime -= 24; updateClock(); }

        // --- Gerçek güneş konumu: enlem + günün sırası + saat açısı ---
        // Sahne yönü: +z güney, +x doğu, -x batı (kuzey yarımküre yerleşimi).
        const sp = sunPosition(SIM.dayOfYear, dayTime, SIM.lat);
        const elev = sp.el;                                // radyan, ufkun altında negatif
        const sunEl = Math.max(0, Math.sin(elev));         // ışık şiddeti çarpanı
        const R = 42;
        const ch = Math.cos(elev);
        appObjs.sun.position.set(-Math.sin(sp.az) * ch * R, Math.sin(elev) * R, Math.cos(sp.az) * ch * R);
        appObjs.sun.intensity = 0.04 + sunEl * 1.9;
        appObjs.sunOrb.position.copy(appObjs.sun.position).multiplyScalar(0.82);
        appObjs.sunOrb.visible = elev > -0.5 * RAD;
        // Ufka yakınken kızarır (atmosferde uzun yol), tepede beyazlaşır
        const alcak = 1 - Math.min(1, Math.max(0, elev / (25 * RAD)));
        appObjs.sunOrb.material.color.setRGB(1, 0.95 - alcak * 0.35, 0.88 - alcak * 0.62);
        // Işık rengi de aynı şekilde: gündoğumu/batımı turuncu, öğle nötr
        appObjs.sun.color.setRGB(1, 0.97 - alcak * 0.22, 0.93 - alcak * 0.38);

        // Gökyüzü: sivil alacakaranlıktan (-6°) tam gündüze (18°) geçiş.
        // Altın saat 0-10° arasıdır; bu yüzden geçiş yavaş olmalı, yoksa güneş
        // ufuktayken gökyüzü çoktan mavi olur ve sahne sahte durur.
        const skyT = Math.max(0, Math.min(1, (elev / RAD + 6) / 24));
        const sky = lerpStops(skyT, SKY_STOPS);
        appScene.background = sky; appScene.fog.color.copy(sky);
        appObjs.hemi.intensity = 0.10 + skyT * 0.55;
        // Ortam ışığı da gökyüzü rengini alsın (alacakaranlıkta mavi-mor dolgu)
        appObjs.hemi.color.copy(sky).lerp(new THREE.Color(0xbcd2f0), 0.45);
        appObjs.sun.target.position.set(0, 1.5, 0);

        // Bileşen görünürlükleri (yumuşak)
        appObjs.panelTiles.forEach((t, i) => t.scale.lerp(V(i < panelCount ? 1 : 0), 0.16));
        appObjs.inverter.scale.lerp(V(panelCount > 0 ? 1 : 0), 0.14);
        appObjs.batteries.forEach((b, i) => b.scale.lerp(V(i < countBat ? 1 : 0), 0.16));
        appObjs.evs.forEach((v, i) => v.scale.lerp(V(i < countEV ? 1 : 0), 0.16));
        appObjs.hp.scale.lerp(V(hpOn ? 1 : 0), 0.14);
        appObjs.tank.scale.lerp(V(hpOn ? 1 : 0), 0.14);
        appObjs.gas.scale.lerp(V(hpOn ? 0 : 1), 0.14);
        if (appObjs.hp.userData.fan && hpOn) appObjs.hp.userData.fan.rotation.z += 0.3;

        // Enerji modeli (simüle saat cinsinden)
        stepEnergy(dtH);

        // Görsel geri bildirim: batarya emissive, sıcak su rengi
        appObjs.batAccent.emissiveIntensity = 0.2 + batteryLevel * 1.4;
        appObjs.tank.userData.mat.color.setRGB(0.23 + waterTemp * 0.62, 0.5 - waterTemp * 0.32, 0.96 - waterTemp * 0.72);
        appObjs.tank.userData.mat.emissive.setRGB(waterTemp * 0.4, 0, 0);
        appObjs.tank.userData.mat.emissiveIntensity = 0.15 + waterTemp * 0.5;

        // Şebeke akış noktaları
        const flowing = Math.abs(gridFlow) > 0.05;
        appObjs.phase += dt * 0.35 * (gridFlow > 0 ? 1 : -1);
        appObjs.dots.forEach((d, i) => {
            d.visible = flowing;
            if (!flowing) return;
            let u = (appObjs.phase + i / appObjs.dots.length) % 1; if (u < 0) u += 1;
            d.position.copy(appObjs.curve.getPoint(u));
            const c = gridFlow > 0 ? 0xef4444 : 0x22c55e;
            d.material.color.setHex(c); d.material.emissive.setHex(c);
        });

        // Paneller yalnızca aydınlıkta hafif parlasın
        appControls.update();
        appRenderer.render(appScene, appCamera);

        acc += dt;
        if (acc > 0.15) { acc = 0; updateEnergyPanel(); updateScore(); }
    }
    animate();
};

/* ----------------------------------------------------------------------------
   Enerji adımı — dtH: geçen SİMÜLE saat (gerçek saniye değil)
   Öncelik sırası gerçek bir hibrit inverterin varsayılanıyla aynı:
     ev yükü → batarya şarjı → araç şarjı → şebekeye verme
   Açık düşerse: batarya deşarjı → şebekeden çekme
   ---------------------------------------------------------------------------- */
function stepEnergy(dtH) {
    const arrayKwp = panelCount * SIM.panelWp / 1000;

    // --- Işınım ve PV üretimi ---
    const ir = irradiance(SIM.dayOfYear, dayTime, SIM.lat, SIM.cloud);
    E.poa = ir.poa;
    E.ambT = ambientC(SIM.dayOfYear, dayTime, SIM.lat);
    // NOCT modeli: hücre sıcaklığı ışınımla yükselir
    E.cellT = E.ambT + (SIM.noct - 20) / 800 * E.poa;
    const tempFactor = 1 + SIM.tempCoeff * (E.cellT - 25);

    E.pvDc = arrayKwp * (E.poa / 1000) * tempFactor * SIM.systemLoss;
    if (E.pvDc < 0) E.pvDc = 0;

    // İnverter: verim + tepe kırpma
    const invKw = Math.max(1.5, arrayKwp / SIM.dcAcRatio);
    const acRaw = E.pvDc * SIM.invEff;
    E.pvAc = Math.min(acRaw, invKw);
    E.clipped = Math.max(0, acRaw - E.pvAc);
    prodKW = E.pvAc;

    // --- Ev yükü (saatlik profil) ---
    E.load = loadAt(dayTime);
    houseLoadKW = E.load;

    // --- Isı pompalı su ısıtıcı: termostat ---
    // Depo soğur; ayar noktasının altına inince ısınır. Güneş varken öncelikli
    // çalışır, kritik seviyeye düşerse şebekeden de çalışır (gerçek davranış).
    E.hpFlow = 0;
    if (hpOn) {
        E.tankC -= SIM.tankLossPerH * dtH;
        const yuzeyFazlasi = E.pvAc - E.load;
        const zorunlu = E.tankC < SIM.tankOn;
        if (E.tankC < SIM.tankSet && (zorunlu || yuzeyFazlasi > SIM.hpKw)) {
            E.hpFlow = SIM.hpKw;
            // Q = P × COP × dt  →  ΔT = Q / (m × c)
            const kwhIsi = SIM.hpKw * SIM.hpCop * dtH;
            E.tankC += kwhIsi * 860 / SIM.tankLitre;   // 1 kWh ≈ 860 kcal
        }
        E.tankC = Math.max(10, Math.min(70, E.tankC));
    } else {
        E.tankC = E.ambT;
    }

    const toplamYuk = E.load + E.hpFlow;
    let fazla = E.pvAc - toplamYuk;

    const batKap = countBat * SIM.batKwhPer;
    const batGuc = countBat * SIM.batKwPer;
    const batMin = batKap * SIM.batMinSoc;
    const evKap = countEV * SIM.evKwh;

    E.batFlow = 0; E.evFlow = 0;

    if (fazla > 0) {
        // 1) Batarya şarjı
        if (batKap > 0 && E.batKwh < batKap) {
            const p = Math.min(fazla, batGuc, (batKap - E.batKwh) / Math.max(dtH, 1e-6));
            E.batKwh += p * dtH * SIM.batEff;
            E.batFlow = p; fazla -= p;
        }
        // 2) Araç şarjı (güneşten)
        if (evKap > 0 && E.evKwh < evKap && fazla > 0.2) {
            const p = Math.min(fazla, countEV * SIM.evChargerKw, (evKap - E.evKwh) / Math.max(dtH, 1e-6));
            E.evKwh += p * dtH;
            E.evFlow = p; fazla -= p;
        }
        E.grid = -fazla;                     // negatif = şebekeye veriliyor
    } else {
        let acik = -fazla;
        // Bataryadan karşıla
        if (batKap > 0 && E.batKwh > batMin) {
            const p = Math.min(acik, batGuc, (E.batKwh - batMin) / Math.max(dtH, 1e-6));
            E.batKwh -= p * dtH / SIM.batEff;
            E.batFlow = -p; acik -= p;
        }
        E.grid = acik;                       // pozitif = şebekeden çekiliyor
    }
    gridFlow = E.grid;

    // --- Günlük sayaçlar (gece yarısı sıfırlanır) ---
    const saat = Math.floor(dayTime);
    if (E.lastHour > saat) { E.dProd = E.dCons = E.dImp = E.dExp = 0; }
    E.lastHour = saat;
    E.dProd += E.pvAc * dtH;
    E.dCons += (toplamYuk + Math.max(0, E.evFlow)) * dtH;
    if (E.grid > 0) E.dImp += E.grid * dtH; else E.dExp += -E.grid * dtH;

    // --- Görsel katman için 0..1 karşılıkları ---
    batteryLevel = batKap > 0 ? E.batKwh / batKap : 0;
    carLevel = evKap > 0 ? E.evKwh / evKap : 0;
    waterTemp = hpOn ? Math.max(0, Math.min(1, (E.tankC - 15) / (SIM.tankSet - 15))) : 0;
}

function onWindowResize3D() {
    const c = document.getElementById('three-canvas-container');
    if (!c || !appRenderer || !appCamera) return;
    const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
    appCamera.aspect = w / h; appCamera.updateProjectionMatrix(); appRenderer.setSize(w, h);
}

/* ----------------------------------------------------------------------------
   Skor artık "panel varsa +30 puan" gibi uydurma bir tablo değil; günün o ana
   kadarki gerçek enerji bilançosundan türüyor:
       öz yeterlilik = (tüketim − şebekeden çekilen) / tüketim
   Karbon da Türkiye şebeke emisyon faktörüyle (≈0,44 kg CO₂/kWh) hesaplanıyor.
   ---------------------------------------------------------------------------- */
const GRID_CO2 = 0.44;   // kg CO₂ / kWh — Türkiye şebeke ortalaması

function updateScore() {
    const anlamli = E.dCons > 0.15;
    const ozYeterlilik = anlamli ? Math.max(0, Math.min(100, (1 - E.dImp / E.dCons) * 100)) : 0;
    const sebekeBagimliligi = 100 - ozYeterlilik;

    // Kaçınılan emisyon: şebekeden çekmek zorunda kalmadığınız her kWh
    const kacinilan = Math.max(0, E.dCons - E.dImp) * GRID_CO2;
    const salinan = E.dImp * GRID_CO2;

    const fossil = hpOn ? 'İPTAL EDİLDİ' : 'Aktif Kullanımda';

    const sEl = document.getElementById('scoreDisplay'),
          gEl = document.getElementById('gridDepDisplay'),
          fEl = document.getElementById('fossilDisplay'),
          cEl = document.getElementById('carbonDisplay');

    // Gün ilerlemeden oran hesaplanamaz: kaydırıcıyla gezinirken veya duraklatılmışken
    // sayaçlar birikmez. Bu durumda %0 yazmak yanıltıcı olur — beklediğini söyle.
    if (sEl) sEl.innerText = anlamli ? '%' + Math.round(ozYeterlilik) : '—';
    if (gEl) gEl.innerText = anlamli ? '%' + Math.round(sebekeBagimliligi) : '—';
    if (fEl) fEl.innerText = fossil;
    if (cEl) cEl.innerText = anlamli
        ? `${salinan.toFixed(1)} kg salım · ${kacinilan.toFixed(1)} kg tasarruf`
        : 'günü oynatın ▶';

    if (sEl) {
        sEl.className = 'text-xs px-2 py-1 rounded text-white font-bold transition-colors duration-500 shadow';
        if (!anlamli) sEl.classList.add('bg-slate-500');
        else if (ozYeterlilik < 30) sEl.classList.add('bg-red-500');
        else if (ozYeterlilik < 70) sEl.classList.add('bg-orange-500');
        else if (ozYeterlilik < 95) sEl.classList.add('bg-emerald-500');
        else sEl.classList.add('bg-emerald-600');
    }
}
