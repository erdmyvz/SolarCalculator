-- ============================================================================
--  firma-konum-admin.sql
--
--  NEDEN GEREKLİ
--  Yarışmalı atamanın tamamı companies.city üzerine kurulu:
--
--      en_yakin_firmalar() ... where c.city is not null
--                                and epc_yakinlik(...) <= kapsam
--
--  Canlı veritabanında kayıtlı tek firmanın (Enerji) city'si NULL. Ölçtük:
--      firma_sayilari('İstanbul','Kartal') → {0,0,0,0}
--      en_yakin_firmalar('İstanbul','Kartal',3,4) → []      (kapsam=4, yani
--                                                            tüm Türkiye)
--  Yani bugün bir yatırımcı başvursa HİÇBİR firma eşleşmez; yarışma başlamaz.
--
--  Kayıt formuna il/ilçe eklendi (12a2b82) ama o tarihten ÖNCE kaydolmuş
--  firmalar boş kaldı ve admin panelinde firma konumu girilebilecek hiçbir
--  ekran yok — "Firmalar" sekmesi profilleri listeliyor, "Düzenle" düğmesinin
--  onclick'i bile yok.
--
--  Bu dosya iki fonksiyon ekliyor; admin paneli bunları kullanıyor.
--
--  ⚠️ companies tablosuna doğrudan UPDATE verilmiyor. RLS politikalarının
--  gövdesi bilinmiyor; SECURITY DEFINER + is_admin() kontrolü hem kesin hem
--  denetlenebilir.
--
--  yarismali-atama.sql (epc_norm, il_bolge) önce çalıştırılmış olmalıdır.
-- ============================================================================


-- ------------------------------------------------- 1) FİRMALARIN KONUM DURUMU
-- Admin ekranını besler. Konumu boş olanlar ÖNCE gelir — iş listesi gibi.
create or replace function public.firmalar_konum()
returns table (
    id uuid, ad text, il text, ilce text,
    banned boolean, basvuru int, bolge text
)
language sql
stable
security definer
set search_path = public
as $$
    select c.id,
           c.name,
           c.city,
           c.district,
           coalesce(c.banned, false),
           (select count(*)::int from public.leads l where l.company_id = c.id),
           (select b.bolge from public.il_bolge b
             where public.epc_norm(b.il) = public.epc_norm(coalesce(c.city, '')))
      from public.companies c
     where public.is_admin()
     order by (c.city is null or btrim(c.city) = '') desc, c.name;
$$;

grant execute on function public.firmalar_konum() to authenticated;


-- ----------------------------------------------------------- 2) KONUMU YAZ
-- ⚠️ İL SERBEST METİN OLARAK KABUL EDİLMİYOR.
-- epc_yakinlik() il adlarını epc_norm ile karşılaştırıyor; yine de tabloya
-- "Istanbul" yazılırsa il_bolge ile eşleşmeyip BÖLGE kademesi (3) çalışmaz.
-- Bu yüzden gelen değer 81 illik tablodan doğrulanıyor ve tablodaki KANONİK
-- yazımla kaydediliyor. Böylece companies.city tek biçimde kalıyor.
create or replace function public.firma_konum_admin(
    p_company_id uuid,
    p_il         text,
    p_ilce       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_il   text;
    v_ilce text;
    v_ad   text;
begin
    if not public.is_admin() then
        raise exception 'Yetkiniz yok';
    end if;
    if coalesce(btrim(coalesce(p_il, '')), '') = '' then
        raise exception 'İl boş olamaz';
    end if;

    select b.il into v_il
      from public.il_bolge b
     where public.epc_norm(b.il) = public.epc_norm(p_il)
     limit 1;

    if v_il is null then
        raise exception 'Tanınmayan il: % — 81 il listesinden biri olmalı', p_il;
    end if;

    v_ilce := nullif(btrim(coalesce(p_ilce, '')), '');

    update public.companies
       set city = v_il, district = v_ilce
     where id = p_company_id
    returning name into v_ad;

    if v_ad is null then
        raise exception 'Firma bulunamadı: %', p_company_id;
    end if;

    return jsonb_build_object('firma', v_ad, 'il', v_il, 'ilce', v_ilce);
end;
$$;

grant execute on function public.firma_konum_admin(uuid, text, text) to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA
--
--  1) Admin paneli → Üyeler → 🏢 Firmalar → "Firma Konumları" kutusu.
--     Konumu boş firmalar en üstte, kırmızı "konum yok" etiketiyle gelir.
--     İl seç, ilçe yaz, Kaydet.
--
--  2) Doğrulama (anon anahtarla da çalışır, oturum gerekmez):
--       select * from public.firma_sayilari('İstanbul', 'Kartal');
--       select * from public.en_yakin_firmalar('İstanbul', 'Kartal', 3, 2);
--     İlk sorgu artık sıfırdan farklı, ikincisi firmayı döndürmeli.
--
--  3) Uçtan uca: ana sayfadan keşif talebi oluşturun, takip koduyla
--     lead_konum_yaz() ve lead_firma_esle() çalışır; lead_assignments'ta
--     davet satırları oluşur.
-- ============================================================================
