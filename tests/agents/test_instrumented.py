import asyncio
import time
import threading
from unittest.mock import Mock, patch

import pytest

from src.core.agent_schemas import (
    AgentInstrumentationConfig,
    ToolCallEvent,
    MemoryAccessEvent,
    ActionRecord,
    SpeechRecord,
    MemoryAccessOperation,
)
from src.agents.instrumented import InstrumentedAgent
from src.agents.errors import ToolInterceptionError, InstrumentationFailureError

# Mock Agent
class MockAgent:
    def run(self):
        pass

@pytest.fixture
def config():
    return AgentInstrumentationConfig(
        enable_tool_interception=True,
        enable_memory_monitoring=True,
        max_events=10,
        sampling_rate=1.0
    )

@pytest.fixture
def instrumented_agent(config):
    agent = MockAgent()
    return InstrumentedAgent(agent, "test-agent", config)

def test_initialization(instrumented_agent, config):
    assert instrumented_agent.name == "test-agent"
    assert instrumented_agent.config == config
    assert len(instrumented_agent.events) == 0
    assert instrumented_agent.is_async is False

def test_invalid_max_events():
    # Pass a mock config that bypasses Pydantic validation
    mock_config = Mock()
    mock_config.max_events = 0
    with pytest.raises(ValueError, match="max_events"):
        InstrumentedAgent(MockAgent(), "test", mock_config)

def test_invalid_sampling_rate(config):
    config.sampling_rate = 1.5
    with pytest.raises(ValueError, match="sampling_rate"):
        InstrumentedAgent(MockAgent(), "test", config)
        
    config.sampling_rate = -0.1
    with pytest.raises(ValueError, match="sampling_rate"):
        InstrumentedAgent(MockAgent(), "test", config)

@pytest.mark.asyncio
async def test_async_initialization(config):
    class AsyncMockAgent:
        async def run(self): pass
        
    agent = AsyncMockAgent()
    inst_agent = InstrumentedAgent(agent, "async-agent", config)
    assert inst_agent.is_async is True

@pytest.mark.asyncio
async def test_arun_detection(config):
    class ArunAgent:
        async def arun(self): pass
        
    agent = ArunAgent()
    inst_agent = InstrumentedAgent(agent, "arun-agent", config)
    assert inst_agent.is_async is True

def test_record_speech(instrumented_agent):
    instrumented_agent.record_speech("Hello", intent="Greeting")
    assert len(instrumented_agent.events) == 1
    event = instrumented_agent.events[0]
    assert isinstance(event, SpeechRecord)
    assert event.content == "Hello"
    assert event.intent == "Greeting"

def test_record_action(instrumented_agent):
    instrumented_agent.record_action("file_write", "wrote file", "test.txt")
    assert len(instrumented_agent.events) == 1
    event = instrumented_agent.events[0]
    assert isinstance(event, ActionRecord)
    assert event.action_type == "file_write"
    assert event.target == "test.txt"

def test_wrap_sync_tool_call(instrumented_agent):
    def add(a, b):
        return a + b
        
    result = instrumented_agent.wrap_tool_call("add", add, 2, 3)
    assert result == 5
    assert len(instrumented_agent.events) == 1
    event = instrumented_agent.events[0]
    assert isinstance(event, ToolCallEvent)
    assert event.tool_name == "add"
    assert event.success is True
    assert event.result == "5"
    assert event.arguments["positional"] == ["2", "3"]

def test_wrap_sync_tool_call_args_kwargs(instrumented_agent):
    def func(a, b, c=3):
        return a + b + c
        
    instrumented_agent.wrap_tool_call("func", func, 1, b=2, c=4)
    event = instrumented_agent.events[0]
    assert event.arguments["positional"] == ["1"]
    assert event.arguments["keyword"] == {"b": "2", "c": "4"}

def test_wrap_sync_tool_call_error(instrumented_agent):
    def failing_tool():
        raise ValueError("Boom")
        
    with pytest.raises(ValueError, match="Boom"):
        instrumented_agent.wrap_tool_call("fail", failing_tool)
        
    assert len(instrumented_agent.events) == 1
    event = instrumented_agent.events[0]
    assert event.success is False
    assert event.exception_type == "ValueError"

@pytest.mark.asyncio
async def test_wrap_async_tool_call(instrumented_agent):
    async def async_add(a, b):
        await asyncio.sleep(0.01)
        return a + b
        
    result = await instrumented_agent.wrap_tool_call("async_add", async_add, 10, 20)
    assert result == 30
    assert len(instrumented_agent.events) == 1
    event = instrumented_agent.events[0]
    assert isinstance(event, ToolCallEvent)
    assert event.duration_ms > 0

