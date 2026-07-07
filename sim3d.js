/* ============================================================================
   sim3d.js — 3D ENERJİ BAĞIMSIZLIK SİMÜLASYONU (profesyonel yeniden yazım)
   Three.js r128 + OrbitControls (global) ile uyumludur. index.html'deki mevcut
   buton/gösterge kimliklerini korur: yalnızca sahne yeniden yazıldı.
   Butonlar: btnSimGES, btnSimHP, btnSimBat[Plus/Minus], btnSimEV[Plus/Minus]
   Göstergeler: scoreDisplay, gridDepDisplay, fossilDisplay, carbonDisplay
   Sayaçlar: batCountDisplay, evCountDisplay | Kap: three-canvas-container
   ============================================================================ */

let appScene, appCamera, appRenderer, appControls, appObjs;
let stateGES = false, stateHP = false;
let countBat = 0, countEV = 0;
let currentGrid = 100;
const MAX_BAT = 4, MAX_EV = 2;

function mat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.7, metalness: 0.05 }, opts || {}));
}

function makeGradientTexture() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#0b1526');
    g.addColorStop(0.55, '#1c2b45');
    g.addColorStop(1, '#324a63');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
}

// --- Modern ev + çatı üstü güneş sistemi ---
function buildHouse(scene) {
    const o = {};
    const g = new THREE.Group();

    const wallMat = mat(0xEDE6DA, { roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 4.2, 6), wallMat);
    body.position.set(0, 2.1, 0); body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    const base = new THREE.Mesh(new THREE.BoxGeometry(8.15, 0.5, 6.15), mat(0x3a4150, { roughness: 0.9 }));
    base.position.set(0, 0.25, 0); base.castShadow = true; base.receiveShadow = true;
    g.add(base);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.35, 6.2), mat(0x2b3240, { roughness: 0.85 }));
    roof.position.set(0, 4.35, 0); roof.castShadow = true; roof.receiveShadow = true;
    g.add(roof);
    const parapetMat = mat(0xDCD5C8, { roughness: 0.85 });
    [[0, 4.6, 3.0, 8.2, 0.5, 0.2], [0, 4.6, -3.0, 8.2, 0.5, 0.2], [4.0, 4.6, 0, 0.2, 0.5, 6.2], [-4.0, 4.6, 0, 0.2, 0.5, 6.2]]
        .forEach(p => { const m = new THREE.Mesh(new THREE.BoxGeometry(p[3], p[4], p[5]), parapetMat); m.position.set(p[0], p[1], p[2]); m.castShadow = true; g.add(m); });

    const glass = mat(0x11263a, { roughness: 0.12, metalness: 0.35 });
    const frameMat = mat(0x2b3240, { roughness: 0.6 });
    function window3(x, y, z, wd, ht, rotY) {
        const grp = new THREE.Group();
        const fr = new THREE.Mesh(new THREE.BoxGeometry(wd + 0.18, ht + 0.18, 0.12), frameMat);
        const gl = new THREE.Mesh(new THREE.BoxGeometry(wd, ht, 0.16), glass);
        grp.add(fr); grp.add(gl); grp.position.set(x, y, z); grp.rotation.y = rotY || 0;
        g.add(grp); return grp;
    }
    window3(-2.2, 2.6, 3.02, 1.4, 1.2);
    window3(2.2, 2.6, 3.02, 1.4, 1.2);
    window3(2.2, 1.1, 3.02, 1.4, 0.9);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.16), mat(0x1f2530, { roughness: 0.5 }));
    door.position.set(-2.2, 1.1, 3.02); g.add(door);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 12), mat(0xcaa15a, { metalness: 0.7, roughness: 0.3 }));
    handle.position.set(-1.75, 1.1, 3.12); g.add(handle);
    window3(4.02, 2.6, 1.4, 1.3, 1.1, Math.PI / 2);
    window3(4.02, 2.6, -1.4, 1.3, 1.1, Math.PI / 2);

    scene.add(g);
    o.house = g;

    // --- Çatı üstü güneş panelleri ---
    o.panels = new THREE.Group();
    const panelMat = mat(0x0a1a3a, { roughness: 0.25, metalness: 0.5 });
    const cellLine = mat(0x16305e, { roughness: 0.3, metalness: 0.4 });
    const railMat = mat(0x9aa3ad, { metalness: 0.6, roughness: 0.4 });
    const cols = 4, rows = 2;
    const pw = 1.5, pd = 1.9, tilt = 0.22;
    const startX = -((cols - 1) * (pw + 0.15)) / 2;
    const startZ = -((rows - 1) * (pd + 0.25)) / 2;
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const tile = new THREE.Group();
            const frame = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.06, pd), railMat);
            const glassP = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.12, 0.07, pd - 0.12), panelMat);
            glassP.position.y = 0.02;
            for (let k = -1; k <= 1; k++) {
                const line = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.12, 0.075, 0.03), cellLine);
                line.position.set(0, 0.021, k * (pd / 3));
                tile.add(line);
            }
            tile.add(frame); tile.add(glassP);
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), railMat);
            leg.position.set(0, -0.2, -pd / 2 + 0.15); tile.add(leg);
            tile.rotation.x = -tilt;
            tile.position.set(startX + i * (pw + 0.15), 0.45, startZ + j * (pd + 0.25));
            tile.traverse(m => { if (m.isMesh) m.castShadow = true; });
            o.panels.add(tile);
        }
    }
    o.panels.position.set(0, 4.35, 0);
    o.panels.scale.set(0, 0, 0);
    scene.add(o.panels);

    // --- İnverter (yan duvar +x) ---
    o.inverter = new THREE.Group();
    const inv = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.0, 0.65), mat(0xF2F4F6, { roughness: 0.5 }));
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.34), new THREE.MeshStandardMaterial({ color: 0x0a2a3a, emissive: 0x123b4d, emissiveIntensity: 0.8, roughness: 0.3 }));
    screen.position.set(0.14, 0.18, 0);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.2 }));
    led.position.set(0.14, -0.28, 0.18);
    o.inverter.add(inv); o.inverter.add(screen); o.inverter.add(led);
    o.inverter.position.set(4.18, 2.4, 1.9);
    o.inverter.traverse(m => { if (m.isMesh) m.castShadow = true; });
    o.inverter.scale.set(0, 0, 0);
    scene.add(o.inverter);

    // --- Bataryalar (yan duvar +x) ---
    o.batteries = [];
    const batMat = mat(0x20262f, { roughness: 0.4, metalness: 0.3 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xF59E0B, emissive: 0x7a4d05, emissiveIntensity: 0.5, roughness: 0.4 });
    for (let i = 0; i < MAX_BAT; i++) {
        const bgrp = new THREE.Group();
        const cell = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.85), batMat);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.85), accent);
        strip.position.y = 0.45;
        bgrp.add(cell); bgrp.add(strip);
        bgrp.position.set(4.2, 1.05, 0.4 - i * 1.0);
        bgrp.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        bgrp.scale.set(0, 0, 0);
        scene.add(bgrp); o.batteries.push(bgrp);
    }

    return o;
}

