/* @ds-bundle: {"format":3,"namespace":"TalentXDesignSystem_f61f9e","components":[{"name":"ThemeContext","sourcePath":"theme/talentx-theme.ts"}],"sourceHashes":{"theme/talentx-theme.ts":"79f8e610fcd9","ui_kits/talent-x-app/components.jsx":"1375c664d2e7","ui_kits/talent-x-app/ios-frame.jsx":"be3343be4b51","ui_kits/talent-x-app/screens.jsx":"78423e737921","ui_kits/talent-x-app/screens2.jsx":"38cb7ac5e3d0","ui_kits/talent-x-app/theme.jsx":"39d6965bac73"},"inlinedExternals":[],"unexposedExports":[{"name":"borderWidth","sourcePath":"theme/talentx-theme.ts"},{"name":"darkTheme","sourcePath":"theme/talentx-theme.ts"},{"name":"elevation","sourcePath":"theme/talentx-theme.ts"},{"name":"gradientX","sourcePath":"theme/talentx-theme.ts"},{"name":"iconSize","sourcePath":"theme/talentx-theme.ts"},{"name":"lightTheme","sourcePath":"theme/talentx-theme.ts"},{"name":"motion","sourcePath":"theme/talentx-theme.ts"},{"name":"opacity","sourcePath":"theme/talentx-theme.ts"},{"name":"palette","sourcePath":"theme/talentx-theme.ts"},{"name":"radius","sourcePath":"theme/talentx-theme.ts"},{"name":"spacing","sourcePath":"theme/talentx-theme.ts"},{"name":"touchTarget","sourcePath":"theme/talentx-theme.ts"},{"name":"typography","sourcePath":"theme/talentx-theme.ts"},{"name":"useSystemTheme","sourcePath":"theme/talentx-theme.ts"},{"name":"useTheme","sourcePath":"theme/talentx-theme.ts"}]} */

(() => {

const __ds_ns = (window.TalentXDesignSystem_f61f9e = window.TalentXDesignSystem_f61f9e || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// theme/talentx-theme.ts
try { (() => {
/* ============================================================
   Talent-X Design System — React Native / Expo theme
   Typed theme object + light/dark palettes + useTheme() hook.
   Source of truth: tokens.json. No hard-coded colors in components —
   always read from useTheme().
   ============================================================ */
const {
  createContext,
  useContext
} = React;
/* ---------- Primitive ramps (theme-independent) ---------- */
const palette = {
  blue: {
    50: '#EBF3FF',
    100: '#D6E7FF',
    200: '#ADCFFF',
    300: '#85B8FF',
    400: '#5BAEFF',
    500: '#2E7CF6',
    600: '#1B5BE0',
    700: '#1747B0',
    800: '#143A8C',
    900: '#102C66'
  },
  navy: '#1F4E79',
  slate: {
    0: '#FFFFFF',
    50: '#F4F6FA',
    100: '#E7ECF3',
    200: '#D3DAE6',
    300: '#B6C0D0',
    400: '#8A94A6',
    500: '#5C6678',
    600: '#434B5C',
    700: '#2A3140',
    800: '#161B27',
    850: '#11151F',
    900: '#0E121B',
    950: '#0B0F17'
  },
  success: {
    50: '#E6F8EF',
    400: '#34D17F',
    500: '#1FA968',
    600: '#178A55'
  },
  warning: {
    50: '#FFF6E5',
    400: '#FFC24B',
    500: '#F5A524',
    600: '#C9821A'
  },
  danger: {
    50: '#FDECEE',
    400: '#FF6B7A',
    500: '#E5484D',
    600: '#C23438'
  },
  info: {
    50: '#EBF3FF',
    400: '#5BAEFF',
    500: '#2E7CF6',
    600: '#1B5BE0'
  },
  white: '#FFFFFF',
  black: '#000000'
};

/* Signature X gradient — pass to expo-linear-gradient.
   colors + locations + 135° vector. Brand mark / single hero accent only. */
const gradientX = {
  colors: ['#5BAEFF', '#2E7CF6', '#1B5BE0'],
  locations: [0, 0.55, 1],
  start: {
    x: 0,
    y: 0
  },
  end: {
    x: 1,
    y: 1
  }
};

/* ---------- Semantic colors per theme ---------- */
const lightColors = {
  background: palette.slate[50],
  surface: palette.slate[0],
  surfaceRaised: palette.slate[0],
  surfaceSunken: '#ECF0F6',
  border: 'rgba(11,15,23,0.10)',
  borderStrong: 'rgba(11,15,23,0.18)',
  textPrimary: palette.slate[950],
  textSecondary: '#3C4456',
  textMuted: palette.slate[500],
  textOnAccent: palette.slate[0],
  accent: palette.blue[500],
  accentHover: palette.blue[600],
  accentPressed: palette.blue[700],
  accentText: palette.blue[700],
  accentSubtle: palette.blue[50],
  focusRing: palette.blue[500],
  overlay: 'rgba(11,15,23,0.45)',
  success: palette.success[600],
  warning: palette.warning[600],
  danger: palette.danger[500],
  info: palette.info[600],
  successBg: palette.success[50],
  warningBg: palette.warning[50],
  dangerBg: palette.danger[50],
  infoBg: palette.info[50]
};
const darkColors = {
  background: palette.slate[950],
  surface: palette.slate[850],
  surfaceRaised: palette.slate[800],
  surfaceSunken: palette.slate[900],
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  textPrimary: palette.slate[100],
  textSecondary: palette.slate[400],
  textMuted: palette.slate[500],
  textOnAccent: palette.slate[0],
  accent: palette.blue[500],
  accentHover: palette.blue[400],
  accentPressed: palette.blue[600],
  accentText: palette.blue[400],
  accentSubtle: 'rgba(46,124,246,0.16)',
  focusRing: palette.blue[400],
  overlay: 'rgba(7,10,16,0.66)',
  success: palette.success[400],
  warning: palette.warning[400],
  danger: palette.danger[400],
  info: palette.info[400],
  successBg: 'rgba(52,209,127,0.14)',
  warningBg: 'rgba(255,194,75,0.14)',
  dangerBg: 'rgba(255,107,122,0.14)',
  infoBg: 'rgba(91,174,255,0.14)'
};

/* ---------- Theme-independent scales ---------- */
const typography = {
  fontFamily: {
    regular: 'Poppins_400Regular',
    medium: 'Poppins_500Medium',
    semibold: 'Poppins_600SemiBold',
    bold: 'Poppins_700Bold'
  },
  display: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '700',
    letterSpacing: -0.9
  },
  h1: {
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '700',
    letterSpacing: -0.7
  },
  h2: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '600',
    letterSpacing: -0.3
  },
  h3: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    letterSpacing: -0.2
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: 0
  },
  bodyLg: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '400',
    letterSpacing: 0
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '400',
    letterSpacing: 0
  },
  bodySm: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    letterSpacing: 0.1
  },
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 2.4,
    textTransform: 'uppercase'
  }
};
const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96
};
const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999
};
const borderWidth = {
  hairline: 1,
  thick: 2,
  focus: 2
};
const iconSize = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32
};
const touchTarget = 44;
const motion = {
  duration: {
    fast: 120,
    base: 220,
    slow: 360
  },
  easing: {
    standard: {
      x1: 0.2,
      y1: 0,
      x2: 0,
      y2: 1
    },
    decelerate: {
      x1: 0,
      y1: 0,
      x2: 0.2,
      y2: 1
    },
    accelerate: {
      x1: 0.4,
      y1: 0,
      x2: 1,
      y2: 1
    },
    spring: {
      x1: 0.34,
      y1: 1.56,
      x2: 0.64,
      y2: 1
    }
  }
};

