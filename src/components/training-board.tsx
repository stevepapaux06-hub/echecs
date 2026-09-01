"use client";

import { useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import type { EngineEvaluation, TrainingExercise } from "@/domain/chess/types";
import {
  buildSequenceFeedback,
  buildTrainingFeedback,
  type TrainingFeedback,
} from "@/domain/training/feedback";
import {
  classifyPedagogicalMove,
  decideSequence,
  referenceReply,
  type PedagogicalMoveResult,
  type TrainingResult,
} from "@/domain/training/sequence";
import { isLegalTrainingDrop } from "@/domain/training/interaction";
import { nextExerciseIndex, sharesPreciseConcept } from "@/domain/training/session";
import { detectMovePatterns } from "@/domain/patterns/engine";
import type { StockfishClient } from "@/infrastructure/engine/stockfish-client";
import { evaluationForPlayer, formatWhiteCentricEvaluation } from "@/infrastructure/engine/uci";
import { Brand } from "./brand";

type ThinkingStage = "checking" | "reply" | null;

function formatLoss(cp: number): string {
  if (cp <= 20) return "≈ 0";
  return `${(cp / 100).toFixed(1).replace(".0", "")} pion${cp >= 150 ? "s" : ""}`;
}

function labelFor(exercise: TrainingExercise): string {
  if (exercise.type === "conversion") return "Conversion";
  if (exercise.type === "defense") return "Défense";
  if (exercise.type === "endgame") return "Finale";
  if (exercise.type === "strategy") return "Stratégie";
  if (exercise.type === "opening") return "Ouverture";
  if (exercise.type === "tactic") return "Tactique";
  return "Tes erreurs";
}

function variantPosition(fen: string, line: string[], step: number): string {
  const chess = new Chess(fen);
  for (const uci of line.slice(0, step)) {
    try {
      chess.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci.slice(4, 5) || "q",
      });
    } catch {
      break;
    }
  }
  return chess.fen();
}

function waitForReplyAnimation(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 320));
}

