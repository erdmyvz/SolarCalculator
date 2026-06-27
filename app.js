/* ============================================================================
   SOLAR EPC YÖNETİM MERKEZİ - NİHAİ JAVASCRIPT MOTORU (SaaS)
   Yazan / Geliştiren: ERDEM YAVUZ
   Açıklama: Bu dosya, tüm uygulamanın iş mantığını, veritabanı bağlantılarını,
   hesaplama motorlarını ve kullanıcı etkileşimlerini yönetir.

   --------------------------------------------------------------------------
   BU SÜRÜMDE YAPILAN DÜZELTMELER (ÖZET):
   1) crmStatusLabels objesi tanımsızdı -> CRM tablosu ve takip sorgusu hata
      verip çöküyordu. Şimdi tanımlandı (Bölüm 5).
   2) GÜVENLİK AÇIĞI: Kayıt formunda "Ad" alanına "ERDEM" yazan HERKES admin
      yetkisi alabiliyordu. Bu istemci-taraflı kontrol kaldırıldı; admin rolü
      artık sadece sabit kurucu e-postasıyla eşleşince atanıyor (Bölüm 3).
   3) "12 Aylık Detaylı" fatura girişi sekmesi hiçbir input üretmiyordu
      (monthsGrid boştu). Şimdi 12 ay için otomatik alan oluşturuluyor (Bölüm 8).
   4) "PDF İndir" ve "Teklifi Mail At" butonları arayüzde vardı ama hiçbir
      JS karşılığı yoktu. html2pdf / EmailJS ile çalışır hale getirildi (Bölüm 8).
   5) Satış Copilot ekranında "Kurulum" / "Danışmanlık" seçimi fiyat alanlarını
      hiç değiştirmiyordu. Artık seçime göre doğru fiyat kutusu gösteriliyor (Bölüm 12).
   6) Ana sayfadan (ziyaretçi olarak) açılan EV Hesaplayıcı ilk açılışta hesap
      yapmıyordu. Artık modül açılır açılmaz otomatik hesaplanıyor (Bölüm 2).
   7) Menüden "Kurumsal Zeka", "Mevzuat", "Eğitim" ve "Sektörel" butonlarına
      basıldığında karşılık gelen modül HTML'de mevcut olmadığından sayfa
      hata verip kilitleniyordu. Eksik modüller index.html'e eklendi.
   8) "Teknik Servis" modülü hazırdı ama panelde açan bir menü kartı yoktu;
      "Sektörel" için de hem kart hem modül eksikti. İkisi de eklendi.
   9) Admin panelinde arıza biletine yanıt veren buton, UUID tipindeki bilet
      ID'lerini tırnaksız HTML içine gömdüğü için JavaScript hatası
      veriyordu (adminRespondTicket(3fa85f64-...)). Artık olay dinleyicisi
      (addEventListener) ile güvenli şekilde çalışıyor (Bölüm 7).
   10) GÜVENLİK AÇIĞI: Ziyaretçi formundan (isim, telefon, not vb.) gelen
       veriler hiç süzülmeden innerHTML ile ekrana basılıyordu; kötü niyetli
       bir ziyaretçi bu alanlara kod yazarak admin/şirket panelinde çalıştırabilirdi
       (stored XSS). Tüm dinamik alanlar artık escapeHTML() ile temizleniyor.
   11) Kayıt formunda, Supabase'e profil eklenirken oluşan hata önceden hiç
       kontrol edilmiyordu; profil kaydı başarısız olsa da kullanıcıya "başarılı"
       deniyordu. Şimdi hata kontrol ediliyor (Bölüm 3).
   12) Arıza formu ve "Geçmiş Taleplerim" ekranı, oturum süresi dolmuşsa
       (getUser() boş dönerse) çökme hatası veriyordu; artık güvenli kontrol var.
   13) 3D sahnedeki şebeke kablosu animasyonu (dashOffset), kullanılan
       three.js r128 sürümünde desteklenmediği için sessizce hiçbir şey
       yapmıyordu; opaklık nabzı (pulse) ile gerçek bir animasyona çevrildi.
   14) Admin panelindeki "Sisteme Kayıtlı Firmalar" tablosunda başlıklar
       (Firma / Yetkili sırası) ile asıl basılan veriler birbirini tutmuyordu;
       sıralama düzeltildi ve tabloya Plan + Abonelik Durumu sütunları eklendi.

   YENİ EKLENEN ÖZELLİKLER:
   - Aylık $20'dan başlayan, aylık/yıllık seçenekli, 3 katmanlı abonelik/
     fiyatlandırma altyapısı (Bölüm 13). Fiyatlar Supabase 'pricing_plans'
     tablosundan okunuyor; admin panelinden doğrudan değiştirilebiliyor.
   - Admin panelinden firmalara doğrudan plan/abonelik durumu atama.
   - Ödeme adımı için /api/create-checkout-session sunucu uç noktasına
     (Stripe Checkout) istek atan örnek bir akış (gerçek tahsilat için
     ayrıca paylaşılan api-create-checkout-session.js dosyasını kendi
     sunucunuza (Vercel vb.) eklemeniz gerekir).
   - Açılış sayfası için kaydırma (scroll) animasyonları.

   GEREKLİ VERİTABANI DEĞİŞİKLİKLERİ (ayrıca supabase_schema.sql dosyasında):
     alter table profiles add column if not exists plan_id text default 'baslangic';
     alter table profiles add column if not exists subscription_status text default 'deneme';
     create table if not exists pricing_plans ( ... ); -- detaylar SQL dosyasında
   ============================================================================ */

// ============================================================================
// 1. VERİTABANI VE KÜRESEL DEĞİŞKENLER
// ============================================================================
// Supabase (Backend as a Service) bağlantı anahtarları
const SUPABASE_URL = 'https://bxcghdbrafzudiigeeud.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_EiDGhm4bT-acQ8xrV9RU4w_4wkUQGys';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let currentUserProfile = null; // Sisteme giriş yapan firmanın bilgilerini tutar

// CRM Müşteri Listesi İçin Küresel Hafıza (Veritabanı Simülasyonu)
let crmLeads = [];

// 3D Motorunun gereksiz yere birden fazla kez yüklenmesini engelleyen kontrol bayrakları
window.isApp3DInitialized = false;

// E-posta (EmailJS) Ayarları — Teklif gönderme özelliğinin çalışması için kendi
// EmailJS hesabınızdan aldığınız bilgileri buraya girmeniz gerekir (www.emailjs.com).
const EMAILJS_PUBLIC_KEY = "";      // TODO: EmailJS Public Key
const EMAILJS_SERVICE_ID = "";      // TODO: EmailJS Service ID
const EMAILJS_QUOTE_TEMPLATE_ID = ""; // TODO: EmailJS Template ID

/**
 * Kullanıcıdan/ziyaretçiden gelen serbest metni güvenli şekilde HTML içine basmak için kullanılır.
 * Bu fonksiyon olmadan, ziyaretçi formundan gelen bir isim veya not alanına yazılan
 * kötü amaçlı kod (XSS) admin veya firma panelinde çalışabilirdi.
 */
function escapeHTML(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


// ============================================================================
// 2. SAYFA YÖNLENDİRİCİSİ VE GÜVENLİK (SINGLE PAGE APPLICATION - SPA)
// ============================================================================
// Bu fonksiyon URL'nin sonundaki '#home', '#auth' veya '#app' etiketine bakarak
// sadece ilgili HTML bloğunu gösterir. Bireysel ziyaretçilerin izinsiz panele girmesini engeller.
async function handleSPA_Routing() {
    const hash = window.location.hash || '#home';
    const landing = document.getElementById('landingContainer');
    const auth = document.getElementById('authContainer');
    const app = document.getElementById('appContainer');
    
    // Önce her yeri gizle
    if(landing) landing.classList.add('hidden');
    if(auth) auth.classList.add('hidden');
    if(app) app.classList.add('hidden');
    
    // Hash'e göre ilgili alanı aç
    if (hash === '#home' && landing) {
        landing.classList.remove('hidden');
    } else if (hash === '#auth' && auth) {
        auth.classList.remove('hidden');
    } else if (hash === '#app' && app) {
        // Eğer uygulama (panel) kısmına girmek istiyorsa, oturum (session) kontrolü yap
        if(supabaseClient) {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
                window.location.hash = '#auth'; // Oturum yoksa zorla giriş sayfasına at
                return;
            }
        }
        app.classList.remove('hidden');
        closeAllAndShowMenu(); // Panele girildiğinde önce ana menüyü (Dashboard) göster
    }
}

// URL değiştiğinde (örn: geri butonuna basıldığında) yönlendiriciyi tetikle
window.addEventListener('hashchange', handleSPA_Routing);

// Sayfa ilk yüklendiğinde oturum kontrolü yap
window.addEventListener('load', async () => {
    if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY) {
        try { emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY }); } catch (err) { console.warn('EmailJS başlatılamadı:', err); }
    }

    if(supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            await fetchUserProfile(session.user.id, session.user.email);
            if (window.location.hash === '#auth' || window.location.hash === '') {
                window.location.hash = '#app'; // Zaten giriş yapmışsa direkt panele al
            }
            await resumePendingCheckoutIfAny();
        }
    }
    handleSPA_Routing();

    // Açılış sayfasındaki fiyatlandırma kartlarını ve kaydırma animasyonlarını başlat
    renderPublicPricingSection();
    initScrollReveal();
});

// Ziyaretçilerin landing page'den public (herkese açık) hesaplayıcılara erişmesini sağlar
window.openPublicModule = function(moduleId) {
    document.getElementById('landingContainer').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById(moduleId).classList.remove('hidden');
    
    // Eğer 3D simülasyon modülü açılıyorsa ve daha önce yüklenmediyse motoru çalıştır
    if(moduleId === 'simulationModule' && !window.isApp3DInitialized && typeof initApp3DScene === 'function') {
        initApp3DScene(); 
        window.isApp3DInitialized = true;
    }
    // DÜZELTME: EV Hesaplayıcı ziyaretçi tarafından doğrudan açıldığında sonuçlar
    // boş kalıyordu çünkü hesaplama hiç tetiklenmiyordu. Artık otomatik çalışıyor.
    if(moduleId === 'evCalcModule' && typeof calculateEVSolar === 'function') {
        calculateEVSolar();
    }
}

// Uygulama içindeki tüm modülleri kapatıp ana paneli (Dashboard) gösterir
window.closeAllAndShowMenu = function() {
    const mods = ['crmModule', 'adminModule', 'calculatorModule', 'simulationModule', 'evCalcModule', 'companyManagementModule', 'techSupportModule', 'salesAssistantModule', 'sectoralModule', 'educationModule', 'regulationsModule'];
    mods.forEach(id => { const el = document.getElementById(id); if(el) el.classList.add('hidden'); });
    
    // Sadece giriş yapmış yetkili kullanıcılar Main Menu'yü görebilir. Aksi halde landing'e atılır.
    if(currentUserProfile || !supabaseClient) {
        document.getElementById('mainMenu').classList.remove('hidden');
    } else {
        window.location.hash = '#home';
    }
}


// ============================================================================
// 3. KURUMSAL AUTHENTICATION (KAYIT, GİRİŞ VE PROFİL YÖNETİMİ)
// ============================================================================
// Giriş ve Kayıt sekmeleri arasındaki görsel geçişleri sağlar
document.getElementById('tabLogin')?.addEventListener('click', () => {
    document.getElementById('loginForm').classList.remove('hidden'); 
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('tabLogin').classList.add('text-emerald-600', 'border-b-2', 'border-emerald-600'); 
    document.getElementById('tabLogin').classList.remove('text-gray-400');
    document.getElementById('tabRegister').classList.add('text-gray-400'); 
    document.getElementById('tabRegister').classList.remove('text-emerald-600', 'border-b-2', 'border-emerald-600');
});

document.getElementById('tabRegister')?.addEventListener('click', () => {
    document.getElementById('registerForm').classList.remove('hidden'); 
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('tabRegister').classList.add('text-emerald-600', 'border-b-2', 'border-emerald-600'); 
    document.getElementById('tabRegister').classList.remove('text-gray-400');
    document.getElementById('tabLogin').classList.add('text-gray-400'); 
    document.getElementById('tabLogin').classList.remove('text-emerald-600', 'border-b-2', 'border-emerald-600');
});