/* Dark elevation favors hairline borders + accent glow over heavy shadows. */
const elevation = {
  light: {
    sm: {
      shadowColor: '#0B0F17',
      shadowOpacity: 0.08,
      shadowRadius: 2,
      shadowOffset: {
        width: 0,
        height: 1
      },
      elevation: 1
    },
    md: {
      shadowColor: '#0B0F17',
      shadowOpacity: 0.10,
      shadowRadius: 12,
      shadowOffset: {
        width: 0,
        height: 4
      },
      elevation: 4
    },
    lg: {
      shadowColor: '#0B0F17',
      shadowOpacity: 0.14,
      shadowRadius: 32,
      shadowOffset: {
        width: 0,
        height: 12
      },
      elevation: 12
    }
  },
  dark: {
    sm: {
      shadowColor: '#000000',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: {
        width: 0,
        height: 0
      },
      elevation: 0
    },
    md: {
      shadowColor: '#000000',
      shadowOpacity: 0.45,
      shadowRadius: 24,
      shadowOffset: {
        width: 0,
        height: 8
      },
      elevation: 8
    },
    glow: {
      shadowColor: '#2E7CF6',
      shadowOpacity: 0.35,
      shadowRadius: 24,
      shadowOffset: {
        width: 0,
        height: 0
      },
      elevation: 6
    }
  }
};
const opacity = {
  disabled: 0.4,
  muted: 0.64
};

/* ---------- Theme assembly ---------- */

const lightTheme = {
  name: 'light',
  colors: lightColors,
  palette,
  gradientX,
  typography,
  spacing,
  radius,
  borderWidth,
  iconSize,
  touchTarget,
  motion,
  elevation: elevation.light,
  opacity
};
const darkTheme = {
  name: 'dark',
  colors: darkColors,
  palette,
  gradientX,
  typography,
  spacing,
  radius,
  borderWidth,
  iconSize,
  touchTarget,
  motion,
  elevation: elevation.dark,
  opacity
};

/* ---------- Context + hook ---------- */
const ThemeContext = createContext(darkTheme); // dark-first

/** Returns the active theme from context. Wrap your app in <ThemeContext.Provider>. */
function useTheme() {
  return useContext(ThemeContext);
}

/** Convenience: pick a theme directly from the OS color scheme (dark-first fallback). */
function useSystemTheme() {
  const scheme = useColorScheme();
  return scheme === 'light' ? lightTheme : darkTheme;
}
try {
  void {
    lightTheme,
    darkTheme,
    palette,
    gradientX,
    typography,
    spacing,
    radius,
    motion,
    elevation
  };
} catch {}
Object.assign(__ds_scope, { palette, gradientX, typography, spacing, radius, borderWidth, iconSize, touchTarget, motion, elevation, opacity, lightTheme, darkTheme, ThemeContext, useTheme, useSystemTheme });
})(); } catch (e) { __ds_ns.__errors.push({ path: "theme/talentx-theme.ts", error: String((e && e.message) || e) }); }

