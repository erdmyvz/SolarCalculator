-- ============================================================================
--  olcum-test-ayrimi.sql
--
--  NEDEN
--  Danışman ücretlendirmesi kararı "veri biriksin, 2-3 ay sonra bakalım"
--  diye ertelendi. Doğru karar — ama biriken verinin BAŞLANGICI bugünkü test
--  kayıtları. Üç ay sonra ekranda "danışman 2 iş getirdi, ortalama ₺288.524"
--  yazacak ve bunların hiçbiri gerçek müşteri olmayacak.
--
--  Bu, bütün oturum boyunca kapattığım kusurun en sinsi hâli olurdu: ekran
--  doğru rakamı gösterir, rakam gerçeği göstermez. Üstelik bu kez yanlış
--  yönlendirdiği şey bir FİYAT KARARI olurdu.
--
--  ÇÖZÜM — SİLMİYORUZ, AYIRIYORUZ
--  Test kayıtları duruyor (hafızadaki karar: test verisi silinmeyecek) ama
--  ortalamalara ve toplamlara girmiyor. Boru hattının çalıştığının kanıtı
--  kayboluyor değil; yalnız gelir tahminine karışmıyor.
--
--  ⚠️ KESME NOKTASI BU DOSYANIN ÇALIŞTIĞI AN. Hafızadaki tespit net:
--  "sisteme kayıtlı tüm hesaplar benim ve test amaçlıdır". Yani bugüne kadarki
--  HER kayıt testtir; bundan sonrakiler varsayılan olarak gerçektir. Tek
--  cümlelik, tartışmasız bir sınır — kayıt kayıt karar vermeye çalışmak
--  keyfîlik olurdu.
--
--  Yanlış işaretlenen olursa geri almak tek satır:
--      update public.commissions set test_mi = false where id = '…';
-- ============================================================================


-- ============================================ 1) BAYRAK
alter table public.commissions         add column if not exists test_mi boolean not null default false;
alter table public.consultant_credits  add column if not exists test_mi boolean not null default false;

-- Bugüne kadarki her şey test.
update public.commissions        set test_mi = true where created_at <= now();
update public.consultant_credits set test_mi = true where created_at <= now();


-- ============================================ 2) ÖZETLER TESTİ DIŞLASIN
create or replace function public.komisyon_ozeti()
returns table (durum text, adet bigint, toplam_is_try numeric, toplam_komisyon_try numeric)
language sql stable security definer set search_path = public as $$
    select c.durum, count(*)::bigint,
           coalesce(sum(c.tutar_try), 0),
           coalesce(sum(c.komisyon_try), 0)
      from public.commissions c
     where public.is_admin() and c.test_mi = false
     group by c.durum
     order by c.durum;
$$;

create or replace function public.danisman_karsilastirma()
returns table (kaynak text, adet bigint, tamamlanan bigint, ortalama_is_try numeric)
language sql stable security definer set search_path = public as $$
    select case when public.lead_danismani(c.lead_id) is not null
                then 'danisman' else 'dogrudan' end,
           count(*)::bigint,
           count(*) filter (where c.durum = 'hakedildi')::bigint,
           round(avg(c.tutar_try) filter (where c.tutar_try is not null), 0)
      from public.commissions c
     where public.is_admin() and c.durum <> 'iptal' and c.test_mi = false
     group by 1
     order by 1;
$$;

drop function if exists public.danisman_deger_ozeti();

