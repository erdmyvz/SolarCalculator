-- Sahte puanları sil. ID ile — desenle değil ki ileride gerçek bir yorumda
-- "test" kelimesi geçerse yanlışlıkla silinmesin.
--   80d17348… company  · 4★ "TEST YORUMU (Claude) — kurulum planlandığı gibi…"
--   1e60b473… platform · 5★ "TEST YORUMU (Claude) — süreç şeffaftı, üç firma…"
-- ratings'e işaret eden yabancı anahtar YOK (ratings yalnız leads ve
-- auth.users'a bakar), silme başka bir satırı düşürmez.
delete from public.ratings
 where id in ('80d17348-a8da-4b74-b823-b4c543a8d030',
              '1e60b473-5fae-4d46-8d6d-5f10b0944b81')
returning id, hedef_tip, puan, left(yorum, 50) as silinen_yorum;