// ui_kits/talent-x-app/components.jsx
try { (() => {
/* Talent-X UI kit — reusable components. Depends on window.TX, window.Icon.
   All visuals derive from tokens. Components accept a `t` theme object. */

const {
  useState
} = React;

/* ---------- Button ---------- */
function TXButton({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  t,
  onClick,
  style = {},
  disabled
}) {
  const [press, setPress] = useState(false);
  const h = size === 'lg' ? 52 : size === 'sm' ? 36 : 48;
  const fs = size === 'lg' ? 17 : size === 'sm' ? 13 : 15;
  const base = {
    height: h,
    fontSize: fs,
    fontFamily: t.font,
    fontWeight: 600,
    borderRadius: t.r.sm,
    border: '1px solid transparent',
    padding: `0 ${size === 'sm' ? 14 : 20}px`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transform: press ? 'scale(0.97)' : 'none',
    transition: 'transform .12s, background .12s',
    width: style.width,
    whiteSpace: 'nowrap'
  };
  const variants = {
    primary: {
      background: press ? t.accentPressed : t.accent,
      color: t.onAccent
    },
    secondary: {
      background: 'transparent',
      color: t.text,
      borderColor: t.borderStrong
    },
    ghost: {
      background: press ? t.accentSubtle : 'transparent',
      color: t.accentText
    },
    danger: {
      background: t.danger,
      color: '#1a0608'
    }
  };
  return /*#__PURE__*/React.createElement("button", {
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    onMouseLeave: () => setPress(false),
    onClick: disabled ? undefined : onClick,
    style: {
      ...base,
      ...variants[variant],
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: size === 'sm' ? 16 : 18
  }), children);
}

/* ---------- App bar ---------- */
function TXAppBar({
  title,
  t,
  onBack,
  trailing,
  large
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: t.surface,
      borderBottom: `1px solid ${t.border}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 10px'
    }
  }, onBack && /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: iconBtn(t)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "back",
    size: 22,
    color: t.text2
  })), !large && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontFamily: t.font,
      fontSize: 17,
      fontWeight: 600,
      color: t.text,
      textAlign: onBack ? 'left' : 'left'
    }
  }, title), !large && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: onBack ? 'none' : 1
    }
  }), trailing || !large && /*#__PURE__*/React.createElement("button", {
    style: iconBtn(t)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more",
    size: 22,
    color: t.text2
  }))), large && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 18px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 30,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: t.text
    }
  }, title)));
}
function iconBtn(t) {
  return {
    width: 40,
    height: 40,
    borderRadius: t.r.sm,
    border: 0,
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  };
}

/* ---------- Tab bar ---------- */
function TXTabBar({
  tabs,
  active,
  onChange,
  t
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      background: t.surface,
      borderTop: `1px solid ${t.border}`,
      padding: '8px 4px 6px'
    }
  }, tabs.map(tab => {
    const on = tab.id === active;
    return /*#__PURE__*/React.createElement("button", {
      key: tab.id,
      onClick: () => onChange(tab.id),
      style: {
        flex: 1,
        border: 0,
        background: 'transparent',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        color: on ? t.accentText : t.muted,
        fontFamily: t.font,
        fontSize: 10,
        fontWeight: 600,
        padding: '6px 0'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: tab.icon,
      size: 23,
      strokeWidth: on ? 2.6 : 2.2
    }), tab.label);
  }));
}

/* ---------- Avatar ---------- */
function TXAvatar({
  initials,
  t,
  size = 44,
  role,
  gradient = true
}) {
  const dot = role === 'coach' ? t.accent : t.success;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: size,
      height: size,
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      background: gradient ? t.gradient : t.raised,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: t.font,
      fontWeight: 700,
      fontSize: size * 0.36
    }
  }, initials), role && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: -1,
      right: -1,
      width: 15,
      height: 15,
      borderRadius: '50%',
      background: dot,
      border: `2px solid ${t.surface}`
    }
  }));
}

/* ---------- Badge ---------- */
function TXBadge({
  children,
  tone = 'accent',
  t
}) {
  const map = {
    accent: [t.accentSubtle, t.accentText],
    success: [t.successBg, t.success],
    warning: [t.warningBg, t.warning],
    danger: [t.dangerBg, t.danger]
  };
  const [bg, fg] = map[tone];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: 22,
      padding: '0 9px',
      borderRadius: 999,
      background: bg,
      color: fg,
      fontFamily: t.font,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.02em'
    }
  }, children);
}

/* ---------- Card ---------- */
function TXCard({
  children,
  t,
  style = {},
  onClick
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.r.md,
      padding: 16,
      cursor: onClick ? 'pointer' : 'default',
      ...style
    }
  }, children);
}

/* ---------- Metric card ---------- */
function TXMetric({
  label,
  value,
  unit,
  delta,
  deltaTone = 'up',
  icon,
  t
}) {
  const dc = deltaTone === 'up' ? t.success : deltaTone === 'down' ? t.danger : t.text2;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: t.raised,
      border: `1px solid ${t.border}`,
      borderRadius: t.r.md,
      padding: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      color: t.muted,
      fontFamily: t.font,
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.04em'
    }
  }, icon && /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 14
  }), label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: t.text,
      marginTop: 6,
      lineHeight: 1
    }
  }, value, unit && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: t.muted,
      fontWeight: 600
    }
  }, unit)), delta && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 12,
      fontWeight: 600,
      color: dc,
      marginTop: 6,
      display: 'flex',
      alignItems: 'center',
      gap: 3
    }
  }, deltaTone === 'up' ? '▲' : deltaTone === 'down' ? '▼' : '•', " ", delta));
}

/* ---------- Progress ring ---------- */
function TXRing({
  value,
  size = 86,
  stroke = 9,
  t,
  label
}) {
  const r = (size - stroke) / 2 - 1,
    c = 2 * Math.PI * r,
    off = c * (1 - value / 100);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "txring",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: "#5BAEFF"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: "#1B5BE0"
  }))), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: t.sunken,
    strokeWidth: stroke
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: "url(#txring)",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeDasharray: c,
    strokeDashoffset: off,
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
    style: {
      transition: 'stroke-dashoffset .6s'
    }
  }), /*#__PURE__*/React.createElement("text", {
    x: "50%",
    y: "52%",
    textAnchor: "middle",
    dominantBaseline: "middle",
    style: {
      fontFamily: t.font,
      fontSize: size * 0.22,
      fontWeight: 700,
      fill: t.text
    }
  }, value, "%")), label && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 11,
      color: t.muted,
      marginTop: 4
    }
  }, label));
}

/* ---------- Progress bar ---------- */
function TXBar({
  value,
  t,
  label,
  sub
}) {
  return /*#__PURE__*/React.createElement("div", null, (label || sub) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontFamily: t.font,
      fontSize: 12,
      color: t.text2,
      marginBottom: 5
    }
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("span", null, sub)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 8,
      background: t.sunken,
      borderRadius: 999,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: value + '%',
      background: t.accent,
      borderRadius: 999,
      transition: 'width .5s'
    }
  })));
}

/* ---------- Field ---------- */
function TXField({
  label,
  value,
  onChange,
  t,
  type = 'text',
  placeholder,
  error
}) {
  const [focus, setFocus] = useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    style: {
      fontFamily: t.font,
      fontSize: 12,
      fontWeight: 600,
      color: t.text2
    }
  }, label), /*#__PURE__*/React.createElement("input", {
    type: type,
    value: value,
    placeholder: placeholder,
    onChange: e => onChange && onChange(e.target.value),
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      height: 48,
      borderRadius: t.r.sm,
      padding: '0 14px',
      fontFamily: t.font,
      fontSize: 15,
      color: t.text,
      background: t.surface,
      outline: 'none',
      border: `1px solid ${error ? t.danger : focus ? t.accent : t.borderStrong}`,
      boxShadow: focus ? `0 0 0 3px ${t.accentSubtle}` : 'none',
      transition: 'border-color .12s, box-shadow .12s'
    }
  }), error && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: t.font,
      fontSize: 12,
      color: t.danger
    }
  }, error));
}

/* ---------- Segmented ---------- */
function TXSegmented({
  options,
  value,
  onChange,
  t
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      background: t.sunken,
      borderRadius: t.r.sm,
      padding: 3,
      gap: 3
    }
  }, options.map(o => {
    const on = o.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: o.value,
      onClick: () => onChange(o.value),
      style: {
        border: 0,
        cursor: 'pointer',
        background: on ? t.surface : 'transparent',
        color: on ? t.text : t.text2,
        fontFamily: t.font,
        fontSize: 13,
        fontWeight: 600,
        padding: '7px 16px',
        borderRadius: 8,
        boxShadow: on ? '0 1px 2px rgba(0,0,0,.3)' : 'none'
      }
    }, o.label);
  }));
}

/* ---------- Chip ---------- */
function TXChip({
  children,
  on,
  onClick,
  t
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 32,
      padding: '0 13px',
      borderRadius: 999,
      cursor: 'pointer',
      fontFamily: t.font,
      fontSize: 13,
      fontWeight: 500,
      background: on ? t.accentSubtle : t.sunken,
      color: on ? t.accentText : t.text2,
      border: `1px solid ${on ? t.accent : 'transparent'}`
    }
  }, children);
}

/* ---------- Switch ---------- */
function TXSwitch({
  on,
  onChange,
  t
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: () => onChange(!on),
    style: {
      width: 46,
      height: 28,
      borderRadius: 999,
      border: 0,
      cursor: 'pointer',
      background: on ? t.accent : t.borderStrong,
      position: 'relative',
      transition: 'background .2s',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 3,
      left: on ? 21 : 3,
      width: 22,
      height: 22,
      borderRadius: '50%',
      background: '#fff',
      transition: 'left .22s cubic-bezier(.34,1.56,.64,1)',
      boxShadow: '0 1px 3px rgba(0,0,0,.3)'
    }
  }));
}
Object.assign(window, {
  TXButton,
  TXAppBar,
  TXTabBar,
  TXAvatar,
  TXBadge,
  TXCard,
  TXMetric,
  TXRing,
  TXBar,
  TXField,
  TXSegmented,
  TXChip,
  TXSwitch,
  iconBtn
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/talent-x-app/components.jsx", error: String((e && e.message) || e) }); }

// ui_kits/talent-x-app/ios-frame.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports (to window): IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard
//
// Usage — wrap your screen content in <IOSDevice> to get the bezel, status bar
// and home indicator (props: title, dark, keyboard):
//
//   <IOSDevice title="Settings">
//     ...your screen content...
//   </IOSDevice>
//   <IOSDevice dark title="Search" keyboard>…</IOSDevice>
/* END USAGE */

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/talent-x-app/ios-frame.jsx", error: String((e && e.message) || e) }); }

// ui_kits/talent-x-app/screens.jsx
try { (() => {
/* Talent-X app — screen compositions for the UI kit.
   Dark-first, French copy. Depends on window.TX/theme/Icon and the TX* components.
   Each screen returns a full-height flex column: scroll region + optional bottom chrome. */

const {
  useState: useStateS
} = React;

/* ---- Shared bits ---- */
function StatusSpacer() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      flex: 'none'
    }
  });
}
function Scroll({
  children,
  t,
  pad = 18
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: t.bg
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      WebkitOverflowScrolling: 'touch'
    }
  }, /*#__PURE__*/React.createElement(StatusSpacer, null), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: `0 ${pad}px 24px`
    }
  }, children)));
}
function Overline({
  children,
  t
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.22em',
      textTransform: 'uppercase',
      color: t.muted,
      marginBottom: 10
    }
  }, children);
}
function PushHeader({
  title,
  t,
  onBack,
  trailing
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      width: 40,
      height: 40,
      marginLeft: -8,
      borderRadius: t.r.sm,
      border: 0,
      background: 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "back",
    size: 24,
    color: t.text
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontFamily: t.font,
      fontSize: 20,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: t.text
    }
  }, title), trailing);
}

/* ============================================================
   LOGIN
   ============================================================ */
function LoginScreen({
  onLogin,
  t
}) {
  const [email, setEmail] = useStateS('marc@talent-x.fr');
  const [pwd, setPwd] = useStateS('••••••••');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      background: t.bg,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '0 26px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 90,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 360,
      height: 360,
      background: 'radial-gradient(circle, rgba(46,124,246,0.22), transparent 70%)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      marginBottom: 36
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 76,
      height: 76,
      borderRadius: 19,
      background: t.gradient,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 12px 32px rgba(46,124,246,0.35)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/monogram-white.svg",
    alt: "Talent-X",
    style: {
      width: 46,
      height: 'auto',
      display: 'block'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 28,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: t.text,
      marginTop: 18
    }
  }, "Talent\u2011X"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 15,
      color: t.text2,
      marginTop: 4
    }
  }, "Coach et athl\xE8te, connect\xE9s.")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(TXField, {
    label: "E\u2011mail",
    value: email,
    onChange: setEmail,
    t: t,
    placeholder: "ton@email.fr"
  }), /*#__PURE__*/React.createElement(TXField, {
    label: "Mot de passe",
    value: pwd,
    onChange: setPwd,
    t: t,
    type: "password"
  }), /*#__PURE__*/React.createElement(TXButton, {
    t: t,
    size: "lg",
    style: {
      width: '100%',
      marginTop: 6
    },
    onClick: onLogin
  }, "Se connecter"), /*#__PURE__*/React.createElement(TXButton, {
    t: t,
    variant: "ghost",
    style: {
      width: '100%'
    },
    onClick: onLogin
  }, "Cr\xE9er un compte")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      textAlign: 'center',
      marginTop: 28,
      fontFamily: t.font,
      fontSize: 12,
      color: t.muted
    }
  }, "Mot de passe oubli\xE9 ?"));
}

/* ============================================================
   HOME / DASHBOARD (coach)
   ============================================================ */
const ATHLETES = [{
  id: 'a1',
  name: 'Léa Dubois',
  initials: 'LD',
  role: 'athlete',
  tone: 'success',
  status: 'À jour',
  charge: 88,
  note: 'Séance haut du corps · hier'
}, {
  id: 'a2',
  name: 'Yanis Bferr',
  initials: 'YB',
  role: 'athlete',
  tone: 'warning',
  status: 'Charge élevée',
  charge: 64,
  note: 'Récup conseillée · 3 j intenses'
}, {
  id: 'a3',
  name: 'Camille Roy',
  initials: 'CR',
  role: 'athlete',
  tone: 'success',
  status: 'À jour',
  charge: 95,
  note: 'PR squat 120 kg · lundi'
}, {
  id: 'a4',
  name: 'Tom Petit',
  initials: 'TP',
  role: 'athlete',
  tone: 'danger',
  status: 'En retard',
  charge: 32,
  note: '2 séances manquées'
}];
function WeekStrip({
  t
}) {
  const days = [['L', 12], ['M', 13], ['M', 14], ['J', 15, true], ['V', 16], ['S', 17], ['D', 18]];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 7
    }
  }, days.map(([d, n, on], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      textAlign: 'center',
      padding: '9px 0',
      borderRadius: t.r.sm,
      background: on ? t.accent : t.surface,
      border: `1px solid ${on ? t.accent : t.border}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 10,
      fontWeight: 600,
      color: on ? 'rgba(255,255,255,.8)' : t.muted,
      marginBottom: 3
    }
  }, d), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 15,
      fontWeight: 700,
      color: on ? '#fff' : t.text
    }
  }, n))));
}
function HomeScreen({
  t,
  onOpenAthlete,
  onOpenWorkout
}) {
  return /*#__PURE__*/React.createElement(Scroll, {
    t: t
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 13,
      color: t.text2
    }
  }, "Jeudi 15 mai"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: t.text
    }
  }, "Salut, Marc")), /*#__PURE__*/React.createElement("button", {
    style: {
      width: 44,
      height: 44,
      borderRadius: t.r.sm,
      border: `1px solid ${t.border}`,
      background: t.surface,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bell",
    size: 21,
    color: t.text
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 9,
      right: 10,
      width: 7,
      height: 7,
      borderRadius: 99,
      background: t.danger
    }
  })), /*#__PURE__*/React.createElement(TXAvatar, {
    initials: "MC",
    t: t,
    role: "coach",
    size: 44
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement(WeekStrip, {
    t: t
  })), /*#__PURE__*/React.createElement(Overline, {
    t: t
  }, "S\xE9ance du jour"), /*#__PURE__*/React.createElement("div", {
    onClick: onOpenWorkout,
    style: {
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.r.md,
      padding: 16,
      marginBottom: 22,
      cursor: 'pointer',
      boxShadow: t.glow
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 13,
      background: t.gradient,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "dumbbell",
    size: 24,
    color: "#fff"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 16,
      fontWeight: 600,
      color: t.text
    }
  }, "Haut du corps \u2014 force"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 13,
      color: t.muted
    }
  }, "6 exercices \xB7 ~50 min \xB7 RPE 8"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(TXButton, {
    t: t,
    style: {
      flex: 1
    },
    icon: "play",
    onClick: e => {
      e.stopPropagation();
      onOpenWorkout();
    }
  }, "D\xE9marrer"), /*#__PURE__*/React.createElement(TXButton, {
    t: t,
    variant: "secondary",
    style: {
      width: 52
    },
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more",
    size: 20,
    color: t.text
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement(TXMetric, {
    label: "Assiduit\xE9",
    value: "92",
    unit: " %",
    delta: "8 %",
    deltaTone: "up",
    icon: "check",
    t: t
  }), /*#__PURE__*/React.createElement(TXMetric, {
    label: "Charge sem.",
    value: "12.4",
    unit: " t",
    delta: "3 %",
    deltaTone: "down",
    icon: "dumbbell",
    t: t
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(Overline, {
    t: t
  }, "Tes athl\xE8tes"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: t.font,
      fontSize: 12,
      color: t.accentText,
      fontWeight: 600,
      marginBottom: 10,
      cursor: 'pointer'
    }
  }, "Tout voir")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, ATHLETES.map(a => /*#__PURE__*/React.createElement("div", {
    key: a.id,
    onClick: () => onOpenAthlete(a),
    style: {
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.r.md,
      padding: 13,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(TXAvatar, {
    initials: a.initials,
    t: t,
    role: "athlete",
    size: 42,
    gradient: false
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 15,
      fontWeight: 600,
      color: t.text
    }
  }, a.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 12,
      color: t.muted,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, a.note)), /*#__PURE__*/React.createElement(TXBadge, {
    tone: a.tone,
    t: t
  }, a.status)))));
}

