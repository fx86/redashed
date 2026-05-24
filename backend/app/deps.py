from __future__ import annotations
import os
import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer()
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            f"{os.environ['SUPABASE_URL']}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
        )
    return _jwks_client


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    token = creds.credentials
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256", "HS256"],
            options={"verify_aud": False},
        )
        return {"user_id": payload["sub"], "jwt": token}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
