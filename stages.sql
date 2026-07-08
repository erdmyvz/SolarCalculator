-- ============================================================================
-- GENEL AŞAMA ETİKETLERİ (stage_labels)
-- CRM "Genel Aşama" adımlarının GÖRÜNEN adı ve açıklaması admin'den düzenlenir.
-- Anahtarlar sabittir (durum enum'una ve iş mantığına bağlı); admin yalnızca
-- etiket ve açıklamayı değiştirir, yeni aşama ekleyip silemez.
-- Herkes okur (dropdown için); yalnız admin düzenler.
-- Supabase > SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- ============================================================================

create table if not exists public.stage_labels (
  key         text primary key,
  label       text not null,
  description text,
  sort_order  int not null default 0
);

alter table public.stage_labels enable row level security;

drop policy if exists stage_read on public.stage_labels;
create policy stage_read on public.stage_labels for select using (true);
drop policy if exists stage_admin on public.stage_labels;
create policy stage_admin on public.stage_labels for all using (public.is_admin()) with check (public.is_admin());

grant select on public.stage_labels to anon, authenticated;
grant insert, update, delete on public.stage_labels to authenticated;

insert into public.stage_labels (key, label, description, sort_order) values
  ('yeni_basvuru',       '1. Yeni Başvuru',       'Yeni gelen başvuru; henüz iletişime geçilmedi.',        1),
  ('arandi_gorusuldu',   '2. İletişimde',         'Müşteriyle iletişim kuruldu, ihtiyaç görüşülüyor.',     2),
  ('teklif_gonderildi',  '3. Teklif İletildi',    'Teklif hazırlanıp müşteriye iletildi.',                 3),
  ('sozlesme_imzalandi', '4. Sözleşme İmzalandı', 'Sözleşme imzalandı, kuruluma hazırlanılıyor.',          4),
  ('kurulum_basladi',    '5. Kurulum Süreci',     'Saha kurulumu başladı.',                                5),
  ('resmi_surec',        '6. TEDAŞ Kabulünde',    'TEDAŞ/EDAŞ kabul ve resmi işlemler sürüyor.',           6),
  ('tamamlandi',         '7. Devreye Alındı 🚀',  'Sistem devreye alındı ve proje tamamlandı.',            7)
on conflict (key) do nothing;
