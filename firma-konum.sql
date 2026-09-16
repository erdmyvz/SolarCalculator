-- ============================================================================
--  firma-konum.sql
--
--  NEDEN GEREKLİ
--  Yatırımcıya "konumuna en yakın 3 firma" gösteriliyor. Bu sıralama
--  companies.city / district üzerinden yapılıyor ve şu an HİÇBİR firmada dolu
--  değil — yani eşleştirme bugün hiç çalışmıyor, sessizce boş liste dönüyor.
--
--  Kayıt formuna il/ilçe eklendi. bootstrap_company() bu alanları almıyor ve
--  gövdesi bilinmediği için ONA DOKUNULMUYOR; konum kayıt sırasında, oturum
--  kapanmadan hemen önce bu fonksiyonla yazılıyor.
--
--  ⚠️ Firma yalnız KENDİ satırını günceller ve yalnız bu iki alanı. Ünvan,
--  abonelik, ban gibi alanlar buradan değiştirilemez.
-- ============================================================================

create or replace function public.firma_konum_yaz(
    p_il   text,
    p_ilce text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_co uuid;
begin
    if coalesce(trim(coalesce(p_il, '')), '') = '' then
        raise exception 'İl boş olamaz';
    end if;

    v_co := public.my_company_id();
    if v_co is null then
        raise exception 'Hesabınız bir firmaya bağlı değil';
    end if;

    update public.companies
       set city     = trim(p_il),
           district = nullif(trim(coalesce(p_ilce, '')), '')
     where id = v_co;

    return jsonb_build_object('yazildi', true, 'company_id', v_co);
end;
$$;

grant execute on function public.firma_konum_yaz(text, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
--  MEVCUT FİRMALAR — kayıt formu yalnız YENİ kayıtları kapsar.
--  Zaten kayıtlı firmalar ya Profilim sayfasından girer ya da elle:
--
--    select id, name, city, district from public.companies order by name;
--    update public.companies set city='İstanbul', district='Pendik'
--     where name = 'FİRMA ADI';
--
--  Konumu olmayan firma en_yakin_firmalar() sonuçlarına HİÇ girmez.
--  Kontrol:
--    select count(*) filter (where city is null) as konumsuz,
--           count(*) as toplam from public.companies where coalesce(banned,false)=false;
-- ============================================================================
