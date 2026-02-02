import logging
import threading
from typing import List, Optional
from functools import lru_cache

from torch import Tensor
from sentence_transformers import SentenceTransformer, util # type: ignore

from src.core.agent_schemas import (
    ActionRecord,
    DivergenceEvent,
    DivergenceSeverity,
    AgentInstrumentationConfig
)

logger = logging.getLogger(__name__)

# Constants
SAFE_EMBEDDING_MODEL = "all-MiniLM-L6-v2"
MAX_CACHE_SIZE = 1000
MAX_INPUT_LENGTH = 1000 # Truncate inputs to prevent DoS/Cache poisoning

# Thread-safe singleton for the model
_MODEL_LOCK = threading.RLock()
_GLOBAL_MODEL: Optional[SentenceTransformer] = None

def _get_model() -> SentenceTransformer:
    """
    Get or load the global model instance thread-safely.
    Raises RuntimeError if model cannot be loaded.
    """
    global _GLOBAL_MODEL
    with _MODEL_LOCK:
        if _GLOBAL_MODEL is None:
            try:
                logger.info(f"Loading embedding model: {SAFE_EMBEDDING_MODEL}")
                _GLOBAL_MODEL = SentenceTransformer(SAFE_EMBEDDING_MODEL)
            except Exception as e:
                # Sanitize error log to avoid leaking sensitive info
                logger.critical(f"FATAL: Failed to load embedding model: {type(e).__name__}")
                raise RuntimeError(f"Embedding model unavailable") from e
        return _GLOBAL_MODEL

def _reset_model() -> None:
    """Reset the global model (for testing)."""
    global _GLOBAL_MODEL
    with _MODEL_LOCK:
        _GLOBAL_MODEL = None
        _cached_encode.cache_clear()

@lru_cache(maxsize=MAX_CACHE_SIZE)
def _cached_encode(text: str) -> Tensor:
    """
    Compute embedding with caching. Returns PyTorch Tensor.
    Raises RuntimeError if model unavailable or encoding fails.
    """
    # Note: text is assumed to be truncated by caller for security/performance
    model = _get_model() # May raise RuntimeError
    try:
        return model.encode(text, convert_to_tensor=True)
    except Exception as e:
        logger.error(f"Encoding failed: {type(e).__name__}")
        raise RuntimeError(f"Encoding failed") from e

class DivergenceDetector:
    """
    Detects divergence between agent speech and actions using semantic similarity.
    
    SECURITY NOTE: This class provides detection logic only. It does NOT enforce
    access control or authorization. Callers must ensure that the 'speech' and
    'action' data come from authenticated sources and that the caller is authorized
    to perform this analysis.
    """
    def __init__(self, config: Optional[AgentInstrumentationConfig] = None):
        self.config = config or AgentInstrumentationConfig()
        # Eager load the model (may raise RuntimeError if model unavailable)
        try:
            _get_model()
        except RuntimeError as e:
            logger.warning(f"DivergenceDetector initialized without model: {e}")

    def analyze_divergence(self, speech: str, action: ActionRecord) -> Optional[DivergenceEvent]:
        """
        Analyze if the action diverges from the speech.
        
        Args:
            speech: What the agent said.
            action: What the agent did.
            
        Returns:
            DivergenceEvent if divergence detected, None otherwise.
        """
        if not speech or not action or not action.description:
            return None
            
        # Strip whitespace and truncate to prevent DoS
        speech_text = speech.strip()[:MAX_INPUT_LENGTH]
        action_desc = action.description.strip()[:MAX_INPUT_LENGTH]
        
        if not speech_text or not action_desc:
            return None

        try:
            # Check for exact match (fast path)
            if speech_text == action_desc:
                return None
                
            similarity = self._calculate_similarity(speech_text, action_desc)

            # Check threshold FIRST
            # config.divergence_threshold acts as a MINIMUM SIMILARITY THRESHOLD.
            # If similarity >= threshold, we consider it a match (ignore divergence).
            if similarity >= self.config.divergence_threshold:
                return None

            # Determine severity based on buckets
            if similarity < 0.3:
                severity = DivergenceSeverity.HIGH
            elif similarity < 0.5:
                severity = DivergenceSeverity.MEDIUM
            else:
                # similarity is between 0.5 and threshold (e.g. 0.8)
                severity = DivergenceSeverity.LOW

            # Clamp confidence to [0, 1]
            clamped_sim = max(0.0, min(1.0, similarity))
            confidence = round(1.0 - clamped_sim, 2)

            return DivergenceEvent(
                session_id=action.session_id,
                speech_intent=speech_text,
                actual_action=action_desc,
                severity=severity,
                explanation=f"Detected divergence with similarity score {similarity:.2f}",
                confidence_score=confidence
            )

        except Exception as e:
            # If embedding fails (RuntimeError) or other error, fallback to heuristic
            logger.error(f"Divergence analysis failed (using fallback): {type(e).__name__}")
            return self._heuristic_check(speech_text, action)

    def batch_analyze(self, speeches: List[str], actions: List[ActionRecord]) -> List[DivergenceEvent]:
        """
        Analyze a batch of speech-action pairs.
        """
        results = []
        limit = min(len(speeches), len(actions))
        
        if len(speeches) != len(actions):
            logger.warning(
                f"Batch analyze mismatched lengths: {len(speeches)} speeches, {len(actions)} actions. "
                f"Truncating to {limit}."
            )

        for i in range(limit):
            result = self.analyze_divergence(speeches[i], actions[i])
            if result:
                results.append(result)
        return results

    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate cosine similarity between two texts.
        Raises RuntimeError if embeddings cannot be computed.
        """
        emb1 = _cached_encode(text1)
        emb2 = _cached_encode(text2)
        
        try:
            score_tensor = util.cos_sim(emb1, emb2)
            # Simplification: use .item()
            return float(score_tensor.item())
        except Exception as e:
            raise RuntimeError(f"Cosine similarity calculation failed") from e

    def _heuristic_check(self, speech: str, action: ActionRecord) -> Optional[DivergenceEvent]:
        """Fallback keyword-based divergence detection."""
        # Simple negation check
        speech_lower = speech.lower()
        
        # Heuristic: Speech claims inaction, but action occurred
        # Expanded triggers
        triggers = ["will not", "won't", "do nothing", "cancel", "stop", "refrain", "abort"]
        
        if any(phrase in speech_lower for phrase in triggers):
            return DivergenceEvent(
                session_id=action.session_id,
                speech_intent=speech,
                actual_action=action.description,
                severity=DivergenceSeverity.HIGH,
                explanation="Heuristic Fallback: Speech implies inaction but action occurred (Embedding model unavailable)",
                confidence_score=0.5
            )
            
        return None