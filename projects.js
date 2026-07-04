/* ============================================================================
   projects.js — TESİSLERİM EKRANI
   Firmanın kurulumu tamamlanan tesislerini (projects) ve GES kodlarını listeler.
   Kendi kart açma / geri dönme / veri yükleme mantığını içerir; başka modüle
   dokunmaz. index.html'de core.js'ten sonra, sales.js'ten sonra yüklenmelidir.
   (Klasik script; supabaseClient, admEscape, crmCopyText, closeAllAndShowMenu
   diğer dosyalardan küresel olarak gelir.)
   ============================================================================ */

// --- Menü kartı: Tesislerim ekranını aç ---
document.getElementById('btnGoProjects')?.addEventListener('click', () => {
    window.openedFromPublic = false;
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('projectsModule').classList.remove('hidden');
    loadProjects();
});

// --- Geri dön (önce bu ekranı gizle, sonra ortak menü fonksiyonunu çağır) ---
document.getElementById('btnBackToMenuFromProjects')?.addEventListener('click', () => {
    document.getElementById('projectsModule')?.classList.add('hidden');
    closeAllAndShowMenu();
});

// --- Yenile ---
document.getElementById('btnRefreshProjects')?.addEventListener('click', () => loadProjects());

/**
 * Firmanın tesislerini veritabanından yükler ve listeler.
 * RLS sayesinde otomatik olarak yalnız bu firmanın tesisleri gelir.
 */
async function loadProjects() {
    if (!supabaseClient) return;
    const box = document.getElementById('projectsList');
    if (!box) return;

    box.innerHTML = '<p class="text-slate-400 text-sm">Yükleniyor...</p>';

    const { data, error } = await supabaseClient
        .from('projects').select('*').order('created_at', { ascending: false });

    if (error) { box.innerHTML = `<p class="text-red-500 text-sm">Yüklenemedi: ${error.message}</p>`; return; }
    if (!data || data.length === 0) {
        box.innerHTML = '<p class="text-slate-500 text-sm font-medium">Henüz tesis oluşturmadınız. CRM\'de bir müşteriyi "7. Bitti" aşamasına getirip "Tesis Oluştur" diyerek buraya ekleyebilirsiniz.</p>';
        return;
    }

    const countHtml = `<p class="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Toplam ${data.length} tesis</p>`;

    box.innerHTML = countHtml + data.map(p => {
        const inst = p.install_date ? new Date(p.install_date).toLocaleDateString('tr-TR') : '-';
        const specs = [];
        if (p.system_kwp)     specs.push(`${p.system_kwp} kWp`);
        if (p.inverter_model) specs.push(admEscape(p.inverter_model));
        if (p.battery_model)  specs.push('🔋 ' + admEscape(p.battery_model));
        if (p.panel_count)    specs.push(`${p.panel_count} panel`);
        const specStr = specs.length ? specs.join(' · ') : 'Teknik detay girilmemiş';

        return `
            <div class="p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow transition">
                <div class="flex justify-between items-start gap-3 flex-wrap">
                    <div>
                        <div class="font-mono text-lg font-black text-emerald-700">☀️ ${admEscape(p.facility_code)}</div>
                        <div class="font-bold text-slate-800 mt-1">${admEscape(p.customer_name)}</div>
                        <p class="text-xs text-slate-500 mt-1">📍 ${admEscape(p.address) || 'Adres girilmemiş'}</p>
                        <p class="text-[11px] text-slate-500 mt-2 bg-slate-50 border border-slate-100 rounded px-2 py-1 inline-block">${specStr}</p>
                    </div>
                    <div class="text-right whitespace-nowrap">
                        <span class="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">${admEscape(p.status)}</span>
                        <p class="text-[10px] text-slate-400 mt-2">Kurulum: ${inst}</p>
                        <button onclick="crmCopyText('${admEscape(p.facility_code)}')" class="mt-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-[11px] font-bold">Kodu Kopyala</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
