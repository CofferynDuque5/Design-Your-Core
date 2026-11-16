import { AVATARS, avatarById, HHMM_RE, MEALS, MEAL_LABEL, normalizeHHMM, positiveMessage, WATER_EVERY, waterTimes, CONTACT_EMAIL, PLAN_NAME, deviceTimeZone, PILLAR_IDS, type PillarId } from '@dyc/core';
import { space, touchTarget } from '@dyc/tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { LogOut, Mail, Pencil } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { AvatarArt, UserAvatar } from '../../components/Avatar';
import { pillarShort } from '../../components/pillar';
import { Sheet } from '../../components/Sheet';
import { TimeField, Toggle } from '../../components/tools';
import { Button, Card, Chip, ErrorState, errorMessage, Field, Loading, PageHeader, Screen, Segmented, SectionHeader, T, fonts } from '../../components/ui';
import { api, useAuth } from '../../lib/api';
import { CLASS_LEADS, DEFAULT_NOTIFY, type NotifyPrefs } from '@dyc/core';
import { DEFAULT_REMINDER, notificationsSupported, onNotifyChange, readNotify, readReminder, REMINDER_TIMES, setReminder, setToolNotifications, type ReminderPrefs } from '../../lib/notifications';
import { keys, useProfile } from '../../lib/queries';
import { useTheme, type ThemePreference } from '../../lib/theme';
import { useToast } from '../../lib/toast';
import { useSignOut } from '../../lib/useSignOut';
import { openOnWeb } from '../../lib/web';

export default function ProfileScreen() {
  const session = useAuth();
  const { colors } = useTheme();
  const signOut = useSignOut();
  const [leaving, setLeaving] = useState(false);
  const user = session.status === 'signedIn' ? session.user : null;

  return (
    <Screen>
      <PageHeader eyebrow="Perfil" title="Tu perfil" />
      <ProfileHero name={user?.name ?? ''} email={user?.email ?? ''} />
      <PlanSection />
      <FocusSection />
      <PreferencesSection />
      {notificationsSupported && <ReminderSection />}
      {notificationsSupported && <ToolNotifySection />}
      <AccountSection />
      <Button
        variant="ghost"
        label={`Escríbenos: ${CONTACT_EMAIL}`}
        icon={<Mail size={18} color={colors.primary} />}
        onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
      />
      <Button
        variant="secondary"
        label="Cerrar sesión"
        icon={<LogOut size={18} color={colors.primary} />}
        busy={leaving}
        onPress={async () => {
          setLeaving(true);
          await signOut();
        }}
      />
      <T v="small" tint="subtle" style={{ textAlign: 'center' }}>
        Design Your Core {Constants.expoConfig?.version ?? ''}
      </T>
    </Screen>
  );
}

