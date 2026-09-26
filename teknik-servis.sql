-- ============================================================================
--  teknik-servis.sql — /teknik-servis iniş sayfası veri katmanı
--
--  ⚠️ BU DOSYA DEĞİŞTİ. İlk sürümde teknik_servis_talebi() adında yeni bir RPC
--  yazılmıştı. Sonradan görüldü ki panelin kendi servis formu zaten
--  submit_service_request() RPC'sini kullanıyor: aynı alanlar, görsel
--  yükleme ve takip kodu (SRV-YYYY-NNNN) dahil. İki ayrı yol tutmak, ileride
--  yalnız birine eklenen bir alanın diğerinde sessizce eksik kalması demekti.
--  İniş sayfası mevcut RPC'ye bağlandı; yeni yazılan RPC kaldırıldı.
--
--  submit_service_request() zaten anon'a grant edilmiş ve support-images
--  kovasında anonim INSERT/SELECT politikası var; iniş sayfası için ek bir
--  izin gerekmedi.
-- ============================================================================

-- Kullanılmayan RPC'yi kaldır (yalnız bu projede, 26.09.2026'da eklenmişti).
drop function if exists public.teknik_servis_talebi(text,text,text,text,text,text,text);

-- ============================================================================
--  ADMIN SİLME POLİTİKASI
--
--  service_requests'te INSERT/SELECT/UPDATE politikaları vardı ama DELETE
--  YOKTU. RLS açıkken politikası olmayan işlem SESSİZCE 0 satır etkiler:
--  panelden silmeye çalışınca hata gelmez, kayıt da gitmez. Reklamla birlikte
--  spam ve yinelenen talepler gelecek; yöneticinin temizleyebilmesi gerekiyor.
-- ============================================================================
drop policy if exists sr_delete on public.service_requests;
create policy sr_delete on public.service_requests
    for delete to authenticated
    using (public.is_admin());

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
--  DOĞRULAMA
-- ---------------------------------------------------------------------------
select 'politikalar' as kontrol, string_agg(cmd, ', ' order by cmd) as deger
  from pg_policies where tablename='service_requests'
union all
select 'kaldirilan rpc hala var mi',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='teknik_servis_talebi')
union all
select 'request_type kisiti',
       (select pg_get_constraintdef(c.oid) from pg_constraint c
         where c.conrelid='public.service_requests'::regclass
           and pg_get_constraintdef(c.oid) ilike '%request_type%' limit 1);
