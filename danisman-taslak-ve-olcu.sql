-- ============================================================================
--  danisman-taslak-ve-olcu.sql
--
--  İKİ DÜZELTME — ikisi de "teklif" sayılan şeyin tanımıyla ilgili.
--
--  ================ 1) DANIŞMAN TASLAK TEKLİFLERİ GÖRÜYORDU
--  Platformda "teklif verildi" ölçüsü her yerde aynı: GÖNDERİLMİŞ teklif.
--        davetli_firmalar        → in ('sent','accepted')
--        firma_davetleri         → in ('sent','accepted')
--        komisyon_kazanan_teklif → in ('sent','accepted')
--        danisan_firma_secenekleri → in ('sent','accepted')
--  İki fonksiyon bu kuralın dışında kalmış:
--        danisman_talepleri      → <> 'revised'     ← taslak da sayıyor
--        danisman_teklif_ozeti   → <> 'revised'     ← taslağı GÖSTERİYOR
--
--  Sonuçları:
--    · Danışman, firmanın HENÜZ GÖNDERMEDİĞİ teklifi görüyor. Taslak firmanın
--      çalışma kâğıdıdır; üzerinde oynadığı, taahhüt etmediği bir fiyattır.
--      Üçüncü bir tarafa açılması ticari olarak kabul edilemez — bu dosyanın
--      kardeşi teklif-danismanligi.sql maliyet/kâr gizliliğini düşünmüş ama
--      taslağın kendisini atlamış.
--    · Danışman "3 teklif var" görüp yatırımcıya görüş yazarken yatırımcının
--      ekranı "teklifler bekleniyor" diyor. İki taraf farklı gerçek görüyor.
--    · Danışman, müşterinin hiç görmediği bir teklife dayanarak firma
--      önerebiliyor.
--
--  ⚠️ BUGÜN ISIRMADI: tarandı, hiçbir kayıtta taslak teklif yok (0 satır).
--  Yani kimseye zarar vermemiş. Bir sonraki taslak teklifte ısırırdı.
--
--  ================ 2) TEKLİFSİZ GÖRÜŞ ÖLÇÜMÜ ŞİŞİRİYORDU
--  Değerlendirme ekranı, teklif gelmemiş bir başvuruda dürüstçe
--  "Bu başvuruya henüz teklif gelmemiş" diyor — ama görüş formu açık ve
--  gönderilebiliyor. Gönderilirse consultant_credits'e tur='degerlendirme'
--  satırı düşüyor: DEĞERLENDİRİLMİŞ HİÇBİR TEKLİF OLMADAN.
--
--  Bu, danışman ücretlendirmesini ölçmek için kurduğumuz aletin tam da
--  ölçmek istediği şeyi bozar: "danışman kaç teklif değerlendirdi" sorusunun
--  cevabına, hiç teklif içermeyen görüşler karışır.
--
--  ⚠️ Formu KAPATMIYORUM. "Henüz teklif yok, beklemenizi öneririm" da geçerli
--  bir danışmanlıktır ve yatırımcıya faydalıdır. Yasaklamak ürün kararıdır,
--  bana ait değil. Yaptığım şey ÖLÇÜMÜ DÜRÜST TUTMAK: görüş yazıldığı andaki
--  gönderilmiş teklif sayısı satıra yazılıyor, sıfır olanlar ortalamaya
--  girmiyor ve yönetim ekranında ayrı görünüyor.
-- ============================================================================


