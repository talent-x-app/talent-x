import {
  createSession,
  getSession,
  updateSession,
  SessionStatus,
  type ExercisesDoc,
  type Session,
  type SessionCreate,
  type SessionUpdate,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, Chip } from '../components/ui';
import { useToast } from '../feedback';
import {
  BlockCard,
  blockToExercise,
  blocksFromExercises,
  firstBlockMissingRequiredParam,
  firstUnnamedBlockIndex,
  makeEmptyBlock,
  type EditableBlock,
} from './session-builder-ui';
import {
  BriefEditor,
  briefDraftFromSession,
  briefDraftToPayload,
  makeEmptyBriefDraft,
  type BriefDraft,
} from './brief-editor';
import { assignSessionHref } from './navigation';

/** Version courante du contrat JSONB des séances (schéma exercises v2, TX-DATA-006 · ADR-18). */
const EXERCISES_SCHEMA_VERSION = 2;

/**
 * Constructeur de séance (C-05 — TLX-052). En-tête (titre, description, date, statut) +
 * canvas de blocs ordonnés édités via un éditeur **générique** calé sur le schéma exercises
 * v1 (cf. TX-DATA-006). Création (`POST /sessions`) ou édition (`GET` + `PUT /sessions/:id`)
 * selon `sessionId`. Les éditeurs typés par discipline (TLX-053→061) attendent l'ADR-18
 * (schéma v2). États : chargement (édition), erreur, validation.
 */
