-- ============================================================================
--  danisman-rolu.sql
--
--  NE DEĞİŞİYOR
--  Danışman ARTIK FİRMA SEÇMİYOR. Danışanını sisteme kaydediyor, kayıt da
--  herkes gibi "en yakın 3 firma" kuralından geçiyor. Danışmanın işi firma
--  eşleştirmek değil; yatırımcıya güneş enerjisi sistemlerini anlatmak,
--  teklifleri yorumlamak, insani bir rehberlik katmanı olmak.
--
--  NEDEN ÖNEMLİ
--  Danışman firma seçebildiği sürece atama kuralı iki yerden delinir: bir
--  yatırımcı yakınındaki üç firmayı görürken, danışman üzerinden gelen
--  yatırımcı danışmanın tanıdığı tek firmaya gider. Kural tek olmalı.
--
--  ⚠️ assign_client_to_company() KALDIRILIYOR. Yerine danisan_crm_e_aktar()
--  geliyor: kaydı firmasız açar, yarışmalı atamayı çalıştırır.
--  yarismali-atama.sql önce çalıştırılmış olmalıdır.
--
--  ⚠️⚠️ BU DOSYAYI ARTIK ÇALIŞTIRMAYIN — eksik-fonksiyonlar.sql'i kullanın.
--  Aşağıdaki davetli_firmalar() ve firma_davetleri() ESKİ, HATALI sürümler:
--  teklif kontrolünü public.quotes üzerinde yapıyorlar. Gerçek tablo
--  firm_quotes. Bu hata teklif_var'ı hep false bırakıp yatırımcının
--  "Bu firmayı seç" düğmesini kalıcı kapatıyordu; teklif-danismanligi.sql
--  ile düzeltildi. Bu dosyayı tekrar çalıştırmak o hatayı GERİ GETİRİR.
--
--  Ayrıca danisan_crm_e_aktar() consultant_clients.city/district'e yazıyor;
--  o kolonlar tabloda YOK. eksik-fonksiyonlar.sql onları da ekliyor.
-- ============================================================================

alter table public.consultant_clients add column if not exists city     text;
alter table public.consultant_clients add column if not exists district text;


-- --------------------------------------------------- 1) DANIŞANI CRM'E AKTAR
drop function if exists public.assign_client_to_company(uuid, uuid);

