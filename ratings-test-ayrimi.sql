-- ============================================================================
--  ratings-test-ayrimi.sql
--
--  NEDEN
--  22.09.2026'da yayın öncesi kontrolde `public.ratings` içindeki iki test
--  satırının ZİYARETÇİYE göründüğü ortaya çıktı: ana sayfada "★★★★★ 5.0 / 5"
--  ve firma seçim ekranında kurulumcunun 4,0 puanı. İkisi de silindi
--  (commit 8e08fa8) ama silmek OLAYI kapatır, SEBEBİ kapatmaz — yarın aynı
--  akış yeniden denenirse aynı satır yeniden görünür.
--
--  ⚠️ BU BAYRAK ÖTEKİLERDEN FARKLI BİR İŞ YAPIYOR
--  commissions ve consultant_credits'teki test_mi bir ÖLÇÜMÜ korur: yanlış
--  işaretlenmiş satır yalnız yöneticinin baktığı bir rakamı kaydırır, üstelik
--  yönetici onu görür. ratings'teki test_mi ise ZİYARETÇİNİN GÖRDÜĞÜNÜ korur:
--  yanlış işaretlenmiş satır ana sayfada uydurma bir itibar olur ve bunu ilk
--  fark eden biz olmayız.
--
--  Bu yüzden burada `default false` TEK BAŞINA YETMEZ. "Test ederken bayrağı
--  elle koymayı hatırlarım" bir çözüm değil; bu dosyanın var olma sebebi tam
--  olarak o hatırlamanın bir kez tutmamış olması. Bayrağı KİM PUANLADIĞI
--  belirliyor: test hesabından gelen puan otomatik olarak test sayılıyor.
--
--  KURAL: doğrunun kaynağı SATIR değil HESAP'tır. Bir puanı gerçek saymak
--  gerekiyorsa hesabı listeden çıkarılır; satırı tek tek düzeltmek, aynı
--  hesabın bir sonraki puanını yine kaçırmak demektir.
-- ============================================================================


-- ============================================ 1) TEST HESAPLARI
-- Kayıtları hiçbir zaman ziyaretçiye ulaşmayacak hesaplar. Hafızadaki tespit:
-- "sisteme kayıtlı tüm hesaplar benim ve test amaçlıdır" (18.09.2026).
create table if not exists gizli.test_hesaplari (
    user_id    uuid primary key,
    eposta     text,
    not_       text,
    eklendi_at timestamptz not null default now()
);

insert into gizli.test_hesaplari (user_id, eposta, not_)
select u.id, u.email, 'yayın öncesi kurulum — 22.09.2026'
  from auth.users u
 where lower(u.email) in ('erdem.yvz@hotmail.com',
                          'yavuz@enerjimall.com',
                          'epc.merkezim@gmail.com',
                          'yavuzmedya@outlook.com')
on conflict (user_id) do nothing;


-- ============================================ 2) BAYRAK
alter table public.ratings add column if not exists test_mi boolean not null default false;

-- Kesme noktası: bugüne kadarki her puan testtir (olcum-test-ayrimi.sql ile
-- aynı ilke). Sahte iki satır zaten silindiği için bu muhtemelen 0 satır
-- günceller; yine de duruyor ki arada bir kayıt girdiyse o da dışarıda kalsın.
update public.ratings set test_mi = true where created_at <= now();


-- ============================================ 3) OTOMATİK İŞARETLEME
-- ⚠️ INSERT VE UPDATE. puan_ver() `on conflict do update` kullanıyor: aynı
-- yatırımcı puanını değiştirdiğinde INSERT tetikleyicisi değil UPDATE
-- tetikleyicisi çalışır. Yalnız INSERT'e bağlasaydık, ikinci kez puan veren
-- test hesabının satırı bayraksız kalırdı.
create or replace function public.ratings_test_isaretle()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.investor_id is not null
       and exists (select 1 from gizli.test_hesaplari t where t.user_id = new.investor_id) then
        new.test_mi := true;      -- yalnız TRUE'ya çeker, hiçbir zaman FALSE'a
    end if;
    return new;
end $$;

drop trigger if exists ratings_test_trg on public.ratings;
create trigger ratings_test_trg before insert or update on public.ratings
    for each row execute function public.ratings_test_isaretle();


-- ============================================ 4) ZİYARETÇİYE AÇIK OKUYUCULAR
-- Dördü de `test_mi = false` süzgecini alıyor. İmzalar değişmiyor, arayüzde
-- kod değişikliği gerekmiyor.

create or replace function public.platform_puani()
returns table (ortalama numeric, adet int)
language sql stable security definer set search_path = public as $$
    select round(avg(puan)::numeric, 1), count(*)::int
    from public.ratings where hedef_tip = 'platform' and test_mi = false;
$$;

