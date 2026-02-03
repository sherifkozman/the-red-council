/**
 * Server-side configuration persistence API.
 *
 * Provides atomic file-based persistence as an alternative to localStorage.
 * Uses temp file + rename pattern for crash-safe writes.
 *
 * Endpoints:
 * - GET /api/config: Load current configuration
 * - PUT /api/config: Save configuration (full replace)
 * - PATCH /api/config: Partial update
 * - DELETE /api/config: Reset to defaults
 *
 * Security:
 * - Size limits to prevent DoS
 * - Schema validation
 * - Atomic writes to prevent corruption
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  AppConfig,
  validateAppConfig,
  DEFAULT_APP_CONFIG,
  MAX_CONFIG_SIZE_BYTES,
} from '@/lib/persistence/config';
import { CONFIG_SCHEMA_VERSION } from '@/lib/security/constants';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Get config file path from environment or default.
 * Follows pattern from src/ui/components/remote_agent_config.py
 */
function getConfigPath(): string {
  const envPath = process.env.RC_CONFIG_PATH;
  if (envPath) {
    return path.resolve(envPath);
  }

  // Default to ~/.red-council/unified-config.json
  const homeDir = os.homedir();
  return path.join(homeDir, '.red-council', 'unified-config.json');
}

/**
 * Ensure config directory exists.
 */
async function ensureConfigDir(): Promise<void> {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  try {
    await fs.mkdir(configDir, { recursive: true, mode: 0o700 });
  } catch (error) {
    // Ignore if directory exists
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

// ============================================================================
// ATOMIC FILE OPERATIONS
// ============================================================================

/**
 * Atomically write config to file using temp + rename pattern.
 * This ensures the file is never in a partially-written state.
 */
async function atomicWriteConfig(config: AppConfig): Promise<void> {
  const configPath = getConfigPath();
  await ensureConfigDir();

  // Create temp file in same directory (for atomic rename)
  const configDir = path.dirname(configPath);
  const tempPath = path.join(configDir, `.config-${Date.now()}-${process.pid}.tmp`);

  try {
    // Write to temp file
    const content = JSON.stringify(config, null, 2);
    await fs.writeFile(tempPath, content, {
      encoding: 'utf-8',
      mode: 0o600, // Owner read/write only
    });

    // Atomic rename (on POSIX systems this is atomic)
    await fs.rename(tempPath, configPath);
  } finally {
    // Clean up temp file if it still exists (rename failed)
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore - file may not exist if rename succeeded
    }
  }
}

/**
 * Read config from file.
 */
async function readConfigFile(): Promise<AppConfig | null> {
  const configPath = getConfigPath();

  try {
    const content = await fs.readFile(configPath, 'utf-8');

    // Size check
    if (content.length > MAX_CONFIG_SIZE_BYTES) {
      console.warn(`Config file too large: ${content.length} bytes`);
      return null;
    }

    const parsed = JSON.parse(content);

    if (!validateAppConfig(parsed)) {
      console.warn('Config file validation failed');
      return null;
    }

    return parsed as AppConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist - not an error
      return null;
    }
    throw error;
  }
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

interface ConfigResponse {
  success: boolean;
  config?: AppConfig;
  error?: string;
  fromFile?: boolean;
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * GET /api/config - Load configuration
 */
export async function GET(): Promise<NextResponse<ConfigResponse>> {
  try {
    const config = await readConfigFile();

    if (config) {
      return NextResponse.json({
        success: true,
        config,
        fromFile: true,
      });
    }

    // Return defaults if no file exists
    return NextResponse.json({
      success: true,
      config: {
        ...DEFAULT_APP_CONFIG,
        updatedAt: new Date().toISOString(),
      },
      fromFile: false,
    });
  } catch (error) {
    console.error('Failed to read config:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to read configuration',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/config - Save complete configuration
 */
export async function PUT(
  request: NextRequest
): Promise<NextResponse<ConfigResponse>> {
  try {
    // Check content length
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_CONFIG_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: 'Request body too large',
        },
        { status: 413 }
      );
    }

    const body = await request.json();

    if (!validateAppConfig(body)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid configuration structure',
        },
        { status: 400 }
      );
    }

    // Update metadata
    const configToSave: AppConfig = {
      ...body,
      schemaVersion: CONFIG_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    };

    await atomicWriteConfig(configToSave);

    return NextResponse.json({
      success: true,
      config: configToSave,
    });
  } catch (error) {
    console.error('Failed to save config:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save configuration',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/config - Partial update
 */
export async function PATCH(
  request: NextRequest
): Promise<NextResponse<ConfigResponse>> {
  try {
    const body = await request.json();

    // Load existing config
    const existing = (await readConfigFile()) ?? {
      ...DEFAULT_APP_CONFIG,
      updatedAt: new Date().toISOString(),
    };

    // Deep merge with existing
    const merged: AppConfig = {
      ...existing,
      ...(body.remoteAgents !== undefined && { remoteAgents: body.remoteAgents }),
      ui: {
        ...existing.ui,
        ...(body.ui ?? {}),
      },
      session: {
        ...existing.session,
        ...(body.session ?? {}),
      },
      schemaVersion: CONFIG_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    };

    if (!validateAppConfig(merged)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid configuration after merge',
        },
        { status: 400 }
      );
    }

    await atomicWriteConfig(merged);

    return NextResponse.json({
      success: true,
      config: merged,
    });
  } catch (error) {
    console.error('Failed to patch config:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update configuration',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/config - Reset to defaults
 */
export async function DELETE(): Promise<NextResponse<ConfigResponse>> {
  try {
    const configPath = getConfigPath();

    try {
      await fs.unlink(configPath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return NextResponse.json({
      success: true,
      config: {
        ...DEFAULT_APP_CONFIG,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to reset config:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to reset configuration',
      },
      { status: 500 }
    );
  }
}
