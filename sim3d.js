/* ============================================================================
   9. 3D Mimari ve Enerji Bağımsızlık Simülasyonu (Three.js)
   Bölünmüş modül dosyası. index.html'de core.js'ten sonra, ORİJİNAL SIRAYLA
   yüklenmelidir. Klasik script olduğu için tüm fonksiyonlar küresel kalır.
   ============================================================================ */

// ============================================================================
// 9. 3D MİMARİ VE ENERJİ BAĞIMSIZLIK SİMÜLASYONU (Three.js Motoru)
// ============================================================================
let appScene, appCamera, appRenderer, appControls, appObjs;
let stateGES = false, stateHP = false;
let countBat = 0, countEV = 0;
let currentGrid = 100;

function createEcoSystem(scene) {
    const objs = {};

    // Zemin ve Ev
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x65a30d }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    const house = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 6), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
    house.position.set(-2, 2.25, 0); house.castShadow = true; house.receiveShadow = true; scene.add(house);
    
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.5, 6.5), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    roof.position.set(-2, 5.50, 0); roof.rotation.z = -0.25; roof.castShadow = true; scene.add(roof);

    // Carport (Otopark)
    const cpMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), cpMat); p1.position.set(7.5, 2, 3); p1.castShadow=true; scene.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), cpMat); p2.position.set(7.5, 2, -3); p2.castShadow=true; scene.add(p2);
    const cpRoof = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 7), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, transparent:true, opacity:0.8 }));
    cpRoof.position.set(4.8, 4, 0); cpRoof.castShadow=true; scene.add(cpRoof);

    // Şebeke Direği ve Kablosu
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 10, 16), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
    pole.position.set(-12, 5, -5); pole.castShadow = true; scene.add(pole);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.5), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
    crossbar.position.set(-12, 9, -5); scene.add(crossbar);

    const cableCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-12, 9, -5), new THREE.Vector3(-9, 6.5, -2.5), new THREE.Vector3(-6, 4.5, 0));
    const cableGeo = new THREE.BufferGeometry().setFromPoints(cableCurve.getPoints(20));
    objs.gridCableMat = new THREE.LineDashedMaterial({ color: 0xef4444, linewidth: 2, dashSize: 0.4, gapSize: 0.3, transparent: true });
    objs.gridCable = new THREE.Line(cableGeo, objs.gridCableMat);
    objs.gridCable.computeLineDistances(); scene.add(objs.gridCable);

    // Doğalgaz Hattı (Isı Pompası Yokken Aktif)
    objs.gasPipe = new THREE.Group();
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5), new THREE.MeshStandardMaterial({ color: 0xfacc15 })); pipe.position.set(0, 1.25, 0); 
    const meterBox = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x9ca3af })); meterBox.position.set(0, 2.5, 0.15); 
    objs.gasPipe.add(pipe); objs.gasPipe.add(meterBox); objs.gasPipe.position.set(-5.5, 0, 3.2); scene.add(objs.gasPipe);

    // Isı Pompası
    objs.hp = new THREE.Group();
    const hpBody = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x475569 })); hpBody.position.set(0, 0.9, 0);
    const hpFan = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.85, 16), new THREE.MeshStandardMaterial({ color: 0x0f172a })); hpFan.rotation.x = Math.PI/2; hpFan.position.set(0, 0.9, 0.4); 
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.2, 16), new THREE.MeshStandardMaterial({color: 0xe2e8f0})); boiler.position.set(1.2, 1.1, 0); 
    objs.hp.add(hpBody); objs.hp.add(hpFan); objs.hp.add(boiler); objs.hp.position.set(-3.5, 0, 3.6); objs.hp.scale.set(0,0,0); scene.add(objs.hp);

    // Güneş Panelleri
    objs.panels = new THREE.Group();
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x020617, metalness: 0.9, roughness: 0.1 });
    for(let x=0; x<3; x++) { 
        for(let z=0; z<2; z++) { 
            const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 2.8), panelMat); 
            p.position.set(-2.5 + (x*2.4), 0, -1.5 + (z*3)); 
            objs.panels.add(p); 
        } 
    }
    objs.panels.position.set(-2, 5.95, 0); objs.panels.rotation.z = -0.25; objs.panels.scale.set(0,0,0); scene.add(objs.panels);

    // İnverter (Evirici)
    objs.inverterGroup = new THREE.Group();
    const inverter = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.3), new THREE.MeshStandardMaterial({ color: 0xcbd5e1 })); 
    inverter.position.set(-5.2, 3.5, -3.2); 
    const solarCable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5), new THREE.MeshStandardMaterial({ color: 0x1f2937 })); 
    solarCable.position.set(-5.2, 4.85, -3.2); 
    objs.inverterGroup.add(inverter); objs.inverterGroup.add(solarCable); objs.inverterGroup.scale.set(0,0,0); scene.add(objs.inverterGroup);

    // Bataryalar
    objs.batteries = [];
    for(let i=0; i<4; i++) {
        const bat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.6), new THREE.MeshStandardMaterial({ color: 0xf1f5f9 }));
        bat.position.set(-0.5 - (i * 1.2), 1.1, -3.3); 
        bat.castShadow = true; bat.scale.set(0,0,0);
        scene.add(bat); objs.batteries.push(bat);
    }

    // Elektrikli Araçlar (EV)
    objs.evs = [];
    for(let i=0; i<2; i++) {
        const ev = new THREE.Group();
        const cBody = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.1, 1.8), new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness:0.4 })); cBody.position.y = 0.85; cBody.castShadow = true;
        const cTop = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 1.6), new THREE.MeshStandardMaterial({ color: 0x1e293b })); cTop.position.set(-0.4, 1.7, 0); cTop.castShadow = true;
        ev.add(cBody); ev.add(cTop);
        const wMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
        const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2, 16), wMat); w1.rotation.x = Math.PI/2; w1.position.set(-1.1, 0.4, 0);
        const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2, 16), wMat); w2.rotation.x = Math.PI/2; w2.position.set(1.2, 0.4, 0);
        ev.add(w1); ev.add(w2); ev.position.set(4.5, 0, -1.5 + (i*3)); ev.scale.set(0,0,0);
        scene.add(ev); objs.evs.push(ev);
    }
    return objs;
}

