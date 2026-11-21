import os
import hmac
import hashlib
import zipfile
import io
from typing import Optional
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHash
from fastapi import HTTPException

# Initialize Argon2 password hasher with secure defaults (Argon2id)
_ph = PasswordHasher()

# Defensive limits for DOCX archive validation
MAX_DOCX_TOTAL_UNCOMPRESSED = 50 * 1024 * 1024   # 50 MB total decompressed
MAX_DOCX_MEMBER_SIZE        = 20 * 1024 * 1024   # 20 MB max single member
MAX_DOCX_MEMBER_COUNT       = 1000               # 1,000 members max
MAX_DOCX_COMPRESSION_RATIO  = 100.0              # 100:1 max ratio for files > 100KB

def hash_password(password: str) -> str:
    """Hash a password using Argon2id."""
    return _ph.hash(password)

def verify_password(hash_value: str, password: str) -> bool:
    """Verify a password against an Argon2 hash in constant time."""
    try:
        return _ph.verify(hash_value, password)
    except (VerifyMismatchError, VerificationError, InvalidHash):
        return False

def sign_session_id(session_id: str, secret_key: str) -> str:
    """Sign a session ID using HMAC-SHA256."""
    signature = hmac.new(
        secret_key.encode("utf-8"),
        session_id.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    return f"{session_id}.{signature}"

def unsign_session_id(cookie_value: Optional[str], secret_key: str) -> Optional[str]:
    """
    Validate HMAC-SHA256 signature and return the session ID.
    Returns None if signature is invalid, missing, or tampered.
    """
    if not cookie_value or "." not in cookie_value:
        return None
    
    parts = cookie_value.rsplit(".", 1)
    if len(parts) != 2:
        return None
    
    session_id, signature = parts
    expected_signature = hmac.new(
        secret_key.encode("utf-8"),
        session_id.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    if hmac.compare_digest(signature, expected_signature):
        return session_id
    return None

def generate_csrf_token(session_id: str, secret_key: str) -> str:
    """Generate a cryptographic CSRF token deterministically bound to session ID."""
    token = hmac.new(
        secret_key.encode("utf-8"),
        f"csrf:{session_id}".encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    return token

def verify_csrf_token(token: Optional[str], session_id: str, secret_key: str) -> bool:
    """Verify CSRF token against session ID in constant time."""
    if not token:
        return False
    expected = generate_csrf_token(session_id, secret_key)
    return hmac.compare_digest(token, expected)

def validate_docx_archive(content: bytes) -> None:
    """
    Performs defensive ZIP package inspection on DOCX bytes before passing to python-docx:
    - Asserts valid ZIP magic bytes (PK\\x03\\x04).
    - Enforces maximum member count (<= 1,000).
    - Enforces maximum total decompressed size (<= 50 MB).
    - Enforces maximum individual decompressed member size (<= 20 MB).
    - Defends against Zip Bombs by rejecting excessive compression ratios (> 100:1).
    - Rejects path traversal (\\..\\, /../, absolute paths, null bytes).
    - Verifies presence of required WordprocessingML structural members:
      '[Content_Types].xml' AND 'word/document.xml'.
    - Validates strictly in memory with zero disk writes.
    """
    if not content.startswith(b"PK\x03\x04"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file signature: Content is not a valid DOCX package (missing ZIP magic bytes)."
        )

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            infolist = zf.infolist()

            # 1. Member count constraint
            if len(infolist) > MAX_DOCX_MEMBER_COUNT:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid DOCX package: Archive member count ({len(infolist)}) exceeds safety limit of {MAX_DOCX_MEMBER_COUNT}."
                )

            total_uncompressed = 0
            has_content_types = False
            has_word_doc = False

            for info in infolist:
                name = info.filename

                # 2. Path traversal and malformed name checks
                if "\x00" in name:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid DOCX package: Archive contains member with null byte."
                    )
                if name.startswith("/") or name.startswith("\\") or (len(name) > 1 and name[1] == ":"):
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid DOCX package: Archive contains member with absolute path."
                    )
                
                # Check path segments for directory traversal
                normalized_path = name.replace("\\", "/")
                segments = normalized_path.split("/")
                if ".." in segments:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid DOCX package: Archive contains path traversal components ('..')."
                    )

                # Track required WordprocessingML structural definitions
                if name == "[Content_Types].xml":
                    has_content_types = True
                elif name == "word/document.xml":
                    has_word_doc = True

                uncompressed = info.file_size
                compressed = info.compress_size

                # 3. Individual member size limit
                if uncompressed > MAX_DOCX_MEMBER_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid DOCX package: Archive member '{name}' uncompressed size ({uncompressed // (1024*1024)} MB) exceeds {MAX_DOCX_MEMBER_SIZE // (1024*1024)} MB limit."
                    )

                total_uncompressed += uncompressed

                # 4. Decompression bomb / compression ratio check
                # Only evaluate files above 100 KB uncompressed to avoid false positives on small metadata files
                if uncompressed > 100 * 1024:
                    if compressed == 0 and uncompressed > 0:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Invalid DOCX package: Suspicious compression ratio in member '{name}' (Zip Bomb detected)."
                        )
                    ratio = uncompressed / compressed if compressed > 0 else 0
                    if ratio > MAX_DOCX_COMPRESSION_RATIO:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Invalid DOCX package: Compression ratio ({ratio:.1f}:1) in member '{name}' exceeds safety threshold of {int(MAX_DOCX_COMPRESSION_RATIO)}:1 (Zip Bomb detected)."
                        )

            # 5. Total decompressed size limit
            if total_uncompressed > MAX_DOCX_TOTAL_UNCOMPRESSED:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid DOCX package: Total uncompressed archive size ({total_uncompressed // (1024*1024)} MB) exceeds {MAX_DOCX_TOTAL_UNCOMPRESSED // (1024*1024)} MB safety limit."
                )

            # 6. Strict DOCX structural members requirement
            if not has_content_types or not has_word_doc:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid DOCX structure: Missing required WordprocessingML definitions ('[Content_Types].xml' and 'word/document.xml')."
                )

    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=400,
            detail="Invalid DOCX package: Corrupted or unreadable ZIP archive."
        )

def validate_file_content(filename: str, content: bytes) -> None:
    """
    Validates magic bytes, archive structure, and size for uploaded files.
    Rejects spoofed extensions, empty files, or corrupted archives.
    """
    if not content or len(content) == 0:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty (0 bytes)."
        )

    ext = os.path.splitext(filename)[1].lower()

    if ext == ".pdf":
        if not (content.startswith(b"%PDF-") or b"%PDF-" in content[:1024]):
            raise HTTPException(
                status_code=400,
                detail="Invalid file signature: Content is not a valid PDF document."
            )
    elif ext == ".docx":
        validate_docx_archive(content)
    elif ext == ".txt":
        try:
            sample = content[:4096].decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            try:
                sample = content[:4096].decode("latin-1", errors="strict")
            except UnicodeDecodeError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid TXT file: Content is binary or unreadable encoding."
                )
        if "\x00" in sample:
            raise HTTPException(
                status_code=400,
                detail="Invalid TXT file: Contains binary null characters."
            )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Allowed: .pdf, .docx, .txt"
        )
