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
  GroupCard,
  findFirstNodeIssue,
  isEditableGroup,
  makeEmptyBlock,
  makeEmptyGroup,
  nodesFromExercises,
  nodesToItems,
  type EditableBlock,
  type EditableGroup,
  type EditableNode,
} from './session-builder-ui';
import {
  BriefEditor,
  briefDraftFromSession,
  briefDraftToPayload,
  makeEmptyBriefDraft,
  type BriefDraft,
} from './brief-editor';
import { assignSessionHref, coachTemplatesHref } from './navigation';

/** Version courante du contrat JSONB des séances (schéma exercises **v3** — groupes, ADR-27). */
const EXERCISES_SCHEMA_VERSION = 3;

/**
 * Constructeur de séance (C-05 — TLX-052). En-tête (titre, description, date, statut) +
 * canvas de blocs ordonnés édités via un éditeur **générique** calé sur le schéma exercises
 * v1 (cf. TX-DATA-006). Création (`POST /sessions`) ou édition (`GET` + `PUT /sessions/:id`)
 * selon `sessionId`. Les éditeurs typés par discipline (TLX-053→061) attendent l'ADR-18
 * (schéma v2). États : chargement (édition), erreur, validation.
 */
export function SessionBuilderScreen({
  sessionId,
  initialStatus,
}: {
  sessionId?: string;
  /** Statut pré-sélectionné à la création (C-10 : `template` ouvre le mode modèle, ADR-29). */
  initialStatus?: SessionStatus;
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
  const [nodes, setNodes] = useState<EditableNode[]>([makeEmptyBlock()]);
  const [brief, setBrief] = useState<BriefDraft>(makeEmptyBriefDraft());
  const [error, setError] = useState<string | null>(null);

  // Mode modèle (C-10, ADR-29) : un modèle est non daté et non assignable.
  const isTemplate = status === SessionStatus.template;

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
      setNodes([makeEmptyBlock()]);
      setBrief(makeEmptyBriefDraft());
      setError(null);
    }, [isEdit, defaultStatus]),
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

  // --- Nœuds de premier niveau (blocs ou groupes) ---
  function updateTopNode(index: number, patch: Partial<EditableNode>) {
    setNodes((prev) =>
      prev.map((n, i) => (i === index ? ({ ...n, ...patch } as EditableNode) : n)),
    );
  }

  function moveTopNode(index: number, delta: -1 | 1) {
    setNodes((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeTopNode(index: number) {
    setNodes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function addBlock() {
    setNodes((prev) => [...prev, makeEmptyBlock()]);
  }

  function addGroup() {
    setNodes((prev) => [...prev, makeEmptyGroup()]);
  }

  // --- Membres d'un groupe (chemin : index de groupe + index de membre) ---
  function withGroup(index: number, fn: (group: EditableGroup) => EditableNode | null) {
    setNodes((prev) => {
      const node = prev[index];
      if (!node || !isEditableGroup(node)) return prev;
      const replacement = fn(node);
      if (replacement === null) return prev.filter((_, i) => i !== index);
      return prev.map((n, i) => (i === index ? replacement : n));
    });
  }

  function updateMember(gi: number, mi: number, patch: Partial<EditableBlock>) {
    withGroup(gi, (g) => ({
      ...g,
      items: g.items.map((b, j) => (j === mi ? { ...b, ...patch } : b)),
    }));
  }

  function moveMember(gi: number, mi: number, delta: -1 | 1) {
    withGroup(gi, (g) => {
      const target = mi + delta;
      if (target < 0 || target >= g.items.length) return g;
      const items = [...g.items];
      [items[mi], items[target]] = [items[target], items[mi]];
      return { ...g, items };
    });
  }

  function removeMember(gi: number, mi: number) {
    // Supprimer le dernier membre supprime le groupe (jamais de groupe vide).
    withGroup(gi, (g) => {
      const items = g.items.filter((_, j) => j !== mi);
      return items.length === 0 ? null : { ...g, items };
    });
  }

  function addMember(gi: number) {
    withGroup(gi, (g) => ({ ...g, items: [...g.items, makeEmptyBlock()] }));
  }

  /** Déplace un bloc de premier niveau dans le groupe voisin (précédent en priorité, sinon suivant). */
  function groupTopBlock(index: number) {
    setNodes((prev) => {
      const node = prev[index];
      if (!node || isEditableGroup(node)) return prev;
      const before = prev[index - 1];
      const after = prev[index + 1];
      if (before && isEditableGroup(before)) {
        const rest = prev.filter((_, i) => i !== index);
        return rest.map((n, i) =>
          i === index - 1 && isEditableGroup(n) ? { ...n, items: [...n.items, node] } : n,
        );
      }
      if (after && isEditableGroup(after)) {
        const rest = prev.filter((_, i) => i !== index);
        return rest.map((n, i) =>
          i === index && isEditableGroup(n) ? { ...n, items: [node, ...n.items] } : n,
        );
      }
      return prev;
    });
  }

  /** Sort un membre de son groupe vers le premier niveau, juste après le groupe. */
  function ungroupMember(gi: number, mi: number) {
    setNodes((prev) => {
      const node = prev[gi];
      if (!node || !isEditableGroup(node)) return prev;
      const member = node.items[mi];
      if (!member) return prev;
      const remaining = node.items.filter((_, j) => j !== mi);
      const next = [...prev];
      if (remaining.length === 0) {
        next.splice(gi, 1, member); // le groupe se vide → remplacé par le membre
      } else {
        next[gi] = { ...node, items: remaining };
        next.splice(gi + 1, 0, member);
      }
      return next;
    });
  }

  /** Un bloc de premier niveau peut-il rejoindre un groupe voisin ? */
  function hasAdjacentGroup(index: number): boolean {
    return (
      (nodes[index - 1] != null && isEditableGroup(nodes[index - 1])) ||
      (nodes[index + 1] != null && isEditableGroup(nodes[index + 1]))
    );
  }

  function onSave() {
    setError(null);
    if (title.trim() === '') {
      setError('Donne un titre à la séance.');
      return;
    }
    // Parcours group-aware : nom manquant, groupe vide/sans nom, ou `param` requis (TLX-91)
    // absent sur un bloc — y compris les membres de groupe (sans quoi la perf serait invisible).
    const issue = findFirstNodeIssue(nodes);
    if (issue !== null) {
      setError(issue.message);
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
        {isTemplate
          ? isEdit
            ? 'Modifier le modèle'
            : 'Nouveau modèle'
          : isEdit
            ? 'Modifier la séance'
            : 'Nouvelle séance'}
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

      {/* Canvas de blocs et groupes (Carte C-05 §5 + ADR-27). */}
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
          Blocs et groupes ({nodes.length})
        </Text>
        {nodes.map((node, index) =>
          isEditableGroup(node) ? (
            <GroupCard
              key={node.key}
              group={node}
              index={index}
              total={nodes.length}
              onChange={(patch) => updateTopNode(index, patch)}
              onMoveUp={() => moveTopNode(index, -1)}
              onMoveDown={() => moveTopNode(index, 1)}
              onRemove={() => removeTopNode(index)}
              onMemberChange={(mi, patch) => updateMember(index, mi, patch)}
              onMemberMoveUp={(mi) => moveMember(index, mi, -1)}
              onMemberMoveDown={(mi) => moveMember(index, mi, 1)}
              onMemberRemove={(mi) => removeMember(index, mi)}
              onMemberUngroup={(mi) => ungroupMember(index, mi)}
              onAddMember={() => addMember(index)}
            />
          ) : (
            <BlockCard
              key={node.key}
              block={node}
              index={index}
              total={nodes.length}
              onChange={(patch) => updateTopNode(index, patch)}
              onMoveUp={() => moveTopNode(index, -1)}
              onMoveDown={() => moveTopNode(index, 1)}
              onRemove={() => removeTopNode(index)}
              onGroup={() => groupTopBlock(index)}
              groupDisabled={!hasAdjacentGroup(index)}
            />
          ),
        )}
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Button
            testID="session-add-block"
            variant="secondary"
            style={{ flex: 1 }}
            leftIcon={<Feather name="plus" size={18} color={colors.textPrimary} />}
            onPress={addBlock}
          >
            Ajouter un bloc
          </Button>
          <Button
            testID="session-add-group"
            variant="secondary"
            style={{ flex: 1 }}
            leftIcon={<Feather name="repeat" size={18} color={colors.textPrimary} />}
            onPress={addGroup}
          >
            Ajouter un groupe
          </Button>
        </View>
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
