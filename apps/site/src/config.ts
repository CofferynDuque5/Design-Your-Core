import { CONTACT_EMAIL as CORE_CONTACT_EMAIL } from '@dyc/core';
/** URL de la app web, sin barra final. En desarrollo, la app de `pnpm dev:web`. */
export const APP_URL = (import.meta.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/+$/, '');

export const appLink = (path: '/entrar' | '/registro' | '/' | '/?instalar') => `${APP_URL}${path}`;

/** Estilo del sitio (se elige al compilar con PUBLIC_SITE_STYLE). */
export const SITE_STYLES = [
  { id: 'editorial', label: 'Editorial', hint: 'Letra de libro, mucho aire y detalles en lima' },
  { id: 'bento', label: 'Bento', hint: 'Tarjetas en mosaico con brillo lima, moderno y tecnológico' },
  { id: 'contraste', label: 'Contraste', hint: 'Bloques lima, letra grande en mayúsculas, directo' },
  { id: 'cristal', label: 'Cristal', hint: 'Fondos con luz y paneles translúcidos, suave' },
] as const;
export type SiteStyle = (typeof SITE_STYLES)[number]['id'];
const wanted = import.meta.env.PUBLIC_SITE_STYLE as string | undefined;
export const SITE_STYLE: SiteStyle = SITE_STYLES.some((s) => s.id === wanted) ? (wanted as SiteStyle) : 'bento';
/** Solo en la vista previa para elegir estilo: un selector flotante. */
export const STYLE_SWITCHER = import.meta.env.PUBLIC_STYLE_SWITCHER === '1';

/** Archivos de la app para la computadora, en /descargas del sitio. */
export const DOWNLOADS = {
  windows: { href: '/descargas/DesignYourCore-Windows.exe', label: 'Windows 10 y 11', size: '71 MB', file: '.exe' },
  macApple: { href: '/descargas/DesignYourCore-Mac-Apple.zip', label: 'Mac con chip Apple (M1 o más nuevo)', size: '90 MB', file: '.zip' },
  macIntel: { href: '/descargas/DesignYourCore-Mac-Intel.zip', label: 'Mac con Intel', size: '95 MB', file: '.zip' },
  linux: { href: '/descargas/DesignYourCore-Linux.AppImage', label: 'Linux (64 bits)', size: '103 MB', file: '.AppImage' },
} as const;

/** Correo de contacto: PUBLIC_CONTACT_EMAIL o el oficial. */
export const CONTACT_EMAIL = import.meta.env.PUBLIC_CONTACT_EMAIL || CORE_CONTACT_EMAIL;
