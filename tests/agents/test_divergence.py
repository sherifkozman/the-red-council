import pytest
from unittest.mock import Mock, patch
from uuid import uuid4
from datetime import datetime, timezone

from src.core.agent_schemas import (
    ActionRecord,
    DivergenceEvent,
    DivergenceSeverity,
    AgentInstrumentationConfig
)
from src.agents.divergence import DivergenceDetector, _reset_model

def utc_now():
    return datetime.now(timezone.utc)

@pytest.fixture
def mock_config():
    return AgentInstrumentationConfig(divergence_threshold=0.5)

@pytest.fixture
def action_record():
    return ActionRecord(
        session_id=uuid4(),
        action_type="file_write",
        description="Write to secret.txt",
        target="secret.txt"
    )

class TestDivergenceDetector:
    
    def setup_method(self):
        # Reset model before each test to ensure isolation
        _reset_model()

    @patch('src.agents.divergence._get_model')
    def test_init_loads_model(self, mock_get_model):
        DivergenceDetector()
        mock_get_model.assert_called_once()

    @patch('src.agents.divergence.DivergenceDetector._calculate_similarity')
    def test_analyze_divergence_high_similarity(self, mock_sim, mock_config, action_record):
        # Similarity 0.9 (Match)
        mock_sim.return_value = 0.9
        
        detector = DivergenceDetector(config=mock_config)
        event = detector.analyze_divergence("I will write to secret.txt", action_record)
        
        assert event is None

    @patch('src.agents.divergence.DivergenceDetector._calculate_similarity')
    def test_analyze_divergence_low_severity_ignored(self, mock_sim, mock_config, action_record):
        # Similarity 0.6 (LOW bucket: 0.5-0.7)
        # Threshold is 0.5, so 0.6 >= 0.5 -> Ignored
        mock_sim.return_value = 0.6
        
        detector = DivergenceDetector(config=mock_config)
        event = detector.analyze_divergence("I will do something", action_record)
        
        assert event is None

    @patch('src.agents.divergence.DivergenceDetector._calculate_similarity')
    def test_analyze_divergence_medium_severity_captured(self, mock_sim, mock_config, action_record):
        # Similarity 0.4 (MEDIUM bucket: 0.3-0.5)
        # Threshold is 0.5, so 0.4 < 0.5 -> Captured
        mock_sim.return_value = 0.4
        
        detector = DivergenceDetector(config=mock_config)
        event = detector.analyze_divergence("I will sleep", action_record)
        
        assert event is not None
        assert event.severity == DivergenceSeverity.MEDIUM
        assert event.confidence_score == 0.6

    @patch('src.agents.divergence.DivergenceDetector._calculate_similarity')
    def test_analyze_divergence_high_severity(self, mock_sim, mock_config, action_record):
        # Similarity 0.1 (HIGH bucket: < 0.3)
        mock_sim.return_value = 0.1
        
        detector = DivergenceDetector(config=mock_config)
        event = detector.analyze_divergence("I will delete the internet", action_record)
        
        assert event is not None
        assert event.severity == DivergenceSeverity.HIGH
        assert event.confidence_score == 0.9

    @patch('src.agents.divergence.DivergenceDetector._calculate_similarity')
    def test_custom_threshold(self, mock_sim, action_record):
        # Strict config: threshold 0.8
        config = AgentInstrumentationConfig(divergence_threshold=0.8)
        detector = DivergenceDetector(config=config)
        
        # Similarity 0.6 (LOW) should now be captured because 0.6 < 0.8
        mock_sim.return_value = 0.6
        
        event = detector.analyze_divergence("Something slightly different", action_record)
        assert event is not None
        assert event.severity == DivergenceSeverity.LOW

    def test_real_embedding_model_integration(self, action_record):
        # Integration test using real model
        try:
            detector = DivergenceDetector()
        except Exception:
            pytest.skip("Model loading failed")

        try:
            if detector._calculate_similarity("test", "test") is None:
                 pytest.skip("Model returned None (unexpected)")
        except RuntimeError:
             pytest.skip("Model calculation failed")

        # Case 1: High similarity
        event = detector.analyze_divergence("I am writing to secret.txt", action_record)
        assert event is None 

        # Case 2: Divergence
        event_div = detector.analyze_divergence("I will output to console", action_record)
        if event_div:
            assert event_div.event_type == "divergence"

    @patch('src.agents.divergence.DivergenceDetector._calculate_similarity')
    def test_batch_analyze(self, mock_sim, mock_config, action_record):
        mock_sim.side_effect = [0.9, 0.2]
        
        detector = DivergenceDetector(config=mock_config)
        speeches = ["match", "diverge"]
        actions = [action_record, action_record]
        
        events = detector.batch_analyze(speeches, actions)
        
        assert len(events) == 1
        assert events[0].severity == DivergenceSeverity.HIGH

    def test_input_validation(self, mock_config, action_record):
        detector = DivergenceDetector(config=mock_config)
        assert detector.analyze_divergence("", action_record) is None
        assert detector.analyze_divergence("   ", action_record) is None
        assert detector.analyze_divergence("Speech", None) is None # type: ignore

    @patch('src.agents.divergence.SentenceTransformer')
    def test_get_model_failure_raises(self, mock_cls):
        mock_cls.side_effect = Exception("Model load failed")
        _reset_model()
        
        from src.agents import divergence
        with pytest.raises(RuntimeError):
            divergence._get_model()

    @patch('src.agents.divergence._get_model')
    def test_cached_encode_failure_raises(self, mock_get_model):
        mock_model = Mock()
        mock_model.encode.side_effect = Exception("Encode failed")
        mock_get_model.return_value = mock_model
        
        from src.agents.divergence import _cached_encode
        _cached_encode.cache_clear()
        
        with pytest.raises(RuntimeError):
            _cached_encode("text")

    @patch('src.agents.divergence.DivergenceDetector._calculate_similarity')
    def test_analyze_divergence_exception_fallback(self, mock_sim, action_record):
        # If calculation fails, it should switch to heuristic
        mock_sim.side_effect = RuntimeError("Analysis failed")
        detector = DivergenceDetector()
        
        # Normal text -> Heuristic returns None -> analyze returns None
        event = detector.analyze_divergence("test", action_record)
        assert event is None

        # Text matching heuristic -> returns Event
        event_h = detector.analyze_divergence("I will not do this", action_record)
        assert event_h is not None
        assert "Heuristic" in event_h.explanation

    def test_batch_analyze_mismatch(self, action_record):
        detector = DivergenceDetector()
        speeches = ["one"]
        actions = [action_record, action_record]
        events = detector.batch_analyze(speeches, actions)
        assert len(events) <= 1

    @patch('src.agents.divergence._cached_encode')
    def test_calculate_similarity_propagates_error(self, mock_encode):
        mock_encode.side_effect = RuntimeError("Encode failed")
        detector = DivergenceDetector()
        
        with pytest.raises(RuntimeError):
            detector._calculate_similarity("a", "b")

    @patch('src.agents.divergence.DivergenceDetector._calculate_similarity')
    def test_heuristic_fallback(self, mock_sim, action_record):
        mock_sim.side_effect = RuntimeError("Model failed")
        
        detector = DivergenceDetector()
        # "I will not..." implies inaction, but action_record is "Write to secret.txt"
        event = detector.analyze_divergence("I will not do anything", action_record)
        
        assert event is not None
        assert event.explanation.startswith("Heuristic")
        assert event.severity == DivergenceSeverity.HIGH
