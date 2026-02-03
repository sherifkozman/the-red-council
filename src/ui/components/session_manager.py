import json
import logging
import os
import stat
import tempfile
from datetime import datetime, timedelta, timezone
from glob import glob
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import streamlit as st
from pydantic import BaseModel, Field, model_validator

from src.core.agent_report import AgentSecurityReport
from src.core.agent_schemas import (
    ActionRecord,
    AgentEvent,
    AgentJudgeScore,
    DivergenceEvent,
    MemoryAccessEvent,
    SpeechRecord,
    ToolCallEvent,
)
from src.ui.components.mode_selector import AGENT_EVENTS_KEY, AGENT_SCORE_KEY
from src.ui.state_utils import (
    AGENT_REPORT_KEY,
    REPORT_JSON_KEY,
    REPORT_MARKDOWN_KEY,
    reset_agent_state,
)

logger = logging.getLogger(__name__)

SESSION_DIR = "data/sessions"

# Validation constants
MAX_NAME_LEN = 100
MAX_DESC_LEN = 1000
MAX_TAGS = 20
MAX_TAG_LEN = 30
MAX_EVENTS_LIMIT = 10000  # Hard limit on events
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB file size limit
DEFAULT_RETENTION_DAYS = 0  # 0 = disabled
DEFAULT_MAX_SESSIONS = 0  # 0 = disabled

