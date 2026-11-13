import {
  matchesSearch,
  parseDeadline,
  byWeekday,
  CLASS_DAYS,
  checkItems,
  checkItemsPayload,
  dueThisWeek,
  newLegacySubId,
  paletteWith,
  plural,
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_INFO,
  PROJECT_COLORS,
  PROJECT_PRIORITIES,
  PROJECT_TODO_KIND_INFO,
  PROJECT_TODO_KINDS,
  projectCategoriesOf,
  projectCategoriesPatch,
  projectCategoryChoices,
  projectCategoryKey,
  projectCategoryLabel,
  PROJECT_CATEGORIES_MAX,
  projectMailLink,
  projectTodos,
  PROJECT_PRIORITY_INFO,
  PROJECT_STATUS_INFO,
  PROJECT_STATUSES,
  projectIdsByPriority,
  projectPriorityOf,
  projectProgress,
  projectsInOrder,
  projectStatusOf,
  safeColor,
  type LegacyClass,
  type LegacyMilestone,
  type LegacyProject,
  type LegacyProjectTodo,
  type LegacySubject,
  type ProjectCategory,
  type ProjectTodoKind,
  type ProjectPriority,
  type ProjectStatus,
} from '@dyc/core';
import { space } from '@dyc/tokens';
import { ArrowDownWideNarrow, CalendarClock, ChevronDown, ChevronUp, Clock, ExternalLink, Flag, Mail, Pencil, Plus, Send, Shapes } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { SearchBar, CheckList, ColorSwatches, Disclosure, Dot, DotChoices, FormActions, IconButton, Meter, Stats, ToolScreen, RemoveButton } from '../../components/tools';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Segmented, T, fonts } from '../../components/ui';
import { newId, useLegacyData, useLegacyList, useModule } from '../../lib/legacy';
import { useTheme } from '../../lib/theme';

type Project = LegacyProject & { milestones: LegacyMilestone[]; todos: LegacyProjectTodo[] };
type CategoryFilter = string;
const KIND_OPTIONS = PROJECT_TODO_KINDS.map((k) => ({ value: k, label: PROJECT_TODO_KIND_INFO[k].label }));
type Filter = 'todos' | 'curso' | 'entregado';
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'curso', label: 'En curso' },
  { value: 'entregado', label: 'Entregados' },
];
const STATUS_OPTIONS = PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_INFO[s].label }));
// Etiquetas cortas para que los tres estados quepan en una fila del teléfono.
const PRIORITY_OPTIONS = PROJECT_PRIORITIES.map((p) => ({ value: p, label: PROJECT_PRIORITY_INFO[p].label }));
const STATUS_SHORT: Record<ProjectStatus, string> = { curso: 'En curso', revision: 'Revisión', entregado: 'Entregado' };

