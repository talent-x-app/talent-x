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
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, Chip } from '../components/ui';
import { ResponsiveContent } from '../responsive/ResponsiveContent';
import { useToast } from '../feedback';
import {
  findFirstNodeIssue,
  makeEmptyBlock,
  nodesFromExercises,
  nodesToItems,
  type EditableNode,
} from './session-builder-ui';
import { CompositeCanvas } from './composite-canvas';
import {
  BriefEditor,
  briefDraftFromSession,
  briefDraftToPayload,
  makeEmptyBriefDraft,
  type BriefDraft,
} from './brief-editor';
import { assignSessionHref, coachTemplatesHref } from './navigation';
import { countLeaves, EXERCISES_SCHEMA_VERSION } from '../sessions/exercises-doc';
import { isValidCalendarDate } from '../dates/calendar-date';
import { inferDiscipline } from './discipline-inference';
import { DISCIPLINE_CANVAS } from './discipline-canvas';

/**
 * Constructeur de séance (C-05 — TLX-052). En-tête (titre, description, date, statut) +
 * canvas de blocs ordonnés édités via un éditeur **générique** calé sur le schéma exercises
 * v1 (cf. TX-DATA-006). Création (`POST /sessions`) ou édition (`GET` + `PUT /sessions/:id`)
 * selon `sessionId`. Les éditeurs typés par discipline (TLX-053→061) attendent l'ADR-18
 * (schéma v2). États : chargement (édition), erreur, validation.
 */
/** Preset d'assistant (ADR-38) : un libellé + un constructeur de canvas (séries pré-remplies). */
export interface SessionBuilderPreset {
  key: string;
  label: string;
  build: () => EditableNode[];
}

