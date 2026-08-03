#!/bin/bash
# setup.sh — دیپلوی خودکار bot-factory روی Cloudflare (مناسب Termux)
# اجرا: bash setup.sh
set -e
cd ~

echo ""
echo "═══════════════════════════════════════"
echo "   🤖 دیپلوی bot-factory — قدم ۱ از ۸"
echo "═══════════════════════════════════════"

echo ""
echo "[1/8] نصب پیش‌نیازها..."
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git curl

echo ""
echo "[2/8] دریافت کد پروژه..."
if [ ! -d ~/bot-factory ]; then
  git clone https://github.com/maryoa61/bot-factory.git
fi
cd ~/bot-factory
if [ -d /data/data/com.termux ]; then
  echo "   (Termux شناسایی شد — نصب بدون workerd، چون اندروید پشتیبانی نمی‌شه)"
  npm install --ignore-scripts
else
  npm install
fi

echo ""
echo "[3/8] توکن API کلودفلر"
echo "   اگر CLOUDFLARE_API_TOKEN ست نشده، ازت می‌پرسم:"
echo "   برو توی مرورگر: https://dash.cloudflare.com/profile/api-tokens"
echo "   → Create Token → قالب \"Edit Cloudflare Workers\" → Create"
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  read -r -p "   توکن API رو بچسبون و Enter بزن: " CF_TOKEN
  export CLOUDFLARE_API_TOKEN="$CF_TOKEN"
fi

echo ""
echo "[4/8] ساخت دیتابیس D1..."
OUT=$(npx wrangler d1 create bot-factory 2>&1 || true)
echo "$OUT"
DB_ID=$(echo "$OUT" | grep -oE '[0-9a-f]{32}' | head -1)
if [ -z "$DB_ID" ]; then
  echo "   (دیتابیس شاید قبلاً ساخته شده — از لیست می‌گیرم...)"
  DB_ID=$(npx wrangler d1 list 2>&1 | grep -oE '[0-9a-f]{32}' | head -1)
fi
if [ -z "$DB_ID" ]; then
  read -r -p "   database_id رو از خروجی بالا کپی کن و بچسبون: " DB_ID
fi
if [[ ! "$DB_ID" =~ ^[0-9a-f]{32}$ ]]; then
  echo "   ❌ آیدی معتبر نیست: $DB_ID"
  exit 1
fi
sed -i "s|REPLACE_WITH_YOUR_D1_ID|$DB_ID|" wrangler.toml
echo "   ✅ database_id ذخیره شد."

echo ""
echo "[5/8] ساخت جدول‌ها..."
npx wrangler d1 execute bot-factory --remote --file ./schema.sql

echo ""
echo "[6/8] سکرت‌ها"
echo "   توکن ربات اصلیت رو از @BotFather آماده کن"
read -r -s -p "   توکن ربات اصلی رو بچسبون (نشون داده نمی‌شه): " MAIN_TOKEN
echo ""
echo "$MAIN_TOKEN" | npx wrangler secret put MAIN_BOT_TOKEN
WEBHOOK_SECRET="kH9f$(date +%s)qX8"
echo "$WEBHOOK_SECRET" | npx wrangler secret put WEBHOOK_SECRET
echo "   ✅ سکرت‌ها ذخیره شدن."

echo ""
echo "[7/8] دیپلوی..."
DEPLOY=$(npx wrangler deploy 2>&1)
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
echo "   حالا توی تلگرام به ربات اصلیت پیام بده:"
echo "   یه ربات فروشگاه می‌خوام"
echo "   بعد توکن یه ربات جدید (از @BotFather) و یوزرآیدیت رو بده."
echo "═══════════════════════════════════════"
