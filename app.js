// ============================================================================
// SOLARSaaS EPC YÖNETİM MERKEZİ - NİHAİ ANA JAVASCRIPT MOTORU
// ============================================================================

// --- 1. SUPABASE VE EMAILJS BAĞLANTILARI ---
const SUPABASE_URL = 'https://bxcghdbrafzudiigeeud.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_EiDGhm4bT-acQ8xrV9RU4w_4wkUQGys';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUserProfile = null;

emailjs.init("qrBU4c3EChsaZhBZS");

// --- 2. SPA (SINGLE PAGE APPLICATION) YÖNLENDİRİCİ ---
window.isLanding3DInitialized = false;
window.isApp3DInitialized = false;

async function handleSPA_Routing() {
    const hash = window.location.hash || '#home';
    
    const landing = document.getElementById('landingContainer');
    const auth = document.getElementById('authContainer');
    const app = document.getElementById('appContainer');
    
    if(landing) landing.classList.add('hidden');
    if(auth) auth.classList.add('hidden');
    if(app) app.classList.add('hidden');
    
    if (hash === '#home' && landing) {
        landing.classList.remove('hidden');
        if(!window.isLanding3DInitialized) { initLanding3DScene(); window.isLanding3DInitialized = true; }
    } else if (hash === '#auth' && auth) {
        auth.classList.remove('hidden');
    } else if (hash === '#app' && app) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            window.location.hash = '#auth';
            return;
        }
        app.classList.remove('hidden');
    }
}

window.addEventListener('hashchange', handleSPA_Routing);

window.addEventListener('load', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        await fetchUserProfile(session.user.id, session.user.email);
        if (window.location.hash === '#auth' || window.location.hash === '') {
            window.location.hash = '#app';
        }
    }
    handleSPA_Routing();
});


// --- 3. AUTH (GİRİŞ / KAYIT / PROFİL) İŞLEMLERİ ---
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

tabLogin?.addEventListener('click', () => {
    loginForm.classList.remove('hidden'); registerForm.classList.add('hidden');
    tabLogin.classList.add('text-blue-600', 'border-b-2'); tabLogin.classList.remove('text-gray-400');
    tabRegister.classList.add('text-gray-400'); tabRegister.classList.remove('text-blue-600', 'border-b-2');
});

tabRegister?.addEventListener('click', () => {
    registerForm.classList.remove('hidden'); loginForm.classList.add('hidden');
    tabRegister.classList.add('text-blue-600', 'border-b-2'); tabRegister.classList.remove('text-gray-400');
    tabLogin.classList.add('text-gray-400'); tabLogin.classList.remove('text-blue-600', 'border-b-2');
});

registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnRegisterSubmit');
    btn.textContent = "Kaydediliyor..."; btn.disabled = true;

    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const { data, error } = await supabaseClient.auth.signUp({ email, password });

    if (error) { alert("Kayıt Hatası: " + error.message); } 
    else if (data.user) {
        const role = (email === 'erdem.yvz@hotmail.com') ? 'admin' : 'user';
        await supabaseClient.from('profiles').insert([{ 
            id: data.user.id, 
            first_name: document.getElementById('regName').value, 
            last_name: document.getElementById('regSurname').value, 
            company_name: document.getElementById('regCompany').value, 
            phone: document.getElementById('regPhone').value, 
            role: role 
        }]);
        alert("Kayıt Başarılı! E-postanızı onaylayın veya giriş yapın."); 
        registerForm.reset(); tabLogin.click();
    }
    btn.textContent = "Hesap Oluştur"; btn.disabled = false;
});

loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnLoginSubmit');
    btn.textContent = "Giriş Yapılıyor..."; btn.disabled = true;

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value,
    });

    if (error) { alert("Giriş Başarısız: Bilgilerinizi kontrol edin."); } 
    else if (data.user) {
        await fetchUserProfile(data.user.id, data.user.email);
        window.location.hash = '#app';
        loginForm.reset();
    }
    btn.textContent = "Sisteme Giriş Yap"; btn.disabled = false;
});

async function fetchUserProfile(userId, displayEmail) {
    const { data } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    if (data) {
        currentUserProfile = data;
        document.getElementById('userNameDisplay').textContent = `${data.first_name} ${data.last_name}`;
        document.getElementById('userCompanyDisplay').textContent = data.company_name;
        document.getElementById('userEmailDisplay').textContent = displayEmail;
        document.getElementById('userInitials').textContent = data.first_name.charAt(0).toUpperCase();

        const adminCard = document.getElementById('adminPanelCard');
        if(adminCard) adminCard.classList.toggle('hidden', data.role !== 'admin');
    }
}

const btnProfile = document.getElementById('btnProfile');
const profileDropdown = document.getElementById('profileDropdown');
btnProfile?.addEventListener('click', () => profileDropdown.classList.toggle('hidden'));

document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    currentUserProfile = null;
    profileDropdown.classList.add('hidden');
    window.location.hash = '#home';
});


const menuMap = {
    'btnGoSectoral': 'sectoralModule',                       
    'btnGoRegulations': 'regulationsModule',
    'btnGoCRM': 'crmModule',
    'btnGoCompanyMgmt': 'companyManagementModule',
    'btnGoCalculator': 'calculatorModule',
    'btnGoSimulation': 'simulationModule',
    'btnGoEVCalc': 'evCalcModule',
    'btnGoTechSupport': 'techSupportModule',
    'btnGoSalesAssistant': 'salesAssistantModule',
    'adminPanelCard': 'adminModule'
};

for (const [btnId, modId] of Object.entries(menuMap)) {
    const btn = document.getElementById(btnId);
    if(btn) {
        btn.addEventListener('click', () => {
            document.getElementById('mainMenu').classList.add('hidden');
            document.getElementById(modId).classList.remove('hidden');
            
            if(modId === 'simulationModule' && !window.isApp3DInitialized) {
                initApp3DScene();
                window.isApp3DInitialized = true;
            }
            if(modId === 'evCalcModule') calculateEVSolar();
            if(modId === 'techSupportModule' && currentUserProfile) {
                document.getElementById('tsName').value = `${currentUserProfile.first_name} ${currentUserProfile.last_name}`;
                document.getElementById('tsPhone').value = currentUserProfile.phone;
            }
        });
    }
}

const backButtons = ['btnBackToMenu', 'btnBackToMenuFromSim', 'btnBackToMenuFromEV', 'btnBackToMenuFromSupport', 'btnBackToMenuFromSales', 'btnBackToMenuFromAdmin', 'btnBackToMenuFromCRM', 'btnBackToMenuFromCompanyMgmt', 'btnBackToMenuFromReg', 'btnBackToMenuFromSectoral'];
backButtons.forEach(id => {
    const btn = document.getElementById(id);
    if(btn) {
        btn.addEventListener('click', () => {
            Object.values(menuMap).forEach(modId => document.getElementById(modId)?.classList.add('hidden'));
            document.getElementById('mainMenu').classList.remove('hidden');
        });
    }
});


