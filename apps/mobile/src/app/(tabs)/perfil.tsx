import { deviceTimeZone, PILLAR_IDS, type PillarId } from '@dyc/core';
import { space, touchTarget } from '@dyc/tokens';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { LogOut } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { pillarShort } from '../../components/pillar';
import { Sheet } from '../../components/Sheet';
import { Toggle } from '../../components/tools';
import { Button, Card, Chip, ErrorState, errorMessage, Field, Loading, PageHeader, Screen, Segmented, SectionHeader, T } from '../../components/ui';
import { api, useAuth } from '../../lib/api';
import { DEFAULT_REMINDER, notificationsSupported, readReminder, REMINDER_TIMES, setReminder, type ReminderPrefs } from '../../lib/notifications';
import { keys, useProfile } from '../../lib/queries';
import { useTheme, type ThemePreference } from '../../lib/theme';
import { useToast } from '../../lib/toast';
import { useSignOut } from '../../lib/useSignOut';

export default function ProfileScreen() {
  const session = useAuth();
  const { colors } = useTheme();
  const signOut = useSignOut();
  const [leaving, setLeaving] = useState(false);
  const user = session.status === 'signedIn' ? session.user : null;

  return (
    <Screen>
      <PageHeader eyebrow="Perfil" title={user?.name || 'Tu perfil'} />
      {user && (
        <T v="body" tint="muted" style={{ marginTop: -space[4] }}>
          {user.email}
        </T>
      )}
      <FocusSection />
      <PreferencesSection />
      {notificationsSupported && <ReminderSection />}
      <AccountSection />
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
      <SectionHeader title="Tu enfoque" />
      <T v="small" tint="muted">
        Pilares en los que te enfocas (hasta 3)
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
