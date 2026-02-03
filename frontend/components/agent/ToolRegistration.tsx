'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  Plus,
  Trash2,
  ChevronDown,
  AlertTriangle,
  Download,
  Upload,
  Pencil,
  Check,
  X,
} from 'lucide-react';

// Constants for validation
export const MAX_TOOL_NAME_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 500;
export const TOOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

// Tool definition type
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  isDangerous: boolean;
  sensitiveArgs: string[];
}

// Validation result type
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate a tool name according to schema constraints.
 */
export function validateToolName(name: string): ValidationResult {
  const errors: string[] = [];

  if (!name.trim()) {
    errors.push('Tool name is required');
  } else if (name.length > MAX_TOOL_NAME_LENGTH) {
    errors.push(`Tool name must be ${MAX_TOOL_NAME_LENGTH} characters or less`);
  } else if (!TOOL_NAME_PATTERN.test(name)) {
    errors.push('Tool name must start with a letter and contain only letters, numbers, and underscores');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate a tool description.
 */
export function validateDescription(description: string): ValidationResult {
  const errors: string[] = [];

  if (!description.trim()) {
    errors.push('Description is required');
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`);
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate a complete tool definition.
 */
export function validateToolDefinition(tool: Partial<ToolDefinition>): ValidationResult {
  const allErrors: string[] = [];

  const nameValidation = validateToolName(tool.name ?? '');
  const descValidation = validateDescription(tool.description ?? '');

  allErrors.push(...nameValidation.errors);
  allErrors.push(...descValidation.errors);

  return { isValid: allErrors.length === 0, errors: allErrors };
}

/**
 * Parse sensitive args from comma-separated string.
 */
export function parseSensitiveArgs(input: string): string[] {
  return input
    .split(',')
    .map((arg) => arg.trim())
    .filter((arg) => arg.length > 0);
}

/**
 * Generate a unique ID for a tool.
 */
function generateToolId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface ToolRegistrationProps {
  /** Whether the form is disabled */
  disabled?: boolean;
  /** Initial tools to display */
  initialTools?: ToolDefinition[];
  /** Callback when tools change */
  onToolsChange?: (tools: ToolDefinition[]) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Tool registration form for registering custom tools for interception.
 * Allows adding, editing, deleting tools and configuring dangerous flags.
 */
export function ToolRegistration({
  disabled = false,
  initialTools = [],
  onToolsChange,
  className,
}: ToolRegistrationProps) {
  // Registered tools state
  const [tools, setTools] = useState<ToolDefinition[]>(initialTools);

  // Form state for adding new tool
  const [newTool, setNewTool] = useState({
    name: '',
    description: '',
    isDangerous: false,
    sensitiveArgsInput: '',
  });

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    isDangerous: false,
    sensitiveArgsInput: '',
  });

  // Form validation errors
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Expanded tools for viewing details
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  // Validate new tool form
  const newToolValidation = useMemo(() => {
    return validateToolDefinition({
      name: newTool.name,
      description: newTool.description,
    });
  }, [newTool.name, newTool.description]);

  // Check for duplicate names
  const isDuplicateName = useCallback(
    (name: string, excludeId?: string) => {
      return tools.some(
        (t) => t.name.toLowerCase() === name.toLowerCase() && t.id !== excludeId
      );
    },
    [tools]
  );

  // Add new tool
  const addTool = useCallback(() => {
    if (disabled) return;

    const errors: string[] = [];

    // Validate
    const validation = validateToolDefinition({
      name: newTool.name,
      description: newTool.description,
    });
    errors.push(...validation.errors);

    // Check duplicates
    if (isDuplicateName(newTool.name)) {
      errors.push('A tool with this name already exists');
    }

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    const tool: ToolDefinition = {
      id: generateToolId(),
      name: newTool.name.trim(),
      description: newTool.description.trim(),
      isDangerous: newTool.isDangerous,
      sensitiveArgs: parseSensitiveArgs(newTool.sensitiveArgsInput),
    };

    const updatedTools = [...tools, tool];
    setTools(updatedTools);
    onToolsChange?.(updatedTools);

    // Reset form
    setNewTool({
      name: '',
      description: '',
      isDangerous: false,
      sensitiveArgsInput: '',
    });
    setFormErrors([]);
  }, [disabled, newTool, tools, isDuplicateName, onToolsChange]);

  // Delete tool
  const deleteTool = useCallback(
    (id: string) => {
      if (disabled) return;

      const updatedTools = tools.filter((t) => t.id !== id);
      setTools(updatedTools);
      onToolsChange?.(updatedTools);

      // Clean up expanded state
      setExpandedTools((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [disabled, tools, onToolsChange]
  );

  // Start editing a tool
  const startEditing = useCallback(
    (tool: ToolDefinition) => {
      if (disabled) return;

      setEditingId(tool.id);
      setEditForm({
        name: tool.name,
        description: tool.description,
        isDangerous: tool.isDangerous,
        sensitiveArgsInput: tool.sensitiveArgs.join(', '),
      });
    },
    [disabled]
  );

  // Save edited tool
  const saveEdit = useCallback(() => {
    if (!editingId || disabled) return;

    const errors: string[] = [];

    // Validate
    const validation = validateToolDefinition({
      name: editForm.name,
      description: editForm.description,
    });
    errors.push(...validation.errors);

    // Check duplicates
    if (isDuplicateName(editForm.name, editingId)) {
      errors.push('A tool with this name already exists');
    }

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    const updatedTools = tools.map((t) =>
      t.id === editingId
        ? {
            ...t,
            name: editForm.name.trim(),
            description: editForm.description.trim(),
            isDangerous: editForm.isDangerous,
            sensitiveArgs: parseSensitiveArgs(editForm.sensitiveArgsInput),
          }
        : t
    );

    setTools(updatedTools);
    onToolsChange?.(updatedTools);
    setEditingId(null);
    setFormErrors([]);
  }, [editingId, disabled, editForm, tools, isDuplicateName, onToolsChange]);

  // Cancel editing
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setFormErrors([]);
  }, []);

  // Toggle tool expansion
  const toggleExpanded = useCallback((id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Export tools as JSON
  const exportTools = useCallback(() => {
    let url: string | null = null;
    try {
      const data = JSON.stringify(tools, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tool-definitions-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[ToolRegistration] Export failed:', err);
      }
      setFormErrors(['Failed to export tools. Please try again.']);
    } finally {
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
  }, [tools]);

  // Import tools from JSON
  const importTools = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;

      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onerror = () => {
        const errorMessage = reader.error?.message || 'Unknown error reading file';
        if (process.env.NODE_ENV === 'development') {
          console.error('[ToolRegistration] FileReader error:', reader.error);
        }
        setFormErrors([`Failed to read file: ${errorMessage}`]);
      };
      reader.onload = (e) => {
        try {
          const content = e.target?.result;
          if (typeof content !== 'string') {
            setFormErrors(['Failed to read file']);
            return;
          }

          const imported = JSON.parse(content);
          if (!Array.isArray(imported)) {
            setFormErrors(['Invalid format: expected an array of tools']);
            return;
          }

          // Validate and import - check for duplicates
          const existingNames = new Set(tools.map((t) => t.name.toLowerCase()));
          const validTools: ToolDefinition[] = [];
          const importErrors: string[] = [];

          for (const item of imported) {
            const validation = validateToolDefinition(item);
            if (validation.isValid && item.name && item.description) {
              const toolName = String(item.name).slice(0, MAX_TOOL_NAME_LENGTH);
              // Skip duplicates
              if (existingNames.has(toolName.toLowerCase())) {
                importErrors.push(`Skipped duplicate: ${toolName}`);
                continue;
              }
              existingNames.add(toolName.toLowerCase());
              validTools.push({
                id: generateToolId(),
                name: toolName,
                description: String(item.description).slice(0, MAX_DESCRIPTION_LENGTH),
                isDangerous: Boolean(item.isDangerous),
                sensitiveArgs: Array.isArray(item.sensitiveArgs)
                  ? item.sensitiveArgs.map(String)
                  : [],
              });
            } else {
              const reasons =
                validation.errors.length > 0
                  ? validation.errors.join(', ')
                  : 'Missing required fields';
              importErrors.push(`Invalid "${item.name || 'unnamed'}": ${reasons}`);
            }
          }

          if (validTools.length > 0) {
            const updatedTools = [...tools, ...validTools];
            setTools(updatedTools);
            onToolsChange?.(updatedTools);
          }

          if (importErrors.length > 0) {
            setFormErrors(importErrors);
          }
        } catch (err) {
          const parseError = err instanceof Error ? err.message : 'Unknown parsing error';
          if (process.env.NODE_ENV === 'development') {
            console.error('[ToolRegistration] JSON parse error:', err);
          }
          setFormErrors([`Invalid JSON format: ${parseError}`]);
        }
      };
      reader.readAsText(file);

      // Reset file input
      event.target.value = '';
    },
    [disabled, tools, onToolsChange]
  );

  return (
    <div className={cn('space-y-4', className)} role="region" aria-label="Tool registration">
      {/* Form Errors */}
      {formErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            <ul className="list-disc pl-4 space-y-1">
              {formErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Add New Tool Form */}
      <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
        <h4 className="text-sm font-medium">Add New Tool</h4>

        <div className="grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="new-tool-name">Tool Name</Label>
            <Input
              id="new-tool-name"
              placeholder="my_tool_name"
              value={newTool.name}
              onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
              disabled={disabled}
              maxLength={MAX_TOOL_NAME_LENGTH}
              aria-describedby="tool-name-help"
            />
            <p id="tool-name-help" className="text-xs text-muted-foreground">
              Letters, numbers, and underscores only. Max {MAX_TOOL_NAME_LENGTH} chars.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-tool-description">Description</Label>
            <Textarea
              id="new-tool-description"
              placeholder="What does this tool do?"
              value={newTool.description}
              onChange={(e) => setNewTool({ ...newTool, description: e.target.value })}
              disabled={disabled}
              maxLength={MAX_DESCRIPTION_LENGTH}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-tool-sensitive-args">Sensitive Arguments (comma-separated)</Label>
            <Input
              id="new-tool-sensitive-args"
              placeholder="password, api_key, token"
              value={newTool.sensitiveArgsInput}
              onChange={(e) => setNewTool({ ...newTool, sensitiveArgsInput: e.target.value })}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Arguments that should be masked in logs and event records.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="new-tool-dangerous"
              checked={newTool.isDangerous}
              onCheckedChange={(checked) =>
                setNewTool({ ...newTool, isDangerous: checked === true })
              }
              disabled={disabled}
            />
            <div>
              <Label htmlFor="new-tool-dangerous" className="cursor-pointer">
                Mark as Dangerous
              </Label>
              <p className="text-xs text-muted-foreground">
                Dangerous tools require user confirmation before execution.
              </p>
            </div>
          </div>

          <Button
            onClick={addTool}
            disabled={disabled || !newToolValidation.isValid}
            className="gap-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Tool
          </Button>
        </div>
      </div>

      {/* Registered Tools List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">
            Registered Tools ({tools.length})
          </h4>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportTools}
              disabled={tools.length === 0}
              className="gap-1"
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              Export
            </Button>
            <label>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                className="gap-1 cursor-pointer"
                asChild
              >
                <span>
                  <Upload className="h-3 w-3" aria-hidden="true" />
                  Import
                </span>
              </Button>
              <input
                type="file"
                accept=".json"
                onChange={importTools}
                disabled={disabled}
                className="sr-only"
                aria-label="Import tools from JSON file"
              />
            </label>
          </div>
        </div>

        {tools.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No tools registered yet. Add a tool above to get started.
          </div>
        ) : (
          <ul className="space-y-2" role="list" aria-label="Registered tools">
            {tools.map((tool) => (
              <li key={tool.id}>
                <Collapsible
                  open={expandedTools.has(tool.id)}
                  onOpenChange={() => toggleExpanded(tool.id)}
                >
                  <div
                    className={cn(
                      'border rounded-lg overflow-hidden',
                      tool.isDangerous && 'border-orange-500/50'
                    )}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 text-muted-foreground transition-transform',
                              expandedTools.has(tool.id) && 'rotate-180'
                            )}
                            aria-hidden="true"
                          />
                          <span className="font-mono text-sm">{tool.name}</span>
                          {tool.isDangerous && (
                            <Badge variant="outline" className="text-orange-500 border-orange-500 text-xs">
                              Dangerous
                            </Badge>
                          )}
                          {tool.sensitiveArgs.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {tool.sensitiveArgs.length} sensitive arg
                              {tool.sensitiveArgs.length !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          {editingId !== tool.id && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEditing(tool)}
                                disabled={disabled}
                                aria-label={`Edit ${tool.name}`}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteTool(tool.id)}
                                disabled={disabled}
                                className="text-destructive hover:text-destructive"
                                aria-label={`Delete ${tool.name}`}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t p-3 space-y-3 bg-muted/20">
                        {editingId === tool.id ? (
                          // Edit form
                          <div className="space-y-3">
                            <div className="space-y-2">
                              <Label htmlFor={`edit-name-${tool.id}`}>Tool Name</Label>
                              <Input
                                id={`edit-name-${tool.id}`}
                                value={editForm.name}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, name: e.target.value })
                                }
                                maxLength={MAX_TOOL_NAME_LENGTH}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`edit-desc-${tool.id}`}>Description</Label>
                              <Textarea
                                id={`edit-desc-${tool.id}`}
                                value={editForm.description}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, description: e.target.value })
                                }
                                maxLength={MAX_DESCRIPTION_LENGTH}
                                rows={2}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`edit-sensitive-${tool.id}`}>
                                Sensitive Arguments
                              </Label>
                              <Input
                                id={`edit-sensitive-${tool.id}`}
                                value={editForm.sensitiveArgsInput}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    sensitiveArgsInput: e.target.value,
                                  })
                                }
                                placeholder="password, api_key"
                              />
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id={`edit-dangerous-${tool.id}`}
                                checked={editForm.isDangerous}
                                onCheckedChange={(checked) =>
                                  setEditForm({ ...editForm, isDangerous: checked === true })
                                }
                              />
                              <Label htmlFor={`edit-dangerous-${tool.id}`}>Mark as Dangerous</Label>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={saveEdit} className="gap-1">
                                <Check className="h-4 w-4" aria-hidden="true" />
                                Save
                              </Button>
                              <Button variant="ghost" size="sm" onClick={cancelEdit} className="gap-1">
                                <X className="h-4 w-4" aria-hidden="true" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          // View details
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Description:</span>
                              <p className="mt-1">{tool.description}</p>
                            </div>
                            {tool.sensitiveArgs.length > 0 && (
                              <div>
                                <span className="text-muted-foreground">Sensitive Arguments:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {tool.sensitiveArgs.map((arg) => (
                                    <Badge key={arg} variant="secondary" className="font-mono text-xs">
                                      {arg}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
