-- ============================================================================
--  danisman-crm-koprusu.sql
--
--  SORUN
--  consultant_clients ve leads birbirinden habersiz iki tabloydu. Danışman bir
--  danışanı kurulumcu firmaya "atadığında" firmanın CRM'inde hiçbir şey olmuyor,
--  firma müşteriyi elle açmak zorunda kalıyordu. Sonra iki ayrı kayıt iki ayrı
--  durum taşıyordu: danışmanın install_status'u ile firmanın CRM aşaması.
--  İkisini de aynı kişi güncellemek zorundaydı; biri unutulunca sessizce
--  yanlış bilgi gösteriyorlardı.
--
--  ÇÖZÜM
--  1) leads.consultant_client_id — tek yönlü bağ (bir danışana tek lead).
--  2) assign_client_to_company() — atama anında firmanın CRM'ine kayıt düşer.
--  3) leads.status değişince tetikleyici install_status'u yazar + danışmana
--     bildirim atar. Artık TEK doğru kaynak var: CRM aşaması.
--
--  Sunucudan doğrulandı (tahmin değil):
--    · leads: company_id, full_name, phone, email, address, notes, source,
--             status, tracking_code, completed_steps VAR
--             consultant_client_id / consultant_name YOK  → ekleniyor
--    · consultant_clients: name, phone, email, status, install_status,
--             assigned_company_id/_name, notes VAR
--             address / lead_id / tracking_code YOK        → ekleniyor
--    · consultants.full_name VAR (name YOK), consultants.id = auth kimliği
--    · notifications: user_id, title, body, icon, link, is_read
--    · profiles.company_id VAR (full_name YOK)
-- ============================================================================

-- ------------------------------------------------------------------ 1) ŞEMA
alter table public.consultant_clients add column if not exists address       text;
alter table public.consultant_clients add column if not exists lead_id       uuid;
alter table public.consultant_clients add column if not exists tracking_code text;

alter table public.leads add column if not exists consultant_client_id uuid
    references public.consultant_clients(id) on delete set null;
alter table public.leads add column if not exists consultant_name text;

-- Bir danışan yalnız BİR firmanın listesinde olabilir. Kısmi benzersizlik:
-- consultant_client_id null olan (normal) kayıtlar bu kısıttan etkilenmez.
create unique index if not exists leads_consultant_client_uniq
    on public.leads (consultant_client_id)
 where consultant_client_id is not null;


-- --------------------------------------------------------- 2) TAKİP KODU
-- crm.js'teki üreteçle aynı alfabe: O ve I yok (0/1 ile karışmasın).
create or replace function public.epc_takip_kodu()
returns text
language plpgsql
as $$
declare
    alfabe constant text := '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    kod text := '';
    i   int;
begin
    for i in 1..8 loop
        kod := kod || substr(alfabe, 1 + floor(random() * length(alfabe))::int, 1);
    end loop;
    return 'EPC-' || kod;
end;
$$;


-- ------------------------------------------------------- 3) AŞAMA ETİKETİ
-- core.js'teki crmStatusLabels ile aynı metinler — bildirimde de aynısı görünsün.
create or replace function public.epc_asama_etiketi(p_status text)
returns text
language sql
immutable
as $$
    select case p_status
        when 'yeni_basvuru'       then 'Yeni başvuru'
        when 'arandi_gorusuldu'   then 'İletişime geçildi'
        when 'teklif_gonderildi'  then 'Teklif iletildi'
        when 'sozlesme_imzalandi' then 'Sözleşme imzalandı'
        when 'kurulum_basladi'    then 'Kurulum başladı'
        when 'resmi_surec'        then 'TEDAŞ kabul sürecinde'
        when 'tamamlandi'         then 'Devreye alındı'
        else 'Durum güncellendi'
    end;
$$;


