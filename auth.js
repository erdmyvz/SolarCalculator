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
    const f = document.getElementById('roleFirma'), c = document.getElementById('roleConsultant'),
          i = document.getElementById('roleInvestor'), t = document.getElementById('roleSupplier');
    if (f) f.className = role === 'firma' ? on : off;
    if (c) c.className = role === 'consultant' ? on : off;
    if (i) i.className = role === 'investor' ? on : off;
    if (t) t.className = role === 'supplier' ? on : off;
    // Firma ünvanı alanı hem kurulumcu hem tedarikçi için gerekli (ikisi de tüzel taraf).
    const wrap = document.getElementById('regCompanyWrap');
    if (wrap) wrap.classList.toggle('hidden', role !== 'firma' && role !== 'supplier');
    // Konum yalnız kurulumcu firmada gerekli: eşleştirme buna göre yapılıyor.
    // Tedarikçinin konumu stok satırında ayrı ayrı tutuluyor (depo başına).
    const kw = document.getElementById('regKonumWrap');
    if (kw) {
        kw.classList.toggle('hidden', role !== 'firma');
        const sel = document.getElementById('regCity');
        if (sel && sel.options.length <= 1) {
            const iller = Object.keys(window.EPC_IL_VERIM || {}).sort((a, b) => a.localeCompare(b, 'tr'));
            sel.insertAdjacentHTML('beforeend', iller.map(i => `<option value="${i}">${i}</option>`).join(''));
        }
    }
    const lbl = document.getElementById('regCompanyLabel');
    if (lbl) lbl.textContent = role === 'supplier' ? 'Resmi Firma Ünvanı (Tedarikçi)' : 'Resmi Firma Ünvanı';
    const rb = document.getElementById('btnRegisterSubmit');
    if (rb) rb.textContent = role === 'consultant' ? 'Danışman Olarak Kayıt Ol'
                          : role === 'investor'   ? 'Yatırımcı Olarak Kayıt Ol'
                          : role === 'supplier'   ? 'Tedarikçi Olarak Kayıt Ol'
                          : 'Firmayı Sisteme Kaydet';
};

// Role ÖZEL giriş/kayıt ekranı: rolü kilitle, rol seçiciyi gizle.
// Router #yatirimciauth / #kurulumcuauth / #danismanauth için çağırır.
// İlk sekme (giriş/kayıt) window.__authMode veya sessionStorage ile bildirilir.
window.openAuthForRole = function (role) {
    try { if (typeof authSetRole === 'function') authSetRole(role); } catch (e) {}
    document.getElementById('authRoleLabel')?.classList.add('hidden');
    document.getElementById('authRoleGrid')?.classList.add('hidden');
    // Niyet iki kaynaktan gelebilir: uygulama içi (window.__authMode) veya
    // /kurulumcu · /danisman statik sayfalarındaki CTA (sessionStorage).
    let intent = window.__authMode;
    if (!intent) {
        try { intent = sessionStorage.getItem('epcAuthMode'); sessionStorage.removeItem('epcAuthMode'); }
        catch (e) { /* özel mod: yok say */ }
    }
    const mode = (intent === 'register') ? 'register' : 'login';
    window.__authMode = null;
    try { document.getElementById(mode === 'register' ? 'tabRegister' : 'tabLogin')?.click(); } catch (e) {}
    const back = document.getElementById('authBackLink');
    if (back) back.setAttribute('href', role === 'firma' ? '/kurulumcu'
                                     : role === 'consultant' ? '/danisman'
                                     : role === 'supplier' ? '/tedarikci' : '#yatirimci');
    try { window.scrollTo({ top: 0 }); } catch (e) {}
};
// Genel #auth: rol seçiciyi geri göster (kilidi aç).
window.authUnlockRole = function () {
    document.getElementById('authRoleLabel')?.classList.remove('hidden');
    document.getElementById('authRoleGrid')?.classList.remove('hidden');
    const back = document.getElementById('authBackLink');
    if (back) back.setAttribute('href', '#home');
};

