// Dosya Yolu: api/gemini.js
// Bu kod sadece Vercel sunucusunda çalışır, kullanıcılar göremez.

export default async function handler(req, res) {
    // Sadece POST isteklerini kabul et
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' });
    }

    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt gönderilmedi.' });
    }

    try {
        // Şifreyi Vercel'in güvenli kasasından (Environment Variables) çekiyoruz
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

        // DİKKAT: Model ismi Google'ın en güncel standartlarına göre 'gemini-1.5-flash-latest' olarak düzeltildi.
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
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
            throw new Error(data.error?.message || "API ile bağlantı kurulamadı.");
        }

        const aiResponseText = data.candidates[0].content.parts[0].text;
        
        // Sonucu güvenli bir şekilde ön yüze (app.js) geri gönder
        res.status(200).json({ result: aiResponseText });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}