import type { MoveSnapshot } from "@/domain/chess/types";
import type { PatternClassificationInput } from "@/domain/chess/analyze";
import { scorePedagogicalMoment } from "@/domain/diagnostic/pedagogical-score";
import {
  patternCandidatesForPosition,
  patternsForAnalyzedMove,
  structureForPosition,
} from "@/domain/patterns/engine";

type IndexedMove<T> = { index: number; move: T };
type Request =
  | { id: number; type: "scan"; items: Array<IndexedMove<MoveSnapshot>> }
  | { id: number; type: "classify"; items: Array<IndexedMove<PatternClassificationInput>> };

self.addEventListener("message", (event: MessageEvent<Request>) => {
  const { id, type, items } = event.data;
  try {
    const results = type === "scan"
      ? items.map(({ index, move }, itemIndex) => {
          const value = patternCandidatesForPosition(move.fenBefore, { phase: move.phase, ply: move.ply });
          self.postMessage({ id, type: "progress", completed: itemIndex + 1, total: items.length });
          return { index, value };
        })
      : items.map(({ index, move: input }, itemIndex) => {
          const patterns = patternsForAnalyzedMove(input.move);
          const value = {
            patterns,
            pawnStructure: structureForPosition(input.move.fenBefore),
            pedagogical: scorePedagogicalMoment({
              beforeCp: input.move.playerCpBefore,
              afterCp: input.move.playerCpAfter,
              patterns,
              phase: input.move.phase,
              ply: input.move.ply,
              playerRating: input.playerRating,
            }),
          };
          self.postMessage({ id, type: "progress", completed: itemIndex + 1, total: items.length });
          return { index, value };
        });
    self.postMessage({ id, type: "result", results });
  } catch (reason) {
    self.postMessage({
      id,
      type: "error",
      error: reason instanceof Error ? reason.message : "La classification pédagogique a échoué.",
    });
  }
});