// Girişten sonra rol tespiti.
// Hesap türü: 'admin' | 'consultant' | 'supplier' | 'investor' | 'installer'
//           | 'yarim-kayit' (aşağıya bakın)
//
// ⚠️ BURADA SIRA DEĞİL, ÖNCELİK VAR — eski kod bu yüzden bozuktu.
// Eskiden profiles.role 'investor' okununca fonksiyon ORADA dönüyordu;
// consultants ve suppliers tablolarına hiç bakılmıyordu. Bir tedarikçinin
// profiles satırı herhangi bir sebeple 'investor' olduysa (kayıt trigger'ı,
// önce yatırımcı olarak denenmiş bir hesap, elle düzeltme) tedarikçi
// panelinin TAMAMI erişilemez hâle geliyor, kullanıcı yatırımcı panelinde
// "Henüz başvurunuz yok" ekranına düşüyordu.
//
// suppliers/consultants satırı KAYIT AKIŞININ BİLEREK açtığı satırdır;
// profiles satırı otomatik da oluşabilir. Bu yüzden açık olan kazanır.
//
// Üç sorgu PARALEL gidiyor: toplam süre tek sorgu kadar, yani yatırımcı
// girişine gecikme eklenmiyor.
async function getAccountInfo(user) {
    if (!supabaseClient) return { type: 'installer', consultant: null };

    // ⚠️ PostgrestBuilder'ın .catch()'i YOK (yalnız then). Sarmalayıcı şart.
    const sor = async (q) => { try { return await q; } catch (e) { return { data: null }; } };

    const [profR, consR, supR] = await Promise.all([
        sor(supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle()),
        sor(supabaseClient.from('consultants').select('*').eq('id', user.id).maybeSingle()),
        sor(supabaseClient.from('suppliers').select('*').eq('id', user.id).maybeSingle())
    ]);

    const role = profR && profR.data ? profR.data.role : null;
    const meta = user.user_metadata || {};

    if (role === 'admin')  return { type: 'admin', consultant: null };
    if (consR && consR.data) return { type: 'consultant', consultant: consR.data };
    if (supR  && supR.data)  return { type: 'supplier', consultant: null, supplier: supR.data };
    if (role === 'investor') return { type: 'investor', consultant: null };
    // Magic-link ile oluşan hesap: profiles satırı (trigger) gecikse/oluşmasa bile
    // kayıt metadata'sındaki rol üzerinden yatırımcı say (defansif güvenlik ağı).
    if (!role && meta.role === 'investor') return { type: 'investor', consultant: null };

    // ⚠️ YARIM KAYIT. Kullanıcı tedarikçi/danışman olarak kaydolmuş (auth
    // metadata'sı öyle diyor) ama ilgili tablo satırı YOK. Kayıt akışındaki
    // delikten geliyor: e-posta doğrulaması zorunluysa signInWithPassword
    // başarısız oluyor, kod "✅ Kaydınız oluşturuldu" deyip satırı HİÇ
    // açmadan dönüyordu. Kullanıcı e-postasını doğrulayıp giriş yapınca
    // rolsüz kalıyordu. Sessizce yatırımcı/firma saymak yerine kaydı
    // tamamlatıyoruz.
    if (meta.role === 'supplier' || meta.role === 'consultant') {
        return { type: 'yarim-kayit', eksikRol: meta.role, consultant: null };
    }
    return { type: 'installer', consultant: null };
}
window.getAccountInfo = getAccountInfo;

// Girişten sonra yönlendirme (rol kilidi YOK — sayfa yenilemede kullanılır)
// ⬇️⬇️ ÖDEME BİLGİLERİ ⬇️⬇️
const PAYMENT_NAME = "Erdem Yavuz (Garanti Bankası)";
const PAYMENT_IBAN = "TR30 0006 2000 3360 0006 6155 50";
// ⬆️⬆️ ---------------- ⬆️⬆️