-- ------------------------------------------------------------- 4) ATAMA RPC
-- Danışman firma seçtiğinde çağrılır. RLS danışmanın başka firmanın leads
-- tablosuna yazmasına izin vermez; bu yüzden security definer.
drop function if exists public.assign_client_to_company(uuid, uuid);

create function public.assign_client_to_company(
    p_client_id  uuid,
    p_company_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cli       public.consultant_clients%rowtype;
    v_firma_ad  text;
    v_eski_lead uuid;
    v_lead_id   uuid;
    v_kod       text;
    v_cons_ad   text;
    v_not       text;
    i           int;
begin
    select * into v_cli from public.consultant_clients where id = p_client_id;
    if not found then
        raise exception 'Danışan kaydı bulunamadı';
    end if;

    -- ⚠️ Sahiplik kontrolü: başka danışmanın danışanı bir firmaya atanamaz.
    if v_cli.consultant_id is distinct from auth.uid() then
        raise exception 'Bu danışan size ait değil';
    end if;

    select l.id into v_eski_lead
      from public.leads l
     where l.consultant_client_id = p_client_id;

    -- ---------------------------------------------------- ATAMA KALDIRILIYOR
    if p_company_id is null then
        if v_eski_lead is not null then
            -- Firmanın kaydını SİLMİYORUZ: üzerinde teklif, not, görüşme olabilir.
            -- Yalnız bağı koparıp ne olduğunu kartın notuna yazıyoruz.
            update public.leads
               set consultant_client_id = null,
                   notes = coalesce(notes, '') ||
                           E'\n\n[' || to_char(now(), 'DD.MM.YYYY') ||
                           ' — Danışman bu yönlendirmeyi geri çekti.]',
                   updated_at = now()
             where id = v_eski_lead;
        end if;

        update public.consultant_clients
           set assigned_company_id   = null,
               assigned_company_name = null,
               lead_id               = null,
               tracking_code         = null,
               install_status        = null,
               updated_at            = now()
         where id = p_client_id;

        return jsonb_build_object('durum', 'kaldirildi');
    end if;

    -- Ad boşsa firmaya gidecek kart işe yaramaz; sessizce eksik kayıt açmayalım.
    if coalesce(nullif(trim(v_cli.name), ''), '') = '' then
        raise exception 'Danışanın adı boş — firmaya aktarmadan önce doldurun';
    end if;

    select c.name into v_firma_ad
      from public.companies c
     where c.id = p_company_id
       and coalesce(c.banned, false) = false;
    if v_firma_ad is null then
        raise exception 'Firma bulunamadı veya kapalı';
    end if;

    -- Aynı firmaya zaten aktarılmışsa tekrar kayıt açma (çift kayıt olmasın).
    if v_eski_lead is not null and v_cli.assigned_company_id = p_company_id then
        update public.consultant_clients
           set assigned_company_name = v_firma_ad,
               lead_id               = v_eski_lead,
               updated_at            = now()
         where id = p_client_id;
        return jsonb_build_object('durum', 'zaten_bagli', 'lead_id', v_eski_lead);
    end if;

    -- Başka firmadaydı: eski kaydı o firmada bırak, bağı kopar.
    if v_eski_lead is not null then
        update public.leads
           set consultant_client_id = null,
               notes = coalesce(notes, '') ||
                       E'\n\n[' || to_char(now(), 'DD.MM.YYYY') ||
                       ' — Danışman bu müşteriyi başka bir firmaya yönlendirdi.]',
               updated_at = now()
         where id = v_eski_lead;
    end if;

    select co.full_name into v_cons_ad
      from public.consultants co where co.id = v_cli.consultant_id;

    v_not := coalesce(nullif(v_cli.notes, ''), '');
    if v_not <> '' then v_not := v_not || E'\n\n'; end if;
    v_not := v_not || '[Danışman yönlendirmesi: ' || coalesce(v_cons_ad, 'Danışman') || ']';

    -- Takip kodu benzersiz olmalı: çakışırsa yeni kod üretip tekrar dene.
    for i in 1..5 loop
        v_kod := public.epc_takip_kodu();
        begin
            insert into public.leads (
                company_id, full_name, phone, email, address, notes,
                source, status, tracking_code,
                consultant_client_id, consultant_name, created_at, updated_at
            ) values (
                p_company_id, v_cli.name, v_cli.phone, v_cli.email,
                coalesce(v_cli.address, ''), v_not,
                'consultant', 'yeni_basvuru', v_kod,
                p_client_id, v_cons_ad, now(), now()
            ) returning id into v_lead_id;
            exit;
        exception when unique_violation then
            v_lead_id := null;
        end;
    end loop;

    if v_lead_id is null then
        raise exception 'Takip kodu üretilemedi, lütfen tekrar deneyin';
    end if;

    update public.consultant_clients
       set assigned_company_id   = p_company_id,
           assigned_company_name = v_firma_ad,
           lead_id               = v_lead_id,
           tracking_code         = v_kod,
           install_status        = 'atandi',
           updated_at            = now()
     where id = p_client_id;

    -- Firmanın TÜM kullanıcılarına bildir — kimse yeni müşteriyi kaçırmasın.
    insert into public.notifications (user_id, title, body, icon, link)
    select p.id,
           'Danışmandan yeni müşteri — ' || coalesce(v_cli.name, 'isimsiz kayıt'),
           coalesce(v_cons_ad, 'Bir danışman') ||
               ' bu müşteriyi size yönlendirdi. Kayıt CRM listenizde.',
           '🎯',
           '#kurulumcu-panel/crm'
      from public.profiles p
     where p.company_id = p_company_id;

    return jsonb_build_object(
        'durum', 'olusturuldu',
        'lead_id', v_lead_id,
        'takip_kodu', v_kod,
        'firma', v_firma_ad
    );
end;
$$;

grant execute on function public.assign_client_to_company(uuid, uuid) to authenticated;


-- --------------------------------------------------- 5) AŞAMA → DANIŞMANA
-- Firma CRM'de süreç adımı işaretliyor, crm.js aşamayı adımlardan türetip
-- leads.status'a yazıyor. Tetikleyici bunu yakalayıp danışanın kaydına
-- işliyor. Danışmanın leads tablosunu okuma yetkisi yok; kendi tablosundaki
-- install_status üzerinden görüyor.
--
-- NOT: install_status'taki 'kesif' (Keşif Yapıldı) CRM aşamalarında karşılığı
-- olmayan tek değer. Bağlı danışanlarda bu değer artık oluşmaz.
create or replace function public.epc_lead_durumu_danismana()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ins    text;
    v_cons   uuid;
    v_ad     text;
    v_firma  text;
