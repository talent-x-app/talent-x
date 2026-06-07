/* Talent-X UI kit — reusable components. Depends on window.TX, window.Icon.
   All visuals derive from tokens. Components accept a `t` theme object. */

const { useState } = React;

/* ---------- Button ---------- */
function TXButton({ children, variant = 'primary', size = 'md', icon, t, onClick, style = {}, disabled }) {
  const [press, setPress] = useState(false);
  const h = size === 'lg' ? 52 : size === 'sm' ? 36 : 48;
  const fs = size === 'lg' ? 17 : size === 'sm' ? 13 : 15;
  const base = {
    height: h, fontSize: fs, fontFamily: t.font, fontWeight: 600,
    borderRadius: t.r.sm, border: '1px solid transparent', padding: `0 ${size === 'sm' ? 14 : 20}px`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
    transform: press ? 'scale(0.97)' : 'none', transition: 'transform .12s, background .12s',
    width: style.width, whiteSpace: 'nowrap',
  };
  const variants = {
    primary: { background: press ? t.accentPressed : t.accent, color: t.onAccent },
    secondary: { background: 'transparent', color: t.text, borderColor: t.borderStrong },
    ghost: { background: press ? t.accentSubtle : 'transparent', color: t.accentText },
    danger: { background: t.danger, color: '#1a0608' },
  };
  return (
    <button onMouseDown={() => setPress(true)} onMouseUp={() => setPress(false)} onMouseLeave={() => setPress(false)}
      onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...style }}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}{children}
    </button>
  );
}

