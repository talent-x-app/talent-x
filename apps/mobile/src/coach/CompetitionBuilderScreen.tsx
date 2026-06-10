import {
  createCompetition,
  deleteCompetition,
  getCompetition,
  updateCompetition,
  CompetitionStatus,
  type Competition,
  type CompetitionCreate,
  type CompetitionUpdate,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, Chip } from '../components/ui';
import { useToast } from '../feedback';
import { COMPETITIONS_QUERY_KEY } from '../competitions/competitions-query';
import { competitionEngageHref } from '../competitions/navigation';

/** Date calendaire `AAAA-MM-JJ` (validation légère côté client ; le backend fait foi). */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Constructeur de compétition (TLX-101, ADR-24 — variante allégée de C-05). En-tête
 * (nom, discipline, lieu, dates, description, statut). Création (`POST /competitions`) ou
 * édition (`GET` + `PUT /competitions/:id`) selon `competitionId`. En création, enchaîne sur
 * l'engagement d'athlètes ; en édition, expose engagement et suppression (soft-delete).
 */
export function CompetitionBuilderScreen({ competitionId }: { competitionId?: string }) {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEdit = competitionId != null;

  const [name, setName] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<CompetitionStatus>(CompetitionStatus.draft);
  const [error, setError] = useState<string | null>(null);

  // Mode édition : charge la compétition existante puis hydrate le formulaire.
  const existing = useQuery({
    queryKey: ['competition', competitionId],
    enabled: isEdit,
    queryFn: async (): Promise<Competition> => {
      const response = await getCompetition(competitionId as string);
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  useEffect(() => {
    const competition = existing.data;
    if (!competition) return;
    setName(competition.name);
    setDiscipline(competition.discipline ?? '');
    setLocation(competition.location ?? '');
    setStartDate(competition.startDate);
    setEndDate(competition.endDate ?? '');
    setDescription(competition.description ?? '');
    setStatus(competition.status);
  }, [existing.data]);

  const mutation = useMutation({
    mutationFn: async (): Promise<Competition> => {
      if (isEdit) {
        const body: CompetitionUpdate = {
          name: name.trim(),
          discipline: discipline.trim() || undefined,
          location: location.trim() || undefined,
          startDate: startDate.trim(),
          endDate: endDate.trim() || undefined,
          description: description.trim() || undefined,
          status,
        };
        const response = await updateCompetition(competitionId as string, body);
        if (response.status === 200) return response.data;
        throw response;
      }
      const body: CompetitionCreate = {
        name: name.trim(),
        discipline: discipline.trim() || undefined,
        location: location.trim() || undefined,
        startDate: startDate.trim(),
        endDate: endDate.trim() || undefined,
        description: description.trim() || undefined,
        status,
      };
      const response = await createCompetition(body);
      if (response.status === 201) return response.data;
      throw response;
    },
    onSuccess: (competition) => {
      void queryClient.invalidateQueries({ queryKey: COMPETITIONS_QUERY_KEY });
      if (isEdit) void queryClient.invalidateQueries({ queryKey: ['competition', competitionId] });
      toast.show({
        title: isEdit ? 'Compétition mise à jour' : 'Compétition créée',
        variant: 'success',
      });
      // Création : enchaîne sur l'engagement d'athlètes (referme le cycle création → engagement).
      // `replace` pour que « retour » ne ramène pas sur le formulaire vierge.
      if (isEdit) router.back();
      else router.replace(competitionEngageHref(competition.id));
    },
    onError: () => {
      toast.show({ title: "Échec de l'enregistrement", variant: 'danger' });
    },
  });

  const removal = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await deleteCompetition(competitionId as string);
      if (response.status !== 204) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COMPETITIONS_QUERY_KEY });
      toast.show({ title: 'Compétition supprimée', variant: 'success' });
      router.back();
    },
    onError: () => {
      toast.show({ title: 'Échec de la suppression', variant: 'danger' });
    },
  });

  function onSave() {
    setError(null);
    if (name.trim() === '') {
      setError('Donne un nom à la compétition.');
      return;
    }
    if (!DATE_RE.test(startDate.trim())) {
      setError('Renseigne une date de début au format AAAA-MM-JJ.');
      return;
    }
    if (endDate.trim() !== '' && !DATE_RE.test(endDate.trim())) {
      setError('La date de fin doit être au format AAAA-MM-JJ.');
      return;
    }
    if (endDate.trim() !== '' && endDate.trim() < startDate.trim()) {
      setError('La date de fin doit suivre la date de début.');
      return;
    }
    mutation.mutate();
  }

  if (isEdit && existing.isLoading) {
    return (
      <View
        testID="competition-builder-loading"
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
        <Card testID="competition-builder-error">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger cette compétition.
            </Text>
            <Button testID="competition-builder-retry" onPress={() => void existing.refetch()}>
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
        testID="competition-builder-back"
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
          Compétitions
        </Text>
      </Pressable>

      <Text
        testID="competition-builder-title"
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.h1.fontSize,
          letterSpacing: -0.5,
        }}
      >
        {isEdit ? 'Modifier la compétition' : 'Nouvelle compétition'}
      </Text>

      <View style={{ gap: spacing[4] }}>
        <FormField
          testID="competition-field-name"
          label="Nom"
          value={name}
          onChangeText={setName}
          placeholder="Ex. Meeting de printemps"
        />
        <FormField
          testID="competition-field-discipline"
          label="Discipline (optionnel)"
          value={discipline}
          onChangeText={setDiscipline}
          placeholder="Ex. Sprint, Saut…"
        />
        <FormField
          testID="competition-field-location"
          label="Lieu (optionnel)"
          value={location}
          onChangeText={setLocation}
          placeholder="Ex. Stade Charléty, Paris"
        />
        <FormField
          testID="competition-field-start"
          label="Date de début"
          value={startDate}
          onChangeText={setStartDate}
          placeholder="AAAA-MM-JJ"
        />
        <FormField
          testID="competition-field-end"
          label="Date de fin (optionnel)"
          value={endDate}
          onChangeText={setEndDate}
          placeholder="AAAA-MM-JJ"
        />
        <FormField
          testID="competition-field-description"
          label="Description (optionnel)"
          value={description}
          onChangeText={setDescription}
          placeholder="Programme, catégories, informations pratiques…"
          multiline
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
              testID="competition-status-draft"
              selected={status === CompetitionStatus.draft}
              onPress={() => setStatus(CompetitionStatus.draft)}
            >
              Brouillon
            </Chip>
            <Chip
              testID="competition-status-published"
              selected={status === CompetitionStatus.published}
              onPress={() => setStatus(CompetitionStatus.published)}
            >
              Publiée
            </Chip>
            <Chip
              testID="competition-status-cancelled"
              selected={status === CompetitionStatus.cancelled}
              onPress={() => setStatus(CompetitionStatus.cancelled)}
            >
              Annulée
            </Chip>
          </View>
        </View>
      </View>

      {error ? (
        <Text
          testID="competition-builder-validation"
          style={{
            color: colors.danger,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {error}
        </Text>
      ) : null}

      <Button
        testID="competition-save"
        size="lg"
        fullWidth
        loading={mutation.isPending}
        onPress={onSave}
      >
        {isEdit ? 'Enregistrer' : 'Créer et engager'}
      </Button>

      {isEdit ? (
        <>
          <Button
            testID="competition-engage"
            variant="secondary"
            fullWidth
            onPress={() => router.push(competitionEngageHref(competitionId as string))}
          >
            Engager des athlètes
          </Button>
          <Button
            testID="competition-delete"
            variant="ghost"
            fullWidth
            loading={removal.isPending}
            onPress={() => removal.mutate()}
          >
            Supprimer la compétition
          </Button>
        </>
      ) : null}
    </ScrollView>
  );
}

/** Champ de formulaire étiqueté (mono-ligne ou multi-ligne), aligné sur le design system. */
function FormField({
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
        autoCapitalize="sentences"
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
