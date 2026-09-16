-- ============================================================================
--  teklif-danismanligi.sql
--
--  1) ⚠️ ÖNCEKİ DOSYADAKİ HATANIN DÜZELTMESİ
--     davetli_firmalar() ve firma_davetleri() teklif kontrolünü public.quotes
--     üzerinde yapıyordu. Teklifler orada DEĞİL: gerçek tablo firm_quotes
--     (quote.js → from('firm_quotes').insert). quotes tablosu var ama boş ve
--     hiçbir yerden kullanılmıyor.
--     SONUCU AĞIRDI: teklif_var her zaman false dönüyordu, "Bu firmayı seç"
--     düğmesi hep kapalı kalıyordu — yatırımcı HİÇBİR firmayı seçemezdi.
--
--  2) TEKLİF DEĞERLENDİRME DANIŞMANLIĞI
--     Yatırımcı üç teklifi karşılaştırırken bir danışmandan yardım isteyebilir.
--     Daha önce bir danışmanla ilerliyorsa o danışman doğrudan önerilir.
--
--  ⚠️ GİZLİLİK KARARI — DANIŞMAN MALİYETİ GÖRMEZ
--  firm_quotes.items içinde her kalemin `cost` (firmanın alış maliyeti) ve
--  `margin` (kâr marjı) alanları duruyor. Danışmana teklif gösteren fonksiyon
--  items'ı HİÇ DÖNDÜRMEZ; yalnız sistem özeti ve müşteriye yazılan bedeli
--  döndürür. Bir firmanın maliyet yapısının rakibine ya da üçüncü tarafa
--  sızması ticari olarak kabul edilemez.
--
--  yarismali-atama.sql ve danisman-rolu.sql önce çalıştırılmış olmalıdır.
-- ============================================================================

-- ====================================================== 1) HATANIN DÜZELTMESİ
create or replace function public.davetli_firmalar(p_lead_id uuid)
returns table (
    company_id uuid, firma text, il text, ilce text, yakinlik int,
    durum text, puan numeric, puan_adedi int, tamamlanan_is int, teklif_var boolean
)
language sql
stable
security definer
set search_path = public
as $$
    select c.id, c.name, c.city, c.district, la.yakinlik, la.durum,
           o.ortalama, o.adet, o.tamamlanan_is,
           exists (select 1 from public.firm_quotes q
                    where q.lead_id = p_lead_id and q.company_id = c.id
                      and coalesce(q.status, '') <> 'revised')
    from public.lead_assignments la
    join public.companies c on c.id = la.company_id
    left join lateral public.firma_puan_ozeti(c.id) o on true
    where la.lead_id = p_lead_id
      and exists (select 1 from public.leads l
                   where l.id = p_lead_id
                     and (l.investor_id = auth.uid() or public.is_admin()))
    order by la.yakinlik, o.ortalama desc nulls last, c.name;
$$;

create or replace function public.firma_davetleri()
returns table (
    assignment_id uuid, lead_id uuid, ad text, telefon text, eposta text,
    il text, ilce text, adres text, yakinlik int, durum text,
    rakip_sayisi int, teklif_verdim boolean, olusturma timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select la.id, l.id, l.full_name, l.phone, l.email,
           l.city, l.district, l.address, la.yakinlik, la.durum,
           (select count(*)::int - 1 from public.lead_assignments x where x.lead_id = l.id),
           exists (select 1 from public.firm_quotes q
                    where q.lead_id = l.id and q.company_id = la.company_id
                      and coalesce(q.status, '') <> 'revised'),
           l.created_at
    from public.lead_assignments la
    join public.leads l on l.id = la.lead_id
    where la.company_id = public.my_company_id()
      and l.company_id is null
    order by la.yakinlik, l.created_at desc;
$$;

grant execute on function public.davetli_firmalar(uuid) to authenticated;
grant execute on function public.firma_davetleri() to authenticated;


-- ============================================ 2) DANIŞMANLIK TALEBİ TABLOSU
create table if not exists public.consultation_requests (
    id            uuid primary key default gen_random_uuid(),
    lead_id       uuid not null references public.leads(id)       on delete cascade,
    investor_id   uuid not null references auth.users(id)         on delete cascade,
    consultant_id uuid not null references public.consultants(id) on delete cascade,
    tur           text not null default 'teklif_degerlendirme',
    durum         text not null default 'acik',   -- acik | tamamlandi | iptal
    gorus         text,
    onerilen_company_id uuid references public.companies(id) on delete set null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (lead_id, consultant_id, tur)
);
create index if not exists cons_req_dan_idx on public.consultation_requests (consultant_id, durum);
create index if not exists cons_req_lead_idx on public.consultation_requests (lead_id);

