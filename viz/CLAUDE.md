# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server (HMR)
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the built `dist/`
- `npm run lint` — ESLint over the repo (`eslint .`)

No test runner is configured.

## Architecture

This is a single-page React 19 + Vite app. The entire UI is one file: `src/App2.jsx` (~4400 lines). `src/App.jsx` is an older/abandoned version — `src/main.jsx` mounts `App2.jsx`.

### Page-as-index model

`App2.jsx` defines a flat `PAGES` manifest. Each "page" is a top-level function component (`IntroPage`, `DeficitHistoryPage`, `DebtAccumulation`, … `RepresentativesPage`). The root `App()`:

1. Loads every dataset up-front via `useCSV` / `useJSON` hooks (defined in the same file).
2. Builds a `pages` array of JSX elements in the same order as `PAGES`, passing each component its data props.
3. Wraps the current page in `<PageShell>`, which owns the nav bar, section menu, and slide transition.

Adding/removing a page = update `PAGES`, `SECTIONS` (if a new section), and the indexed `pages` array in `App()`. Indices must line up; downstream code references pages by ordinal (e.g. page 13 = TaxPage, page 14 = EconomicImpactPage).

### Shared state

Budget-slider state (`budgetCuts`, `budgetRatesRaw`) lives in `App()` because `TaxPage` (13) and `EconomicImpactPage` (14) must share it. Don't push that state down into either page.

`PageShell` deliberately renders `{visible ? children : content}` (snapshotting `content` during slide-out) so slider drags inside a page re-render the live tree — if you "simplify" this back to just `{children}`, sliders will stop updating mid-transition.

### Design tokens, not CSS

All styling is inline `style={{…}}` against `var` color/spacing tokens at the top of `App2.jsx` (`BG`, `SURFACE`, `BORDER`, `TEXT`, `MUTED`, `BLOCK_POS`, `BLOCK_NEG`, `S1_COLOR`…, `REV_COLORS`, `SPEND_COLORS`). There is no Tailwind/CSS module/styled-components — `App.css` and `index.css` are empty. Match the existing dense, small-font, tight-spacing look; keep colors going through the tokens rather than hardcoding new hex values.

The code style throughout `App2.jsx` uses `var` and the verbose `var _s = useState(…); var x = _s[0]; var setX = _s[1];` pattern. Match this when extending the file — it's not a bug, it's the established style.

### Data layer

All datasets are static files in `public/`, fetched at runtime via `fetch("/" + path)` inside `useCSV` / `useJSON`. To add data: drop the file in `public/`, add a `useCSV(...)`/`useJSON(...)` line in `App()`, append it to the `loading` guard, and thread it to the page that needs it.

Notable data files (see `public/`):
- `summary.csv`, `spending_by_function.csv`, `receipts_by_source.csv`, `federal_debt.csv` — OMB historicals
- `projections_*.csv`, `deficit_pct_gdp.csv`, `debt_pct_gdp.csv` — CBO projections
- `automatic_stabilizers.csv`, `stimulus_spending.csv`, `crowding_out.csv`, `japan_case_study.csv` — section-specific series
- `tax_brackets.csv`, `fiscal_multipliers.json` — inputs for TaxPage / EconomicImpactPage
- `legislators-current.json`, `key_votes.json`, `roll_calls.json`, `zip_districts.json` — fuel the RepresentativesPage (page 15). `rollCalls` and `zipDistricts` are optional; the page degrades gracefully without them.

### Data pipeline

`datapipeline/` holds Jupyter notebooks plus the raw CBO/OMB/FRED spreadsheets and PDFs they parse. Notebooks (`historicaldatapipeline.ipynb`, `projectionsdataparse.ipynb`, `stimulus_parser.ipynb`, `debtimpacts.ipynb`, `deficit_pct_gdp.ipynb`, `taxbracketincome.ipynb`) are run manually and emit the CSV/JSON files committed to `public/`. The app does not invoke them — they're an offline producer.

## Content conventions

This dashboard is public/educational, so content edits have rules:

- Cite only reputable primary sources (CBO, JCT, SSA, CMS, FEC, OMB, Congressional Record, academic papers). Don't substitute think-tank summaries when the underlying primary doc exists.
- Frame as "non-partisan but not bothsideist" — describe what official scores say, don't manufacture false equivalence.
- For RepresentativesPage (page 15), keep the rule that vote coloring is pure CBO arithmetic (red = voted for deficit increase, green = voted for savings, amber = blocked savings). Don't add composite/editorial scoring systems.
- Budget-cut sliders should surface real-world human-impact numbers (see `SPEND_IMPACT` at the top of `App2.jsx` for the established pattern and source format).
