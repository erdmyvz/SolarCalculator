// ============================================================================
// SOLARSaaS EPC YÖNETİM MERKEZİ - ANA JAVASCRIPT MOTORU
// ============================================================================

// --- 1. SPA (SINGLE PAGE APPLICATION) YÖNLENDİRİCİ ---
window.isLanding3DInitialized = false;
window.isApp3DInitialized = false;

function handleSPA_Routing() {
    const hash = window.location.hash || '#home';
    
    // Tüm ana katmanları gizle
    const landing = document.getElementById('landingContainer');
    const auth = document.getElementById('authContainer');
    const app = document.getElementById('appContainer');
    
    if(landing) landing.classList.add('hidden');
    if(auth) auth.classList.add('hidden');
    if(app) app.classList.add('hidden');
    
    // URL Hash'e göre ilgili katmanı aç
    if (hash === '#home' && landing) {
        landing.classList.remove('hidden');
        if(!window.isLanding3DInitialized) {
            initLanding3DScene();
            window.isLanding3DInitialized = true;
        }
    } else if (hash === '#auth' && auth) {
        auth.classList.remove('hidden');
    } else if (hash === '#app' && app) {
        app.classList.remove('hidden');
    }
}

// Tarayıcı geri tuşu ve ilk yükleme dinleyicileri
window.addEventListener('hashchange', handleSPA_Routing);
window.addEventListener('load', handleSPA_Routing);


// --- 2. ANA MENÜ VE MODÜL GEÇİŞ YÖNETİMİ ---
// Uygulama içi modül butonları ve hedef ID'leri
const menuMap = {
    'btnGoCalculator': 'calculatorModule',
    'btnGoSimulation': 'simulationModule',
    'btnGoEVCalc': 'evCalcModule',
    'btnGoTechSupport': 'techSupportModule',
    'btnGoSalesAssistant': 'salesAssistantModule',
    'adminPanelCard': 'adminModule'
};

// Menüden modüllere gidiş
for (const [btnId, modId] of Object.entries(menuMap)) {
    const btn = document.getElementById(btnId);
    if(btn) {
        btn.addEventListener('click', () => {
            document.getElementById('mainMenu').classList.add('hidden');
            document.getElementById(modId).classList.remove('hidden');
            
            // Uygulama içi 3D modülü açıldığında render motorunu tetikle
            if(modId === 'simulationModule' && !window.isApp3DInitialized) {
                initApp3DScene();
                window.isApp3DInitialized = true;
            }
        });
    }
}

// Modüllerden Ana Menüye Dönüş Butonları
const backButtons = ['btnBackToMenu', 'btnBackToMenuFromSim', 'btnBackToMenuFromEV', 'btnBackToMenuFromSupport', 'btnBackToMenuFromSales', 'btnBackToMenuFromAdmin'];
backButtons.forEach(id => {
    const btn = document.getElementById(id);
    if(btn) {
        btn.addEventListener('click', () => {
            Object.values(menuMap).forEach(modId => {
                const mod = document.getElementById(modId);
                if(mod) mod.classList.add('hidden');
            });
            document.getElementById('mainMenu').classList.remove('hidden');
        });
    }
});

// Test İçin Hızlı Giriş (Auth Bypass)
document.getElementById('btnLoginSubmit')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.hash = '#app'; // Giriş yapınca direkt uygulamaya at
});


// ============================================================================
// MODÜL: AÇILIŞ SAYFASI (LANDING PAGE) 3D KAYDIRMA MOTORU
// ============================================================================
let landingScene, landingCamera, landingRenderer;
let landHouse, landPanels, landBattery, landEV, landHP, landGasPipe;

