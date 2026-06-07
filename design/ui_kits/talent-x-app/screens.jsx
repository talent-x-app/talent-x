/* Talent-X app — screen compositions for the UI kit.
   Dark-first, French copy. Depends on window.TX/theme/Icon and the TX* components.
   Each screen returns a full-height flex column: scroll region + optional bottom chrome. */

const { useState: useStateS } = React;

/* ---- Shared bits ---- */
function StatusSpacer() { return <div style={{ height: 56, flex: 'none' }} />; }

function Scroll({ children, t, pad = 18 }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: t.bg }}>
      <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <StatusSpacer />
        <div style={{ padding: `0 ${pad}px 24px` }}>{children}</div>
      </div>
    </div>
  );
}

function Overline({ children, t }) {
  return <div style={{ fontFamily: t.font, fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.muted, marginBottom: 10 }}>{children}</div>;
}

function PushHeader({ title, t, onBack, trailing }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
      <button onClick={onBack} style={{ width: 40, height: 40, marginLeft: -8, borderRadius: t.r.sm, border: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <Icon name="back" size={24} color={t.text} />
      </button>
      <div style={{ flex: 1, fontFamily: t.font, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: t.text }}>{title}</div>
      {trailing}
    </div>
  );
}

/* ============================================================
   LOGIN
   ============================================================ */
function LoginScreen({ onLogin, t }) {
  const [email, setEmail] = useStateS('marc@talent-x.fr');
  const [pwd, setPwd] = useStateS('••••••••');
  return (
    <div style={{ height: '100%', background: t.bg, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 26px' }}>
      {/* radial halo allowed on hero per identity board */}
      <div style={{ position: 'absolute', top: 90, left: '50%', transform: 'translateX(-50%)', width: 360, height: 360, background: 'radial-gradient(circle, rgba(46,124,246,0.22), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
        <div style={{ width: 76, height: 76, borderRadius: 19, background: t.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 32px rgba(46,124,246,0.35)' }}>
          <img src="../../assets/monogram-white.svg" alt="Talent-X" style={{ width: 46, height: 'auto', display: 'block' }} />
        </div>
        <div style={{ fontFamily: t.font, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: t.text, marginTop: 18 }}>Talent‑X</div>
        <div style={{ fontFamily: t.font, fontSize: 15, color: t.text2, marginTop: 4 }}>Coach et athlète, connectés.</div>
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TXField label="E‑mail" value={email} onChange={setEmail} t={t} placeholder="ton@email.fr" />
        <TXField label="Mot de passe" value={pwd} onChange={setPwd} t={t} type="password" />
        <TXButton t={t} size="lg" style={{ width: '100%', marginTop: 6 }} onClick={onLogin}>Se connecter</TXButton>
        <TXButton t={t} variant="ghost" style={{ width: '100%' }} onClick={onLogin}>Créer un compte</TXButton>
      </div>
      <div style={{ position: 'relative', textAlign: 'center', marginTop: 28, fontFamily: t.font, fontSize: 12, color: t.muted }}>Mot de passe oublié ?</div>
    </div>
  );
}

/* ============================================================
   HOME / DASHBOARD (coach)
   ============================================================ */
const ATHLETES = [
  { id: 'a1', name: 'Léa Dubois', initials: 'LD', role: 'athlete', tone: 'success', status: 'À jour', charge: 88, note: 'Séance haut du corps · hier' },
  { id: 'a2', name: 'Yanis Bferr', initials: 'YB', role: 'athlete', tone: 'warning', status: 'Charge élevée', charge: 64, note: 'Récup conseillée · 3 j intenses' },
  { id: 'a3', name: 'Camille Roy', initials: 'CR', role: 'athlete', tone: 'success', status: 'À jour', charge: 95, note: 'PR squat 120 kg · lundi' },
  { id: 'a4', name: 'Tom Petit', initials: 'TP', role: 'athlete', tone: 'danger', status: 'En retard', charge: 32, note: '2 séances manquées' },
];

function WeekStrip({ t }) {
  const days = [['L', 12], ['M', 13], ['M', 14], ['J', 15, true], ['V', 16], ['S', 17], ['D', 18]];
  return (
    <div style={{ display: 'flex', gap: 7 }}>
      {days.map(([d, n, on], i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: t.r.sm,
          background: on ? t.accent : t.surface, border: `1px solid ${on ? t.accent : t.border}` }}>
          <div style={{ fontFamily: t.font, fontSize: 10, fontWeight: 600, color: on ? 'rgba(255,255,255,.8)' : t.muted, marginBottom: 3 }}>{d}</div>
          <div style={{ fontFamily: t.font, fontSize: 15, fontWeight: 700, color: on ? '#fff' : t.text }}>{n}</div>
        </div>
      ))}
    </div>
  );
}

function HomeScreen({ t, onOpenAthlete, onOpenWorkout }) {
  return (
    <Scroll t={t}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: t.font, fontSize: 13, color: t.text2 }}>Jeudi 15 mai</div>
          <div style={{ fontFamily: t.font, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: t.text }}>Salut, Marc</div>
        </div>
        <button style={{ width: 44, height: 44, borderRadius: t.r.sm, border: `1px solid ${t.border}`, background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
          <Icon name="bell" size={21} color={t.text} />
          <span style={{ position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: 99, background: t.danger }} />
        </button>
        <TXAvatar initials="MC" t={t} role="coach" size={44} />
      </div>

      <div style={{ marginBottom: 22 }}><WeekStrip t={t} /></div>

      <Overline t={t}>Séance du jour</Overline>
      <div onClick={onOpenWorkout} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.r.md, padding: 16, marginBottom: 22, cursor: 'pointer', boxShadow: t.glow }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 13, background: t.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Icon name="dumbbell" size={24} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: t.font, fontSize: 16, fontWeight: 600, color: t.text }}>Haut du corps — force</div>
            <div style={{ fontFamily: t.font, fontSize: 13, color: t.muted }}>6 exercices · ~50 min · RPE 8</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <TXButton t={t} style={{ flex: 1 }} icon="play" onClick={(e) => { e.stopPropagation(); onOpenWorkout(); }}>Démarrer</TXButton>
          <TXButton t={t} variant="secondary" style={{ width: 52 }} onClick={(e) => e.stopPropagation()}><Icon name="more" size={20} color={t.text} /></TXButton>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <TXMetric label="Assiduité" value="92" unit=" %" delta="8 %" deltaTone="up" icon="check" t={t} />
        <TXMetric label="Charge sem." value="12.4" unit=" t" delta="3 %" deltaTone="down" icon="dumbbell" t={t} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <Overline t={t}>Tes athlètes</Overline>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: t.font, fontSize: 12, color: t.accentText, fontWeight: 600, marginBottom: 10, cursor: 'pointer' }}>Tout voir</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ATHLETES.map(a => (
          <div key={a.id} onClick={() => onOpenAthlete(a)} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.r.md, padding: 13, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <TXAvatar initials={a.initials} t={t} role="athlete" size={42} gradient={false} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: t.font, fontSize: 15, fontWeight: 600, color: t.text }}>{a.name}</div>
              <div style={{ fontFamily: t.font, fontSize: 12, color: t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.note}</div>
            </div>
            <TXBadge tone={a.tone} t={t}>{a.status}</TXBadge>
          </div>
        ))}
      </div>
    </Scroll>
  );
}

