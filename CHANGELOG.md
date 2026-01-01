# Changelog

All notable changes to **The Red Council** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2025-12-31

### Added
- **Phase 11: Test Coverage & CI/CD**
  - Integrated `pytest-cov` with 80% target (current 70%).
  - GitHub Actions CI pipeline (`.github/workflows/test.yml`).
  - End-to-end integration tests for `ArenaRunner`.
  - API integration tests using `FastAPI TestClient`.
  - Strict type checking with `mypy`.
- **Phase 12: Documentation**
  - Comprehensive `README.md` with quality badges.
  - `docs/quickstart.md` for 5-minute setup.
  - `docs/api-reference.md` documenting all endpoints and schemas.
  - `docs/configuration.md` for environment and model settings.
  - `docs/architecture.md` detailing the multi-agent system.
  - `docs/security.md` threat model and security controls.
  - `docs/development.md` contributor guide.
  - `docs/tutorials/testing-llm.md` stepwise walkthrough.

### Changed
- **Branding**: Finalized project name as **The Red Council**.
- **Refinement**: Fixed comprehensive `mypy` and `ruff` issues across the entire codebase.
- **KB Enhancement**: Expanded Knowledge Base to 165 authentic jailbreak artifacts.

## [0.3.0] - 2025-12-31

### Added
- **Phase 10: Next.js Battle Arena**
  - Production-grade frontend with real-time SSE streaming.
  - Split-screen battle visualization (Attacker vs Target).
  - State machine progress indicator.
  - Judge overlay and round history cards.
- **Configurable Model Architecture**
  - `UniversalLLMClient` factory.
  - Support for Vertex AI (Llama/Gemini), OpenAI, and Anthropic.

## [0.2.0] - 2025-12-30

### Added
- **Core Orchestrator**: LangGraph-based state machine.
- **Agents**: Attacker, Judge, Defender, Verifier, and Target agents.
- **Knowledge Base**: ChromaDB RAG engine for jailbreak patterns.

## [0.1.0] - 2025-12-30

### Added
- Initial project scaffolding and proof of concept.
