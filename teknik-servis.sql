-- ============================================================================
--  teknik-servis.sql — /teknik-servis iniş sayfasının başvuru yolu
--
--  NEDEN RPC: service_requests'in insert politikası
--      check ((company_id = auth_company_id()) or is_admin())
--  yani ANONİM ziyaretçi yazamaz. Reklamdan gelen kişinin hesabı olmayacağı
--  için formun doğrudan insert'i sessizce reddedilirdi. leads tarafındaki
--  submit_lead ile aynı çözüm: SECURITY DEFINER bir RPC.
--
--  KORUMA: basvuru_hiz_guard tetikleyicisi service_requests'te zaten kurulu
--  ve yalnız auth.uid() IS NULL iken çalışıyor. SECURITY DEFINER içinde de
--  auth.uid() null kaldığı için hız sınırı BU YOLDA DA geçerli — ek bir şey
--  yapmaya gerek yok (e-posta 3/15dk · 6/gün, IP 8/15dk · 25/gün).
-- ============================================================================

create or replace function public.teknik_servis_talebi(
    p_full_name      text,
    p_phone          text,
    p_email          text,
    p_address        text,
    p_request_type   text default 'ariza',
    p_inverter_model text default null,
    p_problem_desc   text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_kod text;
    v_id  uuid;
begin
    if coalesce(trim(p_full_name), '') = '' or coalesce(trim(p_phone), '') = '' then
        raise exception 'Ad soyad ve telefon zorunludur';
    end if;
    if coalesce(trim(p_email), '') = '' then
        -- Hız sınırı e-posta üzerinden çalışıyor; boş e-posta korumayı delerdi.
        raise exception 'E-posta adresi zorunludur';
    end if;

    -- Takip kodu benzersiz olmalı; çakışırsa yeniden üret.
    for i in 1..5 loop
        v_kod := public.epc_takip_kodu();
        begin
            insert into public.service_requests (
                tracking_code, company_id, request_type,
                full_name, phone, email, address,
                inverter_model, problem_desc, status, created_at
            ) values (
                v_kod, null, coalesce(nullif(trim(p_request_type), ''), 'ariza'),
                trim(p_full_name), trim(p_phone), lower(trim(p_email)), coalesce(trim(p_address), ''),
                nullif(trim(p_inverter_model), ''), nullif(trim(p_problem_desc), ''),
                'basvuru_iletildi', now()
            ) returning id into v_id;
            exit;
        exception when unique_violation then
            v_id := null;
        end;
    end loop;

    if v_id is null then
        raise exception 'Takip kodu üretilemedi, lütfen tekrar deneyin';
    end if;

    return v_kod;
end $$;

revoke all     on function public.teknik_servis_talebi(text,text,text,text,text,text,text) from public;
grant  execute on function public.teknik_servis_talebi(text,text,text,text,text,text,text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
--  DOĞRULAMA — fonksiyon kurulu mu, yetkiler doğru mu
-- ---------------------------------------------------------------------------
select p.proname || ' | güvenlik=' ||
       case when p.prosecdef then 'DEFINER' else 'INVOKER' end ||
       ' | yetkiler=' || coalesce(array_to_string(p.proacl::text[], ' '), '(varsayılan)') as kontrol
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'teknik_servis_talebi';

-- ============================================================================
--  ADMIN SİLME POLİTİKASI
--
--  service_requests'te INSERT/SELECT/UPDATE politikaları vardı ama DELETE YOKTU.
--  RLS açıkken politikası olmayan işlem SESSİZCE 0 satır etkiler: panelden
--  silmeye çalışınca hata gelmez, kayıt da gitmez. Reklamla birlikte spam ve
--  yinelenen talepler gelecek; yöneticinin bunları temizleyebilmesi gerekiyor.
-- ============================================================================
drop policy if exists sr_delete on public.service_requests;
create policy sr_delete on public.service_requests
    for delete to authenticated
    using (public.is_admin());

notify pgrst, 'reload schema';
