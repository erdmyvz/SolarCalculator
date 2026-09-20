-- ============================================================================
--  danisman-deger-kaydi.sql
--
--  ⚠️ BU DOSYA DA KİMSEDEN PARA İSTEMİYOR, KİMSEYE PARA ÖDEMİYOR.
--  komisyon-kaydi.sql ile aynı mantık: önce ölç, sonra fiyatla. Danışmana
--  gösterilen bir hakediş, bir bakiye, bir "kazandınız" ekranı YOK.
--
--  SORUN — DANIŞMANIN YÖNÜ BELLİ DEĞİL
--  Bugün danışmanda `sub_status` var (trial → active, elle uzatılıyor), yani
--  sistem danışmanı PARA ÖDEYEN taraf olarak kurgulamış. Ama danışman iki iş
--  yapıyor ve ikisi de platforma DEĞER ÜRETİYOR:
--
--      1) Danışanını sisteme aktarıyor (danisan_crm_e_aktar). O kayıt
--         yarışmaya giriyor, bir firma kazanıyor, komisyon doğuyor.
--         → Danışman burada bir SATIŞ KANALI.
--
--      2) Yatırımcının aldığı teklifleri değerlendiriyor
--         (consultation_requests → danisman_gorus_yaz). Yatırımcı kararını
--         bu görüşe bakarak veriyor.
--         → Danışman burada platformun GÜVEN KATMANI.
--
--  Getiren taraftan abonelik almak, satış kanalına fatura kesmektir. Doğru
--  olabilir de olmayabilir de — bilmiyoruz, çünkü hiçbir yerde ölçülmüyor.
--  Bu dosya o ölçümü kuruyor. Ücretlendirme kararı ölçümden SONRA verilecek.
--
--  ÜÇ AY SONRA CEVABI OLACAK SORULAR
--      · Bir danışman ortalama kaç kayıt getiriyor, kaçı firmaya bağlanıyor?
--      · Danışman yönlendirmesi normal başvurudan daha mı çok tamamlanıyor?
--      · Değerlendirme danışmanlığı ne kadar emek — kaç saatte cevaplanıyor?
--      · Danışmanın önerdiği firmayı yatırımcı gerçekten seçiyor mu?
--      · Danışmana payın %20 olsaydı bu ne ederdi — aboneliğinden çok mu?
--
--  TASARIM KARARLARI
--
--  1) PAY, KOMİSYONDAN HESAPLANIYOR — İŞ BEDELİNDEN DEĞİL.
--     İş bedelinin yüzdesi olsaydı o para ya müşterinin cebinden ya firmanın
--     kârından çıkardı; ikisi de danışmanı maliyet kalemi yapar. Komisyonun
--     yüzdesi ise platformun kendi payını paylaşmasıdır: danışman kazandırdıkça
--     kazanır, kazandırmadığında kimse zarar etmez.
--
--  2) ORAN SATIRA YAZILIYOR. komisyon-kaydi.sql'deki aynı gerekçe: oranı
--     yarın değiştirirseniz GEÇMİŞ KAYITLAR eski oranını korumalı.
--
--  3) DEĞERLENDİRME ÜCRETİ VARSAYILAN 0 — "henüz fiyatlanmadı" demek.
--     Buraya uydurma bir rakam koymak, üç ay sonra o rakamı veri sanmaktır.
--     Ölçtüğümüz şey ücret değil, EMEK: kaç talep, kaç saatte cevap.
--
--  4) DAYANAK commissions'TAN OKUNUYOR, yeniden hesaplanmıyor. Tutar orada
--     zaten seçim anında donduruldu. İkinci kez hesaplasaydık iki tablo
--     zamanla birbirini tutmazdı.
--
--  5) SADECE YÖNETİCİ GÖRÜR. Danışmana ödenmeyecek bir tutarı "hakedişiniz"
--     diye göstermek, komisyonu firmaya borç gibi göstermekle aynı hata olur.
--
--  ⚠️ komisyon-kaydi.sql ve teklif-danismanligi.sql önce çalıştırılmış olmalı.
-- ============================================================================


