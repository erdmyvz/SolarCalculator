/* ============================================================================
   sim3d.js — 3D TAM ENERJİ BAĞIMSIZLIĞI SİMÜLASYONU (Three.js r128)
   - Sadeleştirilmiş modern ev (tek kapı + tek pencere), düzeltilmiş çatı & panel yönü
   - Sahne içi 3D "+" butonları (etiketli, tıklanabilir) — bileşen ekleme (kademeli)
   - Güneş doğuş→batış döngüsü (otomatik + manuel kaydırıcı), gökyüzü/ışık/gölge değişir
   - Sıcak su deposu (güneşte mavi→kırmızı ısınır), batarya/araç dolumu
   - Animasyonlu şebeke hattı + sağda canlı enerji-akış paneli (ortada inverter)
   - "Sıfırla" düğmesi, otomatik dönüş KAPALI
   Not: index.html'deki alt buton çubuğu kaldırılır; sol "Bağımsızlık Skoru" kalır.
   ============================================================================ */

let appScene, appCamera, appRenderer, appControls, appObjs;
let panelCount = 0, countBat = 0, countEV = 0, hpOn = false;
let batteryLevel = 0, carLevel = 0, waterTemp = 0;
let prodKW = 0, gridFlow = 0, houseLoadKW = 0.4;
let dayTime = 12, autoDay = true;
let sprites = [];
const MAX_PANELS = 8, MAX_BAT = 4, MAX_EV = 2;

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
            <div class="bg-amber-500/20 border border-amber-400/40 rounded-lg p-2 text-center mb-3">
                <div class="text-[10px] text-amber-200 font-bold">☀️ ANLIK ÜRETİM</div>
                <div class="text-xl font-black text-amber-300"><span id="efProd">0.0</span> kW</div>
            </div>
            <div class="bg-white/15 rounded-lg py-1.5 text-center mb-3 font-black text-sm border border-white/20">🔌 İNVERTER</div>
            ${row('🔋 Batarya', 'efBat', true)}
            ${row('🚗 Araç', 'efCar', true)}
            ${row('♨️ Sıcak Su', 'efWater', true)}
            ${row('🏠 Ev', 'efHouse', false)}
            ${row('🔗 Şebeke', 'efGrid', false)}
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
            <input id="simTime" type="range" min="0" max="24" step="0.1" value="12" class="w-40 accent-amber-500">
        `;
        container.appendChild(cb);
        document.getElementById('simReset').addEventListener('click', resetSim);
        document.getElementById('simPlay').addEventListener('click', () => { autoDay = !autoDay; document.getElementById('simPlay').textContent = autoDay ? '⏸' : '▶'; });
        document.getElementById('simTime').addEventListener('input', (e) => { dayTime = parseFloat(e.target.value); autoDay = false; document.getElementById('simPlay').textContent = '▶'; updateClock(); });
    }
}

function updateClock() {
    const el = document.getElementById('simClock'); if (!el) return;
    const hh = Math.floor(dayTime), mm = Math.floor((dayTime - hh) * 60);
    const icon = (dayTime > 6 && dayTime < 18) ? '☀️' : '🌙';
    el.textContent = `${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const s = document.getElementById('simTime'); if (s && document.activeElement !== s) s.value = dayTime;
}

