# tests/ui/test_attack_selector.py
# ruff: noqa: E402
"""
Tests for the Attack Template Selector component.

Tests cover:
- AttackTemplateFilters dataclass
- TemplatePreview dataclass
- Filter logic and template filtering
- Session state management
- UI rendering functions
- Helper functions
"""

import sys
from unittest.mock import MagicMock, patch

# Mock streamlit before importing module
mock_st = MagicMock()
mock_st.session_state = {}
sys.modules["streamlit"] = mock_st
if "src.ui.components.attack_selector" in sys.modules:
    del sys.modules["src.ui.components.attack_selector"]

from src.ui.components.attack_selector import (
    ATTACK_FILTER_KEY,
    CAPABILITY_NAMES,
    OWASP_DISPLAY_NAMES,
    SELECTED_TEMPLATES_KEY,
    TEMPLATE_CACHE_KEY,
    VALID_TEMPLATE_ID,
    AttackTemplateFilters,
    TemplatePreview,
    _count_templates_by_owasp,
    _count_templates_by_capability_combo,
    _filter_templates,
    _get_filters,
    _get_selected_templates,
    _get_template_cache,
    _save_filters,
    _save_selected_templates,
    _save_template_cache,
    clear_template_cache,
    clear_template_selection,
    get_selected_templates,
    is_templates_selected,
)
import src.ui.components.attack_selector as attack_selector

# ============================================================================
# AttackTemplateFilters Tests
# ============================================================================


class TestAttackTemplateFilters:
    """Tests for AttackTemplateFilters dataclass."""

    def test_default_initialization(self) -> None:
        """Test default filter initialization."""
        filters = AttackTemplateFilters()

        # All OWASP filters should be True by default
        assert len(filters.owasp_filters) == 10
        for code in OWASP_DISPLAY_NAMES:
            assert filters.owasp_filters[code] is True

        # Capability filters should be None (any)
        assert filters.requires_tool_access is None
        assert filters.requires_memory_access is None

    def test_custom_initialization(self) -> None:
        """Test filter initialization with custom values."""
        owasp_filters = dict.fromkeys(OWASP_DISPLAY_NAMES, False)
        owasp_filters["ASI01"] = True

        filters = AttackTemplateFilters(
            owasp_filters=owasp_filters,
            requires_tool_access=True,
            requires_memory_access=False,
        )

        assert filters.owasp_filters["ASI01"] is True
        assert filters.owasp_filters["ASI02"] is False
        assert filters.requires_tool_access is True
        assert filters.requires_memory_access is False

    def test_to_dict(self) -> None:
        """Test serialization to dictionary."""
        filters = AttackTemplateFilters(
            requires_tool_access=True,
            requires_memory_access=None,
        )

        data = filters.to_dict()

        assert "owasp_filters" in data
        assert data["requires_tool_access"] is True
        assert data["requires_memory_access"] is None

    def test_from_dict(self) -> None:
        """Test deserialization from dictionary."""
        data = {
            "owasp_filters": {"ASI01": False, "ASI02": True},
            "requires_tool_access": False,
            "requires_memory_access": True,
        }

        filters = AttackTemplateFilters.from_dict(data)

        assert filters.owasp_filters["ASI01"] is False
        assert filters.owasp_filters["ASI02"] is True
        # Missing codes should be filled with True
        assert filters.owasp_filters["ASI03"] is True
        assert filters.requires_tool_access is False
        assert filters.requires_memory_access is True

    def test_from_dict_empty(self) -> None:
        """Test deserialization from empty dictionary."""
        filters = AttackTemplateFilters.from_dict({})

        # All OWASP filters should be True
        for code in OWASP_DISPLAY_NAMES:
            assert filters.owasp_filters[code] is True

        assert filters.requires_tool_access is None
        assert filters.requires_memory_access is None

    def test_from_dict_validates_types(self) -> None:
        """Test that from_dict validates and normalizes types."""
        # Non-bool values should be normalized
        data = {
            "owasp_filters": {
                "ASI01": "true",  # string, not bool
                "ASI02": 1,  # int, not bool
                "ASI03": None,  # None, not bool
            },
            "requires_tool_access": "yes",  # string, not bool
            "requires_memory_access": 0,  # falsy int
        }

        filters = AttackTemplateFilters.from_dict(data)

        # All should be normalized to bools
        assert filters.owasp_filters["ASI01"] is True  # "true" -> True
        assert filters.owasp_filters["ASI02"] is True  # 1 -> True
        assert filters.owasp_filters["ASI03"] is False  # None -> False
        assert filters.requires_tool_access is True  # "yes" -> True
        assert filters.requires_memory_access is False  # 0 -> False

    def test_from_dict_invalid_type(self) -> None:
        """Test that from_dict handles non-dict input gracefully."""
        # Should return default filters
        filters = AttackTemplateFilters.from_dict("not a dict")  # type: ignore

        # Should have defaults
        for code in OWASP_DISPLAY_NAMES:
            assert filters.owasp_filters[code] is True
        assert filters.requires_tool_access is None
        assert filters.requires_memory_access is None

    def test_get_enabled_owasp_codes(self) -> None:
        """Test getting list of enabled OWASP codes."""
        owasp_filters = dict.fromkeys(OWASP_DISPLAY_NAMES, False)
        owasp_filters["ASI01"] = True
        owasp_filters["ASI04"] = True
        owasp_filters["ASI07"] = True

        filters = AttackTemplateFilters(owasp_filters=owasp_filters)
        enabled = filters.get_enabled_owasp_codes()

        assert len(enabled) == 3
        assert "ASI01" in enabled
        assert "ASI04" in enabled
        assert "ASI07" in enabled
        assert "ASI02" not in enabled

    def test_roundtrip_serialization(self) -> None:
        """Test to_dict and from_dict roundtrip."""
        original = AttackTemplateFilters(
            requires_tool_access=True,
            requires_memory_access=False,
        )
        original.owasp_filters["ASI03"] = False

        data = original.to_dict()
        restored = AttackTemplateFilters.from_dict(data)

        assert restored.owasp_filters == original.owasp_filters
        assert restored.requires_tool_access == original.requires_tool_access
        assert restored.requires_memory_access == original.requires_memory_access