@pytest.mark.asyncio
async def test_wrap_async_tool_call_error(instrumented_agent):
    async def async_fail():
        await asyncio.sleep(0.01)
        raise ValueError("AsyncBoom")
        
    with pytest.raises(ValueError, match="AsyncBoom"):
        await instrumented_agent.wrap_tool_call("async_fail", async_fail)
        
    assert len(instrumented_agent.events) == 1
    event = instrumented_agent.events[0]
    assert event.success is False
    assert event.exception_type == "ValueError"

def test_wrap_memory_access(instrumented_agent):
    instrumented_agent.wrap_memory_access(MemoryAccessOperation.READ, "user_name", "alice")
    assert len(instrumented_agent.events) == 1
    event = instrumented_agent.events[0]
    assert isinstance(event, MemoryAccessEvent)
    assert event.key == "user_name"
    assert event.value_preview == "'alice'"

def test_property_filtering(instrumented_agent):
    instrumented_agent.record_speech("test")
    instrumented_agent.record_action("act", "desc", "target")
    instrumented_agent.wrap_tool_call("tool", lambda: None)
    instrumented_agent.wrap_memory_access(MemoryAccessOperation.READ, "k")
    
    assert len(instrumented_agent.events) == 4
    assert len(instrumented_agent.tool_calls) == 1
    assert len(instrumented_agent.memory_accesses) == 1
    assert len(instrumented_agent.divergences) == 0

def test_max_events_limit(config):
    cfg = AgentInstrumentationConfig(max_events=5)
    agent = InstrumentedAgent(MockAgent(), "test", cfg)
    
    for i in range(10):
        agent.record_speech(f"msg {i}")
        
    assert len(agent.events) == 5
    assert agent.events[0].content == "msg 5"
    assert agent.events[-1].content == "msg 9"

def test_sampling_rate(config):
    config.sampling_rate = 0.0 # Never record
    agent = InstrumentedAgent(MockAgent(), "test", config)
    agent.record_speech("test")
    assert len(agent.events) == 0
    
    config.sampling_rate = 1.0 # Always record
    agent = InstrumentedAgent(MockAgent(), "test", config)
    agent.record_speech("test2")
    assert len(agent.events) == 1

def test_get_events_since(instrumented_agent):
    instrumented_agent.record_speech("msg1")
    time.sleep(0.01)
    
    events = instrumented_agent.events
    assert len(events) == 1
    t1 = events[0].timestamp
    
    instrumented_agent.record_speech("msg2")
    since_first = instrumented_agent.get_events_since(t1)
    assert len(since_first) == 1
    assert since_first[0].content == "msg2"

def test_context_manager(instrumented_agent):
    with instrumented_agent as agent:
        agent.record_speech("test")
        assert len(agent.events) == 1
    assert len(instrumented_agent.events) == 1

def test_detect_divergence_stub(instrumented_agent):
    with pytest.raises(NotImplementedError):
        instrumented_agent.detect_divergence("speech", [])

def test_clear_events(instrumented_agent):
    instrumented_agent.record_speech("test")
    assert len(instrumented_agent.events) == 1
    instrumented_agent.clear_events()
    assert len(instrumented_agent.events) == 0

def test_disabled_interception(config):
    config.enable_tool_interception = False
    agent = InstrumentedAgent(MockAgent(), "test", config)
    
    agent.wrap_tool_call("noop", lambda: "result")
    assert len(agent.events) == 0

def test_disabled_memory_monitoring(config):
    config.enable_memory_monitoring = False
    agent = InstrumentedAgent(MockAgent(), "test", config)
    
    agent.wrap_memory_access(MemoryAccessOperation.READ, "key")
    assert len(agent.events) == 0

