# tests/conftest.py

import pytest
import shutil
from pathlib import Path
from src.knowledge.attack_kb import AttackKnowledgeBase

@pytest.fixture
def ephemeral_kb(tmp_path):
    """
    Creates an isolated, temporary ChromaDB instance for each test.
    """
    db_path = tmp_path / "test_chroma"
    db_path.mkdir()
    kb = AttackKnowledgeBase(persist_directory=str(db_path))
    yield kb
    # tmp_path is automatically cleaned up by pytest