/** Tu personaje (foto de perfil dibujada) y tu nombre. */
function ProfileHero({ name, email }: { name: string; email: string }) {
  const { colors } = useTheme();
  const profile = useProfile();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const current = profile.data?.avatar ?? '';
  const save = useMutation({
    mutationFn: (avatar: string) => api.profile.update({ avatar }),
    onSuccess: (p) => {
      qc.setQueryData(keys.profile, p);
      const a = avatarById(p.avatar);
      toast(a ? `Ahora eres ${a.name}.` : 'Vuelves a tus iniciales.');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  const shown = save.isPending ? (save.variables ?? current) : current;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cambiar tu personaje" onPress={() => setOpen((v) => !v)} style={{ borderRadius: 60, borderWidth: 3, borderColor: colors.primary, padding: 2 }}>
          <UserAvatar avatar={shown} name={name} size={92} />
          <View style={{ position: 'absolute', right: 0, bottom: 0, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.surface }}>
            <Pencil size={13} color={colors.onPrimary} />
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: space[1] }}>
          <T v="title" style={{ fontSize: 24, lineHeight: 28 }}>
            {name || 'Tu perfil'}
          </T>
          <T v="small" tint="muted">
            {email}
          </T>
          <Button small variant="secondary" label={avatarById(shown) ? 'Cambiar personaje' : 'Elegir personaje'} onPress={() => setOpen((v) => !v)} />
        </View>
      </View>
      {open && (
        <View accessibilityRole="radiogroup" accessibilityLabel="Elige tu personaje" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], paddingTop: space[3], borderTopWidth: 1, borderTopColor: colors.line }}>
          {[...AVATARS.map((a) => ({ id: a.id, name: a.name, art: <AvatarArt avatar={a} size={60} /> })), { id: '', name: 'Iniciales', art: <UserAvatar name={name} size={60} /> }].map((a) => {
            const on = a.id === '' ? !avatarById(shown) : shown === a.id;
            return (
              <Pressable
                key={a.id || 'ini'}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={a.name}
                disabled={save.isPending}
                onPress={() => save.mutate(a.id)}
                style={{ width: '30%', flexGrow: 1, alignItems: 'center', gap: space[1], padding: space[2], borderRadius: 14, borderWidth: 2, borderColor: on ? colors.primary : 'transparent', backgroundColor: on ? colors.primarySoft : 'transparent' }}
              >
                {a.art}
                <T v="small" style={{ fontFamily: on ? fonts.medium : undefined }}>
                  {a.name}
                </T>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}

/** Tu plan. El pago se hace en el panel web (Planes), con los datos de cada método. */
function PlanSection() {
  const billing = useQuery({ queryKey: ['billing'], queryFn: api.billing.get });
  const b = billing.data;
  const pending = b?.requests.some((r) => r.status === 'pendiente');
  const text = !b
    ? 'Planes Pro, Pareja y Estudiante.'
    : pending
      ? 'Tu pago está en revisión. Cuando se apruebe, tu plan se activa solo.'
      : b.plan === 'gratis'
        ? 'Pásate a Pro para tener todas las herramientas sin límites.'
        : `Activo hasta el ${new Date(b.planUntil ?? '').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
  return (
    <Card>
      <SectionHeader title={b ? `Tu plan: ${PLAN_NAME[b.plan]}` : 'Tu plan'} />
      <T v="small" tint="muted">
        {text}
      </T>
      <Button small label={b && b.plan !== 'gratis' ? 'Renovar o cambiar' : 'Ver planes y pagar'} onPress={() => void openOnWeb('/planes')} style={{ alignSelf: 'flex-start' }} />
      {b?.admin && <Button small variant="secondary" label="Administrar pagos" onPress={() => void openOnWeb('/admin/pagos')} style={{ alignSelf: 'flex-start' }} />}
    </Card>
  );
}

function FocusSection() {
  const profile = useProfile();
  const qc = useQueryClient();
  const toast = useToast();
  const [focus, setFocus] = useState<PillarId[]>([]);
  const [intention, setIntention] = useState('');

  useEffect(() => {
    if (!profile.data) return;
    setFocus(profile.data.focusPillars);
    setIntention(profile.data.intention ?? '');
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => api.profile.update({ focusPillars: focus, intention: intention.trim() }),
    onSuccess: (p) => {
      qc.setQueryData(keys.profile, p);
      qc.invalidateQueries({ queryKey: ['insights'] });
      toast('Enfoque guardado.');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  if (profile.isPending) return <Loading />;
  if (profile.isError) return <ErrorState error={profile.error} retry={() => profile.refetch()} />;
  const toggle = (p: PillarId) => setFocus((f) => (f.includes(p) ? f.filter((x) => x !== p) : f.length >= 3 ? f : [...f, p]));

  return (
    <Card>
      <SectionHeader title="Tus prioridades" />
      <T v="small" tint="muted">
        Pilares que son tu prioridad (hasta 3)
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {PILLAR_IDS.map((p) => (
          <Chip key={p} label={pillarShort(p)} selected={focus.includes(p)} onPress={() => toggle(p)} />
        ))}
      </View>
      <Field label="Tu intención" value={intention} onChangeText={setIntention} maxLength={280} multiline />
      <Button small variant="secondary" label="Guardar" onPress={() => save.mutate()} busy={save.isPending} disabled={!focus.length} style={{ alignSelf: 'flex-start' }} />
    </Card>
  );
}

function PreferencesSection() {
  const { preference, setPreference } = useTheme();
  const profile = useProfile();
  const qc = useQueryClient();
  const toast = useToast();
  const device = deviceTimeZone();
  const saveTz = useMutation({
    mutationFn: () => api.profile.update({ timezone: device }),
    onSuccess: (p) => {
      qc.setQueryData(keys.profile, p);
      qc.invalidateQueries();
      toast('Zona horaria actualizada.');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  const tz = profile.data?.timezone;

  return (
    <Card>
      <SectionHeader title="Preferencias" />
      <T v="label">Apariencia</T>
      <Segmented<ThemePreference>
        label="Apariencia"
        value={preference}
        onChange={setPreference}
        options={[
          { value: 'system', label: 'Sistema' },
          { value: 'light', label: 'Claro' },
          { value: 'dark', label: 'Oscuro' },
        ]}
      />
      {tz && (
        <View style={{ gap: space[2] }}>
          <T v="label">Zona horaria</T>
          <T v="small" tint="muted">
            {tz === device ? `${tz}. Coincide con la de este teléfono.` : `Tu cuenta usa ${tz}, pero este teléfono está en ${device}. Los días se cuentan con la de tu cuenta.`}
          </T>
          {tz !== device && <Button small variant="secondary" label={`Usar ${device}`} onPress={() => saveTz.mutate()} busy={saveTz.isPending} style={{ alignSelf: 'flex-start' }} />}
        </View>
      )}
    </Card>
  );
}

function ReminderSection() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_REMINDER);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    readReminder().then(setPrefs);
  }, []);

  const apply = async (next: ReminderPrefs) => {
    setBusy(true);
    setPrefs(next);
    try {
      const result = await setReminder(next);
      if (result === 'denied') {
        setPrefs({ ...next, enabled: false });
        toast('Activa las notificaciones de Design Your Core en los ajustes del teléfono.', { tone: 'error' });
      } else if (result === 'scheduled') {
        toast(`Te lo recordaremos cada día a las ${next.time}.`);
      }
    } catch {
      toast('No se pudo programar el recordatorio.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget }}>
        <View style={{ flex: 1 }}>
          <T v="heading">Recordatorio diario</T>
          <T v="small" tint="muted">
            Un aviso para hacer tu check-in. Funciona sin conexión.
          </T>
        </View>
        <Toggle label="Recordatorio diario" value={prefs.enabled} disabled={busy} onChange={(enabled) => apply({ ...prefs, enabled })} />
      </View>
      {prefs.enabled && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }} accessibilityLabel="Hora del recordatorio">
          {REMINDER_TIMES.map((t) => (
            <Chip key={t} label={t} selected={prefs.time === t} onPress={() => apply({ ...prefs, time: t })} />
          ))}
        </View>
      )}
    </Card>
  );
}

function ToolNotifySection() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_NOTIFY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    readNotify().then(setPrefs);
    return onNotifyChange(setPrefs);
  }, []);
  const apply = async (next: NotifyPrefs) => {
    setBusy(true);
    setPrefs(next);
    try {
      const result = await setToolNotifications(next);
      if (result === 'denied') toast('Activa las notificaciones de Design Your Core en los ajustes del teléfono.', { tone: 'error' });
      else if (result === 'on' && !prefs.enabled) toast('Listo: te avisaremos aunque la app esté cerrada.');
    } catch {
      toast('No se pudieron programar los avisos.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget }}>
        <View style={{ flex: 1 }}>
          <T v="heading">Avisos de tus herramientas</T>
          <T v="small" tint="muted">
            Notificaciones de tus clases, cursos, recordatorios y tareas. Llegan aunque la app esté cerrada y sin conexión.
          </T>
        </View>
        <Toggle label="Avisos de tus herramientas" value={prefs.enabled} disabled={busy} onChange={(enabled) => apply({ ...prefs, enabled })} />
      </View>
      {prefs.enabled && (
        <View style={{ gap: space[2] }}>
          <ToggleRow label="Clases y cursos del Horario" value={prefs.classes} disabled={busy} onChange={(classes) => apply({ ...prefs, classes })} />
          {prefs.classes && (
            <View style={{ gap: space[2] }}>
              <T v="small" tint="muted">
                Avisarme antes de empezar
              </T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }} accessibilityLabel="Minutos de antelación">
                {CLASS_LEADS.map((m) => (
                  <Chip key={m} label={m === 0 ? 'A la hora' : `${m} min`} selected={prefs.classLead === m} onPress={() => apply({ ...prefs, classLead: m })} />
                ))}
              </View>
            </View>
          )}
          <ToggleRow label="Recordatorios del Calendario" value={prefs.reminders} disabled={busy} onChange={(reminders) => apply({ ...prefs, reminders })} />
          <ToggleRow label="Tareas de la Agenda con aviso" value={prefs.tasks} disabled={busy} onChange={(tasks) => apply({ ...prefs, tasks })} />
          <ToggleRow label="Rutinas y cuidados de mascotas" value={prefs.routines} disabled={busy} onChange={(routines) => apply({ ...prefs, routines })} />
          <T v="label" accessibilityRole="header" style={{ marginTop: space[2] }}>
            Cuidarte
          </T>
          <ToggleRow label="Recordarme comer a mis horas" value={prefs.meals} disabled={busy} onChange={(meals) => apply({ ...prefs, meals })} />
          {prefs.meals && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {MEALS.map((m) => (
                <View key={m} style={{ flexBasis: '45%', flexGrow: 1 }}>
                  <CareTime label={MEAL_LABEL[m]} value={prefs.mealTimes[m]} optional onCommit={(v) => apply({ ...prefs, mealTimes: { ...prefs.mealTimes, [m]: v } })} />
                </View>
              ))}
            </View>
          )}
          <ToggleRow label="Recordarme tomar agua" value={prefs.water} disabled={busy} onChange={(water) => apply({ ...prefs, water })} />
          {prefs.water && (
            <View style={{ gap: space[2] }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }} accessibilityLabel="Cada cuánto tomar agua">
                {WATER_EVERY.map((h) => (
                  <Chip key={h} label={h === 1 ? 'Cada hora' : `Cada ${h} horas`} selected={prefs.waterEvery === h} onPress={() => apply({ ...prefs, waterEvery: h })} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: space[2] }}>
                <View style={{ flex: 1 }}>
                  <CareTime label="Desde" value={prefs.waterFrom} onCommit={(waterFrom) => waterFrom && apply({ ...prefs, waterFrom })} />
                </View>
                <View style={{ flex: 1 }}>
                  <CareTime label="Hasta" value={prefs.waterTo} onCommit={(waterTo) => waterTo && apply({ ...prefs, waterTo })} />
                </View>
              </View>
              <T v="small" tint="muted">
                {waterTimes(prefs.waterFrom, prefs.waterTo, prefs.waterEvery).join(' · ') || 'Elige un «Hasta» después del «Desde».'}
              </T>
            </View>
          )}
          <ToggleRow label="Un mensaje positivo cada día" value={prefs.cheers} disabled={busy} onChange={(cheers) => apply({ ...prefs, cheers })} />
          {prefs.cheers && (
            <View style={{ gap: space[1] }}>
              <CareTime label="A qué hora" value={prefs.cheerTime} onCommit={(cheerTime) => cheerTime && apply({ ...prefs, cheerTime })} />
              <T v="small" tint="muted">
                Hoy: «{positiveMessage()}»
              </T>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

/** Una hora de aviso: se guarda al quedar completa (HH:MM), no con cada tecla. Vacía, si es opcional, apaga ese aviso. */
function CareTime({ label, value, optional, onCommit }: { label: string; value: string; optional?: boolean; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <TimeField
      label={label}
      value={draft}
      optional={optional}
      hint={optional && !draft ? 'Sin aviso' : undefined}
      onChange={(v) => {
        setDraft(v);
        const t = normalizeHHMM(v);
        if (HHMM_RE.test(t) && t !== value) onCommit(t);
        else if (optional && !v.trim() && value) onCommit('');
      }}
    />
  );
}

function ToggleRow({ label, value, disabled, onChange }: { label: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget }}>
      <T v="body" style={{ flex: 1 }}>
        {label}
      </T>
      <Toggle label={label} value={value} disabled={disabled} onChange={onChange} />
    </View>
  );
}

function AccountSection() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const signOut = useSignOut();
  const remove = useMutation({
    mutationFn: () => api.account.remove(password),
    onSuccess: () => signOut(),
  });

  return (
    <Card>
      <SectionHeader title="Tu cuenta" />
      <T v="small" tint="muted">
        Puedes descargar tus datos desde la versión web. Si eliminas la cuenta se borran tus registros, hábitos y retos de forma permanente.
      </T>
      <Button small variant="ghost" label="Eliminar mi cuenta" onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} />
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setPassword('');
          remove.reset();
        }}
        title="Eliminar tu cuenta"
      >
        <T v="body">Se borrarán todos tus datos y no se pueden recuperar. Escribe tu contraseña para confirmarlo.</T>
        <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" error={remove.error ? errorMessage(remove.error) : null} />
        <Button variant="danger" label="Eliminar definitivamente" onPress={() => remove.mutate()} busy={remove.isPending} disabled={!password} />
      </Sheet>
    </Card>
  );
}