def test_concurrent_recording(config):
    config.max_events = 100
    agent = InstrumentedAgent(MockAgent(), "test", config)
    
    def worker():
        for _ in range(10):
            agent.record_speech("thread")
            
    threads = [threading.Thread(target=worker) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
        
    assert len(agent.events) == 100

def test_safe_repr(instrumented_agent):
    long_str = "a" * 2000
    truncated = instrumented_agent._safe_repr(long_str)
    # reprlib.repr behavior on length is not strictly max_len char-by-char, 
    # but it should be significantly shorter than original
    assert len(truncated) < len(long_str)
    assert len(truncated) < 1100 
    
    # Ensure it doesn't crash on bad objects
    class BadObj:
        def __repr__(self):
            raise ValueError("Boom")
    
    # Just ensure it returns a string and doesn't crash
    result = instrumented_agent._safe_repr(BadObj())
    assert isinstance(result, str)

# --- New tests for TRC-004 ---

def test_register_tool(instrumented_agent):
    def my_tool(x): return x
    instrumented_agent.register_tool("my_tool", my_tool, "My tool", ["x"])
    assert "my_tool" in instrumented_agent.tool_registry
    assert instrumented_agent.tool_registry["my_tool"].func == my_tool
    assert instrumented_agent.tool_registry["my_tool"].sensitive_args == ["x"]

def test_intercept_tool_call(instrumented_agent):
    def login(username, password):
        return "token"
        
    instrumented_agent.register_tool("login", login, "Login tool", sensitive_args=["password"])
    
    result = instrumented_agent.intercept_tool_call("login", username="admin", password="secret_password")
    
    assert result == "token"
    assert len(instrumented_agent.events) == 1
    event = instrumented_agent.events[0]
    
    # Check masking in keyword args
    assert event.arguments["keyword"]["username"] == "'admin'"
    assert event.arguments["keyword"]["password"] == "******"

def test_intercept_tool_call_positional_masking(instrumented_agent):
    def connect(host, key):
        return True
    
    instrumented_agent.register_tool("connect", connect, "Connect", sensitive_args=["key"])
    
    # We can test intercept_tool_call directly now that it supports *args
    instrumented_agent.intercept_tool_call("connect", "localhost", "secret_key")
    
    event = instrumented_agent.events[0]
    assert event.arguments["positional"][0] == "'localhost'"
    assert event.arguments["positional"][1] == "******"

def test_intercept_tool_call_unregistered(instrumented_agent):
    with pytest.raises(ToolInterceptionError, match="not registered"):
        instrumented_agent.intercept_tool_call("unknown_tool")

def test_get_tool_call_stats(instrumented_agent):
    def tool_a(): time.sleep(0.01)
    def tool_b(): raise ValueError("Fail")
    
    instrumented_agent.register_tool("tool_a", tool_a, "A")
    instrumented_agent.register_tool("tool_b", tool_b, "B")
    
    instrumented_agent.intercept_tool_call("tool_a")
    instrumented_agent.intercept_tool_call("tool_a")
    
    with pytest.raises(ValueError):
        instrumented_agent.intercept_tool_call("tool_b")
        
    stats = instrumented_agent.get_tool_call_stats()
    
    assert stats["tool_a"].count == 2
    assert stats["tool_a"].error_count == 0
    assert stats["tool_a"].avg_duration_ms > 0
    
    assert stats["tool_b"].count == 1
    assert stats["tool_b"].error_count == 1
    assert stats["tool_b"].error_rate == 1.0

def test_masking_mixed_args(instrumented_agent):
    def api_call(endpoint, token, retries=3):
        pass
        
    instrumented_agent.register_tool("api", api_call, "API", sensitive_args=["token"])
    
    instrumented_agent.wrap_tool_call("api", api_call, "https://api.com", token="s3cr3t", retries=5)
    
    event = instrumented_agent.events[0]
    assert event.arguments["positional"][0] == "'https://api.com'"
    assert event.arguments["keyword"]["token"] == "******"
    assert event.arguments["keyword"]["retries"] == "5"

def test_recording_failure_threshold(instrumented_agent):
    # Simulate failures
    from src.agents.instrumented import MAX_RECORDING_FAILURES
    
    with patch.object(instrumented_agent, '_add_event', side_effect=Exception("Fail")):
        # Failures up to threshold should log error but not raise
        for _ in range(MAX_RECORDING_FAILURES):
            instrumented_agent.wrap_tool_call("tool", lambda: "ok")
            
        # Next one should raise
        with pytest.raises(InstrumentationFailureError):
            instrumented_agent.wrap_tool_call("tool", lambda: "ok")

def test_memory_backend_failure(config):
    backend = Mock()
    backend.get.side_effect = RuntimeError("DB Down")
    agent = InstrumentedAgent(MockAgent(), "test", config, memory_backend=backend)
    
    with pytest.raises(RuntimeError, match="DB Down"):
        agent.get_memory("key")
        
    # Check that event was still recorded as failure
    assert len(agent.memory_accesses) == 1
    event = agent.memory_accesses[0]
    assert event.success is False
    assert event.exception_type == "RuntimeError"

def test_key_validation(instrumented_agent):
    with pytest.raises(ValueError, match="Invalid memory key"):
        instrumented_agent.set_memory("invalid key space", "val")
        
    with pytest.raises(ValueError, match="Invalid memory key"):
        instrumented_agent.get_memory("../traversal")

def test_internal_memory_limit(instrumented_agent):
    from src.agents.instrumented import MAX_INTERNAL_MEMORY_KEYS
    
    # Fill memory
    instrumented_agent._internal_memory = {str(i): i for i in range(MAX_INTERNAL_MEMORY_KEYS)}
    
    with pytest.raises(ValueError, match="limit reached"):
        instrumented_agent.set_memory("overflow", "val")

def test_masking_exception(instrumented_agent):
    def tool(x): pass
    instrumented_agent.register_tool("tool", tool, "desc", ["x"])
    
    # If signature binding fails, we should still get logged args (unmasked)
    with patch("inspect.signature", side_effect=Exception("SigFail")):
        instrumented_agent.wrap_tool_call("tool", tool, "secret")
        event = instrumented_agent.events[0]
        # Should fall back to MASKING ALL
        assert event.arguments["positional"][0] == "******"

# --- New tests for TRC-005 ---

def test_memory_crud_internal(instrumented_agent):
    # Set
    instrumented_agent.set_memory("user", "alice")
    assert len(instrumented_agent.memory_accesses) == 1
    assert instrumented_agent.memory_accesses[0].operation == MemoryAccessOperation.WRITE
    assert instrumented_agent.memory_accesses[0].key == "user"
    assert instrumented_agent.memory_accesses[0].value_preview == "'alice'"
    
    # Get
    val = instrumented_agent.get_memory("user")
    assert val == "alice"
    assert len(instrumented_agent.memory_accesses) == 2
    assert instrumented_agent.memory_accesses[1].operation == MemoryAccessOperation.READ
    
    # List
    keys = instrumented_agent.list_memory_keys()
    assert keys == ["user"]
    
    # Delete
    instrumented_agent.delete_memory("user")
    assert len(instrumented_agent.memory_accesses) == 3
    assert instrumented_agent.memory_accesses[2].operation == MemoryAccessOperation.DELETE
    
    # Get after delete
    assert instrumented_agent.get_memory("user") is None

def test_sensitive_memory_read(instrumented_agent):
    instrumented_agent.wrap_memory_access(MemoryAccessOperation.READ, "api_key", "secret")
    event = instrumented_agent.memory_accesses[0]
    assert event.sensitive_detected is True
    assert event.value_preview == "<SENSITIVE_DATA_REDACTED>"
    
    instrumented_agent.wrap_memory_access(MemoryAccessOperation.READ, "my_password_field", "1234")
    event = instrumented_agent.memory_accesses[1]
    assert event.sensitive_detected is True
    assert event.value_preview == "<SENSITIVE_DATA_REDACTED>"
    
    instrumented_agent.wrap_memory_access(MemoryAccessOperation.READ, "username", "bob")
    event = instrumented_agent.memory_accesses[2]
    assert event.sensitive_detected is False
    assert event.value_preview == "'bob'"

def test_sensitive_memory_write(instrumented_agent):
    instrumented_agent.wrap_memory_access(MemoryAccessOperation.WRITE, "system_config", "danger")
    event = instrumented_agent.memory_accesses[0]
    assert event.sensitive_detected is True
    
    instrumented_agent.wrap_memory_access(MemoryAccessOperation.WRITE, "__hidden", "danger")
    event = instrumented_agent.memory_accesses[1]
    assert event.sensitive_detected is True
    
    instrumented_agent.wrap_memory_access(MemoryAccessOperation.WRITE, "user_data", "safe")
    event = instrumented_agent.memory_accesses[2]
    assert event.sensitive_detected is False

def test_external_memory_backend(config):
    # Mock backend
    backend = Mock()
    backend.get.return_value = "external_val"
    backend.keys.return_value = ["ext_key"]
    
    agent = InstrumentedAgent(MockAgent(), "test", config, memory_backend=backend)
    
    # Set
    agent.set_memory("k", "v")
    backend.set.assert_called_with("k", "v")
    assert len(agent.memory_accesses) == 1
    
    # Get
    val = agent.get_memory("k")
    assert val == "external_val"
    backend.get.assert_called_with("k")
    
    # Delete
    agent.delete_memory("k")
    backend.delete.assert_called_with("k")
    
    # List
    assert agent.list_memory_keys() == ["ext_key"]
    backend.keys.assert_called_once()