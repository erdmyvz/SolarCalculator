/* ============================================================================
   3. Kurumsal Authentication (kayıt, giriş, profil)
   Bölünmüş modül dosyası. index.html'de core.js'ten sonra, ORİJİNAL SIRAYLA
   yüklenmelidir. Klasik script olduğu için tüm fonksiyonlar küresel kalır.
   ============================================================================ */

// ============================================================================
// 3. KURUMSAL AUTHENTICATION (KAYIT, GİRİŞ VE PROFİL YÖNETİMİ)
// ============================================================================
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

// YENİ FİRMA KAYIT İŞLEMİ (Multi-tenant: companies + profiles atomik oluşur)
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

    if(!supabaseClient) {
        alert("Veritabanı bağlantısı yok."); btn.textContent = "Firmayı Sisteme Kaydet"; btn.disabled = false; return;
    }

    try {
        // 1) Auth kullanıcısı oluştur
        const { error: signUpErr } = await supabaseClient.auth.signUp({ email, password });
        if (signUpErr) throw signUpErr;

        // 2) bootstrap_company auth gerektirir; oturum yoksa girişle oturum aç
        let { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            const { data: signInData, error: signInErr } =
                await supabaseClient.auth.signInWithPassword({ email, password });
            if (signInErr) {
                // Muhtemelen e-posta onayı açık: onaydan sonra giriş gerekir
                alert("Kaydınız oluşturuldu. E-postanızı onayladıktan sonra giriş yapıp devam edebilirsiniz.");
                document.getElementById('registerForm').reset(); document.getElementById('tabLogin').click();
                return;
            }
            session = signInData.session;
        }

        // 3) Firma + profil kaydını güvenli RPC ile oluştur
        const { error: bootErr } = await supabaseClient.rpc('bootstrap_company', {
            p_company_name: company,
            p_phone:        document.getElementById('regPhone').value,
            p_first_name:   document.getElementById('regName').value,
            p_last_name:    document.getElementById('regSurname').value
        });
        if (bootErr) throw bootErr;

        // 4) Kayıt sonrası oturumu kapat; kullanıcı bilinçli giriş yapsın
        await supabaseClient.auth.signOut();
        alert("Firma Kaydı Başarılı! Artık sisteme giriş yapabilirsiniz.");
        document.getElementById('registerForm').reset(); document.getElementById('tabLogin').click();
    } catch (err) {
        alert("Kayıt Hatası: " + (err.message || err));
    } finally {
        btn.textContent = "Firmayı Sisteme Kaydet"; btn.disabled = false;
    }
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
        }
    }
    btn.textContent = "Yönetim Paneline Gir"; btn.disabled = false;
});

async function fetchUserProfile(userId, displayEmail) {
    if(!supabaseClient) return;
    const { data } = await supabaseClient.from('profiles').select('*, companies(name)').eq('id', userId).single();
    if (data) {
        currentUserProfile = data;
        const companyName = (data.companies && data.companies.name) || data.company_name || '';
        document.getElementById('userNameDisplay').textContent = `${data.first_name} ${data.last_name}`;
        document.getElementById('userCompanyDisplay').textContent = companyName;
        if(document.getElementById('userEmailDisplay')) document.getElementById('userEmailDisplay').textContent = displayEmail;
        document.getElementById('userInitials').textContent = data.first_name.charAt(0).toUpperCase();

        const adminCard = document.getElementById('adminPanelCard');
        if(adminCard) adminCard.classList.toggle('hidden', data.role !== 'admin');
        
        if(document.getElementById('iframeCompanyId')) {
            document.getElementById('iframeCompanyId').textContent = data.id;
        }
    }
}

document.getElementById('btnProfile')?.addEventListener('click', () => document.getElementById('profileDropdown').classList.toggle('hidden'));
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    if(supabaseClient) await supabaseClient.auth.signOut(); 
    currentUserProfile = null;
    document.getElementById('profileDropdown').classList.add('hidden'); window.location.hash = '#home';
});
