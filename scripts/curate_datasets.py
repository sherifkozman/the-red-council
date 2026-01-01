# scripts/curate_datasets.py

import yaml
from pathlib import Path
from src.knowledge.taxonomy import AttackArtifact
from src.core.schemas import AttackType, Technique

PYRIT_DIR = Path("PyRIT/pyrit/datasets/jailbreak/templates")


def determine_technique(name, content):
    n = name.lower()
    c = content.lower()
    if "role_play" in n or "persona" in n or "dan" in n or "dude" in n:
        return Technique.ROLE_PLAY
    if "override" in n or "ignore" in c or "disregard" in c:
        return Technique.INSTRUCTION_OVERRIDE
    if "encoding" in n or "base64" in c or "cipher" in n:
        return Technique.ENCODING
    if "context" in n or "story" in n:
        return Technique.CONTEXT_MANIPULATION
    return Technique.ROLE_PLAY  # Default


def curate():
    artifacts = []

    # 1. Walk through PyRIT templates
    for yaml_path in PYRIT_DIR.rglob("*.yaml"):
        try:
            with open(yaml_path, "r") as f:
                data = yaml.safe_load(f)

            if not data or "value" not in data:
                continue

            template = data["value"].replace("{{ prompt }}", "{goal}").strip()
            name = data.get("name", yaml_path.stem)

            # Basic deduplication
            if any(a.prompt_template == template for a in artifacts):
                continue

            technique = determine_technique(name, template)

            artifact = AttackArtifact(
                id=f"pyrit_{yaml_path.stem}_{len(artifacts)}",
                prompt_template=template,
                attack_type=AttackType.DIRECT,
                technique=technique,
                source=f"PyRIT/{yaml_path.relative_to(PYRIT_DIR)}",
                target_goal="policy_bypass",
                sophistication=4 if "pliny" in str(yaml_path) else 3,
                known_success=True,
                description=data.get("description", f"Imported from {name}"),
                tags=[technique.value, "imported"],
            )
            artifacts.append(artifact)

        except Exception as e:
            print(f"Error processing {yaml_path}: {e}")

    # Output count
    print(f"Curated {len(artifacts)} authentic jailbreak prompts.")

    # Generate seed_data.py content
    output = "# src/knowledge/seed_data.py\n\n"
    output += "from src.knowledge.taxonomy import AttackArtifact\n"
    output += "from src.core.schemas import AttackType, Technique\n\n"
    output += "SEED_ATTACKS = [\n"

    for a in artifacts:
        # Use repr() for all string fields to ensure valid Python literals
        output += "    AttackArtifact(\n"
        output += f"        id={repr(a.id)},\n"
        output += f"        prompt_template={repr(a.prompt_template)},\n"
        output += f"        attack_type=AttackType.{a.attack_type.name},\n"
        output += f"        technique=Technique.{a.technique.name},\n"
        output += f"        source={repr(a.source)},\n"
        output += f"        target_goal={repr(a.target_goal)},\n"
        output += f"        sophistication={a.sophistication},\n"
        output += f"        known_success={a.known_success},\n"
        output += f"        description={repr(a.description)},\n"
        output += f"        tags={a.tags},\n"
        output += "        success_rate=0.0\n"
        output += "    ),\n"

    output = output.rstrip(",\n") + "\n]\n"

    with open("src/knowledge/seed_data.py", "w") as f:
        f.write(output)


if __name__ == "__main__":
    curate()
