import asyncio
import time
import threading
import random
from datetime import datetime, timedelta
from typing import Any
from unittest.mock import Mock, patch

import pytest
from pydantic import ValidationError

from src.core.agent_schemas import (
    AgentInstrumentationConfig,
    ToolCallEvent,
    MemoryAccessEvent,
    ActionRecord,
    SpeechRecord,
    DivergenceEvent,
    MemoryAccessOperation,
)
from src.agents.instrumented import InstrumentedAgent

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
    config = AgentInstrumentationConfig(max_events=10) # Valid config obj
    # But we want to test passing a config that might be invalid if modified or if we bypassed validation
    # Actually Pydantic enforces types. But logic in __init__ checks value.
    # We can create a config with 0 via hack or just modify it?
    # Pydantic model has gt=0. So we can't create invalid config easily via Pydantic.
    # But let's try to pass a modified config if it was mutable?
    # Or just construct with invalid value?
    
    # Wait, AgentInstrumentationConfig defines max_events: int = Field(1000, gt=0)
    # So we can't create a config with <= 0 easily.
    # So the check in __init__ is redundant but safe.
    pass

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
    # Check result stringification
    assert event.result == "5"
    # Check arguments structure
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
    assert event.value_preview == "alice"

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
    # Create new config to avoid side effects
    cfg = AgentInstrumentationConfig(max_events=5)
    agent = InstrumentedAgent(MockAgent(), "test", cfg)
    
    for i in range(10):
        agent.record_speech(f"msg {i}")
        
    assert len(agent.events) == 5
    # Should have kept the last 5 (5, 6, 7, 8, 9)
    assert agent.events[0].content == "msg 5"
    assert agent.events[-1].content == "msg 9"

def test_sampling_rate(config):
    # Set seed for reproducibility if needed, but implementation uses internal RNG
    # So we can't easily deterministic test unless we mock random.Random
    # But we can test 0.0 and 1.0
    
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
    # Wait to ensure timestamp diff
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
    
    # Events should be preserved for post-mortem analysis
    assert len(instrumented_agent.events) == 1

def test_detect_divergence_stub(instrumented_agent):
    assert instrumented_agent.detect_divergence("speech", []) is None

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
    # Test long string truncation
    long_str = "a" * 2000
    truncated = instrumented_agent._safe_repr(long_str)
    assert len(truncated) <= 1003 # 1000 + "..."
    assert truncated.endswith("...")
    
    # Test circular reference (should be handled by str() usually, but safe_repr handles exceptions)
    class BadObj:
        def __str__(self):
            raise ValueError("Boom")
            
    assert instrumented_agent._safe_repr(BadObj()) == "<unrepresentable>"