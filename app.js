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









// ==========================================
// EV & SOLAR ENTEGRASYON HESAPLAYICISI (HIZLI & REAKTİF MOTOR)
// ==========================================
const evCalcModule = document.getElementById('evCalcModule');
const btnGoEVCalc = document.getElementById('btnGoEVCalc');
const btnBackToMenuFromEV = document.getElementById('btnBackToMenuFromEV');

// Global Sabitler
let activeTab = 'tabBill'; // Varsayılan sekme artık 'Fatura'
const DAILY_SUN_HOURS = 4;
const KWP_TO_M2_RATIO = 5; // 1 kWp = 5 m2
const ROOF_USABILITY_RATIO = 0.8;

// Menü Geçişleri
if(btnGoEVCalc) {
    btnGoEVCalc.addEventListener('click', () => {
        document.getElementById('mainMenu').classList.add('hidden');
        evCalcModule.classList.remove('hidden');
        calculateEVSolar(); 
    });
}
if(btnBackToMenuFromEV) {
    btnBackToMenuFromEV.addEventListener('click', () => {
        evCalcModule.classList.add('hidden');
        document.getElementById('mainMenu').classList.remove('hidden');
    });
}

// Sekme (Tab) Yönetimi
document.querySelectorAll('.ev-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.ev-tab-btn').forEach(b => {
            b.classList.remove('bg-teal-600', 'text-white');
            b.classList.add('bg-gray-100', 'text-gray-600');
        });
        e.target.classList.remove('bg-gray-100', 'text-gray-600');
        e.target.classList.add('bg-teal-600', 'text-white');

        document.querySelectorAll('.ev-tab-content').forEach(content => content.classList.add('hidden'));
        activeTab = e.target.getAttribute('data-target');
        document.getElementById(activeTab).classList.remove('hidden');

        calculateEVSolar(); // Sekme değiştiğinde anında hesapla
    });
});

// Tüm girdiler için dinleyici
document.querySelectorAll('.ev-reactive-input').forEach(input => {
    input.addEventListener('input', calculateEVSolar);
});

