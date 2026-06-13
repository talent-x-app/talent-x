import { deleteAvatar, getMe, updateMe, type User, type UserUpdate } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { Button, Card, Input } from '../components/ui';
import { toUserMessage, useToast } from '../feedback';
import { uploadAvatar } from './avatar-upload';
import { NotificationPreferencesSection } from '../notifications/NotificationPreferencesSection';
import { NotificationsLink } from '../notifications/NotificationsLink';
import { MyGroupSection } from '../groups/MyGroupSection';
import { PrivacySection } from './PrivacySection';

/** Clé de cache du profil courant (partagée avec d'éventuels invalidations). */
export const ME_QUERY_KEY = ['me'] as const;

const ROLE_LABEL: Record<string, string> = { coach: 'Coach', athlete: 'Athlète' };

/**
 * Écran Profil (A-10 athlète / C-11 coach — TLX-042/043). Lit le profil courant
 * via `GET /users/me` et permet de l'éditer (`PUT /users/me` : prénom, nom, sport,
 * bio). Le rendu dérive du rôle renvoyé par l'API. Réutilisé tel quel par les deux
 * onglets « Profil » ; aucune logique propre à un rôle au-delà du libellé affiché.
 *
 * États gérés : chargement, erreur (avec réessai), édition (chargement à
 * l'enregistrement, erreur via toast). Tous les visuels dérivent des tokens.
 */
