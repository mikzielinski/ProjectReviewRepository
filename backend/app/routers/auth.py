from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import traceback
import logging

from app.db import get_db
from app.schemas import LoginRequest, Token, UserRead
from app.security import verify_password, get_password_hash, create_access_token
from app.dependencies import get_current_active_user
from app.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Login request received: email={payload.email}, has_password={bool(payload.password)}")
    print(f"LOGIN REQUEST: email={payload.email}, has_password={bool(payload.password)}")
    try:
        user = db.query(User).filter(User.email == payload.email).first()
        logger.info(f"User found: {user is not None}")
        print(f"User found: {user is not None}")
        if user:
            if user.password_hash and payload.password:
                if not verify_password(payload.password, user.password_hash):
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        else:
            # Create new user - password will be hashed in get_password_hash
            password_to_hash = payload.password or "changeme"
            password_bytes = password_to_hash.encode('utf-8')
            if len(password_bytes) > 72:
                password_to_hash = password_bytes[:72].decode('utf-8', errors='ignore')
            
            user = User(
                email=payload.email,
                name=payload.name or payload.email.split("@")[0],
                password_hash=get_password_hash(password_to_hash),
                is_active=True,
                auth_provider="local",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        token = create_access_token(user.email)
        # Return user data in response for frontend using from_attributes
        user_data = UserRead.model_validate(user)
        logger.info(f"Login successful for user: {user.email}")
        print(f"LOGIN SUCCESS: user={user.email}")
        return Token(access_token=token, user=user_data)
    except Exception as e:
        db.rollback()
        logger.error(f"Login failed: {str(e)}", exc_info=True)
        print(f"LOGIN ERROR: {str(e)}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(e)}"
        )


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_active_user)):
    return current_user