// --- 4.1 FİRMA YÖNETİMİ SEKME (TAB) VE YZ SİMÜLASYON AYARLARI ---
document.querySelectorAll('.cm-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.cm-tab-btn').forEach(b => {
            b.classList.remove('bg-emerald-600', 'text-white');
            b.classList.add('bg-slate-100', 'text-slate-600');
        });
        e.target.classList.remove('bg-slate-100', 'text-slate-600');
        e.target.classList.add('bg-emerald-600', 'text-white');
        
        document.querySelectorAll('.cm-tab-content').forEach(c => c.classList.add('hidden'));
        const targetId = e.target.getAttribute('data-target');
        document.getElementById(targetId)?.classList.remove('hidden');
    });
});



// ============================================================================
// YAPAY ZEKA (AI) MEGA-PROMPT MOTORU
// ============================================================================

function generateAIPrompt(companyData) {
    return `
Sen, Michael Gerber'in "E-Myth" prensiplerini ve Donald Miller'ın "StoryBrand" çerçevesini kusursuz bir şekilde benimsemiş, dünya çapında üst düzey bir "Kurumsal Dönüşüm ve İşletme Danışmanı"sın. Amacın, şirketlerin sistem kurmasına, kârlılığını artırmasına ve kurucuya bağımlı olmaktan kurtulmasına yardımcı olmaktır.

Şu an analiz edip reçete yazacağın firmanın temel profili aşağıdadır:
--------------------------------------------------
🏢 FİRMA BİLGİLERİ:
- Firma Adı: ${companyData.name}
- Temel Vaadi (Elevator Pitch): ${companyData.pitch}
- Eşsiz Satış Teklifi (USP): ${companyData.usp || "Belirtilmemiş - (Marka farklılaşma sorunu olabilir)"}
- Müşteride Çözdüğü Ana Acı/Sorun: ${companyData.pain || "Belirtilmemiş - (Müşteri empatisi eksik olabilir)"}
--------------------------------------------------

GÖREVİN:
Bu firmanın profiline bakarak, "Marketing", "Satış" ve "Operasyon" başta olmak üzere temel fonksiyonlarda neleri yanlış yapıyor olabileceğini (Teşhis) ve bu sorunları aşmak için hemen yarın sabah uygulamaya koyabilecekleri 3 adımlık acil bir eylem planını (Tedavi) yaz.

KURALLAR:
1. Kurumsal ve ilham verici bir ton kullan, ama asla akademik ve sıkıcı bir jargon kullanma.
2. Tavsiyelerin genel geçer (örn: "sosyal medyayı iyi kullanın") olmasın. Firmanın profiline özel (örn: "Hedef kitlenizin ${companyData.pain} sorununu çözerken sosyal medyada şu kancayı kullanın...") spesifik taktikler ver.
3. Çıktını şık bir HTML formatında, kalın yazılar (<strong>), listeler (<ul>) ve emojiler kullanarak ver ki doğrudan web sitesindeki bir <div> içine basabilelim.
4. Çıktının sonuna mutlaka firmanın "Hero (Kahraman)" değil, müşterinin "Guide (Rehberi)" olduğunu hatırlatan vurucu bir motivasyon cümlesi ekle.
`;
}


// ============================================================================
// YAPAY ZEKA (AI) MEGA-PROMPT MOTORU VE GEMINI API BAĞLANTISINI TETİKLEYEN FONKSİYON
// ============================================================================
    


function generateAIPrompt(companyData) {
    return `
Sen, Michael Gerber'in "E-Myth" prensiplerini ve Donald Miller'ın "StoryBrand" çerçevesini kusursuz bir şekilde benimsemiş, dünya çapında üst düzey bir "Kurumsal Dönüşüm ve İşletme Danışmanı"sın. Amacın, şirketlerin sistem kurmasına, kârlılığını artırmasına ve kurucuya bağımlı olmaktan kurtulmasına yardımcı olmaktır.

Şu an analiz edip reçete yazacağın firmanın temel profili aşağıdadır:
--------------------------------------------------
🏢 FİRMA BİLGİLERİ:
- Firma Adı: ${companyData.name}
- Temel Vaadi (Elevator Pitch): ${companyData.pitch}
- Eşsiz Satış Teklifi (USP): ${companyData.usp || "Belirtilmemiş - (Marka farklılaşma sorunu olabilir)"}
- Müşteride Çözdüğü Ana Acı/Sorun: ${companyData.pain || "Belirtilmemiş - (Müşteri empatisi eksik olabilir)"}
--------------------------------------------------

GÖREVİN:
Bu firmanın profiline bakarak, "Marketing", "Satış" ve "Operasyon" başta olmak üzere temel fonksiyonlarda neleri yanlış yapıyor olabileceğini (Teşhis) ve bu sorunları aşmak için hemen yarın sabah uygulamaya koyabilecekleri 3 adımlık acil bir eylem planını (Tedavi) yaz.

KURALLAR:
1. Kurumsal ve ilham verici bir ton kullan, ama asla akademik ve sıkıcı bir jargon kullanma.
2. Tavsiyelerin genel geçer (örn: "sosyal medyayı iyi kullanın") olmasın. Firmanın profiline özel spesifik taktikler ver.
3. Çıktını şık bir HTML formatında, kalın yazılar (<strong>), başlıklar (<h3>), listeler (<ul>) ve emojiler kullanarak ver ki doğrudan web sitesindeki bir <div> içine basabilelim. Markdown kullanma, sadece saf HTML etiketleri kullan.
4. Çıktının sonuna mutlaka firmanın "Hero (Kahraman)" değil, müşterinin "Guide (Rehberi)" olduğunu hatırlatan vurucu bir motivasyon cümlesi ekle.
`;
}

