---
name: talent-x-design
description: Use this skill to generate well-branded interfaces and assets for Talent-X, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick map
- `README.md` — brand context, content fundamentals, visual foundations, iconography, accessibility, and a full folder index. **Start here.**
- `tokens.json` / `tokens.css` — design tokens (source of truth) → CSS vars (`:root` light, `[data-theme="dark"]` dark). Everything derives from here.
- `colors_and_type.css` — ready-to-use utility classes (`.tx-h1`, `.tx-body`, `.tx-fg-*`, `.tx-bg-*`).
- `theme/talentx-theme.ts` — typed React Native / Expo theme.
- `fonts/` — self-hosted Poppins (SIL OFL).
- `assets/` — logos, monograms, app-icon (SVG + PNG).
- `preview/` — Design System cards (colors, type, spacing, components, brand).
- `kitchen-sink.html` — foundations + components showcase with light/dark toggle.
- `ui_kits/talent-x-app/` — high-fidelity clickable recreation of the mobile app (dark-first). See its README.

## Essentials
- **Dark-first**, flat & crisp. No bevels, gloss, heavy shadows, or decorative gradients.
- One accent: **blue `#2E7CF6`** (the "X"). Cool **slate** neutrals, white → ink `#0B0F17`.
- The **signature X gradient** (`135°, #5BAEFF→#2E7CF6→#1B5BE0`) is for the brand mark / a single hero accent ONLY — never UI fill or running text.
- **Poppins** everywhere (400/500/600/700). Titles in slight negative tracking; overlines uppercase with wide tracking.
- Copy is **French**, second person singular (tu), motivating but factual, sport/coaching vocabulary, **no emoji**.
- Icons: outline, stroke ~2.2, rounded caps (Lucide-style / Lucide as substitute — flag if a house set exists).
- Dark elevation = hairline borders (+ optional blue glow), not shadows. Light elevation = soft shadows.
