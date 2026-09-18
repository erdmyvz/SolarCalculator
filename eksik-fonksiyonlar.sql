-- ============================================================================
--  eksik-fonksiyonlar.sql
--
--  NE OLDU
--  danisman-rolu.sql veritabanına hiç geçmemiş. Canlıda tek tek ölçüldü:
--  o dosyada TANIMLI OLUP başka hiçbir dosyada bulunmayan beş fonksiyonun
--  hepsi eksik, başka dosyalarda da tanımlı olanların hepsi mevcut.
--
--    EKSİK : danisan_crm_e_aktar · davet_durumu_yaz · puanlanacaklar
--            bekleyen_yorumlar · yorum_karari
--    MEVCUT: lead_kazanan · davetli_firmalar · firma_davetleri (bunlar
--            yarismali-atama.sql ve teklif-danismanligi.sql'de de var)
--
--  NEYİ BOZUYORDU
--    · Firma CRM'indeki "İletişimde / Teklif verdim / Vazgeçtim" düğmeleri
--      çalışmıyordu — firma yarışmada "Yeni davet"te donuyordu.
--    · Danışman danışanını CRM'e aktaramıyordu.
--    · Yatırımcının puanlama ekranı boş geliyordu.
--    · Admin yorum onay kuyruğu yoktu.
--
--  ⚠️ NEDEN danisman-rolu.sql'İ DOĞRUDAN ÇALIŞTIRMIYORUZ
--  O dosya davetli_firmalar() ve firma_davetleri()'ni de yeniden tanımlıyor
--  ve ESKİ, HATALI sürümlerini içeriyor: teklif kontrolünü public.quotes
--  üzerinde yapıyorlar. Gerçek tablo firm_quotes; hata teklif_var'ı hep false
--  bırakıp yatırımcının "Bu firmayı seç" düğmesini kalıcı olarak kapatıyordu
--  (teklif-danismanligi.sql ile düzeltilmişti). Dosyayı tekrar çalıştırmak
--  o hatayı GERİ GETİRİRDİ. Bu yüzden burada yalnız eksik olanlar var.
--
--  yarismali-atama.sql ve teklif-danismanligi.sql çalıştırılmış olmalıdır.
-- ============================================================================


-- ---------------------------------------------- 0) EKSİK KOLONLAR
-- ⚠️ danisan_crm_e_aktar() bu iki kolona YAZIYOR ama tabloda yoklar.
-- Canlıda doğrulandı: consultant_clients.city / district → 42703.
-- Eklenmezse fonksiyon oluşur ama ÇALIŞMA ANINDA patlar; danışman
-- "aktar" dediğinde kayıt yarım kalırdı.
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
--  ÇALIŞTIRDIKTAN SONRA — EKSİKSİZ OLDUĞUNU GÖRÜN
--  Tarayıcı konsolunda (herhangi bir oturumla):
--
--    for (const f of ['danisan_crm_e_aktar','davet_durumu_yaz',
--                     'puanlanacaklar','bekleyen_yorumlar','yorum_karari']) {
--      const { error } = await supabaseClient.rpc(f, {});
--      console.log(f, error && error.code === 'PGRST202' ? 'EKSİK' : 'var');
--    }
--
--  Beşi de "var" demeli. (PGRST202 dışındaki hatalar normaldir — fonksiyon
--  vardır, yalnız boş parametreyi reddeder.)
--
--  Ardından firma hesabıyla CRM → Yarışmalı Davetler → "İletişimde"
--  düğmesine basın; durum değişmeli.
-- ============================================================================