function buildHeatPump() {
    const g = new THREE.Group();
    const bodyMat = mat(0x4b5563, { roughness: 0.5, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.15, 0.7), bodyMat);
    body.position.y = 0.75; body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 28), mat(0x1f2937, { roughness: 0.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.8, 0.37); g.add(ring);
    const fan = new THREE.Group();
    for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.14), mat(0x9ca3af, { roughness: 0.5 }));
        blade.rotation.y = (i * Math.PI) / 2;
        fan.add(blade);
    }
    fan.position.set(0, 0.8, 0.4); fan.rotation.x = Math.PI / 2; g.add(fan);
    g.userData.fan = fan;
    [-0.6, 0.6].forEach(x => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), bodyMat); f.position.set(x, 0.17, 0); g.add(f); });
    g.position.set(5.6, 0, 2.4);
    g.scale.set(0, 0, 0);
    return g;
}

function buildGasMeter() {
    const g = new THREE.Group();
    const meter = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.4), mat(0xEAB308, { roughness: 0.6 }));
    meter.position.set(0, 1.6, 0.2); meter.castShadow = true; g.add(meter);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 14), mat(0x9ca3af, { metalness: 0.5, roughness: 0.4 }));
    pipe.position.set(0, 0.6, 0); g.add(pipe);
    const pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 14), mat(0x9ca3af, { metalness: 0.5, roughness: 0.4 }));
    pipe2.rotation.z = Math.PI / 2; pipe2.position.set(0.25, 1.3, 0.2); g.add(pipe2);
    g.position.set(4.15, 0, 3.6);
    return g;
}

