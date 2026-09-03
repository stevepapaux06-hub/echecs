import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { Chess } from "chess.js";
import { it } from "vitest";
import type { TrainingExercise } from "../src/domain/chess/types";
import { causalFeatures, CONCEPT_SPECIFICATIONS, matchesConceptSpecification } from "../src/domain/patterns/concept-specifications";
import { referenceBank } from "../src/domain/training/library";
import quality from "../src/domain/training/quality-bank.generated.json";

it.skipIf(process.env.CHESSPATH_REMINE !== "1")("remines only measured coverage holes from the cached local PGN", async () => {
  const report = quality.report as { byConcept?: Record<string, number> };
  if (!report.byConcept) throw new Error("Filter first: missing coverage report");
  const coverage = report.byConcept;
  const wanted = Object.entries(CONCEPT_SPECIFICATIONS).filter(([concept, spec]) => (
    ["strategy", "endgame", "conversion"].includes(spec.domain)
    && (coverage[`${spec.domain}/${concept}`] ?? 0) < 40
    && !["pawn_structure", "favorable_exchange", "simplify_when_ahead"].includes(concept)
  ));
  const existing = referenceBank();
  const existingGames = new Set(existing.map((e) => e.sourceGameId));
  const fens = new Set(existing.map((e) => e.fen.split(" ").slice(0, 4).join(" ")));
  const collected: TrainingExercise[] = []; const byConcept: Record<string, number> = {};
  const seenMoments = new Set<string>(); let games = 0; let evaluated = 0; let eligibleGames = 0;
  const handle = (pgn: string) => {
    if (!pgn.trim()) return;
    games += 1;
    const chess = new Chess(); try { chess.loadPgn(pgn); } catch { return; }
    const headers = chess.getHeaders(); const site = headers.Site ?? "";
    const id = site.match(/lichess\.org\/([A-Za-z0-9]+)/)?.[1];
    if (!id || existingGames.has(id) || Number((headers.TimeControl ?? "0").split("+")[0]) < 180) return;
    const rating = (Number(headers.WhiteElo) + Number(headers.BlackElo)) / 2;
    if (!Number.isFinite(rating) || rating < 1000 || rating > 2500) return;
    eligibleGames += 1;
    for (const [index, move] of chess.history({ verbose: true }).entries()) {
      if (index < 24 || index > 150 || index % 6 !== 0 || move.captured || move.promotion || move.san.includes("+")) continue;
      const fen = move.before; const canonical = fen.split(" ").slice(0, 4).join(" ");
      if (fens.has(canonical)) continue;
      const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
      const feature = causalFeatures(fen, uci); evaluated += 1;
      if (!feature) continue;
      for (const [concept, spec] of wanted) {
        if ((byConcept[concept] ?? 0) >= 120 || seenMoments.has(`${id}:${concept}`)) continue;
        if ((spec.domain === "strategy" && feature.phase !== "middlegame") || (spec.domain === "endgame" && feature.phase !== "endgame")) continue;
        if (!matchesConceptSpecification(concept, feature)) continue;
        seenMoments.add(`${id}:${concept}`); fens.add(canonical); byConcept[concept] = (byConcept[concept] ?? 0) + 1;
        const hash = createHash("sha256").update(`${canonical}|${concept}`).digest("hex").slice(0, 14);
        collected.push({ id: `quality-mine-${concept}-${hash}`, fen, bestMove: uci, type: spec.domain === "conversion" ? "conversion" : spec.domain === "endgame" ? "endgame" : "strategy",
          domain: spec.domain, category: spec.domain, phase: feature.phase as TrainingExercise["phase"], conceptSlug: concept, primaryConcept: concept,
          theme: concept, origin: "concept", mode: "one-move", pedagogicalUnit: "single_move", source: "lichess_standard",
          sourceId: `${id}-${index + 1}`, sourceGameId: id, positionPly: index + 1, sourcePlayers: [headers.White, headers.Black],
          sourceRole: rating >= 2000 ? "model_position" : "human_practice", sourceLabel: `${headers.White} – ${headers.Black} · ${headers.Date}`,
          gameUrl: site, title: "Décision de partie", prompt: "Compare les plans.", playerColor: move.color === "w" ? "white" : "black",
          baselinePlayerCp: spec.domain === "conversion" ? 150 : 0, concept: spec.transfer_rule_family, maxPlayerMoves: 1,
          solutionLine: [uci], difficulty: Math.round(Math.max(1000, Math.min(1800, 1050 + feature.pieceCount * 15 + feature.legalChoices * 4))),
          classificationConfidence: 0.9, pedagogicalMechanism: concept, keyPieces: [move.from], keySquares: feature.targetSquares,
          materialSignature: fen.split(" ")[0].replace(/[1-8/]/g, "").split("").sort().join(""),
          pawnStructureSignature: new Chess(fen).board().flat().filter((p) => p?.type === "p").map((p) => `${p!.color}${p!.square}`).sort().join("|"),
          // Pending engine evidence is deliberately not exposed by the human gate.
          qualityScore: 80, isVerified: false, verificationSource: "quality compiler candidate; engine activation required",
        });
        break; // one causal lesson per position, never multiple labels for volume
      }
    }
  };
  const input = createInterface({ input: createReadStream(".tmp-corpus/lichess_db_standard_rated_2013-01.pgn"), crlfDelay: Infinity });
  let pgn = "";
  for await (const line of input) {
    if (line.startsWith("[Event ") && pgn) { handle(pgn); pgn = ""; }
    pgn += `${line}\n`;
    if (collected.length >= 1200 || games >= 12000) break;
  }
  input.close();
  const miningReport = { games, eligibleGames, positionsExamined: evaluated, candidates: collected.length, byConcept,
    source: "cached Lichess standard January 2013 · CC0", coverageBefore: coverage };
  writeFileSync("src/domain/training/remined-reference.generated.json", JSON.stringify({ positions: collected, report: miningReport }, null, 2) + "\n");
  console.log(JSON.stringify(miningReport, null, 2));
}, 900_000);
