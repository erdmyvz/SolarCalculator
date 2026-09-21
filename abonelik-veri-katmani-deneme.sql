-- ============================================================================
--  abonelik-veri-katmani-deneme.sql
--
--  ⚠️ AYRI DOSYA OLMASININ SEBEBİ: bu betik `rollback` ile bitiyor ve Supabase
--  SQL editörü betiği TEK İŞLEM olarak çalıştırıyor. Kurulumla aynı dosyada
--  olduğunda rollback, create function/trigger'ı da geri aldı — kurulum
--  yapıldı sanıldı, hiçbir şey kurulmamıştı. Önce kurulum dosyasını, sonra
--  bunu çalıştırın.
-- ============================================================================

-- ⚠️ TAMAMI rollback ile biter. Enerji'nin tarihi işlem İÇİNDE geçmişe
-- alınıp engelleme yolu sınanıyor; işlem geri alınınca gerçek tarih döner.
begin;

create temp table _dn (senaryo text, sonuc text) on commit drop;

-- 1) GEÇERLİ firma
do $$
declare v uuid;
begin
    insert into public.firm_quotes (company_id, quote_no, customer_name, system, items, totals, status)
    select id, 'DN-1', 'deneme', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 'draft'
      from public.companies where name = 'Enerji' returning id into v;
    insert into _dn values ('geçerli abonelik', 'GEÇTİ (doğru)');
exception when others then
    insert into _dn values ('geçerli abonelik', 'ENGELLENDİ (YANLIŞ): ' || left(sqlerrm, 80));
end $$;

-- 2) ENGELLİ firma (Karakoç Holding — banned)
do $$
declare v uuid;
begin
    insert into public.firm_quotes (company_id, quote_no, customer_name, system, items, totals, status)
    select id, 'DN-2', 'deneme', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 'draft'
      from public.companies where name = 'Karakoç Holding' returning id into v;
    insert into _dn values ('engelli firma', 'GEÇTİ (YANLIŞ)');
exception when others then
    insert into _dn values ('engelli firma', 'ENGELLENDİ: ' || left(sqlerrm, 95));
end $$;

-- 3) SÜRESİ DOLMUŞ firma: Enerji'yi bu işlem içinde geçmişe al
alter table public.companies disable trigger companies_guard_trg;
update public.companies set sub_ends_at = now() - interval '3 days' where name = 'Enerji';
alter table public.companies enable trigger companies_guard_trg;

do $$
declare v uuid;
begin
    insert into public.firm_quotes (company_id, quote_no, customer_name, system, items, totals, status)
    select id, 'DN-3', 'deneme', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 'draft'
      from public.companies where name = 'Enerji' returning id into v;
    insert into _dn values ('süresi dolmuş', 'GEÇTİ (YANLIŞ)');
exception when others then
    insert into _dn values ('süresi dolmuş', 'ENGELLENDİ: ' || left(sqlerrm, 95));
end $$;

-- 4) Arayüzün soracağı fonksiyon ne diyor
insert into _dn
select 'teklif_yazabilir_miyim (süresi dolmuş)',
       coalesce(public.firma_abonelik_engeli((select id from public.companies where name='Enerji')), 'engel yok');

select * from _dn;

rollback;