function initLanding3DScene() {
    const canvasBox = document.getElementById('hero3DCanvas');
    if (!canvasBox) return;

    landingScene = new THREE.Scene();
    landingScene.background = new THREE.Color(0x0f172a); 

    landingCamera = new THREE.PerspectiveCamera(40, canvasBox.clientWidth / canvasBox.clientHeight, 0.1, 1000);
    landingCamera.position.set(18, 14, 22);

    landingRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    landingRenderer.setSize(canvasBox.clientWidth, canvasBox.clientHeight);
    landingRenderer.shadowMap.enabled = true;
    canvasBox.appendChild(landingRenderer.domElement);

    landingScene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xfffaed, 1.4);
    sun.position.set(10, 25, 10);
    sun.castShadow = true;
    landingScene.add(sun);

    // Zemin ve Ev
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x1e3a1e, roughness:1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; landingScene.add(ground);

    landHouse = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5), new THREE.MeshStandardMaterial({ color: 0xf1f5f9 }));
    landHouse.position.y = 2; landHouse.castShadow = true; landHouse.receiveShadow = true; landingScene.add(landHouse);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.4, 5.4), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
    roof.position.set(0, 4.2, 0); roof.rotation.z = -0.3; roof.castShadow = true; landingScene.add(roof);

    landGasPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 16), new THREE.MeshStandardMaterial({ color: 0xeab308 }));
    landGasPipe.position.set(-3.1, 1.5, 1); landingScene.add(landGasPipe);

    // Gizli Animasyon Elemanları
    landPanels = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.05, 4), new THREE.MeshStandardMaterial({ color: 0x020617, metalness:0.8 }));
    landPanels.position.set(0, 4.5, 0); landPanels.rotation.z = -0.3; landPanels.scale.set(0,0,0); landingScene.add(landPanels);

    landBattery = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 1), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
    landBattery.position.set(1, 0.9, -2.6); landBattery.scale.set(0,0,0); landingScene.add(landBattery);

    landHP = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.7), new THREE.MeshStandardMaterial({ color: 0x475569 }));
    landHP.position.set(-3.5, 0.7, -1); landHP.scale.set(0,0,0); landingScene.add(landHP);

    landEV = new THREE.Group();
    const cBody = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1, 1.6), new THREE.MeshStandardMaterial({ color: 0x0284c7 })); cBody.position.y = 0.7;
    const cTop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 1.4), new THREE.MeshStandardMaterial({ color: 0x0f172a })); cTop.position.set(-0.3, 1.5, 0);
    landEV.add(cBody); landEV.add(cTop); landEV.position.set(4.5, 0, 0); landEV.scale.set(0,0,0);
    landingScene.add(landEV);

    window.addEventListener('scroll', () => {
        const scrollArea = document.getElementById('scrollMagicArea');
        if(!scrollArea) return;
        const progress = Math.min(Math.max(window.scrollY / (scrollArea.clientHeight - window.innerHeight), 0), 1);

        let sPan = progress > 0.1 ? Math.min((progress - 0.1) * 5, 1) : 0; landPanels.scale.set(sPan, sPan, sPan);
        let sBat = progress > 0.35 ? Math.min((progress - 0.35) * 5, 1) : 0; landBattery.scale.set(sBat, sBat, sBat);
        let sHp = progress > 0.60 ? Math.min((progress - 0.60) * 5, 1) : 0; landHP.scale.set(sHp, sHp, sHp);
        let sGas = progress > 0.60 ? Math.max(1 - (progress - 0.60) * 5, 0) : 1; landGasPipe.scale.set(sGas, sGas, sGas);
        let sEv = progress > 0.82 ? Math.min((progress - 0.82) * 6, 1) : 0; landEV.scale.set(sEv, sEv, sEv);

        const ind = document.getElementById('scrollIndicator');
        if(ind) ind.style.opacity = progress > 0.05 ? '0' : '1';
    });

    function animate() {
        requestAnimationFrame(animate);
        landingScene.rotation.y = window.scrollY * 0.0008; 
        landingRenderer.render(landingScene, landingCamera);
    }
    animate();
}

// YATIRIMCI PUBLIC BAŞVURU SİSTEMİ
window.openLeadModal = function(type) {
    document.getElementById('leadType').value = type;
    document.getElementById('leadModalTitle').innerText = type === 'kurulum' ? 'Yeni GES Kurulum Başvuru Formu' : 'Teknik Servis & Müdahale Başvuru Formu';
    document.getElementById('leadModal').classList.remove('hidden');
};
window.closeLeadModal = function() { document.getElementById('leadModal').classList.add('hidden'); };

