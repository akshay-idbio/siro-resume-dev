import os
import re
from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends, Header
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel

from db import users_col, audit_logs_col, utc_now


# =========================================================
# CONFIG
# =========================================================

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "CHANGE_THIS_SECRET_KEY_IN_PRODUCTION")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

auth_router = APIRouter(prefix="/auth", tags=["Auth"])
admin_router = APIRouter(prefix="/admin", tags=["Admin"])


# =========================================================
# MODELS
# =========================================================

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    company: Optional[str] = ""
    phone: Optional[str] = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class ApproveRejectRequest(BaseModel):
    reason: Optional[str] = ""


# =========================================================
# HELPERS
# =========================================================

def clean_email(email: str) -> str:
    return (email or "").strip().lower()


def validate_email(email: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return pwd_context.verify(password, hashed_password)


def object_id_to_str(doc: dict) -> dict:
    if not doc:
        return doc

    doc = dict(doc)

    if "_id" in doc:
        doc["_id"] = str(doc["_id"])

    # never expose password hash
    doc.pop("password_hash", None)

    return doc


def create_access_token(user: dict) -> str:
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)

    payload = {
        "sub": str(user["_id"]),
        "email": user["email"],
        "role": user["role"],
        "status": user["status"],
        "exp": expire,
    }

    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


async def write_audit_log(
    action: str,
    user_id: Optional[str] = None,
    admin_id: Optional[str] = None,
    details: Optional[dict] = None,
):
    await audit_logs_col.insert_one(
        {
            "action": action,
            "user_id": user_id,
            "admin_id": admin_id,
            "details": details or {},
            "created_at": utc_now(),
        }
    )


async def get_current_user(authorization: Optional[str] = Header(default=None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    token = authorization.split(" ", 1)[1].strip()

    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    try:
        user = await users_col.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id")

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if user.get("status") != "approved":
        raise HTTPException(status_code=403, detail="User is not approved yet")

    return user


async def get_current_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    return current_user


# =========================================================
# AUTH ROUTES
# =========================================================

@auth_router.post("/register")
async def register_user(payload: RegisterRequest):
    name = (payload.name or "").strip()
    email = clean_email(payload.email)
    password = payload.password or ""

    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    if not validate_email(email):
        raise HTTPException(status_code=400, detail="Valid email is required")

    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = await users_col.find_one({"email": email})

    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    now = utc_now()

    user_doc = {
        "name": name,
        "email": email,
        "password_hash": hash_password(password),
        "company": (payload.company or "").strip(),
        "phone": (payload.phone or "").strip(),
        "role": "user",
        "status": "pending",
        "created_at": now,
        "updated_at": now,
        "approved_at": None,
        "approved_by": None,
        "rejected_at": None,
        "rejected_by": None,
        "reject_reason": "",
        "last_login_at": None,
    }

    result = await users_col.insert_one(user_doc)

    await write_audit_log(
        action="USER_REGISTERED",
        user_id=str(result.inserted_id),
        details={"email": email, "name": name},
    )

    return {
        "success": True,
        "message": "Registration successful. Please wait for admin approval.",
        "user_id": str(result.inserted_id),
        "status": "pending",
    }


@auth_router.post("/login")
async def login_user(payload: LoginRequest):
    email = clean_email(payload.email)
    password = payload.password or ""

    user = await users_col.find_one({"email": email})

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.get("status") != "approved":
        raise HTTPException(
            status_code=403,
            detail=f"User is {user.get('status', 'pending')}. Please contact admin.",
        )

    await users_col.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login_at": utc_now(), "updated_at": utc_now()}},
    )

    token = create_access_token(user)

    await write_audit_log(
        action="USER_LOGIN",
        user_id=str(user["_id"]),
        details={"email": email},
    )

    return {
        "success": True,
        "message": "Login successful",
        "access_token": token,
        "token_type": "bearer",
        "user": object_id_to_str(user),
    }


@auth_router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "success": True,
        "user": object_id_to_str(current_user),
    }


# =========================================================
# ADMIN ROUTES
# =========================================================

@admin_router.get("/users")
async def list_users(
    status: Optional[str] = None,
    admin_user: dict = Depends(get_current_admin),
):
    query = {}

    if status:
        query["status"] = status

    cursor = users_col.find(query).sort("created_at", -1)

    users = []

    async for user in cursor:
        users.append(object_id_to_str(user))

    return {
        "success": True,
        "total": len(users),
        "users": users,
    }


@admin_router.get("/users/pending")
async def list_pending_users(admin_user: dict = Depends(get_current_admin)):
    cursor = users_col.find({"status": "pending"}).sort("created_at", -1)

    users = []

    async for user in cursor:
        users.append(object_id_to_str(user))

    return {
        "success": True,
        "total": len(users),
        "users": users,
    }


@admin_router.post("/users/{user_id}/approve")
async def approve_user(
    user_id: str,
    payload: ApproveRejectRequest,
    admin_user: dict = Depends(get_current_admin),
):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

    user = await users_col.find_one({"_id": oid})

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await users_col.update_one(
        {"_id": oid},
        {
            "$set": {
                "status": "approved",
                "approved_at": utc_now(),
                "approved_by": str(admin_user["_id"]),
                "updated_at": utc_now(),
                "reject_reason": "",
            }
        },
    )

    await write_audit_log(
        action="USER_APPROVED",
        user_id=user_id,
        admin_id=str(admin_user["_id"]),
        details={"email": user.get("email"), "reason": payload.reason or ""},
    )

    return {
        "success": True,
        "message": "User approved successfully",
        "user_id": user_id,
    }


@admin_router.post("/users/{user_id}/reject")
async def reject_user(
    user_id: str,
    payload: ApproveRejectRequest,
    admin_user: dict = Depends(get_current_admin),
):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

    user = await users_col.find_one({"_id": oid})

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await users_col.update_one(
        {"_id": oid},
        {
            "$set": {
                "status": "rejected",
                "rejected_at": utc_now(),
                "rejected_by": str(admin_user["_id"]),
                "reject_reason": payload.reason or "",
                "updated_at": utc_now(),
            }
        },
    )

    await write_audit_log(
        action="USER_REJECTED",
        user_id=user_id,
        admin_id=str(admin_user["_id"]),
        details={"email": user.get("email"), "reason": payload.reason or ""},
    )

    return {
        "success": True,
        "message": "User rejected successfully",
        "user_id": user_id,
    }