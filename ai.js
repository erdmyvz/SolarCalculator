/* ============================================================================
   6. Yapay Zeka (AI) entegrasyonu ve prompt motoru
   Bölünmüş modül dosyası. index.html'de core.js'ten sonra, ORİJİNAL SIRAYLA
   yüklenmelidir. Klasik script olduğu için tüm fonksiyonlar küresel kalır.
   ============================================================================ */

// ============================================================================
// 6. YAPAY ZEKA (AI) ENTEGRASYONU VE PROMPT MOTORU
// ============================================================================

function generateAIPrompt(companyData) {
    return `Sen, Michael Gerber'in "E-Myth" prensiplerini ve Donald Miller'ın "StoryBrand" çerçevesini kusursuz bir şekilde benimsemiş, dünya çapında üst düzey bir "Kurumsal Dönüşüm ve İşletme Danışmanı"sın. Amacın, şirketlerin sistem kurmasına, kârlılığını artırmasına ve kurucuya bağımlı olmaktan kurtulmasına yardımcı olmaktır.

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
3. Çıktını şık bir HTML formatında, kalın yazılar (<strong>), başlıklar (<h3>), listeler (<ul>) ve emojiler kullanarak ver ki doğrudan web sitesindeki bir <div> içine basabilelim. Markdown kullanma.
4. Çıktının sonuna mutlaka firmanın "Hero (Kahraman)" değil, müşterinin "Guide (Rehberi)" olduğunu hatırlatan vurucu bir motivasyon cümlesi ekle.`;
}

// GEMINI API SUNUCU BAĞLANTISI
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
    btn.textContent = "Yapay Zeka Analiz Ediyor..."; btn.disabled = true; btn.classList.add('opacity-70', 'cursor-not-allowed');
    
    const resultArea = document.getElementById('cmMarketing');
    if (resultArea) {
        resultArea.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12">
                <div class="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p class="text-emerald-600 font-bold animate-pulse">Gemini firmanızı analiz ediyor, lütfen bekleyin...</p>
            </div>`;
    }

    try {
        const response = await fetch('/api/gemini', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: generateAIPrompt(companyData) })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Sunucu bağlantı hatası.");

        if (resultArea) {
            resultArea.innerHTML = `
                <div class="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                    <h4 class="font-black text-emerald-700 text-lg">✨ YZ Kurumsal Danışman Reçetesi</h4>
                </div>
                <div class="text-sm text-slate-700 space-y-4 pr-2 leading-relaxed">
                    ${data.result}
                </div>`;
        }
    } catch (error) {
        console.error("AI Hatası:", error);
        if (resultArea) resultArea.innerHTML = `<div class="text-red-600 font-bold p-4 bg-red-50 border border-red-200 rounded-lg">⚠️ Hata oluştu: ${error.message}</div>`;
    } finally {
        btn.textContent = "✨ Yapay Zeka Kurumsal Analiz Oluştur";
        btn.classList.remove('opacity-70', 'cursor-not-allowed'); btn.disabled = false;
    }
});
