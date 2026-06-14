// ==========================================
// 1. SUPABASE BAĞLANTISI
// ==========================================
const SUPABASE_URL = 'https://bxcghdbrafzudiigeeud.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_EiDGhm4bT-acQ8xrV9RU4w_4wkUQGys'; 

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUserProfile = null;

// ==========================================
// 2. EMAILJS BAĞLANTISI
// ==========================================
emailjs.init("qrBU4c3EChsaZhBZS");

// ==========================================
// SEKMELER VE AUTH GEÇİŞLERİ
// ==========================================
const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

tabLogin.addEventListener('click', () => {
    loginForm.classList.remove('hidden'); registerForm.classList.add('hidden');
    tabLogin.classList.add('text-blue-600', 'border-b-2', 'border-blue-600'); tabLogin.classList.remove('text-gray-400');
    tabRegister.classList.add('text-gray-400'); tabRegister.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
});

tabRegister.addEventListener('click', () => {
    registerForm.classList.remove('hidden'); loginForm.classList.add('hidden');
    tabRegister.classList.add('text-blue-600', 'border-b-2', 'border-blue-600'); tabRegister.classList.remove('text-gray-400');
    tabLogin.classList.add('text-gray-400'); tabLogin.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
});

// Kayıt İşlemi
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnRegisterSubmit');
    btn.textContent = "Kaydediliyor..."; btn.disabled = true;

    const name = document.getElementById('regName').value;
    const surname = document.getElementById('regSurname').value;
    const company = document.getElementById('regCompany').value;
    const phone = document.getElementById('regPhone').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    const { data, error } = await supabaseClient.auth.signUp({ email: email, password: password });

    if (error) { alert("Kayıt Hatası: " + error.message); btn.textContent = "Hesap Oluştur"; btn.disabled = false; return; }

    if (data.user) {
        const userRole = (email === 'erdem.yvz@hotmail.com') ? 'admin' : 'user';
        const { error: dbError } = await supabaseClient.from('profiles').insert([{ id: data.user.id, first_name: name, last_name: surname, company_name: company, phone: phone, role: userRole }]);
        
        if (dbError) { alert("Veritabanı hatası!"); } 
        else { alert("Kayıt Başarılı! E-postanıza gönderilen onay linkine tıklayın."); registerForm.reset(); tabLogin.click(); }
    }
    btn.textContent = "Hesap Oluştur"; btn.disabled = false;
});

// Giriş İşlemi
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnLoginSubmit');
    btn.textContent = "Giriş Yapılıyor..."; btn.disabled = true;

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value,
    });

    if (error) { alert("Giriş Başarısız: E-postanızı onayladığınızdan emin olun."); btn.textContent = "Sisteme Giriş Yap"; btn.disabled = false; return; }
    if (data.user) fetchUserProfile(data.user.id, data.user.email);
});

// Profil Yükleme
async function fetchUserProfile(userId, displayEmail) {
    const { data } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    if (data) {
        currentUserProfile = data;
        document.getElementById('userNameDisplay').textContent = `${data.first_name} ${data.last_name}`;
        document.getElementById('userCompanyDisplay').textContent = data.company_name;
        document.getElementById('userEmailDisplay').textContent = displayEmail;
        document.getElementById('userInitials').textContent = data.first_name.charAt(0).toUpperCase();

        document.getElementById('adminPanelCard').classList.toggle('hidden', data.role !== 'admin');
        authContainer.classList.add('hidden'); appContainer.classList.remove('hidden');
    }
    document.getElementById('btnLoginSubmit').textContent = "Sisteme Giriş Yap"; document.getElementById('btnLoginSubmit').disabled = false;
}

// Menüler ve Çıkış
const btnProfile = document.getElementById('btnProfile');
const profileDropdown = document.getElementById('profileDropdown');
btnProfile.addEventListener('click', () => profileDropdown.classList.toggle('hidden'));
document.addEventListener('click', e => { if (!btnProfile.contains(e.target) && !profileDropdown.contains(e.target)) profileDropdown.classList.add('hidden'); });

document.getElementById('btnLogout').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    appContainer.classList.add('hidden'); authContainer.classList.remove('hidden'); profileDropdown.classList.add('hidden');
    loginForm.reset(); document.getElementById('adminModule').classList.add('hidden'); document.getElementById('mainMenu').classList.remove('hidden');
});

// Admin Paneli
const adminPanelCard = document.getElementById('adminPanelCard');
const adminModule = document.getElementById('adminModule');
const mainMenu = document.getElementById('mainMenu');
const calculatorModule = document.getElementById('calculatorModule');

