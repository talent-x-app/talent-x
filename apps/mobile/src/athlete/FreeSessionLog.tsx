import { logTrainingSession, type TrainingLogRequest } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button, Card, Chip, Stepper } from '../components/ui';
import { useToast } from '../feedback';
import { EXERCISES_SCHEMA_VERSION } from '../sessions/exercises-doc';
import { MY_RECORDS_QUERY_KEY } from './records-query';

type ParamKind = 'distance' | 'throws' | 'discipline' | 'none';

/**
 * Familles d'épreuve proposées (alignées sur la détection ADR-20) + bloc typé + paramètre.
 *
 * TLX-247 : `markExample` et `distanceExample` sont portés **par famille**. Un exemple générique
 * dérivé de la seule `unit` donnait « ex. 1500 » sur Sprint — plausible en endurance (1500 s ≈
 * 25 min), absurde sur 60 m, et surtout lisible comme une **distance** juste après un champ de
 * distance. L'exemple doit désambiguïser l'unité, pas travailler contre l'étiquette.
 */
const FAMILIES: {
  value: string;
  label: string;
  blockType: string;
  param: ParamKind;
  unit: 's' | 'm';
  /** Exemple de marque, dans l'unité de la famille. */
  markExample: string;
  /** Exemple de distance, pour les familles à `param: 'distance'`. */
  distanceExample?: string;
}[] = [
  {
    value: 'sprint',
    label: 'Sprint',
    blockType: 'sprint',
    param: 'distance',
    unit: 's',
    markExample: '7.42',
    distanceExample: '60',
  },
  {
    value: 'hurdles',
    label: 'Haies',
    blockType: 'hurdles',
    param: 'distance',
    unit: 's',
    markExample: '14.80',
    distanceExample: '110',
  },
  {
    value: 'endurance',
    label: 'Endurance',
    blockType: 'endurance',
    param: 'distance',
    unit: 's',
    markExample: '1500',
    distanceExample: '5000',
  },
  {
    value: 'interval',
    label: 'Intervalles',
    blockType: 'interval',
    param: 'distance',
    unit: 's',
    markExample: '62.5',
    distanceExample: '400',
  },
  {
    value: 'jumps',
    label: 'Saut',
    blockType: 'jumps',
    param: 'none',
    unit: 'm',
    markExample: '6.42',
  },
  {
    value: 'vertical',
    label: 'Vertical',
    blockType: 'vertical_jumps',
    param: 'discipline',
    unit: 'm',
    markExample: '1.85',
  },
  {
    value: 'throws',
    label: 'Lancer',
    blockType: 'throws',
    param: 'throws',
    unit: 'm',
    markExample: '12.40',
  },
];

/**
 * Journal d'entraînement (A — TLX-111, ADR-36). L'athlète consigne une **séance libre** (hors
 * assignation) : titre + date + une épreuve (famille + paramètre) + marque mesurée + RPE/notes.
 * Le composant construit un bloc typé + un résultat mesuré et `POST /athletes/me/training-log` —
 * le serveur crée séance `self_logged` + affectation `completed` + perf. Alimente progression/
 * records/assiduité (invalidation des caches partagés). Repliable, calqué sur `ManualRecordEditor`.
 *
 * TLX-162 (ADR-38) : mode **multi-séries** optionnel — même grammaire que les assistants coach
 * (« N × D », `params.reps`, primitive `Stepper`), une marque PAR série dans `setResults`. Le mode
 * simple (une marque) reste le défaut ; même endpoint `POST /athletes/me/training-log` (ADR-36).
 */