// ANA MATEMATİK MOTORU
function calculateEVSolar() {
    // 1. Dinamik Fiyatı Ekrândan Çek
    const dynamicTariffPrice = parseFloat(document.getElementById('evCalcTariff').value) || 2.50;

    // 2. Araç Parametreleri
    const evRange = parseFloat(document.getElementById('evCalcRange').value) || 1;
    const evBattery = parseFloat(document.getElementById('evCalcBattery').value) || 1;
    const evConsumption = parseFloat(document.getElementById('evCalcConsumption').value) || 1;
    const evACSpeed = parseFloat(document.getElementById('evCalcACSpeed').value) || 1;
    const evSocket = document.getElementById('evCalcSocket').value;

    document.getElementById('evChargerRecommendation').innerHTML = 
        `💡 <strong>Aracınız için önerilen:</strong> ${evSocket} soket tipine sahip, minimum ${evACSpeed} kW çıkış verebilen evsel AC şarj istasyonudur.`;

    const inputKwhVal = parseFloat(document.getElementById('evInputKwh').value) || 0;
    document.getElementById('dynamicBillEquiv').textContent = (inputKwhVal * dynamicTariffPrice).toFixed(2) + " TL";

    // 3. Hesaplama Değişkenleri
    let requiredPowerKwp = 0;
    let requiredAreaM2 = 0;
    let dailyProductionKwh = 0;
    let showRoofWarning = false;

    // 4. Çatı Kullanım Limiti (Artık Zorunlu Temel Kural)
    const userTotalRoof = parseFloat(document.getElementById('evInputRoof').value) || 0;
    const maxUsableRoof = userTotalRoof * ROOF_USABILITY_RATIO;

    // 5. Senaryolara Göre Algoritmalar
    if (activeTab === 'tabBill') {
        const monthlyBill = parseFloat(document.getElementById('evInputBill').value) || 0;
        const monthlyKwh = monthlyBill / dynamicTariffPrice;
        dailyProductionKwh = monthlyKwh / 30;
        requiredPowerKwp = dailyProductionKwh / DAILY_SUN_HOURS;
        requiredAreaM2 = requiredPowerKwp * KWP_TO_M2_RATIO;
    } 
    else if (activeTab === 'tabKwh') {
        dailyProductionKwh = inputKwhVal / 30;
        requiredPowerKwp = dailyProductionKwh / DAILY_SUN_HOURS;
        requiredAreaM2 = requiredPowerKwp * KWP_TO_M2_RATIO;
    } 
    else if (activeTab === 'tabKm') {
        const monthlyKm = parseFloat(document.getElementById('evInputKm').value) || 0;
        const monthlyEvKwh = monthlyKm * (evConsumption / 100);
        dailyProductionKwh = monthlyEvKwh / 30;
        requiredPowerKwp = dailyProductionKwh / DAILY_SUN_HOURS;
        requiredAreaM2 = requiredPowerKwp * KWP_TO_M2_RATIO;
    }

    // Limit Kontrolü (İstenen çatı alanı kullanılabilirden büyükse uyar)
    if (requiredAreaM2 > maxUsableRoof) showRoofWarning = true;

    // 6. Sonuçları Ekrana Bas
    const monthlyProductionKwh = dailyProductionKwh * 30;
    const monthlySolarRange = (monthlyProductionKwh / evBattery) * evRange;

    document.getElementById('resPower').textContent = requiredPowerKwp.toFixed(2);
    document.getElementById('resArea').textContent = requiredAreaM2.toFixed(1);
    document.getElementById('resProduction').textContent = Math.round(monthlyProductionKwh).toLocaleString('tr-TR');
    document.getElementById('resSolarRange').textContent = Math.round(monthlySolarRange).toLocaleString('tr-TR');

    // Dinamik Uyarı Banner Yönetimi
    const warningBanner = document.getElementById('roofWarningBanner');
    if (showRoofWarning) {
        warningBanner.classList.remove('hidden');
        // Mesajı daha akıllı hale getirdik:
        warningBanner.innerHTML = `⚠️ DİKKAT: İhtiyacınız olan alan (${requiredAreaM2.toFixed(1)} m²), çatınızın kullanılabilir limitini (${maxUsableRoof.toFixed(1)} m²) aşıyor. Sadece çatınıza sığan kadar panel kurabilirsiniz.`;
    } else {
        warningBanner.classList.add('hidden');
    }

    // İlerleme Çubuğu Animasyonu
    const chargeRatio = evBattery > 0 ? (monthlyProductionKwh / evBattery) * 100 : 0;
    const barWidth = Math.min(chargeRatio, 100);
    document.getElementById('resChargeBar').style.width = barWidth + '%';
    document.getElementById('resChargePercent').textContent = `%` + Math.round(chargeRatio);
}

// ==========================================
// TEKNİK SERVİS MODÜLÜ VE TICKET YÖNETİMİ
// ==========================================
const techSupportModule = document.getElementById('techSupportModule');
const btnGoTechSupport = document.getElementById('btnGoTechSupport');
const btnBackToMenuFromSupport = document.getElementById('btnBackToMenuFromSupport');

const tabNewTicket = document.getElementById('tabNewTicket');
const tabMyTickets = document.getElementById('tabMyTickets');
const ticketForm = document.getElementById('ticketForm');
const myTicketsArea = document.getElementById('myTicketsArea');

// Menü Geçişleri
if(btnGoTechSupport) {
    btnGoTechSupport.addEventListener('click', () => {
        document.getElementById('mainMenu').classList.add('hidden');
        techSupportModule.classList.remove('hidden');
        
        // Kullanıcı verileri varsa formda hazır gelsin
        if(currentUserProfile) {
            document.getElementById('tsName').value = `${currentUserProfile.first_name} ${currentUserProfile.last_name}`;
            document.getElementById('tsPhone').value = currentUserProfile.phone;
        }
    });
}
if(btnBackToMenuFromSupport) {
    btnBackToMenuFromSupport.addEventListener('click', () => {
        techSupportModule.classList.add('hidden');
        document.getElementById('mainMenu').classList.remove('hidden');
    });
}

