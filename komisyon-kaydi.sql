-- ============================================================================
--  komisyon-kaydi.sql
--
--  ⚠️ BU DOSYA KİMSEDEN PARA İSTEMİYOR. Yalnız KAYIT tutuyor.
--  Fatura yok, borç yok, firmaya gösterilen bir tutar yok. Amaç, üç ay
--  sonra şu soruları VERİYLE cevaplayabilmek:
--      · ortalama iş büyüklüğü ne?
--      · davet edilen firmaların yüzde kaçı kazanıyor?
--      · kazanılan işlerin kaçı gerçekten tamamlanıyor?
--      · firma başına platformdan geçen gerçek değer ne?
--  Bunlar bilinmeden ne abonelik doğru fiyatlanır ne komisyon.
--
--  NEDEN ŞİMDİ
--  Sistem tamamlanan işleri SAYIYOR ama değerini tutmuyor:
--      firma_puan_ozeti → select count(*) from leads where status='tamamlandi'
--  Testte ₺301.806'lık bir iş tamamlandı, puanlandı; o rakam hiçbir yere
--  yazılmadı. firm_quotes içinde duruyor ama "tamamlanmış bir iş şu
--  kadarlıktı" diyen bir kayıt yok.
--
--  TASARIM KARARLARI — hepsi bilinçli
--
--  1) lead_kazanan()'A DOKUNULMUYOR. O fonksiyonun canlı gövdesi
--     danisman-rolu.sql'deki hâlinden farklı olabilir (o dosya hiç
--     çalıştırılmamıştı). Bunun yerine leads tablosuna TETİKLEYİCİ
--     konuyor: company_id boştan doluya geçtiği an kayıt düşüyor.
--     Yan fayda: admin elle atadığında da yakalanıyor.
--
--  2) ORAN SATIRA YAZILIYOR, ayar tablosundan okunmuyor. Oranı yarın
--     %3'ten %5'e çıkarırsanız ESKİ kayıtlar eski oranı korumalı.
--     Rapor anında ayardan okusaydık geçmiş kendiliğinden değişirdi —
--     muhasebede en klasik hata budur.
--
--  3) TUTAR SEÇİM ANINDA DONDURULUYOR. Firma teklifini sonradan
--     düzeltirse komisyon dayanağı kaymaz.
--
--  4) KDV HARİÇ tutar esas alınıyor (totals->>'total_try'). Vergi
--     üzerinden komisyon hesaplanmaz.
--
--  5) DURUM ÜÇ HÂLLİ:
--       beklemede  → firma seçildi, iş henüz bitmedi
--       hakedildi  → leads.status = 'tamamlandi' oldu
--       iptal      → yönetici gerekçeyle düşürdü
--     "Seçildi" ile "hak edildi" aynı şey değil; bu ayrım olmazsa
--     tamamlanmayan işler de gelir gibi görünür.
--
--  6) SADECE YÖNETİCİ GÖRÜR. Firmaya, tahsil edilmeyecek bir tutarı
--     "borç" gibi göstermek kafa karıştırır. Komisyona gerçekten
--     geçilirse oran ÖNCE duyurulur, sonra panelde gösterilir.
-- ============================================================================


-- ============================================ 1) VARSAYILAN ORAN
-- app_settings zaten var (usdTry, solarYield…); aynı yerde duruyor ki
-- yönetici Ayarlar ekranından görebilsin.
insert into public.app_settings (key, value, label, category)
select 'komisyonOran', 3, 'Komisyon oranı (%) — yalnız kayıt, tahsil edilmiyor', 'finans'
where not exists (select 1 from public.app_settings where key = 'komisyonOran');


