import type { LegacyData } from '@dyc/core';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';
import { auth } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { fakeModules, tokens } from './fakeApi';

// Cursos (nuevo) y la cuadrícula del Horario en el móvil.

const reset = () => (SecureStore as unknown as { __reset: () => void }).__reset();

function legacyDoc(over: Partial<LegacyData> = {}): LegacyData {
  return {
    courses: [
      { id: 'cr1', topic: 'Inglés', title: 'Inglés básico', url: 'https://www.youtube.com/watch?v=abc', status: 'curso', notes: 'Lección 6' },
      { id: 'cr2', topic: 'Inglés', title: '', url: 'https://www.udemy.com/course/ingles/', status: 'pendiente', notes: '' },
      { id: 'cr3', topic: 'React', title: 'Hooks', url: '', status: 'hecho', notes: '' },
    ],
    ...over,
  } as unknown as LegacyData;
}

const writes = (api: ReturnType<typeof fakeModules>) => api.calls.filter((c) => c.method !== 'GET');

describe('Cursos y Horario en el móvil', () => {
  beforeEach(async () => {
    reset();
    queryClient.clear();
    await auth.signIn(tokens());
  });
  afterEach(() => {
    jest.restoreAllMocks();
    queryClient.clear();
  });

  it('Cursos: agrupa por tema, abre el enlace, cambia el estado y añade uno nuevo', async () => {
    const api = fakeModules(legacyDoc());
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderRouter('./src/app', { initialUrl: '/cursos' });
    expect(await screen.findByRole('header', { name: 'Inglés' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'React' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('link', { name: 'Curso en Udemy, en Udemy. Abrir' }));
    expect(openURL).toHaveBeenCalledWith('https://www.udemy.com/course/ingles/');
    // Sin nombre, se muestra la plataforma.
    expect(screen.getByRole('link', { name: 'Curso en Udemy, en Udemy. Abrir' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Estado de «Curso en Udemy»: Por ver. Cambiar a Viendo' }));
    await waitFor(() => expect(writes(api).at(-1)).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/courses/cr2', body: { status: 'curso' } }));

    fireEvent.press(screen.getByRole('button', { name: 'Nuevo curso' }));
    fireEvent.changeText(await screen.findByLabelText('Tema'), 'Guitarra');
    fireEvent.changeText(screen.getByLabelText('Enlace (opcional)'), 'javascript:alert(1)');
    expect(screen.getByRole('button', { name: 'Añadir curso' })).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Enlace (opcional)'), 'youtu.be/xyz');
    expect(screen.getByText('Se abrirá en YouTube.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Añadir curso' }));
    await waitFor(() =>
      expect(writes(api).at(-1)).toMatchObject({ method: 'POST', path: '/api/v2/modules/courses', body: { item: { topic: 'Guitarra', url: 'https://youtu.be/xyz', title: '', status: 'pendiente' } } }),
    );
    expect(await screen.findByRole('header', { name: 'Guitarra' })).toBeOnTheScreen();
  });

  it('Cursos: el video de YouTube se ve aquí y guarda dónde lo pausaste', async () => {
    const api = fakeModules(legacyDoc({ courses: [{ id: 'cr1', topic: 'Inglés', title: 'Inglés básico', url: 'https://www.youtube.com/watch?v=abcdefghijk', status: 'curso', notes: '', position: 300, duration: 1200 }] as unknown as LegacyData['courses'] }));
    renderRouter('./src/app', { initialUrl: '/cursos' });
    expect(await screen.findByText('Vas en 5:00 de 20:00')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Continuar «Inglés básico» aquí' }));
    expect(await screen.findByLabelText('Video: Inglés básico')).toBeOnTheScreen();
    const wv = jest.requireMock<{ __send: (o: unknown) => void }>('react-native-webview');
    act(() => wv.__send({ type: 'progress', position: 605, duration: 1200, video: 'abcdefghijk', index: 0, count: 1 }));
    await waitFor(() =>
      expect(writes(api).at(-1)).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/courses/cr1', body: { position: 605, duration: 1200, progress: 50, status: 'curso' } }),
    );
    expect(await screen.findByText('Guardado: Vas en 10:05 de 20:00.')).toBeOnTheScreen();
  });

  it('Cursos: anota el avance de Udemy y lo agrega al horario', async () => {
    const api = fakeModules(legacyDoc());
    renderRouter('./src/app', { initialUrl: '/cursos' });
    fireEvent.press(await screen.findByRole('button', { name: 'Anotar avance de «Curso en Udemy»' }));
    fireEvent.changeText(await screen.findByLabelText('Dónde lo dejaste (opcional)'), 'Módulo 3');
    fireEvent.press(screen.getByRole('radio', { name: '40 %' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar avance' }));
    await waitFor(() => expect(writes(api).at(-1)).toMatchObject({ method: 'PATCH', path: '/api/v2/modules/courses/cr2', body: { spot: 'Módulo 3', progress: 40, status: 'curso' } }));

    fireEvent.press(screen.getByRole('button', { name: 'Agregar «Inglés básico» al horario' }));
    expect(screen.getByRole('button', { name: 'Agregar al horario' })).toBeDisabled();
    fireEvent.press(await screen.findByRole('checkbox', { name: 'lunes' }));
    fireEvent.press(screen.getByRole('checkbox', { name: 'miércoles' }));
    fireEvent.press(screen.getByRole('button', { name: 'Agregar al horario' }));
    await waitFor(() => expect(writes(api).filter((c) => c.path === '/api/v2/modules/classes')).toHaveLength(2));
    expect(writes(api).filter((c) => c.path === '/api/v2/modules/classes')[0]).toMatchObject({ method: 'POST', body: { item: { day: 1, start: '18:00', end: '19:00', title: 'Inglés básico', room: 'YouTube', course: 'cr1' } } });
    expect(await screen.findByRole('link', { name: 'En tu horario: Lun y Mié 18:00' })).toBeOnTheScreen();
  });

  it('Horario: una clase de un curso lo abre', async () => {
    fakeModules(legacyDoc({ classes: [{ id: 'k1', title: 'Curso en Udemy', day: 2, start: '18:00', end: '19:00', room: 'Udemy', color: '#4F7CFF', subject: '', course: 'cr2' }] as unknown as LegacyData['classes'] }));
    renderRouter('./src/app', { initialUrl: '/horario' });
    fireEvent.press(await screen.findByRole('button', { name: /^Martes: Curso en Udemy/ }));
    fireEvent.press(await screen.findByRole('button', { name: 'Abrir el curso' }));
    expect(await screen.findByLabelText('Dónde lo dejaste (opcional)')).toBeOnTheScreen();
  });

  it('Cursos vacío invita a añadir el primero', async () => {
    fakeModules(legacyDoc({ courses: [] }));
    renderRouter('./src/app', { initialUrl: '/cursos' });
    expect(await screen.findByText('Anota lo que quieres aprender')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Añadir el primero' }));
    expect(await screen.findByLabelText('Tema')).toBeOnTheScreen();
  });

  it('Horario: la cuadrícula se ve vacía y dibuja clases antiguas con «8:00»', async () => {
    fakeModules(legacyDoc({ classes: [{ id: 'old', title: 'Química', day: '2', start: '8:00', end: '9:30', room: '', color: '#4F7CFF', subject: '' }] as unknown as LegacyData['classes'] }));
    const view = renderRouter('./src/app', { initialUrl: '/horario' });
    expect(await screen.findByRole('button', { name: 'Martes: Química, martes de 08:00 a 09:30. Editar' })).toBeOnTheScreen();
    expect(screen.queryByText('Tu horario está vacío')).toBeNull();
    view.unmount();
    queryClient.clear();

    fakeModules(legacyDoc({ classes: [] }));
    renderRouter('./src/app', { initialUrl: '/horario' });
    expect(await screen.findByText('Tu horario está vacío')).toBeOnTheScreen();
    // La cuadrícula sigue ahí, con sus horas (de 7 a 21) para ver la semana.
    expect(screen.getByText('7', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('20', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});