# ============================================================================
# TemplatePreview Tests
# ============================================================================


class TestTemplatePreview:
    """Tests for TemplatePreview dataclass."""

    def test_basic_initialization(self) -> None:
        """Test basic TemplatePreview initialization."""
        preview = TemplatePreview(
            id="test-001",
            prompt_preview="Test prompt",
            expected_behavior="Test behavior",
            severity=5,
            owasp_codes=["ASI01", "ASI04"],
            requires_tool_access=True,
            requires_memory_access=False,
            source="test-source",
        )

        assert preview.id == "test-001"
        assert preview.prompt_preview == "Test prompt"
        assert preview.severity == 5
        assert len(preview.owasp_codes) == 2

    def test_from_template_basic(self) -> None:
        """Test creating preview from a mock template."""
        # Create mock template with required attributes
        mock_template = MagicMock()
        mock_template.id = "mock-001"
        mock_template.prompt_template = "Short prompt"
        mock_template.expected_agent_behavior = "Expected behavior"
        mock_template.sophistication = 7
        mock_template.requires_tool_access = True
        mock_template.requires_memory_access = False
        mock_template.source = "mock-source"

        # Mock OWASP enum
        mock_owasp = MagicMock()
        mock_owasp.value = "ASI01"
        mock_template.target_owasp = [mock_owasp]

        preview = TemplatePreview.from_template(mock_template)

        assert preview.id == "mock-001"
        assert preview.prompt_preview == "Short prompt"
        assert preview.expected_behavior == "Expected behavior"
        assert preview.severity == 7
        assert "ASI01" in preview.owasp_codes

    def test_from_template_long_prompt_truncation(self) -> None:
        """Test that long prompts are truncated."""
        mock_template = MagicMock()
        mock_template.id = "long-001"
        mock_template.prompt_template = "X" * 300  # > 200 chars
        mock_template.expected_agent_behavior = "Behavior"
        mock_template.sophistication = 3
        mock_template.requires_tool_access = False
        mock_template.requires_memory_access = False
        mock_template.source = "source"
        mock_template.target_owasp = []

        preview = TemplatePreview.from_template(mock_template)

        assert len(preview.prompt_preview) == 203  # 200 + "..."
        assert preview.prompt_preview.endswith("...")

    def test_from_template_missing_attributes(self) -> None:
        """Test handling of missing attributes via getattr defaults."""
        mock_template = MagicMock(spec=[])  # Empty spec = no attributes

        preview = TemplatePreview.from_template(mock_template)

        assert preview.id == "unknown"
        assert preview.severity == 1
        assert preview.owasp_codes == []

    def test_from_template_validates_severity(self) -> None:
        """Test that severity is validated and clamped to 1-10."""
        mock_template = MagicMock()
        mock_template.id = "severity-test"
        mock_template.prompt_template = "Test"
        mock_template.expected_agent_behavior = "Test"
        mock_template.requires_tool_access = False
        mock_template.requires_memory_access = False
        mock_template.source = "test"
        mock_template.target_owasp = []

        # Test severity too high
        mock_template.sophistication = 15
        preview = TemplatePreview.from_template(mock_template)
        assert preview.severity == 10  # Clamped to max

        # Test severity too low
        mock_template.sophistication = -5
        preview = TemplatePreview.from_template(mock_template)
        assert preview.severity == 1  # Clamped to min

        # Test non-numeric severity
        mock_template.sophistication = "invalid"
        preview = TemplatePreview.from_template(mock_template)
        assert preview.severity == 1  # Default

    def test_from_template_sanitizes_invalid_id(self) -> None:
        """Test that invalid template IDs are sanitized."""
        mock_template = MagicMock()
        mock_template.id = "<script>alert('XSS')</script>"
        mock_template.prompt_template = "Test"
        mock_template.expected_agent_behavior = "Test"
        mock_template.sophistication = 5
        mock_template.requires_tool_access = False
        mock_template.requires_memory_access = False
        mock_template.source = "test"
        mock_template.target_owasp = []

        preview = TemplatePreview.from_template(mock_template)

        # ID should be sanitized (special chars replaced with _)
        assert "<" not in preview.id
        assert ">" not in preview.id
        assert "'" not in preview.id

    def test_from_template_validates_owasp_codes(self) -> None:
        """Test that only valid OWASP codes are included."""
        mock_template = MagicMock()
        mock_template.id = "owasp-test"
        mock_template.prompt_template = "Test"
        mock_template.expected_agent_behavior = "Test"
        mock_template.sophistication = 5
        mock_template.requires_tool_access = False
        mock_template.requires_memory_access = False
        mock_template.source = "test"

        # Mix of valid and invalid OWASP codes
        mock_owasp_valid = MagicMock()
        mock_owasp_valid.value = "ASI01"
        mock_owasp_invalid = MagicMock()
        mock_owasp_invalid.value = "INVALID_CODE"
        mock_template.target_owasp = [mock_owasp_valid, mock_owasp_invalid]

        preview = TemplatePreview.from_template(mock_template)

        # Only valid codes should be included
        assert "ASI01" in preview.owasp_codes
        assert "INVALID_CODE" not in preview.owasp_codes