alter table public.consultation_requests enable row level security;

drop policy if exists cr_yatirimci on public.consultation_requests;
create policy cr_yatirimci on public.consultation_requests for select to authenticated
    using (investor_id = auth.uid() or consultant_id = auth.uid() or public.is_admin());


-- -------------------------------------------- 3) YATIRIMCININ DANIŞMANI VAR MI
-- Daha önce bir danışmanla ilerliyorsa onu öner; yoksa liste gösterilir.
create or replace function public.danismanim(p_lead_id uuid)
returns table (consultant_id uuid, ad text, unvan text, avatar text, talep_durum text)
language sql
stable
security definer
set search_path = public
as $$
    select co.id, co.full_name, co.title, co.avatar_data,
           (select cr.durum from public.consultation_requests cr
             where cr.lead_id = p_lead_id and cr.consultant_id = co.id
               and cr.tur = 'teklif_degerlendirme')
    from public.leads l
    join public.consultant_clients cc on cc.id = l.consultant_client_id
    join public.consultants co on co.id = cc.consultant_id
    where l.id = p_lead_id and l.investor_id = auth.uid()
      and coalesce(co.banned, false) = false;
$$;

grant execute on function public.danismanim(uuid) to authenticated;


-- ------------------------------------------------- 4) DANIŞMANLIK TALEBİ AÇ
create or replace function public.teklif_danismanligi_iste(
    p_lead_id       uuid,
    p_consultant_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_lead public.leads%rowtype;
    v_ad   text;
begin
    select * into v_lead from public.leads where id = p_lead_id;
    if not found then raise exception 'Kayıt bulunamadı'; end if;
    if v_lead.investor_id is distinct from auth.uid() then
        raise exception 'Yalnız kendi başvurunuz için danışmanlık isteyebilirsiniz';
    end if;

    select co.full_name into v_ad
    from public.consultants co
    where co.id = p_consultant_id and coalesce(co.banned, false) = false;
    if v_ad is null then raise exception 'Danışman bulunamadı'; end if;

    insert into public.consultation_requests (lead_id, investor_id, consultant_id)
    values (p_lead_id, auth.uid(), p_consultant_id)
    on conflict (lead_id, consultant_id, tur)
    do update set durum = 'acik', updated_at = now();

    insert into public.notifications (user_id, title, body, icon, link)
    values (p_consultant_id,
            'Teklif değerlendirme talebi',
            coalesce(v_lead.full_name, 'Bir yatırımcı') ||
                ' aldığı teklifleri değerlendirmenizi istiyor.',
            '⚖️', '#danisman-panel/teklif-degerlendirme');

    return jsonb_build_object('durum', 'acik', 'danisman', v_ad);
end;
$$;

grant execute on function public.teklif_danismanligi_iste(uuid, uuid) to authenticated;


-- ------------------------------------------------ 5) DANIŞMANIN TALEP KUYRUĞU
create or replace function public.danisman_talepleri()
returns table (
    request_id uuid, lead_id uuid, yatirimci text, il text, ilce text,
    durum text, teklif_sayisi int, gorus text, onerilen_company_id uuid,
    created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select cr.id, cr.lead_id, l.full_name, l.city, l.district, cr.durum,
           (select count(*)::int from public.firm_quotes q
             where q.lead_id = l.id and coalesce(q.status,'') <> 'revised'),
           cr.gorus, cr.onerilen_company_id, cr.created_at
    from public.consultation_requests cr
    join public.leads l on l.id = cr.lead_id
    where cr.consultant_id = auth.uid()
    order by case cr.durum when 'acik' then 0 else 1 end, cr.created_at desc;
$$;

grant execute on function public.danisman_talepleri() to authenticated;


-- ---------------------------------------- 6) DANIŞMANIN GÖRDÜĞÜ TEKLİF ÖZETİ
-- ⚠️ items DÖNDÜRÜLMEZ. İçinde firmanın maliyeti (cost) ve marjı (margin) var.
-- Yalnız yatırımcıya zaten söylenmiş rakamlar ve sistem özeti döner.
create or replace function public.danisman_teklif_ozeti(p_request_id uuid)
returns table (
    quote_id uuid, company_id uuid, firma text, teklif_no text,
    kwp numeric, panel_sayisi int, batarya_kwh numeric, yillik_uretim numeric,
    bedel_usd numeric, bedel_try numeric, bedel_try_kdv numeric,
    firma_puani numeric, firma_puan_adedi int, tarih timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select q.id, q.company_id, c.name, q.quote_no,
           (q.system->>'kwp')::numeric,
           (q.system->>'panels')::int,
           (q.system->>'battery_kwh')::numeric,
           (q.system->>'annual_prod')::numeric,
           (q.totals->>'total_usd')::numeric,
           (q.totals->>'total_try')::numeric,
           (q.totals->>'total_try_vat')::numeric,
           o.ortalama, o.adet,
           q.created_at
    from public.consultation_requests cr
    join public.firm_quotes q on q.lead_id = cr.lead_id
    join public.companies c on c.id = q.company_id
    left join lateral public.firma_puan_ozeti(c.id) o on true
    where cr.id = p_request_id
      and cr.consultant_id = auth.uid()
      and coalesce(q.status, '') <> 'revised'
    order by (q.totals->>'total_try_vat')::numeric nulls last;
$$;

grant execute on function public.danisman_teklif_ozeti(uuid) to authenticated;


-- ----------------------------------------------------- 7) DANIŞMAN GÖRÜŞ YAZAR
create or replace function public.danisman_gorus_yaz(
    p_request_id uuid,
    p_gorus      text,
    p_onerilen   uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_lead uuid;
    v_yat  uuid;
    v_ad   text;
begin
    if coalesce(trim(coalesce(p_gorus, '')), '') = '' then
        raise exception 'Görüş boş olamaz';
    end if;

    update public.consultation_requests
       set gorus = trim(p_gorus),
           onerilen_company_id = p_onerilen,
           durum = 'tamamlandi',
           updated_at = now()
     where id = p_request_id and consultant_id = auth.uid()
    returning lead_id, investor_id into v_lead, v_yat;

    if v_lead is null then raise exception 'Bu talep size ait değil'; end if;

    select co.full_name into v_ad from public.consultants co where co.id = auth.uid();

    insert into public.notifications (user_id, title, body, icon, link)
    values (v_yat,
            'Teklif değerlendirmeniz hazır',
            coalesce(v_ad, 'Danışmanınız') || ' aldığınız teklifleri değerlendirdi.',
            '⚖️', '#yatirimci-panel');
end;
$$;

grant execute on function public.danisman_gorus_yaz(uuid, text, uuid) to authenticated;


-- --------------------------------------------- 8) YATIRIMCI GÖRÜŞÜ OKUR
create or replace function public.teklif_gorusu(p_lead_id uuid)
returns table (
    request_id uuid, danisman_id uuid, danisman text, unvan text,
    durum text, gorus text, onerilen_company_id uuid, onerilen_firma text,
    tarih timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select cr.id, co.id, co.full_name, co.title, cr.durum, cr.gorus,
           cr.onerilen_company_id, c.name, cr.updated_at
    from public.consultation_requests cr
    join public.consultants co on co.id = cr.consultant_id
    left join public.companies c on c.id = cr.onerilen_company_id
    where cr.lead_id = p_lead_id and cr.investor_id = auth.uid()
    order by cr.updated_at desc;
$$;

grant execute on function public.teklif_gorusu(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA — DÜZELTMENİN İŞE YARADIĞINI GÖR
--  Bir teklif kaydedip yatırımcı panelinde "Bu firmayı seç" düğmesinin
--  AÇILDIĞINI doğrulayın. Düzeltme öncesi bu düğme hiçbir zaman açılmıyordu.
--
--  Danışmanın maliyet görmediğini teyit için (items dönmemeli):
--    select * from public.danisman_teklif_ozeti('<talep-id>');
-- ============================================================================