-- ============================================ 2) TABLO
create table if not exists public.commissions (
    id          uuid primary key default gen_random_uuid(),
    lead_id     uuid not null references public.leads(id)     on delete cascade,
    company_id  uuid not null references public.companies(id) on delete restrict,
    quote_id    uuid references public.firm_quotes(id)        on delete set null,

    -- Dayanak: seçim anında dondurulmuş teklif tutarı.
    tutar_try   numeric,          -- KDV HARİÇ
    tutar_usd   numeric,
    usd_kuru    numeric,

    -- Oran satırın kendi malı; ayar değişse de bu satır değişmez.
    oran        numeric not null,
    komisyon_try numeric,         -- tutar_try * oran / 100

    durum       text not null default 'beklemede',   -- beklemede | hakedildi | iptal
    kaynak      text,                                 -- 'yarisma' | 'atama'
    rakip_sayisi int,                                 -- kaç firma davet edilmişti

    hakedis_at  timestamptz,
    iptal_sebep text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Bir iş için tek kayıt.
create unique index if not exists commissions_lead_tekil on public.commissions (lead_id);
create index if not exists commissions_firma on public.commissions (company_id, durum);

alter table public.commissions enable row level security;

-- ⚠️ Yalnız yönetici. Firma kendi satırını GÖRMÜYOR: tahsil edilmeyen bir
-- tutarı borç sanmasın. Komisyona geçilirse bu politika bilerek açılır.
drop policy if exists commissions_admin on public.commissions;
create policy commissions_admin on public.commissions
    for all to authenticated
    using (public.is_admin()) with check (public.is_admin());


-- ============================================ 3) KAZANAN TEKLİFİ BUL
-- Firmanın o işe MÜŞTERİYE GÖNDERDİĞİ en güncel teklifi. Taslak sayılmaz —
-- yatırımcının görmediği bir teklif üzerinden komisyon hesaplanamaz.
create or replace function public.komisyon_kazanan_teklif(p_lead_id uuid, p_company_id uuid)
returns public.firm_quotes
language sql stable security definer set search_path = public as $$
    select q.* from public.firm_quotes q
     where q.lead_id = p_lead_id
       and q.company_id = p_company_id
       and coalesce(q.status, '') in ('sent', 'accepted')
     order by case when q.status = 'accepted' then 0 else 1 end, q.created_at desc
     limit 1;
$$;


-- ============================================ 4) TETİKLEYİCİ
create or replace function public.commissions_lead_takip()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_q     public.firm_quotes;
    v_oran  numeric;
    v_try   numeric;
    v_usd   numeric;
    v_kur   numeric;
    v_rakip int;
begin
    -- a) FİRMA SEÇİLDİ → kayıt aç
    if new.company_id is not null and old.company_id is distinct from new.company_id then

        -- ⚠️ app_settings.value NUMERIC (metin değil). nullif(value,'')
        -- yazınca Postgres '' ifadesini numeric'e çevirmeye çalışıp
        -- "invalid input syntax for type numeric" veriyordu.
        v_oran := coalesce((select s.value
                              from public.app_settings s where s.key = 'komisyonOran'), 0);

        v_q := public.komisyon_kazanan_teklif(new.id, new.company_id);

        -- totals jsonb: {subtotal_usd, discount, total_usd, usd_rate, vat_pct,
        --                total_try, total_try_vat}
        if v_q.id is not null then
            begin
                v_try := nullif(v_q.totals ->> 'total_try', '')::numeric;
                v_usd := nullif(v_q.totals ->> 'total_usd', '')::numeric;
                v_kur := nullif(v_q.totals ->> 'usd_rate',  '')::numeric;
            exception when others then
                v_try := null; v_usd := null; v_kur := null;
            end;
        end if;

        select count(*)::int into v_rakip
          from public.lead_assignments la where la.lead_id = new.id;

        insert into public.commissions (
            lead_id, company_id, quote_id,
            tutar_try, tutar_usd, usd_kuru,
            oran, komisyon_try,
            durum, kaynak, rakip_sayisi
        ) values (
            new.id, new.company_id, v_q.id,
            v_try, v_usd, v_kur,
            v_oran,
            case when v_try is null then null else round(v_try * v_oran / 100, 2) end,
            case when new.status = 'tamamlandi' then 'hakedildi' else 'beklemede' end,
            case when coalesce(v_rakip, 0) > 1 then 'yarisma' else 'atama' end,
            v_rakip
        )
        on conflict (lead_id) do update
           set company_id   = excluded.company_id,
               quote_id     = coalesce(excluded.quote_id, public.commissions.quote_id),
               tutar_try    = coalesce(excluded.tutar_try, public.commissions.tutar_try),
               tutar_usd    = coalesce(excluded.tutar_usd, public.commissions.tutar_usd),
               usd_kuru     = coalesce(excluded.usd_kuru,  public.commissions.usd_kuru),
               komisyon_try = coalesce(excluded.komisyon_try, public.commissions.komisyon_try),
               rakip_sayisi = excluded.rakip_sayisi,
               updated_at   = now();
    end if;

    -- b) İŞ TAMAMLANDI → hak edildi
    if new.status = 'tamamlandi' and old.status is distinct from new.status then
        update public.commissions
           set durum = case when durum = 'iptal' then 'iptal' else 'hakedildi' end,
               hakedis_at = coalesce(hakedis_at, now()),
               updated_at = now()
         where lead_id = new.id;
    end if;

    return new;
exception when others then
    -- ⚠️ Komisyon KAYDI yüzünden bir iş kaybedilemez. Hata olursa uyarı
    -- düşer, süreç devam eder.
    raise warning 'komisyon kaydı yazılamadı (lead %): %', new.id, sqlerrm;
    return new;
