/* ============================================================================
   12. Satış Asistanı (Copilot) ve dinamik itiraz yönetimi
   Bölünmüş modül dosyası. index.html'de core.js'ten sonra, ORİJİNAL SIRAYLA
   yüklenmelidir. Klasik script olduğu için tüm fonksiyonlar küresel kalır.
   ============================================================================ */

// ============================================================================
// 12. SATIŞ ASİSTANI (COPILOT) VE DİNAMİK İTİRAZ YÖNETİMİ
// ============================================================================
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

document.querySelectorAll('input[name="companyType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const isKurulum = e.target.value === 'kurulum';
        document.getElementById('setupKurulumPrices')?.classList.toggle('hidden', !isKurulum);
        document.getElementById('setupDanismanlikPrices')?.classList.toggle('hidden', isKurulum);
    });
});

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
        btn.innerHTML = `💬 "${objection}"`; // Escaped elsewhere if dynamic
        
        btn.addEventListener('click', () => {
            const finalRes = response
                .replace('{totalPrice}', ((10 * kwPrice) + (5 * batPrice)).toLocaleString('tr-TR'))
                .replace('{consultPrice}', consultPrice.toLocaleString('tr-TR'));
            
            document.getElementById('scriptDisplayArea').innerHTML = `<p class="text-white text-3xl leading-snug font-medium animate-fade-in">${finalRes}</p>`;
        });
        container.appendChild(btn);
    }
});

document.getElementById('btnEndCall')?.addEventListener('click', () => {
    document.getElementById('activeCallArea').classList.add('hidden');
    document.getElementById('salesSetupArea').classList.remove('hidden');
    document.getElementById('scriptDisplayArea').innerHTML = `<p class="text-slate-600 text-lg font-medium italic animate-pulse">Sol taraftan müşterinin söylediği itirazı seçtiğinizde, okumanız gereken psikolojik yanıt burada belirecektir.</p>`;
});
