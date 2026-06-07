/* Talent-X app — runtime theme + icon set for the UI kit.
   Mirrors tokens.json (dark-first). Exposes window.TX (tokens) and window.Icon. */

const TX = {
  // dark theme semantic (app is dark-first)
  bg: '#0B0F17', surface: '#11151F', raised: '#161B27', sunken: '#0E121B',
  border: 'rgba(255,255,255,0.08)', borderStrong: 'rgba(255,255,255,0.16)',
  text: '#E7ECF3', text2: '#8A94A6', muted: '#5C6678', onAccent: '#FFFFFF',
  accent: '#2E7CF6', accentHover: '#5BAEFF', accentPressed: '#1B5BE0',
  accentText: '#5BAEFF', accentSubtle: 'rgba(46,124,246,0.16)',
  success: '#34D17F', warning: '#FFC24B', danger: '#FF6B7A',
  successBg: 'rgba(52,209,127,0.14)', warningBg: 'rgba(255,194,75,0.14)', dangerBg: 'rgba(255,107,122,0.14)',
  gradient: 'linear-gradient(135deg,#5BAEFF 0%,#2E7CF6 55%,#1B5BE0 100%)',
  font: "'Poppins', sans-serif",
  r: { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 },
  // light theme (for the toggle)
  light: {
    bg: '#F4F6FA', surface: '#FFFFFF', raised: '#FFFFFF', sunken: '#ECF0F6',
    border: 'rgba(11,15,23,0.10)', borderStrong: 'rgba(11,15,23,0.18)',
    text: '#0B0F17', text2: '#3C4456', muted: '#5C6678', onAccent: '#FFFFFF',
    accent: '#2E7CF6', accentHover: '#1B5BE0', accentPressed: '#1747B0',
    accentText: '#1747B0', accentSubtle: '#EBF3FF',
    success: '#178A55', warning: '#C9821A', danger: '#E5484D',
    successBg: '#E6F8EF', warningBg: '#FFF6E5', dangerBg: '#FDECEE',
    gradient: 'linear-gradient(135deg,#5BAEFF 0%,#2E7CF6 55%,#1B5BE0 100%)',
    font: "'Poppins', sans-serif", r: { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 },
  },
};
// merge: produce a theme object for a given mode
function theme(mode) {
  return mode === 'light' ? { ...TX, ...TX.light } : TX;
}

/* Lucide-style outline icons (stroke 2.2, round caps). currentColor inherits. */
const PATHS = {
  home: <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>,
  calendar: <g><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></g>,
  chart: <path d="M3 17l5-5 4 4 7-7"/>,
  user: <g><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></g>,
  back: <path d="M15 18l-6-6 6-6"/>,
  fwd: <path d="M9 6l6 6-6 6"/>,
  more: <g><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></g>,
  plus: <path d="M12 5v14M5 12h14"/>,
  check: <polyline points="20 6 9 17 4 12"/>,
  close: <path d="M18 6 6 18M6 6l12 12"/>,
  clock: <g><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></g>,
  dumbbell: <path d="M6.5 6.5l11 11M3 8l3-3 2 2-3 3zM16 19l3-3 2 2-3 3z"/>,
  flame: <path d="M12 3c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-2-1-3 2 2 3 4 3 7a7 7 0 0 1-14 0c0-4 4-5 7-10z"/>,
  bell: <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>,
  star: <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6-4.6-6 4.6L8.6 14 2.6 9.4h7z"/>,
  trophy: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 4H4v2a3 3 0 0 0 3 3M17 4h3v2a3 3 0 0 1-3 3"/>,
  play: <path d="M6 4l14 8-14 8z"/>,
  heart: <path d="M12 21C5 15 3 11 3 8a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 3-2 7-9 13z"/>,
  warn: <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>,
  info: <g><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></g>,
  settings: <g><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></g>,
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7"/>,
  arrowDown: <path d="M12 5v14M5 12l7 7 7-7"/>,
};

function Icon({ name, size = 24, color = 'currentColor', strokeWidth = 2.2, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flex: 'none', ...style }}>
      {PATHS[name] || null}
    </svg>
  );
}

Object.assign(window, { TX, theme, Icon });