create or replace function public.danisan_crm_e_aktar(
    p_client_id uuid,
    p_il        text,
    p_ilce      text default null,
    p_kapsam    int  default 2
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cli     public.consultant_clients%rowtype;
    v_cons_ad text;
    v_lead_id uuid;
    v_kod     text;
    v_not     text;
    v_sonuc   jsonb;
    i         int;
begin
    select * into v_cli from public.consultant_clients where id = p_client_id;
    if not found then raise exception 'Danışan kaydı bulunamadı'; end if;

    if v_cli.consultant_id is distinct from auth.uid() then
        raise exception 'Bu danışan size ait değil';
    end if;

    if coalesce(nullif(trim(v_cli.name), ''), '') = '' then
        raise exception 'Danışanın adı boş — aktarmadan önce doldurun';
    end if;

    if coalesce(trim(p_il), '') = '' then
        raise exception 'İl seçilmeden en yakın firmalar bulunamaz';
    end if;

    -- Zaten aktarılmışsa ikinci kayıt açma.
    if v_cli.lead_id is not null
       and exists (select 1 from public.leads l where l.id = v_cli.lead_id) then
        return jsonb_build_object('durum', 'zaten_aktarildi', 'takip_kodu', v_cli.tracking_code);
    end if;

    select co.full_name into v_cons_ad
    from public.consultants co where co.id = v_cli.consultant_id;

    v_not := coalesce(nullif(v_cli.notes, ''), '');
    if v_not <> '' then v_not := v_not || E'\n\n'; end if;
    v_not := v_not || '[Danışman yönlendirmesi: ' || coalesce(v_cons_ad, 'Danışman') || ']';

    -- ⚠️ company_id BİLEREK NULL: kayıt yarışmalı atamaya girsin.
    for i in 1..5 loop
        v_kod := public.epc_takip_kodu();
        begin
            insert into public.leads (
                company_id, full_name, phone, email, address, city, district, notes,
                source, status, tracking_code,
                consultant_client_id, consultant_name, created_at, updated_at
            ) values (
                null, v_cli.name, v_cli.phone, v_cli.email,
                coalesce(v_cli.address, ''), trim(p_il), nullif(trim(coalesce(p_ilce,'')),''), v_not,
                'consultant', 'yeni_basvuru', v_kod,
                p_client_id, v_cons_ad, now(), now()
            ) returning id into v_lead_id;
            exit;
        exception when unique_violation then
            v_lead_id := null;
        end;
    end loop;

    if v_lead_id is null then
        raise exception 'Takip kodu üretilemedi, tekrar deneyin';
    end if;

    update public.consultant_clients
       set lead_id       = v_lead_id,
           tracking_code = v_kod,
           city          = trim(p_il),
           district      = nullif(trim(coalesce(p_ilce,'')),''),
           install_status= 'atandi',
           -- Kazanan belli olana kadar firma YOK. lead_kazanan() dolduracak.
           assigned_company_id   = null,
           assigned_company_name = null,
           updated_at    = now()
     where id = p_client_id;

    v_sonuc := public.lead_firma_esle(v_kod, 3, p_kapsam);

    return jsonb_build_object(
        'durum', 'aktarildi',
        'takip_kodu', v_kod,
        'atanan_firma', coalesce((v_sonuc->>'atanan')::int, 0)
    );
end;
$$;

grant execute on function public.danisan_crm_e_aktar(uuid, text, text, int) to authenticated;


-- ------------------------------------------- 2) KAZANAN DANIŞANA DA YAZILSIN
-- Danışman artık firmayı seçmiyor ama HANGİ firmanın kazandığını görmeli.
create or replace function public.lead_kazanan(
    p_lead_id    uuid,
    p_company_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_lead  public.leads%rowtype;
    v_firma text;
begin
    select * into v_lead from public.leads where id = p_lead_id;
    if not found then raise exception 'Kayıt bulunamadı'; end if;

    if not (v_lead.investor_id = auth.uid() or public.is_admin()) then
        raise exception 'Bu kayıt için yetkiniz yok';
    end if;

    if not exists (select 1 from public.lead_assignments la
                    where la.lead_id = p_lead_id and la.company_id = p_company_id) then
        raise exception 'Bu firma bu talebe davet edilmemiş';
    end if;

    select c.name into v_firma from public.companies c where c.id = p_company_id;

    update public.leads set company_id = p_company_id, updated_at = now()
     where id = p_lead_id;

    update public.lead_assignments
       set durum = case when company_id = p_company_id then 'kazandi' else 'kaybetti' end,
           updated_at = now()
     where lead_id = p_lead_id;

    -- Danışman kaydı varsa kazanan firmayı oraya da yaz.
    if v_lead.consultant_client_id is not null then
        update public.consultant_clients
           set assigned_company_id   = p_company_id,
               assigned_company_name = v_firma,
               updated_at            = now()
         where id = v_lead.consultant_client_id;
    end if;

    insert into public.notifications (user_id, title, body, icon, link)
    select p.id,
           case when la.company_id = p_company_id
                then 'Teklifiniz kabul edildi 🎉' else 'Bu talepte başka firma seçildi' end,
           coalesce(v_lead.full_name, 'Yatırımcı') ||
               case when la.company_id = p_company_id
                    then ' teklifinizi kabul etti. Süreci CRM üzerinden yürütebilirsiniz.'
                    else ' başka bir firmayla devam etmeye karar verdi.' end,
           case when la.company_id = p_company_id then '🎉' else 'ℹ️' end,
           '#kurulumcu-panel/crm'
    from public.lead_assignments la
    join public.profiles p on p.company_id = la.company_id
    where la.lead_id = p_lead_id;

    -- Danışmana da haber ver.
    if v_lead.consultant_client_id is not null then
        insert into public.notifications (user_id, title, body, icon, link)
        select cc.consultant_id,
               'Firma seçildi — ' || coalesce(cc.name, 'danışan'),
               coalesce(v_firma, 'Bir firma') || ' ile devam edilecek.',
               '🏢', '#danisman-panel/danisan-takip'
        from public.consultant_clients cc where cc.id = v_lead.consultant_client_id;
    end if;

    return jsonb_build_object('kazanan', v_firma);
end;
$$;

grant execute on function public.lead_kazanan(uuid, uuid) to authenticated;


-- ------------------------------------- 3) YATIRIMCININ GÖRDÜĞÜ DAVETLİ FİRMALAR
-- Karşılaştırma ekranında "hangi firmalar davet edildi, hangisi teklif verdi".
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
           exists (select 1 from public.quotes q
                    where q.lead_id = p_lead_id and q.company_id = c.id)
    from public.lead_assignments la
    join public.companies c on c.id = la.company_id
    left join lateral public.firma_puan_ozeti(c.id) o on true
    where la.lead_id = p_lead_id
      and exists (select 1 from public.leads l
                   where l.id = p_lead_id
                     and (l.investor_id = auth.uid() or public.is_admin()))
    order by la.yakinlik, o.ortalama desc nulls last, c.name;
