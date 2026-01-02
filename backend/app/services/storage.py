"""
Simple storage service for file upload/download.
For now, uses local filesystem with a storage directory.
"""
import os
import hashlib
from pathlib import Path

# Base storage directory
STORAGE_BASE = os.getenv("STORAGE_BASE", os.path.join(os.path.dirname(__file__), "../../storage"))


def ensure_storage_dir():
    """Ensure storage directory exists."""
    Path(STORAGE_BASE).mkdir(parents=True, exist_ok=True)
    return STORAGE_BASE


def upload_file(content: bytes, object_key: str, content_type: str = "application/octet-stream") -> tuple[str, str]:
    """
    Upload file to storage.
    Returns (object_key, file_hash).
    """
    ensure_storage_dir()
    
    # Create full path
    full_path = os.path.join(STORAGE_BASE, object_key)
    
    # Create directory if needed
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    
    # Write file
    with open(full_path, 'wb') as f:
        f.write(content)
    
    # Calculate hash
    file_hash = hashlib.sha256(content).hexdigest()
    
    return object_key, file_hash


def download_file(object_key: str, expected_hash: str = None) -> bytes:
    """
    Download file from storage.
    HIPAA/GxP/GIS Compliance: Verifies file integrity using hash.
    
    Args:
        object_key: Storage key for the file
        expected_hash: Optional SHA256 hash to verify file integrity
    
    Returns:
        File content as bytes
    
    Raises:
        FileNotFoundError: If file doesn't exist
        ValueError: If hash verification fails
    """
    import hashlib
    import logging
    
    logger = logging.getLogger(__name__)
    
    # Ensure storage directory exists
    ensure_storage_dir()
    
    full_path = os.path.join(STORAGE_BASE, object_key)
    logger.info(f"Attempting to download file: object_key={object_key}, full_path={full_path}")
    logger.info(f"Storage base directory: {STORAGE_BASE}")
    logger.info(f"Storage base exists: {os.path.exists(STORAGE_BASE)}")
    
    if not os.path.exists(full_path):
        logger.error(f"File not found: {object_key} (full path: {full_path})")
        if os.path.exists(STORAGE_BASE):
            try:
                files_in_base = os.listdir(STORAGE_BASE)
                logger.error(f"Files in storage base: {files_in_base}")
            except Exception as e:
                logger.error(f"Could not list storage base: {str(e)}")
        raise FileNotFoundError(f"File not found: {object_key} (full path: {full_path})")
    
    with open(full_path, 'rb') as f:
        content = f.read()
    
    logger.info(f"File read successfully: {object_key}, size: {len(content)} bytes")
    
    # HIPAA/GxP/GIS Compliance: Verify file integrity
    if expected_hash:
        actual_hash = hashlib.sha256(content).hexdigest()
        if actual_hash != expected_hash:
            logger.error(f"File integrity check failed for {object_key}: Expected hash {expected_hash}, got {actual_hash}")
            raise ValueError(
                f"File integrity check failed: expected hash {expected_hash}, got {actual_hash}. "
                "File may have been tampered with."
            )
        logger.info(f"File integrity check passed for {object_key}")
    
    return content


def generate_object_key(prefix: str, filename: str, project_id: str = None) -> str:
    """
    Generate object key for storage.
    HIPAA/GxP/GIS Compliance: Files are organized by project for data isolation.
    
    Args:
        prefix: Base prefix (e.g., "documents", "templates")
        filename: Original filename
        project_id: Optional project ID for project-specific storage
    
    Returns:
        Object key path
    """
    import uuid
    import time
    
    # Create unique filename
    timestamp = int(time.time())
    unique_id = str(uuid.uuid4())[:8]
    name, ext = os.path.splitext(filename)
    unique_filename = f"{name}_{timestamp}_{unique_id}{ext}"
    
    # HIPAA/GxP/GIS: Organize by project if project_id provided
    if project_id:
        prefix = os.path.join(prefix, f"projects/{project_id}").replace("\\", "/")
    
    return os.path.join(prefix, unique_filename).replace("\\", "/")