export function ProfileScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { signOut } = useSession();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UserUpdate>({});

  const profile = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<User> => {
      const response = await getMe();
      if (response.status === 200) return response.data;
      throw response;
    },
  });

  const save = useMutation({
    mutationFn: async (changes: UserUpdate): Promise<User> => {
      const response = await updateMe(changes);
      if (response.status === 200) return response.data;
      throw response;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(ME_QUERY_KEY, updated);
      setEditing(false);
      toast.show({ variant: 'success', title: 'Profil mis à jour' });
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  // Avatar (TLX-124) : choix + recadrage carré → upload présigné → confirmation.
  const avatar = useMutation({
    mutationFn: async (): Promise<User | null> => {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (picked.canceled || picked.assets.length === 0) return null;
      const asset = picked.assets[0];
      return uploadAvatar({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
    },
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData(ME_QUERY_KEY, updated);
      toast.show({ variant: 'success', title: 'Photo de profil mise à jour' });
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const removeAvatar = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await deleteAvatar();
      if (response.status !== 204) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      toast.show({ variant: 'success', title: 'Photo de profil supprimée' });
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const avatarBusy = avatar.isPending || removeAvatar.isPending;

  const startEditing = (user: User) => {
    setForm({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      sport: user.sport ?? '',
      bio: user.bio ?? '',
    });
    setEditing(true);
  };

  const onLogout = async () => {
    await signOut();
    // Navigation explicite vers le login : passer par '/' re-dériverait le rôle
    // depuis le contexte pas encore flushé (role toujours athlete/coach) et nous
    // garderait visuellement connectés (TLX-90). Le garde de rôle des layouts
    // (athlete)/(coach) sert de filet de sécurité.
    router.replace('/(auth)/login');
  };

  if (profile.isLoading) {
    return (
      <View
        testID="profile-loading"
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <View
        testID="profile-error"
        style={[styles.centered, { backgroundColor: colors.background, padding: spacing[6] }]}
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.body.fontSize,
            textAlign: 'center',
            marginBottom: spacing[4],
          }}
        >
          Impossible de charger ton profil.
        </Text>
        <Button testID="profile-retry" onPress={() => void profile.refetch()}>
          Réessayer
        </Button>
      </View>
    );
  }

  const user = profile.data;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
    >
      <Text
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.h1.fontSize,
          letterSpacing: -0.5,
        }}
      >
        Profil
      </Text>

      {/* En-tête : avatar (photo ou initiales) + identité + rôle. */}
      <Card>
        <View style={styles.header}>
          <Pressable
            testID="profile-avatar-change"
            onPress={() => avatar.mutate()}
            disabled={avatarBusy}
            accessibilityRole="button"
            accessibilityLabel="Changer la photo de profil"
          >
            {user.photoUrl ? (
              <Image
                testID="profile-photo"
                source={{ uri: user.photoUrl }}
                style={[styles.avatar, { backgroundColor: colors.accentSubtle }]}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.accentSubtle }]}>
                <Text
                  testID="profile-initials"
                  style={{
                    color: colors.accentText,
                    fontFamily: typography.fontFamily.bold,
                    fontSize: typography.h3.fontSize,
                  }}
                >
                  {initials(user)}
                </Text>
              </View>
            )}
            {avatarBusy ? (
              <View style={[styles.avatar, styles.avatarOverlay]}>
                <ActivityIndicator color={colors.accentText} />
              </View>
            ) : null}
          </Pressable>
          <View style={{ flex: 1, gap: spacing[1] }}>
            <Text
              testID="profile-name"
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.h3.fontSize,
              }}
            >
              {fullName(user)}
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {[ROLE_LABEL[user.role] ?? user.role, user.sport].filter(Boolean).join(' · ')}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[1] }}>
              <Pressable
                testID="profile-avatar-change-link"
                onPress={() => avatar.mutate()}
                disabled={avatarBusy}
              >
                <Text
                  style={{
                    color: colors.accent,
                    fontFamily: typography.fontFamily.medium,
                    fontSize: typography.bodySm.fontSize,
                  }}
                >
                  {user.photoUrl ? 'Changer la photo' : 'Ajouter une photo'}
                </Text>
              </Pressable>
              {user.photoUrl ? (
                <Pressable
                  testID="profile-avatar-remove"
                  onPress={() => removeAvatar.mutate()}
                  disabled={avatarBusy}
                >
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontFamily: typography.fontFamily.medium,
                      fontSize: typography.bodySm.fontSize,
                    }}
                  >
                    Supprimer
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Card>

      {editing ? (
        <View style={{ gap: spacing[4] }}>
          <Input
            label="Prénom"
            testID="profile-firstName"
            value={form.firstName ?? ''}
            onChangeText={(t) => setForm((p) => ({ ...p, firstName: t }))}
            editable={!save.isPending}
          />
          <Input
            label="Nom"
            testID="profile-lastName"
            value={form.lastName ?? ''}
            onChangeText={(t) => setForm((p) => ({ ...p, lastName: t }))}
            editable={!save.isPending}
          />
          <Input
            label="Discipline"
            testID="profile-sport"
            value={form.sport ?? ''}
            onChangeText={(t) => setForm((p) => ({ ...p, sport: t }))}
            placeholder="ex. 200m, saut en longueur"
            editable={!save.isPending}
          />
          <Input
            label="Bio"
            testID="profile-bio"
            value={form.bio ?? ''}
            onChangeText={(t) => setForm((p) => ({ ...p, bio: t }))}
            placeholder="Quelques mots sur toi"
            multiline
            editable={!save.isPending}
          />
          <View style={{ gap: spacing[2] }}>
            <Button
              testID="profile-save"
              size="lg"
              fullWidth
              loading={save.isPending}
              onPress={() => save.mutate(trimmed(form))}
            >
              Enregistrer
            </Button>
            <Button
              testID="profile-cancel"
              variant="ghost"
              fullWidth
              disabled={save.isPending}
              onPress={() => setEditing(false)}
            >
              Annuler
            </Button>
          </View>
        </View>
      ) : (
        <View style={{ gap: spacing[5] }}>
          <Card>
            <View style={{ gap: spacing[4] }}>
              <Field label="E-mail" value={user.email} muted />
              <Field label="Discipline" value={user.sport} />
              <Field label="Bio" value={user.bio} />
            </View>
          </Card>
          {/* Mon groupe / Mon coach (TLX-88, ADR-26) : réservé à l'athlète — le coach
              gère ses groupes depuis le dashboard / l'écran Athlètes. */}
          {user.role === 'athlete' ? <MyGroupSection /> : null}
          {/* Centre de notifications + préférences (TLX-111, ADR-23). */}
          <NotificationsLink />
          <NotificationPreferencesSection />
          {/* Confidentialité & droits RGPD : consentements, export, suppression (TLX-106). */}
          <PrivacySection role={user.role} />
          <Button testID="profile-edit" size="lg" fullWidth onPress={() => startEditing(user)}>
            Modifier mon profil
          </Button>
          <Button
            testID="profile-logout"
            variant="secondary"
            fullWidth
            onPress={() => void onLogout()}
          >
            Se déconnecter
          </Button>
        </View>
      )}
    </ScrollView>
  );
}

/** Ligne label/valeur en mode lecture ; affiche un tiret si la valeur est absente. */
function Field({ label, value, muted }: { label: string; value?: string; muted?: boolean }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ gap: spacing[1] }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: muted ? colors.textMuted : colors.textPrimary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.body.fontSize,
        }}
      >
        {value && value.length > 0 ? value : '—'}
      </Text>
    </View>
  );
}

function fullName(user: User): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : user.email;
}

function initials(user: User): string {
  const letters = [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join('');
  return (letters || user.email[0] || '?').toUpperCase();
}

/** Trim des champs texte avant envoi (évite d'enregistrer des espaces parasites). */
function trimmed(form: UserUpdate): UserUpdate {
  return {
    firstName: form.firstName?.trim(),
    lastName: form.lastName?.trim(),
    sport: form.sport?.trim(),
    bio: form.bio?.trim(),
  };
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