-- ============================================ 1) VARSAYILAN ORANLAR
-- ⚠️ İKİSİ DE VARSAYIM. Ölçüm bittiğinde gerçek sayıyla değiştirilecek.
insert into public.app_settings (key, value, label, category)
select 'danismanPayOran', 20,
       'Danışman payı (komisyonun %''si) — yalnız simülasyon, ödenmiyor', 'finans'
where not exists (select 1 from public.app_settings where key = 'danismanPayOran');

insert into public.app_settings (key, value, label, category)
select 'danismanDegerlendirmeUcret', 0,
       'Teklif değerlendirme ücreti (₺) — 0 = henüz fiyatlanmadı', 'finans'
where not exists (select 1 from public.app_settings where key = 'danismanDegerlendirmeUcret');


-- ============================================ 2) TABLO
create table if not exists public.consultant_credits (
    id            uuid primary key default gen_random_uuid(),
    consultant_id uuid not null references public.consultants(id) on delete cascade,

    -- 'yonlendirme'   → danışan aktardı, bir firma kazandı
    -- 'degerlendirme' → yatırımcının tekliflerine görüş yazdı
    tur           text not null,

    lead_id       uuid references public.leads(id)                  on delete cascade,
    company_id    uuid references public.companies(id)              on delete set null,
    request_id    uuid references public.consultation_requests(id)  on delete set null,

    -- Dayanak: commissions'tan okunan, seçim anında dondurulmuş rakamlar.
    is_tutari_try numeric,        -- KDV hariç iş bedeli
    komisyon_try  numeric,        -- platformun o işten hesapladığı komisyon
    oran          numeric,        -- yonlendirme: komisyonun %'si · degerlendirme: yok
    pay_try       numeric,        -- hesaplanan danışman payı / değerlendirme ücreti

    durum         text not null default 'beklemede',  -- beklemede|hakedildi|iptal

    -- Emek ve isabet ölçümü (yalnız 'degerlendirme')
    cevap_saat    numeric,        -- talep açıldıktan kaç saat sonra görüş yazıldı
    oneri_tuttu   boolean,        -- yatırımcı danışmanın önerdiği firmayı mı seçti
                                  -- null = danışman firma önermedi ya da seçim yapılmadı

    hakedis_at    timestamptz,
    iptal_sebep   text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- Bir iş için tek yönlendirme, bir talep için tek değerlendirme.
create unique index if not exists consultant_credits_tekil
    on public.consultant_credits (tur, lead_id, consultant_id);
create index if not exists consultant_credits_dan
    on public.consultant_credits (consultant_id, durum);

alter table public.consultant_credits enable row level security;

-- ⚠️ Yalnız yönetici. Danışman kendi satırını GÖRMÜYOR: ödenmeyecek bir
-- tutarı hakediş sanmasın. Paya gerçekten geçilirse bu politika bilerek açılır.
drop policy if exists consultant_credits_admin on public.consultant_credits;
create policy consultant_credits_admin on public.consultant_credits
    for all to authenticated
    using (public.is_admin()) with check (public.is_admin());


-- ============================================ 3) KAYIT KİMİN DANIŞANI
create or replace function public.lead_danismani(p_lead_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
    select cc.consultant_id
      from public.leads l
      join public.consultant_clients cc on cc.id = l.consultant_client_id
     where l.id = p_lead_id;
$$;


-- ============================================ 4) YÖNLENDİRME KAYDI
-- ⚠️ commissions ÜZERİNDEN tetikleniyor, leads üzerinden değil. Sebep: tutar
-- orada donuyor. leads'e ayrı bir tetikleyici koysaydık iki tablo aynı işe
-- iki farklı rakam yazabilirdi.
create or replace function public.danisman_yonlendirme_takip()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_dan   uuid;
    v_oran  numeric;
    v_oneri uuid;