// Sekme Yönetimi
tabNewTicket.addEventListener('click', () => {
    ticketForm.classList.remove('hidden'); myTicketsArea.classList.add('hidden');
    tabNewTicket.classList.add('text-red-600', 'border-b-2', 'border-red-600'); tabNewTicket.classList.remove('text-gray-500');
    tabMyTickets.classList.add('text-gray-500'); tabMyTickets.classList.remove('text-red-600', 'border-b-2', 'border-red-600');
});

tabMyTickets.addEventListener('click', () => {
    ticketForm.classList.add('hidden'); myTicketsArea.classList.remove('hidden');
    tabMyTickets.classList.add('text-red-600', 'border-b-2', 'border-red-600'); tabMyTickets.classList.remove('text-gray-500');
    tabNewTicket.classList.add('text-gray-500'); tabNewTicket.classList.remove('text-red-600', 'border-b-2', 'border-red-600');
    fetchMyTickets(); // Talepleri çek
});

// Yeni Talep Gönderme
ticketForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitTicket');
    btn.textContent = "Gönderiliyor..."; btn.disabled = true;

    // Fotoğraf yükleme şimdilik veritabanında yer kaplamaması için mock bırakıldı
    // Gerçekte supabase.storage kullanılmalıdır.
    
    const ticketData = {
        user_id: (await supabaseClient.auth.getUser()).data.user.id,
        full_name: document.getElementById('tsName').value,
        phone: document.getElementById('tsPhone').value,
        email: document.getElementById('tsEmail').value,
        address: document.getElementById('tsAddress').value,
        inverter_model: document.getElementById('tsInverter').value,
        battery_model: document.getElementById('tsBattery').value,
        installer_name: document.getElementById('tsInstaller').value,
        install_date: document.getElementById('tsInstallDate').value,
        problem_date: document.getElementById('tsProblemDate').value,
        problem_desc: document.getElementById('tsProblemDesc').value
    };

    const { error } = await supabaseClient.from('support_tickets').insert([ticketData]);

    if (error) {
        alert("Talep gönderilirken hata oluştu: " + error.message);
    } else {
        alert("Talebiniz başarıyla iletildi. Teknik ekibimiz inceleyip tarafınıza dönüş yapacaktır.");
        ticketForm.reset();
        tabMyTickets.click(); // Taleplerim sayfasına yönlendir
    }
    btn.textContent = "Talebi Gönder ve İncelemeye Al"; btn.disabled = false;
});

// Kullanıcının Taleplerini Çekme
async function fetchMyTickets() {
    const list = document.getElementById('myTicketsList');
    list.innerHTML = '<p class="text-gray-500 text-sm">Talepleriniz yükleniyor...</p>';
    
    const userId = (await supabaseClient.auth.getUser()).data.user.id;
    const { data, error } = await supabaseClient.from('support_tickets').select('*').eq('user_id', userId).order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
        list.innerHTML = '<p class="text-gray-500 text-sm p-4 bg-gray-50 rounded">Henüz oluşturulmuş bir teknik servis talebiniz bulunmamaktadır.</p>';
        return;
    }

    list.innerHTML = '';
    data.forEach(t => {
        let statusColor = "bg-yellow-100 text-yellow-800";
        if(t.status === "Değerlendiriliyor") statusColor = "bg-blue-100 text-blue-800";
        if(t.status === "Dönüş Yapıldı") statusColor = "bg-green-100 text-green-800";

        list.innerHTML += `
            <div class="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h4 class="font-bold text-gray-800">İnverter: ${t.inverter_model}</h4>
                        <p class="text-xs text-gray-500">Tarih: ${new Date(t.created_at).toLocaleDateString('tr-TR')}</p>
                    </div>
                    <span class="${statusColor} px-3 py-1 rounded-full text-xs font-bold">${t.status}</span>
                </div>
                <p class="text-sm text-gray-600 bg-gray-50 p-3 rounded mb-3"><strong>Sorun:</strong> ${t.problem_desc}</p>
                ${t.admin_response ? `
                    <div class="bg-green-50 border border-green-200 p-4 rounded-lg">
                        <p class="text-sm text-green-800 mb-2"><strong>Yönetici Yanıtı:</strong> ${t.admin_response}</p>
                        ${t.price_quote ? `<p class="text-sm font-bold text-green-900 bg-white inline-block px-3 py-1 rounded shadow-sm border border-green-100">💰 Teklif: ${t.price_quote} TL</p>` : ''}
                    </div>
                ` : '<p class="text-xs text-gray-400 italic">Henüz yönetici değerlendirmesi girilmedi.</p>'}
            </div>
        `;
    });
}

