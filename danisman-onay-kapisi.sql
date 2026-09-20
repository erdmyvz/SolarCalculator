-- ============================================================================
--  danisman-onay-kapisi.sql
--
--  NE BULUNDU — REDDEDİLMİŞ DANIŞMANIN YETKİSİ TAM
--  Danışman ücretlendirmesini ölçmek için danışman hesabına girildiğinde
--  panel kırmızı bir kutu gösteriyordu:
--      "❌ Profiliniz reddedildi. Gerekçe: açıklama değiştir."
--  ...ve altındaki bütün araçlar ÇALIŞIYORDU. Canlıda doğrulandı:
--
--      · reddedilmiş danışman danışan ekleyebiliyor      → EVET (RLS izin veriyor)
--      · danisan_crm_e_aktar durum denetliyor mu         → HAYIR
--        (var olmayan kimlikle çağrıldığında "Danışan kaydı bulunamadı"
--         dönüyor; durum kapısı olsaydı ondan ÖNCE reddedilirdi)
--
--  SONUCU: Yöneticinin açıkça REDDETTİĞİ bir danışman, gerçek bir müşteriyi
--  yarışmalı atamaya sokabiliyor — üç firma davet ediliyor, bildirim
--  e-postaları gidiyor, komisyon kaydı doğuyor. Kırmızı kutu tamamen
--  SÜSTÜ: bir şey yasaklamıyordu.
--
--  ⚠️ Bu, bu projede tekrar tekrar çıkan aynı kusur: EKRAN BİR ŞEY SÖYLÜYOR,
--  MEKANİZMA BAŞKA ŞEY YAPIYOR. "Onaya gönderildi" derken draft'ta kalması,
--  "gonderildi" derken postanın teslim edilmemesi, "teklif verdi" derken
--  taslak olması... Bu da aynısı: "reddedildi" derken yetkisi duruyor.
--
--  KAPI NEREYE KONUYOR — ÖLÇÜLÜ OLSUN
--  Danışanı kendi defterine yazmak DIŞARI ETKİ ETMEZ; orası serbest kalıyor.
--  Yasaklanan yalnız DIŞARI AÇILAN iki eylem:
--      1) danisan_crm_e_aktar    → gerçek müşteriyi firmalara açar
--      2) teklif_danismanligi_iste → yatırımcının kararını etkiler
--  Onay bekleyen (pending) danışman da bu ikisini yapamaz: onay, yayına
--  çıkmadan önce gelmelidir; sonra değil.
--
--  ⚠️ eksik-fonksiyonlar.sql ve teklif-danismanligi.sql önce çalıştırılmış
--  olmalı. Aşağıdaki iki gövde onların CANLI hâlidir; tek fark baştaki kapı.
-- ============================================================================


-- ============================================ 1) ORTAK KAPI
-- Tek yerde tanımlı: iki fonksiyon aynı kuralı iki ayrı yorumla uygulamasın.
create or replace function public.danisman_yetkili_mi(p_consultant_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
    v public.consultants%rowtype;
begin
    select * into v from public.consultants where id = p_consultant_id;
    if not found then return 'Danışman kaydı bulunamadı'; end if;
    if coalesce(v.banned, false) then
        return 'Danışman hesabı askıya alınmış' ||
               coalesce(': ' || nullif(v.ban_reason, ''), '') || '.';
    end if;
    if coalesce(v.status, 'draft') <> 'approved' then
        return case coalesce(v.status, 'draft')
            when 'rejected' then
                'Danışman profiliniz reddedildi' ||
                coalesce(' (' || nullif(v.reject_reason, '') || ')', '') ||
                '. Düzeltip yeniden onaya gönderin; onaylanana kadar danışan aktaramazsınız.'
            when 'pending' then
                'Danışman profiliniz onay bekliyor. Onaylanana kadar danışan aktaramazsınız.'
            else
                'Danışman profiliniz henüz onaya gönderilmemiş. Profilinizi tamamlayıp onaya gönderin.'
        end;
    end if;
    return null;   -- null = yetkili
end $$;

grant execute on function public.danisman_yetkili_mi(uuid) to authenticated;


-- ============================================ 2) DANIŞANI CRM'E AKTAR
-- Gövde eksik-fonksiyonlar.sql'deki canlı hâliyle aynı; TEK FARK baştaki kapı.
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
    v_engel   text;
    i         int;
