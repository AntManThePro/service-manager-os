from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

import jwt
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Boolean, DateTime, Integer, JSON, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Settings(BaseSettings):
    database_url: str = "sqlite:///./hood_boss_ops.db"
    jwt_secret: str = "development-only-change-me"
    token_ttl_hours: int = 12
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
security = HTTPBearer(auto_error=False)
PASSWORD_KEY = "admin_password_hash"


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)


class Entry(Base):
    __tablename__ = "entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class TaskState(Base):
    __tablename__ = "task_states"
    task_key: Mapped[str] = mapped_column(String(220), primary_key=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class PasswordRequest(BaseModel):
    password: str = Field(min_length=8, max_length=200)


class EntryCreate(BaseModel):
    kind: Literal["coaching", "visit", "candidate", "action", "weekly_review", "note"]
    payload: dict[str, Any]


class EntryUpdate(BaseModel):
    payload: dict[str, Any]


class TaskUpdate(BaseModel):
    done: bool


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, salt_b64, digest_b64 = stored.split("$", 2)
        if algorithm != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=len(expected))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def create_token() -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": "anthony-admin", "iat": now, "exp": now + timedelta(hours=settings.token_ttl_hours)}, settings.jwt_secret, algorithm="HS256")


def require_admin(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Unlock required.")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired unlock token.") from exc
    if payload.get("sub") != "anthony-admin":
        raise HTTPException(status_code=401, detail="Invalid token subject.")
    return payload


def password_hash(db: Session) -> str | None:
    row = db.get(Setting, PASSWORD_KEY)
    return row.value if row else None


def entry_dict(entry: Entry) -> dict[str, Any]:
    return {
        "id": entry.id,
        "kind": entry.kind,
        "payload": entry.payload,
        "created_at": entry.created_at.isoformat(),
        "updated_at": entry.updated_at.isoformat(),
    }


Base.metadata.create_all(bind=engine)
app = FastAPI(title="Hood Boss Service Manager OS", version="2.0.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "hood-boss-ops"}


@app.get("/api/auth/status")
def auth_status(db: Session = Depends(get_db)) -> dict[str, bool]:
    return {"setup_required": password_hash(db) is None}


@app.post("/api/auth/setup")
def setup_password(request: PasswordRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    if password_hash(db) is not None:
        raise HTTPException(status_code=409, detail="Password already configured.")
    try:
        encoded = hash_password(request.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.add(Setting(key=PASSWORD_KEY, value=encoded))
    db.commit()
    return {"token": create_token()}


@app.post("/api/auth/login")
def login(request: PasswordRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    stored = password_hash(db)
    if stored is None:
        raise HTTPException(status_code=409, detail="Password setup required.")
    if not verify_password(request.password, stored):
        raise HTTPException(status_code=401, detail="Incorrect password.")
    return {"token": create_token()}


@app.post("/api/auth/change-password")
def change_password(request: PasswordRequest, _: dict = Depends(require_admin), db: Session = Depends(get_db)) -> dict[str, str]:
    encoded = hash_password(request.password)
    row = db.get(Setting, PASSWORD_KEY)
    if row is None:
        row = Setting(key=PASSWORD_KEY, value=encoded)
        db.add(row)
    else:
        row.value = encoded
    db.commit()
    return {"status": "updated"}


@app.get("/api/entries")
def list_entries(kind: str | None = Query(default=None), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    stmt = select(Entry).order_by(Entry.created_at.desc())
    if kind:
        stmt = stmt.where(Entry.kind == kind)
    return [entry_dict(row) for row in db.scalars(stmt).all()]


@app.post("/api/entries", status_code=201)
def create_entry(request: EntryCreate, _: dict = Depends(require_admin), db: Session = Depends(get_db)) -> dict[str, Any]:
    entry = Entry(kind=request.kind, payload=request.payload)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry_dict(entry)


@app.put("/api/entries/{entry_id}")
def update_entry(entry_id: int, request: EntryUpdate, _: dict = Depends(require_admin), db: Session = Depends(get_db)) -> dict[str, Any]:
    entry = db.get(Entry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    entry.payload = request.payload
    entry.updated_at = utcnow()
    db.commit()
    db.refresh(entry)
    return entry_dict(entry)


@app.delete("/api/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: int, _: dict = Depends(require_admin), db: Session = Depends(get_db)) -> None:
    entry = db.get(Entry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    db.delete(entry)
    db.commit()


@app.get("/api/tasks")
def list_tasks(db: Session = Depends(get_db)) -> dict[str, bool]:
    return {row.task_key: row.done for row in db.scalars(select(TaskState)).all()}


@app.put("/api/tasks/{task_key:path}")
def set_task(task_key: str, request: TaskUpdate, _: dict = Depends(require_admin), db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.get(TaskState, task_key)
    if row is None:
        row = TaskState(task_key=task_key, done=request.done)
        db.add(row)
    else:
        row.done = request.done
        row.updated_at = utcnow()
    db.commit()
    return {"task_key": task_key, "done": request.done}


frontend_dir = Path(__file__).resolve().parents[1] / "frontend"


@app.get("/")
def index() -> FileResponse:
    return FileResponse(frontend_dir / "index.html")


app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