// YENİ FİRMA KAYIT İŞLEMİ
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const company = document.getElementById('regCompany').value;
    
    // Bireysel yatırımcıların girmesini engellemek için firma adı kontrolü
    if(!company || company.trim().length < 3) {
        alert("Geçerli bir EPC/Kurulum Firması ünvanı girmek zorunludur. Bireysel kayıt yasaktır."); return;
    }
    
    const btn = document.getElementById('btnRegisterSubmit'); btn.textContent = "Kaydediliyor..."; btn.disabled = true;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    
    if(supabaseClient) {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) { alert("Kayıt Hatası: " + error.message); } 
        else if (data.user) {
            // GÜVENLİK DÜZELTMESİ: Daha önce "Ad" alanına "ERDEM" yazan herkes admin
            // yetkisi alabiliyordu. Bu açık kapatıldı — admin rolü artık SADECE
            // sabit kurucu e-postasıyla eşleşirse atanır.
            const role = (email === 'erdem.yvz@hotmail.com') ? 'admin' : 'company';
            const { error: profileError } = await supabaseClient.from('profiles').insert([{ 
                id: data.user.id, 
                first_name: document.getElementById('regName').value, 
                last_name: document.getElementById('regSurname').value, 
                company_name: company, 
                phone: document.getElementById('regPhone').value, 
                role: role,
                plan_id: 'baslangic',
                subscription_status: 'deneme'
            }]);
            // DÜZELTME: Önceden bu hata kontrol edilmiyor, kullanıcıya her zaman
            // "başarılı" mesajı gösteriliyordu; profil kaydı sessizce başarısız olabiliyordu.
            if (profileError) {
                alert("Hesabınız oluşturuldu ancak firma profiliniz kaydedilirken bir hata oluştu: " + profileError.message + "\nLütfen sistem yöneticisiyle iletişime geçin.");
            } else {
                alert("Firma Kaydı Başarılı! Sisteme giriş yapabilirsiniz. (14 günlük ücretsiz deneme süreniz başladı)");
                document.getElementById('registerForm').reset(); document.getElementById('tabLogin').click();
            }
        }
    } else {
        alert("Supabase veritabanı aktif değil, form simüle edildi.");
    }
    btn.textContent = "Firmayı Sisteme Kaydet"; btn.disabled = false;
});

// SİSTEME GİRİŞ İŞLEMİ
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnLoginSubmit'); btn.textContent = "Bağlanıyor..."; btn.disabled = true;
    
    if(supabaseClient) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: document.getElementById('loginEmail').value, password: document.getElementById('loginPassword').value,
        });
        if (error) { alert("Giriş Başarısız: E-posta veya şifre hatalı."); } 
        else if (data.user) {
            await fetchUserProfile(data.user.id, data.user.email);
            window.location.hash = '#app'; document.getElementById('loginForm').reset();
            await resumePendingCheckoutIfAny(); // Girişten önce bir plan seçilmişse ödeme adımına devam et
        }
    }
    btn.textContent = "Yönetim Paneline Gir"; btn.disabled = false;
});

// KULLANICI PROFİL VERİLERİNİ VERİTABANINDAN ÇEKME VE ARAYÜZÜ GÜNCELLEME
async function fetchUserProfile(userId, displayEmail) {
    if(!supabaseClient) return;
    const { data } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    if (data) {
        currentUserProfile = data;
        document.getElementById('userNameDisplay').textContent = `${data.first_name} ${data.last_name}`;
        document.getElementById('userCompanyDisplay').textContent = data.company_name;
        document.getElementById('userEmailDisplay').textContent = displayEmail;
        document.getElementById('userInitials').textContent = data.first_name.charAt(0).toUpperCase();

        // Admin (Erdem Yavuz) ekranını sadece rolü admin olanlara göster
        const adminCard = document.getElementById('adminPanelCard');
        if(adminCard) adminCard.classList.toggle('hidden', data.role !== 'admin');
        
        // Iframe kodu için firma ID'sini güncelle (Firmalar CRM formunu sitelerine ekleyebilsin diye)
        if(document.getElementById('iframeCompanyId')) {
            document.getElementById('iframeCompanyId').textContent = data.id;
        }

        // Abonelik durumu rozetini güncelle (plan_id / subscription_status sütunları
        // yoksa varsayılan değerlerle nazikçe devam eder, hata vermez)
        const planBadge = document.getElementById('userPlanBadge');
        if (planBadge) {
            const planNames = { baslangic: 'Başlangıç', profesyonel: 'Profesyonel', kurumsal: 'Kurumsal' };
            const statusNames = { deneme: 'Deneme Sürümü', aktif: 'Aktif Abonelik', pasif: 'Pasif', iptal: 'İptal Edildi' };
            const planName = planNames[data.plan_id] || 'Başlangıç';
            const statusName = statusNames[data.subscription_status] || 'Deneme Sürümü';
            planBadge.textContent = `${planName} Planı · ${statusName}`;
            planBadge.classList.toggle('bg-amber-100', data.subscription_status === 'deneme');
            planBadge.classList.toggle('text-amber-800', data.subscription_status === 'deneme');
            planBadge.classList.toggle('bg-emerald-100', data.subscription_status === 'aktif');
            planBadge.classList.toggle('text-emerald-800', data.subscription_status === 'aktif');
        }
    }
}

// Profil Çıkış İşlemleri
document.getElementById('btnProfile')?.addEventListener('click', () => document.getElementById('profileDropdown').classList.toggle('hidden'));
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    if(supabaseClient) await supabaseClient.auth.signOut(); 
    currentUserProfile = null;
    document.getElementById('profileDropdown').classList.add('hidden'); window.location.hash = '#home';
});


// ============================================================================
// 4. MÜŞTERİ YAKALAMA (LEAD GENERATION) VE TAKİP MODÜLÜ (ZİYARETÇİ EKRANI)
// ============================================================================
// Ziyaretçiler "Ücretsiz Keşif" veya "Servis" butonuna basınca açılan form penceresi
window.openLeadModal = function(type) {
    document.getElementById('leadType').value = type;
    document.getElementById('leadModalTitle').innerText = type === 'kurulum' ? 'Ücretsiz Çatı Keşfi Başvurusu' : 'Teknik Servis Müdahale Başvurusu';
    const extraFields = document.getElementById('kurulumExtraFields');
    type === 'kurulum' ? extraFields?.classList.remove('hidden') : extraFields?.classList.add('hidden');
    document.getElementById('leadModal')?.classList.remove('hidden');
};

window.closeLeadModal = function() { 
    document.getElementById('leadModal')?.classList.add('hidden'); 
    document.getElementById('leadPublicForm')?.reset();
};

// ZİYARETÇİ FORM GÖNDERME İŞLEMİ (Veriler CRM'e Düşer)
document.getElementById('leadPublicForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('leadType').value;
    
    // Müşteriye verilecek benzersiz Proje ID'si ve zaman damgası (Şeffaf takip için)
    const randomCode = "EPC-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toLocaleString('tr-TR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

    let combinedDetails = document.getElementById('leadDetails').value;
    let outage = "Bilinmiyor", evHp = "Yok";

    // Kurulum talebiyse ekstra soruların cevaplarını nota entegre et
    if (type === 'kurulum') {
        outage = document.getElementById('leadOutage').value;
        evHp = document.getElementById('leadExtraConsumption').value || 'Yok';
        combinedDetails = `[Şebeke Kesintisi: ${outage}] | [Gelecekte İlave Yük: ${evHp}]\n\nMüşteri Notu: ${combinedDetails}`;
    }

    // Gerçek Veritabanına (Genel Havuza) Yazma (Admin görebilsin diye)
    if(supabaseClient) {
        const leadData = {
            user_id: "00000000-0000-0000-0000-000000000000", // 0 ID'si Genel yatırımcı havuzunu temsil eder
            full_name: document.getElementById('leadName').value,
            phone: document.getElementById('leadPhone').value,
            email: document.getElementById('leadEmail').value,
            address: document.getElementById('leadAddress').value,
            inverter_model: type === 'kurulum' ? 'Yeni Kurulum' : 'Servis Talebi',
            problem_desc: combinedDetails,
            installer_name: randomCode, // Takip kodunu buraya gizliyoruz
            status: 'yeni_basvuru'
        };
        await supabaseClient.from('support_tickets').insert([leadData]);
    }

    // Yerel CRM Hafızasına Ekle (Oturumdaki firma anında tablosunda görebilsin diye simülasyon)
    const newLead = {
        id: randomCode,
        date: dateStr,
        name: document.getElementById('leadName').value,
        phone: document.getElementById('leadPhone').value,
        email: document.getElementById('leadEmail').value,
        address: document.getElementById('leadAddress').value,
        status: "yeni_basvuru",
        bill: "",
        consumptions: "",
        heatPump: evHp.toLowerCase().includes('ısı') ? 'Planlıyor' : 'Yok',
        heatPumpPower: "",
        ev: evHp.toLowerCase().includes('araç') || evHp.toLowerCase().includes('ev') ? 'Yakında' : 'Yok',
        blackout: outage === 'Evet' ? 'Sık' : 'Seyrek',
        storageIntent: outage === 'Evet' ? 'Evet' : 'Hayır',
        backupDetails: "",
        notes: combinedDetails,
        type: type
    };
    crmLeads.push(newLead);
    
    // Eğer CRM açıksa istatistikleri hemen güncelle
    if(typeof crmCalculateStats === 'function') { crmCalculateStats(); crmRenderLeads(); }

    alert(`🎉 Başvurunuz Başarıyla İletildi!\n\nLütfen Proje Takip ID Kodunuzu Not Edin: ${randomCode}\nBu kod ile anasayfadan sürecinizi şeffafça izleyebilirsiniz.`);
    closeLeadModal();
    
    // Sorgulama ekranını otomatik doldur ve çalıştır
    document.getElementById('leadTrackInput').value = randomCode;
    document.getElementById('btnTrackQuery').click();
});

// YATIRIMCI ŞEFFAF BAŞVURU SORGULAMA İŞLEMİ
document.getElementById('btnTrackQuery')?.addEventListener('click', async () => {
    const code = document.getElementById('leadTrackInput').value.trim();
    const display = document.getElementById('trackResultDisplay');
    if(!code) return;

    display.className = "mt-4 p-4 rounded-xl text-sm font-bold bg-white text-slate-800 border border-slate-200";
    display.innerHTML = "Sistemde aranıyor...";

    // CRM'e yeni düşmüş (lokal) kayıtlarda ara
    const localLead = crmLeads.find(l => l.id === code);
    
    if (localLead) {
        // Müşteriye statüsünü şeffaf ve güzel bir dille göster
        const statusObj = crmStatusLabels[localLead.status] || { text: "İşlem Bekliyor" };
        display.innerHTML = `
            <div class="flex flex-col space-y-2">
                <div class="flex justify-between border-b pb-2">
                    <span class="text-slate-500">Sayın ${escapeHTML(localLead.name.split(' ')[0])}</span>
                    <span class="text-xs text-slate-400">${escapeHTML(localLead.date)}</span>
                </div>
                <div class="flex items-center gap-2 mt-2">
                    <span class="bg-emerald-100 text-emerald-800 px-3 py-1 rounded border border-emerald-200 text-xs uppercase tracking-wider">Durum:</span>
                    <span class="font-black text-slate-700">${escapeHTML(statusObj.text)}</span>
                </div>
                <p class="text-xs text-slate-500 mt-2 italic">Müşteri temsilcimiz dosyanız üzerinde çalışıyor, size en kısa sürede ulaşılacaktır.</p>
            </div>
        `;
    } else {
        display.innerHTML = `<span class="text-red-500 font-bold">Kayıt Bulunamadı.</span> Lütfen EPC- ile başlayan takip kodunuzu doğru girdiğinizden emin olun.`;
    }
    display.classList.remove('hidden');
});

// ============================================================================
// ANA MENÜ BUTONLARI VE SAYFA GEÇİŞLERİ YÖNETİMİ
// ============================================================================
const menuMap = {
    'btnGoEducation': 'educationModule',
    'btnGoSectoral': 'sectoralModule',
    'btnGoRegulations': 'regulationsModule',
    'btnGoCRM': 'crmModule',
    'btnGoCompanyMgmt': 'companyManagementModule',
    'btnGoCalculator': 'calculatorModule',
    'btnGoSimulation': 'simulationModule',
    'btnGoEVCalc': 'evCalcModule',
    'btnGoTechSupport': 'techSupportModule',
    'btnGoSalesAssistant': 'salesAssistantModule'
};

// Modül açma butonlarını dinle
for (const [btnId, modId] of Object.entries(menuMap)) {
    const btn = document.getElementById(btnId);
    if(btn) {
        btn.addEventListener('click', () => {
            document.getElementById('mainMenu').classList.add('hidden');
            document.getElementById(modId).classList.remove('hidden');
            
            // Eğer açılan sayfa 3D Simülasyon ise motoru tetikle
            if(modId === 'simulationModule' && !window.isApp3DInitialized && typeof initApp3DScene === 'function') {
                initApp3DScene(); window.isApp3DInitialized = true;
            }
            // Eğer EV Calc ise anlık hesabı bir kez çalıştır
            if(modId === 'evCalcModule' && typeof calculateEVSolar === 'function') calculateEVSolar();
            // Teknik destek formunu kullanıcının bilgileriyle doldur
            if(modId === 'techSupportModule' && currentUserProfile) {
                document.getElementById('tsName').value = `${currentUserProfile.first_name} ${currentUserProfile.last_name}`;
                document.getElementById('tsPhone').value = currentUserProfile.phone;
            }
            // Eğer CRM açıldıysa istatistikleri yenile
            if(modId === 'crmModule' && typeof crmCalculateStats === 'function') {
                crmCalculateStats(); crmRenderLeads();
            }
        });
    }
}

