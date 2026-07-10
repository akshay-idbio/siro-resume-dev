import os
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING


MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "siro_resume_dev")


client = AsyncIOMotorClient(MONGODB_URL)
db = client[MONGODB_DB]


users_col = db["users"]
jobs_col = db["jobs"]
job_resumes_col = db["job_resumes"]
job_results_col = db["job_results"]
audit_logs_col = db["audit_logs"]
download_logs_col = db["download_logs"]


def utc_now():
    return datetime.utcnow()


async def init_db_indexes():
    # users
    await users_col.create_index([("email", ASCENDING)], unique=True)
    await users_col.create_index([("role", ASCENDING)])
    await users_col.create_index([("status", ASCENDING)])

    # jobs
    await jobs_col.create_index([("job_id", ASCENDING)], unique=True)
    await jobs_col.create_index([("user_id", ASCENDING)])
    await jobs_col.create_index([("status", ASCENDING)])
    await jobs_col.create_index([("created_at", DESCENDING)])

    # job resumes
    await job_resumes_col.create_index([("job_id", ASCENDING)])
    await job_resumes_col.create_index([("job_id", ASCENDING), ("filename", ASCENDING)])
    await job_resumes_col.create_index([("status", ASCENDING)])

    # job results
    await job_results_col.create_index([("job_id", ASCENDING)])
    await job_results_col.create_index([("job_id", ASCENDING), ("resume_filename", ASCENDING)])
    await job_results_col.create_index([("request_id", ASCENDING)])
    await job_results_col.create_index([("candidate_email", ASCENDING)])

    # logs
    await audit_logs_col.create_index([("user_id", ASCENDING)])
    await audit_logs_col.create_index([("created_at", DESCENDING)])

    await download_logs_col.create_index([("job_id", ASCENDING)])
    await download_logs_col.create_index([("user_id", ASCENDING)])
    await download_logs_col.create_index([("created_at", DESCENDING)])