end $$;

drop trigger if exists commissions_lead_trg on public.leads;
create trigger commissions_lead_trg after update on public.leads
    for each row execute function public.commissions_lead_takip();


-- ============================================ 5) GEÇMİŞİ DOLDUR
-- Bugüne kadar kazanılmış işler için tek seferlik kayıt. Tetikleyici
-- yalnız bundan sonrasını yakalar; geçmiş olmadan ortalama çıkmaz.
insert into public.commissions (
    lead_id, company_id, quote_id, tutar_try, tutar_usd, usd_kuru,
    oran, komisyon_try, durum, kaynak, rakip_sayisi, hakedis_at
)
select l.id, l.company_id, q.id,
       nullif(q.totals ->> 'total_try', '')::numeric,
       nullif(q.totals ->> 'total_usd', '')::numeric,
       nullif(q.totals ->> 'usd_rate',  '')::numeric,
       coalesce((select s.value from public.app_settings s
                  where s.key = 'komisyonOran'), 0),
       case when nullif(q.totals ->> 'total_try','') is null then null
            else round((q.totals ->> 'total_try')::numeric
                       * coalesce((select s.value from public.app_settings s
                                    where s.key = 'komisyonOran'), 0) / 100, 2) end,
       case when l.status = 'tamamlandi' then 'hakedildi' else 'beklemede' end,
       case when (select count(*) from public.lead_assignments la where la.lead_id = l.id) > 1
            then 'yarisma' else 'atama' end,
       (select count(*)::int from public.lead_assignments la where la.lead_id = l.id),
       case when l.status = 'tamamlandi' then l.updated_at else null end
  from public.leads l
  left join lateral public.komisyon_kazanan_teklif(l.id, l.company_id) q on true
 where l.company_id is not null
on conflict (lead_id) do nothing;


-- ============================================ 6) YÖNETİCİ GÖRÜNÜMÜ
create or replace function public.komisyon_ozeti()
returns table (durum text, adet bigint, toplam_is_try numeric, toplam_komisyon_try numeric)
language sql stable security definer set search_path = public as $$
    select c.durum, count(*)::bigint,
           coalesce(sum(c.tutar_try), 0),
           coalesce(sum(c.komisyon_try), 0)
      from public.commissions c
     where public.is_admin()
     group by c.durum
     order by c.durum;
$$;

create or replace function public.komisyon_listesi(p_limit int default 25)
returns table (
    id uuid, firma text, musteri text, il text, ilce text,
    tutar_try numeric, oran numeric, komisyon_try numeric,
    durum text, kaynak text, rakip_sayisi int,
    teklif_var boolean, ne_zaman timestamptz
)
language sql stable security definer set search_path = public as $$
    select c.id, co.name, l.full_name, l.city, l.district,
           c.tutar_try, c.oran, c.komisyon_try,
           c.durum, c.kaynak, c.rakip_sayisi,
           (c.quote_id is not null),
           c.created_at
      from public.commissions c
      join public.companies co on co.id = c.company_id
      join public.leads     l  on l.id  = c.lead_id
     where public.is_admin()
     order by c.created_at desc
     limit greatest(1, least(coalesce(p_limit, 25), 200));
$$;

-- Tamamlanmayan / düşen iş: kaydı gelir gibi bırakmayalım.
create or replace function public.komisyon_iptal(p_id uuid, p_sebep text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'Bu işlem yalnız yöneticiye açıktır.'; end if;
    if coalesce(btrim(p_sebep), '') = '' then raise exception 'İptal gerekçesi zorunludur.'; end if;
    update public.commissions
       set durum = 'iptal', iptal_sebep = left(p_sebep, 300), updated_at = now()
     where id = p_id;
    return found;
end $$;

grant execute on function public.komisyon_ozeti()          to authenticated;
grant execute on function public.komisyon_listesi(int)     to authenticated;
grant execute on function public.komisyon_iptal(uuid,text) to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA (admin hesabıyla, tarayıcı konsolunda)
--      await supabaseClient.rpc('komisyon_ozeti')
--      await supabaseClient.rpc('komisyon_listesi', { p_limit: 10 })
--
--  Oranı değiştirmek (YALNIZ bundan sonraki kayıtları etkiler):
--      update public.app_settings set value = '5' where key = 'komisyonOran';
--
--  ⚠️ Teklifi olmayan işlerde tutar NULL kalır — uydurmuyoruz. Firma
--  seçildi ama sihirbazdan teklif geçmediyse dayanak yoktur; listede
--  "teklif yok" olarak görünür ve ortalamaya girmez.
-- ============================================================================