-- ============================================ 1) TALEP KUYRUĞU
create or replace function public.danisman_talepleri()
returns table (
    request_id uuid, lead_id uuid, yatirimci text, il text, ilce text,
    durum text, teklif_sayisi int, gorus text, onerilen_company_id uuid,
    created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select cr.id, cr.lead_id, l.full_name, l.city, l.district, cr.durum,
           -- ⚠️ GÖNDERİLMİŞ teklif. Taslak, firmanın müşteriye henüz
           -- vermediği fiyattır; danışman onu görmemeli, saymamalı.
           (select count(*)::int from public.firm_quotes q
             where q.lead_id = l.id
               and coalesce(q.status,'') in ('sent','accepted')),
           cr.gorus, cr.onerilen_company_id, cr.created_at
    from public.consultation_requests cr
    join public.leads l on l.id = cr.lead_id
    where cr.consultant_id = auth.uid()
    order by case cr.durum when 'acik' then 0 else 1 end, cr.created_at desc;
$$;

grant execute on function public.danisman_talepleri() to authenticated;


-- ============================================ 2) DANIŞMANIN GÖRDÜĞÜ ÖZET
-- items hâlâ DÖNMÜYOR (maliyet/kâr gizliliği). Ek olarak artık taslak da
-- dönmüyor.
create or replace function public.danisman_teklif_ozeti(p_request_id uuid)
returns table (
    quote_id uuid, company_id uuid, firma text, teklif_no text,
    kwp numeric, panel_sayisi int, batarya_kwh numeric, yillik_uretim numeric,
    bedel_usd numeric, bedel_try numeric, bedel_try_kdv numeric,
    firma_puani numeric, firma_puan_adedi int, tarih timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select q.id, q.company_id, c.name, q.quote_no,
           (q.system->>'kwp')::numeric,
           (q.system->>'panels')::int,
           (q.system->>'battery_kwh')::numeric,
           (q.system->>'annual_prod')::numeric,
           (q.totals->>'total_usd')::numeric,
           (q.totals->>'total_try')::numeric,
           (q.totals->>'total_try_vat')::numeric,
           o.ortalama, o.adet,
           q.created_at
    from public.consultation_requests cr
    join public.firm_quotes q on q.lead_id = cr.lead_id
    join public.companies c on c.id = q.company_id
    left join lateral public.firma_puan_ozeti(c.id) o on true
    where cr.id = p_request_id
      and cr.consultant_id = auth.uid()
      -- ⚠️ Eskiden <> 'revised' idi: firmanın göndermediği TASLAK teklif
      -- üçüncü bir tarafa açılıyordu.
      and coalesce(q.status, '') in ('sent','accepted')
    order by (q.totals->>'total_try_vat')::numeric nulls last;
$$;

grant execute on function public.danisman_teklif_ozeti(uuid) to authenticated;


-- ============================================ 3) ÖLÇÜME TEKLİF SAYISI
alter table public.consultant_credits
    add column if not exists teklif_sayisi int;

create or replace function public.danisman_degerlendirme_takip()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_ucret numeric;
    v_saat  numeric;
    v_secim uuid;
    v_adet  int;
begin
    if new.durum <> 'tamamlandi' or old.durum is not distinct from new.durum then
        return new;
    end if;

    v_ucret := coalesce((select s.value from public.app_settings s
                          where s.key = 'danismanDegerlendirmeUcret'), 0);

    v_saat := round(extract(epoch from (now() - new.created_at)) / 3600.0, 1);

    select l.company_id into v_secim from public.leads l where l.id = new.lead_id;

    -- ⚠️ Görüşün yazıldığı ANDAKİ gönderilmiş teklif sayısı. Sonradan gelen
    -- teklifler bu görüşün kapsamına girmez; sayıyı da donduruyoruz.
    select count(*)::int into v_adet
      from public.firm_quotes q
     where q.lead_id = new.lead_id
       and coalesce(q.status,'') in ('sent','accepted');

    insert into public.consultant_credits (
        consultant_id, tur, lead_id, request_id,
        pay_try, durum, cevap_saat, oneri_tuttu, teklif_sayisi, hakedis_at
    ) values (
        new.consultant_id, 'degerlendirme', new.lead_id, new.id,
        v_ucret, 'hakedildi', v_saat,
        case when new.onerilen_company_id is null or v_secim is null then null
             else (new.onerilen_company_id = v_secim) end,
        v_adet,
        now()
    )
    on conflict (tur, lead_id, consultant_id) do update
       set request_id    = excluded.request_id,
           cevap_saat    = excluded.cevap_saat,
           oneri_tuttu   = coalesce(excluded.oneri_tuttu, public.consultant_credits.oneri_tuttu),
           teklif_sayisi = excluded.teklif_sayisi,
           updated_at    = now();

    return new;
