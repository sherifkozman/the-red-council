import streamlit as st
import html
import logging
from typing import Dict, Optional, List, Union
from src.core.agent_schemas import AgentJudgeScore, ViolationResult
from src.core.owasp_agentic import OWASPAgenticRisk

logger = logging.getLogger(__name__)

# Sort once at module level for performance
# Assumption: OWASPAgenticRisk enum is static and safe. 
_ALL_RISKS_SORTED = sorted(list(OWASPAgenticRisk), key=lambda x: x.value)


def render_owasp_coverage(score: AgentJudgeScore) -> None:
    """
    Render a grid showing OWASP Agentic Top 10+ coverage (5 columns per row).

    Args:
        score: The AgentJudgeScore containing violation results.
    """
    # Validation 1: Check score structure
    if not score:
        st.warning("No score data available")
        return

    violations_raw = getattr(score, "owasp_violations", None)
    if violations_raw is None:
        st.warning("No OWASP violation data available")
        return

    if not isinstance(violations_raw, (list, tuple)):
        vtype = type(violations_raw)
        st.error(f"Invalid violation data format: expected list/tuple, got {vtype}")
        logger.error("Invalid violation data format: %s", vtype)
        return

    st.subheader("OWASP Agentic Top 10 Coverage")

    # Map violations for O(1) lookup
    violations_map: Dict[Union[OWASPAgenticRisk, None], List[ViolationResult]] = {}
    valid_risk_set = set(OWASPAgenticRisk)

    for v in violations_raw:
        # Validation 2: Check violation object validity
        if not hasattr(v, "owasp_category") or not hasattr(v, "detected"):
            logger.warning(f"Skipping invalid violation object: {v}")
            continue

        cat = v.owasp_category

        # Validation 3: Check category validity
        if cat not in valid_risk_set:
            logger.warning(f"Violation has invalid/unknown category: {cat}")
            # Map to None to track as orphan
            if None not in violations_map:
                violations_map[None] = []
            violations_map[None].append(v)
            continue

        if cat not in violations_map:
            violations_map[cat] = []
        violations_map[cat].append(v)

    # Check for orphans (categories not in the official enum list)
    if None in violations_map and violations_map[None]:
        orphan_count = len(violations_map[None])
        st.error(f"⚠️ {orphan_count} violations have invalid categories (not shown in grid).")
        with st.expander("Show Invalid/Orphan Violations"):
            for orphan in violations_map[None]:
                st.text(f"Category: {orphan.owasp_category}")
                st.text(f"Detected: {orphan.detected}")
                if hasattr(orphan, 'evidence') and orphan.evidence:
                    st.code(orphan.evidence, language="text", wrap_lines=True)
                st.divider()

    # Dynamic grid layout
    try:
        chunk_size = 5
        for i in range(0, len(_ALL_RISKS_SORTED), chunk_size):
            row_risks = _ALL_RISKS_SORTED[i : i + chunk_size]

            # Always use 5 columns to maintain grid alignment
            cols = st.columns(5)

            for j, risk in enumerate(row_risks):
                with cols[j]:
                    _render_risk_content(risk, violations_map.get(risk, []))

    except Exception as e:
        # Catch errors but don't swallow completely - surfacing generic msg
        logger.exception(f"Error in OWASP grid: {e}")
        st.error("Error rendering OWASP grid. Switching to list view.")
        _render_text_fallback(violations_map)


def _render_text_fallback(
    violations_map: Dict[Union[OWASPAgenticRisk, None], List[ViolationResult]],
) -> None:
    """Fallback text-based rendering."""
    for risk in _ALL_RISKS_SORTED:
        _render_risk_content(risk, violations_map.get(risk, []))


def _render_risk_content(
    risk: OWASPAgenticRisk, violations: List[ViolationResult]
) -> None:
    """Render the content for a risk (used by both grid and fallback)."""

    detected_violations = []
    invalid_severity_count = 0
    
    # Filter detected violations
    for v in violations:
        if v.detected:
            # Validation 4: Severity type check
            try:
                if isinstance(v.severity, (int, float)):
                    detected_violations.append(v)
                else:
                    invalid_severity_count += 1
                    logger.warning(
                        f"Violation has invalid severity type: {type(v.severity)} - {v}"
                    )
            except Exception:
                invalid_severity_count += 1
                logger.warning(f"Error checking severity for violation: {v}")

    # Sort only detected violations by severity (descending)
    detected_violations.sort(key=lambda x: x.severity, reverse=True)

    has_detections = len(detected_violations) > 0
    has_tests = len(violations) > 0

    # Threshold: Low severity (1-3) = warning, High severity (4+) = detected
    WARNING_SEVERITY_THRESHOLD = 4

    if not has_tests:
        status_icon = "⚪"
        status_text = "NOT TESTED"
    elif has_detections:
        # Use max severity to determine warning vs detected
        max_severity = max(v.severity for v in detected_violations)
        if max_severity < WARNING_SEVERITY_THRESHOLD:
            status_icon = "🟡"
            status_text = "WARNING"
        else:
            status_icon = "🔴"
            status_text = "DETECTED"
    else:
        status_icon = "🟢"
        status_text = "PASSED"

    # Header with status icon and code (safe as risk.value is enum)
    safe_header = f"{status_icon} {html.escape(str(risk.value))}"

    # Using expander as the "card"
    with st.expander(safe_header):
        # Use st.text for description to avoid Markdown injection
        desc = getattr(risk, "description", "").strip()
        if desc:
            st.text(desc)

        st.divider()
        st.caption(f"Status: **{status_text}**")
        
        if invalid_severity_count > 0:
            st.warning(f"⚠️ {invalid_severity_count} detected violations excluded due to invalid severity.")

        if not has_tests:
            st.markdown("*Test not run for this category.*")
            return

        if not has_detections:
            st.markdown("*No violations detected.*")
            return

        # Render each detected violation
        st.markdown(f"**{len(detected_violations)} Violation(s) Detected:**")

        for idx, v in enumerate(detected_violations):
            if idx > 0:
                st.divider()

            st.markdown(f"**Severity:** {v.severity}/10")

            if v.evidence:
                st.markdown("**Evidence:**")
                st.code(v.evidence, language="text", wrap_lines=True)

            if v.recommendation:
                st.markdown("**Remediation:**")
                st.text(v.recommendation)