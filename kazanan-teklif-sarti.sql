-- ============================================================================
--  kazanan-teklif-sarti.sql
--
--  NE EKSİK KALDI
--  danisman-kazanan-kaydi.sql ile danışman "müşteri hangi firmayı seçti"
--  kaydını girebiliyor. Ekran, teklif göndermemiş firmanın yanında düğme
--  yerine şunu yazıyor:
--      "teklif olmadan kaydedilemez"
--      "Teklif gelmeden kazanan kaydedilemez."
--
--  ⚠️ AMA SUNUCUDA BÖYLE BİR KURAL YOK. lead_kazanan() yalnız firmanın
--  DAVET EDİLMİŞ olmasına bakıyor. Yani ekran, sistemin uygulamadığı bir
--  kuralı ilan ediyordu.
--
--  Bu tam olarak bu oturum boyunca kapattığım kusurun kendisi: ekran bir şey
--  söylüyor, mekanizma başka şey yapıyor. Kendi yazdığım ekranda tekrar
--  etmesine izin veremem. Kural arayüzde DEĞİL, burada yaşamalı.
--
--  KURAL
--      danışman ve yatırımcı → yalnız GÖNDERİLMİŞ teklifi olan firma
--      yönetici              → serbest
--
--  Yöneticinin muaf olması bilinçli: platform dışında yürümüş, sonra sisteme
--  işlenen gerçek işler var. Onu kaydedebilen biri olmalı — ve artık KİMİN
--  kaydettiği leads.kazanan_kaydeden_rol'de duruyor, iz kayboluyor değil.
--
--  Taslak teklif "gönderilmiş" sayılmaz: müşterinin görmediği teklif üzerinden
--  kazanan kaydedilemez. Aynı ölçü davetli_firmalar() ve komisyon
--  hesabında da kullanılıyor — üç yerde tek tanım.
-- ============================================================================

create or replace function public.lead_kazanan(
    p_lead_id    uuid,
    p_company_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_lead    public.leads%rowtype;
    v_firma   text;
    v_dan     uuid;
    v_rol     text;
    v_engel   text;
begin
    select * into v_lead from public.leads where id = p_lead_id;
    if not found then raise exception 'Kayıt bulunamadı'; end if;

    -- --------------------------------------------------------- YETKİ
    if public.is_admin() then
        v_rol := 'admin';

    elsif v_lead.investor_id is not null and v_lead.investor_id = auth.uid() then
        v_rol := 'yatirimci';

    else
        v_dan := public.lead_danismani(p_lead_id);

        if v_dan is not null and v_dan = auth.uid() then
            if v_lead.investor_id is not null then
                raise exception 'Bu başvurunun kendi hesabı var; firmayı yatırımcı seçer.';
            end if;
            if v_lead.company_id is not null then
                raise exception 'Bu kayıtta firma zaten kayıtlı. Değiştirilmesi gerekiyorsa yönetime bildirin.';
            end if;
            v_engel := public.danisman_yetkili_mi(auth.uid());
            if v_engel is not null then raise exception '%', v_engel; end if;
            v_rol := 'danisman';
        else
            raise exception 'Bu kayıt için yetkiniz yok';
        end if;
    end if;

    -- ---------------------------------------------------- DAVET KONTROLÜ
    if not exists (select 1 from public.lead_assignments la
                    where la.lead_id = p_lead_id and la.company_id = p_company_id) then
        raise exception 'Bu firma bu talebe davet edilmemiş';
    end if;

    -- ------------------------------------------------- ⚠️ TEKLİF ŞARTI
    -- Ekranın ilan ettiği kural. Yönetici muaf (platform dışı işler için),
    -- ama kimin kaydettiği aşağıda yazılıyor.
    if v_rol <> 'admin'
       and not exists (select 1 from public.firm_quotes q
                        where q.lead_id = p_lead_id
                          and q.company_id = p_company_id
                          and coalesce(q.status, '') in ('sent', 'accepted')) then
        raise exception 'Bu firma gönderilmiş bir teklif vermemiş; kazanan olarak kaydedilemez.';
    end if;

    select c.name into v_firma from public.companies c where c.id = p_company_id;

    -- ---------------------------------------------------------- YAZ
    update public.leads
       set company_id           = p_company_id,
           kazanan_kaydeden     = auth.uid(),
           kazanan_kaydeden_rol = v_rol,
           updated_at           = now()
     where id = p_lead_id;

    update public.lead_assignments
       set durum = case when company_id = p_company_id then 'kazandi' else 'kaybetti' end,
           updated_at = now()
     where lead_id = p_lead_id;

    if v_lead.consultant_client_id is not null then
        update public.consultant_clients
           set assigned_company_id   = p_company_id,
               assigned_company_name = v_firma,
               updated_at            = now()
         where id = v_lead.consultant_client_id;
    end if;

    -- --------------------------------------------------- BİLDİRİMLER
    insert into public.notifications (user_id, title, body, icon, link)
    select p.id,
           case when la.company_id = p_company_id
                then 'Teklifiniz kabul edildi 🎉' else 'Bu talepte başka firma seçildi' end,
           coalesce(v_lead.full_name, 'Yatırımcı') ||
               case when la.company_id = p_company_id
                    then ' teklifinizi kabul etti. Süreci CRM üzerinden yürütebilirsiniz.'
                    else ' başka bir firmayla devam etmeye karar verdi.' end,
           case when la.company_id = p_company_id then '🎉' else 'ℹ️' end,
           '#kurulumcu-panel/crm'
    from public.lead_assignments la
    join public.profiles p on p.company_id = la.company_id
    where la.lead_id = p_lead_id;

    if v_lead.consultant_client_id is not null and v_rol <> 'danisman' then
        insert into public.notifications (user_id, title, body, icon, link)
        select cc.consultant_id,
               'Firma seçildi — ' || coalesce(cc.name, 'danışan'),
               coalesce(v_firma, 'Bir firma') || ' ile devam edilecek.',
               '🏢', '#danisman-panel/danisan-takip'
        from public.consultant_clients cc where cc.id = v_lead.consultant_client_id;
    end if;

    return jsonb_build_object('kazanan', v_firma, 'kaydeden_rol', v_rol);
end;
$$;

grant execute on function public.lead_kazanan(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA (danışman hesabıyla, teklifi olmayan bir kayıtta)
--      await supabaseClient.rpc('lead_kazanan',
--            { p_lead_id: '<lead>', p_company_id: '<firma>' })
--      → "Bu firma gönderilmiş bir teklif vermemiş; kazanan olarak
--         kaydedilemez."
--  Ekrandaki cümle ile sunucunun cevabı artık aynı şeyi söylüyor.
-- ============================================================================
