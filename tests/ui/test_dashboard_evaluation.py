import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from src.ui.dashboard import run_agent_evaluation
from src.ui.components.mode_selector import AGENT_EVENTS_KEY, AGENT_SCORE_KEY, AGENT_CONFIG_KEY
from src.core.agent_schemas import AgentInstrumentationConfig, AgentJudgeScore, AgentEvent

@pytest.fixture
def mock_streamlit():
    with patch("src.ui.dashboard.st") as mock_st:
        mock_st.session_state = {}
        mock_st.spinner = MagicMock()
        mock_st.success = MagicMock()
        mock_st.warning = MagicMock()
        mock_st.error = MagicMock()
        yield mock_st

@pytest.fixture
def mock_gemini_client():
    with patch("src.ui.dashboard.GeminiClient") as mock_client:
        yield mock_client

@pytest.fixture
def mock_judge_agent():
    with patch("src.ui.dashboard.JudgeAgent") as mock_judge:
        yield mock_judge

@pytest.fixture
def mock_agent_judge():
    with patch("src.ui.dashboard.AgentJudge") as mock_agent_judge:
        instance = mock_agent_judge.return_value
        instance.evaluate_agent_async = AsyncMock()
        yield mock_agent_judge

@pytest.mark.asyncio
async def test_run_agent_evaluation_no_events(mock_streamlit):
    """Test that evaluation stops if no events are present."""
    mock_streamlit.session_state[AGENT_EVENTS_KEY] = []
    
    await run_agent_evaluation()
    
    mock_streamlit.warning.assert_called_with("No events to evaluate.")
    assert AGENT_SCORE_KEY not in mock_streamlit.session_state or mock_streamlit.session_state[AGENT_SCORE_KEY] is None

@pytest.mark.asyncio
async def test_run_agent_evaluation_success(
    mock_streamlit, mock_gemini_client, mock_judge_agent, mock_agent_judge
):
    """Test successful evaluation run."""
    # Setup state
    events = [MagicMock(spec=AgentEvent)]
    mock_streamlit.session_state[AGENT_EVENTS_KEY] = events
    
    # Setup user config
    user_config = AgentInstrumentationConfig(max_events=123)
    mock_streamlit.session_state[AGENT_CONFIG_KEY] = user_config
    
    # Setup mock return
    expected_score = MagicMock(spec=AgentJudgeScore)
    mock_agent_judge.return_value.evaluate_agent_async.return_value = expected_score
    
    await run_agent_evaluation()
    
    # Verify AgentJudge was initialized (check if config is passed correctly if we fix it)
    mock_agent_judge.assert_called()
    
    # Verify evaluation called with events
    mock_agent_judge.return_value.evaluate_agent_async.assert_called_with(events)
    
    # Verify results stored
    assert mock_streamlit.session_state[AGENT_SCORE_KEY] == expected_score
    mock_streamlit.success.assert_called_with("Evaluation complete!")

@pytest.mark.asyncio
async def test_run_agent_evaluation_failure(
    mock_streamlit, mock_gemini_client, mock_judge_agent, mock_agent_judge
):
    """Test evaluation failure handling."""
    mock_streamlit.session_state[AGENT_EVENTS_KEY] = [MagicMock(spec=AgentEvent)]
    
    # Mock exception
    mock_agent_judge.return_value.evaluate_agent_async.side_effect = Exception("API Error")
    
    await run_agent_evaluation()
    
    mock_streamlit.error.assert_called_with("Evaluation failed: API Error")
    assert AGENT_SCORE_KEY not in mock_streamlit.session_state or mock_streamlit.session_state[AGENT_SCORE_KEY] is None
