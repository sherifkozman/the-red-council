import pytest
from unittest.mock import MagicMock, patch, call
from src.core.agent_schemas import (
    AgentJudgeScore,
    ViolationResult,
    DivergenceEvent,
    AgentEvent,
)
from src.core.owasp_agentic import OWASPAgenticRisk
from src.core.schemas import JudgeScore
from src.ui.components.owasp_coverage import render_owasp_coverage


@pytest.fixture
def mock_judge_score():
    return JudgeScore(
        score=8.0, reasoning="Good", leaked_secret=False, leaked_instructions=False
    )


@pytest.fixture
def sample_score(mock_judge_score):
    return AgentJudgeScore(
        base_score=mock_judge_score,
        owasp_violations=(
            ViolationResult(
                detected=True,
                severity=8,
                evidence="Agent exceeded tool limits",
                recommendation="Limit tool calls",
                owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY,
            ),
            ViolationResult(
                detected=False,
                severity=1,
                evidence="No issue",
                recommendation="",
                owasp_category=OWASPAgenticRisk.ASI02_INADEQUATE_HUMAN_OVERSIGHT,
            ),
        ),
        tool_abuse_score=9.0,
        tool_abuse_details="Minor issue",
        memory_safety_score=10.0,
        memory_safety_details="Safe",
        divergence_count=0,
        overall_agent_risk=2.0,
    )


@patch("src.ui.components.owasp_coverage.st")
def test_render_owasp_coverage_structure(mock_st, sample_score):
    """Test that the coverage grid structure is created correctly."""
    # Setup mocks for context managers
    mock_cols = [MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock()]
    mock_st.columns.return_value = mock_cols

    # Setup expander mock
    mock_expander = MagicMock()
    mock_st.expander.return_value.__enter__.return_value = mock_expander

    render_owasp_coverage(sample_score)

    # Check subheader
    mock_st.subheader.assert_called_with("OWASP Agentic Top 10 Coverage")

    # Check that 2 rows of 5 columns were created
    assert mock_st.columns.call_count == 2
    mock_st.columns.assert_called_with(5)


@patch("src.ui.components.owasp_coverage.st")
def test_render_owasp_coverage_content(mock_st, sample_score):
    """Test that content is rendered correctly for different statuses."""
    # Capture the expander labels to verify status indicators
    expander_labels = []

    def mock_expander(label):
        expander_labels.append(label)
        return MagicMock()

    mock_st.expander.side_effect = mock_expander
    mock_st.columns.return_value = [MagicMock() for _ in range(5)]

    render_owasp_coverage(sample_score)

    # ASI01 is detected -> Red
    assert "🔴 ASI01" in expander_labels[0]

    # ASI02 is not detected -> Green
    assert "🟢 ASI02" in expander_labels[1]

    # ASI03-ASI10 are missing -> Gray (Not Tested)
    assert "⚪ ASI03" in expander_labels[2]
    assert "⚪ ASI10" in expander_labels[9]


@patch("src.ui.components.owasp_coverage.st")
def test_render_owasp_coverage_details(mock_st, sample_score):
    """Test that details are rendered inside the expander."""
    mock_context = MagicMock()
    mock_st.expander.return_value.__enter__.return_value = mock_context
    mock_st.columns.return_value = [MagicMock() for _ in range(5)]

    render_owasp_coverage(sample_score)

    # Verify we wrote the status (using st.caption)
    assert mock_st.caption.call_count >= 10

    # Verify we wrote description using st.text
    # We expect 10 descriptions (one per risk) + potentially remediation texts
    # But here we assume 10 risks rendered.
    assert mock_st.text.call_count >= 10

    # Verify we wrote evidence using st.code
    evidence_found = False
    for call_args in mock_st.code.call_args_list:
        args, _ = call_args
        if "Agent exceeded tool limits" in args[0]:
            evidence_found = True
            break
    assert evidence_found, "Evidence for ASI01 not found in st.code calls"

    # Verify we wrote recommendation using st.text
    recommendation_found = False
    for call_args in mock_st.text.call_args_list:
        args, _ = call_args
        if "Limit tool calls" in args[0]:
            recommendation_found = True
            break
    assert recommendation_found, "Recommendation for ASI01 not found in st.text calls"


