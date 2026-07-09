import { logTrainingSession, type TrainingLogRequest } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button, Card, Chip } from '../components/ui';
import { useToast } from '../feedback';
import { EXERCISES_SCHEMA_VERSION } from '../sessions/exercises-doc';
import { DISCIPLINE_CANVAS } from '../coach/discipline-canvas';
import { DISCIPLINES, type DisciplineKey } from '../coach/discipline-assistants';
import type { EditableNode } from '../coach/session-builder-ui';
import { buildDetailedTrainingLog, detailedSeed } from './free-session-detailed';
import { MY_RECORDS_QUERY_KEY } from './records-query';

type ParamKind = 'distance' | 'throws' | 'discipline' | 'none';

/** Familles d'épreuve proposées (alignées sur la détection ADR-20) + bloc typé + paramètre. */
const FAMILIES: {
  value: string;
  label: string;
  blockType: string;
  param: ParamKind;
  unit: 's' | 'm';
}[] = [
  { value: 'sprint', label: 'Sprint', blockType: 'sprint', param: 'distance', unit: 's' },
  { value: 'hurdles', label: 'Haies', blockType: 'hurdles', param: 'distance', unit: 's' },
  { value: 'endurance', label: 'Endurance', blockType: 'endurance', param: 'distance', unit: 's' },
  { value: 'interval', label: 'Intervalles', blockType: 'interval', param: 'distance', unit: 's' },
  { value: 'jumps', label: 'Saut', blockType: 'jumps', param: 'none', unit: 'm' },
  {
    value: 'vertical',
    label: 'Vertical',
    blockType: 'vertical_jumps',
    param: 'discipline',
    unit: 'm',
  },
  { value: 'throws', label: 'Lancer', blockType: 'throws', param: 'throws', unit: 'm' },
];

/**
 * Journal d'entraînement (A — TLX-111, ADR-36). L'athlète consigne une **séance libre** (hors
 * assignation) : titre + date + une épreuve (famille + paramètre) + marque mesurée + RPE/notes.
 * Le composant construit un bloc typé + un résultat mesuré et `POST /athletes/me/training-log` —
 * le serveur crée séance `self_logged` + affectation `completed` + perf. Alimente progression/
 * records/assiduité (invalidation des caches partagés). Repliable, calqué sur `ManualRecordEditor`.
 *
 * **Deux modes** (TLX-162, ADR-38) : « Saisie rapide » (un exercice + une marque — inchangé) et
 * « Assistant détaillé » qui réutilise les canvas d'effort par discipline (ADR-39) pour consigner
 * une séance **multi-séries** — même endpoint, feuilles marquées réalisées (les marques mesurées
 * s'ajoutent ensuite via « Modifier ma performance » sur la séance créée).
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
  const [rpe, setRpe] = useState('');
  const [notes, setNotes] = useState('');
  // Mode assistant détaillé (TLX-162) : discipline + canvas multi-séries.
  const [logMode, setLogMode] = useState<'quick' | 'detailed'>('quick');
  const [canvasDiscipline, setCanvasDiscipline] = useState<DisciplineKey>('sprint');
  const [nodes, setNodes] = useState<EditableNode[]>(() => detailedSeed('sprint'));

  const spec = FAMILIES.find((f) => f.value === family)!;
  const disciplineCfg = DISCIPLINES.find((d) => d.key === canvasDiscipline);

  const reset = () => {
    setOpen(false);
    setTitle('');
    setDate('');
    setDistance('');
    setImplementKg('');
    setMark('');
    setRpe('');
    setNotes('');
    setLogMode('quick');
    setCanvasDiscipline('sprint');
    setNodes(detailedSeed('sprint'));
  };

  /** Changer de discipline ré-amorce le canvas (les séries appartiennent à la discipline). */
  const pickDiscipline = (key: DisciplineKey) => {
    setCanvasDiscipline(key);
    setNodes(detailedSeed(key));
  };

  const mutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (logMode === 'detailed') {
        const body = buildDetailedTrainingLog({
          title,
          date,
          nodes,
          fallbackTitle: `Séance ${disciplineCfg?.label ?? 'libre'}`,
          rpe,
          notes,
        });
        if (!body) throw new Error('empty-canvas');
        const res = await logTrainingSession(body);
        if (res.status === 201) return;
        throw res;
      }
      const params: Record<string, number | string> = {};
      if (spec.param === 'distance') params.distanceMeters = Number(distance);
      if (spec.param === 'throws') params.implementKg = Number(implementKg.replace(',', '.'));
      if (spec.param === 'discipline') params.discipline = discipline;

      const markValue = Number(mark.replace(',', '.'));
      const setResult =
        spec.unit === 's'
          ? { set: 1, timeSeconds: markValue, completed: true }
          : { set: 1, distanceMeters: markValue, completed: true };
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
          items: [{ exerciseName, order: 0, setResults: [setResult] }],
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

  // Validité minimale : date + marque > 0 + paramètre requis renseigné (mode rapide) ;
  // date + au moins une feuille dans le canvas (mode détaillé).
  const markValue = Number(mark.replace(',', '.'));
  const paramOk =
    spec.param === 'none' ||
    spec.param === 'discipline' ||
    (spec.param === 'distance' && Number(distance) > 0) ||
    (spec.param === 'throws' && Number(implementKg.replace(',', '.')) > 0);
  const canSubmit =
    logMode === 'detailed'
      ? date.trim().length > 0 &&
        buildDetailedTrainingLog({ title, date, nodes, fallbackTitle: 'x' }) != null
      : date.trim().length > 0 && markValue > 0 && paramOk;

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

        {/* Mode de consignation (TLX-162) : rapide (1 exercice) ou assistant multi-séries. */}
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <Chip
            testID="free-mode-quick"
            selected={logMode === 'quick'}
            onPress={() => setLogMode('quick')}
          >
            Saisie rapide
          </Chip>
          <Chip
            testID="free-mode-detailed"
            selected={logMode === 'detailed'}
            onPress={() => setLogMode('detailed')}
          >
            Assistant détaillé
          </Chip>
        </View>

        {logMode === 'quick' ? (
          <>
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
          </>
        ) : (
          <>
            {/* Discipline du canvas (ADR-39). */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
              {DISCIPLINES.map((d) => (
                <Chip
                  key={d.key}
                  testID={`free-canvas-${d.key}`}
                  selected={canvasDiscipline === d.key}
                  onPress={() => pickDiscipline(d.key)}
                >
                  {d.label}
                </Chip>
              ))}
            </View>
            {/* Canvas multi-séries de la discipline, en mode encart (sans écha/RAC ni KPI). */}
            <View testID="free-detailed-canvas">
              {DISCIPLINE_CANVAS[canvasDiscipline]({ nodes, setNodes, embedded: true })}
            </View>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.caption.fontSize,
              }}
            >
              Les exercices seront enregistrés comme réalisés — tu pourras saisir tes marques
              ensuite depuis la séance.
            </Text>
          </>
        )}

        {/* Paramètre contextuel selon la famille (mode rapide). */}
        {logMode === 'detailed' ? null : spec.param === 'distance' ? (
          <TextInput
            testID="free-distance"
            value={distance}
            onChangeText={setDistance}
            placeholder="Distance (m) — ex. 5000"
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

        {/* Marque mesurée (mode rapide) + RPE + notes. */}
        {logMode === 'quick' ? (
          <TextInput
            testID="free-mark"
            value={mark}
            onChangeText={setMark}
            placeholder={spec.unit === 's' ? 'Temps (s) — ex. 1500' : 'Marque (m) — ex. 6.42'}
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={inputStyle}
          />
        ) : null}
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
