import { duplicateSession, listSessions, SessionStatus, type Session } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { SearchField } from '../components/SearchField';
import { toUserMessage, useToast } from '../feedback';
import { filterByText } from '../search/text-filter';
import { countLeaves } from '../sessions/exercises-doc';
import { editSessionHref, newTemplateHref } from './navigation';
import { SESSION_TEMPLATES_QUERY_KEY } from './templates-query';

/**
 * Bibliothèque de modèles de séance (C-10 — TLX-064, ADR-29). Un modèle = une séance de
 * statut `template` (non datée, non assignable). Consomme `GET /sessions?status=template`.
 * Actions : **créer un modèle** (constructeur en mode modèle) ; **utiliser un modèle**
 * (`POST /sessions/:id/duplicate` → brouillon assignable, ouvre le constructeur dessus) ;
 * **modifier** (tap sur la carte → constructeur en édition). États chargement / erreur /
 * vide, pull-to-refresh.
 */
export function CoachTemplatesScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: SESSION_TEMPLATES_QUERY_KEY,
    queryFn: async (): Promise<Session[]> => {
      const response = await listSessions({ status: SessionStatus.template });
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  // « Utiliser ce modèle » : duplique en brouillon (statut draft côté API) puis ouvre le
  // constructeur sur la copie pour dater / ajuster / publier / assigner.
  const use = useMutation({
    mutationFn: async (templateId: string): Promise<Session> => {
      const response = await duplicateSession(templateId);
      if (response.status === 201) return response.data;
      throw response;
    },
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.show({ variant: 'success', title: 'Séance créée depuis le modèle' });
      router.push(editSessionHref(session.id));
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const templates = query.data ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      <Pressable
        testID="templates-back"
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
          Retour
        </Text>
      </Pressable>

      <View style={{ gap: spacing[1] }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h1.fontSize,
            letterSpacing: -0.5,
          }}
        >
          Mes modèles
        </Text>
        {query.data ? (
          <Text
            testID="templates-count"
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {templates.length} modèle{templates.length > 1 ? 's' : ''}
          </Text>
        ) : null}
      </View>

      <Button
        testID="template-create"
        fullWidth
        leftIcon={<Feather name="plus" size={18} color={colors.textOnAccent} />}
        onPress={() => router.push(newTemplateHref())}
      >
        Créer un modèle
      </Button>

      {query.isLoading ? (
        <View testID="templates-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : query.isError ? (
        <Card testID="templates-error">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger tes modèles.
            </Text>
            <Button testID="templates-retry" onPress={() => void query.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : templates.length === 0 ? (
        <Card testID="templates-empty">
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
              textAlign: 'center',
            }}
          >
            Aucun modèle pour l'instant. Crée-en un, ou enregistre une séance comme modèle depuis le
            constructeur, pour la réutiliser en un geste.
          </Text>
        </Card>
      ) : (
        <>
          {/* Recherche par titre (TLX-117) — filtre client sur la bibliothèque. */}
          <SearchField
            testID="templates-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un modèle"
          />
          {filterByText(templates, search, (t) => t.title).length === 0 ? (
            <Card testID="templates-no-match">
              <Text
                style={{
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                  textAlign: 'center',
                }}
              >
                Aucun modèle ne correspond à « {search.trim()} ».
              </Text>
            </Card>
          ) : (
            <View style={{ gap: spacing[3] }}>
              {filterByText(templates, search, (t) => t.title).map((template) => (
                <TemplateListItem
                  key={template.id}
                  template={template}
                  onEdit={() => router.push(editSessionHref(template.id))}
                  onUse={() => use.mutate(template.id)}
                  using={use.isPending && use.variables === template.id}
                  useDisabled={use.isPending}
                />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

/** Carte d'un modèle : titre, nombre d'exercices, action « Utiliser » ; tap = modifier. */
function TemplateListItem({
  template,
  onEdit,
  onUse,
  using,
  useDisabled,
}: {
  template: Session;
  onEdit: () => void;
  onUse: () => void;
  using: boolean;
  useDisabled: boolean;
}) {
  const { colors, typography, spacing } = useTheme();
  const count = countLeaves(template.exercises?.items);
  // Carte non-pressable (View) : l'en-tête « Modifier » et le bouton « Utiliser » sont des
  // boutons **frères** — jamais imbriqués (un bouton dans un bouton est invalide sur le web).
  return (
    <Card>
      <View style={{ gap: spacing[3] }}>
        <Pressable
          testID={`template-item-${template.id}`}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Modifier le modèle ${template.title}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[3],
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.accentSubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="copy" size={18} color={colors.accentText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              numberOfLines={1}
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.body.fontSize,
              }}
            >
              {template.title}
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {count} exercice{count > 1 ? 's' : ''}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </Pressable>
        <Button
          testID={`template-use-${template.id}`}
          variant="secondary"
          fullWidth
          loading={using}
          disabled={useDisabled}
          leftIcon={<Feather name="send" size={16} color={colors.textPrimary} />}
          onPress={onUse}
        >
          Utiliser ce modèle
        </Button>
      </View>
    </Card>
  );
}
