import json
import os
import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

# NOTE: Do not import src.ui.components.session_manager at top level to ensure coverage with mocks

@pytest.fixture(autouse=True)
def clean_imports():
    """Ensure we import fresh modules for coverage."""
    modules_to_remove = [
        "src.ui.components.session_manager",
        "streamlit"
    ]
    for m in modules_to_remove:
        if m in sys.modules:
            del sys.modules[m]
    yield

@pytest.fixture
def mock_streamlit():
    """Mock streamlit module."""
    mock_st = MagicMock()
    mock_st.session_state = {}
    
    # We need to mock streamlit in sys.modules so imports work
    with patch.dict(sys.modules, {"streamlit": mock_st}):
        yield mock_st

@pytest.fixture
def session_manager_module(mock_streamlit):
    """Import the module after mocking streamlit."""
    import src.ui.components.session_manager as sm
    return sm

@pytest.fixture
def mock_session_dir(tmp_path):
    """Create a temporary session directory."""
    d = tmp_path / "sessions"
    d.mkdir()
    # Resolve symlinks to avoid path traversal false positives in tests
    return str(d.resolve())

class TestSessionManager:
    def test_init_creates_dir(self, tmp_path, session_manager_module):
        """Test that init creates the session directory."""
        path = str(tmp_path / "new_sessions")
        session_manager_module.SessionManager(path)
        assert os.path.exists(path)

    def test_path_traversal_prevention(self, mock_session_dir, session_manager_module):
        """Test that path traversal is prevented."""
        manager = session_manager_module.SessionManager(mock_session_dir)
        
        # 1. Invalid UUID
        with pytest.raises(ValueError, match="Invalid session ID"):
            manager._get_path("../../../etc/passwd")
            
        # 2. Canonical path check (simulating race/bypass of UUID check)
        # We need to patch the UUID class imported in the module
        with patch.object(session_manager_module, "UUID") as mock_uuid_cls:
            # Mock UUID instance to return a traversal string when converted to str
            mock_uuid_instance = MagicMock()
            mock_uuid_instance.__str__.return_value = "../../../etc/passwd"
            mock_uuid_cls.return_value = mock_uuid_instance
            
            with pytest.raises(ValueError, match="Path traversal detected"):
                manager._get_path("any-string-since-uuid-mocked")

    def test_load_session_too_large(self, mock_session_dir, mock_streamlit, session_manager_module):
        """Test that loading a too large session fails."""
        manager = session_manager_module.SessionManager(mock_session_dir)
        
        sid = str(uuid4())
        path = os.path.join(mock_session_dir, f"{sid}.json")
        with open(path, "w") as f:
            f.write("a" * (session_manager_module.MAX_FILE_SIZE + 1))
            
        with patch("src.ui.components.session_manager.logger") as mock_logger:
            assert not manager.load_session(sid)
            # Verify error logged/shown
            mock_logger.error.assert_called()
            mock_streamlit.error.assert_called_with("Session file too large to load.")

    def test_list_sessions(self, mock_session_dir, session_manager_module):
        """Test listing sessions."""
        manager = session_manager_module.SessionManager(mock_session_dir)
        
        # Create dummy session file
        sid = str(uuid4())
        meta = {
            "id": sid,
            "name": "Test Session",
            "updated_at": datetime.now().isoformat()
        }
        data = {"metadata": meta}
        
        path = os.path.join(mock_session_dir, f"{sid}.json")
        with open(path, "w") as f:
            json.dump(data, f)
            
        sessions = manager.list_sessions()
        assert len(sessions) == 1
        assert sessions[0].id == sid
        assert sessions[0].name == "Test Session"

    def test_list_sessions_ignores_large_files(self, mock_session_dir, session_manager_module):
        """Test that large files are ignored."""
        manager = session_manager_module.SessionManager(mock_session_dir)
        
        sid = str(uuid4())
        path = os.path.join(mock_session_dir, f"{sid}.json")
        with open(path, "w") as f:
            f.write("a" * (session_manager_module.MAX_FILE_SIZE + 1))
            
        with patch("src.ui.components.session_manager.logger") as mock_logger:
            sessions = manager.list_sessions()
            assert len(sessions) == 0
            mock_logger.warning.assert_called()

    def test_save_session(self, mock_session_dir, mock_streamlit, session_manager_module):
        """Test saving a session."""
        manager = session_manager_module.SessionManager(mock_session_dir)
        
        # Setup session state
        mock_streamlit.session_state = {
            "agent_events": [],
            "agent_score": None,
            "agent_report": None
        }
        
        session_id = manager.save_session(name="New Session")
        
        assert session_id
        path = os.path.join(mock_session_dir, f"{session_id}.json")
        assert os.path.exists(path)
        
        with open(path, "r") as f:
            data = json.load(f)
            assert data["metadata"]["name"] == "New Session"
            assert data["events"] == []

    def test_export_current_session(self, mock_session_dir, mock_streamlit, session_manager_module):
        """Test exporting current session data."""
        manager = session_manager_module.SessionManager(mock_session_dir)
        mock_streamlit.session_state = {
            "agent_events": [],
            "agent_score": None,
            "agent_report": None,
            "active_session_id": "test-session",
            "active_session_name": "Export Session",
            "active_session_tags": ["tag1", "tag2"],
        }
        data = manager.export_current_session()
        parsed = json.loads(data)
        assert parsed["metadata"]["name"] == "Export Session"
        assert parsed["metadata"]["tags"] == ["tag1", "tag2"]

    def test_save_session_validations(self, mock_session_dir, mock_streamlit, session_manager_module):
        """Test save session input validations."""
        manager = session_manager_module.SessionManager(mock_session_dir)
        mock_streamlit.session_state = {"agent_events": []}
        
        # Name too long
        with pytest.raises(ValueError, match="Name too long"):
            manager.save_session(name="A" * 101)
            
        # Tag too long
        with pytest.raises(ValueError, match="Tag too long"):
            manager.save_session(name="OK", tags=["A" * 31])
            
        # Invalid tag chars
        with pytest.raises(ValueError, match="Tag contains invalid characters"):
            manager.save_session(name="OK", tags=["bad/tag"])

    def test_save_session_event_limit(self, mock_session_dir, mock_streamlit, session_manager_module):
        """Test hard limit on event count."""
        manager = session_manager_module.SessionManager(mock_session_dir)
        
        events = [{"event_type": "tool_call"} for _ in range(10001)]
        mock_streamlit.session_state = {
            "agent_events": events,
            "agent_score": None,
            "agent_report": None
        }
        
        with pytest.raises(ValueError, match="Session too large"):
            manager.save_session(name="Large Session")

    def test_load_session(self, mock_session_dir, mock_streamlit, session_manager_module):
        """Test loading a session."""
        manager = session_manager_module.SessionManager(mock_session_dir)
        
        # Create session file
        session_id = str(uuid4())
        meta = {
            "id": session_id,
            "name": "Loaded Session",
            "updated_at": datetime.now().isoformat()
        }
        
        timestamp = datetime.now(timezone.utc).isoformat()
        
        event_data = {
            "id": str(uuid4()),
            "session_id": session_id,
            "timestamp": timestamp,
            "event_type": "tool_call", 
            "tool_name": "test",
            "arguments": {},
            "duration_ms": 100,
            "success": True,
            "result": "ok"
        }
        data = {
            "metadata": meta,
            "events": [event_data],
            "score": None,
            "report": None
        }
        
        with open(os.path.join(mock_session_dir, f"{session_id}.json"), "w") as f:
            json.dump(data, f)
            
        success = manager.load_session(session_id)
        assert success
        assert mock_streamlit.session_state["active_session_id"] == session_id
        assert len(mock_streamlit.session_state["agent_events"]) == 1
        assert mock_streamlit.session_state["active_session_name"] == "Loaded Session"

    def test_delete_session(self, mock_session_dir, session_manager_module):
        """Test deleting a session."""
        manager = session_manager_module.SessionManager(mock_session_dir)
        sid = str(uuid4())
        path = os.path.join(mock_session_dir, f"{sid}.json")
        with open(path, "w") as f:
            f.write("{}")
            
        assert manager.delete_session(sid)
        assert not os.path.exists(path)

    def test_error_handling(self, mock_session_dir, mock_streamlit, session_manager_module):
        """Test error handling branches."""
        manager = session_manager_module.SessionManager(mock_session_dir)
        
        # 1. Invalid UUID
        with pytest.raises(ValueError, match="Invalid session ID"):
            manager._get_path("invalid-uuid")
            
        # 2. Parse event unknown type
        event = manager._parse_event({"event_type": "unknown"})
        assert event is None
        
        # 3. Parse event exception (e.g. invalid type for parsing)
        # Pass a non-dict to trigger AttributeError inside _parse_event
        # Wait, _parse_event expects Dict. If we pass None, it crashes on .get
        # But we added "event_type = 'unknown'" logic.
        # To trigger exception inside try block, we need event_type to be valid but data invalid
        invalid_event = {"event_type": "tool_call", "tool_name": 123} # Int name might cause issue or not
        # Or missing fields
        invalid_event = {"event_type": "tool_call"} # Missing fields -> ValidationError
        event = manager._parse_event(invalid_event)
        assert event is None
        
        # 4. Save session rollback
        mock_streamlit.session_state = {"agent_events": []}
        # Mock tempfile.mkstemp to succeed, but os.replace to fail
        with patch("os.replace", side_effect=OSError("Disk full")):
            with pytest.raises(IOError):
                manager.save_session("Fail Session")
            
        # 5. Load session not found
        assert not manager.load_session(str(uuid4()))

    def test_parse_all_event_types(self, mock_session_dir, mock_streamlit, session_manager_module):
        """Test parsing of all supported event types."""
        manager = session_manager_module.SessionManager(mock_session_dir)
        
        events = [
            {"event_type": "tool_call", "tool_name": "t", "arguments": {}, "duration_ms": 1, "success": True, "session_id": str(uuid4()), "timestamp": datetime.now(timezone.utc).isoformat()},
            {"event_type": "memory_access", "operation": "read", "key": "k", "timestamp": datetime.now(timezone.utc).isoformat(), "session_id": str(uuid4())},
            {"event_type": "action", "action_type": "test", "description": "d", "target": "t", "timestamp": datetime.now(timezone.utc).isoformat(), "session_id": str(uuid4())},
            {"event_type": "speech", "content": "hello", "intent": "chat", "timestamp": datetime.now(timezone.utc).isoformat(), "session_id": str(uuid4())},
            {"event_type": "divergence", "speech_intent": "a", "actual_action": "b", "severity": "HIGH", "explanation": "e", "confidence_score": 1.0, "session_id": str(uuid4())},
        ]
        
        for evt in events:
            parsed = manager._parse_event(evt)
            assert parsed is not None
            assert parsed.event_type == evt["event_type"]

    def test_import_session(self, mock_streamlit, session_manager_module, mock_session_dir):
        """Test importing a session."""
        # Mock uploaded file
        mock_file = MagicMock()
        mock_file.size = 100
        mock_file.getvalue.return_value = json.dumps({
            "metadata": {"name": "Original Name"},
            "events": []
        }).encode("utf-8")
        
        # Configure streamlit mocks
        mock_streamlit.file_uploader.return_value = mock_file
        # Mock import button click
        mock_streamlit.button.side_effect = lambda label, **kwargs: label == "Import"
        # Mock columns
        def mock_columns(spec):
            if isinstance(spec, int):
                count = spec
            else:
                count = len(spec)
            return [MagicMock() for _ in range(count)]
        mock_streamlit.columns.side_effect = mock_columns
        
        # Patch SESSION_DIR so render_session_manager uses our temp dir
        with patch.object(session_manager_module, "SESSION_DIR", mock_session_dir):
             session_manager_module.render_session_manager()
        
        # Verify file created in session dir
        manager = session_manager_module.SessionManager(mock_session_dir)
        sessions = manager.list_sessions()
        assert len(sessions) > 0
        assert sessions[0].name.startswith("Imported:")

    def test_import_rejects_too_many_events(self, mock_streamlit, session_manager_module, mock_session_dir):
        """Test import rejects sessions with too many events."""
        mock_file = MagicMock()
        mock_file.size = 100
        mock_file.getvalue.return_value = json.dumps({
            "metadata": {"name": "Too Large"},
            "events": [{}] * (session_manager_module.MAX_EVENTS_LIMIT + 1)
        }).encode("utf-8")

        mock_streamlit.file_uploader.return_value = mock_file
        mock_streamlit.button.side_effect = lambda label, **kwargs: label == "Import"

        def mock_columns(spec):
            if isinstance(spec, int):
                count = spec
            else:
                count = len(spec)
            return [MagicMock() for _ in range(count)]
        mock_streamlit.columns.side_effect = mock_columns

        with patch.object(session_manager_module, "SESSION_DIR", mock_session_dir):
            session_manager_module.render_session_manager()

        # No file should be created
        manager = session_manager_module.SessionManager(mock_session_dir)
        sessions = manager.list_sessions()
        assert sessions == []

    def test_render_session_manager_ui_interactions(self, mock_streamlit, session_manager_module):
        """Test UI interactions in render_session_manager."""
        # We need to patch the SessionManager class inside the imported module
        with patch.object(session_manager_module, "SessionManager") as MockManager:
            manager = MockManager.return_value
            
            valid_id = str(uuid4())
            
            # Mock list_sessions to return data
            session = session_manager_module.SessionMetadata(
                id=valid_id, 
                name="Test Session",
                updated_at=datetime.now()
            )
            manager.list_sessions.return_value = [session]
            
            # Mock st.columns
            def mock_columns(spec):
                if isinstance(spec, int):
                    count = spec
                else:
                    count = len(spec)
                return [MagicMock() for _ in range(count)]
            
            mock_streamlit.columns.side_effect = mock_columns
            
            # Test 1: Save Button
            mock_streamlit.text_input.side_effect = ["New Name", "tag1,tag2"]
            mock_streamlit.button.side_effect = lambda label, **kwargs: label == "Save"
            
            # Mock active session
            old_id = str(uuid4())
            mock_streamlit.session_state = {
                "active_session_id": old_id,
                "active_session_name": "Old Name"
            }
            
            session_manager_module.render_session_manager()
            
            manager.save_session.assert_called_with(
                name="New Name",
                description=mock_streamlit.text_area.return_value,
                tags=["tag1", "tag2"],
                session_id=old_id
            )
            
            # Test 2: Save As New Button
            manager.reset_mock()
            mock_streamlit.button.side_effect = lambda label, **kwargs: label == "Save As New"
            
            session_manager_module.render_session_manager()
            
            manager.save_session.assert_called_with(
                name="New Name",
                description=mock_streamlit.text_area.return_value,
                tags=["tag1", "tag2"],
                session_id=None
            )
            
            # Test 3: Load Button
            manager.reset_mock()
            mock_streamlit.selectbox.return_value = valid_id
            mock_streamlit.button.side_effect = lambda label, **kwargs: kwargs.get("key") == "load_session_btn"
            
            session_manager_module.render_session_manager()
            
            manager.load_session.assert_called_with(valid_id)
            
            # Test 4: Delete Button (Active Session)
            manager.reset_mock()
            manager.delete_session.return_value = True
            mock_streamlit.button.side_effect = lambda label, **kwargs: kwargs.get("key") == "del_session_btn"
            
            # Set active session to the one being deleted
            mock_streamlit.session_state = {
                "active_session_id": valid_id, # Matches selectbox default (first item)
                "active_session_name": "Test Session"
            }
            mock_streamlit.selectbox.return_value = valid_id
            
            session_manager_module.render_session_manager()

            # Confirm delete on second render
            manager.reset_mock()
            mock_streamlit.button.side_effect = lambda label, **kwargs: kwargs.get("key") == "confirm_delete_btn"
            session_manager_module.render_session_manager()

            manager.delete_session.assert_called_with(valid_id)
            assert "active_session_id" not in mock_streamlit.session_state
            
            # Test 5: New Session (Clear) with active session
            manager.reset_mock()
            mock_streamlit.session_state = {
                "active_session_id": "some-id",
                "active_session_name": "some-name"
            }
            mock_streamlit.button.side_effect = lambda label, **kwargs: label == "New Session (Clear)"
            
            session_manager_module.render_session_manager()
            
            assert "active_session_id" not in mock_streamlit.session_state
