import os
import sqlite3
import shutil
import hashlib
import json
import datetime
from typing import Dict, Any, Optional, List
from api.config import settings

def _compute_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def create_backup(
    db_path: Optional[str] = None,
    storage_dir: Optional[str] = None,
    target_backup_dir: Optional[str] = None
) -> Dict[str, Any]:
    """
    Creates a transactionally consistent backup using SQLite's native backup API.
    Backs up database pages online without locks, copies managed files, verifies
    integrity via PRAGMA integrity_check, and records an audited cryptographic manifest.
    """
    source_db = (db_path or settings.DATABASE_URL.replace("sqlite:///", "")).replace("\\", "/")
    source_storage = (storage_dir or settings.STORAGE_DIR).replace("\\", "/")
    
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
    base_backup_root = (target_backup_dir or settings.BACKUP_DIR).replace("\\", "/")
    os.makedirs(base_backup_root, exist_ok=True)
    
    backup_folder = os.path.join(base_backup_root, f"backup_{timestamp}").replace("\\", "/")
    os.makedirs(backup_folder, exist_ok=True)

    backup_db_path = os.path.join(backup_folder, "resii_backup.db").replace("\\", "/")
    backup_uploads_dir = os.path.join(backup_folder, "uploads").replace("\\", "/")
    os.makedirs(backup_uploads_dir, exist_ok=True)

    # 1. Native Online SQLite Backup API
    if os.path.exists(source_db):
        source_conn = sqlite3.connect(source_db)
        target_conn = sqlite3.connect(backup_db_path)
        try:
            with target_conn:
                source_conn.backup(target_conn)
        finally:
            target_conn.close()
            source_conn.close()
    else:
        # If DB file doesn't exist yet, create empty valid DB
        empty_conn = sqlite3.connect(backup_db_path)
        empty_conn.close()

    # 2. Verify integrity of backup database
    verify_conn = sqlite3.connect(backup_db_path)
    try:
        cursor = verify_conn.cursor()
        cursor.execute("PRAGMA integrity_check;")
        check_result = cursor.fetchone()
        if not check_result or check_result[0] != "ok":
            raise RuntimeError(f"Backup integrity check failed: {check_result}")
    finally:
        verify_conn.close()

    # 3. Copy managed uploads
    copied_files = []
    if os.path.exists(source_storage):
        for fname in os.listdir(source_storage):
            src_f = os.path.join(source_storage, fname)
            if os.path.isfile(src_f):
                dst_f = os.path.join(backup_uploads_dir, fname)
                shutil.copy2(src_f, dst_f)
                copied_files.append({
                    "filename": fname,
                    "sha256": _compute_sha256(dst_f),
                    "size": os.path.getsize(dst_f)
                })

    # 4. Generate manifest
    db_sha256 = _compute_sha256(backup_db_path)
    manifest = {
        "timestamp": timestamp,
        "database": {
            "filename": "resii_backup.db",
            "sha256": db_sha256,
            "size": os.path.getsize(backup_db_path),
            "integrity": "verified"
        },
        "uploads": copied_files,
        "total_files": len(copied_files)
    }

    manifest_path = os.path.join(backup_folder, "manifest.json").replace("\\", "/")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    return {
        "status": "success",
        "backup_dir": backup_folder,
        "timestamp": timestamp,
        "manifest": manifest
    }

def restore_backup(
    backup_folder: str,
    target_db_path: Optional[str] = None,
    target_storage_dir: Optional[str] = None
) -> Dict[str, Any]:
    """
    Restores database and managed files from a validated backup directory.
    Verifies manifest hashes and PRAGMA integrity_check before restoration.
    """
    backup_dir = backup_folder.replace("\\", "/")
    manifest_path = os.path.join(backup_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        raise FileNotFoundError(f"Manifest not found in backup directory: '{backup_dir}'")

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    backup_db = os.path.join(backup_dir, manifest["database"]["filename"]).replace("\\", "/")
    if not os.path.exists(backup_db):
        raise FileNotFoundError("Backup database file is missing.")

    # 1. Verify DB SHA256 and SQLite integrity
    current_db_hash = _compute_sha256(backup_db)
    if current_db_hash != manifest["database"]["sha256"]:
        raise ValueError("Backup database SHA256 checksum mismatch.")

    verify_conn = sqlite3.connect(backup_db)
    try:
        cursor = verify_conn.cursor()
        cursor.execute("PRAGMA integrity_check;")
        check_result = cursor.fetchone()
        if not check_result or check_result[0] != "ok":
            raise RuntimeError(f"Backup database failed integrity check: {check_result}")
    finally:
        verify_conn.close()

    # 2. Restore Database
    dest_db = (target_db_path or settings.DATABASE_URL.replace("sqlite:///", "")).replace("\\", "/")
    os.makedirs(os.path.dirname(os.path.abspath(dest_db)), exist_ok=True)
    shutil.copy2(backup_db, dest_db)

    # 3. Restore Uploads
    dest_storage = (target_storage_dir or settings.STORAGE_DIR).replace("\\", "/")
    os.makedirs(dest_storage, exist_ok=True)
    backup_uploads_dir = os.path.join(backup_dir, "uploads")

    restored_files_count = 0
    if os.path.exists(backup_uploads_dir):
        for f_entry in manifest.get("uploads", []):
            fname = f_entry["filename"]
            src_f = os.path.join(backup_uploads_dir, fname)
            if os.path.exists(src_f):
                dst_f = os.path.join(dest_storage, fname)
                shutil.copy2(src_f, dst_f)
                restored_files_count += 1

    return {
        "status": "restored",
        "timestamp": manifest["timestamp"],
        "target_db": dest_db,
        "restored_files": restored_files_count
    }
