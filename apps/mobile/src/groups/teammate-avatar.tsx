import type { GroupTeammate } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Image, Text, View } from 'react-native';

/** Avatar minimisé d'un coéquipier (ADR-37) — photo présignée ou initiales. Réutilisé par le
 * roster, la pile d'auteurs de réactions et les kudos (ADR-48/49, Palier 2). */
export function TeammateAvatar({
  teammate,
  size = 24,
  testID,
}: {
  teammate: GroupTeammate;
  size?: number;
  testID?: string;
}) {
  const { colors, typography } = useTheme();
  const radius = Math.round(size * 0.28);
  if (teammate.avatarUrl) {
    return (
      <Image
        testID={testID}
        source={{ uri: teammate.avatarUrl }}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  return (
    <View
      testID={testID}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: colors.accentSubtle,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: colors.accentText,
          fontFamily: typography.fontFamily.bold,
          fontSize: Math.max(9, Math.round(size * 0.42)),
        }}
      >
        {teammateInitials(teammate)}
      </Text>
    </View>
  );
}

/** Pile d'avatars superposés (coéquipiers), bornée — pour réactions/kudos nominatifs. */
export function TeammateAvatarStack({
  teammates,
  size = 24,
  max = 4,
}: {
  teammates: GroupTeammate[];
  size?: number;
  max?: number;
}) {
  const { colors } = useTheme();
  const shown = teammates.slice(0, max);
  const overlap = Math.round(size * 0.35);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((t, i) => (
        <View
          key={t.id}
          style={{
            marginLeft: i === 0 ? 0 : -overlap,
            borderRadius: Math.round(size * 0.28) + 1,
            borderWidth: 1.5,
            borderColor: colors.surface,
          }}
        >
          <TeammateAvatar teammate={t} size={size} />
        </View>
      ))}
    </View>
  );
}

export function teammateName(teammate: GroupTeammate): string {
  const name = [teammate.firstName, teammate.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : 'Athlète';
}

/** Prénom seul (libellés compacts « par Léa, Karim »). */
export function teammateFirstName(teammate: GroupTeammate): string {
  return teammate.firstName?.trim() || teammateName(teammate);
}

function teammateInitials(teammate: GroupTeammate): string {
  const letters = [teammate.firstName?.[0], teammate.lastName?.[0]].filter(Boolean).join('');
  return (letters || '?').toUpperCase();
}