# ============================================================================
# Session State Tests
# ============================================================================


class TestSessionStateManagement:
    """Tests for session state management functions."""

    def setup_method(self) -> None:
        """Reset session state before each test."""
        mock_st.session_state = {}

    def test_get_filters_default(self) -> None:
        """Test getting filters when none exist."""
        filters = _get_filters()

        assert isinstance(filters, AttackTemplateFilters)
        # Should have saved to session state
        assert ATTACK_FILTER_KEY in mock_st.session_state

    def test_get_filters_existing(self) -> None:
        """Test getting existing filters."""
        mock_st.session_state[ATTACK_FILTER_KEY] = {
            "owasp_filters": {"ASI01": False},
            "requires_tool_access": True,
            "requires_memory_access": None,
        }

        filters = _get_filters()

        assert filters.owasp_filters["ASI01"] is False
        assert filters.requires_tool_access is True

    def test_get_filters_invalid_type(self) -> None:
        """Test handling invalid session state type."""
        mock_st.session_state[ATTACK_FILTER_KEY] = "invalid"

        filters = _get_filters()

        # Should return default filters
        assert isinstance(filters, AttackTemplateFilters)

    def test_save_filters(self) -> None:
        """Test saving filters to session state."""
        filters = AttackTemplateFilters(requires_tool_access=True)

        _save_filters(filters)

        assert mock_st.session_state[ATTACK_FILTER_KEY]["requires_tool_access"] is True

    def test_get_selected_templates_default(self) -> None:
        """Test getting selected templates when none exist."""
        selected = _get_selected_templates()

        assert isinstance(selected, set)
        assert len(selected) == 0

    def test_get_selected_templates_existing_set(self) -> None:
        """Test getting existing selected templates as set."""
        mock_st.session_state[SELECTED_TEMPLATES_KEY] = {"id-1", "id-2"}

        selected = _get_selected_templates()

        assert len(selected) == 2
        assert "id-1" in selected

    def test_get_selected_templates_existing_list(self) -> None:
        """Test converting list to set for selected templates."""
        mock_st.session_state[SELECTED_TEMPLATES_KEY] = ["id-1", "id-2"]

        selected = _get_selected_templates()

        assert isinstance(selected, set)
        assert "id-1" in selected

    def test_get_selected_templates_invalid_type(self) -> None:
        """Test handling invalid type for selected templates."""
        mock_st.session_state[SELECTED_TEMPLATES_KEY] = "invalid"

        selected = _get_selected_templates()

        assert isinstance(selected, set)
        assert len(selected) == 0

    def test_save_selected_templates(self) -> None:
        """Test saving selected templates."""
        _save_selected_templates({"id-1", "id-2", "id-3"})

        assert len(mock_st.session_state[SELECTED_TEMPLATES_KEY]) == 3

    def test_get_template_cache_default(self) -> None:
        """Test getting template cache when empty."""
        cache = _get_template_cache()

        assert isinstance(cache, list)
        assert len(cache) == 0

    def test_get_template_cache_existing(self) -> None:
        """Test getting existing template cache."""
        mock_st.session_state[TEMPLATE_CACHE_KEY] = [
            TemplatePreview(
                id="cached-1",
                prompt_preview="Cached",
                expected_behavior="Behavior",
                severity=5,
                owasp_codes=["ASI01"],
                requires_tool_access=False,
                requires_memory_access=False,
                source="cache",
            )
        ]

        cache = _get_template_cache()

        assert len(cache) == 1
        assert cache[0].id == "cached-1"

    def test_get_template_cache_invalid_type(self) -> None:
        """Test handling invalid cache type."""
        mock_st.session_state[TEMPLATE_CACHE_KEY] = "invalid"

        cache = _get_template_cache()

        assert isinstance(cache, list)
        assert len(cache) == 0

    def test_save_template_cache(self) -> None:
        """Test saving template cache."""
        templates = [
            TemplatePreview(
                id="new-1",
                prompt_preview="New",
                expected_behavior="Behavior",
                severity=3,
                owasp_codes=["ASI02"],
                requires_tool_access=True,
                requires_memory_access=False,
                source="new",
            )
        ]

        _save_template_cache(templates)

        assert len(mock_st.session_state[TEMPLATE_CACHE_KEY]) == 1