export function SessionBuilderScreen({ sessionId }: { sessionId?: string }) {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEdit = sessionId != null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.draft);
  const [blocks, setBlocks] = useState<EditableBlock[]>([makeEmptyBlock()]);
  const [brief, setBrief] = useState<BriefDraft>(makeEmptyBriefDraft());
  const [error, setError] = useState<string | null>(null);

  // Mode édition : charge la séance existante puis hydrate le formulaire.
  const existing = useQuery({
    queryKey: ['session', sessionId],
    enabled: isEdit,
    queryFn: async (): Promise<Session> => {
      const response = await getSession(sessionId as string);
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  useEffect(() => {
    const session = existing.data;
    if (!session) return;
    setTitle(session.title);
    setDescription(session.description ?? '');
    setScheduledDate(session.scheduledDate ?? '');
    setStatus(session.status);
    const hydrated = blocksFromExercises(session.exercises?.items ?? []);
    setBlocks(hydrated.length > 0 ? hydrated : [makeEmptyBlock()]);
    setBrief(briefDraftFromSession(session.brief));
  }, [existing.data]);

  // TLX-93 : `session/new` est un écran de tab caché (href:null) que React Navigation
  // garde monté — son état `useState` survivrait donc à un aller-retour dashboard ↔
  // constructeur, réaffichant le brouillon précédent. En mode création, on repart d'un
  // formulaire vierge à chaque fois que l'écran reprend le focus (mount inclus).
  useFocusEffect(
    useCallback(() => {
      if (isEdit) return;
      setTitle('');
      setDescription('');
      setScheduledDate('');
      setStatus(SessionStatus.draft);
      setBlocks([makeEmptyBlock()]);
      setBrief(makeEmptyBriefDraft());
      setError(null);
    }, [isEdit]),
  );

  const mutation = useMutation({
    mutationFn: async (): Promise<Session> => {
      const exercises: ExercisesDoc = {
        schemaVersion: EXERCISES_SCHEMA_VERSION,
        items: blocks.map((block, i) => blockToExercise(block, i + 1)),
      };
      const briefPayload = briefDraftToPayload(brief);
      if (isEdit) {
        const body: SessionUpdate = {
          title: title.trim(),
          description: description.trim() || undefined,
          scheduledDate: scheduledDate.trim() || undefined,
          status,
          exercises,
          brief: briefPayload,
        };
        const response = await updateSession(sessionId as string, body);
        if (response.status === 200) return response.data;
        throw response;
      }
      const body: SessionCreate = {
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledDate: scheduledDate.trim() || undefined,
        status,
        exercises,
        brief: briefPayload,
      };
      const response = await createSession(body);
      if (response.status === 201) return response.data;
      throw response;
    },
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      if (isEdit) void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      toast.show({
        title: isEdit ? 'Séance mise à jour' : 'Séance créée',
        variant: 'success',
      });
      // Création : enchaîne sur l'assignation (C-06) — referme le cycle création → affectation
      // (la séance n'est pas listée ailleurs). `replace` pour que « retour » ramène au dashboard.
      if (isEdit) router.back();
      else router.replace(assignSessionHref(session.id, session.title));
    },
    onError: () => {
      toast.show({ title: "Échec de l'enregistrement", variant: 'danger' });
    },
  });

  function updateBlock(index: number, patch: Partial<EditableBlock>) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function moveBlock(index: number, delta: -1 | 1) {
    setBlocks((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeBlock(index: number) {
    setBlocks((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function addBlock() {
    setBlocks((prev) => [...prev, makeEmptyBlock()]);
  }

  function onSave() {
    setError(null);
    if (title.trim() === '') {
      setError('Donne un titre à la séance.');
      return;
    }
    const unnamed = firstUnnamedBlockIndex(blocks);
    if (unnamed !== -1) {
      setError(`Le bloc ${unnamed + 1} n'a pas de nom d'exercice.`);
      return;
    }
    // TLX-91 : un bloc typé sans le param dérivant son épreuve (distance, engin, discipline)
    // produirait une perf invisible en progression — on bloque avec un message explicite.
    const missingParam = firstBlockMissingRequiredParam(blocks);
    if (missingParam !== null) {
      setError(
        `Bloc ${missingParam.index + 1} : renseigne « ${missingParam.field.label} » ` +
          '(nécessaire au suivi de progression).',
      );
      return;
    }
    mutation.mutate();
  }

  if (isEdit && existing.isLoading) {
    return (
      <View
        testID="session-builder-loading"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (isEdit && (existing.isError || !existing.data)) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing[6],
          backgroundColor: colors.background,
        }}
      >
        <Card testID="session-builder-error">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger cette séance.
            </Text>
            <Button testID="session-builder-retry" onPress={() => void existing.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        testID="session-builder-back"
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Retour"
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
      >
        <Feather name="chevron-left" size={22} color={colors.textSecondary} />
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          Mes séances
        </Text>
      </Pressable>

      <Text
        testID="session-builder-title"
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.h1.fontSize,
          letterSpacing: -0.5,
        }}
      >
        {isEdit ? 'Modifier la séance' : 'Nouvelle séance'}
      </Text>

      {/* En-tête de séance (Carte C-05 §4). */}
      <View style={{ gap: spacing[4] }}>
        <HeaderField
          testID="session-field-title"
          label="Titre"
          value={title}
          onChangeText={setTitle}
          placeholder="Ex. Vitesse — départs"
        />
        <HeaderField
          testID="session-field-description"
          label="Objectif de la séance (une ligne)"
          value={description}
          onChangeText={setDescription}
          placeholder="Ex. 16 efforts courts à VO₂max, régularité avant tout"
          multiline
        />
        <HeaderField
          testID="session-field-date"
          label="Date prévue (optionnel)"
          value={scheduledDate}
          onChangeText={setScheduledDate}
          placeholder="AAAA-MM-JJ"
        />
        <View style={{ gap: spacing[2] }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Statut
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Chip
              testID="session-status-draft"
              selected={status === SessionStatus.draft}
              onPress={() => setStatus(SessionStatus.draft)}
            >
              Brouillon
            </Chip>
            <Chip
              testID="session-status-published"
              selected={status === SessionStatus.published}
              onPress={() => setStatus(SessionStatus.published)}
            >
              Publiée
            </Chip>
          </View>
        </View>
      </View>

      {/* Couche éditoriale (brief, ADR-28) — section repliable « Intention & lecture athlète ». */}
      <BriefEditor
        draft={brief}
        onChange={(patch) => setBrief((prev) => ({ ...prev, ...patch }))}
        items={blocks.map((block, i) => blockToExercise(block, i + 1))}
      />

      {/* Canvas de blocs (Carte C-05 §5). */}
      <View style={{ gap: spacing[3] }}>
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.bodySm.fontSize,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}
        >
          Blocs ({blocks.length})
        </Text>
        {blocks.map((block, index) => (
          <BlockCard
            key={block.key}
            block={block}
            index={index}
            total={blocks.length}
            onChange={(patch) => updateBlock(index, patch)}
            onMoveUp={() => moveBlock(index, -1)}
            onMoveDown={() => moveBlock(index, 1)}
            onRemove={() => removeBlock(index)}
          />
        ))}
        <Button
          testID="session-add-block"
          variant="secondary"
          fullWidth
          leftIcon={<Feather name="plus" size={18} color={colors.textPrimary} />}
          onPress={addBlock}
        >
          Ajouter un bloc
        </Button>
      </View>

      {error != null && (
        <Text
          testID="session-builder-validation"
          style={{
            color: colors.danger,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {error}
        </Text>
      )}

      <Button
        testID="session-save"
        size="lg"
        fullWidth
        loading={mutation.isPending}
        onPress={onSave}
      >
        {isEdit ? 'Enregistrer les modifications' : 'Créer la séance'}
      </Button>

      {/* Mode édition : assigner la séance existante à des athlètes (C-06, TLX-063). */}
      {isEdit ? (
        <Button
          testID="session-assign"
          variant="secondary"
          size="lg"
          fullWidth
          leftIcon={<Feather name="send" size={18} color={colors.textPrimary} />}
          onPress={() => router.push(assignSessionHref(sessionId as string, title))}
        >
          Assigner à des athlètes
        </Button>
      ) : null}
    </ScrollView>
  );
}

/** Champ d'en-tête de séance (libellé + saisie tokenisée). */
function HeaderField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  testID?: string;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        {label}
      </Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        style={{
          minHeight: multiline ? 72 : 48,
          paddingHorizontal: spacing[4],
          paddingTop: multiline ? spacing[3] : 0,
          paddingVertical: multiline ? spacing[3] : 0,
          textAlignVertical: multiline ? 'top' : 'center',
          borderRadius: radius.sm,
          borderWidth: borderWidth.hairline,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.body.fontSize,
        }}
      />
    </View>
  );
}