function updateEnergyPanel() {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const bar = (id, pct) => { const e = document.getElementById(id + 'Bar'); if (e) e.style.width = Math.round(pct) + '%'; };
    const line = (id, cls) => { const e = document.getElementById(id + 'Line'); if (e) e.className = 'ef-line mt-1' + (cls ? ' ' + cls : ''); };

    set('efProd', prodKW.toFixed(1));
    set('efBat', countBat > 0 ? Math.round(batteryLevel * 100) + '%' : 'yok');
    bar('efBat', countBat > 0 ? batteryLevel * 100 : 0);
    set('efCar', countEV > 0 ? Math.round(carLevel * 100) + '%' : 'yok');
    bar('efCar', countEV > 0 ? carLevel * 100 : 0);
    set('efWater', hpOn ? Math.round(20 + waterTemp * 40) + '°C' : 'yok');
    bar('efWater', hpOn ? waterTemp * 100 : 0);
    set('efHouse', houseLoadKW.toFixed(1) + ' kW');
    if (gridFlow > 0.05) set('efGrid', 'çekiliyor ' + gridFlow.toFixed(1) + ' kW');
    else if (gridFlow < -0.05) set('efGrid', 'veriliyor ' + (-gridFlow).toFixed(1) + ' kW');
    else set('efGrid', 'dengede');

    const charging = prodKW > houseLoadKW;
    line('efBat', countBat > 0 && charging && batteryLevel < 1 ? 'on' : (countBat > 0 && batteryLevel > 0 && !charging ? 'exp' : ''));
    line('efCar', countEV > 0 && charging && carLevel < 1 ? 'on' : '');
    line('efWater', hpOn && charging && waterTemp < 1 ? 'on' : '');
    line('efHouse', 'on');
    line('efGrid', gridFlow > 0.05 ? 'imp' : (gridFlow < -0.05 ? 'exp' : ''));
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

        if (autoDay) { dayTime += dt * (24 / 55); if (dayTime >= 24) dayTime -= 24; updateClock(); }

        // Güneş konumu / ışık / gökyüzü
        const dayFrac = Math.max(0, Math.min(1, (dayTime - 6) / 12));
        const az = dayFrac * Math.PI;
        const sunEl = (dayTime > 6 && dayTime < 18) ? Math.sin(az) : 0;
        const R = 42;
        appObjs.sun.position.set(Math.cos(az) * R * 0.85, Math.max(-6, sunEl * R * 0.7), 14 + (1 - sunEl) * 8);
        appObjs.sun.intensity = 0.05 + sunEl * 1.85;
        appObjs.sunOrb.position.copy(appObjs.sun.position).multiplyScalar(0.85);
        appObjs.sunOrb.visible = sunEl > 0.02;
        appObjs.sunOrb.material.color.setRGB(1, 0.78 + sunEl * 0.2, 0.55 + sunEl * 0.35);
        const sky = lerpStops(sunEl, SKY_STOPS);
        appScene.background = sky; appScene.fog.color.copy(sky);
        appObjs.hemi.intensity = 0.28 + sunEl * 0.5;
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

        // Enerji modeli
        stepEnergy(dt, sunEl);

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
        if (acc > 0.15) { acc = 0; updateEnergyPanel(); }
    }
    animate();
};

function stepEnergy(dt, sunEl) {
    prodKW = sunEl * panelCount * 0.45;
    const carCharging = countEV > 0 && carLevel < 1 && sunEl > 0.05;
    const hpHeating = hpOn && waterTemp < 1 && sunEl > 0.05;
    let demand = houseLoadKW + (carCharging ? 1.0 * countEV : 0) + (hpHeating ? 0.8 : 0);
    let net = prodKW - demand;
    const r = dt * 0.05;

    if (net >= 0) {
        if (countBat > 0 && batteryLevel < 1) { batteryLevel = Math.min(1, batteryLevel + r * (net / Math.max(0.5, countBat))); }
        gridFlow = (countBat === 0 || batteryLevel >= 1) ? -net : 0; // batarya doluysa/yoksa fazlayı ver
    } else {
        if (countBat > 0 && batteryLevel > 0) {
            batteryLevel = Math.max(0, batteryLevel - r * (-net / Math.max(0.5, countBat)));
            gridFlow = batteryLevel <= 0 ? -net : 0;
        } else gridFlow = -net; // şebekeden çek
    }
    if (carCharging) carLevel = Math.min(1, carLevel + r * 1.0);
    if (hpHeating) waterTemp = Math.min(1, waterTemp + r * 0.8);
    if (!hpHeating && waterTemp > 0) waterTemp = Math.max(0, waterTemp - dt * 0.004);
}

function onWindowResize3D() {
    const c = document.getElementById('three-canvas-container');
    if (!c || !appRenderer || !appCamera) return;
    const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
    appCamera.aspect = w / h; appCamera.updateProjectionMatrix(); appRenderer.setSize(w, h);
}

function updateScore() {
    let score = 0, grid = 100, carbon = "Yüksek Düzeyde", fossil = "Aktif Kullanımda";
    if (panelCount > 0) { score += 30; grid -= 30; carbon = "Orta Düzeyde"; }
    score += countBat * 10; grid -= countBat * 15;
    if (countBat > 0 && panelCount > 0) carbon = "Düşük";
    score += countEV * 10; if (countEV > 0) carbon = "Sıfıra Yakın";
    if (hpOn) { score += 20; grid = Math.max(0, grid - 20); fossil = "İPTAL EDİLDİ"; carbon = "NET ZERO (Sıfır Karbon)"; }
    score = Math.max(0, Math.min(100, score)); grid = Math.max(0, grid);

    const sEl = document.getElementById('scoreDisplay'), gEl = document.getElementById('gridDepDisplay'), fEl = document.getElementById('fossilDisplay'), cEl = document.getElementById('carbonDisplay');
    if (sEl) sEl.innerText = "%" + score;
    if (gEl) gEl.innerText = "%" + grid;
    if (fEl) fEl.innerText = fossil;
    if (cEl) cEl.innerText = carbon;
    if (sEl) {
        sEl.className = "text-xs px-2 py-1 rounded text-white font-bold transition-colors duration-500 shadow";
        if (score < 30) sEl.classList.add('bg-red-500');
        else if (score < 70) sEl.classList.add('bg-orange-500');
        else if (score < 100) sEl.classList.add('bg-emerald-500');
        else sEl.classList.add('bg-emerald-600');
    }
}
