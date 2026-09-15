import { Chess } from "chess.js";
import type { TrainingExercise } from "../chess/types";
import { causalFeatures, matchesConceptSpecification } from "../patterns/concept-specifications";
import { teachingDisposition, type TeachingDisposition } from "./teaching-facts";

export type BankContrastCase = {
  id: string;
  family: "restrict_counterplay" | "king_activity" | "open_file" | "favorable_exchange";
  type: "A" | "B" | "C" | "D" | "E" | "F";
  sourceExerciseId: string;
  variantSourceExerciseId?: string;
  expected: TeachingDisposition;
  chessReason: string;
  pedagogicalReason: string;
};

const ANCHORS = {
  restrict_counterplay: "master-convert_small_advantage-ae9df73aa68621",
  king_activity: "master-king_activity-c710572f14687d",
  open_file: "master-open_file-5594f9849b1cfa",
  favorable_exchange: "master-favorable_exchange-26b004c624e5ff",
} as const;

const ATYPICAL_ANCHORS = {
  restrict_counterplay: "master-convert_small_advantage-2377523a907dc7",
  king_activity: "master-king_activity-832c1e7292a919",
  open_file: "master-open_file-0ed40583679468",
  favorable_exchange: "master-favorable_exchange-e31ae909c5115f",
} as const;

/** Small adversarial acceptance set. C/D/E/F are test-time transformations of
 * an existing real position; they never enter the active training bank. */
export const BANK_CONTRAST_CHALLENGE: BankContrastCase[] = Object.entries(ANCHORS).flatMap(([family, sourceExerciseId]) => ([
  {
    id: `${family}-A-classic-positive`, family, type: "A", sourceExerciseId,
    expected: "promote",
    chessReason: "The verified line realizes the family’s necessary board signal.",
    pedagogicalReason: "A concrete decision, state change and contrast are all present.",
  },
  {
    id: `${family}-B-atypical-positive`, family, type: "B", sourceExerciseId,
    variantSourceExerciseId: ATYPICAL_ANCHORS[family as keyof typeof ATYPICAL_ANCHORS],
    expected: "promote",
    chessReason: "A different material or source context realizes the same causal family.",
    pedagogicalReason: "The detector must generalize beyond the classic geometry without relaxing the teaching contract.",
  },
  {
    id: `${family}-C-hard-negative`, family, type: "C", sourceExerciseId,
    expected: "reject",
    chessReason: "A legal look-alike move does not realize the required mechanism.",
    pedagogicalReason: "Surface resemblance is insufficient without the causal state change.",
  },
  {
    id: `${family}-D-minimal-counterfactual`, family, type: "D", sourceExerciseId,
    expected: "reject",
    chessReason: "Changing only the candidate decision removes the family’s necessary state change.",
    pedagogicalReason: "The verdict turns on the concrete mechanism, not on the unchanged surface position.",
  },
  {
    id: `${family}-E-competing-plan`, family, type: "E", sourceExerciseId,
    expected: "abstain",
    chessReason: "A sound competing plan prevents this family from being established as the unique lesson.",
    pedagogicalReason: "A true concept is not promoted when concept priority is unresolved.",
  },
  {
    id: `${family}-F-ambiguous`, family, type: "F", sourceExerciseId,
    expected: "abstain",
    chessReason: "The board mechanism remains possible, but the human decision contrast is not established.",
    pedagogicalReason: "ChessPath must not promote an unqualified teaching decision.",
  },
] as BankContrastCase[]));

function legalHardNegative(anchor: TrainingExercise): string {
  const chess = new Chess(anchor.fen);
  const legal = chess.moves({ verbose: true });
  for (const move of legal) {
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    const features = causalFeatures(anchor.fen, uci);
    if (features && !matchesConceptSpecification(anchor.conceptSlug, features)) return uci;
  }
  throw new Error(`No legal hard negative for ${anchor.id}`);
}

function minimalCounterfactual(anchor: TrainingExercise): string {
  const from = anchor.bestMove.slice(0, 2);
  const chess = new Chess(anchor.fen);
  const samePiece = chess.moves({ verbose: true }).filter((move) => move.from === from);
  for (const move of samePiece) {
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    const features = causalFeatures(anchor.fen, uci);
    if (features && !matchesConceptSpecification(anchor.conceptSlug, features)) return uci;
  }
  return legalHardNegative(anchor);
}

export function materializeBankContrastCase(
  challenge: BankContrastCase,
  bank: TrainingExercise[],
): TrainingExercise {
  const anchor = bank.find((exercise) => exercise.id === challenge.sourceExerciseId);
  if (!anchor) throw new Error(`Missing contrast anchor ${challenge.sourceExerciseId}`);
  if (challenge.type === "A") return anchor;
  if (challenge.type === "B") {
    const atypical = bank.find((exercise) => exercise.id === challenge.variantSourceExerciseId);
    if (!atypical) throw new Error(`Missing atypical contrast anchor ${challenge.variantSourceExerciseId}`);
    return atypical;
  }
  if (challenge.type === "E" || challenge.type === "F") return {
    ...anchor,
    trainingAssessment: anchor.trainingAssessment ? {
      ...anchor.trainingAssessment,
      exerciseability: false,
      reasons: [...anchor.trainingAssessment.reasons,
        challenge.type === "E" ? "challenge_competing_concept_priority" : "challenge_ambiguous_decision"],
    } : undefined,
  };
  const alternative = challenge.type === "D" ? minimalCounterfactual(anchor) : legalHardNegative(anchor);
  return {
    ...anchor,
    id: `${anchor.id}-hard-negative-fixture`,
    bestMove: alternative,
    solutionLine: [alternative],
    acceptedConceptMoveUcis: [alternative],
    requiredSteps: undefined,
    pedagogicalMilestone: undefined,
    validationFingerprint: undefined,
  };
}

export function evaluateBankContrastCase(challenge: BankContrastCase, bank: TrainingExercise[]): TeachingDisposition {
  return teachingDisposition(materializeBankContrastCase(challenge, bank));
}