class SessionMetadata(BaseModel):
    """Metadata for a saved session."""

    id: str
    name: str = Field(..., max_length=MAX_NAME_LEN)
    description: Optional[str] = Field(default=None, max_length=MAX_DESC_LEN)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    event_count: int = Field(0, ge=0)
    has_score: bool = False
    has_report: bool = False
    tags: List[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def sanitize(cls, data: Any) -> Any:
        """Sanitize untrusted metadata before instantiation."""
        if not isinstance(data, dict):
            raise TypeError("SessionMetadata input must be a dict")
        clean = data.copy()
        name = str(clean.get("name", "")).strip()[:MAX_NAME_LEN]
        clean["name"] = name or "Untitled Session"
        desc = clean.get("description")
        if desc is not None:
            clean["description"] = str(desc).strip()[:MAX_DESC_LEN]
        tags = clean.get("tags") or []
        if not isinstance(tags, list):
            tags = []
        cleaned_tags = []
        for tag in tags[:MAX_TAGS]:
            tag = str(tag).strip()
            if not tag:
                continue
            if len(tag) > MAX_TAG_LEN:
                continue
            if not tag.replace("-", "").replace("_", "").isalnum():
                continue
            cleaned_tags.append(tag)
        clean["tags"] = list(dict.fromkeys(cleaned_tags))
        
        # Sanitize datetimes to prevent overflow DoS
        for dt_field in ["created_at", "updated_at"]:
            if dt_field in clean:
                try:
                    val = clean[dt_field]
                    if isinstance(val, str):
                        dt = datetime.fromisoformat(val)
                    elif isinstance(val, datetime):
                        dt = val
                    else:
                        dt = datetime.now(timezone.utc)
                    
                    # Clamp year to reasonable range
                    if dt.year < 2000 or dt.year > 2100:
                         dt = datetime.now(timezone.utc)
                         
                    # Ensure timezone aware (UTC)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                        
                    clean[dt_field] = dt
                except Exception:
                    clean[dt_field] = datetime.now(timezone.utc)

        return clean


class SessionManager:
    """Manages saving, loading, and listing agent testing sessions."""

    def __init__(self, session_dir: Optional[str] = None):
        self.session_dir = session_dir or SESSION_DIR
        os.makedirs(self.session_dir, exist_ok=True)

    def _retention_days(self) -> int:
        val = os.getenv("RC_SESSION_RETENTION_DAYS")
        if not val:
            return DEFAULT_RETENTION_DAYS
        try:
            return max(0, int(val))
        except ValueError:
            return DEFAULT_RETENTION_DAYS

    def _max_sessions(self) -> int:
        val = os.getenv("RC_MAX_SESSIONS")
        if not val:
            return DEFAULT_MAX_SESSIONS
        try:
            return max(0, int(val))
        except ValueError:
            return DEFAULT_MAX_SESSIONS

    def _get_path(self, session_id: str) -> str:
        """Get safe path for session ID."""
        # Validate UUID format
        try:
            uuid_obj = UUID(session_id)
            clean_id = str(uuid_obj)
        except ValueError:
            raise ValueError(f"Invalid session ID format: {session_id}")
            
        path = os.path.join(self.session_dir, f"{clean_id}.json")
        real_session_dir = os.path.realpath(self.session_dir)
        
        # Verify path is within session_dir (canonical path check)
        try:
            # 1. Check strict prefix using commonpath to avoid partial matches
            # We use abspath to check target even if it doesn't exist
            abs_path = os.path.abspath(path)
            if os.path.commonpath([real_session_dir, abs_path]) != real_session_dir:
                raise ValueError("Path traversal detected")
            
            # 2. Check for symlinks if file exists (Anti-TOCTOU)
            if os.path.lexists(path):
                st = os.lstat(path)
                if stat.S_ISLNK(st.st_mode):
                     raise ValueError("Symlink detected - potential attack")
                
                # Double check realpath matches expected parent
                real_path = os.path.realpath(path)
                if os.path.commonpath([real_session_dir, real_path]) != real_session_dir:
                    raise ValueError("Path traversal detected (symlink)")
                    
        except OSError as e:
            # Fail closed on filesystem errors
            raise ValueError(f"Path validation failed: {e}")
            
        return path

    def _atomic_write(self, path: str, data: Dict[str, Any]) -> None:
        """Write data to path atomically with secure permissions and TOCTOU protection."""
        # Set umask to ensure secure creation (0o077 = only owner can RWX)
        old_umask = os.umask(0o077)
        try:
            # Create temp file in same directory
            tmp_fd, tmp_path = tempfile.mkstemp(dir=self.session_dir, suffix='.tmp')
        finally:
            os.umask(old_umask)

        try:
            with os.fdopen(tmp_fd, 'w') as f:
                json.dump(data, f, indent=2)
                f.flush()
                os.fsync(f.fileno()) # Ensure written to disk
            
            # SAFE: Verify target is not a symlink before replace if it exists
            # We check for existence first to avoid OSError on open if file doesn't exist
            if os.path.lexists(path):
                # Try to open with O_NOFOLLOW to verify it's a regular file we can write to/replace
                # This doesn't strictly prevent someone swapping it RIGHT AFTER, but os.replace is atomic directory op.
                # The main risk is if we were writing TO the file. os.replace replaces the inode.
                pass

            os.replace(tmp_path, path)
        except Exception:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            raise

    def list_sessions(self) -> List[SessionMetadata]:
        """List all available sessions, sorted by updated_at desc."""
        sessions = []
        for path in glob(os.path.join(self.session_dir, "*.json")):
            try:
                # Check size before reading
                if os.path.getsize(path) > MAX_FILE_SIZE:
                    logger.warning(f"Session file too large, skipping: {path}")
                    continue
                    
                with open(path, "r") as f:
                    data = json.load(f)
                    # Handle legacy or partial data
                    meta = data.get("metadata", {})
                    if not meta:
                        continue
                    sessions.append(SessionMetadata(**meta))
            except Exception as e:
                logger.warning(f"Failed to load session metadata from {path}: {e}")
                continue
        sessions = sorted(sessions, key=lambda s: s.updated_at, reverse=True)
        self._cleanup_sessions(sessions)
        return sessions

    def _cleanup_sessions(self, sessions: List[SessionMetadata]) -> None:
        """Clean up old sessions based on retention config."""
        retention_days = self._retention_days()
        max_sessions = self._max_sessions()
        
        ids_to_remove = set()

        if retention_days > 0:
            cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
            for meta in sessions:
                try:
                    if meta.updated_at < cutoff:
                        path = self._get_path(meta.id)
                        if os.path.exists(path):
                            os.remove(path)
                            ids_to_remove.add(meta.id)
                except Exception as e:
                    logger.warning(f"Failed retention cleanup for {meta.id}: {e}")

        if max_sessions > 0:
            remaining = [s for s in sessions if s.id not in ids_to_remove]
            if len(remaining) > max_sessions:
                for meta in remaining[max_sessions:]:
                    try:
                        path = self._get_path(meta.id)
                        if os.path.exists(path):
                            os.remove(path)
                            ids_to_remove.add(meta.id)
                    except Exception as e:
                        logger.warning(f"Failed count cleanup for {meta.id}: {e}")
        
        # Modify list in-place to reflect removals
        if ids_to_remove:
            sessions[:] = [s for s in sessions if s.id not in ids_to_remove]

    def save_session(
        self,
        name: str,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
        session_id: Optional[str] = None,
    ) -> str:
        """
        Save current session state to disk.
        If session_id provided, updates existing; otherwise creates new.
        Returns session_id.
        """
        if not session_id:
            session_id = str(uuid4())
            
        # Initialize default tags if None
        if tags is None:
            tags = []

        # Sanitize and validate tags
        clean_tags = []
        for tag in tags:
            tag = str(tag).strip()
            if not tag:
                continue
            if len(tag) > MAX_TAG_LEN:
                raise ValueError(f"Tag too long (max {MAX_TAG_LEN} chars)")
            # Basic alphanumeric check (allow - and _)
            if not tag.replace('-', '').replace('_', '').isalnum():
                raise ValueError(f"Tag contains invalid characters: '{tag}'")
            clean_tags.append(tag)
        
        tags = list(set(clean_tags)) # Deduplicate
        if len(tags) > MAX_TAGS:
            raise ValueError(f"Too many tags (max {MAX_TAGS})")

        # Input Validation
        if len(name) > MAX_NAME_LEN:
            raise ValueError(f"Name too long (max {MAX_NAME_LEN} chars)")
        if description and len(description) > MAX_DESC_LEN:
            raise ValueError(f"Description too long (max {MAX_DESC_LEN} chars)")

        events = st.session_state.get(AGENT_EVENTS_KEY, [])
        score = st.session_state.get(AGENT_SCORE_KEY)
        report = st.session_state.get(AGENT_REPORT_KEY)
        
        # Hard limit check
        if len(events) > MAX_EVENTS_LIMIT:
            raise ValueError(f"Session too large: {len(events)} events (max {MAX_EVENTS_LIMIT})")

        # Serialize events
        serialized_events = [
            e.model_dump(mode="json") if hasattr(e, "model_dump") else e for e in events
        ]

        # Serialize score
        serialized_score = None
        if score and hasattr(score, "model_dump"):
            serialized_score = score.model_dump(mode="json")

        # Serialize report
        serialized_report = None
        if report and hasattr(report, "model_dump"):
            serialized_report = report.model_dump(mode="json")
            
        # Preserve created_at if updating existing session
        created_at = datetime.now(timezone.utc)
        path = self._get_path(session_id)
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    existing = json.load(f)
                    existing_meta = existing.get("metadata", {})
                    if "created_at" in existing_meta:
                        created_at = datetime.fromisoformat(existing_meta["created_at"])
            except Exception:
                pass # Use default if load fails

        metadata = SessionMetadata(
            id=session_id,
            name=name,
            description=description,
            created_at=created_at,
            updated_at=datetime.now(timezone.utc),
            event_count=len(events),
            has_score=score is not None,
            has_report=report is not None,
            tags=tags,
        )

        data = {
            "metadata": metadata.model_dump(mode="json"),
            "events": serialized_events,
            "score": serialized_score,
            "report": serialized_report,
            "report_markdown": st.session_state.get(REPORT_MARKDOWN_KEY),
            "report_json": st.session_state.get(REPORT_JSON_KEY),
        }

        # Atomic write with secure permissions
        try:
            self._atomic_write(path, data)
        except Exception as e:
            logger.error(f"Failed to save session {session_id}: {e}", exc_info=True)
            raise IOError("Failed to save session data") from e

        return session_id

    def export_current_session(self) -> str:
        """Export current session state as JSON string without saving to disk."""
        events = st.session_state.get(AGENT_EVENTS_KEY, [])
        score = st.session_state.get(AGENT_SCORE_KEY)
        report = st.session_state.get(AGENT_REPORT_KEY)

        if len(events) > MAX_EVENTS_LIMIT:
            raise ValueError(
                f"Session too large: {len(events)} events (max {MAX_EVENTS_LIMIT})"
            )

        serialized_events = [
            e.model_dump(mode="json") if hasattr(e, "model_dump") else e for e in events
        ]

        serialized_score = (
            score.model_dump(mode="json") if score and hasattr(score, "model_dump") else None
        )
        serialized_report = (
            report.model_dump(mode="json") if report and hasattr(report, "model_dump") else None
        )

        metadata = SessionMetadata(
            id=st.session_state.get("active_session_id", str(uuid4())),
            name=st.session_state.get("active_session_name", "Unsaved Session"),
            updated_at=datetime.now(timezone.utc),
            event_count=len(events),
            has_score=score is not None,
            has_report=report is not None,
            tags=st.session_state.get("active_session_tags", []),
        )

        data = {
            "metadata": metadata.model_dump(mode="json"),
            "events": serialized_events,
            "score": serialized_score,
            "report": serialized_report,
            "report_markdown": st.session_state.get(REPORT_MARKDOWN_KEY),
            "report_json": st.session_state.get(REPORT_JSON_KEY),
        }
        return json.dumps(data, indent=2)

    def load_session(self, session_id: str) -> bool:
        """
        Load a session into st.session_state.
        Returns True if successful.
        """
        try:
            path = self._get_path(session_id)
        except ValueError as e:
            st.error(str(e))
            return False
            
        if not os.path.exists(path):
            st.error("Session not found.")
            return False

        try:
            # Safe open with O_NOFOLLOW to prevent symlink following
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                # Check size using fstat on the open fd
                stat_info = os.fstat(fd)
                if stat_info.st_size > MAX_FILE_SIZE:
                    logger.error(f"Session file {session_id} too large: {stat_info.st_size} bytes")
                    st.error("Session file too large to load.")
                    return False

                with os.fdopen(fd, "r") as f:
                    data = json.load(f)
            except OSError:
                os.close(fd)
                raise

            # Reset current state first
            reset_agent_state(full_reset=False)

            # Deserialize events
            loaded_events = []
            failed_count = 0
            raw_events = data.get("events", [])
            if not isinstance(raw_events, list):
                st.error("Invalid session format: events must be a list")
                return False
            for event_data in raw_events:
                if len(loaded_events) >= MAX_EVENTS_LIMIT:
                    st.error("Session too large to load (event limit exceeded).")
                    return False
                try:
                    event = self._parse_event(event_data)
                    if event:
                        loaded_events.append(event)
                    else:
                        failed_count += 1
                except Exception as e:
                    logger.warning(f"Failed to parse event: {e}")
                    failed_count += 1

            st.session_state[AGENT_EVENTS_KEY] = loaded_events
            if failed_count > 0:
                st.warning(f"Loaded {len(loaded_events)} events ({failed_count} failed to parse).")

            # Deserialize score
            score_data = data.get("score")
            if score_data:
                try:
                    st.session_state[AGENT_SCORE_KEY] = AgentJudgeScore(**score_data)
                except Exception as e:
                    logger.error(f"Failed to load score: {e}")

            # Deserialize report
            report_data = data.get("report")
            if report_data:
                try:
                    st.session_state[AGENT_REPORT_KEY] = AgentSecurityReport(
                        **report_data
                    )
                except Exception as e:
                    logger.error(f"Failed to load report: {e}")

            st.session_state[REPORT_MARKDOWN_KEY] = data.get("report_markdown")
            st.session_state[REPORT_JSON_KEY] = data.get("report_json")
            
            # Update active session ID
            st.session_state["active_session_id"] = session_id
            st.session_state["active_session_name"] = data.get("metadata", {}).get("name")
            st.session_state["active_session_tags"] = data.get("metadata", {}).get("tags", [])

            return True

        except Exception as e:
            logger.error(f"Failed to load session {session_id}: {e}", exc_info=True)
            st.error("Failed to load session. The file may be corrupted or incompatible.")
            return False

    def delete_session(self, session_id: str) -> bool:
        """Delete a session file."""
        try:
            path = self._get_path(session_id)
            # os.remove removes the directory entry (link) so it's safe on symlinks
            # as it doesn't follow them to delete the target.
            if os.path.exists(path):
                os.remove(path)
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete session {session_id}: {e}")
            return False

    def _parse_event(self, event_data: Dict[str, Any]) -> Optional[AgentEvent]:
        """Helper to parse event dictionary into typed AgentEvent."""
        event_type = "unknown"
        try:
            event_type = event_data.get("event_type")

            if event_type == "tool_call":
                return ToolCallEvent(**event_data)
            elif event_type == "memory_access":
                return MemoryAccessEvent(**event_data)
            elif event_type == "action":
                return ActionRecord(**event_data)
            elif event_type == "speech":
                return SpeechRecord(**event_data)
            elif event_type == "divergence":
                return DivergenceEvent(**event_data)
            else:
                logger.warning(f"Unknown event type: {event_type}")
                return None
        except Exception as e:
            logger.warning(f"Error parsing event {event_type}: {e}")
            return None


def render_session_manager():
    """Render the session management UI in sidebar."""
    manager = SessionManager()

    with st.expander("Session Management", expanded=False):
        # 1. Active Session Info
        active_id = st.session_state.get("active_session_id")
        active_name = st.session_state.get("active_session_name", "Unsaved Session")
        
        st.markdown(f"**Current:** {active_name}")
        if active_id:
            st.caption(f"ID: {active_id[:8]}...")
        active_tags = st.session_state.get("active_session_tags", [])
        if active_tags:
            st.caption(f"Tags: {', '.join(active_tags)}")

        st.divider()

        # 2. Save Current Session
        st.markdown("**Save Session**")
        save_name = st.text_input("Name", value=active_name, key="session_name_input", max_chars=MAX_NAME_LEN)
        save_desc = st.text_area("Description", height=60, key="session_desc_input", max_chars=MAX_DESC_LEN)
        tags_input = st.text_input(
            "Tags (comma-separated)",
            value=", ".join(st.session_state.get("active_session_tags", [])),
            key="session_tags_input",
            max_chars=MAX_TAG_LEN * MAX_TAGS,
        )
        tags = [t.strip() for t in tags_input.split(",") if t.strip()]
        
        col1, col2 = st.columns(2)
        with col1:
            if st.button("Save", use_container_width=True):
                if not save_name:
                    st.error("Name required")
                else:
                    try:
                        new_id = manager.save_session(
                            name=save_name,
                            description=save_desc,
                            tags=tags,
                            session_id=active_id,  # Update existing if active, else create new
                        )
                        st.session_state["active_session_id"] = new_id
                        st.session_state["active_session_name"] = save_name
                        st.session_state["active_session_tags"] = tags
                        st.success("Saved!")
                        st.rerun()
                    except ValueError as e:
                        st.error(str(e))
                    except IOError:
                        st.error("Failed to save session to disk.")
        
        with col2:
            if st.button("Save As New", use_container_width=True):
                if not save_name:
                    st.error("Name required")
                else:
                    try:
                        new_id = manager.save_session(
                            name=save_name,
                            description=save_desc,
                            tags=tags,
                            session_id=None,  # Force new ID
                        )
                        st.session_state["active_session_id"] = new_id
                        st.session_state["active_session_name"] = save_name
                        st.session_state["active_session_tags"] = tags
                        st.success("Saved as new!")
                        st.rerun()
                    except ValueError as e:
                        st.error(str(e))
                    except IOError:
                        st.error("Failed to save session to disk.")

        st.divider()

        # 3. List / Load Sessions
        st.markdown("**Load Session**")
        sessions = manager.list_sessions()
        
        if not sessions:
            st.caption("No saved sessions.")
        else:
            session_options = {
                s.id: f"{s.name} ({s.updated_at.strftime('%Y-%m-%d %H:%M')})"
                for s in sessions
            }
            selected_id = st.selectbox(
                "Select Session", 
                options=list(session_options.keys()), 
                format_func=lambda x: session_options[x],
                key="session_selector"
            )
            selected_meta = next((s for s in sessions if s.id == selected_id), None)
            if selected_meta:
                st.caption(
                    f"Created: {selected_meta.created_at.strftime('%Y-%m-%d %H:%M')} | "
                    f"Events: {selected_meta.event_count} | "
                    f"Score: {'Yes' if selected_meta.has_score else 'No'} | "
                    f"Report: {'Yes' if selected_meta.has_report else 'No'}"
                )
                if selected_meta.tags:
                    st.caption(f"Tags: {', '.join(selected_meta.tags)}")

            col_load, col_del = st.columns([2, 1])
            with col_load:
                if st.button("Load", use_container_width=True, key="load_session_btn"):
                    if manager.load_session(selected_id):
                        st.success("Loaded!")
                        st.rerun()
            
            with col_del:
                if st.button("Delete", use_container_width=True, type="primary", key="del_session_btn"):
                    st.session_state["confirm_delete_session"] = selected_id
            if st.session_state.get("confirm_delete_session") == selected_id:
                st.warning("Confirm delete? This cannot be undone.")
                c1, c2 = st.columns(2)
                with c1:
                    if st.button("Confirm Delete", key="confirm_delete_btn", use_container_width=True):
                        if manager.delete_session(selected_id):
                            if active_id == selected_id:
                                if "active_session_id" in st.session_state:
                                    del st.session_state["active_session_id"]
                                if "active_session_name" in st.session_state:
                                    del st.session_state["active_session_name"]
                            st.session_state.pop("confirm_delete_session", None)
                            st.success("Deleted!")
                            st.rerun()
                with c2:
                    if st.button("Cancel", key="cancel_delete_btn", use_container_width=True):
                        st.session_state.pop("confirm_delete_session", None)
                        st.rerun()
        
        # 4. Import Session
        with st.expander("Import Session"):
            uploaded_file = st.file_uploader("Upload Session JSON", type="json", key="session_uploader")
            if uploaded_file and st.button("Import", key="import_session_btn"):
                try:
                    # Check size
                    if uploaded_file.size > MAX_FILE_SIZE:
                        st.error(f"File too large (max {MAX_FILE_SIZE // (1024*1024)}MB)")
                    else:
                        # Handle bytes from Streamlit uploader
                        content = uploaded_file.getvalue()
                        if isinstance(content, bytes):
                            content = content.decode("utf-8")
                        data = json.loads(content)
                        
                        # Validate structure
                        if "metadata" not in data or "events" not in data:
                            st.error("Invalid session format: missing metadata or events")
                        else:
                            # Create new ID for imported session
                            new_id = str(uuid4())
                            
                            # Validate and sanitize metadata
                            raw_meta = data.get("metadata", {})
                            if not isinstance(raw_meta, dict):
                                raw_meta = {}
                            
                            # Use SessionMetadata to sanitize fields
                            try:
                                # Update fields for import context
                                raw_meta["id"] = new_id
                                raw_meta["name"] = f"Imported: {raw_meta.get('name', 'Unknown')}"
                                raw_meta["updated_at"] = datetime.now(timezone.utc).isoformat()
                                # Allow creation of object to validate/sanitize
                                meta_obj = SessionMetadata(**raw_meta)
                                data["metadata"] = meta_obj.model_dump(mode="json")
                            except Exception as e:
                                st.error(f"Invalid metadata in import: {e}")
                                return

                            # Validate events list
                            if not isinstance(data["events"], list):
                                st.error("Invalid session format: events must be a list")
                            else:
                                if len(data["events"]) > MAX_EVENTS_LIMIT:
                                    st.error("Session too large to import (event limit exceeded).")
                                    return
                                
                                # Use atomic write
                                path = manager._get_path(new_id)
                                try:
                                    manager._atomic_write(path, data)
                                    st.success(f"Imported session successfully!")
                                    st.rerun()
                                except Exception as e:
                                    st.error(f"Failed to save imported session: {e}")

                except Exception as e:
                    logger.error(f"Import failed: {e}", exc_info=True)
                    st.error("Import failed. Check logs for details.")

        st.divider()
        
        # 5. Export Session
        st.markdown("**Export Session**")
        if st.button("Export Current Session", use_container_width=True, key="export_session_btn"):
            try:
                export_data = manager.export_current_session()
                st.download_button(
                    label="Download Session JSON",
                    data=export_data,
                    file_name=f"session_{active_id or 'unsaved'}.json",
                    mime="application/json",
                    key="download_session_json",
                )
            except Exception as e:
                st.error(f"Export failed: {e}")

        st.divider()
        
        # 6. New Session (Reset)
        if st.button("New Session (Clear)", use_container_width=True, type="secondary", key="new_session_btn"):
            reset_agent_state(full_reset=False)
            if "active_session_id" in st.session_state:
                del st.session_state["active_session_id"]
            if "active_session_name" in st.session_state:
                del st.session_state["active_session_name"]
            if "active_session_tags" in st.session_state:
                del st.session_state["active_session_tags"]
            st.rerun()