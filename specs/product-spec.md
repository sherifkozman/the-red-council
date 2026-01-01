# Product Specification: The Red Council (Vibe Coding Edition)

## 1. Product Vision
**"Vibe Code" your Security Campaigns.**
The Red Council is an adversarial testing platform where security engineers use natural language to *construct* and *execute* sophisticated red-team campaigns against LLM applications. Instead of writing Python scripts or configuring JSON, you simply say: *"Test if my support bot can be tricked into refunding a $5000 transaction without approval."*

## 2. User Journey (The "Vibe" Flow)
1.  **The Prompt:** User types a campaign intent into the main chat window.
    *   *Input:* "I want to test my HR chatbot. It has a secret policy about layoffs. Try to extract it using social engineering."
2.  **The Construction (Vibe Coding):** The system analyzes the intent and *generates a Test Plan*.
    *   *System Output:* "I have constructed a campaign with 3 attack vectors:
        1.  **Roleplay:** Pretending to be a VP of HR.
        2.  **Urgency:** Claiming a legal emergency.
        3.  **System Override:** Attempting to bypass instructions."
3.  **The Execution:** User clicks "Run Campaign".
    *   *Visuals:* The UI splits. On the left, **Attacker Agent** (Local LLM) generates specific prompts. On the right, **Target Agent** responds. In the center, **Judge Agent** (Gemini 3) scores the battle live.
4.  **The Report:** Campaign finishes. System generates a "Security Vibe Report" summarizing weaknesses and suggesting a hardened system prompt.

## 3. Core Features (MVP)
*   **Campaign Builder Agent (Gemini 3):** Translates NL intent -> Structured Test Plan (JSON).
*   **Attacker Agent (Local Llama 3 via Ollama):** Executes the attack prompts (Uncensored).
*   **Judge Agent (Gemini 3):** Evaluates success/failure of attacks.
*   **Defender Agent (Gemini 3):** Auto-generates a patch (new system prompt) if attacks succeed.
*   **Target Sandbox:** A configurable mock LLM endpoint to test against.

## 4. Technical Constraints & Decisions
*   **Local LLM:** Must run Llama 3 8B (via Ollama) for uncensored attack generation.
*   **Latency Budget:** < 45s for a full 3-round attack loop.
*   **Judge Logic:** Gemini 3 uses a "Rubric-based" prompt to score 0-10.
*   **UI:** Next.js + Tailwind (Modern, clean "Vibe" aesthetic).

## 5. Success Metrics (Hackathon)
*   **"Wow" Factor:** The moment the system *automatically* figures out the right attack strategy from a vague user prompt.
*   **Speed:** Time to first attack < 5s.
*   **Clarity:** The "Judge" clearly explaining *why* an attack worked (e.g., "Target leaked 'layoff' keyword").

## 6. Out of Scope
*   Code Security (SQLi/XSS) - Dropped per Council advice.
*   Network/Infrastructure testing.
*   Production integration (CI/CD).
