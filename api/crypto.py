import os
import base64
import hashlib
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
from api.config import settings

class EncryptionError(Exception):
    """Base exception for credential encryption/decryption failures."""
    pass

class CiphertextTamperedError(EncryptionError):
    """Raised when ciphertext payload fails signature or authentication check."""
    pass

class DecryptionError(EncryptionError):
    """Raised when decryption fails due to wrong key or corrupted ciphertext."""
    pass

class MissingKeyError(EncryptionError):
    """Raised when encryption is requested but no key is configured."""
    pass


def _derive_fernet_key(source_secret: str) -> bytes:
    """Derives a deterministic 32-byte URL-safe base64 key suitable for Fernet."""
    digest = hashlib.sha256(source_secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def get_encryption_key(key_override: Optional[str] = None) -> Optional[bytes]:
    """
    Returns a 32-byte Fernet key.
    Prefers key_override, then settings.CREDENTIAL_ENCRYPTION_KEY,
    and falls back to a dedicated derivation from settings.SECRET_KEY in development.
    """
    raw_key = key_override or getattr(settings, "CREDENTIAL_ENCRYPTION_KEY", None) or os.getenv("CREDENTIAL_ENCRYPTION_KEY")
    if raw_key:
        # Check if already a valid 32-byte base64-encoded key
        try:
            decoded = base64.urlsafe_b64decode(raw_key.encode("utf-8"))
            if len(decoded) == 32:
                return raw_key.encode("utf-8")
        except Exception:
            pass
        return _derive_fernet_key(raw_key)

    if getattr(settings, "ENVIRONMENT", "development") == "production":
        raise MissingKeyError(
            "CREDENTIAL_ENCRYPTION_KEY is required in production environment; development fallback is prohibited."
        )

    # Dedicated dev fallback derived from SECRET_KEY (never use raw session key)
    dev_secret = getattr(settings, "SECRET_KEY", "resii_dev_secret")
    return _derive_fernet_key(f"{dev_secret}:resii_credential_aes256_enc_v1")


def encrypt_credential(plaintext: str, key_override: Optional[str] = None) -> str:
    """
    Encrypts a plaintext API credential into versioned ciphertext 'v1:<fernet_token>'.
    Never persists or logs raw keys.
    """
    if not plaintext or not plaintext.strip():
        return ""
    
    key = get_encryption_key(key_override)
    if not key:
        raise MissingKeyError("No credential encryption key configured.")
    
    f = Fernet(key)
    token = f.encrypt(plaintext.strip().encode("utf-8")).decode("utf-8")
    return f"v1:{token}"


def decrypt_credential(ciphertext: Optional[str], key_override: Optional[str] = None) -> Optional[str]:
    """
    Decrypts a versioned ciphertext 'v1:<token>'.
    Fails safely if ciphertext is None, empty, unencrypted, or masked.
    Raises CiphertextTamperedError or DecryptionError on tampered data or wrong key.
    """
    if not ciphertext or not isinstance(ciphertext, str):
        return None
    
    clean = ciphertext.strip()
    if not clean.startswith("v1:"):
        # Not a valid versioned ciphertext (e.g. legacy masked display value 'sk-1...***')
        return None
    
    token = clean[3:]
    key = get_encryption_key(key_override)
    if not key:
        raise MissingKeyError("No credential encryption key configured.")
    
    try:
        f = Fernet(key)
        return f.decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken as e:
        raise DecryptionError("Failed to decrypt credential (invalid token, wrong key, or tampered ciphertext).") from e
    except Exception as e:
        raise DecryptionError(f"Decryption failed: {e}") from e


def mask_credential(key: Optional[str]) -> str:
    """
    Generates a safe presentation mask without leaking the secret.
    Example: 'sk-proj-1234567890abcdef' -> 'sk-p...cdef'
    """
    if not key or not isinstance(key, str):
        return ""
    clean = key.strip()
    if len(clean) <= 8:
        return "***"
    return f"{clean[:4]}...{clean[-4:]}"
