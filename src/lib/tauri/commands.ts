/**
 * Tauri Commands - Type-safe wrappers for Rust backend commands
 *
 * This module provides TypeScript interfaces and functions to invoke
 * Rust commands from the frontend with full type safety.
 */

import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// Type Definitions
// ============================================================================

export interface OllamaStatus {
  running: boolean;
  models_available: boolean;
}

export interface AppSettings {
  theme: string;
  ollama_model: string;
  temperature: number;
  top_p: number;
}

// ============================================================================
// Command Functions
// ============================================================================

/**
 * Check if Ollama is running and has models available
 */
export async function checkOllamaStatus(): Promise<OllamaStatus> {
  return invoke<OllamaStatus>('check_ollama_status');
}

/**
 * Attempt to start the Ollama service
 * Returns a success message or throws an error
 */
export async function startOllamaService(): Promise<string> {
  return invoke<string>('start_ollama_service');
}

/**
 * Save app settings to disk
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke('save_settings', { settings });
}

/**
 * Load app settings from disk
 * Returns default settings if no saved settings exist
 */
export async function loadSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('load_settings');
}

/**
 * Reset settings to defaults
 */
export async function resetSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('reset_settings');
}

// ============================================================================
// Export all commands as a single object for convenience
// ============================================================================

export const tauriCommands = {
  checkOllamaStatus,
  startOllamaService,
  saveSettings,
  loadSettings,
  resetSettings,
};