function buildEV(color) {
    const g = new THREE.Group();
    const bodyMat = mat(color, { metalness: 0.55, roughness: 0.35 });
    const lower = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.85, 1.95), bodyMat);
    lower.position.y = 0.78; lower.castShadow = true; lower.receiveShadow = true; g.add(lower);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.3, 2.0), mat(0x1a1f27, { roughness: 0.7 }));
    skirt.position.y = 0.42; g.add(skirt);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.72, 1.78), bodyMat);
    cabin.position.set(-0.15, 1.5, 0); cabin.castShadow = true; g.add(cabin);
    const glass = mat(0x0e1a26, { roughness: 0.15, metalness: 0.4 });
    const wind = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.6, 1.82), glass);
    wind.position.set(-0.15, 1.5, 0); g.add(wind);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 1.7), bodyMat);
    roof.position.set(-0.15, 1.83, 0); g.add(roof);
    const hl = new THREE.MeshStandardMaterial({ color: 0xfff6da, emissive: 0xffe9a8, emissiveIntensity: 0.9, roughness: 0.3 });
    [-0.7, 0.7].forEach(z => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.4), hl); l.position.set(2.0, 0.85, z); g.add(l); });
    const tl = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x991b1b, emissiveIntensity: 0.7, roughness: 0.3 });
    [-0.7, 0.7].forEach(z => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.4), tl); l.position.set(-2.0, 0.9, z); g.add(l); });
    const tyre = mat(0x0f1114, { roughness: 0.85 });
    const rim = mat(0xcbd5e1, { metalness: 0.7, roughness: 0.3 });
    [[1.25, 0.95], [1.25, -0.95], [-1.25, 0.95], [-1.25, -0.95]].forEach(p => {
        const wgrp = new THREE.Group();
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.32, 22), tyre);
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.34, 16), rim);
        t.rotation.x = Math.PI / 2; r.rotation.x = Math.PI / 2;
        wgrp.add(t); wgrp.add(r); wgrp.position.set(p[0], 0.46, p[1]); wgrp.castShadow = true;
        g.add(wgrp);
    });
    return g;
}

function buildGrid(scene) {
    const o = {};
    const poleMat = mat(0x6b5644, { roughness: 0.8 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 9, 16), poleMat);
    pole.position.set(-11, 4.5, -4); pole.castShadow = true; scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 2.6), poleMat);
    arm.position.set(-11, 8.2, -4); scene.add(arm);
    [-1, 1].forEach(s => { const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 10), mat(0x2b3240)); ins.position.set(-11, 8.4, -4 + s * 1.0); scene.add(ins); });

    const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-11, 8.4, -3.0),
        new THREE.Vector3(-7, 6.2, -1.5),
        new THREE.Vector3(-4, 4.4, 0)
    );
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
    o.cableMat = new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.9 });
    o.cable = new THREE.Line(geo, o.cableMat);
    scene.add(o.cable);
    return o;
}

