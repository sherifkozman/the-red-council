# tests/test_config_loader.py

import pytest
import os
from pathlib import Path
from src.config.loader import load_config, _parse_env_vars
from src.config.models import ArenaConfig


def test_load_config_defaults():
    """Test that load_config returns valid ArenaConfig even with no files."""
    config = load_config()
    assert isinstance(config, ArenaConfig)
    assert config.attacker.provider == "gemini_default"


def test_parse_env_vars(monkeypatch):
    """Test environment variable parsing."""
    monkeypatch.setenv("RC_ATTACKER__TEMPERATURE", "0.5")
    monkeypatch.setenv("RC_PROVIDERS__OPENAI__MODEL", "gpt-4o")

    env_data = _parse_env_vars()

    assert env_data["attacker"]["temperature"] == 0.5
    assert env_data["providers"]["openai"]["model"] == "gpt-4o"


def test_load_config_with_env_override(monkeypatch):
    """Test that environment variables override defaults."""
    monkeypatch.setenv("RC_ATTACKER__TEMPERATURE", "0.1")
    config = load_config()
    assert config.attacker.temperature == 0.1
