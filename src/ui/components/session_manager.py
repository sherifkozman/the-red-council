import json
import logging
import os
import shutil
import stat
import tempfile
from datetime import datetime
from glob import glob
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import streamlit as st
from pydantic import BaseModel, Field

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

class SessionMetadata(BaseModel):
    """Metadata for a saved session."""

    id: str
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    event_count: int = 0
    has_score: bool = False
    has_report: bool = False
    tags: List[str] = Field(default_factory=list)


class SessionManager:
    """Manages saving, loading, and listing agent testing sessions."""

    def __init__(self, session_dir: Optional[str] = None):
        self.session_dir = session_dir or SESSION_DIR
        os.makedirs(self.session_dir, exist_ok=True)

    def _get_path(self, session_id: str) -> str:
        """Get safe path for session ID."""
        # Validate UUID format
        try:
            uuid_obj = UUID(session_id)
            clean_id = str(uuid_obj)
        except ValueError:
            raise ValueError(f"Invalid session ID format: {session_id}")
            
        path = os.path.join(self.session_dir, f"{clean_id}.json")
        
        # Verify path is within session_dir (canonical path check)
        try:
            real_path = os.path.realpath(path)
            real_session_dir = os.path.realpath(self.session_dir)
            if not real_path.startswith(real_session_dir):
                raise ValueError("Path traversal detected")
        except OSError:
            # If file doesn't exist yet, we can't fully validate realpath existence,
            # but we checked prefix which is good. For new files, parent check is enough.
            pass
            
        return path

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

        return sorted(sessions, key=lambda s: s.updated_at, reverse=True)

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

        metadata = SessionMetadata(
            id=session_id,
            name=name,
            description=description,
            updated_at=datetime.now(),
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
        path = self._get_path(session_id)
        
        try:
            # Create temp file in same directory
            tmp_fd, tmp_path = tempfile.mkstemp(dir=self.session_dir, suffix='.tmp')
            try:
                # Set restrictive permissions immediately (User R/W only)
                os.chmod(tmp_path, stat.S_IRUSR | stat.S_IWUSR)
                
                with os.fdopen(tmp_fd, 'w') as f:
                    json.dump(data, f, indent=2)
                    f.flush()
                    os.fsync(f.fileno()) # Ensure written to disk
                
                os.replace(tmp_path, path)
            except Exception:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
                raise
        except Exception as e:
            logger.error(f"Failed to save session {session_id}: {e}", exc_info=True)
            raise IOError("Failed to save session data") from e

        return session_id

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
            # Check file size
            if os.path.getsize(path) > MAX_FILE_SIZE:
                logger.error(f"Session file {session_id} too large: {os.path.getsize(path)} bytes")
                st.error("Session file too large to load.")
                return False

            with open(path, "r") as f:
                data = json.load(f)

            # Reset current state first
            reset_agent_state(full_reset=False)

            # Deserialize events
            loaded_events = []
            for event_data in data.get("events", []):
                try:
                    event = self._parse_event(event_data)
                    if event:
                        loaded_events.append(event)
                except Exception as e:
                    logger.warning(f"Failed to parse event: {e}")

            st.session_state[AGENT_EVENTS_KEY] = loaded_events

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

            return True

        except Exception as e:
            logger.error(f"Failed to load session {session_id}: {e}", exc_info=True)
            st.error("Failed to load session. The file may be corrupted or incompatible.")
            return False

    def delete_session(self, session_id: str) -> bool:
        """Delete a session file."""
        try:
            path = self._get_path(session_id)
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

        st.divider()

        # 2. Save Current Session
        st.markdown("**Save Session**")
        save_name = st.text_input("Name", value=active_name, key="session_name_input", max_chars=MAX_NAME_LEN)
        save_desc = st.text_area("Description", height=60, key="session_desc_input", max_chars=MAX_DESC_LEN)
        
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
                            session_id=active_id # Update existing if active, else create new
                        )
                        st.session_state["active_session_id"] = new_id
                        st.session_state["active_session_name"] = save_name
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
                            session_id=None # Force new ID
                        )
                        st.session_state["active_session_id"] = new_id
                        st.session_state["active_session_name"] = save_name
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
            session_options = {s.id: f"{s.name} ({s.updated_at.strftime('%Y-%m-%d %H:%M')})" for s in sessions}
            selected_id = st.selectbox(
                "Select Session", 
                options=list(session_options.keys()), 
                format_func=lambda x: session_options[x],
                key="session_selector"
            )

            col_load, col_del = st.columns([2, 1])
            with col_load:
                if st.button("Load", use_container_width=True, key="load_session_btn"):
                    if manager.load_session(selected_id):
                        st.success("Loaded!")
                        st.rerun()
            
            with col_del:
                if st.button("Delete", use_container_width=True, type="primary", key="del_session_btn"):
                    # Confirm delete logic could be added here
                    if manager.delete_session(selected_id):
                        if active_id == selected_id:
                            if "active_session_id" in st.session_state:
                                del st.session_state["active_session_id"]
                            if "active_session_name" in st.session_state:
                                del st.session_state["active_session_name"]
                        st.success("Deleted!")
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
                            
                            # Update metadata
                            if not isinstance(data["metadata"], dict):
                                data["metadata"] = {}
                                
                            data["metadata"]["id"] = new_id
                            data["metadata"]["name"] = f"Imported: {data['metadata'].get('name', 'Unknown')}"[:MAX_NAME_LEN]
                            data["metadata"]["updated_at"] = datetime.now().isoformat()
                            
                            # Validate events list
                            if not isinstance(data["events"], list):
                                st.error("Invalid session format: events must be a list")
                            else:
                                # Save to disk using atomic write pattern
                                path = manager._get_path(new_id)
                                tmp_fd, tmp_path = tempfile.mkstemp(dir=manager.session_dir, suffix='.tmp')
                                try:
                                    os.chmod(tmp_path, stat.S_IRUSR | stat.S_IWUSR)
                                    with os.fdopen(tmp_fd, 'w') as f:
                                        json.dump(data, f, indent=2)
                                        f.flush()
                                        os.fsync(f.fileno())
                                    os.replace(tmp_path, path)
                                    st.success(f"Imported session successfully!")
                                    st.rerun()
                                except Exception:
                                    if os.path.exists(tmp_path):
                                        os.remove(tmp_path)
                                    raise
                except Exception as e:
                    logger.error(f"Import failed: {e}", exc_info=True)
                    st.error("Import failed. Check logs for details.")

        st.divider()
        
        # 5. New Session (Reset)
        if st.button("New Session (Clear)", use_container_width=True, type="secondary"):
            reset_agent_state(full_reset=False)
            if "active_session_id" in st.session_state:
                del st.session_state["active_session_id"]
            if "active_session_name" in st.session_state:
                del st.session_state["active_session_name"]
            st.rerun()