export function TrainingBoard({
  exercises,
  engine,
  onBack,
  onAttempt,
  onContinue,
}: {
  exercises: TrainingExercise[];
  engine: StockfishClient;
  onBack: () => void;
  onContinue?: (seenExerciseIds: string[]) => Promise<boolean>;
  onAttempt?: (
    exercise: TrainingExercise,
    result: TrainingResult,
    lossCp: number,
    moves: string[],
  ) => void;
}) {
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState(exercises[0]?.fen ?? new Chess().fen());
  const [feedbackFen, setFeedbackFen] = useState(exercises[0]?.fen ?? new Chess().fen());
  const [feedback, setFeedback] = useState<TrainingFeedback | null>(null);
  const [thinkingStage, setThinkingStage] = useState<ThinkingStage>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [playerMoves, setPlayerMoves] = useState(0);
  const [attemptMoves, setAttemptMoves] = useState<string[]>([]);
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [variantStep, setVariantStep] = useState<number | null>(null);
  const [continuing, setContinuing] = useState(false);
  const [boardRevision, setBoardRevision] = useState(0);
  const baselineCache = useRef(new Map<string, EngineEvaluation>());
  const initialEvaluation = useRef<EngineEvaluation | null>(null);
  const initialPlayerCp = useRef<number | null>(null);
  const largestLossCp = useRef(0);
  const firstMovePedagogy = useRef<PedagogicalMoveResult | null>(null);
  const attemptToken = useRef(0);
  const moveInFlight = useRef(false);
  const exercise = exercises[index];

  function resetBoard(targetIndex = index) {
    attemptToken.current += 1;
    moveInFlight.current = false;
    const target = exercises[targetIndex];
    setPosition(target.fen);
    setFeedbackFen(target.fen);
    setFeedback(null);
    setThinkingStage(null);
    setEngineError(null);
    setPlayerMoves(0);
    setAttemptMoves([]);
    setResult(null);
    setVariantStep(null);
    setBoardRevision((revision) => revision + 1);
    initialEvaluation.current = null;
    initialPlayerCp.current = null;
    largestLossCp.current = 0;
    firstMovePedagogy.current = null;
  }

  async function nextExercise() {
    const next = nextExerciseIndex(index, exercises.length);
    if (next === null) {
      if (!onContinue) {
        onBack();
        return;
      }
      setContinuing(true);
      const continued = await onContinue(exercises.map((candidate) => candidate.id));
      if (!continued) onBack();
      else setContinuing(false);
      return;
    }
    setIndex(next);
    resetBoard(next);
  }

  async function analyzePosition(
    fen: string,
    options: { multiPv: number },
  ): Promise<EngineEvaluation> {
    try {
      return await engine.analyze(fen, { depth: 11, multiPv: options.multiPv, timeoutMs: 30_000 });
    } catch {
      return engine.analyze(fen, { depth: 8, multiPv: options.multiPv, timeoutMs: 30_000 });
    }
  }

  function finishSequence({
    status,
    lossCp,
    moves,
    afterPlayerCp,
  }: {
    status: TrainingResult;
    lossCp: number;
    moves: string[];
    afterPlayerCp: number;
  }) {
    const initial = initialEvaluation.current;
    if (!initial) return;
    setFeedbackFen(exercise.fen);
    setFeedback(buildSequenceFeedback({
      exercise,
      initial,
      moves,
      result: status,
      lossCp,
      afterPlayerCp,
      pedagogicalMove: firstMovePedagogy.current ?? "concept",
    }));
    setThinkingStage(null);
    moveInFlight.current = false;
    setResult(status);
    setVariantStep(null);
    onAttempt?.(exercise, status, lossCp, moves);
  }

  async function attemptMove(sourceSquare: string, targetSquare: string | null): Promise<boolean> {
    if (!targetSquare || thinkingStage || feedback || result) {
      moveInFlight.current = false;
      return false;
    }
    const token = ++attemptToken.current;
    const decisionFen = position;
    const chess = new Chess(decisionFen);
    let move;
    try {
      move = chess.move({ from: sourceSquare as Square, to: targetSquare as Square, promotion: "q" });
    } catch {
      moveInFlight.current = false;
      return false;
    }

    const fenAfter = chess.fen();
    const playedUci = `${move.from}${move.to}${move.promotion ?? ""}`;
    const movesAfterPlayer = [...attemptMoves, playedUci];
    const nextPlayerMoves = playerMoves + 1;
    setPosition(fenAfter);
    setEngineError(null);
    setThinkingStage("checking");

    try {
      const cacheKey = `${exercise.id}:${decisionFen}`;
      let baseline = baselineCache.current.get(cacheKey);
      if (!baseline) {
        baseline = await analyzePosition(decisionFen, { multiPv: 3 });
        baselineCache.current.set(cacheKey, baseline);
      }
      const after = await analyzePosition(fenAfter, { multiPv: 1 });
      if (token !== attemptToken.current) return true;

      if (!initialEvaluation.current) {
        initialEvaluation.current = baseline;
        initialPlayerCp.current = evaluationForPlayer(baseline.whiteCp, exercise.playerColor);
      }
      const decisionFeedback = buildTrainingFeedback({
        fen: decisionFen,
        playerColor: exercise.playerColor,
        exercise,
        playedMove: playedUci,
        playedMoveSan: move.san,
        baseline,
        after,
      });
      const totalLossCp = Math.max(
        0,
        (initialPlayerCp.current ?? decisionFeedback.afterPlayerCp) - decisionFeedback.afterPlayerCp,
      );
      largestLossCp.current = Math.max(
        largestLossCp.current,
        decisionFeedback.lossCp,
        totalLossCp,
      );
      setPlayerMoves(nextPlayerMoves);
      setAttemptMoves(movesAfterPlayer);
      if (!firstMovePedagogy.current) {
        const baselinePlayerCp = evaluationForPlayer(baseline.whiteCp, exercise.playerColor);
        const runtimeConceptMoves = baseline.lines
          .filter((line) => (
            baselinePlayerCp - evaluationForPlayer(line.whiteCp, exercise.playerColor) <= 100
            && Boolean(line.pv[0])
            && detectMovePatterns(decisionFen, line.pv[0]).some((pattern) => (
              pattern.conceptSlug === exercise.conceptSlug
            ))
          ))
          .map((line) => line.pv[0]);
        firstMovePedagogy.current = classifyPedagogicalMove(
          exercise,
          playedUci,
          decisionFeedback.lossCp,
          runtimeConceptMoves,
        );
      }

      const decision = decideSequence({
        exercise,
        playerMoves: nextPlayerMoves,
        decisionLossCp: decisionFeedback.lossCp,
        totalLossCp,
        afterPlayerCp: decisionFeedback.afterPlayerCp,
        isGameOver: chess.isGameOver(),
        isCheckmate: chess.isCheckmate(),
        promoted: Boolean(move.promotion),
        captured: Boolean(move.captured),
        pedagogicalMove: firstMovePedagogy.current,
      });
      if (decision.finished && decision.result) {
        finishSequence({
          status: decision.result,
          lossCp: largestLossCp.current,
          moves: movesAfterPlayer,
          afterPlayerCp: decisionFeedback.afterPlayerCp,
        });
        return true;
      }

      const replyUci = referenceReply(exercise, movesAfterPlayer) || after.bestMove;
      if (!replyUci || replyUci === "(none)") {
        finishSequence({
          status: "partial",
          lossCp: largestLossCp.current,
          moves: movesAfterPlayer,
          afterPlayerCp: decisionFeedback.afterPlayerCp,
        });
        return true;
      }

      setThinkingStage("reply");
      await waitForReplyAnimation();
      if (token !== attemptToken.current) return true;
      const replyPosition = new Chess(fenAfter);
      try {
        replyPosition.move({
          from: replyUci.slice(0, 2) as Square,
          to: replyUci.slice(2, 4) as Square,
          promotion: replyUci.slice(4, 5) || "q",
        });
      } catch {
        throw new Error("La réponse de référence n’est plus légale dans cette variante.");
      }
      const movesAfterReply = [...movesAfterPlayer, replyUci];
      setPosition(replyPosition.fen());
      setAttemptMoves(movesAfterReply);
      moveInFlight.current = false;
      setThinkingStage(null);
    } catch {
      if (token !== attemptToken.current) return true;
      setPosition(decisionFen);
      setPlayerMoves(playerMoves);
      setAttemptMoves(attemptMoves);
      moveInFlight.current = false;
      setBoardRevision((revision) => revision + 1);
      setThinkingStage(null);
      setEngineError("Le moteur local a été interrompu. Ton coup n’est pas compté : tu peux le rejouer.");
    }
    return true;
  }

  const displayedPosition = feedback && variantStep !== null
    ? variantPosition(feedbackFen, feedback.principalLineUci, variantStep)
    : position;
  const arrowColor = {
    primary: "rgba(123, 164, 75, .92)",
    secondary: "rgba(52, 122, 151, .82)",
    warning: "rgba(189, 107, 66, .85)",
  };
  const planArrows = feedback?.planArrows.slice(0, 3).map((arrow) => ({
    startSquare: arrow.from,
    endSquare: arrow.to,
    color: arrowColor[arrow.color],
  })) ?? [];
  const playedArrowAlreadyExplained = Boolean(feedback && planArrows.some((arrow) => (
    arrow.startSquare === feedback.playedMove.slice(0, 2)
    && arrow.endSquare === feedback.playedMove.slice(2, 4)
  )));
  const planSquares = Object.fromEntries((feedback?.planSquares ?? []).slice(0, 3).map((target) => [
    target.square,
    {
      boxShadow: `inset 0 0 0 5px ${arrowColor[target.color]}`,
      borderRadius: "12%",
    },
  ]));
  const playerTurn = new Chess(position).turn() === (exercise.playerColor === "white" ? "w" : "b");
  const boardInteractive = !thinkingStage && !feedback && !result && playerTurn;
  const followingIndex = nextExerciseIndex(index, exercises.length);
  const followingExercise = followingIndex === null ? null : exercises[followingIndex];
  const sameConceptNext = Boolean(
    followingExercise && sharesPreciseConcept(exercise, followingExercise),
  );

  const options: ChessboardOptions = {
    id: `chesspath-training-${exercise.id}`,
    position: displayedPosition,
    boardOrientation: exercise.playerColor,
    allowDragging: boardInteractive,
    allowDrawingArrows: true,
    showNotation: true,
    animationDurationInMs: 180,
    lightSquareStyle: { backgroundColor: "#e5dfc9" },
    darkSquareStyle: { backgroundColor: "#4f7461" },
    boardStyle: { borderRadius: "14px", overflow: "hidden", boxShadow: "0 28px 70px rgba(17, 39, 30, .2)" },
    arrows: feedback ? [
      ...planArrows,
      ...(feedback.playedMove !== feedback.bestMove && !playedArrowAlreadyExplained ? [{
        startSquare: feedback.playedMove.slice(0, 2),
        endSquare: feedback.playedMove.slice(2, 4),
        color: feedback.tone === "warning" ? arrowColor.warning : "rgba(213, 161, 74, .85)",
      }] : []),
    ] : [],
    squareStyles: feedback ? planSquares : {},
    canDragPiece: ({ piece }) => {
      const expected = exercise.playerColor === "white" ? "w" : "b";
      return boardInteractive && piece.pieceType.toLowerCase().startsWith(expected);
    },
    onPieceDrop: ({ sourceSquare, targetSquare }) => {
      if (
        !boardInteractive
        || moveInFlight.current
        || !isLegalTrainingDrop(position, sourceSquare, targetSquare)
      ) {
        return false;
      }
      moveInFlight.current = true;
      void attemptMove(sourceSquare, targetSquare);
      return true;
    },
  };

  return (
    <main className="training-shell" id="top">
      <nav className="training-nav">
        <Brand />
        <div className="exercise-progress"><span style={{ width: `${((index + 1) / exercises.length) * 100}%` }} /></div>
        <span>{index + 1} / {exercises.length}</span>
      </nav>

      <section className="training-layout">
        <div className="board-column">
          <button type="button" className="text-button back-button" onClick={onBack}><ArrowLeft size={16} /> Retour à l’entraînement</button>
          <div className="board-frame"><Chessboard key={`${exercise.id}:${boardRevision}`} options={options} /></div>
          <div className="board-actions">
            <button type="button" onClick={() => resetBoard()}><RotateCcw size={16} /> Recommencer</button>
            <span>{exercise.mode === "one-move" ? "Décision ciblée" : `Séquence · ${playerMoves}/${exercise.maxPlayerMoves} coups joués`}</span>
          </div>
        </div>

        <aside className="exercise-panel">
          <div className="exercise-type">
            <span>{labelFor(exercise)}</span>
            <small>{exercise.origin === "personal" ? "Position personnelle" : "Nouvelle position"}</small>
          </div>
          <p className="source-label">{exercise.sourceLabel}</p>
          <h1>{exercise.title}</h1>
          <p className="exercise-prompt">{exercise.prompt}</p>

          {thinkingStage ? (
            <div className="thinking-card" aria-live="polite"><Search size={22} /><div><strong>{thinkingStage === "checking" ? "Stockfish vérifie toute la position…" : "L’adversaire répond automatiquement…"}</strong><span>{thinkingStage === "checking" ? "Ton coup reste sur l’échiquier pendant l’analyse." : "Prépare déjà ta continuation."}</span></div></div>
          ) : feedback ? (
            <div className={`feedback-card ${feedback.tone}`} aria-live="polite">
              <span className="feedback-icon">{feedback.tone === "warning" ? "!" : <Check size={20} />}</span>
              <div><small>Bilan de la séquence</small><h2>{feedback.title}</h2><p>{feedback.body}</p></div>
              {feedback.explanation ? (
                <div className="why-block causal-feedback">
                  <small>Ce qu’il fallait remarquer</small><p>{feedback.explanation.notice}</p>
                  <small>Pièce ou faiblesse</small><p>{feedback.explanation.focus}</p>
                  <small>Plan et objectif</small><p>{feedback.explanation.plan} {feedback.explanation.objective}</p>
                  {feedback.explanation.opponentIdea ? <><small>Réaction adverse</small><p>{feedback.explanation.opponentIdea}</p></> : null}
                  <small>Règle à retenir</small><p>{feedback.explanation.rule}</p>
                </div>
              ) : <div className="why-block"><small>Concept travaillé</small><p>{feedback.idea}</p></div>}
              <div className="move-comparison sequence-summary">
                <div><span>Ta séquence</span><strong>{feedback.playedMoveSan || "—"}</strong></div>
                <div><span>Départ de la ligne clé</span><strong>{feedback.bestMoveSan}</strong></div>
                <div><span>Écart maximal</span><strong>{formatLoss(feedback.lossCp)}</strong></div>
              </div>
              {feedback.bestLineSan ? (
                <div className="line-comparison">
                  <div><span>Variante clé</span><p>{feedback.bestLineSan}</p></div>
                  <button type="button" className="variant-toggle" onClick={() => setVariantStep(variantStep === null ? 0 : null)}>
                    {variantStep === null ? "Voir la variante sur l’échiquier" : "Fermer la variante"}
                  </button>
                  {variantStep !== null ? (
                    <div className="variant-controls">
                      <button type="button" onClick={() => setVariantStep(Math.max(0, variantStep - 1))} disabled={variantStep === 0}><ChevronLeft size={16} /></button>
                      <span>Demi-coup {variantStep} / {feedback.principalLineUci.length}</span>
                      <button type="button" onClick={() => setVariantStep(Math.min(feedback.principalLineUci.length, variantStep + 1))} disabled={variantStep >= feedback.principalLineUci.length}><ChevronRight size={16} /></button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {feedback.candidates.length > 1 ? (
                <div className="candidate-lines">
                  <span>Autres premiers coups · évaluation + Blanc / − Noir</span>
                  <div>{feedback.candidates.map((candidate) => <p key={candidate.uci}><strong>{candidate.san}</strong><small>{formatWhiteCentricEvaluation(candidate.whiteCentricCp)}</small></p>)}</div>
                </div>
              ) : null}
              <div className={`exercise-result ${result}`}>
                <strong>{result === "success" ? "Réussi" : result === "partial" ? "À consolider" : "Échoué — reviendra plus tard"}</strong>
                <span>{result === "failed"
                  ? "Cette position est mémorisée pour une future séance espacée."
                  : sameConceptNext
                    ? "La prochaine position réutilise exactement ce concept dans un autre contexte."
                    : followingExercise
                      ? "La séance continue avec une nouvelle décision."
                      : "Cette séance est terminée."}</span>
              </div>
            </div>
          ) : engineError ? (
            <div className="engine-training-error" role="alert"><strong>Analyse interrompue</strong><p>{engineError}</p></div>
          ) : (
            <>
              <div className="hint-card"><Sparkles size={20} /><p><strong>Avant de jouer</strong>{exercise.mode === "one-move" ? "Identifie le plan ou la décision clé." : "Calcule aussi la meilleure réponse adverse : la position continuera sans revenir en arrière."}</p></div>
              {exercise.mode !== "one-move" ? <div className="sequence-status"><span>Objectif</span><strong>{playerMoves ? `Continue la séquence · coup ${playerMoves + 1}` : `Joue jusqu’au résultat concret · jusqu’à ${exercise.maxPlayerMoves} coups`}</strong></div> : null}
            </>
          )}

          <div className="exercise-footer">
            {exercise.gameUrl ? <a href={exercise.gameUrl} target="_blank" rel="noreferrer">Voir la partie source <ExternalLink size={14} /></a> : <span className="concept-source">Position pédagogique vérifiée avec Stockfish</span>}
            <button type="button" className="primary-button" onClick={() => void nextExercise()} disabled={!result || continuing}>
              {followingExercise
                ? sameConceptNext
                  ? "Nouvelle position sur ce concept"
                  : "Exercice suivant"
                : continuing ? "Chargement…" : "Continuer"} <ArrowRight size={17} />
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}