export default function Projects() {
  const { colors } = useTheme();
  const legacy = useLegacyData();
  const raw = useLegacyList(legacy.data?.data, 'projects');
  const subjects = useLegacyList(legacy.data?.data, 'subjects');
  const classes = useLegacyList(legacy.data?.data, 'classes');
  // Orden «terminar primero»: el de la lista guardada, con los entregados al final.
  const projects = useMemo<Project[]>(() => projectsInOrder(raw.map((p) => ({ ...p, milestones: checkItems<LegacyMilestone>(p.milestones, newLegacySubId), todos: projectTodos(p, newLegacySubId) }))), [raw]);
  const actions = useModule('projects');
  const [filter, setFilter] = useState<Filter>('todos');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('todas');
  const [editing, setEditing] = useState<Project | 'new' | null>(null);

  const active = projects.filter((p) => projectStatusOf(p) !== 'entregado').length;
  const thisWeek = projects.filter((p) => dueThisWeek(p.deadline)).length;
  // Igual que la app anterior: «En curso» incluye los que están en revisión.
  const categories = projectCategoryChoices(projects).filter((c) => projects.some((p) => projectCategoriesOf(p).includes(c)));
  const uncategorized = projects.some((p) => !projectCategoriesOf(p).length);
  const shown = (filter === 'todos' ? projects : projects.filter((p) => (filter === 'entregado' ? projectStatusOf(p) === 'entregado' : projectStatusOf(p) !== 'entregado')))
    .filter((p) => category === 'todas' || (category === 'ninguna' ? !projectCategoriesOf(p).length : projectCategoriesOf(p).includes(category)))
    .filter((p) => {
      return matchesSearch(q, p.title, p.subject, p.deadline, ...projectCategoriesOf(p).map(projectCategoryLabel), p.email, ...p.milestones.map((m) => m.name), ...p.todos.map((t) => t.name));
    });
  const open = projects.filter((p) => projectStatusOf(p) !== 'entregado');

  // Sube o baja un proyecto pendiente un puesto; los entregados quedan al final.
  const move = (id: string, delta: -1 | 1) => {
    const ids = open.map((p) => p.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    actions.reorder([...ids, ...projects.filter((p) => projectStatusOf(p) === 'entregado').map((p) => p.id)]);
  };

  return (
    <ToolScreen
      title="Proyectos"
      refreshing={legacy.isRefetching}
      onRefresh={() => legacy.refetch()}
      right={<Button small label="Nuevo proyecto" icon={<Plus size={16} color={colors.onPrimary} />} onPress={() => setEditing('new')} disabled={!legacy.data} />}
    >
      {legacy.isPending ? (
        <Loading label="Cargando tus proyectos" />
      ) : legacy.isError ? (
        <ErrorState error={legacy.error} retry={() => legacy.refetch()} />
      ) : projects.length === 0 ? (
        <EmptyState title="Aún no tienes proyectos">Apunta tus trabajos y entregas, divídelos en hitos y sigue su progreso.</EmptyState>
      ) : (
        <>
          <Stats
            items={[
              { value: String(active), label: active === 1 ? 'Proyecto activo' : 'Proyectos activos' },
              { value: String(thisWeek), label: thisWeek === 1 ? 'Entrega esta semana' : 'Entregas esta semana' },
            ]}
          />
          <SearchBar label="Buscar en tus proyectos" value={q} onChange={setQ} placeholder="Buscar por nombre, categoría o pendiente…" count={shown.length} />
          <Segmented<Filter> label="Mostrar" options={FILTERS} value={filter} onChange={setFilter} />
          {categories.length > 0 && (
            <View style={st.chips} accessibilityLabel="Categoría">
              <Chip label="Todas" selected={category === 'todas'} onPress={() => setCategory('todas')} />
              {categories.map((c) => (
                <Chip key={c} label={projectCategoryLabel(c)} selected={category === c} onPress={() => setCategory(c)} />
              ))}
              {uncategorized && <Chip label="Sin categoría" selected={category === 'ninguna'} onPress={() => setCategory('ninguna')} />}
            </View>
          )}
          {open.length > 1 && filter !== 'entregado' && (
            <View style={{ gap: space[2] }}>
              <Button
                small
                variant="ghost"
                label="Ordenar por prioridad"
                icon={<ArrowDownWideNarrow size={16} color={colors.primary} />}
                onPress={() => actions.reorder(projectIdsByPriority(projects))}
              />
              <T v="small" tint="muted">
                El orden es el de «terminar primero»: sube o baja cada proyecto con las flechas.
              </T>
            </View>
          )}
          {shown.length === 0 ? (
            q.trim() ? null : (
              <EmptyState title="Nada por aquí con este filtro" />
            )
          ) : (
            shown.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                subjects={subjects}
                classes={classes}
                place={open.indexOf(p)}
                total={open.length}
                onMove={(d) => move(p.id, d)}
                onEdit={() => setEditing(p)}
              />
            ))
          )}
        </>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo proyecto' : 'Editar proyecto'}>
        {editing !== null && <ProjectForm project={editing === 'new' ? null : editing} count={projects.length} subjects={subjects} all={projects} onDone={() => setEditing(null)} />}
      </Sheet>
    </ToolScreen>
  );
}

function ProjectCard({
  project: p,
  subjects,
  classes,
  place,
  total,
  onMove,
  onEdit,
}: {
  project: Project;
  subjects: LegacySubject[];
  classes: LegacyClass[];
  /** Puesto en «terminar primero» (desde 0), o -1 si está entregado. */
  place: number;
  total: number;
  onMove: (d: -1 | 1) => void;
  onEdit: () => void;
}) {
  const { colors } = useTheme();
  const actions = useModule('projects');
  const [open, setOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [kind, setKind] = useState<ProjectTodoKind>('falta');
  const color = safeColor(p.color, PROJECT_COLORS[0]);
  const cats = projectCategoriesOf(p).map(projectCategoryLabel);
  const mailLink = projectMailLink(p);
  const missing = p.todos.filter((t) => t.kind === 'falta' && !t.done).length;
  const ideas = p.todos.filter((t) => t.kind === 'mejora' && !t.done).length;
  const title = p.title || 'Sin título';
  const status = projectStatusOf(p);
  const delivered = status === 'entregado';
  const priority = projectPriorityOf(p);
  const pct = projectProgress(p);
  const done = p.milestones.filter((m) => m.done).length;
  // La materia va por nombre; su primera clase de la semana, como en la app anterior.
  const subject = p.subject ? subjects.find((s) => s.name === p.subject) : undefined;
  const firstClass = subject ? classes.filter((c) => c.subject === subject.id).sort(byWeekday)[0] : undefined;
  const deadline = p.deadline?.trim() ? p.deadline : 'sin fecha';

  return (
    <Card style={[st.card, { borderLeftColor: color }]}>
      <View style={st.head}>
        {place >= 0 && (
          <View style={[st.place, { backgroundColor: color }]} accessible accessibilityLabel={`Puesto ${place + 1} de ${total}`}>
            <T v="small" style={{ color: '#0A0B09', fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }}>
              {place + 1}
            </T>
          </View>
        )}
        <T v="heading" accessibilityRole="header" tint={delivered ? 'muted' : 'ink'} style={{ flex: 1, fontSize: 19, lineHeight: 24 }}>
          {title}
        </T>
        <View style={{ flexDirection: 'row', marginRight: -space[2], marginTop: -space[2] }}>
          {place >= 0 && total > 1 && (
            <>
              <IconButton label={`Subir «${title}»`} onPress={() => onMove(-1)} disabled={place === 0}>
                <ChevronUp size={18} color={place === 0 ? colors.inkSubtle : colors.inkMuted} />
              </IconButton>
              <IconButton label={`Bajar «${title}»`} onPress={() => onMove(1)} disabled={place === total - 1}>
                <ChevronDown size={18} color={place === total - 1 ? colors.inkSubtle : colors.inkMuted} />
              </IconButton>
            </>
          )}
          <IconButton label={`Editar «${title}»`} onPress={onEdit}>
            <Pencil size={18} color={colors.inkMuted} />
          </IconButton>
          <RemoveButton module="projects" id={p.id} name={title} />
        </View>
      </View>
      <View style={{ gap: space[1], marginTop: -space[2] }}>
        {cats.length > 0 && (
          <View style={st.meta} accessible accessibilityLabel={`${cats.length === 1 ? 'Categoría' : 'Categorías'}: ${cats.join(', ')}`}>
            <Shapes size={15} color={colors.inkSubtle} />
            <T v="small" tint="muted">
              {cats.join(' · ')}
            </T>
          </View>
        )}
        {p.subject ? (
          <View
            style={st.meta}
            accessible
            accessibilityLabel={`Materia: ${p.subject}${firstClass ? `, primera clase ${CLASS_DAYS[firstClass.day - 1]} ${firstClass.start}` : ''}`}
          >
            <Dot color={color} size={8} />
            <T v="small" tint="muted">
              {p.subject}
            </T>
            {firstClass && (
              <>
                <T v="small" tint="subtle">
                  ·
                </T>
                <Clock size={13} color={colors.inkSubtle} />
                <T v="small" tint="subtle" style={{ fontVariant: ['tabular-nums'] }}>
                  {CLASS_DAYS[firstClass.day - 1]} {firstClass.start}
                </T>
              </>
            )}
          </View>
        ) : null}
        <View style={st.meta} accessible accessibilityLabel={`Prioridad ${PROJECT_PRIORITY_INFO[priority].label.toLowerCase()}`}>
          <Flag size={15} color={priority === 'alta' ? colors.danger : colors.inkSubtle} />
          <T v="small" tint={priority === 'alta' ? 'danger' : 'muted'} style={priority === 'alta' ? { fontFamily: fonts.semibold } : undefined}>
            Prioridad {PROJECT_PRIORITY_INFO[priority].label.toLowerCase()}
          </T>
        </View>
        <View style={st.meta} accessible accessibilityLabel={`Entrega: ${deadline}`}>
          <CalendarClock size={15} color={colors.inkSubtle} />
          <T v="small" tint="muted">
            Entrega · {deadline}
          </T>
        </View>
        {!!p.email && (
          <View style={st.meta} accessible accessibilityLabel={`Correo: ${p.email}`}>
            <Mail size={15} color={colors.inkSubtle} />
            <T v="small" tint="muted" style={{ flexShrink: 1 }}>
              {p.email}
            </T>
          </View>
        )}
      </View>
      {!!p.email && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {mailLink && (
            <Button
              small
              variant="secondary"
              label="Abrir el correo"
              accessibilityLabel={`Abrir el correo ${p.email}`}
              icon={<ExternalLink size={16} color={colors.primary} />}
              onPress={() => Linking.openURL(mailLink).catch(() => undefined)}
            />
          )}
          <Button small variant="ghost" label="Escribir" accessibilityLabel={`Escribir a ${p.email}`} icon={<Send size={16} color={colors.primary} />} onPress={() => Linking.openURL(`mailto:${p.email}`).catch(() => undefined)} />
        </View>
      )}
      <Segmented<ProjectStatus>
        label={`Estado de «${title}»`}
        options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: STATUS_SHORT[o.value], a11yLabel: o.label }))}
        value={status}
        onChange={(s) => actions.update(p.id, { status: s })}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ flex: 1 }}>
          <Meter value={pct} color={color} label={`Progreso de ${title}`} />
        </View>
        <T v="small" style={{ fontFamily: fonts.semibold, fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' }} importantForAccessibility="no" accessibilityElementsHidden>
          {pct} %
        </T>
      </View>
      <Disclosure
        label="Hitos"
        count={p.milestones.length ? `${done}/${p.milestones.length}` : undefined}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        a11yLabel={`Hitos de «${title}»${p.milestones.length ? `: ${done} de ${p.milestones.length} hechos` : ''}`}
      />
      {open && (
        <CheckList
          items={p.milestones}
          onChange={(milestones) => actions.update(p.id, { milestones: checkItemsPayload(milestones) })}
          owner={title}
          noun="hito"
          listLabel="Hitos"
          placeholder="Añadir hito"
          color={color}
          // `date` existe en el formato pero la app anterior siempre lo deja vacío.
          make={(name) => ({ id: newLegacySubId(), name, date: '', done: false })}
        />
      )}
      <Disclosure
        label="Por terminar"
        count={missing || ideas ? `${missing} ${missing === 1 ? 'falta' : 'faltan'} · ${plural(ideas, 'mejora', 'mejoras')}` : undefined}
        open={listOpen}
        onToggle={() => setListOpen((o) => !o)}
        a11yLabel={`Por terminar en «${title}»: ${missing} ${missing === 1 ? 'falta' : 'faltan'}, ${plural(ideas, 'mejora', 'mejoras')}`}
      />
      {listOpen && (
        <View style={{ gap: space[2] }}>
          <Segmented<ProjectTodoKind> label={`Lista de «${title}»`} options={KIND_OPTIONS} value={kind} onChange={setKind} />
          <CheckList
            items={p.todos.filter((t) => t.kind === kind)}
            onChange={(next) => actions.update(p.id, { todos: checkItemsPayload([...p.todos.filter((t) => t.kind !== kind), ...next]) })}
            owner={title}
            noun={PROJECT_TODO_KIND_INFO[kind].noun}
            listLabel={PROJECT_TODO_KIND_INFO[kind].label}
            placeholder={kind === 'falta' ? 'Qué falta para terminar' : 'Qué se podría mejorar'}
            color={color}
            make={(name) => ({ id: newLegacySubId(), name, done: false, kind })}
          />
        </View>
      )}
    </Card>
  );
}