# ============================================================================
# Filter Logic Tests
# ============================================================================


class TestFilterLogic:
    """Tests for template filtering logic."""

    def _create_template(
        self,
        id: str,
        owasp_codes: list[str],
        requires_tool: bool = False,
        requires_memory: bool = False,
    ) -> TemplatePreview:
        """Helper to create template previews."""
        return TemplatePreview(
            id=id,
            prompt_preview="Test prompt",
            expected_behavior="Test behavior",
            severity=5,
            owasp_codes=owasp_codes,
            requires_tool_access=requires_tool,
            requires_memory_access=requires_memory,
            source="test",
        )

    def test_filter_by_owasp_all_enabled(self) -> None:
        """Test filtering with all OWASP categories enabled."""
        templates = [
            self._create_template("t1", ["ASI01"]),
            self._create_template("t2", ["ASI05"]),
            self._create_template("t3", ["ASI01", "ASI05"]),
        ]
        filters = AttackTemplateFilters()  # All enabled by default

        filtered = _filter_templates(templates, filters)

        assert len(filtered) == 3

    def test_filter_by_owasp_some_disabled(self) -> None:
        """Test filtering with some OWASP categories disabled."""
        templates = [
            self._create_template("t1", ["ASI01"]),
            self._create_template("t2", ["ASI05"]),
            self._create_template("t3", ["ASI01", "ASI05"]),
        ]

        owasp_filters = dict.fromkeys(OWASP_DISPLAY_NAMES, False)
        owasp_filters["ASI01"] = True
        filters = AttackTemplateFilters(owasp_filters=owasp_filters)

        filtered = _filter_templates(templates, filters)

        assert len(filtered) == 2  # t1 and t3 (has ASI01)
        assert any(t.id == "t1" for t in filtered)
        assert any(t.id == "t3" for t in filtered)

    def test_filter_by_tool_access_required(self) -> None:
        """Test filtering for templates requiring tool access."""
        templates = [
            self._create_template("t1", ["ASI01"], requires_tool=True),
            self._create_template("t2", ["ASI01"], requires_tool=False),
        ]
        filters = AttackTemplateFilters(requires_tool_access=True)

        filtered = _filter_templates(templates, filters)

        assert len(filtered) == 1
        assert filtered[0].id == "t1"

    def test_filter_by_tool_access_not_required(self) -> None:
        """Test filtering for templates not requiring tool access."""
        templates = [
            self._create_template("t1", ["ASI01"], requires_tool=True),
            self._create_template("t2", ["ASI01"], requires_tool=False),
        ]
        filters = AttackTemplateFilters(requires_tool_access=False)

        filtered = _filter_templates(templates, filters)

        assert len(filtered) == 1
        assert filtered[0].id == "t2"

    def test_filter_by_memory_access_required(self) -> None:
        """Test filtering for templates requiring memory access."""
        templates = [
            self._create_template("t1", ["ASI07"], requires_memory=True),
            self._create_template("t2", ["ASI07"], requires_memory=False),
        ]
        filters = AttackTemplateFilters(requires_memory_access=True)

        filtered = _filter_templates(templates, filters)

        assert len(filtered) == 1
        assert filtered[0].id == "t1"

    def test_filter_combined(self) -> None:
        """Test combined OWASP and capability filters."""
        templates = [
            self._create_template("t1", ["ASI01"], requires_tool=True),
            self._create_template("t2", ["ASI01"], requires_tool=False),
            self._create_template("t3", ["ASI05"], requires_tool=True),
        ]

        owasp_filters = dict.fromkeys(OWASP_DISPLAY_NAMES, False)
        owasp_filters["ASI01"] = True
        filters = AttackTemplateFilters(
            owasp_filters=owasp_filters,
            requires_tool_access=True,
        )

        filtered = _filter_templates(templates, filters)

        assert len(filtered) == 1
        assert filtered[0].id == "t1"

    def test_filter_empty_templates(self) -> None:
        """Test filtering empty template list."""
        filters = AttackTemplateFilters()

        filtered = _filter_templates([], filters)

        assert len(filtered) == 0

    def test_filter_no_matches(self) -> None:
        """Test filtering with no matching templates."""
        templates = [
            self._create_template("t1", ["ASI01"]),
            self._create_template("t2", ["ASI02"]),
        ]

        owasp_filters = dict.fromkeys(OWASP_DISPLAY_NAMES, False)
        owasp_filters["ASI10"] = True  # No templates have ASI10
        filters = AttackTemplateFilters(owasp_filters=owasp_filters)

        filtered = _filter_templates(templates, filters)

        assert len(filtered) == 0