// 2. Gemini API Tetikleyicisi
document.getElementById('btnRunAI')?.addEventListener('click', async () => {
    // Verileri Topla
    const companyData = {
        name: document.getElementById('cmName').value.trim(),
        pitch: document.getElementById('cmPitch').value.trim(),
        usp: document.getElementById('cmUSP').value.trim(),
        pain: document.getElementById('cmPain').value.trim()
    };
    
    // Kontroller
    if(!companyData.name || !companyData.pitch) {
        alert("Lütfen sağlıklı bir analiz için en azından Firma İsmi ve Temel Vaat alanlarını doldurun.");
        return;
    }

    
    const btn = document.getElementById('btnRunAI');
    btn.textContent = "Yapay Zeka Analiz Ediyor...";
    btn.classList.add('opacity-70', 'cursor-not-allowed');
    btn.disabled = true;
    
    const resultArea = document.querySelector('.bg-slate-800.text-white.p-6.rounded-xl.shadow-sm');
    
    // Yükleniyor Animasyonu
    if (resultArea) {
        resultArea.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12">
                <div class="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p class="text-emerald-400 font-bold animate-pulse">Gemini firmanızı analiz ediyor, lütfen bekleyin...</p>
            </div>
        `;
    }

    const generatedPrompt = generateAIPrompt(companyData);

   try {
        // YENİ: Artık Google'a değil, kendi güvenli arka depomuza gidiyoruz
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt: generatedPrompt }) 
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Arka uç ile bağlantı kurulamadı.");
        }

        // Arka depodan dönen metni al
        const aiResponseText = data.result;

        // Sonucu Ekrana Bas
        if (resultArea) {
            resultArea.innerHTML = `
                <div class="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
                    <h4 class="font-bold text-emerald-400 text-lg">✨ YZ Kurumsal Danışman Reçetesi</h4>
                </div>
                <div class="text-sm text-slate-200 overflow-y-auto max-h-[450px] custom-scrollbar space-y-4 pr-2 leading-relaxed">
                    ${aiResponseText}
                </div>
            `;
        }

    } catch (error) {
        console.error("API Hatası:", error);
        if (resultArea) {
            resultArea.innerHTML = `
                <div class="text-red-400 font-bold p-4 bg-red-900/30 border border-red-800 rounded-lg">
                    ⚠️ Bir hata oluştu: ${error.message}
                </div>
            `;
        }
    } finally {
        btn.textContent = "Yeni Bir Rapor Oluştur";
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
        btn.disabled = false;
    }
});

// ============================================================================
// ORTAK 3D MİMARİ MOTORU (Geri Getirilen ve Düzeltilen Gövde)
// ============================================================================
function createEcoSystem(scene) {
    const objs = {};

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x65a30d }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    const house = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 6), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
    house.position.set(-2, 2.25, 0); house.castShadow = true; house.receiveShadow = true; scene.add(house);
    
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.5, 6.5), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    roof.position.set(-2, 5.50, 0); roof.rotation.z = -0.25; roof.castShadow = true; scene.add(roof);

    const cpMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), cpMat); p1.position.set(7.5, 2, 3); p1.castShadow=true; scene.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), cpMat); p2.position.set(7.5, 2, -3); p2.castShadow=true; scene.add(p2);
    const cpRoof = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 7), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, transparent:true, opacity:0.8 }));
    cpRoof.position.set(4.8, 4, 0); cpRoof.castShadow=true; scene.add(cpRoof);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 10, 16), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
    pole.position.set(-12, 5, -5); pole.castShadow = true; scene.add(pole);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.5), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
    crossbar.position.set(-12, 9, -5); scene.add(crossbar);

    const cableCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-12, 9, -5), new THREE.Vector3(-9, 6.5, -2.5), new THREE.Vector3(-6, 4.5, 0));
    const cableGeo = new THREE.BufferGeometry().setFromPoints(cableCurve.getPoints(20));
    objs.gridCableMat = new THREE.LineDashedMaterial({ color: 0x0ea5e9, linewidth: 2, dashSize: 0.4, gapSize: 0.3 });
    objs.gridCable = new THREE.Line(cableGeo, objs.gridCableMat);
    objs.gridCable.computeLineDistances(); scene.add(objs.gridCable);

    objs.gasPipe = new THREE.Group();
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5), new THREE.MeshStandardMaterial({ color: 0xfacc15 })); pipe.position.set(0, 1.25, 0); 
    const meterBox = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x9ca3af })); meterBox.position.set(0, 2.5, 0.15); 
    objs.gasPipe.add(pipe); objs.gasPipe.add(meterBox); objs.gasPipe.position.set(-5.5, 0, 3.2); scene.add(objs.gasPipe);

    objs.hp = new THREE.Group();
    const hpBody = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x475569 })); hpBody.position.set(0, 0.9, 0);
    const hpFan = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.85, 16), new THREE.MeshStandardMaterial({ color: 0x0f172a })); hpFan.rotation.x = Math.PI/2; hpFan.position.set(0, 0.9, 0.4); 
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.2, 16), new THREE.MeshStandardMaterial({color: 0xe2e8f0})); boiler.position.set(1.2, 1.1, 0); 
    objs.hp.add(hpBody); objs.hp.add(hpFan); objs.hp.add(boiler); objs.hp.position.set(-3.5, 0, 3.6); objs.hp.scale.set(0,0,0); scene.add(objs.hp);

    objs.panels = new THREE.Group();
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x020617, metalness: 0.9, roughness: 0.1 });
    for(let x=0; x<3; x++) { for(let z=0; z<2; z++) { const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 2.8), panelMat); p.position.set(-2.5 + (x*2.4), 0, -1.5 + (z*3)); objs.panels.add(p); } }
    objs.panels.position.set(-2, 5.95, 0); objs.panels.rotation.z = -0.25; objs.panels.scale.set(0,0,0); scene.add(objs.panels);

    objs.inverterGroup = new THREE.Group();
    const inverter = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.3), new THREE.MeshStandardMaterial({ color: 0xcbd5e1 })); 
    inverter.position.set(-5.2, 3.5, -3.2); 
    const solarCable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5), new THREE.MeshStandardMaterial({ color: 0x1f2937 })); 
    solarCable.position.set(-5.2, 4.85, -3.2); 
    objs.inverterGroup.add(inverter); objs.inverterGroup.add(solarCable); objs.inverterGroup.scale.set(0,0,0); scene.add(objs.inverterGroup);

    objs.batteries = [];
    for(let i=0; i<4; i++) {
        const bat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.6), new THREE.MeshStandardMaterial({ color: 0xf1f5f9 }));
        bat.position.set(-0.5 - (i * 1.2), 1.1, -3.3); 
        bat.castShadow = true; bat.scale.set(0,0,0);
        scene.add(bat); objs.batteries.push(bat);
    }

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


// --- 5. AÇILIŞ SAYFASI (LANDING) 3D SCROLL MOTORU ---
let landingScene, landingCamera, landingRenderer, landObjs;

function applyFlashEffect(objGroup, scaleValue) {
    if(!objGroup) return;
    objGroup.scale.set(scaleValue, scaleValue, scaleValue);
    const isFlashing = (scaleValue > 0.05 && scaleValue < 0.95);
    const glowColor = isFlashing ? 0x64748b : 0x000000;
    objGroup.traverse(child => {
        if (child.isMesh && child.material) {
            child.material.emissive.setHex(glowColor);
        }
    });
}

function initLanding3DScene() {
    const canvasBox = document.getElementById('hero3DCanvas');
    if (!canvasBox) return;

    landingScene = new THREE.Scene();
    landingScene.background = new THREE.Color(0x0f172a); 

    const width = canvasBox.clientWidth || window.innerWidth;
    const height = canvasBox.clientHeight || window.innerHeight;

    landingCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    landingCamera.position.set(-24, 18, 30);
    landingCamera.lookAt(-2, 2, 0); 

    landingRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    landingRenderer.setSize(width, height);
    landingRenderer.setPixelRatio(window.devicePixelRatio);
    landingRenderer.shadowMap.enabled = true;
    landingRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasBox.appendChild(landingRenderer.domElement);

    landingScene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xfffaed, 1.5);
    sun.position.set(15, 30, 15); sun.castShadow = true;
    landingScene.add(sun);

    landObjs = createEcoSystem(landingScene);

    window.addEventListener('resize', () => {
        if(document.getElementById('landingContainer').classList.contains('hidden')) return;
        const newWidth = canvasBox.clientWidth || window.innerWidth;
        const newHeight = canvasBox.clientHeight || window.innerHeight;
        landingCamera.aspect = newWidth / newHeight;
        landingCamera.updateProjectionMatrix();
        landingRenderer.setSize(newWidth, newHeight);
    });

    window.addEventListener('scroll', () => {
        const scrollArea = document.getElementById('scrollMagicArea');
        if(!scrollArea || !landObjs) return;
        const progress = Math.min(Math.max(window.scrollY / (scrollArea.clientHeight - window.innerHeight), 0), 1);

        let sPan = progress > 0.05 ? Math.min((progress - 0.05) * 10, 1) : 0; 
        applyFlashEffect(landObjs.panels, sPan); 
        applyFlashEffect(landObjs.inverterGroup, sPan);
        
        let sBat = progress > 0.10 ? Math.min((progress - 0.10) * 10, 1) : 0; 
        landObjs.batteries.forEach(b => applyFlashEffect(b, sBat));
        
        let sHp = progress > 0.15 ? Math.min((progress - 0.15) * 10, 1) : 0; 
        applyFlashEffect(landObjs.hp, sHp);
        
        let sGas = progress > 0.15 ? Math.max(1 - (progress - 0.15) * 10, 0) : 1; 
        if(landObjs.gasPipe) landObjs.gasPipe.scale.set(sGas, sGas, sGas);
        
        let sEv = progress > 0.20 ? Math.min((progress - 0.20) * 10, 1) : 0; 
        landObjs.evs.forEach(v => applyFlashEffect(v, sEv));

        if(landObjs.gridCable) landObjs.gridCable.visible = progress < 0.25;

        const ind = document.getElementById('scrollIndicator');
        if(ind) ind.style.opacity = progress > 0.02 ? '0' : '1';
    });

    function animate() {
        requestAnimationFrame(animate);
        landingScene.rotation.y = -window.scrollY * 0.0012; 
        if(landObjs && landObjs.gridCableMat) landObjs.gridCableMat.dashOffset -= 0.05; 
        landingRenderer.render(landingScene, landingCamera);
    }
    animate();
}

window.openLeadModal = function(type) {
    document.getElementById('leadType').value = type;
    document.getElementById('leadModalTitle').innerText = type === 'kurulum' ? 'Yeni GES Kurulum Başvuru Formu' : 'Teknik Servis & Müdahale Başvuru Formu';
    document.getElementById('leadDetailsLabel').innerText = type === 'kurulum' ? 'Eklemek İstediğiniz Notlar' : 'Yaşadığınız Sorunun Detaylı Özeti';
    
    const extraFields = document.getElementById('kurulumExtraFields');
    if (type === 'kurulum') {
        extraFields?.classList.remove('hidden');
    } else {
        extraFields?.classList.add('hidden');
    }
    document.getElementById('leadModal')?.classList.remove('hidden');
};

window.closeLeadModal = function() { 
    document.getElementById('leadModal')?.classList.add('hidden'); 
    document.getElementById('leadPublicForm')?.reset();
};

document.getElementById('leadPublicForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('leadType').value;
    
    if (type === 'kurulum') {
        const intent = document.getElementById('leadIntent').value;
        if (intent === 'satis') {
            alert("⚠️ BAŞVURUNUZ KABUL EDİLEMEDİ\n\nTürkiye'deki mevcut lisanssız elektrik üretim yönetmelikleri (Mahsuplaşma) gereği, evsel sistemlerde 'sadece üretip satarak para kazanmak' ticari bir model olarak uygun değildir. Sistem sadece kendi öz tüketiminizi karşılamak üzere tasarlandığında yasal ve kârlı olmaktadır.\n\nLütfen amacınızı öz tüketim olarak güncelleyerek tekrar başvurun.");
            return;
        }
    }

    const randomCode = "EPC-" + Math.floor(1000 + Math.random() * 9000);
    let combinedDetails = document.getElementById('leadDetails').value;
    if (type === 'kurulum') {
        const outage = document.getElementById('leadOutage').value;
        const extraCons = document.getElementById('leadExtraConsumption').value || 'Yok';
        combinedDetails = `[Şebeke Kesintisi: ${outage}] | [İlave Tüketim Planı: ${extraCons}]\n\nMüşteri Notu: ${combinedDetails}`;
    }

    const leadData = {
        user_id: "00000000-0000-0000-0000-000000000000",
        full_name: document.getElementById('leadName').value,
        phone: document.getElementById('leadPhone').value,
        email: document.getElementById('leadEmail').value,
        address: document.getElementById('leadAddress').value,
        inverter_model: type === 'kurulum' ? 'Yeni Kurulum Talebi' : 'Servis İhtiyacı',
        problem_desc: combinedDetails,
        installer_name: randomCode,
        status: 'Başvuru İletildi'
    };

    const { error } = await supabaseClient.from('support_tickets').insert([leadData]);

    if (!error) {
        alert(`🎉 Başvurunuz İletildi!\n\nLütfen Takip Kodunuzu Not Edin: ${randomCode}`);
        closeLeadModal();
        document.getElementById('leadTrackInput').value = randomCode;
        document.getElementById('btnTrackQuery').click();
    } else {
        alert("Hata: Başvuru gönderilemedi. Bağlantınızı kontrol edin.");
    }
});

document.getElementById('btnTrackQuery')?.addEventListener('click', async () => {
    const code = document.getElementById('leadTrackInput').value.trim();
    const display = document.getElementById('trackResultDisplay');
    if(!code) return;

    display.classList.remove('hidden', 'bg-yellow-100', 'text-yellow-800', 'bg-blue-100', 'text-blue-800', 'bg-green-100', 'text-green-800', 'bg-red-100', 'text-red-800');
    display.className = "mt-4 p-4 rounded-xl text-sm font-bold bg-slate-100 text-slate-800";
    display.innerHTML = "Sorgulanıyor...";

    try {
        const { data, error } = await supabaseClient.from('support_tickets').select('*').eq('installer_name', code).single();
        if (error || !data) {
            display.className = "mt-4 p-4 rounded-xl text-sm font-bold bg-red-100 text-red-800";
            display.innerText = "Kayıt Bulunamadı. Takip kodunuzu doğru yazdığınızdan emin olun.";
            return;
        }
        let c = "bg-yellow-100 text-yellow-800";
        if(data.status === 'Değerlendiriliyor') c = "bg-blue-100 text-blue-800";
        if(data.status === 'Dönüş Yapıldı') c = "bg-green-100 text-green-800";

        display.className = `mt-4 p-4 rounded-xl text-sm font-bold ${c}`;
        display.innerHTML = `<p><strong>Müşteri:</strong> ${data.full_name}</p><p><strong>Durum:</strong> ${data.status}</p>${data.admin_response ? `<p class="mt-2 pt-2 border-t border-black/10"><strong>Merkez Notu:</strong> ${data.admin_response}</p>` : ''}`;
    } catch (err) {
        display.className = "mt-4 p-4 rounded-xl text-sm font-bold bg-red-100 text-red-800";
        display.innerText = "Sistemsel bir hata oluştu, lütfen daha sonra tekrar deneyin.";
    }
});


// --- 6. GÜÇ HESAPLAYICI (ORİJİNAL) ---
let sonAylik = 0, sonYillik = 0, sonFatura = 0; 

function addApplianceRow(name = "", qty = 1, kw = "", hrs = "") {
    const row = document.createElement('div'); row.className = "appliance-row grid grid-cols-12 gap-2 items-center mt-2";
    row.innerHTML = `<div class="col-span-4"><input type="text" placeholder="Adı" value="${name}" class="w-full p-2 border rounded text-sm"></div><div class="col-span-2"><input type="number" value="${qty}" class="app-qty w-full p-2 border rounded text-sm text-center"></div><div class="col-span-3"><input type="number" placeholder="kW" value="${kw}" step="0.01" class="app-kw w-full p-2 border rounded text-sm text-center"></div><div class="col-span-2"><input type="number" placeholder="Saat" value="${hrs}" class="app-hrs w-full p-2 border rounded text-sm text-center"></div><div class="col-span-1 text-center"><button class="btn-delete-app text-red-500 font-bold text-lg">&times;</button></div>`;
    row.querySelector('.btn-delete-app').addEventListener('click', () => row.remove()); if(appliancesWrapper) appliancesWrapper.appendChild(row);
}

if(document.getElementById('btnAddAppliance')) {
    const defaultApps = [{ name: 'Buzdolabı', qty: 1, kw: 0.15, hrs: 240 }, { name: 'Televizyon', qty: 1, kw: 0.1, hrs: 120 }, { name: 'Çamaşır Makinesi', qty: 1, kw: 0.8, hrs: 20 }, { name: 'Bulaşık Makinesi', qty: 1, kw: 1.2, hrs: 15 }, { name: 'Aydınlatma', qty: 10, kw: 0.01, hrs: 150 }];
    defaultApps.forEach(app => addApplianceRow(app.name, app.qty, app.kw, app.hrs));
    document.getElementById('btnAddAppliance').addEventListener('click', () => addApplianceRow());
    document.getElementById('quickAddSelect').addEventListener('change', e => { if (e.target.value) { const [n, q, k, h] = e.target.value.split('|'); addApplianceRow(n, q, k, h); e.target.value = ""; } });
}

document.querySelectorAll('input[name="inputType"]')?.forEach(radio => {
    radio.addEventListener('change', (e) => {
        document.querySelectorAll('.input-section').forEach(sec => sec.classList.add('hidden'));
        const targetEl = document.getElementById(e.target.value + 'InputSection');
        if (targetEl) targetEl.classList.remove('hidden');
    });
});

document.getElementById('hasFutureLoads')?.addEventListener('change', e => document.getElementById('futureLoadsContainer').classList.toggle('hidden', !e.target.checked));
document.getElementById('checkEV')?.addEventListener('change', e => document.getElementById('wrapEV').classList.toggle('hidden', !e.target.checked));
document.getElementById('checkHP')?.addEventListener('change', e => document.getElementById('wrapHP').classList.toggle('hidden', !e.target.checked));
document.getElementById('btnAddCustomLoad')?.addEventListener('click', () => {
    const row = document.createElement('div'); row.className = "flex space-x-2 bg-gray-50 p-2 rounded border border-gray-200";
    row.innerHTML = `<input type="text" placeholder="Yük Adı" class="w-1/2 p-2 border rounded text-sm"><input type="number" placeholder="Aylık" class="custom-load-input w-1/3 p-2 border rounded text-sm" value="0"><button class="btn-delete-load text-red-500 font-bold px-2">X</button>`;
    row.querySelector('.btn-delete-load').addEventListener('click', () => row.remove()); document.getElementById('customLoadsWrapper').appendChild(row);
});

document.getElementById('btnCalculate')?.addEventListener('click', () => {
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

    sonAylik = base + extra; sonYillik = sonAylik * 12; 
    let trf = parseFloat(document.getElementById('tariffSelect').value); sonFatura = sonAylik * trf;

    document.getElementById('finalMonthlyLoad').textContent = Math.round(sonAylik).toLocaleString('tr-TR');
    document.getElementById('finalYearlyLoad').textContent = Math.round(sonYillik).toLocaleString('tr-TR');
    document.getElementById('finalMonthlyBill').textContent = sonFatura.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    document.getElementById('resultsModule').classList.remove('hidden'); 
    document.getElementById('resultsModule').scrollIntoView({ behavior: 'smooth' });
});


// --- 7. UYGULAMA İÇİ (DASHBOARD) 3D SİMÜLASYON ---
let appScene, appCamera, appRenderer, appControls;
let stateGES = false, stateHP = false;
let countBat = 0, countEV = 0;

function initApp3DScene() {
    const container = document.getElementById('three-canvas-container');
    if (!container || appScene) return;

    appScene = new THREE.Scene();
    appScene.background = new THREE.Color(0xdbeafe); 
    appCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    appCamera.position.set(22, 16, 28); 

    appRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    appRenderer.setSize(container.clientWidth, container.clientHeight);
    appRenderer.shadowMap.enabled = true;
    appRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    appRenderer.domElement.style.position = 'absolute';
    appRenderer.domElement.style.top = '0';
    appRenderer.domElement.style.left = '0';
    container.appendChild(appRenderer.domElement);

    appControls = new THREE.OrbitControls(appCamera, appRenderer.domElement);
    appControls.enableDamping = true; appControls.dampingFactor = 0.05;
    appControls.maxPolarAngle = Math.PI / 2 - 0.05;

    appScene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.5);
    sunLight.position.set(15, 30, 15); sunLight.castShadow = true;
    appScene.add(sunLight);

    appObjs = createEcoSystem(appScene);
    document.getElementById('loading3D').style.display = 'none';

    document.getElementById('btnSimGES').addEventListener('click', (e) => { stateGES = !stateGES; e.target.classList.toggle('bg-green-600'); updateAppScore(); });
    document.getElementById('btnSimHP').addEventListener('click', (e) => { stateHP = !stateHP; e.target.classList.toggle('bg-green-600'); updateAppScore(); });
    document.getElementById('btnSimBatPlus').addEventListener('click', () => { if(countBat < 4) { countBat++; updateAppScore(); }});
    document.getElementById('btnSimBatMinus').addEventListener('click', () => { if(countBat > 0) { countBat--; updateAppScore(); }});
    document.getElementById('btnSimEVPlus').addEventListener('click', () => { if(countEV < 2) { countEV++; updateAppScore(); }});
    document.getElementById('btnSimEVMinus').addEventListener('click', () => { if(countEV > 0) { countEV--; updateAppScore(); }});

    function animate() {
        requestAnimationFrame(animate);
        if (appObjs) {
            appObjs.panels.scale.lerp(new THREE.Vector3(stateGES?1:0, stateGES?1:0, stateGES?1:0), 0.1);
            appObjs.inverterGroup.scale.lerp(new THREE.Vector3(stateGES?1:0, stateGES?1:0, stateGES?1:0), 0.1);
            appObjs.hp.scale.lerp(new THREE.Vector3(stateHP?1:0, stateHP?1:0, stateHP?1:0), 0.1);
            appObjs.gasPipe.scale.lerp(new THREE.Vector3(stateHP?0:1, stateHP?0:1, stateHP?0:1), 0.1);
            appObjs.batteries.forEach((b, i) => b.scale.lerp(new THREE.Vector3(i<countBat?1:0, i<countBat?1:0, i<countBat?1:0), 0.1));
            appObjs.evs.forEach((v, i) => v.scale.lerp(new THREE.Vector3(i<countEV?1:0, i<countEV?1:0, i<countEV?1:0), 0.1));
            
            if(appObjs.gridCableMat) appObjs.gridCableMat.dashOffset -= 0.05; 
            if(appObjs.gridCable) appObjs.gridCable.visible = currentGrid > 0; 
        }
        appControls.update();
        appRenderer.render(appScene, appCamera);
    }
    animate();
}

function updateAppScore() {
    let score = 0; let grid = 100; let carbon = "Yüksek"; let fossil = "Aktif";
    document.getElementById('batCountDisplay').innerText = countBat;
    document.getElementById('evCountDisplay').innerText = countEV;
    if (stateGES) { score += 30; grid -= 30; carbon = "Orta"; }
    score += countBat * 10; grid -= countBat * 10;
    if (countBat > 0 && stateGES) carbon = "Düşük";
    score += countEV * 10;
    if (countEV > 0) carbon = "Çok Düşük";
    if (stateHP) { score += 20; grid = 0; fossil = "İPTAL EDİLDİ"; carbon = "SIFIR (Net-Zero)"; }

    currentGrid = Math.max(0, grid);
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


// --- 8. EV YÜK HESAPLAYICI ---
let activeEVTab = 'tabBill';

document.querySelectorAll('.ev-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.ev-tab-btn').forEach(b => { 
            b.classList.remove('bg-teal-600', 'text-white'); 
            b.classList.add('bg-gray-100', 'text-gray-600'); 
        });
        e.target.classList.remove('bg-gray-100', 'text-gray-600'); 
        e.target.classList.add('bg-teal-600', 'text-white');
        document.querySelectorAll('.ev-tab-content').forEach(c => c.classList.add('hidden'));
        
        activeEVTab = e.target.getAttribute('data-target');
        document.getElementById(activeEVTab).classList.remove('hidden');
        calculateEVSolar(); 
    });
});

document.querySelectorAll('.ev-reactive-input').forEach(input => input.addEventListener('input', calculateEVSolar));

function calculateEVSolar() {
    const tariff = parseFloat(document.getElementById('evCalcTariff')?.value) || 2.50;
    const evRange = parseFloat(document.getElementById('evCalcRange')?.value) || 1;
    const evBattery = parseFloat(document.getElementById('evCalcBattery')?.value) || 1;
    const evConsumption = parseFloat(document.getElementById('evCalcConsumption')?.value) || 1;
    const evACSpeed = parseFloat(document.getElementById('evCalcACSpeed')?.value) || 11; 
    const userRoof = parseFloat(document.getElementById('evInputRoof')?.value) || 0;
    const maxUsableRoof = userRoof * 0.8;
    
    const recommendationBox = document.getElementById('evChargerRecommendation');
    if (recommendationBox) {
        if (evACSpeed > 0 && evBattery > 0) {
            const chargeTime = (evBattery / evACSpeed).toFixed(1);
            recommendationBox.innerHTML = `<strong>💡 Şarj İstasyonu Önerisi:</strong> Aracınızın tam doluma (%0 - %100) ulaşması ${evACSpeed} kW'lık bir ev tipi şarj cihazı ile yaklaşık <strong>${chargeTime} saat</strong> sürecektir.`;
        } else {
            recommendationBox.innerHTML = "Lütfen geçerli bir batarya ve şarj hızı girin.";
        }
    }

    let requiredPowerKwp = 0, dailyProductionKwh = 0;
    let houseMonthlyKwh = 0, evMonthlyKwh = 0;

    if (activeEVTab === 'tabBill') {
        const monthlyBill = parseFloat(document.getElementById('evInputBill')?.value) || 0;
        houseMonthlyKwh = monthlyBill / tariff;
        evMonthlyKwh = 1500 * (evConsumption / 100); 
    } 
    else if (activeEVTab === 'tabKwh') {
        houseMonthlyKwh = parseFloat(document.getElementById('evInputKwh')?.value) || 0;
        document.getElementById('dynamicBillEquiv').innerText = (houseMonthlyKwh * tariff).toFixed(2) + " TL";
        evMonthlyKwh = 1500 * (evConsumption / 100); 
    } 
    else if (activeEVTab === 'tabKm') {
        const km = parseFloat(document.getElementById('evInputKm')?.value) || 0;
        evMonthlyKwh = km * (evConsumption / 100);
        houseMonthlyKwh = 350; 
    }

    const totalMonthlyKwh = houseMonthlyKwh + evMonthlyKwh;
    dailyProductionKwh = totalMonthlyKwh / 30;

    requiredPowerKwp = dailyProductionKwh / 4;
    const requiredAreaM2 = requiredPowerKwp * 5;
    
    const totalMonthlyProduction = dailyProductionKwh * 30;
    document.getElementById('resPower').innerText = requiredPowerKwp.toFixed(2);
    document.getElementById('resArea').innerText = requiredAreaM2.toFixed(1);
    document.getElementById('resProduction').innerText = Math.round(totalMonthlyProduction).toLocaleString('tr-TR');
    
    const surplusEnergy = Math.max(0, totalMonthlyProduction - houseMonthlyKwh);
    const solarRange = (surplusEnergy / evBattery) * evRange;
    document.getElementById('resSolarRange').innerText = Math.round(solarRange).toLocaleString('tr-TR');
    
    const chargeRatio = evBattery > 0 ? (surplusEnergy / evBattery) * 100 : 0;
    const barWidth = Math.min(chargeRatio, 100); 
    
    const resBar = document.getElementById('resChargeBar');
    const resPercent = document.getElementById('resChargePercent');
    
    if(resBar) resBar.style.width = barWidth + '%';
    if(resPercent) resPercent.innerText = `%${Math.round(chargeRatio)}`;
    
    const warning = document.getElementById('roofWarningBanner');
    if(warning) {
        if (requiredAreaM2 > maxUsableRoof) {
            warning.classList.remove('hidden');
            warning.innerHTML = `⚠️ DİKKAT: İhtiyacınız olan alan (${requiredAreaM2.toFixed(1)} m²), çatınızın limitini (${maxUsableRoof.toFixed(1)} m²) aşıyor.`;
        } else {
            warning.classList.add('hidden');
        }
    }
}


