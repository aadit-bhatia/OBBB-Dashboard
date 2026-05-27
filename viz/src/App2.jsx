import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import Papa from "papaparse";

// ─────────────────────────────────────────────
// BLOCK / GRID CONSTANTS
// ─────────────────────────────────────────────
var BLOCK_SIZE   = 10000;   // $10B per block (OMB historical, millions)
var YEAR         = 2024;    // current snapshot year
var COLS         = 22;
var SZ           = 12;
var GAP          = 2;

var PROJ_BLOCK_PCT = 0.1;   // 0.1% of GDP per block
var PROJ_SZ        = 7;
var PROJ_GAP       = 1;
var PROJ_COL_W     = 5;    // 5 blocks wide per bar

// ─────────────────────────────────────────────
// DESIGN TOKENS  (identical to App.jsx)
// ─────────────────────────────────────────────
var BG      = "#f8fafc";
var SURFACE = "#ffffff";
var BORDER  = "#e5e7eb";
var TEXT    = "#111827";
var MUTED   = "#6b7280";
var GOLD    = "#b91c1c";
var AMBER   = "#dc2626";
var RED     = "#991b1b";
var BLUE    = "#166534";

// Block colors — distinct from RED/BLUE to avoid partisan reads
var BLOCK_POS = "#16a34a";   // surplus / revenue — green
var BLOCK_NEG = "#dc2626";   // deficit / spending — red

// Projection scenario colors
var C_JAN      = "#6b7280";   // Scenario 1 — Jan 2025 baseline (neutral grey)
var C_TCJA     = "#2ca02c";   // Scenario 2 — TCJA extended, no other OBBBA
var C_OBBBA    = "#c8860a";   // Scenario 3 — OBBBA w/ tariffs
var C_NOTARIFF = "#991b1b";   // Scenario 4 — OBBBA with no new tariff revenue (dark red)

// Section accent colors
var S1_COLOR = "#1e3a5f";   // Section I  — How Did We Get Here
var S2_COLOR = "#1e40af";   // Section II — Where Are We Going (blue)
var S3_COLOR = "#374151";   // Section III — What Are the Consequences

// ─────────────────────────────────────────────
// REVENUE / SPENDING COLOR MAPS  (from App.jsx)
// ─────────────────────────────────────────────
var REV_COLORS = {
  "Individual Income Tax": "#14532d",
  "Payroll Taxes (FICA)":  "#166534",
  "Corporate Income Tax":  "#16a34a",
  Other:                   "#4ade80",
  "Excise Taxes":          "#bbf7d0",
};

var SPEND_COLORS = {
  "Social Security":   "#7f1d1d",
  Health:              "#991b1b",
  "Net interest":      "#b91c1c",
  Medicare:            "#dc2626",
  "National Defense":  "#ef4444",
  "Income Security":   "#f87171",
  "Veterans Benefits and Services":                            "#fca5a5",
  "Education, Training, Employment, and Social Services":      "#fecaca",
};
var SPEND_OTHER_COLOR = "#fee2e2";

var SPEND_SHORT = {
  "Social Security":      "Social Security",
  Health:                 "Health (Medicaid/ACA)",
  "Net interest":         "Net Interest",
  Medicare:               "Medicare",
  "National Defense":     "National Defense",
  "Income Security":      "Income Security (unemployment insurance, food stamps, etc.)",
  "Veterans Benefits and Services":                            "Veterans",
  "Education, Training, Employment, and Social Services":      "Education & Training",
};

// ─────────────────────────────────────────────
// REAL-WORLD IMPACT ESTIMATES  (per $1B in spending cuts)
// Each entry: per_billion = people/jobs per $1B cut, label = display text, source = citation
// ─────────────────────────────────────────────
var SPEND_IMPACT = {
  "Social Security": {
    per_billion: 44600,
    label: "people's full annual Social Security benefit",
    source: "SSA (2024): 65.5M beneficiaries, avg. $22,443/yr — SSA Monthly Statistical Snapshot Dec 2024",
  },
  "Medicare": {
    per_billion: 60500,
    label: "Medicare beneficiaries' annual federal coverage",
    source: "CMS (2024): 67.6M enrolled, $1,118B total outlays — CMS NHE Accounts & Medicare Enrollment Dashboard",
  },
  "Health": {
    per_billion: 128700,
    label: "people could lose Medicaid coverage",
    source: "CMS (2024): $614B federal Medicaid, ~79M enrollees — CMS-64 Expenditure Report & Medicaid Enrollment Data",
  },
  "Income Security": {
    per_billion: 105000,
    label: "people could lose income support",
    source: "OMB/USDA (FY2024): ~60M recipients across SNAP (41.7M), UI, SSI, housing assistance; ~$570B total",
  },
  "National Defense": {
    per_billion: 7000,
    label: "defense industry jobs supported",
    source: "Congressional Research Service: ~7,000 jobs per $1B in defense spending (direct + contractor)",
  },
  "Veterans Benefits and Services": {
    per_billion: 21600,
    label: "veterans could lose access to VA services",
    source: "VA (FY2024): $310B budget, 6.7M veterans and survivors served — VA FY2024 Budget Submission",
  },
  "Education, Training, Employment, and Social Services": {
    per_billion: 191000,
    label: "students' annual Pell Grant",
    source: "ED (FY2024): $33B Pell Grant for 6.3M students, avg. $5,238/yr — Federal Student Aid Office",
  },
};

// ─────────────────────────────────────────────
// OMB slider category → CBO Table 3-1 projection categories
//
// Maps the existing 8 OMB-style sliders onto CBO's 6 spending series.
// Weights split CBO's "Other mandatory" and "Nondefense" across the OMB
// sub-categories using their FY2024 OMB shares (derived from
// public/spending_by_function.csv). Weights sum to 1.0 within each CBO series:
//   Other mandatory: Income Security (.61) + Veterans (.24) + other-mandatory portion (.15) = 1.00
//   Nondefense:      Education (.10) + other-discretionary portion (.90) = 1.00
// Source: OMB Historical Tables, FY2024 actuals (already in spending_by_function.csv).
// ─────────────────────────────────────────────
var OMB_TO_CBO = {
  "Social Security":                                    [{cbo: "Social Security", w: 1.0}],
  "Medicare":                                           [{cbo: "Medicare",        w: 1.0}],
  "Health":                                             [{cbo: "Medicaid",        w: 1.0}],
  "Income Security":                                    [{cbo: "Other mandatory", w: 0.61}],
  "National Defense":                                   [{cbo: "Defense",         w: 1.0}],
  "Veterans Benefits and Services":                     [{cbo: "Other mandatory", w: 0.24}],
  "Education, Training, Employment, and Social Services": [{cbo: "Nondefense",    w: 0.10}],
  "other": [
    {cbo: "Other mandatory", w: 0.15},
    {cbo: "Nondefense",      w: 0.90},
  ],
};

// Parse CBO baseline CSV into a lookup {series: {year: value}} + helper accessors.
// CSV format: series, kind, 2026, 2027, ..., 2034
function parseCboBaseline(rows) {
  if (!rows || !rows.length) return null;
  var lookup = {};
  rows.forEach(function (r) {
    if (!r.series) return;
    lookup[r.series] = {};
    [2026,2027,2028,2029,2030,2031,2032,2033,2034].forEach(function (y) {
      var v = r[String(y)];
      if (typeof v === "number") lookup[r.series][y] = v;
    });
    lookup[r.series]._kind = r.kind;
  });
  return {
    lookup: lookup,
    years: [2026,2027,2028,2029,2030,2031,2032,2033,2034],
    get: function (series, year) {
      var s = lookup[series]; if (!s) return 0;
      return s[year] || 0;
    },
    // Slider amount = CBO 2026 baseline × allocation weights, summed across mapped CBO series.
    sliderAmount2026: function (ombKey) {
      var map = OMB_TO_CBO[ombKey] || [];
      var sum = 0;
      map.forEach(function (m) { sum += m.w * (lookup[m.cbo] && lookup[m.cbo][2026] || 0); });
      return sum;
    },
    // For a given year, total scenario outlay savings from one OMB slider's percentage cut.
    savingsForYear: function (ombKey, pct, year) {
      var map = OMB_TO_CBO[ombKey] || [];
      var sum = 0;
      map.forEach(function (m) { sum += m.w * (lookup[m.cbo] && lookup[m.cbo][year] || 0); });
      return (pct / 100) * sum;
    },
    seed: (lookup["Starting debt end-FY2025"] || {})[2026] || 30172,
    gdp2026: (lookup["GDP"] || {})[2026] || 31902,
    gdp2034: (lookup["GDP"] || {})[2034] || 43373,
    baselineDebt2034: (lookup["Debt held by public"] || {})[2034] || 50394,
  };
}

// ─────────────────────────────────────────────
// BUDGET CATEGORIES  (shared by TaxPage + EconomicImpactPage)
// ─────────────────────────────────────────────
var SPEND_CATS = [
  { key: "Social Security",    label: "Social Security",         type: "mandatory" },
  { key: "Medicare",           label: "Medicare",                type: "mandatory" },
  { key: "Health",             label: "Medicaid & Health",       type: "mandatory" },
  { key: "Income Security",    label: "Income Security",         type: "mandatory" },
  { key: "National Defense",   label: "National Defense",        type: "discretionary" },
  { key: "Veterans Benefits and Services", label: "Veterans",    type: "discretionary" },
  { key: "Education, Training, Employment, and Social Services", label: "Education & Training", type: "discretionary" },
  { key: "other",              label: "All Other Discretionary", type: "discretionary" },
];

// ─────────────────────────────────────────────
// SECTION + PAGE MANIFEST
//
// Each entry is one page.  The `section` field
// drives the section banner in the nav bar.
// `prompt` is the forward-navigation button text.
// ─────────────────────────────────────────────
var SECTIONS = [
  { id: 0, label: "I. How Did We Get Here?",        color: S1_COLOR },
  { id: 1, label: "II. Where Are We Going?",         color: S2_COLOR },
  { id: 2, label: "III. What Are the Consequences?", color: S3_COLOR },
  { id: 3, label: "IV. What Can You Do?",            color: "#1e3a5f" },
];

var PAGES = [
  // ── Landing ────────────────────────────────────────────────────
  {
    section: null,
    component: "IntroPage",
    prompt: "Let's start with history. How did we get here?",
  },

  // ── Section I: How Did We Get Here? ────────────────────────────
  {
    section: 0,
    component: "DeficitHistoryPage",   // I.a  — FRED FYFSGDA188S block viz
    title: "A History of Deficits",
    prompt: "So how do annual deficits turn into debt?",
  },
  {
    section: 0,
    component: "DebtAccumulation",     // I.b  — repurposed from App.jsx page 3
    title: "How Deficits Become Debt",
    prompt: "How far back does that debt go?",
  },
  {
    section: 0,
    component: "DebtToGDPPage",        // I.c  — debt-to-GDP time series
    title: "Debt Divided by National Income (in %)",
    prompt: "What changed the trajectory along the way?",
  },
  {
    section: 0,
    component: "ObamaEraPage",         // I.d — decomposition of Obama-era deficits
    title: "Recession vs. Policy: Crisis Deficits",
    prompt: "Now let's look at where things are heading.",
  },

  // ── Section II: Where Are We Going? ────────────────────────────
  {
    section: 1,
    component: "DeficitPage",          // II.a — FY2024 deficit block
    title: "The Deficit — FY2024",
    prompt: "What does the full picture of revenue and spending look like?",
  },
  {
    section: 1,
    component: "RevSpendPage",         // II.b — revenue vs spending
    title: "Revenue vs. Spending — FY2024",
    prompt: "What is our government's plan for the deficit in the future?",
  },
  {
    section: 1,
    component: "OBBBAPage",            // II.c — OBBBA scenarios + debt pile
    title: "The One Big Beautiful Bill Act",
    prompt: "What are the real-world consequences of all this?",
  },

  // ── Section III: What Are the Consequences? ────────────────────
  {
    section: 2,
    component: "ConsolesPage",         // III.a — debt misconception
    title: "Does Government Debt Have to Be Repaid?",
    prompt: "So then what are the long term consequences of a large deficit?",
  },
  {
    section: 2,
    component: "CrowdingOutTextPage",  // III.a.ii — consequences overview
    title: "What Does This Mean for Future Generations?",
    prompt: "Does this play out in the real world?",
  },
  {
    section: 2,
    component: "CrowdingOutPage",      // III.a.i — are we stealing from our children?
    title: "Paying for the Past",
    prompt: "How Do Interest Payments Compare to Other Budget Items?",
  },
  {
    section: 2,
    component: "NetInterestPage",      // III.b — repurposed from App.jsx page 4
    title: "How Does the Cost of Debt Service Compare to Other Government Programs?",
    prompt: "What choices does that leave for the budget?",
  },
  {
    section: 2,
    component: "BudgetDilemmaPage",
    title: "The Budget Dilemma",
    prompt: "So what would it actually take to raise enough in taxes?",
  },
  {
    section: 2,
    component: "TaxPage",
    title: "Balancing the Budget?",
    prompt: "What does this mean for the economy?",
  },
  {
    section: 2,
    component: "EconomicImpactPage",
    title: "Economic Feedback Effects",
    prompt: "So who voted for all this?",
  },

  // ── Section IV: What Can You Do? ───────────────────────────────
  {
    section: 3,
    component: "RepresentativesPage",
    title: "Your Representatives' Fiscal Record",
    prompt: null,
  },

];

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
function fmtAmt(v) {
  var abs = Math.abs(v);
  if (abs >= 1e6) return "$" + (abs / 1e6).toFixed(2) + "T";
  return "$" + Math.round(abs / 1e3) + "B";
}

function fmtImpact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e4) return Math.round(n / 1e3) + "K";
  return n.toLocaleString();
}

function useCSV(path) {
  var _s = useState(null);
  var data = _s[0]; var setData = _s[1];
  useEffect(function () {
    var cancelled = false;
    fetch("/" + path)
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        if (cancelled) return;
        setData(Papa.parse(txt.trim(), { header: true, dynamicTyping: true, skipEmptyLines: true }).data);
      })
      .catch(function (e) { console.error("Failed to load", path, e); });
    return function () { cancelled = true; };
  }, [path]);
  return data;
}

function useJSON(path) {
  var _s = useState(null);
  var data = _s[0]; var setData = _s[1];
  useEffect(function () {
    var cancelled = false;
    fetch("/" + path)
      .then(function (r) { return r.json(); })
      .then(function (json) { if (!cancelled) setData(json); })
      .catch(function (e) { console.error("Failed to load", path, e); });
    return function () { cancelled = true; };
  }, [path]);
  return data;
}

function buildBlocks(sources) {
  var blocks = [];
  for (var i = 0; i < sources.length; i++) {
    var src = sources[i];
    var n = Math.round(src.amount / BLOCK_SIZE);
    for (var j = 0; j < n; j++) blocks.push({ color: src.color, name: src.label });
  }
  return blocks;
}

// ─────────────────────────────────────────────
// SHARED UI PRIMITIVES
// ─────────────────────────────────────────────
function Card(props) {
  return (
    <div id={props.id} style={{
      background: SURFACE, borderRadius: 10,
      border: "1px solid " + BORDER,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      padding: "24px 28px",
      ...(props.style || {}),
    }}>
      {props.children}
    </div>
  );
}

function BlockGrid({ blocks, hoveredCat, setHoveredCat }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(" + COLS + ", " + SZ + "px)", gap: GAP + "px" }}>
      {blocks.map(function (b, i) {
        var hl = hoveredCat === null || hoveredCat === b.name;
        return (
          <div key={i}
            onMouseEnter={function () { setHoveredCat(b.name); }}
            onMouseLeave={function () { setHoveredCat(null); }}
            style={{ width: SZ, height: SZ, borderRadius: 2, backgroundColor: b.color, opacity: hl ? 1 : 0.12, transition: "opacity 0.2s", cursor: "pointer" }}
          />
        );
      })}
    </div>
  );
}

function Legend({ sources, hoveredCat, setHoveredCat }) {
  // Group sources if any have a `group` field, otherwise render flat
  var useGroups = sources.some(function (s) { return s.group; });
  var groups = [];
  if (useGroups) {
    var seen = {};
    sources.forEach(function (s) {
      var g = s.group || "Other";
      if (!seen[g]) { seen[g] = true; groups.push(g); }
    });
  }

  function renderItem(s) {
    var isActive = hoveredCat === null || hoveredCat === s.label;
    var amt = s.amount >= 1e6
      ? "$" + (s.amount / 1e6).toFixed(2) + "T"
      : "$" + Math.round(s.amount / 1e3) + "B";
    return (
      <div key={s.label}
        onMouseEnter={function () { setHoveredCat(s.label); }}
        onMouseLeave={function () { setHoveredCat(null); }}
        style={{ display: "flex", alignItems: "center", gap: 8, opacity: isActive ? 1 : 0.2, transition: "opacity 0.2s", cursor: "pointer", fontSize: 13 }}>
        <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: s.color, flexShrink: 0 }} />
        <span style={{ color: TEXT }}>{s.label}</span>
        <span style={{ color: MUTED, marginLeft: "auto", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{amt}</span>
      </div>
    );
  }

  if (!useGroups) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 14 }}>
        {sources.map(renderItem)}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 14 }}>
      {groups.map(function (g) {
        var items = sources.filter(function (s) { return (s.group || "Other") === g; });
        return (
          <div key={g}>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1.2, marginTop: 8, marginBottom: 4 }}>{g}</div>
            {items.map(renderItem)}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// TOUR SYSTEM
// ─────────────────────────────────────────────

// Tour steps are keyed by page index in PAGES array.
// Add entries here as each page is built out.
var TOUR_CONFIGS = {
  // Page 0 — Intro
  0: [
    { title: "Welcome to Visualize Policy's Deficit/Debt Explorer", body: "Throughout the Explorer you will see ? buttons like the one above this box. They open guided tours that explain how to understand and interact with each page." },
    { title: "Move forward with the question boxes", body: "At the bottom of each page is a question box. Click it to advance to the next page — each question leads naturally into the next topic." },
    { title: "Jump anywhere with the menu", body: "The Menu button in the top-right lets you jump to any page directly. It shows all three sections and every page within them." },
  ],
  // Page 1 — Deficit History
  1: [
    { title: "Each block = 0.5% of GDP", body: "Every square represents 0.5% of gross domestic product. Green blocks are surpluses, red blocks are deficits." },
    { title: "Height shows magnitude", body: "Bigger columns mean larger deficits or surpluses as a percentage of national income." },
    { title: "During crises, borrowing spikes", body: "During crises, like the COVID pandemic, the government has borrowed a larger share of the national income to cover emergency spending." },
    { title: "Hover any column", body: "Hover any year to see the exact surplus or deficit figure and the era label." },
  ],
  // Page 2 — Debt Accumulation
  2: [
    { title: "Drag the slider", body: "Drag the slider to see how the deficit and the debt have changed since 1970. Each year's deficit gets added as new blocks at the end of the pile." },
    { title: "Hover the debt pile", body: "Hover any block in the pile to see which fiscal year it came from. Gray blocks represent debt inherited from before 1970." },
    { title: "Debt reconciliation", body: "The box at the bottom breaks down how the total gross federal debt is composed — pre-1970 inherited debt, cumulative deficits since 1970, and trust fund borrowing." },
  ],
  // Page 3 — Debt to GDP
  3: [
    { title: "Scroll left and right", body: "The chart spans 85 years — scroll horizontally to move through time from 1939 to the present." },
    { title: "Each block = 0.5% of national income", body: "Deeper columns mean more debt relative to the size of the economy. National income (GDP) measures the total value a country produces each year." },
    { title: "Hover any column", body: "Hover any year to see the exact debt level and which president was in office." },
  ],
  // Page 4 — Crisis Deficit Decomposition
  4: [
    { title: "Two crises, same pattern", body: "The left panel shows the 2008 financial crisis and Obama years. The right shows the COVID pandemic under Trump and Biden. Both follow the same playbook: automatic stabilizers kick in on top of deliberate stimulus legislation." },
    { title: "Two layers", body: "Grey is the structural deficit — driven by policy choices and existing law, including stimulus bills like ARRA and the CARES Act. Amber is automatic stabilizers — programs that expand automatically without new legislation." },
    { title: "Hover for detail", body: "Hover any year to see the exact structural deficit and automatic stabilizer contribution for that year." },
  ],
  // Page 6 — Revenue vs Spending
  6: [
    { title: "Each block = $10 billion", body: "Every square represents $10 billion of government money. Green blocks are revenue, red blocks are spending." },
    { title: "Hover to highlight", body: "Hover any block to highlight that category across the grid and legend." },
    { title: "Read the legend", body: "The legend below each grid lists every category with its total. Categories are sorted largest to smallest." },
  ],
  // Page 7 — OBBBA (includes debt pile)
  7: [
    { title: "Increases in the annual deficit", body: "Over the next 10 years, tax cuts under the OBBBA will grow the amount of money the government borrows by hundreds of billions. Each year's bar shows three scenarios: what would have happened if the OBBBA wasn't passed, what will happen if President Trump is able to cover some of his tax cuts with import tariffs, and what will happen if the tariffs are struck down and that money must be borrowed.", targetId: "obbba-deficit-card" },
    { title: "Will tariffs offset any of the cost of the OBBBA?", body: "President Trump has claimed that his import tariffs are a way to make up the deficit spending from the OBBBA. The tariffs he announced in April 2025 were estimated by the CBO to raise $3.4 trillion over the next 10 years. However, the Supreme Court ruled he did not have the authority to apply taxes and that the money collected had to be refunded. Those refunds have started going out. Since then the original tariffs were replaced by temporary duties.", targetId: "obbba-deficit-card" },
    { title: "Will the government still tax imports?", body: "Right now, it's unclear. There are ongoing lawsuits on which tariffs are legal, how high each tax will be, and whether the government has to pay back tariffs already collected. We believe that the revenue from tariffs from now till 2034 will fall somewhere between the no tariff revenue case and the CBO's projections assuming the July 2025 tariffs remain in place.", targetId: "obbba-deficit-card" },
    { title: "Move the slider through the next decade", body: "Use the slider to see how each year's deficit adds to the national debt pile. The pile shows cumulative debt held by the public — gray is what we already owed at the end of 2024." },
  ],
  // Page 8 — Consoles (no tour)
  // Page 9 — What Does This Mean for Future Generations? / consequences overview (no tour)
  // Page 10 — Paying for the Past
  10: [
    { title: "Cents of every tax dollar", body: "The big number at the top shows how many cents of each tax dollar go straight to interest payments — money that can't be spent on anything else. In 1970 it was 7.9 cents. In 2025 it's 18.5 cents." },
    { title: "The chart tells the story", body: "Hover any year to see the exact share. Notice how it rose sharply in the 1980s as Reagan-era deficits compounded, fell during the Clinton surplus years, then began climbing again after 2008." },
  ],
  // Page 11 — Net Interest
  11: [
    { title: "Compare any program", body: "Use the dropdown to select any government program. The block grids below will update to show net interest payments alongside your chosen program for that year." },
    { title: "Move the slider through time", body: "Use the slider to move from 1970 to 2024 and see how both figures have changed over time. Compare how fast spending on interest has grown versus other categories." },
  ],
  // Page 12 — Budget Dilemma
  12: [
    { title: "Hover a slice", body: "Click any slice of the donut to see what that category costs, why it's hard to cut, and polling data on public support. Red slices are mandatory spending — legally required by statute. Green slices are discretionary." },
    { title: "The math is brutal", body: "Even eliminating every green slice entirely: all of defense, education, veterans, foreign aid. It barely covers the deficit. Any plan to balance the budget requires some combination of cuts to mandatory programs, discretionary programs, and tax increases." },
  ],
  // Page 13 — Balancing the Budget
  13: [
    { title: "Drag the sliders", body: "Each slider raises the effective tax rate on that income group by up to 20 percentage points. The bar at the top fills in green as you close more of the deficit." },
    { title: "The static vs. real gap", body: "These numbers assume people keep earning and reporting the same income. In reality, higher rates lead to more deductions, income shifting, and deferral. The true revenue gain is real but smaller than what you see here." },
    { title: "Cutting spending", body: "Spending is divided into two groups. Discretionary spending — defense, veterans, education — is set annually by Congress and can be cut directly. This happened in 2013 through the Budget Control Act's sequestration, which imposed across-the-board cuts after Congress failed to agree on a deficit plan. Mandatory programs require new legislation to cut. While rare, the OBBBA cut Medicare spending to fund some of its tax cuts." },
    { title: "In the real world", body: "In reality, some of these effects work against you. Cutting government spending reduces growth and new investments, but increasing taxes does the same. Economists disagree on how much each factor matters." },
  ],
  // Page 14 — Economic Feedback Effects
  14: [
    { title: "Static vs. dynamic scoring", body: "The previous page showed the raw arithmetic: raise taxes, cut spending, the deficit shrinks by that much. Dynamic scoring asks what happens next — people change their behavior, and the economy responds." },
    { title: "Keynesian demand drag", body: "When the government spends less or taxes more, households and firms have less to spend. In the short run, this reduces GDP. The multiplier tells us how much: a $1 cut to income-support programs shrinks GDP by about $1.50 in year one; a $1 defense cut by about $1.00. Note: these are stimulus-period CBO estimates (2009–2015) and may be somewhat higher than today's multipliers." },
    { title: "Behavioral tax offset", body: "Higher rates prompt avoidance: more deductions, income shifting to lower-taxed forms, and deferred realization. JCT's analysis of the 2017 tax law estimated a roughly 26% behavioral offset overall, concentrated at top brackets. We apply similar estimates here." },
    { title: "Long-run crowding-in", body: "A smaller deficit means the government borrows less, leaving more capital available for private investment. CBO estimates roughly $0.50 of additional GDP per $1 of sustained deficit reduction over a decade — the crowding-in effect. This is a long-run gain, not visible in year one." },
  ],
  // Page 15 — Representatives Fiscal Record
  15: [
    { title: "Enter your ZIP code", body: "Type your 5-digit ZIP to see your two senators and House representative. If your ZIP spans multiple districts, you'll be asked to pick the right one." },
    { title: "Reading the vote table", body: "Each row is a major piece of legislation with its official CBO 10-year cost or savings estimate. Red rows are bills that added to the deficit; green rows reduced it. The color reflects fiscal impact, not party." },
    { title: "Take action", body: "Call the phone number listed or visit the member's website to send a message about deficit policy. Congressional offices track constituent contact volume — calls and messages do matter." },
  ],
};

function Tour({ steps, onDone }) {
  if (!steps) return null;

  var _step = useState(0); var step = _step[0]; var setStep = _step[1];
  var _arrowPos = useState(null); var arrowPos = _arrowPos[0]; var setArrowPos = _arrowPos[1];
  var cur = steps[step];
  var isLast = step === steps.length - 1;

  useEffect(function () {
    var el = document.querySelector("[data-content-scroll]");
    if (el) el.scrollTop = 0;
  }, []);

  // Compute highlight position on target element
  useEffect(function () {
    if (!cur.targetId) { setArrowPos(null); return; }
    var target = document.getElementById(cur.targetId);
    if (!target) { setArrowPos(null); return; }
    var rect = target.getBoundingClientRect();
    setArrowPos({ x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + 20) });
  }, [step, cur.targetId]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: "none" }}>

      {/* Tour panel — centered above content, works at any viewport width */}
      <div style={{
        position: "fixed",
        top: 80,
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(340px, calc(100vw - 32px))",
        pointerEvents: "auto",
        zIndex: 1001,
      }}>
        <div style={{
          background: "#fff",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          padding: "14px 12px",
          overflowY: "auto",
          maxHeight: "100%",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
              Step {step + 1} of {steps.length}
            </div>
            <button onClick={onDone} style={{ background: "none", border: "none", fontSize: 16, color: "#9ca3af", cursor: "pointer", lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {steps.map(function (_, i) {
              return <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: i === step ? "#1e3a5f" : "#e5e7eb", flexShrink: 0 }} />;
            })}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 6, lineHeight: 1.3 }}>{cur.title}</div>
          <p style={{ fontSize: 11, color: "#374151", lineHeight: 1.55, margin: "0 0 12px" }}>{cur.body}</p>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {step > 0 && (
              <button onClick={function () { setStep(step - 1); }} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "5px 10px", fontSize: 11, color: "#374151", cursor: "pointer" }}>Back</button>
            )}
            <button onClick={function () { isLast ? onDone() : setStep(step + 1); }} style={{ background: "#1e3a5f", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, color: "#fff", cursor: "pointer", fontWeight: 600 }}>
              {isLast ? "Got it" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function useTour(pageIndex) {
  var steps = TOUR_CONFIGS[pageIndex] || null;
  var hasTour = !!steps;
  var _show = useState(pageIndex === 0 && hasTour);
  var show = _show[0]; var setShow = _show[1];
  function done()   { setShow(false); }
  function reopen() { setShow(true); }
  return { show: show, done: done, reopen: reopen, hasTour: hasTour, steps: steps };
}

// Reusable tour-trigger button used in page headers
function TourBtn({ onOpen }) {
  var _hov = useState(false); var hov = _hov[0]; var setHov = _hov[1];
  return (
    <div style={{ position: "relative", flexShrink: 0 }}
      onMouseEnter={function () { setHov(true); }}
      onMouseLeave={function () { setHov(false); }}>
      <button onClick={onOpen} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: "50%", width: 26, height: 26, fontSize: 13, color: MUTED, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>?</button>
      {hov && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: "#1e3a5f", color: "#fff",
          fontSize: 12, lineHeight: 1.5,
          padding: "8px 12px", borderRadius: 7,
          whiteSpace: "nowrap", zIndex: 200,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          pointerEvents: "none",
        }}>
          Click for a guided tour of this chart
          <div style={{ position: "absolute", top: -5, right: 9, width: 10, height: 10, background: "#1e3a5f", transform: "rotate(45deg)" }} />
        </div>
      )}
    </div>
  );
}

// Inline info icon with tooltip — click to toggle (works on touch devices)
function InfoTip({ text }) {
  var _open = useState(false); var open = _open[0]; var setOpen = _open[1];
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
      <button
        onClick={function () { setOpen(!open); }}
        aria-expanded={open}
        style={{ cursor: "pointer", fontSize: 14, color: BLUE, fontWeight: 400, lineHeight: 1, background: "none", border: "none", padding: 0 }}
      >ⓘ</button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
          background: "#fff", border: "1px solid #e5e7eb",
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          borderRadius: 10, padding: "14px 12px",
          width: 300, zIndex: 300,
          whiteSpace: "normal",
        }}>
          {text.split("\n\n").map(function (para, i) {
            return <p key={i} style={{ fontSize: 11, color: "#374151", lineHeight: 1.55, margin: i === 0 ? 0 : "8px 0 0" }}>{para}</p>;
          })}
          <div style={{ position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%) rotate(45deg)", width: 10, height: 10, background: "#fff", border: "1px solid #e5e7eb", borderTop: "none", borderLeft: "none" }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE COMPONENTS
// ─────────────────────────────────────────────

/* ── Landing ──────────────────────────────── */
function IntroPage({ onNavigate }) {
  var _hov = useState(null); var hovSection = _hov[0]; var setHovSection = _hov[1];
  var tour = useTour(0);

  var sectionPages = SECTIONS.map(function (s) {
    var items = PAGES.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) { return x.p.section === s.id && x.p.title; });
    return { s: s, items: items, firstIdx: items[0] ? items[0].i : 1 };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", maxWidth: 600, paddingBottom: 24 }}>
      {tour.show && <Tour steps={tour.steps} onDone={tour.done} />}

      {/* Eyebrow */}
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 4, textTransform: "uppercase", marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        Visualize Policy
        <TourBtn onOpen={tour.reopen} />
      </div>

      {/* Title */}
      <h1 style={{ fontSize: 52, fontWeight: 800, color: TEXT, lineHeight: 1.0, margin: "0 0 24px", letterSpacing: "-1.5px" }}>
        Understanding the<br />Deficit and the Debt
      </h1>

      {/* Lede */}
      <p style={{ fontSize: 16, color: "#6b7280", lineHeight: 1.8, margin: "0 0 36px", maxWidth: 480 }}>
        Where does the government's money come from? Where does it go?
        And what happens when it spends more than it takes in?
      </p>

      {/* Clickable section rows */}
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 24 }}>
        {sectionPages.map(function (sp, i) {
          var isHov = hovSection === sp.s.id;
          return (
            <button key={sp.s.id}
              onClick={function () { onNavigate(sp.firstIdx); }}
              onMouseEnter={function () { setHovSection(sp.s.id); }}
              onMouseLeave={function () { setHovSection(null); }}
              style={{
                borderTop: "1px solid " + (i === 0 ? "#d1d5db" : BORDER),
                borderBottom: i === sectionPages.length - 1 ? "1px solid " + BORDER : "none",
                borderLeft: "none", borderRight: "none",
                padding: "14px 12px 14px 0",
                display: "flex", alignItems: "center", gap: 20,
                background: isHov ? "#f9fafb" : "transparent",
                cursor: "pointer",
                transition: "background 0.15s",
                textAlign: "left", width: "100%",
              }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: sp.s.color, letterSpacing: 2, textTransform: "uppercase", minWidth: 24, flexShrink: 0 }}>
                {["I", "II", "III"][i]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: isHov ? sp.s.color : TEXT, marginBottom: 3, transition: "color 0.15s" }}>
                  {sp.s.label.replace(/^[IV]+\.\s*/, "")}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {sp.items.map(function (x) { return x.p.title; }).join("  ·  ")}
                </div>
              </div>
              <div style={{ fontSize: 15, color: sp.s.color, flexShrink: 0, opacity: isHov ? 1 : 0, transform: isHov ? "translateX(0px)" : "translateX(-8px)", transition: "opacity 0.15s, transform 0.15s" }}>→</div>
            </button>
          );
        })}
      </div>

      {/* Forward prompt — same style as PageShell's button */}
      <button onClick={function () { onNavigate(1); }}
        style={{ width: "100%", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, padding: "16px 24px", fontSize: 15, fontWeight: 500, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span>Let's start with history. How did we get here?</span>
        <span style={{ fontSize: 20, opacity: 0.7 }}>↓</span>
      </button>
    </div>
  );
}

/* ── I.a  Deficit History ─────────────────── */

// 1 block = 0.5% of GDP
var DEFICIT_BLOCK_PCT = 0.5;
var XAXIS_H = 24;  // px reserved for the permanent year label row at top

// Presidential era bands — Hoover onwards, party drives band color
var ERAS = [
  { label: "Hoover",     start: 1929, end: 1932, party: "R", color: "#ef444414" },
  { label: "FDR",        start: 1933, end: 1945, party: "D", color: "#3b82f614" },
  { label: "Truman",     start: 1946, end: 1952, party: "D", color: "#3b82f614" },
  { label: "Eisenhower", start: 1953, end: 1960, party: "R", color: "#ef444414" },
  { label: "Kennedy",    start: 1961, end: 1963, party: "D", color: "#3b82f614" },
  { label: "LBJ",        start: 1964, end: 1968, party: "D", color: "#3b82f614" },
  { label: "Nixon",      start: 1969, end: 1974, party: "R", color: "#ef444414" },
  { label: "Ford",       start: 1975, end: 1976, party: "R", color: "#ef444414" },
  { label: "Carter",     start: 1977, end: 1980, party: "D", color: "#3b82f614" },
  { label: "Reagan",     start: 1981, end: 1988, party: "R", color: "#ef444414" },
  { label: "Bush Sr.",   start: 1989, end: 1992, party: "R", color: "#ef444414" },
  { label: "Clinton",    start: 1993, end: 2000, party: "D", color: "#3b82f614" },
  { label: "Bush Jr.",   start: 2001, end: 2008, party: "R", color: "#ef444414" },
  { label: "Obama",      start: 2009, end: 2016, party: "D", color: "#3b82f614" },
  { label: "Trump",      start: 2017, end: 2020, party: "R", color: "#ef444414" },
  { label: "Biden",      start: 2021, end: 2024, party: "D", color: "#3b82f614" },
  { label: "Trump",      start: 2025, end: 2025, party: "R", color: "#ef444414" },
];

function deficitBarColor(val) {
  return val >= 0 ? BLOCK_POS : BLOCK_NEG;
}

// Column width breakpoints — fewer years = wider columns
function colWidthForCount(n) {
  if (n <= 30)  return 18;
  if (n <= 55)  return 13;
  if (n <= 75)  return 10;
  return 8;
}