# ============================================================================
# Helper Function Tests
# ============================================================================


class TestHelperFunctions:
    """Tests for helper functions."""

    def setup_method(self) -> None:
        """Reset session state before each test."""
        mock_st.session_state = {}

    def test_count_templates_by_owasp(self) -> None:
        """Test counting templates per OWASP category."""
        templates = [
            TemplatePreview(
                id="t1",
                prompt_preview="",
                expected_behavior="",
                severity=1,
                owasp_codes=["ASI01", "ASI04"],
                requires_tool_access=False,
                requires_memory_access=False,
                source="",
            ),
            TemplatePreview(
                id="t2",
                prompt_preview="",
                expected_behavior="",
                severity=1,
                owasp_codes=["ASI01"],
                requires_tool_access=False,
                requires_memory_access=False,
                source="",
            ),
            TemplatePreview(
                id="t3",
                prompt_preview="",
                expected_behavior="",
                severity=1,
                owasp_codes=["ASI04", "ASI07"],
                requires_tool_access=False,
                requires_memory_access=False,
                source="",
            ),
        ]

        counts = _count_templates_by_owasp(templates)

        assert counts["ASI01"] == 2
        assert counts["ASI04"] == 2
        assert counts["ASI07"] == 1
        assert counts["ASI02"] == 0

    def test_count_templates_by_owasp_empty(self) -> None:
        """Test counting with empty template list."""
        counts = _count_templates_by_owasp([])

        # All counts should be 0
        for code in OWASP_DISPLAY_NAMES:
            assert counts[code] == 0

    def test_count_templates_by_capability_combo(self) -> None:
        """Test capability combo counts respect OWASP filters."""
        filters = AttackTemplateFilters()
        filters.owasp_filters = {code: False for code in OWASP_DISPLAY_NAMES}
        filters.owasp_filters["ASI01"] = True

        templates = [
            TemplatePreview(
                id="t1",
                prompt_preview="p1",
                expected_behavior="e1",
                severity=5,
                owasp_codes=["ASI01"],
                requires_tool_access=True,
                requires_memory_access=False,
                source="src",
            ),
            TemplatePreview(
                id="t2",
                prompt_preview="p2",
                expected_behavior="e2",
                severity=3,
                owasp_codes=["ASI02"],
                requires_tool_access=False,
                requires_memory_access=True,
                source="src",
            ),
        ]

        counts = _count_templates_by_capability_combo(templates, filters)
        assert counts["Tool Only"] == 1
        assert counts["Memory Only"] == 0

    def test_valid_template_id_pattern(self) -> None:
        """Test VALID_TEMPLATE_ID pattern accepts valid IDs."""
        assert VALID_TEMPLATE_ID.match("valid-id-123") is not None
        assert VALID_TEMPLATE_ID.match("template_1.0") is not None
        assert VALID_TEMPLATE_ID.match("ABC123") is not None

    def test_valid_template_id_rejects_invalid(self) -> None:
        """Test VALID_TEMPLATE_ID pattern rejects invalid IDs."""
        assert VALID_TEMPLATE_ID.match("has spaces") is None
        assert VALID_TEMPLATE_ID.match("<script>alert('XSS')</script>") is None
        assert VALID_TEMPLATE_ID.match("../path/traversal") is None
        assert VALID_TEMPLATE_ID.match("") is None
        # Too long
        assert VALID_TEMPLATE_ID.match("a" * 129) is None

    def test_get_selected_templates_validates_ids(self) -> None:
        """Test that _get_selected_templates validates and sanitizes IDs."""
        # Include both valid and invalid IDs
        mock_st.session_state[SELECTED_TEMPLATES_KEY] = {
            "valid-id",
            "also_valid.1",
            "invalid id with spaces",
            "<script>xss</script>",
            "../../../etc/passwd",
        }

        selected = _get_selected_templates()

        # Only valid IDs should be returned
        assert "valid-id" in selected
        assert "also_valid.1" in selected
        assert "invalid id with spaces" not in selected
        assert "<script>xss</script>" not in selected
        assert "../../../etc/passwd" not in selected

    def test_get_selected_templates_api(self) -> None:
        """Test public API for getting selected templates."""
        mock_st.session_state[SELECTED_TEMPLATES_KEY] = {"id-1", "id-2"}

        selected = get_selected_templates()

        assert isinstance(selected, list)
        assert len(selected) == 2

    def test_is_templates_selected_true(self) -> None:
        """Test checking if templates are selected (true case)."""
        mock_st.session_state[SELECTED_TEMPLATES_KEY] = {"id-1"}

        assert is_templates_selected() is True

    def test_is_templates_selected_false(self) -> None:
        """Test checking if templates are selected (false case)."""
        mock_st.session_state[SELECTED_TEMPLATES_KEY] = set()

        assert is_templates_selected() is False

    def test_clear_template_selection(self) -> None:
        """Test clearing template selection."""
        mock_st.session_state[SELECTED_TEMPLATES_KEY] = {"id-1", "id-2"}

        clear_template_selection()

        assert len(mock_st.session_state[SELECTED_TEMPLATES_KEY]) == 0

    def test_clear_template_cache(self) -> None:
        """Test clearing template cache."""
        mock_st.session_state[TEMPLATE_CACHE_KEY] = ["some", "data"]

        clear_template_cache()

        assert TEMPLATE_CACHE_KEY not in mock_st.session_state

    def test_clear_template_cache_no_cache(self) -> None:
        """Test clearing cache when none exists."""
        # Should not raise
        clear_template_cache()

        assert TEMPLATE_CACHE_KEY not in mock_st.session_state


