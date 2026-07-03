-- ============================================================================
-- BACKFILL — Mevcut (eski usulle kaydolmuş) firmaları yeni modele taşır
-- Supabase > SQL Editor'de bir kez çalıştırın.
-- Ne yapar:
--   1) admin dışındaki rolleri 'company' olarak normalize eder
--   2) company_id'si boş her firma-profili için bir companies kaydı oluşturur
--      ve profili o firmaya bağlar.
-- Güvenli: yalnız eksik olanları tamamlar, tekrar çalıştırmak zarar vermez.
-- ============================================================================

-- 1) Rol normalizasyonu (admin hariç herkes 'company')
update public.profiles
set role = 'company'
where role is distinct from 'admin';

-- 2) Eksik firma kayıtlarını oluştur ve profile bağla
do $$
declare
  r record;
  v_company uuid;
begin
  for r in
    select id, company_name, phone
    from public.profiles
    where company_id is null
      and role = 'company'
      and coalesce(company_name, '') <> ''
  loop
    insert into public.companies(name, phone)
    values (r.company_name, r.phone)
    returning id into v_company;

    update public.profiles set company_id = v_company where id = r.id;
  end loop;
end $$;

-- Kontrol: firmalar ve bağlı profiller
-- select p.first_name, p.last_name, p.role, c.name as firma
-- from public.profiles p left join public.companies c on c.id = p.company_id
-- order by p.role;