export function FreeSessionLog() {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [family, setFamily] = useState('sprint');
  const [distance, setDistance] = useState('');
  const [implementKg, setImplementKg] = useState('');
  const [discipline, setDiscipline] = useState<'high' | 'pole'>('high');
  const [mark, setMark] = useState('');
  const [multi, setMulti] = useState(false);
  const [seriesMarks, setSeriesMarks] = useState<string[]>(['', '', '']);
  const [rpe, setRpe] = useState('');
  const [notes, setNotes] = useState('');

  const spec = FAMILIES.find((f) => f.value === family)!;

  const reset = () => {
    setOpen(false);
    setTitle('');
    setDate('');
    setDistance('');
    setImplementKg('');
    setMark('');
    setMulti(false);
    setSeriesMarks(['', '', '']);
    setRpe('');
    setNotes('');
  };

  /** Ajuste le nombre de séries en préservant les marques déjà saisies. */
  const resizeSeries = (count: number) => {
    setSeriesMarks((prev) => Array.from({ length: count }, (_, index) => prev[index] ?? ''));
  };

  const mutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const params: Record<string, number | string> = {};
      if (spec.param === 'distance') params.distanceMeters = Number(distance);
      if (spec.param === 'throws') params.implementKg = Number(implementKg.replace(',', '.'));
      if (spec.param === 'discipline') params.discipline = discipline;

      // Multi-séries (TLX-162) : `reps` = grammaire « N × D » des assistants (ADR-38/52) ;
      // une marque par série dans `setResults` (set 1..N). Mode simple : une seule marque.
      const marks = multi ? seriesMarks : [mark];
      if (multi) params.reps = marks.length;
      const setResults = marks.map((m, index) => {
        const value = Number(m.replace(',', '.'));
        return spec.unit === 's'
          ? { set: index + 1, timeSeconds: value, completed: true }
          : { set: index + 1, distanceMeters: value, completed: true };
      });
      const exerciseName = title.trim() || spec.label;

      const body: TrainingLogRequest = {
        title: exerciseName,
        date: date.trim(),
        exercises: {
          schemaVersion: EXERCISES_SCHEMA_VERSION,
          items: [{ name: exerciseName, order: 0, type: spec.blockType, params }],
        } as TrainingLogRequest['exercises'],
        results: {
          schemaVersion: 2,
          items: [{ exerciseName, order: 0, setResults }],
        } as TrainingLogRequest['results'],
      };
      if (rpe.trim()) body.rpe = Number(rpe);
      if (notes.trim()) body.notes = notes.trim();

      const res = await logTrainingSession(body);
      if (res.status === 201) return;
      throw res;
    },
    onSuccess: () => {
      // Alimente progression, records et assiduité → invalider les caches partagés.
      void queryClient.invalidateQueries({ queryKey: ['progress', 'me'] });
      void queryClient.invalidateQueries({ queryKey: MY_RECORDS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      toast.show({ title: 'Séance enregistrée', variant: 'success' });
      reset();
    },
    onError: () =>
      toast.show({
        title: 'Enregistrement impossible',
        description: 'Vérifie la date, l’épreuve et la marque.',
        variant: 'danger',
      }),
  });

  // Validité minimale : date + marque(s) > 0 + paramètre requis renseigné.
  const marksOk = multi
    ? seriesMarks.every((m) => Number(m.replace(',', '.')) > 0)
    : Number(mark.replace(',', '.')) > 0;
  const paramOk =
    spec.param === 'none' ||
    spec.param === 'discipline' ||
    (spec.param === 'distance' && Number(distance) > 0) ||
    (spec.param === 'throws' && Number(implementKg.replace(',', '.')) > 0);
  const canSubmit = date.trim().length > 0 && marksOk && paramOk;

  if (!open) {
    return (
      <Button
        testID="free-session-open"
        variant="secondary"
        onPress={() => setOpen(true)}
        leftIcon={<Feather name="plus" size={16} color={colors.textPrimary} />}
      >
        Enregistrer une séance libre
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
    <Card testID="free-session-form">
      <View style={{ gap: spacing[3] }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.body.fontSize,
          }}
        >
          Séance libre
        </Text>

        <TextInput
          testID="free-session-title"
          value={title}
          onChangeText={setTitle}
          placeholder="Titre — ex. Footing 8 km"
          placeholderTextColor={colors.textMuted}
          style={inputStyle}
        />
        <TextInput
          testID="free-session-date"
          value={date}
          onChangeText={setDate}
          placeholder="Date AAAA-MM-JJ"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={inputStyle}
        />

        {/* Famille d'épreuve. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {FAMILIES.map((f) => (
            <Chip
              key={f.value}
              testID={`free-family-${f.value}`}
              selected={family === f.value}
              onPress={() => setFamily(f.value)}
            >
              {f.label}
            </Chip>
          ))}
        </View>

        {/* Paramètre contextuel selon la famille. */}
        {spec.param === 'distance' ? (
          <TextInput
            testID="free-distance"
            value={distance}
            onChangeText={setDistance}
            placeholder={`Distance (m) — ex. ${spec.distanceExample}`}
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={inputStyle}
          />
        ) : spec.param === 'throws' ? (
          <TextInput
            testID="free-implement"
            value={implementKg}
            onChangeText={setImplementKg}
            placeholder="Poids d'engin (kg) — ex. 7.26"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={inputStyle}
          />
        ) : spec.param === 'discipline' ? (
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Chip
              testID="free-discipline-high"
              selected={discipline === 'high'}
              onPress={() => setDiscipline('high')}
            >
              Hauteur
            </Chip>
            <Chip
              testID="free-discipline-pole"
              selected={discipline === 'pole'}
              onPress={() => setDiscipline('pole')}
            >
              Perche
            </Chip>
          </View>
        ) : null}

        {/* Mode de saisie : une marque (défaut) ou multi-séries (TLX-162, ADR-38). */}
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <Chip testID="free-mode-simple" selected={!multi} onPress={() => setMulti(false)}>
            Une marque
          </Chip>
          <Chip testID="free-mode-multi" selected={multi} onPress={() => setMulti(true)}>
            Multi-séries
          </Chip>
        </View>

        {multi ? (
          <View style={{ gap: spacing[3] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <Text
                style={{
                  flex: 1,
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                Séries
              </Text>
              <Stepper
                testID="free-series-count"
                accessibilityLabel="Nombre de séries"
                value={seriesMarks.length}
                onValueChange={resizeSeries}
                min={2}
                max={12}
              />
            </View>
            {seriesMarks.map((value, index) => (
              <TextInput
                key={index}
                testID={`free-series-mark-${index + 1}`}
                value={value}
                onChangeText={(t) =>
                  setSeriesMarks((prev) => prev.map((p, i) => (i === index ? t : p)))
                }
                placeholder={
                  spec.unit === 's'
                    ? `Série ${index + 1} — temps (s)`
                    : `Série ${index + 1} — marque (m)`
                }
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                style={inputStyle}
              />
            ))}
          </View>
        ) : (
          <TextInput
            testID="free-mark"
            value={mark}
            onChangeText={setMark}
            placeholder={
              spec.unit === 's'
                ? `Temps (s) — ex. ${spec.markExample}`
                : `Marque (m) — ex. ${spec.markExample}`
            }
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={inputStyle}
          />
        )}
        <TextInput
          testID="free-rpe"
          value={rpe}
          onChangeText={setRpe}
          placeholder="RPE 1–10 (optionnel)"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          style={inputStyle}
        />
        <TextInput
          testID="free-notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes (optionnel)"
          placeholderTextColor={colors.textMuted}
          style={inputStyle}
        />

        <Button
          testID="free-submit"
          disabled={!canSubmit}
          loading={mutation.isPending}
          onPress={() => mutation.mutate()}
        >
          Enregistrer la séance
        </Button>
        <Button testID="free-cancel" variant="ghost" disabled={mutation.isPending} onPress={reset}>
          Annuler
        </Button>
      </View>
    </Card>
  );
}
