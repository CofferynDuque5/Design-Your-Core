import { createElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown, markdownToText } from './markdown';
import { applyFormat, insertBlock } from './noteFormat';

const md = (text: string, resolveImage?: (ref: string) => string | null | undefined) => render(createElement(Markdown, { text, resolveImage })).container;

describe('Markdown seguro', () => {
  it('nunca inserta HTML: todo va escapado', () => {
    const box = md('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)> **hola** <b>no</b>');
    expect(box.querySelector('script')).toBeNull();
    expect(box.querySelector('img')).toBeNull();
    expect(box.querySelector('b')).toBeNull();
    expect(box.textContent).toContain('<script>alert(1)</script>');
    expect(box.querySelector('strong')).toHaveTextContent('hola');
  });

  it('solo enlaza http(s) y mailto, en una pestaña nueva y sin referer', () => {
    const box = md('[malo](javascript:alert(1)) [bien](https://example.com) [correo](mailto:a@b.co) y https://ejemplo.org/x.');
    const links = within(box).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.com', 'mailto:a@b.co', 'https://ejemplo.org/x']);
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(box.textContent).toContain('malo');
  });

  it('títulos, listas, casillas, citas, código y fórmulas', () => {
    const box = md('# Tema\n## Sub\n- uno\n- dos\n\n1. a\n2. b\n\n- [x] hecho\n- [ ] falta\n\n> cita *suave*\n\n```py\nprint("<hola>")\n```\n\nLa $E=mc^2$ y\n$$\n\\int x\n$$\n\n---\n~~no~~ `x<y`');
    expect(screen.getByRole('heading', { level: 2, name: 'Tema' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Sub' })).toBeInTheDocument();
    expect(box.querySelectorAll('ul')).toHaveLength(2);
    expect(box.querySelector('ol')?.textContent).toBe('ab');
    expect(screen.getByRole('img', { name: 'Hecho' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Por hacer' })).toBeInTheDocument();
    expect(box.querySelector('blockquote em')).toHaveTextContent('suave');
    expect(box.querySelector('pre.md-code code')).toHaveTextContent('print("<hola>")');
    expect(box.querySelector('code.md-math')).toHaveTextContent('E=mc^2');
    expect(box.querySelector('pre.md-math')).toHaveTextContent('\\int x');
    expect(box.querySelector('hr')).not.toBeNull();
    expect(box.querySelector('del')).toHaveTextContent('no');
    // snake_case no es cursiva.
    expect(md('mi_variable_larga').querySelector('em')).toBeNull();
  });

  it('imágenes coreimg: e incrustadas; las de otras webs, solo como enlace', () => {
    const data = 'data:image/jpeg;base64,AAAA';
    const box = md(`![imagen](coreimg:abc)\n\n![Esquema](${data})\n\n![](coreimg:nada)\n\n![foto](https://tracker.example/x.png)`, (ref) =>
      ref === 'coreimg:abc' ? data : ref.startsWith('data:') ? ref : null,
    );
    const imgs = within(box).getAllByRole('img');
    expect(imgs.map((i) => i.getAttribute('alt'))).toEqual(['Imagen 1', 'Esquema']);
    expect(imgs[0]).toHaveAttribute('src', data);
    expect(box.textContent).toContain('Imagen 3: no disponible');
    expect(within(box).getByRole('link', { name: 'foto (enlace externo)' })).toHaveAttribute('href', 'https://tracker.example/x.png');
  });

  it('texto plano para las tarjetas', () => {
    expect(markdownToText('# Ondas\n- [ ] **Repasar** la _fórmula_ `f=1/T`\n![imagen](coreimg:a)')).toBe('Ondas Repasar la fórmula f=1/T [imagen]');
  });
});

describe('Barra de formato de las notas', () => {
  it('rodea la selección o inserta un ejemplo seleccionado', () => {
    expect(applyFormat('hola mundo', 5, 10, 'bold')).toEqual({ value: 'hola **mundo**', start: 7, end: 12 });
    expect(applyFormat('hola ', 5, 5, 'italic')).toEqual({ value: 'hola *texto en cursiva*', start: 6, end: 22 });
    expect(applyFormat('a\nb', 0, 3, 'code').value).toBe('```\na\nb\n```\n');
  });

  it('prefijos por línea: los añade, los cambia o los quita', () => {
    expect(applyFormat('uno\ndos', 0, 7, 'list').value).toBe('- uno\n- dos');
    expect(applyFormat('- uno\n- dos', 0, 11, 'list').value).toBe('uno\ndos');
    expect(applyFormat('- uno', 2, 2, 'task')).toEqual({ value: '- [ ] uno', start: 9, end: 9 });
    expect(applyFormat('intro\nTema', 7, 7, 'heading').value).toBe('intro\n## Tema');
    expect(applyFormat('dicho', 0, 0, 'quote').value).toBe('> dicho');
  });

  it('una imagen va en su propia línea', () => {
    expect(insertBlock('antes', 5, 5, '![imagen](coreimg:x)')).toEqual({ value: 'antes\n![imagen](coreimg:x)\n', start: 27, end: 27 });
    expect(insertBlock('a\nb', 2, 2, 'X').value).toBe('a\nX\n\nb');
  });
});
