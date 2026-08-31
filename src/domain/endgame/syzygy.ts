import { Chess } from "chess.js";

export type SyzygyResult = {
  category: "win" | "draw" | "loss";
  distanceToZero?: number;
  source: "syzygy";
};

/**
 * Extension point only: V1 does not download tablebases. A future server-side
 * adapter can implement this contract without changing Pattern Engine callers.
 */
export type SyzygyProbe = (fen: string) => Promise<SyzygyResult | null>;

export function isSyzygyEligible(fen: string): boolean {
  return new Chess(fen).board().flat().filter(Boolean).length <= 7;
}
