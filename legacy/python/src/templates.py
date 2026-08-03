"""Template registry: the 10 supported bot types + request matching."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from . import db

# (fa-normalized keywords, weight) — first match wins per template, then max score.
# fa-normalized: letters lowercased, ي->ی, ك->ک, zero-width/arabic diacritics stripped.


def _norm(text: str) -> str:
    t = text.lower()
    t = t.replace("ي", "ی").replace("ك", "ک").replace("ۀ", "ه").replace("ة", "ه")
    t = re.sub(r"[\u200c\u200b\u200d\u200e\u200f\u064b-\u0652]", "", t)
    return t


@dataclass
class Template:
    id: str
    name: str
    desc: str
    keywords: list[str]           # fa-normalized
    features: dict                 # feature -> bool
    base_config: dict = field(default_factory=dict)
    needs_owner_id: bool = True   # most bots need an admin id
    setup_hint: str = ""


TEMPLATES: list[Template] = [
    Template(
        id="autoreply",
        name="ربات پاسخگوی خودکار",
        desc="به پیام‌های کاربران با کلمات کلیدی و متن‌های از پیش تعیین‌شده جواب می‌ده.",
        keywords=["پاسخ", "جواب", "اتورپلی", "اتو ریپلای", "اتو", "چت", "گفتگو", "مشاوره", "reply", "answer", "auto"],
        features={"autoreply": True, "shop": False, "joiner": False, "groupadmin": False,
                  "broadcast": False, "welcome": False, "poll": False, "antispam": False, "forward": False},
        base_config={"default_reply": "سلام! چطور می‌تونم کمکت کنم؟"},
        needs_owner_id=False,
        setup_hint="بعد از ساخت، /panel را بزن و از «پاسخ خودکار» کلمات کلیدی را اضافه کن.",
    ),
    Template(
        id="shop",
        name="ربات فروشگاه / درگاه",
        desc="فروشگاه با محصولات، دکمه خرید و پرداخت با ستاره‌های تلگرام (Stars).",
        keywords=["فروشگاه", "فروش", "خرید", "درگاه", "محصول", "پرداخت", "شارژ", "shop", "store", "buy", "payment", "price"],
        features={"autoreply": False, "shop": True, "joiner": False, "groupadmin": False,
                  "broadcast": True, "welcome": False, "poll": False, "antispam": False, "forward": False},
        needs_owner_id=True,
        setup_hint="بعد از ساخت، /panel → فروشگاه: محصولات را اضافه کن. قیمت‌ها با ستاره‌ی تلگرام پرداخت می‌شوند.",
    ),
    Template(
        id="joiner",
        name="ربات جوینر / ممبرگیر",
        desc="کاربران را مجبور می‌کند اول عضو کانال/گروه تو شوند تا از ربات استفاده کنند.",
        keywords=["جوین", "ممبر", "عضو", "عضویت", "کانال", "join", "member", "subscribe"],
        features={"autoreply": False, "shop": False, "joiner": True, "groupadmin": False,
                  "broadcast": False, "welcome": False, "poll": False, "antispam": False, "forward": False},
        needs_owner_id=True,
        setup_hint="بعد از ساخت، /panel → گیت عضویت: آیدی کانال را بده و ربات را ادمین آن کانال کن.",
    ),
    Template(
        id="groupadmin",
        name="ربات مدیریت گروه",
        desc="کیک، بن، میوت، آنتی‌لینک و ضداسپم برای گروه خودت.",
        keywords=["ادمین", "گروه", "کیک", "میت", "مدیریت", "mod", "admin", "kick", "ban"],
        features={"autoreply": False, "shop": False, "joiner": False, "groupadmin": True,
                  "broadcast": False, "welcome": True, "poll": False, "antispam": True, "forward": False},
        needs_owner_id=True,
        setup_hint="ربات را ادمین گروهت کن؛ دستورات /kick /ban /mute /antilink را در گروه اجرا کن.",
    ),
    Template(
        id="broadcast",
        name="ربات اطلاع‌رسانی / برادکست",
        desc="ارسال پیام همگانی به همه‌ی کسانی که ربات را استارت کرده‌اند.",
        keywords=["اطلاع", "خبر", "برادکست", "همگانی", "اعلام", "کانال", "broadcast", "announce", "news"],
        features={"autoreply": True, "shop": False, "joiner": False, "groupadmin": False,
                  "broadcast": True, "welcome": False, "poll": False, "antispam": False, "forward": False},
        base_config={"default_reply": "برای اطلاع‌رسانی با ادمین در ارتباط باشید."},
        needs_owner_id=True,
        setup_hint="بعد از ساخت، /broadcast <متن> را بفرست تا به همه‌ی کاربران برسد.",
    ),
    Template(
        id="welcome",
        name="ربات خوش‌آمدگویی",
        desc="به اعضای جدید گروه پیام خوش‌آمد بده و گروه را حرفه‌ای نشان بده.",
        keywords=["خوش امد", "خوشامد", "ویلکام", "welcome", "ورود"],
        features={"autoreply": False, "shop": False, "joiner": False, "groupadmin": False,
                  "broadcast": False, "welcome": True, "poll": False, "antispam": False, "forward": False},
        needs_owner_id=True,
        setup_hint="بعد از ساخت، /setwelcome <متن> را بزن و ربات را ادمین گروهت کن.",
    ),
    Template(
        id="poll",
        name="ربات نظرسنجی",
        desc="ساخت نظرسنجی با دستور ساده و مشاهده نتایج.",
        keywords=["نظرسنجی", "رای", "نظر", "poll", "vote", "survey"],
        features={"autoreply": False, "shop": False, "joiner": False, "groupadmin": False,
                  "broadcast": False, "welcome": False, "poll": True, "antispam": False, "forward": False},
        needs_owner_id=True,
        setup_hint="بعد از ساخت: /poll سوال|گزینه۱|گزینه۲|...",
    ),
    Template(
        id="antispam",
        name="ربات ضداسپم",
        desc="حذف خودکار پیام‌های حاوی لینک و کلمات اسپم در گروه.",
        keywords=["اسپم", "ضد اسپم", "لینک", "هرز", "spam", "antispam"],
        features={"autoreply": False, "shop": False, "joiner": False, "groupadmin": False,
                  "broadcast": False, "welcome": False, "poll": False, "antispam": True, "forward": False},
        needs_owner_id=True,
        setup_hint="بعد از ساخت ربات را ادمین گروه کن؛ /antilink on را بزن.",
    ),
    Template(
        id="card",
        name="ربات کارت ویزیت / معرفی",
        desc="به هر کسی که استارت کند، معرفی‌نامه‌ی تو را نشان می‌دهد.",
        keywords=["کارت", "ویزیت", "معرفی", "رزومه", "بیو", "card", "bio", "introduce"],
        features={"autoreply": True, "shop": False, "joiner": False, "groupadmin": False,
                  "broadcast": False, "welcome": False, "poll": False, "antispam": False, "forward": False},
        base_config={
            "default_reply": "سلام! 👋\nمن ربات معرفی هستم.\nبرای مشاهده‌ی اطلاعات، /info را بزن.",
        },
        needs_owner_id=False,
        setup_hint="بعد از ساخت /setinfo <متن معرفی> را بزن.",
    ),
    Template(
        id="forward",
        name="ربات فوروارد خودکار",
        desc="پیام‌های کانال/گروه مبدأ را خودکار به مقصد فوروارد می‌کند.",
        keywords=["فوروارد", "انتقال", "کپی", "forward", "copy", "relay"],
        features={"autoreply": False, "shop": False, "joiner": False, "groupadmin": False,
                  "broadcast": False, "welcome": False, "poll": False, "antispam": False, "forward": True},
        needs_owner_id=True,
        setup_hint="بعد از ساخت /setforward @مبدا|@مقصد را بزن (ربات در هر دو ادمین باشد).",
    ),
]


def match_request(text: str) -> tuple[Template | None, int]:
    """Return (best_template, score). Score 0 = no match."""
    norm = _norm(text)
    best: Template | None = None
    best_score = 0
    for t in TEMPLATES:
        score = 0
        for kw in t.keywords:
            nk = _norm(kw)
            if nk in norm:
                score += len(nk)  # longer keyword = stronger signal
        if score > best_score:
            best = t
            best_score = score
    return best, best_score


def template_features(t: Template) -> dict:
    f = {k: False for k in db.default_config()["features"]}
    f.update(t.features)
    return f


def base_config_for(t: Template) -> dict:
    cfg = db.default_config()
    cfg["features"] = template_features(t)
    for k, v in t.base_config.items():
        cfg[k] = v
    return cfg