// Ana menüye dönen (Geri) butonlarını dinle
const backButtons = ['btnBackToMenu', 'btnBackToMenuFromSim', 'btnBackToMenuFromEV', 'btnBackToMenuFromSupport', 'btnBackToMenuFromSales', 'btnBackToMenuFromAdmin', 'btnBackToMenuFromCRM', 'btnBackToMenuFromCompanyMgmt', 'btnBackToMenuFromReg', 'btnBackToMenuFromSectoral', 'btnBackToMenuFromEdu'];
backButtons.forEach(id => {
    document.getElementById(id)?.addEventListener('click', closeAllAndShowMenu);
});

// ============================================================================
// 5. SATIŞ CRM VE PROJE TAKİP MOTORU (SOLAR PIPELINE ENGINE)
// ============================================================================

// DÜZELTME: Bu obje daha önce hiçbir yerde tanımlanmamıştı. crmRenderLeads() ve
// takip sorgusu bu objeyi çağırdığı anda "crmStatusLabels is not defined" hatası
// alıp tüm CRM modülünü ve anasayfadaki takip kutusunu çökertiyordu.
const crmStatusLabels = {
    yeni_basvuru: { text: "Yeni Başvuru", css: "bg-blue-100 text-blue-800" },
    arandi_gorusuldu: { text: "Arandı / Görüşüldü", css: "bg-amber-100 text-amber-800" },
    teklif_gonderildi: { text: "Teklif Gönderildi", css: "bg-amber-100 text-amber-800" },
    sozlesme_imzalandi: { text: "Sözleşme İmzalandı", css: "bg-emerald-100 text-emerald-800" },
    kurulum_basladi: { text: "Kurulum Başladı", css: "bg-emerald-100 text-emerald-800" },
    resmi_surec: { text: "TEDAŞ Resmi Süreci", css: "bg-purple-100 text-purple-800" },
    tamamlandi: { text: "Tamamlandı 🚀", css: "bg-slate-800 text-white" }
};

/**
 * CRM Modülü ilk açıldığında veya bir veri güncellendiğinde tetiklenen ana fonksiyon.
 * Üst bar istatistiklerini hesaplar ve güncel müşteri listesini tabloya basar.
 */
function initCRMModule() {
    crmCalculateStats();
    crmRenderLeads();
}

/**
 * CRM Paneli üst kısmındaki 4 adet renkli özet kokpit kartının sayılarını hesaplar.
 * Projelerin dizideki 'status' (durum) alanlarına göre filtreleme yapar.
 */
function crmCalculateStats() {
    // 1. Durum: Yeni Başvuru (İşlem bekleyenler)
    if(document.getElementById('crmStatNew')) {
        document.getElementById('crmStatNew').textContent = crmLeads.filter(l => l.status === 'yeni_basvuru').length;
    }
    // 2. Durum: Takip ve Teklif Aşaması (Arananlar veya teklif iletilenler)
    if(document.getElementById('crmStatFollowUp')) {
        document.getElementById('crmStatFollowUp').textContent = crmLeads.filter(l => l.status === 'arandi_gorusuldu' || l.status === 'teklif_gonderildi').length;
    }
    // 3. Durum: Aktif Sahadaki İşler (Sözleşmesi imzalanmış veya montajı başlamış projeler)
    if(document.getElementById('crmStatActive')) {
        document.getElementById('crmStatActive').textContent = crmLeads.filter(l => l.status === 'kurulum_basladi' || l.status === 'sozlesme_imzalandi').length;
    }
    // 4. Durum: Mevzuat ve Kabul Aşaması (TEDAŞ onay süreçleri)
    if(document.getElementById('crmStatOfficial')) {
        document.getElementById('crmStatOfficial').textContent = crmLeads.filter(l => l.status === 'resmi_surec').length;
    }
}

/**
 * CRM Müşteri Listesini, seçilen filtreleme kriterine göre HTML tablosuna dinamik basar.
 * Her satıra tıklama olayı ekleyerek detay kartının (anket) açılmasını sağlar.
 */
function crmRenderLeads() {
    const tableBody = document.getElementById('crmLeadsTableBody');
    const filterValue = document.getElementById('crmFilterStatus')?.value || 'all';
    if(!tableBody) return;
    tableBody.innerHTML = ''; // Tabloyu temizle

    // Seçilen filtreye göre verileri süz (Filtre 'all' ise hepsini getir)
    const filteredLeads = crmLeads.filter(lead => filterValue === 'all' || lead.status === filterValue);

    // Eğer gösterilecek müşteri yoksa kullanıcıya bilgi satırı bas
    if(filteredLeads.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400 font-medium bg-white">Bu aşamada bekleyen herhangi bir müşteri veya proje kaydı bulunmuyor.</td></tr>`;
        return;
    }

    // En yeni gelen başvuruyu en üstte göstermek için listeyi ters çevirip döngüye alıyoruz
    [...filteredLeads].reverse().forEach(lead => {
        // Sektörel durum etiketinin renk ve metin ayarlarını küresel sözlükten çek
        const badge = crmStatusLabels[lead.status] || { text: lead.status, css: 'bg-slate-100 text-slate-800' };
        
        // Müşterinin teknik anket cevaplarına göre hızlı donanım ikon özeti oluşturma
        let techBadges = [];
        if(lead.ev === 'Var' || lead.ev === 'Yakında') techBadges.push('🚗 EV');
        if(lead.heatPump === 'Var' || lead.heatPump === 'Planlıyor') techBadges.push('🔥 Isı P.');
        if(lead.storageIntent === 'Evet') techBadges.push('🔋 Batarya');
        const techSummary = techBadges.length > 0 ? techBadges.join(' | ') : 'Standart Yük (On-Grid)';

        // Yeni bir tablo satırı (tr) oluştur
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-100 transition cursor-pointer";
        
        // Satıra tıklandığında detay modal penceresini açacak tetikleyici
        tr.onclick = (e) => {
            if(e.target.tagName !== 'BUTTON') crmOpenLeadDetails(lead.id);
        };

        // Satırın içindeki HTML hücrelerini doldur (DÜZELTME: kullanıcı/ziyaretçi
        // verisi artık escapeHTML() ile temizlenip basılıyor - stored XSS önlendi)
        tr.innerHTML = `
            <td class="p-4 pl-6 font-mono text-slate-400 text-[11px]">${escapeHTML(lead.date) || '-'}</td>
            <td class="p-4">
                <div class="font-black text-slate-900 text-sm mb-0.5">${escapeHTML(lead.name)}</div>
                <div class="text-[10px] text-slate-400 font-mono tracking-wider">Takip ID: ${escapeHTML(lead.id)} | Tel: ${escapeHTML(lead.phone) || '-'}</div>
            </td>
            <td class="p-4"><span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${badge.css}">${escapeHTML(badge.text)}</span></td>
            <td class="p-4 text-slate-600 font-bold text-[11px]">${techSummary}</td>
            <td class="p-4 text-right pr-6">
                <button class="bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 font-bold px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition text-xs">Müşteri Kartı</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

/**
 * Belirli bir müşterinin ID'sine göre tüm teknik anket ve iletişim detaylarını modal penceresine yükler.
 */
window.crmOpenLeadDetails = function(id) {
    const lead = crmLeads.find(l => l.id == id);
    if(!lead) return;

    // Gizli ve görünür form alanlarını müşteri verileriyle doldur
    document.getElementById('modalLeadId').value = lead.id;
    document.getElementById('modalLeadName').textContent = lead.name;
    document.getElementById('modalLeadDate').textContent = "Başvuru Tarihi: " + (lead.date || '-');
    document.getElementById('modalLeadIdDisplay').textContent = "ID: " + lead.id;
    // DÜZELTME: telefon/e-posta/adres artık escapeHTML() ile basılıyor
    document.getElementById('modalLeadContact').innerHTML = `📞 <strong>Tel:</strong> ${escapeHTML(lead.phone) || '-'} &nbsp;|&nbsp; ✉️ <strong>E-posta:</strong> ${escapeHTML(lead.email) || '-'}<br>📍 <strong>Konum:</strong> ${escapeHTML(lead.address) || '-'}`;
    
    // Anket verilerini form elemanlarına eşle
    document.getElementById('modalStatusSelect').value = lead.status;
    document.getElementById('fieldBill').value = lead.bill || '';
    document.getElementById('fieldConsumptions').value = lead.consumptions || '';
    document.getElementById('fieldHeatPump').value = lead.heatPump || 'Yok';
    document.getElementById('fieldHeatPumpPower').value = lead.heatPumpPower || '';
    document.getElementById('fieldEV').value = lead.ev || 'Yok';
    document.getElementById('fieldBlackout').value = lead.blackout || 'Seyrek';
    document.getElementById('fieldStorageIntent').value = lead.storageIntent || 'Hayır';
    document.getElementById('fieldBackupDetails').value = lead.backupDetails || '';
    document.getElementById('fieldNotes').value = lead.notes || '';

    // Modalı görünür yap
    document.getElementById('crmDetailModal').classList.remove('hidden');
};

/**
 * Satış ekibinin panel içerisinden manuel olarak yeni müşteri eklemesini sağlayan sihirbaz.
 */
window.crmOpenNewLeadModal = function() {
    const name = prompt("Lütfen eklenecek yeni müşterinin adını veya proje başlığını giriniz:");
    if(!name || !name.trim()) return;
    
    const randomCode = "EPC-MANUAL-" + Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toLocaleString('tr-TR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

    // Boş bir solar anket kartı şablonu oluştur
    const newLead = { 
        id: randomCode, 
        date: dateStr, 
        name: name.trim(), 
        status: "yeni_basvuru", 
        phone: "", email: "", address: "", bill: "", consumptions: "",
        heatPump: "Yok", heatPumpPower: "", ev: "Yok", blackout: "Seyrek", 
        storageIntent: "Hayır", backupDetails: "", notes: "Panelden manuel oluşturuldu.",
        type: "kurulum" 
    };
    
    crmLeads.push(newLead);
    crmCalculateStats(); 
    crmRenderLeads(); 
    crmOpenLeadDetails(randomCode); // Düzenleyebilmesi için kartı anında ekrana aç
};

/**
 * Müşteri kartında yapılan tüm anket ve statü değişikliklerini hafızaya kaydeder.
 */
window.crmSaveLeadDetails = function() {
    const id = document.getElementById('modalLeadId').value;
    const leadIndex = crmLeads.findIndex(l => l.id == id);
    if(leadIndex === -1) return;

    // Formdaki güncel değerleri yakala ve dizideki ilgili indekse yaz
    crmLeads[leadIndex].status = document.getElementById('modalStatusSelect').value;
    crmLeads[leadIndex].bill = document.getElementById('fieldBill').value;
    crmLeads[leadIndex].consumptions = document.getElementById('fieldConsumptions').value;
    crmLeads[leadIndex].heatPump = document.getElementById('fieldHeatPump').value;
    crmLeads[leadIndex].heatPumpPower = document.getElementById('fieldHeatPumpPower').value;
    crmLeads[leadIndex].ev = document.getElementById('fieldEV').value;
    crmLeads[leadIndex].blackout = document.getElementById('fieldBlackout').value;
    crmLeads[leadIndex].storageIntent = document.getElementById('fieldStorageIntent').value;
    crmLeads[leadIndex].backupDetails = document.getElementById('fieldBackupDetails').value;
    crmLeads[leadIndex].notes = document.getElementById('fieldNotes').value;

    crmCloseModal(); 
    crmCalculateStats(); 
    crmRenderLeads(); // Tabloyu ve sayıları tazele
};

window.crmCloseModal = function() { document.getElementById('crmDetailModal').classList.add('hidden'); };
window.crmOpenIntegrationModal = function() { document.getElementById('crmIntegrationModal').classList.remove('hidden'); };


// ============================================================================
// 6. YAPAY ZEKA (AI) ENTEGRASYONU VE PROMPT MOTORU
// ============================================================================

/**
 * Kurumsal Zeka modülü için girilen verileri StoryBrand formatında mega-prompt'a dönüştürür.
 */
function generateAIPrompt(companyData) {
    return `
Sen, Michael Gerber'in "E-Myth" prensiplerini ve Donald Miller'ın "StoryBrand" çerçevesini kusursuz bir şekilde benimsemiş, dünya çapında üst düzey bir "Kurumsal Dönüşüm ve İşletme Danışmanı"sın. Amacın, şirketlerin sistem kurmasına, kârlılığını artırmasına ve kurucuya bağımlı olmaktan kurtulmasına yardımcı olmaktır.

Şu an analiz edip reçete yazacağın firmanın temel profili aşağıdadır:
--------------------------------------------------
🏢 FİRMA BİLGİLERİ:
- Firma Adı: ${companyData.name}
- Temel Vaadi (Elevator Pitch): ${companyData.pitch}
- Eşsiz Satış Teklifi (USP): ${companyData.usp || "Belirtilmemiş - (Marka farklılaşma sorunu olabilir)"}
- Müşteride Çözdüğünüz Ana Acı/Sorun: ${companyData.pain || "Belirtilmemiş - (Müşteri empatisi eksik olabilir)"}
--------------------------------------------------

GÖREVİN:
Bu firmanın profiline bakarak, "Marketing", "Satış" ve "Operasyon" başta olmak üzere temel fonksiyonlarda neleri yanlış yapıyor olabileceğini (Teşhis) ve bu sorunları aşmak için hemen yarın sabah uygulamaya koyabilecekleri 3 adımlık acil bir eylem planını (Tedavi) yaz.

KURALLAR:
1. Kurumsal ve ilham verici bir ton kullan, ama asla akademik ve sıkıcı bir jargon kullanma.
2. Tavsiyelerin genel geçer olmasın. Firmanın profiline özel spesifik taktikler ver.
3. Çıktını şık bir HTML formatında, kalın yazılar (<strong>), başlıklar (<h3>), listeler (<ul>) ve emojiler kullanarak ver ki doğrudan web sitesindeki bir <div> içine basabilelim. Markdown kullanma, sadece saf HTML etiketleri kullan.
4. Çıktının sonuna mutlaka firmanın "Hero (Kahraman)" değil, müşterinin "Guide (Rehberi)" olduğunu hatırlatan vurucu bir motivasyon cümlesi ekle.
`;
}

// GEMİNI REÇETE OLUŞTURUCU BUTON TETİKLEYİCİSİ (Vercel Serverless Güvenli Bağlantısı)
document.getElementById('btnRunAI')?.addEventListener('click', async () => {
    const companyData = {
        name: document.getElementById('cmName').value.trim(),
        pitch: document.getElementById('cmPitch').value.trim(),
        usp: document.getElementById('cmUSP').value.trim(),
        pain: document.getElementById('cmPain').value.trim()
    };
    
    if(!companyData.name || !companyData.pitch) {
        alert("Lütfen sağlıklı bir analiz için en azından Firma İsmi ve Temel Vaat alanlarını doldurun."); return;
    }
    
    const btn = document.getElementById('btnRunAI');
    btn.textContent = "Yapay Zeka Analiz Ediyor..."; btn.disabled = true;
    btn.classList.add('opacity-70', 'cursor-not-allowed');
    
    // Sonuç alanını yakala
    const resultArea = document.getElementById('cmMarketing');
    
    if (resultArea) {
        resultArea.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12">
                <div class="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p class="text-emerald-400 font-bold animate-pulse">Yapay zeka firmanızı analiz ediyor, lütfen bekleyin...</p>
            </div>
        `;
    }

    const generatedPrompt = generateAIPrompt(companyData);

    try {
        // Vercel'deki güvenli sunucu kodumuza istek atıyoruz (Şifremiz gizli)
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: generatedPrompt })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Arka uç ile bağlantı kurulamadı.");

        const aiResponseText = data.result;

        if (resultArea) {
            resultArea.innerHTML = `
                <div class="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
                    <h4 class="font-bold text-emerald-400 text-lg">✨ YZ Kurumsal Danışman Reçetesi</h4>
                </div>
                <div class="text-sm text-slate-200 overflow-y-auto max-h-[500px] custom-scrollbar space-y-4 pr-2 leading-relaxed">
                    ${aiResponseText}
                </div>
            `;
        }

    } catch (error) {
        console.error("AI Motoru Hatası:", error);
        if (resultArea) {
            resultArea.innerHTML = `<div class="text-red-400 font-bold p-4 bg-red-900/30 border border-red-800 rounded-lg">⚠️ Bir hata oluştu: ${escapeHTML(error.message)}</div>`;
        }
    } finally {
        btn.textContent = "Yeni Bir Rapor Oluştur";
        btn.classList.remove('opacity-70', 'cursor-not-allowed'); btn.disabled = false;
    }
});


