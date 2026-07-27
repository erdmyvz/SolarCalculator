/* ============================================================================
   maintenance.js — BAKIM / TEMİZLİK HATIRLATMALARI (kurulumcu firma)
   ----------------------------------------------------------------------------
   Tesislerim ekranının üstüne, vadesi yaklaşan/geçen bakım hatırlatmalarını
   ekler. list_maintenance() RPC verileri döndürür (ilk çağrıda kurulum
   tarihinden otomatik hesaplar). Firma her bakımı "Tamamlandı" işaretler →
   bir sonraki döngü otomatik açılır; "Ertele" ile ileri tarihe atar; "Servis
   Aç" ile mevcut servis akışına köprüler.
   Klasik script; supabaseClient, admEscape küresel gelir. projects.js'ten
   SONRA yüklenir.
   ============================================================================ */
(function () {
    'use strict';
    const esc = (v) => (typeof admEscape === 'function' ? admEscape(v) : String(v == null ? '' : v));

    const KIND = {
        clean:   { label: 'Panel Temizliği', icon: '🧽', tone: 'sky' },
        service: { label: 'Yıllık Bakım',    icon: '🔧', tone: 'amber' }
    };

    // Tesislerim yüklendikten sonra hatırlatma panelini yerleştir/yenile
    window.loadMaintenance = async function () {
        const host = ensureHost();
        if (!host || !window.supabaseClient) return;
        host.innerHTML = '<p class="text-sm text-slate-400">Bakım durumu kontrol ediliyor...</p>';
        try {
            const { data, error } = await supabaseClient.rpc('list_maintenance');
            if (error) throw error;
            render(host, data || []);
        } catch (err) {
            // Tablo yoksa sessiz-zarif geç (maintenance_reminders.sql çalıştırılmamış olabilir)
            host.innerHTML = `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">Bakım hatırlatmaları yüklenemedi. <span class="text-amber-600">(maintenance_reminders.sql çalıştırıldı mı?)</span></div>`;
        }
    };

    // projectsList'in hemen üstüne bir kapsayıcı yerleştir (index.html'e dokunmadan)
    function ensureHost() {
        let host = document.getElementById('maintReminders');
        if (host) return host;
        const list = document.getElementById('projectsList');
        if (!list || !list.parentNode) return null;
        host = document.createElement('div');
        host.id = 'maintReminders';
        host.className = 'mb-6';
        list.parentNode.insertBefore(host, list);
        return host;
    }

    function render(host, rows) {
        // Yalnız yaklaşan (≤30 gün) veya gecikmiş olanları öne çıkar; gerisi gizli özet.
        const due = rows.filter(r => r.days_left <= 30);
        if (!due.length) {
            host.innerHTML = `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                <span class="text-lg">✅</span>
                <span class="text-sm font-bold text-emerald-800">Yaklaşan bakım yok.</span>
                <span class="text-xs text-emerald-600">Tüm tesislerin bakım planı güncel.</span>
            </div>`;
            return;
        }
        const overdue = due.filter(r => r.days_left < 0).length;
        host.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h3 class="font-black text-slate-800">🗓️ Bakım Hatırlatmaları
                        <span class="text-xs font-bold text-white bg-red-600 rounded-full px-2 py-0.5 ml-1">${due.length}</span>
                    </h3>
                    ${overdue ? `<span class="text-[11px] font-black text-red-600">${overdue} gecikmiş</span>` : ''}
                </div>
                <div class="space-y-2">${due.map(row).join('')}</div>
                <p class="text-[11px] text-slate-400 mt-3">Bakımı tamamladığınızda bir sonraki periyot otomatik planlanır. Periyotları Admin panelinden değiştirebilirsiniz.</p>
            </div>`;
    }

    function row(r) {
        const k = KIND[r.kind] || KIND.service;
        const overdue = r.days_left < 0;
        const soon = r.days_left >= 0 && r.days_left <= 7;
        const dateStr = r.due_date ? new Date(r.due_date).toLocaleDateString('tr-TR') : '-';
        const badge = overdue
            ? `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">${Math.abs(r.days_left)} gün gecikti</span>`
            : soon
                ? `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">${r.days_left} gün kaldı</span>`
                : `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${r.days_left} gün kaldı</span>`;
        return `
            <div class="border ${overdue ? 'border-red-200 bg-red-50/40' : 'border-slate-200'} rounded-xl p-3">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span>${k.icon}</span>
                            <span class="font-black text-slate-800 text-sm">${esc(k.label)}</span>
                            ${badge}
                        </div>
                        <p class="text-xs text-slate-600 mt-1">☀️ <span class="font-mono font-bold text-emerald-700">${esc(r.facility_code)}</span> · ${esc(r.customer_name) || '-'}</p>
                        <p class="text-[11px] text-slate-400 mt-0.5">📍 ${esc(r.address) || 'Adres yok'} · Planlı tarih: <b>${dateStr}</b></p>
                    </div>
                </div>
                <div class="flex gap-2 mt-3 flex-wrap">
                    <button onclick="maintComplete('${r.reminder_id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">✓ Tamamlandı</button>
                    <button onclick="maintServiceLink('${esc(r.facility_code)}','${esc(r.customer_name)}','${esc(r.address)}','${r.kind}')" class="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg">🔧 Servis Aç</button>
                    <button onclick="maintSnooze('${r.reminder_id}')" class="bg-white border border-slate-300 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-slate-50">Ertele</button>
                </div>
            </div>`;
    }

    window.maintComplete = async function (id) {
        if (!confirm('Bu bakım tamamlandı olarak işaretlenecek ve bir sonraki periyot otomatik planlanacak. Onaylıyor musunuz?')) return;
        try {
            const { error } = await supabaseClient.rpc('complete_maintenance', { p_reminder_id: Number(id), p_note: null });
            if (error) throw error;
            await loadMaintenance();
        } catch (e) { alert('İşlem başarısız: ' + (e.message || e)); }
    };

    window.maintSnooze = async function (id) {
        const days = prompt('Kaç gün ertelensin?', '30');
        if (days == null) return;
        const n = parseInt(days, 10); if (!n || n < 1) return;
        try {
            const { error } = await supabaseClient.rpc('snooze_maintenance', { p_reminder_id: Number(id), p_days: n });
            if (error) throw error;
            await loadMaintenance();
        } catch (e) { alert('Erteleme başarısız: ' + (e.message || e)); }
    };

    // Mevcut servis akışına köprü: bilgileri taşıyarak servis modalını açar.
    window.maintServiceLink = function (facility, customer, address, kind) {
        const label = (KIND[kind] || KIND.service).label;
        if (typeof openLeadModal === 'function') {
            openLeadModal('servis');
            setTimeout(() => {
                const set = (id, v) => { const el = document.getElementById(id); if (el && v && v !== 'null') el.value = v; };
                set('leadName', customer); set('leadAddress', address);
                const rt = document.getElementById('srvRequestType'); if (rt) rt.value = (kind === 'clean' ? 'temizlik' : 'bakim');
                const fc = document.getElementById('srvFacilityCode'); if (fc) fc.value = facility;
                const dt = document.getElementById('leadDetails'); if (dt && !dt.value) dt.value = `Planlı ${label} — tesis ${facility}.`;
            }, 150);
        } else {
            alert(`Servis kaydı için tesis kodu: ${facility}`);
        }
    };

    // Tesislerim ekranı açıldığında hatırlatmaları da getir.
    document.getElementById('btnGoProjects')?.addEventListener('click', () => setTimeout(() => window.loadMaintenance(), 300));
    document.getElementById('btnRefreshProjects')?.addEventListener('click', () => setTimeout(() => window.loadMaintenance(), 300));
})();
