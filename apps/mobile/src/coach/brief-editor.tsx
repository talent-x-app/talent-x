import { type Exercise, type SessionBrief } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button, Card } from '../components/ui';
import {
  AthleteIntentBanner,
  BriefMetrics,
  SuccessStopCard,
  estimateDurationMinutes,
} from '../athlete/brief-ui';

/**
 * Édition de la couche éditoriale `brief` (ADR-28) côté constructeur C-05. Champs numériques
 * en chaînes (saisie libre, comme `EditableBlock`). La section regroupe les champs partagés
 * (consigne athlète, durée, difficulté, réussi/stop) et les champs **coach-only** (intention,
 * notes régression/progression/vigilance), plus un aperçu « Voir comme l'athlète » qui rend
 * exactement la lecture athlète depuis l'état courant (sans intent ni coachNotes).
 */
export interface BriefDraft {
  athleteIntent: string;
  durationMinutes: string;
  difficulty: string;
  successCriteria: string;
  stopCriteria: string;
  intent: string;
  regression: string;
  progression: string;
  caution: string;
}

export function makeEmptyBriefDraft(): BriefDraft {
  return {
    athleteIntent: '',
    durationMinutes: '',
    difficulty: '',
    successCriteria: '',
    stopCriteria: '',
    intent: '',
    regression: '',
    progression: '',
    caution: '',
  };
}

/** Hydrate un brouillon depuis le brief d'une séance existante (édition). */
export function briefDraftFromSession(brief: SessionBrief | undefined): BriefDraft {
  const d = makeEmptyBriefDraft();
  if (!brief) return d;
  return {
    athleteIntent: brief.athleteIntent ?? '',
    durationMinutes: brief.durationMinutes != null ? String(brief.durationMinutes) : '',
    difficulty: brief.difficulty != null ? String(brief.difficulty) : '',
    successCriteria: brief.successCriteria ?? '',
    stopCriteria: brief.stopCriteria ?? '',
    intent: brief.intent ?? '',
    regression: brief.coachNotes?.regression ?? '',
    progression: brief.coachNotes?.progression ?? '',
    caution: brief.coachNotes?.caution ?? '',
  };
}

