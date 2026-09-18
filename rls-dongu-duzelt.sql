-- ============================================================================
--  rls-dongu-duzelt.sql   ⚠️ ACİL — ÖNCE BUNU ÇALIŞTIRIN
--
--  NE OLDU
--  yarismali-atama.sql iki politika ekledi ve BİRBİRLERİNİ ÇAĞIRIYORLAR:
--
--    leads.leads_davetli_select      → lead_assignments'tan SELECT
--    lead_assignments.la_yatirimci_select → leads'ten SELECT
--
--  PostgreSQL bu döngüyü yakalayıp her iki tabloyu da oturum açmış
--  kullanıcılara TAMAMEN KAPATIYOR:
--
--    ERROR: infinite recursion detected in policy for relation "leads"
--    ERROR: infinite recursion detected in policy for relation "lead_assignments"
--
--  Canlıda admin oturumuyla doğrulandı. Etkilenen her ekran:
--    · Kurulumcu CRM (müşteri listesi)      · Yönetici havuzu
--    · Yatırımcı paneli                     · Evrak modülü
--    · Danışman kanalı (mesajlaşma)
--
--  ⚠️ SECURITY DEFINER fonksiyonlar ETKİLENMEDİ: submit_lead,
--  lead_konum_yaz, lead_firma_esle çalışmaya devam ediyor. Yani başvurular
--  alınmaya devam etti, yalnız EKRANLARDA GÖRÜNMEDİ.
--
--  ÇÖZÜM
--  Alt sorguları politikadan çıkarıp SECURITY DEFINER fonksiyona taşıyoruz.
--  Fonksiyon tabloyu sahibinin haklarıyla okuyor, RLS yeniden tetiklenmiyor,
--  döngü kırılıyor. Yetki mantığı AYNEN KORUNUYOR — kimse fazladan bir şey
--  görmüyor:
--    · firma yalnız DAVET EDİLDİĞİ kaydı görür (yazamaz)
--    · yatırımcı yalnız KENDİ kaydının davetlerini görür
-- ============================================================================


-- ----------------------------------------------- 1) DÖNGÜYÜ KIRAN YARDIMCILAR

-- "Bu kayda benim firmam davet edildi mi?"  (leads politikası kullanır)
create or replace function public.lead_davetli_firma(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
          from public.lead_assignments la
         where la.lead_id = p_lead_id
           and la.company_id = public.my_company_id()
    );
$$;

-- "Bu kaydın yatırımcısı ben miyim?"  (lead_assignments politikası kullanır)
create or replace function public.lead_yatirimcisi(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
          from public.leads l
         where l.id = p_lead_id
           and l.investor_id = auth.uid()
    );
$$;

grant execute on function public.lead_davetli_firma(uuid) to authenticated;
grant execute on function public.lead_yatirimcisi(uuid)   to authenticated;


-- ------------------------------------------------ 2) POLİTİKALARI DEĞİŞTİR
-- ⚠️ Yalnız bu iki politikaya dokunuluyor. Diğerlerinin gövdesi bilinmiyor
-- ve OR'landıkları için onlara dokunmaya gerek de yok.

drop policy if exists leads_davetli_select on public.leads;
create policy leads_davetli_select on public.leads
    for select to authenticated
    using (public.lead_davetli_firma(leads.id));

drop policy if exists la_yatirimci_select on public.lead_assignments;
create policy la_yatirimci_select on public.lead_assignments
    for select to authenticated
    using (public.lead_yatirimcisi(lead_assignments.lead_id));


notify pgrst, 'reload schema';

-- ============================================================================
--  ÇALIŞTIRDIKTAN SONRA — DÜZELDİĞİNİ GÖRÜN
--
--  Admin hesabıyla giriş yapıp tarayıcı konsolunda:
--
--    await supabaseClient.from('leads').select('id').limit(1)
--
--  Önce: {error: "infinite recursion detected in policy for relation leads"}
--  Sonra: {data: [...], error: null}
--
--  Ekrandan: Yönetici paneli → Operasyon → havuzda başvurular görünmeli.
--  Kurulumcu hesabıyla: CRM müşteri listesi dolmalı.
-- ============================================================================
