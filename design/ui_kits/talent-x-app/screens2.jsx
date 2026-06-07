/* Talent-X app — workout detail + secondary tab screens (Calendrier, Progression, Profil). */

const { useState: useStateD } = React;

/* ============================================================
   WORKOUT / SÉANCE DETAIL
   ============================================================ */
const EXERCISES = [
  { n: 'Développé couché', sets: '4 × 8', kg: '60 kg', done: true },
  { n: 'Tractions lestées', sets: '3 × max', kg: '+10 kg', done: true },
  { n: 'Développé militaire', sets: '4 × 10', kg: '35 kg', done: false },
  { n: 'Rowing barre', sets: '4 × 10', kg: '50 kg', done: false },
  { n: 'Élévations latérales', sets: '3 × 15', kg: '10 kg', done: false },
  { n: 'Gainage', sets: '3 × 60 s', kg: '—', done: false },
];

function WorkoutScreen({ t, onBack }) {
  const [done, setDone] = useStateD({ 0: true, 1: true });
  const total = EXERCISES.length;
  const completed = Object.values(done).filter(Boolean).length;
  const toggle = i => setDone(d => ({ ...d, [i]: !d[i] }));
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: t.bg }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <StatusSpacer />
        <div style={{ padding: '0 18px 18px' }}>
          <PushHeader title="" t={t} onBack={onBack} trailing={<button style={{ width: 40, height: 40, borderRadius: t.r.sm, border: 0, background: 'transparent', cursor: 'pointer' }}><Icon name="more" size={22} color={t.text} /></button>} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: -6, marginBottom: 18 }}>
            <div style={{ width: 54, height: 54, borderRadius: 15, background: t.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Icon name="dumbbell" size={26} color="#fff" />
            </div>
            <div>
              <div style={{ fontFamily: t.font, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: t.text }}>Haut du corps</div>
              <div style={{ fontFamily: t.font, fontSize: 13, color: t.muted }}>Force · Léa Dubois</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            <TXMetric label="Durée" value="~50" unit=" min" icon="clock" t={t} />
            <TXMetric label="Exercices" value={total} icon="dumbbell" t={t} />
            <TXMetric label="RPE cible" value="8" icon="flame" t={t} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <TXBar value={(completed / total) * 100} t={t} label="Progression" sub={`${completed}/${total}`} />
          </div>

          <Overline t={t}>Exercices</Overline>
          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.r.md, overflow: 'hidden' }}>
            {EXERCISES.map((ex, i) => {
              const on = !!done[i];
              return (
                <div key={i} onClick={() => toggle(i)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderTop: i ? `1px solid ${t.border}` : 'none', cursor: 'pointer' }}>
                  <span style={{ width: 22, height: 22, borderRadius: 6, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? t.accent : 'transparent', border: on ? 'none' : `2px solid ${t.borderStrong}` }}>
                    {on && <Icon name="check" size={13} color="#fff" strokeWidth={3.5} />}
                  </span>
                  <span style={{ flex: 1, fontFamily: t.font, fontSize: 14, fontWeight: 500, color: t.text, textDecoration: on ? 'line-through' : 'none', opacity: on ? 0.55 : 1 }}>{ex.n}</span>
                  <span style={{ fontFamily: t.font, fontSize: 12, color: t.muted }}>{ex.kg}</span>
                  <span style={{ fontFamily: t.font, fontSize: 12, fontWeight: 600, color: t.text2, minWidth: 52, textAlign: 'right' }}>{ex.sets}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* fixed footer action */}
      <div style={{ flex: 'none', padding: '12px 18px calc(12px + 20px)', borderTop: `1px solid ${t.border}`, background: t.surface }}>
        <TXButton t={t} size="lg" style={{ width: '100%' }} icon="check">Enregistrer la séance</TXButton>
      </div>
    </div>
  );
}

/* ============================================================
   CALENDRIER (planning)
   ============================================================ */
