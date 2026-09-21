-- ============================================================================
--  deneme-suresi-7-gun.sql
--
--  Deneme süresi 30 gün → 7 gün.
--
--  ⚠️ MEVCUT HESAPLARA DOKUNULMUYOR. Bugüne kadar kaydolan herkes 30 günlük
--  süreyle kaydoldu; sonradan kısaltmak, verilmiş sözü geri almaktır. Yalnız
--  KOLON VARSAYILANI değişiyor — bundan sonraki kayıtlar 7 gün alır.
--
--  Kayıt kodu (auth.js) sub_ends_at'a hiç yazmıyor, kolon varsayılanına
--  güveniyor. Bu yüzden tek doğru yer burası; üç tabloda birden değişmezse
--  roller arasında sessiz bir tutarsızlık kalırdı.
--
--  Arayüz ve sözleşme tarafı aynı commit'te güncellendi (30 yer):
--  üç rol sayfası, ana sayfa, yönetim paneli ve Abonelik Sözleşmesi §5.
-- ============================================================================

alter table public.companies   alter column sub_ends_at set default (now() + interval '7 days');
alter table public.consultants alter column sub_ends_at set default (now() + interval '7 days');
alter table public.suppliers   alter column sub_ends_at set default (now() + interval '7 days');


-- Kontrol: varsayılanlar değişti mi, mevcut kayıtlar yerinde mi?
select c.relname as tablo,
       pg_get_expr(d.adbin, d.adrelid) as yeni_varsayilan
  from pg_attrdef d
  join pg_class c on c.oid = d.adrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum
 where n.nspname = 'public' and a.attname = 'sub_ends_at'
 order by c.relname;

select 'firma'    as rol, name        as ad, sub_status, sub_ends_at::date from public.companies
union all
select 'danışman', full_name, sub_status, sub_ends_at::date from public.consultants
union all
select 'tedarikçi', company_name, sub_status, sub_ends_at::date from public.suppliers
order by 1, 2;

-- ============================================================================
--  ⚠️ SÖZLEŞMEDE DURAN VE KODDA OLMAYAN MADDE
--  Abonelik Sözleşmesi §5 şunu söylüyor:
--      "Süre sonunda ödeme yapılmaması hâlinde hesap erişimi kısıtlanır."
--  Kodda böyle bir kısıtlama YOK — süre bitince panel açık kalmaya devam
--  ediyor (dün yalnız GÖRÜNÜRLÜK eklendi, erişim kapatılmadı).
--
--  Deneme 30 günden 7 güne inince bu fark çok daha erken ve çok daha sık
--  görünür hâle gelir. İki seçenekten biri seçilmeli:
--      a) kısıtlamayı gerçekten uygulamak, ya da
--      b) sözleşme maddesini gerçeğe uydurmak.
--  Üçüncü bir seçenek yok: sözleşmenin yazdığı ile sistemin yaptığı
--  ayrışmaya devam edemez.
-- ============================================================================