// --- 9. TEKNİK SERVİS MODÜLÜ ---
const tabNewTicket = document.getElementById('tabNewTicket');
const tabMyTickets = document.getElementById('tabMyTickets');
const ticketForm = document.getElementById('ticketForm');
const myTicketsArea = document.getElementById('myTicketsArea');

tabNewTicket?.addEventListener('click', () => {
    ticketForm.classList.remove('hidden'); myTicketsArea.classList.add('hidden');
    tabNewTicket.classList.add('text-red-600', 'border-b-2'); tabNewTicket.classList.remove('text-gray-500');
    tabMyTickets.classList.add('text-gray-500'); tabMyTickets.classList.remove('text-red-600', 'border-b-2');
});
tabMyTickets?.addEventListener('click', () => {
    ticketForm.classList.add('hidden'); myTicketsArea.classList.remove('hidden');
    tabMyTickets.classList.add('text-red-600', 'border-b-2'); tabMyTickets.classList.remove('text-gray-500');
    tabNewTicket.classList.add('text-gray-500'); tabNewTicket.classList.remove('text-red-600', 'border-b-2');
    fetchMyTickets();
});

ticketForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitTicket'); btn.textContent = "Gönderiliyor..."; btn.disabled = true;

    const { error } = await supabaseClient.from('support_tickets').insert([{
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
    }]);

    if (error) alert("Hata: " + error.message);
    else { alert("Talebiniz başarıyla iletildi."); ticketForm.reset(); tabMyTickets.click(); }
    btn.textContent = "Talebi Gönder"; btn.disabled = false;
});

