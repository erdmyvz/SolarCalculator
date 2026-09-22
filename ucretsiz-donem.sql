-- ============================================================================
--  ucretsiz-donem.sql
--
--  YAYIN ÖNCESİ ÜCRETSİZ DÖNEM — 15.11.2026'ya kadar.
--
--  NEDEN
--  Ortada tüzel kişilik yok; mükellefiyet 15.11.2026'ya kadar açılacak. O
--  tarihe kadar fatura kesilemez. Fatura kesemeyeceğimiz bir hizmet için
--  kişisel IBAN'a para istemek hem firmayı çıkmaza sokar (ödediğini gider
--  yazamaz) hem bizi faturasız tahsilat durumuna düşürür. Bu dönemde
--  reklamlarla firma ve yatırımcı toplanacak; tahsilat şirket açılınca.
--
--  ⚠️ TARİH TEK YERDE: app_settings.ucretsizDonemBitis.
--  app_settings.value NUMERIC olduğu için tarih YYYYAAGG sayısı olarak
--  tutuluyor (20261115). Metin kolonu eklemek paylaşılan şemayı değiştirmek
--  olurdu; sayı kodlaması çirkin ama yerel ve yönetim panelinden düzenlenebilir.
--
--  ⚠️ 16 KASIM UÇURUMU — KODUN KENDİSİYLE ÇÖZÜLDÜ
--  Tarih geçtiğinde herkes AYNI ANDA kilitli ekrana düşerdi, çünkü
--  sub_ends_at değerleri çoktan geçmiş. Ücretsiz dönemde kaydolan firma
--  16 Kasım sabahı paneli kapalı bulurdu — verdiğimiz sözün tersi.
--
--  Bu yüzden geçerli bitiş = EN GEÇ OLANI:
--      greatest(sub_ends_at, ücretsiz dönem bitişi + 7 gün)
--  Yani ücretsiz dönem biterken herkesin normal deneme süresi kendiliğinden
--  başlıyor. Elle veri düzeltmeye, "o gün şunu çalıştırmayı unutma"ya gerek
--  yok — unutulacak bir adım bırakmamak, hatırlatma yazmaktan güvenli.
--
--  ⚠️ ENGELLİ HESAP YİNE ENGELLİ. Ücretsiz dönem "herkese açık" demek değil,
--  yalnız "ödeme istenmiyor" demek.
-- ============================================================================


-- ============================================ 1) TARİH
insert into public.app_settings (key, value, label, category)
select 'ucretsizDonemBitis', 20261115,
       'Yayın öncesi ücretsiz dönemin son günü (YYYYAAGG)', 'Abonelik'
where not exists (select 1 from public.app_settings where key = 'ucretsizDonemBitis');

update public.app_settings set value = 20261115 where key = 'ucretsizDonemBitis';


-- ============================================ 2) TEK DOĞRU KAYNAK
create or replace function public.ucretsiz_donem()
returns table (aktif boolean, bitis date, deneme_bitisi date)
language sql stable security definer set search_path = public as $$
    with d as (
        select to_date(
                 coalesce((select s.value from public.app_settings s
                            where s.key = 'ucretsizDonemBitis'), 0)::bigint::text,
                 'YYYYMMDD') as bitis
    )
    select (d.bitis >= current_date), d.bitis, (d.bitis + 7)::date from d;
$$;

grant execute on function public.ucretsiz_donem() to anon, authenticated;


-- ============================================ 3) GEÇERLİ BİTİŞ TARİHİ
-- Hem veri katmanı hem arayüz bunu soruyor ki iki yer aynı günü söylesin.
create or replace function public.gecerli_abonelik_bitisi(p_ends_at timestamptz)
returns timestamptz
language sql stable security definer set search_path = public as $$
    select greatest(
        coalesce(p_ends_at, 'epoch'::timestamptz),
        ((select deneme_bitisi from public.ucretsiz_donem()) + 1)::timestamptz
    );
$$;

grant execute on function public.gecerli_abonelik_bitisi(timestamptz) to anon, authenticated;


-- ============================================ 4) VERİ KATMANI
create or replace function public.firma_abonelik_engeli(p_company_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
    v        public.companies%rowtype;
    v_gecerli timestamptz;
begin
    select * into v from public.companies where id = p_company_id;
    if not found then return 'Firma kaydı bulunamadı.'; end if;

    -- ⚠️ BAN her zaman önce. Ücretsiz dönem ödemeyi kaldırır, yasağı değil.
    if coalesce(v.banned, false) then
        return 'Firma hesabı askıya alınmış' ||
               coalesce(': ' || nullif(v.ban_reason, ''), '') || '.';
    end if;

    v_gecerli := public.gecerli_abonelik_bitisi(v.sub_ends_at);

    if v_gecerli < now() then
        return 'Aboneliğiniz ' || to_char(v_gecerli, 'DD.MM.YYYY') ||
               ' tarihinde sona erdi. Yeni teklif oluşturabilmek için aboneliğinizi ' ||
               'yenileyin; mevcut teklifleriniz ve kayıtlarınız duruyor.';
    end if;

    return null;
end $$;


notify pgrst, 'reload schema';

-- ============================================================================
--  ⚠️ onur Pehlivan İSTİSNASI HÂLÂ ELLE YAPILACAK.
--  Kendisine "yayına çıktığımız günden itibaren 2 ay ücretsiz" sözü verildi
--  (22.09.2026, e-posta teslim edildi). sub_ends_at şu an 31.12.2026 —
--  greatest() sayesinde ücretsiz dönem bitişinden etkilenmiyor. Yayın günü
--  yayın + 2 ay olarak ayarlanmalı.
-- ============================================================================