// ============================================================================
// 7. SÜPER ADMİN KONTROL MERKEZİ (Yalnızca ERDEM YAVUZ Yetkilidir)
// ============================================================================
document.getElementById('adminPanelCard')?.addEventListener('click', () => {
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('adminModule').classList.remove('hidden');
    fetchAdminData();
});
document.getElementById('btnBackToMenuFromAdmin')?.addEventListener('click', closeAllAndShowMenu);
document.getElementById('btnRefreshAdmin')?.addEventListener('click', fetchAdminData);

/**
 * Süper Admin paneli açıldığında tüm firmaları, organik havuz başvurularını,
 * biletleri ve fiyatlandırma planlarını Supabase'den çeker.
 */
async function fetchAdminData() {
    const usersBody = document.getElementById('usersTableBody');
    const leadsBox = document.getElementById('adminLeadsList');
    const ticketsBox = document.getElementById('adminTicketsList');
    
    // 1. ADMİN: SİSTEME KAYITLI FİRMALARI LİSTELE (+ Plan / Abonelik Durumu Yönetimi)
    if(usersBody) {
        usersBody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-xs text-slate-400">Veritabanına bağlanılıyor...</td></tr>';
        if(supabaseClient) {
            const { data } = await supabaseClient.from('profiles').select('*');
            if(data) {
                // DÜZELTME: Önceden tablo başlıkları (Firma/Yetkili sırası) ile
                // basılan veri sırası birbirini tutmuyordu; aşağıdaki sıralama
                // index.html'deki yeni başlık sırasıyla birebir eşleşiyor.
                usersBody.innerHTML = data.map(u => `
                    <tr class="hover:bg-slate-50 text-xs" data-user-row="${escapeHTML(u.id)}">
                        <td class="p-3 pl-6 font-bold text-slate-800">${escapeHTML(u.first_name)} ${escapeHTML(u.last_name)}</td>
                        <td class="p-3 font-black text-emerald-700">${escapeHTML(u.company_name)}</td>
                        <td class="p-3 font-mono text-slate-500">${escapeHTML(u.phone) || '-'}</td>
                        <td class="p-3">
                            <select data-field="plan_id" class="border border-slate-200 rounded p-1.5 text-[11px] font-bold bg-white outline-none">
                                <option value="baslangic" ${u.plan_id === 'baslangic' ? 'selected' : ''}>Başlangıç ($20)</option>
                                <option value="profesyonel" ${u.plan_id === 'profesyonel' ? 'selected' : ''}>Profesyonel ($49)</option>
                                <option value="kurumsal" ${u.plan_id === 'kurumsal' ? 'selected' : ''}>Kurumsal ($99)</option>
                            </select>
                        </td>
                        <td class="p-3">
                            <select data-field="subscription_status" class="border border-slate-200 rounded p-1.5 text-[11px] font-bold bg-white outline-none">
                                <option value="deneme" ${u.subscription_status === 'deneme' ? 'selected' : ''}>Deneme</option>
                                <option value="aktif" ${u.subscription_status === 'aktif' ? 'selected' : ''}>Aktif</option>
                                <option value="pasif" ${u.subscription_status === 'pasif' ? 'selected' : ''}>Pasif</option>
                                <option value="iptal" ${u.subscription_status === 'iptal' ? 'selected' : ''}>İptal</option>
                            </select>
                        </td>
                        <td class="p-3"><span class="bg-slate-900 text-white font-mono text-[10px] px-2 py-0.5 rounded">${escapeHTML(u.role)}</span></td>
                        <td class="p-3 pr-6 text-right"><button class="btnAdminSaveUserPlan bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded text-[11px] transition">Kaydet</button></td>
                    </tr>`).join('');

                // Olay dinleyicileri innerHTML basıldıktan SONRA tek seferde ekleniyor
                // (DÜZELTME: eskiden döngü içinde += ile satır eklendiğinde, daha önce
                // bağlanan olay dinleyicileri her yeni satırda sıfırlanıyordu)
                usersBody.querySelectorAll('tr[data-user-row]').forEach(row => {
                    const uid = row.getAttribute('data-user-row');
                    row.querySelector('.btnAdminSaveUserPlan')?.addEventListener('click', () => adminSaveUserPlan(uid, row));
                });
            }
        } else {
            usersBody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-red-500">Veritabanı bağlantısı yok (Lokal Simülasyon).</td></tr>';
        }
    }
    
    // 2. ADMİN: ANASAYFADAN GELEN ORGANİK BAŞVURULARI LİSTELE
    if(leadsBox) {
        const organikLeads = crmLeads.filter(l => l.id && !l.id.includes('MANUAL'));
        if(organikLeads.length === 0) {
            leadsBox.innerHTML = '<p class="text-xs text-slate-400 italic">Genel havuzda şu an işlenmemiş organik başvuru bulunmuyor.</p>';
        } else {
            // DÜZELTME: Ziyaretçi verisi artık escapeHTML() ile basılıyor (stored XSS önlendi)
            leadsBox.innerHTML = organikLeads.map(l => `
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center text-xs">
                    <div>
                        <div class="flex items-center gap-2"><strong class="text-sm text-slate-800">${escapeHTML(l.name)}</strong> <span class="font-mono text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">${escapeHTML(l.id)}</span></div>
                        <p class="text-slate-500 mt-1 font-medium">📞 ${escapeHTML(l.phone)} | ✉️ ${escapeHTML(l.email)} | 📍 ${escapeHTML(l.address)}</p>
                        <p class="text-slate-400 mt-2 bg-slate-50 p-2 rounded text-[11px] font-medium border border-slate-100">${escapeHTML(l.notes)}</p>
                    </div>
                    <span class="bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-bold uppercase text-[9px] tracking-wider">Aşama: ${escapeHTML(l.status)}</span>
                </div>`).join('');
        }
    }

    // 3. ADMİN: TEKNİK SERVİS VE ARIZA TALEPLERİNİ LİSTELE
    if(ticketsBox) {
        ticketsBox.innerHTML = '<p class="text-xs text-slate-400 italic">Arıza biletleri taranıyor...</p>';
        if(supabaseClient) {
            const { data } = await supabaseClient.from('support_tickets').select('*').neq('user_id', '00000000-0000-0000-0000-000000000000');
            if(!data || data.length === 0) {
                ticketsBox.innerHTML = '<p class="text-xs text-slate-400 italic">Sistemde kayıtlı arıza/servis talebi bulunmuyor.</p>';
            } else {
                // DÜZELTME: Hem veri escapeHTML() ile temizlendi hem de bilet ID'si
                // tırnaksız bir şekilde onclick içine gömülmediği için (eski hâliyle
                // UUID'lerde JS hatası veriyordu) artık data-attribute + addEventListener kullanılıyor.
                ticketsBox.innerHTML = data.map(t => `
                    <div class="p-4 border border-slate-200 rounded-xl bg-white shadow-sm text-xs" data-ticket-row="${escapeHTML(t.id)}">
                        <div class="flex justify-between items-center border-b pb-2 mb-2">
                            <strong class="text-slate-800 text-sm">${escapeHTML(t.full_name)} (${escapeHTML(t.inverter_model)})</strong>
                            <span class="bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded text-[10px]">Durum: ${escapeHTML(t.status)}</span>
                        </div>
                        <p class="text-slate-600 mb-3 bg-slate-50 p-2 rounded font-medium">${escapeHTML(t.problem_desc)}</p>
                        <div class="flex gap-2">
                            <input type="text" data-ticket-response-input placeholder="Teknisyen yanıtı..." value="${escapeHTML(t.admin_response || '')}" class="flex-1 p-2 border rounded-lg text-xs outline-none">
                            <button data-ticket-respond-btn class="bg-red-600 hover:bg-red-700 text-white font-bold px-4 rounded-lg text-xs transition shadow">Gönder</button>
                        </div>
                    </div>`).join('');

                ticketsBox.querySelectorAll('[data-ticket-row]').forEach(row => {
                    const tId = row.getAttribute('data-ticket-row');
                    row.querySelector('[data-ticket-respond-btn]')?.addEventListener('click', () => {
                        const input = row.querySelector('[data-ticket-response-input]');
                        adminRespondTicket(tId, input.value.trim());
                    });
                });
            }
        } else {
            ticketsBox.innerHTML = '<p class="text-xs text-red-500 font-bold">Veritabanı bağlantısı kapalı.</p>';
        }
    }

    // 4. ADMİN: FİYATLANDIRMA PLANLARI YÖNETİMİ
    adminFetchAndRenderPricingPlans();
}

// Süper Admin'in arıza biletlerine yanıt yazmasını sağlayan fonksiyon
// (DÜZELTME: artık inline onclick yerine olay dinleyicisi ile id ve yanıt metni güvenli şekilde aktarılıyor)
async function adminRespondTicket(id, respValue) {
    if(!respValue) { alert("Lütfen göndermeden önce bir yanıt metni yazın."); return; }
    if(supabaseClient) {
        const { error } = await supabaseClient.from('support_tickets').update({ admin_response: respValue, status: 'Dönüş Yapıldı' }).eq('id', id);
        if (error) { alert("Yanıt kaydedilemedi: " + error.message); return; }
        alert("Teknik servis yanıtı müşteriye başarıyla iletildi!");
        fetchAdminData();
    }
}

