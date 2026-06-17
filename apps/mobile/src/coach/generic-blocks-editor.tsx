import { Feather } from '@expo/vector-icons';
import { useTheme } from '@talent-x/design-tokens';
import { Text, View } from 'react-native';
import { Button } from '../components/ui';
import {
  BlockCard,
  GroupCard,
  isEditableGroup,
  makeEmptyBlock,
  makeEmptyGroup,
  type EditableBlock,
  type EditableGroup,
  type EditableNode,
} from './session-builder-ui';

/**
 * Éditeur de blocs/groupes **générique** (C-05, TLX-052). Rend la liste de nœuds (cartes
 * `GroupCard`/`BlockCard`) et les boutons d'ajout, et expose toutes les mutations de structure
 * via `onChange`. Extrait de `SessionBuilderScreen` (TLX-177a, ADR-42) pour être réutilisé comme
 * rendu du segment « Personnalisé » du canvas composite ; comportement et rendu strictement
 * inchangés (mêmes testIDs, même JSX).
 */
export function GenericBlocksEditor({
  nodes,
  onChange,
}: {
  nodes: EditableNode[];
  onChange: (next: EditableNode[]) => void;
}) {
  const { colors, typography, spacing } = useTheme();

  // --- Nœuds de premier niveau (blocs ou groupes) ---
  function updateTopNode(index: number, patch: Partial<EditableNode>) {
    onChange(nodes.map((n, i) => (i === index ? ({ ...n, ...patch } as EditableNode) : n)));
  }

  function moveTopNode(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= nodes.length) return;
    const next = [...nodes];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function removeTopNode(index: number) {
    if (nodes.length <= 1) return;
    onChange(nodes.filter((_, i) => i !== index));
  }

  function addBlock() {
    onChange([...nodes, makeEmptyBlock()]);
  }

  function addGroup() {
    onChange([...nodes, makeEmptyGroup()]);
  }

  // --- Membres d'un groupe (chemin : index de groupe + index de membre) ---
  function withGroup(index: number, fn: (group: EditableGroup) => EditableNode | null) {
    const node = nodes[index];
    if (!node || !isEditableGroup(node)) return;
    const replacement = fn(node);
    if (replacement === null) {
      onChange(nodes.filter((_, i) => i !== index));
      return;
    }
    onChange(nodes.map((n, i) => (i === index ? replacement : n)));
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
    const node = nodes[index];
    if (!node || isEditableGroup(node)) return;
    const before = nodes[index - 1];
    const after = nodes[index + 1];
    if (before && isEditableGroup(before)) {
      const rest = nodes.filter((_, i) => i !== index);
      onChange(
        rest.map((n, i) =>
          i === index - 1 && isEditableGroup(n) ? { ...n, items: [...n.items, node] } : n,
        ),
      );
      return;
    }
    if (after && isEditableGroup(after)) {
      const rest = nodes.filter((_, i) => i !== index);
      onChange(
        rest.map((n, i) =>
          i === index && isEditableGroup(n) ? { ...n, items: [node, ...n.items] } : n,
        ),
      );
    }
  }

  /** Sort un membre de son groupe vers le premier niveau, juste après le groupe. */
  function ungroupMember(gi: number, mi: number) {
    const node = nodes[gi];
    if (!node || !isEditableGroup(node)) return;
    const member = node.items[mi];
    if (!member) return;
    const remaining = node.items.filter((_, j) => j !== mi);
    const next = [...nodes];
    if (remaining.length === 0) {
      next.splice(gi, 1, member); // le groupe se vide → remplacé par le membre
    } else {
      next[gi] = { ...node, items: remaining };
      next.splice(gi + 1, 0, member);
    }
    onChange(next);
  }

  /** Un bloc de premier niveau peut-il rejoindre un groupe voisin ? */
  function hasAdjacentGroup(index: number): boolean {
    return (
      (nodes[index - 1] != null && isEditableGroup(nodes[index - 1])) ||
      (nodes[index + 1] != null && isEditableGroup(nodes[index + 1]))
    );
  }

  return (
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
  );
}
