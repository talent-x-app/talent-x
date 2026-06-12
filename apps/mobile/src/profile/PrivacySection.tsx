import {
  deleteMe,
  getConsents,
  getExport,
  requestExport,
  updateConsent,
  ConsentType,
  JobStatus,
  type ConsentList,
  type ConsentUpdate,
  type ExportJob,
  type Job,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { Button, Card } from '../components/ui';
import { toUserMessage, useToast } from '../feedback';

/** Clé de cache de l'état courant des consentements RGPD. */
export const CONSENTS_QUERY_KEY = ['consents'] as const;

type ConsentRow = { type: ConsentType; label: string; help: string };

// Consentements présentés selon le rôle. L'athlète est le sujet des données de
// performance (data_processing) et de leur accès par le coach (coach_access) ;
// marketing concerne tout le monde (TX-SEC-003 §6).
const ATHLETE_CONSENT_ROWS: ConsentRow[] = [
  {
    type: ConsentType.data_processing,
    label: 'Traitement de mes performances',
    help: 'Nécessaire pour saisir et suivre tes performances.',
  },
  {
    type: ConsentType.coach_access,
    label: 'Accès de mon coach',
    help: 'Autorise ton coach à consulter tes performances et statistiques.',
  },
];
const MARKETING_ROW: ConsentRow = {
  type: ConsentType.marketing,
  label: 'Actualités Talent-X',
  help: 'Communications non essentielles. Désactivé par défaut.',
};

/**
 * Section « Confidentialité » du Profil (TLX-106, TX-SEC-003 §6/§8/§9) — rend
 * exécutables les droits RGPD depuis l'app : gestion des consentements (retrait
 * aussi simple que l'octroi, RB-05), export des données (portabilité, art. 20) et
 * suppression de compte (effacement, art. 17). Frontend pur sur des endpoints
 * existants. `role` adapte les consentements affichés.
 */
export function PrivacySection({ role }: { role: string }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        Confidentialité & données
      </Text>
      <ConsentsCard role={role} />
      <DataExportCard />
      <DeleteAccountCard />
    </View>
  );
}