create or replace function public.danisman_deger_ozeti()
returns table (
    consultant_id uuid, danisman text, eposta text,
    onay text, abonelik text, abonelik_bitis timestamptz,
    getirdigi int, baglanan int, tamamlanan int,
    is_hacmi_try numeric, komisyon_try numeric, pay_try numeric,
    degerlendirme int, teklifsiz_gorus int, ort_cevap_saat numeric,
    oneri_sayisi int, oneri_tutan int
)
language sql stable security definer set search_path = public as $$
    select co.id, co.full_name, co.email,
           case when coalesce(co.banned, false) then 'askida'
                else coalesce(co.status, 'draft') end,
           co.sub_status, co.sub_ends_at,
           -- ⚠️ "getirdigi" leads'ten sayılıyor ve orada test bayrağı yok.
           -- Kredi satırı olmayan (firmaya bağlanmamış) kayıtlar da sayılmalı
           -- ki dönüşüm oranı doğru çıksın; bu yüzden burada test ayrımı
           -- yapılmıyor ve ekran bunu açıkça söylüyor.
           (select count(*)::int from public.consultant_clients cc
             join public.leads l on l.id = cc.lead_id
            where cc.consultant_id = co.id),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'yonlendirme'
              and k.durum <> 'iptal' and k.test_mi = false),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'yonlendirme'
              and k.durum = 'hakedildi' and k.test_mi = false),
           (select coalesce(sum(k.is_tutari_try), 0) from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'yonlendirme'
              and k.durum <> 'iptal' and k.test_mi = false),
           (select coalesce(sum(k.komisyon_try), 0) from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'yonlendirme'
              and k.durum <> 'iptal' and k.test_mi = false),
           (select coalesce(sum(k.pay_try), 0) from public.consultant_credits k
            where k.consultant_id = co.id and k.durum <> 'iptal' and k.test_mi = false),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'degerlendirme'
              and k.durum <> 'iptal' and k.test_mi = false and coalesce(k.teklif_sayisi,0) > 0),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'degerlendirme'
              and k.durum <> 'iptal' and k.test_mi = false and coalesce(k.teklif_sayisi,0) = 0),
           (select round(avg(k.cevap_saat), 1) from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'degerlendirme'
              and k.cevap_saat is not null and k.test_mi = false and coalesce(k.teklif_sayisi,0) > 0),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.oneri_tuttu is not null and k.test_mi = false),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.oneri_tuttu = true and k.test_mi = false)
      from public.consultants co
     where public.is_admin()
     order by co.full_name;
$$;

grant execute on function public.komisyon_ozeti()         to authenticated;
grant execute on function public.danisman_karsilastirma() to authenticated;
grant execute on function public.danisman_deger_ozeti()   to authenticated;


-- ============================================ 3) KARARIN KENDİSİ DE ÖLÇÜLSÜN
-- ⚠️ "Veri biriksin" demek, bir gün dönüp bakmayı gerektirir. Dönüp bakmayı
-- hatırlatacak tek şey rakamın kendisidir: karar için ne gerekiyor, şu an
-- nerede? Bu fonksiyon o iki satırı üretiyor, ekran her açılışta gösteriyor.
create or replace function public.danisman_karar_olcegi()
returns table (
    gercek_yonlendirme int,
    gercek_degerlendirme int,
    aktif_danisman int,
    ilk_gercek_kayit timestamptz,
    gecen_gun int
)
language sql stable security definer set search_path = public as $$
    select (select count(*)::int from public.consultant_credits
             where tur = 'yonlendirme' and durum <> 'iptal' and test_mi = false),
           (select count(*)::int from public.consultant_credits
             where tur = 'degerlendirme' and durum <> 'iptal' and test_mi = false),
           (select count(*)::int from public.consultants
             where status = 'approved' and coalesce(banned,false) = false),
           (select min(created_at) from public.consultant_credits where test_mi = false),
           (select coalesce(extract(day from now()
                 - min(created_at))::int, 0)
              from public.consultant_credits where test_mi = false)
     where public.is_admin();
$$;

grant execute on function public.danisman_karar_olcegi() to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA (admin, konsolda)
--      await supabaseClient.rpc('danisman_karar_olcegi')
--      → hepsi 0 / null olmalı: gerçek veri henüz yok, doğru olan bu.
--
--      await supabaseClient.rpc('komisyon_ozeti')
--      → 0 satır. Platform boş çalışıyor demek DEĞİL; bugüne kadarki her
--        kaydın test olduğu demek. Ekran bunu böyle yazıyor.
-- ============================================================================