/* ============================================================
   ATHLETE DETAIL
   ============================================================ */
function MiniBars({
  t
}) {
  const bars = [55, 70, 42, 80, 60, 48, 66];
  return /*#__PURE__*/React.createElement("svg", {
    width: "100%",
    height: "120",
    viewBox: "0 0 300 120",
    preserveAspectRatio: "none",
    style: {
      display: 'block'
    }
  }, [30, 60, 90].map(y => /*#__PURE__*/React.createElement("line", {
    key: y,
    x1: "0",
    y1: y,
    x2: "300",
    y2: y,
    stroke: "rgba(255,255,255,.06)"
  })), bars.map((h, i) => {
    const peak = h === Math.max(...bars);
    return /*#__PURE__*/React.createElement("rect", {
      key: i,
      x: 14 + i * 41,
      y: 110 - h,
      width: "26",
      height: h,
      rx: "4",
      fill: peak ? '#5BAEFF' : '#2E7CF6'
    });
  }));
}
function AthleteScreen({
  athlete,
  t,
  onBack,
  onOpenWorkout
}) {
  const [seg, setSeg] = useStateS('apercu');
  return /*#__PURE__*/React.createElement(Scroll, {
    t: t
  }, /*#__PURE__*/React.createElement(PushHeader, {
    title: "",
    t: t,
    onBack: onBack,
    trailing: /*#__PURE__*/React.createElement("button", {
      style: {
        width: 40,
        height: 40,
        borderRadius: t.r.sm,
        border: 0,
        background: 'transparent',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "more",
      size: 22,
      color: t.text
    }))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      marginBottom: 18,
      marginTop: -6
    }
  }, /*#__PURE__*/React.createElement(TXAvatar, {
    initials: athlete.initials,
    t: t,
    role: "athlete",
    size: 60,
    gradient: false
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: t.text
    }
  }, athlete.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 5
    }
  }, /*#__PURE__*/React.createElement(TXBadge, {
    tone: athlete.tone,
    t: t
  }, athlete.status), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: t.font,
      fontSize: 12,
      color: t.muted
    }
  }, "Athl\xE8te \xB7 depuis janv. 2025")))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(TXSegmented, {
    t: t,
    value: seg,
    onChange: setSeg,
    options: [{
      value: 'apercu',
      label: "Aperçu"
    }, {
      value: 'seances',
      label: 'Séances'
    }, {
      value: 'prog',
      label: 'Progression'
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(TXMetric, {
    label: "PR squat",
    value: "120",
    unit: " kg",
    delta: "5 kg",
    deltaTone: "up",
    t: t
  }), /*#__PURE__*/React.createElement(TXMetric, {
    label: "Volume",
    value: "8.6",
    unit: " t",
    delta: "12 %",
    deltaTone: "up",
    t: t
  }), /*#__PURE__*/React.createElement(TXMetric, {
    label: "RPE moy.",
    value: "7.4",
    delta: "0.3",
    deltaTone: "flat",
    t: t
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.r.md,
      padding: 16,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(TXRing, {
    value: athlete.charge,
    t: t,
    label: "Assiduit\xE9 30 j"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(TXBar, {
    value: 82,
    t: t,
    label: "Force",
    sub: "82 %"
  }), /*#__PURE__*/React.createElement(TXBar, {
    value: 64,
    t: t,
    label: "Endurance",
    sub: "64 %"
  }), /*#__PURE__*/React.createElement(TXBar, {
    value: 71,
    t: t,
    label: "Mobilit\xE9",
    sub: "71 %"
  })))), /*#__PURE__*/React.createElement(Overline, {
    t: t
  }, "Charge hebdomadaire"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.r.md,
      padding: 16,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(MiniBars, {
    t: t
  })), /*#__PURE__*/React.createElement(Overline, {
    t: t
  }, "S\xE9ances r\xE9centes"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, [['Haut du corps — force', 'Hier · RPE 8', 'check'], ['Bas du corps', 'Lun. · RPE 7', 'check'], ['Cardio intervalle', 'Sam. · manquée', 'close']].map(([nm, mt, ic], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    onClick: onOpenWorkout,
    style: {
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.r.md,
      padding: 13,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 10,
      background: ic === 'close' ? t.dangerBg : t.accentSubtle,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic === 'close' ? 'close' : 'check',
    size: 18,
    color: ic === 'close' ? t.danger : t.accentText
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 14,
      fontWeight: 600,
      color: t.text
    }
  }, nm), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 12,
      color: t.muted
    }
  }, mt)), /*#__PURE__*/React.createElement(Icon, {
    name: "fwd",
    size: 18,
    color: t.muted
  })))));
}
Object.assign(window, {
  LoginScreen,
  HomeScreen,
  AthleteScreen,
  Scroll,
  Overline,
  PushHeader,
  StatusSpacer,
  WeekStrip,
  ATHLETES
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/talent-x-app/screens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/talent-x-app/screens2.jsx
try { (() => {
/* Talent-X app — workout detail + secondary tab screens (Calendrier, Progression, Profil). */

const {
  useState: useStateD
} = React;

/* ============================================================
   WORKOUT / SÉANCE DETAIL
   ============================================================ */
const EXERCISES = [{
  n: 'Développé couché',
  sets: '4 × 8',
  kg: '60 kg',
  done: true
}, {
  n: 'Tractions lestées',
  sets: '3 × max',
  kg: '+10 kg',
  done: true
}, {
  n: 'Développé militaire',
  sets: '4 × 10',
  kg: '35 kg',
  done: false
}, {
  n: 'Rowing barre',
  sets: '4 × 10',
  kg: '50 kg',
  done: false
}, {
  n: 'Élévations latérales',
  sets: '3 × 15',
  kg: '10 kg',
  done: false
}, {
  n: 'Gainage',
  sets: '3 × 60 s',
  kg: '—',
  done: false
}];
function WorkoutScreen({
  t,
  onBack
}) {
  const [done, setDone] = useStateD({
    0: true,
    1: true
  });
  const total = EXERCISES.length;
  const completed = Object.values(done).filter(Boolean).length;
  const toggle = i => setDone(d => ({
    ...d,
    [i]: !d[i]
  }));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: t.bg
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, /*#__PURE__*/React.createElement(StatusSpacer, null), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 18px 18px'
    }
  }, /*#__PURE__*/React.createElement(PushHeader, {
    title: "",
    t: t,
    onBack: onBack,
    trailing: /*#__PURE__*/React.createElement("button", {
      style: {
        width: 40,
        height: 40,
        borderRadius: t.r.sm,
        border: 0,
        background: 'transparent',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "more",
      size: 22,
      color: t.text
    }))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 13,
      marginTop: -6,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 54,
      height: 54,
      borderRadius: 15,
      background: t.gradient,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "dumbbell",
    size: 26,
    color: "#fff"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: t.text
    }
  }, "Haut du corps"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 13,
      color: t.muted
    }
  }, "Force \xB7 L\xE9a Dubois"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(TXMetric, {
    label: "Dur\xE9e",
    value: "~50",
    unit: " min",
    icon: "clock",
    t: t
  }), /*#__PURE__*/React.createElement(TXMetric, {
    label: "Exercices",
    value: total,
    icon: "dumbbell",
    t: t
  }), /*#__PURE__*/React.createElement(TXMetric, {
    label: "RPE cible",
    value: "8",
    icon: "flame",
    t: t
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(TXBar, {
    value: completed / total * 100,
    t: t,
    label: "Progression",
    sub: `${completed}/${total}`
  })), /*#__PURE__*/React.createElement(Overline, {
    t: t
  }, "Exercices"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.r.md,
      overflow: 'hidden'
    }
  }, EXERCISES.map((ex, i) => {
    const on = !!done[i];
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      onClick: () => toggle(i),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '13px 14px',
        borderTop: i ? `1px solid ${t.border}` : 'none',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 22,
        height: 22,
        borderRadius: 6,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: on ? t.accent : 'transparent',
        border: on ? 'none' : `2px solid ${t.borderStrong}`
      }
    }, on && /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 13,
      color: "#fff",
      strokeWidth: 3.5
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontFamily: t.font,
        fontSize: 14,
        fontWeight: 500,
        color: t.text,
        textDecoration: on ? 'line-through' : 'none',
        opacity: on ? 0.55 : 1
      }
    }, ex.n), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: t.font,
        fontSize: 12,
        color: t.muted
      }
    }, ex.kg), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: t.font,
        fontSize: 12,
        fontWeight: 600,
        color: t.text2,
        minWidth: 52,
        textAlign: 'right'
      }
    }, ex.sets));
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 'none',
      padding: '12px 18px calc(12px + 20px)',
      borderTop: `1px solid ${t.border}`,
      background: t.surface
    }
  }, /*#__PURE__*/React.createElement(TXButton, {
    t: t,
    size: "lg",
    style: {
      width: '100%'
    },
    icon: "check"
  }, "Enregistrer la s\xE9ance")));
}