create or replace function public.platform_deneyimi(p_limit int default 6)
returns table (puan int, yorum text, ad text, tarih timestamptz)
language sql stable security definer set search_path = public as $$
    select r.puan,
           r.yorum,
           case when r.ad_gorunsun
                then split_part(coalesce(l.full_name, ''), ' ', 1) ||
                     case when position(' ' in coalesce(l.full_name,'')) > 0
                          then ' ' || left(split_part(l.full_name, ' ', 2), 1) || '.' else '' end
                else 'Yatırımcı' end,
           r.created_at
    from public.ratings r
    left join public.leads l on l.id = r.lead_id
    where r.hedef_tip = 'platform'
      and r.yorum is not null
      and r.yorum_durum = 'approved'
      and r.test_mi = false
    order by r.created_at desc
    limit greatest(coalesce(p_limit, 6), 1);
$$;

create or replace function public.firma_puan_ozeti(p_company_id uuid)
returns table (ortalama numeric, adet int, tamamlanan_is int)
language sql stable security definer set search_path = public as $$
    select
        (select round(avg(r.puan)::numeric, 1) from public.ratings r
          where r.hedef_tip = 'company' and r.hedef_id = p_company_id and r.test_mi = false),
        (select count(*)::int from public.ratings r
          where r.hedef_tip = 'company' and r.hedef_id = p_company_id and r.test_mi = false),
        -- ⚠️ tamamlanan_is ratings'ten DEĞİL leads'ten geliyor; orada test
        -- bayrağı yok. Bu sayı test kurulumlarını saymaya devam ediyor.
        (select count(*)::int from public.leads l
          where l.company_id = p_company_id and l.status = 'tamamlandi');
$$;

create or replace function public.firma_yorumlari(p_company_id uuid, p_limit int default 5)
returns table (puan int, yorum text, ad text, tarih timestamptz)
language sql stable security definer set search_path = public as $$
    select r.puan, r.yorum,
           case when r.ad_gorunsun
                then split_part(coalesce(l.full_name, ''), ' ', 1) else 'Yatırımcı' end,
           r.created_at
    from public.ratings r
    left join public.leads l on l.id = r.lead_id
    where r.hedef_tip = 'company' and r.hedef_id = p_company_id
      and r.yorum is not null and r.yorum_durum = 'approved'
      and r.test_mi = false
    order by r.created_at desc
    limit greatest(coalesce(p_limit, 5), 1);
$$;


-- ============================================ 5) YÖNETİCİ TESTİ GÖRSÜN
-- ⚠️ Onay kuyruğundan test yorumlarını GİZLEMİYORUZ — gizlenen yorum sonsuza
-- kadar 'pending' kalır ve kimse neden orada olduğunu bilmez. Bunun yerine
-- yönetici hangisinin test olduğunu okuyabilsin diye hedef adının önüne
-- işaret konuyor. İmza değişmiyor, admin.js'e dokunmak gerekmiyor.
create or replace function public.bekleyen_yorumlar()
returns table (id uuid, hedef_tip text, hedef_ad text, puan int, yorum text, tarih timestamptz)
-- ⚠️ Kolon adı `hedef_ad` — depodaki iki sürümde `hedef` yazıyor ama CANLIDA
-- `hedef_ad`. create or replace çıktı kolonunun adını değiştiremez; `hedef`
-- ile yazılsaydı kurulum hata verip dosyanın kalanını da geri alırdı.
language sql stable security definer set search_path = public as $$
    select r.id, r.hedef_tip,
           case when r.test_mi then 'TEST · ' else '' end ||
           case r.hedef_tip
               when 'platform'   then 'epcmerkezim'
               when 'company'    then coalesce(c.name, 'Firma')
               when 'consultant' then coalesce(co.full_name, 'Danışman')
           end,
           r.puan, r.yorum, r.created_at
    from public.ratings r
    left join public.companies   c  on c.id  = r.hedef_id
    left join public.consultants co on co.id = r.hedef_id
    where r.yorum is not null and r.yorum_durum = 'pending'
      and public.is_admin()
    order by r.created_at;
$$;

grant execute on function public.platform_puani()                to anon, authenticated;
grant execute on function public.platform_deneyimi(int)          to anon, authenticated;
grant execute on function public.firma_puan_ozeti(uuid)          to anon, authenticated;
grant execute on function public.firma_yorumlari(uuid, int)      to anon, authenticated;
grant execute on function public.bekleyen_yorumlar()             to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  ⚠️ DENEME BU DOSYADA DEĞİL — ratings-test-ayrimi-deneme.sql'de.
--  Supabase SQL editörü betiği TEK İŞLEM olarak çalıştırır; sonuna `rollback`
--  ile biten bir deneme bloğu koyarsak create/alter dâhil her şey geri alınır
--  ve ekranda "Success" yazar. (abonelik-veri-katmani.sql'de bir kez oldu.)
-- ============================================================================