// --------------------------------------------------
// ADMIN TARAFI: Talepleri Görme ve Yanıtlama
// --------------------------------------------------
document.getElementById('btnRefreshTickets')?.addEventListener('click', fetchTicketsForAdmin);

// Admin paneline girildiğinde talepleri de yükle (Bunu mevcut adminPanelCard event listener'ına entegre ettik)
const originalAdminClick = adminPanelCard.onclick;
adminPanelCard.addEventListener('click', () => { fetchTicketsForAdmin(); });

async function fetchTicketsForAdmin() {
    const list = document.getElementById('adminTicketsList');
    if(!list) return;
    list.innerHTML = '<p class="text-gray-500 text-sm">Gelen talepler yükleniyor...</p>';
    
    const { data, error } = await supabaseClient.from('support_tickets').select('*').order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
        list.innerHTML = '<p class="text-gray-500 text-sm p-4 bg-gray-50 rounded">Sistemde henüz bir talep yok.</p>';
        return;
    }

    list.innerHTML = '';
    data.forEach(t => {
        list.innerHTML += `
            <div class="p-5 bg-white border border-gray-200 rounded-xl shadow-sm mb-4">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-bold text-gray-800 text-lg">${t.full_name} <span class="text-sm font-normal text-gray-500">(${t.phone})</span></h4>
                    <select onchange="updateTicketStatus(${t.id}, this.value)" class="text-xs font-bold border border-gray-300 rounded p-1 outline-none">
                        <option value="Başvuru İletildi" ${t.status === 'Başvuru İletildi' ? 'selected' : ''}>Başvuru İletildi</option>
                        <option value="Değerlendiriliyor" ${t.status === 'Değerlendiriliyor' ? 'selected' : ''}>Değerlendiriliyor</option>
                        <option value="Dönüş Yapıldı" ${t.status === 'Dönüş Yapıldı' ? 'selected' : ''}>Dönüş Yapıldı</option>
                    </select>
                </div>
                <div class="grid grid-cols-2 text-xs text-gray-600 mb-3 gap-2">
                    <p><strong>İnverter:</strong> ${t.inverter_model}</p>
                    <p><strong>Batarya:</strong> ${t.battery_model || 'Yok'}</p>
                    <p><strong>Kuran Firma:</strong> ${t.installer_name}</p>
                    <p><strong>Adres:</strong> ${t.address}</p>
                </div>
                <p class="text-sm text-gray-800 bg-red-50 p-3 rounded border border-red-100 mb-3"><strong>Sorun:</strong> ${t.problem_desc}</p>
                
                <div class="bg-gray-50 p-3 rounded border border-gray-200 flex gap-2">
                    <input type="text" id="resp_${t.id}" placeholder="Müşteriye iletilecek teknik yanıt..." value="${t.admin_response || ''}" class="flex-1 p-2 text-sm border border-gray-300 rounded outline-none">
                    <input type="number" id="price_${t.id}" placeholder="Fiyat (TL)" value="${t.price_quote || ''}" class="w-24 p-2 text-sm border border-gray-300 rounded outline-none">
                    <button onclick="respondToTicket(${t.id})" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-bold">Yanıtla & Gönder</button>
                </div>
            </div>
        `;
    });
}

// Global scope for inline onclick functions
window.updateTicketStatus = async function(id, newStatus) {
    await supabaseClient.from('support_tickets').update({ status: newStatus }).eq('id', id);
};

window.respondToTicket = async function(id) {
    const responseText = document.getElementById(`resp_${id}`).value;
    const priceVal = document.getElementById(`price_${id}`).value;
    
    await supabaseClient.from('support_tickets').update({ 
        admin_response: responseText, 
        price_quote: priceVal ? parseFloat(priceVal) : null,
        status: 'Dönüş Yapıldı'
    }).eq('id', id);
    
    alert("Yanıt ve fiyat teklifi müşteriye başarıyla iletildi!");
    fetchTicketsForAdmin(); // Listeyi yenile
};