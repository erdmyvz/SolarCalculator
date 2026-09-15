/* ============================================================================
   profile.js — ORTAK PROFİL EKRANI (admin · kurulumcu · danışman · yatırımcı)
   Ad/soyad, telefon, e-posta, şifre ve profil fotoğrafı.
   Danışman → consultants tablosu · diğer roller → profiles tablosu.
   profile_avatar.sql çalıştırılmış olmalıdır.
   ============================================================================ */
(function () {
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    let _avatar = null, _ctx = null;

    function resize256(file, cb) {
        const r = new FileReader();
        r.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width, h = img.height, m = 256;
                if (w > h) { if (w > m) { h = Math.round(h * m / w); w = m; } }
                else { if (h > m) { w = Math.round(w * m / h); h = m; } }
                const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
                cv.getContext('2d').drawImage(img, 0, 0, w, h);
                cb(cv.toDataURL('image/jpeg', 0.85));
            };
            img.src = e.target.result;
        };
        r.readAsDataURL(file);
    }

    // Rolü ve mevcut verileri topla
    async function context() {
        const { data: ud } = await supabaseClient.auth.getUser();
        const user = ud && ud.user;
        if (!user) return null;
        if (window.currentConsultant && window.currentConsultant.id) {
            const c = window.currentConsultant;
            const parts = String(c.full_name || '').trim().split(/\s+/);
            return { role: 'consultant', id: c.id, email: user.email,
                     first: parts.slice(0, -1).join(' ') || parts[0] || '', last: parts.length > 1 ? parts[parts.length - 1] : '',
                     phone: c.phone || '', avatar: c.avatar_data || null };
        }
        let p = window.currentUserProfile;
        if (!p || p.id !== user.id) {
            try { const { data } = await supabaseClient.from('profiles').select('*').eq('id', user.id).maybeSingle(); p = data || {}; }
            catch (e) { p = {}; }
        }
        // Kurulumcu firmanın il/ilçesi: danışman firma seçicisinde buna göre
        // arıyor. Veri sahibi firmanın kendisi, bu yüzden burada düzenleniyor.
        let firma = null;
        if (p && p.company_id) {
            try {
                const { data } = await supabaseClient.from('companies')
                    .select('id, name, city, district').eq('id', p.company_id).maybeSingle();
                firma = data || null;
            } catch (e) { firma = null; }
        }
        return { role: 'profile', id: user.id, email: user.email,
                 first: p.first_name || '', last: p.last_name || '',
                 phone: p.phone || '', avatar: p.avatar_data || null, firma };
    }

    function avatarInner(name) {
        if (_avatar) return `<img src="${_avatar}" class="w-full h-full object-cover">`;
        const ini = String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
        return `<span class="text-2xl font-black text-emerald-700">${esc(ini)}</span>`;
    }

    // Profil artık pencere değil, kendi adresi olan bir sayfa (#profilim).
    // Ad "openProfileModal" olarak kaldı: dört ayrı yerden çağrılıyor ve
    // hepsinin beklentisi "profil ekranını aç".
    window.openProfileModal = async function (_adrestenGeldi) {
        document.getElementById('profileDropdown')?.classList.add('hidden');
        if (!window.supabaseClient) return;
        _ctx = await context();
        if (!_ctx) { alert('Oturum bulunamadı.'); return; }
        _avatar = _ctx.avatar;

        const kok = document.getElementById('profileRoot');
        if (!kok) return;
        if (typeof window.epcTumModulleriGizle === 'function') window.epcTumModulleriGizle();
        document.getElementById('mainMenu')?.classList.add('hidden');
        document.getElementById('landingContainer')?.classList.add('hidden');
        document.getElementById('gatewayContainer')?.classList.add('hidden');
        document.getElementById('appContainer')?.classList.remove('hidden');
        document.getElementById('profileModule')?.classList.remove('hidden');
        if (window.epcAdresYaz) window.epcAdresYaz('profilim', null, _adrestenGeldi);
        window.scrollTo(0, 0);

        kok.innerHTML = `<div class="kart">
            <div class="kart-ust">
                <h3>👤 Profilim</h3>
                <button onclick="profilKapat()" class="btn-ikincil">← Geri</button>
            </div>
            <div class="p-6 space-y-4">
                <div class="flex items-center gap-4">
                    <div id="pfAvatar" class="w-20 h-20 rounded-full bg-emerald-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">${avatarInner(_ctx.first + ' ' + _ctx.last)}</div>
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Profil Fotoğrafı</label>
                        <input type="file" accept="image/*" onchange="pfPick(this)" class="block text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold file:cursor-pointer">
                        <button type="button" onclick="pfClear()" class="mt-1 text-[11px] text-slate-400 hover:text-red-500 underline">Fotoğrafı kaldır</button>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Ad</label><input id="pfFirst" value="${esc(_ctx.first)}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                    <div><label class="block text-xs font-bold text-slate-600 mb-1">Soyad</label><input id="pfLast" value="${esc(_ctx.last)}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                </div>
                <div><label class="block text-xs font-bold text-slate-600 mb-1">Telefon</label><input id="pfPhone" value="${esc(_ctx.phone)}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm"></div>
                <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">E-posta</label>
                    <input id="pfEmail" type="email" value="${esc(_ctx.email)}" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
                    <p class="text-[11px] text-slate-400 mt-1">E-postayı değiştirirseniz <b>yeni adrese doğrulama linki</b> gönderilir; onaylamadan değişiklik geçerli olmaz.</p>
                </div>

                <details class="border border-slate-200 rounded-lg">
                    <summary class="cursor-pointer px-3 py-2.5 text-sm font-bold text-slate-700">Şifre Değiştir</summary>
                    <div class="p-3 pt-0 space-y-2">
                        <input id="pfPass1" type="password" placeholder="Yeni şifre (en az 6 karakter)" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
                        <input id="pfPass2" type="password" placeholder="Yeni şifre (tekrar)" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
                    </div>
                </details>

                ${firmaKarti(_ctx.firma)}

                <button onclick="saveProfile()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl">Kaydet</button>
                <div id="pfResult"></div>
            </div>
        </div>`;
    };

    // Geri: nereden gelindiyse oraya. Panel kullanıcısı menüye, ziyaretçi
    // vitrine döner.
    window.profilKapat = function () {
        document.getElementById('profileModule')?.classList.add('hidden');
        if (typeof window.closeAllAndShowMenu === 'function') { window.closeAllAndShowMenu(); return; }
        window.location.hash = (typeof window.epcPanelAdresi === 'function') ? window.epcPanelAdresi() : '#app';
    };

    // Firma il/ilçesi — yalnız bir firmaya bağlı kullanıcıda görünür.
    // İl serbest metin DEĞİL, 81 ilin listesi: danışman tarafındaki arama
    // "Istanbul" / "İstanbul" gibi yazım farklarına takılmasın diye.
    function firmaKarti(f) {
        if (!f) return '';
        const iller = (window.EPC_IL_VERIM ? Object.keys(window.EPC_IL_VERIM) : [])
            .sort((a, b) => a.localeCompare(b, 'tr'));
        const secenekler = '<option value="">— İl seçilmedi —</option>' +
            iller.map(il => `<option value="${esc(il)}" ${f.city === il ? 'selected' : ''}>${esc(il)}</option>`).join('');
        return `
            <div class="border-t border-slate-200 pt-4 mt-1">
                <p class="text-sm font-black text-slate-700 mb-1">🏢 Firma Bilgileri</p>
                <p class="text-[11px] text-slate-400 mb-3">
                    ${esc(f.name || 'Firmanız')} — bağımsız danışmanlar size danışan yönlendirirken
                    firmaları <b>il ve ilçeye göre</b> arıyor. Boş bırakırsanız yalnız firma adıyla bulunursunuz.
                </p>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">İl</label>
                        <select id="pfCity" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm bg-white">${secenekler}</select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">İlçe</label>
                        <input id="pfDistrict" value="${esc(f.district || '')}" placeholder="Örn. Pendik" class="w-full border border-slate-300 p-2.5 rounded-lg text-sm">
                    </div>
                </div>
            </div>`;
    }

    window.pfPick = function (input) {
        const f = input.files && input.files[0]; if (!f) return;
        resize256(f, (b64) => { _avatar = b64; const p = document.getElementById('pfAvatar'); if (p) p.innerHTML = avatarInner(''); });
    };
    window.pfClear = function () {
        _avatar = null;
        const p = document.getElementById('pfAvatar');
        if (p) p.innerHTML = avatarInner((document.getElementById('pfFirst')?.value || '') + ' ' + (document.getElementById('pfLast')?.value || ''));
    };

    window.saveProfile = async function () {
        const res = document.getElementById('pfResult');
        const first = (document.getElementById('pfFirst').value || '').trim();
        const last  = (document.getElementById('pfLast').value || '').trim();
        const phone = (document.getElementById('pfPhone').value || '').trim();
        const email = (document.getElementById('pfEmail').value || '').trim();
        const p1 = document.getElementById('pfPass1').value, p2 = document.getElementById('pfPass2').value;
        if (!first) { res.innerHTML = '<p class="text-red-500 text-sm">Ad zorunludur.</p>'; return; }
        if (p1 || p2) {
            if (p1 !== p2) { res.innerHTML = '<p class="text-red-500 text-sm">Şifreler eşleşmiyor.</p>'; return; }
            if (p1.length < 6) { res.innerHTML = '<p class="text-red-500 text-sm">Şifre en az 6 karakter olmalı.</p>'; return; }
        }
        res.innerHTML = '<p class="text-xs text-slate-400">Kaydediliyor...</p>';
        const notes = [];
        try {
            if (_ctx.role === 'consultant') {
                const { error } = await supabaseClient.from('consultants')
                    .update({ full_name: (first + ' ' + last).trim(), phone, avatar_data: _avatar, updated_at: new Date().toISOString() })
                    .eq('id', _ctx.id);
                if (error) throw error;
                if (window.currentConsultant) Object.assign(window.currentConsultant, { full_name: (first + ' ' + last).trim(), phone, avatar_data: _avatar });
            } else {
                const { error } = await supabaseClient.from('profiles')
                    .update({ first_name: first, last_name: last, phone, avatar_data: _avatar })
                    .eq('id', _ctx.id);
                if (error) throw error;
                if (window.currentUserProfile) Object.assign(window.currentUserProfile, { first_name: first, last_name: last, phone, avatar_data: _avatar });
            }

            // Firma il/ilçesi — kart yalnız firmaya bağlı kullanıcıda çizilir.
            const ilEl = document.getElementById('pfCity');
            if (_ctx.firma && ilEl) {
                const il = ilEl.value || null;
                const ilce = (document.getElementById('pfDistrict').value || '').trim() || null;
                if (il !== (_ctx.firma.city || null) || ilce !== (_ctx.firma.district || null)) {
                    const { error } = await supabaseClient.from('companies')
                        .update({ city: il, district: ilce }).eq('id', _ctx.firma.id);
                    // Firma satırını güncelleme yetkisi yoksa profil kaydı boşa
                    // gitmesin: hata yutulmuyor ama diğer alanlar kaydedilmiş oluyor.
                    if (error) notes.push('Firma il/ilçesi kaydedilemedi: ' + (error.message || error));
                    else { _ctx.firma.city = il; _ctx.firma.district = ilce; notes.push('Firma konumu güncellendi.'); }
                }
            }

            if (email && email.toLowerCase() !== String(_ctx.email).toLowerCase()) {
                const { error } = await supabaseClient.auth.updateUser({ email });
                if (error) throw error;
                notes.push('Yeni e-posta adresinize doğrulama linki gönderildi.');
            }
            if (p1) {
                const { error } = await supabaseClient.auth.updateUser({ password: p1 });
                if (error) throw error;
                notes.push('Şifreniz güncellendi.');
            }

            paintTopbar((first + ' ' + last).trim());
            res.innerHTML = `<p class="text-emerald-600 text-sm font-bold">✅ Kaydedildi${notes.length ? ' — ' + notes.join(' ') : ''}</p>`;
        } catch (e) {
            res.innerHTML = `<p class="text-red-500 text-sm">${esc(e.message || e)}</p>`;
        }
    };

    // Üst bardaki ad ve avatarı tazele
    function paintTopbar(name) {
        const n = document.getElementById('userNameDisplay'); if (n && name) n.textContent = name;
        const box = document.getElementById('userInitials')?.parentElement;
        if (box) {
            if (_avatar) box.innerHTML = `<img src="${_avatar}" class="w-full h-full object-cover rounded-full">`;
            else {
                const ini = String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
                box.innerHTML = `<span id="userInitials">${esc(ini)}</span>`;
            }
        }
    }

    // Girişte avatarı üst bara yansıt
    window.profileSyncTopbar = async function () {
        try {
            const c = await context(); if (!c) return;
            _avatar = c.avatar;
            if (c.avatar) paintTopbar('');
        } catch (e) {}
    };
    (function boot() {
        let wired = false, tries = 0;
        const tick = () => {
            if (window.supabaseClient && supabaseClient.auth && !wired) {
                wired = true;
                try { supabaseClient.auth.onAuthStateChange((_e, s) => { if (s) setTimeout(profileSyncTopbar, 600); }); } catch (e) { wired = false; }
            }
            if (!wired && ++tries < 60) setTimeout(tick, 500);
        };
        setTimeout(tick, 500);
    })();
})();
