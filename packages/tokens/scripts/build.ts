import { mkdirSync, writeFileSync } from 'node:fs';
import { buildCss } from '../src/css.js';

mkdirSync('dist', { recursive: true });
writeFileSync('dist/tokens.css', buildCss());
console.log('dist/tokens.css generado');
