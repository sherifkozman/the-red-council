# src/config/loader.py

import os
import yaml
import json
from pathlib import Path
from typing import Any, Dict, Optional
from src.config.defaults import DEFAULT_ARENA_CONFIG
from src.config.models import ArenaConfig


class ConfigurationError(Exception):
    pass


def load_config(path: Optional[str] = None) -> ArenaConfig:
    """
    Load arena configuration from file or return defaults.
    """
    # 1. Start with defaults
    config_dict = DEFAULT_ARENA_CONFIG.model_dump()

    # 2. Merge YAML if exists
    if path:
        config_path = Path(path)
        if config_path.exists():
            try:
                content = config_path.read_text(encoding="utf-8")
                if config_path.suffix in (".yaml", ".yml"):
                    file_data = yaml.safe_load(content)
                elif config_path.suffix == ".json":
                    file_data = json.loads(content)
                else:
                    raise ConfigurationError("Unsupported config format")

                if file_data:
                    _deep_merge(config_dict, file_data)
            except Exception as e:
                raise ConfigurationError(f"Failed to load config file: {e}")

    # 3. Merge Env Vars (RC_*)
    env_config = _parse_env_vars()
    _deep_merge(config_dict, env_config)

    # 4. Validate
    try:
        return ArenaConfig.model_validate(config_dict)
    except Exception as e:
        raise ConfigurationError(f"Invalid configuration: {e}")


def _parse_env_vars() -> Dict[str, Any]:
    """Parse RC_* environment variables into nested dict."""
    result: Dict[str, Any] = {}
    for key, value in os.environ.items():
        if not key.startswith("RC_"):
            continue
        parts = key[3:].lower().split("__")  # Remove RC_ prefix
        current = result
        for part in parts[:-1]:
            current = current.setdefault(part, {})
        current[parts[-1]] = _parse_value(value)
    return result


def _parse_value(value: str) -> Any:
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False
    try:
        return int(value)
    except ValueError:
        pass
    try:
        return float(value)
    except ValueError:
        pass
    return value


def _deep_merge(base: Dict, update: Dict) -> None:
    for k, v in update.items():
        if isinstance(v, dict) and k in base and isinstance(base[k], dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v