// Admin'in bir firmaya doğrudan plan / abonelik durumu ataması
async function adminSaveUserPlan(userId, rowEl) {
    if (!supabaseClient) return;
    const updates = {};
    rowEl.querySelectorAll('[data-field]').forEach(sel => { updates[sel.dataset.field] = sel.value; });
    const { error } = await supabaseClient.from('profiles').update(updates).eq('id', userId);
    if (error) alert("Güncellenemedi: " + error.message);
    else alert("✅ Firmanın plan / abonelik bilgisi güncellendi.");
}
// ============================================================================
// 8. GÜÇ VE FATURA HESAPLAYICI MODÜLÜ (Çekirdek Algoritma)
// Yazan: ERDEM YAVUZ
// ============================================================================

// Eşya Bazlı Hesaplama için DOM Elementleri
const appliancesWrapper = document.getElementById('appliancesWrapper');

/**
 * Sıfır kurulum (faturası olmayan) evler için eşya bazlı tüketim satırı ekler.
 */
function addApplianceRow(name = "", qty = 1, kw = "", hrs = "") {
    if(!appliancesWrapper) return;
    const row = document.createElement('div'); 
    row.className = "appliance-row grid grid-cols-12 gap-2 items-center mt-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm";
    row.innerHTML = `
        <div class="col-span-4"><input type="text" placeholder="Cihaz Adı" value="${escapeHTML(name)}" class="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500"></div>
        <div class="col-span-2"><input type="number" value="${qty}" class="app-qty w-full p-2 border border-slate-300 rounded text-sm text-center outline-none focus:border-blue-500" title="Adet"></div>
        <div class="col-span-3"><input type="number" placeholder="Gücü (kW)" value="${kw}" step="0.01" class="app-kw w-full p-2 border border-slate-300 rounded text-sm text-center outline-none focus:border-blue-500"></div>
        <div class="col-span-2"><input type="number" placeholder="Aylık Saat" value="${hrs}" class="app-hrs w-full p-2 border border-slate-300 rounded text-sm text-center outline-none focus:border-blue-500"></div>
        <div class="col-span-1 text-center"><button class="btn-delete-app text-red-500 font-bold text-xl hover:text-red-700 transition">&times;</button></div>
    `;
    row.querySelector('.btn-delete-app').addEventListener('click', () => row.remove()); 
    appliancesWrapper.appendChild(row);
}

// Hazır cihaz butonlarını dinle
if(document.getElementById('btnAddAppliance')) {
    const defaultApps = [{ name: 'Buzdolabı', qty: 1, kw: 0.15, hrs: 240 }, { name: 'Çamaşır Makinesi', qty: 1, kw: 0.8, hrs: 20 }, { name: 'Bulaşık Makinesi', qty: 1, kw: 1.2, hrs: 15 }, { name: 'Aydınlatma (LED)', qty: 10, kw: 0.01, hrs: 150 }];
    defaultApps.forEach(app => addApplianceRow(app.name, app.qty, app.kw, app.hrs));
    document.getElementById('btnAddAppliance').addEventListener('click', () => addApplianceRow());
    document.getElementById('quickAddSelect').addEventListener('change', e => { 
        if (e.target.value) { 
            const [n, q, k, h] = e.target.value.split('|'); 
            addApplianceRow(n, q, k, h); 
            e.target.value = ""; 
        } 
    });
}

// DÜZELTME: "12 Aylık Detaylı" sekmesi seçildiğinde girilecek input alanları
// hiçbir zaman üretilmiyordu (monthsGrid boş kalıyordu, hesaplama hep 0 dönüyordu).
// Sayfa yüklenirken 12 ay için otomatik olarak giriş kutuları oluşturuluyor.
const monthsGridContainer = document.getElementById('monthsGrid');
if (monthsGridContainer) {
    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    monthNames.forEach(monthName => {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <label class="block text-[11px] font-bold text-slate-500 mb-1">${monthName}</label>
            <input type="number" class="month-input w-full p-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500" placeholder="kWh" value="350">
        `;
        monthsGridContainer.appendChild(wrap);
    });
}

// Radyo butonları (Aylık Fatura / Yıllık / Eşya Bazlı) geçişlerini dinle
document.querySelectorAll('input[name="inputType"]')?.forEach(radio => {
    radio.addEventListener('change', (e) => {
        document.querySelectorAll('.input-section').forEach(sec => sec.classList.add('hidden'));
        const targetEl = document.getElementById(e.target.value + 'InputSection');
        if (targetEl) targetEl.classList.remove('hidden');
    });
});

// Gelecekte eklenecek yükler (EV, Isı Pompası) için geçiş butonları
document.getElementById('hasFutureLoads')?.addEventListener('change', e => document.getElementById('futureLoadsContainer').classList.toggle('hidden', !e.target.checked));
document.getElementById('checkEV')?.addEventListener('change', e => document.getElementById('wrapEV').classList.toggle('hidden', !e.target.checked));
document.getElementById('checkHP')?.addEventListener('change', e => document.getElementById('wrapHP').classList.toggle('hidden', !e.target.checked));

document.getElementById('btnAddCustomLoad')?.addEventListener('click', () => {
    const row = document.createElement('div'); row.className = "flex space-x-2 bg-slate-50 p-3 rounded-lg border border-slate-200 shadow-sm items-center";
    row.innerHTML = `<input type="text" placeholder="Yükün Adı (Örn: Havuz)" class="w-1/2 p-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500"><input type="number" placeholder="Aylık Harcama (kWh)" class="custom-load-input w-1/3 p-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500" value="0"><button class="btn-delete-load text-red-500 font-bold px-3 hover:text-red-700 transition">Sil</button>`;
    row.querySelector('.btn-delete-load').addEventListener('click', () => row.remove()); 
    document.getElementById('customLoadsWrapper').appendChild(row);
});

// Ana Hesaplama Motoru: Tüm girilen verileri harmanlayarak GES kapasitesini ve kazancı hesaplar
document.getElementById('btnCalculate')?.addEventListener('click', () => {
    let base = 0; 
    const type = document.querySelector('input[name="inputType"]:checked').value;
    
    // Tüketim bazını hesapla
    if (type === 'monthly') {
        base = parseFloat(document.getElementById('averageMonthlyLoad').value) || 0;
    } else if (type === 'yearly') { 
        let t = 0; document.querySelectorAll('.month-input').forEach(i => t += parseFloat(i.value) || 0); base = t / 12; 
    } else { 
        let t = 0; 
        document.querySelectorAll('.appliance-row').forEach(r => t += (parseFloat(r.querySelector('.app-qty').value)||0) * (parseFloat(r.querySelector('.app-kw').value)||0) * (parseFloat(r.querySelector('.app-hrs').value)||0)); 
        base = t; 
    }

    // Ekstra yükleri (EV, HP vb.) hesapla
    let extra = 0;
    if (document.getElementById('hasFutureLoads').checked) {
        if(document.getElementById('checkEV').checked) extra += (parseFloat(document.getElementById('evMonthlyKm').value)||0)/100 * (parseFloat(document.getElementById('evConsumptionRate').value)||0);
        if(document.getElementById('checkHP').checked) extra += parseFloat(document.getElementById('hpMonthlyLoad').value) || 0;
        document.querySelectorAll('.custom-load-input').forEach(i => extra += parseFloat(i.value) || 0);
    }

    // Toplam değerler
    let sonAylik = base + extra; 
    let sonYillik = sonAylik * 12; 
    let trf = parseFloat(document.getElementById('tariffSelect').value); 
    let sonFatura = sonAylik * trf;

    // Sonuçları ekrana bas
    document.getElementById('finalMonthlyLoad').textContent = Math.round(sonAylik).toLocaleString('tr-TR');
    document.getElementById('finalYearlyLoad').textContent = Math.round(sonYillik).toLocaleString('tr-TR');
    document.getElementById('finalMonthlyBill').textContent = sonFatura.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    document.getElementById('resultsModule').classList.remove('hidden'); 
    document.getElementById('resultsModule').scrollIntoView({ behavior: 'smooth' });
});

// DÜZELTME: Bu iki buton (PDF indir / Mail at) arayüzde mevcuttu ve gerekli
// kütüphaneler (html2pdf.js, EmailJS) index.html'de zaten yükleniyordu, ama
// hiçbir JS karşılığı yazılmamıştı; basıldığında hiçbir şey olmuyordu.

document.getElementById('btnDownloadPDF')?.addEventListener('click', () => {
    const element = document.getElementById('reportContent');
    if (!element) return;
    if (typeof html2pdf === 'undefined') { alert('PDF kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.'); return; }
    const opt = {
        margin: 0.4,
        filename: 'Solar_GES_Teklif_Raporu.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
});

document.getElementById('btnSendEmail')?.addEventListener('click', async () => {
    const toEmail = document.getElementById('customerEmail').value.trim();
    if (!toEmail) { alert('Lütfen müşterinin e-posta adresini girin.'); return; }
    if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_QUOTE_TEMPLATE_ID || typeof emailjs === 'undefined') {
        alert('✉️ E-posta gönderimi için app.js dosyasının en üstündeki EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID ve EMAILJS_QUOTE_TEMPLATE_ID alanlarını kendi EmailJS hesap bilgilerinizle doldurmanız gerekiyor.');
        return;
    }
    const btn = document.getElementById('btnSendEmail'); const originalText = btn.innerHTML;
    btn.textContent = 'Gönderiliyor...'; btn.disabled = true;
    try {
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_QUOTE_TEMPLATE_ID, {
            to_email: toEmail,
            monthly_kwh: document.getElementById('finalMonthlyLoad').textContent,
            yearly_kwh: document.getElementById('finalYearlyLoad').textContent,
            monthly_bill: document.getElementById('finalMonthlyBill').textContent
        });
        alert('✅ Teklif müşteriye başarıyla e-posta ile iletildi!');
    } catch (err) {
        console.error(err);
        alert('⚠️ E-posta gönderilemedi: ' + (err && (err.text || err.message) || 'Bilinmeyen hata'));
    } finally {
        btn.innerHTML = originalText; btn.disabled = false;
    }
});


// ============================================================================
// 9. 3D MİMARİ VE ENERJİ BAĞIMSIZLIK SİMÜLASYONU (Three.js Motoru)
// ============================================================================
let appScene, appCamera, appRenderer, appControls, appObjs;
let stateGES = false, stateHP = false;
let countBat = 0, countEV = 0;
let currentGrid = 100;

/**
 * 3D Sahneyi ve Nesneleri yaratan fabrika fonksiyonu.
 */
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

/**
 * 3D Simülasyon modülünü başlatan ana fonksiyon. Sadece modüle ilk girildiğinde tetiklenir.
 */
window.initApp3DScene = function() {
    const container = document.getElementById('three-canvas-container');
    if (!container || appScene) return;

    appScene = new THREE.Scene();
    appScene.background = new THREE.Color(0x0f172a); // Koyu arka plan
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
    appControls.maxPolarAngle = Math.PI / 2 - 0.05; // Yerin altına inmeyi engelle

    // Işıklar
    appScene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.5);
    sunLight.position.set(15, 30, 15); sunLight.castShadow = true;
    appScene.add(sunLight);

    appObjs = createEcoSystem(appScene);
    const loadingEl = document.getElementById('loading3D');
    if(loadingEl) loadingEl.style.display = 'none';

    // UI Buton Dinleyicileri (Durum Değişiklikleri)
    document.getElementById('btnSimGES')?.addEventListener('click', (e) => { stateGES = !stateGES; e.target.classList.toggle('bg-emerald-600'); updateAppScore(); });
    document.getElementById('btnSimHP')?.addEventListener('click', (e) => { stateHP = !stateHP; e.target.classList.toggle('bg-emerald-600'); updateAppScore(); });
    document.getElementById('btnSimBatPlus')?.addEventListener('click', () => { if(countBat < 4) { countBat++; updateAppScore(); }});
    document.getElementById('btnSimBatMinus')?.addEventListener('click', () => { if(countBat > 0) { countBat--; updateAppScore(); }});
    document.getElementById('btnSimEVPlus')?.addEventListener('click', () => { if(countEV < 2) { countEV++; updateAppScore(); }});
    document.getElementById('btnSimEVMinus')?.addEventListener('click', () => { if(countEV > 0) { countEV--; updateAppScore(); }});

    // Ana Animasyon Döngüsü
    function animate() {
        requestAnimationFrame(animate);
        if (appObjs) {
            // İlgili modüller açıksa yavaşça (lerp ile) büyüyerek sahnede belirirler
            appObjs.panels.scale.lerp(new THREE.Vector3(stateGES?1:0, stateGES?1:0, stateGES?1:0), 0.1);
            appObjs.inverterGroup.scale.lerp(new THREE.Vector3(stateGES?1:0, stateGES?1:0, stateGES?1:0), 0.1);
            appObjs.hp.scale.lerp(new THREE.Vector3(stateHP?1:0, stateHP?1:0, stateHP?1:0), 0.1);
            appObjs.gasPipe.scale.lerp(new THREE.Vector3(stateHP?0:1, stateHP?0:1, stateHP?0:1), 0.1);
            appObjs.batteries.forEach((b, i) => b.scale.lerp(new THREE.Vector3(i<countBat?1:0, i<countBat?1:0, i<countBat?1:0), 0.1));
            appObjs.evs.forEach((v, i) => v.scale.lerp(new THREE.Vector3(i<countEV?1:0, i<countEV?1:0, i<countEV?1:0), 0.1));
            
            // Şebeke kablosu animasyonu (Enerji aktığını simüle eder)
            // DÜZELTME: "dashOffset" özelliği kullanılan three.js r128 sürümünde
            // desteklenmiyordu; atama sessizce hiçbir görsel etki yaratmıyordu.
            // Bunun yerine, gerçekten çalışan bir opaklık-nabzı (pulse) animasyonu kullanıyoruz.
            if(appObjs.gridCableMat) {
                const pulse = 0.55 + Math.sin(Date.now() * 0.004) * 0.35;
                appObjs.gridCableMat.opacity = Math.max(0.2, Math.min(1, pulse));
            }
            if(appObjs.gridCable) {
                appObjs.gridCable.visible = currentGrid > 0;
                // Şebekeden ne kadar bağımsızsak, kablo o kadar yeşile/maviye döner
                appObjs.gridCableMat.color.setHex(currentGrid > 50 ? 0xef4444 : 0x0ea5e9);
            }
        }
        appControls.update();
        appRenderer.render(appScene, appCamera);
    }
    animate();
}

/**
 * 3D Sahnedeki seçimlere göre Bağımsızlık Skorunu hesaplar ve Ekrana Basar.
 */
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

    // Skor Renk Değişimi
    const sColor = document.getElementById('scoreDisplay');
    if(sColor) {
        sColor.className = "text-xs px-2 py-1 rounded text-white font-bold transition-colors duration-500 shadow";
        if(score < 30) sColor.classList.add('bg-red-500');
        else if(score < 70) sColor.classList.add('bg-orange-500');
        else if(score < 100) sColor.classList.add('bg-emerald-500');
        else sColor.classList.add('bg-emerald-600', 'animate-pulse');
    }
}


// ============================================================================
// 10. EV YÜK & SOLAR ŞARJ HESAPLAYICISI
// ============================================================================
let activeEVTab = 'tabBill';

document.querySelectorAll('.ev-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Tab Buton Stil Değişimi
        document.querySelectorAll('.ev-tab-btn').forEach(b => { 
            b.classList.remove('bg-teal-600', 'text-white'); 
            b.classList.add('bg-slate-100', 'text-slate-600'); 
        });
        e.target.classList.remove('bg-slate-100', 'text-slate-600'); 
        e.target.classList.add('bg-teal-600', 'text-white');
        
        // İçerik Geçişi
        document.querySelectorAll('.ev-tab-content').forEach(c => c.classList.add('hidden'));
        activeEVTab = e.target.getAttribute('data-target');
        document.getElementById(activeEVTab)?.classList.remove('hidden');
        calculateEVSolar(); // Tab değiştiğinde anında tekrar hesapla
    });
});

document.querySelectorAll('.ev-reactive-input').forEach(input => input.addEventListener('input', calculateEVSolar));

window.calculateEVSolar = function() {
    const tariff = parseFloat(document.getElementById('evCalcTariff')?.value) || 2.50;
    const evRange = parseFloat(document.getElementById('evCalcRange')?.value) || 1;
    const evBattery = parseFloat(document.getElementById('evCalcBattery')?.value) || 1;
    const evConsumption = parseFloat(document.getElementById('evCalcConsumption')?.value) || 1;
    const evACSpeed = parseFloat(document.getElementById('evCalcACSpeed')?.value) || 11; 
    const userRoof = parseFloat(document.getElementById('evInputRoof')?.value) || 0;
    const maxUsableRoof = userRoof * 0.8;
    
    // Şarj Öneri Motoru
    const recommendationBox = document.getElementById('evChargerRecommendation');
    if (recommendationBox) {
        if (evACSpeed > 0 && evBattery > 0) {
            const chargeTime = (evBattery / evACSpeed).toFixed(1);
            recommendationBox.innerHTML = `<strong>💡 Şarj İstasyonu Önerisi:</strong> Aracınızın tam doluma (%0 - %100) ulaşması ${evACSpeed} kW'lık bir ev tipi (AC) şarj cihazı ile yaklaşık <strong>${chargeTime} saat</strong> sürecektir.`;
        } else {
            recommendationBox.innerHTML = "Lütfen geçerli bir batarya kapasitesi ve şarj hızı girin.";
        }
    }

    let requiredPowerKwp = 0, dailyProductionKwh = 0;
    let houseMonthlyKwh = 0, evMonthlyKwh = 0;

    // Seçili Tab'a Göre Tüketim Çıkarımı
    if (activeEVTab === 'tabBill') {
        const monthlyBill = parseFloat(document.getElementById('evInputBill')?.value) || 0;
        houseMonthlyKwh = monthlyBill / tariff;
        evMonthlyKwh = 1500 * (evConsumption / 100); // Ortalama 1500km varsayımı
    } 
    else if (activeEVTab === 'tabKwh') {
        houseMonthlyKwh = parseFloat(document.getElementById('evInputKwh')?.value) || 0;
        if(document.getElementById('dynamicBillEquiv')) {
            document.getElementById('dynamicBillEquiv').innerText = (houseMonthlyKwh * tariff).toFixed(2) + " TL";
        }
        evMonthlyKwh = 1500 * (evConsumption / 100); 
    } 
    else if (activeEVTab === 'tabKm') {
        const km = parseFloat(document.getElementById('evInputKm')?.value) || 0;
        evMonthlyKwh = km * (evConsumption / 100);
        houseMonthlyKwh = 350; // Standart ev varsayımı
    }

    // Nihai Enerji Matematiği
    const totalMonthlyKwh = houseMonthlyKwh + evMonthlyKwh;
    dailyProductionKwh = totalMonthlyKwh / 30;
    requiredPowerKwp = dailyProductionKwh / 4; // Ortalama Türkiye güneşlenme süresi (4 saat)
    const requiredAreaM2 = requiredPowerKwp * 5; // 1 kWp panel ortalama 5 m2 yer kaplar
    const totalMonthlyProduction = dailyProductionKwh * 30;

    // Sonuçları Yazdır
    if(document.getElementById('resPower')) document.getElementById('resPower').innerText = requiredPowerKwp.toFixed(2);
    if(document.getElementById('resArea')) document.getElementById('resArea').innerText = requiredAreaM2.toFixed(1);
    if(document.getElementById('resProduction')) document.getElementById('resProduction').innerText = Math.round(totalMonthlyProduction).toLocaleString('tr-TR');
    
    // Güneşle Kazanılan Menzil (Evden artan enerjiyi araca basıyoruz)
    const surplusEnergy = Math.max(0, totalMonthlyProduction - houseMonthlyKwh);
    const solarRange = (surplusEnergy / evBattery) * evRange;
    if(document.getElementById('resSolarRange')) document.getElementById('resSolarRange').innerText = Math.round(solarRange).toLocaleString('tr-TR');
    
    // Progress Bar (Batarya Şarj İlerlemesi)
    const chargeRatio = evBattery > 0 ? (surplusEnergy / evBattery) * 100 : 0;
    const barWidth = Math.min(chargeRatio, 100); 
    
    const resBar = document.getElementById('resChargeBar');
    const resPercent = document.getElementById('resChargePercent');
    
    if(resBar) resBar.style.width = barWidth + '%';
    if(resPercent) resPercent.innerText = `%${Math.round(chargeRatio)}`;
    
    // Çatı Uyarı Sistemi
    const warning = document.getElementById('roofWarningBanner');
    if(warning) {
        if (requiredAreaM2 > maxUsableRoof && maxUsableRoof > 0) {
            warning.classList.remove('hidden');
        } else {
            warning.classList.add('hidden');
        }
    }
}


