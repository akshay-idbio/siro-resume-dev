import asyncio
from db import users_col, init_db_indexes, utc_now
from auth import hash_password


ADMIN_NAME = "SIRO Admin"
ADMIN_EMAIL = "admin@siro.ai"
ADMIN_PASSWORD = "Admin@123"


async def main():
    await init_db_indexes()

    existing = await users_col.find_one({"email": ADMIN_EMAIL})

    if existing:
        print("Admin already exists:", ADMIN_EMAIL)
        return

    now = utc_now()

    result = await users_col.insert_one(
        {
            "name": ADMIN_NAME,
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "company": "SIRO",
            "phone": "",
            "role": "admin",
            "status": "approved",
            "created_at": now,
            "updated_at": now,
            "approved_at": now,
            "approved_by": "system",
            "rejected_at": None,
            "rejected_by": None,
            "reject_reason": "",
            "last_login_at": None,
        }
    )

    print("Admin created successfully")
    print("Admin ID:", result.inserted_id)
    print("Email:", ADMIN_EMAIL)
    print("Password:", ADMIN_PASSWORD)


asyncio.run(main())