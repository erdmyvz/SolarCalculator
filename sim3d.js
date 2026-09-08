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
let panelCount = 0, balconyCount = 0, countBat = 0, countEV = 0, hpOn = false;
let batteryLevel = 0, carLevel = 0, waterTemp = 0;   // 0..1 — yalnız görsel geri bildirim için
let prodKW = 0, gridFlow = 0, houseLoadKW = 0.4;
let dayTime = 12, autoDay = true;
let sprites = [];
const MAX_PANELS = 8, MAX_BALCONY = 4, MAX_BAT = 4, MAX_EV = 2;

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
    panelWp: 500,            // çatı paneli tepe gücü (W)
    tiltDeg: 18.3,           // çatı paneli eğimi (kullanıcı değiştirir)
    azimuthDeg: 0,           // çatı yönü: 0 = tam güney, + batı, − doğu

    // Balkon paneli — dikey montaj (fasada asılı), kendi yönü çatıyla aynı
    balconyWp: 400,          // balkon paneli tepe gücü
    balconyTilt: 90,         // dikey
    balconyAz: 0,            // balkon güney cephesinde sabit (ev dönmez)
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
    roofKw: 0, balconyKw: 0,
    load: 0, batFlow: 0, evFlow: 0, hpFlow: 0, grid: 0,
    poa: 0, poaBalcony: 0, cellT: 0, ambT: 0, sunElDeg: 0, sunAzDeg: 0,
    shade: 0,                // 0 = gölge yok · 1 = doğrudan ışın tamamen kesik
    shadeLossKw: 0,          // gölge yüzünden kaybedilen anlık güç
    dShadeLoss: 0,           // gün boyu kaybedilen kWh
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
// Fatura girildiğinde profil bu katsayıyla ölçeklenir (şekil aynı, seviye değişir)
let LOAD_SCALE = 1;
function loadAt(h) {
    const i = Math.floor(h) % 24, j = (i + 1) % 24, f = h - Math.floor(h);
    return (LOAD_PROFILE[i] + (LOAD_PROFILE[j] - LOAD_PROFILE[i]) * f) * LOAD_SCALE;
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

/* ----------------------------------------------------------------------------
   GÖLGELENME — ufuk profili yöntemi
   ----------------------------------------------------------------------------
   Sahadaki her engel (komşu bina, ağaç), panel dizisinden bakıldığında gökyüzünün
   bir azimut aralığını belirli bir yüksekliğe kadar kapatır. Güneş o aralıktaysa
   ve engelin tepesinden alçaktaysa DOĞRUDAN ışın kesilir; difüz ışın kalır.
   Bu, saha etüdünde Solar Pathfinder ile yapılan ölçümün matematiksel karşılığıdır.

   Engellerin azimut ve yükseklik açıları sahnedeki gerçek 3B konumlarından
   türetilir — yani ekranda gördüğünüz gölge ile hesaptaki kayıp aynı şeydir.
   ---------------------------------------------------------------------------- */
const OBSTACLES = [
    // x: doğu(+)/batı(−) · z: güney(+)/kuzey(−) · h: yükseklik · w,d: genişlik/derinlik
    { key: 'bina',  ad: 'Komşu bina', on: false, x: -7,  z: 11, w: 9,  d: 7, h: 11 },
    { key: 'agac',  ad: 'Ağaç',       on: false, x: 6.5, z: 8,  w: 4,  d: 4, h: 8 }
];
const ARRAY_POS = { x: 0, y: 4.85, z: 0 };   // panel dizisinin sahnedeki merkezi

// Engelin dizi merkezinden görünen azimut aralığı ve tepe yükseklik açısı
function obstacleProfile(o) {
    const kose = [
        [o.x - o.w / 2, o.z - o.d / 2], [o.x + o.w / 2, o.z - o.d / 2],
        [o.x - o.w / 2, o.z + o.d / 2], [o.x + o.w / 2, o.z + o.d / 2]
    ];
    let azMin = 999, azMax = -999, elMax = 0;
    for (const [cx, cz] of kose) {
        // Azimut güneyden ölçülür, batıya doğru pozitif (+z güney, −x batı)
        const az = Math.atan2(-cx, cz) / RAD;
        azMin = Math.min(azMin, az); azMax = Math.max(azMax, az);
        const mesafe = Math.hypot(cx - ARRAY_POS.x, cz - ARRAY_POS.z);
        elMax = Math.max(elMax, Math.atan2(o.h - ARRAY_POS.y, mesafe) / RAD);
    }
    return { azMin, azMax, elMax };
}

// 0 = gölge yok, 1 = doğrudan ışın tamamen kesik. Kenarlarda yumuşak geçiş.
function shadeFactor(sunAzDeg, sunElDeg) {
    let en = 0;
    for (const o of OBSTACLES) {
        if (!o.on) continue;
        const p = obstacleProfile(o);
        if (sunElDeg >= p.elMax) continue;                       // güneş engelin üstünde
        const yumusak = 4;                                       // derece — kenar geçişi
        let yatay = 1;
        if (sunAzDeg < p.azMin) yatay = Math.max(0, 1 - (p.azMin - sunAzDeg) / yumusak);
        else if (sunAzDeg > p.azMax) yatay = Math.max(0, 1 - (sunAzDeg - p.azMax) / yumusak);
        const dikey = Math.min(1, (p.elMax - sunElDeg) / 2);     // tepeye yakınken kısmi
        en = Math.max(en, yatay * dikey);
    }
    return Math.max(0, Math.min(1, en));
}

/* ----------------------------------------------------------------------------
   Belirli bir yüzeye (eğim + yön) düşen ışınım.
   Çatı ve balkon aynı fonksiyonu farklı parametrelerle kullanır.
   ---------------------------------------------------------------------------- */
function irradianceOn(n, hour, latDeg, cloud, tiltDeg, azDeg) {
    const sp = sunPosition(n, hour, latDeg);
    E.sunrise = sp.sunrise; E.sunset = sp.sunset;
    E.sunElDeg = sp.el / RAD; E.sunAzDeg = sp.az / RAD;
    if (sp.el <= 0.5 * RAD) { E.shade = 0; return { poa: 0, poaGolgesiz: 0, sp: sp }; }

    const m = monthIndex(n);
    const am = 1 / (Math.sin(sp.el) + 0.50572 * Math.pow(sp.el / RAD + 6.07995, -1.6364)); // Kasten-Young
    const dni = ASH_A[m] * Math.exp(-ASH_B[m] * am);      // doğrudan normal
    const dhi = ASH_C[m] * dni;                            // yatay difüz
    const ghi = dni * Math.sin(sp.el) + dhi;

    const beta = tiltDeg * RAD, gamma = azDeg * RAD;
    const cosTheta = Math.cos(sp.el) * Math.cos(sp.az - gamma) * Math.sin(beta)
                   + Math.sin(sp.el) * Math.cos(beta);

    const beam = dni * Math.max(0, cosTheta);
    const sky = dhi * (1 + Math.cos(beta)) / 2;            // gökyüzü difüzü
    const gnd = ghi * 0.20 * (1 - Math.cos(beta)) / 2;     // yerden yansıyan (albedo 0.20)

    const k = 1 - cloud;
    const golgesiz = beam * k * k + sky * (1 - cloud * 0.35) + gnd * k;

    // Gölge yalnız DOĞRUDAN bileşeni keser; difüz ışık gölgede de gelir.
    const g = shadeFactor(E.sunAzDeg, E.sunElDeg);
    E.shade = g;
    const poa = beam * k * k * (1 - g) + sky * (1 - cloud * 0.35) * (1 - g * 0.25) + gnd * k;

    return { poa: Math.max(0, poa), poaGolgesiz: Math.max(0, golgesiz), sp: sp };
}

// Geriye dönük sarmalayıcı — çatı yüzeyi
function irradiance(n, hour, latDeg, cloud) {
    return irradianceOn(n, hour, latDeg, cloud, SIM.tiltDeg, SIM.azimuthDeg);
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

/* ----------------------------------------------------------------------------
   ÇEVRE ENGELLERİ — gölgeyi hem gözle hem hesapta üreten nesneler.
   Konumları OBSTACLES tablosuyla birebir aynı; biri değişirse diğeri de değişir.
   ---------------------------------------------------------------------------- */
function buildNeighbourBuilding(o) {
    const g = new THREE.Group();
    const govde = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), mat(0x8d8578, { roughness: 0.95 }));
    govde.position.y = o.h / 2; govde.castShadow = true; govde.receiveShadow = true; g.add(govde);
    // Pencere sıraları — ölçek hissi verir
    const cam = new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.25, metalness: 0.3 });
    for (let k = 1; k * 2.6 < o.h - 1; k++) {
        for (let i = -1; i <= 1; i++) {
            const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.12), cam);
            w.position.set(i * 2.4, k * 2.6, -o.d / 2 - 0.02); g.add(w);
        }
    }
    const cati = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.3, 0.3, o.d + 0.3), mat(0x6f685d));
    cati.position.y = o.h + 0.1; cati.castShadow = true; g.add(cati);
    g.position.set(o.x, 0, o.z);
    g.visible = false;
    return g;
}

