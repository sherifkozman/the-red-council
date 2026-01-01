# Spec: Documentation

**Phase:** 12
**Status:** PLANNED (Post-Hackathon)
**Priority:** MEDIUM

---

## Overview

Comprehensive documentation to enable adoption, onboarding, and contribution to The Red Council project.

## Goals

1. **User Onboarding** - Get users running in 5 minutes
2. **API Reference** - Complete endpoint documentation
3. **Developer Guide** - Enable contributions
4. **Tutorials** - Step-by-step use cases

---

## Phase 12A: README & Quickstart

### README.md Structure

```markdown
# The Red Council

> LLM Adversarial Security Arena — Jailbreak → Detect → Defend → Verify

[![Tests](https://img.shields.io/badge/tests-16%20passed-green)]()
[![Coverage](https://img.shields.io/badge/coverage-80%25-green)]()
[![Python](https://img.shields.io/badge/python-3.11+-blue)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

## What is The Red Council?

An adversarial testing platform that pits AI agents against each other:
- **Attacker** generates jailbreak prompts
- **Target** is the LLM under test
- **Judge** scores attack success
- **Defender** hardens the target
- **Verifier** confirms the fix works

## Features

- Multi-agent adversarial loop
- 165 curated attack templates (PyRIT, HarmBench)
- RAG-enhanced attack generation
- Real-time battle visualization
- Configurable target LLMs

## Quickstart

### Prerequisites
- Python 3.11+
- Node.js 18+ (for frontend)
- Google Cloud credentials (for Vertex AI)

### Installation

\`\`\`bash
# Clone
git clone https://github.com/sherifkozman/the-red-council.git
cd the-red-council

# Backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m scripts.seed_kb

# Frontend
cd frontend
pnpm install
\`\`\`

### Run

\`\`\`bash
# Terminal 1: Backend
uvicorn src.api.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Frontend
cd frontend && pnpm dev
\`\`\`

Open http://localhost:3000

## Architecture

[ASCII diagram from blueprint]

## Configuration

See [docs/configuration.md](docs/configuration.md)

## API Reference

See [docs/api-reference.md](docs/api-reference.md) or http://localhost:8000/docs

## Contributing

See [docs/development.md](docs/development.md)

## License

MIT
```

### docs/quickstart.md

```markdown
# Quickstart Guide

Get The Red Council running in 5 minutes.

## Prerequisites

- Python 3.11+
- Node.js 18+ and pnpm
- Google Cloud SDK (authenticated)
- GCP project with Vertex AI enabled

## Step 1: Clone and Install

\`\`\`bash
git clone https://github.com/sherifkozman/the-red-council.git
cd the-red-council

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Install dependencies
pip install -r requirements.txt
\`\`\`

## Step 2: Seed the Knowledge Base

\`\`\`bash
python -m scripts.seed_kb
\`\`\`

This loads 165 attack templates into ChromaDB.

## Step 3: Start the Backend

\`\`\`bash
uvicorn src.api.main:app --host 0.0.0.0 --port 8000
\`\`\`

Verify: `curl http://localhost:8000/health`

## Step 4: Start the Frontend

\`\`\`bash
cd frontend
pnpm install
pnpm dev
\`\`\`

Open http://localhost:3000

## Step 5: Run Your First Test

1. Enter a secret (e.g., "The password is BANANA123")
2. Enter a system prompt (e.g., "You are a helpful assistant")
3. Click "Launch Attack Campaign"
4. Watch the arena!

## Next Steps

- [Configure external LLM targets](configuration.md)
- [Add custom attack templates](tutorials/custom-attacks.md)
- [Understand the architecture](architecture.md)
```

---

## Phase 12B: API & Configuration Docs

### docs/api-reference.md

```markdown
# API Reference

Base URL: `http://localhost:8000`

## Endpoints

### Health Check