document.getElementById('leadPublicForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const randomCode = "EPC-" + Math.floor(1000 + Math.random() * 9000);
    alert(`🎉 Başvurunuz Merkeze İletildi!\n\nLütfen Takip Kodunuzu Not Edin: ${randomCode}`);
    closeLeadModal();
    document.getElementById('leadTrackInput').value = randomCode;
    
    // Test Gösterimi (Gerçek Supabase bağlandığında bu kısım güncellenecek)
    const display = document.getElementById('trackResultDisplay');
    display.classList.remove('hidden');
    display.className = "mt-4 p-4 rounded-xl text-sm font-bold bg-yellow-100 text-yellow-800";
    display.innerHTML = `<p><strong>Müşteri:</strong> ${document.getElementById('leadName').value}</p><p><strong>Durum:</strong> Başvuru İletildi, İnceleniyor...</p>`;
});


// ============================================================================
// MODÜL: EV YÜK HESAPLAYICISI
// ============================================================================
let activeEVTab = 'tabBill';

document.querySelectorAll('.ev-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.ev-tab-btn').forEach(b => {
            b.classList.remove('bg-teal-600', 'text-white'); b.classList.add('bg-gray-100', 'text-gray-600');
        });
        e.target.classList.remove('bg-gray-100', 'text-gray-600'); e.target.classList.add('bg-teal-600', 'text-white');
        document.querySelectorAll('.ev-tab-content').forEach(c => c.classList.add('hidden'));
        activeEVTab = e.target.getAttribute('data-target');
        document.getElementById(activeEVTab).classList.remove('hidden');
        calculateEVSolar(); 
    });
});

document.querySelectorAll('.ev-reactive-input').forEach(input => {
    input.addEventListener('input', calculateEVSolar);
});

function calculateEVSolar() {
    const tariff = parseFloat(document.getElementById('evCalcTariff')?.value) || 2.50;
    const evRange = parseFloat(document.getElementById('evCalcRange')?.value) || 1;
    const evBattery = parseFloat(document.getElementById('evCalcBattery')?.value) || 1;
    const evConsumption = parseFloat(document.getElementById('evCalcConsumption')?.value) || 1;
    
    const userRoof = parseFloat(document.getElementById('evInputRoof')?.value) || 0;
    const maxUsableRoof = userRoof * 0.8;
    
    let requiredPowerKwp = 0, dailyProductionKwh = 0;

    if (activeEVTab === 'tabBill') {
        const monthlyBill = parseFloat(document.getElementById('evInputBill')?.value) || 0;
        dailyProductionKwh = (monthlyBill / tariff) / 30;
    } else if (activeEVTab === 'tabKwh') {
        const kwh = parseFloat(document.getElementById('evInputKwh')?.value) || 0;
        dailyProductionKwh = kwh / 30;
        document.getElementById('dynamicBillEquiv').innerText = (kwh * tariff).toFixed(2) + " TL";
    } else if (activeEVTab === 'tabKm') {
        const km = parseFloat(document.getElementById('evInputKm')?.value) || 0;
        dailyProductionKwh = (km * (evConsumption / 100)) / 30;
    }

    requiredPowerKwp = dailyProductionKwh / 4;
    const requiredAreaM2 = requiredPowerKwp * 5;
    
    document.getElementById('resPower').innerText = requiredPowerKwp.toFixed(2);
    document.getElementById('resArea').innerText = requiredAreaM2.toFixed(1);
    document.getElementById('resProduction').innerText = Math.round(dailyProductionKwh * 30);
    document.getElementById('resSolarRange').innerText = Math.round(((dailyProductionKwh * 30) / evBattery) * evRange);
    
    const warning = document.getElementById('roofWarningBanner');
    if(warning) warning.classList.toggle('hidden', requiredAreaM2 <= maxUsableRoof);
}