function CalendarScreen({ t, onOpenWorkout }) {
  const week = [
    { d: 'Lun 12', items: [['Bas du corps', 'success']] },
    { d: 'Mar 13', items: [['Récupération active', 'info']] },
    { d: 'Mer 14', items: [['Cardio intervalle', 'success']] },
    { d: 'Jeu 15', items: [['Haut du corps — force', 'accent']], today: true },
    { d: 'Ven 16', items: [] },
    { d: 'Sam 17', items: [['Sortie longue', 'warning']] },
  ];
  const tone = { success: [t.successBg, t.success], info: [t.accentSubtle, t.accentText], warning: [t.warningBg, t.warning], accent: [t.accent, '#fff'] };
  return (
    <Scroll t={t}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ flex: 1, fontFamily: t.font, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: t.text }}>Calendrier</div>
        <TXButton t={t} size="sm" icon="plus">Nouveau plan</TXButton>
      </div>
      <div style={{ marginBottom: 20 }}><WeekStrip t={t} /></div>
      <Overline t={t}>Semaine du 12 mai</Overline>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {week.map((day, i) => (
          <div key={i} style={{ display: 'flex', gap: 12 }}>
            <div style={{ width: 54, flex: 'none', paddingTop: 13, fontFamily: t.font, fontSize: 12, fontWeight: 600, color: day.today ? t.accentText : t.muted }}>{day.d}</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {day.items.length === 0 && <div style={{ fontFamily: t.font, fontSize: 13, color: t.muted, padding: '13px 0' }}>Repos</div>}
              {day.items.map(([nm, tn], j) => {
                const [bg, fg] = tone[tn];
                const solid = tn === 'accent';
                return (
                  <div key={j} onClick={onOpenWorkout} style={{ background: solid ? bg : t.surface, border: `1px solid ${solid ? 'transparent' : t.border}`, borderRadius: t.r.sm, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: solid ? '#fff' : fg, flex: 'none' }} />
                    <span style={{ flex: 1, fontFamily: t.font, fontSize: 14, fontWeight: 600, color: solid ? '#fff' : t.text }}>{nm}</span>
                    <Icon name="fwd" size={16} color={solid ? 'rgba(255,255,255,.7)' : t.muted} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Scroll>
  );
}

/* ============================================================
   PROGRESSION (stats overview)
   ============================================================ */
function ProgressLine({ t }) {
  return (
    <svg width="100%" height="130" viewBox="0 0 300 130" preserveAspectRatio="none" style={{ display: 'block' }}>
      {[35, 70, 105].map(y => <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,.06)" />)}
      <polyline points="0,108 50,92 100,96 150,64 200,68 250,38 300,32" fill="none" stroke="#2E7CF6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="0,114 50,112 100,102 150,104 200,90 250,88 300,80" fill="none" stroke="#8A94A6" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round" />
    </svg>
  );
}

function ProgressScreen({ t }) {
  const [seg, setSeg] = useStateD('mois');
  return (
    <Scroll t={t}>
      <div style={{ fontFamily: t.font, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: t.text, marginBottom: 16 }}>Progression</div>
      <div style={{ marginBottom: 18 }}>
        <TXSegmented t={t} value={seg} onChange={setSeg} options={[{ value: 'sem', label: 'Semaine' }, { value: 'mois', label: 'Mois' }, { value: 'an', label: 'Année' }]} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <TXMetric label="Volume total" value="248" unit=" t" delta="14 %" deltaTone="up" t={t} />
        <TXMetric label="Séances" value="64" delta="6" deltaTone="up" t={t} />
        <TXMetric label="Assiduité" value="91" unit=" %" delta="2 %" deltaTone="down" t={t} />
      </div>
      <Overline t={t}>Charge réalisée vs objectif</Overline>
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.r.md, padding: 16, marginBottom: 8 }}>
        <ProgressLine t={t} />
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: t.font, fontSize: 12, color: t.text2 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: '#2E7CF6' }} />Réalisé</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: t.font, fontSize: 12, color: t.text2 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: '#8A94A6' }} />Objectif</span>
        </div>
      </div>
      <div style={{ background: t.warningBg, borderRadius: t.r.md, padding: 14, display: 'flex', gap: 11, marginTop: 14 }}>
        <Icon name="warn" size={20} color={t.warning} />
        <div style={{ fontFamily: t.font, fontSize: 13, color: t.text, lineHeight: 1.5 }}>
          <b style={{ color: t.warning }}>Charge élevée 3 jours d'affilée.</b> Prévois une séance de récupération cette semaine.
        </div>
      </div>
    </Scroll>
  );
}

/* ============================================================
   PROFIL (settings)
   ============================================================ */
function ProfileScreen({ t, onLogout }) {
  const [push, setPush] = useStateD(true);
  const [dark, setDark] = useStateD(true);
  const Row = ({ icon, label, trailing, last }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px', borderTop: last ? 'none' : `1px solid ${t.border}` }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: t.accentSubtle, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Icon name={icon} size={18} color={t.accentText} />
      </div>
      <span style={{ flex: 1, fontFamily: t.font, fontSize: 15, fontWeight: 500, color: t.text }}>{label}</span>
      {trailing || <Icon name="fwd" size={18} color={t.muted} />}
    </div>
  );
  return (
    <Scroll t={t}>
      <div style={{ fontFamily: t.font, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: t.text, marginBottom: 18 }}>Profil</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.r.md, padding: 16, marginBottom: 18 }}>
        <TXAvatar initials="MC" t={t} role="coach" size={56} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: t.font, fontSize: 18, fontWeight: 700, color: t.text }}>Marc Caron</div>
          <div style={{ fontFamily: t.font, fontSize: 13, color: t.muted }}>Coach · 4 athlètes</div>
        </div>
        <TXBadge tone="accent" t={t}>Pro</TXBadge>
      </div>

      <Overline t={t}>Préférences</Overline>
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.r.md, overflow: 'hidden', marginBottom: 18 }}>
        <Row icon="bell" label="Notifications push" trailing={<TXSwitch on={push} onChange={setPush} t={t} />} />
        <Row icon="settings" label="Thème sombre" trailing={<TXSwitch on={dark} onChange={setDark} t={t} />} />
        <Row icon="star" label="Objectifs" last />
      </div>

      <Overline t={t}>Compte</Overline>
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.r.md, overflow: 'hidden', marginBottom: 18 }}>
        <Row icon="user" label="Informations personnelles" />
        <Row icon="trophy" label="Abonnement" />
        <Row icon="info" label="Aide & confidentialité" last />
      </div>

      <TXButton t={t} variant="secondary" style={{ width: '100%' }} onClick={onLogout}>Se déconnecter</TXButton>
    </Scroll>
  );
}

Object.assign(window, { WorkoutScreen, CalendarScreen, ProgressScreen, ProfileScreen });