const parseIntOrUndef = (s: string): number | undefined => {
  const n = Number.parseInt(s.trim(), 10);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Convertit le brouillon en `SessionBrief` à envoyer, ou `undefined` si entièrement vide
 * (séance sans brief — rétro-compat ADR-28). Seuls les champs renseignés sont émis.
 */
export function briefDraftToPayload(draft: BriefDraft): SessionBrief | undefined {
  const brief: SessionBrief = {};
  const text = (s: string) => (s.trim() ? s.trim() : undefined);
  if (text(draft.athleteIntent)) brief.athleteIntent = text(draft.athleteIntent);
  if (parseIntOrUndef(draft.durationMinutes) != null)
    brief.durationMinutes = parseIntOrUndef(draft.durationMinutes);
  if (parseIntOrUndef(draft.difficulty) != null)
    brief.difficulty = parseIntOrUndef(draft.difficulty);
  if (text(draft.successCriteria)) brief.successCriteria = text(draft.successCriteria);
  if (text(draft.stopCriteria)) brief.stopCriteria = text(draft.stopCriteria);
  if (text(draft.intent)) brief.intent = text(draft.intent);
  const coachNotes: NonNullable<SessionBrief['coachNotes']> = {};
  if (text(draft.regression)) coachNotes.regression = text(draft.regression);
  if (text(draft.progression)) coachNotes.progression = text(draft.progression);
  if (text(draft.caution)) coachNotes.caution = text(draft.caution);
  if (Object.keys(coachNotes).length > 0) brief.coachNotes = coachNotes;
  return Object.keys(brief).length > 0 ? brief : undefined;
}

/** Aperçu « lecture athlète » construit depuis le brouillon (sans intent ni coachNotes). */
function athletePreviewBrief(draft: BriefDraft): SessionBrief {
  return {
    athleteIntent: draft.athleteIntent.trim() || undefined,
    durationMinutes: parseIntOrUndef(draft.durationMinutes),
    difficulty: parseIntOrUndef(draft.difficulty),
    successCriteria: draft.successCriteria.trim() || undefined,
    stopCriteria: draft.stopCriteria.trim() || undefined,
  };
}

/**
 * Lecture coach du brief (C-08, ADR-28) : intention du jour + notes internes
 * (régression / progression / vigilance) et le critère de réussite comme **référentiel**
 * de la revue. Réservé au coach (ces champs ne sont jamais sérialisés vers un athlète).
 */
export function CoachBriefReview({ brief }: { brief: SessionBrief | undefined }) {
  const { colors, typography, spacing } = useTheme();
  const notes = brief?.coachNotes;
  const rows: { key: string; label: string; value: string; tone?: 'success' | 'warning' }[] = [];
  if (brief?.successCriteria)
    rows.push({
      key: 'success',
      label: 'Réussi si (référentiel)',
      value: brief.successCriteria,
      tone: 'success',
    });
  if (brief?.stopCriteria)
    rows.push({ key: 'stop', label: 'Stop si', value: brief.stopCriteria, tone: 'warning' });
  if (brief?.intent) rows.push({ key: 'intent', label: 'Intention du jour', value: brief.intent });
  if (notes?.regression)
    rows.push({ key: 'regression', label: 'Régression', value: notes.regression });
  if (notes?.progression)
    rows.push({ key: 'progression', label: 'Progression', value: notes.progression });
  if (notes?.caution) rows.push({ key: 'caution', label: 'Vigilance', value: notes.caution });
  if (rows.length === 0) return null;

  const toneColor = (tone?: 'success' | 'warning') =>
    tone === 'success'
      ? colors.success
      : tone === 'warning'
        ? colors.warning
        : colors.textSecondary;

  return (
    <View testID="coach-brief-review" style={{ gap: spacing[3] }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        Brief coach
      </Text>
      <Card>
        <View style={{ gap: spacing[3] }}>
          {rows.map((row) => (
            <View key={row.key} testID={`coach-brief-${row.key}`} style={{ gap: spacing[1] }}>
              <Text
                style={{
                  color: toneColor(row.tone),
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {row.label}
              </Text>
              <Text
                style={{
                  color: colors.textPrimary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                }}
              >
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'numeric';
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
        keyboardType={keyboardType}
        style={{
          minHeight: multiline ? 64 : 44,
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

/**
 * Section repliable « Intention & lecture athlète » (C-05). `items` = blocs courants
 * (pour l'estimation de durée et l'aperçu athlète).
 */
export function BriefEditor({
  draft,
  onChange,
  items,
}: {
  draft: BriefDraft;
  onChange: (patch: Partial<BriefDraft>) => void;
  items: Exercise[];
}) {
  const { colors, typography, spacing, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const estimate = estimateDurationMinutes(items);

  return (
    <View style={{ gap: spacing[3] }}>
      <Pressable
        testID="brief-section-toggle"
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
      >
        <Feather name="edit-3" size={16} color={colors.textSecondary} />
        <Text
          style={{
            flex: 1,
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.bodySm.fontSize,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}
        >
          Intention & lecture athlète
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>

      {open ? (
        <Card>
          <View style={{ gap: spacing[4] }}>
            <Field
              testID="brief-field-athleteIntent"
              label="Consigne pour l'athlète (une phrase)"
              value={draft.athleteIntent}
              onChangeText={(t) => onChange({ athleteIntent: t })}
              placeholder="Ex. Des efforts courts et réguliers. Ne pars pas trop vite."
              multiline
            />

            <View style={{ flexDirection: 'row', gap: spacing[3] }}>
              <View style={{ flex: 1 }}>
                <Field
                  testID="brief-field-duration"
                  label="Durée (min)"
                  value={draft.durationMinutes}
                  onChangeText={(t) => onChange({ durationMinutes: t.replace(/[^0-9]/g, '') })}
                  placeholder={estimate > 0 ? `≈ ${estimate} (estimée)` : 'Ex. 75'}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  testID="brief-field-difficulty"
                  label="Difficulté (1–10)"
                  value={draft.difficulty}
                  onChangeText={(t) => onChange({ difficulty: t.replace(/[^0-9]/g, '') })}
                  placeholder="Ex. 7"
                  keyboardType="numeric"
                />
              </View>
            </View>
            {estimate > 0 && draft.durationMinutes.trim() === '' ? (
              <Button
                testID="brief-use-estimate"
                variant="ghost"
                size="sm"
                onPress={() => onChange({ durationMinutes: String(estimate) })}
              >
                {`Utiliser l'estimation (~${estimate} min)`}
              </Button>
            ) : null}

            <Field
              testID="brief-field-success"
              label="✅ Réussi si…"
              value={draft.successCriteria}
              onChangeText={(t) => onChange({ successCriteria: t })}
              placeholder="Ex. Tenir les 16 efforts au même rythme."
              multiline
            />
            <Field
              testID="brief-field-stop"
              label="⚠️ Stop si… (dit à l'athlète)"
              value={draft.stopCriteria}
              onChangeText={(t) => onChange({ stopCriteria: t })}
              placeholder="Ex. Ta foulée s'écrase ou tu ne suis plus l'allure."
              multiline
            />

            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: spacing[4],
                gap: spacing[2],
              }}
            >
              <View
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing[1],
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: radius.sm,
                  paddingHorizontal: spacing[2],
                  paddingVertical: spacing[1],
                }}
              >
                <Feather name="lock" size={12} color={colors.textMuted} />
                <Text
                  style={{
                    color: colors.textMuted,
                    fontFamily: typography.fontFamily.medium,
                    fontSize: typography.caption.fontSize,
                  }}
                >
                  Coach uniquement — jamais envoyé à l'athlète
                </Text>
              </View>
            </View>

            <Field
              testID="brief-field-intent"
              label="Intention du jour"
              value={draft.intent}
              onChangeText={(t) => onChange({ intent: t })}
              placeholder="Ex. Intermittent court à haute intensité (VO₂max). Régularité > sprint."
              multiline
            />
            <Field
              testID="brief-field-regression"
              label="Régression"
              value={draft.regression}
              onChangeText={(t) => onChange({ regression: t })}
              placeholder="Ex. 2 × 6 rép. si décrochage ; récup 1 min."
              multiline
            />
            <Field
              testID="brief-field-progression"
              label="Progression"
              value={draft.progression}
              onChangeText={(t) => onChange({ progression: t })}
              placeholder="Ex. Semaine suivante 2 × 10 rép."
              multiline
            />
            <Field
              testID="brief-field-caution"
              label="Vigilance"
              value={draft.caution}
              onChangeText={(t) => onChange({ caution: t })}
              placeholder="Ex. Reprise après semaine chargée — surveiller les appuis."
              multiline
            />

            <Button
              testID="brief-preview-toggle"
              variant="secondary"
              leftIcon={<Feather name="eye" size={16} color={colors.textPrimary} />}
              onPress={() => setPreview((v) => !v)}
            >
              {preview ? "Masquer l'aperçu athlète" : "Voir comme l'athlète"}
            </Button>

            {preview ? (
              <View testID="brief-athlete-preview" style={{ gap: spacing[3] }}>
                <BriefMetrics brief={athletePreviewBrief(draft)} items={items} />
                {draft.athleteIntent.trim() ? (
                  <AthleteIntentBanner text={draft.athleteIntent.trim()} />
                ) : null}
                <SuccessStopCard
                  successCriteria={draft.successCriteria.trim() || undefined}
                  stopCriteria={draft.stopCriteria.trim() || undefined}
                />
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}
    </View>
  );
}