/* ---------- App bar ---------- */
function TXAppBar({ title, t, onBack, trailing, large }) {
  return (
    <div style={{ background: t.surface, borderBottom: `1px solid ${t.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        {onBack && (
          <button onClick={onBack} style={iconBtn(t)}><Icon name="back" size={22} color={t.text2} /></button>
        )}
        {!large && <div style={{ flex: 1, fontFamily: t.font, fontSize: 17, fontWeight: 600, color: t.text, textAlign: onBack ? 'left' : 'left' }}>{title}</div>}
        {!large && <div style={{ flex: onBack ? 'none' : 1 }} />}
        {trailing || (!large && <button style={iconBtn(t)}><Icon name="more" size={22} color={t.text2} /></button>)}
      </div>
      {large && (
        <div style={{ padding: '4px 18px 16px' }}>
          <div style={{ fontFamily: t.font, fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', color: t.text }}>{title}</div>
        </div>
      )}
    </div>
  );
}
function iconBtn(t) {
  return { width: 40, height: 40, borderRadius: t.r.sm, border: 0, background: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
}

/* ---------- Tab bar ---------- */
function TXTabBar({ tabs, active, onChange, t }) {
  return (
    <div style={{ display: 'flex', background: t.surface, borderTop: `1px solid ${t.border}`, padding: '8px 4px 6px' }}>
      {tabs.map(tab => {
        const on = tab.id === active;
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)} style={{
            flex: 1, border: 0, background: 'transparent', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color: on ? t.accentText : t.muted, fontFamily: t.font, fontSize: 10, fontWeight: 600, padding: '6px 0',
          }}>
            <Icon name={tab.icon} size={23} strokeWidth={on ? 2.6 : 2.2} />{tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Avatar ---------- */
function TXAvatar({ initials, t, size = 44, role, gradient = true }) {
  const dot = role === 'coach' ? t.accent : t.success;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: gradient ? t.gradient : t.raised,
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: t.font, fontWeight: 700, fontSize: size * 0.36 }}>{initials}</div>
      {role && <div style={{ position: 'absolute', bottom: -1, right: -1, width: 15, height: 15, borderRadius: '50%', background: dot, border: `2px solid ${t.surface}` }} />}
    </div>
  );
}

/* ---------- Badge ---------- */
function TXBadge({ children, tone = 'accent', t }) {
  const map = { accent: [t.accentSubtle, t.accentText], success: [t.successBg, t.success], warning: [t.warningBg, t.warning], danger: [t.dangerBg, t.danger] };
  const [bg, fg] = map[tone];
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 999, background: bg, color: fg, fontFamily: t.font, fontSize: 11, fontWeight: 700, letterSpacing: '0.02em' }}>{children}</span>;
}

/* ---------- Card ---------- */
function TXCard({ children, t, style = {}, onClick }) {
  return <div onClick={onClick} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.r.md, padding: 16, cursor: onClick ? 'pointer' : 'default', ...style }}>{children}</div>;
}

/* ---------- Metric card ---------- */
function TXMetric({ label, value, unit, delta, deltaTone = 'up', icon, t }) {
  const dc = deltaTone === 'up' ? t.success : deltaTone === 'down' ? t.danger : t.text2;
  return (
    <div style={{ flex: 1, background: t.raised, border: `1px solid ${t.border}`, borderRadius: t.r.md, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.muted, fontFamily: t.font, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {icon && <Icon name={icon} size={14} />}{label}
      </div>
      <div style={{ fontFamily: t.font, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: t.text, marginTop: 6, lineHeight: 1 }}>
        {value}{unit && <span style={{ fontSize: 13, color: t.muted, fontWeight: 600 }}>{unit}</span>}
      </div>
      {delta && <div style={{ fontFamily: t.font, fontSize: 12, fontWeight: 600, color: dc, marginTop: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
        {deltaTone === 'up' ? '▲' : deltaTone === 'down' ? '▼' : '•'} {delta}</div>}
    </div>
  );
}

/* ---------- Progress ring ---------- */
function TXRing({ value, size = 86, stroke = 9, t, label }) {
  const r = (size - stroke) / 2 - 1, c = 2 * Math.PI * r, off = c * (1 - value / 100);
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs><linearGradient id="txring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5BAEFF"/><stop offset="1" stopColor="#1B5BE0"/></linearGradient></defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={t.sunken} strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#txring)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition: 'stroke-dashoffset .6s' }}/>
        <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: t.font, fontSize: size*0.22, fontWeight: 700, fill: t.text }}>{value}%</text>
      </svg>
      {label && <div style={{ fontFamily: t.font, fontSize: 11, color: t.muted, marginTop: 4 }}>{label}</div>}
    </div>
  );
}

/* ---------- Progress bar ---------- */
function TXBar({ value, t, label, sub }) {
  return (
    <div>
      {(label || sub) && <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.font, fontSize: 12, color: t.text2, marginBottom: 5 }}><span>{label}</span><span>{sub}</span></div>}
      <div style={{ height: 8, background: t.sunken, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: value + '%', background: t.accent, borderRadius: 999, transition: 'width .5s' }} />
      </div>
    </div>
  );
}

/* ---------- Field ---------- */
function TXField({ label, value, onChange, t, type = 'text', placeholder, error }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontFamily: t.font, fontSize: 12, fontWeight: 600, color: t.text2 }}>{label}</label>}
      <input type={type} value={value} placeholder={placeholder}
        onChange={e => onChange && onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ height: 48, borderRadius: t.r.sm, padding: '0 14px', fontFamily: t.font, fontSize: 15,
          color: t.text, background: t.surface, outline: 'none',
          border: `1px solid ${error ? t.danger : focus ? t.accent : t.borderStrong}`,
          boxShadow: focus ? `0 0 0 3px ${t.accentSubtle}` : 'none', transition: 'border-color .12s, box-shadow .12s' }} />
      {error && <span style={{ fontFamily: t.font, fontSize: 12, color: t.danger }}>{error}</span>}
    </div>
  );
}

/* ---------- Segmented ---------- */
function TXSegmented({ options, value, onChange, t }) {
  return (
    <div style={{ display: 'inline-flex', background: t.sunken, borderRadius: t.r.sm, padding: 3, gap: 3 }}>
      {options.map(o => {
        const on = o.value === value;
        return <button key={o.value} onClick={() => onChange(o.value)} style={{ border: 0, cursor: 'pointer',
          background: on ? t.surface : 'transparent', color: on ? t.text : t.text2,
          fontFamily: t.font, fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 8,
          boxShadow: on ? '0 1px 2px rgba(0,0,0,.3)' : 'none' }}>{o.label}</button>;
      })}
    </div>
  );
}

/* ---------- Chip ---------- */
function TXChip({ children, on, onClick, t }) {
  return <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 13px', borderRadius: 999, cursor: 'pointer',
    fontFamily: t.font, fontSize: 13, fontWeight: 500,
    background: on ? t.accentSubtle : t.sunken, color: on ? t.accentText : t.text2,
    border: `1px solid ${on ? t.accent : 'transparent'}` }}>{children}</button>;
}

/* ---------- Switch ---------- */
function TXSwitch({ on, onChange, t }) {
  return <button onClick={() => onChange(!on)} style={{ width: 46, height: 28, borderRadius: 999, border: 0, cursor: 'pointer',
    background: on ? t.accent : t.borderStrong, position: 'relative', transition: 'background .2s', flex: 'none' }}>
    <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff',
      transition: 'left .22s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
  </button>;
}

Object.assign(window, { TXButton, TXAppBar, TXTabBar, TXAvatar, TXBadge, TXCard, TXMetric, TXRing, TXBar, TXField, TXSegmented, TXChip, TXSwitch, iconBtn });
