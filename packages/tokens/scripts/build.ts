import { mkdirSync, writeFileSync } from 'node:fs';
import { buildCss } from '../src/css.js';
import { lima } from '../src/tokens.js';

mkdirSync('dist', { recursive: true });
writeFileSync('dist/tokens.css', buildCss());
writeFileSync('dist/lima.css', buildCss(lima));
console.log('dist/tokens.css y dist/lima.css generados');
