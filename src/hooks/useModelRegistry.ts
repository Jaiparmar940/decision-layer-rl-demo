import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'snl.decision-layer.models.v1';

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  checked: boolean;
}

export interface ModelRegistryState {
  models: ModelEntry[];
  apiKey: string;
  setChecked: (id: string, checked: boolean) => void;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
}

const DEFAULT_MODELS: ModelEntry[] = [
  { id: 'open-small-demo', name: 'open-small-demo', provider: 'sample', checked: true },
  { id: 'gpt-4.1-mini', name: 'gpt-4.1-mini', provider: 'openai', checked: false },
  { id: 'claude-sonnet', name: 'claude-sonnet', provider: 'anthropic', checked: false },
  { id: 'gemini-flash', name: 'gemini-flash', provider: 'google', checked: false },
  { id: 'baseline-scripted', name: 'baseline (scripted)', provider: 'local', checked: true },
  { id: 'trained-scripted', name: 'trained (scripted)', provider: 'local', checked: true },
];

interface Stored {
  models?: ModelEntry[];
  apiKey?: string;
}

function load(): { models: ModelEntry[]; apiKey: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { models: DEFAULT_MODELS, apiKey: '' };
    const parsed = JSON.parse(raw) as Stored;
    return {
      models: Array.isArray(parsed.models) ? parsed.models : DEFAULT_MODELS,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
    };
  } catch {
    return { models: DEFAULT_MODELS, apiKey: '' };
  }
}

export function useModelRegistry(): ModelRegistryState {
  const [models, setModels] = useState<ModelEntry[]>(DEFAULT_MODELS);
  const [apiKey, setApiKeyState] = useState('');

  useEffect(() => {
    const loaded = load();
    setModels(loaded.models);
    setApiKeyState(loaded.apiKey);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ models, apiKey }));
    } catch {
      /* ignore quota */
    }
  }, [models, apiKey]);

  const setChecked = useCallback((id: string, checked: boolean) => {
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, checked } : m)));
  }, []);

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
  }, []);

  const clearApiKey = useCallback(() => {
    setApiKeyState('');
  }, []);

  return { models, apiKey, setChecked, setApiKey, clearApiKey };
}