async function fetchMyTickets() {
    const list = document.getElementById('myTicketsList');
    list.innerHTML = '<p class="text-gray-500 text-sm">Yükleniyor...</p>';
    const userId = (await supabaseClient.auth.getUser()).data.user.id;
    const { data, error } = await supabaseClient.from('support_tickets').select('*').eq('user_id', userId).order('created_at', { ascending: false });

    if (error || !data || data.length === 0) { list.innerHTML = '<p class="text-gray-500 text-sm">Talebiniz bulunmuyor.</p>'; return; }
    list.innerHTML = '';
    data.forEach(t => {
        let sc = "bg-yellow-100 text-yellow-800"; if(t.status === "Değerlendiriliyor") sc = "bg-blue-100 text-blue-800"; if(t.status === "Dönüş Yapıldı") sc = "bg-green-100 text-green-800";
        list.innerHTML += `<div class="p-5 bg-white border rounded-xl mb-3"><div class="flex justify-between items-start mb-2"><h4 class="font-bold">${t.inverter_model}</h4><span class="${sc} px-3 py-1 rounded-full text-xs font-bold">${t.status}</span></div><p class="text-sm bg-gray-50 p-2 rounded">${t.problem_desc}</p>${t.admin_response ? `<div class="mt-2 bg-green-50 p-3 rounded border"><p class="text-sm"><strong>Yanıt:</strong> ${t.admin_response}</p>${t.price_quote ? `<p class="font-bold text-green-900">💰 Teklif: ${t.price_quote} TL</p>`:''}</div>` : ''}</div>`;
    });
}