function DeficitHistoryViz({ data }) {
  var _hov    = useState(null);  var hovYear   = _hov[0];    var setHovYear   = _hov[1];

  var filtered = useMemo(function () {
    return data.filter(function (r) { return r.year >= 1929; });
  }, [data]);

  // Column sizing — recalculated whenever the year range changes
  var colSz  = colWidthForCount(filtered.length);   // block face size in px
  var colGap = Math.max(1, Math.round(colSz * 0.15));
  var CELL   = colSz + colGap;
  var totalW = filtered.length * CELL;

  var maxAbs = useMemo(function () {
    return Math.max.apply(null, filtered.map(function (r) { return Math.abs(r.deficit_pct_gdp); }));
  }, [filtered]);

  var maxSurplus = useMemo(function () {
    var surs = filtered.filter(function (r) { return r.deficit_pct_gdp > 0; });
    return surs.length ? Math.max.apply(null, surs.map(function (r) { return r.deficit_pct_gdp; })) : 0;
  }, [filtered]);

  var maxDefBlocks = Math.ceil(maxAbs / DEFICIT_BLOCK_PCT);
  var maxSurBlocks = Math.ceil(Math.max(maxSurplus, 0.5) / DEFICIT_BLOCK_PCT);
  var chartH = (maxDefBlocks + maxSurBlocks) * CELL;
  var zeroY  = maxSurBlocks * CELL;

  // Era rects — clipped to visible years, keyed per column position
  var eraByYear = useMemo(function () {
    var map = {};
    ERAS.forEach(function (era) {
      filtered.forEach(function (r) {
        if (r.year >= era.start && r.year <= era.end) {
          map[r.year] = { label: era.label, party: era.party, color: era.color };
        }
      });
    });
    return map;
  }, [filtered]);

  // Compute contiguous era bands for background rendering
  var eraBands = useMemo(function () {
    var bands = []; var cur = null;
    filtered.forEach(function (r, i) {
      var e = eraByYear[r.year];
      if (!e) return;
      if (!cur || cur.label !== e.label || cur.party !== e.party) {
        if (cur) bands.push(cur);
        cur = { label: e.label, party: e.party, color: e.color, x: i * CELL, w: CELL, startYear: r.year, endYear: r.year };
      } else {
        cur.w += CELL;
        cur.endYear = r.year;
      }
    });
    if (cur) bands.push(cur);
    return bands;
  }, [filtered, eraByYear, CELL]);

  // Find which president the hovered year belongs to
  var hovRow = hovYear != null ? filtered.find(function (r) { return r.year === hovYear; }) : null;
  var hovEra = hovYear != null ? eraByYear[hovYear] : null;

  return (
    <div>
      {/* Hover callout — year, value, president */}
      <div style={{ minHeight: 36, marginBottom: 8 }}>
        {hovRow ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>{hovRow.year}</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: deficitBarColor(hovRow.deficit_pct_gdp) }}>
              {hovRow.deficit_pct_gdp >= 0 ? "+" : ""}{hovRow.deficit_pct_gdp.toFixed(2)}% of GDP
            </span>
            <span style={{ fontSize: 13, color: MUTED }}>
              {hovRow.deficit_pct_gdp >= 0 ? "surplus" : "deficit"}
            </span>
            {hovEra && (
              <span style={{
                fontSize: 16, color: hovEra.party === "D" ? "#1d4ed8" : "#b91c1c",
                fontWeight: 600, marginLeft: 4,
              }}>
                {hovEra.label}
              </span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 13, color: MUTED }}>Hover any column for details</span>
        )}
      </div>

      {/* Chart with fixed Y axis */}
      <div style={{ display: "flex", alignItems: "flex-start" }}>

        {/* Y axis — fixed, does not scroll */}
        {(function () {
          var YAXIS_W = 36;
          var tickPcts = [];
          for (var t = 5; t <= Math.ceil(maxAbs / 5) * 5; t += 5) tickPcts.push(t);
          return (
            <div style={{ width: YAXIS_W, flexShrink: 0, position: "relative", height: XAXIS_H + chartH + 4 }}>
              <div style={{ position: "absolute", right: 4, top: XAXIS_H + zeroY - 7, fontSize: 9, color: "#9ca3af", textAlign: "right" }}>0%</div>
              {tickPcts.map(function (pct) {
                var blocks = Math.round(pct / DEFICIT_BLOCK_PCT);
                var defY   = XAXIS_H + zeroY + blocks * CELL;
                var surY   = XAXIS_H + zeroY - blocks * CELL;
                return (
                  <React.Fragment key={pct}>
                    {defY < XAXIS_H + chartH && (
                      <div style={{ position: "absolute", right: 4, top: defY - 7, fontSize: 9, color: "#9ca3af", textAlign: "right" }}>-{pct}%</div>
                    )}
                    {surY > XAXIS_H && (
                      <div style={{ position: "absolute", right: 4, top: surY - 7, fontSize: 9, color: "#9ca3af", textAlign: "right" }}>+{pct}%</div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          );
        })()}

        {/* Scrollable chart */}
        <div style={{ overflowX: "auto", overflowY: "visible", flex: 1 }}>
        <div style={{ position: "relative", width: totalW, height: XAXIS_H + chartH + 4, flexShrink: 0 }}>

          {/* Grey gridlines */}
          {(function () {
            var lines = [];
            for (var pct = 5; pct <= Math.ceil(maxAbs / 5) * 5; pct += 5) {
              var blocks = Math.round(pct / DEFICIT_BLOCK_PCT);
              var defY   = XAXIS_H + zeroY + blocks * CELL;
              var surY   = XAXIS_H + zeroY - blocks * CELL;
              if (defY < XAXIS_H + chartH) lines.push({ y: defY, key: "d" + pct });
              if (surY > XAXIS_H)          lines.push({ y: surY, key: "s" + pct });
            }
            return lines.map(function (l) {
              return <div key={l.key} style={{ position: "absolute", left: 0, top: l.y, width: totalW, height: 1, background: "#e5e7eb", zIndex: 0 }} />;
            });
          })()}

          {/* X-axis year labels — permanent row at top */}
          {filtered.map(function (row, i) {
            var showTick = filtered.length <= 55 ? row.year % 5 === 0 : row.year % 10 === 0;
            if (!showTick) return null;
            return (
              <div key={"tick-" + row.year} style={{
                position: "absolute",
                left: i * CELL, top: 0,
                width: colSz, height: XAXIS_H,
                display: "flex", alignItems: "flex-end", justifyContent: "center",
                paddingBottom: 4,
              }}>
                <span style={{
                  fontSize: 12, fontWeight: 500, color: MUTED,
                  whiteSpace: "nowrap",
                }}>{row.year}</span>
              </div>
            );
          })}

          {/* Era background bands — shifted down by XAXIS_H */}
          {eraBands.map(function (band) {
            return (
              <div key={band.label + band.startYear} style={{
                position: "absolute",
                left: band.x, top: XAXIS_H,
                width: band.w, height: chartH,
                background: band.color,
                borderLeft: "1px solid " + BORDER + "44",
              }} />
            );
          })}

          {/* Zero line */}
          <div style={{
            position: "absolute", left: 0, top: XAXIS_H + zeroY,
            width: totalW, height: 2,
            background: "#9ca3af", zIndex: 1,
          }} />

          {/* Year columns */}
          {filtered.map(function (row, i) {
            var val       = row.deficit_pct_gdp;
            var blocks    = Math.max(1, Math.round(Math.abs(val) / DEFICIT_BLOCK_PCT));
            var color     = deficitBarColor(val);
            var isSurplus = val >= 0;
            var isHov     = hovYear === row.year;
            var x         = i * CELL;

            return (
              <div key={row.year}
                onMouseEnter={function () { setHovYear(row.year); }}
                onMouseLeave={function () { setHovYear(null); }}
                style={{
                  position: "absolute", left: x, top: XAXIS_H,
                  width: colSz, height: chartH,
                  zIndex: 2, cursor: "default",
                }}>
                {Array.from({ length: blocks }).map(function (_, b) {
                  var top = isSurplus
                    ? zeroY - (b + 1) * CELL
                    : zeroY + 2 + b * CELL;
                  return (
                    <div key={b} style={{
                      position: "absolute", left: 0, top: top,
                      width: colSz, height: colSz,
                      borderRadius: Math.max(1, Math.round(colSz * 0.15)),
                      backgroundColor: color,
                      opacity: isHov ? 1 : 0.82,
                      transition: "opacity 0.1s",
                    }} />
                  );
                })}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Color legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { color: BLOCK_POS, label: "Surplus" },
          
          { color: BLOCK_NEG, label: "Deficit" },
        ].map(function (l) {
          return (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: MUTED }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: l.color }} />
              {l.label}
            </div>
          );
        })}
        <span style={{ fontSize: 11, color: MUTED }}>· Each block = 0.5% of GDP · Hover a column for president</span>
      </div>
    </div>
  );
}

function DeficitHistoryPage({ deficitData }) {
  var tour = useTour(1);
  return (
    <div>
      {tour.show && <Tour steps={tour.steps} onDone={tour.done} />}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>A History of Deficits</h2>
        <TourBtn onOpen={tour.reopen} />
      </div>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 6px" }}>
        The United States has run a deficit in most years — but the size of those deficits relative to the economy has varied enormously. Wars, recessions, and policy choices have all left their mark on the fiscal record.
      </p>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 16px" }}>Each block = 0.5% of GDP. Green columns rise above the line for surplus years; red columns fall below for deficits.</p>
      <Card style={{ borderLeft: "4px solid " + RED, overflowX: "auto" }}>
        {deficitData
          ? <DeficitHistoryViz data={deficitData} />
          : <div style={{ color: MUTED, fontSize: 14, padding: "40px 0", textAlign: "center" }}>Loading…</div>
        }
      </Card>
      <p style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>Source: <a href="https://fred.stlouisfed.org/series/FYFSGDA188S" target="_blank" rel="noreferrer" style={{ color: BLUE }}>FRED FYFSGDA188S</a> — Federal Surplus or Deficit as % of GDP, Office of Management and Budget.</p>
    </div>
  );
}

/* ── I.b  Debt Accumulation ──────────────── */
// Ported directly from App.jsx DebtAccumulation.
// Accepts summaryData + debtData, same logic, same slider/pile UX.
function DebtAccumulation({ summaryData, debtData }) {
  var tour = useTour(2);

  var yearData = useMemo(function () {
    if (!summaryData) return [];
    var rows = summaryData.filter(function (r) { return r.year >= 1970 && r.year <= 2024 && !String(r.category).includes("Real"); });
    var byYear = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!byYear[r.year]) byYear[r.year] = {};
      if (r.category === "Total Receipts")     byYear[r.year].receipts = r.amount;
      if (r.category === "Total Outlays")      byYear[r.year].outlays  = r.amount;
      if (r.category === "Surplus or Deficit") byYear[r.year].deficit  = r.amount;
    }
    var cumDebt = 0; var result = [];
    for (var y = 1970; y <= 2024; y++) {
      var d = byYear[y] || {};
      var def = d.deficit || 0;
      // Surplus or Deficit: negative = deficit, positive = surplus
      // Add deficits, subtract surpluses from cumulative debt
      cumDebt += -def;
      if (cumDebt < 0) cumDebt = 0; // floor at zero
      result.push({ year: y, receipts: d.receipts || 0, outlays: d.outlays || 0, deficit: def, cumDebt: cumDebt });
    }
    return result;
  }, [summaryData]);

  var pre1970Debt = useMemo(function () {
    if (!debtData || !summaryData) return 0;
    var debtRows = debtData.filter(function (r) { return r.category === "Gross Federal Debt" && !String(r.category).includes("Real"); });
    var fy1970   = debtRows.find(function (r) { return r.year === 1970; });
    var defRow   = summaryData.find(function (r) { return r.year === 1970 && r.category === "Surplus or Deficit"; });
    var fy1970deficit = (defRow && defRow.amount < 0) ? Math.abs(defRow.amount) : 0;
    return fy1970 ? Math.max(fy1970.amount - fy1970deficit, 0) : 0;
  }, [debtData, summaryData]);

  var _idx = useState(0); var yearIdx = _idx[0]; var setYearIdx = _idx[1];
  var _hovY = useState(null); var hoveredYear = _hovY[0]; var setHoveredYear = _hovY[1];

  useEffect(function () { if (yearData.length > 0) setYearIdx(0); }, [yearData.length]);

  var debtPileBlocks = useMemo(function () {
    var blocks = [];
    for (var i = 0; i <= yearIdx; i++) {
      var yd = yearData[i];
      if (!yd || yd.deficit >= 0) continue;
      var n = Math.round(Math.abs(yd.deficit) / BLOCK_SIZE);
      for (var j = 0; j < n; j++) blocks.push({ year: yd.year });
    }
    return blocks;
  }, [yearIdx, yearData]);

  var cur = yearData[yearIdx] || yearData[yearData.length - 1] || {};

  var actualDebtThisYear = useMemo(function () {
    if (!debtData || !cur.year) return 0;
    var row = debtData.find(function (r) { return r.year === cur.year && r.category === "Gross Federal Debt" && !String(r.category).includes("Real"); });
    return row ? row.amount : 0;
  }, [debtData, cur.year]);

  var debtBreakdown = useMemo(function () {
    if (!debtData || !cur.year) return { heldByGovt: 0 };
    var rows = debtData.filter(function (r) { return r.year === cur.year && !String(r.category).includes("Real") && !String(r.category).includes("% GDP"); });
    var heldByGovt = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].category === "Held by Federal Government Accounts") heldByGovt = rows[i].amount;
    }
    return { heldByGovt: heldByGovt };
  }, [debtData, cur.year]);

  var pre1970TrustFund = useMemo(function () {
    if (!debtData) return 0;
    var row = debtData.find(function (r) { return r.year === 1970 && r.category === "Held by Federal Government Accounts" && !String(r.category).includes("Real"); });
    return row ? row.amount : 0;
  }, [debtData]);

  if (yearData.length === 0) return null;

  var deficitBlocks = cur.deficit < 0 ? Math.round(Math.abs(cur.deficit) / BLOCK_SIZE) : 0;
  var minPileYear  = debtPileBlocks.length > 0 ? debtPileBlocks[0].year : cur.year;
  var maxPileYear  = debtPileBlocks.length > 0 ? debtPileBlocks[debtPileBlocks.length - 1].year : cur.year;
  var pre1970Blocks = Math.round(pre1970Debt / BLOCK_SIZE);

  var trustFundBorrowing = debtBreakdown.heldByGovt - pre1970TrustFund;
  var otherAdjustments   = actualDebtThisYear - (pre1970Debt + cur.cumDebt) - Math.max(trustFundBorrowing, 0) - pre1970TrustFund;

  function yearColor(blockYear) {
    var range = Math.max(maxPileYear - minPileYear, 1);
    var t     = (blockYear - minPileYear) / range;
    // purple gradient: older = light violet, newer = deep purple
    var r = Math.round(220 - t * 80);
    var g = Math.round(80  - t * 60);
    var b = Math.round(80  - t * 60);
    return "rgb(" + r + "," + Math.max(10,g) + "," + Math.max(10,b) + ")";
  }

  return (
    <div>
      {tour.show && <Tour steps={tour.steps} onDone={tour.done} />}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>How Deficits Become Debt</h2>
        <TourBtn onOpen={tour.reopen} />
      </div>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 6px" }}>
        Our national debt has grown to over $39 trillion as of 2026, up from $35.23 trillion as of Fiscal Year (FY) 2024. Like regular loans, as the government runs a deficit for a longer period of time, interest payments increase as well, creating a compounding effect.
      </p>
      <p style={{ margin: "0 0 20px" }}><span style={{ fontSize: 15, color: "#c0392b", fontWeight: 700 }}>Drag the slider to see how the deficit and the debt have changed since 1970.</span>{" "}<span style={{ fontSize: 13, color: MUTED }}>Each block = $10B.</span></p>
      <Card style={{ borderLeft: "4px solid " + RED }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: MUTED }}>1970</span>
            <span style={{ fontSize: 28, fontWeight: 800, color: TEXT }}>FY {cur.year}</span>
            <span style={{ fontSize: 13, color: MUTED }}>2024</span>
          </div>
          <input type="range" min={0} max={yearData.length - 1} value={yearIdx}
            onChange={function (e) { setYearIdx(Number(e.target.value)); }}
            style={{ width: "100%", accentColor: RED, cursor: "grab" }} />
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          {[
            { label: "Revenue",            val: cur.receipts,         bg: "#eef6f0", color: BLUE },
            { label: "Spending",           val: cur.outlays,          bg: "#fef2f2", color: AMBER },
            { label: cur.deficit >= 0 ? "Surplus" : "Deficit", val: cur.deficit, bg: "#f0fdf4" , color: cur.deficit >= 0 ? BLUE : RED, prefix: cur.deficit >= 0 ? "+" : "−" },
            { label: "Gross Federal Debt", val: actualDebtThisYear,   bg: "#fef2f2", color: RED },
          ].map(function (s) {
            return (
              <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: "10px 16px", flex: "1 1 120px" }}>
                <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.prefix || ""}{fmtAmt(s.val)}</div>
              </div>
            );
          })}
        </div>
        {deficitBlocks > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>FY{cur.year} deficit: {deficitBlocks} blocks × $10B</div>
            <div style={{ display: "flex", gap: GAP, flexWrap: "wrap" }}>
              {Array.from({ length: deficitBlocks }).map(function (_, i) {
                return <div key={i} style={{ width: SZ, height: SZ, borderRadius: 2, backgroundColor: BLOCK_NEG, opacity: 0.9 }} />;
              })}
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>▼ Added to the debt pile below</div>
          </div>
        )}
        {cur.deficit >= 0 && (
          <div style={{ marginBottom: 16, padding: "8px 12px", background: "#eef6f0", borderRadius: 6, fontSize: 13, color: BLUE }}>
            ✓ Surplus in FY{cur.year} — no new borrowing.
          </div>
        )}
        <div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>
            Debt pile: {pre1970Blocks + debtPileBlocks.length} blocks × $10B = {fmtAmt(pre1970Debt + cur.cumDebt)}
            {hoveredYear !== null && hoveredYear !== -1 && <span style={{ marginLeft: 12, color: RED, fontWeight: 600 }}>FY{hoveredYear}</span>}
            {hoveredYear === -1 && <span style={{ marginLeft: 12, color: MUTED, fontWeight: 600 }}>Pre-1970</span>}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: GAP + "px" }}>
            {Array.from({ length: pre1970Blocks }).map(function (_, i) {
              var isHl = hoveredYear === null || hoveredYear === -1;
              return <div key={"pre" + i} onMouseEnter={function () { setHoveredYear(-1); }} onMouseLeave={function () { setHoveredYear(null); }}
                style={{ width: SZ, height: SZ, borderRadius: 2, backgroundColor: "#9ca3af", opacity: isHl ? 0.7 : 0.1, transition: "opacity 0.2s", cursor: "pointer" }} />;
            })}
            {debtPileBlocks.map(function (b, i) {
              var isHl = hoveredYear === null || hoveredYear === b.year;
              return <div key={i} onMouseEnter={function () { setHoveredYear(b.year); }} onMouseLeave={function () { setHoveredYear(null); }}
                style={{ width: SZ, height: SZ, borderRadius: 2, backgroundColor: yearColor(b.year), opacity: isHl ? 0.95 : 0.15, transition: "opacity 0.2s", cursor: "pointer" }} />;
            })}
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>Gray = pre-1970 debt. Colored = deficit-driven since 1970. Hover to see year.</div>
        </div>
        <div style={{ marginTop: 20, padding: "12px 16px", background: "#f9fafb", borderRadius: 8, border: "1px solid " + BORDER }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 6, position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
            Debt Reconciliation — FY{cur.year}
            <InfoTip text={"The bottom-line gross federal debt is split into debt held by the public and debt that is borrowed from the government itself. Public debt includes all of the outstanding deficits along with smaller items, like short term debt the treasury issues to cover cash needs.\n\nIntragovernmental debt is borrowed from the surplus budget of trust funds, like those that fund social security. While it still needs to be repaid, it\u2019s not directly marketable to the public and doesn\u2019t compete for investment with the private sector."} />
          </div>
          <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.8 }}>
            {[
              { label: "Pre-1970 inherited debt",                          val: fmtAmt(pre1970Debt),             color: MUTED },
              { label: "+ Cumulative deficits (1970–" + cur.year + ")",    val: fmtAmt(cur.cumDebt),             color: RED   },
              { label: "+ Trust fund borrowing",                           val: fmtAmt(debtBreakdown.heldByGovt), color: MUTED },
            ].map(function (row) {
              return (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: row.color }}>{row.label}</span><span style={{ color: TEXT }}>{row.val}</span>
                </div>
              );
            })}
            {Math.abs(otherAdjustments) > 1000 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>+ Other adjustments</span>
                <span style={{ color: TEXT }}>{otherAdjustments >= 0 ? "+" : "−"}{fmtAmt(otherAdjustments)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid " + BORDER, paddingTop: 4, marginTop: 4, fontWeight: 700, color: RED }}>
              <span>= Gross Federal Debt</span><span>{fmtAmt(actualDebtThisYear)}</span>
            </div>
          </div>
        </div>
      </Card>
      <p style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>Sources: <a href="https://www.whitehouse.gov/omb/information-resources/budget/historical-tables/" target="_blank" rel="noreferrer" style={{ color: BLUE }}>OMB Historical Tables, FY2026 Budget</a> (Table 1.1 — surplus/deficit; Table 7.1 — gross federal debt).</p>
    </div>
  );
}

/* ── I.c  Debt-to-GDP ─────────────────────── */
// TODO: time series of debt as % of GDP from founding to present.
// Data: federal_debt.csv has "Debt Held by Public (% GDP)" and "Gross Federal Debt (% GDP)" columns.
// Design: line/area chart with era annotations (Civil War, WWII, post-war paydown, modern rise).
// Block viz constants — debt scale is much larger than deficit so we use
// coarser blocks (0.5% each) but make each year 8 blocks wide and smaller blocks
var DEBT_BLOCK_PCT = 0.5;    // % of GDP per block
var DEBT_BLK_SZ   = 6;      // px per block face
var DEBT_BLK_GAP  = 1;      // px gap between blocks within a column
var DEBT_YR_WIDE  = 8;      // blocks wide per year
var DEBT_YR_GAP   = 4;      // px gap between years
var DEBT_CELL     = DEBT_BLK_SZ + DEBT_BLK_GAP;   // px per block row
var DEBT_YR_W     = DEBT_YR_WIDE * DEBT_CELL + DEBT_YR_GAP;  // px per year column

function DebtToGDPViz({ data }) {
  var _hov = useState(null); var hovYear = _hov[0]; var setHovYear = _hov[1];

  var maxBlocks = useMemo(function () {
    return Math.ceil(Math.max.apply(null, data.map(function (r) { return r.debt_pct_gdp; })) / DEBT_BLOCK_PCT);
  }, [data]);

  var maxRows = Math.ceil(maxBlocks / DEBT_YR_WIDE);
  var chartH  = maxRows * DEBT_CELL;
  var totalW  = data.length * DEBT_YR_W;

  // Reuse presidential era bands from page I.a
  var eraByYear = useMemo(function () {
    var map = {};
    ERAS.forEach(function (era) {
      data.forEach(function (r) {
        if (r.year >= era.start && r.year <= era.end) {
          map[r.year] = { label: era.label, party: era.party, color: era.color };
        }
      });
    });
    return map;
  }, [data]);

  var eraBands = useMemo(function () {
    var bands = []; var cur = null;
    data.forEach(function (r, i) {
      var e = eraByYear[r.year];
      if (!e) return;
      if (!cur || cur.label !== e.label || cur.party !== e.party) {
        if (cur) bands.push(cur);
        cur = { label: e.label, party: e.party, color: e.color, x: i * DEBT_YR_W, w: DEBT_YR_W, startYear: r.year };
      } else {
        cur.w += DEBT_YR_W;
      }
    });
    if (cur) bands.push(cur);
    return bands;
  }, [data, eraByYear]);

  var hovRow = hovYear != null ? data.find(function (r) { return r.year === hovYear; }) : null;
  var hovEra = hovYear != null ? eraByYear[hovYear] : null;

  return (
    <div>
      {/* Hover callout */}
      <div style={{ minHeight: 36, marginBottom: 8 }}>
        {hovRow ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>{hovRow.year}</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: RED }}>
              {hovRow.debt_pct_gdp.toFixed(1)}% of GDP
            </span>
            {hovEra && (
              <span style={{
                fontSize: 16, fontWeight: 600,
                color: hovEra.party === "D" ? "#1d4ed8" : "#b91c1c",
              }}>{hovEra.label}</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 13, color: MUTED }}>Hover any column for details</span>
        )}
      </div>

      {/* Chart with fixed Y axis */}
      <div style={{ display: "flex", alignItems: "flex-start" }}>

        {/* Y axis — fixed, does not scroll */}
        {(function () {
          var YAXIS_W = 40;
          var tickPcts = [];
          for (var t = 0; t <= Math.ceil((maxRows * DEBT_YR_WIDE * DEBT_BLOCK_PCT) / 25) * 25; t += 25) tickPcts.push(t);
          return (
            <div style={{ width: YAXIS_W, flexShrink: 0, position: "relative", height: XAXIS_H + chartH + 4 }}>
              {tickPcts.map(function (pct) {
                var blocks = Math.round(pct / DEBT_BLOCK_PCT);
                var rowNum = Math.floor(blocks / DEBT_YR_WIDE);
                var y = XAXIS_H + rowNum * DEBT_CELL;
                if (y > XAXIS_H + chartH) return null;
                return (
                  <div key={pct} style={{ position: "absolute", right: 4, top: y - 6, fontSize: 9, color: "#9ca3af", textAlign: "right", lineHeight: 1 }}>
                    {pct}%
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Scrollable chart */}
        <div style={{ overflowX: "auto", overflowY: "visible", flex: 1 }}>
        <div style={{ position: "relative", width: totalW, height: XAXIS_H + chartH + 4, flexShrink: 0 }}>

          {/* Grey gridlines at every 25% */}
          {(function () {
            var lines = [];
            for (var pct = 25; pct <= maxRows * DEBT_YR_WIDE * DEBT_BLOCK_PCT; pct += 25) {
              var blocks = Math.round(pct / DEBT_BLOCK_PCT);
              var rowNum = Math.floor(blocks / DEBT_YR_WIDE);
              var y = XAXIS_H + rowNum * DEBT_CELL;
              if (y <= XAXIS_H + chartH) lines.push({ y: y, key: "g" + pct });
            }
            return lines.map(function (l) {
              return <div key={l.key} style={{ position: "absolute", left: 0, top: l.y, width: totalW, height: 1, background: "#e5e7eb", zIndex: 0 }} />;
            });
          })()}

          {/* X-axis year labels */}
          {data.map(function (row, i) {
            if (row.year % 10 !== 0) return null;
            return (
              <div key={"tick-" + row.year} style={{
                position: "absolute",
                left: i * DEBT_YR_W, top: 0,
                width: DEBT_YR_W * 4, height: XAXIS_H,
                display: "flex", alignItems: "flex-end", paddingBottom: 4,
              }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: MUTED }}>{row.year}</span>
              </div>
            );
          })}

          {/* Era background bands */}
          {eraBands.map(function (band) {
            return (
              <div key={band.label + band.startYear} style={{
                position: "absolute",
                left: band.x, top: XAXIS_H,
                width: band.w, height: chartH,
                background: band.color,
                borderLeft: "1px solid " + BORDER + "44",
              }} />
            );
          })}

          {/* Year columns — grow downward from top */}
          {data.map(function (row, i) {
            var blocks  = Math.round(row.debt_pct_gdp / DEBT_BLOCK_PCT);
            var isHov   = hovYear === row.year;
            var x       = i * DEBT_YR_W;

            return (
              <div key={row.year}
                onMouseEnter={function () { setHovYear(row.year); }}
                onMouseLeave={function () { setHovYear(null); }}
                style={{
                  position: "absolute",
                  left: x, top: XAXIS_H,
                  width: DEBT_YR_WIDE * DEBT_CELL - 1,
                  height: chartH,
                  zIndex: 2, cursor: "default",
                }}>
                {Array.from({ length: blocks }).map(function (_, b) {
                  var col = b % DEBT_YR_WIDE;
                  var row = Math.floor(b / DEBT_YR_WIDE);
                  return (
                    <div key={b} style={{
                      position: "absolute",
                      left: col * DEBT_CELL,
                      top:  row * DEBT_CELL,
                      width: DEBT_BLK_SZ, height: DEBT_BLK_SZ,
                      borderRadius: 1,
                      backgroundColor: "#dc2626",
                      opacity: isHov ? 1 : 0.85,
                      transition: "opacity 0.1s",
                    }} />
                  );
                })}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap", alignItems: "center", fontSize: 11, color: MUTED }}>
        <span>Each block = 0.5% of GDP · Scroll to explore · Hover for details</span>
      </div>


    </div>
  );
}

function DebtToGDPPage({ debtPctData }) {
  var tour = useTour(3);
  return (
    <div>
      {tour.show && <Tour steps={tour.steps} onDone={tour.done} />}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>Debt Divided by National Income (in %)</h2>
        <TourBtn onOpen={tour.reopen} />
      </div>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 6px" }}>
        Federal debt held by the public has swung dramatically over the past 85 years. At the end of WWII it was 106% of national income, but it declined rapidly as the economy grew in the post-war years — down to just 22% by 1974. It went back to nearly 100% following the 2008 financial crisis and COVID-19 pandemic. At the end of 2025 that number was only slightly lower than the 2020 peak.
      </p>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 16px" }}>Each block = 0.5% of national income. Columns grow downward. Move the scroll bar to the right to explore further back in time.</p>
      <Card style={{ borderLeft: "4px solid " + RED, overflowX: "auto" }}>
        {debtPctData
         ? <DebtToGDPViz data={debtPctData} />
          : <div style={{ color: MUTED, fontSize: 14, padding: "40px 0", textAlign: "center" }}>Loading…</div>
        }
      </Card>
      <p style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>Source: <a href="https://fred.stlouisfed.org/series/FYPUGDA188S" target="_blank" rel="noreferrer" style={{ color: BLUE }}>FRED FYPUGDA188S</a> — Gross Federal Debt Held by the Public as % of GDP.</p>
    </div>
  );
}

/* ── I.d  Crisis Deficit Decomposition ────── */

// Block constants for this viz
var STAB_BLOCK_PCT  = 0.5;   // 0.5% GDP per block
var STAB_BLK_SZ     = 18;    // px — square block face
var STAB_BLK_GAP    = 2;     // px gap
var STAB_CELL       = STAB_BLK_SZ + STAB_BLK_GAP;
var STAB_COLS_WIDE  = 2;     // blocks wide per year column
var STAB_COL_W      = STAB_COLS_WIDE * STAB_CELL - STAB_BLK_GAP;
var STAB_COL_GAP    = 14;    // px gap between year columns

// Colors
var C_STRUCTURAL   = "#374151";    // structural deficit (policy + demographics) — dark grey
var C_STABILIZER   = "#c8860a";    // automatic stabilizer component
var C_STIMULUS     = "#1e40af";    // discretionary stimulus (ARRA / CARES)

function AutoStabPanel({ data, stimulusByYear, yearStart, yearEnd, maxRows, label }) {
  var _hov = useState(null); var hovYear = _hov[0]; var setHovYear = _hov[1];

  var filtered = useMemo(function () {
    return data.filter(function (r) { return r.year >= yearStart && r.year <= yearEnd; });
  }, [data, yearStart, yearEnd]);

  var chartH = maxRows * STAB_CELL;
  var totalW = filtered.length * (STAB_COL_W + STAB_COL_GAP);
  var hovRow = hovYear != null ? filtered.find(function (r) { return r.year === hovYear; }) : null;
  var hovStim = hovYear != null ? (stimulusByYear[hovYear] || 0) : 0;

  return (
    <div style={{ flex: "1 1 300px", minWidth: 260 }}>
      {/* Panel label */}
      <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{label}</div>

      {/* Hover callout */}
      <div style={{ minHeight: 48, marginBottom: 8 }}>
        {hovRow ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: TEXT }}>{hovRow.year}</span>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: C_STRUCTURAL }}>
                Structural: {Math.abs(hovRow.deficit_pct_without_stabilizers).toFixed(1)}% of GDP
              </span>
              {hovStim > 0 && (
                <span style={{ fontSize: 12, color: C_STIMULUS }}>
                  Stimulus: {hovStim.toFixed(1)}% of GDP
                </span>
              )}
              <span style={{ fontSize: 12, color: C_STABILIZER }}>
                Auto stabilizers: {Math.abs(hovRow.stabilizer_effect_pct).toFixed(2)}% of GDP
              </span>
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: MUTED }}>Hover any column for detail</span>
        )}
      </div>

      {/* Chart */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ position: "relative", width: totalW, height: XAXIS_H + chartH + 4, flexShrink: 0 }}>

          {/* X-axis year labels */}
          {filtered.map(function (row, i) {
            return (
              <div key={"tick-" + row.year} style={{
                position: "absolute",
                left: i * (STAB_COL_W + STAB_COL_GAP),
                top: 0, width: STAB_COL_W, height: XAXIS_H,
                display: "flex", alignItems: "flex-end",
                justifyContent: "center", paddingBottom: 4,
              }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: MUTED }}>{row.year}</span>
              </div>
            );
          })}

          {/* Zero line */}
          <div style={{
            position: "absolute", left: 0, top: XAXIS_H,
            width: totalW, height: 2, background: BORDER, zIndex: 1,
          }} />

          {/* Year columns */}
          {filtered.map(function (row, i) {
            var totalPct   = Math.abs(row.deficit_pct_with_stabilizers);
            var structPct  = Math.abs(row.deficit_pct_without_stabilizers);
            var gdp        = row.gdp_billions || 1;
            var stimPct    = stimulusByYear[row.year] || 0;

            var totalBlocks  = Math.round(totalPct  / STAB_BLOCK_PCT);
            var structBlocks = Math.round(structPct / STAB_BLOCK_PCT);
            var stimBlocks   = Math.min(Math.round(stimPct / STAB_BLOCK_PCT), structBlocks);

            var paddedTotal  = Math.ceil(totalBlocks / STAB_COLS_WIDE) * STAB_COLS_WIDE;

            var isHov = hovYear === row.year;
            var x     = i * (STAB_COL_W + STAB_COL_GAP);

            var blockList = [];
            for (var b = 0; b < paddedTotal; b++) {
              var bRow = Math.floor(b / STAB_COLS_WIDE);
              var bCol = b % STAB_COLS_WIDE;
              if (b >= totalBlocks) { blockList.push({ bRow: bRow, bCol: bCol, color: null }); continue; }
              var color;
              if (b < (structBlocks - stimBlocks))  color = C_STRUCTURAL;
              else if (b < structBlocks)             color = C_STIMULUS;
              else                                   color = C_STABILIZER;
              blockList.push({ bRow: bRow, bCol: bCol, color: color });
            }

            return (
              <div key={row.year}
                onMouseEnter={function () { setHovYear(row.year); }}
                onMouseLeave={function () { setHovYear(null); }}
                style={{ position: "absolute", left: x, top: XAXIS_H, width: STAB_COL_W, height: chartH, zIndex: 2, cursor: "default" }}>
                {blockList.map(function (bl, idx) {
                  if (!bl.color) return null;
                  return (
                    <div key={idx} style={{
                      position: "absolute",
                      left: bl.bCol * STAB_CELL,
                      top:  bl.bRow * STAB_CELL,
                      width: STAB_BLK_SZ, height: STAB_BLK_SZ,
                      borderRadius: 2,
                      backgroundColor: bl.color,
                      opacity: isHov ? 1 : 0.82,
                      transition: "opacity 0.1s",
                    }} />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AutoStabViz({ data, stimulusData }) {
  // Calculate shared maxRows across both panels so heights match
  var maxAbs = useMemo(function () {
    var rows = data.filter(function (r) {
      return (r.year >= 2008 && r.year <= 2014) || (r.year >= 2018 && r.year <= 2022);
    });
    return Math.max.apply(null, rows.map(function (r) { return Math.abs(r.deficit_pct_with_stabilizers); }));
  }, [data]);
  var maxBlocks = Math.ceil(maxAbs / STAB_BLOCK_PCT);
  var maxRows   = Math.ceil(maxBlocks / STAB_COLS_WIDE);

  // Build {year: pct_gdp} lookup for stimulus — sum all categories per year
  var stimulusByYear = useMemo(function () {
    if (!stimulusData) return {};
    var out = {};
    stimulusData.filter(function (r) { return r.category === 'Total Direct Cost'; })
      .forEach(function (r) {
        out[r.fiscal_year] = (out[r.fiscal_year] || 0) + (r.pct_gdp || 0);
      });
    return out;
  }, [stimulusData]);

  return (
    <div>
      {/* Two panels side by side */}
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
        <AutoStabPanel data={data} stimulusByYear={stimulusByYear} yearStart={2008} yearEnd={2014} maxRows={maxRows} label="2008–2014: Financial Crisis + Obama" />
        <AutoStabPanel data={data} stimulusByYear={stimulusByYear} yearStart={2018} yearEnd={2022} maxRows={maxRows} label="2018–2022: COVID + Trump/Biden" />
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { color: C_STIMULUS,   label: "Stimulus legislation (ARRA / CARES Act)" },
          { color: C_STRUCTURAL, label: "Structural deficit (policy + demographics)" },
          { color: C_STABILIZER, label: "Automatic stabilizers (recession-driven)" },
        ].map(function (l) {
          return (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: MUTED }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: l.color, flexShrink: 0 }} />
              {l.label}
            </div>
          );
        })}
        <span style={{ fontSize: 11, color: MUTED }}>· Each block = 0.5% of GDP</span>
      </div>
    </div>
  );
}

function ObamaEraPage({ stabilizersData, stimulusData }) {
  var tour = useTour(4);
  return (
    <div>
      {tour.show && <Tour steps={tour.steps} onDone={tour.done} />}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>Recession vs. Policy: Crisis Deficits</h2>
        <TourBtn onOpen={tour.reopen} />
      </div>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 10px" }}>
        When a recession hits, the federal government runs larger deficits. Some of this is through new laws, like the CARES Act during COVID or the American Recovery and Reinvestment Act (ARRA) after the 2008 Financial Crisis. These try to stimulate the economy by borrowing money and spending it in sectors affected by the recession. That is the main reason the deficit jumps at the start of these crises.
      </p>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 16px" }}>
        The rest of the deficit comes from changes that took place through existing laws. Automatic stabilizers, shown in amber, are programs like unemployment insurance and food assistance that automatically pay out more when more people need them. As more people lost their jobs, they paid less in taxes — decreasing government revenue — and became eligible for government programs like food stamps, increasing government spending.
      </p>
      <Card style={{ borderLeft: "4px solid " + RED }}>
        {stabilizersData
          ? <AutoStabViz data={stabilizersData} stimulusData={stimulusData} />
          : <div style={{ color: MUTED, fontSize: 14, padding: "40px 0", textAlign: "center" }}>Loading…</div>
        }
      </Card>
      <p style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>
        Sources: <a href="https://www.cbo.gov/publication/60662" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO, Effects of Automatic Stabilizers on the Federal Budget: 2024 to 2034 (pub. 60662)</a>;{" "}
        <a href="https://www.cbo.gov/publication/41762" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO, Estimated Impact of the American Recovery and Reinvestment Act on Employment and Economic Output (pub. 41762)</a>;{" "}
        <a href="https://www.cbo.gov/publication/56334" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO, Estimated Budgetary Effects of the CARES Act (pub. 56334)</a>.
      </p>
    </div>
  );
}


/* ── II.a  Revenue vs. Spending ──────────── */
// Ported from App.jsx RevSpendPage.
// Added: per-capita punchline ("That's more than $4,700 for every man, woman and child").
// Population source: US Census pop clock as of 3/25/2025 ≈ 336.1M
var US_POPULATION_M = 336.1;   // millions, Census pop clock March 2025

function RevSpendPage({ spendingData, receiptsData, summaryData }) {
  var _hov = useState(null); var hoveredCat = _hov[0]; var setHoveredCat = _hov[1];
  var tour = useTour(6);

  var computed = useMemo(function () {
    if (!spendingData || !receiptsData || !summaryData)
      return { revSources: [], spendSources: [], totalRev: 0, totalSpend: 0 };

    var revRows = receiptsData.filter(function (r) { return r.year === YEAR && !String(r.category).includes("Real"); });
    var revSrc  = revRows.map(function (r) { return { label: r.category, amount: r.amount, color: REV_COLORS[r.category] || "#93c5fd" }; }).sort(function (a, b) { return b.amount - a.amount; });

    var spendRows = spendingData.filter(function (r) { return r.year === YEAR && !String(r.category).includes("Real"); });
    var named = []; var otherTotal = 0;

    var MANDATORY_CATS = ["Social Security", "Medicare", "Health", "Income Security", "Net interest"];
    var DISCRETIONARY_CATS = ["National Defense", "Veterans Benefits and Services", "Education, Training, Employment, and Social Services"];

    spendRows.sort(function (a, b) { return b.amount - a.amount; }).forEach(function (r) {
      if (!SPEND_COLORS[r.category]) { otherTotal += r.amount; return; }
      var group = MANDATORY_CATS.includes(r.category) ? "Mandatory"
                : DISCRETIONARY_CATS.includes(r.category) ? "Discretionary"
                : "Discretionary";
      named.push({ label: SPEND_SHORT[r.category] || r.category, amount: r.amount, color: SPEND_COLORS[r.category], group: group });
    });
    named.push({ label: "All Other", amount: otherTotal, color: SPEND_OTHER_COLOR, group: "Discretionary" });

    // Sort: Mandatory first then Discretionary, descending by amount within each group
    // Pin Social Security → Medicare at top of Mandatory regardless of amount
    var MAND_PIN = ["Social Security", "Medicare"];
    named.sort(function (a, b) {
      if (a.group !== b.group) return a.group === "Mandatory" ? -1 : 1;
      if (a.group === "Mandatory") {
        var ai = MAND_PIN.indexOf(a.label), bi = MAND_PIN.indexOf(b.label);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
      }
      return b.amount - a.amount;
    });

    var sumRow = summaryData.filter(function (r) { return r.year === YEAR && !String(r.category).includes("Real"); });
    var find   = function (cat) { var f = sumRow.find(function (r) { return r.category === cat; }); return f ? f.amount : 0; };
    return {
      revSources:   revSrc,
      spendSources: named,
      totalRev:    find("Total Receipts"),
      totalSpend:  find("Total Outlays"),
    };
  }, [spendingData, receiptsData, summaryData]);

  var revBlocks   = useMemo(function () { return buildBlocks(computed.revSources);   }, [computed.revSources]);
  var spendBlocks = useMemo(function () { return buildBlocks(computed.spendSources); }, [computed.spendSources]);

  var gapPerCapita = useMemo(function () {
    if (!computed.totalRev || !computed.totalSpend) return 0;
    // gap is in millions; convert to dollars per person
    var gapMillions = computed.totalSpend - computed.totalRev;
    return Math.round((gapMillions * 1e6) / (US_POPULATION_M * 1e6));
  }, [computed.totalRev, computed.totalSpend]);

  return (
    <div>
      {tour.show && <Tour steps={tour.steps} onDone={tour.done} />}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>Revenue vs. Spending — FY{YEAR}</h2>
        <TourBtn onOpen={tour.reopen} />
      </div>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 6px" }}>
        In Fiscal Year 2024, the federal government spent more than it collected in revenue — a gap of over $1.8 trillion.
        That's more than <strong style={{ color: RED }}>${gapPerCapita.toLocaleString()}</strong> for every man, woman, and child in the United States.
      </p>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 20px" }}>Each block = $10B. Hover to highlight a category.</p>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Card style={{ flex: "1 1 400px", minWidth: 340 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: BLUE, margin: 0 }}>Revenue</h3>
            <span style={{ fontSize: 22, fontWeight: 800, color: BLUE }}>${(computed.totalRev / 1e6).toFixed(2)}T</span>
          </div>
          <BlockGrid blocks={revBlocks} hoveredCat={hoveredCat} setHoveredCat={setHoveredCat} />
          <Legend sources={computed.revSources} hoveredCat={hoveredCat} setHoveredCat={setHoveredCat} />
        </Card>
        <Card style={{ flex: "1 1 400px", minWidth: 340 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: GOLD, margin: 0 }}>Spending</h3>
            <span style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>${(computed.totalSpend / 1e6).toFixed(2)}T</span>
          </div>
          <BlockGrid blocks={spendBlocks} hoveredCat={hoveredCat} setHoveredCat={setHoveredCat} />
          <Legend sources={computed.spendSources} hoveredCat={hoveredCat} setHoveredCat={setHoveredCat} />
        </Card>
      </div>
      <p style={{ fontSize: 12, color: MUTED, marginTop: 16 }}>Source: <a href="https://www.whitehouse.gov/omb/information-resources/budget/historical-tables/" target="_blank" rel="noreferrer" style={{ color: BLUE }}>OMB Historical Tables, FY2026 Budget</a>.</p>
    </div>
  );
}

/* ── II.b  The Deficit ────────────────────── */
// Ported from App.jsx DeficitPage, unchanged.
function DeficitPage({ summaryData }) {
  var deficit = useMemo(function () {
    if (!summaryData) return 0;
    var row = summaryData.find(function (r) { return r.year === YEAR && r.category === "Surplus or Deficit"; });
    return row ? row.amount : 0;
  }, [summaryData]);

  var deficitBlockCount = Math.round(Math.abs(deficit) / BLOCK_SIZE);

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: "0 0 6px" }}>The Deficit — FY{YEAR}</h2>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 6px" }}>
        In FY2024, the U.S. government ran a budget deficit of $1.83 trillion (that's roughly $5B a day!). Each year that the government runs on a deficit, it adds to our national debt.
      </p>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 20px" }}>Each block = $10B of borrowed money.</p>
      <Card style={{ borderLeft: "4px solid " + RED }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: RED, margin: 0 }}>The Deficit</h3>
          <span style={{ fontSize: 26, fontWeight: 800, color: RED }}>${(Math.abs(deficit) / 1e6).toFixed(2)}T</span>
        </div>
        <p style={{ fontSize: 14, color: TEXT, lineHeight: 1.6, margin: "0 0 16px" }}>
          Spending exceeded revenue by <strong style={{ color: RED }}>${(Math.abs(deficit) / 1e6).toFixed(2)} trillion</strong> — that's <strong style={{ color: RED }}>${((deficitBlockCount * BLOCK_SIZE) / 1e3 / 365).toFixed(1)}B per day</strong> added to the national debt.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(" + COLS + ", " + SZ + "px)", gap: GAP + "px" }}>
          {Array.from({ length: deficitBlockCount }).map(function (_, i) {
            return <div key={i} style={{ width: SZ, height: SZ, borderRadius: 2, backgroundColor: BLOCK_NEG, opacity: 0.9 }} />;
          })}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>Each block = $10B of borrowed money</div>
      </Card>
      <p style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>Source: <a href="https://www.whitehouse.gov/omb/information-resources/budget/historical-tables/" target="_blank" rel="noreferrer" style={{ color: BLUE }}>OMB Historical Tables, FY2026 Budget</a> (Table 1.1 — summary of receipts, outlays, and surpluses or deficits).</p>
    </div>
  );
}
/* ── Projection bar helpers ── */
function ProjBar({ nBaseline, nObbba, nNoTariff, maxRows }) {
  var total      = nBaseline + nObbba + nNoTariff;
  var myRows     = Math.ceil(Math.max(total, 1) / PROJ_COL_W);
  var padRows    = Math.max(0, maxRows - myRows);
  var totalCells = maxRows * PROJ_COL_W;
  var emptyCells = padRows * PROJ_COL_W;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(" + PROJ_COL_W + ", " + PROJ_SZ + "px)", gap: PROJ_GAP + "px", width: PROJ_COL_W * (PROJ_SZ + PROJ_GAP) - PROJ_GAP, alignSelf: "flex-end" }}>
      {Array.from({ length: totalCells }).map(function (_, i) {
        if (i < emptyCells) return <div key={i} style={{ width: PROJ_SZ, height: PROJ_SZ }} />;
        var filled = i - emptyCells;
        var color;
        if      (filled < nNoTariff)              color = C_NOTARIFF;
        else if (filled < nNoTariff + nObbba)     color = C_OBBBA;
        else                                      color = C_JAN;
        return <div key={i} style={{ width: PROJ_SZ, height: PROJ_SZ, borderRadius: 1, backgroundColor: color }} />;
      })}
    </div>
  );
}

