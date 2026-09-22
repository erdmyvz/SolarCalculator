-- ============================================================================
--  leads-test-ayrimi.sql
--
--  ratings'teki ayrımın leads karşılığı. Aynı ilke, DAR kapsam.
--
--  ⚠️ NEDEN HER YERE UYGULANMIYOR
--  leads operasyonun kendisi: atama, CRM, teklif, komisyon, danışman
--  ekranları hep oradan besleniyor. Bayrağı bu akışlara da uygularsam test
--  kaydı sistemde görünmez olur — yani SİSTEMİ TEST EDEMEZ hâle geliriz.
--  Bayrak yalnız ZİYARETÇİNİN GÖRDÜĞÜ sayıyı süzüyor; operasyon test
--  kaydını eskisi gibi görmeye devam ediyor. Yönetici ekranları da öyle:
--  oradaki sayı operasyonel gerçeği göstermeli.
--
--  ZİYARETÇİ YÜZEYİ TEK YER — ama sandığımdan önemli
--  firma_puan_ozeti.tamamlanan_is. Canlıdaki leads toplayan üç sorgudan
--  ziyaretçiye açık olan yalnız bu. Ve en_yakin_firmalar() bu fonksiyonu
--  lateral join ile çağırıp tamamlanan_is'i ORDER BY'da kullanıyor:
--
--      order by yakinlik, o.ortalama desc, o.tamamlanan_is desc, c.name
--
--  Yani test kaydı yalnız yanlış bir sayı GÖSTERMİYOR; gerçek bir
--  yatırımcıya hangi firmanın önce çıkacağını DEĞİŞTİREBİLİYOR. Tek yeri
--  düzeltmek, lead_firma_esle dâhil bütün alt akışı düzeltiyor.
--
--  ⚠️ İKİ KAPI, ÇÜNKÜ TEST İKİ YOLDAN GİRİYOR
--  Ziyaretçi formu ANONİM çalışır: submit_lead çağrıldığında investor_id
--  NULL'dur, hesap yoktur. Yalnız investor_id'ye baksaydım, sizin ziyaretçi
--  formundan yaptığınız deneme — yani en sık yapacağınız test —
--  işaretlenmezdi. Bu yüzden e-posta da kontrol ediliyor: leads.email test
--  hesaplarından birininkiyse kayıt testtir.
-- ============================================================================


-- ============================================ 1) BAYRAK
alter table public.leads add column if not exists test_mi boolean not null default false;

-- Kesme noktası: bugüne kadarki her kayıt test (hafızadaki tespit:
-- "sisteme kayıtlı tüm hesaplar benim ve test amaçlıdır", 18.09.2026).
update public.leads set test_mi = true where created_at <= now();


-- ============================================ 2) OTOMATİK İŞARETLEME
-- INSERT ve UPDATE: claim_my_leads() anonim kaydı sonradan bir hesaba
-- bağlıyor; yalnız INSERT'e bağlasaydım o kayıt bayraksız kalırdı.
create or replace function public.leads_test_isaretle()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if (new.investor_id is not null
        and exists (select 1 from gizli.test_hesaplari t
                     where t.user_id = new.investor_id))
       or (nullif(trim(coalesce(new.email, '')), '') is not null
        and exists (select 1 from gizli.test_hesaplari t
                     where lower(t.eposta) = lower(trim(new.email))))
    then
        new.test_mi := true;      -- yalnız TRUE'ya çeker, hiçbir zaman FALSE'a
    end if;
    return new;
end $$;

drop trigger if exists leads_test_trg on public.leads;
create trigger leads_test_trg before insert or update on public.leads
    for each row execute function public.leads_test_isaretle();


-- ============================================ 3) TEK ZİYARETÇİ YÜZEYİ
create or replace function public.firma_puan_ozeti(p_company_id uuid)
returns table (ortalama numeric, adet int, tamamlanan_is int)
language sql stable security definer set search_path = public as $$
    select
        (select round(avg(r.puan)::numeric, 1) from public.ratings r
          where r.hedef_tip = 'company' and r.hedef_id = p_company_id and r.test_mi = false),
        (select count(*)::int from public.ratings r
          where r.hedef_tip = 'company' and r.hedef_id = p_company_id and r.test_mi = false),
        (select count(*)::int from public.leads l
          where l.company_id = p_company_id and l.status = 'tamamlandi'
            and l.test_mi = false);
$$;

grant execute on function public.firma_puan_ozeti(uuid) to anon, authenticated;


-- ============================================ 4) ELLE İŞARETLEME (YÖNETİCİ)
-- ⚠️ Otomatik kapılar her şeyi yakalamaz: ziyaretçi formunu test
-- hesaplarından BİRİNİN OLMADIĞI bir e-postayla denerseniz (gerçekçi bir
-- deneme için makul), kayıt gerçek sayılır. O zaman bu gerekiyor.
-- Elinizde takip kodu var; uuid aramanıza gerek kalmasın diye kodla çalışıyor.
create or replace function public.lead_test_isaretle(p_tracking_code text, p_test boolean default true)
returns text
language plpgsql security definer set search_path = public as $$
declare v_kod text;
begin
    if not public.is_admin() then raise exception 'Yetkiniz yok'; end if;

    update public.leads set test_mi = p_test, updated_at = now()
     where tracking_code = p_tracking_code
    returning tracking_code into v_kod;

    if v_kod is null then raise exception 'Kayıt bulunamadı: %', p_tracking_code; end if;

    -- ⚠️ Tetikleyici test hesabını yeniden TRUE'ya çeker. p_test=false
    -- istiyorsanız hesabı gizli.test_hesaplari'ndan çıkarmanız gerekir;
    -- doğrunun kaynağı satır değil hesap. Sonucu okuyup söylüyoruz ki
    -- "yaptım sandım, olmadı" durumu oluşmasın.
    select case when test_mi then 'test' else 'gerçek' end into v_kod
      from public.leads where tracking_code = p_tracking_code;

    return p_tracking_code || ' → ' || v_kod;
end $$;

grant execute on function public.lead_test_isaretle(text, boolean) to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  ⚠️ DENEME AYRI DOSYADA: leads-test-ayrimi-deneme.sql
--  (Supabase betiği tek işlem çalıştırır; sondaki rollback kurulumu da alır.)
--
--  DOKUNULMAYANLAR — bilerek:
--    · atama / CRM / teklif / komisyon / danışman akışları
--    · yönetici harita ve liste sayıları (firma-konum-admin.sql)
--    · platform_deneyimi'nin leads join'i (sayı değil, isim için)
-- ============================================================================
