import { describe, expect, it, vi } from "vitest";
import type {
  EngineEvaluation,
  EngineLine,
  PlayerProfile,
  TrainingExercise,
} from "@/domain/chess/types";
import { requestPedagogyFromOpenAI } from "../../infrastructure/openai/pedagogy";
import { allConceptExercises } from "./library";
import {
  coachTrainingExercises,
  type PedagogyCache,
  type PedagogyCandidate,
} from "./pedagogy";

const profile: PlayerProfile = {
  username: "public-player",
  displayName: "Public player",
  rating: 1_320,
};

function personalExercise(id = "personal-game-42-17"): TrainingExercise {
  const base = allConceptExercises().find((exercise) => (
    exercise.id === "concept-opening-develop-with-tempo"
  ))!;
  return {
    ...base,
    id,
    origin: "personal",
    sourceLabel: "Ta partie contre Camille",
    gameUrl: "https://www.chess.com/game/live/42",
    playedMove: "a2a3",
    playedMovePlayerCp: -40,
    lossCp: 60,
  };
}

function evaluation(fen: string): EngineEvaluation {
  const moves = ["g1f3", "b1c3", "f1c4"];
  const lines: EngineLine[] = moves.map((uci, index) => ({
    multipv: index + 1,
    depth: 10,
    rawScore: { type: "cp", value: 30 - index * 10 },
    whiteScore: { type: "cp", value: 30 - index * 10 },
    whiteCp: 30 - index * 10,
    pv: [uci],
  }));
  return {
    fen,
    sideToMove: "w",
    whiteCp: 30,
    bestMove: "g1f3",
    depth: 10,
    lines,
    debug: {
      fen,
      sideToMove: "w",
      requestedDepth: 10,
      reachedDepth: 10,
      bestMove: "g1f3",
      lines: [],
    },
  };
}

function memoryCache(): PedagogyCache {
  const values = new Map();
  return { get: (key) => values.get(key), set: (key, value) => values.set(key, value) };
}

function coachedFetcher({
  worthTraining = true,
  conceptSlug = "development-with-tempo",
  conceptMoves = ["g1f3"],
}: {
  worthTraining?: boolean;
  conceptSlug?: string;
  conceptMoves?: string[];
} = {}): typeof fetch {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { candidates: PedagogyCandidate[] };
    return new Response(JSON.stringify({
      status: "coached",
      decisions: body.candidates.map((candidate) => ({
        exerciseId: candidate.exerciseId,
        cacheKey: candidate.cacheKey,
        worthTraining,
        pedagogicalScore: worthTraining ? 88 : 5,
        category: candidate.assumedCategory,
        conceptSlug,
        conceptLabel: "Développement avec tempo",
        exerciseType: "principle",
        rootCause: "Le coup joué ne développait aucune pièce.",
        learningGoal: "Développe une pièce tout en créant une menace utile.",
        question: "Quelle décision d’ouverture choisirais-tu ici ?",
        rejectReason: worthTraining ? null : "Position sans ressource pédagogique claire.",
        conceptMoveUcis: worthTraining ? conceptMoves : [],
      })),
    }));
  }) as typeof fetch;
}

const engine = { analyze: async (fen: string) => evaluation(fen) };

