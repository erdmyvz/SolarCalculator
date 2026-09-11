#!/bin/sh
# ============================================================================
#  surum-uret.sh — surum.js dosyasını git geçmişinden üretir.
#
#  NEDEN SCRIPT: Sürüm numarasını ve tarihi elle yazmak, güncellemeyi
#  unuttuğunuz ilk anda sayfanın YANLIŞ bilgi göstermesi demek. Buradan
#  üretilince böyle bir ihtimal yok — rakam da tarih de commit'in kendisinden
#  geliyor.
#
#  KULLANIM: Push etmeden önce çalıştırın, çıkan dosyayı da commit'leyin:
#      ./surum-uret.sh && git add surum.js && git commit --amend --no-edit
#  ya da ayrı bir commit olarak.
# ============================================================================
set -e
cd "$(dirname "$0")"

SAYI=$(git rev-list --count HEAD)
SHA=$(git rev-parse --short HEAD)
# Commit'in yazılma tarihi, yerel saat dilimiyle (ISO 8601)
TARIH=$(git log -1 --format=%cI)
# İZLENEN dosyalarda commit'lenmemiş değişiklik var mı?
# Yalnız izlenenlere bakıyoruz: .claude/ gibi yerel, deploy'a girmeyen
# izlenmeyen klasörler "kirli" saydırıyordu — yanlış pozitifti.
if git diff --quiet HEAD -- . ':!surum.js' 2>/dev/null; then KIRLI=false; else KIRLI=true; fi

cat > surum.js <<EOF
/* ============================================================================
   surum.js — SÜRÜM BİLGİSİ VE "TASLAK SÜRÜM" ŞERİDİ
   ⚠️ BU DOSYA ELLE DÜZENLENMEZ. surum-uret.sh tarafından git'ten üretilir.
   Son üretim: $(date +%d.%m.%Y\ %H:%M)
   ============================================================================ */
window.EPC_SURUM = {
    surum:  'v0.$SAYI',
    commit: '$SHA',
    tarih:  '$TARIH',
    kirli:  $KIRLI,        // true = commit'lenmemiş değişiklikle üretildi
    taslak: true           // 1.0'a geçince false yapın, şerit kalkar
};
EOF
cat surum-serit.js >> surum.js
echo "surum.js üretildi → v0.$SAYI ($SHA) $TARIH"
