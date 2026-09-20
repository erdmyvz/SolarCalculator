-- ============================================================================
--  danisman-kazanan-kaydi.sql
--
--  ÜÇ İŞ BİR ARADA — hepsi lead_kazanan() içinde olduğu için tek dosya.
--
--  1) DANIŞMAN YOLU (istenen değişiklik)
--     Danışman yönlendirmesiyle gelen müşterinin platform hesabı YOK
--     (investor_id null). lead_kazanan() yalnız yatırımcıya ve yöneticiye
--     açıktı; sonuç: her danışman yönlendirmesi, kazananı işaretlemesi için
--     yöneticiyi beklemek zorundaydı.
--
--     ⚠️ SINIR: DANIŞMAN FİRMA SEÇMİYOR, MÜŞTERİNİN SEÇTİĞİNİ KAYDEDİYOR.
--     Bu ayrım danisman-rolu.sql'deki kuralı korur. Kaydetme hakkı dört
--     koşulla sınırlı:
--        · kayıt gerçekten onun danışanı
--        · müşterinin kendi hesabı YOK (investor_id null) — hesabı varsa
--          seçim onundur, danışman araya giremez
--        · kazanan HENÜZ YAZILMAMIŞ (company_id null) — yazılmış bir kazananı
--          değiştirmek yöneticinin işi; danışmanın burada parasal çıkarı var
--        · danışmanın profili onaylı ve askıda değil
--
--  2) KAYDI KİM YAZDI (yeni)
--     Danışmanın bu kayıttan doğacak bir payı var (consultant_credits).
--     Parasal çıkarı olan tarafa yazma yetkisi verirken kimin yazdığını
--     tutmamak olmaz. leads'e iki kolon ekleniyor, yönetim ekranında görünür.
--
--  3) CANLIDA EKSİK OLAN İKİ BLOK (geri getiriliyor)
--     ⚠️ Canlı lead_kazanan() gövdesi depodakinden KISA çıktı (1988 karakter,
--     consultant_clients ve danışman bildirimi YOK). Sebebi belli:
--     danisman-rolu.sql "bu dosyayı çalıştırmayın" notlu ve hiç
--     çalıştırılmamış — o iki blok yazılmış ama canlıya hiç girmemiş.
--
--     Canlıda doğrulandı: Serhat Aydın'ın işi tamamlandı, danışanın kartında
--         assigned_company_id   = null
--         assigned_company_name = null
--     yani danışman işin bittiğini görüyor ama HANGİ FİRMANIN yaptığını
--     bilmiyor; "Firma seçildi" bildirimi de hiç gitmemiş.
--
--  ⚠️ Aşağıdaki gövde, canlı sürümün doğrulanmış yapısı (yetki kontrolü,
--  davet kontrolü, 2 update, firma bildirimi) ÜZERİNE bu üç ekle konarak
--  yazıldı. Canlıdan eksiltilen hiçbir şey yok.
-- ============================================================================


-- ============================================ 1) DENETİM KOLONLARI
alter table public.leads add column if not exists kazanan_kaydeden     uuid;
alter table public.leads add column if not exists kazanan_kaydeden_rol text;


-- ============================================ 2) FONKSİYON
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
        -- Danışman yolu. Dördü birden sağlanmadan açılmıyor.
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

    -- ⚠️ CANLIDA EKSİKTİ. Danışman işin bittiğini görüyor ama hangi firmanın
    -- yaptığını bilmiyordu.
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

    -- ⚠️ BU DA CANLIDA EKSİKTİ. Kaydı danışmanın kendisi girdiyse kendine
    -- haber vermenin anlamı yok — yalnız başkası girdiyse gönderiliyor.
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


-- ============================================ 3) DANIŞMANIN GÖRDÜĞÜ SEÇENEKLER
-- Danışman kazananı kaydedebilmek için hangi firmaların davet edildiğini ve
-- hangisinin GERÇEKTEN teklif verdiğini görmeli.
--
-- ⚠️ Yalnız GÖNDERİLMİŞ teklif "teklif verdi" sayılır. Taslak, müşterinin
-- görmediği tekliftir; onun üzerinden firma kaydedilemez.
create or replace function public.danisan_firma_secenekleri(p_client_id uuid)
returns table (
    company_id uuid, firma text, il text, ilce text, yakinlik int,
    teklif_var boolean, bedel_try numeric, puan numeric, puan_adedi int
)
language sql stable security definer set search_path = public as $$
    select c.id, c.name, c.city, c.district, la.yakinlik,
           exists (select 1 from public.firm_quotes q
                    where q.lead_id = l.id and q.company_id = c.id
                      and coalesce(q.status,'') in ('sent','accepted')),
           (select (q2.totals->>'total_try')::numeric
              from public.firm_quotes q2
             where q2.lead_id = l.id and q2.company_id = c.id
               and coalesce(q2.status,'') in ('sent','accepted')
             order by q2.created_at desc limit 1),
           o.ortalama, o.adet
      from public.consultant_clients cc
      join public.leads l on l.id = cc.lead_id
      join public.lead_assignments la on la.lead_id = l.id
      join public.companies c on c.id = la.company_id
      left join lateral public.firma_puan_ozeti(c.id) o on true
     where cc.id = p_client_id
       and cc.consultant_id = auth.uid()
     order by la.yakinlik, c.name;
$$;

grant execute on function public.danisan_firma_secenekleri(uuid) to authenticated;


-- ============================================ 4) GEÇMİŞE DOKUNMUYORUZ
-- ⚠️ Bu dosyadan ÖNCE kapatılmış kayıtlarda kazanan firma consultant_clients'a
-- yazılmamıştı. Onları geriye dönük doldurmak MÜMKÜN ama yapmıyoruz: o
-- kayıtların kimin tarafından kapatıldığı da bilinmiyor ve uydurma bir
-- denetim izi bırakmak, hiç iz bırakmamaktan kötüdür. Tek istisna, kazanan
-- firmanın leads'te zaten KESİN olarak durduğu durum — onu doldurmak yeni
-- bilgi üretmez, var olanı taşır:
update public.consultant_clients cc
   set assigned_company_id   = l.company_id,
       assigned_company_name = c.name,
       updated_at            = now()
  from public.leads l
  join public.companies c on c.id = l.company_id
 where l.consultant_client_id = cc.id
   and l.company_id is not null
   and cc.assigned_company_id is null;


notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA (danışman hesabıyla)
--      await supabaseClient.rpc('danisan_firma_secenekleri',
--            { p_client_id: '<danışan id>' })
--      → davetli firmalar, teklif verip vermedikleri ve bedelleri
--
--  Kazananı kaydetmek:
--      await supabaseClient.rpc('lead_kazanan',
--            { p_lead_id: '<lead id>', p_company_id: '<firma id>' })
--      → { kazanan: 'Enerji', kaydeden_rol: 'danisman' }
--
--  İkinci kez çağrılırsa:
--      "Bu kayıtta firma zaten kayıtlı..." — bilerek. Düzeltme yöneticide.
-- ============================================================================
