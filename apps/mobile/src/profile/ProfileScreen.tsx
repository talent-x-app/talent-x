import { deleteAvatar, getMe, updateMe, type User, type UserUpdate } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
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
import { PrivacySection } from './PrivacySection';

/** Clé de cache du profil courant (partagée avec d'éventuels invalidations). */
export const ME_QUERY_KEY = ['me'] as const;

const ROLE_LABEL: Record<string, string> = { coach: 'Coach', athlete: 'Athlète' };

/**
 * Écran Profil (A-10 athlète / C-11 coach) — refonte « bandeau + sections » (V1). En-tête
 * d'identité sur aplat accent (avatar + nom + rôle), section Infos, puis réglages **repliables**
 * (Notifications, Confidentialité & données — composants existants réutilisés). Le centre de
 * notifications a migré sur la cloche (Accueil/hub). Lit `GET /users/me`, édite via `PUT /users/me`.
 */
export function ProfileScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { signOut } = useSession();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<UserUpdate>({});
  const [notifOpen, setNotifOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

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
    // Navigation explicite vers le login (cf. TLX-90 : '/' re-dériverait un rôle pas encore flushé).
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
  const roleLine = [ROLE_LABEL[user.role] ?? user.role, user.sport].filter(Boolean).join(' · ');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[5], gap: spacing[5] }}
    >
      {/* Bandeau d'identité (aplat accent — pas de lib gradient). */}
      <View
        style={{
          backgroundColor: colors.accent,
          borderRadius: radius.lg,
          padding: spacing[5],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
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
                style={[styles.avatar, { backgroundColor: colors.surface }]}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
                <Text
                  testID="profile-initials"
                  style={{
                    color: colors.accent,
                    fontFamily: typography.fontFamily.bold,
                    fontSize: typography.h3.fontSize,
                  }}
                >
                  {initials(user)}
                </Text>
              </View>
            )}
            {/* Pastille appareil photo. */}
            <View style={[styles.cameraBadge, { backgroundColor: colors.surface }]}>
              <Feather name="camera" size={12} color={colors.accent} />
            </View>
            {avatarBusy ? (
              <View style={[styles.avatar, styles.avatarOverlay]}>
                <ActivityIndicator color={colors.textOnAccent} />
              </View>
            ) : null}
          </Pressable>

          <View style={{ flex: 1, gap: spacing[1] }}>
            <Text
              testID="profile-name"
              numberOfLines={1}
              style={{
                color: colors.textOnAccent,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.h2.fontSize,
                letterSpacing: -0.3,
              }}
            >
              {fullName(user)}
            </Text>
            {roleLine ? (
              <Text
                style={{
                  color: colors.textOnAccent,
                  opacity: 0.9,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {roleLine}
              </Text>
            ) : null}
          </View>

          {!editing ? (
            <Pressable
              testID="profile-edit"
              onPress={() => startEditing(user)}
              accessibilityRole="button"
              accessibilityLabel="Modifier mon profil"
              hitSlop={8}
              style={[styles.editBtn, { borderColor: colors.textOnAccent }]}
            >
              <Feather name="edit-2" size={16} color={colors.textOnAccent} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {editing ? (
        <View style={{ gap: spacing[4] }}>
          {/* Gestion de la photo en mode édition. */}
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Button
              testID="profile-avatar-change-edit"
              variant="secondary"
              onPress={() => avatar.mutate()}
              loading={avatar.isPending}
            >
              {user.photoUrl ? 'Changer la photo' : 'Ajouter une photo'}
            </Button>
            {user.photoUrl ? (
              <Button
                testID="profile-avatar-remove"
                variant="ghost"
                onPress={() => removeAvatar.mutate()}
                loading={removeAvatar.isPending}
              >
                Supprimer la photo
              </Button>
            ) : null}
          </View>
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
          {/* Section INFOS. */}
          <View style={{ gap: spacing[3] }}>
            <SectionLabel>Infos</SectionLabel>
            <Card>
              <View style={{ gap: spacing[4] }}>
                <InfoRow icon="mail" label="E-mail" value={user.email} muted />
                <InfoRow icon="activity" label="Discipline" value={user.sport} />
                <InfoRow icon="file-text" label="Bio" value={user.bio} />
              </View>
            </Card>
          </View>

          {/* Réglages repliables. */}
          <View style={{ gap: spacing[3] }}>
            <SectionLabel>Réglages</SectionLabel>
            <SettingsRow
              testID="profile-notifications-row"
              icon="bell"
              label="Notifications"
              open={notifOpen}
              onToggle={() => setNotifOpen((o) => !o)}
            />
            {notifOpen ? <NotificationPreferencesSection /> : null}
            <SettingsRow
              testID="profile-privacy-row"
              icon="lock"
              label="Confidentialité & données"
              open={privacyOpen}
              onToggle={() => setPrivacyOpen((o) => !o)}
            />
            {privacyOpen ? <PrivacySection role={user.role} /> : null}
          </View>

          <Button testID="profile-logout" variant="ghost" fullWidth onPress={() => void onLogout()}>
            Se déconnecter
          </Button>
        </View>
      )}
    </ScrollView>
  );
}

/** Intitulé de section (uppercase, espacé). */
function SectionLabel({ children }: { children: string }) {
  const { colors, typography } = useTheme();
  return (
    <Text
      style={{
        color: colors.textSecondary,
        fontFamily: typography.fontFamily.medium,
        fontSize: typography.bodySm.fontSize,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      {children}
    </Text>
  );
}

/** Ligne d'info : icône + label (gauche) + valeur (droite). Tiret si absente. */
function InfoRow({
  icon,
  label,
  value,
  muted,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  muted?: boolean;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
      <Feather name={icon} size={16} color={colors.textMuted} />
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
        numberOfLines={1}
        style={{
          flex: 1,
          textAlign: 'right',
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

/** Ligne de réglage repliable : icône + label + chevron. */
function SettingsRow({
  icon,
  label,
  open,
  onToggle,
  testID,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  open: boolean;
  onToggle: () => void;
  testID: string;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <Card testID={testID} onPress={onToggle} accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: colors.accentSubtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={icon} size={18} color={colors.accentText} />
        </View>
        <Text
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.body.fontSize,
          }}
        >
          {label}
        </Text>
        <Feather
          name={open ? 'chevron-down' : 'chevron-right'}
          size={20}
          color={colors.textMuted}
        />
      </View>
    </Card>
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
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
