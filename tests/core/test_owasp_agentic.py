import pytest
from pydantic import ValidationError
from src.core.owasp_agentic import OWASPAgenticRisk, AgenticRiskCriteria, Severity, _CRITERIA_MAP

def test_owasp_enum_completeness():
    """Verify all 10 ASI categories are defined."""
    assert len(OWASPAgenticRisk) == 10
    assert OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY.value == "ASI01"
    assert OWASPAgenticRisk.ASI10_OVER_TRUST_IN_LLMS.value == "ASI10"

def test_criteria_map_completeness():
    """Verify 1:1 mapping between Enum and Criteria Map."""
    # Ensure every Enum member has a criteria entry
    for risk in OWASPAgenticRisk:
        assert risk.value in _CRITERIA_MAP, f"Missing criteria for {risk.name}"
    
    # Ensure every Map entry corresponds to an Enum member
    enum_values = {r.value for r in OWASPAgenticRisk}
    for code in _CRITERIA_MAP:
        assert code in enum_values, f"Criteria map has extra entry: {code}"

@pytest.mark.parametrize("risk_enum", list(OWASPAgenticRisk))
def test_risk_criteria_structure(risk_enum):
    """Verify each risk has valid criteria defined."""
    criteria = risk_enum.get_criteria()
    assert isinstance(criteria, AgenticRiskCriteria)
    # risk_code removed from model to reduce redundancy
    assert len(criteria.description) > 10
    assert len(criteria.detection_indicators) > 0
    assert isinstance(criteria.severity, Severity)
    assert isinstance(criteria.detection_indicators, tuple)
    assert criteria.owasp_version == "2025-draft"

def test_severity_ordering():
    """Verify logical ordering of Severity IntEnum."""
    assert Severity.CRITICAL > Severity.HIGH
    assert Severity.HIGH > Severity.MEDIUM
    assert Severity.MEDIUM > Severity.LOW
    assert Severity.CRITICAL > Severity.LOW

def test_map_immutability():
    """Verify _CRITERIA_MAP cannot be modified."""
    with pytest.raises(TypeError):
        _CRITERIA_MAP["ASI01"] = None # type: ignore

def test_criteria_immutability():
    """Verify AgenticRiskCriteria is frozen."""
    criteria = OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY.get_criteria()
    # Pydantic v2 frozen models raise ValidationError on assignment
    with pytest.raises(ValidationError):
        criteria.description = "New description" # type: ignore
        
    # Verify tuple is immutable (AttributeError)
    with pytest.raises(AttributeError):
        criteria.detection_indicators.append("New indicator") # type: ignore

def test_validators():
    """Verify input validation."""
    with pytest.raises(ValidationError):
        AgenticRiskCriteria(
            description="Too short", 
            detection_indicators=("valid",),
            severity=Severity.LOW
        )
    
    with pytest.raises(ValidationError):
        AgenticRiskCriteria(
            description="Long enough description here", 
            detection_indicators=(), # Empty
            severity=Severity.LOW
        )

    with pytest.raises(ValidationError):
        AgenticRiskCriteria(
            description="Long enough description here", 
            detection_indicators=("",), # Whitespace
            severity=Severity.LOW
        )
        
    # Resource limits
    with pytest.raises(ValidationError):
        AgenticRiskCriteria(
            description="A" * 1001, # Too long
            detection_indicators=("valid",),
            severity=Severity.LOW
        )
        
    # Deduplication
    with pytest.raises(ValidationError):
        AgenticRiskCriteria(
            description="Long enough description here",
            detection_indicators=("duplicate", "duplicate"),
            severity=Severity.LOW
        )

def test_specific_risk_definitions():
    """Spot check specific definitions to ensure accuracy."""
    asi01 = OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY.get_criteria()
    assert "Excessive Agency" in asi01.description
    assert any("usage loops" in i for i in asi01.detection_indicators)
    assert asi01.severity == Severity.HIGH

    asi04 = OWASPAgenticRisk.ASI04_INDIRECT_PROMPT_INJECTION.get_criteria()
    assert "Indirect Prompt Injection" in asi04.description
    assert asi04.severity == Severity.CRITICAL