adminPanelCard.addEventListener('click', () => { mainMenu.classList.add('hidden'); adminModule.classList.remove('hidden'); fetchUsersForAdmin(); });
document.getElementById('btnBackToMenuFromAdmin').addEventListener('click', () => { adminModule.classList.add('hidden'); mainMenu.classList.remove('hidden'); });
document.getElementById('btnGoCalculator').addEventListener('click', () => { mainMenu.classList.add('hidden'); calculatorModule.classList.remove('hidden'); });
document.getElementById('btnBackToMenu').addEventListener('click', () => { calculatorModule.classList.add('hidden'); mainMenu.classList.remove('hidden'); document.getElementById('resultsModule').classList.add('hidden'); });
document.getElementById('btnRefreshUsers').addEventListener('click', fetchUsersForAdmin);

async function fetchUsersForAdmin() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-gray-500">Yükleniyor...</td></tr>';
    const { data } = await supabaseClient.from('profiles').select('*').order('first_name');
    if(data) {
        tbody.innerHTML = '';
        data.forEach(u => {
            const row = document.createElement('tr');
            row.innerHTML = `<td class="py-3 px-4 border-b text-sm">${u.first_name} ${u.last_name}</td><td class="py-3 px-4 border-b text-sm">${u.company_name}</td><td class="py-3 px-4 border-b text-sm">${u.phone}</td><td class="py-3 px-4 border-b"><span class="${u.role==='admin'?'bg-red-100 text-red-800':'bg-blue-100 text-blue-800'} px-2 py-1 rounded text-xs">${u.role}</span></td>`;
            tbody.appendChild(row);
        });
    }
}

// ==========================================
// GÜÇ HESAPLAYICI - SEÇİM VE LİSTELEME
// ==========================================
const monthsGrid = document.getElementById('monthsGrid');
["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"].forEach(m => {
    const div = document.createElement('div'); div.innerHTML = `<label class="block text-xs text-gray-500 mb-1">${m}</label><input type="number" class="month-input w-full p-2 border border-gray-300 rounded outline-none text-sm" value="300">`;
    if(monthsGrid) monthsGrid.appendChild(div);
});

// Radyo Butonu ile Sekme Geçişleri
document.querySelectorAll('input[name="inputType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        document.querySelectorAll('.input-section').forEach(sec => sec.classList.add('hidden'));
        const targetEl = document.getElementById(e.target.value + 'InputSection');
        if (targetEl) targetEl.classList.remove('hidden');
    });
});

// Eşya Ekleme Mantığı ve Varsayılan Liste
const appliancesWrapper = document.getElementById('appliancesWrapper');
function addApplianceRow(name = "", qty = 1, kw = "", hrs = "") {
    const row = document.createElement('div'); row.className = "appliance-row grid grid-cols-12 gap-2 items-center mt-2";
    row.innerHTML = `<div class="col-span-4"><input type="text" placeholder="Adı" value="${name}" class="w-full p-2 border rounded text-sm"></div><div class="col-span-2"><input type="number" value="${qty}" class="app-qty w-full p-2 border rounded text-sm text-center"></div><div class="col-span-3"><input type="number" placeholder="kW" value="${kw}" step="0.01" class="app-kw w-full p-2 border rounded text-sm text-center"></div><div class="col-span-2"><input type="number" placeholder="Saat" value="${hrs}" class="app-hrs w-full p-2 border rounded text-sm text-center"></div><div class="col-span-1 text-center"><button class="btn-delete-app text-red-500 font-bold text-lg">&times;</button></div>`;
    row.querySelector('.btn-delete-app').addEventListener('click', () => row.remove()); if(appliancesWrapper) appliancesWrapper.appendChild(row);
}

if(document.getElementById('btnAddAppliance')) {
    // Sayfa açıldığında standart yüklenecek cihazlar
    const defaultAppliances = [
        { name: 'Buzdolabı', qty: 1, kw: 0.15, hrs: 240 }, 
        { name: 'Televizyon', qty: 1, kw: 0.1, hrs: 120 }, 
        { name: 'Çamaşır Makinesi', qty: 1, kw: 0.8, hrs: 20 }, 
        { name: 'Bulaşık Makinesi', qty: 1, kw: 1.2, hrs: 15 },
        { name: 'Aydınlatma (Ev)', qty: 10, kw: 0.01, hrs: 150 }
    ];
    defaultAppliances.forEach(app => addApplianceRow(app.name, app.qty, app.kw, app.hrs));
    
    document.getElementById('btnAddAppliance').addEventListener('click', () => addApplianceRow());
    document.getElementById('quickAddSelect').addEventListener('change', e => { 
        if (e.target.value) { 
            const [name, qty, kw, hrs] = e.target.value.split('|'); 
            addApplianceRow(name, qty, kw, hrs); 
            e.target.value = ""; 
        } 
    });
}

