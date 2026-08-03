#!/bin/bash
# setup.sh — دیپلوی خودکار bot-factory روی Cloudflare (Termux + Linux/Mac)
# اجرا: bash setup.sh
set -e
cd ~

IS_TERMUX=0
[ -d /data/data/com.termux ] && IS_TERMUX=1

echo ""
echo "═══════════════════════════════════════"
echo "   🤖 دیپلوی bot-factory"
echo "═══════════════════════════════════════"

if [ "$IS_TERMUX" = "1" ]; then
  echo "   (Termux: از wrangler v2 استفاده می‌شه — چون v3 روی اندروید کار نمی‌کنه)"
  W="npx -y wrangler@2.21.0"
else
  W="npx wrangler"
fi

echo ""
echo "[1/8] نصب پیش‌نیازها..."
if [ "$IS_TERMUX" = "1" ]; then
  pkg update -y && pkg upgrade -y
  pkg install -y nodejs-lts git curl
else
  command -v node >/dev/null || { echo "Node نصب نیست — از https://nodejs.org نصب کن"; exit 1; }
fi

echo ""
echo "[2/8] دریافت کد پروژه..."
if [ ! -d ~/bot-factory ]; then
  git clone https://github.com/maryoa61/bot-factory.git
fi
cd ~/bot-factory
if [ "$IS_TERMUX" = "1" ]; then
  npm install --ignore-scripts
else
  npm install
fi

echo ""
echo "[3/8] توکن API کلودفلر"
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "   برو: https://dash.cloudflare.com/profile/api-tokens"
  echo "   → Create Token → قالب \"Edit Cloudflare Workers\""
  read -r -p "   توکن API رو بچسبون و Enter بزن: " CF_TOKEN
  export CLOUDFLARE_API_TOKEN="$CF_TOKEN"
fi
echo "   ✅ توکن ست شد."

echo ""
echo "[4/8] ساخت دیتابیس D1..."
OUT=$($W d1 create bot-factory 2>&1 || true)
echo "$OUT"
DB_ID=$(echo "$OUT" | grep -oE '[0-9a-f]{32}' | head -1)
if [ -z "$DB_ID" ]; then
  echo "   (دیتابیس شاید قبلاً ساخته شده — از لیست می‌گیرم...)"
  DB_ID=$($W d1 list 2>&1 | grep -oE '[0-9a-f]{32}' | head -1)
fi
if [ -z "$DB_ID" ]; then
  read -r -p "   database_id رو از خروجی بالا کپی کن: " DB_ID
fi
if [[ ! "$DB_ID" =~ ^[0-9a-f]{32}$ ]]; then
  echo "   ❌ آیدی معتبر نیست: $DB_ID"
  exit 1
fi
sed -i "s|REPLACE_WITH_YOUR_D1_ID|$DB_ID|" wrangler.toml
echo "   ✅ database_id ذخیره شد: $DB_ID"

echo ""
echo "[5/8] ساخت جدول‌ها..."
$W d1 execute bot-factory --remote --file ./schema.sql

echo ""
echo "[6/8] سکرت‌ها"
read -r -s -p "   توکن ربات اصلی (از @BotFather): " MAIN_TOKEN
echo ""
echo "$MAIN_TOKEN" | $W secret put MAIN_BOT_TOKEN
WEBHOOK_SECRET="kH9f$(date +%s)qX8"
echo "$WEBHOOK_SECRET" | $W secret put WEBHOOK_SECRET
echo "   ✅ سکرت‌ها ذخیره شدن."

echo ""
echo "[7/8] دیپلوی..."
DEPLOY=$($W deploy 2>&1)
echo "$DEPLOY"
WORKER_URL=$(echo "$DEPLOY" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)
if [ -z "$WORKER_URL" ]; then
  read -r -p "   آدرس Worker رو از خروجی بالا کپی کن: " WORKER_URL
fi

echo ""
echo "[8/8] اتصال وب‌هوک به تلگرام..."
curl -s "https://api.telegram.org/bot${MAIN_TOKEN}/setWebhook?url=${WORKER_URL}/webhook&secret_token=${WEBHOOK_SECRET}"
echo ""

echo ""
echo "═══════════════════════════════════════"
echo "   🎉 تمام شد! ربات اصلیت آنلاین شد:"
echo "   $WORKER_URL"
echo ""
echo "   توی تلگرام به ربات اصلیت پیام بده:"
echo "   یه ربات فروشگاه می‌خوام"
echo "═══════════════════════════════════════"