# ============================================================================
# Constants Tests
# ============================================================================


class TestConstants:
    """Tests for module constants."""

    def test_owasp_display_names_complete(self) -> None:
        """Test that all OWASP codes have display names."""
        expected_codes = [f"ASI{i:02d}" for i in range(1, 11)]

        for code in expected_codes:
            assert code in OWASP_DISPLAY_NAMES
            assert isinstance(OWASP_DISPLAY_NAMES[code], str)
            assert len(OWASP_DISPLAY_NAMES[code]) > 0

    def test_capability_names(self) -> None:
        """Test capability display names."""
        assert "requires_tool_access" in CAPABILITY_NAMES
        assert "requires_memory_access" in CAPABILITY_NAMES


# ============================================================================
# Render Function Tests (with mocked streamlit)
# ============================================================================


class TestRenderFunctions:
    """Tests for render functions with mocked streamlit."""

    def setup_method(self) -> None:
        """Reset session state and mocks before each test."""
        self.st = MagicMock()
        self.st.session_state = {}
        attack_selector.st = self.st

    def test_render_owasp_filters_calls_checkbox(self) -> None:
        """Test that OWASP filter rendering calls checkboxes."""
        filters = AttackTemplateFilters()
        counts = dict.fromkeys(OWASP_DISPLAY_NAMES, 1)
        assert len(OWASP_DISPLAY_NAMES) == 10
        assert attack_selector.st is self.st

        # Mock columns
        col_mock = MagicMock()
        col_mock.__enter__ = MagicMock(return_value=col_mock)
        col_mock.__exit__ = MagicMock(return_value=None)
        self.st.columns.return_value = [col_mock, col_mock]
        self.st.checkbox.return_value = True

        result = attack_selector._render_owasp_filters(filters, counts)

        # Should call checkbox for each OWASP category
        assert self.st.checkbox.call_count >= 10
        assert isinstance(result, AttackTemplateFilters)

    def test_render_capability_filters_calls_radio(self) -> None:
        """Test that capability filter rendering calls radio buttons."""
        filters = AttackTemplateFilters()
        self.st.radio.return_value = "Any"

        result = attack_selector._render_capability_filters(filters)

        # Should call radio for tool and memory access
        assert self.st.radio.call_count >= 2
        assert isinstance(result, AttackTemplateFilters)

    def test_render_capability_filters_required_selection(self) -> None:
        """Test capability filter with 'Required' selection."""
        filters = AttackTemplateFilters()
        self.st.radio.return_value = "Required"

        result = attack_selector._render_capability_filters(filters)

        assert result.requires_tool_access is True
        assert result.requires_memory_access is True

    def test_render_capability_filters_not_required_selection(self) -> None:
        """Test capability filter with 'Not Required' selection."""
        filters = AttackTemplateFilters()
        self.st.radio.return_value = "Not Required"

        result = attack_selector._render_capability_filters(filters)

        assert result.requires_tool_access is False
        assert result.requires_memory_access is False

    def test_render_template_list_empty(self) -> None:
        """Test rendering empty template list."""
        result = attack_selector._render_template_list([], set())

        self.st.info.assert_called_once()
        assert isinstance(result, set)

    def test_render_template_list_with_templates(self) -> None:
        """Test rendering template list with templates."""
        templates = [
            TemplatePreview(
                id="t1",
                prompt_preview="Test prompt",
                expected_behavior="Behavior",
                severity=5,
                owasp_codes=["ASI01"],
                requires_tool_access=False,
                requires_memory_access=False,
                source="test",
            )
        ]

        # Mock columns - first call is [1, 1, 2] (3 cols), second is [3, 1] (2 cols)
        col_mock = MagicMock()
        col_mock.__enter__ = MagicMock(return_value=col_mock)
        col_mock.__exit__ = MagicMock(return_value=None)

        def columns_side_effect(spec, **kwargs):
            return [col_mock for _ in range(len(spec))]

        self.st.columns.side_effect = columns_side_effect

        expander_mock = MagicMock()
        expander_mock.__enter__ = MagicMock(return_value=expander_mock)
        expander_mock.__exit__ = MagicMock(return_value=None)
        self.st.expander.return_value = expander_mock

        self.st.button.return_value = False
        self.st.checkbox.return_value = False

        result = attack_selector._render_template_list(templates, set())

        # Should have called expander for template
        assert self.st.expander.call_count >= 1
        assert isinstance(result, set)

    def test_render_template_list_select_all(self) -> None:
        """Test Select All button functionality."""
        templates = [
            TemplatePreview(
                id=f"t{i}",
                prompt_preview="Test",
                expected_behavior="Behavior",
                severity=5,
                owasp_codes=["ASI01"],
                requires_tool_access=False,
                requires_memory_access=False,
                source="test",
            )
            for i in range(3)
        ]

        col_mock = MagicMock()
        col_mock.__enter__ = MagicMock(return_value=col_mock)
        col_mock.__exit__ = MagicMock(return_value=None)

        def columns_side_effect(spec, **kwargs):
            return [col_mock for _ in range(len(spec))]

        self.st.columns.side_effect = columns_side_effect

        expander_mock = MagicMock()
        expander_mock.__enter__ = MagicMock(return_value=expander_mock)
        expander_mock.__exit__ = MagicMock(return_value=None)
        self.st.expander.return_value = expander_mock

        # First button (Select All) returns True, second (Deselect) False
        self.st.button.side_effect = [True, False]
        # Checkbox returns True so templates stay selected after Select All
        self.st.checkbox.return_value = True

        result = attack_selector._render_template_list(templates, set())

        # All templates should be selected
        assert len(result) == 3

    def test_render_template_list_deselect_all(self) -> None:
        """Test Deselect All button functionality."""
        templates = [
            TemplatePreview(
                id=f"t{i}",
                prompt_preview="Test",
                expected_behavior="Behavior",
                severity=5,
                owasp_codes=["ASI01"],
                requires_tool_access=False,
                requires_memory_access=False,
                source="test",
            )
            for i in range(3)
        ]

        col_mock = MagicMock()
        col_mock.__enter__ = MagicMock(return_value=col_mock)
        col_mock.__exit__ = MagicMock(return_value=None)

        def columns_side_effect(spec, **kwargs):
            return [col_mock for _ in range(len(spec))]

        self.st.columns.side_effect = columns_side_effect

        expander_mock = MagicMock()
        expander_mock.__enter__ = MagicMock(return_value=expander_mock)
        expander_mock.__exit__ = MagicMock(return_value=None)
        self.st.expander.return_value = expander_mock

        # Second button (Deselect All) returns True
        self.st.button.side_effect = [False, True]
        self.st.checkbox.return_value = False

        result = attack_selector._render_template_list(templates, {"t0", "t1", "t2"})

        # All templates should be deselected
        assert len(result) == 0

    def test_render_selection_summary_empty(self) -> None:
        """Test rendering selection summary with no selection."""
        attack_selector._render_selection_summary([], set())

        self.st.warning.assert_called_once()

    def test_render_selection_summary_with_selection(self) -> None:
        """Test rendering selection summary with templates."""
        templates = [
            TemplatePreview(
                id="t1",
                prompt_preview="Test",
                expected_behavior="Behavior",
                severity=6,
                owasp_codes=["ASI01", "ASI04"],
                requires_tool_access=False,
                requires_memory_access=False,
                source="test",
            ),
            TemplatePreview(
                id="t2",
                prompt_preview="Test",
                expected_behavior="Behavior",
                severity=8,
                owasp_codes=["ASI07"],
                requires_tool_access=False,
                requires_memory_access=False,
                source="test",
            ),
        ]

        col_mock = MagicMock()
        col_mock.__enter__ = MagicMock(return_value=col_mock)
        col_mock.__exit__ = MagicMock(return_value=None)

        # Handle both int and list arguments to st.columns
        def columns_side_effect(spec, **kwargs):
            if isinstance(spec, int):
                return [col_mock for _ in range(spec)]
            return [col_mock for _ in range(len(spec))]

        self.st.columns.side_effect = columns_side_effect

        attack_selector._render_selection_summary(templates, {"t1", "t2"})

        # Should call metric for totals
        assert self.st.metric.call_count >= 3


