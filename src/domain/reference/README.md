# ChessPath Pilot Concept Development Reference

Status: **DEVELOPMENT REFERENCE — INTERNAL SECOND REVIEW ONLY**, version `1.1.0-pilot`.

This directory is a conceptual test bench for exactly six pilot concepts:
`outpost`, `open_file`, `improve_worst_piece`, `opposition`,
`restrict_counterplay`, and `exchange_attacker`.

It is not a gold set, an independent holdout, a Training Bank, or evidence that
the current Pattern Engine is accurate. Every retained observation still has
`external_review_required = true`.

## Layer boundaries

1. **Verified chess state** supplies board facts only.
2. **Typed concept objects** carry evidence, counterevidence, uncertainty,
   constitutive conditions, and confounders.
3. **Affordances** ask what the property actually enables.
4. **Decision comparison** compares plausible human plans and critical replies.
5. **Pedagogical centrality** separates presence, decision relevance, priority,
   and confidence; abstention is a first-class result.
6. **Training suitability** is recorded separately and never publishes a
   reference position into Training.

## Files

- `types.ts`: versioned schemas for contracts, typed objects, references,
  coverage, abstentions, and the future holdout manifest.
- `pilot-contracts.ts`: the six reviewed concept contracts and anti-shortcut
  policies.
- `source-catalog.ts`: frozen provenance for natural positions already present
  in ChessPath's source corpus. It contains no conceptual labels.
- `legacy/development-reference.work-a.ts.txt`: frozen Work A scaffold. It
  remains only so the old 60 generated rows can be traced and audited; it is
  neither compiled nor exported.
- `legacy-audit.ts`: explicit KEEP / RELABEL / REPAIR / REJECT decision for
  every old Work A row.
- `adjudicated-reference.ts`: smaller A.1 bank with one explicit assessment per
  chess observation, candidate interpretations, an adjudicated interpretation,
  uncertainty, quality gates, and internal-review status.
- `board-truth.ts`: independent chess.js assertions for pieces, files, legal
  branches, opponent resources, captures, and opposition geometry.
- `adjudicated-benchmark.ts`: credible same-initial-FEN branches, explicitly
  uncontrolled natural relations, a small set of non-tautological probes,
  actual coverage, saturation status, gaps, and future holdout manifest.
- `legacy/pilot-benchmark.work-a.ts.txt` and
  `legacy/pilot-reference.work-a.test.ts.txt`: frozen Work A generated
  benchmark/tests kept for traceability and no longer compiled or exported.
- `splits.ts`: deterministic leave-one-cluster-out helpers.
- `adjudicated-reference.test.ts`: semantic board assertions, audit integrity,
  anti-circularity, relation credibility, coverage, and leakage tests. It never
  invokes the current Pattern Engine.

## Anti-circularity

The positions were frozen from an existing source corpus before this pilot
annotation module was introduced. Most were originally surfaced by existing
ChessPath rules. A few additional natural positions were selected from that same
detector-influenced corpus to repair factual gaps. Their labels are therefore
**not independent**. The module consequently:

- records every item as `development_reference`;
- does not import `detectMovePatterns`, the Pattern Engine, or the Training Bank;
- persists Syzygy WDL/DTZ for two six-piece cases as objective outcome checks,
  while keeping their concept interpretation unresolved;
- requires a future collection path that does not run ChessPath detectors;
- excludes all game/player/position/structure/counterfactual clusters from the
  future independent holdout.

## Coverage and saturation

Raw position count and equal per-family quotas are not stopping rules. The matrix tracks mechanism family,
structure, material, side to move, Elo bucket, evaluation state, tactical
competition, neighboring concepts, source, difficulty, negative family,
natural/branch/synthetic status, and agreement status.

The pilot is **not saturated**. `CONCEPT_SATURATION` is only `developing` or
`insufficient`, and explicitly states that new error families are still
appearing. `COVERAGE_GAPS` names missing evidence per concept. Saturation can
only be reconsidered after independent, double-blind annotation and segment
calibration.

## Counterfactual policy

Only legal branches with exactly the same initial FEN are called
counterfactuals. Natural before/after or cross-game relations are recorded in a
separate observational list with every changed variable and limitation made
explicit. No synthetic FEN was added in this pilot. If controlled
synthetic transformations are added later, they must remain a minority, pass
legality/plausibility/hidden-tactic checks, retain non-causal variables, carry a
transformation cluster, and remain permanently excluded from Training.