window.initApp3DScene = function() {
    const container = document.getElementById('three-canvas-container');
    if (!container || appScene) return;

    appScene = new THREE.Scene();
    appScene.background = new THREE.Color(0x0f172a); 
    appCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    appCamera.position.set(22, 16, 28); 

    appRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    appRenderer.setSize(container.clientWidth, container.clientHeight);
    appRenderer.shadowMap.enabled = true;
    appRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    appRenderer.domElement.style.position = 'absolute';
    container.appendChild(appRenderer.domElement);

    appControls = new THREE.OrbitControls(appCamera, appRenderer.domElement);
    appControls.enableDamping = true; appControls.dampingFactor = 0.05;
    appControls.maxPolarAngle = Math.PI / 2 - 0.05;

    appScene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.5);
    sunLight.position.set(15, 30, 15); sunLight.castShadow = true;
    appScene.add(sunLight);

    appObjs = createEcoSystem(appScene);
    const loadingEl = document.getElementById('loading3D');
    if(loadingEl) loadingEl.style.display = 'none';

    document.getElementById('btnSimGES')?.addEventListener('click', (e) => { stateGES = !stateGES; e.target.classList.toggle('bg-emerald-600'); updateAppScore(); });
    document.getElementById('btnSimHP')?.addEventListener('click', (e) => { stateHP = !stateHP; e.target.classList.toggle('bg-emerald-600'); updateAppScore(); });
    document.getElementById('btnSimBatPlus')?.addEventListener('click', () => { if(countBat < 4) { countBat++; updateAppScore(); }});
    document.getElementById('btnSimBatMinus')?.addEventListener('click', () => { if(countBat > 0) { countBat--; updateAppScore(); }});
    document.getElementById('btnSimEVPlus')?.addEventListener('click', () => { if(countEV < 2) { countEV++; updateAppScore(); }});
    document.getElementById('btnSimEVMinus')?.addEventListener('click', () => { if(countEV > 0) { countEV--; updateAppScore(); }});

    function animate() {
        requestAnimationFrame(animate);
        if (appObjs) {
            appObjs.panels.scale.lerp(new THREE.Vector3(stateGES?1:0, stateGES?1:0, stateGES?1:0), 0.1);
            appObjs.inverterGroup.scale.lerp(new THREE.Vector3(stateGES?1:0, stateGES?1:0, stateGES?1:0), 0.1);
            appObjs.hp.scale.lerp(new THREE.Vector3(stateHP?1:0, stateHP?1:0, stateHP?1:0), 0.1);
            appObjs.gasPipe.scale.lerp(new THREE.Vector3(stateHP?0:1, stateHP?0:1, stateHP?0:1), 0.1);
            appObjs.batteries.forEach((b, i) => b.scale.lerp(new THREE.Vector3(i<countBat?1:0, i<countBat?1:0, i<countBat?1:0), 0.1));
            appObjs.evs.forEach((v, i) => v.scale.lerp(new THREE.Vector3(i<countEV?1:0, i<countEV?1:0, i<countEV?1:0), 0.1));
            
            // Animasyon Düzeltildi
            if(appObjs.gridCableMat) {
                const pulse = 0.55 + Math.sin(Date.now() * 0.004) * 0.35;
                appObjs.gridCableMat.opacity = Math.max(0.2, Math.min(1, pulse));
            }
            if(appObjs.gridCable) {
                appObjs.gridCable.visible = currentGrid > 0;
                appObjs.gridCableMat.color.setHex(currentGrid > 50 ? 0xef4444 : 0x0ea5e9);
            }
        }
        appControls.update();
        appRenderer.render(appScene, appCamera);
    }
    animate();
}

