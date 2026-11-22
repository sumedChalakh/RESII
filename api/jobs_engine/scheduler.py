import asyncio
import logging
import threading
from typing import Optional
from api.db import SessionLocal
from api.jobs_engine.service import job_discovery_service
from api.models import JobListingModel
from api.config import settings

logger = logging.getLogger("resii.jobs_scheduler")

_scheduler_task: Optional[asyncio.Task] = None
_shutdown_event: Optional[asyncio.Event] = None
_sync_lock = threading.Lock()

def _run_sync_cycle():
    """
    Executes a single synchronization cycle in a separate worker thread.
    Database sessions are created, used, and closed safely within this worker thread.
    """
    with SessionLocal() as db:
        try:
            count = db.query(JobListingModel).filter(JobListingModel.is_active == True).count()
            logger.info(f"[JobsScheduler] Active job count in database: {count}")
            logger.info("[JobsScheduler] Running scheduled company synchronization...")
            job_discovery_service.sync_all_registered_companies(db)

            # Ingest open feeds with error isolation
            try:
                logger.info("[JobsScheduler] Ingesting Remotive open tech feed...")
                job_discovery_service.sync_remotive_feed(db, limit=100)
            except Exception as e:
                logger.warning(f"[JobsScheduler] Remotive sync failed: {e}")

            try:
                logger.info("[JobsScheduler] Ingesting Arbeitnow open job feed...")
                job_discovery_service.sync_arbeitnow_feed(db, pages=1)
            except Exception as e:
                logger.warning(f"[JobsScheduler] Arbeitnow sync failed: {e}")

            try:
                logger.info("[JobsScheduler] Ingesting Jobicy open job feed...")
                job_discovery_service.sync_jobicy_feed(db, count=50)
            except Exception as e:
                logger.warning(f"[JobsScheduler] Jobicy sync failed: {e}")

            if settings.ADZUNA_APP_ID and settings.ADZUNA_APP_KEY:
                try:
                    logger.info("[JobsScheduler] Ingesting Adzuna India tech feed...")
                    job_discovery_service.sync_adzuna_feed(db, country="in", query="software engineer")
                except Exception as e:
                    logger.warning(f"[JobsScheduler] Adzuna sync failed: {e}")
        except Exception as e:
            logger.error(f"[JobsScheduler] Error in background job synchronization: {e}", exc_info=True)


async def _sync_worker():
    """
    Periodic background worker for ATS and aggregator sync.
    Offloads synchronous HTTP and database synchronization to a background thread
    via asyncio.to_thread, keeping the main asyncio event loop completely responsive.
    """
    global _shutdown_event
    while _shutdown_event and not _shutdown_event.is_set():
        # Prevent overlapping synchronization cycles
        if _sync_lock.acquire(blocking=False):
            try:
                # Offload blocking HTTP I/O and DB sync to a worker thread
                await asyncio.to_thread(_run_sync_cycle)
            except Exception as e:
                logger.error(f"[JobsScheduler] Error during background sync execution: {e}")
            finally:
                _sync_lock.release()
        else:
            logger.info("[JobsScheduler] Sync cycle already in progress; skipping duplicate trigger.")

        interval_secs = max(60, settings.JOB_SYNC_INTERVAL_HOURS * 3600)
        try:
            # Wait for next interval or graceful shutdown notification
            if _shutdown_event:
                await asyncio.wait_for(_shutdown_event.wait(), timeout=interval_secs)
                break
            else:
                await asyncio.sleep(interval_secs)
        except asyncio.TimeoutError:
            continue
        except asyncio.CancelledError:
            break


def start_scheduler_task():
    """Initializes and schedules the asynchronous background worker on FastAPI startup."""
    import os
    import sys
    if "pytest" in sys.modules or os.getenv("PYTEST_CURRENT_TEST") or settings.ENVIRONMENT == "test":
        logger.info("[JobsScheduler] Skipping background sync during test execution.")
        return

    global _scheduler_task, _shutdown_event
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            if _shutdown_event is None:
                _shutdown_event = asyncio.Event()
            else:
                _shutdown_event.clear()

            if _scheduler_task is None or _scheduler_task.done():
                _scheduler_task = loop.create_task(_sync_worker())
                logger.info("[JobsScheduler] Background sync worker successfully scheduled.")
    except Exception as e:
        logger.warning(f"[JobsScheduler] Could not attach to asyncio event loop: {e}")


async def stop_scheduler_task():
    """Cancels and gracefully shuts down the background sync worker."""
    global _scheduler_task, _shutdown_event
    if _shutdown_event:
        _shutdown_event.set()
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
    logger.info("[JobsScheduler] Background sync worker stopped cleanly.")