/* ============================================================
   CALENDRIER (planning)
   ============================================================ */
function CalendarScreen({
  t,
  onOpenWorkout
}) {
  const week = [{
    d: 'Lun 12',
    items: [['Bas du corps', 'success']]
  }, {
    d: 'Mar 13',
    items: [['Récupération active', 'info']]
  }, {
    d: 'Mer 14',
    items: [['Cardio intervalle', 'success']]
  }, {
    d: 'Jeu 15',
    items: [['Haut du corps — force', 'accent']],
    today: true
  }, {
    d: 'Ven 16',
    items: []
  }, {
    d: 'Sam 17',
    items: [['Sortie longue', 'warning']]
  }];
  const tone = {
    success: [t.successBg, t.success],
    info: [t.accentSubtle, t.accentText],
    warning: [t.warningBg, t.warning],
    accent: [t.accent, '#fff']
  };
  return /*#__PURE__*/React.createElement(Scroll, {
    t: t
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontFamily: t.font,
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: t.text
    }
  }, "Calendrier"), /*#__PURE__*/React.createElement(TXButton, {
    t: t,
    size: "sm",
    icon: "plus"
  }, "Nouveau plan")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(WeekStrip, {
    t: t
  })), /*#__PURE__*/React.createElement(Overline, {
    t: t
  }, "Semaine du 12 mai"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, week.map((day, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 54,
      flex: 'none',
      paddingTop: 13,
      fontFamily: t.font,
      fontSize: 12,
      fontWeight: 600,
      color: day.today ? t.accentText : t.muted
    }
  }, day.d), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, day.items.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 13,
      color: t.muted,
      padding: '13px 0'
    }
  }, "Repos"), day.items.map(([nm, tn], j) => {
    const [bg, fg] = tone[tn];
    const solid = tn === 'accent';
    return /*#__PURE__*/React.createElement("div", {
      key: j,
      onClick: onOpenWorkout,
      style: {
        background: solid ? bg : t.surface,
        border: `1px solid ${solid ? 'transparent' : t.border}`,
        borderRadius: t.r.sm,
        padding: '11px 13px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: 99,
        background: solid ? '#fff' : fg,
        flex: 'none'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontFamily: t.font,
        fontSize: 14,
        fontWeight: 600,
        color: solid ? '#fff' : t.text
      }
    }, nm), /*#__PURE__*/React.createElement(Icon, {
      name: "fwd",
      size: 16,
      color: solid ? 'rgba(255,255,255,.7)' : t.muted
    }));
  }))))));
}

