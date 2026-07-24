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
    const f = document.getElementById('roleFirma'), c = document.getElementById('roleConsultant'), i = document.getElementById('roleInvestor');
    if (f) f.className = role === 'firma' ? on : off;
    if (c) c.className = role === 'consultant' ? on : off;
    if (i) i.className = role === 'investor' ? on : off;
    const wrap = document.getElementById('regCompanyWrap');
    if (wrap) wrap.classList.toggle('hidden', role !== 'firma');
    const rb = document.getElementById('btnRegisterSubmit');
    if (rb) rb.textContent = role === 'consultant' ? 'Danışman Olarak Kayıt Ol'
                          : role === 'investor'   ? 'Yatırımcı Olarak Kayıt Ol'
                          : 'Firmayı Sisteme Kaydet';
};

// Girişten sonra rol tespiti: danışman mı, firma/admin mi?
// Hesap türünü belirle: 'admin' | 'consultant' | 'installer'
async function getAccountInfo(user) {
    let role = null, consultant = null;
    if (supabaseClient) {
        try {
            const { data: prof } = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
            if (prof) role = prof.role;
        } catch (e) { /* profiles okunamadı */ }
        if (role === 'admin') return { type: 'admin', consultant: null };
        if (role === 'investor') return { type: 'investor', consultant: null };
        try {
            const { data: cons } = await supabaseClient.from('consultants').select('*').eq('id', user.id).maybeSingle();
            if (cons) consultant = cons;
        } catch (e) { /* consultants tablosu yoksa sessiz gec */ }
    }
    if (consultant) return { type: 'consultant', consultant };
    return { type: 'installer', consultant: null };
}
window.getAccountInfo = getAccountInfo;

// Girişten sonra yönlendirme (rol kilidi YOK — sayfa yenilemede kullanılır)
// ⬇️⬇️ ÖDEME BİLGİLERİ — KENDİ BİLGİLERİNİZLE DEĞİŞTİRİN ⬇️⬇️
const PAYMENT_NAME = "Ad Soyad (hesap sahibi)";
const PAYMENT_IBAN = "TR00 0000 0000 0000 0000 0000 00";
// ⬆️⬆️ ------------------------------------------------ ⬆️⬆️

async function getSubscription(info, user) {
    if (info.type === 'consultant' && info.consultant) return { status: info.consultant.sub_status, endsAt: info.consultant.sub_ends_at, banned: !!info.consultant.banned, banReason: info.consultant.ban_reason };
    if (info.type === 'installer' && supabaseClient) {
        try {
            const { data: prof } = await supabaseClient.from('profiles').select('company_id').eq('id', user.id).maybeSingle();
            if (prof && prof.company_id) {
                const { data: co } = await supabaseClient.from('companies').select('sub_status, sub_ends_at, banned, ban_reason').eq('id', prof.company_id).maybeSingle();
                if (co) return { status: co.sub_status, endsAt: co.sub_ends_at, banned: !!co.banned, banReason: co.ban_reason };
            }
        } catch (e) { /* sub kolonları yoksa sessiz geç */ }
    }
    return null;
}

function showBanScreen(email, reason) {
    let m = document.getElementById('banScreen');
    if (!m) { m = document.createElement('div'); m.id = 'banScreen'; document.body.appendChild(m); }
    m.className = 'fixed inset-0 z-[100] bg-slate-900/95 flex items-center justify-center p-4 overflow-y-auto';
    const safe = (t) => String(t == null ? '' : t).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    m.innerHTML = `<div class="bg-white rounded-2xl max-w-md w-full p-7 my-8">
        <div class="text-center mb-5">
            <div class="text-4xl mb-2">⛔</div>
            <h2 class="text-2xl font-black text-slate-800">Hesabınız Engellendi</h2>
            <p class="text-sm text-slate-500 mt-1">${safe(email)}</p>
        </div>
        ${reason ? `<div class="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p class="text-xs font-black text-red-700 uppercase tracking-wider mb-1">Gerekçe</p>
            <p class="text-sm text-red-800">${safe(reason)}</p>
        </div>` : ''}
        <p class="text-xs text-slate-600 mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3">İtiraz etmek veya bilgi almak için bizimle iletişime geçebilirsiniz.</p>
        <button onclick="(async()=>{ try{ if(supabaseClient) await supabaseClient.auth.signOut(); }catch(e){} window.currentConsultant=null; window.location.hash='#home'; window.location.reload(); })()" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-lg">Çıkış Yap</button>
    </div>`;
    m.classList.remove('hidden');
}

