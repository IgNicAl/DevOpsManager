from typing import Any, Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """Standard API response envelope used by all endpoints."""

    success: bool
    data: T | None = None
    error: str | None = None


class ConfirmBody(BaseModel):
    """Base body for destructive actions requiring confirmation."""

    confirm: bool = False


def ok(data: Any = None) -> dict:
    """Return a success envelope."""
    return {"success": True, "data": data, "error": None}


def fail(error: str, status_code: int = 400) -> dict:
    """Return a failure envelope. Caller should set the HTTP status via HTTPException or Response."""
    return {"success": False, "data": None, "error": error}