// Gelecek Yükler
if(document.getElementById('hasFutureLoads')) {
    document.getElementById('hasFutureLoads').addEventListener('change', e => document.getElementById('futureLoadsContainer').classList.toggle('hidden', !e.target.checked));
    document.getElementById('checkEV').addEventListener('change', e => document.getElementById('wrapEV').classList.toggle('hidden', !e.target.checked));
    document.getElementById('checkHP').addEventListener('change', e => document.getElementById('wrapHP').classList.toggle('hidden', !e.target.checked));
    document.getElementById('btnAddCustomLoad').addEventListener('click', () => {
        const row = document.createElement('div'); row.className = "flex space-x-2 bg-gray-50 p-2 rounded border border-gray-200";
        row.innerHTML = `<input type="text" placeholder="Yük Adı" class="w-1/2 p-2 border rounded text-sm"><input type="number" placeholder="Aylık" class="custom-load-input w-1/3 p-2 border rounded text-sm" value="0"><button class="btn-delete-load text-red-500 font-bold px-2">X</button>`;
        row.querySelector('.btn-delete-load').addEventListener('click', () => row.remove()); document.getElementById('customLoadsWrapper').appendChild(row);
    });
}

// HESAPLAMA MOTORU VE SONUÇLAR
let sonAylik = 0, sonYillik = 0, sonFatura = 0; 

if(document.getElementById('btnCalculate')) {
    document.getElementById('btnCalculate').addEventListener('click', () => {
        let base = 0; const type = document.querySelector('input[name="inputType"]:checked').value;
        if (type === 'monthly') base = parseFloat(document.getElementById('averageMonthlyLoad').value) || 0;
        else if (type === 'yearly') { let t = 0; document.querySelectorAll('.month-input').forEach(i => t += parseFloat(i.value) || 0); base = t / 12; }
        else { let t = 0; document.querySelectorAll('.appliance-row').forEach(r => t += (parseFloat(r.querySelector('.app-qty').value)||0) * (parseFloat(r.querySelector('.app-kw').value)||0) * (parseFloat(r.querySelector('.app-hrs').value)||0)); base = t; }

        let extra = 0;
        if (document.getElementById('hasFutureLoads').checked) {
            if(document.getElementById('checkEV').checked) extra += (parseFloat(document.getElementById('evMonthlyKm').value)||0)/100 * (parseFloat(document.getElementById('evConsumptionRate').value)||0);
            if(document.getElementById('checkHP').checked) extra += parseFloat(document.getElementById('hpMonthlyLoad').value) || 0;
            document.querySelectorAll('.custom-load-input').forEach(i => extra += parseFloat(i.value) || 0);
        }

        sonAylik = base + extra; 
        sonYillik = sonAylik * 12; 
        let trf = parseFloat(document.getElementById('tariffSelect').value);
        sonFatura = sonAylik * trf;

        document.getElementById('finalMonthlyLoad').textContent = Math.round(sonAylik).toLocaleString('tr-TR');
        document.getElementById('finalYearlyLoad').textContent = Math.round(sonYillik).toLocaleString('tr-TR');
        document.getElementById('finalMonthlyBill').textContent = sonFatura.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        document.getElementById('resultsModule').classList.remove('hidden'); 
        document.getElementById('resultsModule').scrollIntoView({ behavior: 'smooth' });
    });
}

// ==========================================
// 3D SİMÜLASYON GEÇİŞLERİ VE RENDER MOTORU
// ==========================================
const simulationModule = document.getElementById('simulationModule');
const btnGoSimulation = document.getElementById('btnGoSimulation');
const btnBackToMenuFromSim = document.getElementById('btnBackToMenuFromSim');

let is3DInitialized = false; // 3D'nin birden fazla kez yüklenmesini engeller

if (btnGoSimulation) {
    btnGoSimulation.addEventListener('click', () => {
        document.getElementById('mainMenu').classList.add('hidden');
        simulationModule.classList.remove('hidden');
        
        // Menüye tıklandığında 3D dünyayı başlat
        if (!is3DInitialized) {
            init3DScene();
            is3DInitialized = true;
        }
    });
}

if (btnBackToMenuFromSim) {
    btnBackToMenuFromSim.addEventListener('click', () => {
        simulationModule.classList.add('hidden');
        document.getElementById('mainMenu').classList.remove('hidden');
    });
}










// ------------------------------------------
// THREE.JS ANA RENDER MOTORU (ÖN VE ARKA CEPHE YERLEŞİMLERİ)
// ------------------------------------------
let scene, camera, renderer, controls;