function buildTree(o) {
    const g = new THREE.Group();
    const govde = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, o.h * 0.45, 10), mat(0x5a4433, { roughness: 1 }));
    govde.position.y = o.h * 0.225; govde.castShadow = true; g.add(govde);
    const yaprakMat = mat(0x2f6b3a, { roughness: 0.95 });
    [[0, 0.62, 1.9], [-0.7, 0.80, 1.5], [0.8, 0.82, 1.45], [0, 0.95, 1.35]].forEach(k => {
        const y = new THREE.Mesh(new THREE.SphereGeometry(k[2], 14, 12), yaprakMat);
        y.position.set(k[0], o.h * k[1], 0); y.castShadow = true; g.add(y);
    });
    g.position.set(o.x, 0, o.z);
    g.visible = false;
    return g;
}

/* ----------------------------------------------------------------------------
   BALKON PANELLERİ — güney cephesine dikey monte, kendi mikro inverteriyle.
   Dikey montaj yazın çatıdan çok daha az, kışın ise oransal olarak daha iyi
   üretir; alçak kış güneşi dik yüzeye neredeyse tam açıyla gelir.
   ---------------------------------------------------------------------------- */
function buildBalcony() {
    const g = new THREE.Group();
    const dosemeMat = mat(0xCFC7B8, { roughness: 0.9 });
    const doseme = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.18, 1.3), dosemeMat);
    doseme.position.set(1.0, 2.95, 3.6); doseme.castShadow = true; doseme.receiveShadow = true; g.add(doseme);
    const korkulukMat = mat(0x8a929c, { metalness: 0.5, roughness: 0.5 });
    for (let i = 0; i < 10; i++) {
        const d = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8), korkulukMat);
        d.position.set(-1.2 + i * 0.49, 3.54, 4.2); g.add(d);
    }
    const ust = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.09, 0.12), korkulukMat);
    ust.position.set(1.0, 4.06, 4.2); g.add(ust);

    // Dikey paneller — korkuluğun dışına asılı
    const pMat = mat(0x0a1a3a, { roughness: 0.22, metalness: 0.55 });
    const cizgi = mat(0x21447e, { roughness: 0.3, metalness: 0.4 });
    g.userData.tiles = [];
    for (let i = 0; i < MAX_BALCONY; i++) {
        const t = new THREE.Group();
        t.add(new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.9, 0.06), pMat));
        for (let k = -1; k <= 1; k++) {
            const ln = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.075), cizgi);
            ln.position.set(0, k * 0.28, 0.005); t.add(ln);
        }
        t.position.set(-1.15 + i * 1.15, 3.55, 4.28);
        t.traverse(m => { if (m.isMesh) m.castShadow = true; });
        t.scale.set(0, 0, 0);
        g.add(t); g.userData.tiles.push(t);
    }
    g.visible = true;
    return g;
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
/* ----------------------------------------------------------------------------
   YERLEŞİM
   Paneller büyüdükçe alt kontrol çubuğunun altına giriyor ve üst üste biniyordu.
   Çözüm: iki kenar sütunu kendi içinde kayar, alt çubuğun üstünde biter; çubuk
   ortada, sütunların arasında durur. Dar ekranda sütunlar katlanabilir.
   ---------------------------------------------------------------------------- */
function ensureColumns(container) {
    let sol = document.getElementById('simLeftCol');
    if (!sol) {
        sol = document.createElement('div');
        sol.id = 'simLeftCol';
        sol.className = 'absolute left-4 z-20 flex flex-col gap-3';
        sol.style.top = '1rem'; sol.style.bottom = '5.25rem';
        sol.style.width = '18rem'; sol.style.overflowY = 'auto'; sol.style.overflowX = 'hidden';
        sol.style.scrollbarWidth = 'thin';
        container.appendChild(sol);

        // index.html'deki skor kutusunu bu sütuna al — tek kaydırma bağlamı olsun
        const skor = document.getElementById('scoreDisplay')?.closest('div.absolute');
        if (skor) {
            skor.className = 'bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-white shadow-2xl flex-shrink-0';
            skor.style.pointerEvents = 'none';
            sol.appendChild(skor);
        }
    }
    let sag = document.getElementById('simRightCol');
    if (!sag) {
        sag = document.createElement('div');
        sag.id = 'simRightCol';
        sag.className = 'absolute right-4 z-20 flex flex-col gap-2';
        sag.style.top = '1rem'; sag.style.bottom = '5.25rem';
        sag.style.width = '17rem'; sag.style.overflowY = 'auto'; sag.style.overflowX = 'hidden';
        sag.style.scrollbarWidth = 'thin';
        container.appendChild(sag);
    }
    return { sol, sag };
}

/* Kontrol çubuğu ekran genişliğine göre bir veya iki satıra sarıyor; yüksekliği
   sabit varsaymak çakışmaya yol açıyordu. Sütun alt sınırını çubuğu ölçerek
   belirliyoruz — her genişlikte ve tam ekranda doğru kalır. */
function layoutColumns() {
    const cb = document.getElementById('simControlBar');
    const sol = document.getElementById('simLeftCol'), sag = document.getElementById('simRightCol');
    if (!cb || !sol || !sag) return;
    const alt = Math.round(cb.offsetHeight) + 22;
    sol.style.bottom = alt + 'px';
    sag.style.bottom = alt + 'px';

    // Dar ekranda sütunlar sahneyi tamamen kapatmasın
    const c = document.getElementById('three-canvas-container');
    const dar = c && c.clientWidth < 900;
    sol.style.width = dar ? '15rem' : '18rem';
    sag.style.width = dar ? '14.5rem' : '17rem';
}

