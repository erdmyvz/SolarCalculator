/* ============================================================================
   settings.js — REFERANS AYAR YÜKLEYİCİ
   window.EPC_SETTINGS'i önce varsayılanlarla senkron kurar, sonra DB'den
   (app_settings) güncel değerleri çekip üzerine yazar. Hesaplayıcı/teklif/batarya
   modülleri değerleri HESAP ANINDA buradan okur (varsayılana düşüş korumalı).
   index.html'de core.js'ten HEMEN SONRA yüklenmelidir.
   ============================================================================ */
window.EPC_SETTINGS = {
    solarYield: 1500,
    roofM2PerKwp: 5.5,
    kwpPerPanel: 0.55,
    pricePerKwp: 30000,
    co2PerKwh: 0.45,
    tariff: 2.5,
    batteryDod: 0.9,
    inverterEff: 0.95,
    batteryModule: 5,
    inverterSurge: 1.3
};

(async function loadSettings() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
        const { data } = await supabaseClient.from('app_settings').select('key, value');
        (data || []).forEach(r => {
            const v = Number(r.value);
            if (!isNaN(v)) window.EPC_SETTINGS[r.key] = v;
        });
    } catch (e) { /* DB yoksa/erişilemezse varsayılanlar kullanılır */ }
})();


/* --- Genel aşama etiketleri (admin düzenlenebilir isim + açıklama) --- */
window.EPC_STAGES = {}; // { key: { label, description } }

// Aşama görünen adını döndürür: önce DB (admin), sonra koddaki varsayılan, sonra anahtar.
window.stageLabel = function (k) {
    return (window.EPC_STAGES[k] && window.EPC_STAGES[k].label)
        || (typeof crmStatusLabels !== 'undefined' && crmStatusLabels[k] && crmStatusLabels[k].text)
        || k;
};

(async function loadStages() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
        const { data } = await supabaseClient.from('stage_labels').select('key, label, description');
        (data || []).forEach(r => { window.EPC_STAGES[r.key] = { label: r.label, description: r.description }; });
    } catch (e) { /* tablo yoksa koddaki varsayılanlar kullanılır */ }
})();