function ProjectForm({ project, count, subjects, all, onDone }: { project: Project | null; count: number; subjects: LegacySubject[]; all: Project[]; onDone: () => void }) {
  const { colors } = useTheme();
  const actions = useModule('projects');
  const [title, setTitle] = useState(project?.title ?? '');
  const [subject, setSubject] = useState(project?.subject ?? '');
  const [deadline, setDeadline] = useState(project?.deadline ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project ? projectStatusOf(project) : 'curso');
  const pendingMilestones = checkItems<LegacyMilestone>(project?.milestones, () => '').filter((m) => !m.done).length;
  const [priority, setPriority] = useState<ProjectPriority>(project ? projectPriorityOf(project) : 'media');
  const [color, setColor] = useState(safeColor(project?.color, PROJECT_COLORS[count % PROJECT_COLORS.length]));
  const [cats, setCats] = useState<string[]>(project ? projectCategoriesOf(project) : []);
  const [newCat, setNewCat] = useState('');
  const choices = [...new Set([...projectCategoryChoices(all), ...cats])];
  const toggleCat = (c: string) => setCats((list) => (list.includes(c) ? list.filter((x) => x !== c) : list.length >= PROJECT_CATEGORIES_MAX ? list : [...list, c]));
  const addCat = () => {
    const c = projectCategoryKey(newCat);
    if (c && !cats.includes(c) && cats.length < PROJECT_CATEGORIES_MAX) setCats([...cats, c]);
    setNewCat('');
  };
  const [email, setEmail] = useState(project?.email ?? '');
  const [mailUrl, setMailUrl] = useState(project?.mailUrl ?? '');
  const badEmail = !!email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const badMailUrl = !!mailUrl.trim() && !/^https?:\/\/\S+\.\S+/i.test(mailUrl.trim());
  const named = subjects.filter((s): s is LegacySubject => typeof s.name === 'string' && !!s.name);
  const unknown = !!subject && !named.some((s) => s.name === subject);

  const pickSubject = (name: string) => {
    setSubject(name);
    // Como la app anterior: el proyecto toma el color de su materia.
    const s = subjects.find((x) => x.name === name);
    if (s) setColor(safeColor(s.color, color));
  };

  const submit = () => {
    if (badEmail || badMailUrl) return;
    const fields = { title: title.trim(), subject, deadline: deadline.trim(), status, priority, color, ...projectCategoriesPatch(cats), email: email.trim(), mailUrl: mailUrl.trim() };
    if (project) actions.update(project.id, fields);
    else actions.add({ id: newId(), ...fields, milestones: [], todos: [] });
    onDone();
  };

  const n = project?.milestones.length ?? 0;
  return (
    <ScrollView style={{ maxHeight: 600 }} contentContainerStyle={{ gap: space[4] }} keyboardShouldPersistTaps="handled">
      <Field label="Nombre" value={title} onChangeText={setTitle} maxLength={200} placeholder="Ensayo de Historia" autoFocus={!project} />
      <View style={{ gap: space[2] }}>
        <T v="label">Categorías</T>
        <T v="small" tint="muted">Elige una o varias; puedes agregar las tuyas.</T>
        <View style={st.chips} accessibilityLabel="Categorías">
          {choices.map((c) => (
            <Chip key={c} label={projectCategoryLabel(c)} selected={cats.includes(c)} onPress={() => toggleCat(c)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Field label="Agregar categoría" value={newCat} onChangeText={setNewCat} maxLength={40} placeholder="Escribe una categoría nueva" onSubmitEditing={addCat} returnKeyType="done" />
          </View>
          <Button small variant="secondary" label="Agregar" onPress={addCat} disabled={!newCat.trim() || cats.length >= PROJECT_CATEGORIES_MAX} />
        </View>
      </View>
      <View style={{ gap: space[1] }}>
        <DotChoices
          legend="Materia"
          value={subject}
          onChange={pickSubject}
          options={[
            { value: '', label: 'Sin materia', color: colors.inkSubtle },
            ...named.map((s) => ({ value: s.name, label: s.name, color: safeColor(s.color, colors.inkSubtle) })),
            ...(unknown ? [{ value: subject, label: subject, color: colors.inkSubtle }] : []),
          ]}
        />
        {unknown && (
          <T v="small" tint="muted">
            Esta materia ya no está en tu lista.
          </T>
        )}
      </View>
      <Field
        label="Entrega (opcional)"
        value={deadline}
        onChangeText={setDeadline}
        maxLength={60}
        placeholder="20 SEP"
        hint={deadline.trim() && !parseDeadline(deadline) ? 'No entendí la fecha: no contará en «Entregas esta semana». Prueba «20 SEP», «20/12» o «viernes».' : 'Escríbela como quieras: «20 SEP», «20/12», «viernes»…'}
      />
      <View style={{ gap: space[2] }}>
        <T v="label">Estado</T>
        <Segmented<ProjectStatus>
          label="Estado"
          options={STATUS_OPTIONS.map((o) => ({
            value: o.value,
            label: STATUS_SHORT[o.value],
            a11yLabel: o.label,
          }))}
          value={status}
          onChange={setStatus}
        />
        {status === 'entregado' && pendingMilestones > 0 && (
          <T v="small" tint="muted">
            Ojo: {pendingMilestones === 1 ? 'falta 1 hito' : `faltan ${pendingMilestones} hitos`} por marcar.
          </T>
        )}
      </View>
      <View style={{ gap: space[2] }}>
        <T v="label">Prioridad</T>
        <Segmented<ProjectPriority> label="Prioridad" options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} />
      </View>
      <Field
        label="Correo del sitio (opcional)"
        value={email}
        onChangeText={setEmail}
        maxLength={200}
        placeholder="contacto@misitio.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        error={badEmail ? 'Escribe un correo completo, por ejemplo contacto@misitio.com' : null}
        hint="Aparece en la tarjeta con «Abrir el correo» y «Escribir»."
      />
      {!!email.trim() && (
        <Field
          label="Enlace para abrir el correo (opcional)"
          value={mailUrl}
          onChangeText={setMailUrl}
          maxLength={500}
          placeholder={projectMailLink({ email }) ?? 'https://misitio.com/webmail'}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          error={badMailUrl ? 'Pega un enlace completo, por ejemplo https://misitio.com/webmail' : null}
          hint="Si lo dejas vacío se abre el webmail del dominio (cPanel). Pon otro si usas Gmail, Outlook o Zoho."
        />
      )}
      <ColorSwatches legend="Color" colors={paletteWith(PROJECT_COLORS, color)} value={color} onChange={setColor} />
      <FormActions
        submitLabel={project ? 'Guardar' : 'Añadir proyecto'}
        onSubmit={submit}
        disabled={!title.trim() || badEmail || badMailUrl}
        onDelete={
          project
            ? () => {
                actions.remove(project.id);
                onDone();
              }
            : undefined
        }
        confirm={`Se borrará «${project?.title || 'el proyecto'}»${n ? ` con ${plural(n, 'hito', 'hitos')}` : ''}.`}
      />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  card: { borderLeftWidth: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  place: { minWidth: 26, height: 26, paddingHorizontal: 6, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: -1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