begin
    if new.consultant_client_id is null then return new; end if;
    if new.status is not distinct from old.status then return new; end if;

    v_ins := case new.status
        when 'yeni_basvuru'       then 'atandi'
        when 'arandi_gorusuldu'   then 'iletisim'
        when 'teklif_gonderildi'  then 'teklif'
        when 'sozlesme_imzalandi' then 'sozlesme'
        when 'kurulum_basladi'    then 'kurulum'
        when 'resmi_surec'        then 'kurulum'
        when 'tamamlandi'         then 'tamamlandi'
        else null
    end;
    if v_ins is null then return new; end if;

    update public.consultant_clients cc
       set install_status = v_ins,
           updated_at     = now()
     where cc.id = new.consultant_client_id
    returning cc.consultant_id, cc.name into v_cons, v_ad;

    if v_cons is null then return new; end if;

    select c.name into v_firma from public.companies c where c.id = new.company_id;

    insert into public.notifications (user_id, title, body, icon, link)
    values (
        v_cons,
        public.epc_asama_etiketi(new.status) || ' — ' || coalesce(v_ad, 'danışan'),
        coalesce(v_firma, 'Kurulumcu firma') || ' süreci güncelledi.',
        case new.status when 'tamamlandi' then '✅' else '🔧' end,
        '#danisman-panel/danisan-takip'
    );

    return new;