// --- 10. SATIŞ ASİSTAN YARDIMCISI (COPILOT) - DİNAMİK HAVUZ SÜRÜMÜ ---
const salesScenarios = {
    kurulum: {
        "300 m² evim var, GES istiyorum": "Metrekare hesabı üzerinden güneş enerjisi sistemi hesaplayamayız. Tüketim alışkanlıklarınızdan veya faturanızdan konuşmaya devam edelim.",
        "3.000 TL fatura ödüyorum": "Bu faturaya göre yaklaşık 10 kW kapasiteli bir sistem tavsiye edebilirim. Çatınızda 50 metrekare yer kaplar. Bölgenizde çok elektrik kesiliyor mu?",
        "Evet, sık kesiliyor": "Elektrik kesintisinin sık yaşandığı yerlerde mutlaka hibrit sistem and batarya tavsiye etmekteyiz. Kesintinin süresine göre batarya kapasitesini arttırabiliriz.",
        "Peki maliyeti nedir?": "10 kW sistem ve 5 kWh batarya için referans bedel: Toplam <strong>{totalPrice} Dolar</strong> civarıdır. Kesin fiyat için keşfe gelelim.",
        "Eşimle görüşmem gerekiyor": "Kesinlikle, bu durum aileniz için çok önemli. Ancak düşünün; eşinizin akşamları şebeke kesintisinden dolayı karanlıkta kalmasını ister misiniz?",
        "Haklısınız fakat şu an param yok": "Ödeme planı konusunda yardımcı olabiliriz. Kurulum öncesi %30, kurulum sonrası %60 şeklinde esnek koşullar oluşturabiliriz.",
        "Şu an kendimi hazır hissetmiyorum": "Güneş her gün doğup batıyor. O enerjiyi her gün bedava üretip faturanızı sıfırlamak varken neden bekleyerek para kaybetmeye devam edelim?"
    },
    danismanlik: {
        "GES kurdurmak istiyorum ama birden fazla teklif var": "Sizi çok iyi anlıyorum. Her şeyden önce, biz doğrudan 'tüketim hesabı' ile başlıyoruz. Ardından gelen teklifleri elma ile elma olarak kıyaslamanızı sağlıyoruz.",
        "Sürece nasıl başlayabilirim / Maliyeti nedir?": "Sizi tüm karmaşadan kurtaran danışmanlık hizmetimizin bedeli <strong>{consultPrice} TL</strong>'dir.",
        "Bu fiyat çok fazla geldi": "Haklısınız, ek maliyet gibi görünebilir. Ancak sizi ucuz ve çöp olacak ürünlerden koruyoruz. Çöpe gidecek yüzbinlerce liradan tasarruf edeceksiniz.",
        "Eşimle görüşmem gerekiyor": "İsterseniz ödemeyi aldıktan sonra hemen e-toplantı organize edelim. Eşiniz de katılsın ve aklındaki tüm soru işaretlerini cevaplayayım."
    }
};