@patch("src.ui.components.owasp_coverage.st")
def test_render_owasp_coverage_fallback(mock_st, sample_score):
    """Test that it falls back to text list if grid rendering fails."""
    # Force st.columns to raise an exception
    mock_st.columns.side_effect = Exception("Layout Error")

    render_owasp_coverage(sample_score)

    # Should show error (updated message)
    mock_st.error.assert_called_with(
        "Error rendering OWASP grid. Switching to list view."
    )

    # Should still show expanders (fallback path)
    assert mock_st.expander.call_count == 10

    # Verify fallback content (check if it rendered ASI01 evidence)
    evidence_found = False
    for call_args in mock_st.code.call_args_list:
        args, _ = call_args
        if "Agent exceeded tool limits" in args[0]:
            evidence_found = True
            break

    assert evidence_found, "Evidence for ASI01 not found in fallback"


@patch("src.ui.components.owasp_coverage.st")
def test_render_owasp_coverage_data_validation(mock_st, sample_score):
    """Test that invalid data triggers warnings/errors."""
    # Case 1: None score
    render_owasp_coverage(None)
    mock_st.warning.assert_called_with("No score data available")

    # Case 2: Invalid violations type (mock object with list attribute)
    bad_score = MagicMock()
    bad_score.owasp_violations = "not a list"
    render_owasp_coverage(bad_score)
    # Check that error was called
    args, _ = mock_st.error.call_args
    assert "Invalid violation data format" in args[0]


@patch("src.ui.components.owasp_coverage.st")
def test_render_owasp_coverage_orphans(mock_st, sample_score):
    """Test detection of orphaned violations (unknown category)."""
    # Create an orphan violation
    orphan = MagicMock()
    orphan.owasp_category = "UNKNOWN_CATEGORY"
    orphan.detected = True
    orphan.evidence = "Some evidence"

    # Modify sample score to include orphan
    violations = list(sample_score.owasp_violations)
    violations.append(orphan)

    # We need to mock sample_score.owasp_violations to be this list
    # But sample_score is a Pydantic model (immutable/frozen config)
    # So we create a new one or mock it
    mock_score = MagicMock()
    mock_score.owasp_violations = violations

    # We need to mock st.expander context for the orphan section
    mock_expander = MagicMock()
    mock_st.expander.return_value.__enter__.return_value = mock_expander

    render_owasp_coverage(mock_score)

    # Should verify that error/warning about orphans was shown
    found_orphan_msg = False
    for call_args in mock_st.error.call_args_list:
        args, _ = call_args
        if "violations have invalid categories" in args[0]:
            found_orphan_msg = True
            break

    assert found_orphan_msg, "Orphan warning not found"


@patch("src.ui.components.owasp_coverage.st")
def test_render_owasp_coverage_warning_state(mock_st, mock_judge_score):
    """Test that low-severity detections show yellow/warning state."""
    # Create score with low-severity violation (severity 1-3 = warning)
    low_sev_score = AgentJudgeScore(
        base_score=mock_judge_score,
        owasp_violations=(
            ViolationResult(
                detected=True,
                severity=2,  # Low severity = warning state
                evidence="Minor tool usage issue",
                recommendation="Monitor tool usage",
                owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY,
            ),
        ),
        tool_abuse_score=9.0,
        tool_abuse_details="Minor issue",
        memory_safety_score=10.0,
        memory_safety_details="Safe",
        divergence_count=0,
        overall_agent_risk=1.0,
    )

    expander_labels = []

    def mock_expander(label):
        expander_labels.append(label)
        return MagicMock()

    mock_st.expander.side_effect = mock_expander
    mock_st.columns.return_value = [MagicMock() for _ in range(5)]

    render_owasp_coverage(low_sev_score)

    # ASI01 has low-severity detection -> Yellow/Warning
    assert "🟡 ASI01" in expander_labels[0], (
        f"Expected yellow for low-severity, got: {expander_labels[0]}"
    )
