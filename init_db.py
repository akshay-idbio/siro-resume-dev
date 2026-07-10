import asyncio
from db import init_db_indexes, db


async def main():
    await init_db_indexes()
    print("MongoDB indexes created successfully")
    print("Database:", db.name)


asyncio.run(main())