"""Config: everything comes from environment variables."""

import os

# Token of the FACTORY bot (the one users talk to).
# Create it with @BotFather, then set MAIN_BOT_TOKEN in Railway env.
MAIN_BOT_TOKEN: str = os.environ.get("MAIN_BOT_TOKEN", "")

# SQLite file path. On Railway use a mounted volume path if you want the
# data to survive restarts, otherwise it lives in the container disk.
DATABASE_PATH: str = os.environ.get("DATABASE_PATH", "data/bots.db")

# Free-tier safety: cap concurrent tenant bots per owner.
MAX_BOTS_PER_USER: int = int(os.environ.get("MAX_BOTS_PER_USER", "5"))
