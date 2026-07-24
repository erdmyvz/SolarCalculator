/* ============================================================================
   legal.js — YASAL METİNLER (KVKK · Gizlilik · Çerez · Şartlar · Sözleşme)
   site_content tablosunu yeniden kullanır (yeni tablo gerekmez).
   Metinler panelden düzenlenir; avukattan gelen nihai metin yapıştırılıp kaydedilir.
   index.html'de about.js'ten SONRA yüklenir.
   ============================================================================ */
(function () {
    // [anahtar, başlık, hash]
    const LEGAL_DOCS = [
        ['legal_kvkk',         'KVKK Aydınlatma Metni',                 'kvkk'],
        ['legal_privacy',      'Gizlilik Politikası',                   'gizlilik'],
        ['legal_cookies',      'Çerez Politikası',                      'cerez'],
        ['legal_terms',        'Kullanım Şartları',                     'kullanim-sartlari'],
        ['legal_subscription', 'Abonelik ve Mesafeli Satış Sözleşmesi', 'abonelik-sozlesmesi'],
        ['legal_consent',      'Ticari İleti Açık Rıza Metni',          'acik-riza']
    ];
    window.LEGAL_DOCS = LEGAL_DOCS;

    // ---------------------------------------------------------------- taslaklar
    // ⚠️ Bunlar TASLAKTIR. Yayına almadan önce hukuk danışmanınıza inceletin.
    // Köşeli parantezli alanları şirket bilgilerinizle doldurun.
    const LEGAL_DEFAULTS = {
        legal_kvkk: `## Veri Sorumlusu
Bu aydınlatma metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") 10. maddesi uyarınca hazırlanmıştır.

Veri Sorumlusu: [ŞİRKET ÜNVANI]
Adres: [ADRES]
MERSİS No: [MERSİS NO]
E-posta: [İLETİŞİM E-POSTASI]

## İşlenen Kişisel Veriler
Platform üzerinden aşağıdaki veriler işlenebilmektedir:
- Kimlik ve iletişim verileri: ad, soyad, telefon, e-posta
- Talep verileri: adres/konum, elektrik tüketimi ve fatura bilgisi, çatı ve tesis bilgileri
- Hesap verileri: kullanıcı rolü, firma bilgileri, oturum kayıtları
- İşlem verileri: oluşturulan teklifler, süreç ve servis kayıtları

## İşleme Amaçları
- Güneş enerjisi yatırım talebinizin değerlendirilmesi ve size uygun kurulumcu firma/danışman ile eşleştirilmesi
- Keşif, teklif, kurulum ve satış sonrası bakım süreçlerinin yürütülmesi
- Platform hizmetlerinin sunulması, hesap yönetimi ve abonelik işlemleri
- Yasal yükümlülüklerin yerine getirilmesi

## Hukuki Sebepler
Kişisel verileriniz KVKK m.5 kapsamında; sözleşmenin kurulması ve ifası, veri sorumlusunun meşru menfaati, hukuki yükümlülüğün yerine getirilmesi ve gerektiğinde açık rızanız hukuki sebeplerine dayanılarak işlenir.

## Aktarım
Talebinizin karşılanabilmesi amacıyla verileriniz, platformda kayıtlı ve tarafınızca seçilen/eşleştirilen kurulumcu firmalar ile bağımsız danışmanlara aktarılabilir. Ayrıca barındırma ve altyapı hizmeti aldığımız tedarikçilerimize, yasal olarak yetkili kamu kurumlarına aktarım yapılabilir.

## Toplama Yöntemi
Veriler; web sitesi formları, hesaplama araçları, hesap oluşturma ve platform içi işlemler aracılığıyla elektronik ortamda toplanır.

## Haklarınız (KVKK m.11)
Kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik/yanlış işlenmişse düzeltilmesini isteme, silinmesini veya yok edilmesini isteme, işlemenin sınırlandırılmasını talep etme, otomatik sistemlerle analiz sonucu aleyhinize bir sonuç doğmasına itiraz etme ve zarara uğramanız hâlinde giderilmesini talep etme haklarına sahipsiniz.

Taleplerinizi [İLETİŞİM E-POSTASI] adresine iletebilirsiniz.

[Bu metin taslaktır; yayın öncesi hukuk danışmanınıza inceletiniz.]`,

        legal_privacy: `## Genel
Bu Gizlilik Politikası, platformu kullanırken verilerinizin nasıl toplandığını, kullanıldığını ve korunduğunu açıklar.

## Topladığımız Bilgiler
- Sizin doğrudan verdiğiniz bilgiler: ad, iletişim bilgileri, talep detayları, hesap bilgileri
- Kullanım sırasında oluşan bilgiler: oturum kayıtları, işlem geçmişi, hesaplama girdileri

## Kullanım Amaçları
Bilgileriniz; hizmetin sunulması, taleplerinizin ilgili kurulumcu firma veya danışmana iletilmesi, hesabınızın yönetilmesi, güvenliğin sağlanması ve yasal yükümlülüklerin yerine getirilmesi amacıyla kullanılır.

## Paylaşım
Verileriniz pazarlama amacıyla üçüncü taraflara satılmaz. Talebinizin karşılanması için yalnızca ilgili kurulumcu firma/danışman ile ve altyapı hizmet sağlayıcılarımızla paylaşılır.

## Saklama Süresi
Veriler, işleme amacının gerektirdiği süre ve ilgili mevzuatta öngörülen zamanaşımı süreleri boyunca saklanır; sürenin sonunda silinir, yok edilir veya anonim hâle getirilir.

## Güvenlik
Veriler şifreli bağlantı üzerinden iletilir ve yetkilendirme kuralları ile korunur. Hesap şifrenizin gizliliğinden siz sorumlusunuz.

## Haklarınız
KVKK kapsamındaki haklarınız için KVKK Aydınlatma Metni'ne bakabilir, taleplerinizi [İLETİŞİM E-POSTASI] adresine iletebilirsiniz.

## Değişiklikler
Bu politika güncellenebilir. Güncel sürüm her zaman bu sayfada yayımlanır.

[Bu metin taslaktır; yayın öncesi hukuk danışmanınıza inceletiniz.]`,

        legal_cookies: `## Çerez Nedir?
Çerezler, ziyaret ettiğiniz web siteleri tarafından cihazınıza kaydedilen küçük metin dosyalarıdır.

## Kullandığımız Çerezler
- Zorunlu çerezler: Oturumunuzun açık kalması ve güvenlik için gereklidir. Bunlar olmadan platform çalışmaz.
- İşlevsel çerezler: Tercihlerinizin hatırlanmasını sağlar.

Reklam veya profilleme amaçlı üçüncü taraf takip çerezi kullanılmamaktadır.

## Çerezleri Yönetme
Tarayıcı ayarlarınızdan çerezleri silebilir veya engelleyebilirsiniz. Zorunlu çerezleri engellemeniz hâlinde oturum açma gibi temel işlevler çalışmayabilir.

[Bu metin taslaktır; yayın öncesi hukuk danışmanınıza inceletiniz.]`,

        legal_terms: `## Taraflar ve Konu
Bu Kullanım Şartları, [ŞİRKET ÜNVANI] tarafından işletilen platformun kullanımına ilişkin kuralları düzenler. Platformu kullanarak bu şartları kabul etmiş sayılırsınız.

## Hizmetin Kapsamı
Platform; yatırımcıları, kurulumcu firmaları ve bağımsız danışmanları buluşturan dijital bir aracı hizmet sunar. Kurulum, montaj ve satış sonrası hizmetler ilgili kurulumcu firma tarafından sağlanır.

## Sorumluluk Sınırı
Platform üzerindeki hesaplama araçları ve üretim/tasarruf öngörüleri **gösterge niteliğindedir**; kesin sonuç saha keşfi ve proje onayı ile belirlenir. Bu araçların sonuçlarına dayanılarak alınan kararlardan platform sorumlu tutulamaz.

Kurulumcu firma ile yatırımcı arasında kurulan sözleşmenin tarafı platform değildir. İşin ifası, garanti ve ayıptan doğan sorumluluk ilgili firmaya aittir.

## Kullanıcı Yükümlülükleri
- Verdiğiniz bilgilerin doğru ve güncel olmasından sorumlusunuz.
- Hesabınızı üçüncü kişilerle paylaşamazsınız.
- Platformu hukuka aykırı amaçlarla veya diğer kullanıcıların haklarını ihlal edecek şekilde kullanamazsınız.

## Fikri Mülkiyet
Platform üzerindeki tasarım, yazılım ve içerikler [ŞİRKET ÜNVANI]'na aittir; izinsiz kopyalanamaz veya çoğaltılamaz.

## Hesabın Askıya Alınması
Bu şartların ihlali hâlinde hesabınız uyarı yapılmaksızın askıya alınabilir veya kapatılabilir.

## Uygulanacak Hukuk
Bu şartlara Türkiye Cumhuriyeti hukuku uygulanır. Uyuşmazlıklarda [YETKİLİ MAHKEME/İCRA DAİRESİ] yetkilidir.

[Bu metin taslaktır; yayın öncesi hukuk danışmanınıza inceletiniz.]`,

        legal_subscription: `## 1. Taraflar
SATICI: [ŞİRKET ÜNVANI] · Adres: [ADRES] · MERSİS: [MERSİS NO] · E-posta: [İLETİŞİM E-POSTASI]
ALICI: Platforma kayıt olan kurulumcu firma veya bağımsız danışman.

## 2. Sözleşmenin Konusu
Bu sözleşme, ALICI'nın platform üzerinde sunulan yazılım hizmetine abone olmasına ilişkin karşılıklı hak ve yükümlülükleri düzenler.

## 3. Hizmetin Kapsamı
Abonelik; ALICI'nın rolüne göre CRM, teklif yönetimi, süreç takibi, profil yayını ve platformun ilan edilen diğer modüllerine erişim hakkı verir. Modüllerin kapsamı geliştirilebilir veya güncellenebilir.

## 4. Bedel ve Ödeme
Abonelik bedeli aylık **299 USD + KDV**'dir. Ödeme, fatura tarihindeki kur üzerinden **Türk Lirası** olarak tahsil edilir. Ödemeler banka havalesi/EFT ile yapılır.

## 5. Deneme Süresi
Yeni kayıtlarda **30 (otuz) gün ücretsiz deneme** süresi tanınır. Deneme süresi boyunca ücret alınmaz. Süre sonunda ödeme yapılmaması hâlinde hesap erişimi kısıtlanır.

## 6. Süre ve Yenileme
Abonelik aylık dönemler hâlindedir. Ödeme yapıldıkça dönem uzar. Taahhüt yoktur.

## 7. Cayma Hakkı
ALICI, mesafeli sözleşme hükümleri kapsamındaki cayma hakkını, hizmetin ifasına başlanmasından önce kullanabilir. Dijital hizmetin ifasına başlanması ve ALICI'nın onayı hâlinde cayma hakkı, ilgili mevzuat çerçevesinde sona erebilir. Deneme süresi bu hakkın kullanımını kolaylaştırmak amacıyla sunulmaktadır.

## 8. Fesih
Taraflar aboneliği dilediği zaman feshedebilir. Fesih hâlinde ödenmiş dönem sonuna kadar erişim devam eder; peşin ödenmiş dönem için kural olarak iade yapılmaz.

## 9. Veri ve Gizlilik
Tarafların veri işleme yükümlülükleri KVKK Aydınlatma Metni ve Gizlilik Politikası'na tabidir. ALICI, platforma yüklediği müşteri verilerinin hukuka uygun şekilde elde edildiğini taahhüt eder.

## 10. Sorumluluk
SATICI, hizmetin kesintisiz ve hatasız olacağını taahhüt etmez; makul çabayı gösterir. Dolaylı zararlardan sorumluluk, ilgili dönemde ödenen abonelik bedeli ile sınırlıdır.

## 11. Uyuşmazlık
Bu sözleşmeye Türkiye Cumhuriyeti hukuku uygulanır. Uyuşmazlıklarda [YETKİLİ MAHKEME/İCRA DAİRESİ] yetkilidir.

[Bu metin taslaktır; mesafeli satış mevzuatına uygunluğu için mutlaka hukuk danışmanınıza inceletiniz.]`,

        legal_consent: `## Ticari İleti ve Pazarlama İzni
Tarafıma; güneş enerjisi yatırımı, teklif ve kampanyalar hakkında bilgilendirme yapılması amacıyla telefon, SMS, e-posta ve benzeri elektronik iletişim kanalları üzerinden ticari elektronik ileti gönderilmesini kabul ediyorum.

Bu kapsamda iletişim bilgilerimin, talebimin karşılanabilmesi için platformda kayıtlı kurulumcu firmalar ve bağımsız danışmanlar ile paylaşılmasına açık rıza gösteriyorum.

Bu iznimi dilediğim zaman, gönderilen iletideki ayrılma (ret) hakkını kullanarak veya [İLETİŞİM E-POSTASI] adresine başvurarak geri alabileceğimi biliyorum. İznin geri alınması, geçmişe dönük işlemleri etkilemez.

[Bu metin taslaktır; yayın öncesi hukuk danışmanınıza inceletiniz.]`
    };
    window.LEGAL_DEFAULTS = LEGAL_DEFAULTS;

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function L(key) {
        const v = (window.EPC_CONTENT || {})[key];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
        return LEGAL_DEFAULTS[key] || '';
    }

    // "## Başlık", boş satır = paragraf, "- " = madde
    function fmt(text) {
        const out = [];
        String(text).split(/\r?\n/).forEach(line => {
            const t = line.trim();
            if (!t) { out.push(''); return; }
            if (t.startsWith('## ')) out.push(`<h3 class="text-lg font-black text-slate-800 mt-7 mb-2">${esc(t.slice(3))}</h3>`);
            else if (t.startsWith('- ')) out.push(`<li class="ml-5 list-disc text-slate-600 mb-1">${esc(t.slice(2))}</li>`);
            else if (t.startsWith('[') && t.endsWith(']')) out.push(`<p class="mt-6 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 font-bold">⚠️ ${esc(t.slice(1, -1))}</p>`);
            else out.push(`<p class="text-slate-600 leading-relaxed mb-3">${esc(t)}</p>`);
        });
        return out.join('\n');
    }

    let _activeDoc = LEGAL_DOCS[0][0];

    window.renderLegal = function () {
        const root = document.getElementById('legalRoot');
        if (!root) return;
        const doc = LEGAL_DOCS.find(d => d[0] === _activeDoc) || LEGAL_DOCS[0];
        root.innerHTML = `
            <button onclick="window.location.hash='#home'" class="text-slate-500 hover:text-indigo-600 font-bold mb-4">← Ana Sayfaya Dön</button>
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div class="lg:col-span-1">
                    <p class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Yasal Metinler</p>
                    <div class="space-y-1">
                        ${LEGAL_DOCS.map(d => `
                            <button onclick="openLegalPage('${d[0]}')" class="w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold transition ${d[0] === doc[0] ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}">${d[1]}</button>`).join('')}
                    </div>
                </div>
                <div class="lg:col-span-3">
                    <div class="bg-white border border-slate-200 rounded-2xl p-7 md:p-10 shadow-sm">
                        <h2 class="text-2xl md:text-3xl font-black text-slate-800 mb-1">${esc(doc[1])}</h2>
                        <p class="text-xs text-slate-400 mb-6">Son güncelleme: ${new Date().toLocaleDateString('tr-TR')}</p>
                        <div class="text-sm md:text-base">${fmt(L(doc[0]))}</div>
                    </div>
                </div>
            </div>`;
    };

    window.openLegalPage = function (key) {
        if (key) _activeDoc = key;
        if (typeof openPublicModule === 'function') openPublicModule('legalModule');
        renderLegal();
        const doc = LEGAL_DOCS.find(d => d[0] === _activeDoc);
        if (doc && window.location.hash !== '#' + doc[2]) window.location.hash = '#' + doc[2];
    };

    // Form içinden yeni sekmede aç (kullanıcı doldurduğu formu kaybetmesin)
    window.openLegalTab = function (hash) {
        window.open(window.location.pathname + '#' + hash, '_blank', 'noopener');
    };

    // hash → doküman eşlemesi (router bunu çağırır)
    window.legalOpenByHash = function (hash) {
        const clean = String(hash || '').replace('#', '');
        const doc = LEGAL_DOCS.find(d => d[2] === clean);
        if (!doc) return false;
        _activeDoc = doc[0];
        if (typeof openPublicModule === 'function') openPublicModule('legalModule');
        renderLegal();
        return true;
    };

    // içerik veritabanından gelince açık sayfayı tazele
    window.addEventListener('epc-content-loaded', () => {
        const m = document.getElementById('legalModule');
        if (m && !m.classList.contains('hidden')) renderLegal();
    });

    // ------------------------------------------------------ ADMİN DÜZENLEME
    window.renderLegalAdmin = function () {
        const host = document.getElementById('adminPaneContent') || document.getElementById('adminModule');
        if (!host || document.getElementById('legalAdminCard')) return;
        const card = document.createElement('div');
        card.id = 'legalAdminCard';
        card.className = 'bg-white border border-slate-200 rounded-xl p-5';
        card.innerHTML = `
            <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h3 class="font-black text-slate-800">⚖️ Yasal Metinler</h3>
                <button onclick="openLegalPage()" class="text-xs font-bold text-indigo-600 hover:underline">Sayfayı gör →</button>
            </div>
            <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                ⚠️ Buradaki metinler <b>taslaktır</b>. Yayına almadan önce hukuk danışmanınıza inceletin. Köşeli parantezli alanları ([ŞİRKET ÜNVANI] gibi) şirket bilgilerinizle doldurun.
                Biçimlendirme: <code>## </code> ile başlık, <code>- </code> ile madde, boş satır ile paragraf.
            </p>
            <div id="legalAdminFields" class="space-y-3"></div>
            <div class="flex items-center gap-3 mt-4">
                <button onclick="saveLegalContent()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-2.5 rounded-lg">Kaydet</button>
                <span id="legalSaveMsg" class="text-sm"></span>
            </div>`;
        host.appendChild(card);

        document.getElementById('legalAdminFields').innerHTML = LEGAL_DOCS.map(([key, title]) => `
            <details class="border border-slate-200 rounded-lg">
                <summary class="cursor-pointer px-4 py-3 font-bold text-slate-700 text-sm">${title}</summary>
                <div class="p-4 pt-0">
                    <textarea id="lfld_${key}" rows="12" class="w-full border border-slate-300 p-3 rounded-lg text-xs font-mono">${esc(L(key))}</textarea>
                </div>
            </details>`).join('');
    };

    window.saveLegalContent = async function () {
        const msg = document.getElementById('legalSaveMsg');
        if (!window.supabaseClient) return;
        const rows = LEGAL_DOCS.map(([key]) => {
            const el = document.getElementById('lfld_' + key);
            return { key, value: el ? el.value : '', updated_at: new Date().toISOString() };
        });
        if (msg) { msg.textContent = 'Kaydediliyor...'; msg.className = 'text-sm text-slate-400'; }
        try {
            const { error } = await supabaseClient.from('site_content').upsert(rows, { onConflict: 'key' });
            if (error) throw error;
            window.EPC_CONTENT = window.EPC_CONTENT || {};
            rows.forEach(r => { window.EPC_CONTENT[r.key] = r.value; });
            renderLegal();
            if (msg) { msg.textContent = '✅ Kaydedildi'; msg.className = 'text-sm text-emerald-600 font-bold'; }
        } catch (e) {
            if (msg) { msg.textContent = 'Kaydedilemedi: ' + (e.message || e); msg.className = 'text-sm text-red-500'; }
        }
    };
})();
