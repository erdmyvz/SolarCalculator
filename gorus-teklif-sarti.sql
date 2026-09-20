-- ============================================================================
--  gorus-teklif-sarti.sql
--
--  KARAR: teklif gelmemiş bir başvuruya görüş yazılamaz.
--
--  Önceki adımda formu bilerek açık bırakmıştım ("henüz teklif yok, bekleyin"
--  de bir danışmanlıktır) ve ölçümü ayırmakla yetinmiştim. Kullanıcı formun
--  kapatılmasını istedi; kural artık tek: DEĞERLENDİRİLECEK TEKLİF YOKSA
--  DEĞERLENDİRME YOK.
--
--  ⚠️ Arayüzde form kapandı (consultants.js). Kuralı YALNIZ orada bırakmak,
--  bu oturumda iki kez düzelttiğim kusuru üçüncü kez üretmek olurdu: ekranın
--  ilan ettiği kural sunucuda yoksa, arayüzü atlayan çağrı geçer.
--
--  Ölçü yine GÖNDERİLMİŞ teklif: taslak, müşterinin görmediği tekliftir.
--  (bkz. danisman-taslak-ve-olcu.sql)
--
--  consultant_credits.teklif_sayisi KALIYOR. Artık sıfır satır üretilemez ama
--  kolonun asıl değeri sıfır hâli değil: "kaç teklif değerlendirildi" sorusu
--  emeğin ölçüsüdür — 3 teklifi karşılaştırmak 1 teklife bakmaktan çok daha
--  fazla iştir ve ücretlendirme kararında bu fark lazım olacak.
-- ============================================================================

create or replace function public.danisman_gorus_yaz(
    p_request_id uuid,
    p_gorus      text,
    p_onerilen   uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_lead uuid;
    v_yat  uuid;
    v_ad   text;
    v_adet int;
begin
    if coalesce(trim(coalesce(p_gorus, '')), '') = '' then
        raise exception 'Görüş boş olamaz';
    end if;

    -- Talep gerçekten bu danışmanın mı, ve kaç GÖNDERİLMİŞ teklif var?
    select cr.lead_id into v_lead
      from public.consultation_requests cr
     where cr.id = p_request_id and cr.consultant_id = auth.uid();
    if v_lead is null then raise exception 'Bu talep size ait değil'; end if;

    select count(*)::int into v_adet
      from public.firm_quotes q
     where q.lead_id = v_lead
       and coalesce(q.status, '') in ('sent', 'accepted');

    if v_adet = 0 then
        raise exception 'Bu başvuruya henüz teklif gelmemiş; değerlendirilecek bir teklif olmadan görüş yazılamaz.';
    end if;

    -- ⚠️ Önerilen firma da GERÇEKTEN teklif vermiş olmalı. Aksi hâlde danışman,
    -- müşterinin hiç görmediği bir firmayı öne çıkarabilirdi.
    if p_onerilen is not null
       and not exists (select 1 from public.firm_quotes q
                        where q.lead_id = v_lead and q.company_id = p_onerilen
                          and coalesce(q.status, '') in ('sent', 'accepted')) then
        raise exception 'Öne çıkardığınız firma bu başvuruya gönderilmiş bir teklif vermemiş.';
    end if;

    update public.consultation_requests
       set gorus = trim(p_gorus),
           onerilen_company_id = p_onerilen,
           durum = 'tamamlandi',
           updated_at = now()
     where id = p_request_id and consultant_id = auth.uid()
    returning lead_id, investor_id into v_lead, v_yat;

    if v_lead is null then raise exception 'Bu talep size ait değil'; end if;

    select co.full_name into v_ad from public.consultants co where co.id = auth.uid();

    insert into public.notifications (user_id, title, body, icon, link)
    values (v_yat,
            'Teklif değerlendirmeniz hazır',
            coalesce(v_ad, 'Danışmanınız') || ' aldığınız teklifleri değerlendirdi.',
            '⚖️', '#yatirimci-panel');
end;
$$;

grant execute on function public.danisman_gorus_yaz(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA (danışman hesabıyla, teklifsiz bir talepte)
--      await supabaseClient.rpc('danisman_gorus_yaz',
--            { p_request_id: '…', p_gorus: 'deneme' })
--      → "Bu başvuruya henüz teklif gelmemiş; değerlendirilecek bir teklif
--         olmadan görüş yazılamaz."
--  Ekrandaki cümle ile sunucunun cevabı aynı şeyi söylüyor.
-- ============================================================================
