import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ToolRegistration,
  ToolDefinition,
  validateToolName,
  validateDescription,
  validateToolDefinition,
  parseSensitiveArgs,
  MAX_TOOL_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  TOOL_NAME_PATTERN,
} from './ToolRegistration';

describe('Validation Functions', () => {
  describe('validateToolName', () => {
    it('returns valid for correct names', () => {
      expect(validateToolName('myTool').isValid).toBe(true);
      expect(validateToolName('my_tool').isValid).toBe(true);
      expect(validateToolName('tool123').isValid).toBe(true);
      expect(validateToolName('MyTool_123').isValid).toBe(true);
    });

    it('returns invalid for empty name', () => {
      const result = validateToolName('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tool name is required');
    });

    it('returns invalid for whitespace only', () => {
      const result = validateToolName('   ');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tool name is required');
    });

    it('returns invalid for name starting with number', () => {
      const result = validateToolName('123tool');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('must start with a letter');
    });

    it('returns invalid for name with special characters', () => {
      const result = validateToolName('my-tool');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('letters, numbers, and underscores');
    });

    it('returns invalid for name exceeding max length', () => {
      const longName = 'a'.repeat(MAX_TOOL_NAME_LENGTH + 1);
      const result = validateToolName(longName);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain(`${MAX_TOOL_NAME_LENGTH} characters or less`);
    });
  });

  describe('validateDescription', () => {
    it('returns valid for correct descriptions', () => {
      expect(validateDescription('A tool that does something').isValid).toBe(true);
    });

    it('returns invalid for empty description', () => {
      const result = validateDescription('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Description is required');
    });

    it('returns invalid for whitespace only', () => {
      const result = validateDescription('   ');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Description is required');
    });

    it('returns invalid for description exceeding max length', () => {
      const longDesc = 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1);
      const result = validateDescription(longDesc);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain(`${MAX_DESCRIPTION_LENGTH} characters or less`);
    });
  });

  describe('validateToolDefinition', () => {
    it('returns valid for complete definition', () => {
      const result = validateToolDefinition({
        name: 'myTool',
        description: 'A test tool',
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns all errors for invalid definition', () => {
      const result = validateToolDefinition({
        name: '',
        description: '',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('parseSensitiveArgs', () => {
    it('parses comma-separated arguments', () => {
      expect(parseSensitiveArgs('password, api_key, token')).toEqual([
        'password',
        'api_key',
        'token',
      ]);
    });

    it('handles extra whitespace', () => {
      expect(parseSensitiveArgs('  password  ,   api_key  ')).toEqual([
        'password',
        'api_key',
      ]);
    });

    it('filters empty strings', () => {
      expect(parseSensitiveArgs('password,,api_key,')).toEqual([
        'password',
        'api_key',
      ]);
    });

    it('returns empty array for empty input', () => {
      expect(parseSensitiveArgs('')).toEqual([]);
    });
  });
});

describe('ToolRegistration Component', () => {
  const mockOnToolsChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the component with add form', () => {
      render(<ToolRegistration />);
      expect(screen.getByText('Add New Tool')).toBeInTheDocument();
      expect(screen.getByLabelText('Tool Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Description')).toBeInTheDocument();
    });

    it('renders registered tools list header', () => {
      render(<ToolRegistration />);
      expect(screen.getByText(/Registered Tools/)).toBeInTheDocument();
    });

    it('shows empty state when no tools', () => {
      render(<ToolRegistration />);
      expect(screen.getByText(/No tools registered yet/i)).toBeInTheDocument();
    });

    it('renders export and import buttons', () => {
      render(<ToolRegistration />);
      expect(screen.getByRole('button', { name: /Export/i })).toBeInTheDocument();
      expect(screen.getByText('Import')).toBeInTheDocument();
    });

    it('has accessible region', () => {
      render(<ToolRegistration />);
      expect(screen.getByRole('region', { name: /Tool registration/i })).toBeInTheDocument();
    });
  });

  describe('Adding Tools', () => {
    it('adds a new tool when form is valid', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration onToolsChange={mockOnToolsChange} />);

      await user.type(screen.getByLabelText('Tool Name'), 'myTool');
      await user.type(screen.getByLabelText('Description'), 'A test tool');
      await user.click(screen.getByRole('button', { name: /Add Tool/i }));

      expect(mockOnToolsChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'myTool',
            description: 'A test tool',
          }),
        ])
      );
    });

    it('disables add button when form is invalid', async () => {
      render(<ToolRegistration />);

      // Add button should be disabled with empty fields
      expect(screen.getByRole('button', { name: /Add Tool/i })).toBeDisabled();
    });

    it('enables add button when form is valid', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration />);

      await user.type(screen.getByLabelText('Tool Name'), 'myTool');
      await user.type(screen.getByLabelText('Description'), 'A test tool');

      expect(screen.getByRole('button', { name: /Add Tool/i })).toBeEnabled();
    });

    it('prevents duplicate tool names', async () => {
      const user = userEvent.setup();
      const initialTools: ToolDefinition[] = [
        { id: '1', name: 'existingTool', description: 'Existing', isDangerous: false, sensitiveArgs: [] },
      ];
      render(<ToolRegistration initialTools={initialTools} />);

      await user.type(screen.getByLabelText('Tool Name'), 'existingTool');
      await user.type(screen.getByLabelText('Description'), 'Another tool');
      await user.click(screen.getByRole('button', { name: /Add Tool/i }));

      expect(screen.getByText(/A tool with this name already exists/i)).toBeInTheDocument();
    });

    it('handles dangerous flag', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration onToolsChange={mockOnToolsChange} />);

      await user.type(screen.getByLabelText('Tool Name'), 'dangerousTool');
      await user.type(screen.getByLabelText('Description'), 'A dangerous tool');
      await user.click(screen.getByLabelText('Mark as Dangerous'));
      await user.click(screen.getByRole('button', { name: /Add Tool/i }));

      expect(mockOnToolsChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'dangerousTool',
            isDangerous: true,
          }),
        ])
      );
    });

    it('handles sensitive arguments', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration onToolsChange={mockOnToolsChange} />);

      await user.type(screen.getByLabelText('Tool Name'), 'secretTool');
      await user.type(screen.getByLabelText('Description'), 'A tool with secrets');
      await user.type(screen.getByLabelText(/Sensitive Arguments/i), 'password, api_key');
      await user.click(screen.getByRole('button', { name: /Add Tool/i }));

      expect(mockOnToolsChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            sensitiveArgs: ['password', 'api_key'],
          }),
        ])
      );
    });

    it('clears form after successful add', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration onToolsChange={mockOnToolsChange} />);

      await user.type(screen.getByLabelText('Tool Name'), 'myTool');
      await user.type(screen.getByLabelText('Description'), 'A test tool');
      await user.click(screen.getByRole('button', { name: /Add Tool/i }));

      expect(screen.getByLabelText('Tool Name')).toHaveValue('');
      expect(screen.getByLabelText('Description')).toHaveValue('');
    });
  });

  describe('Displaying Tools', () => {
    const initialTools: ToolDefinition[] = [
      { id: '1', name: 'tool1', description: 'First tool', isDangerous: false, sensitiveArgs: [] },
      { id: '2', name: 'dangerousTool', description: 'Dangerous', isDangerous: true, sensitiveArgs: ['secret'] },
    ];

    it('displays registered tools', () => {
      render(<ToolRegistration initialTools={initialTools} />);
      expect(screen.getByText('tool1')).toBeInTheDocument();
      expect(screen.getByText('dangerousTool')).toBeInTheDocument();
    });

    it('shows dangerous badge for dangerous tools', () => {
      render(<ToolRegistration initialTools={initialTools} />);
      expect(screen.getByText('Dangerous')).toBeInTheDocument();
    });

    it('shows sensitive args count badge', () => {
      render(<ToolRegistration initialTools={initialTools} />);
      expect(screen.getByText('1 sensitive arg')).toBeInTheDocument();
    });

    it('expands tool to show details', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration initialTools={initialTools} />);

      await user.click(screen.getByText('tool1'));
      expect(screen.getByText('First tool')).toBeInTheDocument();
    });

    it('updates count when tools change', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration initialTools={initialTools} onToolsChange={mockOnToolsChange} />);

      expect(screen.getByText('Registered Tools (2)')).toBeInTheDocument();
    });
  });

  describe('Editing Tools', () => {
    const initialTools: ToolDefinition[] = [
      { id: '1', name: 'editableTool', description: 'Original desc', isDangerous: false, sensitiveArgs: [] },
    ];

    it('enters edit mode when edit button clicked', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration initialTools={initialTools} />);

      await user.click(screen.getByLabelText('Edit editableTool'));
      await user.click(screen.getByText('editableTool'));

      // Should see edit form inputs
      expect(screen.getByDisplayValue('editableTool')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Original desc')).toBeInTheDocument();
    });

    it('saves edited tool', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration initialTools={initialTools} onToolsChange={mockOnToolsChange} />);

      // Click edit
      await user.click(screen.getByLabelText('Edit editableTool'));
      // Expand the tool
      await user.click(screen.getByText('editableTool'));

      // Change description
      const descInput = screen.getByDisplayValue('Original desc');
      await user.clear(descInput);
      await user.type(descInput, 'Updated desc');

      // Save
      await user.click(screen.getByRole('button', { name: /Save/i }));

      expect(mockOnToolsChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            description: 'Updated desc',
          }),
        ])
      );
    });

    it('cancels edit without saving', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration initialTools={initialTools} onToolsChange={mockOnToolsChange} />);

      await user.click(screen.getByLabelText('Edit editableTool'));
      await user.click(screen.getByText('editableTool'));

      // Change something
      const descInput = screen.getByDisplayValue('Original desc');
      await user.clear(descInput);
      await user.type(descInput, 'Changed');

      // Cancel
      await user.click(screen.getByRole('button', { name: /Cancel/i }));

      // mockOnToolsChange should not have been called with the change
      expect(mockOnToolsChange).not.toHaveBeenCalled();
    });
  });

  describe('Deleting Tools', () => {
    const initialTools: ToolDefinition[] = [
      { id: '1', name: 'deletableTool', description: 'To be deleted', isDangerous: false, sensitiveArgs: [] },
    ];

    it('deletes tool when delete button clicked', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration initialTools={initialTools} onToolsChange={mockOnToolsChange} />);

      await user.click(screen.getByLabelText('Delete deletableTool'));

      expect(mockOnToolsChange).toHaveBeenCalledWith([]);
    });
  });

  describe('Import/Export', () => {
    const initialTools: ToolDefinition[] = [
      { id: '1', name: 'exportTool', description: 'For export', isDangerous: false, sensitiveArgs: [] },
    ];

    it('disables export when no tools', () => {
      render(<ToolRegistration />);
      // Get the Export button specifically - there's only one when no tools
      const exportButtons = screen.getAllByRole('button', { name: /Export/i });
      expect(exportButtons[0]).toBeDisabled();
    });

    it('enables export when tools exist', () => {
      render(<ToolRegistration initialTools={initialTools} />);
      // Get all buttons with Export name - should include just the one
      const exportButtons = screen.getAllByRole('button', { name: /Export/i });
      expect(exportButtons[0]).toBeEnabled();
    });

    it('handles import of valid JSON', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration onToolsChange={mockOnToolsChange} />);

      const file = new File(
        [JSON.stringify([{ name: 'importedTool', description: 'Imported' }])],
        'tools.json',
        { type: 'application/json' }
      );

      const input = screen.getByLabelText(/Import tools from JSON file/i);
      await user.upload(input, file);

      await waitFor(() => {
        expect(mockOnToolsChange).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'importedTool',
            }),
          ])
        );
      });
    });

    it('shows error for invalid JSON', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration />);

      const file = new File(['invalid json'], 'tools.json', { type: 'application/json' });

      const input = screen.getByLabelText(/Import tools from JSON file/i);
      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText(/Invalid JSON format/i)).toBeInTheDocument();
      });
    });

    it('shows error for non-array JSON', async () => {
      const user = userEvent.setup();
      render(<ToolRegistration />);

      const file = new File([JSON.stringify({ name: 'notAnArray' })], 'tools.json', {
        type: 'application/json',
      });

      const input = screen.getByLabelText(/Import tools from JSON file/i);
      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText(/Invalid format: expected an array/i)).toBeInTheDocument();
      });
    });
  });

  describe('Disabled State', () => {
    it('disables add button when disabled', () => {
      render(<ToolRegistration disabled />);
      expect(screen.getByRole('button', { name: /Add Tool/i })).toBeDisabled();
    });

    it('disables form inputs when disabled', () => {
      render(<ToolRegistration disabled />);
      expect(screen.getByLabelText('Tool Name')).toBeDisabled();
      expect(screen.getByLabelText('Description')).toBeDisabled();
    });

    it('disables edit/delete buttons when disabled', () => {
      const initialTools: ToolDefinition[] = [
        { id: '1', name: 'tool1', description: 'Test', isDangerous: false, sensitiveArgs: [] },
      ];
      render(<ToolRegistration initialTools={initialTools} disabled />);

      expect(screen.getByLabelText('Edit tool1')).toBeDisabled();
      expect(screen.getByLabelText('Delete tool1')).toBeDisabled();
    });
  });

  describe('CSS Classes', () => {
    it('applies custom className', () => {
      const { container } = render(<ToolRegistration className="custom-class" />);
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});

describe('Constants', () => {
  it('exports correct max lengths', () => {
    expect(MAX_TOOL_NAME_LENGTH).toBe(64);
    expect(MAX_DESCRIPTION_LENGTH).toBe(500);
  });

  it('exports correct name pattern', () => {
    expect(TOOL_NAME_PATTERN.test('validName')).toBe(true);
    expect(TOOL_NAME_PATTERN.test('123invalid')).toBe(false);
  });
});
