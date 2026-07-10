import argparse
import os
import shutil
from datetime import datetime, timedelta

from pymongo import MongoClient


MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "siro_resume_dev")


def parse_dt(value):
    if not value:
        return None

    if isinstance(value, datetime):
        return value

    try:
        return datetime.fromisoformat(str(value).replace("Z", ""))
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--status", default="failed")
    parser.add_argument("--delete", action="store_true")
    args = parser.parse_args()

    cutoff = datetime.utcnow() - timedelta(days=args.days)

    client = MongoClient(MONGODB_URL)
    db = client[MONGODB_DB]

    query = {
        "status": args.status,
        "created_at": {"$lt": cutoff},
    }

    jobs = list(db.jobs.find(query).sort("created_at", 1))

    print("=" * 80)
    print(f"DB: {MONGODB_DB}")
    print(f"Status filter: {args.status}")
    print(f"Older than days: {args.days}")
    print(f"Cutoff UTC: {cutoff.isoformat()}")
    print(f"Delete mode: {args.delete}")
    print(f"Jobs found: {len(jobs)}")
    print("=" * 80)

    total_bytes = 0

    for job in jobs:
        job_id = job.get("job_id")
        storage_dir = job.get("storage_dir", "")
        created_at = job.get("created_at")
        created_dt = parse_dt(created_at)

        folder_size = 0
        if storage_dir and os.path.exists(storage_dir):
            for root, _, files in os.walk(storage_dir):
                for file in files:
                    path = os.path.join(root, file)
                    try:
                        folder_size += os.path.getsize(path)
                    except OSError:
                        pass

        total_bytes += folder_size

        print()
        print(f"Job: {job_id}")
        print(f"Status: {job.get('status')}")
        print(f"Created: {created_dt}")
        print(f"Storage: {storage_dir}")
        print(f"Size MB: {round(folder_size / (1024 * 1024), 2)}")

        if args.delete:
            if storage_dir and os.path.exists(storage_dir):
                shutil.rmtree(storage_dir, ignore_errors=True)

            db.job_results.delete_many({"job_id": job_id})
            db.job_resumes.delete_many({"job_id": job_id})
            db.download_logs.delete_many({"job_id": job_id})
            db.jobs.delete_one({"job_id": job_id})

            print("Deleted: yes")
        else:
            print("Deleted: no, dry-run only")

    print()
    print("=" * 80)
    print(f"Total reclaimable MB: {round(total_bytes / (1024 * 1024), 2)}")
    print("=" * 80)

    if not args.delete:
        print("Dry-run only. To delete, add --delete")


if __name__ == "__main__":
    main()