$$;

grant execute on function public.davetli_firmalar(uuid) to authenticated;


-- ------------------------------------------- 4) FİRMANIN GÖRDÜĞÜ DAVET LİSTESİ
-- Kurulumcu firma CRM'inde "yarışmalı davetler" bölümünü besler.
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
           exists (select 1 from public.quotes q
                    where q.lead_id = l.id and q.company_id = la.company_id),
           l.created_at
    from public.lead_assignments la
    join public.leads l on l.id = la.lead_id
    where la.company_id = public.my_company_id()
      and l.company_id is null            -- kazanan belli değilse yarışma sürüyor
    order by la.yakinlik, l.created_at desc;
$$;

grant execute on function public.firma_davetleri() to authenticated;


-- --------------------------------------------- 5) FİRMA YARIŞMA DURUMU YAZAR
create or replace function public.davet_durumu_yaz(p_assignment_id uuid, p_durum text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_durum not in ('davet', 'iletisim', 'teklif_verildi', 'vazgecti') then
        raise exception 'Geçersiz durum';
    end if;
    update public.lead_assignments
       set durum = p_durum, updated_at = now()
     where id = p_assignment_id
       and company_id = public.my_company_id();
    if not found then raise exception 'Bu davet size ait değil'; end if;
end;
$$;

grant execute on function public.davet_durumu_yaz(uuid, text) to authenticated;


-- -------------------------------------------- 6) PUANLANACAKLAR (yatırımcı)
create or replace function public.puanlanacaklar()
returns table (
    lead_id uuid, tesis text, firma_id uuid, firma text,
    danisman_id uuid, danisman text,
    puan_firma int, puan_platform int, puan_danisman int
)
language sql
stable
security definer
set search_path = public
as $$
    select l.id,
           coalesce(nullif(l.address, ''), coalesce(l.district || ' / ', '') || coalesce(l.city, 'Tesis')),
           c.id, c.name,
           cc.consultant_id, co.full_name,
           (select r.puan from public.ratings r where r.lead_id = l.id and r.hedef_tip = 'company'),
           (select r.puan from public.ratings r where r.lead_id = l.id and r.hedef_tip = 'platform'),
           (select r.puan from public.ratings r where r.lead_id = l.id and r.hedef_tip = 'consultant')
    from public.leads l
    left join public.companies c on c.id = l.company_id
    left join public.consultant_clients cc on cc.id = l.consultant_client_id
    left join public.consultants co on co.id = cc.consultant_id
    where l.investor_id = auth.uid()
      and l.status = 'tamamlandi'
    order by l.updated_at desc;
$$;

grant execute on function public.puanlanacaklar() to authenticated;


-- ------------------------------------------------- 7) ADMIN: YORUM ONAY KUYRUĞU
create or replace function public.bekleyen_yorumlar()
returns table (
    id uuid, hedef_tip text, hedef_ad text, puan int, yorum text, tarih timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select r.id, r.hedef_tip,
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

create or replace function public.yorum_karari(p_id uuid, p_karar text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_admin() then raise exception 'Yetkiniz yok'; end if;
    if p_karar not in ('approved', 'rejected') then raise exception 'Geçersiz karar'; end if;
    update public.ratings set yorum_durum = p_karar where id = p_id;
end;
$$;

grant execute on function public.bekleyen_yorumlar() to authenticated;
grant execute on function public.yorum_karari(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
--  ⚠️ ÇALIŞTIRDIKTAN SONRA MUTLAKA YAPILMASI GEREKEN
--
--  Hiçbir firmanın il/ilçesi girilmemiş; bu haliyle EŞLEŞTİRME HİÇ ÇALIŞMAZ:
--    select name, city, district from public.companies;
--
--  Firmalar profil sayfasından kendileri girebilir. Test için elle:
--    update public.companies set city = 'İstanbul', district = 'Pendik'
--     where name = 'FİRMA ADI';
--
--  Sonra kontrol:
--    select * from public.firma_sayilari('İstanbul', 'Pendik');
--    select * from public.en_yakin_firmalar('İstanbul', 'Pendik', 3, 2);
-- ============================================================================