document.getElementById('btnSaveNewObjection')?.addEventListener('click', async () => {
    const objection = document.getElementById('newObjectionInput').value.trim();
    const response = document.getElementById('newResponseInput').value.trim();
    const compType = document.querySelector('input[name="companyType"]:checked').value;

    if (!objection || !response) {
        alert("Lütfen hem itiraz cümlesini hem de asistanın vereceği yanıtı doldurun.");
        return;
    }
    const btn = document.getElementById('btnSaveNewObjection');
    btn.textContent = "Ortak Havuza Kaydediliyor..."; btn.disabled = true;

    const { error } = await supabaseClient.from('sales_copilot_scripts').insert([{
        company_type: compType, objection: objection, response: response
    }]);

    if (error) {
        console.error(error);
        alert("Hata: Kayıt yapılamadı.");
    } else {
        alert("🎉 Yeni hazır cevap başarıyla ortak arşive eklendi!");
        document.getElementById('newObjectionInput').value = '';
        document.getElementById('newResponseInput').value = '';
    }
    btn.textContent = "Cevabı Tüm Ekip İçin Kaydet"; btn.disabled = false;
});

document.getElementById('btnStartCall')?.addEventListener('click', async () => {
    document.getElementById('salesSetupArea').classList.add('hidden');
    document.getElementById('activeCallArea').classList.remove('hidden');
    
    const compType = document.querySelector('input[name="companyType"]:checked').value;
    const kwPrice = parseFloat(document.getElementById('baseKwPrice').value) || 0;
    const batPrice = parseFloat(document.getElementById('baseBatPrice').value) || 0;
    const consultPrice = parseFloat(document.getElementById('baseConsultPrice').value) || 0;
    const container = document.getElementById('objectionButtonsContainer');
    
    container.innerHTML = '<p class="text-sm text-gray-400 italic p-2">Güncel senaryolar senkronize ediliyor...</p>';
    let mergedScenarios = { ...salesScenarios[compType] };

    try {
        const { data, error } = await supabaseClient.from('sales_copilot_scripts').select('*').eq('company_type', compType);
        if (!error && data) {
            data.forEach(item => { mergedScenarios[item.objection] = item.response; });
        }
    } catch (err) { console.warn("Dinamik senaryolara erişilemedi."); }

    container.innerHTML = '';
    for (const [objection, response] of Object.entries(mergedScenarios)) {
        const btn = document.createElement('button');
        btn.className = "text-left w-full bg-white hover:bg-orange-50 border p-3 rounded-lg shadow-sm font-bold text-gray-700 transition-all";
        btn.innerHTML = `💬 "${objection}"`;
        btn.addEventListener('click', () => {
            const finalRes = response
                .replace('{totalPrice}', ((10 * kwPrice) + (5 * batPrice)).toLocaleString('tr-TR'))
                .replace('{consultPrice}', consultPrice.toLocaleString('tr-TR'));
            document.getElementById('scriptDisplayArea').innerHTML = `<p class="text-white text-2xl leading-relaxed font-light animate-fade-in">${finalRes}</p>`;
        });
        container.appendChild(btn);
    }
});

