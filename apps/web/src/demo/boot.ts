import { ASSISTANT_STORAGE_KEY, DEFAULT_MODEL } from '../lib/assistant';
import { read, write } from '../lib/storage';
import { demoServer } from './server';

/**
 * Preparación de la versión de prueba antes de pintar: el asistente llega
 * configurado (con una clave de ejemplo que no se usa) para poder probarlo
 * sin nada más.
 */
export function prepareDemo() {
  if (read(ASSISTANT_STORAGE_KEY) === null) {
    write(ASSISTANT_STORAGE_KEY, JSON.stringify({ apiKey: 'clave-de-prueba', model: DEFAULT_MODEL, seenPrivacy: true }));
  }
}

/** Vuelve a los datos de ejemplo: borra lo guardado en este navegador y recarga en Hoy. */
export function resetDemo() {
  demoServer().reset();
  write('dyc.token', null);
  write(ASSISTANT_STORAGE_KEY, null);
  window.location.hash = '#/';
  window.location.reload();
}
