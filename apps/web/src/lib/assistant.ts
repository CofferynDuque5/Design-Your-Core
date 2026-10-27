import {
  chat as coreChat,
  DEFAULT_MODEL,
  parseAssistantSettings,
  testConnection as coreTestConnection,
  type AssistantSettings,
} from '@dyc/core';
import { demoAssistantFetch } from '../demo/assistant';

/**
 * Asistente en la web. La lógica (herramientas, contexto, peticiones a Gemini)
 * vive en @dyc/core y la comparte el móvil; aquí solo queda dónde se guarda la
 * clave (este navegador) y el `fetch` de la versión de prueba.
 */
export * from '@dyc/core';

/** `fetch` por defecto. En la versión de prueba (VITE_DEMO) nada sale del navegador: responde un asistente de ejemplo. */
const defaultFetch: typeof fetch = (...a) => (import.meta.env.VITE_DEMO ? demoAssistantFetch(...a) : fetch(...a));

// ---------- Ajustes (solo en este navegador) ----------

/** Clave nueva de localStorage (la app anterior usaba `core_openai_*`). */
export const ASSISTANT_STORAGE_KEY = 'dyc.assistant';

export function loadSettings(): AssistantSettings {
  try {
    return parseAssistantSettings(JSON.parse(localStorage.getItem(ASSISTANT_STORAGE_KEY) ?? '{}'));
  } catch {
    return { apiKey: '', model: DEFAULT_MODEL, seenPrivacy: false };
  }
}

/** Guarda los ajustes; devuelve false si el navegador no deja (modo privado, almacenamiento bloqueado). */
export function saveSettings(s: AssistantSettings): boolean {
  try {
    localStorage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(ASSISTANT_STORAGE_KEY);
  } catch {
    /* nada que borrar */
  }
}

export const chat = (opts: Parameters<typeof coreChat>[0]) => coreChat({ fetchImpl: defaultFetch, ...opts });
export const testConnection = (apiKey: string, model: string, fetchImpl: typeof fetch = defaultFetch) => coreTestConnection(apiKey, model, fetchImpl);
