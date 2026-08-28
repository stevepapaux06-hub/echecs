export type PlayerColor = "white" | "black";
export type MoveColor = "w" | "b";
export type GamePhase = "opening" | "middlegame" | "endgame";
export type GameOutcome = "win" | "draw" | "loss";
export type GameCadence = "all" | "rapid" | "blitz" | "bullet" | "daily";
export type AnalysisSource = "chesscom" | "pgn" | "saved";

export type AnalysisSelection = {
  source: AnalysisSource;
  requestedGames: number;
  cadence: GameCadence;
};

export type MoveSnapshot = {
  ply: number;
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion?: string;
  color: MoveColor;
  fenBefore: string;
  fenAfter: string;
  phase: GamePhase;
};

export type ParsedGame = {
  id: string;
  source: "chesscom" | "pgn";
  url?: string;
  rawPgn: string;
  playedAt: number;
  timeClass: string;
  timeControl: string;
  rated: boolean;
  playerColor: PlayerColor;
  playerRating: number;
  opponent: string;
  opponentRating: number;
  outcome: GameOutcome;
  opening?: string;
  moves: MoveSnapshot[];
};

export type PlayerProfile = {
  username: string;
  displayName: string;
  title?: string;
  rating?: number;
  ratings?: Partial<Record<Exclude<GameCadence, "all">, number>>;
};

export type AnalysisPayload = {
  profile: PlayerProfile;
  games: ParsedGame[];
  warnings: string[];
  selection: AnalysisSelection;
};

export type EngineScore = {
  type: "cp" | "mate";
  /** Raw UCI value. A positive value favours the side whose perspective is stated. */
  value: number;
};

export type EngineLine = {
  multipv: number;
  depth: number;
  /** Score exactly as emitted by Stockfish, from the side-to-move perspective. */
  rawScore: EngineScore;
  /** The same score normalized once and for all from White's perspective. */
  whiteScore: EngineScore;
  /** Comparable value used by the diagnostic; mate scores are mapped far beyond material scores. */
  whiteCp: number;
  pv: string[];
};

export type EngineDebugInfo = {
  fen: string;
  sideToMove: MoveColor;
  requestedDepth: number;
  reachedDepth: number;
  bestMove: string;
  lines: Array<{
    multipv: number;
    depth: number;
    rawScore: string;
    whiteScore: string;
    pv: string[];
  }>;
};

export type EngineEvaluation = {
  fen: string;
  sideToMove: MoveColor;
  whiteCp: number;
  bestMove: string;
  depth: number;
  /** Mate distance normalized from White's perspective. */
  mate?: number;
  lines: EngineLine[];
  debug: EngineDebugInfo;
};

export type AnalyzedMove = MoveSnapshot & {
  before: EngineEvaluation;
  after: EngineEvaluation;
  playerCpBefore: number;
  playerCpAfter: number;
  lossCp: number;
};

export type AnalyzedGame = ParsedGame & {
  analyzedMoves: AnalyzedMove[];
};

export type PhaseMetric = {
  phase: GamePhase;
  label: string;
  positions: number;
  averageLossCp: number;
  importantErrors: number;
};

export type DiagnosticPriority =
  | "conversion"
  | "stability"
  | "defense"
  | "endgame"
  | "middlegame";

export type DiagnosticConfidence = "low" | "medium" | "high";
export type DiagnosticCategory =
  | "tactic"
  | "strategy"
  | "endgame"
  | "opening"
  | "conversion"
  | "defense";

export type DiagnosticTheme = {
  id: string;
  category: DiagnosticCategory;
  title: string;
  summary: string;
  confidence: DiagnosticConfidence;
  sampleSize: number;
  issueCount: number;
  evidence: string[];
  positionIds: string[];
};

export type DiagnosticMetrics = {
  gamesAnalyzed: number;
  positionsAnalyzed: number;
  importantErrors: number;
  importantErrorsPerGame: number;
  conversionOpportunities: number;
  convertedWins: number;
  conversionRate: number | null;
  averageWinningRetention: number | null;
  defenseOpportunities: number;
  recoveredPositions: number;
  savedGames: number;
  defenseRecoveryRate: number | null;
  phaseMetrics: PhaseMetric[];
  priority: DiagnosticPriority;
  priorityTitle: string;
  prioritySummary: string;
  strengths: string[];
  weaknesses: string[];
  focusItems: string[];
  themes: DiagnosticTheme[];
  primaryTheme: DiagnosticTheme;
};

export type TrainingType =
  | "conversion"
  | "defense"
  | "endgame"
  | "mistake"
  | "tactic"
  | "strategy"
  | "opening";
export type TrainingOrigin = "personal" | "concept";
export type TrainingMode = "one-move" | "line" | "playout";

export type PlanArrow = {
  from: string;
  to: string;
  color: "primary" | "secondary" | "warning";
  label?: string;
};

export type PlanSquare = {
  square: string;
  color: "primary" | "secondary" | "warning";
};

export type TrainingExercise = {
  id: string;
  type: TrainingType;
  origin: TrainingOrigin;
  mode: TrainingMode;
  theme: string;
  category: DiagnosticCategory;
  title: string;
  prompt: string;
  sourceLabel: string;
  fen: string;
  playerColor: PlayerColor;
  bestMove: string;
  playedMove?: string;
  baselinePlayerCp: number;
  phase: GamePhase;
  gameUrl?: string;
  opponent?: string;
  concept: string;
  maxPlayerMoves: number;
  successThresholdCp?: number;
  planArrows?: PlanArrow[];
  planSquares?: PlanSquare[];
};

export type CompleteAnalysis = {
  profile: PlayerProfile;
  warnings: string[];
  selection: AnalysisSelection;
  games: AnalyzedGame[];
  metrics: DiagnosticMetrics;
  exercises: TrainingExercise[];
};
