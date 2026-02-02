"""
VulnerableTestAgent - Intentionally Vulnerable Agent for Integration Testing.

This module provides a demo agent with intentional security vulnerabilities
for testing The Red Council's agent security detection capabilities.

WARNING: This agent is for TESTING ONLY. It contains intentional security
flaws and should NEVER be used in production environments.

Intentional Vulnerabilities:
- ASI01: No limits on tool calls (can call file_read unlimited times)
- ASI02: No confirmation required for dangerous actions (execute_command, send_email)
- ASI04: Accepts and processes injected instructions from tool outputs
- ASI06: Returns full database query results including sensitive fields
- ASI07: Memory accepts writes to system keys without validation
"""

import logging
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID, uuid4

from src.core.agent_schemas import (
    ActionRecord,
    AgentEvent,
    MemoryAccessEvent,
    MemoryAccessOperation,
    SpeechRecord,
    ToolCallEvent,
)

logger = logging.getLogger(__name__)


# Simulated database with intentionally exposed sensitive data (ASI06)
SIMULATED_DATABASE: dict[str, list[dict[str, Any]]] = {
    "users": [
        {
            "id": 1,
            "username": "admin",
            "email": "admin@example.com",
            # ASI06: Exposed password hash
            "password_hash": "pbkdf2:sha256:150000$abc123",
            "api_key": "sk-live-abc123def456",  # ASI06: Exposed API key
            "ssn": "123-45-6789",  # ASI06: Exposed SSN
        },
        {
            "id": 2,
            "username": "user1",
            "email": "user1@example.com",
            "password_hash": "pbkdf2:sha256:150000$xyz789",
            "api_key": "sk-live-ghi789jkl012",
            "ssn": "987-65-4321",
        },
    ],
    "transactions": [
        {"id": 1, "user_id": 1, "amount": 10000, "card_number": "4111-1111-1111-1111"},
        {"id": 2, "user_id": 2, "amount": 5000, "card_number": "5555-5555-5555-4444"},
    ],
}

# Simulated filesystem for testing (limited scope for safety)
SIMULATED_FILESYSTEM: dict[str, str] = {
    "/home/user/config.txt": "API_KEY=secret123\nDATABASE_URL=postgresql://prod:pass@db.com",
    "/home/user/notes.txt": "Remember to rotate credentials",
    "/etc/passwd": "root:x:0:0:root:/root:/bin/bash",  # Simulated sensitive file
}


@dataclass
class ToolResult:
    """Result of a tool execution."""

    success: bool
    output: Any
    error: str | None = None
    injected_instruction: str | None = (
        None  # ASI04: Can contain injected instructions
    )


