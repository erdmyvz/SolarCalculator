-- ============================================================================
--  tesis-kodu.sql — service_requests.facility_code
--
--  SORUN: Hem paneldeki servis formu hem /teknik-servis sayfası "Tesis Kodu"
--  alanı gösteriyordu, ama tabloda böyle bir sütun YOKTU. submit_service_request
--  parametreyi alıp yalnız arama için kullanıyordu:
--
--      if p_facility_code is not null then
--          select id, company_id into v_project, v_company
--            from public.projects where facility_code = p_facility_code;
--      end if;
--
--  Kod projects'te eşleşirse project_id doluyordu; EŞLEŞMEZSE girilen değer
--  tamamen kayboluyordu. Müşteri kodu yazıyor, yönetici hiç göremiyordu.
--
--  Artık ham değer de saklanıyor. Eşleşme mantığı AYNEN korundu.
-- ============================================================================

alter table public.service_requests add column if not exists facility_code text;

create or replace function public.submit_service_request(
    p_request_type    text,
    p_full_name       text,
    p_phone           text,
    p_email           text,
    p_address         text,
    p_inverter_model  text default null,
    p_battery_model   text default null,
    p_installer_name  text default null,
    p_install_date    date default null,
    p_problem_date    date default null,
    p_problem_desc    text default null,
    p_img_system      text default null,
    p_img_pano        text default null,
    p_img_ges         text default null,
    p_img_code        text default null,
    p_facility_code   text default null,
    p_company_id      uuid default null
) returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_code    text;
    v_project uuid;
    v_company uuid;
    v_tesis   text;
begin
    v_code  := public.gen_tracking_code('SRV');
    v_tesis := nullif(trim(p_facility_code), '');

    -- Eşleşme mantığı değişmedi: kod bir tesise denk gelirse talep o projeye
    -- ve projenin firmasına bağlanır.
    if v_tesis is not null then
        select id, company_id into v_project, v_company
          from public.projects where facility_code = v_tesis;
    end if;

    insert into public.service_requests(
        tracking_code, project_id, company_id, request_type, full_name, phone,
        email, address, inverter_model, battery_model, installer_name,
        install_date, problem_date, problem_desc,
        img_system, img_pano, img_ges, img_code,
        facility_code                                  -- YENİ: ham değer saklanıyor
    ) values (
        v_code, v_project, coalesce(v_company, p_company_id),
        coalesce(p_request_type, 'ariza'),
        p_full_name, p_phone, p_email, p_address,
        p_inverter_model, p_battery_model, p_installer_name,
        p_install_date, p_problem_date, p_problem_desc,
        p_img_system, p_img_pano, p_img_ges, p_img_code,
        v_tesis
    );

    return v_code;
end;
$function$;

revoke all     on function public.submit_service_request(text,text,text,text,text,text,text,text,date,date,text,text,text,text,text,text,uuid) from public;
grant  execute on function public.submit_service_request(text,text,text,text,text,text,text,text,date,date,text,text,text,text,text,text,uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
--  DOĞRULAMA
-- ---------------------------------------------------------------------------
select 'sutun eklendi mi' as kontrol,
       (select count(*)::text from information_schema.columns
         where table_schema='public' and table_name='service_requests'
           and column_name='facility_code') as deger
union all
select 'insert icinde geciyor mu',
       (case when pg_get_functiondef(p.oid) ilike '%facility_code%YENİ%'
                  or pg_get_functiondef(p.oid) ilike '%img_code,%facility_code%'
             then 'evet' else 'kontrol et' end)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='submit_service_request';