// Objeler ve Diziler
let objPanels = null, objInverterGroup = null, objHP = null, objGasPipe = null;
let gridCable = null, gridCableMat = null;
let arrBatteries = [], arrEVs = [];

// Durum Değişkenleri
let stateGES = false, stateHP = false;
let countBat = 0, countEV = 0;
let currentGrid = 100;
const MAX_BAT = 4; const MAX_EV = 2;

function init3DScene() {
    const container = document.getElementById('three-canvas-container');
    const loadingUI = document.getElementById('loading3D');
    if (!container) return;

    // 1. Sahne ve Kamera Kurulumu
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdbeafe); 
    
    // Kamera evin ön yüzünü ve direği görür. Kullanıcı farenin sol tuşuyla çevirip arkayı görebilir.
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(22, 16, 28); 

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    if (loadingUI) loadingUI.style.display = 'none';
    
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '0';
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;

    // 2. Işıklandırma
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.5);
    sunLight.position.set(15, 30, 15);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048; sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);

    // 3. STATİK YAPILAR (Zemin, Ev, Carport)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x65a30d }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    // Ev (Sağ Duvar: x=2, Sol Duvar: x=-6, Ön Duvar: z=3, Arka Duvar: z=-3)
    const house = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), new THREE.MeshStandardMaterial({ color: 0xFFFDD0 }));
    house.position.set(-2, 2.25, 0); house.castShadow = true; house.receiveShadow = true; scene.add(house);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.5, 6.5), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    roof.position.set(-2, 5.2, 0); roof.rotation.z = -0.25; roof.castShadow = true; scene.add(roof);

    const carportMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), carportMat); p1.position.set(7.5, 2, 3); p1.castShadow=true; scene.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), carportMat); p2.position.set(7.5, 2, -3); p2.castShadow=true; scene.add(p2);
    const cpRoof = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 7), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, transparent:true, opacity:0.8 }));
    cpRoof.position.set(4.8, 4, 0); cpRoof.castShadow=true; scene.add(cpRoof);

    // 4. ŞEBEKE BAĞLANTISI (Direk ve Akım Kablosu)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 10, 16), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
    pole.position.set(-12, 5, -5); pole.castShadow = true; scene.add(pole);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.5), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
    crossbar.position.set(-12, 9, -5); scene.add(crossbar);

    const cableCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-12, 9, -5), 
        new THREE.Vector3(-9, 6.5, -2.5), 
        new THREE.Vector3(-6, 4.5, 0) 
    );
    const cableGeo = new THREE.BufferGeometry().setFromPoints(cableCurve.getPoints(20));
    gridCableMat = new THREE.LineDashedMaterial({ color: 0x0ea5e9, linewidth: 2, dashSize: 0.4, gapSize: 0.3 });
    gridCable = new THREE.Line(cableGeo, gridCableMat);
    gridCable.computeLineDistances(); 
    scene.add(gridCable);

    // 5. ETKİLEŞİMLİ OBJELER (GÜNCELLENEN KONUMLAR)

    // A) Gaz Borusu ve Sayacı (Evin ÖN Duvarında)
    objGasPipe = new THREE.Group();
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5), new THREE.MeshStandardMaterial({ color: 0xfacc15 }));
    pipe.position.set(0, 1.25, 0); 
    const meterBox = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x9ca3af }));
    meterBox.position.set(0, 2.5, 0.15); // Kutu dışa doğru çıkık
    objGasPipe.add(pipe); objGasPipe.add(meterBox);
    objGasPipe.position.set(-5.5, 0, 3.2); // Z:3.2 Ön Duvar
    scene.add(objGasPipe);

    // B) Isı Pompası ve Boyler (Evin ÖN Duvarında)
    objHP = new THREE.Group();
    const hpBody = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x475569 })); 
    hpBody.position.set(2, 0.9, 0);
    const hpFan = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.85, 16), new THREE.MeshStandardMaterial({ color: 0x0f172a })); 
    hpFan.rotation.x = Math.PI/2; hpFan.position.set(2, 0.9, 0.4); // Fan ileri baksın
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.2, 16), new THREE.MeshStandardMaterial({color: 0xe2e8f0})); 
    boiler.position.set(3.2, 1.1, 0); 
    objHP.add(hpBody); objHP.add(hpFan); objHP.add(boiler);
    objHP.position.set(-1.5, 0, 3.6); // Z:3.6 Ön Duvar
    objHP.scale.set(0,0,0);
    scene.add(objHP);

    // C) GES Panelleri (Çatı) ve İnverter (Evin ARKA Duvarında)
    objPanels = new THREE.Group();
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x020617, metalness: 0.9, roughness: 0.1 });
    for(let x=0; x<3; x++) {
        for(let z=0; z<2; z++) {
            const panel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 2.8), panelMat);
            panel.position.set(-2.5 + (x*2.4), 0, -1.5 + (z*3));
            objPanels.add(panel);
        }
    }
    objPanels.position.set(-2, 5.65, 0); objPanels.rotation.z = -0.25; objPanels.scale.set(0,0,0); scene.add(objPanels);

    objInverterGroup = new THREE.Group();
    const inverter = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.3), new THREE.MeshStandardMaterial({ color: 0x3B82F6 }));
    inverter.position.set(-4, 3.5, -3.2); // Z:-3.2 Arka Duvar
    const solarCable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3), new THREE.MeshStandardMaterial({ color: 0x1f2937 }));
    solarCable.position.set(-4, 4.5, -3.2); 
    objInverterGroup.add(inverter); objInverterGroup.add(solarCable);
    objInverterGroup.scale.set(0,0,0); scene.add(objInverterGroup);

    // D) Bataryalar (Evin ARKA duvarına, yan yana dizilir)
    function createBattery(x, z) {
        // Geometri arka duvara düz yapışacak şekilde tasarlandı (Genişlik: 1.2, Derinlik: 0.6)
        const bat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.6), new THREE.MeshStandardMaterial({ color: 0xf1f5f9 }));
        bat.position.set(x, 1.1, z); bat.castShadow = true; bat.scale.set(0,0,0);
        scene.add(bat); return bat;
    }
    for(let i=0; i<MAX_BAT; i++) {
        // Z:-3.3 Arka Duvar boyuna (X ekseni boyunca) dizilim
        arrBatteries.push(createBattery(0 - (i * 1.4), -3.3)); 
    }

    // E) Elektrikli Araçlar (Carport Altında)
    function createEV(x, z) {
        const ev = new THREE.Group();
        const carBody = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.1, 1.8), new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness:0.4 }));
        carBody.position.y = 0.85; carBody.castShadow = true;
        const carTop = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 1.6), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
        carTop.position.set(-0.4, 1.7, 0); carTop.castShadow = true;
        ev.add(carBody); ev.add(carTop);
        const wMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
        const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2, 16), wMat); w1.rotation.x = Math.PI/2; w1.position.set(-1.1, 0.4, 0);
        const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2, 16), wMat); w2.rotation.x = Math.PI/2; w2.position.set(1.2, 0.4, 0);
        ev.add(w1); ev.add(w2);
        ev.position.set(x, 0, z); ev.scale.set(0,0,0);
        scene.add(ev); return ev;
    }
    arrEVs.push(createEV(4.5, -1.5)); arrEVs.push(createEV(4.5, 1.5));

    // 6. BUTON ETKİLEŞİMLERİ
    const btnGes = document.getElementById('btnSimGES');
    btnGes.addEventListener('click', () => { 
        stateGES = !stateGES; 
        btnGes.classList.toggle('bg-green-600'); btnGes.classList.toggle('bg-indigo-600'); updateScore(); 
    });
    const btnHP = document.getElementById('btnSimHP');
    btnHP.addEventListener('click', () => { 
        stateHP = !stateHP; 
        btnHP.classList.toggle('bg-green-600'); btnHP.classList.toggle('bg-indigo-600'); updateScore(); 
    });

    document.getElementById('btnSimBatPlus').addEventListener('click', () => { if(countBat < MAX_BAT) { countBat++; updateScore(); }});
    document.getElementById('btnSimBatMinus').addEventListener('click', () => { if(countBat > 0) { countBat--; updateScore(); }});
    document.getElementById('btnSimEVPlus').addEventListener('click', () => { if(countEV < MAX_EV) { countEV++; updateScore(); }});
    document.getElementById('btnSimEVMinus').addEventListener('click', () => { if(countEV > 0) { countEV--; updateScore(); }});

    window.addEventListener('resize', onWindowResize, false);
    animate();
}