// ============================================================================
// 11. TEKNİK SERVİS MODÜLÜ (Sadece Firmalar Arıza Bildirebilir)
// ============================================================================
document.getElementById('tabNewTicket')?.addEventListener('click', () => {
    document.getElementById('ticketForm').classList.remove('hidden'); 
    document.getElementById('myTicketsArea').classList.add('hidden');
    document.getElementById('tabNewTicket').classList.add('text-red-600', 'border-b-2', 'bg-red-50/50'); 
    document.getElementById('tabNewTicket').classList.remove('text-slate-500');
    document.getElementById('tabMyTickets').classList.add('text-slate-500'); 
    document.getElementById('tabMyTickets').classList.remove('text-red-600', 'border-b-2', 'bg-red-50/50');
});

document.getElementById('tabMyTickets')?.addEventListener('click', () => {
    document.getElementById('ticketForm').classList.add('hidden'); 
    document.getElementById('myTicketsArea').classList.remove('hidden');
    document.getElementById('tabMyTickets').classList.add('text-red-600', 'border-b-2', 'bg-red-50/50'); 
    document.getElementById('tabMyTickets').classList.remove('text-slate-500');
    document.getElementById('tabNewTicket').classList.add('text-slate-500'); 
    document.getElementById('tabNewTicket').classList.remove('text-red-600', 'border-b-2', 'bg-red-50/50');
    fetchMyTickets(); // Tıklandığında firmanın önceki arıza kayıtlarını çek
});

document.getElementById('ticketForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!supabaseClient) { alert("Supabase veritabanı aktif değil. Test ortamındasınız."); return; }

    // DÜZELTME: Oturum süresi dolmuşsa getUser() boş dönüp çökme hatasına yol açıyordu.
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
        alert("Oturumunuz sona ermiş görünüyor. Lütfen tekrar giriş yapın.");
        window.location.hash = '#auth';
        return;
    }
    
    const btn = document.getElementById('btnSubmitTicket'); 
    btn.innerHTML = "Gönderiliyor..."; btn.disabled = true;

    // Firmaya ait arıza kaydını (Ticket) veritabanına işle
    const { error } = await supabaseClient.from('support_tickets').insert([{
        user_id: userData.user.id,
        full_name: document.getElementById('tsName').value,
        phone: document.getElementById('tsPhone').value,
        email: document.getElementById('tsEmail').value,
        address: document.getElementById('tsAddress').value,
        inverter_model: document.getElementById('tsInverter').value,
        battery_model: document.getElementById('tsBattery').value,
        installer_name: document.getElementById('tsInstaller').value,
        install_date: document.getElementById('tsInstallDate').value,
        problem_date: document.getElementById('tsProblemDate').value,
        problem_desc: document.getElementById('tsProblemDesc').value,
        status: 'Başvuru İletildi'
    }]);

    if (error) alert("Hata: " + error.message);
    else { 
        alert("Arıza kaydınız başarıyla merkeze iletildi. En kısa sürede dönüş sağlanacaktır."); 
        document.getElementById('ticketForm').reset(); 
        document.getElementById('tabMyTickets').click(); 
    }
    btn.innerHTML = "<span>📨</span> Yetkili Servis Talebini Merkeze Gönder"; 
    btn.disabled = false;
});

async function fetchMyTickets() {
    if(!supabaseClient) return;
    const list = document.getElementById('myTicketsList');
    if(!list) return;
    
    list.innerHTML = '<p class="text-slate-500 text-sm font-medium">Biletleriniz veritabanından çekiliyor...</p>';

    // DÜZELTME: Oturum süresi dolmuşsa getUser() boş dönüp çökme hatasına yol açıyordu.
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
        list.innerHTML = '<p class="text-red-500 text-sm font-medium">Oturumunuz bulunamadı, lütfen tekrar giriş yapın.</p>';
        return;
    }

    const { data, error } = await supabaseClient.from('support_tickets').select('*').eq('user_id', userData.user.id).order('created_at', { ascending: false });

    if (error || !data || data.length === 0) { 
        list.innerHTML = '<p class="text-slate-500 text-sm font-medium">Daha önce açılmış bir arıza kaydınız (biletiniz) bulunmuyor.</p>'; 
        return; 
    }
    // DÜZELTME: Tüm metin alanları escapeHTML() ile temizlendi
    list.innerHTML = data.map(t => {
        let sc = "bg-slate-100 text-slate-800"; 
        if(t.status === "Değerlendiriliyor") sc = "bg-blue-100 text-blue-800 border border-blue-200"; 
        if(t.status === "Dönüş Yapıldı") sc = "bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm";
        
        return `
            <div class="p-6 bg-white border border-slate-200 rounded-xl mb-3 shadow-sm hover:shadow transition">
                <div class="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                    <h4 class="font-black text-slate-800 text-lg">${escapeHTML(t.inverter_model)} <span class="text-xs text-slate-400 font-normal tracking-widest block mt-1">${new Date(t.created_at).toLocaleDateString('tr-TR')}</span></h4>
                    <span class="${sc} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">${escapeHTML(t.status)}</span>
                </div>
                <p class="text-sm bg-slate-50 border border-slate-100 p-3 rounded-lg text-slate-600 mb-2 font-medium">${escapeHTML(t.problem_desc)}</p>
                ${t.admin_response ? `
                <div class="mt-4 bg-emerald-50 p-4 rounded-lg border border-emerald-200">
                    <p class="text-sm text-emerald-900 leading-relaxed"><strong>🔧 Merkez Yanıtı:</strong> ${escapeHTML(t.admin_response)}</p>
                </div>` : '<p class="text-xs text-slate-400 mt-2 italic flex items-center gap-1"><span>⏳</span> Henüz teknisyen yanıtı bekleniyor...</p>'}
            </div>
        `;
    }).join('');
}