begin
    v_dan := public.lead_danismani(new.lead_id);

    -- Danışman yönlendirmesi değilse yapacak bir şey yok.
    if v_dan is null then return new; end if;

    v_oran := coalesce((select s.value from public.app_settings s
                         where s.key = 'danismanPayOran'), 0);

    insert into public.consultant_credits (
        consultant_id, tur, lead_id, company_id,
        is_tutari_try, komisyon_try, oran, pay_try, durum, hakedis_at
    ) values (
        v_dan, 'yonlendirme', new.lead_id, new.company_id,
        new.tutar_try, new.komisyon_try, v_oran,
        -- ⚠️ Komisyon bilinmiyorsa pay da BİLİNMİYOR. 0 yazmıyoruz:
        -- 0 "hak etmedi" demektir, oysa burada "hesaplanamadı" söz konusu.
        case when new.komisyon_try is null then null
             else round(new.komisyon_try * v_oran / 100, 2) end,
        new.durum,
        case when new.durum = 'hakedildi' then coalesce(new.hakedis_at, now()) end
    )
    on conflict (tur, lead_id, consultant_id) do update
       set company_id    = excluded.company_id,
           is_tutari_try = coalesce(excluded.is_tutari_try, public.consultant_credits.is_tutari_try),
           komisyon_try  = coalesce(excluded.komisyon_try,  public.consultant_credits.komisyon_try),
           pay_try       = coalesce(excluded.pay_try,       public.consultant_credits.pay_try),
           -- Komisyon düşerse danışman payı da düşer; ayakta kalamaz.
           durum         = excluded.durum,
           hakedis_at    = coalesce(public.consultant_credits.hakedis_at, excluded.hakedis_at),
           updated_at    = now();

    -- Danışman bu işte firma da önerdiyse: önerisi tuttu mu?
    select cr.onerilen_company_id into v_oneri
      from public.consultation_requests cr
     where cr.lead_id = new.lead_id and cr.consultant_id = v_dan
       and cr.tur = 'teklif_degerlendirme';

    if v_oneri is not null and new.company_id is not null then
        update public.consultant_credits
           set oneri_tuttu = (v_oneri = new.company_id), updated_at = now()
         where tur = 'degerlendirme' and lead_id = new.lead_id and consultant_id = v_dan;
    end if;

    return new;
exception when others then
    -- ⚠️ Ölçüm yüzünden komisyon kaydı bozulamaz.
    raise warning 'danışman yönlendirme kaydı yazılamadı (lead %): %', new.lead_id, sqlerrm;
    return new;
end $$;

drop trigger if exists danisman_yonlendirme_trg on public.commissions;
create trigger danisman_yonlendirme_trg after insert or update on public.commissions
    for each row execute function public.danisman_yonlendirme_takip();


-- ============================================ 5) DEĞERLENDİRME KAYDI
-- Görüş yazıldığı anda İŞ BİTMİŞTİR: durum doğrudan 'hakedildi'. Yatırımcının
-- sonra ne yaptığı danışmanın emeğini geri almaz.
create or replace function public.danisman_degerlendirme_takip()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_ucret numeric;
    v_saat  numeric;
    v_secim uuid;
begin
    if new.durum <> 'tamamlandi' or old.durum is not distinct from new.durum then
        return new;
    end if;

    v_ucret := coalesce((select s.value from public.app_settings s
                          where s.key = 'danismanDegerlendirmeUcret'), 0);

    v_saat := round(extract(epoch from (now() - new.created_at)) / 3600.0, 1);

    -- Yatırımcı firmasını çoktan seçmişse öneri isabetini hemen yazabiliriz.
    select l.company_id into v_secim from public.leads l where l.id = new.lead_id;

    insert into public.consultant_credits (
        consultant_id, tur, lead_id, request_id,
        pay_try, durum, cevap_saat, oneri_tuttu, hakedis_at
    ) values (
        new.consultant_id, 'degerlendirme', new.lead_id, new.id,
        v_ucret, 'hakedildi', v_saat,
        case when new.onerilen_company_id is null or v_secim is null then null
             else (new.onerilen_company_id = v_secim) end,
        now()
    )
    on conflict (tur, lead_id, consultant_id) do update
       set request_id  = excluded.request_id,
           cevap_saat  = excluded.cevap_saat,
           oneri_tuttu = coalesce(excluded.oneri_tuttu, public.consultant_credits.oneri_tuttu),
           updated_at  = now();

    return new;