export function SessionBuilderScreen({
  sessionId,
  initialStatus,
  seed,
  presets,
  titleText,
  renderCanvas,
}: {
  sessionId?: string;
  /** Statut pré-sélectionné à la création (C-10 : `template` ouvre le mode modèle, ADR-29). */
  initialStatus?: SessionStatus;
  /**
   * Canvas initial à la **création** (assistants par discipline, ADR-38). Sans lui, le
   * constructeur démarre sur un bloc vide (comportement C-05 historique). Factory (appelée à
   * chaque prise de focus) pour repartir d'un état neuf.
   */
  seed?: () => EditableNode[];
  /** Presets proposés au-dessus du canvas (assistants par discipline, ADR-38). */
  presets?: SessionBuilderPreset[];
  /** Titre H1 personnalisé (ex. « Assistant Sprint ») — défaut : « Nouvelle séance ». */
  titleText?: string;
  /**
   * Rendu **alternatif** du canvas (carte d'effort dédiée par discipline, ADR-39). Fourni, il
   * remplace l'éditeur de blocs générique tout en partageant le **même état `nodes`** (donc même
   * sérialisation, save et validation → séance éditable en C-05 sans perte). Ignoré en **édition**
   * (`sessionId`) : l'édition d'une séance existante reste sur le constructeur générique.
   */
  renderCanvas?: (ctx: {
    nodes: EditableNode[];
    setNodes: React.Dispatch<React.SetStateAction<EditableNode[]>>;
  }) => ReactNode;
}) {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEdit = sessionId != null;
  const defaultStatus = initialStatus ?? SessionStatus.draft;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [status, setStatus] = useState<SessionStatus>(defaultStatus);
  const [nodes, setNodes] = useState<EditableNode[]>(() => seed?.() ?? [makeEmptyBlock()]);
  const [brief, setBrief] = useState<BriefDraft>(makeEmptyBriefDraft());
  const [error, setError] = useState<string | null>(null);

  // Mode modèle (C-10, ADR-29) : un modèle est non daté et non assignable.
  const isTemplate = status === SessionStatus.template;

  // Inférence de discipline (ADR-40 §2) : en édition, route vers la carte dédiée plein écran dès
  // que le contenu existant est homogène et reconnu — sans champ `discipline` persisté. Sinon
  // (mélange reconnu ou bloc custom), on rend le canvas composite (ADR-42 §4), qui explicite la
  // structure bloc par bloc — l'ancien repli générique + bandeau « édition avancée » disparaît.
  const inferredDiscipline = isEdit ? inferDiscipline(nodes) : null;

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
    const hydrated = nodesFromExercises(session.exercises?.items ?? []);
    setNodes(hydrated.length > 0 ? hydrated : [makeEmptyBlock()]);
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
      setStatus(defaultStatus);
      setNodes(seed?.() ?? [makeEmptyBlock()]);
      setBrief(makeEmptyBriefDraft());
      setError(null);
    }, [isEdit, defaultStatus, seed]),
  );

  const mutation = useMutation({
    mutationFn: async (): Promise<Session> => {
      const exercises: ExercisesDoc = {
        schemaVersion: EXERCISES_SCHEMA_VERSION,
        items: nodesToItems(nodes),
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
      // Invalidation non-exacte de ['sessions'] → couvre aussi la bibliothèque ['sessions','templates'].
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      if (isEdit) void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      const savedTemplate = session.status === SessionStatus.template;
      toast.show({
        title: savedTemplate
          ? isEdit
            ? 'Modèle mis à jour'
            : 'Modèle créé'
          : isEdit
            ? 'Séance mise à jour'
            : 'Séance créée',
        variant: 'success',
      });
      if (isEdit) {
        router.back();
        return;
      }
      // Création d'un **modèle** (C-10) : retour à la bibliothèque (un modèle n'est pas assignable).
      // Création d'une **séance** : enchaîne sur l'assignation (C-06) — referme le cycle
      // création → affectation (la séance n'est pas listée ailleurs).
      if (savedTemplate) router.replace(coachTemplatesHref());
      else router.replace(assignSessionHref(session.id, session.title));
    },
    onError: () => {
      toast.show({ title: "Échec de l'enregistrement", variant: 'danger' });
    },
  });

  function onSave() {
    setError(null);
    if (title.trim() === '') {
      setError('Donne un titre à la séance.');
      return;
    }
    // Date optionnelle, mais si renseignée elle doit être une vraie date calendaire : sans
    // ce garde, une saisie malformée (`AAAA-MM-JJ` libre) partirait en 400 `@IsDateString`
    // opaque, affiché comme un échec d'enregistrement générique (TLX-167). Masquée en modèle.
    if (!isTemplate && scheduledDate.trim() !== '' && !isValidCalendarDate(scheduledDate)) {
      setError('Indique une date valide au format AAAA-MM-JJ (ex. 2026-06-20).');
      return;
    }
    // Parcours group-aware : nom manquant, groupe vide/sans nom, ou `param` requis (TLX-91)
    // absent sur un bloc — y compris les membres de groupe (sans quoi la perf serait invisible).
    const issue = findFirstNodeIssue(nodes);
    if (issue !== null) {
      setError(issue.message);
      return;
    }
    // Une séance doit contenir au moins un exercice (l'échauffement / RAC ne comptent pas,
    // ce sont des phases — TLX-171/172 #6). Bloque le cas « tous les blocs supprimés ».
    if (countLeaves(nodesToItems(nodes)) === 0) {
      setError('Ajoute au moins un exercice à la séance.');
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
      contentContainerStyle={{ padding: spacing[6] }}
      keyboardShouldPersistTaps="handled"
    >
      <ResponsiveContent testID="coach-responsive-content" style={{ gap: spacing[5] }}>
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
          {isTemplate
            ? isEdit
              ? 'Modifier le modèle'
              : 'Nouveau modèle'
            : isEdit
              ? 'Modifier la séance'
              : (titleText ?? 'Nouvelle séance')}
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
          {/* Un modèle (C-10) n'est pas daté : champ masqué en mode modèle (ADR-29). */}
          {isTemplate ? null : (
            <HeaderField
              testID="session-field-date"
              label="Date prévue (optionnel)"
              value={scheduledDate}
              onChangeText={setScheduledDate}
              placeholder="AAAA-MM-JJ"
            />
          )}
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
              <Chip
                testID="session-status-template"
                selected={status === SessionStatus.template}
                onPress={() => setStatus(SessionStatus.template)}
              >
                Modèle
              </Chip>
            </View>
          </View>
        </View>

        {/* Couche éditoriale (brief, ADR-28) — section repliable « Intention & lecture athlète ». */}
        <BriefEditor
          draft={brief}
          onChange={(patch) => setBrief((prev) => ({ ...prev, ...patch }))}
          items={nodesToItems(nodes)}
        />

        {/* Presets d'assistant (ADR-38) : remplacent le canvas par une structure pré-remplie.
            En création uniquement (un preset écraserait une séance en cours d'édition). */}
        {!isEdit && presets && presets.length > 0 ? (
          <View testID="assistant-presets" style={{ gap: spacing[2] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
              }}
            >
              Modèles de départ
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
              {presets.map((preset) => (
                <Chip
                  key={preset.key}
                  testID={`assistant-preset-${preset.key}`}
                  onPress={() => setNodes(preset.build())}
                >
                  {preset.label}
                </Chip>
              ))}
            </View>
          </View>
        ) : null}

        {/* Canvas : carte d'effort dédiée (assistant à la création, ADR-39 ; ou inférée en
            édition, ADR-40 §2) ou **canvas composite** « Personnalisé » (ADR-42). Tous partagent
            le même état `nodes` → séance éditable/round-trippable sans perte. */}
        {renderCanvas != null && !isEdit ? (
          renderCanvas({ nodes, setNodes })
        ) : isEdit &&
          inferredDiscipline != null &&
          DISCIPLINE_CANVAS[inferredDiscipline] != null ? (
          DISCIPLINE_CANVAS[inferredDiscipline]!({ nodes, setNodes })
        ) : (
          <CompositeCanvas nodes={nodes} onChange={setNodes} />
        )}

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
          {isTemplate
            ? isEdit
              ? 'Enregistrer le modèle'
              : 'Créer le modèle'
            : isEdit
              ? 'Enregistrer les modifications'
              : 'Créer la séance'}
        </Button>

        {/* Mode édition d'une séance réelle : assigner à des athlètes (C-06, TLX-063).
          Masqué pour un modèle (non assignable, ADR-29) : il faut d'abord le dupliquer. */}
        {isEdit && !isTemplate ? (
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
      </ResponsiveContent>
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