// ============================================================================
// 12. SATIŞ ASİSTANI (COPILOT) VE DİNAMİK İTİRAZ YÖNETİMİ
// ============================================================================
// Varsayılan İtiraz Senaryoları Havuzu (Local Veritabanı)
const salesScenarios = {
    kurulum: {
        "300 m² evim var, GES istiyorum": "Sadece metrekare üzerinden verimli bir güneş enerjisi sistemi hesaplayamayız. Tüketim alışkanlıklarınızdan veya faturanızdan yola çıkarsak sizi doğru yönlendirmiş olurum.",
        "3.000 TL fatura ödüyorum": "Bu faturaya göre yaklaşık 10 kW kapasiteli bir sistem tavsiye edebilirim. Çatınızda yaklaşık 50 metrekare yer kaplar. Peki bölgenizde çok sık elektrik kesiliyor mu?",
        "Evet, sık kesiliyor": "Elektrik kesintisinin sık yaşandığı yerlerde mutlaka bataryalı hibrit sistem tavsiye etmekteyiz. Kesinti esnasında ne kadar süre ve hangi cihazları çalıştırmak istersiniz?",
        "Peki maliyeti nedir?": "Sizin için hesapladığımız 10 kW sistem ve 5 kWh batarya için referans bedel toplam <strong>{totalPrice} Dolar</strong> civarıdır. Kesin fiyat için teknik ekibimizle bir keşif planlayalım.",
        "X firması Çin malı panelle yarı fiyat verdi": "Haklısınız, dışarıdan bakıldığında hepsi cam ve silikon gibi görünüyor. Ancak güneş paneli çatınızda 25 yıl duracak ciddi bir yatırımdır. X firmasından 3 yıl sonra muhatap bulamadığınızda yaşayacağınız zarar, şu anki fiyat farkından çok daha büyük olacaktır.",
        "Eşimle görüşmem gerekiyor": "Kesinlikle, bu durum aileniz için çok önemli. Ancak düşünün; eşinizin akşamları şebeke kesintisinden dolayı karanlıkta kalmasını veya sürekli artan faturalarla strese girmesini ister misiniz?",
        "Haklısınız fakat şu an param yok": "Sizi çok iyi anlıyorum. Kredi veya ödeme planı konusunda yardımcı olabiliriz. Kurulum öncesi %40, kurulum sonrası %60 şeklinde esnek koşullar oluşturabiliriz.",
        "Şu an kendimi hazır hissetmiyorum": "Güneş her gün doğup batıyor. O enerjiyi her gün bedava üretip faturanızı sıfırlamak varken neden bekleyerek para kaybetmeye devam edelim?"
    },
    danismanlik: {
        "GES kurdurmak istiyorum ama birden fazla teklif var": "Sizi çok iyi anlıyorum. Her şeyden önce, biz doğrudan 'tüketim hesabı' ile başlıyoruz. Ardından gelen teklifleri elma ile elma olarak kıyaslamanızı sağlıyoruz.",
        "Sürece nasıl başlayabilirim / Maliyeti nedir?": "Sizi tüm karmaşadan ve yanlış kurulum riskinden kurtaran teknik danışmanlık hizmetimizin bedeli <strong>{consultPrice} TL</strong>'dir.",
        "Bu fiyat çok fazla geldi": "Haklısınız, başlangıçta ekstra bir maliyet gibi görünebilir. Ancak sizi ucuz ve kısa sürede çöp olacak sistemlerden koruyoruz. İnanın çöpe gidecek yüzbinlerce liradan tasarruf edeceksiniz.",
        "Eşimle görüşmem gerekiyor": "İsterseniz ödemeyi aldıktan sonra hemen bir e-toplantı organize edelim. Eşiniz de katılsın ve aklındaki tüm soru işaretlerini ben doğrudan cevaplayayım."
    }
};

// DÜZELTME: "Anahtar Teslim Kurulum" / "Sadece Danışmanlık" seçimi yapıldığında
// ilgili fiyat kutuları (kW/Batarya fiyatı veya Danışmanlık fiyatı) hiç değişmiyordu.
document.querySelectorAll('input[name="companyType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const isKurulum = e.target.value === 'kurulum';
        document.getElementById('setupKurulumPrices')?.classList.toggle('hidden', !isKurulum);
        document.getElementById('setupDanismanlikPrices')?.classList.toggle('hidden', isKurulum);
    });
});

// Satış ekibinin ortak havuza yeni bir itiraz senaryosu kaydetmesi
document.getElementById('btnSaveNewObjection')?.addEventListener('click', async () => {
    const objection = document.getElementById('newObjectionInput').value.trim();
    const response = document.getElementById('newResponseInput').value.trim();
    const compType = document.querySelector('input[name="companyType"]:checked').value;

    if (!objection || !response) {
        alert("Lütfen hem müşterinin itiraz cümlesini hem de asistanın vermesi gereken taktiksel yanıtı doldurun."); return;
    }
    const btn = document.getElementById('btnSaveNewObjection');
    btn.innerHTML = "Ortak Havuza Kaydediliyor..."; btn.disabled = true;

    if(supabaseClient) {
        const { error } = await supabaseClient.from('sales_copilot_scripts').insert([{
            company_type: compType, objection: objection, response: response
        }]);
        if (error) { alert("Hata: Kayıt yapılamadı."); console.error(error); } 
        else {
            alert("🎉 Yeni hazır cevap senaryosu başarıyla ortak arşive eklendi!");
            document.getElementById('newObjectionInput').value = ''; document.getElementById('newResponseInput').value = '';
        }
    } else {
        alert("Test ortamındasınız. Veri yerel havuza simüle edildi.");
    }
    btn.innerHTML = "<span>☁️</span> Cevabı Tüm Satış Ekipleri İçin Kaydet"; btn.disabled = false;
});

// Satış Asistanı Görüşme Panelini Başlatır
document.getElementById('btnStartCall')?.addEventListener('click', async () => {
    document.getElementById('salesSetupArea').classList.add('hidden');
    document.getElementById('activeCallArea').classList.remove('hidden');
    
    const compType = document.querySelector('input[name="companyType"]:checked').value;
    document.getElementById('activeStrategyLabel').textContent = "Seçili Strateji: " + (compType === 'kurulum' ? "EPC (Anahtar Teslim)" : "Danışmanlık");

    const kwPrice = parseFloat(document.getElementById('baseKwPrice').value) || 0;
    const batPrice = parseFloat(document.getElementById('baseBatPrice').value) || 0;
    const consultPrice = parseFloat(document.getElementById('baseConsultPrice').value) || 0;
    
    const container = document.getElementById('objectionButtonsContainer');
    container.innerHTML = '<p class="text-sm text-slate-400 italic p-2 text-center">Güncel veritabanı senkronize ediliyor...</p>';
    
    let mergedScenarios = { ...salesScenarios[compType] };

    // Eğer veritabanında başka satışçıların eklediği senaryolar varsa onları da havuza çek
    if(supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('sales_copilot_scripts').select('*').eq('company_type', compType);
            if (!error && data) {
                data.forEach(item => { mergedScenarios[item.objection] = item.response; });
            }
        } catch (err) { console.warn("Dinamik senaryolara erişilemedi."); }
    }

    container.innerHTML = '';
    for (const [objection, response] of Object.entries(mergedScenarios)) {
        const btn = document.createElement('button');
        btn.className = "text-left w-full bg-white hover:bg-orange-50 border border-slate-200 p-4 rounded-xl shadow-sm font-bold text-slate-700 transition-all text-sm leading-relaxed";
        btn.innerHTML = `💬 "${escapeHTML(objection)}"`;
        
        // Müşteri itirazına tıklandığında prompter ekranına metni basan dinleyici
        btn.addEventListener('click', () => {
            // Dinamik fiyat etiketlerini ({totalPrice} vb.) yetkilinin girdiği güncel rakamlarla değiştir
            const finalRes = response
                .replace('{totalPrice}', ((10 * kwPrice) + (5 * batPrice)).toLocaleString('tr-TR'))
                .replace('{consultPrice}', consultPrice.toLocaleString('tr-TR'));
            
            document.getElementById('scriptDisplayArea').innerHTML = `<p class="text-white text-3xl leading-snug font-medium animate-fade-in">${finalRes}</p>`;
        });
        container.appendChild(btn);
    }
});

// Görüşmeyi (Satış Asistanı ekranını) Sonlandır
document.getElementById('btnEndCall')?.addEventListener('click', () => {
    document.getElementById('activeCallArea').classList.add('hidden');
    document.getElementById('salesSetupArea').classList.remove('hidden');
    document.getElementById('scriptDisplayArea').innerHTML = `<p class="text-slate-600 text-lg font-medium italic animate-pulse">Sol taraftan müşterinin söylediği itirazı seçtiğinizde, okumanız gereken psikolojik yanıt burada belirecektir.</p>`;
});


// ============================================================================
// 13. ABONELİK PAKETLERİ VE ÖDEME ALT YAPISI (PRICING & SUBSCRIPTION ENGINE)
// ============================================================================
// NOT: Bu bölüm sadece İSTEMCİ (client) tarafını hazırlar:
//   1) Fiyat planlarını Supabase 'pricing_plans' tablosundan çeker — admin
//      panelinden (Bölüm 7) bu tabloyu doğrudan düzenleyebilir.
//   2) Ziyaretçiye anasayfada fiyat kartlarını gösterir (aylık/yıllık seçenekli).
//   3) "Bu Paketi Seç" butonuna basıldığında /api/create-checkout-session adlı
//      sunucu uç noktasına istek atar (örnek sunucu kodu ayrıca paylaşıldı:
//      api-create-checkout-session.js — gerçek tahsilat için Vercel/Stripe
//      hesabınıza kurmanız gerekir).
// 'pricing_plans' tablosu henüz yoksa veya boşsa, site PRICING_PLANS_FALLBACK
// içindeki varsayılan paketleri gösterir; sayfa asla boş/kırık kalmaz.

const PRICING_PLANS_FALLBACK = [
    { id: 'baslangic-monthly', plan_key: 'baslangic', name: 'Başlangıç', price_usd: 20, billing_period: 'monthly', description: 'Tek şube, yeni kurulan EPC firmaları için', features: ['1 Kullanıcı Hesabı', 'Sınırsız Lead / CRM Kaydı', 'Güç & Fatura Hesaplayıcı', 'PDF Teklif & E-posta Gönderimi'], is_popular: false, is_active: true, sort_order: 1 },
    { id: 'profesyonel-monthly', plan_key: 'profesyonel', name: 'Profesyonel', price_usd: 49, billing_period: 'monthly', description: 'Büyüyen satış ekipleri için', features: ['5 Kullanıcı Hesabı', 'Tüm Başlangıç Özellikleri', '3D Enerji Simülasyonu', 'Satış Copilot & İtiraz Yönetimi', 'Web Sitenize Iframe Entegrasyonu'], is_popular: true, is_active: true, sort_order: 2 },
    { id: 'kurumsal-monthly', plan_key: 'kurumsal', name: 'Kurumsal', price_usd: 99, billing_period: 'monthly', description: 'Çok şubeli firmalar ve bayilik ağları için', features: ['Sınırsız Kullanıcı', 'Tüm Profesyonel Özellikleri', 'Öncelikli Teknik Servis Hattı', 'Özel Marka (White-Label) Seçeneği'], is_popular: false, is_active: true, sort_order: 3 },
    { id: 'baslangic-yearly', plan_key: 'baslangic', name: 'Başlangıç', price_usd: 192, billing_period: 'yearly', description: 'Tek şube, yeni kurulan EPC firmaları için (Yıllıkta 2 ay hediye)', features: ['1 Kullanıcı Hesabı', 'Sınırsız Lead / CRM Kaydı', 'Güç & Fatura Hesaplayıcı', 'PDF Teklif & E-posta Gönderimi'], is_popular: false, is_active: true, sort_order: 1 },
    { id: 'profesyonel-yearly', plan_key: 'profesyonel', name: 'Profesyonel', price_usd: 470, billing_period: 'yearly', description: 'Büyüyen satış ekipleri için (Yıllıkta 2 ay hediye)', features: ['5 Kullanıcı Hesabı', 'Tüm Başlangıç Özellikleri', '3D Enerji Simülasyonu', 'Satış Copilot & İtiraz Yönetimi', 'Web Sitenize Iframe Entegrasyonu'], is_popular: true, is_active: true, sort_order: 2 },
    { id: 'kurumsal-yearly', plan_key: 'kurumsal', name: 'Kurumsal', price_usd: 950, billing_period: 'yearly', description: 'Çok şubeli firmalar ve bayilik ağları için (Yıllıkta 2 ay hediye)', features: ['Sınırsız Kullanıcı', 'Tüm Profesyonel Özellikleri', 'Öncelikli Teknik Servis Hattı', 'Özel Marka (White-Label) Seçeneği'], is_popular: false, is_active: true, sort_order: 3 }
];