exception when others then
    raise warning 'danışman değerlendirme kaydı yazılamadı (talep %): %', new.id, sqlerrm;
    return new;
end $$;

-- Var olan değerlendirme satırlarına teklif sayısını yaz.
update public.consultant_credits k
   set teklif_sayisi = (select count(*)::int from public.firm_quotes q
                         where q.lead_id = k.lead_id
                           and coalesce(q.status,'') in ('sent','accepted'))
 where k.tur = 'degerlendirme' and k.teklif_sayisi is null;


-- ============================================ 4) ÖZET: BOŞ GÖRÜŞÜ AYIR
-- ⚠️ degerlendirme sayısı artık YALNIZ teklif içeren görüşleri sayıyor.
-- Teklifsiz görüşler ayrı kolonda; gizlenmiyor ama ortalamayı bozmuyor.
drop function if exists public.danisman_deger_ozeti();

create or replace function public.danisman_deger_ozeti()
returns table (
    consultant_id uuid, danisman text, eposta text,
    onay text, abonelik text, abonelik_bitis timestamptz,
    getirdigi int, baglanan int, tamamlanan int,
    is_hacmi_try numeric, komisyon_try numeric, pay_try numeric,
    degerlendirme int, teklifsiz_gorus int, ort_cevap_saat numeric,
    oneri_sayisi int, oneri_tutan int
)
language sql stable security definer set search_path = public as $$
    select co.id, co.full_name, co.email,
           case when coalesce(co.banned, false) then 'askida'
                else coalesce(co.status, 'draft') end,
           co.sub_status, co.sub_ends_at,
           (select count(*)::int from public.consultant_clients cc
             join public.leads l on l.id = cc.lead_id
            where cc.consultant_id = co.id),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'yonlendirme' and k.durum <> 'iptal'),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'yonlendirme' and k.durum = 'hakedildi'),
           (select coalesce(sum(k.is_tutari_try), 0) from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'yonlendirme' and k.durum <> 'iptal'),
           (select coalesce(sum(k.komisyon_try), 0) from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'yonlendirme' and k.durum <> 'iptal'),
           (select coalesce(sum(k.pay_try), 0) from public.consultant_credits k
            where k.consultant_id = co.id and k.durum <> 'iptal'),
           -- teklif içeren görüşler
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'degerlendirme'
              and k.durum <> 'iptal' and coalesce(k.teklif_sayisi, 0) > 0),
           -- teklifsiz görüşler (ayrı sayılır)
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'degerlendirme'
              and k.durum <> 'iptal' and coalesce(k.teklif_sayisi, 0) = 0),
           -- ortalama cevap süresi de yalnız teklif içeren görüşlerden
           (select round(avg(k.cevap_saat), 1) from public.consultant_credits k
            where k.consultant_id = co.id and k.tur = 'degerlendirme'
              and k.cevap_saat is not null and coalesce(k.teklif_sayisi, 0) > 0),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.oneri_tuttu is not null),
           (select count(*)::int from public.consultant_credits k
            where k.consultant_id = co.id and k.oneri_tuttu = true)
      from public.consultants co
     where public.is_admin()
     order by co.full_name;
$$;

grant execute on function public.danisman_deger_ozeti() to authenticated;


notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA
--  Danışman hesabıyla: taslak teklifi olan bir başvuruda
--      await supabaseClient.rpc('danisman_teklif_ozeti', { p_request_id: '…' })
--  → taslak satır ARTIK DÖNMEMELİ.
--
--  Yönetici hesabıyla:
--      await supabaseClient.rpc('danisman_deger_ozeti')
--  → degerlendirme ve teklifsiz_gorus ayrı kolonlarda.
-- ============================================================================