function showRenewalScreen(email, sub) {
    let m = document.getElementById('subRenewalScreen');
    if (!m) { m = document.createElement('div'); m.id = 'subRenewalScreen'; document.body.appendChild(m); }
    m.className = 'fixed inset-0 z-[100] bg-slate-900/95 flex items-center justify-center p-4 overflow-y-auto';
    const endStr = sub && sub.endsAt ? new Date(sub.endsAt).toLocaleDateString('tr-TR') : '';
    const safe = String(email || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    m.innerHTML = `<div class="bg-white rounded-2xl max-w-md w-full p-7 my-8">
        <div class="text-center mb-5">
            <div class="text-4xl mb-2">🔒</div>
            <h2 class="text-2xl font-black text-slate-800">Aboneliğiniz Sona Erdi</h2>
            <p class="text-sm text-slate-500 mt-1">Hesabınıza devam etmek için aboneliğinizi yenileyin.${endStr ? ' (Bitiş: ' + endStr + ')' : ''}</p>
        </div>
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-4">
            <div class="flex items-end justify-between mb-3">
                <div><div class="text-3xl font-black text-slate-800">$299<span class="text-base font-bold text-slate-400">/ay</span></div><div class="text-xs text-slate-500">KDV hariç · USD'ye endeksli TL (güncel kur)</div></div>
                <span class="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-full">AYLIK</span>
            </div>
            <div class="border-t border-slate-200 pt-3 space-y-1.5 text-sm">
                <div class="flex justify-between gap-3"><span class="text-slate-500">Alıcı</span><span class="font-bold text-slate-800 text-right">${PAYMENT_NAME}</span></div>
                <div class="flex justify-between gap-3"><span class="text-slate-500">IBAN</span><span class="font-bold text-slate-800 text-right">${PAYMENT_IBAN}</span></div>
                <div class="flex justify-between gap-3"><span class="text-slate-500">Açıklama</span><span class="font-bold text-indigo-600 text-right break-all">${safe}</span></div>
            </div>
        </div>
        <p class="text-xs text-slate-600 mb-4 bg-amber-50 border border-amber-100 rounded-lg p-3">💡 Havale/EFT açıklamasına mutlaka <strong>e-posta adresinizi</strong> yazın. Ödemeniz onaylandığında hesabınız aktifleştirilecek ve tekrar giriş yapabileceksiniz.</p>
        <button onclick="(async()=>{ try{ if(supabaseClient) await supabaseClient.auth.signOut(); }catch(e){} window.currentConsultant=null; window.location.hash='#home'; window.location.reload(); })()" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-lg">Çıkış Yap</button>
    </div>`;
    m.classList.remove('hidden');
}

function paymentInfoHtml(email) {
    const safe = String(email || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div class="bg-white border border-slate-200 rounded-xl p-4">
        <div class="flex items-end justify-between mb-3"><div><div class="text-2xl font-black text-slate-800">$299<span class="text-sm font-bold text-slate-400">/ay</span></div><div class="text-[11px] text-slate-500">KDV hariç · USD'ye endeksli TL (güncel kur)</div></div><span class="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-full">AYLIK</span></div>
        <div class="border-t border-slate-200 pt-3 space-y-1.5 text-sm">
            <div class="flex justify-between gap-3"><span class="text-slate-500">Alıcı</span><span class="font-bold text-slate-800 text-right">${PAYMENT_NAME}</span></div>
            <div class="flex justify-between gap-3"><span class="text-slate-500">IBAN</span><span class="font-bold text-slate-800 text-right">${PAYMENT_IBAN}</span></div>
            <div class="flex justify-between gap-3"><span class="text-slate-500">Açıklama</span><span class="font-bold text-indigo-600 text-right break-all">${safe}</span></div>
        </div>
    </div>`;
}

function updateSubCounter() {
    const el = document.getElementById('subCounter');
    if (!el) return;
    const s = window.__subInfo;
    if (!s || !s.endsAt) { el.innerHTML = ''; return; }
    const days = Math.ceil((new Date(s.endsAt).getTime() - Date.now()) / 86400000);
    if (days < 0) { el.innerHTML = ''; return; }
    let cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (days <= 7) cls = 'bg-amber-50 text-amber-700 border-amber-200';
    const label = days === 0 ? 'Bugün son gün' : days + ' gün kaldı';
    el.innerHTML = `<button onclick="showSubModal()" title="Abonelik / uzatma" class="border ${cls} font-bold text-xs px-3 py-1.5 rounded-full hover:opacity-80 whitespace-nowrap">⏳ ${label}</button>`;
}

window.showSubModal = function () {
    const s = window.__subInfo || {};
    const days = s.endsAt ? Math.ceil((new Date(s.endsAt).getTime() - Date.now()) / 86400000) : null;
    const endStr = s.endsAt ? new Date(s.endsAt).toLocaleDateString('tr-TR') : '—';
    let m = document.getElementById('subModal');
    if (!m) { m = document.createElement('div'); m.id = 'subModal'; document.body.appendChild(m); m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }); }
    m.className = 'fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4 overflow-y-auto';
    m.innerHTML = `<div class="bg-white rounded-2xl max-w-md w-full p-7 my-8">
        <div class="flex items-center justify-between mb-4"><h3 class="font-black text-lg text-slate-800">Aboneliğim</h3><button onclick="document.getElementById('subModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button></div>
        <div class="text-center bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
            <div class="text-4xl font-black ${days !== null && days <= 7 ? 'text-amber-600' : 'text-emerald-600'}">${days !== null ? days : '—'}</div>
            <div class="text-sm text-slate-500">gün kaldı · Bitiş: ${endStr}</div>
        </div>
        <p class="text-xs font-bold text-slate-600 mb-2">Aboneliği uzatmak için ödeme bilgileri:</p>
        ${paymentInfoHtml(s.email || '')}
        <p class="text-xs text-slate-600 mt-3 bg-amber-50 border border-amber-100 rounded-lg p-3">💡 Havale/EFT açıklamasına <strong>e-posta adresinizi</strong> yazın. Ödemeniz onaylanınca süreniz uzatılır.</p>
    </div>`;
    m.classList.remove('hidden');
};

// "Beni hatırla" tercihini uygula: oturum jetonunu doğru depoya taşı.
function applyRememberPreference(remember) {
    const RX = /^sb-.*-auth-token$/;
    try {
        if (remember) {
            Object.keys(sessionStorage).filter(k => RX.test(k)).forEach(k => {
                localStorage.setItem(k, sessionStorage.getItem(k));
                sessionStorage.removeItem(k);
            });
        } else {
            Object.keys(localStorage).filter(k => RX.test(k)).forEach(k => {
                sessionStorage.setItem(k, localStorage.getItem(k));
                localStorage.removeItem(k);
            });
        }
    } catch (e) { /* depo erişimi yoksa varsayılan davranış sürer */ }
}

async function routeByInfo(info, user) {
    window.currentConsultant = null;
    window.__subInfo = null;
    if (info.type === 'investor') {
        // Yatırımcı ücret ödemez; abonelik kontrolü uygulanmaz.
        try { await supabaseClient.rpc('claim_my_leads'); } catch (e) { /* geçmiş başvuru eşleştirme */ }
        if (typeof showInvestorPanel === 'function') showInvestorPanel();
        return 'investor';
    }
    if (info.type !== 'admin') {
        const sub = await getSubscription(info, user);
        if (sub && sub.banned) { showBanScreen(user.email, sub.banReason); return 'banned'; }
        window.__subInfo = sub ? { endsAt: sub.endsAt, status: sub.status, email: user.email } : null;
        if (sub && sub.endsAt && new Date(sub.endsAt).getTime() < Date.now()) { showRenewalScreen(user.email, sub); return 'expired'; }
    }
    if (info.type === 'consultant') {
        window.currentConsultant = info.consultant;
        window.__consultantEmail = user.email;
        updateSubCounter();
        return 'consultant';
    }
    await fetchUserProfile(user.id, user.email);
    updateSubCounter();
    return info.type;
}
async function routeAfterLogin(user) {
    const info = await getAccountInfo(user);
    return routeByInfo(info, user);
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

    // Sözleşme/KVKK onay kaydı (ispat yükü) — kaydı engellemez
    try {
        await supabaseClient.rpc('log_consent', {
            p_context:  'register',
            p_full_name: (firstName + ' ' + lastName).trim(),
            p_phone:     phone,
            p_email:     email,
            p_reference: email,
            p_kvkk:      !!document.getElementById('regTerms')?.checked,
            p_marketing: false,
            p_version:   'v1',
            p_agent:     navigator.userAgent
        });
    } catch (e) { /* sessiz geç */ }

    // --- DANIŞMAN KAYDI ---
    if (window.authRole === 'consultant') {
        const orig = btn.textContent; btn.textContent = "Kaydediliyor..."; btn.disabled = true;
        try {
            const { error: signUpErr } = await supabaseClient.auth.signUp({ email, password, options: { data: { role: 'consultant', full_name: (firstName + ' ' + lastName).trim(), phone: phone } } });
            if (signUpErr) throw signUpErr;
            let { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
                const { data: si, error: siErr } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (siErr) {
                    alert("✅ Kaydınız oluşturuldu! Sizlere mail doğrulama linki gönderdik. Lütfen e-postanızı doğrulayın, sonra giriş yapın.");
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
            alert("✅ Kaydınız oluşturuldu! Sizlere mail doğrulama linki gönderdik. Lütfen e-postanızı doğrulayın, sonra giriş yapın.");
            document.getElementById('registerForm').reset(); document.getElementById('tabLogin').click();
        } catch (err) {
            alert("Kayıt Hatası: " + (err.message || err));
        } finally { btn.textContent = orig; btn.disabled = false; }
        return;
    }

    // --- YATIRIMCI KAYDI ---
    if (window.authRole === 'investor') {
        const orig = btn.textContent; btn.textContent = "Kaydediliyor..."; btn.disabled = true;
        try {
            const { error: signUpErr } = await supabaseClient.auth.signUp({
                email, password,
                options: { data: { role: 'investor', full_name: (firstName + ' ' + lastName).trim(), phone: phone } }
            });
            if (signUpErr) throw signUpErr;
            try { await supabaseClient.auth.signOut(); } catch (e) {}
            alert("✅ Kaydınız oluşturuldu! Sizlere mail doğrulama linki gönderdik. Lütfen e-postanızı doğrulayın, sonra giriş yapın.");
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
        if (error) {
            const _m = (error.message || '').toLowerCase();
            if (error.code === 'email_not_confirmed' || _m.includes('not confirmed') || _m.includes('confirm')) {
                alert("⚠️ Lütfen önce e-postanızı doğrulayın. Kayıt sırasında gönderdiğimiz doğrulama linkine tıklayın.");
            } else {
                alert("Giriş Başarısız: E-posta veya şifre hatalı.");
            }
        }
        else if (data.user) {
            const info = await getAccountInfo(data.user);
            const LBL = { installer: 'Kurulumcu Firma', consultant: 'Danışman', investor: 'Yatırımcı' };
            const expected = { firma: 'installer', consultant: 'consultant', investor: 'investor' }[window.authRole || 'firma'] || 'installer';
            if (info.type !== 'admin' && info.type !== expected) {
                await supabaseClient.auth.signOut();
                alert('Bu hesap bir "' + (LBL[info.type] || info.type) + '" hesabıdır. Lütfen giriş ekranında "' + (LBL[info.type] || '') + '" seçeneğini seçin.');
            } else {
                applyRememberPreference(!!document.getElementById('rememberMe')?.checked);
                const r = await routeByInfo(info, data.user);
                if (r !== 'expired' && r !== 'banned') window.location.hash = '#app';
                document.getElementById('loginForm').reset();
            }
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

document.getElementById('btnProfile')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('profileDropdown').classList.toggle('hidden');
});
// Menü dışına tıklayınca veya Esc ile kapansın
document.addEventListener('click', (e) => {
    const dd = document.getElementById('profileDropdown');
    if (!dd || dd.classList.contains('hidden')) return;
    const btn = document.getElementById('btnProfile');
    if (dd.contains(e.target) || (btn && btn.contains(e.target))) return;
    dd.classList.add('hidden');
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.getElementById('profileDropdown')?.classList.add('hidden');
});
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    if(supabaseClient) await supabaseClient.auth.signOut(); 
    currentUserProfile = null; window.currentConsultant = null;
    document.getElementById('profileDropdown').classList.add('hidden'); window.location.hash = '#home';
});
