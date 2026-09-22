-- ============================================================================
--  basvuru-hiz-siniri-deneme.sql   — AYRI DOSYA, sonu `rollback`
--
--  ⚠️ SQL editöründe request.headers YOK, yani IP null kalır ve yalnız
--  E-POSTA sınırı sınanabilir. IP yolu üretimde PostgREST üzerinden dolu
--  gelir; burada sınanamadığı açıkça yazılıyor, "sınandı" sanılmasın.
--
--  Asıl sorular:
--   ★ 3) Aynı e-postadan 4. başvuru engelleniyor mu?
--   ★ 4) FARKLI e-posta hâlâ geçiyor mu? (gerçek müşteri engellenmemeli)
--   ★ 6) Ham e-posta/IP saklanıyor mu? (saklanmamalı)
-- ============================================================================
begin;

create temporary table _sonuc(sira int, ne text, sonuc text, beklenen text) on commit drop;

do $$
declare
    i int;
    v_hata text;
    v_gecen int := 0;
begin
    -- Aynı e-postadan arka arkaya 5 başvuru
    for i in 1..5 loop
        begin
            insert into public.leads (tracking_code, source, full_name, phone, email, address, status)
            values ('DNM-AYNI-' || i, 'website', 'Deneme', '0', 'ayni@ornek.com', 'x', 'yeni_basvuru');
            v_gecen := v_gecen + 1;
        exception when others then
            v_hata := sqlerrm;
        end;
    end loop;

    insert into _sonuc values
      (3, '★ aynı e-postadan geçen başvuru sayısı', v_gecen::text, '3 (4. ve 5. engellenmeli)'),
      (4, '   engel mesajı okunabilir mi', coalesce(left(v_hata, 60) || '…', '(engel olmadı!)'), 'anlaşılır cümle');
end $$;

do $$
declare v_ok boolean := false;
begin
    -- Farklı e-posta: gerçek müşteri engellenmemeli
    begin
        insert into public.leads (tracking_code, source, full_name, phone, email, address, status)
        values ('DNM-FARKLI', 'website', 'Başka Kişi', '0', 'baska@ornek.com', 'x', 'yeni_basvuru');
        v_ok := true;
    exception when others then v_ok := false;
    end;
    insert into _sonuc values (5, '★ farklı e-posta geçiyor mu', case when v_ok then 'geçti ✅' else 'ENGELLENDİ ❌' end, 'geçti ✅');
end $$;

insert into _sonuc
select 1, 'kurulum: tablo + tuz + tetikleyici',
       (select count(*)::text from gizli.hiz_tuz) || ' tuz · ' ||
       (select count(*)::text from pg_trigger where tgname in ('leads_hiz_trg','service_requests_hiz_trg')) || ' tetikleyici',
       '1 tuz · 2 tetikleyici'
union all
select 2, 'IP yolu bu ortamda sınanabiliyor mu',
       case when nullif(current_setting('request.headers', true),'') is null
            then 'hayır — başlık yok, yalnız e-posta sınandı' else 'evet' end, '—'
union all
select 6, '★ ham e-posta/IP saklanıyor mu',
       case when exists (select 1 from gizli.hiz_kayit where anahtar like '%@%' or anahtar ~ '^\d+\.\d+')
            then 'EVET ❌ ham veri var' else 'hayır — yalnız özet ✅' end, 'hayır — yalnız özet ✅'
union all
select 7, 'kayıt tablosundaki satır (özet örneği)',
       coalesce((select left(anahtar, 16) || '… (' || tur || ')' from gizli.hiz_kayit order by id desc limit 1), '-'), '';

select * from _sonuc order by sira;

rollback;