exception when others then
    -- ⚠️ Ölçüm yüzünden danışmanın görüşü kaydedilemez olamaz.
    raise warning 'danışman değerlendirme kaydı yazılamadı (talep %): %', new.id, sqlerrm;
    return new;
end $$;

drop trigger if exists danisman_degerlendirme_trg on public.consultation_requests;
create trigger danisman_degerlendirme_trg after update on public.consultation_requests
    for each row execute function public.danisman_degerlendirme_takip();


-- ============================================ 6) GEÇMİŞİ DOLDUR
-- Tetikleyiciler yalnız bundan sonrasını yakalar. Geçmiş olmadan ortalama çıkmaz.

-- a) Danışman yönlendirmesiyle kazanılmış işler
insert into public.consultant_credits (
    consultant_id, tur, lead_id, company_id,
    is_tutari_try, komisyon_try, oran, pay_try, durum, hakedis_at
)
select cc.consultant_id, 'yonlendirme', c.lead_id, c.company_id,
       c.tutar_try, c.komisyon_try,
       coalesce((select s.value from public.app_settings s where s.key = 'danismanPayOran'), 0),
       case when c.komisyon_try is null then null
            else round(c.komisyon_try
                       * coalesce((select s.value from public.app_settings s
                                    where s.key = 'danismanPayOran'), 0) / 100, 2) end,
       c.durum,
       c.hakedis_at
  from public.commissions c
  join public.leads l on l.id = c.lead_id
  join public.consultant_clients cc on cc.id = l.consultant_client_id
on conflict (tur, lead_id, consultant_id) do nothing;

-- b) Yazılmış görüşler
insert into public.consultant_credits (
    consultant_id, tur, lead_id, request_id,
    pay_try, durum, cevap_saat, oneri_tuttu, hakedis_at
)
select cr.consultant_id, 'degerlendirme', cr.lead_id, cr.id,
       coalesce((select s.value from public.app_settings s
                  where s.key = 'danismanDegerlendirmeUcret'), 0),
       'hakedildi',
       round(extract(epoch from (cr.updated_at - cr.created_at)) / 3600.0, 1),
       case when cr.onerilen_company_id is null or l.company_id is null then null
            else (cr.onerilen_company_id = l.company_id) end,
       cr.updated_at
  from public.consultation_requests cr
  join public.leads l on l.id = cr.lead_id
 where cr.durum = 'tamamlandi'
on conflict (tur, lead_id, consultant_id) do nothing;


-- ============================================ 7) YÖNETİCİ GÖRÜNÜMÜ
-- ⚠️ "getirdigi" consultant_credits'ten DEĞİL leads'ten sayılıyor. Kredi satırı
-- yalnız firma kazanınca doğuyor; dönüşüm oranını hesaplamak için getirilen
-- ama bağlanmayan kayıtlar da lazım. Yalnız krediye baksaydık her danışman
-- %100 dönüşümle görünürdü.
create or replace function public.danisman_deger_ozeti()
returns table (
    consultant_id uuid, danisman text, eposta text,
    abonelik text, abonelik_bitis timestamptz,
    getirdigi int, baglanan int, tamamlanan int,
    is_hacmi_try numeric, komisyon_try numeric, pay_try numeric,
    degerlendirme int, ort_cevap_saat numeric,
    oneri_sayisi int, oneri_tutan int
)
language sql stable security definer set search_path = public as $$
    select co.id, co.full_name, co.email, co.sub_status, co.sub_ends_at,
           (select count(*)::int from public.consultant_clients cc
             join public.leads l on l.id = cc.lead_id
            where cc.consultant_id = co.id),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'yonlendirme' and k.durum <> 'iptal'),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'yonlendirme' and k.durum = 'hakedildi'),
           (select coalesce(sum(k.is_tutari_try), 0) from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'yonlendirme' and k.durum <> 'iptal'),
           (select coalesce(sum(k.komisyon_try), 0) from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'yonlendirme' and k.durum <> 'iptal'),
           (select coalesce(sum(k.pay_try), 0) from public.consultant_credits k
            where k.consultant_id = co.id and k.durum <> 'iptal'),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'degerlendirme' and k.durum <> 'iptal'),
           (select round(avg(k.cevap_saat), 1) from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'degerlendirme' and k.cevap_saat is not null),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.oneri_tuttu is not null),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.oneri_tuttu = true)
      from public.consultants co
     where public.is_admin()
       and coalesce(co.status, 'approved') <> 'rejected'
     order by co.full_name;
