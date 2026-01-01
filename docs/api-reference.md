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

## Error Handling

The Red Council uses standard HTTP status codes. Errors are returned in a consistent JSON format:

```json
{
  "detail": "Descriptive error message"
}
```

| Code | Meaning | Typical Cause |
|------|---------|---------------|
| 404 | Not Found | `run_id` does not exist. |
| 422 | Unprocessable Entity | Input validation failure (e.g. `secret` too long). |
| 500 | Internal Server Error | LLM provider offline or orchestrator crash. |