// Kenar sütunlarını gizle/göster — 3B sahneyi tam görmek isteyenler için
window.simTogglePanels = function () {
    const sol = document.getElementById('simLeftCol'), sag = document.getElementById('simRightCol');
    const gizli = sol.style.display === 'none';
    sol.style.display = gizli ? 'flex' : 'none';
    sag.style.display = gizli ? 'flex' : 'none';
    const b = document.getElementById('simPanelsBtn');
    if (b) b.textContent = gizli ? '🗂 Panelleri gizle' : '🗂 Panelleri göster';
};

/* Tam ekran.
   Önce gerçek Fullscreen API denenir. iOS Safari'de eleman tam ekranı yoktur,
   izin verilmeyen iframe'lerde de reddedilir; bu yüzden başarısız olursa
   sayfayı kaplayan CSS moduna düşülür. Kullanıcı her koşulda tam ekran alır. */
let _cssTamEkran = false;

function setCssFullscreen(ac) {
    const c = document.getElementById('three-canvas-container');
    if (!c) return;
    _cssTamEkran = ac;
    if (ac) {
        c.dataset.eskiStil = c.getAttribute('style') || '';
        c.style.position = 'fixed'; c.style.inset = '0'; c.style.zIndex = '9999';
        c.style.height = '100vh'; c.style.width = '100vw';
        c.style.borderRadius = '0'; c.style.borderWidth = '0';
        document.body.style.overflow = 'hidden';
    } else {
        c.setAttribute('style', c.dataset.eskiStil || '');
        document.body.style.overflow = '';
    }
    onFsChange();
}

window.simFullscreen = function () {
    const c = document.getElementById('three-canvas-container');
    if (!c) return;
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    if (_cssTamEkran) { setCssFullscreen(false); return; }

    const iste = c.requestFullscreen || c.webkitRequestFullscreen;
    if (!iste) { setCssFullscreen(true); return; }
    try {
        const p = iste.call(c);
        if (p && p.catch) p.catch(() => setCssFullscreen(true));
    } catch (e) { setCssFullscreen(true); }
};

// Escape ile CSS modundan çık (gerçek tam ekranı tarayıcı kendi kapatır)
document.addEventListener('keydown', e => { if (e.key === 'Escape' && _cssTamEkran) setCssFullscreen(false); });

function onFsChange() {
    const c = document.getElementById('three-canvas-container');
    const b = document.getElementById('simFsBtn');
    const tam = !!document.fullscreenElement || _cssTamEkran;
    if (b) b.textContent = tam ? '⤡ Çık (Esc)' : '⛶ Tam ekran';
    if (c && !_cssTamEkran) c.style.borderRadius = document.fullscreenElement ? '0' : '';
    setTimeout(() => { onWindowResize3D(); layoutColumns(); }, 60);
}

