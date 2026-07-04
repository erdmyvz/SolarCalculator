/* ============================================================================
   11. Teknik Servis Modülü (firma -> merkez arıza kaydı)
   Bölünmüş modül dosyası. index.html'de core.js'ten sonra, ORİJİNAL SIRAYLA
   yüklenmelidir. Klasik script olduğu için tüm fonksiyonlar küresel kalır.
   ============================================================================ */

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
    fetchMyTickets(); 
});

document.getElementById('ticketForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!supabaseClient) { alert("Veritabanı bağlantısı yok."); return; }

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
        alert("Oturumunuz sona ermiş görünüyor. Lütfen tekrar giriş yapın.");
        window.location.hash = '#auth';
        return;
    }

    const btn = document.getElementById('btnSubmitTicket');
    btn.innerHTML = "Gönderiliyor..."; btn.disabled = true;

    try {
        const companyId = (currentUserProfile && currentUserProfile.company_id) ? currentUserProfile.company_id : null;
        const { data: code, error } = await supabaseClient.rpc('submit_service_request', {
            p_request_type:   'ariza',
            p_full_name:      document.getElementById('tsName').value,
            p_phone:          document.getElementById('tsPhone').value,
            p_email:          document.getElementById('tsEmail').value,
            p_address:        document.getElementById('tsAddress').value,
            p_inverter_model: document.getElementById('tsInverter').value,
            p_battery_model:  document.getElementById('tsBattery').value,
            p_installer_name: document.getElementById('tsInstaller').value,
            p_install_date:   document.getElementById('tsInstallDate').value || null,
            p_problem_date:   document.getElementById('tsProblemDate').value || null,
            p_problem_desc:   document.getElementById('tsProblemDesc').value,
            p_img_system: null, p_img_pano: null, p_img_ges: null, p_img_code: null,
            p_facility_code: null, p_company_id: companyId
        });
        if (error) throw error;

        alert(`Arıza kaydınız merkeze iletildi.\nTakip Kodu: ${code}`);
        document.getElementById('ticketForm').reset();
        document.getElementById('tabMyTickets').click();
    } catch (err) {
        alert("Hata: " + (err.message || err));
    } finally {
        btn.innerHTML = "<span>📨</span> Yetkili Servis Talebini Merkeze Gönder";
        btn.disabled = false;
    }
});

async function fetchMyTickets() {
    if(!supabaseClient) return;
    const list = document.getElementById('myTicketsList');
    if(!list) return;

    list.innerHTML = '<p class="text-slate-500 text-sm font-medium">Biletleriniz veritabanından çekiliyor...</p>';

    // RLS sayesinde otomatik olarak yalnız bu firmaya ait servis talepleri gelir
    const { data, error } = await supabaseClient
        .from('service_requests').select('*').order('created_at', { ascending: false });

    if (error) { list.innerHTML = `<p class="text-red-500 text-sm font-medium">Yüklenemedi: ${error.message}</p>`; return; }
    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-slate-500 text-sm font-medium">Daha önce açılmış bir servis kaydınız (biletiniz) bulunmuyor.</p>';
        return;
    }

    const labelMap = {
        basvuru_iletildi: { t: 'Başvuru İletildi', c: 'bg-slate-100 text-slate-800' },
        inceleniyor:      { t: 'İnceleniyor',      c: 'bg-blue-100 text-blue-800 border border-blue-200' },
        planlandi:        { t: 'Planlandı',        c: 'bg-amber-100 text-amber-800 border border-amber-200' },
        tamamlandi:       { t: 'Tamamlandı',       c: 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm' }
    };

    list.innerHTML = data.map(t => {
        const lbl = labelMap[t.status] || { t: t.status, c: 'bg-slate-100 text-slate-800' };
        return `
            <div class="p-6 bg-white border border-slate-200 rounded-xl mb-3 shadow-sm hover:shadow transition">
                <div class="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                    <h4 class="font-black text-slate-800 text-lg">${admEscape(t.inverter_model) || 'Servis Talebi'} <span class="text-xs text-slate-400 font-normal tracking-widest block mt-1">${admEscape(t.tracking_code)} · ${new Date(t.created_at).toLocaleDateString('tr-TR')}</span></h4>
                    <span class="${lbl.c} px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">${lbl.t}</span>
                </div>
                <p class="text-sm bg-slate-50 border border-slate-100 p-3 rounded-lg text-slate-600 mb-2 font-medium whitespace-pre-line">${admEscape(t.problem_desc)}</p>
                ${t.admin_response ? `
                <div class="mt-4 bg-emerald-50 p-4 rounded-lg border border-emerald-200">
                    <p class="text-sm text-emerald-900 leading-relaxed"><strong>🔧 Merkez Yanıtı:</strong> ${admEscape(t.admin_response)}</p>
                </div>` : '<p class="text-xs text-slate-400 mt-2 italic flex items-center gap-1"><span>⏳</span> Henüz teknisyen yanıtı bekleniyor...</p>'}
            </div>
        `;
    }).join('');
}
