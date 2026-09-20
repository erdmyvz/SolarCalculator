-- ============================================================================
--  lead-kaynak-danisman.sql
--
--  NE BULUNDU — DANIŞMAN AKTARIMI HİÇ ÇALIŞMAMIŞ
--  Danışman onaylandıktan sonra gerçek arayüzden bir danışan aktarılmak
--  istendi. Sonuç:
--
--      Danışan kaydedildi, CRM'e aktarılamadı.
--      new row for relation "leads" violates check constraint
--      "leads_source_check"
--
--  Kısıt:
--      CHECK (source = ANY (ARRAY['website', 'iframe', 'manual']))
--
--  danisan_crm_e_aktar() ise source'a 'consultant' yazıyor. Yani fonksiyon
--  HER ÇAĞRILDIĞINDA patlıyordu.
--
--  ⚠️ BU YENİ BİR HATA DEĞİL. 'consultant' yazımı dört ayrı SQL dosyasında
--  var (danisman-rolu, danisman-crm-koprusu, eksik-fonksiyonlar,
--  danisman-onay-kapisi) — fonksiyonun HER sürümünde. Kısıt hiçbirinde
--  güncellenmemiş. Danışman yönlendirmesi, kurulduğu günden beri tek bir
--  kez bile başarılı olmamış.
--
--  NEDEN GÖRÜLMEDİ
--  Hata yalnız danışan düzenleme kutusunun altındaki küçük satırda çıkıyor:
--  "Danışan kaydedildi, CRM'e aktarılamadı." Danışan gerçekten kaydediliyor,
--  panel sayaçları artıyor, ekranın geri kalanı normal görünüyor. Kaybolan
--  tek şey işin ta kendisiydi.
--
--  ⚠️ Bu, ölçüm kurarken "0 aktarım" rakamını görüp "demek kimse denememiş"
--  diye yorumlamamam gerektiğini gösteriyor. Sıfır iki şey demek olabilir:
--  kimse denemedi ya da DENEYEN HERKES BAŞARISIZ OLDU. İkisi ayırt edilmeden
--  ücretlendirme kararı verilseydi, danışman "iş getirmiyor" diye görünecekti
--  — oysa getiremiyordu.
-- ============================================================================

alter table public.leads drop constraint if exists leads_source_check;

alter table public.leads add constraint leads_source_check
    check (source = any (array['website', 'iframe', 'manual', 'consultant']));

-- Kontrol: kısıt artık dördünü de kabul ediyor mu?
select pg_get_constraintdef(con.oid) as yeni_tanim
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'leads' and con.conname = 'leads_source_check';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA
--  Danışman hesabından danışanı açıp il seçerek kaydedin. Beklenen:
--      "✓ N kurulumcu firma teklif vermeye davet edildi · EPC-…"
--  Hâlâ hata veriyorsa metni okuyun — bu kısıt artık sebep değil.
-- ============================================================================