end;
$$;

drop trigger if exists leads_durum_danismana on public.leads;

create trigger leads_durum_danismana
after update of status on public.leads
for each row execute function public.epc_lead_durumu_danismana();


-- ------------------------------------------- 6) ESKİ ELLE GÜNCELLEME YOLU
-- messaging.js'teki "Danışman Kanalı" ekranı hâlâ bu fonksiyonu çağırıyor.
-- Bağlı danışanlarda artık TEK kaynak CRM aşaması — buradan yazmayı kapatıyoruz
-- ki iki ekran birbiriyle çelişmesin. Bağsız (eski usul) danışanlarda çalışmaya
-- devam eder.
--
-- Ayrıca eski etiketler ('basvuru', 'kurulumda', 'iptal') arayüzdeki gerçek
-- değerlerle uyuşmuyordu; hepsi "Durum güncellendi" diye bildiriliyordu.
drop function if exists public.set_client_install_status(uuid, text);

create function public.set_client_install_status(
    p_client_id uuid,
    p_status    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_company_id   uuid;
    v_consultant   uuid;
    v_client_name  text;
    v_company_name text;
    v_etiket       text;
begin
    if exists (select 1 from public.leads l where l.consultant_client_id = p_client_id) then
        raise exception 'Bu danışan CRM listenize aktarıldı. Durumu müşteri kartındaki süreç adımlarından güncelleyin.';
    end if;

    select p.company_id into v_company_id
      from public.profiles p where p.id = auth.uid();

    if v_company_id is null then
        raise exception 'Firma kaydı bulunamadı';
    end if;

    update public.consultant_clients cc
       set install_status = nullif(p_status, ''),
           updated_at     = now()
     where cc.id = p_client_id
       and cc.assigned_company_id = v_company_id
    returning cc.consultant_id, cc.name into v_consultant, v_client_name;

    if v_consultant is null then
        raise exception 'Bu danışan firmanıza atanmamış';
    end if;

    select c.name into v_company_name
      from public.companies c where c.id = v_company_id;

    v_etiket := case nullif(p_status, '')
        when 'atandi'     then 'Atandı'
        when 'iletisim'   then 'İletişime geçildi'
        when 'kesif'      then 'Keşif yapıldı'
        when 'teklif'     then 'Teklif verildi'
        when 'sozlesme'   then 'Sözleşme imzalandı'
        when 'kurulum'    then 'Kurulum aşamasında'
        when 'tamamlandi' then 'Kurulum tamamlandı'
        else 'Durum güncellendi'
    end;

    insert into public.notifications (user_id, title, body, icon, link)
    values (
        v_consultant,
        v_etiket || ' — ' || coalesce(v_client_name, 'danışan'),
        coalesce(v_company_name, 'Kurulumcu firma') || ' kurulum durumunu güncelledi.',
        case nullif(p_status, '') when 'tamamlandi' then '✅' else '🔧' end,
        '#danisman-panel/danisan-takip'
    );
end;
$$;

grant execute on function public.set_client_install_status(uuid, text) to authenticated;


-- PostgREST şema önbelleği: yeni kolon ve fonksiyonlar görünsün.
notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA
--
--  Kolonlar yerinde mi:
--    select column_name from information_schema.columns
--     where table_name = 'leads' and column_name in ('consultant_client_id','consultant_name');
--
--  Tetikleyici kurulu mu:
--    select tgname from pg_trigger where tgrelid = 'public.leads'::regclass
--       and not tgisinternal;
--
--  ESKİ ATAMALAR: bu betik geçmişe dokunmaz. Daha önce firma atanmış
--  danışanlar CRM'e düşmez. Danışman o danışanı açıp firmayı yeniden
--  kaydettiğinde kayıt oluşur (fonksiyon "atanmış ama lead yok" halini
--  tanıyıp tamamlıyor).
-- ============================================================================