function updateAppScore() {
    let score = 0; let grid = 100; let carbon = "Yüksek"; let fossil = "Aktif Kullanımda";
    
    if(document.getElementById('batCountDisplay')) document.getElementById('batCountDisplay').innerText = countBat;
    if(document.getElementById('evCountDisplay')) document.getElementById('evCountDisplay').innerText = countEV;
    
    if (stateGES) { score += 30; grid -= 30; carbon = "Orta Düzeyde"; }
    score += countBat * 10; grid -= countBat * 15;
    if (countBat > 0 && stateGES) carbon = "Düşük";
    score += countEV * 10;
    if (countEV > 0) carbon = "Sıfıra Yakın";
    if (stateHP) { score += 20; grid = Math.max(0, grid - 20); fossil = "İPTAL EDİLDİ"; carbon = "NET ZERO (Sıfır Karbon)"; }

    currentGrid = Math.max(0, grid);
    
    if(document.getElementById('scoreDisplay')) document.getElementById('scoreDisplay').innerText = "%" + score;
    if(document.getElementById('gridDepDisplay')) document.getElementById('gridDepDisplay').innerText = "%" + currentGrid;
    if(document.getElementById('fossilDisplay')) document.getElementById('fossilDisplay').innerText = fossil;
    if(document.getElementById('carbonDisplay')) document.getElementById('carbonDisplay').innerText = carbon;

    const sColor = document.getElementById('scoreDisplay');
    if(sColor) {
        sColor.className = "text-xs px-2 py-1 rounded text-white font-bold transition-colors duration-500 shadow";
        if(score < 30) sColor.classList.add('bg-red-500');
        else if(score < 70) sColor.classList.add('bg-orange-500');
        else if(score < 100) sColor.classList.add('bg-emerald-500');
        else sColor.classList.add('bg-emerald-600', 'animate-pulse');
    }
}