async function getSubscription(info, user) {
    if (info.type === 'consultant' && info.consultant) return { status: info.consultant.sub_status, endsAt: info.consultant.sub_ends_at, banned: !!info.consultant.banned, banReason: info.consultant.ban_reason };
    if (info.type === 'supplier' && info.supplier) return { status: info.supplier.sub_status, endsAt: info.supplier.sub_ends_at, banned: !!info.supplier.banned, banReason: info.supplier.ban_reason };
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

// ---------------------------------------------------------------------------
// YARIM KALMIŞ KAYDI TAMAMLAT
//
// NEDEN GEREKLİ: kayıt akışı, e-posta doğrulaması zorunlu olduğunda
// signInWithPassword'e takılıyor ve suppliers/consultants satırını AÇAMADAN
// "✅ Kaydınız oluşturuldu" diyerek dönüyordu. Kullanıcı e-postasını
// doğrulayıp giriş yapınca ortada rolünü kanıtlayan satır olmuyor.
//
// Satırı burada açıyoruz: RLS zaten "id = auth.uid()" ile kendi satırını
// eklemeye izin veriyor (sup_self_insert / danışman muadili). Tedarikçide
// company_name NOT NULL olduğu için ünvan soruluyor; danışmanda metadata
// yeterli olduğundan tek tuşla tamamlanıyor.
// ---------------------------------------------------------------------------
function showKayitTamamlaScreen(eksikRol, user) {
    const tedarikci = eksikRol === 'supplier';
    const meta = (user && user.user_metadata) || {};
    const adSoyad = meta.full_name || '';
    const unvan   = meta.company_name || '';
    const safe = (t) => String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    let m = document.getElementById('kayitTamamlaScreen');
    if (!m) { m = document.createElement('div'); m.id = 'kayitTamamlaScreen'; document.body.appendChild(m); }
    m.className = 'fixed inset-0 z-[100] bg-slate-900/95 flex items-center justify-center p-4 overflow-y-auto';
    m.innerHTML = `<div class="bg-white rounded-2xl max-w-md w-full p-7 my-8">
        <div class="text-center mb-5">
            <div class="text-4xl mb-2">🧩</div>
            <h2 class="text-2xl font-black text-slate-800">Kaydınız yarım kalmış</h2>
            <p class="text-sm text-slate-500 mt-2">${tedarikci ? 'Tedarikçi' : 'Danışman'} olarak kaydolmuşsunuz ama profiliniz oluşturulamamış — bu yüzden panelinize giremiyorsunuz. Aşağıdan tek adımda tamamlayalım.</p>
        </div>
        <div class="space-y-3">
            <div>
                <label class="block text-xs font-bold text-slate-600 mb-1">Ad Soyad</label>
                <input id="ktAd" value="${safe(adSoyad)}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
            </div>
            ${tedarikci ? `<div>
                <label class="block text-xs font-bold text-slate-600 mb-1">Resmi Firma Ünvanı *</label>
                <input id="ktUnvan" value="${safe(unvan)}" placeholder="Örn. Güneş Enerji Sanayi A.Ş." class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
                <p class="text-[11px] text-slate-400 mt-1">Kurulumcu firmalara bu ünvanla görüneceksiniz.</p>
            </div>` : ''}
            <div>
                <label class="block text-xs font-bold text-slate-600 mb-1">Telefon</label>
                <input id="ktTel" value="${safe(meta.phone || '')}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
            </div>
        </div>
        <div id="ktMsg" class="mt-3"></div>
        <button id="ktBtn" onclick="epcKaydiTamamla('${tedarikci ? 'supplier' : 'consultant'}')" class="w-full mt-4 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 rounded-lg">Kaydı Tamamla ve Panele Gir</button>
        <button onclick="(async()=>{ try{ if(supabaseClient) await supabaseClient.auth.signOut(); }catch(e){} window.location.hash='#home'; window.location.reload(); })()" class="w-full mt-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-sm">Çıkış Yap</button>
    </div>`;
    m.classList.remove('hidden');
}

window.epcKaydiTamamla = async function (rol) {
    const btn = document.getElementById('ktBtn');
    const msg = document.getElementById('ktMsg');
    const yaz = (t, kotu) => { if (msg) msg.innerHTML = `<p class="text-xs font-bold ${kotu ? 'text-red-600' : 'text-emerald-600'}">${t}</p>`; };
    const ad  = (document.getElementById('ktAd')?.value || '').trim();
    const tel = (document.getElementById('ktTel')?.value || '').trim();
    const unvan = (document.getElementById('ktUnvan')?.value || '').trim();

    if (rol === 'supplier' && unvan.length < 3) { yaz('Geçerli bir firma ünvanı girin.', true); return; }
    if (!ad) { yaz('Ad soyad boş olamaz.', true); return; }

    const orig = btn ? btn.textContent : '';
    if (btn) { btn.textContent = 'Kaydediliyor…'; btn.disabled = true; }
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Oturum bulunamadı, tekrar giriş yapın.');

        if (rol === 'supplier') {
            const { error } = await supabaseClient.from('suppliers').insert({
                id: user.id, company_name: unvan, full_name: ad,
                email: user.email, phone: tel, status: 'draft'
            });
            if (error && error.code !== '23505') throw error;
        } else {
            const parcalar = ad.split(/\s+/);
            const bas = ((parcalar[0] || '').charAt(0) + (parcalar[parcalar.length - 1] || '').charAt(0)).toUpperCase();
            const { error } = await supabaseClient.from('consultants').insert({
                id: user.id, full_name: ad, email: user.email,
                phone: tel, avatar_initials: bas, status: 'draft'
            });
            if (error && error.code !== '23505') throw error;
        }
        // Bir daha sorulmasın: metadata'ya da yaz (satır zaten açıldı, bu ek güvence).
        try { await supabaseClient.auth.updateUser({ data: { role: rol, full_name: ad, phone: tel, company_name: unvan || undefined } }); } catch (e) { }

        document.getElementById('kayitTamamlaScreen')?.remove();
        const { data: { user: u2 } } = await supabaseClient.auth.getUser();
        await routeByInfo(await getAccountInfo(u2), u2);
    } catch (err) {
        yaz('Tamamlanamadı: ' + (err.message || err), true);
        if (btn) { btn.textContent = orig; btn.disabled = false; }
    }
};