function ProjectionPanel({ years, baselineSeries, obbbaWithTariffSeries, obbbaNoTariffSeries, gdpByYear, mode }) {
  var _hov = useState(null); var hoveredYear = _hov[0]; var setHoveredYear = _hov[1];
  var base    = baselineSeries        || {};
  var withTar = obbbaWithTariffSeries || {};
  var noTar   = obbbaNoTariffSeries   || {};

  var NOMINAL_BLOCK_B = 10;

  function toBlocks(val, yr) {
    if (mode === "pct") {
      return Math.round((val / (gdpByYear[yr] || 1)) * 100 / PROJ_BLOCK_PCT);
    }
    return Math.round(val / NOMINAL_BLOCK_B);
  }

  function fmtTooltip(val, yr) {
    if (val == null) return "—";
    var dolStr = "$" + (val / 1000).toFixed(2) + "T";
    if (mode === "pct") {
      var pct = (val / (gdpByYear[yr] || 1) * 100).toFixed(1);
      return dolStr + " (" + pct + "% GDP)";
    }
    return dolStr;
  }

  function fmtSum(val) { return val ? "$" + (val / 1000).toFixed(2) + "T" : "—"; }

  // Average % of GDP across the projection window: sum(deficit) / sum(GDP) × 100
  var tenYrGdp = years.reduce(function (a, yr) { return a + (gdpByYear[yr] || 0); }, 0);
  function fmtSumPct(val) {
    if (!val || !tenYrGdp) return "";
    return (val / tenYrGdp * 100).toFixed(1) + "% avg GDP";
  }

  var maxRows = useMemo(function () {
    var m = 1;
    years.forEach(function (yr) {
      var n = (mode === "pct")
        ? Math.round((( noTar[yr] || 0) / (gdpByYear[yr] || 1)) * 100 / PROJ_BLOCK_PCT)
        : Math.round((noTar[yr] || 0) / NOMINAL_BLOCK_B);
      var rows = Math.ceil(Math.max(n, 1) / PROJ_COL_W);
      if (rows > m) m = rows;
    });
    return m;
  }, [years, noTar, mode, gdpByYear]);

  var colPx  = PROJ_COL_W * (PROJ_SZ + PROJ_GAP) - PROJ_GAP;
  var tenYr  = function (s) { return years.reduce(function (a, yr) { return a + ((s || {})[yr] || 0); }, 0); };

  var legendItems = [
    { color: C_JAN,      label: "Pre-OBBBA baseline" },
    { color: C_OBBBA,    label: "OBBBA w/ tariffs" },
    { color: C_NOTARIFF, label: "OBBBA with no new tariff revenue" },
  ];

  var summaryItems = [
    { color: C_JAN,      label: "Pre-OBBBA Total 2025-2034",   val: tenYr(base),    bg: "#f3f4f6" },
    { color: C_OBBBA,    label: "With tariffs Total 2025-2034", val: tenYr(withTar), bg: "#fdf6e3" },
    { color: C_NOTARIFF, label: "No tariffs Total 2025-2034",   val: tenYr(noTar),   bg: "#fef2f2" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
        {legendItems.map(function (l) {
          return (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: MUTED }}>
              <div style={{ width: PROJ_SZ + 2, height: PROJ_SZ + 2, borderRadius: 1, backgroundColor: l.color }} />{l.label}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, paddingTop: 80, overflow: "visible" }}>
        {years.map(function (yr) {
          var baseline   = base[yr]    || 0;
          var withTariff = withTar[yr] || 0;
          var noTariff   = noTar[yr]   || 0;
          var nBaseline  = toBlocks(baseline, yr);
          var nObbba     = Math.max(toBlocks(withTariff, yr) - nBaseline, 0);
          var nNoTariff  = Math.max(toBlocks(noTariff, yr) - nBaseline - nObbba, 0);
          var isHov      = hoveredYear === yr;
          return (
            <div key={yr}
              onMouseEnter={function () { setHoveredYear(yr); }}
              onMouseLeave={function () { setHoveredYear(null); }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "default", position: "relative", overflow: "visible" }}>
              {isHov && (
                <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 6, zIndex: 10, whiteSpace: "nowrap", fontSize: 11, textAlign: "center", lineHeight: 1.6, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 5, padding: "5px 9px", boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{yr}</div>
                  <div style={{ color: C_JAN }}>Baseline: {fmtTooltip(baseline, yr)}</div>
                  <div style={{ color: C_OBBBA }}>w/ tariffs: {fmtTooltip(withTariff, yr)}</div>
                  <div style={{ color: C_NOTARIFF }}>No tariffs: {fmtTooltip(noTariff, yr)}</div>
                </div>
              )}
              <ProjBar nBaseline={nBaseline} nObbba={nObbba} nNoTariff={nNoTariff} maxRows={maxRows} />
              <div style={{ fontSize: 11, color: MUTED, marginTop: 5, textAlign: "center", width: colPx }}>{yr}</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {summaryItems.map(function (s) {
          var dol = fmtSum(s.val);
          var pct = fmtSumPct(s.val);
          var primary   = mode === "pct" ? pct : dol;
          var secondary = mode === "pct" ? dol : pct;
          return (
            <div key={s.label} style={{ flex: 1, minWidth: 120, background: s.bg, borderRadius: 6, padding: "8px 12px" }}>
              <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>
                {primary}
                {secondary && <span style={{ fontSize: 12, fontWeight: 500, color: MUTED, marginLeft: 6 }}>({secondary})</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OBBBAPage({ deficitProj, niProj, projSummary }) {
  var tour = useTour(7);

  var deficitSeries = useMemo(function () {
    if (!deficitProj) return {};
    var out = {};
    deficitProj.forEach(function (r) { if (!out[r.scenario]) out[r.scenario] = {}; out[r.scenario][r.year] = r.deficit_billions; });
    return out;
  }, [deficitProj]);

  // GDP by year from projections_summary.csv (billions) — category "GDP", CBO Feb 2026
  var gdpByYear = useMemo(function () {
    if (!projSummary) return {};
    var out = {};
    projSummary.forEach(function (r) {
      if (String(r.category).trim() === "GDP") {
        var val = Number(r.amount_billions || r.value || r.amount || 0);
        if (val > 0) out[Number(r.year)] = val;
      }
    });
    return out;
  }, [projSummary]);

  var years   = [2026,2027,2028,2029,2030,2031,2032,2033,2034];
  var janDef  = deficitSeries["jan_2025_baseline"]     || {};
  var febDef  = deficitSeries["feb_2026_current_law"]  || {};
  var noTarDef = deficitSeries["no_tariff_revenue"]    || {};

  var _mode = useState("pct"); var mode = _mode[0]; var setMode = _mode[1];
  var _scrubYear = useState(2026); var scrubYear = _scrubYear[0]; var setScrubYear = _scrubYear[1];
  var _pileScenario = useState("feb_2026_current_law"); var pileScenario = _pileScenario[0]; var setPileScenario = _pileScenario[1];

  // Debt pile constants
  var PILE_YEARS       = [2025,2026,2027,2028,2029,2030,2031,2032,2033,2034];
  var ANCHOR_DEBT_B    = 28196;   // CBO Feb 2026 — debt held by public at beginning of FY2025 ($B)
  var PILE_BLOCK_B     = 10;
  var PILE_COLS        = 120;
  var PILE_SZ          = 5;
  var PILE_GAP         = 1;
  var PILE_CELL        = PILE_SZ + PILE_GAP;
  var PILE_YEAR_COLORS = ["#fecaca","#fca5a5","#f87171","#ef4444","#dc2626","#b91c1c",
                          "#991b1b","#7f1d1d","#ef4444","#dc2626","#b91c1c"];

  var pileActiveSeries = useMemo(function () {
    var base = deficitSeries[pileScenario] || {};
    if (!base[2025] && febDef[2025]) return Object.assign({}, base, { 2025: febDef[2025] });
    return base;
  }, [deficitSeries, pileScenario]);

  var cumulativeByYear = useMemo(function () {
    var cum = ANCHOR_DEBT_B; var out = {};
    PILE_YEARS.forEach(function (y) { cum += (pileActiveSeries[y] || 0); out[y] = cum; });
    return out;
  }, [pileActiveSeries]);

  return (
    <div>
      {tour.show && <Tour steps={tour.steps} onDone={tour.done} />}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>The One Big Beautiful Bill Act</h2>
        <TourBtn onOpen={tour.reopen} />
      </div>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 6px" }}>
        The One Big Beautiful Bill Act (OBBBA) was passed in July 2025 as President Trump's flagship budget bill. It adds trillions to our debt over the next ten years. The combination of extending tax cuts and massive increases in defense and border spending make it the most costly budget bill in history. The OBBBA locks in a federal deficit through 2034. Here you can see how the OBBBA affects future deficits and the debt over time with and without an increase in tariff revenue from President Trump's promised tariffs.
      </p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 20px", flexWrap: "wrap", gap: 12 }}>
        <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
          CBO's current law baseline includes ~$3.45T in new tariff revenue offsetting OBBBA's gross $4.7T cost. Hover a column for detail.
        </p>
        <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 8, padding: 3, gap: 2, flexShrink: 0 }}>
          {[["pct", "% of GDP"], ["nominal", "Nominal $"]].map(function (opt) {
            var active = mode === opt[0];
            return (
              <button key={opt[0]} onClick={function () { setMode(opt[0]); }} style={{
                fontSize: 12, fontWeight: active ? 600 : 400,
                padding: "5px 14px", borderRadius: 6, border: "none",
                background: active ? "#fff" : "transparent",
                color: active ? TEXT : MUTED,
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.10)" : "none",
                cursor: "pointer", transition: "all 0.15s",
              }}>{opt[1]}</button>
            );
          })}
        </div>
      </div>
      <Card id="obbba-deficit-card" style={{ borderLeft: "4px solid " + AMBER, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: TEXT, margin: "0 0 16px" }}>Annual Deficits</h3>
        <ProjectionPanel years={years} baselineSeries={janDef} obbbaWithTariffSeries={febDef} obbbaNoTariffSeries={noTarDef} gdpByYear={gdpByYear} mode={mode} />
      </Card>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 16px" }}>
        These deficits accumulate into a growing pile of public debt. Drag the slider to see how the debt grows year by year through 2034.
      </p>
      {(function () {
        var gdpY  = gdpByYear[scrubYear] || 0;
        var defB  = pileActiveSeries[scrubYear] || 0;
        var cumB  = cumulativeByYear[scrubYear] || 0;
        var addedB = cumB - ANCHOR_DEBT_B;
        var dolStr = function (b, d) { return "$" + (b / 1000).toFixed(d) + "T"; };
        var pctStr = function (b) { return gdpY ? (b / gdpY * 100).toFixed(1) + "% GDP" : ""; };
        var cell = function (label, b, d, bg) {
          var primary   = mode === "pct" ? pctStr(b) : dolStr(b, d);
          var secondary = mode === "pct" ? dolStr(b, d) : pctStr(b);
          return (
            <div style={{ background: bg, borderRadius: 8, padding: "10px 16px", flex: "1 1 140px" }}>
              <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: RED }}>
                {primary || dolStr(b, d)}
                {gdpY > 0 && <span style={{ fontSize: 12, fontWeight: 500, color: MUTED, marginLeft: 6 }}>({secondary})</span>}
              </div>
            </div>
          );
        };
        return (
          <div style={{ display: "flex", gap: 24, marginBottom: 12, flexWrap: "wrap" }}>
            {cell("Annual deficit",   defB,  2, "#fef2f2")}
            {cell("Cumulative debt",  cumB,  1, "#fef2f2")}
            {cell("Added since 2024", addedB, 1, "#f9fafb")}
          </div>
        );
      })()}
      <div style={{ margin: "0 0 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>Slide to change year:</span>
        <input type="range" min={0} max={PILE_YEARS.length - 1}
          value={PILE_YEARS.indexOf(scrubYear) === -1 ? PILE_YEARS.length - 1 : PILE_YEARS.indexOf(scrubYear)}
          onChange={function (e) { setScrubYear(PILE_YEARS[Number(e.target.value)]); }}
          style={{ flex: 1, accentColor: RED }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, minWidth: 36 }}>{scrubYear}</span>
      </div>
      <Card style={{ borderLeft: "4px solid #4a0000" }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: TEXT, margin: "0 0 14px" }}>Cumulative Debt Held by Public</h3>
        <p style={{ fontSize: 12, color: MUTED, margin: "0 0 10px" }}>Each block = $10B. Gray = existing debt (~$28.2T end of 2024). Colors match deficit years above.</p>
        <div style={{ width: PILE_COLS * PILE_CELL }}>
          {(function () {
            var segments = [{ year: "anchor", count: Math.round(ANCHOR_DEBT_B / PILE_BLOCK_B), color: "#9ca3af" }];
            PILE_YEARS.forEach(function (y, idx) {
              if (y > scrubYear) return;
              segments.push({ year: y, count: Math.round((pileActiveSeries[y] || 0) / PILE_BLOCK_B), color: PILE_YEAR_COLORS[idx] || RED });
            });
            return segments.map(function (seg) {
              if (seg.count === 0) return null;
              var paddedCount = Math.ceil(seg.count / PILE_COLS) * PILE_COLS;
              var rows = paddedCount / PILE_COLS;
              var isScrub = scrubYear === seg.year;
              var opacity = seg.year === "anchor" ? 0.7 : isScrub ? 1 : 0.8;
              return (
                <div key={seg.year} style={{
                  width: PILE_COLS * PILE_CELL,
                  height: rows * PILE_CELL,
                  backgroundImage: "repeating-linear-gradient(to bottom, transparent 0px, transparent " + PILE_SZ + "px, rgba(255,255,255,0.3) " + PILE_SZ + "px, rgba(255,255,255,0.3) " + PILE_CELL + "px), repeating-linear-gradient(to right, " + seg.color + " 0px, " + seg.color + " " + PILE_SZ + "px, rgba(255,255,255,0.3) " + PILE_SZ + "px, rgba(255,255,255,0.3) " + PILE_CELL + "px)",
                  opacity: opacity,
                  outline: isScrub && seg.year !== "anchor" ? "2px solid " + seg.color : "none",
                  outlineOffset: -1,
                }} />
              );
            });
          })()}
        </div>
        {(function () {
          var cum2034 = cumulativeByYear[2034] || 0;
          var gdp2034 = gdpByYear[2034] || 0;
          var dol = "$" + (cum2034 / 1000).toFixed(1) + "T";
          var pct = gdp2034 ? (cum2034 / gdp2034 * 100).toFixed(1) + "% GDP" : "";
          var primary   = mode === "pct" ? pct : dol;
          var secondary = mode === "pct" ? dol : pct;
          return (
            <div style={{ marginTop: 12, fontSize: 13, color: MUTED }}>
              Total projected debt by 2034: <strong style={{ color: RED }}>{primary || dol}</strong>
              {secondary && <span style={{ marginLeft: 6 }}>({secondary})</span>}
            </div>
          );
        })()}
      </Card>
      <p style={{ fontSize: 12, color: MUTED, marginTop: 16 }}>Sources: <a href="https://www.cbo.gov/publication/62105" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO February 2026 Budget Projections (pub. 62105)</a>; <a href="https://www.cbo.gov/publication/61570" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO OBBBA cost estimate (pub. 61570)</a>.</p>
    </div>
  );
}

/* ── III.a  Consoles / Debt Misconception ─── */
function ConsolesPage() {
  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: "0 0 16px" }}>Does Government Debt Have to Be Repaid?</h2>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 16px" }}>
        A common misunderstanding is that someday governments will have to pay back the debt. Because creditors have to believe that people will be able to pay off their debts during their lifetimes, people can't run up unlimited debts. But governments don't have an expected lifetime so their ability to borrow isn't limited in the same way.
      </p>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 16px" }}>
        In fact many governments have issued debt that they never have to pay back — called <em>consoles</em> — and people bought them. Consoles pay interest, but the loan itself never has to be repaid. In fact, one such bond issued by the Dutch government in the 1600s was still paying interest a few years ago.
      </p>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 16px" }}>
        The U.S. government doesn't issue consoles today, but it has had virtually no trouble paying off old bonds and then issuing new ones despite the growing debt. That may change in the future if the debt gets too big. But, as long as that doesn't happen, future generations will not have to pay the debt back.
      </p>
    </div>
  );
}

/* ── III.a  Crowding Out ─────────────────── */
function CrowdingOutPage({ spendingData, summaryData, niProj, projSummary }) {
  var tour = useTour(10);
  var _hov = useState(null); var hovYear = _hov[0]; var setHovYear = _hov[1];
  var _hovProj = useState(null); var hovProjYear = _hovProj[0]; var setHovProjYear = _hovProj[1];

  var series = useMemo(function () {
    if (!spendingData || !summaryData) return [];
    var receipts = {};
    summaryData.filter(function (r) {
      return r.category === "Total Receipts" && !String(r.category).includes("Real");
    }).forEach(function (r) { receipts[r.year] = r.amount; });

    var interest = {};
    spendingData.filter(function (r) {
      return r.category === "Net interest" && r.year >= 1970 && r.year <= 2024;
    }).forEach(function (r) { interest[r.year] = r.amount; });

    var result = [];
    for (var y = 1970; y <= 2024; y++) {
      var ni = interest[y]; var rec = receipts[y];
      if (ni != null && rec != null && rec > 0) {
        result.push({ year: y, pct: (ni / rec) * 100, ni: ni, receipts: rec });
      }
    }
    return result;
  }, [spendingData, summaryData]);

  // CBO Feb 2026 baseline projections — net interest and total revenue (billions)
  var projSeries = useMemo(function () {
    if (!niProj || !projSummary) return [];
    var revenue = {};
    projSummary.filter(function (r) {
      return String(r.category).trim() === "Total Revenues";
    }).forEach(function (r) { revenue[Number(r.year)] = Number(r.amount_billions); });

    var interest = {};
    niProj.filter(function (r) {
      return r.scenario === "feb_2026_current_law";
    }).forEach(function (r) { interest[Number(r.year)] = Number(r.net_interest_billions); });

    var result = [];
    for (var y = 2025; y <= 2036; y++) {
      var ni = interest[y]; var rec = revenue[y];
      if (ni != null && rec != null && rec > 0) {
        // Convert billions → millions to match historical units in the callout
        result.push({ year: y, pct: (ni / rec) * 100, ni: ni * 1000, receipts: rec * 1000 });
      }
    }
    return result;
  }, [niProj, projSummary]);

  var hovProjRow = hovProjYear != null ? projSeries.find(function (r) { return r.year === hovProjYear; }) : null;
  var projLast   = projSeries.length ? projSeries[projSeries.length - 1] : null;
  var projDisplay = hovProjRow || projLast;

  var latest  = series.length ? series[series.length - 1] : null;
  var hovRow  = hovYear != null ? series.find(function (r) { return r.year === hovYear; }) : null;
  var display = hovRow || latest;

  // 67 columns total (1970–2024 + 2025–2036). Card inner width ≈ 988px →
  // 67 × 13 blocks + 66 × 1 gap = 937px → fills the Card almost edge-to-edge.
  var BLK_SZ   = 13;
  var BLK_GAP  = 1;
  var BLK_CELL = BLK_SZ + BLK_GAP;
  var COL_GAP  = 1;
  var XAXIS_H  = 20;
  var MAX_CENTS = 22;

  return (
    <div>
      {tour.show && <Tour steps={tour.steps} onDone={tour.done} />}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>Paying for the Past</h2>
        <TourBtn onOpen={tour.reopen} />
      </div>

      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 6px" }}>
        Of every dollar the federal government collects in taxes, <strong style={{ color: RED }}>{display ? display.pct.toFixed(1) : "—"}¢</strong> goes straight to interest payments on our debt. Instead of spending for Americans in the present day on defense, housing, food, or education, we are spending almost 1/5 of our taxes on debt interest. You may notice that there was a large increase in the 1980s. This is partly due to Reagan administration policies that increased defense spending and decreased revenue (through tax cuts), and partly to very high interest rates set by the Federal Reserve to fight the inflation of the 1970s, making borrowing more expensive.
      </p>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 16px" }}>
        {hovRow ? hovRow.year + " — " + hovRow.pct.toFixed(1) + "¢ per tax dollar" : "That's up from 7.5¢ in 1970. Hover any column to see that year."}
      </p>

      {/* Stat callout */}
      {display && (
        <div style={{ display: "flex", gap: 16, margin: "0 0 20px", flexWrap: "wrap" }}>
          <div style={{ background: "#fef2f2", borderRadius: 8, padding: "14px 20px", flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
              {hovRow ? hovRow.year : "FY" + latest.year} — per tax dollar
            </div>
            <div style={{ fontSize: 48, fontWeight: 800, color: RED, lineHeight: 1 }}>
              {display.pct.toFixed(1)}¢
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>goes to interest</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, minWidth: 180 }}>
            <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Net interest paid</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>${Math.round(display.ni / 1000)}B</div>
            </div>
            <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Total revenue</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>${Math.round(display.receipts / 1000)}B</div>
            </div>
          </div>
        </div>
      )}

      {/* Block bar chart — historical + projections */}
      <Card style={{ borderLeft: "4px solid " + RED, marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: MUTED, margin: "0 0 12px" }}>
          Each block = 1¢ of every tax dollar going to interest.{" "}
          <span style={{ color: RED, fontWeight: 600 }}>Red</span> = historical and FY2025 actual (1970–2025);{" "}
          <span style={{ color: "#f59e0b", fontWeight: 600 }}>Amber</span> = CBO Feb 2026 projections (2026–2036). Hover a column for detail.
        </p>
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: COL_GAP + "px", paddingBottom: XAXIS_H + "px", position: "relative" }}>
            {series.map(function (r) {
              var blocks   = Math.round(r.pct);
              var isHov    = hovYear === r.year;
              var showLabel = r.year % 5 === 0;
              return (
                <div key={r.year}
                  onMouseEnter={function () { setHovYear(r.year); }}
                  onMouseLeave={function () { setHovYear(null); }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "default", position: "relative", flexShrink: 0 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: BLK_GAP + "px" }}>
                    {Array.from({ length: blocks }).map(function (_, b) {
                      return (
                        <div key={b} style={{
                          width: BLK_SZ, height: BLK_SZ, borderRadius: 2,
                          backgroundColor: RED,
                          opacity: isHov ? 1 : 0.75,
                          transition: "opacity 0.1s",
                        }} />
                      );
                    })}
                  </div>
                  <div style={{
                    position: "absolute", bottom: -XAXIS_H,
                    fontSize: 9, color: isHov ? TEXT : MUTED,
                    fontWeight: isHov ? 700 : 400,
                    whiteSpace: "nowrap",
                    visibility: showLabel || isHov ? "visible" : "hidden",
                  }}>
                    {r.year}
                  </div>
                </div>
              );
            })}
            {projSeries.map(function (r) {
              var blocks   = Math.round(r.pct);
              var isHov    = hovProjYear === r.year;
              var showLabel = r.year % 5 === 0;
              var isActual = r.year === 2025;
              return (
                <div key={r.year}
                  onMouseEnter={function () { setHovProjYear(r.year); }}
                  onMouseLeave={function () { setHovProjYear(null); }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "default", position: "relative", flexShrink: 0 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: BLK_GAP + "px" }}>
                    {Array.from({ length: blocks }).map(function (_, b) {
                      return (
                        <div key={b} style={{
                          width: BLK_SZ, height: BLK_SZ, borderRadius: 2,
                          backgroundColor: isActual ? RED : "#f59e0b",
                          opacity: isHov ? 1 : 0.75,
                          transition: "opacity 0.1s",
                        }} />
                      );
                    })}
                  </div>
                  <div style={{
                    position: "absolute", bottom: -XAXIS_H,
                    fontSize: 9, color: isHov ? TEXT : MUTED,
                    fontWeight: isHov ? 700 : 400,
                    whiteSpace: "nowrap",
                    visibility: showLabel || isHov ? "visible" : "hidden",
                  }}>
                    {r.year}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <h3 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: "8px 0 6px" }}>What's coming next: CBO projections through 2036</h3>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 6px" }}>
        Under current law, the share of every tax dollar going to interest is projected to keep climbing. By 2036, the CBO projects <strong style={{ color: "#f59e0b" }}>{projDisplay ? projDisplay.pct.toFixed(1) : "—"}¢</strong> of every dollar in federal revenue will go to interest — even more than today.
      </p>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 16px" }}>
        {hovProjRow ? hovProjRow.year + " — " + hovProjRow.pct.toFixed(1) + "¢ per tax dollar (projected)" : "Hover any column to see that year."}
      </p>

      {/* Stat callout — projection */}
      {projDisplay && (
        <div style={{ display: "flex", gap: 16, margin: "0 0 20px", flexWrap: "wrap" }}>
          <div style={{ background: "#fffbeb", borderRadius: 8, padding: "14px 20px", flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
              {hovProjRow ? hovProjRow.year : "FY" + projLast.year} — per tax dollar
            </div>
            <div style={{ fontSize: 48, fontWeight: 800, color: "#f59e0b", lineHeight: 1 }}>
              {projDisplay.pct.toFixed(1)}¢
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>projected interest share</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, minWidth: 180 }}>
            <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Projected net interest</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>${Math.round(projDisplay.ni / 1000)}B</div>
            </div>
            <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Projected total revenue</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>${Math.round(projDisplay.receipts / 1000)}B</div>
            </div>
          </div>
        </div>
      )}

      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 16px" }}>
        When the government borrows, it also competes with every other borrower in the economy, which pushes up interest rates. Higher rates mean more expensive mortgages, costlier business loans, and less private investment. The CBO estimates that for every dollar of deficit spending, private investment falls by about 33 cents.
      </p>

      <p style={{ fontSize: 12, color: MUTED }}>Sources: <a href="https://www.whitehouse.gov/omb/information-resources/budget/historical-tables/" target="_blank" rel="noreferrer" style={{ color: BLUE }}>OMB Historical Tables</a> (historical net interest, total receipts). <a href="https://www.cbo.gov/publication/61882" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO, The Budget and Economic Outlook: 2026 to 2036</a> (projected net interest, total revenues, Table 1-1). CBO crowding-out estimate via <a href="https://www.pgpf.org/article/the-national-debt-can-crowd-out-investments-in-the-economy-heres-how/" target="_blank" rel="noreferrer" style={{ color: BLUE }}>Peter G. Peterson Foundation</a>.</p>
    </div>
  );
}

/* ── III.a.ii  Japan Case Study ──────────── */
function CrowdingOutTextPage() {
  var _open = useState(null); var openBox = _open[0]; var setOpenBox = _open[1];
  var _step = useState(0); var boxStep = _step[0]; var setBoxStep = _step[1];

  var TOPICS = [
    {
      text: "It can increase interest rates which then cause reductions in investment in new buildings, and machinery. This can cause higher housing prices, lower productivity growth, and lower wages over time.",
      color: RED,
      steps: [
        {
          heading: "Crowding Out Investment",
          body: "CBO estimates that for every dollar the federal deficit increases, private investment falls by 33 cents — with a range of 15 to 50 cents depending on how much private saving and foreign capital offset the borrowing. Over 30 years, rising debt under current law could reduce average income growth by 16% relative to a debt-stable scenario.",
          source: "CBO, The Long-Run Effects of Federal Budget Deficits on National Saving and Private Domestic Investment, Working Paper 2014-02",
          sourceUrl: "https://www.cbo.gov/sites/default/files/cbofiles/attachments/45140-NSPDI_workingPaper.pdf",
        },
        {
          heading: "Interest Rates",
          body: "Crowding out happens because the government competes with other borrowers in the market for loanable funds. They compete with businesses that want to borrow to buy more buildings and machinery and with people who want to borrow money for a mortgage, a car or other consumption. If the government increases its borrowing, interest rates rise to make room for that borrowing by reducing the amount of private borrowing. With higher interest rates fewer businesses want to invest and fewer people get new houses.",
        },
        {
          heading: "Wait! Doesn't the Fed Set Interest Rates?",
          body: "The Federal Reserve typically only manipulates very short term interest rates while the interest rates that matter for investment are long-term rates. Still, when the government issues debt that puts upward pressure on short-term rates leaving the Fed with a choice: buy the new debt and keep interest rates the same, or let the short-term rates rise. This can lead to inflation (see bullet point 2).",
        },
        {
          heading: "Housing Costs",
          body: "Higher interest rates raise housing expenses for both renters and owners. For renters, a 1‑percentage‑point rise in mortgage rates can increase market rents by roughly 5–6%, as more would‑be buyers remain renters. For owner‑occupiers, higher rates sharply raise monthly mortgage payments—often by hundreds of dollars per month—more than offsetting any modest decline in home prices.",
          source: "Columbia Business School Insights, “Higher Rates, Higher Rents”",
          sourceUrl: "https://business.columbia.edu/press-release/cbs-press-releases/higher-rates-higher-rents-how-monetary-policy-affects-housing",
        },
        {
          heading: "Offsetting Effects",
          body: "Higher interest rates also give people an incentive to save more and can lead foreigners to invest in the U.S.. Both actions increase the amount of loanable funds available. This is the main reason why each dollar of government debt doesn't crowd out a whole dollar of investment in the U.S. But having foreigners investing in the U.S. can cause other problems when we have a fast growing national debt (see bullet point 4 above).",
        },
      ],
    },
    {
      text: "Large deficits during times of full employment can lead to increasing inflation.",
      color: "#f59e0b",
      steps: [
        {
          heading: "Debt and Inflation",
          body: "When the government runs a deficit it must sell bonds to the public. This puts upward pressure on interest rates which causes crowding out. The Federal Reserve can offset this to some degree by buying government bonds. But when they do this they create new money to buy the bonds. And this can lead to inflation.",
        },
        {
          heading: "More Money = Inflation?",
          body: "If the Fed buys government bonds they give newly created money to the people who sell them. They now have more money to spend on goods and services. If the economy is in recession and there are goods and services to be bought this just leads to an increase in purchases at current prices. This is typically how the Fed stimulates the economy to bring the country back from a recession.",
        },
        {
          heading: "When More Money = Inflation",
          body: "Now imagine that factories are running at full capacity and the unemployment rate is so low employers can't hire new workers. If the Fed increases the amount of money available, and people try to spend it, then the dollars looking for goods and services will exceed the total price of all available goods and services. Something has to give and that something is prices. Prices have to rise to get the dollars of demand equal to the total price of what is available to buy. That is inflation.",
        },
        {
          heading: "Is Inflation Bad?",
          body: "This is a serious question because historically, when prices have risen because of an increase in the money supply wages have typically gone up to compensate. But it usually takes wages some time to catch up and there are many other costs to inflation. For example, restaurants have to print new menus, people on fixed incomes suffer, and it becomes hard to comparison shop. Also people tend to see prices as taking away buying power while the following wage increases are what they deserve for good work. People hate inflation.",
        },
        {
          heading: "Inflation + Crowding Out",
          body: "Even if the Federal Reserve tries to keep interest rates constant to avoid crowding out investment through the market for loanable funds that doesn't mean that crowding out doesn't take place. Instead of rising interest rates it is rising prices that cause people and companies to spend less. With a fixed supply of goods and services this has to happen to allow the government to buy goods and services with the money it got from selling the bonds.",
        },
        {
          heading: "Conclusion",
          body: "Increasing the debt does not have to cause inflation (though it can). In a weak economy increasing the money supply by buying up the government debt can actually make the economy better without causing inflation. In a strong economy the Fed can suppress inflation by allowing interest rates to rise. Either way, if the economy is strong crowding out still happens either through the interest rate mechanism or the price mechanism.",
        },
      ],
    },
    {
      text: "As debt grows relative to national income the government must make those payments through a combination of tax increases and spending cuts or take other actions to deal with the debt.",
      color: "#8b5cf6",
      steps: [
        {
          heading: "The Slow Crisis",
          body: "With the debt growing relative to national income, it is inevitable that the interest cost of the debt grows relative to the cost of other things the government does. The government has four choices as to how to deal with this.",
        },
        {
          heading: "Cutting Other Spending",
          body: "If the government doesn't want to raise taxes, or run an even larger deficit, as interest payments rise then it will have to cut its spending. If this were easy those cuts would already have been made and we wouldn't have the deficit we have now. Later in the tour you'll have a chance to explore the difficulty of cutting government spending.",
        },
        {
          heading: "Raising Taxes",
          body: "Raising taxes enough to bring down the ratio of the debt to national income over time would solve the entire problem (as would sufficient spending cuts or combinations of tax increases and cuts). But as long as the debt is allowed to grow faster than national income, interest payments will grow as a fraction of national income requiring increasing tax rates and/or spending cuts to keep up.",
        },
        {
          heading: "Inflate Away the Debt?",
          body: "The United States is one of a number of countries that are able to sell debt denominated in its own currency. That means when we borrow we get dollars, we pay interest in dollars, and we pay back the debt in dollars. So if there is inflation the actual amount of goods and services we have to give up to pay back the debt goes down over time. Inflation is the scourge of lenders and the friend of borrowers.",
        },
        {
          heading: "So Inflation is Good?",
          body: "An unanticipated increase in inflation is good for the government budget. But, there can be very bad consequences if the government deliberately tries to inflate away the debt. Inflation is very unpopular and has costs. A big increase could spook financial markets. Ultimately this can turn a slow budget crisis into a very abrupt crisis. As can the government's fourth option: failing to pay back the debt or defaulting. We cover that under bullet point 4.",
        },
      ],
    },
    {
      text: "A large and persistent increase in inflation, the government being unable to pay its debt, or just the anticipation of these things could spook investors leading to a rapid sell off of U.S. debt and financial instability.",
      color: "#1e3a5f",
      steps: [
        {
          heading: "The Fast Crisis",
          body: "\"In economics, things take longer to happen than you think they will, and then they happen faster than you thought they could.\"\n\nRudiger Dornbusch\n\nSeveral things could suddenly make U.S. government bonds much less attractive investments and could lead to a rapid sell off government bonds. Let's take a look at some of them.",
        },
        {
          heading: "A U.S. Government Default",
          body: "If the government were to miss a payment on any of its debts this would call into question what debts it will pay and therefore the value of any of those debts -- including government bonds. If the debt is continuing to grow, a default could set off the expectation that the government's willingness to pay its debts was going to get worse before it got better leading to a sell off of U.S. debt.",
        },
        {
          heading: "Default's Other Consequences",
          body: "Even if a default didn't cause a crisis it would almost certainly increase the cost of financing debt for a very long time as it has for nearly every other country that has defaulted. An untrustworthy borrower has to pay a higher interest rate to get credit.",
        },
        {
          heading: "Increased Inflation",
          body: "As described in the mini-tour attached to bullet point 3, one way for a country to deal with excess debt is to increase inflation. This works because the inflation adjusted value of the money used to pay back the debt goes down with an unanticipated increase in inflation. But an attempt to deal with any substantial amount of the debt problem this way would likely spook financial markets which could also lead to a selloff.",
        },
        {
          heading: "Anticipation of Crisis",
          body: "The anticipation of a crisis can be enough to set off a crisis. As our debt grows relative to our ability to pay creditors will eventually get nervous the same way lenders do when they see people suddenly run up big credit card debts. For the U.S., fear that the U.S. may default or inflate away its debt can lead to demands that new debt pay higher interest or even a sell off of existing debt.",
        },
        {
          heading: "Selloff Consequences",
          body: "If, suddenly, many people want to sell government bonds the price of those bonds has to fall. This can lead the price of other assets like, corporate bonds and stocks, to fall.",
        },
        {
          heading: "Crisis Spreads",
          body: "U.S. Government bonds are considered a 'safe' asset so banks that are required to keep a certain amount of assets around hold many of them. If the value of safe assets drop, regulated banks have to sell assets that aren't as safe in order to buy more safe assets. This can cause the selloff to spread to places like the corporate bond market and ultimately the stock market.",
        },
        {
          heading: "And Spreads Further",
          body: "With asset prices falling everywhere, lenders don't know who will have the money to pay them back and can stop lending all together. Falling stock prices mean 401(k)s and mutual funds become worth less. People feel less wealthy so they buy less slowing the economy. Companies that can't borrow stop investing. Now we're in a recession.",
        },
        {
          heading: "Conclusion",
          body: "While some effects of a rapid sell off of U.S. debt are predictable, others are speculative. It is entirely possible that a sell off could be managed by smart actions in the government and private sectors. However, as Herbert Stein once said \"If something can't go on forever, it won't\" If we continue to grow our debt relative to our ability to pay there will eventually be costs, and they are likely to be large.",
        },
      ],
    },
  ];

  function handleBoxClick(i) {
    if (openBox === i) {
      setOpenBox(null);
    } else {
      setOpenBox(i);
      setBoxStep(0);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: "0 0 16px" }}>What Does This Mean for Future Generations?</h2>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 20px" }}>
        A government deficit that is large relative to the size of the national economy can have numerous negative effects on the people who live there.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {TOPICS.map(function (topic, i) {
          var isOpen = openBox === i;
          var cur = isOpen ? topic.steps[boxStep] : null;
          var isLast = cur && boxStep === topic.steps.length - 1;
          return (
            <div key={i}>
              <div onClick={function () { handleBoxClick(i); }} style={{ cursor: "pointer", userSelect: "none" }}>
                <Card style={{ borderLeft: "4px solid " + topic.color }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: 0 }}>{topic.text}</p>
                    <span style={{ fontSize: 11, color: topic.color, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, paddingTop: 3 }}>
                      {isOpen ? "▼ Close" : "▶ Explore"}
                    </span>
                  </div>
                </Card>
              </div>

              {isOpen && cur && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}>
                    {topic.steps.map(function (_, si) {
                      return (
                        <button key={si} onClick={function () { setBoxStep(si); }} style={{
                          width: si === boxStep ? 10 : 7,
                          height: si === boxStep ? 10 : 7,
                          borderRadius: "50%",
                          border: "none", padding: 0, cursor: "pointer",
                          background: si === boxStep ? topic.color : si < boxStep ? topic.color : BORDER,
                          opacity: si < boxStep ? 0.45 : 1,
                          transition: "all 0.15s",
                          flexShrink: 0,
                        }} />
                      );
                    })}
                    <span style={{ fontSize: 11, color: MUTED, marginLeft: 8 }}>{boxStep + 1} of {topic.steps.length}</span>
                  </div>

                  <Card style={{ borderLeft: "4px solid " + topic.color, marginBottom: 14, minHeight: 120 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: TEXT, margin: "0 0 10px" }}>{cur.heading}</h3>
                    <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 12px", whiteSpace: "pre-line" }}>{cur.body}</p>
                    {cur.source && (
                      <div style={{ fontSize: 11, color: MUTED, borderTop: "1px solid " + BORDER, paddingTop: 8 }}>
                        Source:{" "}
                        {cur.sourceUrl ? (
                          <a href={cur.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: MUTED, textDecoration: "underline" }}>{cur.source}</a>
                        ) : cur.source}
                      </div>
                    )}
                  </Card>

                  <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
                    {boxStep > 0 && (
                      <button onClick={function () { setBoxStep(boxStep - 1); }} style={{ padding: "10px 20px", fontSize: 13, borderRadius: 8, cursor: "pointer", border: "1px solid " + BORDER, background: SURFACE, color: TEXT }}>← Previous</button>
                    )}
                    {!isLast && (
                      <button onClick={function () { setBoxStep(boxStep + 1); }} style={{ padding: "10px 20px", fontSize: 13, borderRadius: 8, cursor: "pointer", border: "none", background: topic.color, color: "#fff", fontWeight: 600 }}>Next →</button>
                    )}
                    {isLast && (
                      <button onClick={function () { setBoxStep(0); }} style={{ padding: "10px 20px", fontSize: 13, borderRadius: 8, cursor: "pointer", border: "1px solid " + BORDER, background: SURFACE, color: MUTED }}>↺ Start over</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: 0 }}>
        The immediate and long-run consequences of deficits depend on many things such as economic conditions, global investment flows, and how borrowed funds are used. To explore each of the four consequences just pointed out in more detail explore the points above.
      </p>
    </div>
  );
}

// Keep JapanPage defined but unused — remove if confirmed not needed
function JapanPage({ japanData }) {
  var _hov     = useState(null); var hovYear  = _hov[0];  var setHovYear  = _hov[1];
  var _eraStep = useState(0);    var eraStep  = _eraStep[0]; var setEraStep = _eraStep[1];
  var _tourOn  = useState(true);
  var tourOn   = _tourOn[0]; var setTourOn = _tourOn[1];

  function doneTour() { setTourOn(false); setEraStep(-1); }
  function reopenTour() { setTourOn(true); setEraStep(0); }

  // Era definitions
  var ERAS = [
    { id: "lost",    label: "Lost Decade",  years: [1991, 2002], color: "#fef2f2", border: "#dc2626",
      title: "The Lost Decade (1991–2002)",
      body: "After Japan's asset bubble burst in 1991, GDP growth collapsed and stayed near zero for over a decade. Debt began climbing rapidly as the government ran deficits in an effort to stimulate the economy. Despite the crisis, bond yields stayed relatively high." },
    { id: "zirp",    label: "ZIRP",         years: [2000, 2013], color: "#f0fdf4", border: "#2d6a4f",
      title: "Zero Interest Rate Policy (2000–2013)",
      body: "The Bank of Japan pioneered zero interest rate policy (ZIRP) to make borrowing easier, driving yields near zero. Debt continued rising through the 2008 financial crisis and the 2011 Tōhoku earthquake in efforts to stimulate the economy. The combination of near-zero rates and growing debt created the illusion of sustainability." },
    { id: "ycc",     label: "YCC",          years: [2013, 2024], color: "#fef2f2", border: "#dc2626",
      title: "Yield Curve Control / Abenomics (2013–2024)",
      body: "Under Prime Minister Abe, the Bank of Japan dramatically expanded bond purchases and eventually introduced Yield Curve Control, a policy capping 10-year yields at 0%. The government could borrow money for free, but only because the Bank of Japan purchased any outstanding debt. By 2023 the BoJ owned nearly half of all outstanding government bonds. Debt stabilized near 240% of GDP, but only because the central bank was absorbing all the supply." },
    { id: "now",     label: "Now",          years: [2024, 2025], color: "#e0f2fe", border: "#0369a1",
      title: "The Reckoning (2024–present)",
      body: "After COVID, Japan experienced inflation for the first time in decades and the BoJ ended YCC in March 2024. Interest rates surged to their highest levels since 1999. Japan's massive debt now carries a rising interest bill projected to double by 2030, crowding out healthcare, education, and defense spending. The consequences of decades of spending were deferred until now. The Japanese government must figure out how to foot the bill, and maintain programs for their aging population." },
  ];

  var activeEra = tourOn && eraStep >= 0 && eraStep < ERAS.length ? ERAS[eraStep] : null;

  var data = useMemo(function () {
    if (!japanData) return [];
    return japanData.filter(function (r) { return r.year >= 1990 && r.year <= 2025; });
  }, [japanData]);

  var hovRow = hovYear != null ? data.find(function (r) { return r.year === hovYear; }) : null;

  var CHART_W = 560;
  var CHART_H = 160;
  var PAD     = { top: 12, right: 20, bottom: 24, left: 44 };
  var plotW   = CHART_W - PAD.left - PAD.right;
  var plotH   = CHART_H - PAD.top  - PAD.bottom;

  function scaleX(year) {
    return PAD.left + ((year - 1990) / (2025 - 1990)) * plotW;
  }
  function scaleY(val, lo, hi) {
    return PAD.top + plotH - ((val - lo) / (hi - lo)) * plotH;
  }

  function LineChart({ series, color, yMin, yMax, yTicks, yLabel }) {
    var pts = series.filter(function (r) { return r.val != null && !isNaN(r.val); });
    var pathD = pts.map(function (r, i) {
      return (i === 0 ? "M" : "L") + scaleX(r.year).toFixed(1) + "," + scaleY(r.val, yMin, yMax).toFixed(1);
    }).join(" ");

    // Determine dim region: years outside active era
    var eraX1 = activeEra ? scaleX(activeEra.years[0]) : null;
    var eraX2 = activeEra ? scaleX(activeEra.years[1]) : null;

    return (
      <svg width="100%" viewBox={"0 0 " + CHART_W + " " + CHART_H} style={{ display: "block" }}>
        {/* Y gridlines */}
        {yTicks.map(function (t) {
          var y = scaleY(t, yMin, yMax);
          return (
            <React.Fragment key={t}>
              <line x1={PAD.left} y1={y} x2={PAD.left + plotW} y2={y} stroke={BORDER} strokeWidth="1" />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize="10" fill={MUTED}>{t}%</text>
            </React.Fragment>
          );
        })}
        {/* Zero line */}
        {yMin < 0 && yMax > 0 && (
          <line x1={PAD.left} y1={scaleY(0, yMin, yMax)} x2={PAD.left + plotW} y2={scaleY(0, yMin, yMax)}
            stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="4 2" />
        )}
        {/* X axis labels */}
        {[1990, 2000, 2010, 2020].map(function (yr) {
          return <text key={yr} x={scaleX(yr)} y={CHART_H - 4} textAnchor="middle" fontSize="10" fill={MUTED}>{yr}</text>;
        })}
        {/* Era highlight band */}
        {activeEra && (
          <rect x={eraX1} y={PAD.top} width={eraX2 - eraX1} height={plotH}
            fill={activeEra.color} opacity="0.7" />
        )}
        {/* Dim overlay outside era */}
        {activeEra && (
          <React.Fragment>
            <rect x={PAD.left} y={PAD.top} width={Math.max(0, eraX1 - PAD.left)} height={plotH}
              fill="white" opacity="0.55" />
            <rect x={eraX2} y={PAD.top} width={Math.max(0, PAD.left + plotW - eraX2)} height={plotH}
              fill="white" opacity="0.55" />
          </React.Fragment>
        )}
        {/* Data line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {/* Era border lines */}
        {activeEra && (
          <React.Fragment>
            <line x1={eraX1} y1={PAD.top} x2={eraX1} y2={PAD.top + plotH}
              stroke={activeEra.border} strokeWidth="1.5" strokeDasharray="4 2" />
            <line x1={eraX2} y1={PAD.top} x2={eraX2} y2={PAD.top + plotH}
              stroke={activeEra.border} strokeWidth="1.5" strokeDasharray="4 2" />
          </React.Fragment>
        )}
        {/* Hover dot */}
        {hovRow && !activeEra && (function () {
          var pt = pts.find(function (r) { return r.year === hovRow.year; });
          if (!pt) return null;
          return <circle cx={scaleX(pt.year)} cy={scaleY(pt.val, yMin, yMax)} r={5} fill={color} stroke="#fff" strokeWidth="1.5" />;
        })()}
        {/* Invisible hover targets (only when tour not active) */}
        {!activeEra && pts.map(function (r) {
          return (
            <rect key={r.year} x={scaleX(r.year) - 5} y={PAD.top} width="10" height={plotH}
              fill="transparent"
              onMouseEnter={function () { setHovYear(r.year); }}
              onMouseLeave={function () { setHovYear(null); }} />
          );
        })}
        <text x={8} y={PAD.top + plotH / 2} textAnchor="middle" fontSize="10" fill={MUTED}
          transform={"rotate(-90," + 8 + "," + (PAD.top + plotH / 2) + ")"}>{yLabel}</text>
      </svg>
    );
  }

  var debtSeries  = data.map(function (r) { return { year: r.year, val: r.japan_debt_pct_gdp }; });
  var yieldSeries = data.map(function (r) { return { year: r.year, val: r.japan_10y_yield }; });
  var gdpSeries   = data.map(function (r) { return { year: r.year, val: r.japan_real_gdp_growth }; });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>A Case Study: Japan</h2>
        <button onClick={reopenTour} style={{ background: "none", border: "1px solid " + BORDER, borderRadius: "50%", width: 26, height: 26, fontSize: 13, color: MUTED, cursor: "pointer", flexShrink: 0 }}>?</button>
      </div>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 16px" }}>
        Japan is often cited as proof that deficits don't cause high interest rates — its debt reached 260% of GDP while bond yields stayed near zero for three decades. But that stability had a hidden engine: the Bank of Japan bought nearly half of all outstanding government bonds, directly suppressing yields. When that ended in 2024, the bill came due.
      </p>

      {/* Era nav pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {ERAS.map(function (era, i) {
          var active = tourOn && eraStep === i;
          return (
            <button key={era.id} onClick={function () { setTourOn(true); setEraStep(i); }} style={{
              padding: "4px 12px", fontSize: 12, borderRadius: 20, cursor: "pointer",
              border: "1.5px solid " + (active ? era.border : BORDER),
              background: active ? era.color : SURFACE,
              color: active ? "#111" : MUTED,
              fontWeight: active ? 600 : 400,
              transition: "all 0.15s",
            }}>{era.label}</button>
          );
        })}
        {tourOn && (
          <button onClick={doneTour} style={{
            padding: "4px 12px", fontSize: 12, borderRadius: 20, cursor: "pointer",
            border: "1px solid " + BORDER, background: SURFACE, color: MUTED,
          }}>Clear</button>
        )}
      </div>

      {/* Era annotation card */}
      {activeEra && (
        <div style={{
          background: activeEra.color, border: "1.5px solid " + activeEra.border,
          borderRadius: 8, padding: "12px 16px", marginBottom: 14,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{activeEra.title}</div>
            <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, margin: 0 }}>{activeEra.body}</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {eraStep > 0 && (
              <button onClick={function () { setEraStep(eraStep - 1); }} style={{
                padding: "4px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer",
                border: "1px solid " + BORDER, background: SURFACE, color: TEXT,
              }}>← Back</button>
            )}
            {eraStep < ERAS.length - 1 && (
              <button onClick={function () { setEraStep(eraStep + 1); }} style={{
                padding: "4px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer",
                border: "none", background: "#1e3a5f", color: "#fff", fontWeight: 600,
              }}>Next →</button>
            )}
            {eraStep === ERAS.length - 1 && (
              <button onClick={doneTour} style={{
                padding: "4px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer",
                border: "none", background: "#1e3a5f", color: "#fff", fontWeight: 600,
              }}>Done</button>
            )}
          </div>
        </div>
      )}

      {/* Hover callout (only when tour not active) */}
      {!activeEra && (
        <div style={{ minHeight: 28, marginBottom: 10 }}>
          {hovRow ? (
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{hovRow.year}</span>
              {hovRow.japan_debt_pct_gdp != null && <span style={{ fontSize: 13, color: RED }}>Debt: {hovRow.japan_debt_pct_gdp.toFixed(0)}% of GDP</span>}
              {hovRow.japan_10y_yield != null && <span style={{ fontSize: 13, color: "#2d6a4f" }}>10yr yield: {hovRow.japan_10y_yield.toFixed(2)}%</span>}
              {hovRow.japan_real_gdp_growth != null && <span style={{ fontSize: 13, color: "#4a8b6f" }}>GDP growth: {hovRow.japan_real_gdp_growth.toFixed(1)}%</span>}
            </div>
          ) : (
            <span style={{ fontSize: 13, color: MUTED }}>Hover any chart to see values for that year</span>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card style={{ borderLeft: "4px solid #4a0000", padding: "16px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: RED, marginBottom: 6 }}>Government Debt (% of GDP)</div>
          <LineChart series={debtSeries} color="#4a0000" yMin={50} yMax={280} yTicks={[100,150,200,250]} yLabel="% GDP" />
        </Card>
        <Card style={{ borderLeft: "4px solid " + BLUE, padding: "16px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: BLUE, marginBottom: 6 }}>10-Year Government Bond Yield</div>
          <LineChart series={yieldSeries} color={"#2d6a4f"} yMin={-0.5} yMax={4} yTicks={[0,1,2,3]} yLabel="%" />
        </Card>
        <Card style={{ borderLeft: "4px solid #4a8b6f", padding: "16px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#4a8b6f", marginBottom: 6 }}>Real GDP Growth</div>
          <LineChart series={gdpSeries} color="#4a8b6f" yMin={-8} yMax={8} yTicks={[-4,0,4]} yLabel="%" />
        </Card>
      </div>
      <p style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>Sources: <a href="https://fred.stlouisfed.org/series/GGGDTAJPA188N" target="_blank" rel="noreferrer" style={{ color: BLUE }}>FRED GGGDTAJPA188N</a> / <a href="https://fred.stlouisfed.org/series/GGGDTPJPA188N" target="_blank" rel="noreferrer" style={{ color: BLUE }}>GGGDTPJPA188N</a> (IMF); <a href="https://fred.stlouisfed.org/series/IRLTLT01JPM156N" target="_blank" rel="noreferrer" style={{ color: BLUE }}>IRLTLT01JPM156N</a> (OECD); <a href="https://fred.stlouisfed.org/series/JPNRGDPEXP" target="_blank" rel="noreferrer" style={{ color: BLUE }}>JPNRGDPEXP</a> (Cabinet Office Japan). Debt 2024+ are IMF projections.</p>
    </div>
  );
}

/* ── III.b.i  Net Interest ───────────────── */
// Ported from App.jsx NetInterestPage, unchanged.
function NetInterestPage({ spendingData }) {
  var tour = useTour(11);

  var categories = useMemo(function () {
    if (!spendingData) return [];
    var cats = {};
    spendingData.filter(function (r) { return !String(r.category).includes("Real") && r.category !== "Net interest"; })
      .forEach(function (r) { cats[r.category] = true; });
    return Object.keys(cats).sort();
  }, [spendingData]);

  var _comp = useState("National Defense"); var compareCat = _comp[0]; var setCompareCat = _comp[1];
  var _yr   = useState(0);                  var yearIdx    = _yr[0];   var setYearIdx    = _yr[1];

  var timeData = useMemo(function () {
    if (!spendingData) return [];
    var byYear = {};
    spendingData.filter(function (r) { return !String(r.category).includes("Real") && r.year >= 1970 && r.year <= 2024; })
      .forEach(function (r) {
        if (!byYear[r.year]) byYear[r.year] = {};
        byYear[r.year][r.category] = r.amount;
      });
    var result = [];
    for (var y = 1970; y <= 2024; y++) { if (byYear[y]) result.push({ year: y, interest: byYear[y]["Net interest"] || 0, data: byYear[y] }); }
    return result;
  }, [spendingData]);

  useEffect(function () { if (timeData.length > 0) setYearIdx(timeData.length - 1); }, [timeData.length]);

  if (timeData.length === 0) return null;

  var cur           = timeData[yearIdx] || timeData[timeData.length - 1];
  var interestAmt   = cur.interest;
  var compareAmt    = cur.data[compareCat] || 0;
  var interestBlocks = Math.round(interestAmt  / BLOCK_SIZE);
  var compareBlocks  = Math.round(compareAmt   / BLOCK_SIZE);
  var shortName      = SPEND_SHORT[compareCat] || compareCat;

  return (
    <div>
      {tour.show && <Tour steps={tour.steps} onDone={tour.done} />}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>How Does the Cost of Debt Service Compare to Other Government Programs?</h2>
        <TourBtn onOpen={tour.reopen} />
      </div>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 6px" }}>
        As of FY2024, net interest payments have reached $880 billion on their own. This means interest payments alone are more costly than almost every major government program, including Medicare, national defense and education.
      </p>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 20px" }}>Select a program below to compare.</p>
      <Card style={{ borderLeft: "4px solid " + AMBER }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, color: MUTED }}>Compare with:</label>
          <select value={compareCat} onChange={function (e) { setCompareCat(e.target.value); }}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid " + BORDER, fontSize: 13, background: SURFACE, color: TEXT, cursor: "pointer" }}>
            {categories.map(function (c) { return <option key={c} value={c}>{SPEND_SHORT[c] || c}</option>; })}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: MUTED }}>1970</span>
            <span style={{ fontSize: 28, fontWeight: 800, color: TEXT }}>FY {cur.year}</span>
            <span style={{ fontSize: 13, color: MUTED }}>2024</span>
          </div>
          <input type="range" min={0} max={timeData.length - 1} value={yearIdx}
            onChange={function (e) { setYearIdx(Number(e.target.value)); }}
            style={{ width: "100%", accentColor: AMBER, cursor: "grab" }} />
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
          {[
            { label: "Net Interest", amt: interestAmt, blocks: interestBlocks, color: AMBER },
            { label: shortName,      amt: compareAmt,  blocks: compareBlocks,  color: BLUE  },
          ].map(function (s) {
            return (
              <div key={s.label} style={{ flex: "1 1 280px", minWidth: 260 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: s.color }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.label}</span>
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{fmtAmt(s.amt)}</span>
                </div>
                <div style={{ display: "flex", gap: GAP, flexWrap: "wrap" }}>
                  {Array.from({ length: s.blocks }).map(function (_, i) {
                    return <div key={i} style={{ width: SZ, height: SZ, borderRadius: 2, backgroundColor: s.color, opacity: 0.9 }} />;
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {interestAmt > compareAmt && (
          <div style={{ marginTop: 16, padding: "10px 14px", background: "#fef2f2", borderRadius: 6, fontSize: 13, color: RED }}>
            <strong>Net interest exceeds {shortName}</strong> by {fmtAmt(interestAmt - compareAmt)} in FY{cur.year}.
          </div>
        )}
        {interestAmt <= compareAmt && compareAmt > 0 && (
          <div style={{ marginTop: 16, padding: "10px 14px", background: "#f0fdf4", borderRadius: 6, fontSize: 13, color: BLUE }}>
            In FY{cur.year}, {shortName} still exceeds net interest by {fmtAmt(compareAmt - interestAmt)}.
          </div>
        )}
      </Card>
      <p style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>Source: <a href="https://www.whitehouse.gov/omb/information-resources/budget/historical-tables/" target="_blank" rel="noreferrer" style={{ color: BLUE }}>OMB Historical Tables, FY2026 Budget</a> (Table 3.2 — outlays by function and subfunction, 1962–2030).</p>
    </div>
  );
}

/* ── III.b.ii  Budget Dilemma ────────────── */
// TODO: spending vs. taxes framing.
// Content:
//   - All remaining programs are highly popular (Social Security, Medicare, defense, veterans)
//   - Show what programs remain if you exclude "politically untouchable" categories
//   - Tax side: link to external tax calculator (TPC, CRFB) or simple illustrative widget
//     showing how much revenue different bracket changes would raise
// Design: TBD — likely a split card showing "cut side" vs "tax side".
function BudgetDilemmaPage({ spendingData, summaryData }) {
  var tour = useTour(12);
  var _hov = useState(null); var hovSlice = _hov[0]; var setHovSlice = _hov[1];

  var computed = useMemo(function () {
    if (!spendingData || !summaryData) return null;

    var spendRows = spendingData.filter(function (r) {
      return r.year === YEAR && !String(r.category).includes("Real");
    });

    var sumRow = summaryData.find(function (r) { return r.year === YEAR && r.category === "Total Outlays"; });
    var totalOutlays = sumRow ? sumRow.amount : 0;
    var defRow = summaryData.find(function (r) { return r.year === YEAR && r.category === "Surplus or Deficit"; });
    var deficit = defRow ? Math.abs(defRow.amount) : 0;
    var recRow = summaryData.find(function (r) { return r.year === YEAR && r.category === "Total Receipts"; });
    var totalReceipts = recRow ? recRow.amount : 0;

    // Build slices
    var SLICES = [
      { key: "Social Security", label: "Social Security", type: "mandatory",
        poll: "85% of Americans oppose cuts", pollSrc: "Navigator Research, 2025", pollUrl: "https://navigatorresearch.org/a-majority-of-americans-oppose-cuts-to-social-security-and-medicare/" },
      { key: "Medicare", label: "Medicare", type: "mandatory",
        poll: "79% of Americans oppose cuts", pollSrc: "KFF, April 2025", pollUrl: "https://www.kff.org/medicaid/poll-finding/kff-health-tracking-poll-april-2025-publics-view-on-major-cuts-to-federal-health-agencies/" },
      { key: "Health", label: "Medicaid & Health", type: "mandatory",
        poll: "75% of Americans oppose cuts", pollSrc: "KFF, April 2025", pollUrl: "https://www.kff.org/medicaid/poll-finding/kff-health-tracking-poll-april-2025-publics-view-on-major-cuts-to-federal-health-agencies/" },
      { key: "Income Security", label: "Income Security", type: "mandatory",
        poll: "SNAP and unemployment insurance — the two largest components — are broadly popular. 80% of Americans support SNAP; 68% support unemployment insurance.", pollSrc: "Pew Research, 2019", pollUrl: "https://www.pewresearch.org/politics/2019/04/11/little-public-support-for-reductions-in-federal-spending/" },
      { key: "National Defense", label: "National Defense", type: "discretionary",
        poll: "67% of Americans want to keep defense spending the same or increase it.", pollSrc: "Chicago Council on Global Affairs, 2024", pollUrl: "https://globalaffairs.org/research/public-opinion-survey/americans-prioritize-domestic-spending-over-foreign-aid" },
      { key: "Veterans Benefits and Services", label: "Veterans", type: "discretionary",
        poll: "84% of Americans oppose cuts to veterans healthcare", pollSrc: "Navigator Research, 2025", pollUrl: "https://navigatorresearch.org/a-majority-of-americans-oppose-cuts-to-social-security-and-medicare/" },
      { key: "Education, Training, Employment, and Social Services", label: "Education & Training", type: "discretionary",
        poll: null, pollSrc: null, pollUrl: null },
      { key: "Net interest", label: "Net Interest (Debt Service)", type: "interest",
        poll: "Cannot be cut — legal obligation to bondholders", pollSrc: null, pollUrl: null },
    ];

    var sliceData = [];
    var accounted = 0;
    SLICES.forEach(function (s) {
      var row = spendRows.find(function (r) { return r.category === s.key; });
      if (row) {
        sliceData.push(Object.assign({}, s, { amount: row.amount }));
        if (s.key !== "Net interest") accounted += row.amount;  // exclude interest from accounted so All Other is correct
      }
    });
    // Pull Net Interest out, insert All Other before it, then put it back at the end
    var niIdx = sliceData.findIndex(function (s) { return s.key === "Net interest"; });
    var niSlice = niIdx >= 0 ? sliceData.splice(niIdx, 1)[0] : null;
    var other = totalOutlays - accounted - (niSlice ? niSlice.amount : 0);
    if (other > 0) sliceData.push({ key: "other", label: "All Other Discretionary", type: "discretionary", amount: other, poll: null, pollSrc: null, pollUrl: null });
    if (niSlice) sliceData.push(niSlice);

    return { slices: sliceData, totalOutlays: totalOutlays, deficit: deficit, totalReceipts: totalReceipts };
  }, [spendingData, summaryData]);

  if (!computed) return null;

  var TYPE_COLORS = {
    interest:      "#1a1a2e",  // near-black — distinct from red mandatory
    mandatory:     "#dc2626",
    discretionary: "#166534",
  };
  var TYPE_LABELS = {
    interest:      "Debt Interest — legal obligation, cannot be cut",
    mandatory:     "Mandatory spending — entitlements, very popular",
    discretionary: "Discretionary — other government programs, many are quite popular",
  };

  // SVG donut chart
  var CX = 180; var CY = 180; var R_OUT = 155; var R_IN = 85;
  var total = computed.slices.reduce(function (s, c) { return s + c.amount; }, 0);
  var segments = [];
  var angle = -Math.PI / 2; // start at top
  computed.slices.forEach(function (slice) {
    var sweep = (slice.amount / total) * 2 * Math.PI;
    segments.push({ slice: slice, startAngle: angle, endAngle: angle + sweep });
    angle += sweep;
  });

  function polarToXY(cx, cy, r, a) {
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  function arcPath(seg, inflate) {
    var r = inflate ? R_OUT + 6 : R_OUT;
    var ri = inflate ? R_IN - 6 : R_IN;
    var midA = (seg.startAngle + seg.endAngle) / 2;
    var ox = inflate ? Math.cos(midA) * 6 : 0;
    var oy = inflate ? Math.sin(midA) * 6 : 0;
    var p1 = polarToXY(CX + ox, CY + oy, r,  seg.startAngle);
    var p2 = polarToXY(CX + ox, CY + oy, r,  seg.endAngle);
    var p3 = polarToXY(CX + ox, CY + oy, ri, seg.endAngle);
    var p4 = polarToXY(CX + ox, CY + oy, ri, seg.startAngle);
    var large = (seg.endAngle - seg.startAngle) > Math.PI ? 1 : 0;
    return [
      "M", p1.x.toFixed(2), p1.y.toFixed(2),
      "A", r, r, 0, large, 1, p2.x.toFixed(2), p2.y.toFixed(2),
      "L", p3.x.toFixed(2), p3.y.toFixed(2),
      "A", ri, ri, 0, large, 0, p4.x.toFixed(2), p4.y.toFixed(2),
      "Z"
    ].join(" ");
  }

  var hovSeg = hovSlice ? segments.find(function (s) { return s.slice.key === hovSlice; }) : null;
  var hovData = hovSeg ? hovSeg.slice : null;

  // Discretionary total
  var discretionary = computed.slices.filter(function (s) { return s.type === "discretionary"; })
    .reduce(function (a, s) { return a + s.amount; }, 0);

  return (
    <div>
      {tour.show && <Tour steps={tour.steps} onDone={tour.done} />}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>The Budget Dilemma</h2>
        <TourBtn onOpen={tour.reopen} />
      </div>

      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 10px" }}>
        To close the deficit, the government must cut spending or raise taxes. But both raising taxes and cutting popular programs is politically unpopular. This makes it hard for politicians to do either and as a result they increasingly just leave the budget deficit to be dealt with at some future date.
      </p>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 20 }}>
        {/* Donut chart */}
        <div style={{ flexShrink: 0 }}>
          <svg width="360" height="360" style={{ display: "block" }}>
            {segments.map(function (seg) {
              var isHov = hovSlice === seg.slice.key;
              var color = TYPE_COLORS[seg.slice.type];
              // Shade variants by slice within type
              return (
                <path key={seg.slice.key}
                  d={arcPath(seg, isHov)}
                  fill={color}
                  opacity={hovSlice ? (isHov ? 1 : 0.35) : 0.82}
                  stroke="#fff" strokeWidth="2"
                  style={{ cursor: "pointer", transition: "opacity 0.15s" }}
                  onMouseEnter={function () { setHovSlice(seg.slice.key); }}
                  onMouseLeave={function () { setHovSlice(null); }}
                  onClick={function () { setHovSlice(hovSlice === seg.slice.key ? null : seg.slice.key); }}
                />
              );
            })}
            {/* Center label */}
            <text x={CX} y={CY - 14} textAnchor="middle" fontSize="13" fill={MUTED}>FY{YEAR} spending</text>
            <text x={CX} y={CY + 10} textAnchor="middle" fontSize="22" fontWeight="800" fill={TEXT}>
              ${(computed.totalOutlays / 1e6).toFixed(1)}T
            </text>
            <text x={CX} y={CY + 30} textAnchor="middle" fontSize="12" fill={RED}>
              −{fmtAmt(computed.deficit)} deficit
            </text>
          </svg>
        </div>

        {/* Right panel — hover detail or legend */}
        <div style={{ flex: 1, minWidth: 220 }}>
          {hovData ? (
            <div style={{ background: "#f9fafb", borderRadius: 10, padding: "18px 20px", borderLeft: "4px solid " + TYPE_COLORS[hovData.type] }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: TYPE_COLORS[hovData.type], marginBottom: 4 }}>{hovData.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: TEXT, marginBottom: 8 }}>{fmtAmt(hovData.amount)}</div>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>{((hovData.amount / computed.totalOutlays) * 100).toFixed(1)}% of total spending</div>
              {hovData.type === "interest" && (
                <p style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, margin: 0 }}>
                  Interest payments are a legal obligation — missing them would constitute a sovereign default, destroying the US credit rating and triggering a global financial crisis.
                </p>
              )}
              {hovData.type === "mandatory" && (
                <p style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, margin: 0 }}>
                  "Mandatory" means spending is set by statute — anyone who meets eligibility criteria is entitled to benefits by law. Congress would have to pass new legislation to cut it.
                  {hovData.poll && hovData.pollSrc && (
                    <span style={{ display: "block", marginTop: 8, color: RED, fontWeight: 600 }}>
                      {hovData.poll} —{" "}
                      {hovData.pollUrl
                        ? <a href={hovData.pollUrl} target="_blank" rel="noreferrer" style={{ color: RED }}>{hovData.pollSrc}</a>
                        : hovData.pollSrc}
                    </span>
                  )}
                </p>
              )}
              {hovData.type === "discretionary" && (
                <p style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, margin: 0 }}>
                  Discretionary spending is set annually by Congress and is theoretically cuttable. But eliminating all of it — defense, education, infrastructure, foreign aid — would still leave a large deficit.
                  {hovData.poll && hovData.pollSrc && (
                    <span style={{ display: "block", marginTop: 8, color: RED, fontWeight: 600 }}>
                      {hovData.poll} —{" "}
                      {hovData.pollUrl
                        ? <a href={hovData.pollUrl} target="_blank" rel="noreferrer" style={{ color: RED }}>{hovData.pollSrc}</a>
                        : hovData.pollSrc}
                    </span>
                  )}
                </p>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.entries(TYPE_LABELS).map(function (e) {
                return (
                  <div key={e[0]} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: TYPE_COLORS[e[0]], flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{e[1]}</span>
                  </div>
                );
              })}
              <p style={{ fontSize: 15, fontWeight: 600, color: RED, margin: "12px 0 0", lineHeight: 1.6 }}>Mouse over a slice of the pie to see more details and polling data on program popularity.</p>
            </div>
          )}
        </div>
      </div>

      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 16px" }}>
        Why is "mandatory" spending actually mandatory? Programs like Social Security, Medicare, and Medicaid are set up so that anyone who meets the eligibility criteria is legally entitled to benefits. Cutting them requires passing new laws which is politically difficult. For example raising retirement ages or cutting benefits would be ways to reduce Social Security or Medicare payments. Medicaid pays for care for people with few economic resources which can include older people in nursing homes. Not surprisingly, 85% of Americans oppose cuts to Social Security and 75% oppose cuts to Medicaid.
      </p>
      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 16px" }}>
        Finally, every administration and every Congress since at least the 1980s has looked for waste, fraud, or abuse to try to reduce the deficit. None have made a significant difference. It is unlikely that there is much more to be found.
      </p>

      <p style={{ fontSize: 12, color: MUTED }}>
        Sources: <a href="https://www.whitehouse.gov/omb/information-resources/budget/historical-tables/" target="_blank" rel="noreferrer" style={{ color: BLUE }}>OMB Historical Tables FY{YEAR}</a>.
        {" "}Polling: <a href="https://navigatorresearch.org/a-majority-of-americans-oppose-cuts-to-social-security-and-medicare/" target="_blank" rel="noreferrer" style={{ color: BLUE }}>Navigator Research (Jan 2026)</a>;{" "}
        <a href="https://www.kff.org/medicaid/poll-finding/kff-health-tracking-poll-april-2025-publics-view-on-major-cuts-to-federal-health-agencies/" target="_blank" rel="noreferrer" style={{ color: BLUE }}>KFF Health Tracking Poll (April 2025)</a>;{" "}
        <a href="https://globalaffairs.org/research/public-opinion-survey/americans-prioritize-domestic-spending-over-foreign-aid" target="_blank" rel="noreferrer" style={{ color: BLUE }}>Chicago Council on Global Affairs (2024)</a>;{" "}
        <a href="https://www.pewresearch.org/politics/2019/04/11/little-public-support-for-reductions-in-federal-spending/" target="_blank" rel="noreferrer" style={{ color: BLUE }}>Pew Research (2019)</a>.
      </p>
    </div>
  );
}

/* ── III.d  Tax Page ─────────────────────── */
function TaxPage({ taxData, cboBaseline, cuts, setCuts, ratesRaw, setRatesRaw }) {
  var tour = useTour(13);

  // Parse CSV into lookup
  var brackets = useMemo(function () {
    if (!taxData) return [];
    return taxData;
  }, [taxData]);

  // Slider amounts come from CBO Feb 2026 baseline, anchored on the 2026 column.
  var baseline = useMemo(function () { return parseCboBaseline(cboBaseline); }, [cboBaseline]);

  var catAmounts = useMemo(function () {
    if (!baseline) return {};
    var out = {};
    SPEND_CATS.forEach(function (c) { out[c.key] = baseline.sliderAmount2026(c.key); });
    return out;
  }, [baseline]);

  function setCut(key, val) { setCuts(function (prev) { return Object.assign({}, prev, { [key]: val }); }); }
  var _mandOpen = useState(true); var mandatoryOpen = _mandOpen[0]; var setMandatoryOpen = _mandOpen[1];
  var _discOpen = useState(true); var discretionaryOpen = _discOpen[0]; var setDiscretionaryOpen = _discOpen[1];
  var spendingSavings = SPEND_CATS.reduce(function (sum, c) {
    return sum + ((cuts[c.key] || 0) / 100) * (catAmounts[c.key] || 0);
  }, 0); // billions saved

  var setRates = setRatesRaw;

  // Initialize from data once loaded
  var rates = useMemo(function () {
    if (ratesRaw) return ratesRaw;
    var init = {};
    brackets.forEach(function (b) { init[b.bucket] = b.effective_rate_pct; });
    return init;
  }, [ratesRaw, brackets]);

  function setRate(bucket, val) {
    setRates(function (prev) {
      var base = prev || {};
      if (!prev) { brackets.forEach(function (b) { base[b.bucket] = b.effective_rate_pct; }); }
      return Object.assign({}, base, { [bucket]: val });
    });
  }

  function resetRates() {
    setRatesRaw(null);
    setCuts({});
  }

  var isDirty = SPEND_CATS.some(function (c) { return (cuts[c.key] || 0) > 0; }) || brackets.some(function (b) {
    return rates[b.bucket] !== undefined && rates[b.bucket] !== b.effective_rate_pct;
  });

  // Additional revenue = delta from current rate * revenue_per_1pp.
  // (Tax brackets keep their existing math; we just sum the scenario revenue delta.)
  var additionalRevenue = useMemo(function () {
    return brackets.reduce(function (sum, b) {
      var currentRate = rates[b.bucket] !== undefined ? rates[b.bucket] : b.effective_rate_pct;
      var delta = currentRate - b.effective_rate_pct;
      return sum + (b.revenue_per_1pp_b * delta);
    }, 0);
  }, [brackets, rates]);

  // Year-by-year scenario projection using CBO Feb 2026 baseline.
  // Reframed math: compute each year's deficit *change* (baseline_deficit − scenario_deficit),
  // compound interest savings on running deficit reduction (~3.9% avg rate), then subtract
  // total savings from CBO's baseline 2034 debt path. This sidesteps "other means of financing"
  // and other below-the-line items that affect the debt stock — those are already baked into
  // CBO's published 2034 debt number.
  var projection = useMemo(function () {
    if (!baseline) return null;
    var running_savings = 0;       // cumulative deficit reduction + interest avoided, $B
    var direct_savings = 0;        // policy-driven deficit reduction (excludes interest), $B
    baseline.years.forEach(function (y) {
      // Baseline year totals
      var baseOutlay = 0;
      ["Social Security","Medicare","Medicaid","Other mandatory","Offsetting receipts","Defense","Nondefense","Net interest"]
        .forEach(function (s) { baseOutlay += baseline.get(s, y); });
      var baseRevenue = 0;
      ["Individual income tax","Payroll tax","Corporate income tax","Customs duties","Other revenue"]
        .forEach(function (s) { baseRevenue += baseline.get(s, y); });
      // Scenario adjustments — spending cuts allocated via OMB→CBO weights, tax delta annual.
      var spendCutY = 0;
      SPEND_CATS.forEach(function (c) {
        spendCutY += baseline.savingsForYear(c.key, cuts[c.key] || 0, y);
      });
      var scenarioOutlay = baseOutlay - spendCutY;
      var scenarioRevenue = baseRevenue + additionalRevenue;
      var year_direct_savings = (baseOutlay - baseRevenue) - (scenarioOutlay - scenarioRevenue);
      // Interest on prior-year cumulative savings (debt avoided last year doesn't accrue interest this year).
      var rate = baseline.get("Average interest rate", y) || 0.039;
      var year_interest_savings = running_savings * rate;
      direct_savings += year_direct_savings;
      running_savings += year_direct_savings + year_interest_savings;
    });
    var scenario_debt_2034 = baseline.baselineDebt2034 - running_savings;
    var scenario_debt_gdp  = scenario_debt_2034 / baseline.gdp2034 * 100;
    var baseline_debt_gdp  = baseline.baselineDebt2034 / baseline.gdp2034 * 100;
    var pp_delta = baseline_debt_gdp - scenario_debt_gdp;
    // GDP / private-investment impact is shown on the next page (Economic Feedback
    // Effects) via fiscal_multipliers.json's crowding_in ratio — intentionally not
    // duplicated here so the two pages don't double-display the same effect.
    return {
      scenario_debt_gdp: scenario_debt_gdp,
      baseline_debt_gdp: baseline_debt_gdp,
      pp_delta: pp_delta,
      cumulative_savings: direct_savings,       // policy savings (what user "did")
      total_with_interest: running_savings,     // policy + compounded interest avoided
    };
  }, [baseline, cuts, additionalRevenue]);

  var totalClosed = additionalRevenue + spendingSavings; // billions (annual, for slider summaries below)

  var BUCKET_COLORS = {
    "Under $25K":   "#4a8b6f",
    "$25K to $75K": "#3d7d60",
    "$75K to $200K":"#6b7a00",
    "$200K to $1M": "#dc2626",
    "Over $1M":     "#991b1b",
  };

  function setIncrease(bucket, val) {
    setIncreases(function (prev) {
      return Object.assign({}, prev, { [bucket]: val });
    });
  }

  var ORDER = ["Under $25K", "$25K to $75K", "$75K to $200K", "$200K to $1M", "Over $1M"];

  return (
    <div>
      {tour.show && <Tour steps={tour.steps} onDone={tour.done} />}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>Your Fiscal Scenario</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isDirty && (
            <button onClick={resetRates} style={{
              fontSize: 12, padding: "3px 12px", borderRadius: 6, cursor: "pointer",
              border: "1px solid " + BORDER, background: SURFACE, color: MUTED,
            }}>Reset</button>
          )}
          <TourBtn onOpen={tour.reopen} />
        </div>
      </div>

      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 10px" }}>
        Adjust the sliders below to build a fiscal scenario. Spending cuts and tax-rate changes are applied to <a href="https://www.cbo.gov/publication/61882" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO's February 2026 baseline projections</a> for each year 2026 through 2034. The meter at the top shows the resulting end-of-2034 debt-to-GDP ratio and the implied gain in private investment.
      </p>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.7, margin: "0 0 20px" }}>
        Note: Changes to the sliders below don't take into account how the economy might react to changes in the deficit and taxes. Increasing taxes could lead to less of a gain in revenue if, for example, there is more tax avoidance, people work fewer hours or more income is shifted into tax shelters. On the other hand, as explained before, lowering the deficit can increase future national income. The CBO's analysis of the 2017 tax cut showed that behavioral changes would offset about{" "}
        <a href="https://taxpolicycenter.org/briefing-book/what-are-dynamic-scoring-and-dynamic-analysis" target="_blank" rel="noreferrer" style={{ color: BLUE }}>27% of the effect of the tax cut on the deficit</a>{" "}
        relative to the estimate that didn't take behavioral reactions into account. On the other hand, when the Tax Policy Center performed a similar exercise for the tax proposals made by President Biden in his campaign it made{" "}
        <a href="https://taxpolicycenter.org/briefing-book/what-are-dynamic-scoring-and-dynamic-analysis" target="_blank" rel="noreferrer" style={{ color: BLUE }}>little difference</a>.
      </p>

      {/* 2034 Debt-to-GDP + implied GDP boost — year-by-year CBO projection */}
      {projection && (function () {
        var fillPct = Math.min(100, Math.max(0, (projection.pp_delta / projection.baseline_debt_gdp) * 100));
        var isImprove = projection.pp_delta > 0;
        return (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Projected 2034 Debt / GDP</span>
              <span style={{ fontSize: 11, color: MUTED }}>Baseline {projection.baseline_debt_gdp.toFixed(1)}%</span>
            </div>
            <div style={{ height: 14, background: "#fef2f2", borderRadius: 7, overflow: "hidden", display: "flex" }}>
              {isImprove && (
                <div style={{ height: "100%", width: fillPct + "%", background: BLOCK_POS, transition: "width 0.2s ease" }} />
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, gap: 12 }}>
              <span style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                Applies your slider changes to <a href="https://www.cbo.gov/publication/61882" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO's Feb 2026 baseline</a> year by year (2026–2034). Excludes interest savings and behavioral effects.
              </span>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: MUTED, display: "block" }}>Your scenario</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: isImprove ? BLOCK_POS : TEXT }}>
                  {projection.scenario_debt_gdp.toFixed(1)}%
                  {Math.abs(projection.pp_delta) > 0.05 && (
                    <span style={{ fontSize: 12, fontWeight: 500, color: MUTED, marginLeft: 6 }}>
                      ({projection.pp_delta > 0 ? "−" : "+"}{Math.abs(projection.pp_delta).toFixed(1)} pp)
                    </span>
                  )}
                </span>
              </div>
            </div>
            {Math.abs(projection.cumulative_savings) > 1 && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: isImprove ? "#f0fdf4" : "#fef2f2", borderRadius: 6, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                Cumulative 9-year deficit change: <strong style={{ color: isImprove ? BLOCK_POS : BLOCK_NEG }}>{projection.cumulative_savings > 0 ? "−" : "+"}{fmtAmt(Math.abs(projection.cumulative_savings) * 1000)}</strong>.
              </div>
            )}
          </div>
        );
      })()}

      {/* Section I — Spending */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 10px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: BLOCK_POS, textTransform: "uppercase", letterSpacing: 1.5, whiteSpace: "nowrap" }}>Spending Cuts</div>
        <div style={{ flex: 1, height: 1, background: BLOCK_POS, opacity: 0.25 }} />
      </div>

      {/* Mandatory sub-section */}
      {(function () {
        var cats = SPEND_CATS.filter(function (c) { return c.type === "mandatory"; });
        var groupSavings = cats.reduce(function (s, c) { return s + ((cuts[c.key] || 0) / 100) * (catAmounts[c.key] || 0); }, 0);
        return (
          <div style={{ marginBottom: 10 }}>
            <button onClick={function () { setMandatoryOpen(!mandatoryOpen); }} style={{
              width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
              padding: "9px 14px", cursor: "pointer", textAlign: "left",
              marginBottom: mandatoryOpen ? 8 : 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: RED, whiteSpace: "nowrap" }}>Mandatory Spending</span>
                <span style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Social Security · Medicare · Medicaid · Income Security
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {groupSavings > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: BLOCK_POS }}>+{fmtAmt(groupSavings * 1000)}/yr</span>}
                <span style={{ fontSize: 12, color: MUTED }}>{mandatoryOpen ? "▾" : "▸"}</span>
              </div>
            </button>
            {mandatoryOpen && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {cats.map(function (cat) {
                  var amt = catAmounts[cat.key] || 0;
                  var pct = cuts[cat.key] || 0;
                  var saved = (pct / 100) * amt;
                  return (
                    <div key={cat.key} style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px", border: "1px solid " + BORDER }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: RED }}>{cat.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: saved > 0 ? BLOCK_POS : MUTED, whiteSpace: "nowrap", marginLeft: 6 }}>
                          {saved > 0 ? "+" + fmtAmt(saved * 1000) : fmtAmt(amt * 1000)}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: MUTED, marginBottom: 6 }}>{pct > 0 ? pct + "% cut" : "No cut"}</div>
                      <input type="range" min={0} max={100} step={1} value={pct}
                        onChange={function (e) { setCut(cat.key, Number(e.target.value)); }}
                        style={{ width: "100%", accentColor: pct > 0 ? "#ef4444" : MUTED, cursor: "grab" }} />
                      {pct > 0 && SPEND_IMPACT[cat.key] && (
                        <div style={{ fontSize: 10, color: "#92400e", marginTop: 5, lineHeight: 1.4, borderTop: "1px dashed #fde68a", paddingTop: 4 }}>
                          ≈ {fmtImpact(Math.round(saved * SPEND_IMPACT[cat.key].per_billion))} {SPEND_IMPACT[cat.key].label}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Discretionary sub-section */}
      {(function () {
        var cats = SPEND_CATS.filter(function (c) { return c.type === "discretionary"; });
        var groupSavings = cats.reduce(function (s, c) { return s + ((cuts[c.key] || 0) / 100) * (catAmounts[c.key] || 0); }, 0);
        return (
          <div style={{ marginBottom: 24 }}>
            <button onClick={function () { setDiscretionaryOpen(!discretionaryOpen); }} style={{
              width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8,
              padding: "9px 14px", cursor: "pointer", textAlign: "left",
              marginBottom: discretionaryOpen ? 8 : 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: BLOCK_POS, whiteSpace: "nowrap" }}>Discretionary Spending</span>
                <span style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Defense · Veterans · Education · All Other
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {groupSavings > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: BLOCK_POS }}>+{fmtAmt(groupSavings * 1000)}/yr</span>}
                <span style={{ fontSize: 12, color: MUTED }}>{discretionaryOpen ? "▾" : "▸"}</span>
              </div>
            </button>
            {discretionaryOpen && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {cats.map(function (cat) {
                  var amt = catAmounts[cat.key] || 0;
                  var pct = cuts[cat.key] || 0;
                  var saved = (pct / 100) * amt;
                  return (
                    <div key={cat.key} style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px", border: "1px solid " + BORDER }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: BLOCK_POS }}>{cat.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: saved > 0 ? BLOCK_POS : MUTED, whiteSpace: "nowrap", marginLeft: 6 }}>
                          {saved > 0 ? "+" + fmtAmt(saved * 1000) : fmtAmt(amt * 1000)}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: MUTED, marginBottom: 6 }}>{pct > 0 ? pct + "% cut" : "No cut"}</div>
                      <input type="range" min={0} max={100} step={1} value={pct}
                        onChange={function (e) { setCut(cat.key, Number(e.target.value)); }}
                        style={{ width: "100%", accentColor: pct > 0 ? "#22c55e" : MUTED, cursor: "grab" }} />
                      {pct > 0 && SPEND_IMPACT[cat.key] && (
                        <div style={{ fontSize: 10, color: "#166534", marginTop: 5, lineHeight: 1.4, borderTop: "1px dashed #bbf7d0", paddingTop: 4 }}>
                          ≈ {fmtImpact(Math.round(saved * SPEND_IMPACT[cat.key].per_billion))} {SPEND_IMPACT[cat.key].label}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Section II — Tax Increases */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: RED, textTransform: "uppercase", letterSpacing: 1.5, whiteSpace: "nowrap" }}>Tax Increases</div>
        <div style={{ flex: 1, height: 1, background: RED, opacity: 0.25 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
        {ORDER.map(function (bucketName) {
          var b = brackets.find(function (x) { return x.bucket === bucketName; });
          if (!b) return null;
          var currentRate = rates[bucketName] !== undefined ? rates[bucketName] : b.effective_rate_pct;
          var delta  = currentRate - b.effective_rate_pct;
          var added  = b.revenue_per_1pp_b * delta;
          var color  = BUCKET_COLORS[bucketName];
          return (
            <Card key={bucketName} style={{ borderLeft: "4px solid " + color, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: color }}>{bucketName}</div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                    {b.num_returns_millions.toFixed(1)}M returns · ${(b.taxable_income_b / 1000).toFixed(2)}T taxable income · current effective rate {b.effective_rate_pct}%
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: MUTED }}>Additional revenue</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: added > 0 ? color : added < 0 ? RED : MUTED }}>
                    {added > 0 ? "+" + fmtAmt(added * 1000) : added < 0 ? "-" + fmtAmt(Math.abs(added) * 1000) : "—"}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>0%</span>
                <input type="range" min={0} max={100} step={0.5} value={currentRate}
                  onChange={function (e) { setRate(bucketName, Number(e.target.value)); }}
                  style={{ flex: 1, accentColor: delta === 0 ? MUTED : delta > 0 ? color : RED, cursor: "grab" }} />
                <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>100%</span>
                <div style={{ minWidth: 110, textAlign: "right" }}>
                  {delta !== 0 ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: delta > 0 ? color : RED }}>
                      {b.effective_rate_pct}% → {currentRate.toFixed(1)}%
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, color: MUTED }}>{b.effective_rate_pct}% (current)</span>
                  )}
                </div>
              </div>

              {/* Revenue per pp callout */}
              <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
                Each percentage point raises ~${b.revenue_per_1pp_b.toFixed(1)}B/year
              </div>
            </Card>
          );
        })}
      </div>

      {/* Summary if anything selected — per-slider breakdown (annual, 2026 anchored).
          The 2034 debt/GDP impact lives in the meter at the top of the page. */}
      {(additionalRevenue !== 0 || spendingSavings > 0) && (
        <div style={{ background: SURFACE, borderRadius: 10, padding: "16px 20px", marginBottom: 20, borderLeft: "4px solid " + BLOCK_POS, border: "1px solid " + BORDER }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 8 }}>What your scenario does <span style={{ fontWeight: 400, color: MUTED, fontSize: 12 }}>(annual, anchored on 2026 CBO baseline)</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: TEXT }}>
            {spendingSavings > 0 && SPEND_CATS.filter(function (c) { return (cuts[c.key] || 0) > 0; }).map(function (c) {
              var saved = ((cuts[c.key] || 0) / 100) * (catAmounts[c.key] || 0);
              return (
                <div key={c.key} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: BLOCK_POS }}>{c.label} cut ({cuts[c.key]}%)</span>
                  <span style={{ color: BLOCK_POS }}>+{fmtAmt(saved * 1000)}/yr</span>
                </div>
              );
            })}
            {ORDER.map(function (bucketName) {
              var b   = brackets.find(function (x) { return x.bucket === bucketName; });
              var cr = rates[bucketName] !== undefined ? rates[bucketName] : b.effective_rate_pct;
              var d  = cr - b.effective_rate_pct;
              if (d === 0 || !b) return null;
              var rev = b.revenue_per_1pp_b * d;
              return (
                <div key={bucketName} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: BUCKET_COLORS[bucketName] }}>{bucketName}: {b.effective_rate_pct}% → {cr.toFixed(1)}%</span>
                  <span style={{ color: d > 0 ? BUCKET_COLORS[bucketName] : RED }}>{d > 0 ? "+" : ""}{fmtAmt(rev * 1000)}/yr</span>
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid " + BORDER, paddingTop: 6, marginTop: 4, fontWeight: 700 }}>
              <span>Annual deficit change (2026)</span>
              <span style={{ color: totalClosed > 0 ? BLOCK_POS : BLOCK_NEG }}>{totalClosed > 0 ? "−" : "+"}{fmtAmt(Math.abs(totalClosed) * 1000)}</span>
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
              See the meter above for the compounded 2034 debt/GDP impact, which scales each cut against CBO's year-by-year projection (mandatory programs grow faster than discretionary).
            </div>
          </div>
        </div>
      )}

      <p style={{ fontSize: 12, color: MUTED }}>
        Source: <a href="https://www.irs.gov/statistics/soi-tax-stats-individual-income-tax-returns-complete-report-publication-1304" target="_blank" rel="noreferrer" style={{ color: BLUE }}>IRS Statistics of Income, Publication 1304, Table 1.4, Tax Year 2023</a>.
        Static scoring only — does not account for behavioral responses or supply-side effects.
      </p>

      <div style={{ textAlign: "center", marginTop: 24, paddingTop: 20, borderTop: "1px solid " + BORDER }}>
        <a href="/obbba/" style={{
          display: "inline-block", padding: "10px 24px", background: BLUE, color: "#fff",
          borderRadius: 8, textDecoration: "none", fontSize: 15, fontWeight: 600,
        }}>← Back to the Impact Map</a>
      </div>
    </div>
  );
}