function onWindowResize() {
    const container = document.getElementById('three-canvas-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Yeni Matematik Skoru
function updateScore() {
    let score = 0; let grid = 100; let carbon = "Yüksek"; let fossil = "Aktif";
    
    document.getElementById('batCountDisplay').innerText = countBat;
    document.getElementById('evCountDisplay').innerText = countEV;

    if (stateGES) { score += 30; grid -= 30; carbon = "Orta"; }
    score += countBat * 10; grid -= countBat * 10;
    if (countBat > 0 && stateGES) carbon = "Düşük";
    score += countEV * 10;
    if (countEV > 0) carbon = "Çok Düşük";
    if (stateHP) { score += 20; grid = 0; fossil = "İPTAL EDİLDİ"; carbon = "SIFIR (Net-Zero)"; }

    currentGrid = Math.max(0, grid); // Animasyon için şebeke bağımlılığını tut

    document.getElementById('scoreDisplay').innerText = "%" + score;
    document.getElementById('gridDepDisplay').innerText = "%" + currentGrid;
    document.getElementById('fossilDisplay').innerText = fossil;
    document.getElementById('carbonDisplay').innerText = carbon;

    const sColor = document.getElementById('scoreDisplay');
    sColor.className = "text-xs px-2 py-1 rounded text-white font-bold transition-colors duration-500";
    if(score < 30) sColor.classList.add('bg-red-500');
    else if(score < 70) sColor.classList.add('bg-orange-500');
    else if(score < 100) sColor.classList.add('bg-yellow-500');
    else sColor.classList.add('bg-green-600');
}

// Büyüme (Pop-up) Animasyonu
function lerpScale(obj, target, speed) {
    if(!obj) return;
    obj.scale.x += (target - obj.scale.x) * speed;
    obj.scale.y += (target - obj.scale.y) * speed;
    obj.scale.z += (target - obj.scale.z) * speed;
}

function animate() {
    requestAnimationFrame(animate);
    
    // Obje Animasyonları
    if (objPanels) lerpScale(objPanels, stateGES ? 1 : 0, 0.1);
    if (objInverterGroup) lerpScale(objInverterGroup, stateGES ? 1 : 0, 0.1);
    arrBatteries.forEach((bat, i) => { lerpScale(bat, i < countBat ? 1 : 0, 0.1); });
    arrEVs.forEach((ev, i) => { lerpScale(ev, i < countEV ? 1 : 0, 0.1); });
    
    if (objHP && objGasPipe) {
        lerpScale(objHP, stateHP ? 1 : 0, 0.1);
        lerpScale(objGasPipe, stateHP ? 0 : 1, 0.1); 
    }

    // Şebeke Kablosu Akım (Hareket) Animasyonu
    if (gridCableMat) {
        gridCableMat.dashOffset -= 0.05; // Çizgileri hareket ettirir
    }
    
    // Şebeke bağımlılığı %0 olduğunda kabloyu sil (gizle)
    if (gridCable) {
        gridCable.visible = currentGrid > 0;
    }

    controls.update();
    renderer.render(scene, camera);
}








// ==========================================
// LOKAL DÜZELTME: DETAYLI RAPOR METNİ İÇEREN E-POSTA MOTORU
// ==========================================
document.getElementById('btnSendEmail').addEventListener('click', async () => {
    const emailTo = document.getElementById('customerEmail').value;
    if(!emailTo || !emailTo.includes('@')) {
        alert("Lütfen geçerli bir müşteri e-posta adresi girin.");
        return;
    }

    const btn = document.getElementById('btnSendEmail');
    btn.textContent = "Gönderiliyor...";
    btn.disabled = true;

    // --- MAİL İÇİN ADIM ADIM SEÇİM METNİ DETAYI OLUŞTURMA ---
    let detayMetni = "";
    const inputType = document.querySelector('input[name="inputType"]:checked').value;
    
    detayMetni += "1. TÜKETİM MODELİ GİRİŞ PARAMETRELERİ:\n";
    if (inputType === 'monthly') {
        const val = document.getElementById('averageMonthlyLoad').value || 0;
        detayMetni += `   - Yöntem: Aylık Ortalama Fatura Girişi\n   - Tüketim Değeri: ${val} kWh / Ay\n`;
    } else if (inputType === 'yearly') {
        detayMetni += "   - Yöntem: 12 Aylık Detaylı Fatura Veri Girişi\n   - Girilen Aylık Değerler listelenerek veritabanına işlenmiştir.\n";
    } else {
        detayMetni += "   - Yöntem: Yeni Kurulum (Cihaz/Eşya Listesi Hesaplaması)\n   - Dahil Edilen Aktif Cihazlar:\n";
        document.querySelectorAll('.appliance-row').forEach(row => {
            const ins = row.querySelectorAll('input');
            if(ins.length >= 3 && ins[0].value) {
                detayMetni += `     * ${ins[0].value}: ${ins[1].value || 0} Adet (${ins[2].value || 0} kW)\n`;
            }
        });
    }

 detayMetni += "\n2. GELECEKTEKİ İLAVE YÜK SENARYOLARI:\n";
    if (document.getElementById('hasFutureLoads').checked) {
        // Elektrikli Araç Kontrolü
        if (document.getElementById('checkEV').checked) {
            detayMetni += `   - Elektrikli Araç (EV): Aylık ${document.getElementById('evMonthlyKm').value || 0} km sürüş senaryosu eklenmiştir.\n`;
        }
        // Isı Pompası Kontrolü
        if (document.getElementById('checkHP').checked) {
            detayMetni += `   - Isı Pompası: Aylık sabit +${document.getElementById('hpMonthlyLoad').value || 0} kWh tüketim eklenmiştir.\n`;
        }
        // YENİ/DÜZELTME: Ekran üzerindeki tüm dinamik Özel Yükleri tarayıp maile ekleyen döngü
        document.querySelectorAll('#customLoadsWrapper > div').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if(inputs.length >= 2 && inputs[0].value) {
                detayMetni += `   - Özel Proje Yükü (${inputs[0].value}): Aylık +${inputs[1].value || 0} kWh ek tüketim\n`;
            }
        });
    } else {
        detayMetni += "   - İlave bir gelecek yük planlanmadı.\n";
    }

    // EmailJS şablon parametreleri paketleniyor
    const templateParams = {
        to_email: emailTo,
        aylik_tuketim: Math.round(sonAylik).toLocaleString('tr-TR') + " kWh",
        yillik_tuketim: Math.round(sonYillik).toLocaleString('tr-TR') + " kWh",
        tahmini_fatura: sonFatura.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TL",
        detay_raporu: detayMetni // EmailJS panelinde {{detay_raporu}} kelimesiyle basılacak alan!
    };

    try {
        await emailjs.send('service_en0v19k', 'template_d57vo2b', templateParams);
        alert(emailTo + " adresine detaylı ekran veri özeti mail olarak uçuruldu!");
        document.getElementById('customerEmail').value = ''; 
    } catch (error) {
        console.error("EmailJS Hatası:", error);
        alert("E-posta gönderilemedi! Bilgilerinizi doğrulayın.");
    } finally {
        btn.textContent = "✉️ Analizi Mail At";
        btn.disabled = false;
    }
});
// ==========================================
// YENİ VE KESİN ÇÖZÜM: DOĞAL (NATIVE) PDF YAZDIRMA MOTORU
// ==========================================
document.getElementById('btnDownloadPDF').addEventListener('click', () => {
    
    // 1. Yazdırma Alanı Yoksa Oluştur (Görünmez Kapsayıcı)
    let printArea = document.getElementById('printArea');
    if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'printArea';
        document.body.appendChild(printArea);
    }

    // 2. Müşteri Bilgileri
    const musteriAdi = currentUserProfile ? `${currentUserProfile.first_name} ${currentUserProfile.last_name}` : 'Müşterimiz';
    const firmaAdi = currentUserProfile ? currentUserProfile.company_name : 'SolarEPC Proje Merkezi';
    const tarih = new Date().toLocaleDateString('tr-TR');

    // 3. Veri Giriş Yöntemi Ayrıştırma
    const inputType = document.querySelector('input[name="inputType"]:checked').value;
    let yontemHTML = "";

    if (inputType === 'monthly') {
        const val = document.getElementById('averageMonthlyLoad').value || 0;
        yontemHTML = `<p><strong>Kullanılan Yöntem:</strong> Aylık Sabit Fatura Tüketimi</p><p><strong>Beyan Edilen Değer:</strong> ${val} kWh / Ay</p>`;
    } else if (inputType === 'yearly') {
        yontemHTML = `<p><strong>Kullanılan Yöntem:</strong> 12 Aylık Fatura Detayı</p><table style="width:100%; border-collapse:collapse; margin-top:10px;"><tr>`;
        const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
        document.querySelectorAll('.month-input').forEach((input, i) => {
            yontemHTML += `<td style="border:1px solid #ddd; padding:5px; text-align:center; font-size:12px;"><strong>${aylar[i]}</strong><br>${input.value || 0} kWh</td>`;
            if ((i + 1) % 6 === 0 && i !== 11) yontemHTML += `</tr><tr>`; // 6 ayda bir alt satıra geç
        });
        yontemHTML += `</tr></table>`;
    } else {
        yontemHTML = `<p><strong>Kullanılan Yöntem:</strong> Yeni Kurulum Cihaz Envanteri</p><ul style="font-size:13px; line-height:1.6;">`;
        document.querySelectorAll('.appliance-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length >= 3 && inputs[0].value) {
                yontemHTML += `<li>${inputs[0].value}: ${inputs[1].value} Adet (${inputs[2].value} kW) - Ayda ${inputs[3].value} Saat</li>`;
            }
        });
        yontemHTML += `</ul>`;
    }

    // 4. Gelecek Yükler Ayrıştırma
    let gelecekHTML = "";
    if (document.getElementById('hasFutureLoads').checked) {
        gelecekHTML += `<ul style="font-size:13px; line-height:1.6;">`;
        if (document.getElementById('checkEV').checked) gelecekHTML += `<li>Elektrikli Araç (EV): Aylık ${document.getElementById('evMonthlyKm').value || 0} km</li>`;
        if (document.getElementById('checkHP').checked) gelecekHTML += `<li>Isı Pompası: Aylık +${document.getElementById('hpMonthlyLoad').value || 0} kWh</li>`;
        document.querySelectorAll('#customLoadsWrapper > div').forEach(row => {
            const ins = row.querySelectorAll('input');
            if (ins.length >= 2 && ins[0].value) gelecekHTML += `<li>Özel Yük (${ins[0].value}): Aylık +${ins[1].value} kWh</li>`;
        });
        gelecekHTML += `</ul>`;
    } else {
        gelecekHTML = `<p style="font-size:13px; color:#555;">Sisteme ilave edilecek ek yük senaryosu planlanmamıştır.</p>`;
    }

    // 5. Tertemiz Resmi Belge Tasarımı (HTML & Inline CSS)
    printArea.innerHTML = `
        <div style="font-family: Arial, sans-serif; color: #222; max-width: 800px; margin: 0 auto; line-height: 1.5;">
            <div style="border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 20px;">
                <div style="float: right; text-align: right; font-size: 12px; color: #666;">
                    <strong>Tarih:</strong> ${tarih}<br>
                    <strong>Düzenleyen:</strong> ${firmaAdi}
                </div>
                <h1 style="color: #2563eb; margin: 0; font-size: 24px;">epcmerkezim</h1>
                <p style="margin: 0; font-size: 14px; color: #555;">Güneş Enerjisi Tüketim Analiz Raporu</p>
            </div>
            <p><strong>Sayın ${musteriAdi},</strong></p>
            <p style="font-size: 14px; color: #444;">Sistem üzerinden girmiş olduğunuz parametrelere göre hesaplanan teknik ve mali simülasyon özetiniz aşağıda yer almaktadır.</p>
            <div style="margin-top: 30px;">
                <h3 style="color: #2563eb; border-bottom: 1px solid #ddd; padding-bottom: 5px; font-size: 16px;">1. Mevcut Tüketim Parametreleri</h3>
                ${yontemHTML}
            </div>
            <div style="margin-top: 20px;">
                <h3 style="color: #16a34a; border-bottom: 1px solid #ddd; padding-bottom: 5px; font-size: 16px;">2. Gelecek İlave Yük Senaryoları</h3>
                ${gelecekHTML}
            </div>
            <div style="margin-top: 40px;">
                <h3 style="background-color: #1f2937; color: white; padding: 10px; font-size: 16px; margin: 0;">3. Sonuç ve Projeksiyon</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 16px;">
                    <tr>
                        <td style="padding: 15px; border: 1px solid #ddd; background-color: #f9fafb; font-weight: bold; width: 50%;">Gelecekteki Aylık Tüketim:</td>
                        <td style="padding: 15px; border: 1px solid #ddd;">${Math.round(sonAylik).toLocaleString('tr-TR')} kWh</td>
                    </tr>
                    <tr>
                        <td style="padding: 15px; border: 1px solid #ddd; background-color: #f9fafb; font-weight: bold;">Yıllık Toplam Sistem İhtiyacı:</td>
                        <td style="padding: 15px; border: 1px solid #ddd; color: #16a34a; font-weight: bold;">${Math.round(sonYillik).toLocaleString('tr-TR')} kWh</td>
                    </tr>
                    <tr>
                        <td style="padding: 15px; border: 1px solid #ddd; background-color: #fef3c7; font-weight: bold; color: #92400e;">Tahmini Aylık Fatura Bedeli:</td>
                        <td style="padding: 15px; border: 1px solid #ddd; background-color: #fef3c7; font-weight: bold; color: #b45309; font-size: 20px;">₺ ${sonFatura.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                </table>
            </div>
            <div style="margin-top: 50px; padding-top: 20px; border-top: 1px dashed #ccc; font-size: 11px; color: #777; text-align: center;">
                <p>Bu rapor ön fizibilite amacıyla üretilmiştir. Kesin değerler ve mekanik uygunluk saha keşfi sonrasında netleşecektir.</p>
                <p><strong>epcmerkezim © ${new Date().getFullYear()}</strong></p>
            </div>
        </div>
    `;

    // 6. Tarayıcının Kendi PDF/Yazdırma Ekranını Tetikle
    setTimeout(() => {
        window.print();
        // ÇÖZÜM: Yazdırma ekranı kapandığında arka plandaki raporu tamamen sil
        if (printArea) {
            printArea.remove();
        }
    }, 200);
});