// rolAnahtari: routeByInfo bu ekranı currentConsultant/currentSupplier
// atanmadan ÖNCE çağırıyor, o yüzden rol dışarıdan geliyor.
function showRenewalScreen(email, sub, rolAnahtari) {
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
                <div><div class="text-3xl font-black text-slate-800">${window.epcPriceLabel(rolAnahtari)}<span class="text-base font-bold text-slate-400">/ay</span></div><div class="text-xs text-slate-500">KDV hariç · USD'ye endeksli TL (güncel kur)</div></div>
                <span class="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-full">AYLIK</span>
            </div>
            <div class="border-t border-slate-200 pt-3 space-y-1.5 text-sm">
                <div class="flex justify-between gap-3"><span class="text-slate-500">Alıcı</span><span class="font-bold text-slate-800 text-right">${PAYMENT_NAME}</span></div>
                <div class="flex justify-between gap-3"><span class="text-slate-500">IBAN</span><span class="font-bold text-slate-800 text-right">${PAYMENT_IBAN}</span></div>
                <div class="flex justify-between gap-3"><span class="text-slate-500">Açıklama</span><span class="font-bold text-indigo-600 text-right break-all">${safe}</span></div>
            </div>
        </div>
        <p class="text-xs text-slate-600 mb-1 bg-amber-50 border border-amber-100 rounded-lg p-3">💡 Havale/EFT açıklamasına mutlaka <strong>e-posta adresinizi</strong> yazın. Ödemeniz onaylandığında hesabınız aktifleştirilecek ve tekrar giriş yapabileceksiniz.</p>
        ${odemeBildirHtml()}
        <div class="mb-4"></div>
        <button onclick="(async()=>{ try{ if(supabaseClient) await supabaseClient.auth.signOut(); }catch(e){} window.currentConsultant=null; window.location.hash='#home'; window.location.reload(); })()" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-lg">Çıkış Yap</button>
    </div>`;
    m.classList.remove('hidden');
}

// ============================================================================
// "ÖDEMEYİ YAPTIM" — yöneticiye haber ver
//
// ⚠️ BU DÜĞME ABONELİĞİ AÇMIYOR, AÇMAMALI DA. Ödemeyi doğrulayan tek şey banka
// hesabı; "ödedim" demekle açılan bir kapı, ödemeden açılan bir kapıdır.
// Düğme yalnız yöneticiye bildirim + e-posta gönderiyor, süreyi yönetici uzatıyor.
//
// Metin de bunu söylüyor: "iletildi", "hesabınız açıldı" değil. Kullanıcının
// ekranda okuduğu şey ile sistemin yaptığı şey aynı olmalı.
//
// Sunucu tarafı 12 saatte bir bildirime izin veriyor; bekleyen biri düğmeye
// arka arkaya basar ve yöneticinin gelen kutusunu doldurmak bildirimi işe
// yaramaz hâle getirir. Aynı cevabı burada da dürüstçe gösteriyoruz.
window.odemeBildir = async function (dugme) {
    if (!window.supabaseClient) return;
    const kutu = document.getElementById('odemeBildirimSonuc');
    const eskiMetin = dugme.textContent;
    dugme.disabled = true;
    dugme.textContent = 'Gönderiliyor…';
    try {
        const { data, error } = await supabaseClient.rpc('odeme_bildirdim', { p_not: null });
        if (error) throw error;
        const r = Array.isArray(data) ? data[0] : data;
        if (kutu) {
            kutu.className = (r && r.gonderildi)
                ? 'text-xs mt-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3'
                : 'text-xs mt-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg p-3';
            kutu.textContent = (r && r.mesaj) || 'Bildiriminiz iletildi.';
        }
        dugme.textContent = 'Bildirildi ✓';
        // Tekrar basılmasın: sunucu zaten engelliyor, düğme de sussun.
    } catch (e) {
        if (kutu) {
            kutu.className = 'text-xs mt-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3';
            kutu.textContent = 'Bildirim gönderilemedi: ' + (e.message || e);
        }
        dugme.disabled = false;
        dugme.textContent = eskiMetin;
    }
};

function odemeBildirHtml() {
    return `<button type="button" onclick="odemeBildir(this)"
                class="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-2.5 rounded-lg text-sm">
                Ödemeyi yaptım, bildir
            </button>
            <p class="text-[11px] text-slate-400 mt-1.5 text-center">Bu bildirim aboneliği açmaz; ödeme kontrol edildikten sonra yönetici uzatır.</p>
            <div id="odemeBildirimSonuc"></div>`;
}

function paymentInfoHtml(email) {
    const safe = String(email || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div class="bg-white border border-slate-200 rounded-xl p-4">
        <div class="flex items-end justify-between mb-3"><div><div class="text-2xl font-black text-slate-800">${window.epcPriceLabel()}<span class="text-sm font-bold text-slate-400">/ay</span></div><div class="text-[11px] text-slate-500">KDV hariç · USD'ye endeksli TL (güncel kur)</div></div><span class="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-full">AYLIK</span></div>
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
    // ⚠️ DÜZELTME (21.09.2026): Buradaki `if (days < 0) return;` kaldırıldı ama
    // GEREKÇESİ YANLIŞ YAZILMIŞTI. "Süre bitince panel açık kalıyor" demiştim;
    // doğru değil — routeByInfo süre dolmuşsa showRenewalScreen'i açıp panel
    // yüklenmeden `return 'expired'` ile çıkıyor. Yani bitmiş abonelikte bu
    // rozet normal akışta zaten GÖRÜNMEZ; kilit ekranı önce geliyor.
    // Aşağıdaki kırmızı hâl savunma amaçlı duruyor: rozet başka bir yerden
    // (örn. yönetici süre uzattıktan sonra) tazelenirse doğru şeyi göstersin.
    let cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    let label = days + ' gün kaldı';
    let ikon = '⏳';
    if (days < 0) {
        cls = 'bg-red-50 text-red-700 border-red-300';
        const gecen = Math.abs(days);
        label = gecen === 0 ? 'Abonelik bitti' : 'Abonelik bitti · ' + gecen + ' gün';
        ikon = '⚠️';
    } else if (days === 0) {
        cls = 'bg-amber-50 text-amber-700 border-amber-200';
        label = 'Bugün son gün';
    } else if (days <= 7) {
        cls = 'bg-amber-50 text-amber-700 border-amber-200';
    }
    el.innerHTML = `<button onclick="showSubModal()" title="Abonelik / uzatma" class="border ${cls} font-bold text-xs px-3 py-1.5 rounded-full hover:opacity-80 whitespace-nowrap">${ikon} ${label}</button>`;
}

// Abonelik bitişine ≤7 gün kala giriş sonrası uyarı şeridi göster.
// ✕ ile kapatılınca aynı gün tekrar çıkmaz; ertesi gün yeniden görünür.
// (pg_cron olmadığı için "bitiş bildirimi" girişte istemci tarafında üretilir.)
function maybeShowSubExpiryBanner() {
    const s = window.__subInfo;
    if (!s || !s.endsAt) return;
    const days = Math.ceil((new Date(s.endsAt).getTime() - Date.now()) / 86400000);
    if (days > 7) return;   // `days < 0` koşulu kaldırıldı — ama bitmiş abonelikte normal akışta buraya hiç gelinmez (kilit ekranı önce çıkar)
    const today = new Date().toISOString().slice(0, 10);
    try { if (localStorage.getItem('subExpiryDismissed') === today) return; } catch (e) { /* depo yoksa her girişte göster */ }
    let b = document.getElementById('subExpiryBanner');
    if (!b) { b = document.createElement('div'); b.id = 'subExpiryBanner'; document.body.appendChild(b); }
    const bitti = days < 0;
    const label = bitti
        ? ('Aboneliğiniz ' + (Math.abs(days) || 'bugün') + (Math.abs(days) ? ' gün önce bitti.' : ' bitti.'))
        : (days === 0 ? 'Aboneliğinizin son günü!' : 'Aboneliğinizin bitmesine ' + days + ' gün kaldı.');
    const kutuCls = bitti ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300';
    const yaziCls = bitti ? 'text-red-800' : 'text-amber-800';
    const dugmeCls = bitti ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700';
    const kapatCls = bitti ? 'text-red-400 hover:text-red-600' : 'text-amber-400 hover:text-amber-600';
    b.innerHTML = `
        <div class="fixed top-16 left-1/2 -translate-x-1/2 z-[85] w-[calc(100%-2rem)] max-w-xl">
            <div class="${kutuCls} border rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 flex-wrap">
                <span class="text-xl shrink-0">${bitti ? '⚠️' : '⏳'}</span>
                <span class="text-sm font-bold ${yaziCls} flex-1 min-w-[180px]">${label} ${bitti ? 'Paneliniz açık kalmaya devam ediyor; kullanmaya devam etmek için aboneliğinizi yenileyin.' : 'Kesinti yaşamamak için süreyi şimdi uzatın.'}</span>
                <button onclick="showSubModal()" class="${dugmeCls} text-white text-xs font-black px-3 py-1.5 rounded-lg whitespace-nowrap">Ödeme Bilgileri</button>
                <button onclick="(function(){ try{localStorage.setItem('subExpiryDismissed','${today}')}catch(e){}; var el=document.getElementById('subExpiryBanner'); if(el) el.remove(); })()" title="Bugün için kapat" class="${kapatCls} text-lg leading-none px-1">✕</button>
            </div>
        </div>`;
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
            <div class="text-4xl font-black ${days === null ? 'text-slate-400' : (days < 0 ? 'text-red-600' : (days <= 7 ? 'text-amber-600' : 'text-emerald-600'))}">${days === null ? '—' : Math.abs(days)}</div>
            <div class="text-sm text-slate-500">${days === null ? 'süre bilgisi yok' : (days < 0 ? 'gün önce bitti' : 'gün kaldı')} · Bitiş: ${endStr}</div>
        </div>
        <p class="text-xs font-bold text-slate-600 mb-2">Aboneliği uzatmak için ödeme bilgileri:</p>
        ${paymentInfoHtml(s.email || '')}
        <p class="text-xs text-slate-600 mt-3 bg-amber-50 border border-amber-100 rounded-lg p-3">💡 Havale/EFT açıklamasına <strong>e-posta adresinizi</strong> yazın. Ödemeniz onaylanınca süreniz uzatılır.</p>
        ${odemeBildirHtml()}
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
    // Panel dosyaları (CRM, teklif, admin, tedarikçi/yatırımcı panelleri…) artık
    // index.html'de <script> ile gelmiyor; rol belli olduğu anda buradan iniyor.
    // Aşağıdaki showInvestorPanel/showSupplierPanel çağrıları bu pakete bağlı,
    // bu yüzden ilk iş olarak beklenmeli.
    try { await window.epcLoadPanel(); }
    catch (e) {
        alert('Panel dosyaları yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
        return 'panel-yuklenemedi';
    }
    window.currentConsultant = null;
    window.currentSupplier = null;
    window.__subInfo = null;
    window.__epcRol = info.type;   // adres çubuğu rolü buradan öğrenir
    if (info.type === 'investor') {
        // Yatırımcı ücret ödemez; abonelik kontrolü uygulanmaz.
        try { await supabaseClient.rpc('claim_my_leads'); } catch (e) { /* geçmiş başvuru eşleştirme */ }
        if (typeof showInvestorPanel === 'function') showInvestorPanel();
        return 'investor';
    }
    // Yarım kalmış tedarikçi/danışman kaydı: satırı burada tamamlatıyoruz.
    // Abonelik kontrolünden ÖNCE — henüz abonelik satırı bile yok.
    if (info.type === 'yarim-kayit') {
        showKayitTamamlaScreen(info.eksikRol, user);
        return 'yarim-kayit';
    }
    if (info.type !== 'admin') {
        const sub = await getSubscription(info, user);
        if (sub && sub.banned) { showBanScreen(user.email, sub.banReason); return 'banned'; }
        window.__subInfo = sub ? { endsAt: sub.endsAt, status: sub.status, email: user.email } : null;
        if (sub && sub.endsAt && new Date(sub.endsAt).getTime() < Date.now()) { showRenewalScreen(user.email, sub, info.type); return 'expired'; }
    }
    if (info.type === 'consultant') {
        window.currentConsultant = info.consultant;
        window.__consultantEmail = user.email;
        updateSubCounter();
        maybeShowSubExpiryBanner();
        return 'consultant';
    }
    if (info.type === 'supplier') {
        window.currentSupplier = info.supplier;
        window.__supplierEmail = user.email;
        updateSubCounter();
        maybeShowSubExpiryBanner();
        if (typeof showSupplierPanel === 'function') showSupplierPanel(info.supplier, user.email);
        return 'supplier';
    }
    await fetchUserProfile(user.id, user.email);
    updateSubCounter();
    maybeShowSubExpiryBanner();
    return info.type;
}
async function routeAfterLogin(user) {
    const info = await getAccountInfo(user);
    return routeByInfo(info, user);
}

// ---------------------------------------------------------------------------
// YATIRIMCI MAGIC-LINK: e-postaya tek tıklık giriş bağlantısı gönderir.
// Hesap yoksa Supabase oluşturur; metadata'daki rol, handle_new_investor
// trigger'ının yatırımcı profili açmasını sağlar. Bağlantı tıklanınca site
// açılır, router.js'teki oturum restore akışı yatırımcıyı panele sokar ve
// claim_my_leads geçmiş başvuruları hesaba bağlar. Harici e-posta sağlayıcısı
// GEREKMEZ (Supabase Auth'un yerleşik e-postası; SMTP panelden bağlanabilir).
// ---------------------------------------------------------------------------
window.sendInvestorMagicLink = async function (email, fullName, phone) {
    if (!supabaseClient) return { ok: false, error: 'Bağlantı yok' };
    email = String(email || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Geçerli bir e-posta gerekli' };
    try {
        const { error } = await supabaseClient.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: window.location.origin + window.location.pathname,
                data: { role: 'investor', full_name: fullName || '', phone: phone || '' }
            }
        });
        if (error) throw error;
        return { ok: true };
    } catch (err) { return { ok: false, error: err.message || String(err) }; }
};

// Ana sayfadan "Yatırımcı Girişi": giriş ekranını yatırımcı rolü seçili açar.
window.openInvestorLogin = function () {
    window.__authMode = 'login';
    window.location.hash = '#yatirimciauth';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

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
                    // Satır açılamadı; ilk girişte showKayitTamamlaScreen tamamlatacak.
                    alert("✅ Kaydınız oluşturuldu! Sizlere mail doğrulama linki gönderdik.\n\nE-postanızı doğrulayıp giriş yaptığınızda danışman profiliniz otomatik tamamlanacak.");
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

    // --- TEDARİKÇİ KAYDI ---
    // Danışman akışıyla aynı: auth kaydı açılır, suppliers satırı 'draft' olarak
    // oluşturulur, oturum kapatılır ve e-posta doğrulaması beklenir. Profil
    // tamamlanıp onaya gönderilene kadar tedarikçi dizinde görünmez.
    if (window.authRole === 'supplier') {
        const supCompany = (document.getElementById('regCompany')?.value || '').trim();
        if (supCompany.length < 3) {
            alert("Tedarikçi kaydı için geçerli bir firma ünvanı girmelisiniz."); return;
        }
        const orig = btn.textContent; btn.textContent = "Kaydediliyor..."; btn.disabled = true;
        try {
            // ⚠️ company_name METADATA'YA DA YAZILIYOR.
            // Aşağıdaki suppliers.insert her zaman çalışmıyor: e-posta
            // doğrulaması zorunluysa signInWithPassword başarısız oluyor ve
            // fonksiyon satırı açmadan dönüyor. O durumda kullanıcı ilk
            // girişinde showKayitTamamlaScreen'e düşüyor; ünvanı burada
            // sakladığımız için form önden dolu geliyor, kullanıcı yeniden
            // yazmak zorunda kalmıyor.
            const { error: signUpErr } = await supabaseClient.auth.signUp({
                email, password,
                options: { data: { role: 'supplier', full_name: (firstName + ' ' + lastName).trim(), phone: phone, company_name: supCompany } }
            });
            if (signUpErr) throw signUpErr;
            let { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
                const { data: si, error: siErr } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (siErr) {
                    alert("✅ Kaydınız oluşturuldu! Sizlere mail doğrulama linki gönderdik.\n\nE-postanızı doğrulayıp giriş yaptığınızda tedarikçi profiliniz otomatik tamamlanacak.");
                    document.getElementById('registerForm').reset(); document.getElementById('tabLogin').click(); return;
                }
                session = si.session;
            }
            const { error: insErr } = await supabaseClient.from('suppliers').insert({
                id: session.user.id,
                company_name: supCompany,
                full_name: (firstName + ' ' + lastName).trim(),
                email, phone, status: 'draft'
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
    // ⚠️ KONUM ZORUNLU. Yatırımcıya "en yakın 3 firma" gösteriliyor; konumu
    // olmayan firma bu sıralamaya HİÇ giremez, yani hiç başvuru almaz.
    // Kayıt anında almak, sonradan "neden iş gelmiyor" sorusunu önlüyor.
    const regIl   = (document.getElementById('regCity')?.value || '').trim();
    const regIlce = (document.getElementById('regDistrict')?.value || '').trim();
    if (!regIl) {
        alert("Hizmet verdiğiniz ili seçin.\n\nYatırımcılara konumlarına en yakın firmalar gösteriliyor; il seçilmezse başvurular size düşmez."); return;
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

        // bootstrap_company() konum almıyor ve gövdesi bilinmediği için ona
        // dokunulmuyor; konumu oturum kapanmadan ayrı fonksiyonla yazıyoruz.
        let konumYazildi = true;
        try {
            const { error: kErr } = await supabaseClient.rpc('firma_konum_yaz',
                { p_il: regIl, p_ilce: regIlce || null });
            if (kErr) throw kErr;
        } catch (e) { konumYazildi = false; console.warn('firma konumu yazılamadı', e); }

        await supabaseClient.auth.signOut();
        alert(konumYazildi
            ? "Firma Kaydı Başarılı! Artık sisteme giriş yapabilirsiniz."
            : "Firma Kaydı Başarılı! Ancak konumunuz kaydedilemedi — giriş yaptıktan sonra Profilim sayfasından il/ilçe girin, yoksa başvurular size düşmez.");
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
            // ⚠️ Bu iki tablo yatırımcı fazında yazıldı; TEDARİKÇİ SONRA EKLENDİ
            // ama buraya işlenmedi. Sonuç: authRole 'supplier' olunca expected
            // 'installer'a düşüyor, tedarikçi KENDİ giriş ekranında bile geri
            // çevriliyordu — "Bu hesap bir supplier hesabıdır" (ham anahtar,
            // çünkü LBL'de de yoktu) + boş seçenek adı. Hiçbir ekrandan giremiyordu.
            const LBL = { installer: 'Kurulumcu Firma', consultant: 'Danışman',
                          investor: 'Yatırımcı', supplier: 'Tedarikçi' };
            const ADRES = { installer: 'epcmerkezim.com/kurulumcu', consultant: 'epcmerkezim.com/danisman',
                            supplier: 'epcmerkezim.com/tedarikci', investor: 'epcmerkezim.com/#yatirimci' };
            const expected = { firma: 'installer', consultant: 'consultant',
                               investor: 'investor', supplier: 'supplier' }[window.authRole || 'firma'] || 'installer';
            // Yarım kalan kayıt (auth hesabı var, rol satırı yok) hangi ekrandan
            // gelirse gelsin tamamlama ekranına gitmeli; eşleştirilecek rolü yok.
            if (info.type !== 'admin' && info.type !== 'yarim-kayit' && info.type !== expected) {
                await supabaseClient.auth.signOut();
                const ad = LBL[info.type] || info.type;
                alert('Bu hesap bir "' + ad + '" hesabıdır.\n\n'
                    + (ADRES[info.type] ? ad + ' giriş ekranından girin:\n' + ADRES[info.type]
                                        : 'Lütfen doğru giriş ekranını kullanın.'));
            } else {
                applyRememberPreference(!!document.getElementById('rememberMe')?.checked);
                const r = await routeByInfo(info, data.user);
                // Adres rolü söylesin: #kurulumcu-panel / #danisman-panel / …
                // Eskiden dört rol de #app'e gidiyordu.
                if (r !== 'expired' && r !== 'banned' && r !== 'panel-yuklenemedi') {
                    window.location.hash = (typeof window.epcPanelAdresi === 'function')
                        ? window.epcPanelAdresi() : '#app';
                }
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

        // Ana ekranın karşılaması ve canlı sayıları profil belli olduktan sonra
        // basılır (isim ve rol buradan geliyor). Buraya yalnız firma/admin
        // hesapları ulaşır; diğer roller routeByInfo'da daha önce dönüyor.
        if (typeof window.epcPanelHomeTazele === 'function') window.epcPanelHomeTazele(true);
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