/* ── III.e  Economic Feedback Effects ──────── */
function EconomicImpactPage({ taxData, cboBaseline, cuts, ratesRaw, multipliersData }) {
  var tour = useTour(14);

  var brackets = useMemo(function () {
    if (!taxData) return [];
    return taxData;
  }, [taxData]);

  var rates = useMemo(function () {
    if (ratesRaw) return ratesRaw;
    var init = {};
    brackets.forEach(function (b) { init[b.bucket] = b.effective_rate_pct; });
    return init;
  }, [ratesRaw, brackets]);

  // Slider amounts mirror TaxPage — anchored on CBO Feb 2026 baseline via the
  // OMB→CBO mapping. Keeps page 13 and page 14 dollar amounts consistent.
  var baseline = useMemo(function () { return parseCboBaseline(cboBaseline); }, [cboBaseline]);
  var catAmounts = useMemo(function () {
    if (!baseline) return {};
    var out = {};
    SPEND_CATS.forEach(function (c) { out[c.key] = baseline.sliderAmount2026(c.key); });
    return out;
  }, [baseline]);

  // Index multiplier data by key for O(1) lookup
  var spendMultMap = useMemo(function () {
    if (!multipliersData) return {};
    var m = {};
    multipliersData.spending_multipliers.forEach(function (x) { m[x.category] = x.estimate; });
    return m;
  }, [multipliersData]);

  var taxMultMap = useMemo(function () {
    if (!multipliersData) return {};
    var m = {};
    multipliersData.tax_multipliers.forEach(function (x) { m[x.bucket] = x.estimate; });
    return m;
  }, [multipliersData]);

  var behavMap = useMemo(function () {
    if (!multipliersData) return {};
    var m = {};
    multipliersData.behavioral_offsets.forEach(function (x) { m[x.bucket] = x.estimate; });
    return m;
  }, [multipliersData]);

  var crowdInRatio = multipliersData ? multipliersData.crowding_in.gdp_per_dollar_deficit_reduction_central : 0.5;

  // 2026 nominal GDP from CBO Feb 2026 baseline; used only for the % display in this page.
  var US_GDP_REF = baseline ? baseline.gdp2026 : 31902;

  // Core calculations
  var staticSpendSaved = SPEND_CATS.reduce(function (sum, c) {
    return sum + ((cuts[c.key] || 0) / 100) * (catAmounts[c.key] || 0);
  }, 0);

  var staticRevByBracket = useMemo(function () {
    var m = {};
    brackets.forEach(function (b) {
      var cr = rates[b.bucket] !== undefined ? rates[b.bucket] : b.effective_rate_pct;
      m[b.bucket] = (cr - b.effective_rate_pct) * b.revenue_per_1pp_b;
    });
    return m;
  }, [brackets, rates]);

  var staticTaxRev = brackets.reduce(function (sum, b) {
    return sum + (staticRevByBracket[b.bucket] || 0);
  }, 0);

  var totalBehavLoss = brackets.reduce(function (sum, b) {
    var rev = staticRevByBracket[b.bucket] || 0;
    return sum + Math.max(0, rev) * (behavMap[b.bucket] || 0);
  }, 0);

  var dynamicTaxRev      = staticTaxRev - totalBehavLoss;
  var dynamicDeficitRed  = staticSpendSaved + dynamicTaxRev;

  var gdpDragSpending = SPEND_CATS.reduce(function (sum, c) {
    var saved = ((cuts[c.key] || 0) / 100) * (catAmounts[c.key] || 0);
    return sum + saved * (spendMultMap[c.key] || 1.0);
  }, 0);

  var gdpDragTax = brackets.reduce(function (sum, b) {
    var rev = staticRevByBracket[b.bucket] || 0;
    return sum + Math.max(0, rev) * (taxMultMap[b.bucket] || 0.5);
  }, 0);

  var totalGDPDrag   = gdpDragSpending + gdpDragTax;
  var longRunGDPGain = dynamicDeficitRed * crowdInRatio;

  var hasChanges = staticSpendSaved > 0 || staticTaxRev !== 0;

  var ORDER = ["Under $25K", "$25K to $75K", "$75K to $200K", "$200K to $1M", "Over $1M"];
  var BUCKET_COLORS = {
    "Under $25K": "#4a8b6f", "$25K to $75K": "#3d7d60", "$75K to $200K": "#6b7a00",
    "$200K to $1M": "#dc2626", "Over $1M": "#991b1b",
  };

  function pctGDP(b) { return (Math.abs(b) / US_GDP_REF * 100).toFixed(2); }

  return (
    <div>
      {tour.show && <Tour steps={tour.steps} onDone={tour.done} />}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>Economic Feedback Effects</h2>
        <TourBtn onOpen={tour.reopen} />
      </div>

      <p style={{ fontSize: 15, color: TEXT, lineHeight: 1.75, margin: "0 0 8px" }}>
        The previous page showed the static changes in our deficit. However, drastic changes in government programs have effects on the rest of the economy. Businesses and taxpayers react to tax cuts, for example, by producing and investing more, growing the overall economy. At the same time, spending cuts force people who receive government funding, like federal employees, researchers on government grants, or recipients of welfare, to spend and produce less. These effects are difficult to estimate precisely, but you can see how national incomes might change as a response to your plan.
      </p>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: "0 0 24px" }}>
        Note: Spending-demand multipliers are drawn from CBO's ARRA analyses (2009–2015), which assume a near-zero interest-rate environment. Today's multipliers may be somewhat lower. All figures are annual unless stated otherwise.
      </p>

      {!hasChanges ? (
        <Card style={{ background: "#f8fafc", border: "1px dashed " + BORDER, textAlign: "center", padding: "36px 24px" }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>←</div>
          <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.6 }}>
            Go back to the previous page and move the sliders to see economic feedback effects.
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Card 1 — Adjusted Revenue Estimate */}
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 14 }}>
              Adjusted Revenue Estimate
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: TEXT }}>
                <span>Static tax revenue change</span>
                <span style={{ fontWeight: 600, color: staticTaxRev >= 0 ? BLOCK_POS : BLOCK_NEG }}>
                  {staticTaxRev >= 0 ? "+" : ""}{fmtAmt(staticTaxRev * 1000)}/yr
                </span>
              </div>
              {totalBehavLoss > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: TEXT }}>
                  <span>
                    − Behavioral offset{" "}
                    <span style={{ fontSize: 12, color: MUTED }}>(avoidance, sheltering, income shifting)</span>
                  </span>
                  <span style={{ fontWeight: 600, color: BLOCK_NEG }}>−{fmtAmt(totalBehavLoss * 1000)}/yr</span>
                </div>
              )}
              <div style={{ borderTop: "1px solid " + BORDER, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700 }}>
                <span>Dynamic tax revenue</span>
                <span style={{ color: dynamicTaxRev >= 0 ? BLOCK_POS : BLOCK_NEG }}>
                  {dynamicTaxRev >= 0 ? "+" : ""}{fmtAmt(dynamicTaxRev * 1000)}/yr
                </span>
              </div>
              {staticSpendSaved > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700 }}>
                  <span>Spending savings (unchanged)</span>
                  <span style={{ color: BLOCK_POS }}>+{fmtAmt(staticSpendSaved * 1000)}/yr</span>
                </div>
              )}
              <div style={{ borderTop: "2px solid " + BORDER, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800 }}>
                <span>Dynamic deficit reduction</span>
                <span style={{ color: dynamicDeficitRed > 0 ? BLOCK_POS : BLOCK_NEG }}>
                  {dynamicDeficitRed > 0 ? "+" : ""}{fmtAmt(dynamicDeficitRed * 1000)}/yr
                </span>
              </div>
            </div>
            {totalBehavLoss > 0 && (
              <div style={{ marginTop: 12, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                Per-bracket behavioral offsets: JCT macroeconomic analysis of the 2017 Tax Cuts and Jobs Act (JCX-69-17). Overall ~26% dynamic offset concentrated at top brackets.
              </div>
            )}
          </Card>

          {/* Card 2 — Year-1 GDP Impact */}
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 14 }}>
              Year-1 GDP Impact
            </div>
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.55, margin: "0 0 14px" }}>
              Fiscal multipliers measure how much GDP changes per $1 of spending cut or tax increase in the first year. A multiplier of 1.5 means a $100B cut reduces GDP by about $150B.
            </p>
            {gdpDragSpending > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Spending cuts</div>
                {SPEND_CATS.filter(function (c) { return (cuts[c.key] || 0) > 0; }).map(function (c) {
                  var saved = ((cuts[c.key] || 0) / 100) * (catAmounts[c.key] || 0);
                  var drag  = saved * (spendMultMap[c.key] || 1.0);
                  return (
                    <div key={c.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: TEXT, marginBottom: 4 }}>
                      <span>{c.label} <span style={{ fontSize: 11, color: MUTED }}>× {(spendMultMap[c.key] || 1.0).toFixed(1)} multiplier</span></span>
                      <span style={{ color: BLOCK_NEG, fontWeight: 600 }}>−{fmtAmt(drag * 1000)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {gdpDragTax > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Tax increases</div>
                {ORDER.map(function (bucket) {
                  var rev = staticRevByBracket[bucket] || 0;
                  if (rev <= 0) return null;
                  var drag = rev * (taxMultMap[bucket] || 0.5);
                  return (
                    <div key={bucket} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: TEXT, marginBottom: 4 }}>
                      <span style={{ color: BUCKET_COLORS[bucket] }}>{bucket} <span style={{ fontSize: 11, color: MUTED }}>× {(taxMultMap[bucket] || 0.5).toFixed(1)} multiplier</span></span>
                      <span style={{ color: BLOCK_NEG, fontWeight: 600 }}>−{fmtAmt(drag * 1000)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ borderTop: "2px solid " + BORDER, paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800 }}>
              <span>Total year-1 GDP drag</span>
              <span style={{ color: BLOCK_NEG }}>−{fmtAmt(totalGDPDrag * 1000)} ({pctGDP(totalGDPDrag)}% of GDP)</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
              Source: CBO, "Estimated Impact of the American Recovery and Reinvestment Act" (Feb 2015), Table 2 multiplier ranges. Estimates reflect a near-ZLB environment; current-period multipliers may be somewhat lower. Effects fade as the economy adjusts — typically most of the demand drag resolves within 2–3 years.
            </div>
          </Card>

          {/* Card 3 — Long-run Crowding-in */}
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 14 }}>
              Long-run GDP Gain (≈10 Years)
            </div>
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.55, margin: "0 0 14px" }}>
              A lower deficit means the government borrows less, leaving more capital available for private investment. That investment raises the productive capital stock and grows the economy over the long run — the crowding-in effect.
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, fontWeight: 800 }}>
              <span>Crowding-in GDP gain</span>
              <span style={{ color: longRunGDPGain > 0 ? BLOCK_POS : MUTED }}>
                {longRunGDPGain > 0 ? "+" : ""}{fmtAmt(longRunGDPGain * 1000)}/yr (+{pctGDP(longRunGDPGain)}% of GDP)
              </span>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: MUTED }}>
              Applies to dynamic deficit reduction of {fmtAmt(dynamicDeficitRed * 1000)}/yr × {crowdInRatio} (CBO central estimate)
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
              Source: CBO, "The Long-Run Effects of Federal Budget Deficits on National Saving, Private Domestic Investment, and International Capital Flows" (2013). Central estimate: $1 deficit reduction → $0.50 additional GDP by ≈year 10 (via capital-stock channel). This is a long-run steady-state effect, not a year-1 figure.
            </div>
          </Card>

          {/* Net summary callout */}
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: "16px 20px", border: "1px solid " + BORDER }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 10 }}>Bottom line</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: TEXT }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Short-run cost (year-1 GDP contraction)</span>
                <span style={{ color: BLOCK_NEG, fontWeight: 600 }}>−{fmtAmt(totalGDPDrag * 1000)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Long-run benefit (annual GDP gain by ~2034)</span>
                <span style={{ color: BLOCK_POS, fontWeight: 600 }}>+{fmtAmt(longRunGDPGain * 1000)}/yr</span>
              </div>
              <div style={{ borderTop: "1px solid " + BORDER, paddingTop: 6, fontSize: 12, color: MUTED, lineHeight: 1.55 }}>
                These effects work in opposite directions on different timescales. The short-run contraction typically fades within 2–3 years. The long-run gain accumulates gradually as deficit reduction compounds over time.
              </div>
            </div>
          </div>

        </div>
      )}

      <p style={{ fontSize: 12, color: MUTED, marginTop: 20 }}>
        Multiplier sources:{" "}
        <a href="https://www.cbo.gov/publication/49958" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO ARRA analysis (2015)</a>;{" "}
        <a href="https://www.journals.uchicago.edu/doi/abs/10.1086/701424" target="_blank" rel="noreferrer" style={{ color: BLUE }}>Zidar (2019), JPE</a>;{" "}
        <a href="https://www.jct.gov/publications/2017/jcx-69-17/" target="_blank" rel="noreferrer" style={{ color: BLUE }}>JCT TCJA analysis (2017)</a>;{" "}
        <a href="https://www.cbo.gov/sites/default/files/cbofiles/attachments/45140-NSPDI_workingPaper.pdf" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO deficit-investment working paper (2013)</a>.
        Point estimates used; actual effects depend on monetary policy, economic conditions, and policy interactions.
      </p>
    </div>
  );
}


