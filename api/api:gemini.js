// Dosya Yolu: api/gemini.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Sadece POST.' });
    const { prompt } = req.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    // 3 defaya kadar yeniden dene
    for (let i = 0; i < 3; i++) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            const data = await response.json();

            // Eğer "High Demand" hatası alırsak bekle ve tekrar dene
            if (response.status === 429 || (data.error && data.error.message.includes("high demand"))) {
                await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // Katlanarak bekle
                continue; 
            }

            if (!response.ok) throw new Error(data.error?.message || "Bağlantı hatası");

            return res.status(200).json({ result: data.candidates[0].content.parts[0].text });

        } catch (error) {
            if (i === 2) return res.status(500).json({ error: error.message });
        }
    }
}