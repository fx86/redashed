from __future__ import annotations
import os
from cryptography.fernet import Fernet

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(os.environ["ENCRYPTION_KEY"].encode())
    return _fernet


def encrypt(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    return _get_fernet().decrypt(token.encode()).decode()