/** Consentements RGPD — interrupteurs role-aware, mise à jour optimiste. */
function ConsentsCard({ role }: { role: string }) {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();

  const rows = role === 'athlete' ? [...ATHLETE_CONSENT_ROWS, MARKETING_ROW] : [MARKETING_ROW];

  const consents = useQuery({
    queryKey: CONSENTS_QUERY_KEY,
    queryFn: async (): Promise<ConsentList> => {
      const response = await getConsents();
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  const grantedFor = (type: ConsentType): boolean =>
    consents.data?.data?.find((c) => c.type === type)?.granted ?? false;

  const save = useMutation({
    mutationFn: async (change: ConsentUpdate): Promise<void> => {
      const response = await updateConsent(change);
      if (response.status !== 200) throw response;
    },
    // Optimiste : l'interrupteur bascule immédiatement, rollback si le PUT échoue.
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: CONSENTS_QUERY_KEY });
      const previous = queryClient.getQueryData<ConsentList>(CONSENTS_QUERY_KEY);
      const others = (previous?.data ?? []).filter((c) => c.type !== change.type);
      queryClient.setQueryData<ConsentList>(CONSENTS_QUERY_KEY, {
        data: [...others, { type: change.type, granted: change.granted }],
      });
      return { previous };
    },
    onError: (error: unknown, _change, context) => {
      queryClient.setQueryData(CONSENTS_QUERY_KEY, context?.previous);
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CONSENTS_QUERY_KEY });
    },
  });

  return (
    <Card testID="privacy-consents">
      <View style={{ gap: spacing[2] }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.body.fontSize,
          }}
        >
          Mes consentements
        </Text>
        {consents.isLoading ? (
          <Text testID="privacy-consents-loading" style={mutedText(colors, typography)}>
            Chargement…
          </Text>
        ) : consents.isError ? (
          <Text testID="privacy-consents-error" style={mutedText(colors, typography)}>
            Consentements indisponibles pour le moment.
          </Text>
        ) : (
          <View style={{ gap: spacing[4], marginTop: spacing[2] }}>
            {rows.map((row) => (
              <View
                key={row.type}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontFamily: typography.fontFamily.medium,
                      fontSize: typography.body.fontSize,
                    }}
                  >
                    {row.label}
                  </Text>
                  <Text style={mutedText(colors, typography)}>{row.help}</Text>
                </View>
                <Switch
                  testID={`privacy-consent-${row.type}`}
                  value={grantedFor(row.type)}
                  onValueChange={(granted) => save.mutate({ type: row.type, granted })}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor={colors.surface}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}

/** Export RGPD (art. 20) — demande asynchrone (202) puis polling du statut. */
function DataExportCard() {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const [jobId, setJobId] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: async (): Promise<Job> => {
      const response = await requestExport();
      if (response.status !== 202) throw response;
      return response.data;
    },
    onSuccess: (job) => setJobId(job.jobId),
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  // Suivi du job : on interroge tant qu'il n'est ni prêt ni en échec.
  const job = useQuery({
    queryKey: ['export', jobId],
    enabled: jobId != null,
    refetchInterval: (query) => {
      const status = (query.state.data as ExportJob | undefined)?.status;
      return status === JobStatus.ready || status === JobStatus.failed ? false : 2000;
    },
    queryFn: async (): Promise<ExportJob> => {
      const response = await getExport(jobId as string);
      if (response.status === 200) return response.data;
      throw response;
    },
  });

  const status = job.data?.status;
  const inProgress =
    request.isPending ||
    (jobId != null && (status === JobStatus.pending || status === JobStatus.processing));

  return (
    <Card testID="privacy-export">
      <View style={{ gap: spacing[3] }}>
        <View style={{ gap: 2 }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.body.fontSize,
            }}
          >
            Exporter mes données
          </Text>
          <Text style={mutedText(colors, typography)}>
            Une archive de tes données, prête à télécharger via un lien temporaire.
          </Text>
        </View>

        {status === JobStatus.ready && job.data?.downloadUrl ? (
          <Button
            testID="privacy-export-download"
            size="lg"
            fullWidth
            onPress={() => void Linking.openURL(job.data!.downloadUrl as string)}
          >
            Télécharger l'archive
          </Button>
        ) : status === JobStatus.failed ? (
          <View style={{ gap: spacing[2] }}>
            <Text testID="privacy-export-failed" style={mutedText(colors, typography)}>
              La préparation de l'export a échoué.
            </Text>
            <Button
              testID="privacy-export-retry"
              variant="secondary"
              fullWidth
              onPress={() => request.mutate()}
            >
              Réessayer
            </Button>
          </View>
        ) : (
          <Button
            testID="privacy-export-request"
            size="lg"
            fullWidth
            loading={inProgress}
            disabled={inProgress}
            onPress={() => request.mutate()}
          >
            {inProgress ? 'Préparation en cours…' : 'Exporter mes données'}
          </Button>
        )}
      </View>
    </Card>
  );
}

/** Suppression de compte (art. 17) — confirmation forte en deux temps. */
function DeleteAccountCard() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { signOut } = useSession();
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await deleteMe();
      if (response.status !== 202) throw response;
    },
    onSuccess: async () => {
      await signOut();
      router.replace('/(auth)/login');
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  return (
    <Card testID="privacy-delete">
      <View style={{ gap: spacing[3] }}>
        <View style={{ gap: 2 }}>
          <Text
            style={{
              color: colors.danger,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.body.fontSize,
            }}
          >
            Supprimer mon compte
          </Text>
          <Text style={mutedText(colors, typography)}>
            Action irréversible. Tes données sont supprimées immédiatement de l'app ; l'effacement
            définitif peut prendre jusqu'à 30 jours (sauvegardes).
          </Text>
        </View>

        {confirming ? (
          <View style={{ gap: spacing[2] }}>
            <Text
              testID="privacy-delete-warning"
              style={{
                color: colors.danger,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              Confirmer la suppression définitive de ton compte ?
            </Text>
            <Button
              testID="privacy-delete-confirm"
              variant="danger"
              size="lg"
              fullWidth
              loading={remove.isPending}
              onPress={() => remove.mutate()}
            >
              Oui, supprimer mon compte
            </Button>
            <Button
              testID="privacy-delete-cancel"
              variant="ghost"
              fullWidth
              disabled={remove.isPending}
              onPress={() => setConfirming(false)}
            >
              Annuler
            </Button>
          </View>
        ) : (
          <Button
            testID="privacy-delete-start"
            variant="secondary"
            fullWidth
            onPress={() => setConfirming(true)}
          >
            Supprimer mon compte
          </Button>
        )}
      </View>
    </Card>
  );
}

function mutedText(
  colors: ReturnType<typeof useTheme>['colors'],
  typography: ReturnType<typeof useTheme>['typography'],
) {
  return {
    color: colors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.bodySm.fontSize,
  } as const;
}
