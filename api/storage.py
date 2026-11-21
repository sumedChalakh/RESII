import os
import uuid
import tempfile
import shutil
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from api.config import settings
from api.models import ManagedFileModel

class FileStorageManager:
    """
    Controlled, secure filesystem storage manager for original uploaded resumes.
    Prevents path traversal, uses atomic writes, and strictly isolates user files.
    """

    def __init__(self, base_dir: str = None):
        self.base_dir = (base_dir or settings.STORAGE_DIR).replace("\\", "/")
        os.makedirs(self.base_dir, exist_ok=True)

    def save_file(
        self,
        db: Session,
        user_id: str,
        original_filename: str,
        content: bytes,
        content_type: str,
        resume_id: Optional[str] = None
    ) -> ManagedFileModel:
        """
        Atomically saves an uploaded file to managed storage under a random UUID name.
        Records metadata in the database.
        """
        file_id = f"file_{uuid.uuid4().hex}"
        # Prevent any path traversal: enforce single clean basename in database, random name on disk
        clean_filename = os.path.basename(original_filename.strip())
        stored_filename = f"{file_id}.bin"
        target_path = os.path.join(self.base_dir, stored_filename).replace("\\", "/")

        # Atomic write: write to temp file first, then atomically rename
        temp_fd, temp_path = tempfile.mkstemp(dir=self.base_dir, prefix="tmp_upload_")
        try:
            with os.fdopen(temp_fd, "wb") as f:
                f.write(content)
            shutil.move(temp_path, target_path)
        except Exception:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            raise

        managed_file = ManagedFileModel(
            id=file_id,
            user_id=user_id,
            resume_id=resume_id,
            original_filename=clean_filename,
            content_type=content_type,
            file_size=len(content),
            storage_path=stored_filename,  # store relative path to avoid leaking server filesystem
            created_at=datetime_iso()
        )
        db.add(managed_file)
        db.flush()
        return managed_file

    def get_file_content(self, db: Session, user_id: str, file_id: str) -> Tuple[str, bytes]:
        """
        Retrieves file content if and only if owned by the specified user.
        Returns (original_filename, content_bytes).
        """
        record = db.query(ManagedFileModel).filter(
            ManagedFileModel.id == file_id,
            ManagedFileModel.user_id == user_id
        ).first()

        if not record:
            raise FileNotFoundError(f"File '{file_id}' not found for user '{user_id}'.")

        # Resolve path strictly inside self.base_dir
        safe_rel_path = os.path.basename(record.storage_path)
        full_path = os.path.join(self.base_dir, safe_rel_path).replace("\\", "/")

        if not os.path.exists(full_path):
            raise FileNotFoundError(f"Underlying storage for file '{file_id}' is missing.")

        with open(full_path, "rb") as f:
            content = f.read()

        return record.original_filename, content

    def delete_file(self, db: Session, user_id: str, file_id: str) -> bool:
        """Deletes a file if owned by the user, cleaning up both DB and disk."""
        record = db.query(ManagedFileModel).filter(
            ManagedFileModel.id == file_id,
            ManagedFileModel.user_id == user_id
        ).first()

        if not record:
            return False

        safe_rel_path = os.path.basename(record.storage_path)
        full_path = os.path.join(self.base_dir, safe_rel_path)

        if os.path.exists(full_path):
            try:
                os.remove(full_path)
            except OSError:
                pass

        db.delete(record)
        db.flush()
        return True


def datetime_iso() -> str:
    import datetime
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

storage_manager = FileStorageManager()
