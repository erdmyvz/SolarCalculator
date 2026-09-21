-- ============================================================================
--  abonelik-veri-katmani.sql
--
--  Süresi dolmuş firma YENİ TEKLİF ÜRETEMEZ — artık veri katmanında.
--
--  NEDEN GEREKTİ
--  Kilit ekranı (showRenewalScreen) arayüzde çalışıyor ve sıradan kullanıcıyı
--  durduruyor. Ama RLS politikaları abonelik durumuna hiç bakmıyordu:
--      fq_all → is_admin() OR company_id = (kendi profilinin company_id'si)
--  Yani arayüzü atlayıp doğrudan API'ye istek atan biri teklif üretmeye devam
--  edebilirdi. Kuralın yaşadığı yer arayüz değil, burasıdır.
--
--  NEDEN TETİKLEYİCİ, NEDEN RLS DEĞİL
--  RLS politikasına koşul eklemek iki sorun doğururdu:
--    1) Politika ihlali "new row violates row-level security policy for table
--       firm_quotes" der. Firma bunu okuyup ne yapacağını anlayamaz — nitekim
--       leads_source_check'te tam olarak bu yaşandı, hatanın sebebini bulmak
--       için kısıt tanımını okumak gerekti.
--    2) fq_all FOR ALL olduğu için USING'e koşul eklemek OKUMAYI da keserdi;
--       süresi dolmuş firma kendi geçmiş tekliflerini göremez olurdu. Bu
--       yanlış: borcu olan da kendi verisini görebilmeli.
--  Tetikleyici yalnız INSERT'i kesiyor ve firmaya ne yapacağını söylüyor.
--
--  KAPSAM — BİLEREK DAR
--  Yalnız INSERT. Var olan teklifin durumunu güncellemek (gönderildi/kabul/ret)
--  serbest kalıyor: bunlar yeni değer üretmez, geçmişi kayda geçirir. Süresi
--  dolmuş firmanın "müşteri kabul etti" bilgisini işleyememesi kimseye fayda
--  sağlamaz, veriyi eksik bırakır.
--
--  ⚠️ NULL sub_ends_at ENGELLENMİYOR. Arayüzdeki kapı da aynı davranıyor:
--      if (sub && sub.endsAt && new Date(sub.endsAt) < Date.now())
--  İki katman aynı kuralı uygulamalı; biri "null = geçersiz" deyip öteki
--  "null = geçerli" derse aradaki fark bir gün birinin canını yakar.
-- ============================================================================


-- ============================================ 1) ORTAK KONTROL
-- Tek yerde tanımlı: ileride tedarikçi/danışman tarafına da açılırsa aynı
-- kural iki ayrı yorumla uygulanmasın.
create or replace function public.firma_abonelik_engeli(p_company_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
    v public.companies%rowtype;
begin
    select * into v from public.companies where id = p_company_id;
    if not found then return 'Firma kaydı bulunamadı.'; end if;

    if coalesce(v.banned, false) then
        return 'Firma hesabı askıya alınmış' ||
               coalesce(': ' || nullif(v.ban_reason, ''), '') || '.';
    end if;

    -- null = süre tanımsız; arayüzdeki kapı da engellemiyor.
    if v.sub_ends_at is not null and v.sub_ends_at < now() then
        return 'Aboneliğiniz ' || to_char(v.sub_ends_at, 'DD.MM.YYYY') ||
               ' tarihinde sona erdi. Yeni teklif oluşturabilmek için aboneliğinizi ' ||
               'yenileyin; mevcut teklifleriniz ve kayıtlarınız duruyor.';
    end if;

    return null;   -- null = engel yok
end $$;

grant execute on function public.firma_abonelik_engeli(uuid) to authenticated;


-- ============================================ 2) TEKLİF ÜRETİMİ
create or replace function public.firm_quotes_abonelik_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_engel text;
begin
    -- Yönetici muaf: platform dışı bir işi sisteme işlemesi gerekebilir ve
    -- kimin yaptığı zaten kayıtlı.
    if public.is_admin() then return new; end if;

    v_engel := public.firma_abonelik_engeli(new.company_id);
    if v_engel is not null then
        raise exception '%', v_engel;
    end if;

    return new;
end $$;

drop trigger if exists firm_quotes_abonelik_trg on public.firm_quotes;
create trigger firm_quotes_abonelik_trg before insert on public.firm_quotes
    for each row execute function public.firm_quotes_abonelik_guard();


-- ============================================ 3) ARAYÜZE SORULABİLİR HÂLE GETİR
-- Sihirbaz, kullanıcıyı formu doldurtup en sonda reddetmek yerine baştan
-- uyarabilsin diye. Kural yine sunucuda; bu yalnız aynı cevabı önceden okutuyor.
create or replace function public.teklif_yazabilir_miyim()
returns table (yazabilir boolean, engel text)
language sql stable security definer set search_path = public as $$
    select public.firma_abonelik_engeli(public.my_company_id()) is null,
           public.firma_abonelik_engeli(public.my_company_id());
$$;

grant execute on function public.teklif_yazabilir_miyim() to authenticated;


notify pgrst, 'reload schema';


-- ============================================================================
--  ⚠️ DENEME BU DOSYADA DEĞİL — abonelik-veri-katmani-deneme.sql'de.
--  İlk yazımda deneme bloğu bu dosyanın sonundaydı ve `rollback;` ile
--  bitiyordu. Supabase SQL editörü betiği TEK İŞLEM olarak çalıştırdığı için
--  o rollback, create function ve create trigger dâhil HER ŞEYİ geri aldı:
--  kurulum yapıldı sanıldı, aslında hiçbir şey kurulmadı. Kurulum ile geri
--  alınan deneme aynı dosyada yaşayamaz.
-- ============================================================================
