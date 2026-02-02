# src/ui/components/attack_selector.py
"""
Attack Template Selector component for selecting attack patterns.

This component allows security testers to select which attack templates
to run during a campaign, filtering by OWASP category or agent capabilities.

Supports:
- Filter by OWASP Agentic Top 10 categories (ASI01-ASI10)
- Filter by capability requirements (tool access, memory access)
- Template preview and selection
- Batch operations (Select All / Deselect All)
"""

import html
import logging
import re
from dataclasses import dataclass, field
from typing import Any

import streamlit as st

from src.core.owasp_agentic import OWASPAgenticRisk

logger = logging.getLogger(__name__)

# Validation patterns
VALID_TEMPLATE_ID = re.compile(r"^[a-zA-Z0-9_\-\.]{1,128}$")

# Session state keys
ATTACK_FILTER_KEY = "attack_template_filters"
SELECTED_TEMPLATES_KEY = "selected_attack_templates"
TEMPLATE_CACHE_KEY = "attack_template_cache"

# OWASP category display names
OWASP_DISPLAY_NAMES: dict[str, str] = {
    "ASI01": "ASI01 - Excessive Agency",
    "ASI02": "ASI02 - Inadequate Oversight",
    "ASI03": "ASI03 - Vulnerable Integrations",
    "ASI04": "ASI04 - Prompt Injection",
    "ASI05": "ASI05 - Improper Authorization",
    "ASI06": "ASI06 - Data Disclosure",
    "ASI07": "ASI07 - Insecure Memory",
    "ASI08": "ASI08 - Goal Misalignment",
    "ASI09": "ASI09 - Weak Guardrails",
    "ASI10": "ASI10 - Over-Trust in LLMs",
}

# Capability filter display names
CAPABILITY_NAMES: dict[str, str] = {
    "requires_tool_access": "Requires Tool Access",
    "requires_memory_access": "Requires Memory Access",
}


