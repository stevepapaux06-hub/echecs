import type { DiagnosticCategory, PedagogyExerciseType } from "@/domain/chess/types";
import {
  PEDAGOGY_PROMPT_VERSION,
  type PedagogyBatchResponse,
  type PedagogyCandidate,
  type PedagogyDecision,
} from "../../domain/training/pedagogy";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-terra";
const CURRENT_LIBRARY_CONCEPTS = [
  "knight-fork",
  "aligned-piece-with-king",
  "rook-open-file",
  "knight-outpost",
  "development-with-tempo",
  "king-opposition",
  "rook-activity",
  "exchange-active-piece",
  "king-safety-and-rook-activity",
  "prepare-central-break",
  "cut-off-king",
].join(", ");

type RawDecision = {
  exercise_id: string;
  worth_training: boolean;
  pedagogical_score: number;
  category: DiagnosticCategory;
  concept_slug: string;
  concept_label: string;
  exercise_type: PedagogyExerciseType;
  root_cause: string;
  learning_goal: string;
  question: string;
  reject_reason: string | null;
  concept_move_ucis: string[];
};

type RawBatch = { items: RawDecision[] };

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "exercise_id",
          "worth_training",
          "pedagogical_score",
          "category",
          "concept_slug",
          "concept_label",
          "exercise_type",
          "root_cause",
          "learning_goal",
          "question",
          "reject_reason",
          "concept_move_ucis",
        ],
        properties: {
          exercise_id: { type: "string", maxLength: 160 },
          worth_training: { type: "boolean" },
          pedagogical_score: { type: "integer", minimum: 0, maximum: 100 },
          category: {
            type: "string",
            enum: ["tactic", "strategy", "opening", "endgame", "conversion", "defense"],
          },
          concept_slug: { type: "string", minLength: 1, maxLength: 80 },
          concept_label: { type: "string", minLength: 1, maxLength: 100 },
          exercise_type: {
            type: "string",
            enum: ["move", "plan", "defense", "conversion", "principle"],
          },
          root_cause: { type: "string", maxLength: 240 },
          learning_goal: { type: "string", maxLength: 240 },
          question: { type: "string", maxLength: 180 },
          reject_reason: { type: ["string", "null"], maxLength: 180 },
          concept_move_ucis: {
            type: "array",
            maxItems: 3,
            items: { type: "string", pattern: "^[a-h][1-8][a-h][1-8][qrbn]?$" },
          },
        },
      },
    },
  },
} as const;

const INSTRUCTIONS = `Tu es le coach pédagogique de ChessPath pour joueurs d'échecs 800-1800 Elo.
Stockfish est l'unique autorité sur la qualité objective des coups. Tu ne calcules pas une nouvelle vérité échiquéenne.

Pour chaque candidat :
- décide s'il mérite réellement un exercice ; une simple différence entre -9 et -12 dans une position sans ressource n'est pas pédagogique ;
- une position très inférieure ne reste acceptable que si les lignes fournies montrent une ressource claire (perpétuelle, forteresse, tactique défensive, retour pratique) ;
- distingue category (large) et concept_slug (idée précise en kebab-case) ;
- réutilise un slug de la bibliothèque s'il décrit exactement le concept : ${CURRENT_LIBRARY_CONCEPTS} ;
- choisis concept_move_ucis uniquement parmi stockfishCandidates et seulement pour les coups qui incarnent réellement le concept ;
- ne considère pas automatiquement tous les bons coups moteur comme démontrant le concept ;
- écris en français, brièvement, et adapte la précision à eloBand ;
- question ne doit jamais révéler la case, le coup ou la solution. Préfère une question ouverte comme « Quel plan choisirais-tu ici ? » ;
- root_cause explique la décision humaine ; learning_goal formule le principe transférable ;
- pour une position personnelle, relie root_cause au playedMove sans aucune donnée personnelle.

Retourne exactement une décision par exerciseId, dans le même ordre. ${PEDAGOGY_PROMPT_VERSION}.`;

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
  };
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

function decisionFor(candidate: PedagogyCandidate, raw: RawDecision): PedagogyDecision | null {
  if (raw.exercise_id !== candidate.exerciseId) return null;
  const stockfish = new Map(candidate.stockfishCandidates.map((line) => [line.uci, line.playerCp]));
  const bestCp = Math.max(...stockfish.values());
  const conceptMoveUcis = [...new Set(raw.concept_move_ucis.filter((uci) => {
    const cp = stockfish.get(uci);
    return cp !== undefined && bestCp - cp <= 100;
  }))];
  if (raw.worth_training && conceptMoveUcis.length === 0) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.concept_slug)) return null;
  return {
    exerciseId: candidate.exerciseId,
    cacheKey: candidate.cacheKey,
    worthTraining: raw.worth_training,
    pedagogicalScore: raw.pedagogical_score,
    category: raw.category,
    conceptSlug: raw.concept_slug,
    conceptLabel: raw.concept_label,
    exerciseType: raw.exercise_type,
    rootCause: raw.root_cause,
    learningGoal: raw.learning_goal,
    question: raw.question,
    rejectReason: raw.reject_reason,
    conceptMoveUcis: raw.worth_training ? conceptMoveUcis : [],
  };
}

export async function requestPedagogyFromOpenAI(
  candidates: PedagogyCandidate[],
  options: {
    apiKey?: string;
    model?: string;
    fetcher?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<PedagogyBatchResponse> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey || candidates.length === 0) return { status: "unavailable", decisions: [] };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 18_000);
  try {
    const response = await (options.fetcher ?? fetch)(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model ?? process.env.OPENAI_PEDAGOGY_MODEL ?? DEFAULT_MODEL,
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 4_000,
        instructions: INSTRUCTIONS,
        input: JSON.stringify({ candidates }),
        prompt_cache_key: `chesspath-${PEDAGOGY_PROMPT_VERSION}`,
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "chesspath_pedagogy_batch",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { status: "unavailable", decisions: [] };
    const text = extractOutputText(await response.json());
    if (!text) return { status: "unavailable", decisions: [] };
    const raw = JSON.parse(text) as RawBatch;
    if (!Array.isArray(raw.items)) return { status: "unavailable", decisions: [] };
    const byId = new Map(raw.items.map((item) => [item.exercise_id, item]));
    const decisions = candidates
      .map((candidate) => {
        const item = byId.get(candidate.exerciseId);
        return item ? decisionFor(candidate, item) : null;
      })
      .filter((decision): decision is PedagogyDecision => Boolean(decision));
    if (decisions.length !== candidates.length) return { status: "unavailable", decisions: [] };
    return { status: "coached", decisions };
  } catch {
    return { status: "unavailable", decisions: [] };
  } finally {
    clearTimeout(timeout);
  }
}