/* ============================================================
   PROGRESSION (stats overview)
   ============================================================ */
function ProgressLine({
  t
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: "100%",
    height: "130",
    viewBox: "0 0 300 130",
    preserveAspectRatio: "none",
    style: {
      display: 'block'
    }
  }, [35, 70, 105].map(y => /*#__PURE__*/React.createElement("line", {
    key: y,
    x1: "0",
    y1: y,
    x2: "300",
    y2: y,
    stroke: "rgba(255,255,255,.06)"
  })), /*#__PURE__*/React.createElement("polyline", {
    points: "0,108 50,92 100,96 150,64 200,68 250,38 300,32",
    fill: "none",
    stroke: "#2E7CF6",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "0,114 50,112 100,102 150,104 200,90 250,88 300,80",
    fill: "none",
    stroke: "#8A94A6",
    strokeWidth: "2.5",
    strokeDasharray: "5 5",
    strokeLinecap: "round"
  }));
}
function ProgressScreen({
  t
}) {
  const [seg, setSeg] = useStateD('mois');
  return /*#__PURE__*/React.createElement(Scroll, {
    t: t
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: t.text,
      marginBottom: 16
    }
  }, "Progression"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(TXSegmented, {
    t: t,
    value: seg,
    onChange: setSeg,
    options: [{
      value: 'sem',
      label: 'Semaine'
    }, {
      value: 'mois',
      label: 'Mois'
    }, {
      value: 'an',
      label: 'Année'
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(TXMetric, {
    label: "Volume total",
    value: "248",
    unit: " t",
    delta: "14 %",
    deltaTone: "up",
    t: t
  }), /*#__PURE__*/React.createElement(TXMetric, {
    label: "S\xE9ances",
    value: "64",
    delta: "6",
    deltaTone: "up",
    t: t
  }), /*#__PURE__*/React.createElement(TXMetric, {
    label: "Assiduit\xE9",
    value: "91",
    unit: " %",
    delta: "2 %",
    deltaTone: "down",
    t: t
  })), /*#__PURE__*/React.createElement(Overline, {
    t: t
  }, "Charge r\xE9alis\xE9e vs objectif"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.r.md,
      padding: 16,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(ProgressLine, {
    t: t
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: t.font,
      fontSize: 12,
      color: t.text2
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: 9,
      height: 9,
      borderRadius: 3,
      background: '#2E7CF6'
    }
  }), "R\xE9alis\xE9"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: t.font,
      fontSize: 12,
      color: t.text2
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: 9,
      height: 9,
      borderRadius: 3,
      background: '#8A94A6'
    }
  }), "Objectif"))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: t.warningBg,
      borderRadius: t.r.md,
      padding: 14,
      display: 'flex',
      gap: 11,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "warn",
    size: 20,
    color: t.warning
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 13,
      color: t.text,
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: t.warning
    }
  }, "Charge \xE9lev\xE9e 3 jours d'affil\xE9e."), " Pr\xE9vois une s\xE9ance de r\xE9cup\xE9ration cette semaine.")));
}

