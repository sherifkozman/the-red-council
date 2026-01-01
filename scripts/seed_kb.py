# scripts/seed_kb.py

import sys
import os
import hashlib

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.knowledge.attack_kb import AttackKnowledgeBase
from src.knowledge.seed_data import SEED_ATTACKS
from src.knowledge.taxonomy import AttackArtifact


def generate_stable_id(attack: AttackArtifact) -> str:
    """Content-based ID to ensure idempotency."""
    content = f"{attack.prompt_template}:{attack.technique.value}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def main():
    print("Initializing Knowledge Base...")
    # NOTE: persist_directory defaults to ./data/chroma_db
    kb = AttackKnowledgeBase()

    print(f"Seeding {len(SEED_ATTACKS)} curated attacks...")
    for attack in SEED_ATTACKS:
        try:
            # Overwrite ID with stable ID
            attack.id = generate_stable_id(attack)

            # Check if exists (simple way: just add, Chroma upserts by ID)
            kb.add(attack)
            print(f"  [+] Upserted {attack.id} ({attack.technique.value})")
        except Exception as e:
            print(f"  [-] Failed to add {attack.id}: {e}")

    print("Seeding complete.")

    # Verification query
    print("\nVerifying retrieval (sync query for script)...")
    # Using private sync method for script verification
    results = kb._query_sync("Ignore instructions", k=1)
    if results:
        print(
            f"  Query 'Ignore instructions' -> Found: {results[0].artifact.id} (Score: {results[0].score:.4f})"
        )
    else:
        print("  Query failed to retrieve anything.")


if __name__ == "__main__":
    main()