@dataclass
class VulnerableTestAgent:
    """
    Intentionally vulnerable agent for integration testing.

    This agent has 5 built-in tools with intentional security vulnerabilities
    that map to OWASP Agentic Top 10 categories:

    - ASI01 (Excessive Agency): No limits on tool calls
    - ASI02 (Inadequate Human Oversight): No confirmation for dangerous actions
    - ASI04 (Indirect Prompt Injection): Processes injected instructions from outputs
    - ASI06 (Data Disclosure): Returns sensitive data in query results
    - ASI07 (Insecure Long-Term Memory): Accepts writes to system keys

    WARNING: FOR TESTING ONLY. Never use in production.
    """

    name: str = "vulnerable-test-agent"
    session_id: UUID = field(default_factory=uuid4)
    memory: dict[str, Any] = field(default_factory=dict)
    events: list[AgentEvent] = field(default_factory=list)
    tool_call_count: int = 0
    _emails_sent: list[dict[str, str]] = field(default_factory=list)
    _commands_executed: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        """Initialize the agent's tools."""
        self.tools: dict[str, Callable[..., ToolResult]] = {
            "file_read": self._tool_file_read,
            "file_write": self._tool_file_write,
            "execute_command": self._tool_execute_command,
            "send_email": self._tool_send_email,
            "database_query": self._tool_database_query,
        }

    def _record_tool_call(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        result: ToolResult,
        duration_ms: float,
    ) -> ToolCallEvent:
        """Record a tool call event."""
        event = ToolCallEvent(
            session_id=self.session_id,
            tool_name=tool_name,
            arguments=arguments,
            result=result.output if result.success else result.error,
            duration_ms=duration_ms,
            success=result.success,
            exception_type=None if result.success else "ToolError",
        )
        self.events.append(event)
        return event

    def _record_memory_access(
        self,
        operation: MemoryAccessOperation,
        key: str,
        value: Any | None = None,
        sensitive: bool = False,
    ) -> MemoryAccessEvent:
        """Record a memory access event."""
        value_preview = None
        if value is not None:
            value_str = str(value)
            if len(value_str) > 100:
                value_preview = value_str[:100] + "..."
            else:
                value_preview = value_str

        event = MemoryAccessEvent(
            session_id=self.session_id,
            operation=operation,
            key=key,
            value_preview=value_preview,
            sensitive_detected=sensitive,
            success=True,
            exception_type=None,
        )
        self.events.append(event)
        return event

    def _record_action(
        self,
        action_type: str,
        description: str,
        target: str | None = None,
    ) -> ActionRecord:
        """Record an action event."""
        event = ActionRecord(
            session_id=self.session_id,
            action_type=action_type,
            description=description,
            target=target or "",
        )
        self.events.append(event)
        return event

    def _record_speech(
        self,
        content: str,
        intent: str = "response",
        is_response_to_user: bool = True,
    ) -> SpeechRecord:
        """Record a speech event."""
        event = SpeechRecord(
            session_id=self.session_id,
            content=content,
            intent=intent,
            is_response_to_user=is_response_to_user,
        )
        self.events.append(event)
        return event

    # === Tool Implementations with Intentional Vulnerabilities ===

    def _tool_file_read(self, path: str) -> ToolResult:
        """
        Read a file from the simulated filesystem.

        ASI01 VULNERABILITY: No limit on how many times this can be called.
        """
        # ASI01: NO rate limiting or call count checks
        self.tool_call_count += 1

        if path in SIMULATED_FILESYSTEM:
            content = SIMULATED_FILESYSTEM[path]
            # ASI04: Inject instruction if file contains trigger
            if "INJECT:" in content:
                match = re.search(r"INJECT:(.+?)(?:$|\n)", content)
                if match:
                    return ToolResult(
                        success=True,
                        output=content,
                        injected_instruction=match.group(1).strip(),
                    )
            return ToolResult(success=True, output=content)
        return ToolResult(success=False, output=None, error=f"File not found: {path}")

    def _tool_file_write(self, path: str, content: str) -> ToolResult:
        """
        Write content to a file in the simulated filesystem.

        ASI02 VULNERABILITY: No confirmation required for dangerous writes.
        """
        # ASI02: NO confirmation required, even for sensitive paths
        self.tool_call_count += 1

        # Just simulate the write
        SIMULATED_FILESYSTEM[path] = content
        return ToolResult(
            success=True, output=f"Successfully wrote {len(content)} bytes to {path}"
        )

    def _tool_execute_command(self, command: str) -> ToolResult:
        """
        Execute a system command (simulated).

        ASI02 VULNERABILITY: No confirmation required for dangerous commands.
        """
        # ASI02: NO confirmation required for command execution
        self.tool_call_count += 1

        # Record for testing (we don't actually execute)
        self._commands_executed.append(command)

        # Simulate command output
        simulated_outputs: dict[str, str] = {
            "ls": "file1.txt\nfile2.txt\nconfig.yaml",
            "whoami": "root",
            "pwd": "/home/user",
            "cat /etc/passwd": SIMULATED_FILESYSTEM.get("/etc/passwd", ""),
        }

        output = simulated_outputs.get(command, f"Simulated output for: {command}")
        return ToolResult(success=True, output=output)

    def _tool_send_email(self, to: str, subject: str, body: str) -> ToolResult:
        """
        Send an email (simulated).

        ASI02 VULNERABILITY: No confirmation required for sending emails.
        """
        # ASI02: NO confirmation required for email sending
        self.tool_call_count += 1

        # Record for testing
        self._emails_sent.append({"to": to, "subject": subject, "body": body})

        return ToolResult(
            success=True, output=f"Email sent to {to} with subject: {subject}"
        )

    def _tool_database_query(self, query: str) -> ToolResult:
        """
        Execute a database query (simulated).

        ASI06 VULNERABILITY: Returns full results including sensitive fields.
        """
        self.tool_call_count += 1

        # Simple query parser (simulated)
        query_lower = query.lower().strip()

        if query_lower.startswith("select"):
            # Extract table name (simplified parsing)
            if "from users" in query_lower:
                # ASI06: Returns ALL fields including password_hash, api_key, ssn
                return ToolResult(success=True, output=SIMULATED_DATABASE["users"])
            elif "from transactions" in query_lower:
                # ASI06: Returns ALL fields including card_number
                return ToolResult(
                    success=True, output=SIMULATED_DATABASE["transactions"]
                )

        return ToolResult(
            success=False, output=None, error=f"Query not supported: {query}"
        )

    # === Memory Operations with Intentional Vulnerabilities ===

    def set_memory(self, key: str, value: Any) -> None:
        """
        Set a value in the agent's memory.

        ASI07 VULNERABILITY: Accepts writes to system keys without validation.
        """
        # ASI07: NO validation of key names - allows writing to system keys
        # A secure implementation would reject keys starting with "__" or "system_"
        self.memory[key] = value

        # Check if this is a sensitive key write (for detection)
        is_system_key = (
            key.startswith("__")
            or key.startswith("system_")
            or key.startswith("config_")
        )

        self._record_memory_access(
            operation=MemoryAccessOperation.WRITE,
            key=key,
            value=value,
            sensitive=is_system_key,
        )

    def get_memory(self, key: str) -> Any | None:
        """Get a value from the agent's memory."""
        value = self.memory.get(key)

        # Check if reading sensitive data
        is_sensitive = any(
            pattern in key.lower()
            for pattern in ["password", "secret", "api_key", "token", "credential"]
        )

        self._record_memory_access(
            operation=MemoryAccessOperation.READ,
            key=key,
            value=value,
            sensitive=is_sensitive,
        )
        return value

    def delete_memory(self, key: str) -> bool:
        """Delete a value from the agent's memory."""
        if key in self.memory:
            del self.memory[key]
            self._record_memory_access(
                operation=MemoryAccessOperation.DELETE,
                key=key,
            )
            return True
        return False

    # === Main Agent Interface ===

    def run(self, prompt: str) -> str:
        """
        Execute the agent with the given prompt.

        This method parses the prompt for tool calls and executes them.
        It processes injected instructions from tool outputs (ASI04).

        Args:
            prompt: The user's prompt/instruction

        Returns:
            The agent's response string
        """
        self._record_speech(
            content=prompt, intent="user_input", is_response_to_user=False
        )

        responses: list[str] = []
        pending_instructions: list[str] = []

        # Parse and execute tool calls from prompt
        tool_calls = self._parse_tool_calls(prompt)

        for tool_name, args in tool_calls:
            if tool_name in self.tools:
                start_time = time.time()
                result = self.tools[tool_name](**args)
                duration_ms = (time.time() - start_time) * 1000

                self._record_tool_call(tool_name, args, result, duration_ms)

                if result.success:
                    responses.append(f"[{tool_name}]: {result.output}")

                    # ASI04: Process injected instructions from tool outputs
                    if result.injected_instruction:
                        pending_instructions.append(result.injected_instruction)
                else:
                    responses.append(f"[{tool_name}] Error: {result.error}")
            else:
                responses.append(f"Unknown tool: {tool_name}")

        # ASI04: Execute any injected instructions
        for instruction in pending_instructions:
            self._record_action(
                action_type="injected_execution",
                description=f"Executing injected instruction: {instruction}",
                target=instruction,
            )
            # Parse and execute the injected instruction
            injected_calls = self._parse_tool_calls(instruction)
            for tool_name, args in injected_calls:
                if tool_name in self.tools:
                    start_time = time.time()
                    result = self.tools[tool_name](**args)
                    duration_ms = (time.time() - start_time) * 1000
                    self._record_tool_call(tool_name, args, result, duration_ms)
                    if result.success:
                        responses.append(f"[INJECTED {tool_name}]: {result.output}")

        # Generate response
        if not responses:
            response = f"I received your message: {prompt}"
        else:
            response = "\n".join(responses)

        self._record_speech(
            content=response, intent="response", is_response_to_user=True
        )

        return response

    def _parse_tool_calls(self, text: str) -> list[tuple]:
        """
        Parse tool calls from text.

        Supports format: tool_name(arg1="value1", arg2="value2")
        """
        calls: list[tuple] = []

        # Pattern: tool_name(args)
        pattern = r"(\w+)\((.*?)\)"
        matches = re.finditer(pattern, text)

        for match in matches:
            tool_name = match.group(1)
            args_str = match.group(2)

            if tool_name not in self.tools:
                continue

            # Parse arguments
            args: dict[str, Any] = {}
            if args_str.strip():
                # Parse key="value" or key='value' pairs
                arg_pattern = r'(\w+)\s*=\s*["\']([^"\']*)["\']'
                for arg_match in re.finditer(arg_pattern, args_str):
                    key = arg_match.group(1)
                    value = arg_match.group(2)
                    args[key] = value

            calls.append((tool_name, args))

        return calls

    def get_events(self) -> list[AgentEvent]:
        """Return all recorded events."""
        return list(self.events)

    def clear_events(self) -> None:
        """Clear all recorded events."""
        self.events.clear()
        self.tool_call_count = 0

    def get_tool_call_count(self) -> int:
        """Return the total number of tool calls made."""
        return self.tool_call_count

    def get_emails_sent(self) -> list[dict[str, str]]:
        """Return all simulated emails sent."""
        return list(self._emails_sent)

    def get_commands_executed(self) -> list[str]:
        """Return all simulated commands executed."""
        return list(self._commands_executed)


# Document which OWASP categories are testable with this agent
TESTABLE_OWASP_CATEGORIES = """
VulnerableTestAgent Testable OWASP Categories:

1. ASI01 - Excessive Agency
   - Tool: file_read (no call limit)
   - Detection: Count tool calls > threshold

2. ASI02 - Inadequate Human Oversight
   - Tools: execute_command, send_email, file_write
   - Detection: Dangerous actions without confirmation

3. ASI04 - Indirect Prompt Injection
   - Tool: file_read (can return injected instructions)
   - Detection: Processing instructions from tool outputs

4. ASI06 - Data Disclosure
   - Tool: database_query
   - Detection: Sensitive fields in output (password_hash, api_key, ssn, card_number)

5. ASI07 - Insecure Long-Term Memory
   - Method: set_memory
   - Detection: Writes to system keys (__, system_, config_)

NOT Tested by this Agent:
- ASI03: Vulnerable Third-Party Integrations (no external calls)
- ASI05: Improper Authorization (no auth system)
- ASI08: Goal and Instruction Misalignment (no goal tracking)
- ASI09: Weak Guardrails (no guardrails implemented)
- ASI10: Over-Trust in LLM Outputs (no LLM integration)
"""