@dataclass
class AttackTemplateFilters:
    """Filter configuration for attack template selection."""

    # OWASP category filters (True = include this category)
    owasp_filters: dict[str, bool] = field(
        default_factory=lambda: dict.fromkeys(OWASP_DISPLAY_NAMES, True)
    )

    # Capability filters
    requires_tool_access: bool | None = None  # None = any, True/False = filter
    requires_memory_access: bool | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize filters to dictionary."""
        return {
            "owasp_filters": self.owasp_filters.copy(),
            "requires_tool_access": self.requires_tool_access,
            "requires_memory_access": self.requires_memory_access,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "AttackTemplateFilters":
        """Deserialize filters from dictionary with validation."""
        if not isinstance(data, dict):
            return cls()

        raw_owasp = data.get("owasp_filters", {})
        # Validate and normalize OWASP filters
        owasp_filters: dict[str, bool] = {}
        for code in OWASP_DISPLAY_NAMES:
            value = raw_owasp.get(code, True) if isinstance(raw_owasp, dict) else True
            owasp_filters[code] = bool(value)  # Normalize to bool

        # Validate capability filters (must be None, True, or False)
        def normalize_tri_state(v: Any) -> bool | None:
            if v is None:
                return None
            if isinstance(v, bool):
                return v
            # Coerce other types to bool
            return bool(v)

        return cls(
            owasp_filters=owasp_filters,
            requires_tool_access=normalize_tri_state(data.get("requires_tool_access")),
            requires_memory_access=normalize_tri_state(
                data.get("requires_memory_access")
            ),
        )

    def get_enabled_owasp_codes(self) -> list[str]:
        """Get list of enabled OWASP codes."""
        return [code for code, enabled in self.owasp_filters.items() if enabled]


@dataclass
class TemplatePreview:
    """Lightweight preview of an attack template for UI display."""

    id: str
    prompt_preview: str  # Truncated prompt for display
    expected_behavior: str
    severity: int
    owasp_codes: list[str]
    requires_tool_access: bool
    requires_memory_access: bool
    source: str

    @classmethod
    def from_template(cls, template: Any) -> "TemplatePreview":
        """Create preview from AgentAttackTemplate with validation.

        Args:
            template: An AgentAttackTemplate instance.

        Returns:
            TemplatePreview for UI display.

        Note:
            Input validation is applied to prevent XSS and type confusion attacks.
        """
        # Validate and sanitize template ID
        raw_id = str(getattr(template, "id", "unknown"))[:128]
        if not VALID_TEMPLATE_ID.match(raw_id):
            # Sanitize invalid IDs
            raw_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", raw_id)[:128] or "unknown"

        # Truncate prompt for preview (max 200 chars)
        prompt = str(getattr(template, "prompt_template", ""))
        prompt_preview = prompt[:200] + "..." if len(prompt) > 200 else prompt

        # Extract and validate OWASP codes
        target_owasp = getattr(template, "target_owasp", []) or []
        owasp_codes: list[str] = []
        for risk in target_owasp:
            code = getattr(risk, "value", None)
            if isinstance(code, str) and code in OWASP_DISPLAY_NAMES:
                owasp_codes.append(code)

        # Validate severity (clamp to 1-10)
        try:
            severity = int(getattr(template, "sophistication", 1))
        except (TypeError, ValueError):
            severity = 1
        severity = max(1, min(severity, 10))

        # Limit string field lengths for safety
        expected_behavior = str(getattr(template, "expected_agent_behavior", ""))[:2000]
        source = str(getattr(template, "source", "unknown"))[:100]

        return cls(
            id=raw_id,
            prompt_preview=prompt_preview,
            expected_behavior=expected_behavior,
            severity=severity,
            owasp_codes=owasp_codes,
            requires_tool_access=bool(getattr(template, "requires_tool_access", False)),
            requires_memory_access=bool(
                getattr(template, "requires_memory_access", False)
            ),
            source=source,
        )


def _get_filters() -> AttackTemplateFilters:
    """Get current filters from session state."""
    if ATTACK_FILTER_KEY not in st.session_state:
        st.session_state[ATTACK_FILTER_KEY] = AttackTemplateFilters().to_dict()

    data = st.session_state[ATTACK_FILTER_KEY]
    if isinstance(data, dict):
        return AttackTemplateFilters.from_dict(data)
    return AttackTemplateFilters()


def _save_filters(filters: AttackTemplateFilters) -> None:
    """Save filters to session state."""
    st.session_state[ATTACK_FILTER_KEY] = filters.to_dict()


def _get_selected_templates() -> set[str]:
    """Get set of selected template IDs with validation."""
    if SELECTED_TEMPLATES_KEY not in st.session_state:
        st.session_state[SELECTED_TEMPLATES_KEY] = set()

    selected = st.session_state[SELECTED_TEMPLATES_KEY]

    # Validate and normalize
    validated: set[str] = set()
    items = selected if isinstance(selected, (set, list)) else []

    for item in items:
        # Validate each ID
        if isinstance(item, str) and len(item) <= 128:
            if VALID_TEMPLATE_ID.match(item):
                validated.add(item)
            else:
                logger.warning(f"Rejected invalid template ID: {item[:50]}...")

    # Update session state with validated set
    st.session_state[SELECTED_TEMPLATES_KEY] = validated
    return validated


def _save_selected_templates(template_ids: set[str]) -> None:
    """Save selected template IDs to session state."""
    st.session_state[SELECTED_TEMPLATES_KEY] = template_ids


def _get_template_cache() -> list[TemplatePreview]:
    """Get cached template previews."""
    if TEMPLATE_CACHE_KEY not in st.session_state:
        return []

    cache = st.session_state[TEMPLATE_CACHE_KEY]
    if isinstance(cache, list):
        return cache
    return []


def _save_template_cache(templates: list[TemplatePreview]) -> None:
    """Save template previews to cache."""
    st.session_state[TEMPLATE_CACHE_KEY] = templates


def _load_templates_from_kb() -> list[TemplatePreview]:
    """Load attack templates from the knowledge base.

    Returns:
        List of TemplatePreview objects.
    """
    templates: list[TemplatePreview] = []

    try:
        from src.knowledge.agent_attacks import AgentAttackKnowledgeBase

        # Check if KB is available
        kb = AgentAttackKnowledgeBase()

        # Retrieve templates for each OWASP category
        seen_ids: set[str] = set()

        for risk in OWASPAgenticRisk:
            try:
                risk_templates = kb.get_attacks_for_owasp(risk, k=20)
                for template in risk_templates:
                    if template.id not in seen_ids:
                        seen_ids.add(template.id)
                        templates.append(TemplatePreview.from_template(template))
            except Exception as e:
                logger.warning(f"Failed to load templates for {risk.value}: {e}")

        logger.info(f"Loaded {len(templates)} attack templates from KB")

    except Exception as e:
        logger.error(f"Failed to initialize AgentAttackKnowledgeBase: {e}")

    return templates


def _filter_templates(
    templates: list[TemplatePreview], filters: AttackTemplateFilters
) -> list[TemplatePreview]:
    """Filter templates based on current filter settings.

    Args:
        templates: List of all templates.
        filters: Current filter configuration.

    Returns:
        Filtered list of templates.
    """
    filtered: list[TemplatePreview] = []
    enabled_codes = set(filters.get_enabled_owasp_codes())

    for template in templates:
        # Check OWASP category filter
        if not any(code in enabled_codes for code in template.owasp_codes):
            continue

        # Check capability filters
        if filters.requires_tool_access is not None:
            if template.requires_tool_access != filters.requires_tool_access:
                continue

        if filters.requires_memory_access is not None:
            if template.requires_memory_access != filters.requires_memory_access:
                continue

        filtered.append(template)

    return filtered


def _count_templates_by_owasp(templates: list[TemplatePreview]) -> dict[str, int]:
    """Count templates per OWASP category.

    Args:
        templates: List of templates.

    Returns:
        Dictionary mapping OWASP codes to counts.
    """
    counts: dict[str, int] = dict.fromkeys(OWASP_DISPLAY_NAMES, 0)

    for template in templates:
        for code in template.owasp_codes:
            if code in counts:
                counts[code] += 1

    return counts


def _render_owasp_filters(
    filters: AttackTemplateFilters, template_counts: dict[str, int]
) -> AttackTemplateFilters:
    """Render OWASP category filter checkboxes.

    Args:
        filters: Current filter configuration.
        template_counts: Count of templates per OWASP category.

    Returns:
        Updated filter configuration.
    """
    st.subheader("OWASP Categories")

    # Create two columns for checkboxes
    col1, col2 = st.columns(2)

    owasp_codes = list(OWASP_DISPLAY_NAMES.keys())

    # First 5 in column 1
    with col1:
        for code in owasp_codes[:5]:
            display_name = OWASP_DISPLAY_NAMES[code]
            count = template_counts.get(code, 0)
            label = f"{display_name} ({count})"
            key = f"owasp_filter_{code}"

            # Use checkbox with unique key
            checked = st.checkbox(
                label,
                value=filters.owasp_filters.get(code, True),
                key=key,
            )
            filters.owasp_filters[code] = checked

    # Last 5 in column 2
    with col2:
        for code in owasp_codes[5:]:
            display_name = OWASP_DISPLAY_NAMES[code]
            count = template_counts.get(code, 0)
            label = f"{display_name} ({count})"
            key = f"owasp_filter_{code}"

            checked = st.checkbox(
                label,
                value=filters.owasp_filters.get(code, True),
                key=key,
            )
            filters.owasp_filters[code] = checked

    return filters


def _render_capability_filters(filters: AttackTemplateFilters) -> AttackTemplateFilters:
    """Render capability filter controls.

    Args:
        filters: Current filter configuration.

    Returns:
        Updated filter configuration.
    """
    st.subheader("Capability Filters")

    # Tool access filter
    tool_options = ["Any", "Required", "Not Required"]
    tool_index = 0
    if filters.requires_tool_access is True:
        tool_index = 1
    elif filters.requires_tool_access is False:
        tool_index = 2

    tool_selection = st.radio(
        "Tool Access",
        tool_options,
        index=tool_index,
        key="capability_tool_filter",
        horizontal=True,
    )

    if tool_selection == "Required":
        filters.requires_tool_access = True
    elif tool_selection == "Not Required":
        filters.requires_tool_access = False
    else:
        filters.requires_tool_access = None

    # Memory access filter
    memory_options = ["Any", "Required", "Not Required"]
    memory_index = 0
    if filters.requires_memory_access is True:
        memory_index = 1
    elif filters.requires_memory_access is False:
        memory_index = 2

    memory_selection = st.radio(
        "Memory Access",
        memory_options,
        index=memory_index,
        key="capability_memory_filter",
        horizontal=True,
    )

    if memory_selection == "Required":
        filters.requires_memory_access = True
    elif memory_selection == "Not Required":
        filters.requires_memory_access = False
    else:
        filters.requires_memory_access = None

    return filters


def _render_template_list(
    templates: list[TemplatePreview], selected_ids: set[str]
) -> set[str]:
    """Render the list of filtered templates with selection.

    Args:
        templates: List of templates to display.
        selected_ids: Currently selected template IDs.

    Returns:
        Updated set of selected template IDs.
    """
    st.subheader(f"Templates ({len(templates)})")

    if not templates:
        st.info("No templates match the current filters.")
        return selected_ids

    # Select All / Deselect All buttons
    col1, col2, col3 = st.columns([1, 1, 2])

    with col1:
        if st.button("Select All", key="select_all_templates"):
            for template in templates:
                selected_ids.add(template.id)

    with col2:
        if st.button("Deselect All", key="deselect_all_templates"):
            for template in templates:
                selected_ids.discard(template.id)

    with col3:
        st.caption(f"Selected: {len([t for t in templates if t.id in selected_ids])}")

    # Display templates with expanders
    for template in templates:
        is_selected = template.id in selected_ids

        # Create expander with template info
        owasp_tags = ", ".join(template.owasp_codes)

        # Build expander label
        selection_icon = "✅" if is_selected else "⬜"
        label = f"{selection_icon} {template.id} | {owasp_tags}"

        with st.expander(label, expanded=False):
            # Template details
            col_a, col_b = st.columns([3, 1])

            with col_a:
                # Prompt preview (escaped for safety)
                st.markdown("**Prompt Preview:**")
                escaped_prompt = html.escape(template.prompt_preview)
                st.code(escaped_prompt, language=None)

                # Expected behavior
                st.markdown("**Expected Agent Behavior:**")
                escaped_behavior = html.escape(template.expected_behavior)
                st.write(escaped_behavior)

            with col_b:
                # Severity display (using st.metric for security - no HTML injection)
                severity_label = (
                    "🔴"
                    if template.severity >= 8
                    else (
                        "🟠"
                        if template.severity >= 5
                        else ("🟡" if template.severity >= 3 else "🟢")
                    )
                )
                st.metric(
                    label="Severity",
                    value=f"{template.severity}/10",
                    delta=severity_label,
                    delta_color="off",
                )

                # Capability badges
                if template.requires_tool_access:
                    st.markdown("🔧 Requires Tools")
                if template.requires_memory_access:
                    st.markdown("💾 Requires Memory")

                # Source (using st.text for safety)
                st.text(f"Source: {template.source}")

            # Selection checkbox
            checkbox_key = f"template_select_{template.id}"
            new_selected = st.checkbox(
                "Include in campaign",
                value=is_selected,
                key=checkbox_key,
            )

            if new_selected and template.id not in selected_ids:
                selected_ids.add(template.id)
            elif not new_selected and template.id in selected_ids:
                selected_ids.discard(template.id)

    return selected_ids


def _render_selection_summary(
    templates: list[TemplatePreview], selected_ids: set[str]
) -> None:
    """Render summary of selected templates.

    Args:
        templates: All available templates.
        selected_ids: Currently selected template IDs.
    """
    selected_templates = [t for t in templates if t.id in selected_ids]

    if not selected_templates:
        st.warning("No templates selected. Select templates to include in campaign.")
        return

    st.subheader("Selection Summary")

    # Count by OWASP category
    owasp_counts: dict[str, int] = {}
    for template in selected_templates:
        for code in template.owasp_codes:
            owasp_counts[code] = owasp_counts.get(code, 0) + 1

    # Display metrics
    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("Total Selected", len(selected_templates))

    with col2:
        categories_covered = len(owasp_counts)
        st.metric("OWASP Categories", f"{categories_covered}/10")

    with col3:
        avg_severity = (
            sum(t.severity for t in selected_templates) / len(selected_templates)
            if selected_templates
            else 0
        )
        st.metric("Avg Severity", f"{avg_severity:.1f}")

    # Category breakdown
    if owasp_counts:
        st.markdown("**Coverage by Category:**")
        breakdown = ", ".join(
            f"{code}: {count}" for code, count in owasp_counts.items()
        )
        st.caption(breakdown)


def render_attack_selector() -> None:
    """Render the Attack Template Selector component.

    This is the main entry point for the Attack Templates panel.
    """
    st.header("Attack Templates")
    st.caption(
        "Select attack templates to include in your security testing campaign. "
        "Filter by OWASP category or agent capability requirements."
    )

    # Load templates (use cache if available)
    templates = _get_template_cache()
    if not templates:
        with st.spinner("Loading attack templates..."):
            templates = _load_templates_from_kb()
            _save_template_cache(templates)

    if not templates:
        st.warning(
            "No attack templates available. Ensure the attack knowledge base is seeded."
        )
        # Provide refresh option
        if st.button("Refresh Templates", key="refresh_templates"):
            templates = _load_templates_from_kb()
            _save_template_cache(templates)
        return

    # Get current filters and selection
    filters = _get_filters()
    selected_ids = _get_selected_templates()

    # Count templates per OWASP category (unfiltered)
    template_counts = _count_templates_by_owasp(templates)

    # Render filters in sidebar-style columns
    filter_col, template_col = st.columns([1, 2])

    with filter_col:
        st.markdown("### Filters")

        # OWASP category filters
        filters = _render_owasp_filters(filters, template_counts)

        st.divider()

        # Capability filters
        filters = _render_capability_filters(filters)

        # Save filters
        _save_filters(filters)

    # Apply filters
    filtered_templates = _filter_templates(templates, filters)

    with template_col:
        # Render template list
        selected_ids = _render_template_list(filtered_templates, selected_ids)

        # Save selection
        _save_selected_templates(selected_ids)

    # Render selection summary at bottom
    st.divider()
    _render_selection_summary(templates, selected_ids)


def get_selected_templates() -> list[str]:
    """Get list of selected template IDs.

    Returns:
        List of selected template IDs for use in campaign execution.
    """
    return list(_get_selected_templates())


def is_templates_selected() -> bool:
    """Check if any templates are selected.

    Returns:
        True if at least one template is selected.
    """
    return len(_get_selected_templates()) > 0


def clear_template_selection() -> None:
    """Clear all selected templates."""
    _save_selected_templates(set())


def clear_template_cache() -> None:
    """Clear the template cache to force reload."""
    if TEMPLATE_CACHE_KEY in st.session_state:
        del st.session_state[TEMPLATE_CACHE_KEY]