// ─────────────────────────────────────────────
// REPRESENTATIVES PAGE — helpers
// ─────────────────────────────────────────────

function partyCode(party) {
  if (party === "Republican") return "R";
  if (party === "Democrat" || party === "Democratic") return "D";
  return "I";
}

function partyBgColor(party) {
  var code = partyCode(party);
  if (code === "R") return "#dc2626";
  if (code === "D") return "#1d4ed8";
  return "#7c3aed";
}

function voteStyle(optKey, cboCost, emergency) {
  if (!optKey) return { bg: "transparent", text: MUTED, label: "—" };
  var k = String(optKey);
  if (k === "+" || k === "yea") {
    if (emergency) return { bg: "#fffbeb", text: "#92400e", label: "Yea" };
    return cboCost > 0
      ? { bg: "#fef2f2", text: "#991b1b", label: "Yea" }
      : { bg: "#f0fdf4", text: "#166534", label: "Yea" };
  }
  if (k === "-" || k === "nay") {
    return cboCost > 0
      ? { bg: "#f0fdf4", text: "#166534", label: "Nay" }
      : { bg: "#fefce8", text: "#854d0e", label: "Nay" };
  }
  if (k === "0") return { bg: "#f9fafb", text: MUTED, label: "Absent" };
  if (k === "P") return { bg: "#f9fafb", text: MUTED, label: "Present" };
  if (k === "voice") return { bg: "#f9fafb", text: MUTED, label: "Voice vote" };
  return { bg: "transparent", text: MUTED, label: k };
}

