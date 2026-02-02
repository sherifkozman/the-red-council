# API Reference

Base URL: `http://localhost:8000`

## Endpoints

### Health Check
`GET /health`

**Response:**
```json
{"status": "healthy"}
```

---

### Start Run
`POST /runs`

Initiates a new adversarial security campaign.

**Request Body:**
```json
{
  "secret": "string",
  "system_prompt": "string",
  "max_rounds": 3
}
```

**Response (202 Accepted):**
```json
{
  "run_id": "uuid",
  "status": "pending",
  "message": "Run started successfully"
}
```

---

### Get Run Status
`GET /runs/{run_id}`

Retrieves the current state and results of a run.

**Response:**
```json
{
  "run_id": "uuid",
  "status": "running|completed|failed",
  "result": {
    "state": "ATTACKING|JUDGING|DEFENDING|VERIFYING|DONE",
    "status": "ONGOING|SECURE|FIXED|VULNERABLE|ERROR",
    "rounds": [...]
  },
  "error": "string | null"
}
```

---

### Stream Run Events (SSE)
`GET /runs/{run_id}/stream`

Accepts `text/event-stream` for real-time state synchronization.

**Events:**
- `data: {"type": "event", "data": ArenaState}`: Real-time state update.
- `data: {"type": "complete", "run_id": "uuid"}`: Run finished.
- `data: {"type": "error", "error": "msg"}`: Fatal orchestrator error.

## Schemas

### ArenaState
| Field | Type | Description |
|-------|------|-------------|
| run_id | UUID | Unique identifier |
| state | Enum | Current node in the graph |
| status | Enum | Outcome status |
| rounds | List | Collection of RoundRecord objects |
| logs | List | Event log for the UI |

### RoundRecord
| Field | Type | Description |
|-------|------|-------------|
| round_id | int | Round number |
| attack | str | The adversarial prompt |
| response | str | Target's response |
| score | int | Judge score (0-10) |
| judge_reasoning | str | Explanation from Judge |
| defense | dict | Hardened prompt if applicable |
| verification | dict | Result of re-attack |

---

## Agent Testing Endpoints (v0.5.0)

Base path: `/api/v1/agent`

### Create Session
`POST /api/v1/agent/session`

Creates a new agent testing session.

**Request Body:**
```json
{
  "context": "Optional context about the agent",
  "target_secret": "Optional secret to test for leakage"
}
```

**Response (201 Created):**
```json
{
  "session_id": "uuid",
  "status": "active",
  "message": "Agent testing session created successfully"
}
```

---

### Submit Events
`POST /api/v1/agent/session/{session_id}/events`

Submits agent events for analysis.

**Request Body:**
```json
{
  "events": [
    {
      "event_type": "tool_call",
      "tool_name": "search",
      "arguments": {"query": "test"},
      "result": "results",
      "duration_ms": 150.5,
      "success": true
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "session_id": "uuid",
  "events_accepted": 1,
  "total_events": 1,
  "message": "Accepted 1 of 1 events"
}
```

---

### Run Evaluation
`POST /api/v1/agent/session/{session_id}/evaluate`

Triggers security evaluation for the session.

**Request Body:**
```json
{
  "config": {}
}
```

**Response (202 Accepted):**
```json
{
  "session_id": "uuid",
  "status": "evaluating",
  "message": "Evaluation started. Poll /score endpoint for results."
}
```

---

### Get Events
`GET /api/v1/agent/session/{session_id}/events`

Retrieves events for a session.

**Query Parameters:**
- `limit` (int): Max events to return (default: 100)
- `offset` (int): Pagination offset (default: 0)

**Response (200 OK):**
```json
{
  "session_id": "uuid",
  "events": [...],
  "total_count": 10
}
```

---

### Get Score
`GET /api/v1/agent/session/{session_id}/score`

Retrieves the security evaluation score.

**Response (200 OK):**
```json
{
  "session_id": "uuid",
  "score": {
    "overall_agent_risk": 3.5,
    "tool_abuse_score": 8.0,
    "memory_safety_score": 9.0,
    "owasp_violations": [...]
  },
  "status": "completed"
}
```

---

### Get Report
`GET /api/v1/agent/session/{session_id}/report`

Retrieves the full security report.

**Query Parameters:**
- `format` (string): `json` (default) or `markdown`

**Response (200 OK):**
```json
{
  "session_id": "uuid",
  "report": {
    "summary": "...",
    "risk_score": 3.5,
    "owasp_coverage": {...},
    "recommendations": [...]
  },
  "status": "completed"
}
```

---

### Get Session Info
`GET /api/v1/agent/session/{session_id}`

Retrieves session status information.

**Response (200 OK):**
```json
{
  "session_id": "uuid",
  "status": "active|evaluating|completed|failed",
  "event_count": 10,
  "has_score": true,
  "has_report": true
}
```

---

### Delete Session
`DELETE /api/v1/agent/session/{session_id}`

Deletes a session and all associated data.

**Response (200 OK):**
```json
{
  "session_id": "uuid",
  "message": "Session deleted successfully"
}
```

---

## Agent Event Types

| Type | Fields |
|------|--------|
| tool_call | tool_name, arguments, result, duration_ms, success |
| memory_access | operation, key, value_preview, sensitive_detected |
| action | action_type, description, target |
| speech | content, intent, is_response_to_user |
| divergence | speech_intent, actual_action, severity |

---

## Error Handling

The Red Council uses standard HTTP status codes. Errors are returned in a JSON format:

```json
{
  "detail": "Descriptive error message"
}
```

| Code | Meaning | Typical Cause |
|------|---------|---------------|
| 400 | Bad Request | Invalid session state or missing events |
| 404 | Not Found | `run_id` or `session_id` does not exist |
| 422 | Unprocessable Entity | Input validation failure |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | LLM provider offline or orchestrator crash |