/* ============================================================
   ATHLETE DETAIL
   ============================================================ */
function MiniBars({ t }) {
  const bars = [55, 70, 42, 80, 60, 48, 66];
  return (
    <svg width="100%" height="120" viewBox="0 0 300 120" preserveAspectRatio="none" style={{ display: 'block' }}>
      {[30, 60, 90].map(y => <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,.06)" />)}
      {bars.map((h, i) => {
        const peak = h === Math.max(...bars);
        return <rect key={i} x={14 + i * 41} y={110 - h} width="26" height={h} rx="4" fill={peak ? '#5BAEFF' : '#2E7CF6'} />;
      })}
    </svg>
  );
}

function AthleteScreen({ athlete, t, onBack, onOpenWorkout }) {
  const [seg, setSeg] = useStateS('apercu');
  return (
    <Scroll t={t}>
      <PushHeader title="" t={t} onBack={onBack} trailing={<button style={{ width: 40, height: 40, borderRadius: t.r.sm, border: 0, background: 'transparent', cursor: 'pointer' }}><Icon name="more" size={22} color={t.text} /></button>} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, marginTop: -6 }}>
        <TXAvatar initials={athlete.initials} t={t} role="athlete" size={60} gradient={false} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: t.font, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: t.text }}>{athlete.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <TXBadge tone={athlete.tone} t={t}>{athlete.status}</TXBadge>
            <span style={{ fontFamily: t.font, fontSize: 12, color: t.muted }}>Athlète · depuis janv. 2025</span>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <TXSegmented t={t} value={seg} onChange={setSeg} options={[{ value: 'apercu', label: "Aperçu" }, { value: 'seances', label: 'Séances' }, { value: 'prog', label: 'Progression' }]} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <TXMetric label="PR squat" value="120" unit=" kg" delta="5 kg" deltaTone="up" t={t} />
        <TXMetric label="Volume" value="8.6" unit=" t" delta="12 %" deltaTone="up" t={t} />
        <TXMetric label="RPE moy." value="7.4" delta="0.3" deltaTone="flat" t={t} />
      </div>

      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.r.md, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <TXRing value={athlete.charge} t={t} label="Assiduité 30 j" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TXBar value={82} t={t} label="Force" sub="82 %" />
            <TXBar value={64} t={t} label="Endurance" sub="64 %" />
            <TXBar value={71} t={t} label="Mobilité" sub="71 %" />
          </div>
        </div>
      </div>

      <Overline t={t}>Charge hebdomadaire</Overline>
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.r.md, padding: 16, marginBottom: 18 }}>
        <MiniBars t={t} />
      </div>

      <Overline t={t}>Séances récentes</Overline>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[['Haut du corps — force', 'Hier · RPE 8', 'check'], ['Bas du corps', 'Lun. · RPE 7', 'check'], ['Cardio intervalle', 'Sam. · manquée', 'close']].map(([nm, mt, ic], i) => (
          <div key={i} onClick={onOpenWorkout} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.r.md, padding: 13, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: ic === 'close' ? t.dangerBg : t.accentSubtle, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Icon name={ic === 'close' ? 'close' : 'check'} size={18} color={ic === 'close' ? t.danger : t.accentText} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: t.font, fontSize: 14, fontWeight: 600, color: t.text }}>{nm}</div>
              <div style={{ fontFamily: t.font, fontSize: 12, color: t.muted }}>{mt}</div>
            </div>
            <Icon name="fwd" size={18} color={t.muted} />
          </div>
        ))}
      </div>
    </Scroll>
  );
}

Object.assign(window, { LoginScreen, HomeScreen, AthleteScreen, Scroll, Overline, PushHeader, StatusSpacer, WeekStrip, ATHLETES });