document.getElementById('btnEndCall')?.addEventListener('click', () => {
    document.getElementById('activeCallArea').classList.add('hidden');
    document.getElementById('salesSetupArea').classList.remove('hidden');
    document.getElementById('scriptDisplayArea').innerHTML = `<p class="text-slate-500 italic">Müşterinin söylediği cümleyi seçtiğinizde, yanıt burada belirecektir.</p>`;
});


// --- 11. ADMIN İŞLEMLERİ (KULLANICILAR VE TALEPLER) ---
document.getElementById('btnRefreshUsers')?.addEventListener('click', fetchUsersForAdmin);
document.getElementById('btnRefreshTickets')?.addEventListener('click', fetchTicketsForAdmin);

async function fetchUsersForAdmin() {
    const list1 = document.getElementById('usersTableBody');
    const list2 = document.getElementById('adminLeadsList');
    if(list1) {
        list1.innerHTML = '<tr><td colspan="4" class="p-4 text-center">Yükleniyor...</td></tr>';
        const { data } = await supabaseClient.from('profiles').select('*');
        list1.innerHTML = '';
        if(data) data.forEach(u => list1.innerHTML += `<tr><td class="p-4 border-b">${u.first_name} ${u.last_name}</td><td class="p-4 border-b">${u.company_name}</td><td class="p-4 border-b">${u.phone}</td><td class="p-4 border-b">${u.role}</td></tr>`);
    }
    if(list2) {
        list2.innerHTML = '<p class="text-gray-500">Yükleniyor...</p>';
        const { data } = await supabaseClient.from('support_tickets').select('*').eq('user_id', '00000000-0000-0000-0000-000000000000').order('created_at', {ascending: false});
        list2.innerHTML = '';
        if(!data || data.length===0) { list2.innerHTML = '<p class="text-gray-500 text-sm">Yatırımcı talebi yok.</p>'; return; }
        data.forEach(l => {
            list2.innerHTML += `<div class="p-4 border rounded-xl bg-slate-50 mb-2 flex justify-between items-center"><div class="w-1/2"><strong>${l.full_name}</strong> - <span>${l.phone}</span><p class="text-sm italic">${l.problem_desc}</p><span class="font-mono text-xs text-blue-600 font-bold">KOD: ${l.installer_name}</span></div><div class="flex gap-2"><input type="text" id="l_resp_${l.id}" placeholder="Yanıt" value="${l.admin_response||''}" class="p-2 border rounded text-xs"><input type="number" id="l_price_${l.id}" placeholder="TL" value="${l.price_quote||''}" class="p-2 border rounded text-xs w-20"><button onclick="respondTicket(${l.id}, true)" class="bg-blue-600 text-white font-bold px-3 rounded text-xs">Yanıtla</button></div></div>`;
        });
    }
}

async function fetchTicketsForAdmin() {
    const list = document.getElementById('adminTicketsList');
    if(!list) return;
    list.innerHTML = '<p class="text-gray-500">Yükleniyor...</p>';
    const { data } = await supabaseClient.from('support_tickets').select('*').neq('user_id', '00000000-0000-0000-0000-000000000000').order('created_at', {ascending: false});
    list.innerHTML = '';
    if(!data || data.length===0) { list.innerHTML = '<p class="text-gray-500 text-sm">Firma teknik servis talebi yok.</p>'; return; }
    data.forEach(t => {
        list.innerHTML += `<div class="p-4 border rounded-xl bg-white mb-2 shadow-sm"><div class="flex justify-between mb-2"><strong>${t.full_name} (${t.inverter_model})</strong><select onchange="updateTicketStatus(${t.id}, this.value)" class="text-xs border p-1 rounded"><option value="Başvuru İletildi" ${t.status==='Başvuru İletildi'?'selected':''}>İletildi</option><option value="Değerlendiriliyor" ${t.status==='Değerlendiriliyor'?'selected':''}>Değerlendiriliyor</option><option value="Dönüş Yapıldı" ${t.status==='Dönüş Yapıldı'?'selected':''}>Dönüş Yapıldı</option></select></div><p class="text-sm bg-gray-50 p-2 rounded mb-2">${t.problem_desc}</p><div class="flex gap-2"><input type="text" id="t_resp_${t.id}" placeholder="Teknik yanıt..." value="${t.admin_response||''}" class="flex-1 p-2 border rounded text-sm"><input type="number" id="t_price_${t.id}" placeholder="Fiyat" value="${t.price_quote||''}" class="w-24 p-2 border rounded text-sm"><button onclick="respondTicket(${t.id}, false)" class="bg-green-600 text-white font-bold px-4 rounded text-sm">Gönder</button></div></div>`;
    });
}

window.updateTicketStatus = async function(id, status) { await supabaseClient.from('support_tickets').update({ status }).eq('id', id); };
window.respondTicket = async function(id, isPublic) {
    const prefix = isPublic ? 'l' : 't';
    const r = document.getElementById(`${prefix}_resp_${id}`).value;
    const p = document.getElementById(`${prefix}_price_${id}`).value;
    await supabaseClient.from('support_tickets').update({ admin_response: r, price_quote: p ? parseFloat(p) : null, status: 'Dönüş Yapıldı' }).eq('id', id);
    alert("Yanıt başarıyla gönderildi!");
    isPublic ? fetchUsersForAdmin() : fetchTicketsForAdmin();
};

document.getElementById('adminPanelCard')?.addEventListener('click', () => { fetchUsersForAdmin(); fetchTicketsForAdmin(); });
