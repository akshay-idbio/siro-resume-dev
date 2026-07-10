import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URL = "mongodb://localhost:27017"
MONGODB_DB = "siro_resume_dev"

async def main():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[MONGODB_DB]

    result = await db.health_check.insert_one({
        "status": "ok",
        "message": "MongoDB connected from Python"
    })

    print("Inserted ID:", result.inserted_id)

    doc = await db.health_check.find_one({"_id": result.inserted_id})
    print(doc)

asyncio.run(main())