// ============================================================================
// MODÜL: SATIŞ ASİSTAN YARDIMCISI (COPILOT)
// ============================================================================
const salesScenarios = {
    kurulum: {
        "300 m² evim var, GES istiyorum": "Metrekare hesabı üzerinden güneş enerjisi sistemi hesaplayamayız. Tüketim alışkanlıklarınızdan veya faturanızdan konuşmaya devam edelim.",
        "3.000 TL fatura ödüyorum": "Bu faturaya göre yaklaşık 10 kW kapasiteli bir sistem tavsiye edebilirim. Çatınızda 50 metrekare yer kaplar. Bölgenizde çok elektrik kesiliyor mu?",
        "Peki maliyeti nedir?": "10 kW sistem ve 5 kWh batarya için referans bedel: Toplam <strong>{totalPrice} Dolar</strong> civarıdır. Kesin fiyat için keşfe gelelim.",
        "Şu an kendimi hazır hissetmiyorum": "Güneş her gün doğup batıyor. O enerjiyi her gün bedava üretip faturanızı sıfırlamak varken neden bekleyerek para kaybetmeye devam edelim?"
    },
    danismanlik: {
        "Sürece nasıl başlayabilirim / Maliyeti nedir?": "Sizi tüm karmaşadan ve yanlış karar riskinden kurtaran danışmanlık hizmetimizin bedeli <strong>{consultPrice} TL</strong>'dir.",
        "Bu fiyat çok fazla geldi": "Haklısınız, ek maliyet gibi görünebilir. Ancak sizi ucuz ve çöp olacak ürünlerden koruyoruz. Çöpe gidecek yüzbinlerce liradan tasarruf edeceksiniz."
    }
};

document.getElementById('btnStartCall')?.addEventListener('click', () => {
    document.getElementById('salesSetupArea').classList.add('hidden');
    document.getElementById('activeCallArea').classList.remove('hidden');
    
    const compType = document.querySelector('input[name="companyType"]:checked').value;
    const kwPrice = parseFloat(document.getElementById('baseKwPrice').value) || 0;
    const batPrice = parseFloat(document.getElementById('baseBatPrice').value) || 0;
    const consultPrice = parseFloat(document.getElementById('baseConsultPrice').value) || 0;
    
    const container = document.getElementById('objectionButtonsContainer');
    container.innerHTML = '';
    
    for (const [objection, response] of Object.entries(salesScenarios[compType])) {
        const btn = document.createElement('button');
        btn.className = "text-left w-full bg-white hover:bg-orange-50 border p-3 rounded-lg shadow-sm";
        btn.innerHTML = `💬 "${objection}"`;
        btn.addEventListener('click', () => {
            const finalRes = response.replace('{totalPrice}', ((10*kwPrice)+(5*batPrice)).toLocaleString())
                                     .replace('{consultPrice}', consultPrice.toLocaleString());
            document.getElementById('scriptDisplayArea').innerHTML = `<p class="text-white text-2xl leading-relaxed font-light">${finalRes}</p>`;
        });
        container.appendChild(btn);
    }
});

document.getElementById('btnEndCall')?.addEventListener('click', () => {
    document.getElementById('activeCallArea').classList.add('hidden');
    document.getElementById('salesSetupArea').classList.remove('hidden');
    document.getElementById('scriptDisplayArea').innerHTML = `<p class="text-slate-500 italic">Müşterinin söylediği cümleyi seçtiğinizde, yanıt burada belirecektir.</p>`;
});


// ============================================================================
// MODÜL: UYGULAMA İÇİ (DASHBOARD) 3D SİMÜLASYON
// ============================================================================
let appScene, appCamera, appRenderer;
function initApp3DScene() {
    const container = document.getElementById('three-canvas-container');
    if (!container || appScene) return;

    appScene = new THREE.Scene();
    appScene.background = new THREE.Color(0xdbeafe); 
    appCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    appCamera.position.set(22, 16, 28); 

    appRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    appRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(appRenderer.domElement);

    const house = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 6), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
    house.position.set(-2, 2.25, 0); appScene.add(house);

    document.getElementById('loading3D').style.display = 'none';
    
    appScene.add(new THREE.AmbientLight(0xffffff, 0.8));

    function animate() {
        requestAnimationFrame(animate);
        appRenderer.render(appScene, appCamera);
    }
    animate();
}