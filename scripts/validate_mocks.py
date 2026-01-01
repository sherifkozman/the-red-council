# scripts/validate_mocks.py

import json
import sys
import os

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.core.schemas import JudgeScore


def validate_mocks():
    print("Validating src/mocks/responses.json...")

    try:
        with open("src/mocks/responses.json", "r") as f:
            data = json.load(f)

        scenarios = data.get("scenarios", {})
        if not scenarios:
            print("❌ No scenarios found!")
            sys.exit(1)

        for name, scenario in scenarios.items():
            print(f"  Checking scenario: {name}")

            # Check Judge Evaluations
            evals = scenario.get("judge", {}).get("evaluations", {})
            for case, eval_data in evals.items():
                try:
                    JudgeScore(**eval_data)
                    print(f"    ✅ Judge evaluation ({case}) valid")
                except Exception as e:
                    print(f"    ❌ Judge evaluation ({case}) INVALID: {e}")
                    sys.exit(1)

            # Check Defender (Ad-hoc schema)
            defender = scenario.get("defender", {})
            if "hardened_system_prompt" not in defender:
                print("    ❌ Defender missing hardened_system_prompt")
                sys.exit(1)

        print("All mocks valid.")

    except Exception as e:
        print(f"❌ Validation failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    validate_mocks()
