"use client";

import { ArrowRight, BrainCircuit, Clock3, Crown, Crosshair, Shield, Sparkles, Target } from "lucide-react";
import type { TrainingAttemptRecord, TrainingExercise } from "@/domain/chess/types";
import { conceptDefinition } from "@/domain/knowledge/concepts";
import {
  buildTrainingSession,
  conceptTrainingFilter,
  sharesPreciseConcept,
  supportsExactTransfer,
  type TrainingFilter,
} from "@/domain/training/session";

const FILTERS: Array<{ id: TrainingFilter; label: string }> = [
  { id: "recommended", label: "Recommandé pour moi" },
  { id: "mix", label: "Mix" },
  { id: "tactic", label: "Tactique" },
  { id: "strategy", label: "Stratégie" },
  { id: "endgame", label: "Finales" },
  { id: "opening", label: "Ouvertures" },
  { id: "conversion", label: "Conversion" },
];

function availableSubthemes(exercises: TrainingExercise[]) {
  const grouped = new Map<string, {
    category: TrainingExercise["category"];
    conceptSlug: string;
    count: number;
  }>();
  for (const exercise of exercises) {
    if (!supportsExactTransfer(exercise.conceptSlug)) continue;
    if (exercise.source === "lichess" && (exercise.classificationConfidence ?? 1) < 0.8) continue;
    const key = `${exercise.category}:${exercise.conceptSlug}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      category: exercise.category,
      conceptSlug: exercise.conceptSlug,
      count: (existing?.count ?? 0) + 1,
    });
  }
  return [...grouped.values()]
    .filter((theme) => theme.count >= 2 && Boolean(conceptDefinition(theme.conceptSlug)))
    .toSorted((first, second) => first.category.localeCompare(second.category) || second.count - first.count);
}

export function TrainingHub({
  exercises,
  priority,
  priorityConcept,
  attempts,
  onStart,
  onAnalyze,
  userRating,
}: {
  exercises: TrainingExercise[];
  priority?: string;
  priorityConcept?: string;
  attempts: TrainingAttemptRecord[];
  onStart: (exercises: TrainingExercise[], filter: TrainingFilter) => void;
  onAnalyze: () => void;
  userRating?: number;
}) {
  const sessionOptions = { userRating, priorityConcept };
  const recommended = buildTrainingSession(exercises, attempts, "recommended", 7, sessionOptions);
  const counts = {
    personal: recommended.filter((exercise) => exercise.origin === "personal").length,
    concept: recommended.filter((exercise) => exercise.origin === "concept").length,
    multi: recommended.filter((exercise) => exercise.mode !== "one-move").length,
  };
  const firstPersonal = recommended.find((exercise) => exercise.origin === "personal");
  const hasConceptBridge = Boolean(firstPersonal && recommended.some((exercise) => (
    exercise.origin === "concept" && sharesPreciseConcept(firstPersonal, exercise)
  )));
  const recommendationLabel = counts.personal > 0
    ? "Recommandé pour moi"
    : "Séance pédagogique";
  const recommendationTitle = counts.personal > 0
    ? priority || "Séance issue de tes parties"
    : "Séance équilibrée ChessPath";
  const recommendationCopy = counts.personal === 0
    ? "Une sélection de positions pédagogiques vérifiées avec Stockfish, sans prétendre qu’elles proviennent de tes erreurs."
    : hasConceptBridge
      ? "Une erreur personnelle ouvre la séance, puis une nouvelle position te demande d’appliquer exactement le même concept."
      : "La séance part de tes positions personnelles, puis varie les décisions sans prétendre répéter un concept absent de la bibliothèque.";

  function sessionFor(filter: TrainingFilter): TrainingExercise[] {
    return buildTrainingSession(exercises, attempts, filter, 7, sessionOptions);
  }

  const subthemes = availableSubthemes(exercises);

  return (
    <section className="page-shell training-hub-page">
      <header className="page-heading">
        <div><p className="eyebrow"><span /> S’entraîner</p><h1>Une séance qui travaille<br />ce que tes parties révèlent.</h1></div>
        <span className="session-duration"><Clock3 size={15} /> environ 12 minutes</span>
      </header>

      <article className="recommended-session">
        <div>
          <span className="recommended-badge"><Sparkles size={14} /> {recommendationLabel}</span>
          <h2>{recommendationTitle}</h2>
          <p>{recommendationCopy}</p>
          <div className="session-composition">
            <span>{counts.personal} erreur{counts.personal > 1 ? "s" : ""} personnelle{counts.personal > 1 ? "s" : ""}</span>
            <span>{counts.concept} nouvelle{counts.concept > 1 ? "s" : ""} position{counts.concept > 1 ? "s" : ""}</span>
            <span>{counts.multi} séquence{counts.multi > 1 ? "s" : ""} multi-coups</span>
          </div>
        </div>
        <button className="lime-button" type="button" onClick={() => onStart(sessionFor("recommended"), "recommended")} disabled={!recommended.length}>
          Commencer la séance <ArrowRight size={17} />
        </button>
      </article>

      <div className="training-modes">
        {FILTERS.slice(1).map((filter) => {
          const session = sessionFor(filter.id);
          const Icon = filter.id === "tactic" ? Crosshair : filter.id === "strategy" ? BrainCircuit : filter.id === "endgame" ? Crown : filter.id === "conversion" ? Target : Shield;
          return (
            <button type="button" key={filter.id} onClick={() => onStart(session, filter.id)} disabled={!session.length}>
              <Icon size={20} />
              <strong>{filter.label}</strong>
              <small>{session.length ? `${session.length} position${session.length > 1 ? "s" : ""}` : "Après une analyse ciblée"}</small>
              <ArrowRight size={15} />
            </button>
          );
        })}
      </div>

      {subthemes.length ? (
        <div className="training-subthemes panel">
          <div className="panel-heading"><div><span>Sous-thèmes disponibles</span><h2>Travaille un motif précis.</h2></div><small>Uniquement les concepts réellement présents</small></div>
          <div className="subtheme-buttons">
            {subthemes.map((theme) => {
              const definition = conceptDefinition(theme.conceptSlug)!;
              const filter = conceptTrainingFilter(theme.conceptSlug);
              const session = sessionFor(filter);
              return (
                <button type="button" key={`${theme.category}:${theme.conceptSlug}`} onClick={() => onStart(session, filter)} disabled={!session.length}>
                  <strong>{definition.labelFr}</strong>
                  <small>{theme.count} positions disponibles</small>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {!exercises.length ? (
        <div className="empty-training panel">
          <BrainCircuit size={28} />
          <div><strong>Ton entraînement personnalisé attend un diagnostic.</strong><p>Lance une analyse pour relier les exercices à tes thèmes récurrents.</p></div>
          <button className="primary-button" type="button" onClick={onAnalyze}>Analyser mes parties</button>
        </div>
      ) : null}
    </section>
  );
}