let activeBillingPeriod = 'monthly';
window._cachedPricingPlans = null;

async function fetchPricingPlans() {
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('pricing_plans').select('*').eq('is_active', true).order('sort_order', { ascending: true });
            if (!error && data && data.length > 0) { window._cachedPricingPlans = data; return data; }
        } catch (err) {
            console.warn("Fiyat planları Supabase'den çekilemedi, varsayılan paketler gösteriliyor.", err);
        }
    }
    window._cachedPricingPlans = PRICING_PLANS_FALLBACK;
    return PRICING_PLANS_FALLBACK;
}

async function renderPublicPricingSection() {
    const container = document.getElementById('pricingCardsContainer');
    if (!container) return;
    container.innerHTML = '<p class="text-center text-slate-400 col-span-3 py-10">Fiyatlandırma paketleri yükleniyor...</p>';

    const allPlans = await fetchPricingPlans();
    const plansToShow = allPlans.filter(p => p.billing_period === activeBillingPeriod);
    container.innerHTML = '';

    if (plansToShow.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 col-span-3 py-10">Bu dönem için aktif bir paket bulunamadı.</p>';
        return;
    }

    plansToShow.forEach(plan => {
        const card = document.createElement('div');
        card.className = `reveal relative rounded-3xl p-8 flex flex-col ${plan.is_popular ? 'bg-slate-900 text-white border-2 border-amber-400 shadow-2xl md:scale-105 z-10' : 'bg-white text-slate-800 border border-slate-200 shadow-sm'}`;
        const periodLabel = plan.billing_period === 'yearly' ? '/yıl' : '/ay';
        const featureColor = plan.is_popular ? 'text-slate-200' : 'text-slate-600';
        const tickColor = plan.is_popular ? 'text-amber-400' : 'text-emerald-500';
        card.innerHTML = `
            ${plan.is_popular ? '<div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-900 text-xs font-black px-4 py-1 rounded-full shadow whitespace-nowrap">EN ÇOK TERCİH EDİLEN</div>' : ''}
            <h3 class="font-display text-xl font-bold mb-1">${escapeHTML(plan.name)}</h3>
            <p class="text-sm ${plan.is_popular ? 'text-slate-300' : 'text-slate-500'} mb-6 min-h-[40px]">${escapeHTML(plan.description || '')}</p>
            <div class="flex items-baseline mb-6">
                <span class="text-2xl font-bold mr-1">$</span>
                <span class="font-display text-5xl font-bold">${Math.round(plan.price_usd)}</span>
                <span class="ml-1 text-sm font-bold text-slate-400">${periodLabel}</span>
            </div>
            <ul class="space-y-3 mb-8 flex-1">
                ${(plan.features || []).map(f => `<li class="flex items-start gap-2 text-sm ${featureColor}"><span class="${tickColor} font-bold">✓</span><span>${escapeHTML(f)}</span></li>`).join('')}
            </ul>
            <button data-plan-id="${escapeHTML(plan.id)}" data-plan-key="${escapeHTML(plan.plan_key)}" class="btnSubscribePlan w-full py-3 rounded-xl font-bold transition ${plan.is_popular ? 'bg-amber-400 hover:bg-amber-300 text-slate-900' : 'bg-slate-900 hover:bg-slate-800 text-white'}">Bu Paketi Seç</button>
        `;
        container.appendChild(card);
    });

    container.querySelectorAll('.btnSubscribePlan').forEach(btn => {
        btn.addEventListener('click', () => startCheckout(btn.dataset.planKey, btn.dataset.planId));
    });

    initScrollReveal();
}

function switchBillingPeriod(period) {
    activeBillingPeriod = period;
    const mBtn = document.getElementById('btnBillingMonthly');
    const yBtn = document.getElementById('btnBillingYearly');
    if (mBtn && yBtn) {
        mBtn.classList.toggle('bg-slate-900', period === 'monthly');
        mBtn.classList.toggle('text-white', period === 'monthly');
        mBtn.classList.toggle('text-slate-500', period !== 'monthly');
        yBtn.classList.toggle('bg-slate-900', period === 'yearly');
        yBtn.classList.toggle('text-white', period === 'yearly');
        yBtn.classList.toggle('text-slate-500', period !== 'yearly');
    }
    renderPublicPricingSection();
}
document.getElementById('btnBillingMonthly')?.addEventListener('click', () => switchBillingPeriod('monthly'));
document.getElementById('btnBillingYearly')?.addEventListener('click', () => switchBillingPeriod('yearly'));

// "Bu Paketi Seç" akışı: giriş yapılmamışsa önce kayıt/girişe yönlendirir,
// ardından ödeme adımına otomatik devam eder.
window.startCheckout = async function(planKey, planId) {
    if (!supabaseClient) { alert('Ödeme altyapısı için veritabanı bağlantısı aktif değil (test ortamı).'); return; }
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        localStorage.setItem('pendingPlanKey', planKey);
        localStorage.setItem('pendingBillingPeriod', activeBillingPeriod);
        alert('Devam etmek için lütfen önce ücretsiz firma hesabınızı oluşturun veya giriş yapın. Seçtiğiniz paket hatırlanacak.');
        window.location.hash = '#auth';
        document.getElementById('tabRegister')?.click();
        return;
    }
    await proceedToCheckout(planKey, planId, session);
};

async function proceedToCheckout(planKey, planId, session) {
    try {
        const resp = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planKey, planId, userId: session.user.id, email: session.user.email })
        });
        const data = await resp.json();
        if (!resp.ok || !data.url) throw new Error(data.error || 'Ödeme oturumu oluşturulamadı.');
        window.location.href = data.url; // Stripe Checkout'a yönlendir
    } catch (err) {
        console.error(err);
        alert('⚠️ Ödeme sayfası henüz bağlanmadı. Sunucunuzda /api/create-checkout-session uç noktasını devreye almanız gerekiyor (örnek kod ayrıca paylaşıldı: api-create-checkout-session.js).');
    }
}

// Kayıt/Giriş sonrası bekleyen bir plan seçimi varsa otomatik olarak ödeme adımına devam eder
async function resumePendingCheckoutIfAny() {
    const pendingKey = localStorage.getItem('pendingPlanKey');
    if (!pendingKey || !supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const pendingPeriod = localStorage.getItem('pendingBillingPeriod') || 'monthly';
    localStorage.removeItem('pendingPlanKey');
    localStorage.removeItem('pendingBillingPeriod');

    const plans = window._cachedPricingPlans || await fetchPricingPlans();
    const plan = plans.find(p => p.plan_key === pendingKey && p.billing_period === pendingPeriod) || plans.find(p => p.plan_key === pendingKey);
    if (plan) await proceedToCheckout(plan.plan_key, plan.id, session);
}

// ---- ADMİN: FİYATLANDIRMA YÖNETİMİ (Bölüm 7'deki fetchAdminData tarafından çağrılır) ----
async function adminFetchAndRenderPricingPlans() {
    const box = document.getElementById('adminPricingTableBody');
    if (!box) return;
    if (!supabaseClient) { box.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-red-500 text-xs">Veritabanı bağlantısı yok.</td></tr>'; return; }

    const { data, error } = await supabaseClient.from('pricing_plans').select('*').order('sort_order', { ascending: true });
    if (error || !data) {
        box.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-xs text-red-500">Fiyat planları yüklenemedi. 'pricing_plans' tablosunun oluşturulduğundan emin olun (bkz. supabase_schema.sql).</td></tr>`;
        return;
    }
    if (data.length === 0) {
        box.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-xs text-slate-400">Henüz bir fiyat planı eklenmemiş. Aşağıdan ekleyin.</td></tr>';
        return;
    }

    box.innerHTML = data.map(plan => `
        <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs" data-plan-row="${escapeHTML(plan.id)}">
            <td class="p-2 pl-4"><input type="text" value="${escapeHTML(plan.name)}" data-field="name" class="w-28 p-1.5 border border-slate-200 rounded font-bold outline-none"></td>
            <td class="p-2"><input type="number" step="0.01" value="${plan.price_usd}" data-field="price_usd" class="w-20 p-1.5 border border-slate-200 rounded text-center font-bold text-emerald-700 outline-none"></td>
            <td class="p-2">
                <select data-field="billing_period" class="p-1.5 border border-slate-200 rounded outline-none">
                    <option value="monthly" ${plan.billing_period === 'monthly' ? 'selected' : ''}>Aylık</option>
                    <option value="yearly" ${plan.billing_period === 'yearly' ? 'selected' : ''}>Yıllık</option>
                </select>
            </td>
            <td class="p-2"><input type="number" value="${plan.sort_order || 0}" data-field="sort_order" class="w-14 p-1.5 border border-slate-200 rounded text-center outline-none"></td>
            <td class="p-2 text-center"><input type="checkbox" data-field="is_popular" ${plan.is_popular ? 'checked' : ''} class="w-4 h-4"></td>
            <td class="p-2 text-center"><input type="checkbox" data-field="is_active" ${plan.is_active ? 'checked' : ''} class="w-4 h-4"></td>
            <td class="p-2 pr-4 text-right whitespace-nowrap">
                <button class="btnAdminSavePlan bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded mr-1">Kaydet</button>
                <button class="btnAdminDeletePlan bg-red-50 hover:bg-red-100 text-red-600 font-bold px-2.5 py-1.5 rounded border border-red-200">Sil</button>
            </td>
        </tr>
    `).join('');

    box.querySelectorAll('tr[data-plan-row]').forEach(row => {
        const planId = row.getAttribute('data-plan-row');
        row.querySelector('.btnAdminSavePlan')?.addEventListener('click', () => adminSavePricingPlan(planId, row));
        row.querySelector('.btnAdminDeletePlan')?.addEventListener('click', () => adminDeletePricingPlan(planId));
    });
}

async function adminSavePricingPlan(id, rowEl) {
    if (!supabaseClient) return;
    const updates = {};
    rowEl.querySelectorAll('[data-field]').forEach(input => {
        const field = input.dataset.field;
        if (input.type === 'checkbox') updates[field] = input.checked;
        else if (field === 'price_usd' || field === 'sort_order') updates[field] = parseFloat(input.value) || 0;
        else updates[field] = input.value;
    });
    const { error } = await supabaseClient.from('pricing_plans').update(updates).eq('id', id);
    if (error) { alert('Güncellenemedi: ' + error.message); }
    else { alert('✅ Plan güncellendi. Web sitesindeki fiyatlandırma anında yenilendi.'); renderPublicPricingSection(); }
}

async function adminDeletePricingPlan(id) {
    if (!supabaseClient) return;
    if (!confirm('Bu planı kalıcı olarak silmek istediğinize emin misiniz?')) return;
    const { error } = await supabaseClient.from('pricing_plans').delete().eq('id', id);
    if (error) alert('Silinemedi: ' + error.message);
    else { adminFetchAndRenderPricingPlans(); renderPublicPricingSection(); }
}

document.getElementById('btnAdminAddPlan')?.addEventListener('click', async () => {
    if (!supabaseClient) { alert('Veritabanı bağlantısı yok.'); return; }
    const { error } = await supabaseClient.from('pricing_plans').insert([{
        plan_key: 'yeni-plan-' + Date.now(),
        name: 'Yeni Plan',
        price_usd: 20,
        billing_period: 'monthly',
        description: 'Açıklamayı buradan düzenleyin',
        features: ['Özellik 1', 'Özellik 2'],
        is_popular: false,
        is_active: true,
        sort_order: 99
    }]);
    if (error) alert('Eklenemedi: ' + error.message);
    else adminFetchAndRenderPricingPlans();
});


// ============================================================================
// 14. ARAYÜZ CİLASI: AÇILIŞ SAYFASI KAYDIRMA (SCROLL) ANİMASYONLARI
// ============================================================================
function initScrollReveal() {
    const revealEls = document.querySelectorAll('.reveal:not(.is-visible)');
    if (!revealEls.length) return;
    if (!('IntersectionObserver' in window)) { revealEls.forEach(el => el.classList.add('is-visible')); return; }
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
        });
    }, { threshold: 0.12 });
    revealEls.forEach(el => observer.observe(el));
}