/* ============================================================
   PROFIL (settings)
   ============================================================ */
function ProfileScreen({
  t,
  onLogout
}) {
  const [push, setPush] = useStateD(true);
  const [dark, setDark] = useStateD(true);
  const Row = ({
    icon,
    label,
    trailing,
    last
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '14px 14px',
      borderTop: last ? 'none' : `1px solid ${t.border}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 9,
      background: t.accentSubtle,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 18,
    color: t.accentText
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: t.font,
      fontSize: 15,
      fontWeight: 500,
      color: t.text
    }
  }, label), trailing || /*#__PURE__*/React.createElement(Icon, {
    name: "fwd",
    size: 18,
    color: t.muted
  }));
  return /*#__PURE__*/React.createElement(Scroll, {
    t: t
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: t.text,
      marginBottom: 18
    }
  }, "Profil"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.r.md,
      padding: 16,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(TXAvatar, {
    initials: "MC",
    t: t,
    role: "coach",
    size: 56
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 18,
      fontWeight: 700,
      color: t.text
    }
  }, "Marc Caron"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: t.font,
      fontSize: 13,
      color: t.muted
    }
  }, "Coach \xB7 4 athl\xE8tes")), /*#__PURE__*/React.createElement(TXBadge, {
    tone: "accent",
    t: t
  }, "Pro")), /*#__PURE__*/React.createElement(Overline, {
    t: t
  }, "Pr\xE9f\xE9rences"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.r.md,
      overflow: 'hidden',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(Row, {
    icon: "bell",
    label: "Notifications push",
    trailing: /*#__PURE__*/React.createElement(TXSwitch, {
      on: push,
      onChange: setPush,
      t: t
    })
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "settings",
    label: "Th\xE8me sombre",
    trailing: /*#__PURE__*/React.createElement(TXSwitch, {
      on: dark,
      onChange: setDark,
      t: t
    })
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "star",
    label: "Objectifs",
    last: true
  })), /*#__PURE__*/React.createElement(Overline, {
    t: t
  }, "Compte"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: t.r.md,
      overflow: 'hidden',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(Row, {
    icon: "user",
    label: "Informations personnelles"
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "trophy",
    label: "Abonnement"
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "info",
    label: "Aide & confidentialit\xE9",
    last: true
  })), /*#__PURE__*/React.createElement(TXButton, {
    t: t,
    variant: "secondary",
    style: {
      width: '100%'
    },
    onClick: onLogout
  }, "Se d\xE9connecter"));
}
Object.assign(window, {
  WorkoutScreen,
  CalendarScreen,
  ProgressScreen,
  ProfileScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/talent-x-app/screens2.jsx", error: String((e && e.message) || e) }); }

// ui_kits/talent-x-app/theme.jsx
try { (() => {
/* Talent-X app — runtime theme + icon set for the UI kit.
   Mirrors tokens.json (dark-first). Exposes window.TX (tokens) and window.Icon. */

const TX = {
  // dark theme semantic (app is dark-first)
  bg: '#0B0F17',
  surface: '#11151F',
  raised: '#161B27',
  sunken: '#0E121B',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  text: '#E7ECF3',
  text2: '#8A94A6',
  muted: '#5C6678',
  onAccent: '#FFFFFF',
  accent: '#2E7CF6',
  accentHover: '#5BAEFF',
  accentPressed: '#1B5BE0',
  accentText: '#5BAEFF',
  accentSubtle: 'rgba(46,124,246,0.16)',
  success: '#34D17F',
  warning: '#FFC24B',
  danger: '#FF6B7A',
  successBg: 'rgba(52,209,127,0.14)',
  warningBg: 'rgba(255,194,75,0.14)',
  dangerBg: 'rgba(255,107,122,0.14)',
  gradient: 'linear-gradient(135deg,#5BAEFF 0%,#2E7CF6 55%,#1B5BE0 100%)',
  font: "'Poppins', sans-serif",
  r: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 20,
    xl: 28,
    pill: 999
  },
  // light theme (for the toggle)
  light: {
    bg: '#F4F6FA',
    surface: '#FFFFFF',
    raised: '#FFFFFF',
    sunken: '#ECF0F6',
    border: 'rgba(11,15,23,0.10)',
    borderStrong: 'rgba(11,15,23,0.18)',
    text: '#0B0F17',
    text2: '#3C4456',
    muted: '#5C6678',
    onAccent: '#FFFFFF',
    accent: '#2E7CF6',
    accentHover: '#1B5BE0',
    accentPressed: '#1747B0',
    accentText: '#1747B0',
    accentSubtle: '#EBF3FF',
    success: '#178A55',
    warning: '#C9821A',
    danger: '#E5484D',
    successBg: '#E6F8EF',
    warningBg: '#FFF6E5',
    dangerBg: '#FDECEE',
    gradient: 'linear-gradient(135deg,#5BAEFF 0%,#2E7CF6 55%,#1B5BE0 100%)',
    font: "'Poppins', sans-serif",
    r: {
      xs: 6,
      sm: 10,
      md: 14,
      lg: 20,
      xl: 28,
      pill: 999
    }
  }
};
// merge: produce a theme object for a given mode
function theme(mode) {
  return mode === 'light' ? {
    ...TX,
    ...TX.light
  } : TX;
}

/* Lucide-style outline icons (stroke 2.2, round caps). currentColor inherits. */
const PATHS = {
  home: /*#__PURE__*/React.createElement("path", {
    d: "M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"
  }),
  calendar: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "4",
    width: "18",
    height: "18",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 2v4M8 2v4M3 10h18"
  })),
  chart: /*#__PURE__*/React.createElement("path", {
    d: "M3 17l5-5 4 4 7-7"
  }),
  user: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "8",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 21c0-4 4-6 8-6s8 2 8 6"
  })),
  back: /*#__PURE__*/React.createElement("path", {
    d: "M15 18l-6-6 6-6"
  }),
  fwd: /*#__PURE__*/React.createElement("path", {
    d: "M9 6l6 6-6 6"
  }),
  more: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "12",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "5",
    cy: "12",
    r: "1"
  })),
  plus: /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14M5 12h14"
  }),
  check: /*#__PURE__*/React.createElement("polyline", {
    points: "20 6 9 17 4 12"
  }),
  close: /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  }),
  clock: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 7v5l3 2"
  })),
  dumbbell: /*#__PURE__*/React.createElement("path", {
    d: "M6.5 6.5l11 11M3 8l3-3 2 2-3 3zM16 19l3-3 2 2-3 3z"
  }),
  flame: /*#__PURE__*/React.createElement("path", {
    d: "M12 3c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-2-1-3 2 2 3 4 3 7a7 7 0 0 1-14 0c0-4 4-5 7-10z"
  }),
  bell: /*#__PURE__*/React.createElement("path", {
    d: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"
  }),
  star: /*#__PURE__*/React.createElement("path", {
    d: "M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6-4.6-6 4.6L8.6 14 2.6 9.4h7z"
  }),
  trophy: /*#__PURE__*/React.createElement("path", {
    d: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 4H4v2a3 3 0 0 0 3 3M17 4h3v2a3 3 0 0 1-3 3"
  }),
  play: /*#__PURE__*/React.createElement("path", {
    d: "M6 4l14 8-14 8z"
  }),
  heart: /*#__PURE__*/React.createElement("path", {
    d: "M12 21C5 15 3 11 3 8a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 3-2 7-9 13z"
  }),
  warn: /*#__PURE__*/React.createElement("path", {
    d: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
  }),
  info: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 16v-4M12 8h.01"
  })),
  settings: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"
  })),
  arrowUp: /*#__PURE__*/React.createElement("path", {
    d: "M12 19V5M5 12l7-7 7 7"
  }),
  arrowDown: /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14M5 12l7 7 7-7"
  })
};
function Icon({
  name,
  size = 24,
  color = 'currentColor',
  strokeWidth = 2.2,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      display: 'block',
      flex: 'none',
      ...style
    }
  }, PATHS[name] || null);
}
Object.assign(window, {
  TX,
  theme,
  Icon
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/talent-x-app/theme.jsx", error: String((e && e.message) || e) }); }

__ds_ns.ThemeContext = __ds_scope.ThemeContext;

})();
