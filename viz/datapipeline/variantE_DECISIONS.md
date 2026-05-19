# Variant E — Methodology Decisions

This file documents the judgment calls made on the 6 flags raised in `variantE_audit.md`. Each decision is reversible — disagree on any of them and I'll re-run.

## Scope

Variant E uses bills with **|10-yr CBO/JCT net deficit score| ≥ $25B**, regardless of whether the bill was enacted or failed-with-recorded-roll-call. Members with fewer than 5 recorded Yea/Nay votes in the Variant E universe are excluded from the display (signal-to-noise floor).

## Decisions

### 1. F3 — Tax Relief for American Families and Workers Act (Wyden-Smith, H.R. 7024, 2024)

**Decision: EXCLUDE.**

JCT net 10-yr score is ~$0.4B (CTC expansion ~$78B financed by ~$78B in ERC pay-fors → net ~zero). That fails the $25B threshold on the established net-deficit basis used by every other bill in the existing 14. Gross policy magnitude is large (~$79B each side), but Variant E's methodology is net deficit impact, full stop.

### 2. F6 — Restoring Americans' Healthcare Freedom Reconciliation Act (H.R. 3762, 2015–2016)

**Decision: cite Jan 6 2016 House Roll 6 (motion to concur in Senate amendment) at -$282B conventional CBO score.**

Two House votes occurred: the original passage (Oct 23 2015, Roll 568) and the motion to concur on the Senate-amended version (Jan 6 2016, Roll 6). Roll 6 is the version that went to the President's desk and got vetoed. That's the final-form chamber action.

On scoring: -$282B (conventional / no macro feedback). The existing 14 all use conventional CBO scores, not dynamic/macro-augmented versions. Cite the alternative -$474B macro figure in `cbo_note` for transparency.

### 3. F2 + F2b — AHCA House passage AND Senate skinny-repeal

**Decision: include BOTH as separate bill entries.** F2 covers the House-passed AHCA (post-MacArthur, -$119B). F2b covers the Senate "Healthcare Freedom Act" skinny repeal (-$179B).

These are different bills *for index purposes* even though they share the H.R. 1628 vehicle number:
- Different bill text (the Senate version added an entirely different amendment, removing the AHCA replacement structure)
- Different CBO scores (-$119B vs -$179B)
- Different chamber roll calls (House Roll 256 May 2017 vs Senate Roll 179 July 2017)
- **Different members voted on each** (House members had no recorded vote on skinny repeal; senators had no vote on the post-MacArthur AHCA)

Treating them as one entry would silently attribute the wrong score to whichever chamber didn't actually vote on that version. Separate entries are the only honest accounting.

### 4. E2 — Bipartisan Budget Act of 2015

**Decision: EXCLUDE.**

Under the convention used by the existing 14 (cap-raise-as-spending, applied to BBA 2018 at +$320B and BBA 2019 at +$245B), BBA 2015 nets to approximately zero — the bill raised discretionary caps by ~$80B over FY16-17 *and* the offsets/savings totaled $80.9B. Net ≈ $0 fails the $25B threshold either way.

Could be reinstated at -$80B if Variant E adopts a "CBO mandatory/revenue net only" convention, but that would create inconsistency with BBA 2018/2019's existing scoring. Cleaner to drop.

### 5. E4 — FAST Act

**Decision: EXCLUDE.**

The -$71B mandatory/revenue "savings" come almost entirely from a one-time Federal Reserve surplus drawdown booked as revenue — a budget gimmick widely criticized by both CBO and external trackers. The bill's actual fiscal action was providing $305B in surface transportation budget authority (discretionary, not in the mandatory/revenue scope) over 5 years. Including the FAST Act under either convention misrepresents what the bill did.

### 6. E6 — FY25 CR + IRS rescission (P.L. 119-4)

**Decision: INCLUDE at +$66B.**

The bill's defining policy choice is the rescission of $20.2B of IRS enforcement funding (originally appropriated by IRA 2022). CBO scores this at +$66B over 10 years because reduced enforcement = lower compliance = lower collections — a legitimate causal scoring chain.

Yes, this is the same mechanism that arguably tainted P.L. 118-47's score, but the difference is intent: P.L. 118-47's rescission was a side-effect of a discretionary omnibus; P.L. 119-4's rescission is the substantive policy choice. The roll calls reflect members' deliberate position on IRS funding.

Flagged in the bill's `cbo_note` so future readers see the methodological asterisk.

### 7. Emergency supplementals (Ukraine/Israel/disaster)

**Decision: EXCLUDE.**

These are discretionary BA (budget authority), not mandatory or revenue legislation, and don't appear in CBO's annual mandatory/revenue reports. Including them would extend Variant E's methodology beyond what's well-defined; better as a future Variant F if there's interest in scoring emergency supplementals separately.

## Final Variant E bill universe

24 total bills:

**Enacted (18):** the 14 existing + E1 MACRA + E3 PATH Act / CAA 2016 + E5 Social Security Fairness Act + E6 FY25 CR.

**Failed (6):** F1 BBB + F2 AHCA House + F2b Senate skinny repeal + F4 HEROES + F5 Dream and Promise + F6 H.R. 3762 ACA repeal.

Score range: -$1,500B (FRA) to +$3,397B (HEROES). About $13T of cumulative absolute fiscal magnitude across the 24 bills — enough granularity that individual member scores don't pivot on a single vote.