window.initApp3DScene = function () {
    const container = document.getElementById('three-canvas-container');
    if (!container || appScene) return;

    appScene = new THREE.Scene();
    appScene.background = makeGradientTexture();
    appScene.fog = new THREE.Fog(0x2a3d52, 34, 95);

    const w = container.clientWidth || 800, h = container.clientHeight || 500;
    appCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    appCamera.position.set(15, 10, 17);

    appRenderer = new THREE.WebGLRenderer({ antialias: true });
    appRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    appRenderer.setSize(w, h);
    appRenderer.shadowMap.enabled = true;
    appRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.sRGBEncoding) appRenderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping) { appRenderer.toneMapping = THREE.ACESFilmicToneMapping; appRenderer.toneMappingExposure = 1.15; }
    appRenderer.domElement.style.position = 'absolute';
    appRenderer.domElement.style.inset = '0';
    container.appendChild(appRenderer.domElement);

    appScene.add(new THREE.HemisphereLight(0xbcd2f0, 0x2b2f38, 0.65));
    const sun = new THREE.DirectionalLight(0xfff2df, 1.7);
    sun.position.set(14, 22, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048; sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 70;
    sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
    sun.shadow.bias = -0.0004;
    appScene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fb4d6, 0.35);
    fill.position.set(-12, 8, -6); appScene.add(fill);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mat(0x39414f, { roughness: 0.95, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; appScene.add(ground);
    const grid = new THREE.GridHelper(120, 60, 0x2a3140, 0x2a3140);
    grid.material.transparent = true; grid.material.opacity = 0.25; grid.position.y = 0.01; appScene.add(grid);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 8), mat(0x2f3540, { roughness: 0.9 }));
    pad.position.set(1, 0.04, 7); pad.receiveShadow = true; appScene.add(pad);

    const house = buildHouse(appScene);
    const gridObj = buildGrid(appScene);
    appObjs = Object.assign({}, house, gridObj);

    appObjs.hp = buildHeatPump(); appScene.add(appObjs.hp);
    appObjs.gas = buildGasMeter(); appScene.add(appObjs.gas);

    appObjs.evs = [];
    const evColors = [0x2b3a4a, 0xb0b8c0];
    for (let i = 0; i < MAX_EV; i++) {
        const ev = buildEV(evColors[i % evColors.length]);
        ev.position.set(-1.6 + i * 3.4, 0, 7);
        ev.rotation.y = Math.PI / 2;
        ev.scale.set(0, 0, 0);
        appScene.add(ev); appObjs.evs.push(ev);
    }

    appControls = new THREE.OrbitControls(appCamera, appRenderer.domElement);
    appControls.enableDamping = true; appControls.dampingFactor = 0.06;
    appControls.enablePan = false;
    appControls.minDistance = 12; appControls.maxDistance = 42;
    appControls.maxPolarAngle = Math.PI / 2 - 0.04;
    appControls.autoRotate = true; appControls.autoRotateSpeed = 0.55;
    appControls.target.set(0, 2.6, 0);
    appControls.update();

    const loadingEl = document.getElementById('loading3D');
    if (loadingEl) loadingEl.style.display = 'none';

    function toggleBtn(el, on) {
        if (!el) return;
        el.classList.toggle('bg-emerald-600', on);
        el.classList.toggle('border-emerald-400', on);
        el.classList.toggle('bg-indigo-600', !on);
        el.classList.toggle('border-indigo-400', !on);
    }
    const bGES = document.getElementById('btnSimGES');
    const bHP = document.getElementById('btnSimHP');
    if (bGES) bGES.addEventListener('click', () => { stateGES = !stateGES; toggleBtn(bGES, stateGES); updateAppScore(); });
    if (bHP) bHP.addEventListener('click', () => { stateHP = !stateHP; toggleBtn(bHP, stateHP); updateAppScore(); });
    document.getElementById('btnSimBatPlus')?.addEventListener('click', () => { if (countBat < MAX_BAT) { countBat++; updateAppScore(); } });
    document.getElementById('btnSimBatMinus')?.addEventListener('click', () => { if (countBat > 0) { countBat--; updateAppScore(); } });
    document.getElementById('btnSimEVPlus')?.addEventListener('click', () => { if (countEV < MAX_EV) { countEV++; updateAppScore(); } });
    document.getElementById('btnSimEVMinus')?.addEventListener('click', () => { if (countEV > 0) { countEV--; updateAppScore(); } });

    window.addEventListener('resize', onWindowResize3D);

    const V = (t) => new THREE.Vector3(t, t, t);
    let frame = 0;
    function animate() {
        requestAnimationFrame(animate);
        frame++;
        if (appObjs) {
            appObjs.panels.scale.lerp(V(stateGES ? 1 : 0), 0.12);
            appObjs.inverter.scale.lerp(V(stateGES ? 1 : 0), 0.12);
            appObjs.hp.scale.lerp(V(stateHP ? 1 : 0), 0.12);
            appObjs.gas.scale.lerp(V(stateHP ? 0 : 1), 0.12);
            appObjs.batteries.forEach((b, i) => b.scale.lerp(V(i < countBat ? 1 : 0), 0.14));
            appObjs.evs.forEach((v, i) => v.scale.lerp(V(i < countEV ? 1 : 0), 0.14));

            if (appObjs.hp.userData.fan && stateHP) appObjs.hp.userData.fan.rotation.z += 0.35;

            if (appObjs.cableMat) {
                const pulse = 0.55 + Math.sin(frame * 0.06) * 0.35;
                appObjs.cableMat.opacity = currentGrid > 0 ? Math.max(0.15, Math.min(1, pulse)) : 0.05;
                appObjs.cableMat.color.setHex(currentGrid > 50 ? 0xef4444 : (currentGrid > 0 ? 0x38bdf8 : 0x22c55e));
            }
        }
        appControls.update();
        appRenderer.render(appScene, appCamera);
    }
    animate();
    updateAppScore();
};

function onWindowResize3D() {
    const container = document.getElementById('three-canvas-container');
    if (!container || !appRenderer || !appCamera) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    appCamera.aspect = w / h;
    appCamera.updateProjectionMatrix();
    appRenderer.setSize(w, h);
}

function updateAppScore() {
    let score = 0, grid = 100, carbon = "Yüksek Düzeyde", fossil = "Aktif Kullanımda";

    const batEl = document.getElementById('batCountDisplay'); if (batEl) batEl.innerText = countBat;
    const evEl = document.getElementById('evCountDisplay'); if (evEl) evEl.innerText = countEV;

    if (stateGES) { score += 30; grid -= 30; carbon = "Orta Düzeyde"; }
    score += countBat * 10; grid -= countBat * 15;
    if (countBat > 0 && stateGES) carbon = "Düşük";
    score += countEV * 10;
    if (countEV > 0) carbon = "Sıfıra Yakın";
    if (stateHP) { score += 20; grid = Math.max(0, grid - 20); fossil = "İPTAL EDİLDİ"; carbon = "NET ZERO (Sıfır Karbon)"; }

    score = Math.max(0, Math.min(100, score));
    currentGrid = Math.max(0, grid);

    const sEl = document.getElementById('scoreDisplay');
    const gEl = document.getElementById('gridDepDisplay');
    const fEl = document.getElementById('fossilDisplay');
    const cEl = document.getElementById('carbonDisplay');
    if (sEl) sEl.innerText = "%" + score;
    if (gEl) gEl.innerText = "%" + currentGrid;
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