describe("pedagogical coach", () => {
  it("can reject a massively lost candidate without a useful resource", async () => {
    const lost = {
      ...personalExercise(),
      category: "defense" as const,
      conceptSlug: "defense",
      baselinePlayerCp: -900,
      playedMovePlayerCp: -1_200,
      lossCp: 300,
    };
    const result = await coachTrainingExercises({
      exercises: [lost],
      profile,
      engine,
      fetcher: coachedFetcher({ worthTraining: false }),
      cache: memoryCache(),
    });
    expect(result).toEqual([]);
  });

  it("pairs a personal position only with library positions sharing the exact concept slug", async () => {
    const result = await coachTrainingExercises({
      exercises: [personalExercise()],
      profile,
      engine,
      fetcher: coachedFetcher({ conceptSlug: "fork", conceptMoves: ["g1f3"] }),
      cache: memoryCache(),
    });
    expect(result[0].origin).toBe("personal");
    expect(result[0].sourceLabel).toBe("Ta partie contre Camille");
    expect(result[0].gameUrl).toBe("https://www.chess.com/game/live/42");
    expect(result).toHaveLength(3);
    expect(result.slice(1).every((exercise) => exercise.conceptSlug === "fork")).toBe(true);
    expect(result.slice(1).every((exercise) => exercise.fen !== result[0].fen)).toBe(true);
  });

  it("falls back without crashing when the server coach is unavailable", async () => {
    const source = personalExercise();
    const result = await coachTrainingExercises({
      exercises: [source],
      profile,
      engine,
      fetcher: vi.fn(async () => { throw new Error("network"); }) as typeof fetch,
      cache: memoryCache(),
    });
    expect(result[0]).toMatchObject({
      id: source.id,
      sourceLabel: source.sourceLabel,
      gameUrl: source.gameUrl,
    });
  });

  it("does not call the engine or OpenAI again for an already coached exercise", async () => {
    const coached: TrainingExercise = {
      ...personalExercise(),
      pedagogy: {
        promptVersion: "training-phase1-v1",
        cacheKey: "cached",
        pedagogicalScore: 90,
        conceptSlug: "development-with-tempo",
        conceptLabel: "Développement avec tempo",
        exerciseType: "principle",
        rootCause: "Une pièce est restée inactive.",
        learningGoal: "Développe avec un objectif concret.",
        question: "Quelle décision choisirais-tu ici ?",
        conceptMoveUcis: ["g1f3"],
      },
    };
    const analyze = vi.fn(async (fen: string) => evaluation(fen));
    const fetcher = vi.fn();
    const result = await coachTrainingExercises({
      exercises: [coached],
      profile,
      engine: { analyze },
      fetcher: fetcher as typeof fetch,
      cache: memoryCache(),
    });
    expect(result).toEqual([coached]);
    expect(analyze).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns a safe fallback when OPENAI_API_KEY is absent", async () => {
    const candidate: PedagogyCandidate = {
      exerciseId: "test",
      cacheKey: "key",
      fen: personalExercise().fen,
      sideToMove: "w",
      eloBand: "1000-1399",
      playedMove: "a2a3",
      evaluationBeforeCp: 20,
      evaluationAfterCp: -20,
      lossCp: 40,
      stockfishCandidates: [{ uci: "g1f3", playerCp: 20, pv: ["g1f3"] }],
      assumedCategory: "opening",
      assumedConcept: "development-with-tempo",
      origin: "personal",
      phase: "opening",
    };
    await expect(requestPedagogyFromOpenAI([candidate], { apiKey: "" }))
      .resolves.toEqual({ status: "unavailable", decisions: [] });
  });

  it("uses one structured Responses API call and keeps only sound Stockfish concept moves", async () => {
    const candidate: PedagogyCandidate = {
      exerciseId: "test",
      cacheKey: "key",
      fen: personalExercise().fen,
      sideToMove: "w",
      eloBand: "1000-1399",
      playedMove: "a2a3",
      evaluationBeforeCp: 20,
      evaluationAfterCp: -20,
      lossCp: 40,
      stockfishCandidates: [
        { uci: "g1f3", playerCp: 20, pv: ["g1f3"] },
        { uci: "a2a3", playerCp: -200, pv: ["a2a3"] },
      ],
      assumedCategory: "opening",
      assumedConcept: "development-with-tempo",
      origin: "personal",
      phase: "opening",
    };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        model: string;
        store: boolean;
        text: { format: { type: string; strict: boolean } };
      };
      expect(request).toMatchObject({
        model: "gpt-5.6-terra",
        store: false,
        text: { format: { type: "json_schema", strict: true } },
      });
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          items: [{
            exercise_id: "test",
            worth_training: true,
            pedagogical_score: 90,
            category: "opening",
            concept_slug: "development-with-tempo",
            concept_label: "Développement avec tempo",
            exercise_type: "principle",
            root_cause: "Le développement n’avait pas d’objectif concret.",
            learning_goal: "Développe avec une menace utile.",
            question: "Quelle décision d’ouverture choisirais-tu ici ?",
            reject_reason: null,
            concept_move_ucis: ["g1f3", "a2a3"],
          }],
        }),
      }));
    }) as typeof fetch;
    const response = await requestPedagogyFromOpenAI([candidate], {
      apiKey: "test-key",
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(response.status).toBe("coached");
    expect(response.decisions[0].conceptMoveUcis).toEqual(["g1f3"]);
  });
});