function fmtCBO(b) {
  var abs = Math.abs(b);
  var sign = b >= 0 ? "+" : "−";
  if (abs >= 1000) return sign + "$" + (abs / 1000).toFixed(1) + "T";
  return sign + "$" + Math.round(abs) + "B";
}

var US_STATE_LIST = [
  "AK","AL","AR","AZ","CA","CO","CT","DC","DE","FL","GA","HI",
  "IA","ID","IL","IN","KS","KY","LA","MA","MD","ME","MI","MN",
  "MO","MS","MT","NC","ND","NE","NH","NJ","NM","NV","NY","OH",
  "OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA",
  "WI","WV","WY",
];

// ─────────────────────────────────────────────
// REP CARD
// ─────────────────────────────────────────────

function RepCard({ rep, keyVotesData, rollCalls }) {
  var _imgErr = useState(false); var imgErr = _imgErr[0]; var setImgErr = _imgErr[1];

  var pc     = partyCode(rep.party);
  var pColor = partyBgColor(rep.party);
  var isSen  = rep.chamber === "senate";
  var label  = isSen ? "Sen." : "Rep.";
  var locStr = isSen ? rep.state : rep.state + "-" + rep.district;

  var voteRows = useMemo(function () {
    if (!keyVotesData) return [];
    return keyVotesData.votes.map(function (bill) {
      var isVoiceVote  = bill.id === "cares_2020" && !isSen;
      var wasInOffice  = rep.first_elected_year <= bill.year;

      var optKey = null;
      if (isVoiceVote) {
        optKey = "voice";
      } else if (wasInOffice) {
        var chamber = isSen ? "senate" : "house";
        var map = rollCalls && rollCalls[bill.id] && rollCalls[bill.id][chamber];
        if (map) optKey = map[rep.bioguide_id] || null;
      }
      return { bill: bill, optKey: optKey, wasInOffice: wasInOffice, isVoiceVote: isVoiceVote };
    });
  }, [keyVotesData, rollCalls, rep, isSen]);

  return (
    <div style={{
      background: SURFACE, borderRadius: 12, border: "1px solid " + BORDER,
      boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
      width: 280, minWidth: 260, flexShrink: 0, flexGrow: 1, maxWidth: 320,
      display: "flex", flexDirection: "column",
    }}>

      {/* Header */}
      <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid " + BORDER, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flexShrink: 0 }}>
          {!imgErr ? (
            <img
              src={"https://bioguide.congress.gov/photo/" + rep.bioguide_id + ".jpg"}
              onError={function () { setImgErr(true); }}
              alt={rep.name.official_full}
              style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid " + BORDER }}
            />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: MUTED, flexShrink: 0 }}>
              {rep.name.first[0]}{rep.name.last[0]}
            </div>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: TEXT, lineHeight: 1.25, marginBottom: 4 }}>
            {label} {rep.name.official_full}
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ background: pColor, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>{pc}</span>
            <span style={{ fontSize: 11, color: MUTED }}>{locStr}</span>
            <span style={{ fontSize: 10, color: MUTED }}>· Since {rep.first_elected_year}</span>
          </div>
        </div>
      </div>

      {/* Vote table */}
      <div style={{ padding: "10px 14px", flexGrow: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>
          Vote record · CBO 10-yr cost/savings
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
          <tbody>
            {voteRows.map(function (row) {
              var st     = row.wasInOffice ? voteStyle(row.optKey, row.bill.cbo_10yr_b, row.bill.emergency) : null;
              var cboClr = row.bill.cbo_10yr_b > 0 ? BLOCK_NEG : BLOCK_POS;
              return (
                <tr key={row.bill.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "3.5px 4px 3.5px 0", whiteSpace: "nowrap" }}>
                    {row.bill.wikipedia_url ? (
                      <a href={row.bill.wikipedia_url} target="_blank" rel="noreferrer"
                        aria-label={row.bill.name + " (opens Wikipedia)"}
                        title={row.bill.name + " (" + row.bill.year + ")\n" + row.bill.description}
                        style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2 }}>
                        {row.bill.short_name}
                      </a>
                    ) : (
                      <span style={{ color: TEXT, fontWeight: 600 }}
                        title={row.bill.name + " (" + row.bill.year + ")\n" + row.bill.description}>
                        {row.bill.short_name}</span>
                    )}
                  </td>
                  <td style={{ padding: "3.5px 3px", color: MUTED, whiteSpace: "nowrap" }}>{row.bill.year}</td>
                  <td style={{ padding: "3.5px 4px", color: cboClr, fontWeight: 600, whiteSpace: "nowrap", textAlign: "right" }}>{fmtCBO(row.bill.cbo_10yr_b)}</td>
                  <td style={{ padding: "3.5px 0 3.5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {!row.wasInOffice ? (
                      <span style={{ fontSize: 9, color: MUTED }}>Not in office</span>
                    ) : st ? (
                      <span style={{ background: st.bg, color: st.text, fontSize: 9.5, fontWeight: 700, padding: "2px 6px", borderRadius: 4, display: "inline-block" }}>
                        {st.label}
                      </span>
                    ) : (
                      <span style={{ fontSize: 9, color: MUTED }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Legend */}
        <div style={{ display: "flex", gap: 10, marginTop: 7, fontSize: 9, color: MUTED, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#fef2f2", border: "1px solid #fca5a5", display: "inline-block" }} />
            Voted for cost
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#f0fdf4", border: "1px solid #86efac", display: "inline-block" }} />
            Voted for savings
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#fefce8", border: "1px solid #fde047", display: "inline-block" }} />
            Blocked savings
          </span>
        </div>
      </div>

      {rollCalls === null && (
        <div style={{ padding: "8px 14px", borderTop: "1px solid " + BORDER, fontSize: 10, color: MUTED }}>
          Vote record loading…
        </div>
      )}

      {/* Contact footer */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid " + BORDER, display: "flex", gap: 7, flexWrap: "wrap" }}>
        {rep.phone && (
          <a href={"tel:1" + rep.phone.replace(/\D/g, "")}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: "#1e3a5f", background: "#eff6ff", borderRadius: 6, padding: "5px 9px", textDecoration: "none", border: "1px solid #bfdbfe" }}>
            📞 {rep.phone}
          </a>
        )}
        {rep.website && (
          <a href={rep.website} target="_blank" rel="noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: TEXT, background: "#f9fafb", borderRadius: 6, padding: "5px 9px", textDecoration: "none", border: "1px solid " + BORDER }}>
            Website →
          </a>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// REPRESENTATIVES PAGE
// ─────────────────────────────────────────────

function RepresentativesPageA({ legislators, keyVotesData, rollCalls, zipDistricts }) {
  var _zip       = useState("");  var zipInput = _zip[0]; var setZipInput = _zip[1];
  var _reps      = useState(null); var foundReps = _reps[0]; var setFoundReps = _reps[1];
  var _err       = useState(null); var error = _err[0]; var setError = _err[1];
  var _manual    = useState(false); var showManual = _manual[0]; var setShowManual = _manual[1];
  var _selState  = useState(""); var selState = _selState[0]; var setSelState = _selState[1];
  var _selDist   = useState(""); var selDist = _selDist[0]; var setSelDist = _selDist[1];
  var _multiOpts = useState(null); var multiOpts = _multiOpts[0]; var setMultiOpts = _multiOpts[1];

  var districtsByState = useMemo(function () {
    if (!legislators) return {};
    var out = {};
    legislators.forEach(function (r) {
      if (r.chamber !== "house" || r.district === null) return;
      if (!out[r.state]) out[r.state] = [];
      if (!out[r.state].includes(r.district)) out[r.state].push(r.district);
    });
    return out;
  }, [legislators]);

  function doLookup(state, district) {
    if (!legislators) return;
    var d = district === null ? null : Number(district);
    var senators  = legislators.filter(function (r) { return r.chamber === "senate" && r.state === state; });
    var houseMems = legislators.filter(function (r) {
      if (r.chamber !== "house" || r.state !== state) return false;
      if (d === null) return true;                 // at-large fallback
      return r.district === d || (d === 0 && r.district === 0);
    });
    if (senators.length === 0 && houseMems.length === 0) {
      setError("No representatives found for " + state + (d ? " district " + d : "") + ". Check your ZIP or try the manual selector.");
      setFoundReps(null);
      return;
    }
    setError(null);
    setFoundReps({ state: state, district: d, senators: senators, houseMember: houseMems[0] || null, zipUsed: zipInput });
  }

  function handleZipSubmit(e) {
    e.preventDefault();
    var z = zipInput.trim();
    if (!/^\d{5}$/.test(z)) { setError("Please enter a valid 5-digit ZIP code."); return; }
    if (!zipDistricts) {
      setShowManual(true);
      setError("ZIP lookup data hasn't loaded yet — use the manual selector below.");
      return;
    }
    var val = zipDistricts[z];
    if (!val) {
      setError("ZIP " + z + " not found. Try the manual selector below.");
      setShowManual(true);
      return;
    }
    // val is "STATE-DISTRICT" e.g. "NY-8" or could be an array ["NY-8","NY-9"]
    var vals = Array.isArray(val) ? val : [val];
    if (vals.length > 1) {
      setMultiOpts(vals);
      setFoundReps(null);
      setError(null);
      return;
    }
    setMultiOpts(null);
    var parts = vals[0].split("-");
    var state = parts[0];
    var dist  = parts.length > 1 ? parseInt(parts[1]) : null;
    doLookup(state, dist);
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    if (!selState) { setError("Please select your state."); return; }
    var distNums = districtsByState[selState] || [];
    var d = selDist !== "" ? Number(selDist) : (distNums.length === 1 ? distNums[0] : null);
    if (d === null && distNums.length > 1) {
      setError("Please select your congressional district.");
      return;
    }
    setZipInput(""); // clear ZIP field so display shows manual selection
    doLookup(selState, d);
  }

  var allReps = foundReps
    ? [].concat(foundReps.senators || []).concat(foundReps.houseMember ? [foundReps.houseMember] : [])
    : [];

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", color: TEXT, maxWidth: 980, margin: "0 auto", paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Section IV — What Can You Do?</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: "0 0 10px", lineHeight: 1.25 }}>Your Representatives' Fiscal Record</h2>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, margin: 0, maxWidth: 620 }}>
          Enter your ZIP code to see how your senators and representative voted on the ten largest fiscal bills since 2017.
          Each vote is shown alongside the official CBO 10-year cost or savings estimate. No editorial scoring — just the votes and the numbers.
        </p>
      </div>

      {/* ZIP form */}
      <form onSubmit={handleZipSubmit} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="text" inputMode="numeric" placeholder="5-digit ZIP code"
          value={zipInput}
          onChange={function (e) { setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5)); setError(null); }}
          maxLength={5}
          style={{
            border: "1.5px solid " + BORDER, borderRadius: 8,
            padding: "9px 14px", fontSize: 14, fontFamily: "inherit",
            width: 155, outline: "none", color: TEXT,
          }}
        />
        <button type="submit" style={{
          background: "#1e3a5f", color: "#fff", border: "none",
          borderRadius: 8, padding: "9px 18px", fontSize: 13,
          fontWeight: 700, cursor: "pointer",
        }}>
          Find My Reps
        </button>
      </form>

      {error && <div style={{ fontSize: 12, color: AMBER, marginBottom: 10 }}>{error}</div>}

      {/* Multiple district disambiguation */}
      {multiOpts && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            Your ZIP spans multiple congressional districts — which one?
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {multiOpts.map(function (opt, i) {
              var parts = opt.split("-");
              var state = parts[0]; var dist = parts[1] ? parseInt(parts[1]) : null;
              return (
                <button key={i} onClick={function () { setMultiOpts(null); doLookup(state, dist); }}
                  style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, color: "#92400e" }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual selector toggle */}
      <button onClick={function () { setShowManual(!showManual); }}
        style={{ background: "none", border: "none", fontSize: 12, color: BLUE, cursor: "pointer", padding: 0, textDecoration: "underline", marginBottom: showManual ? 10 : 4 }}>
        {showManual ? "Hide manual selector" : "Don't know your ZIP? Select state & district manually"}
      </button>

      {/* Manual selector */}
      {showManual && (
        <form onSubmit={handleManualSubmit} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <select value={selState} onChange={function (e) { setSelState(e.target.value); setSelDist(""); }}
            style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", color: TEXT }}>
            <option value="">— State —</option>
            {US_STATE_LIST.map(function (s) { return <option key={s} value={s}>{s}</option>; })}
          </select>
          {selState && districtsByState[selState] && districtsByState[selState].length > 1 && (
            <select value={selDist} onChange={function (e) { setSelDist(e.target.value); }}
              style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", color: TEXT }}>
              <option value="">— House District —</option>
              {(districtsByState[selState] || []).slice().sort(function (a, b) { return a - b; }).map(function (d) {
                return <option key={d} value={d}>{selState}-{d}</option>;
              })}
            </select>
          )}
          <button type="submit" style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Go
          </button>
        </form>
      )}

      {/* Rep cards */}
      {foundReps && allReps.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
            Showing reps for <strong>{foundReps.state}{foundReps.district ? "-" + foundReps.district : ""}</strong>
            {foundReps.zipUsed && <span> (ZIP {foundReps.zipUsed})</span>}
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {allReps.map(function (rep) {
              return <RepCard key={rep.bioguide_id} rep={rep} keyVotesData={keyVotesData} rollCalls={rollCalls} />;
            })}
          </div>

          {/* Methodology */}
          <div style={{ marginTop: 24, padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid " + BORDER, fontSize: 11, color: MUTED, lineHeight: 1.65 }}>
            <strong style={{ color: TEXT }}>Data & methodology:</strong>{" "}
            Vote records are from official{" "}
            <a href="https://clerk.house.gov" target="_blank" rel="noreferrer" style={{ color: BLUE }}>House Clerk</a>{" "}and{" "}
            <a href="https://www.senate.gov" target="_blank" rel="noreferrer" style={{ color: BLUE }}>Senate</a>{" "}records via{" "}
            <a href="https://www.govtrack.us" target="_blank" rel="noreferrer" style={{ color: BLUE }}>GovTrack</a>.
            Fiscal impact figures are official{" "}
            <a href="https://www.cbo.gov" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO/JCT</a>{" "}10-year cost estimates at time of scoring.
            Members not in office when a bill passed are excluded from that vote.
            <strong> CARES Act (2020):</strong> House passed by voice vote — no individual records exist.
            <strong> FRA 2023 caveat:</strong> The $1.5T savings figure is largely discretionary cap projections, not guaranteed hard savings (~$10B mandatory component).
            ZIP-to-district mapping via the U.S. Census Bureau ZCTA→Congressional District relationship file for the 119th Congress. ZIPs that span multiple districts surface a disambiguation prompt; overlaps below 1% of the ZCTA's land area are excluded as boundary-line noise.
          </div>
        </div>
      )}

      {!legislators && (
        <div style={{ fontSize: 13, color: MUTED, padding: "20px 0" }}>Loading representative data…</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// RepresentativesPage variant scaffold
// Add a new variant: write a function component with the same props
// as RepresentativesPageA, then append it to REP_VARIANTS below.
// Shareable URLs: `?variants=on&variant=B` shows the switcher + variant B.
// Public visitors (no query params) see variant A with no switcher.
// To promote a winner: delete the wrapper + switcher + losing variants,
// then rename the winner back to `RepresentativesPage`.
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// Variant B — "if their vote had prevailed" framing
// Colorblind-friendly palette (deep maroon vs. yellow-leaning lime),
// signed per-vote impact, summed per-rep total, and threshold-based ratings.
// All visual choices kept local to this component so Variant A is untouched.
// ─────────────────────────────────────────────

var VARB_RED      = "#7f1d1d";   // deep maroon — deficit-increasing
var VARB_RED_BG   = "#fef2f2";
var VARB_GREEN    = "#4d7c0f";   // dark lime / yellow-green — deficit-reducing
var VARB_GREEN_BG = "#f7fee7";
var VARB_NEUTRAL  = "#94a3b8";
var VARB_RATING_MIN_VOTES   = 4;      // used by Variant C's rating gate

function varbImpact(optKey, cboCost) {
  if (optKey === "+") return cboCost;
  if (optKey === "-") return -cboCost;
  return null;  // absent / present / voice / not-in-office
}

function varbFmtSigned(b) {
  if (b === 0) return "$0";
  var abs = Math.abs(b);
  var sign = b > 0 ? "+" : "−";
  if (abs >= 1000) return sign + "$" + (abs / 1000).toFixed(2) + "T";
  return sign + "$" + Math.round(abs) + "B";
}

function RepCardB({ rep, keyVotesData, rollCalls }) {
  var _imgErr = useState(false); var imgErr = _imgErr[0]; var setImgErr = _imgErr[1];

  var pc     = partyCode(rep.party);
  var pColor = partyBgColor(rep.party);
  var isSen  = rep.chamber === "senate";
  var label  = isSen ? "Sen." : "Rep.";
  var locStr = isSen ? rep.state : rep.state + "-" + rep.district;

  var rows = useMemo(function () {
    if (!keyVotesData) return [];
    return keyVotesData.votes.map(function (bill) {
      var isVoiceVote = bill.id === "cares_2020" && !isSen;
      var wasInOffice = rep.first_elected_year <= bill.year;
      var optKey = null;
      if (isVoiceVote) {
        optKey = "voice";
      } else if (wasInOffice) {
        var chamber = isSen ? "senate" : "house";
        var map = rollCalls && rollCalls[bill.id] && rollCalls[bill.id][chamber];
        if (map) optKey = map[rep.bioguide_id] || null;
      }
      var impact = varbImpact(optKey, bill.cbo_10yr_b);
      return { bill: bill, optKey: optKey, wasInOffice: wasInOffice, isVoiceVote: isVoiceVote, impact: impact };
    });
  }, [keyVotesData, rollCalls, rep, isSen]);

  var recorded = rows.filter(function (r) { return r.impact !== null; });
  var sum      = recorded.reduce(function (a, r) { return a + r.impact; }, 0);
  var totalBills = keyVotesData ? keyVotesData.votes.length : 0;

  function voteChip(row) {
    if (!row.wasInOffice) return <span style={{ fontSize: 9, color: MUTED, fontStyle: "italic" }}>n/a</span>;
    if (row.isVoiceVote)  return <span style={{ fontSize: 9, color: MUTED }}>Voice</span>;
    if (row.optKey === "+") return <span style={{ background: "#f1f5f9", color: TEXT, fontSize: 9.5, fontWeight: 700, padding: "1.5px 6px", borderRadius: 3, border: "1px solid " + BORDER }}>Yea</span>;
    if (row.optKey === "-") return <span style={{ background: "#f1f5f9", color: TEXT, fontSize: 9.5, fontWeight: 700, padding: "1.5px 6px", borderRadius: 3, border: "1px solid " + BORDER }}>Nay</span>;
    if (row.optKey === "0") return <span style={{ fontSize: 9, color: MUTED }}>Absent</span>;
    if (row.optKey === "P") return <span style={{ fontSize: 9, color: MUTED }}>Present</span>;
    return <span style={{ fontSize: 9, color: MUTED }}>—</span>;
  }

  function impactCell(row) {
    if (!row.wasInOffice) return <span style={{ fontSize: 9, color: MUTED }}>—</span>;
    if (row.impact === null) return <span style={{ fontSize: 9, color: MUTED }}>—</span>;
    var pos = row.impact > 0;
    return (
      <span style={{
        background: pos ? VARB_RED_BG : VARB_GREEN_BG,
        color: pos ? VARB_RED : VARB_GREEN,
        fontSize: 10.5, fontWeight: 700,
        padding: "2px 7px", borderRadius: 4, display: "inline-block",
        fontVariantNumeric: "tabular-nums",
      }}>
        {varbFmtSigned(row.impact)}
      </span>
    );
  }

  return (
    <div style={{
      background: SURFACE, borderRadius: 12, border: "1px solid " + BORDER,
      boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
      width: 300, minWidth: 280, flexShrink: 0, flexGrow: 1, maxWidth: 340,
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid " + BORDER, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flexShrink: 0 }}>
          {!imgErr ? (
            <img
              src={"https://bioguide.congress.gov/photo/" + rep.bioguide_id + ".jpg"}
              onError={function () { setImgErr(true); }}
              alt={rep.name.official_full}
              style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid " + BORDER }}
            />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: MUTED }}>
              {rep.name.first[0]}{rep.name.last[0]}
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: TEXT, lineHeight: 1.25, marginBottom: 4 }}>
            {label} {rep.name.official_full}
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ background: pColor, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>{pc}</span>
            <span style={{ fontSize: 11, color: MUTED }}>{locStr}</span>
            <span style={{ fontSize: 10, color: MUTED }}>· Since {rep.first_elected_year}</span>
          </div>
        </div>
      </div>

      {/* Net total band */}
      <div style={{
        padding: "10px 14px", borderBottom: "1px solid " + BORDER,
        background: sum > 0 ? VARB_RED_BG : (sum < 0 ? VARB_GREEN_BG : "#f9fafb"),
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>
          Net deficit impact if their votes had prevailed
        </div>
        <div style={{
          fontSize: 19, fontWeight: 800,
          color: sum > 0 ? VARB_RED : (sum < 0 ? VARB_GREEN : VARB_NEUTRAL),
          fontVariantNumeric: "tabular-nums",
        }}>
          {sum === 0 ? "$0" : varbFmtSigned(sum)}
        </div>
        <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
          Based on {recorded.length} of {totalBills} bills voted
        </div>
      </div>

      {/* Per-vote rows */}
      <div style={{ padding: "10px 14px", flexGrow: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>
          Vote · if-prevailed impact
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid " + BORDER }}>
              <th style={{ padding: "0 4px 4px 0", textAlign: "left", fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Bill</th>
              <th style={{ padding: "0 3px 4px", textAlign: "left", fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Yr</th>
              <th style={{ padding: "0 4px 4px", textAlign: "center", fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Vote</th>
              <th style={{ padding: "0 0 4px 6px", textAlign: "right", fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Impact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(function (row) {
              return (
                <tr key={row.bill.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "3.5px 4px 3.5px 0", whiteSpace: "nowrap" }}>
                    {row.bill.wikipedia_url ? (
                      <a href={row.bill.wikipedia_url} target="_blank" rel="noreferrer"
                        title={row.bill.name + " (" + row.bill.year + ")\n" + row.bill.description}
                        style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2 }}>
                        {row.bill.short_name}
                      </a>
                    ) : (
                      <span style={{ color: TEXT, fontWeight: 600 }}
                        title={row.bill.name + " (" + row.bill.year + ")\n" + row.bill.description}>
                        {row.bill.short_name}</span>
                    )}
                  </td>
                  <td style={{ padding: "3.5px 3px", color: MUTED, whiteSpace: "nowrap", fontSize: 10 }}>{row.bill.year}</td>
                  <td style={{ padding: "3.5px 4px", whiteSpace: "nowrap", textAlign: "center" }}>
                    {voteChip(row)}
                  </td>
                  <td style={{ padding: "3.5px 0 3.5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {impactCell(row)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Legend */}
        <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 9, color: MUTED, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: VARB_RED, display: "inline-block" }} />
            Added to deficit
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: VARB_GREEN, display: "inline-block" }} />
            Reduced deficit
          </span>
        </div>
      </div>

      {/* Contact footer */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid " + BORDER, display: "flex", gap: 7, flexWrap: "wrap" }}>
        {rep.phone && (
          <a href={"tel:1" + rep.phone.replace(/\D/g, "")}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: "#1e3a5f", background: "#eff6ff", borderRadius: 6, padding: "5px 9px", textDecoration: "none", border: "1px solid #bfdbfe" }}>
            📞 {rep.phone}
          </a>
        )}
        {rep.website && (
          <a href={rep.website} target="_blank" rel="noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: TEXT, background: "#f9fafb", borderRadius: 6, padding: "5px 9px", textDecoration: "none", border: "1px solid " + BORDER }}>
            Website →
          </a>
        )}
      </div>
    </div>
  );
}

function RepresentativesPageB({ legislators, keyVotesData, rollCalls, zipDistricts }) {
  var _zip       = useState("");   var zipInput = _zip[0]; var setZipInput = _zip[1];
  var _reps      = useState(null); var foundReps = _reps[0]; var setFoundReps = _reps[1];
  var _err       = useState(null); var error = _err[0]; var setError = _err[1];
  var _manual    = useState(false); var showManual = _manual[0]; var setShowManual = _manual[1];
  var _selState  = useState(""); var selState = _selState[0]; var setSelState = _selState[1];
  var _selDist   = useState(""); var selDist = _selDist[0]; var setSelDist = _selDist[1];
  var _multiOpts = useState(null); var multiOpts = _multiOpts[0]; var setMultiOpts = _multiOpts[1];

  var districtsByState = useMemo(function () {
    if (!legislators) return {};
    var out = {};
    legislators.forEach(function (r) {
      if (r.chamber !== "house" || r.district === null) return;
      if (!out[r.state]) out[r.state] = [];
      if (!out[r.state].includes(r.district)) out[r.state].push(r.district);
    });
    return out;
  }, [legislators]);

  function doLookup(state, district) {
    if (!legislators) return;
    var d = district === null ? null : Number(district);
    var senators  = legislators.filter(function (r) { return r.chamber === "senate" && r.state === state; });
    var houseMems = legislators.filter(function (r) {
      if (r.chamber !== "house" || r.state !== state) return false;
      if (d === null) return true;
      return r.district === d || (d === 0 && r.district === 0);
    });
    if (senators.length === 0 && houseMems.length === 0) {
      setError("No representatives found for " + state + (d ? " district " + d : "") + ". Check your ZIP or try the manual selector.");
      setFoundReps(null);
      return;
    }
    setError(null);
    setFoundReps({ state: state, district: d, senators: senators, houseMember: houseMems[0] || null, zipUsed: zipInput });
  }

  function handleZipSubmit(e) {
    e.preventDefault();
    var z = zipInput.trim();
    if (!/^\d{5}$/.test(z)) { setError("Please enter a valid 5-digit ZIP code."); return; }
    if (!zipDistricts) { setShowManual(true); setError("ZIP lookup data hasn't loaded yet — use the manual selector below."); return; }
    var val = zipDistricts[z];
    if (!val) { setError("ZIP " + z + " not found. Try the manual selector below."); setShowManual(true); return; }
    var vals = Array.isArray(val) ? val : [val];
    if (vals.length > 1) { setMultiOpts(vals); setFoundReps(null); setError(null); return; }
    setMultiOpts(null);
    var parts = vals[0].split("-");
    doLookup(parts[0], parts.length > 1 ? parseInt(parts[1]) : null);
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    if (!selState) { setError("Please select your state."); return; }
    var distNums = districtsByState[selState] || [];
    var d = selDist !== "" ? Number(selDist) : (distNums.length === 1 ? distNums[0] : null);
    if (d === null && distNums.length > 1) { setError("Please select your congressional district."); return; }
    setZipInput("");
    doLookup(selState, d);
  }

  var allReps = foundReps
    ? [].concat(foundReps.senators || []).concat(foundReps.houseMember ? [foundReps.houseMember] : [])
    : [];

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", color: TEXT, maxWidth: 980, margin: "0 auto", paddingBottom: 40 }}>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Section IV — What Can You Do?</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: "0 0 10px", lineHeight: 1.25 }}>Your Representatives' Fiscal Record</h2>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, margin: 0, maxWidth: 660 }}>
          Enter your ZIP code to see how your senators and representative voted on the ten bills having the largest impact on the deficit over the last 10 years. Each vote is shown alongside the official CBO 10-year cost or savings estimate. The numbers below each representative's name show how the deficit would have been affected had the vote gone their way.
        </p>
      </div>

      <form onSubmit={handleZipSubmit} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="text" inputMode="numeric" placeholder="5-digit ZIP code"
          value={zipInput}
          onChange={function (e) { setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5)); setError(null); }}
          maxLength={5}
          style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "9px 14px", fontSize: 14, fontFamily: "inherit", width: 155, outline: "none", color: TEXT }}
        />
        <button type="submit" style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Find My Reps
        </button>
      </form>

      {error && <div style={{ fontSize: 12, color: VARB_RED, marginBottom: 10 }}>{error}</div>}

      {multiOpts && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            Your ZIP spans multiple congressional districts — which one?
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {multiOpts.map(function (opt, i) {
              var parts = opt.split("-");
              var state = parts[0]; var dist = parts[1] ? parseInt(parts[1]) : null;
              return (
                <button key={i} onClick={function () { setMultiOpts(null); doLookup(state, dist); }}
                  style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, color: "#92400e" }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={function () { setShowManual(!showManual); }}
        style={{ background: "none", border: "none", fontSize: 12, color: BLUE, cursor: "pointer", padding: 0, textDecoration: "underline", marginBottom: showManual ? 10 : 4 }}>
        {showManual ? "Hide manual selector" : "Don't know your ZIP? Select state & district manually"}
      </button>

      {showManual && (
        <form onSubmit={handleManualSubmit} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <select value={selState} onChange={function (e) { setSelState(e.target.value); setSelDist(""); }}
            style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", color: TEXT }}>
            <option value="">— State —</option>
            {US_STATE_LIST.map(function (s) { return <option key={s} value={s}>{s}</option>; })}
          </select>
          {selState && districtsByState[selState] && districtsByState[selState].length > 1 && (
            <select value={selDist} onChange={function (e) { setSelDist(e.target.value); }}
              style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", color: TEXT }}>
              <option value="">— House District —</option>
              {(districtsByState[selState] || []).slice().sort(function (a, b) { return a - b; }).map(function (d) {
                return <option key={d} value={d}>{selState}-{d}</option>;
              })}
            </select>
          )}
          <button type="submit" style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Go
          </button>
        </form>
      )}

      {foundReps && allReps.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
            Showing reps for <strong>{foundReps.state}{foundReps.district ? "-" + foundReps.district : ""}</strong>
            {foundReps.zipUsed && <span> (ZIP {foundReps.zipUsed})</span>}
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {allReps.map(function (rep) {
              return <RepCardB key={rep.bioguide_id} rep={rep} keyVotesData={keyVotesData} rollCalls={rollCalls} />;
            })}
          </div>

          <div style={{ marginTop: 24, padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid " + BORDER, fontSize: 11, color: MUTED, lineHeight: 1.65 }}>
            <strong style={{ color: TEXT }}>Data & methodology:</strong>{" "}
            Each per-bill figure is the CBO 10-year deficit score that would have resulted had the representative's vote prevailed — a yea on a deficit-increasing bill counts positive; a nay on the same bill counts negative (had they won, that bill wouldn't have passed). Absent, present, and the CARES Act House voice vote are excluded from the sum. The net total is the sum across all recorded votes.
            Vote records via{" "}
            <a href="https://clerk.house.gov" target="_blank" rel="noreferrer" style={{ color: BLUE }}>House Clerk</a>,{" "}
            <a href="https://www.senate.gov" target="_blank" rel="noreferrer" style={{ color: BLUE }}>Senate</a>, and{" "}
            <a href="https://www.govtrack.us" target="_blank" rel="noreferrer" style={{ color: BLUE }}>GovTrack</a>;
            fiscal figures from{" "}
            <a href="https://www.cbo.gov" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO/JCT</a>.
            ZIP-to-district mapping via the U.S. Census Bureau ZCTA→Congressional District relationship file for the 119th Congress.
          </div>
        </div>
      )}

      {!legislators && (
        <div style={{ fontSize: 13, color: MUTED, padding: "20px 0" }}>Loading representative data…</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Variant C — "fiscal-direction ratio of Yea votes"
// Headline metric: (sum of CBO scores for Yea-voted bills) / (sum of abs CBO scores for Yea-voted bills).
// Range [-1, +1]. +1 = every Yea vote was deficit-increasing; -1 = every Yea vote was deficit-reducing.
// Ignores Nay votes by design — answers "what did they actively endorse?", complementary to Variant B.
// ─────────────────────────────────────────────

function RepCardC({ rep, keyVotesData, rollCalls }) {
  var _imgErr = useState(false); var imgErr = _imgErr[0]; var setImgErr = _imgErr[1];

  var pc     = partyCode(rep.party);
  var pColor = partyBgColor(rep.party);
  var isSen  = rep.chamber === "senate";
  var label  = isSen ? "Sen." : "Rep.";
  var locStr = isSen ? rep.state : rep.state + "-" + rep.district;

  var rows = useMemo(function () {
    if (!keyVotesData) return [];
    return keyVotesData.votes.map(function (bill) {
      var isVoiceVote = bill.id === "cares_2020" && !isSen;
      var wasInOffice = rep.first_elected_year <= bill.year;
      var optKey = null;
      if (isVoiceVote) {
        optKey = "voice";
      } else if (wasInOffice) {
        var chamber = isSen ? "senate" : "house";
        var map = rollCalls && rollCalls[bill.id] && rollCalls[bill.id][chamber];
        if (map) optKey = map[rep.bioguide_id] || null;
      }
      return { bill: bill, optKey: optKey, wasInOffice: wasInOffice, isVoiceVote: isVoiceVote };
    });
  }, [keyVotesData, rollCalls, rep, isSen]);

  var yeas = rows.filter(function (r) { return r.optKey === "+"; });
  var signedSum = yeas.reduce(function (a, r) { return a + r.bill.cbo_10yr_b; }, 0);
  var absSum    = yeas.reduce(function (a, r) { return a + Math.abs(r.bill.cbo_10yr_b); }, 0);
  var ratio = absSum > 0 ? signedSum / absSum : null;
  var totalBills = keyVotesData ? keyVotesData.votes.length : 0;

  var ratingRatio = null;
  if (ratio !== null && yeas.length >= VARB_RATING_MIN_VOTES) {
    if (ratio >=  0.5) ratingRatio = { label: "Deficit-leaning", bg: VARB_RED,   fg: "#fff" };
    else if (ratio <= -0.5) ratingRatio = { label: "Savings-leaning", bg: VARB_GREEN, fg: "#fff" };
    else ratingRatio = { label: "Mixed",      bg: "#475569",  fg: "#fff" };
  }

  function ratioPct(r) {
    if (r === null) return "—";
    var sign = r > 0 ? "+" : (r < 0 ? "−" : "");
    return sign + Math.round(Math.abs(r) * 100) + "%";
  }

  function voteChip(row) {
    if (!row.wasInOffice) return <span style={{ fontSize: 9, color: MUTED, fontStyle: "italic" }}>n/a</span>;
    if (row.isVoiceVote)  return <span style={{ fontSize: 9, color: MUTED }}>Voice</span>;
    if (row.optKey === "+") return <span style={{ background: "#f1f5f9", color: TEXT, fontSize: 9.5, fontWeight: 700, padding: "1.5px 6px", borderRadius: 3, border: "1px solid " + BORDER }}>Yea</span>;
    if (row.optKey === "-") return <span style={{ fontSize: 9, color: MUTED }}>Nay</span>;
    if (row.optKey === "0") return <span style={{ fontSize: 9, color: MUTED }}>Absent</span>;
    if (row.optKey === "P") return <span style={{ fontSize: 9, color: MUTED }}>Present</span>;
    return <span style={{ fontSize: 9, color: MUTED }}>—</span>;
  }

  function cboCell(row) {
    var b = row.bill.cbo_10yr_b;
    var pos = b > 0;
    var countsForRatio = row.optKey === "+";
    return (
      <span style={{
        background: countsForRatio ? (pos ? VARB_RED_BG : VARB_GREEN_BG) : "transparent",
        color: countsForRatio ? (pos ? VARB_RED : VARB_GREEN) : MUTED,
        fontSize: 10.5, fontWeight: countsForRatio ? 700 : 500,
        padding: "2px 7px", borderRadius: 4, display: "inline-block",
        fontVariantNumeric: "tabular-nums",
        opacity: countsForRatio ? 1 : 0.55,
      }}>
        {fmtCBO(b)}
      </span>
    );
  }

  return (
    <div style={{
      background: SURFACE, borderRadius: 12, border: "1px solid " + BORDER,
      boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
      width: 300, minWidth: 280, flexShrink: 0, flexGrow: 1, maxWidth: 340,
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid " + BORDER, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flexShrink: 0 }}>
          {!imgErr ? (
            <img
              src={"https://bioguide.congress.gov/photo/" + rep.bioguide_id + ".jpg"}
              onError={function () { setImgErr(true); }}
              alt={rep.name.official_full}
              style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid " + BORDER }}
            />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: MUTED }}>
              {rep.name.first[0]}{rep.name.last[0]}
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: TEXT, lineHeight: 1.25, marginBottom: 4 }}>
            {label} {rep.name.official_full}
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ background: pColor, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>{pc}</span>
            <span style={{ fontSize: 11, color: MUTED }}>{locStr}</span>
            <span style={{ fontSize: 10, color: MUTED }}>· Since {rep.first_elected_year}</span>
          </div>
          {ratingRatio && (
            <div style={{ marginTop: 6 }}>
              <span style={{
                background: ratingRatio.bg, color: ratingRatio.fg, fontSize: 10, fontWeight: 800,
                padding: "2px 8px", borderRadius: 4, letterSpacing: 0.3, textTransform: "uppercase",
              }}>{ratingRatio.label} Yea record</span>
            </div>
          )}
        </div>
      </div>

      {/* Ratio band */}
      <div style={{
        padding: "10px 14px", borderBottom: "1px solid " + BORDER,
        background: ratio === null ? "#f9fafb" : (ratio > 0 ? VARB_RED_BG : (ratio < 0 ? VARB_GREEN_BG : "#f9fafb")),
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>
          Fiscal direction of Yea votes
        </div>
        <div style={{
          fontSize: 22, fontWeight: 800,
          color: ratio === null ? VARB_NEUTRAL : (ratio > 0 ? VARB_RED : (ratio < 0 ? VARB_GREEN : VARB_NEUTRAL)),
          fontVariantNumeric: "tabular-nums",
        }}>
          {ratioPct(ratio)}
        </div>
        <div style={{ fontSize: 10, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>
          {ratio === null
            ? "No Yea votes recorded in the " + totalBills + "-bill window"
            : (
              <span>
                Signed sum {varbFmtSigned(signedSum)} ÷ gross magnitude ${absSum.toLocaleString()}B<br />
                across {yeas.length} Yea vote{yeas.length === 1 ? "" : "s"} (of {totalBills} bills)
              </span>
            )}
        </div>
      </div>

      {/* Per-vote table */}
      <div style={{ padding: "10px 14px", flexGrow: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>
          Bill record (Yea votes count toward the ratio)
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid " + BORDER }}>
              <th style={{ padding: "0 4px 4px 0", textAlign: "left", fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Bill</th>
              <th style={{ padding: "0 3px 4px", textAlign: "left", fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Yr</th>
              <th style={{ padding: "0 4px 4px", textAlign: "center", fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Vote</th>
              <th style={{ padding: "0 0 4px 6px", textAlign: "right", fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>CBO 10y</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(function (row) {
              var countsForRatio = row.optKey === "+";
              return (
                <tr key={row.bill.id} style={{ borderBottom: "1px solid #f3f4f6", opacity: countsForRatio ? 1 : 0.72 }}>
                  <td style={{ padding: "3.5px 4px 3.5px 0", whiteSpace: "nowrap" }}>
                    {row.bill.wikipedia_url ? (
                      <a href={row.bill.wikipedia_url} target="_blank" rel="noreferrer"
                        title={row.bill.name + " (" + row.bill.year + ")\n" + row.bill.description}
                        style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2 }}>
                        {row.bill.short_name}
                      </a>
                    ) : (
                      <span style={{ color: TEXT, fontWeight: 600 }}
                        title={row.bill.name + " (" + row.bill.year + ")\n" + row.bill.description}>
                        {row.bill.short_name}</span>
                    )}
                  </td>
                  <td style={{ padding: "3.5px 3px", color: MUTED, whiteSpace: "nowrap", fontSize: 10 }}>{row.bill.year}</td>
                  <td style={{ padding: "3.5px 4px", textAlign: "center", whiteSpace: "nowrap" }}>{voteChip(row)}</td>
                  <td style={{ padding: "3.5px 0 3.5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>{cboCell(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Contact footer */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid " + BORDER, display: "flex", gap: 7, flexWrap: "wrap" }}>
        {rep.phone && (
          <a href={"tel:1" + rep.phone.replace(/\D/g, "")}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: "#1e3a5f", background: "#eff6ff", borderRadius: 6, padding: "5px 9px", textDecoration: "none", border: "1px solid #bfdbfe" }}>
            📞 {rep.phone}
          </a>
        )}
        {rep.website && (
          <a href={rep.website} target="_blank" rel="noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: TEXT, background: "#f9fafb", borderRadius: 6, padding: "5px 9px", textDecoration: "none", border: "1px solid " + BORDER }}>
            Website →
          </a>
        )}
      </div>
    </div>
  );
}

function RepresentativesPageC({ legislators, keyVotesData, rollCalls, zipDistricts }) {
  var _zip       = useState("");   var zipInput = _zip[0]; var setZipInput = _zip[1];
  var _reps      = useState(null); var foundReps = _reps[0]; var setFoundReps = _reps[1];
  var _err       = useState(null); var error = _err[0]; var setError = _err[1];
  var _manual    = useState(false); var showManual = _manual[0]; var setShowManual = _manual[1];
  var _selState  = useState(""); var selState = _selState[0]; var setSelState = _selState[1];
  var _selDist   = useState(""); var selDist = _selDist[0]; var setSelDist = _selDist[1];
  var _multiOpts = useState(null); var multiOpts = _multiOpts[0]; var setMultiOpts = _multiOpts[1];

  var districtsByState = useMemo(function () {
    if (!legislators) return {};
    var out = {};
    legislators.forEach(function (r) {
      if (r.chamber !== "house" || r.district === null) return;
      if (!out[r.state]) out[r.state] = [];
      if (!out[r.state].includes(r.district)) out[r.state].push(r.district);
    });
    return out;
  }, [legislators]);

  function doLookup(state, district) {
    if (!legislators) return;
    var d = district === null ? null : Number(district);
    var senators  = legislators.filter(function (r) { return r.chamber === "senate" && r.state === state; });
    var houseMems = legislators.filter(function (r) {
      if (r.chamber !== "house" || r.state !== state) return false;
      if (d === null) return true;
      return r.district === d || (d === 0 && r.district === 0);
    });
    if (senators.length === 0 && houseMems.length === 0) {
      setError("No representatives found for " + state + (d ? " district " + d : "") + ". Check your ZIP or try the manual selector.");
      setFoundReps(null);
      return;
    }
    setError(null);
    setFoundReps({ state: state, district: d, senators: senators, houseMember: houseMems[0] || null, zipUsed: zipInput });
  }

  function handleZipSubmit(e) {
    e.preventDefault();
    var z = zipInput.trim();
    if (!/^\d{5}$/.test(z)) { setError("Please enter a valid 5-digit ZIP code."); return; }
    if (!zipDistricts) { setShowManual(true); setError("ZIP lookup data hasn't loaded yet — use the manual selector below."); return; }
    var val = zipDistricts[z];
    if (!val) { setError("ZIP " + z + " not found. Try the manual selector below."); setShowManual(true); return; }
    var vals = Array.isArray(val) ? val : [val];
    if (vals.length > 1) { setMultiOpts(vals); setFoundReps(null); setError(null); return; }
    setMultiOpts(null);
    var parts = vals[0].split("-");
    doLookup(parts[0], parts.length > 1 ? parseInt(parts[1]) : null);
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    if (!selState) { setError("Please select your state."); return; }
    var distNums = districtsByState[selState] || [];
    var d = selDist !== "" ? Number(selDist) : (distNums.length === 1 ? distNums[0] : null);
    if (d === null && distNums.length > 1) { setError("Please select your congressional district."); return; }
    setZipInput("");
    doLookup(selState, d);
  }

  var allReps = foundReps
    ? [].concat(foundReps.senators || []).concat(foundReps.houseMember ? [foundReps.houseMember] : [])
    : [];

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", color: TEXT, maxWidth: 980, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Section IV — What Can You Do?</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: "0 0 10px", lineHeight: 1.25 }}>Your Representatives' Fiscal Record</h2>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, margin: 0, maxWidth: 660 }}>
          Enter your ZIP code to see, of the bills your senators and representative voted Yea on, what share of those dollars went toward increasing vs. reducing the deficit. The headline figure is a single bounded ratio: <strong>+100%</strong> means every Yea vote added to the deficit; <strong>−100%</strong> means every Yea vote reduced it.
        </p>
      </div>

      <form onSubmit={handleZipSubmit} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input type="text" inputMode="numeric" placeholder="5-digit ZIP code"
          value={zipInput}
          onChange={function (e) { setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5)); setError(null); }}
          maxLength={5}
          style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "9px 14px", fontSize: 14, fontFamily: "inherit", width: 155, outline: "none", color: TEXT }} />
        <button type="submit" style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Find My Reps
        </button>
      </form>

      {error && <div style={{ fontSize: 12, color: VARB_RED, marginBottom: 10 }}>{error}</div>}

      {multiOpts && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            Your ZIP spans multiple congressional districts — which one?
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {multiOpts.map(function (opt, i) {
              var parts = opt.split("-");
              var state = parts[0]; var dist = parts[1] ? parseInt(parts[1]) : null;
              return (
                <button key={i} onClick={function () { setMultiOpts(null); doLookup(state, dist); }}
                  style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, color: "#92400e" }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={function () { setShowManual(!showManual); }}
        style={{ background: "none", border: "none", fontSize: 12, color: BLUE, cursor: "pointer", padding: 0, textDecoration: "underline", marginBottom: showManual ? 10 : 4 }}>
        {showManual ? "Hide manual selector" : "Don't know your ZIP? Select state & district manually"}
      </button>

      {showManual && (
        <form onSubmit={handleManualSubmit} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <select value={selState} onChange={function (e) { setSelState(e.target.value); setSelDist(""); }}
            style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", color: TEXT }}>
            <option value="">— State —</option>
            {US_STATE_LIST.map(function (s) { return <option key={s} value={s}>{s}</option>; })}
          </select>
          {selState && districtsByState[selState] && districtsByState[selState].length > 1 && (
            <select value={selDist} onChange={function (e) { setSelDist(e.target.value); }}
              style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", color: TEXT }}>
              <option value="">— House District —</option>
              {(districtsByState[selState] || []).slice().sort(function (a, b) { return a - b; }).map(function (d) {
                return <option key={d} value={d}>{selState}-{d}</option>;
              })}
            </select>
          )}
          <button type="submit" style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Go
          </button>
        </form>
      )}

      {foundReps && allReps.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
            Showing reps for <strong>{foundReps.state}{foundReps.district ? "-" + foundReps.district : ""}</strong>
            {foundReps.zipUsed && <span> (ZIP {foundReps.zipUsed})</span>}
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {allReps.map(function (rep) {
              return <RepCardC key={rep.bioguide_id} rep={rep} keyVotesData={keyVotesData} rollCalls={rollCalls} />;
            })}
          </div>

          <div style={{ marginTop: 24, padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid " + BORDER, fontSize: 11, color: MUTED, lineHeight: 1.65 }}>
            <strong style={{ color: TEXT }}>Data & methodology:</strong>{" "}
            The ratio is the signed sum of CBO 10-year deficit impacts for bills the rep voted Yea on, divided by the sum of absolute CBO impacts for those same bills. A score of <strong style={{ color: VARB_RED }}>+100%</strong> means every Yea vote was deficit-increasing; <strong style={{ color: VARB_GREEN }}>−100%</strong> means every Yea vote was deficit-reducing; 0% means equal magnitudes in each direction. Ratings (<strong style={{ color: VARB_RED }}>Deficit-leaning</strong> at ≥ +50%, <strong style={{ color: VARB_GREEN }}>Savings-leaning</strong> at ≤ −50%, otherwise <strong>Mixed</strong>) require at least {VARB_RATING_MIN_VOTES} Yea votes. Nay/Absent/Present votes don't affect the ratio. Vote records via{" "}
            <a href="https://clerk.house.gov" target="_blank" rel="noreferrer" style={{ color: BLUE }}>House Clerk</a>,{" "}
            <a href="https://www.senate.gov" target="_blank" rel="noreferrer" style={{ color: BLUE }}>Senate</a>, and{" "}
            <a href="https://www.govtrack.us" target="_blank" rel="noreferrer" style={{ color: BLUE }}>GovTrack</a>;
            fiscal figures from{" "}
            <a href="https://www.cbo.gov" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO/JCT</a>.
          </div>
        </div>
      )}

      {!legislators && (
        <div style={{ fontSize: 13, color: MUTED, padding: "20px 0" }}>Loading representative data…</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Variant D — "normalized fiscal index" framing
// Score = (max − actual) / (max − min) × 100, range [0, 100].
//   0   = most deficit-INCREASING record this rep's vote set could produce
//   100 = most deficit-REDUCING record this rep's vote set could produce
//   actual = Σ(impact of YES votes) − Σ(impact of NO votes), over bills
//   the rep actually voted on (so absences / not-yet-in-office drop out).
//   max / min = the most deficit-increasing / -reducing record the same
//   set of votes could have produced (flip each vote to its extreme).
// Self-normalizes for tenure & absences. Headline pairs with a chamber-
// level histogram so the score is read as a relative position, and a
// modal exposes the underlying votes + a min/max position graphic.
// ─────────────────────────────────────────────

var VARD_GREEN    = "#15803d";
var VARD_GREEN_BG = "#dcfce7";
var VARD_RED      = "#b91c1c";
var VARD_RED_BG   = "#fee2e2";
var VARD_NEUTRAL  = "#94a3b8";

function vardComputeIndex(rep, keyVotesData, rollCalls) {
  if (!keyVotesData) return null;
  var isSen = rep.chamber === "senate";
  var chamber = isSen ? "senate" : "house";
  var actual = 0;
  var absSum = 0;
  var voted = [];
  var notVoted = [];
  keyVotesData.votes.forEach(function (bill) {
    if (bill.include_in_score === false) return;
    var wasInOffice = rep.first_elected_year <= bill.year;
    var optKey = null;
    var foundChamber = null;
    if (wasInOffice && rollCalls && rollCalls[bill.id]) {
      var sMap = rollCalls[bill.id].senate;
      var hMap = rollCalls[bill.id].house;
      if (sMap && sMap[rep.bioguide_id]) { optKey = sMap[rep.bioguide_id]; foundChamber = "senate"; }
      else if (hMap && hMap[rep.bioguide_id]) { optKey = hMap[rep.bioguide_id]; foundChamber = "house"; }
    }
    // Voice-vote detection: only when the bill explicitly marks a voice chamber.
    // This distinguishes voice votes (CARES House, PPPHCEA Senate) from "the chamber simply
    // did not vote" (e.g., failed bills where one chamber never took it up).
    var isVoiceVote = false;
    if (!optKey && wasInOffice && bill.voice_chamber) {
      isVoiceVote = true;
    }
    var rec = { bill: bill, optKey: optKey, wasInOffice: wasInOffice, isVoiceVote: isVoiceVote };
    if (optKey === "+") {
      actual += bill.cbo_10yr_b;
      absSum += Math.abs(bill.cbo_10yr_b);
      voted.push(rec);
    } else if (optKey === "-") {
      actual -= bill.cbo_10yr_b;
      absSum += Math.abs(bill.cbo_10yr_b);
      voted.push(rec);
    } else {
      notVoted.push(rec);
    }
  });
  if (absSum === 0) {
    return { actual: 0, min: 0, max: 0, absSum: 0, indexPct: null, voted: voted, notVoted: notVoted };
  }
  var indexPct = (absSum - actual) / (2 * absSum) * 100;
  return { actual: actual, min: -absSum, max: absSum, absSum: absSum, indexPct: indexPct, voted: voted, notVoted: notVoted };
}

function vardColor(pct) {
  if (pct === null || pct === undefined) return VARD_NEUTRAL;
  return pct > 50 ? VARD_GREEN : VARD_RED;
}
function vardBg(pct) {
  if (pct === null || pct === undefined) return "#f9fafb";
  return pct > 50 ? VARD_GREEN_BG : VARD_RED_BG;
}

function IndexDotPlotD({ chamberLabel, data, userReps }) {
  var BINS  = 50;
  var BIN_W = 100 / BINS;
  var DOT   = 4;
  var GAP   = 1;

  var userByBg = useMemo(function () {
    var s = {};
    userReps.forEach(function (r) { s[r.bioguide_id] = true; });
    return s;
  }, [userReps]);

  var bins = useMemo(function () {
    var b = [];
    for (var i = 0; i < BINS; i++) b.push([]);
    data.forEach(function (d) {
      if (d.indexPct === null || d.indexPct === undefined) return;
      var idx = Math.min(BINS - 1, Math.floor(d.indexPct / BIN_W));
      b[idx].push(d);
    });
    // User reps go last so they sit on top of their stack (column-reverse).
    b.forEach(function (binArr) {
      binArr.sort(function (a, c) {
        var aU = userByBg[a.rep.bioguide_id] ? 1 : 0;
        var cU = userByBg[c.rep.bioguide_id] ? 1 : 0;
        return aU - cU;
      });
    });
    return b;
  }, [data, userByBg, BIN_W]);

  var maxStack = bins.reduce(function (m, b) { return Math.max(m, b.length); }, 1);
  var stackHeight = Math.max(40, maxStack * (DOT + GAP));

  var markerGroups = useMemo(function () {
    var groups = {};
    userReps.forEach(function (r) {
      var d = data.find(function (x) { return x.rep.bioguide_id === r.bioguide_id; });
      if (!d || d.indexPct === null) return;
      var key = Math.round(d.indexPct);
      if (!groups[key]) groups[key] = { indexPct: d.indexPct, displayPct: key, reps: [] };
      groups[key].reps.push(r);
    });
    return Object.values(groups);
  }, [data, userReps]);

  var MARKER_BG = "#374151";

  var scoredCount = data.filter(function (d) { return d.indexPct !== null; }).length;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
        {chamberLabel} — distribution of fiscal index ({scoredCount} members scored · 1 dot = 1 member)
      </div>
      <div style={{ position: "relative", padding: "30px 10px 4px", background: SURFACE, border: "1px solid " + BORDER, borderRadius: 8 }}>
        {/* Marker layer */}
        <div style={{ position: "absolute", top: 4, left: 10, right: 10, height: 24, pointerEvents: "none" }}>
          {markerGroups.map(function (g, i) {
            var displayLeft = Math.max(3, Math.min(97, g.indexPct));
            var label = g.reps.map(function (r) { return r.name.last; }).join(", ");
            return (
              <div key={i} style={{ position: "absolute", left: displayLeft + "%", top: 0, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{
                  background: MARKER_BG, color: "#fff", fontSize: 9.5, fontWeight: 800,
                  padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", lineHeight: 1.2,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                }}>
                  {label} · {g.displayPct}%
                </div>
                <div style={{
                  width: 0, height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: "5px solid " + MARKER_BG,
                  marginTop: 1,
                }} />
              </div>
            );
          })}
        </div>
        {/* Dot stacks */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 0, height: stackHeight }}>
          {bins.map(function (binArr, i) {
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column-reverse", alignItems: "center", gap: GAP, height: "100%" }}>
                {binArr.map(function (d, k) {
                  var isUser = !!userByBg[d.rep.bioguide_id];
                  var pc = partyBgColor(d.rep.party);
                  return (
                    <div key={k}
                      title={d.rep.name.last + " (" + partyCode(d.rep.party) + ") · " + Math.round(d.indexPct) + "%"}
                      style={{
                        width: isUser ? DOT + 2 : DOT,
                        height: isUser ? DOT + 2 : DOT,
                        borderRadius: "50%",
                        background: pc,
                        opacity: isUser ? 1 : 0.6,
                        border: isUser ? "1.5px solid " + TEXT : "none",
                        flexShrink: 0,
                      }} />
                  );
                })}
              </div>
            );
          })}
        </div>
        {/* X-axis */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 9.5, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
          <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
        </div>
        {/* Party legend */}
        <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 10, color: MUTED, alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1d4ed8", display: "inline-block" }} /> Democrat
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626", display: "inline-block" }} /> Republican
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c3aed", display: "inline-block" }} /> Independent
          </span>
        </div>
      </div>
    </div>
  );
}

function VariantDModal({ rep, scoreObj, onClose }) {
  useEffect(function () {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return function () {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  var pc     = partyCode(rep.party);
  var pColor = partyBgColor(rep.party);
  var isSen  = rep.chamber === "senate";
  var label  = isSen ? "Sen." : "Rep.";
  var locStr = isSen ? rep.state : rep.state + "-" + rep.district;
  var idx    = scoreObj.indexPct;
  var c      = vardColor(idx);

  var leftPct = scoreObj.absSum > 0
    ? ((scoreObj.max - scoreObj.actual) / (scoreObj.max - scoreObj.min)) * 100
    : 50;
  var markerLeft = Math.max(2, Math.min(98, leftPct));

  return createPortal(
    <div onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999, padding: 16,
        fontFamily: "'Segoe UI', system-ui, sans-serif", color: TEXT,
      }}>
      <div onClick={function (e) { e.stopPropagation(); }}
        style={{
          background: SURFACE, borderRadius: 12, maxWidth: 640, width: "100%",
          maxHeight: "calc(100vh - 32px)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          border: "1px solid " + BORDER,
        }}>
        {/* Header (fixed) */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid " + BORDER, display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: TEXT, lineHeight: 1.25 }}>
              {label} {rep.name.official_full}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
              <span style={{ background: pColor, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>{pc}</span>
              <span style={{ fontSize: 11, color: MUTED }}>{locStr}</span>
              {idx !== null && (
                <span style={{
                  background: c, color: "#fff", fontSize: 11, fontWeight: 800,
                  padding: "2px 8px", borderRadius: 4, fontVariantNumeric: "tabular-nums",
                }}>
                  Index {Math.round(idx)}%
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: "none", border: "1px solid " + BORDER, borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 18, color: MUTED, lineHeight: 1, padding: 0, flexShrink: 0 }}>
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>

        {/* Methodology */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid " + BORDER, fontSize: 12, color: TEXT, lineHeight: 1.65 }}>
          <div style={{ fontWeight: 700, fontSize: 10.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>How the index works</div>
          We add the CBO 10-year deficit impact of every bill they voted <strong>Yea</strong> on and subtract the impact of every bill they voted <strong>Nay</strong> on. That "actual" number is then placed on a scale running from the most deficit-increasing record they could have produced (every vote flipped toward spending, 0%) to the most deficit-reducing one (every vote flipped toward savings, 100%). The headline figure is their position on that interval, so <strong>higher = more deficit-reducing</strong>. <strong>Bills they didn't vote on don't count</strong>, so the index doesn't penalize freshmen or absentees.
        </div>

        {/* Min/max line graphic */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid " + BORDER }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
            Where they fall on their own range
          </div>
          {scoreObj.absSum > 0 ? (
            <div style={{ position: "relative", paddingTop: 28 }}>
              <div style={{ position: "relative", height: 14, borderRadius: 7, background: "linear-gradient(to right, " + VARD_RED + ", #fef9c3 50%, " + VARD_GREEN + ")" }}>
                <div style={{
                  position: "absolute", left: markerLeft + "%", top: "50%",
                  transform: "translate(-50%, -50%)",
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: "#fff", border: "3px solid " + c,
                    boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
                  }} />
                </div>
                <div style={{
                  position: "absolute", left: markerLeft + "%", top: -26, transform: "translateX(-50%)",
                  fontSize: 11, fontWeight: 800, color: c, fontVariantNumeric: "tabular-nums",
                  background: "#fff", padding: "2px 7px", borderRadius: 4, border: "1px solid " + BORDER, whiteSpace: "nowrap",
                }}>
                  Actual {varbFmtSigned(scoreObj.actual)}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
                <span><strong style={{ color: VARD_RED }}>Most increasing</strong> · {varbFmtSigned(scoreObj.max)}</span>
                <span>$0</span>
                <span><strong style={{ color: VARD_GREEN }}>Most reducing</strong> · {varbFmtSigned(scoreObj.min)}</span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: MUTED, fontStyle: "italic" }}>
              No recorded votes — the index can't be computed.
            </div>
          )}
        </div>

        {/* Bills table */}
        <div style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
            Bills counted in the index ({scoreObj.voted.length})
          </div>
          {scoreObj.voted.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid " + BORDER }}>
                  <th style={{ padding: "0 4px 4px 0", textAlign: "left", fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Bill</th>
                  <th style={{ padding: "0 3px 4px", textAlign: "left", fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Yr</th>
                  <th style={{ padding: "0 4px 4px", textAlign: "center", fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Vote</th>
                  <th style={{ padding: "0 0 4px 6px", textAlign: "right", fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>CBO 10y</th>
                  <th style={{ padding: "0 0 4px 6px", textAlign: "right", fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>Contrib.</th>
                </tr>
              </thead>
              <tbody>
                {scoreObj.voted.map(function (row) {
                  var b = row.bill.cbo_10yr_b;
                  var contrib = row.optKey === "+" ? b : -b;
                  var pos = contrib > 0;
                  return (
                    <tr key={row.bill.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "4px 4px 4px 0", whiteSpace: "nowrap" }}>
                        {row.bill.wikipedia_url ? (
                          <a href={row.bill.wikipedia_url} target="_blank" rel="noreferrer"
                            title={row.bill.name + " (" + row.bill.year + ")\n" + row.bill.description}
                            style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2 }}>
                            {row.bill.short_name}
                          </a>
                        ) : (
                          <span style={{ color: TEXT, fontWeight: 600 }}
                            title={row.bill.name + " (" + row.bill.year + ")\n" + row.bill.description}>
                            {row.bill.short_name}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "4px 3px", color: MUTED, whiteSpace: "nowrap", fontSize: 10 }}>{row.bill.year}</td>
                      <td style={{ padding: "4px 4px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <span style={{ background: "#f1f5f9", color: TEXT, fontSize: 9.5, fontWeight: 700, padding: "1.5px 6px", borderRadius: 3, border: "1px solid " + BORDER }}>
                          {row.optKey === "+" ? "Yea" : "Nay"}
                        </span>
                      </td>
                      <td style={{ padding: "4px 0 4px 6px", textAlign: "right", whiteSpace: "nowrap", color: MUTED, fontVariantNumeric: "tabular-nums" }}>
                        {fmtCBO(b)}
                      </td>
                      <td style={{ padding: "4px 0 4px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <span style={{
                          background: pos ? VARD_RED_BG : VARD_GREEN_BG,
                          color: pos ? VARD_RED : VARD_GREEN,
                          fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {varbFmtSigned(contrib)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 11, color: MUTED, fontStyle: "italic" }}>No recorded Yea/Nay votes.</div>
          )}

          {scoreObj.notVoted.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid " + BORDER, fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
              <strong style={{ color: TEXT }}>Not counted ({scoreObj.notVoted.length}):</strong>{" "}
              {scoreObj.notVoted.map(function (r) {
                var why;
                if (!r.wasInOffice) why = "not in office";
                else if (r.isVoiceVote) why = "voice vote";
                else if (r.optKey === "0") why = "absent";
                else if (r.optKey === "P") why = "present";
                else {
                  // Member was in office but no recorded vote. Distinguish "their chamber
                  // didn't act on this bill" from "no record of their individual vote."
                  var inSenate = rep.chamber === "senate";
                  var inHouse  = rep.chamber === "house";
                  var senateNoAction = r.bill.senate_roll_call === null && r.bill.voice_chamber !== "senate";
                  var houseNoAction  = r.bill.house_roll_call  === null && r.bill.voice_chamber !== "house";
                  if (inSenate && senateNoAction) why = "no Senate vote held";
                  else if (inHouse && houseNoAction) why = "no House vote held";
                  else why = "no record";
                }
                return r.bill.short_name + " (" + why + ")";
              }).join(", ")}.
            </div>
          )}
        </div>

        </div>{/* /Scrollable body */}
      </div>
    </div>,
    document.body
  );
}

function RepCardD({ rep, scoreObj, onShowDetails }) {
  var _imgErr = useState(false); var imgErr = _imgErr[0]; var setImgErr = _imgErr[1];
  var pc     = partyCode(rep.party);
  var pColor = partyBgColor(rep.party);
  var isSen  = rep.chamber === "senate";
  var label  = isSen ? "Sen." : "Rep.";
  var locStr = isSen ? rep.state : rep.state + "-" + rep.district;
  var idx    = scoreObj ? scoreObj.indexPct : null;
  var nVotes = scoreObj ? scoreObj.voted.length : 0;
  var nTotal = scoreObj ? (scoreObj.voted.length + scoreObj.notVoted.length) : 0;

  return (
    <div style={{
      background: SURFACE, borderRadius: 12, border: "1px solid " + BORDER,
      boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
      width: 300, minWidth: 280, flexShrink: 0, flexGrow: 1, maxWidth: 340,
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid " + BORDER, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flexShrink: 0 }}>
          {!imgErr ? (
            <img
              src={"https://bioguide.congress.gov/photo/" + rep.bioguide_id + ".jpg"}
              onError={function () { setImgErr(true); }}
              alt={rep.name.official_full}
              style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid " + BORDER }}
            />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: MUTED }}>
              {rep.name.first[0]}{rep.name.last[0]}
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: TEXT, lineHeight: 1.25, marginBottom: 4 }}>
            {label} {rep.name.official_full}
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ background: pColor, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>{pc}</span>
            <span style={{ fontSize: 11, color: MUTED }}>{locStr}</span>
            <span style={{ fontSize: 10, color: MUTED }}>· Since {rep.first_elected_year}</span>
          </div>
        </div>
      </div>

      {/* Big fiscal index */}
      <div style={{
        padding: "18px 14px 14px", borderBottom: "1px solid " + BORDER,
        background: vardBg(idx), textAlign: "center", flexGrow: 1,
      }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
          Fiscal index
        </div>
        <div style={{
          fontSize: 44, fontWeight: 800, color: vardColor(idx),
          fontVariantNumeric: "tabular-nums", lineHeight: 1,
        }}>
          {idx === null ? "—" : Math.round(idx) + "%"}
        </div>
        <div style={{ fontSize: 9.5, color: MUTED, marginTop: 7, lineHeight: 1.5 }}>
          {idx === null
            ? (scoreObj && scoreObj.voted.length > 0 ? null : "No recorded votes in this window")
            : <span><strong style={{ color: VARD_RED }}>0</strong> = max increase · <strong style={{ color: VARD_GREEN }}>100</strong> = max reduction</span>}
        </div>
        <div style={{ fontSize: 10, color: MUTED, marginTop: 6 }}>
          Based on {nVotes} of {nTotal} bills voted
        </div>
        {scoreObj && scoreObj.voted.length > 0 && (
          <button onClick={onShowDetails}
            style={{
              marginTop: 11, background: "#fff", border: "1px solid " + BORDER, borderRadius: 6,
              padding: "6px 12px", fontSize: 11, fontWeight: 700, color: TEXT, cursor: "pointer",
            }}>
            View votes & methodology →
          </button>
        )}
      </div>

      {/* Contact footer */}
      <div style={{ padding: "10px 14px", display: "flex", gap: 7, flexWrap: "wrap" }}>
        {rep.phone && (
          <a href={"tel:1" + rep.phone.replace(/\D/g, "")}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: "#1e3a5f", background: "#eff6ff", borderRadius: 6, padding: "5px 9px", textDecoration: "none", border: "1px solid #bfdbfe" }}>
            📞 {rep.phone}
          </a>
        )}
        {rep.website && (
          <a href={rep.website} target="_blank" rel="noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: TEXT, background: "#f9fafb", borderRadius: 6, padding: "5px 9px", textDecoration: "none", border: "1px solid " + BORDER }}>
            Website →
          </a>
        )}
      </div>
    </div>
  );
}

function RepresentativesPageD({ legislators, keyVotesData, rollCalls, zipDistricts }) {
  var _zip       = useState("");   var zipInput = _zip[0]; var setZipInput = _zip[1];
  var _reps      = useState(null); var foundReps = _reps[0]; var setFoundReps = _reps[1];
  var _err       = useState(null); var error = _err[0]; var setError = _err[1];
  var _manual    = useState(false); var showManual = _manual[0]; var setShowManual = _manual[1];
  var _selState  = useState(""); var selState = _selState[0]; var setSelState = _selState[1];
  var _selDist   = useState(""); var selDist = _selDist[0]; var setSelDist = _selDist[1];
  var _multiOpts = useState(null); var multiOpts = _multiOpts[0]; var setMultiOpts = _multiOpts[1];
  var _modal     = useState(null); var modalRep = _modal[0]; var setModalRep = _modal[1];

  var allScored = useMemo(function () {
    if (!legislators || !keyVotesData) return { senate: [], house: [], byBg: {} };
    var senate = [];
    var house = [];
    var byBg = {};
    legislators.forEach(function (r) {
      var s = vardComputeIndex(r, keyVotesData, rollCalls);
      var entry = { rep: r, indexPct: s ? s.indexPct : null, scoreObj: s };
      byBg[r.bioguide_id] = entry;
      if (r.chamber === "senate") senate.push(entry);
      else if (r.chamber === "house") house.push(entry);
    });
    return { senate: senate, house: house, byBg: byBg };
  }, [legislators, keyVotesData, rollCalls]);

  var districtsByState = useMemo(function () {
    if (!legislators) return {};
    var out = {};
    legislators.forEach(function (r) {
      if (r.chamber !== "house" || r.district === null) return;
      if (!out[r.state]) out[r.state] = [];
      if (!out[r.state].includes(r.district)) out[r.state].push(r.district);
    });
    return out;
  }, [legislators]);

  function doLookup(state, district) {
    if (!legislators) return;
    var d = district === null ? null : Number(district);
    var senators  = legislators.filter(function (r) { return r.chamber === "senate" && r.state === state; });
    var houseMems = legislators.filter(function (r) {
      if (r.chamber !== "house" || r.state !== state) return false;
      if (d === null) return true;
      return r.district === d || (d === 0 && r.district === 0);
    });
    if (senators.length === 0 && houseMems.length === 0) {
      setError("No representatives found for " + state + (d ? " district " + d : "") + ". Check your ZIP or try the manual selector.");
      setFoundReps(null);
      return;
    }
    setError(null);
    setFoundReps({ state: state, district: d, senators: senators, houseMember: houseMems[0] || null, zipUsed: zipInput });
  }

  function handleZipSubmit(e) {
    e.preventDefault();
    var z = zipInput.trim();
    if (!/^\d{5}$/.test(z)) { setError("Please enter a valid 5-digit ZIP code."); return; }
    if (!zipDistricts) { setShowManual(true); setError("ZIP lookup data hasn't loaded yet — use the manual selector below."); return; }
    var val = zipDistricts[z];
    if (!val) { setError("ZIP " + z + " not found. Try the manual selector below."); setShowManual(true); return; }
    var vals = Array.isArray(val) ? val : [val];
    if (vals.length > 1) { setMultiOpts(vals); setFoundReps(null); setError(null); return; }
    setMultiOpts(null);
    var parts = vals[0].split("-");
    doLookup(parts[0], parts.length > 1 ? parseInt(parts[1]) : null);
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    if (!selState) { setError("Please select your state."); return; }
    var distNums = districtsByState[selState] || [];
    var d = selDist !== "" ? Number(selDist) : (distNums.length === 1 ? distNums[0] : null);
    if (d === null && distNums.length > 1) { setError("Please select your congressional district."); return; }
    setZipInput("");
    doLookup(selState, d);
  }

  var allReps = foundReps
    ? [].concat(foundReps.senators || []).concat(foundReps.houseMember ? [foundReps.houseMember] : [])
    : [];
  var userSenators  = foundReps ? (foundReps.senators || []) : [];
  var userHouseMems = foundReps && foundReps.houseMember ? [foundReps.houseMember] : [];

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", color: TEXT, maxWidth: 980, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Section IV — What Can You Do?</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: "0 0 10px", lineHeight: 1.25 }}>Your Representatives' Fiscal Record</h2>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, margin: 0, maxWidth: 660 }}>
          Enter your ZIP code to see each rep's <strong>fiscal index</strong>. 100 means their record reduced the deficit as much as it possibly could have given the bills they voted on; 0 means it increased the deficit as much as possible. The percentage tells you how much of their voting record is improving or worsening the deficit over the next ten years.
        </p>
      </div>

      <form onSubmit={handleZipSubmit} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input type="text" inputMode="numeric" placeholder="5-digit ZIP code"
          value={zipInput}
          onChange={function (e) { setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5)); setError(null); }}
          maxLength={5}
          style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "9px 14px", fontSize: 14, fontFamily: "inherit", width: 155, outline: "none", color: TEXT }} />
        <button type="submit" style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Find My Reps
        </button>
      </form>

      {error && <div style={{ fontSize: 12, color: VARD_RED, marginBottom: 10 }}>{error}</div>}

      {multiOpts && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            Your ZIP spans multiple congressional districts — which one?
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {multiOpts.map(function (opt, i) {
              var parts = opt.split("-");
              var state = parts[0]; var dist = parts[1] ? parseInt(parts[1]) : null;
              return (
                <button key={i} onClick={function () { setMultiOpts(null); doLookup(state, dist); }}
                  style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, color: "#92400e" }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={function () { setShowManual(!showManual); }}
        style={{ background: "none", border: "none", fontSize: 12, color: BLUE, cursor: "pointer", padding: 0, textDecoration: "underline", marginBottom: showManual ? 10 : 4 }}>
        {showManual ? "Hide manual selector" : "Don't know your ZIP? Select state & district manually"}
      </button>

      {showManual && (
        <form onSubmit={handleManualSubmit} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <select value={selState} onChange={function (e) { setSelState(e.target.value); setSelDist(""); }}
            style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", color: TEXT }}>
            <option value="">— State —</option>
            {US_STATE_LIST.map(function (s) { return <option key={s} value={s}>{s}</option>; })}
          </select>
          {selState && districtsByState[selState] && districtsByState[selState].length > 1 && (
            <select value={selDist} onChange={function (e) { setSelDist(e.target.value); }}
              style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", color: TEXT }}>
              <option value="">— House District —</option>
              {(districtsByState[selState] || []).slice().sort(function (a, b) { return a - b; }).map(function (d) {
                return <option key={d} value={d}>{selState}-{d}</option>;
              })}
            </select>
          )}
          <button type="submit" style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Go
          </button>
        </form>
      )}

      {foundReps && allReps.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
            Showing reps for <strong>{foundReps.state}{foundReps.district ? "-" + foundReps.district : ""}</strong>
            {foundReps.zipUsed && <span> (ZIP {foundReps.zipUsed})</span>}
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 26 }}>
            {allReps.map(function (rep) {
              var entry = allScored.byBg[rep.bioguide_id];
              return (
                <RepCardD key={rep.bioguide_id}
                  rep={rep}
                  scoreObj={entry ? entry.scoreObj : null}
                  onShowDetails={function () { setModalRep({ rep: rep, scoreObj: entry.scoreObj }); }} />
              );
            })}
          </div>

          {/* Chamber distributions */}
          {userSenators.length > 0 && (
            <IndexDotPlotD chamberLabel="Senate" data={allScored.senate} userReps={userSenators} />
          )}
          {userHouseMems.length > 0 && (
            <IndexDotPlotD chamberLabel="House" data={allScored.house} userReps={userHouseMems} />
          )}

          <div style={{ marginTop: 18, padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid " + BORDER, fontSize: 11, color: MUTED, lineHeight: 1.65 }}>
            <strong style={{ color: TEXT }}>Data & methodology:</strong>{" "}
            The fiscal index is computed per rep as (max − actual) / (max − min) × 100, where <em>actual</em> is the sum of CBO 10-year scores for bills they voted Yea on minus the sum for bills they voted Nay on, and <em>min</em> / <em>max</em> are the equivalent sums if those same votes had each been flipped to their most deficit-reducing / most deficit-increasing direction. The result runs 0 (most deficit-increasing record possible) to 100 (most deficit-reducing record possible). Bills the rep did not vote on — absences, voice votes, and bills passed before they took office — are excluded from both numerator and denominator. The chamber dot plots show the distribution of every member's score; markers indicate where the user's reps fall. Click <em>"View votes & methodology"</em> on a card for the bill-level breakdown and the rep's position on their own min/max range.
            Vote records via{" "}
            <a href="https://clerk.house.gov" target="_blank" rel="noreferrer" style={{ color: BLUE }}>House Clerk</a>,{" "}
            <a href="https://www.senate.gov" target="_blank" rel="noreferrer" style={{ color: BLUE }}>Senate</a>, and{" "}
            <a href="https://www.govtrack.us" target="_blank" rel="noreferrer" style={{ color: BLUE }}>GovTrack</a>;
            fiscal figures from{" "}
            <a href="https://www.cbo.gov" target="_blank" rel="noreferrer" style={{ color: BLUE }}>CBO/JCT</a>.
            ZIP-to-district mapping via U.S. Census Bureau ZCTA→Congressional District relationship file (119th Congress).
          </div>
        </div>
      )}

      {!legislators && (
        <div style={{ fontSize: 13, color: MUTED, padding: "20px 0" }}>Loading representative data…</div>
      )}

      {modalRep && (
        <VariantDModal rep={modalRep.rep} scoreObj={modalRep.scoreObj} onClose={function () { setModalRep(null); }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Variant E — broader-scope fiscal index
//   * Bills: |10-yr CBO score| ≥ $25B, enacted OR failed-with-roll-call
//     (gated by include_in_e_score === true on each bill entry)
//   * Members: participation floor — must have ≥ 5 recorded Yea/Nay votes
//     in E's universe to appear in the dot plot / rep cards
//   * Reuses RepCardD, VariantDModal, IndexDotPlotD verbatim
//   * Intro/methodology copy left blank for user to write
// ─────────────────────────────────────────────

var VARE_MIN_VOTES = 5;
var VARE_THRESHOLD_B = 25;

function vareComputeIndex(rep, keyVotesData, rollCalls) {
  if (!keyVotesData) return null;
  var actual = 0;
  var absSum = 0;
  var voted = [];
  var notVoted = [];
  keyVotesData.votes.forEach(function (bill) {
    if (bill.include_in_e_score !== true) return;
    if (Math.abs(bill.cbo_10yr_b) < VARE_THRESHOLD_B) return;
    var wasInOffice = rep.first_elected_year <= bill.year;
    var optKey = null;
    if (wasInOffice && rollCalls && rollCalls[bill.id]) {
      var sMap = rollCalls[bill.id].senate;
      var hMap = rollCalls[bill.id].house;
      if (sMap && sMap[rep.bioguide_id]) { optKey = sMap[rep.bioguide_id]; }
      else if (hMap && hMap[rep.bioguide_id]) { optKey = hMap[rep.bioguide_id]; }
    }
    var isVoiceVote = false;
    if (!optKey && wasInOffice && bill.voice_chamber) {
      isVoiceVote = true;
    }
    var rec = { bill: bill, optKey: optKey, wasInOffice: wasInOffice, isVoiceVote: isVoiceVote };
    if (optKey === "+") {
      actual += bill.cbo_10yr_b;
      absSum += Math.abs(bill.cbo_10yr_b);
      voted.push(rec);
    } else if (optKey === "-") {
      actual -= bill.cbo_10yr_b;
      absSum += Math.abs(bill.cbo_10yr_b);
      voted.push(rec);
    } else {
      notVoted.push(rec);
    }
  });
  if (absSum === 0) {
    return { actual: 0, min: 0, max: 0, absSum: 0, indexPct: null, voted: voted, notVoted: notVoted };
  }
  var indexPct = (absSum - actual) / (2 * absSum) * 100;
  return { actual: actual, min: -absSum, max: absSum, absSum: absSum, indexPct: indexPct, voted: voted, notVoted: notVoted };
}

// Variant F — Variant E's universe filtered down to bills where BOTH chambers acted
// (recorded vote or voice vote). Drops the failed-and-one-chamber-only bills like
// BBB, AHCA, HFA, HEROES, HEROES 2.0, Dream and Promise. Keeps RAHFRA (both chambers
// passed, then vetoed). Keeps CARES + PPPHCEA (one chamber recorded, the other voice).
// 19 bills total.
function varfComputeIndex(rep, keyVotesData, rollCalls) {
  if (!keyVotesData) return null;
  var actual = 0;
  var absSum = 0;
  var voted = [];
  var notVoted = [];
  keyVotesData.votes.forEach(function (bill) {
    if (bill.include_in_e_score !== true) return;
    if (Math.abs(bill.cbo_10yr_b) < VARE_THRESHOLD_B) return;
    // F-specific gate: require both chambers to have acted on this bill.
    var senateActed = bill.senate_roll_call !== null || bill.voice_chamber === "senate";
    var houseActed  = bill.house_roll_call  !== null || bill.voice_chamber === "house";
    if (!(senateActed && houseActed)) return;
    var wasInOffice = rep.first_elected_year <= bill.year;
    var optKey = null;
    if (wasInOffice && rollCalls && rollCalls[bill.id]) {
      var sMap = rollCalls[bill.id].senate;
      var hMap = rollCalls[bill.id].house;
      if (sMap && sMap[rep.bioguide_id]) { optKey = sMap[rep.bioguide_id]; }
      else if (hMap && hMap[rep.bioguide_id]) { optKey = hMap[rep.bioguide_id]; }
    }
    var isVoiceVote = false;
    if (!optKey && wasInOffice && bill.voice_chamber) {
      isVoiceVote = true;
    }
    var rec = { bill: bill, optKey: optKey, wasInOffice: wasInOffice, isVoiceVote: isVoiceVote };
    if (optKey === "+") {
      actual += bill.cbo_10yr_b;
      absSum += Math.abs(bill.cbo_10yr_b);
      voted.push(rec);
    } else if (optKey === "-") {
      actual -= bill.cbo_10yr_b;
      absSum += Math.abs(bill.cbo_10yr_b);
      voted.push(rec);
    } else {
      notVoted.push(rec);
    }
  });
  if (absSum === 0) {
    return { actual: 0, min: 0, max: 0, absSum: 0, indexPct: null, voted: voted, notVoted: notVoted };
  }
  var indexPct = (absSum - actual) / (2 * absSum) * 100;
  return { actual: actual, min: -absSum, max: absSum, absSum: absSum, indexPct: indexPct, voted: voted, notVoted: notVoted };
}

function ParticipationFilteredPage({ computeFn, methodologyNote, legislators, keyVotesData, rollCalls, zipDistricts }) {
  var _zip       = useState("");   var zipInput = _zip[0]; var setZipInput = _zip[1];
  var _reps      = useState(null); var foundReps = _reps[0]; var setFoundReps = _reps[1];
  var _err       = useState(null); var error = _err[0]; var setError = _err[1];
  var _manual    = useState(false); var showManual = _manual[0]; var setShowManual = _manual[1];
  var _selState  = useState(""); var selState = _selState[0]; var setSelState = _selState[1];
  var _selDist   = useState(""); var selDist = _selDist[0]; var setSelDist = _selDist[1];
  var _multiOpts = useState(null); var multiOpts = _multiOpts[0]; var setMultiOpts = _multiOpts[1];
  var _modal     = useState(null); var modalRep = _modal[0]; var setModalRep = _modal[1];

  var allScored = useMemo(function () {
    if (!legislators || !keyVotesData) return { senate: [], house: [], byBg: {} };
    var senate = [];
    var house = [];
    var byBg = {};
    legislators.forEach(function (r) {
      var s = computeFn(r, keyVotesData, rollCalls);
      // Participation floor: below-threshold reps keep their scoreObj (so the modal
      // can still show what they voted for + the dollar contributions) but their
      // indexPct is nulled so they don't appear in the chamber dot plot or get a
      // misleading aggregate % on the card. The card renders a grey dash.
      if (s && s.voted.length < VARE_MIN_VOTES) {
        s = Object.assign({}, s, { indexPct: null });
      }
      var entry = { rep: r, indexPct: s ? s.indexPct : null, scoreObj: s };
      byBg[r.bioguide_id] = entry;
      if (r.chamber === "senate") senate.push(entry);
      else if (r.chamber === "house") house.push(entry);
    });
    return { senate: senate, house: house, byBg: byBg };
  }, [legislators, keyVotesData, rollCalls, computeFn]);

  var districtsByState = useMemo(function () {
    if (!legislators) return {};
    var out = {};
    legislators.forEach(function (r) {
      if (r.chamber !== "house" || r.district === null) return;
      if (!out[r.state]) out[r.state] = [];
      if (!out[r.state].includes(r.district)) out[r.state].push(r.district);
    });
    return out;
  }, [legislators]);

  function doLookup(state, district) {
    if (!legislators) return;
    var d = district === null ? null : Number(district);
    var senators  = legislators.filter(function (r) { return r.chamber === "senate" && r.state === state; });
    var houseMems = legislators.filter(function (r) {
      if (r.chamber !== "house" || r.state !== state) return false;
      if (d === null) return true;
      return r.district === d || (d === 0 && r.district === 0);
    });
    if (senators.length === 0 && houseMems.length === 0) {
      setError("No representatives found for " + state + (d ? " district " + d : "") + ". Check your ZIP or try the manual selector.");
      setFoundReps(null);
      return;
    }
    setError(null);
    setFoundReps({ state: state, district: d, senators: senators, houseMember: houseMems[0] || null, zipUsed: zipInput });
  }

  function handleZipSubmit(e) {
    e.preventDefault();
    var z = zipInput.trim();
    if (!/^\d{5}$/.test(z)) { setError("Please enter a valid 5-digit ZIP code."); return; }
    if (!zipDistricts) { setShowManual(true); setError("ZIP lookup data hasn't loaded yet — use the manual selector below."); return; }
    var val = zipDistricts[z];
    if (!val) { setError("ZIP " + z + " not found. Try the manual selector below."); setShowManual(true); return; }
    var vals = Array.isArray(val) ? val : [val];
    if (vals.length > 1) { setMultiOpts(vals); setFoundReps(null); setError(null); return; }
    setMultiOpts(null);
    var parts = vals[0].split("-");
    doLookup(parts[0], parts.length > 1 ? parseInt(parts[1]) : null);
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    if (!selState) { setError("Please select your state."); return; }
    var distNums = districtsByState[selState] || [];
    var d = selDist !== "" ? Number(selDist) : (distNums.length === 1 ? distNums[0] : null);
    if (d === null && distNums.length > 1) { setError("Please select your congressional district."); return; }
    setZipInput("");
    doLookup(selState, d);
  }

  var allReps = foundReps
    ? [].concat(foundReps.senators || []).concat(foundReps.houseMember ? [foundReps.houseMember] : [])
    : [];
  var userSenators  = foundReps ? (foundReps.senators || []) : [];
  var userHouseMems = foundReps && foundReps.houseMember ? [foundReps.houseMember] : [];

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", color: TEXT, maxWidth: 980, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Section IV — What Can You Do?</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: "0 0 10px", lineHeight: 1.25 }}>Your Representatives' Fiscal Record</h2>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, margin: 0, maxWidth: 660 }}>
          Enter your ZIP code to see each rep's <strong>fiscal index</strong>. 100 means their record reduced the deficit as much as it possibly could have given the bills they voted on; 0 means it increased the deficit as much as possible. The percentage tells you how much of their voting record is improving or worsening the deficit over the next ten years.
        </p>
      </div>

      <form onSubmit={handleZipSubmit} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input type="text" inputMode="numeric" placeholder="5-digit ZIP code"
          value={zipInput}
          onChange={function (e) { setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5)); setError(null); }}
          maxLength={5}
          style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "9px 14px", fontSize: 14, fontFamily: "inherit", width: 155, outline: "none", color: TEXT }} />
        <button type="submit" style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Find My Reps
        </button>
      </form>

      {error && <div style={{ fontSize: 12, color: VARD_RED, marginBottom: 10 }}>{error}</div>}

      {multiOpts && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>
            Your ZIP spans multiple congressional districts — which one?
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {multiOpts.map(function (opt, i) {
              var parts = opt.split("-");
              var state = parts[0]; var dist = parts[1] ? parseInt(parts[1]) : null;
              return (
                <button key={i} onClick={function () { setMultiOpts(null); doLookup(state, dist); }}
                  style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, color: "#92400e" }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={function () { setShowManual(!showManual); }}
        style={{ background: "none", border: "none", fontSize: 12, color: BLUE, cursor: "pointer", padding: 0, textDecoration: "underline", marginBottom: showManual ? 10 : 4 }}>
        {showManual ? "Hide manual selector" : "Don't know your ZIP? Select state & district manually"}
      </button>

      {showManual && (
        <form onSubmit={handleManualSubmit} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <select value={selState} onChange={function (e) { setSelState(e.target.value); setSelDist(""); }}
            style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", color: TEXT }}>
            <option value="">— State —</option>
            {US_STATE_LIST.map(function (s) { return <option key={s} value={s}>{s}</option>; })}
          </select>
          {selState && districtsByState[selState] && districtsByState[selState].length > 1 && (
            <select value={selDist} onChange={function (e) { setSelDist(e.target.value); }}
              style={{ border: "1.5px solid " + BORDER, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", color: TEXT }}>
              <option value="">— House District —</option>
              {(districtsByState[selState] || []).slice().sort(function (a, b) { return a - b; }).map(function (d) {
                return <option key={d} value={d}>{selState}-{d}</option>;
              })}
            </select>
          )}
          <button type="submit" style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Go
          </button>
        </form>
      )}

      {foundReps && allReps.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
            Showing reps for <strong>{foundReps.state}{foundReps.district ? "-" + foundReps.district : ""}</strong>
            {foundReps.zipUsed && <span> (ZIP {foundReps.zipUsed})</span>}
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 26 }}>
            {allReps.map(function (rep) {
              var entry = allScored.byBg[rep.bioguide_id];
              return (
                <RepCardD key={rep.bioguide_id}
                  rep={rep}
                  scoreObj={entry ? entry.scoreObj : null}
                  onShowDetails={function () { setModalRep({ rep: rep, scoreObj: entry.scoreObj }); }} />
              );
            })}
          </div>

          {userSenators.length > 0 && (
            <IndexDotPlotD chamberLabel="Senate" data={allScored.senate} userReps={userSenators} />
          )}
          {userHouseMems.length > 0 && (
            <IndexDotPlotD chamberLabel="House" data={allScored.house} userReps={userHouseMems} />
          )}

          {methodologyNote && (
            <div style={{ marginTop: 18, padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid " + BORDER, fontSize: 11, color: MUTED, lineHeight: 1.65 }}>
              {methodologyNote}
            </div>
          )}
        </div>
      )}

      {!legislators && (
        <div style={{ fontSize: 13, color: MUTED, padding: "20px 0" }}>Loading representative data…</div>
      )}

      {modalRep && (
        <VariantDModal rep={modalRep.rep} scoreObj={modalRep.scoreObj} onClose={function () { setModalRep(null); }} />
      )}
    </div>
  );
}

function RepresentativesPageE(props) {
  return <ParticipationFilteredPage computeFn={vareComputeIndex} {...props} />;
}
function RepresentativesPageF(props) {
  var note = "Variant F includes bills since 2015 with a 10-year CBO net deficit score of $25 billion or more, where both chambers acted on the bill (recorded vote or voice vote). Members with fewer than 5 recorded Yea or Nay votes in this set do not appear in the chart but remain searchable.";
  return <ParticipationFilteredPage computeFn={varfComputeIndex} methodologyNote={note} {...props} />;
}

var REP_VARIANTS = [
  { key: "A", label: "Current",   component: RepresentativesPageA },
  { key: "B", label: "Variant B", component: RepresentativesPageB },
  { key: "C", label: "Variant C", component: RepresentativesPageC },
  { key: "D", label: "Variant D", component: RepresentativesPageD },
  { key: "E", label: "Variant E", component: RepresentativesPageE },
  { key: "F", label: "Variant F", component: RepresentativesPageF },
];

function readQuery(name) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function RepresentativesPage(props) {
  var _v = useState(function () {
    var q = (readQuery("variant") || "A").toUpperCase();
    return REP_VARIANTS.find(function (x) { return x.key === q; }) ? q : "A";
  });
  var variant = _v[0]; var setVariant = _v[1];

  var showSwitcher = readQuery("variants") === "on";

  function pick(k) {
    setVariant(k);
    if (typeof window !== "undefined" && window.history && window.history.replaceState) {
      var url = new URL(window.location.href);
      url.searchParams.set("variant", k);
      window.history.replaceState({}, "", url.toString());
    }
  }

  var match = REP_VARIANTS.find(function (x) { return x.key === variant; }) || REP_VARIANTS[0];
  var Active = match.component;

  return (
    <div>
      {showSwitcher && (
        <div style={{
          maxWidth: 980, margin: "0 auto 14px", padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#92400e", letterSpacing: 1.5, textTransform: "uppercase" }}>
            Preview · collaborators only
          </span>
          {REP_VARIANTS.map(function (v) {
            var active = v.key === variant;
            return (
              <button key={v.key} onClick={function () { pick(v.key); }}
                style={{
                  background: active ? "#1e3a5f" : "#fff",
                  color: active ? "#fff" : TEXT,
                  border: "1px solid " + (active ? "#1e3a5f" : BORDER),
                  borderRadius: 999, padding: "4px 12px",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>
                {v.key} · {v.label}
              </button>
            );
          })}
        </div>
      )}
      <Active {...props} />
    </div>
  );
}

// ─────────────────────────────────────────────
// NAVIGATION SHELL
// ─────────────────────────────────────────────
var SLIDE_MS = 320;

function PageShell({ page, setPage, children, prompt }) {
  var _dir     = useState(1);     var dir     = _dir[0];     var setDir     = _dir[1];
  var _visible = useState(true);  var visible = _visible[0]; var setVisible = _visible[1];
  var _content = useState(children); var content = _content[0]; var setContent = _content[1];
  var _menuOpen   = useState(false); var menuOpen   = _menuOpen[0];   var setMenuOpen   = _menuOpen[1];
  var _expanded   = useState({});    var expanded   = _expanded[0];   var setExpanded   = _expanded[1];
  var pendingPage = useRef(null);
  var menuRef     = useRef(null);

  var total    = PAGES.length;
  var pageMeta = PAGES[page] || PAGES[0];
  var section  = pageMeta.section != null ? SECTIONS[pageMeta.section] : null;

  function navigate(next) {
    if (next === page || next < 0 || next >= total) return;
    var d = next > page ? 1 : -1;
    pendingPage.current = { next: next, d: d };
    setDir(d);
    setVisible(false);
    setMenuOpen(false);
  }

  useEffect(function () {
    if (!visible && pendingPage.current) {
      var t = setTimeout(function () {
        var p = pendingPage.current;
        pendingPage.current = null;
        setPage(p.next);
        setVisible(true);
      }, SLIDE_MS);
      return function () { clearTimeout(t); };
    }
  }, [visible]);

  useEffect(function () { setContent(children); }, [page]);

  // Close menu on outside click
  useEffect(function () {
    if (!menuOpen) return;
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return function () { document.removeEventListener("mousedown", handler); };
  }, [menuOpen]);

  // Auto-expand the section containing the current page
  useEffect(function () {
    if (pageMeta.section != null) {
      setExpanded(function (prev) { return Object.assign({}, prev, { [pageMeta.section]: true }); });
    }
  }, [page]);

  var ty = visible ? "translateY(0)" : (dir > 0 ? "translateY(-40px)" : "translateY(40px)");

  // Build section→pages lookup
  var sectionGroups = SECTIONS.map(function (s) {
    var items = PAGES.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) { return x.p.section === s.id; });
    return { s: s, items: items };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: BG, fontFamily: "'Segoe UI', system-ui, sans-serif", color: TEXT }}>

      {/* Nav bar */}
      <div style={{ background: "#1e3a5f", padding: "10px 20px", display: "flex", alignItems: "center", gap: 14, flexShrink: 0, position: "relative", zIndex: 200 }}>
        {page > 0 && (
          <button onClick={function () { navigate(page - 1); }}
            style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1, flexShrink: 0 }}>←</button>
        )}

        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.3, color: "#fff", flexShrink: 0 }}>Visualize Policy</span>

        <div style={{ flex: 1 }} />

        {/* Current page label */}
        {pageMeta.title && (
          <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
            {pageMeta.title}
          </span>
        )}

        {/* Hamburger / menu button */}
        <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={function () { setMenuOpen(!menuOpen); }}
            style={{ background: menuOpen ? "rgba(255,255,255,0.12)" : "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 7, color: "#fff", cursor: "pointer", padding: "5px 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ width: 16, height: 2, background: "#fff", borderRadius: 1 }} />
              <div style={{ width: 16, height: 2, background: "#fff", borderRadius: 1 }} />
              <div style={{ width: 16, height: 2, background: "#fff", borderRadius: 1 }} />
            </div>
            <span style={{ fontSize: 12 }}>Menu</span>
          </button>

          {/* Dropdown panel */}
          {menuOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              background: "#fff", borderRadius: 10,
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              border: "1px solid " + BORDER,
              minWidth: 280, zIndex: 300,
              overflow: "hidden",
            }}>
              {/* Intro */}
              <button onClick={function () { navigate(0); }} style={{
                width: "100%", textAlign: "left", padding: "11px 16px",
                background: page === 0 ? "#f0f4ff" : "none",
                border: "none", borderBottom: "1px solid " + BORDER,
                fontSize: 13, fontWeight: page === 0 ? 600 : 400,
                color: page === 0 ? "#1e3a5f" : TEXT, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: page === 0 ? "#1e3a5f" : BORDER, flexShrink: 0 }} />
                Introduction
              </button>

              {/* Sections */}
              {sectionGroups.map(function (sg, si) {
                var firstIdx = sg.items[0] ? sg.items[0].i : 0;
                var lastIdx  = sg.items[sg.items.length - 1] ? sg.items[sg.items.length - 1].i : 0;
                var inSection = page >= firstIdx && page <= lastIdx;
                var isOpen   = expanded[sg.s.id] !== false && (inSection || expanded[sg.s.id]);

                return (
                  <div key={sg.s.id}>
                    {/* Section header — clickable to expand/jump */}
                    <button
                      onClick={function () { setExpanded(function (prev) { return Object.assign({}, prev, { [sg.s.id]: !isOpen }); }); }}
                      style={{
                        width: "100%", textAlign: "left",
                        padding: "10px 16px",
                        background: inSection ? "#f8f6ff" : "none",
                        border: "none",
                        borderBottom: isOpen ? "none" : "1px solid " + BORDER,
                        cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 10,
                      }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: sg.s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: sg.s.color, textTransform: "uppercase", letterSpacing: 0.8, flex: 1 }}>
                        {sg.s.label}
                      </span>
                      <span style={{ fontSize: 11, color: MUTED, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
                    </button>

                    {/* Pages within section */}
                    {isOpen && (
                      <div style={{ borderBottom: "1px solid " + BORDER }}>
                        {sg.items.map(function (x) {
                          var isActive = page === x.i;
                          var isDone   = page > x.i;
                          return (
                            <button key={x.i} onClick={function () { navigate(x.i); }} style={{
                              width: "100%", textAlign: "left",
                              padding: "8px 16px 8px 36px",
                              background: isActive ? "#f0f4ff" : "none",
                              border: "none", cursor: "pointer",
                              display: "flex", alignItems: "center", gap: 8,
                              fontSize: 13,
                              color: isActive ? "#1e3a5f" : isDone ? MUTED : TEXT,
                              fontWeight: isActive ? 600 : 400,
                            }}>
                              <div style={{
                                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                                background: isActive ? sg.s.color : isDone ? "#5a9a7a" : BORDER,
                              }} />
                              {x.p.title}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section entry banner */}
      {section && pageMeta.title && (
        <div style={{ background: section.color, padding: "6px 28px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: 1.5 }}>{section.label}</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>·</span>
          <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{pageMeta.title}</span>
        </div>
      )}

      {/* Page content */}
      <div data-content-scroll="1" style={{
        flex: 1, overflowY: "auto", padding: "36px 28px 0",
        maxWidth: 1100, margin: "0 auto", width: "100%",
        transform: ty, opacity: visible ? 1 : 0,
        transition: "transform " + SLIDE_MS + "ms cubic-bezier(0.4,0,0.2,1), opacity " + SLIDE_MS + "ms ease",
      }}>
        {visible ? children : content}
      </div>

      {/* Forward prompt button */}
      <div style={{
        padding: "24px 28px", maxWidth: 1100, margin: "0 auto", width: "100%", boxSizing: "border-box",
        transform: ty, opacity: visible ? 1 : 0,
        transition: "transform " + SLIDE_MS + "ms cubic-bezier(0.4,0,0.2,1), opacity " + SLIDE_MS + "ms ease",
      }}>
        {prompt && page > 0 && page < total - 1 && (
          <button onClick={function () { navigate(page + 1); }}
            style={{ width: "100%", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, padding: "16px 24px", fontSize: 15, fontWeight: 500, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span>{prompt}</span>
            <span style={{ fontSize: 20, opacity: 0.7 }}>↓</span>
          </button>
        )}
        {page === total - 1 && (
          <div style={{ textAlign: "center", fontSize: 13, color: MUTED, paddingBottom: 12 }}>
            End of tour · <a href="https://visualizepolicy.org" style={{ color: "#1e3a5f" }}>Visualize Policy</a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ROOT — DATA LOADING + PAGE DISPATCH
// ─────────────────────────────────────────────
export default function App() {
  var spendingData    = useCSV("spending_by_function.csv");
  var receiptsData    = useCSV("receipts_by_source.csv");
  var summaryData     = useCSV("summary.csv");
  var debtData        = useCSV("federal_debt.csv");
  var deficitProj     = useCSV("projections_deficit.csv");
  var niProj          = useCSV("projections_net_interest.csv");
  var projSummary     = useCSV("projections_summary.csv");
  var deficitData     = useCSV("deficit_pct_gdp.csv");
  var debtPctData     = useCSV("debt_pct_gdp.csv");
  var stabilizersData = useCSV("automatic_stabilizers.csv");
  var stimulusData    = useCSV("stimulus_spending.csv");
  var crowdingData    = useCSV("crowding_out.csv");
  var japanData       = useCSV("japan_case_study.csv");
  var taxData         = useCSV("tax_brackets.csv");
  var cboBaseline     = useCSV("cbo_baseline_2026.csv");
  var multipliersData = useJSON("fiscal_multipliers.json");
  var legislators     = useJSON("legislators-current.json");
  var keyVotesData    = useJSON("key_votes.json");
  // rollCalls and zipDistricts are optional — page renders gracefully without them
  var rollCalls       = useJSON("roll_calls.json");
  var zipDistricts    = useJSON("zip_districts.json");

  var _p  = useState(0);    var page          = _p[0];  var setPage          = _p[1];
  var _bc = useState({});   var budgetCuts     = _bc[0]; var setBudgetCuts     = _bc[1];
  var _br = useState(null); var budgetRatesRaw = _br[0]; var setBudgetRatesRaw = _br[1];

  var loading = !spendingData || !receiptsData || !summaryData || !debtData || !deficitProj || !niProj || !deficitData || !debtPctData || !stabilizersData || !stimulusData || !crowdingData || !taxData || !cboBaseline || !multipliersData || !legislators || !keyVotesData || !rollCalls;

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 16, color: MUTED }}>
        Loading…
      </div>
    );
  }

  // Page components indexed to match PAGES manifest
  var pages = [
    /* 0  */ <IntroPage onNavigate={setPage} />,
    /* 1  */ <DeficitHistoryPage deficitData={deficitData} />,
    /* 2  */ <DebtAccumulation   summaryData={summaryData} debtData={debtData} />,
    /* 3  */ <DebtToGDPPage      debtPctData={debtPctData} />,
    /* 4  */ <ObamaEraPage       stabilizersData={stabilizersData} stimulusData={stimulusData} />,
    /* 5  */ <DeficitPage        summaryData={summaryData} />,
    /* 6  */ <RevSpendPage       spendingData={spendingData} receiptsData={receiptsData} summaryData={summaryData} />,
    /* 7  */ <OBBBAPage         deficitProj={deficitProj} niProj={niProj} projSummary={projSummary} />,
    /* 8  */ <ConsolesPage />,
    /* 9  */ <CrowdingOutTextPage />,
    /* 10 */ <CrowdingOutPage   spendingData={spendingData} summaryData={summaryData} niProj={niProj} projSummary={projSummary} />,
    /* 11 */ <NetInterestPage   spendingData={spendingData} />,
    /* 12 */ <BudgetDilemmaPage spendingData={spendingData} summaryData={summaryData} />,
    /* 13 */ <TaxPage taxData={taxData} cboBaseline={cboBaseline}
               cuts={budgetCuts} setCuts={setBudgetCuts}
               ratesRaw={budgetRatesRaw} setRatesRaw={setBudgetRatesRaw} />,
    /* 14 */ <EconomicImpactPage taxData={taxData} cboBaseline={cboBaseline}
               cuts={budgetCuts} ratesRaw={budgetRatesRaw} multipliersData={multipliersData} />,
    /* 15 */ <RepresentativesPage legislators={legislators} keyVotesData={keyVotesData}
               rollCalls={rollCalls} zipDistricts={zipDistricts} />,
  ];

  return (
    <PageShell page={page} setPage={setPage} prompt={PAGES[page].prompt}>
      {pages[page]}
    </PageShell>
  );
}

