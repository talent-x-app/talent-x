import {
  createManualRecord,
  type ManualRecordRequest,
  type ManualRecordRequestFamily,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button, Card, Chip } from '../components/ui';
import { useToast } from '../feedback';
import { MY_RECORDS_QUERY_KEY } from './records-query';

type ParamKind = 'distance' | 'throws' | 'discipline' | 'none';

/** Familles d'épreuve proposées (ADR-32) + nature du paramètre contextuel. */
const FAMILIES: { value: ManualRecordRequestFamily; label: string; param: ParamKind }[] = [
  { value: 'sprint', label: 'Sprint', param: 'distance' },
  { value: 'hurdles', label: 'Haies', param: 'distance' },
  { value: 'endurance', label: 'Endurance', param: 'distance' },
  { value: 'interval', label: 'Intervalles', param: 'distance' },
  { value: 'jumps', label: 'Saut', param: 'none' },
  { value: 'vertical', label: 'Vertical', param: 'discipline' },
  { value: 'throws', label: 'Lancer', param: 'throws' },
];

const TIMED = new Set<ManualRecordRequestFamily>(['sprint', 'hurdles', 'endurance', 'interval']);

/**
 * Éditeur de record **manuel** (A-07 — TLX-116, ADR-32). L'athlète décrit l'épreuve (famille +
 * paramètre contextuel), saisit une marque libre et une date facultative ; `POST /athletes/me/records`
 * compose la clé canonique côté serveur (même `eventKey` que la détection auto) et remplace la marque.
 */
export function ManualRecordEditor() {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [family, setFamily] = useState<ManualRecordRequestFamily>('sprint');
  const [distance, setDistance] = useState('');
  const [implementKg, setImplementKg] = useState('');
  const [discipline, setDiscipline] = useState<'high' | 'pole'>('high');
  const [value, setValue] = useState('');
  const [achievedAt, setAchievedAt] = useState('');

  const paramKind = FAMILIES.find((f) => f.value === family)!.param;
  const isTimed = TIMED.has(family);

  const reset = () => {
    setOpen(false);
    setDistance('');
    setImplementKg('');
    setValue('');
    setAchievedAt('');
  };

  const mutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const body: ManualRecordRequest = { family, value: Number(value.replace(',', '.')) };
      if (paramKind === 'distance') body.distanceMeters = Number(distance);
      if (paramKind === 'throws') body.implementKg = Number(implementKg.replace(',', '.'));
      if (paramKind === 'discipline') body.discipline = discipline;
      if (achievedAt.trim()) body.achievedAt = achievedAt.trim();
      const res = await createManualRecord(body);
      if (res.status === 200) return;
      throw res;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MY_RECORDS_QUERY_KEY });
      toast.show({ title: 'Record enregistré', variant: 'success' });
      reset();
    },
    onError: () =>
      toast.show({
        title: 'Enregistrement impossible',
        description: 'Vérifie l’épreuve et la marque.',
        variant: 'danger',
      }),
  });

  // Validité minimale : marque > 0 + paramètre requis renseigné.
  const numericValue = Number(value.replace(',', '.'));
  const paramOk =
    paramKind === 'none' ||
    paramKind === 'discipline' ||
    (paramKind === 'distance' && Number(distance) > 0) ||
    (paramKind === 'throws' && Number(implementKg.replace(',', '.')) > 0);
  const canSubmit = numericValue > 0 && paramOk;

  if (!open) {
    return (
      <Button
        testID="manual-record-open"
        variant="secondary"
        onPress={() => setOpen(true)}
        leftIcon={<Feather name="plus" size={16} color={colors.textPrimary} />}
      >
        Ajouter un record
      </Button>
    );
  }

  const inputStyle = {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.body.fontSize,
  };

  return (
    <Card testID="manual-record-form">
      <View style={{ gap: spacing[3] }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.body.fontSize,
          }}
        >
          Déclarer un record
        </Text>

        {/* Famille d'épreuve. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {FAMILIES.map((f) => (
            <Chip
              key={f.value}
              testID={`manual-family-${f.value}`}
              selected={family === f.value}
              onPress={() => setFamily(f.value)}
            >
              {f.label}
            </Chip>
          ))}
        </View>

        {/* Paramètre contextuel selon la famille. */}
        {paramKind === 'distance' ? (
          <TextInput
            testID="manual-distance"
            value={distance}
            onChangeText={setDistance}
            placeholder="Distance (m) — ex. 60"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={inputStyle}
          />
        ) : paramKind === 'throws' ? (
          <TextInput
            testID="manual-implement"
            value={implementKg}
            onChangeText={setImplementKg}
            placeholder="Poids d'engin (kg) — ex. 7.26"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={inputStyle}
          />
        ) : paramKind === 'discipline' ? (
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Chip
              testID="manual-discipline-high"
              selected={discipline === 'high'}
              onPress={() => setDiscipline('high')}
            >
              Hauteur
            </Chip>
            <Chip
              testID="manual-discipline-pole"
              selected={discipline === 'pole'}
              onPress={() => setDiscipline('pole')}
            >
              Perche
            </Chip>
          </View>
        ) : null}

        {/* Marque + date. */}
        <TextInput
          testID="manual-value"
          value={value}
          onChangeText={setValue}
          placeholder={isTimed ? 'Temps (s) — ex. 7.45' : 'Marque (m) — ex. 6.42'}
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          style={inputStyle}
        />
        <TextInput
          testID="manual-date"
          value={achievedAt}
          onChangeText={setAchievedAt}
          placeholder="Date AAAA-MM-JJ (optionnel)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={inputStyle}
        />

        <Button
          testID="manual-submit"
          disabled={!canSubmit}
          loading={mutation.isPending}
          onPress={() => mutation.mutate()}
        >
          Enregistrer le record
        </Button>
        <Button
          testID="manual-cancel"
          variant="ghost"
          disabled={mutation.isPending}
          onPress={reset}
        >
          Annuler
        </Button>
      </View>
    </Card>
  );
}
