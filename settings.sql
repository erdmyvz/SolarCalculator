-- ============================================================================
-- UYGULAMA AYARLARI (app_settings) — hesaplayıcı/teklif/batarya referans değerleri
-- Herkes okur (public hesaplayıcılar için); yalnız admin düzenler.
-- Supabase > SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- ============================================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      numeric not null,
  label      text,
  category   text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select using (true);
drop policy if exists settings_admin on public.app_settings;
create policy settings_admin on public.app_settings for all using (public.is_admin()) with check (public.is_admin());

grant select on public.app_settings to anon, authenticated;
grant insert, update, delete on public.app_settings to authenticated;

insert into public.app_settings (key, value, label, category) values
  ('solarYield',     1500,  'Yıllık üretim (kWh/kWp)',            'solar'),
  ('roofM2PerKwp',   5.5,   'Çatı alanı (m²/kWp)',                'solar'),
  ('kwpPerPanel',    0.55,  'Panel gücü (kWp/panel)',             'solar'),
  ('pricePerKwp',    30000, 'Referans kurulum bedeli (TL/kWp)',   'solar'),
  ('co2PerKwh',      0.45,  'CO₂ katsayısı (kg/kWh)',             'solar'),
  ('tariff',         2.5,   'Elektrik tarifesi (TL/kWh)',         'solar'),
  ('batteryDod',     0.9,   'Batarya deşarj derinliği (0-1)',     'battery'),
  ('inverterEff',    0.95,  'İnverter verimi (0-1)',              'battery'),
  ('batteryModule',  5,     'Batarya ünite boyutu (kWh)',         'battery'),
  ('inverterSurge',  1.3,   'İnverter kalkış katsayısı',          'battery')
on conflict (key) do nothing;
