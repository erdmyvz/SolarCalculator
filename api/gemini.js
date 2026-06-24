// Dosya Yolu: api/gemini.js
// Bu kod Vercel sunucusunda çalışır ve Google'dan dinamik olarak en uygun modeli seçer.

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' });
    }

    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt gönderilmedi.' });
    }

    try {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

        // 1. ADIM: Tahmin etmek yerine, Google'a "Benim hesabımda hangi modeller açık?" diye soruyoruz.
        const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        const modelsData = await modelsRes.json();

        if (!modelsRes.ok) {
            throw new Error("Google Modelleri listelenemedi: " + (modelsData.error?.message || "Bilinmeyen hata"));
        }

        // 2. ADIM: Dönen listeden metin üretmeyi (generateContent) destekleyen modelleri filtrele
        const availableModels = modelsData.models || [];
        const validModels = availableModels.filter(m => 
            m.supportedGenerationMethods?.includes('generateContent') && 
            m.name.includes('gemini')
        );

        if (validModels.length === 0) {
             throw new Error("Hesabınızda metin üretimi destekleyen hiçbir aktif Gemini modeli bulunamadı.");
        }

        // 3. ADIM: Hızlı olan 'flash' modelini önceliklendir, yoksa 'pro' modelini al, o da yoksa listedeki ilk modeli al.
        const flashModel = validModels.find(m => m.name.includes('flash'));
        const proModel = validModels.find(m => m.name.includes('pro'));
        const selectedModel = flashModel || proModel || validModels[0];
        
        const targetModelName = selectedModel.name; // Örn: "models/gemini-1.5-flash" otomatik olarak buraya atanır.

        // 4. ADIM: Seçilen kusursuz ve çalışan model ismiyle asıl isteğimizi atıyoruz
        const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${targetModelName}:generateContent?key=${GEMINI_API_KEY}`;
        
        const response = await fetch(generateUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || "Metin üretilemedi.");
        }

        const aiResponseText = data.candidates[0].content.parts[0].text;
        
        res.status(200).json({ result: aiResponseText });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}