function injectOverlays(container) {
    const { sol, sag } = ensureColumns(container);
    if (!document.getElementById('efFlowStyle')) {
        const st = document.createElement('style');
        st.id = 'efFlowStyle';
        st.textContent = '@keyframes efflow{from{background-position:0 0}to{background-position:16px 0}}.ef-line{height:4px;border-radius:4px;background:#334155}.ef-line.on{background-image:repeating-linear-gradient(90deg,#f59e0b 0,#f59e0b 7px,transparent 7px,transparent 16px);animation:efflow .5s linear infinite}.ef-line.imp{background-image:repeating-linear-gradient(90deg,#ef4444 0,#ef4444 7px,transparent 7px,transparent 16px);animation:efflow .5s linear infinite}.ef-line.exp{background-image:repeating-linear-gradient(90deg,#22c55e 0,#22c55e 7px,transparent 7px,transparent 16px);animation:efflow .5s linear infinite reverse}';
        document.head.appendChild(st);
    }

    // Sağ sütun sekmeleri: Akış · Yıllık · Evim
    if (!document.getElementById('simRightTabs')) {
        const tb = document.createElement('div');
        tb.id = 'simRightTabs';
        tb.className = 'flex gap-1 bg-slate-900/85 backdrop-blur-md rounded-xl border border-white/15 p-1 flex-shrink-0';
        tb.innerHTML = ['akis:⚡ Akış', 'yil:📅 Yıllık', 'ev:🏠 Evim'].map((x, i) => {
            const [k, ad] = x.split(':');
            return `<button data-tab="${k}" class="sim-rtab flex-1 text-[10px] font-black py-1.5 rounded-lg ${i === 0 ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10'}">${ad}</button>`;
        }).join('');
        sag.appendChild(tb);
        tb.addEventListener('click', e => {
            const b = e.target.closest('.sim-rtab'); if (!b) return;
            const k = b.dataset.tab;
            tb.querySelectorAll('.sim-rtab').forEach(x => {
                x.className = 'sim-rtab flex-1 text-[10px] font-black py-1.5 rounded-lg ' +
                    (x.dataset.tab === k ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10');
            });
            document.getElementById('energyFlowPanel').style.display = k === 'akis' ? '' : 'none';
            document.getElementById('yearPanel').style.display = k === 'yil' ? '' : 'none';
            document.getElementById('homePanel').style.display = k === 'ev' ? '' : 'none';
            if (k === 'yil') renderYearly();
            if (k === 'ev') renderHome();
        });
    }

    // Sağ: Enerji Akış Paneli
    if (!document.getElementById('energyFlowPanel')) {
        const ef = document.createElement('div');
        ef.id = 'energyFlowPanel';
        ef.className = 'bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20 text-white shadow-2xl flex-shrink-0';
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
            <div id="efSplit" class="text-[9px] text-white/70 text-center mb-1"></div>
            <div id="efShade" class="hidden bg-slate-900/50 border border-red-400/40 rounded-lg px-2 py-1 mb-2 text-[10px] text-red-200 font-bold text-center"></div>
            <div class="bg-white/15 rounded-lg py-1 text-center mb-2 font-black text-[11px] border border-white/20">🔌 İNVERTER <span id="efClip" class="text-red-300 font-bold"></span></div>
            ${row('🔋 Batarya', 'efBat', true)}
            ${row('🚗 Araç', 'efCar', true)}
            ${row('♨️ Sıcak Su', 'efWater', true)}
            ${row('🏠 Ev', 'efHouse', false)}
            ${row('🔗 Şebeke', 'efGrid', false)}
            <div id="efStory" class="mt-2 bg-sky-500/15 border border-sky-300/30 rounded-lg px-2 py-1.5 text-[10px] leading-snug text-sky-100"></div>
            <div class="mt-3 pt-2 border-t border-white/15">
                <div class="text-[10px] font-black text-white/70 mb-1">BUGÜN (kWh)</div>
                <div class="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-bold">
                    <span class="text-amber-300">Üretim</span><span id="efDProd" class="text-right">0.0</span>
                    <span class="text-sky-300">Tüketim</span><span id="efDCons" class="text-right">0.0</span>
                    <span class="text-red-300">Şebekeden</span><span id="efDImp" class="text-right">0.0</span>
                    <span class="text-emerald-300">Şebekeye</span><span id="efDExp" class="text-right">0.0</span>
                    <span class="text-red-200" id="efDShadeLbl">Gölge kaybı</span><span id="efDShade" class="text-right">0.0</span>
                </div>
            </div>
        `;
        sag.appendChild(ef);
    }

    if (!document.getElementById('yearPanel')) {
        const yp = document.createElement('div');
        yp.id = 'yearPanel';
        yp.className = 'bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20 text-white shadow-2xl flex-shrink-0';
        yp.style.display = 'none';
        yp.innerHTML = `<h4 class="font-black mb-2 text-sm">📅 Yıllık Üretim</h4>
            <div id="yearBody" class="text-white"></div>
            <button onclick="renderYearly()" class="w-full mt-2 bg-white/10 hover:bg-white/20 text-[10px] font-bold py-1.5 rounded-lg">↻ Yeniden hesapla</button>`;
        sag.appendChild(yp);
    }

    if (!document.getElementById('homePanel')) {
        const hp = document.createElement('div');
        hp.id = 'homePanel';
        hp.className = 'bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20 text-white shadow-2xl flex-shrink-0 text-xs';
        hp.style.display = 'none';
        hp.innerHTML = `<h4 class="font-black mb-2 text-sm">🏠 Evim</h4><div id="homeBody"></div>`;
        sag.appendChild(hp);
    }

    // Sol alt: Sistem kurulum paneli — ekle / çıkar / yönlendir
    if (!document.getElementById('simBuildPanel')) {
        const bp = document.createElement('div');
        bp.id = 'simBuildPanel';
        bp.className = 'bg-slate-900/88 backdrop-blur-md rounded-xl border border-white/15 text-white shadow-2xl text-xs flex-shrink-0';

        const sayacSatir = (etiket, ikon, id, ipucu) => `
            <div class="flex items-center gap-2 py-1.5" title="${ipucu}">
                <span class="w-5 text-center">${ikon}</span>
                <span class="flex-1 font-bold">${etiket}</span>
                <button data-act="eksi" data-t="${id}" class="w-6 h-6 rounded bg-white/10 hover:bg-white/25 font-black leading-none">−</button>
                <span id="cnt_${id}" class="w-5 text-center font-mono font-bold">0</span>
                <button data-act="arti" data-t="${id}" class="w-6 h-6 rounded bg-amber-500/80 hover:bg-amber-500 text-slate-900 font-black leading-none">+</button>
            </div>`;

        bp.innerHTML = `
            <div class="px-3 py-2 border-b border-white/15 font-black text-[11px] tracking-wide">🧰 SİSTEMİ KUR</div>
            <div class="px-3 py-2 border-b border-white/10">
                ${sayacSatir('Çatı paneli', '🔆', 'panel', '500 Wp · eğik montaj')}
                ${sayacSatir('Balkon paneli', '🪟', 'balkon', '400 Wp · dikey, mikro inverterli')}
                ${sayacSatir('Batarya', '🔋', 'bat', '5,1 kWh · 2,5 kW')}
                ${sayacSatir('Elektrikli araç', '🚗', 'ev', '60 kWh · 7,4 kW şarj')}
                <div class="flex items-center gap-2 py-1.5" title="Termostatlı, COP 3,2">
                    <span class="w-5 text-center">♨️</span>
                    <span class="flex-1 font-bold">Isı pompası</span>
                    <button data-act="hp" class="px-2 h-6 rounded bg-white/10 hover:bg-white/25 font-bold" id="btnHp">Ekle</button>
                </div>
            </div>

            <div class="px-3 py-2 border-b border-white/10">
                <div class="font-black text-[11px] tracking-wide mb-2">🧭 ÇATI YÖNÜ</div>
                <select id="simAzimuth" class="w-full bg-slate-800 rounded-lg px-2 py-1 border border-white/20 outline-none font-bold mb-2">
                    <option value="0">Güney — en verimli</option>
                    <option value="-45">Güneydoğu</option>
                    <option value="45">Güneybatı</option>
                    <option value="-90">Doğu — sabah</option>
                    <option value="90">Batı — akşam</option>
                    <option value="180">Kuzey — uygun değil</option>
                </select>
                <label class="flex items-center gap-2">
                    <span class="font-bold w-10">Eğim</span>
                    <input id="simTilt" type="range" min="0" max="45" step="1" value="18" class="flex-1 accent-amber-500">
                    <span id="simTiltVal" class="font-mono w-8 text-right">18°</span>
                </label>
                <p id="simOrientNote" class="text-[10px] text-white/60 mt-1 leading-tight"></p>
            </div>

            <div class="px-3 py-2">
                <div class="font-black text-[11px] tracking-wide mb-2">🌳 ÇEVRE (GÖLGE)</div>
                ${OBSTACLES.map(o => `
                <div class="py-1">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" data-obs="${o.key}" class="w-4 h-4 rounded accent-amber-500">
                        <span class="font-bold flex-1">${o.ad}</span>
                        <span id="obs_${o.key}_ozet" class="text-[10px] text-white/50 font-mono"></span>
                    </label>
                    <div id="obs_${o.key}_ayar" class="hidden pl-6 pt-1 space-y-1">
                        <label class="flex items-center gap-2">
                            <span class="w-12 text-[10px] text-white/60">Yükseklik</span>
                            <input data-obs-h="${o.key}" type="range" min="3" max="20" step="0.5" value="${o.h}" class="flex-1 accent-amber-500">
                        </label>
                        <label class="flex items-center gap-2">
                            <span class="w-12 text-[10px] text-white/60">Mesafe</span>
                            <input data-obs-z="${o.key}" type="range" min="5" max="26" step="0.5" value="${o.z}" class="flex-1 accent-amber-500">
                        </label>
                    </div>
                </div>`).join('')}
                <p id="simShadeNote" class="text-[10px] text-white/60 mt-1 leading-tight"></p>
            </div>`;
        sol.appendChild(bp);

        bp.addEventListener('click', (e) => {
            const b = e.target.closest('button'); if (!b) return;
            const act = b.dataset.act, t = b.dataset.t;
            if (act === 'hp') { hpOn = !hpOn; if (!hpOn) E.tankC = E.ambT; }
            else if (act === 'arti') {
                if (t === 'panel' && panelCount < MAX_PANELS) panelCount++;
                if (t === 'balkon' && balconyCount < MAX_BALCONY) balconyCount++;
                if (t === 'bat' && countBat < MAX_BAT) countBat++;
                if (t === 'ev' && countEV < MAX_EV) countEV++;
            } else if (act === 'eksi') {
                if (t === 'panel' && panelCount > 0) panelCount--;
                if (t === 'balkon' && balconyCount > 0) balconyCount--;
                if (t === 'bat' && countBat > 0) { countBat--; E.batKwh = Math.min(E.batKwh, countBat * SIM.batKwhPer); }
                if (t === 'ev' && countEV > 0) { countEV--; E.evKwh = Math.min(E.evKwh, countEV * SIM.evKwh); }
            } else return;
            refreshBuildPanel(); refreshSprites(); updateScore();
        });

        bp.querySelectorAll('[data-obs]').forEach(cb => {
            cb.addEventListener('change', e => {
                const o = OBSTACLES.find(x => x.key === e.target.dataset.obs);
                if (o) o.on = e.target.checked;
                refreshBuildPanel();
            });
        });
        // Yükseklik ve mesafe: hem 3B nesneyi hem gölge hesabını aynı anda değiştirir
        bp.querySelectorAll('[data-obs-h],[data-obs-z]').forEach(sl => {
            sl.addEventListener('input', e => {
                const el = e.target;
                const key = el.dataset.obsH || el.dataset.obsZ;
                const o = OBSTACLES.find(x => x.key === key); if (!o) return;
                if (el.dataset.obsH) o.h = parseFloat(el.value); else o.z = parseFloat(el.value);
                applyObstacleTransform(o);
                refreshBuildPanel();
            });
        });

        document.getElementById('simAzimuth').addEventListener('change', e => {
            SIM.azimuthDeg = parseFloat(e.target.value); applyRoofOrientation(); refreshBuildPanel();
        });
        document.getElementById('simTilt').addEventListener('input', e => {
            SIM.tiltDeg = parseFloat(e.target.value);
            document.getElementById('simTiltVal').textContent = SIM.tiltDeg + '°';
            applyRoofOrientation(); refreshBuildPanel();
        });
        refreshBuildPanel();
    }

    // Alt: Zaman/kontrol çubuğu
    if (!document.getElementById('simControlBar')) {
        const cb = document.createElement('div');
        cb.id = 'simControlBar';
        cb.className = 'absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/88 backdrop-blur-md px-3 py-2 rounded-xl border border-white/15 shadow-2xl z-30 flex flex-wrap items-center justify-center gap-2 gap-y-1.5';
        cb.style.maxWidth = 'min(52rem, calc(100% - 2rem))';
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
            <div class="w-px h-6 bg-white/20"></div>
            <button id="simPanelsBtn" onclick="simTogglePanels()" class="bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap">🗂 Panelleri gizle</button>
            <button id="simFsBtn" onclick="simFullscreen()" class="bg-amber-500/85 hover:bg-amber-500 text-slate-900 text-[11px] font-black px-2.5 py-1.5 rounded-lg whitespace-nowrap">⛶ Tam ekran</button>
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

    // Kontrol çubuğu hazır olduktan SONRA yerleşimi hizala ve tam ekranı bağla
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    layoutColumns();
    const cbEl = document.getElementById('simControlBar');
    if (window.ResizeObserver && cbEl) new ResizeObserver(layoutColumns).observe(cbEl);
}

function updateClock() {
    const el = document.getElementById('simClock'); if (!el) return;
    const hh = Math.floor(dayTime), mm = Math.floor((dayTime - hh) * 60);
    const icon = (dayTime > E.sunrise && dayTime < E.sunset) ? '☀️' : '🌙';
    el.textContent = `${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const s = document.getElementById('simTime'); if (s && document.activeElement !== s) s.value = dayTime;
}

/* ----------------------------------------------------------------------------
   CANLI ANLATIM — o an ne olduğunu ve NEDEN olduğunu tek cümleyle söyler.
   Simülasyonun asıl amacı sayı göstermek değil, sebebi anlatmak.
   ---------------------------------------------------------------------------- */
function narrate() {
    if (panelCount === 0 && balconyCount === 0)
        return 'Henüz panel yok: evin tüm elektriği şebekeden geliyor. Soldaki panelden çatıya panel ekleyin.';

    const gunduz = dayTime > E.sunrise && dayTime < E.sunset;

    if (!gunduz)
        return countBat > 0 && E.batKwh > countBat * SIM.batKwhPer * SIM.batMinSoc
            ? 'Güneş battı, üretim yok. Ev şu an gündüz depolanan bataryadan besleniyor — panelin asıl değeri burada ortaya çıkıyor.'
            : 'Güneş battı. Batarya yoksa (veya boşaldıysa) akşam tüketimi şebekeden karşılanır; günün en pahalı saatleri de tam bu saatlerdir.';

    if (E.shade > 0.5)
        return `Paneller şu an gölgede: doğrudan ışın kesildi, yalnız difüz ışık kaldı. Kış güneşi alçak olduğu için engeller asıl bu mevsimde vurur — yazın aynı bina hiç gölge yapmıyordu.`;

    if (E.clipped > 0.1)
        return `İnverter tepe gücünde: panellerin ürettiği ${E.clipped.toFixed(1)} kW kırpılıyor. Diziyi inverterden büyük seçmek normaldir; yılda birkaç saat kırpma, kışın daha çok üretim demektir.`;

    if (E.grid < -0.1)
        return `Üretim tüketimi aşıyor, fazlası şebekeye gidiyor. Batarya ekleyip bu fazlayı akşama saklarsanız öz yeterlilik ciddi biçimde yükselir.`;

    if (E.batFlow > 0.05)
        return 'Fazla üretim bataryaya yazılıyor. Akşam zirvesinde bu enerji geri çekilecek — güneş öğlen üretir, ev akşam tüketir.';

    if (E.grid > 0.1)
        return `Üretim tüketimi karşılamıyor, aradaki fark şebekeden çekiliyor (${E.grid.toFixed(2)} kW).`;

    if (balconyCount > 0 && E.balconyKw > E.roofKw * 0.3 && SIM.dayOfYear > 300)
        return 'Kış güneşi alçak: dikey balkon panelleri, eğik çatı panellerine göre oransal olarak çok daha iyi üretiyor.';

    return 'Üretim ve tüketim dengede — evin ihtiyacı doğrudan panellerden karşılanıyor.';
}

/* ============================================================================
   YILLIK ÖZET
   Her ayın 15'i temsilî gün kabul edilip tam gün simüle edilir, ayın gün
   sayısıyla çarpılır. Aynı motor, aynı gölge ve yön ayarları — yani soldaki
   seçimler doğrudan yıllık tabloya yansır.
   ============================================================================ */
const AY_ADI = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const AY_GUN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const AY_TEMSIL = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

// Tek günün üretimini hesaplar (canlı durumu bozmadan)
function simulateDayKwh(n, golgeliMi) {
    const yedek = { shade: E.shade, el: E.sunElDeg, az: E.sunAzDeg, sr: E.sunrise, ss: E.sunset };
    const acik = OBSTACLES.map(o => o.on);
    if (!golgeliMi) OBSTACLES.forEach(o => { o.on = false; });

    const kwp = panelCount * SIM.panelWp / 1000;
    const bKwp = balconyCount * SIM.balconyWp / 1000;
    const invKw = Math.max(1.5, kwp / SIM.dcAcRatio);
    let kwh = 0; const dt = 1 / 60;
    for (let h = 0; h < 24; h += dt) {
        const amb = ambientC(n, h, SIM.lat);
        const ir = irradianceOn(n, h, SIM.lat, SIM.cloud, SIM.tiltDeg, SIM.azimuthDeg);
        const tf = 1 + SIM.tempCoeff * (amb + (SIM.noct - 20) / 800 * ir.poa - 25);
        const mm = E.shade > 0.02 && E.shade < 0.98 ? (1 - 0.18 * (1 - Math.abs(2 * E.shade - 1))) : 1;
        const roof = Math.min(Math.max(0, kwp * (ir.poa / 1000) * tf * SIM.systemLoss * mm) * SIM.invEff, invKw);
        let balk = 0;
        if (bKwp > 0) {
            const irB = irradianceOn(n, h, SIM.lat, SIM.cloud, SIM.balconyTilt, SIM.balconyAz);
            balk = Math.max(0, bKwp * (irB.poa / 1000) * (1 + SIM.tempCoeff * (amb + (SIM.noct - 20) / 800 * irB.poa - 25)) * SIM.systemLoss) * SIM.invEff;
        }
        kwh += (roof + balk) * dt;
    }
    OBSTACLES.forEach((o, i) => { o.on = acik[i]; });
    E.shade = yedek.shade; E.sunElDeg = yedek.el; E.sunAzDeg = yedek.az; E.sunrise = yedek.sr; E.sunset = yedek.ss;
    return kwh;
}

function renderYearly() {
    const kutu = document.getElementById('yearBody');
    if (!kutu) return;
    if (panelCount === 0 && balconyCount === 0) {
        kutu.innerHTML = '<p class="text-[11px] text-white/60 leading-snug">Önce soldan panel ekleyin — yıllık üretim tablosu buraya çıkacak.</p>';
        return;
    }
    kutu.innerHTML = '<p class="text-[11px] text-white/60">Hesaplanıyor…</p>';

    setTimeout(() => {
        const golgeVar = OBSTACLES.some(o => o.on);
        const aylik = [], aylikGolgesiz = [];
        for (let i = 0; i < 12; i++) {
            aylik.push(simulateDayKwh(AY_TEMSIL[i], true) * AY_GUN[i]);
            aylikGolgesiz.push(golgeVar ? simulateDayKwh(AY_TEMSIL[i], false) * AY_GUN[i] : 0);
        }
        const toplam = aylik.reduce((a, b) => a + b, 0);
        const toplamGolgesiz = aylikGolgesiz.reduce((a, b) => a + b, 0);
        const enBuyuk = Math.max(...(golgeVar ? aylikGolgesiz : aylik));
        const kwp = (panelCount * SIM.panelWp + balconyCount * SIM.balconyWp) / 1000;

        const W = 244, H = 118, pad = 14;
        const bw = (W - pad * 2) / 12;
        let cizim = '';
        for (let i = 0; i < 12; i++) {
            const hh = enBuyuk > 0 ? (aylik[i] / enBuyuk) * (H - 30) : 0;
            const hg = enBuyuk > 0 ? (aylikGolgesiz[i] / enBuyuk) * (H - 30) : 0;
            const x = pad + i * bw;
            if (golgeVar) cizim += `<rect x="${x + 1}" y="${H - 16 - hg}" width="${bw - 2}" height="${hg}" fill="#64748b" opacity="0.45" rx="1"/>`;
            cizim += `<rect x="${x + 1}" y="${H - 16 - hh}" width="${bw - 2}" height="${hh}" fill="#fbbf24" rx="1"/>`;
            cizim += `<text x="${x + bw / 2}" y="${H - 5}" font-size="7" fill="#94a3b8" text-anchor="middle">${AY_ADI[i]}</text>`;
        }

        kutu.innerHTML = `
            <svg viewBox="0 0 ${W} ${H}" class="w-full" style="height:118px">${cizim}</svg>
            <div class="text-[11px] font-bold mt-1">Yıllık üretim: <span class="text-amber-300">${Math.round(toplam).toLocaleString('tr-TR')} kWh</span></div>
            <div class="text-[10px] text-white/60">${kwp.toFixed(1)} kWp · ${Math.round(toplam / Math.max(kwp, 0.01))} kWh/kWp · ${SIM.cityName}</div>
            ${golgeVar ? `<div class="mt-2 bg-red-500/15 border border-red-400/30 rounded-lg px-2 py-1 text-[10px] text-red-200 leading-snug">
                Gri sütunlar gölgesiz hali. Engeller yılda <strong>${Math.round(toplamGolgesiz - toplam).toLocaleString('tr-TR')} kWh</strong>
                (%${Math.round((1 - toplam / toplamGolgesiz) * 100)}) götürüyor — kaybın neredeyse tamamı kış aylarında.</div>` : ''}
            <p class="text-[10px] text-white/50 mt-2 leading-snug">Her ayın 15'i temsilî gün alınıp tam gün simüle edildi; yön, eğim, gölge ve bulutluluk ayarları tabloya doğrudan yansır.</p>
            <p class="text-[10px] text-amber-200/70 mt-1 leading-snug">⚠️ Bu bir <strong>açık hava</strong> hesabıdır (şu an: ${['açık', 'parçalı bulutlu', 'kapalı'][SIM.cloud === 0 ? 0 : SIM.cloud < 0.6 ? 1 : 2]}). Gerçek yıllık üretim, bölgenizin gerçek bulutluluk ve toz koşullarına göre değişir; kesin sonuç için saha etüdü gerekir.</p>`;
    }, 30);
}

/* ============================================================================
   EVİM — çatı alanı ve fatura ile simülasyonu ziyaretçinin evine bağlar
   Katsayılar platformun geri kalanıyla aynı kaynaktan (window.EPC_SETTINGS)
   gelir; böylece hesaplayıcı, fatura analizi ve simülasyon aynı dili konuşur.
   ============================================================================ */
let evAyarli = false;

function renderHome() {
    const k = document.getElementById('homeBody');
    if (!k) return;
    const S = window.EPC_SETTINGS || {};
    const m2PerKwp = S.roofM2PerKwp || 5.5;
    const lc = window.lastCalc;

    k.innerHTML = `
        <label class="block mb-2">
            <span class="font-bold">Kullanılabilir çatı alanı</span>
            <div class="flex items-center gap-2 mt-1">
                <input id="homeRoof" type="number" min="0" step="5" value="40" class="w-full bg-slate-800 rounded-lg px-2 py-1 border border-white/20 outline-none">
                <span class="text-white/60">m²</span>
            </div>
        </label>
        <label class="block mb-2">
            <span class="font-bold">Aylık elektrik faturanız</span>
            <div class="flex items-center gap-2 mt-1">
                <input id="homeBill" type="number" min="0" step="50" value="" placeholder="örn. 1500" class="w-full bg-slate-800 rounded-lg px-2 py-1 border border-white/20 outline-none">
                <span class="text-white/60">TL</span>
            </div>
        </label>
        ${lc && lc.monthly_bill ? `<button id="homeFromCalc" class="w-full bg-emerald-500/80 hover:bg-emerald-500 text-slate-900 font-black rounded-lg py-1.5 mb-2">📄 Hesaplayıcıdaki faturamı kullan (${Math.round(lc.monthly_bill)} TL)</button>` : ''}
        <button id="homeApply" class="w-full bg-amber-500/90 hover:bg-amber-500 text-slate-900 font-black rounded-lg py-1.5">Evime uygula</button>
        <div id="homeResult" class="mt-2 text-[10px] text-white/70 leading-snug">
            Çatı alanı kaç panel sığdığını, fatura da evin gerçek tüketim seviyesini belirler.
            Uyguladığınızda simülasyon sizin eviniz olur.
        </div>`;

    document.getElementById('homeApply').onclick = () => {
        const m2 = parseFloat(document.getElementById('homeRoof').value) || 0;
        const fatura = parseFloat(document.getElementById('homeBill').value) || 0;
        const sonuc = [];

        // Çatı alanı → sığan panel sayısı (platformun m²/kWp katsayısıyla)
        if (m2 > 0) {
            const kwp = m2 / m2PerKwp;
            const adet = Math.max(0, Math.min(MAX_PANELS, Math.floor(kwp / (SIM.panelWp / 1000))));
            panelCount = adet;
            sonuc.push(`${m2} m² çatıya <strong>${adet} panel</strong> (${(adet * SIM.panelWp / 1000).toFixed(1)} kWp) sığıyor` +
                       (kwp / (SIM.panelWp / 1000) > MAX_PANELS ? ' — sahnede en fazla 8 panel gösterilebiliyor' : ''));
        }

        // Fatura → günlük tüketim → yük profilini ölçekle
        if (fatura > 0) {
            const tarife = S.tariffMesken || S.tariff || 2.5;
            const gunlukKwh = (fatura / tarife) / 30;
            const tabanToplam = LOAD_PROFILE.reduce((a, b) => a + b, 0);
            LOAD_SCALE = gunlukKwh / tabanToplam;
            sonuc.push(`Fatura → günde <strong>${gunlukKwh.toFixed(1)} kWh</strong> tüketim (${tarife} TL/kWh ile)`);
        }

        evAyarli = true;
        refreshBuildPanel(); refreshSprites(); updateScore();
        document.getElementById('homeResult').innerHTML =
            sonuc.length ? sonuc.join('<br>') + '<br><span class="text-amber-300">Günü oynatıp sonucu görün.</span>'
                         : 'En az bir alan doldurun.';
    };

    const btn = document.getElementById('homeFromCalc');
    if (btn) btn.onclick = () => {
        document.getElementById('homeBill').value = Math.round(window.lastCalc.monthly_bill);
    };
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

    // Çatı / balkon ayrımı
    set('efSplit', balconyCount > 0
        ? `çatı ${E.roofKw.toFixed(2)} kW · balkon ${E.balconyKw.toFixed(2)} kW`
        : '');

    // Gölge uyarısı — yalnız gerçekten gölge varken görünür
    const sh = document.getElementById('efShade');
    if (sh) {
        const golgeli = E.shade > 0.02 && panelCount > 0;
        sh.classList.toggle('hidden', !golgeli);
        if (golgeli) sh.textContent = `🌳 Gölge: doğrudan ışının %${Math.round(E.shade * 100)}'i kesik · −${E.shadeLossKw.toFixed(2)} kW`;
    }

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

    set('efStory', narrate());

    set('efDProd', E.dProd.toFixed(1));
    set('efDCons', E.dCons.toFixed(1));
    set('efDImp', E.dImp.toFixed(1));
    set('efDExp', E.dExp.toFixed(1));
    set('efDShade', E.dShadeLoss.toFixed(1));
    const gl = document.getElementById('efDShadeLbl'), gv = document.getElementById('efDShade');
    const gorunur = E.dShadeLoss > 0.05;
    if (gl) gl.style.opacity = gorunur ? '1' : '0.35';
    if (gv) gv.style.opacity = gorunur ? '1' : '0.35';

    line('efBat', E.batFlow > 0.02 ? 'on' : (E.batFlow < -0.02 ? 'exp' : ''));
    line('efCar', E.evFlow > 0.02 ? 'on' : '');
    line('efWater', E.hpFlow > 0 ? 'on' : '');
    line('efHouse', E.load > 0.01 ? 'on' : '');
    line('efGrid', E.grid > 0.02 ? 'imp' : (E.grid < -0.02 ? 'exp' : ''));
}

// ---------- BİLEŞEN EKLEME ----------
/* Çatı dizisinin yönünü ve eğimini sahneye uygular.
   Düz çatıda balastlı sistemler cephe hattından bağımsız açıyla kurulabilir;
   bu yüzden ev sabit kalır, yalnız dizi döner. Panel normali güneye (+z)
   bakarken azimut γ için grup Y ekseninde −γ döndürülür. */
function applyRoofOrientation() {
    if (!appObjs || !appObjs.panelGroup) return;
    appObjs.panelGroup.rotation.y = -SIM.azimuthDeg * RAD;
    const t = SIM.tiltDeg * RAD;
    appObjs.panelTiles.forEach(tile => { tile.rotation.x = t; });
}

/* Kurulum panelini durumla eşitler ve seçime göre kısa bir mühendis notu yazar. */
/* Engelin yüksekliğini ve mesafesini 3B nesneye uygular.
   obstacleProfile() aynı o.h / o.z değerlerini okuduğu için ekrandaki gölge ile
   hesaplanan kayıp otomatik olarak senkron kalır. */
function applyObstacleTransform(o) {
    const m = appObjs && appObjs.obstacles && appObjs.obstacles[o.key];
    if (!m || !m.userData.h0) return;
    m.scale.y = o.h / m.userData.h0;   // taban yerde kalır, tepe yükselir
    m.position.z = o.z;
}

function refreshBuildPanel() {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('cnt_panel', panelCount); set('cnt_balkon', balconyCount);
    set('cnt_bat', countBat); set('cnt_ev', countEV);
    const hb = document.getElementById('btnHp');
    if (hb) { hb.textContent = hpOn ? 'Çıkar' : 'Ekle'; hb.className = 'px-2 h-6 rounded font-bold ' + (hpOn ? 'bg-emerald-500/80 hover:bg-emerald-500 text-slate-900' : 'bg-white/10 hover:bg-white/25'); }

    const az = Math.abs(SIM.azimuthDeg);
    // Notlar modelin kendi verdiği değerlerle uyumlu (İstanbul, 18° eğim):
    // güney 21,4 · GD/GB 20,3 · doğu/batı 17,9 · kuzey 14,1 kWh/gün
    const notlar = {
        0: 'Güney en yüksek yıllık üretimi verir — karşılaştırmaların referansı budur.',
        45: 'Güneyden 45° sapma alçak eğimde yalnız ~%5 kaybettirir; eğim dikleştikçe bu kayıp büyür.',
        90: 'Doğu/batı cephede kayıp ~%16. Üretim sabaha ya da akşama kayar — tüketiminiz o saatlerdeyse batı cephe mantıklı olabilir.',
        180: 'Kuzey cephede kayıp ~%34. Eğimli montaj uygun değildir; panelleri düze yakın kurmak gerekir.'
    };
    set('simOrientNote', notlar[az] || '');

    // Eğim notu: dik açı kışı, düşük açı yazı kayırır
    const tn = document.getElementById('simTiltVal');
    if (tn) tn.title = SIM.tiltDeg < 12 ? 'Düz montaj: yazı kayırır, kışın zayıf'
                     : SIM.tiltDeg > 33 ? 'Dik montaj: kışı kayırır, kar da daha kolay kayar'
                     : 'İstanbul için yıllık optimum 30-35° civarındadır';

    OBSTACLES.forEach(o => {
        const ay = document.getElementById('obs_' + o.key + '_ayar');
        if (ay) ay.classList.toggle('hidden', !o.on);
        const oz = document.getElementById('obs_' + o.key + '_ozet');
        if (oz) oz.textContent = o.on ? `${o.h.toFixed(0)}m · ${o.z.toFixed(0)}m` : '';
        const cb = document.querySelector(`[data-obs="${o.key}"]`);
        if (cb) cb.checked = o.on;
    });

    const acikEngel = OBSTACLES.filter(o => o.on).map(o => o.ad);
    if (acikEngel.length) {
        const p = OBSTACLES.filter(o => o.on).map(o => {
            const pr = obstacleProfile(o);
            return `${o.ad}: ufuktan ${pr.elMax.toFixed(0)}° yükseklik`;
        });
        set('simShadeNote', p.join(' · ') + '. Güneş bu açının altındayken doğrudan ışın kesilir — kışın öğle güneşi bile alçaktır.');
    } else {
        set('simShadeNote', 'Engel ekleyip günü oynatın — gölgenin üretimden ne götürdüğünü panelde görün.');
    }
}

function refreshSprites() {
    sprites.forEach(s => {
        if (s.userData.kind === 'panel') s.visible = panelCount < MAX_PANELS;
        if (s.userData.kind === 'bat') s.visible = countBat < MAX_BAT;
        if (s.userData.kind === 'ev') s.visible = countEV < MAX_EV;
        if (s.userData.kind === 'hp') s.visible = !hpOn;
    });
}
function addPanel() { if (panelCount < MAX_PANELS) { panelCount++; refreshSprites(); refreshBuildPanel(); updateScore(); } }
function addBat() { if (countBat < MAX_BAT) { countBat++; refreshSprites(); refreshBuildPanel(); updateScore(); } }
function addEV() { if (countEV < MAX_EV) { countEV++; refreshSprites(); refreshBuildPanel(); updateScore(); } }
function addHP() { if (!hpOn) { hpOn = true; refreshSprites(); refreshBuildPanel(); updateScore(); } }
function resetSim() {
    panelCount = 0; balconyCount = 0; countBat = 0; countEV = 0; hpOn = false;
    OBSTACLES.forEach(o => { o.on = false; });
    OBSTACLES[0].h = 11; OBSTACLES[0].z = 11;
    OBSTACLES[1].h = 8;  OBSTACLES[1].z = 8;
    OBSTACLES.forEach(o => applyObstacleTransform(o));
    LOAD_SCALE = 1;
    batteryLevel = 0; carLevel = 0; waterTemp = 0;
    E.batKwh = 0; E.evKwh = 12; E.tankC = 18;
    E.dProd = E.dCons = E.dImp = E.dExp = E.dShadeLoss = 0; E.lastHour = -1;
    E.pvDc = E.pvAc = E.clipped = E.batFlow = E.evFlow = E.hpFlow = E.grid = 0;
    SIM.azimuthDeg = 0; SIM.tiltDeg = 18.3;
    const azEl = document.getElementById('simAzimuth'); if (azEl) azEl.value = '0';
    const tEl = document.getElementById('simTilt'); if (tEl) tEl.value = '18';
    const tv = document.getElementById('simTiltVal'); if (tv) tv.textContent = '18°';
    document.querySelectorAll('[data-obs]').forEach(cb => { cb.checked = false; });
    if (typeof applyRoofOrientation === 'function') applyRoofOrientation();
    refreshSprites(); refreshBuildPanel(); updateScore();
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

    // Çevre engelleri — OBSTACLES tablosuyla aynı konumda
    appObjs.obstacles = {};
    OBSTACLES.forEach(o => {
        const m = o.key === 'agac' ? buildTree(o) : buildNeighbourBuilding(o);
        m.userData.h0 = o.h;          // inşa anındaki yükseklik — ölçek referansı
        appScene.add(m); appObjs.obstacles[o.key] = m;
    });

    // Balkon (dikey paneller)
    appObjs.balcony = buildBalcony(); appScene.add(appObjs.balcony);

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
    applyRoofOrientation();
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
        appObjs.balcony.userData.tiles.forEach((t, i) => t.scale.lerp(V(i < balconyCount ? 1 : 0), 0.16));
        OBSTACLES.forEach(o => { const m = appObjs.obstacles[o.key]; if (m) m.visible = o.on; });
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
    const balkonKwp = balconyCount * SIM.balconyWp / 1000;

    E.ambT = ambientC(SIM.dayOfYear, dayTime, SIM.lat);

    // --- ÇATI DİZİSİ ---
    const ir = irradianceOn(SIM.dayOfYear, dayTime, SIM.lat, SIM.cloud, SIM.tiltDeg, SIM.azimuthDeg);
    E.poa = ir.poa;
    E.cellT = E.ambT + (SIM.noct - 20) / 800 * E.poa;      // NOCT modeli
    const tf = 1 + SIM.tempCoeff * (E.cellT - 25);

    // Dizi uyumsuzluğu: string inverterde bir panelin gölgelenmesi tüm dizeyi
    // düşürür. Kısmi gölgede kayıp, ışınım kaybından daha büyüktür — sahada
    // en çok şaşırtan gerçek budur.
    const uyumsuzluk = E.shade > 0.02 && E.shade < 0.98 ? (1 - 0.18 * (1 - Math.abs(2 * E.shade - 1))) : 1;

    let roofDc = arrayKwp * (E.poa / 1000) * tf * SIM.systemLoss * uyumsuzluk;
    if (roofDc < 0) roofDc = 0;

    // --- BALKON DİZİSİ (dikey) ---
    const irB = balkonKwp > 0
        ? irradianceOn(SIM.dayOfYear, dayTime, SIM.lat, SIM.cloud, SIM.balconyTilt, SIM.balconyAz)
        : { poa: 0 };
    E.poaBalcony = irB.poa;
    const cellB = E.ambT + (SIM.noct - 20) / 800 * E.poaBalcony;
    let balkonDc = balkonKwp * (E.poaBalcony / 1000) * (1 + SIM.tempCoeff * (cellB - 25)) * SIM.systemLoss;
    if (balkonDc < 0) balkonDc = 0;

    E.pvDc = roofDc + balkonDc;

    // İnverter: verim + tepe kırpma (balkon kendi mikro inverteriyle gelir,
    // kırpma yalnız çatı dizisinde olur)
    const invKw = Math.max(1.5, arrayKwp / SIM.dcAcRatio);
    const roofAcRaw = roofDc * SIM.invEff;
    E.roofKw = Math.min(roofAcRaw, invKw);
    E.clipped = Math.max(0, roofAcRaw - E.roofKw);
    E.balconyKw = balkonDc * SIM.invEff;
    E.pvAc = E.roofKw + E.balconyKw;
    prodKW = E.pvAc;

    // Gölgesiz senaryoyla fark: kullanıcıya "gölge sana kaça mal oluyor" der
    if (arrayKwp > 0 && ir.poaGolgesiz > ir.poa) {
        const golgesizDc = arrayKwp * (ir.poaGolgesiz / 1000) * tf * SIM.systemLoss;
        E.shadeLossKw = Math.max(0, Math.min(golgesizDc * SIM.invEff, invKw) - E.roofKw);
    } else E.shadeLossKw = 0;

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
    if (E.lastHour > saat) { E.dProd = E.dCons = E.dImp = E.dExp = E.dShadeLoss = 0; }
    E.lastHour = saat;
    E.dProd += E.pvAc * dtH;
    E.dShadeLoss += E.shadeLossKw * dtH;
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
    layoutColumns();
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
