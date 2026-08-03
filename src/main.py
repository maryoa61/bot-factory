"""Bot factory entrypoint: factory bot + all tenant bots, one asyncio process."""

import asyncio
import logging

from aiogram import Bot, Dispatcher

from . import config, db, factory, tenants

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("main")


async def main() -> None:
    if not config.MAIN_BOT_TOKEN:
        log.error("MAIN_BOT_TOKEN is not set. Set it in the environment and restart.")
        return

    await db.init_db()
    started = await tenants.start_all()
    log.info("tenant bots running: %d", started)

    bot = Bot(token=config.MAIN_BOT_TOKEN, timeout=30)
    dp = Dispatcher()
    dp.include_router(factory.router)

    try:
        await dp.start_polling(bot, handle_signals=False)
    finally:
        await tenants.stop_all()
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
