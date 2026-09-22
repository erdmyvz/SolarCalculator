-- ============================================================================
--  odeme-bildirimi-deneme.sql   — AYRI DOSYA, sonu `rollback`
--
--  Oturum açamadığım için auth.uid() request.jwt.claims ile taklit ediliyor.
--  Geri alındığı için yöneticiye posta GİTMEZ: gizli.eposta_kuyrugu'nda
--  tetikleyici yok, gönderimi dakikada bir çalışan cron yapıyor ve cron
--  commit edilmemiş satırı göremez.
--
--  Dört soru:
--   1) Firma hesabı bildirebiliyor mu, doğru ad/rol ile?
--   2) Yöneticiye bildirim + e-posta düşüyor mu?
--   3) ★ İkinci basış engelleniyor mu? (12 saat)
--   4) ★ Abonelik AÇILMIYOR, değil mi? — düğmenin asla yapmaması gereken şey
-- ============================================================================
begin;

select set_config('request.jwt.claims',
                  json_build_object('sub', u.id, 'role', 'authenticated')::text, true)
  from auth.users u where lower(u.email) = 'yavuz@enerjimall.com';

create temporary table _onces on commit drop as
select (select sub_ends_at from public.companies where name='Enerji') as bitis_once,
       (select count(*) from public.notifications where kind='odeme') as bildirim_once;

create temporary table _c1 on commit drop as select public.odeme_bildirdim('havale bugün yapıldı') as r;
create temporary table _c2 on commit drop as select public.odeme_bildirdim(null) as r;

select * from (
  select 1 as s, 'ilk bildirim gönderildi mi' as kontrol,
         (select (r->>'gonderildi') from _c1) as sonuc, 'true' as beklenen
  union all
  select 2, 'kullanıcıya dönen cevap',
         (select (r->>'mesaj') from _c1), ''
  union all
  select 3, '★ ikinci basış engellendi mi',
         (select (r->>'gonderildi') from _c2), 'false'
  union all
  select 4, 'ikinci basışın cevabı',
         (select left(r->>'mesaj', 55) || '…' from _c2), ''
  union all
  select 5, 'yöneticiye bildirim düştü mü',
         ((select count(*) from public.notifications where kind='odeme')
          - (select bildirim_once from _onces))::text, '1'
  union all
  select 6, 'bildirim başlığı',
         (select title from public.notifications where kind='odeme' order by created_at desc limit 1), ''
  union all
  select 7, 'yöneticiye e-posta kuyruğa girdi mi',
         (select count(*)::text from gizli.eposta_kuyrugu k
           where k.notification_id = (select id from public.notifications
                                       where kind='odeme' order by created_at desc limit 1)), '1'
  union all
  select 8, '★ ABONELİK AÇILDI MI (açılmamalı)',
         (select case when sub_ends_at is distinct from (select bitis_once from _onces)
                      then 'AÇILDI — ❌ düğme abonelik uzatıyor'
                      else 'hayır — ✅ süre değişmedi' end
            from public.companies where name='Enerji'), 'hayır — ✅ süre değişmedi'
) t order by s;

rollback;
