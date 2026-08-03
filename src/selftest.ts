/** Quick self-test of the request matcher (run: npm run selftest). */

import { matchRequest } from "./templates";

const cases = [
  "یه ربات فروشگاه می‌خوام",
  "ربات پاسخگوی خودکار",
  "یه ربات جوینر برای کانالم",
  "مدیریت گروه",
  "ربات اطلاع رسانی می‌خوام",
  "ربات نظرسنجی",
  "ضد اسپم",
  "کارت ویزیت",
  "فوروارد خودکار",
  "خوش آمد گویی",
  "یه ربات که به مشتری هام خودکار جواب بده",
  "I want a shop bot",
  "asdf qwerty",
];

let failed = 0;
for (const c of cases) {
  const { template, score } = matchRequest(c);
  const id = template?.id ?? "NONE";
  const ok = id !== "NONE" || c === "asdf qwerty";
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} "${c}" => ${id} (${score})`);
}
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