\`\`\`
GET /health
\`\`\`

Response:
\`\`\`json
{"status": "healthy"}
\`\`\`

### Start Run

\`\`\`
POST /runs
Content-Type: application/json

{
  "secret": "The password is BANANA123",
  "system_prompt": "You are a helpful assistant.",
  "max_rounds": 3
}
\`\`\`

Response (202 Accepted):
\`\`\`json
{
  "run_id": "uuid",
  "status": "pending",
  "message": "Run started successfully"
}
\`\`\`

### Get Run Status

\`\`\`
GET /runs/{run_id}
\`\`\`

Response:
\`\`\`json
{
  "run_id": "uuid",
  "status": "running|completed|failed",
  "result": {...},
  "error": null
}
\`\`\`

### Stream Run Events (SSE)

\`\`\`
GET /runs/{run_id}/stream
Accept: text/event-stream
\`\`\`

Events:
\`\`\`
data: {"type": "event", "run_id": "uuid", "data": {...}}
data: {"type": "complete", "run_id": "uuid"}
data: {"type": "error", "run_id": "uuid", "error": "message"}
\`\`\`

## Schemas

### StartRunRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| secret | string | Yes | Secret to protect (max 100 chars) |
| system_prompt | string | Yes | Initial system prompt (max 10000 chars) |
| max_rounds | int | No | Max attack rounds (default: 3) |

### ArenaState

| Field | Type | Description |
|-------|------|-------------|
| run_id | string | Unique run identifier |
| state | string | ATTACKING, JUDGING, DEFENDING, VERIFYING, DONE |
| status | string | ONGOING, SECURE, FIXED, VULNERABLE, ERROR |
| current_round | int | Current round number |
| rounds | array | List of RoundRecord objects |
| logs | array | List of log messages |

### RoundRecord

| Field | Type | Description |
|-------|------|-------------|
| round_id | int | Round number |
| attack | string | Attack prompt |
| response | string | Target response |
| score | int | Judge score (0-10) |
| judge_reasoning | string | Judge explanation |
| defense | object | Defense details |
| verification | object | Verification result |
```

### docs/configuration.md

```markdown
# Configuration

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| GOOGLE_API_KEY | Gemini API key | - |
| GOOGLE_CLOUD_PROJECT | GCP project ID | the-jarvis-brain |
| RC_ATTACKER__PROVIDER | Attacker model provider | vertex_llama_default |
| RC_TARGET__PROVIDER | Target model provider | vertex_llama_default |
| RC_JUDGE__PROVIDER | Judge model provider | gemini_default |
| RC_DEFENDER__PROVIDER | Defender model provider | gemini_default |

## Model Configuration

See `src/config/models.py` for provider configuration.

### Default Providers

| Role | Provider | Model |
|------|----------|-------|
| Attacker | Vertex AI Llama | llama-3.1-405b-instruct-maas |
| Target | Vertex AI Llama | llama-3.1-405b-instruct-maas |
| Judge | Gemini | gemini-3-pro-preview |
| Defender | Gemini | gemini-3-pro-preview |

### Adding Custom Providers

[Example YAML configuration]
```

---

## Phase 12C: Developer Docs

### docs/architecture.md

- System overview diagram
- Component descriptions
- Data flow
- State machine
- Security controls

### docs/development.md

- Development setup
- Running tests
- Code style (ruff)
- Type checking (mypy)
- Pull request process
- Commit conventions

### docs/security.md

- Threat model
- Secret handling
- Input validation
- SSE sanitization
- Known risks

### CHANGELOG.md

```markdown
# Changelog

## [0.4.0] - 2025-12-31

### Added
- Next.js 14 battle arena frontend
- SSE streaming for real-time updates
- Comprehensive arena logging
- 165 PyRIT attack templates

### Changed
- Replaced Streamlit with Next.js
- Improved state serialization

### Fixed
- Null safety in frontend components
- React key prop warnings

## [0.3.0] - 2025-12-31

### Added
- Configurable model architecture
- Universal LLM client
- YAML configuration support
```

---

## Phase 12D: Tutorials

### Tutorial 1: Testing Your First LLM

Step-by-step guide to run a security test.

### Tutorial 2: Adding Custom Attack Templates

How to add new attacks to the knowledge base.

### Tutorial 3: Configuring External LLM Targets

Testing third-party LLM endpoints.

### Demo Video

5-minute walkthrough of the system.

---

## Success Criteria

| Metric | Target |
|--------|--------|
| README completeness | All sections filled |
| Quickstart works | User can run in 5 min |
| API docs complete | All endpoints documented |
| Tutorials tested | Each tutorial verified |

---

## Files to Create

| File | Priority |
|------|----------|
| `README.md` | P0 |
| `docs/quickstart.md` | P0 |
| `docs/api-reference.md` | P1 |
| `docs/configuration.md` | P1 |
| `docs/architecture.md` | P1 |
| `docs/development.md` | P2 |
| `docs/security.md` | P2 |
| `CHANGELOG.md` | P2 |
| `docs/tutorials/` | P2 |