# ============================================================================
# Integration Tests
# ============================================================================


class TestLoadTemplates:
    """Tests for loading templates from knowledge base."""

    def setup_method(self) -> None:
        """Reset session state before each test."""
        mock_st.session_state = {}

    @patch("src.knowledge.agent_attacks.AgentAttackKnowledgeBase")
    def test_load_templates_from_kb_success(self, mock_kb_class: MagicMock) -> None:
        """Test successful template loading from KB."""
        # Setup mock KB
        mock_kb = MagicMock()
        mock_kb_class.return_value = mock_kb

        # Create mock template
        mock_template = MagicMock()
        mock_template.id = "kb-001"
        mock_template.prompt_template = "KB prompt"
        mock_template.expected_agent_behavior = "KB behavior"
        mock_template.sophistication = 5
        mock_template.requires_tool_access = True
        mock_template.requires_memory_access = False
        mock_template.source = "kb-source"

        mock_owasp = MagicMock()
        mock_owasp.value = "ASI01"
        mock_template.target_owasp = [mock_owasp]

        mock_kb.get_attacks_for_owasp.return_value = [mock_template]

        templates = attack_selector._load_templates_from_kb()

        assert len(templates) >= 1
        # First template should be kb-001
        assert any(t.id == "kb-001" for t in templates)

    @patch("src.knowledge.agent_attacks.AgentAttackKnowledgeBase")
    def test_load_templates_from_kb_failure(self, mock_kb_class: MagicMock) -> None:
        """Test handling KB initialization failure."""
        mock_kb_class.side_effect = Exception("KB init failed")

        templates = attack_selector._load_templates_from_kb()

        assert templates == []

    @patch("src.knowledge.agent_attacks.AgentAttackKnowledgeBase")
    def test_load_templates_deduplication(self, mock_kb_class: MagicMock) -> None:
        """Test that duplicate templates are deduplicated."""
        mock_kb = MagicMock()
        mock_kb_class.return_value = mock_kb

        # Create mock template that appears in multiple categories
        mock_template = MagicMock()
        mock_template.id = "shared-001"
        mock_template.prompt_template = "Shared prompt"
        mock_template.expected_agent_behavior = "Shared behavior"
        mock_template.sophistication = 5
        mock_template.requires_tool_access = False
        mock_template.requires_memory_access = False
        mock_template.source = "shared"

        mock_owasp1 = MagicMock()
        mock_owasp1.value = "ASI01"
        mock_owasp2 = MagicMock()
        mock_owasp2.value = "ASI04"
        mock_template.target_owasp = [mock_owasp1, mock_owasp2]

        # Same template returned for multiple categories
        mock_kb.get_attacks_for_owasp.return_value = [mock_template]

        templates = attack_selector._load_templates_from_kb()

        # Should only have one instance despite appearing in multiple queries
        ids = [t.id for t in templates]
        assert ids.count("shared-001") == 1


