-- ============================================================================
--  eposta-hata-gorunurlugu.sql
--
--  NE OLDU
--  İlk deneme postasında yakalandı: satır 'gonderiliyor'dan 'bekliyor'a
--  döndü, yani Resend isteği REDDETTİ ve kuyruk yeniden denemeye aldı.
--  Ama yönetim ekranı hiçbir şey göstermedi:
--
--      eposta_son_hatalar  →  where durum = 'hata'
--
--  Hata metni satıra yazılıyor ama satırın durumu üç deneme dolana kadar
--  'bekliyor' kalıyor. Admin ekranda "Sırada 1" görüyor — kuyruk işliyor
--  sanıyor. Oysa hiçbir e-posta gitmiyor.
--
--  Bu, bu dosyanın en başta önlemek için yazıldığı hatanın ta kendisi:
--  sessiz başarısızlık. "Sırada" ile "gönderilemedi, tekrar denenecek"
--  aynı şey değil.
--
--  DÜZELTME
--  1) eposta_son_hatalar artık hata metni olan HER satırı gösteriyor,
--     durumu ne olursa olsun; durum ve kaçıncı deneme olduğu da geliyor.
--  2) eposta_kuyruk_ozeti'ne 'hatali' sütunu eklendi: o durumdaki kaç
--     satırın üzerinde çözülmemiş bir hata var.
-- ============================================================================


-- Hata metni olan her satır — 'bekliyor'da bekleyen de dâhil.
drop function if exists public.eposta_son_hatalar(int);

create or replace function public.eposta_son_hatalar(p_limit int default 10)
returns table (
    alici text, konu text, durum text, deneme int,
    http_kod int, hata text, ne_zaman timestamptz
)
language sql stable security definer set search_path = public as $$
    select k.alici, k.konu, k.durum, k.deneme, k.http_kod, k.hata,
           coalesce(k.sonuc_at, k.islem_at, k.created_at)
      from gizli.eposta_kuyrugu k
     where public.is_admin()
       and k.hata is not null
     order by coalesce(k.sonuc_at, k.islem_at, k.created_at) desc
     limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;


-- Özete "üzerinde çözülmemiş hata olan satır" sayısı eklendi.
drop function if exists public.eposta_kuyruk_ozeti();

create or replace function public.eposta_kuyruk_ozeti()
returns table (durum text, adet bigint, hatali bigint, son timestamptz)
language sql stable security definer set search_path = public as $$
    select k.durum,
           count(*)::bigint,
           count(*) filter (where k.hata is not null)::bigint,
           max(k.created_at)
      from gizli.eposta_kuyrugu k
     where public.is_admin()
     group by k.durum
     order by k.durum;
$$;

grant execute on function public.eposta_son_hatalar(int)  to authenticated;
grant execute on function public.eposta_kuyruk_ozeti()    to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA (admin hesabıyla, tarayıcı konsolunda)
--      await supabaseClient.rpc('eposta_son_hatalar', { p_limit: 5 })
--  Bekleyen deneme postasının neden reddedildiğini artık metin olarak
--  göreceksiniz (büyük olasılıkla alan adı doğrulaması).
-- ============================================================================