begin
    -- ⚠️ KAPI EN BAŞTA. Daha aşağıda olsaydı, kayıt bulunamadı/ad boş gibi
    -- hatalar önce dönerdi ve reddedilmiş danışman "sorun kayıtta" sanırdı.
    v_engel := public.danisman_yetkili_mi(auth.uid());
    if v_engel is not null then raise exception '%', v_engel; end if;

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


-- ============================================ 3) TEKLİF DANIŞMANLIĞI TALEBİ
-- Eski gövde yalnız `banned` bakıyordu; reddedilmiş danışmandan da görüş
-- istenebiliyordu. Yatırımcının kararını, yöneticinin elemiş olduğu biri
-- etkileyemez.
create or replace function public.teklif_danismanligi_iste(
    p_lead_id       uuid,
    p_consultant_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_lead  public.leads%rowtype;
    v_ad    text;
    v_engel text;
begin
    select * into v_lead from public.leads where id = p_lead_id;
    if not found then raise exception 'Kayıt bulunamadı'; end if;
    if v_lead.investor_id is distinct from auth.uid() then
        raise exception 'Yalnız kendi başvurunuz için danışmanlık isteyebilirsiniz';
    end if;

    -- ⚠️ Mesaj YATIRIMCIYA gidiyor: danışmanın ret gerekçesini ona
    -- göstermiyoruz, o danışmanın özel bilgisi.
    v_engel := public.danisman_yetkili_mi(p_consultant_id);
    if v_engel is not null then
        raise exception 'Bu danışman şu anda talep alamıyor.';
    end if;

    select co.full_name into v_ad from public.consultants co where co.id = p_consultant_id;

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


-- ============================================ 4) PANELİN DÜRÜST CEVABI
-- Ekran, düğmeyi bastırmadan ÖNCE kapıyı sorabilsin diye. Danışman kendi
-- durumunu zaten görüyor; bu yalnız aynı kuralı tek kaynaktan okutuyor.
create or replace function public.danisman_yetkim()
returns table (yetkili boolean, engel text)
language sql stable security definer set search_path = public as $$
    select public.danisman_yetkili_mi(auth.uid()) is null,
           public.danisman_yetkili_mi(auth.uid());
$$;

grant execute on function public.danisman_yetkim() to authenticated;


-- ============================================ 5) ÖLÇÜMDEKİ KENDİ HATAM
-- ⚠️ danisman_deger_ozeti() reddedilmiş danışmanı listeden ÇIKARIYORDU.
-- Ama yukarıda görüldüğü gibi reddedilmiş danışmanın geçmişte iş getirmiş
-- olması mümkün. Onu gizlemek, "kaybolan gerçek" kusurunun ölçüm aletinin
-- İÇİNDE tekrarı olurdu. Artık herkes görünüyor; durum ayrı kolonda.
create or replace function public.danisman_deger_ozeti()
returns table (
    consultant_id uuid, danisman text, eposta text,
    onay text, abonelik text, abonelik_bitis timestamptz,
    getirdigi int, baglanan int, tamamlanan int,
    is_hacmi_try numeric, komisyon_try numeric, pay_try numeric,
    degerlendirme int, ort_cevap_saat numeric,
    oneri_sayisi int, oneri_tutan int
)
language sql stable security definer set search_path = public as $$
    select co.id, co.full_name, co.email,
           case when coalesce(co.banned, false) then 'askida'
                else coalesce(co.status, 'draft') end,
           co.sub_status, co.sub_ends_at,
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
     order by co.full_name;
$$;

grant execute on function public.danisman_deger_ozeti() to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA — kapının gerçekten kapandığını görmek için
--  (reddedilmiş danışman hesabıyla, tarayıcı konsolunda)
--
--      await supabaseClient.rpc('danisman_yetkim')
--      → { yetkili: false, engel: "Danışman profiliniz reddedildi (...)" }
--
--      await supabaseClient.rpc('danisan_crm_e_aktar',
--            { p_client_id: '00000000-0000-0000-0000-000000000000', p_il: 'İstanbul' })
--      → artık "Danışan kaydı bulunamadı" DEĞİL, ret gerekçesi dönmeli.
--        Sıra önemli: kapı en başta demektir.
-- ============================================================================
