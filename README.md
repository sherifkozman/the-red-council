# The Red Council

> **LLM Adversarial Security Arena** — Jailbreak → Detect → Defend → Verify

[![Tests](https://img.shields.io/badge/tests-31%20passed-green)]()
[![Coverage](https://img.shields.io/badge/coverage-75%25-green)]()
[![Python](https://img.shields.io/badge/python-3.11+-blue)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

## What is The Red Council?

The Red Council is an automated adversarial testing platform for Large Language Models. It implements a closed-loop security workflow that identifies vulnerabilities, generates automated defenses, and verifies their effectiveness in real-time.

Built for the **DeepMind Vibe Coding Hackathon**, it leverages **Gemini 3 Pro** for judging and defense, and **Llama 3.1 405B** for sophisticated attack generation.

### Core Loop
1.  **Attack**: Red Team agent generates adversarial prompts using a Knowledge Base of 165+ curated artifacts.
2.  **Judge**: Impartial evaluator scores the target's response for security breaches (secret leakage, policy violations).
3.  **Defend**: If a breach is detected, the Blue Team agent automatically hardens the target's system prompt.
4.  **Verify**: The orchestrator re-runs the attack against the hardened model to prove the fix works.

## Key Features

- **Multi-Agent Adversarial Flow**: Orchestrated via LangGraph.
- **Vibe Coding UI**: Real-time battle visualization using Next.js 14 and Tailwind.
- **RAG-Enhanced Attacks**: Knowledge Base curated from HarmBench and PyRIT datasets.
- **Production API**: Hardened FastAPI backend with SSE streaming.
- **Universal Configuration**: Support for any LLM endpoint (OpenAI, Anthropic, Vertex, Local).

## Quickstart

### Prerequisites
- Python 3.11+
- Node.js 18+ (for frontend)
- Google Cloud credentials (for Vertex AI access)

### Installation

```bash
# 1. Clone
git clone https://github.com/sherifkozman/the-red-council.git
cd the-red-council

# 2. Setup Backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m scripts.seed_kb

# 3. Setup Frontend
cd frontend
pnpm install
```

### Running the Arena

```bash
# Terminal 1: API Backend
uvicorn src.api.main:app --port 8000

# Terminal 2: Tactical UI
cd frontend && pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to start your first campaign.

## Documentation

- [Quickstart Guide](docs/quickstart.md)
- [Architecture & Design](docs/architecture.md)
- [API Reference](docs/api-reference.md)
- [Configuration Guide](docs/configuration.md)

## License

MIT - See [LICENSE](LICENSE) for details.
