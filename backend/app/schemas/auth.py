from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: Optional[str] = None
    name: Optional[str] = None


class UserRead(BaseModel):
    id: UUID
    email: EmailStr
    name: str
    is_active: bool = True

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Optional[UserRead] = None