class TestRenderAttackSelector:
    """Tests for main render function."""

    def setup_method(self) -> None:
        """Reset session state and mocks before each test."""
        mock_st.session_state = {}
        mock_st.reset_mock()
        attack_selector.st = mock_st

    @patch.object(attack_selector, "_load_templates_from_kb")
    def test_render_attack_selector_no_templates(self, mock_load: MagicMock) -> None:
        """Test rendering with no templates available."""
        mock_load.return_value = []
        # Use list for multiple button calls (warning button + refresh button)
        mock_st.button.side_effect = [False, False, False]

        # Mock spinner context manager
        spinner_mock = MagicMock()
        spinner_mock.__enter__ = MagicMock(return_value=spinner_mock)
        spinner_mock.__exit__ = MagicMock(return_value=None)
        mock_st.spinner.return_value = spinner_mock

        attack_selector.render_attack_selector()

        mock_st.warning.assert_called()

    @patch.object(attack_selector, "_load_templates_from_kb")
    def test_render_attack_selector_with_cached_templates(
        self, mock_load: MagicMock
    ) -> None:
        """Test rendering with cached templates."""
        # Pre-populate cache
        mock_st.session_state[TEMPLATE_CACHE_KEY] = [
            TemplatePreview(
                id="cached-1",
                prompt_preview="Cached",
                expected_behavior="Behavior",
                severity=5,
                owasp_codes=["ASI01"],
                requires_tool_access=False,
                requires_memory_access=False,
                source="cache",
            )
        ]

        # Mock UI components - return dynamic column counts
        col_mock = MagicMock()
        col_mock.__enter__ = MagicMock(return_value=col_mock)
        col_mock.__exit__ = MagicMock(return_value=None)

        def columns_side_effect(spec, **kwargs):
            if isinstance(spec, int):
                return [col_mock for _ in range(spec)]
            return [col_mock for _ in range(len(spec))]

        mock_st.columns.side_effect = columns_side_effect

        expander_mock = MagicMock()
        expander_mock.__enter__ = MagicMock(return_value=expander_mock)
        expander_mock.__exit__ = MagicMock(return_value=None)
        mock_st.expander.return_value = expander_mock

        mock_st.checkbox.return_value = True
        mock_st.radio.return_value = "Any"
        mock_st.button.return_value = False

        attack_selector.render_attack_selector()

        # Should not call load since cache exists
        mock_load.assert_not_called()
        # Should render header
        mock_st.header.assert_called_with("Attack Templates")

    @patch.object(attack_selector, "_load_templates_from_kb")
    def test_render_attack_selector_refresh_button(self, mock_load: MagicMock) -> None:
        """Test refresh button when no templates available."""
        mock_load.return_value = []

        # Mock spinner
        spinner_mock = MagicMock()
        spinner_mock.__enter__ = MagicMock(return_value=spinner_mock)
        spinner_mock.__exit__ = MagicMock(return_value=None)
        mock_st.spinner.return_value = spinner_mock

        # Refresh button clicked (True for the refresh button)
        mock_st.button.side_effect = [True, True, True]

        attack_selector.render_attack_selector()

        # Should call load twice (initial + refresh)
        assert mock_load.call_count == 2
