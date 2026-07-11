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

// Rol seçimi (Kurulumcu Firma / Danışman) — giriş/kayıt ekranı
window.authRole = 'firma';
window.authSetRole = function (role) {
    window.authRole = role;
    const on = 'auth-role px-3 py-2.5 rounded-lg text-sm font-bold border-2 border-emerald-600 bg-emerald-600 text-white';
    const off = 'auth-role px-3 py-2.5 rounded-lg text-sm font-bold border-2 border-slate-200 text-slate-600 bg-white';
    const f = document.getElementById('roleFirma'), c = document.getElementById('roleConsultant');
    if (f) f.className = role === 'firma' ? on : off;
    if (c) c.className = role === 'consultant' ? on : off;
    const wrap = document.getElementById('regCompanyWrap');
    if (wrap) wrap.classList.toggle('hidden', role !== 'firma');
    const rb = document.getElementById('btnRegisterSubmit');
    if (rb) rb.textContent = role === 'consultant' ? 'Danışman Olarak Kayıt Ol' : 'Firmayı Sisteme Kaydet';
};

// Girişten sonra rol tespiti: danışman mı, firma/admin mi?
async function routeAfterLogin(user) {
    window.currentConsultant = null;
    if (supabaseClient) {
        // ÖNCE firma/admin profili var mı? (admin & kurulumcu firma her zaman öncelikli)
        let hasCompanyProfile = false;
        try {
            const { data: prof } = await supabaseClient.from('profiles').select('id').eq('id', user.id).maybeSingle();
            if (prof) hasCompanyProfile = true;
        } catch (e) { /* profiles okunamadı */ }
        // Profili yoksa danışman mı?
        if (!hasCompanyProfile) {
            try {
                const { data: cons } = await supabaseClient.from('consultants').select('*').eq('id', user.id).maybeSingle();
                if (cons) { window.currentConsultant = cons; window.__consultantEmail = user.email; return 'consultant'; }
            } catch (e) { /* consultants tablosu yoksa sessiz gec */ }
        }
    }
    await fetchUserProfile(user.id, user.email);
    return 'company';
}

// YENİ FİRMA KAYIT İŞLEMİ (Multi-tenant: companies + profiles atomik oluşur)
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnRegisterSubmit');
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const firstName = document.getElementById('regName').value;
    const lastName = document.getElementById('regSurname').value;
    const phone = document.getElementById('regPhone').value;

    if (!supabaseClient) { alert("Veritabanı bağlantısı yok."); return; }

    // --- DANIŞMAN KAYDI ---
    if (window.authRole === 'consultant') {
        const orig = btn.textContent; btn.textContent = "Kaydediliyor..."; btn.disabled = true;
        try {
            const { error: signUpErr } = await supabaseClient.auth.signUp({ email, password });
            if (signUpErr) throw signUpErr;
            let { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
                const { data: si, error: siErr } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (siErr) {
                    alert("Kaydınız oluşturuldu. E-postanızı onayladıktan sonra giriş yapıp profilinizi doldurun.");
                    document.getElementById('registerForm').reset(); document.getElementById('tabLogin').click(); return;
                }
                session = si.session;
            }
            const initials = ((firstName.charAt(0) || '') + (lastName.charAt(0) || '')).toUpperCase();
            const { error: insErr } = await supabaseClient.from('consultants').insert({
                id: session.user.id, full_name: (firstName + ' ' + lastName).trim(),
                email, phone, avatar_initials: initials, status: 'draft'
            });
            if (insErr && insErr.code !== '23505') throw insErr;   // 23505: kayit zaten var
            await supabaseClient.auth.signOut();
            alert("Danışman kaydınız oluşturuldu! Giriş yapıp profilinizi doldurun ve onaya gönderin.");
            document.getElementById('registerForm').reset(); document.getElementById('tabLogin').click();
        } catch (err) {
            alert("Kayıt Hatası: " + (err.message || err));
        } finally { btn.textContent = orig; btn.disabled = false; }
        return;
    }

    // --- KURULUMCU FİRMA KAYDI ---
    const company = document.getElementById('regCompany').value;
    if (!company || company.trim().length < 3) {
        alert("Geçerli bir EPC/Kurulum Firması ünvanı girmek zorunludur. Bireysel kayıt yasaktır."); return;
    }
    btn.textContent = "Kaydediliyor..."; btn.disabled = true;
    try {
        const { error: signUpErr } = await supabaseClient.auth.signUp({ email, password });
        if (signUpErr) throw signUpErr;
        let { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            const { data: signInData, error: signInErr } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (signInErr) {
                alert("Kaydınız oluşturuldu. E-postanızı onayladıktan sonra giriş yapıp devam edebilirsiniz.");
                document.getElementById('registerForm').reset(); document.getElementById('tabLogin').click(); return;
            }
            session = signInData.session;
        }
        const { error: bootErr } = await supabaseClient.rpc('bootstrap_company', {
            p_company_name: company, p_phone: phone, p_first_name: firstName, p_last_name: lastName
        });
        if (bootErr) throw bootErr;
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
            await routeAfterLogin(data.user);
            window.location.hash = '#app'; document.getElementById('loginForm').reset();
        }
    }
    btn.textContent = "Giriş Yap"; btn.disabled = false;
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
    currentUserProfile = null; window.currentConsultant = null;
    document.getElementById('profileDropdown').classList.add('hidden'); window.location.hash = '#home';
});
