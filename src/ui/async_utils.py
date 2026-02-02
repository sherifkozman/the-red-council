import asyncio
import logging

logger = logging.getLogger(__name__)

def safe_run_async(coro):
    """
    Safely run an async coroutine in a synchronous context.
    Handles existing event loops (e.g. inside Streamlit or Jupyter).
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # We are in an active loop
        # For Streamlit, we can't easily await here if the caller is sync.
        # But Streamlit generally allows creating tasks if we don't need the result immediately
        # OR we might crash if we try asyncio.run().
        
        # Best effort: try to create a task
        logger.warning("Event loop is already running. Scheduling task.")
        return loop.create_task(coro)
    else:
        # No loop, safe to run
        return asyncio.run(coro)
