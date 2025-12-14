/**
 * Settings State Store (Zustand)
 * Manages user preferences (only tier selection is persisted)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Model tier type
export type ModelTier = 'LIGHT' | 'MEDIUM' | 'LARGE';

// Developer-defined constants (NOT stored in localStorage)
export const CHUNK_SETTINGS = {
  chunkSize: 512,
  chunkOverlap: 50,
} as const;

export const SEARCH_SETTINGS = {
  topK: 5,
  minSimilarity: 0.5,
  useReranking: true,
} as const;

export const STORAGE_SETTINGS = {
  maxStorageGB: 5,
  autoCleanup: false,
  keepDays: 30,
} as const;

export const PRIVACY_SETTINGS = {
  allowTelemetry: false,
} as const;

// User preferences state (only tier selection is persisted)
interface SettingsState {
  selectedTier: ModelTier;
  setSelectedTier: (tier: ModelTier) => void;
  resetToDefaults: () => void;
}

const DEFAULT_TIER: ModelTier = 'LIGHT';

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      selectedTier: DEFAULT_TIER,
      setSelectedTier: (tier) => set({ selectedTier: tier }),
      resetToDefaults: () => set({ selectedTier: DEFAULT_TIER }),
    }),
    {
      name: 'settings-storage-v3', // Changed to force reset old localStorage
    }
  )
);

// Convenience selectors
export const useSelectedTier = () =>
  useSettingsStore((state) => state.selectedTier);