$$;

create or replace function public.danisman_deger_listesi(p_limit int default 25)
returns table (
    id uuid, danisman text, tur text, musteri text, firma text,
    is_tutari_try numeric, komisyon_try numeric, oran numeric, pay_try numeric,
    durum text, cevap_saat numeric, oneri_tuttu boolean, ne_zaman timestamptz
)
language sql stable security definer set search_path = public as $$
    select k.id, co.full_name, k.tur, l.full_name, c.name,
           k.is_tutari_try, k.komisyon_try, k.oran, k.pay_try,
           k.durum, k.cevap_saat, k.oneri_tuttu, k.created_at
      from public.consultant_credits k
      join public.consultants co on co.id = k.consultant_id
      left join public.leads     l on l.id = k.lead_id
      left join public.companies c on c.id = k.company_id
     where public.is_admin()
     order by k.created_at desc
     limit greatest(1, least(coalesce(p_limit, 25), 200));
$$;

-- Danışman yönlendirmesi olmayan işlerle karşılaştırma. Ücretlendirme kararının
-- asıl dayanağı bu: danışman getirdiği iş daha mı çok tamamlanıyor, daha mı
-- büyük? Öyleyse abonelik almak yanlış taraftan para istemek olabilir.
create or replace function public.danisman_karsilastirma()
returns table (kaynak text, adet bigint, tamamlanan bigint, ortalama_is_try numeric)
language sql stable security definer set search_path = public as $$
    select case when public.lead_danismani(c.lead_id) is not null
                then 'danisman' else 'dogrudan' end,
           count(*)::bigint,
           count(*) filter (where c.durum = 'hakedildi')::bigint,
           -- ⚠️ Ortalama YALNIZ tutarı bilinen işler üzerinden; teklifi
           -- olmayan işi 0 saymak ortalamayı yalanlar.
           round(avg(c.tutar_try) filter (where c.tutar_try is not null), 0)
      from public.commissions c
     where public.is_admin() and c.durum <> 'iptal'
     group by 1
     order by 1;
$$;

create or replace function public.danisman_kaydi_iptal(p_id uuid, p_sebep text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then raise exception 'Bu işlem yalnız yöneticiye açıktır.'; end if;
    if coalesce(btrim(p_sebep), '') = '' then raise exception 'İptal gerekçesi zorunludur.'; end if;
    update public.consultant_credits
       set durum = 'iptal', iptal_sebep = left(p_sebep, 300), updated_at = now()
     where id = p_id;
    return found;
end $$;

grant execute on function public.lead_danismani(uuid)              to authenticated;
grant execute on function public.danisman_deger_ozeti()            to authenticated;
grant execute on function public.danisman_deger_listesi(int)       to authenticated;
grant execute on function public.danisman_karsilastirma()          to authenticated;
grant execute on function public.danisman_kaydi_iptal(uuid, text)  to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA (admin hesabıyla, tarayıcı konsolunda)
--      await supabaseClient.rpc('danisman_deger_ozeti')
--      await supabaseClient.rpc('danisman_karsilastirma')
--
--  Simülasyon oranını değiştirmek (YALNIZ bundan sonraki kayıtlar):
--      update public.app_settings set value = 25 where key = 'danismanPayOran';
--
--  ⚠️ Geçmiş kayıtları yeni oranla güncellemek İSTEMİYORSANIZ hiçbir şey
--  yapmayın — zaten güncellenmiyor. Bilerek güncellemek isterseniz:
--      update public.consultant_credits
--         set oran = 25, pay_try = round(komisyon_try * 25 / 100, 2)
--       where tur = 'yonlendirme' and komisyon_try is not null;
--  ...ama o zaman "geçmişte şu kadar hak etmişti" cümlesi artık doğru olmaz.
-- ============================================================================
