import { DEFAULT_MODEL, parseAssistantSettings, type AssistantSettings } from '@dyc/core';
import { useEffect, useState } from 'react';
import { storage } from './storage';

/** Misma clave que en la web, pero en el llavero de este teléfono. */
export const ASSISTANT_STORAGE_KEY = 'dyc.assistant';

/** Clave de Gemini y modelo (del llavero del teléfono). `null` mientras se lee. */
export function useAssistantSettings() {
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [memoryOnly, setMemoryOnly] = useState(false);
  useEffect(() => {
    let live = true;
    storage
      .get(ASSISTANT_STORAGE_KEY)
      .then((raw) => (raw ? parseAssistantSettings(JSON.parse(raw)) : parseAssistantSettings({})))
      .catch(() => parseAssistantSettings({}))
      .then((s) => live && setSettings(s));
    return () => {
      live = false;
    };
  }, []);
  const update = (next: AssistantSettings) => {
    setSettings(next);
    setMemoryOnly(false);
    storage.set(ASSISTANT_STORAGE_KEY, JSON.stringify(next)).catch(() => setMemoryOnly(true));
  };
  const remove = () => {
    // Borra lo guardado en el teléfono; el modelo elegido sigue en pantalla.
    setSettings((s) => ({ apiKey: '', model: s?.model ?? DEFAULT_MODEL, seenPrivacy: s?.seenPrivacy ?? false }));
    setMemoryOnly(false);
    void storage.set(ASSISTANT_STORAGE_KEY, null).catch(() => undefined);
  };
  return { settings, memoryOnly, update, remove };
}
