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
import type { TrainingExercise } from "@/domain/chess/types";
import {
  buildTrainingFeedback,
  type TrainingFeedback,
  uciToSan,
} from "@/domain/training/feedback";
import type { StockfishClient } from "@/infrastructure/engine/stockfish-client";
import { Brand } from "./brand";

function formatEvaluation(cp: number): string {
  if (Math.abs(cp) >= 90_000) return cp > 0 ? "gain forcé" : "mat proche";
  const pawns = Math.abs(cp / 100).toFixed(1).replace(".0", "");
  return cp > 20 ? `+${pawns}` : cp < -20 ? `−${pawns}` : "équilibre";
}

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

export function TrainingBoard({
  exercises,
  engine,
  onBack,
  onAttempt,
}: {
  exercises: TrainingExercise[];
  engine: StockfishClient;
  onBack: () => void;
  onAttempt?: (
    exercise: TrainingExercise,
    result: "success" | "partial" | "failed",
    lossCp: number,
    moves: string[],
  ) => void;
}) {
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState(exercises[0]?.fen ?? new Chess().fen());
  const [feedbackFen, setFeedbackFen] = useState(exercises[0]?.fen ?? new Chess().fen());
  const [feedback, setFeedback] = useState<TrainingFeedback | null>(null);
  const [thinking, setThinking] = useState(false);
  const [playerMoves, setPlayerMoves] = useState(0);
  const [attemptMoves, setAttemptMoves] = useState<string[]>([]);
  const [pendingReply, setPendingReply] = useState<{ fen: string; uci: string } | null>(null);
  const [result, setResult] = useState<"success" | "partial" | "failed" | null>(null);
  const [variantStep, setVariantStep] = useState<number | null>(null);
  const baselineCache = useRef(new Map<string, Awaited<ReturnType<StockfishClient["analyze"]>>>());
  const attemptToken = useRef(0);
  const exercise = exercises[index];

  function resetBoard(targetIndex = index) {
    attemptToken.current += 1;
    const target = exercises[targetIndex];
    setPosition(target.fen);
    setFeedbackFen(target.fen);
    setFeedback(null);
    setThinking(false);
    setPlayerMoves(0);
    setAttemptMoves([]);
    setPendingReply(null);
    setResult(null);
    setVariantStep(null);
  }

  function findNextOnTheme(): number {
    for (let offset = 1; offset <= exercises.length; offset += 1) {
      const candidate = (index + offset) % exercises.length;
      if (
        exercises[candidate].theme === exercise.theme
        || exercises[candidate].category === exercise.category
      ) return candidate;
    }
    return (index + 1) % exercises.length;
  }

  function nextExercise() {
    const next = findNextOnTheme();
    setIndex(next);
    resetBoard(next);
  }

  function finish(
    status: "success" | "partial" | "failed",
    lossCp: number,
    moves: string[],
  ) {
    setResult(status);
    onAttempt?.(exercise, status, lossCp, moves);
  }

  function continueSequence() {
    if (!pendingReply) return;
    const chess = new Chess(pendingReply.fen);
    try {
      chess.move({
        from: pendingReply.uci.slice(0, 2) as Square,
        to: pendingReply.uci.slice(2, 4) as Square,
        promotion: pendingReply.uci.slice(4, 5) || "q",
      });
      setPosition(chess.fen());
      setFeedback(null);
      setPendingReply(null);
      setVariantStep(null);
    } catch {
      finish("success", feedback?.lossCp ?? 0, attemptMoves);
    }
  }

  async function attemptMove(sourceSquare: string, targetSquare: string | null): Promise<boolean> {
    if (!targetSquare || thinking || feedback || result) return false;
    const token = ++attemptToken.current;
    const decisionFen = position;
    const chess = new Chess(decisionFen);
    let move;
    try {
      move = chess.move({ from: sourceSquare as Square, to: targetSquare as Square, promotion: "q" });
    } catch {
      return false;
    }

    const fenAfter = chess.fen();
    const playedUci = `${move.from}${move.to}${move.promotion ?? ""}`;
    const nextMoves = [...attemptMoves, playedUci];
    setPosition(fenAfter);
    setThinking(true);
    try {
      const cacheKey = `${exercise.id}:${decisionFen}`;
      let baseline = baselineCache.current.get(cacheKey);
      if (!baseline) {
        baseline = await engine.analyze(decisionFen, { depth: 10, multiPv: 3 });
        baselineCache.current.set(cacheKey, baseline);
      }
      const after = await engine.analyze(fenAfter, { depth: 10, multiPv: 1 });
      if (token !== attemptToken.current) return true;

      const nextFeedback = buildTrainingFeedback({
        fen: decisionFen,
        playerColor: exercise.playerColor,
        exercise,
        playedMove: playedUci,
        playedMoveSan: move.san,
        baseline,
        after,
      });
      const nextPlayerMoves = playerMoves + 1;
      setFeedbackFen(decisionFen);
      setFeedback(nextFeedback);
      setPosition(decisionFen);
      setPlayerMoves(nextPlayerMoves);
      setAttemptMoves(nextMoves);

      const thresholdReached = exercise.successThresholdCp === undefined
        || nextFeedback.afterPlayerCp >= exercise.successThresholdCp;
      const failed = nextFeedback.lossCp > 180;
      const sequenceFinished = exercise.mode === "one-move"
        || nextPlayerMoves >= exercise.maxPlayerMoves
        || !after.bestMove
        || after.bestMove === "(none)";

      if (failed) {
        finish("failed", nextFeedback.lossCp, nextMoves);
      } else if (sequenceFinished) {
        finish(thresholdReached ? "success" : "partial", nextFeedback.lossCp, nextMoves);
      } else {
        setPendingReply({ fen: fenAfter, uci: after.bestMove });
      }
    } catch {
      if (token !== attemptToken.current) return true;
      setPosition(decisionFen);
      const fallback: TrainingFeedback = {
        grade: "mistake",
        tone: "warning",
        title: "Le moteur n’a pas répondu",
        body: "Ton coup était légal, mais l’évaluation locale a été interrompue.",
        bestMove: exercise.bestMove,
        bestMoveSan: uciToSan(decisionFen, exercise.bestMove),
        playedMove: playedUci,
        playedMoveSan: move.san,
        bestLineSan: "",
        playedLineSan: "",
        lossCp: 0,
        afterPlayerCp: exercise.baselinePlayerCp,
        candidates: [],
        idea: exercise.concept,
        principalLineUci: [],
        planArrows: exercise.planArrows ?? [],
        planSquares: exercise.planSquares ?? [],
      };
      setFeedbackFen(decisionFen);
      setFeedback(fallback);
    } finally {
      if (token === attemptToken.current) setThinking(false);
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

  const options: ChessboardOptions = {
    id: `chesspath-training-${exercise.id}`,
    position: displayedPosition,
    boardOrientation: exercise.playerColor,
    allowDragging: !thinking && !feedback && !result,
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
      return !thinking && !feedback && !result && piece.pieceType.toLowerCase().startsWith(expected);
    },
    onPieceDrop: ({ sourceSquare, targetSquare }) => {
      void attemptMove(sourceSquare, targetSquare);
      return Boolean(targetSquare);
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
          <div className="board-frame"><Chessboard options={options} /></div>
          <div className="board-actions">
            <button type="button" onClick={() => resetBoard()}><RotateCcw size={16} /> Recommencer</button>
            <span>{exercise.mode === "one-move" ? "Décision ciblée" : `Séquence · jusqu’à ${exercise.maxPlayerMoves} coups joueur`}</span>
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

          {thinking ? (
            <div className="thinking-card" aria-live="polite"><Search size={22} /><div><strong>Stockfish vérifie ton choix…</strong><span>Position complète · même profondeur avant/après · MultiPV.</span></div></div>
          ) : feedback ? (
            <div className={`feedback-card ${feedback.tone}`} aria-live="polite">
              <span className="feedback-icon">{feedback.tone === "warning" ? "!" : <Check size={20} />}</span>
              <div><small>Retour ChessPath</small><h2>{feedback.title}</h2><p>{feedback.body}</p></div>
              <div className="why-block"><small>Pourquoi ?</small><p>{feedback.idea}</p></div>
              <div className="move-comparison">
                <div><span>Ton coup</span><strong>{feedback.playedMoveSan}</strong></div>
                <div><span>Ligne principale</span><strong>{feedback.bestMoveSan}</strong></div>
                <div><span>Perte réelle</span><strong>{formatLoss(feedback.lossCp)}</strong></div>
              </div>
              {feedback.bestLineSan ? (
                <div className="line-comparison">
                  <div><span>Variante principale</span><p>{feedback.bestLineSan}</p></div>
                  {feedback.playedLineSan ? <div><span>Après ton choix</span><p>{feedback.playedLineSan}</p></div> : null}
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
                  <span>Plusieurs bons coups reconnus</span>
                  <div>{feedback.candidates.map((candidate) => <p key={candidate.uci}><strong>{candidate.san}</strong><small>{formatEvaluation(candidate.playerCp)}</small></p>)}</div>
                </div>
              ) : null}
              {result ? (
                <div className={`exercise-result ${result}`}>
                  <strong>{result === "success" ? "Réussi" : result === "partial" ? "Partiellement réussi" : "À revoir"}</strong>
                  <span>Ce que tu devais comprendre : {exercise.concept}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="hint-card"><Sparkles size={20} /><p><strong>Avant de jouer</strong>{exercise.mode === "one-move" ? "Liste les échecs, les prises et les menaces." : "Calcule aussi la meilleure réponse adverse : l’exercice ne s’arrête pas forcément au premier coup."}</p></div>
          )}

          <div className="exercise-footer">
            {exercise.gameUrl ? <a href={exercise.gameUrl} target="_blank" rel="noreferrer">Voir la partie source <ExternalLink size={14} /></a> : <span className="concept-source">Position pédagogique validée par le moteur</span>}
            {pendingReply && !result ? (
              <button type="button" className="primary-button" onClick={continueSequence}>Voir la réponse et continuer <ArrowRight size={17} /></button>
            ) : (
              <button type="button" className="primary-button" onClick={nextExercise} disabled={!result}>
                {exercise.origin === "personal" ? "Nouvelle position sur ce thème" : "Exercice suivant"} <ArrowRight size={17} />
              </button>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
