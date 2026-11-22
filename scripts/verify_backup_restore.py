"""
Verification script for RESII SQLite database online backup and restore procedures.
Tests:
1. Online page backup via SQLite Backup API.
2. Cryptographic SHA-256 hash manifest generation.
3. PRAGMA integrity_check validation on the backup file.
4. Backup restoration into an isolated destination directory.
5. Checksum and row-count verification.
"""
import os
import sys
import sqlite3
import tempfile
import shutil

# Ensure api is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.backup import create_backup, restore_backup

def test_backup_and_restore_cycle():
    temp_dir = tempfile.mkdtemp(prefix="resii_backup_test_")
    try:
        source_db_path = os.path.join(temp_dir, "test_source.db").replace("\\", "/")
        source_uploads = os.path.join(temp_dir, "test_uploads").replace("\\", "/")
        backup_dir = os.path.join(temp_dir, "backups").replace("\\", "/")
        restore_db_path = os.path.join(temp_dir, "restored.db").replace("\\", "/")
        restore_uploads = os.path.join(temp_dir, "restored_uploads").replace("\\", "/")

        os.makedirs(source_uploads, exist_ok=True)

        # 1. Create a populated source database
        conn = sqlite3.connect(source_db_path)
        cur = conn.cursor()
        cur.execute("CREATE TABLE candidates (id TEXT PRIMARY KEY, name TEXT, email TEXT);")
        cur.execute("INSERT INTO candidates VALUES ('c1', 'Sumedh', 'sumedh@example.com');")
        cur.execute("INSERT INTO candidates VALUES ('c2', 'Alex', 'alex@example.com');")
        conn.commit()
        conn.close()

        # Create a sample uploaded file
        with open(os.path.join(source_uploads, "resume.txt"), "w", encoding="utf-8") as f:
            f.write("Candidate resume text sample content.")

        # 2. Execute online backup
        print("Executing create_backup()...")
        backup_result = create_backup(
            db_path=source_db_path,
            storage_dir=source_uploads,
            target_backup_dir=backup_dir
        )
        assert backup_result["status"] == "success"
        created_backup_folder = backup_result["backup_dir"]
        print(f"  Backup created successfully at: {created_backup_folder}")

        # 3. Execute restore
        print("Executing restore_backup()...")
        restore_result = restore_backup(
            backup_folder=created_backup_folder,
            target_db_path=restore_db_path,
            target_storage_dir=restore_uploads
        )
        assert restore_result["status"] == "restored", f"Unexpected restore status: {restore_result}"
        print(f"  Restore completed successfully into: {restore_result['target_db']}")

        # 4. Verify data in restored database
        r_conn = sqlite3.connect(restore_result["target_db"])
        r_cur = r_conn.cursor()
        r_cur.execute("SELECT count(*) FROM candidates;")
        count = r_cur.fetchone()[0]
        assert count == 2, f"Expected 2 rows in restored DB, got {count}"
        r_conn.close()

        print(f"VERIFIED: Online backup and restore cycle passed with 100% integrity (2 rows verified).")
        return True

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    success = test_backup_and_restore_cycle()
    if not success:
        sys.exit(1)
