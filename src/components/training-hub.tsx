"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BrainCircuit, Clock3, Crown, Crosshair, Shield, Sparkles, Target } from "lucide-react";
import type { TrainingAttemptRecord, TrainingExercise } from "@/domain/chess/types";
import { conceptDefinition } from "@/domain/knowledge/concepts";
import { rankWeaknesses, type WeaknessSignal } from "@/domain/training/priorities";
import {
  buildTrainingSession,
  conceptTrainingFilter,
  sharesPreciseConcept,
  supportsExactTransfer,
  trainingPoolForFilter,
  type TrainingFilter,
  type TrainingSourceFilter,
} from "@/domain/training/session";
import { trainingTaxonomy } from "@/domain/training/taxonomy";

type LibraryFilter = Exclude<TrainingFilter, "recommended">;

const DOMAINS: Array<{ id: LibraryFilter; label: string }> = [
  { id: "mix", label: "Mix" },
  { id: "tactic", label: "Tactique" },
  { id: "strategy", label: "Stratégie" },
  { id: "endgame", label: "Finales" },
  { id: "opening", label: "Ouvertures" },
  { id: "conversion", label: "Conversion" },
];

const SOURCES: Array<{ id: TrainingSourceFilter; label: string }> = [
  { id: "mix", label: "Mix" },
  { id: "personal", label: "Mes parties" },
  { id: "bank", label: "Banque" },
];

function filterIcon(filter: TrainingFilter) {
  if (filter === "tactic") return Crosshair;
  if (filter === "strategy") return BrainCircuit;
  if (filter === "endgame") return Crown;
  if (filter === "conversion") return Target;
  return Shield;
}

function availableSubthemes(
  exercises: TrainingExercise[],
  domain: LibraryFilter,
  source: TrainingSourceFilter,
) {
  const grouped = new Map<string, { category: TrainingExercise["category"]; conceptSlug: string; count: number }>();
  for (const exercise of trainingPoolForFilter(exercises, domain, source)) {
    const taxonomy = trainingTaxonomy(exercise);
    if (!supportsExactTransfer(taxonomy.primaryConcept)) continue;
    const key = `${taxonomy.domain}:${taxonomy.primaryConcept}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      category: taxonomy.domain,
      conceptSlug: taxonomy.primaryConcept,
      count: (existing?.count ?? 0) + 1,
    });
  }
  return [...grouped.values()]
    .filter((theme) => Boolean(conceptDefinition(theme.conceptSlug)))
    .toSorted((first, second) => second.count - first.count || first.conceptSlug.localeCompare(second.conceptSlug));
}

export function TrainingHub({
  exercises,
  priority,
  priorityConcept,
  priorityDomain,
  conceptStats,
  attempts,
  onStart,
  onAnalyze,
  userRating,
}: {
  exercises: TrainingExercise[];
  priority?: string;
  priorityConcept?: string;
  priorityDomain?: TrainingExercise["category"];
  conceptStats?: WeaknessSignal[];
  attempts: TrainingAttemptRecord[];
  onStart: (exercises: TrainingExercise[], filter: TrainingFilter, source: TrainingSourceFilter) => void;
  onAnalyze: () => void;
  userRating?: number;
}) {
  const [libraryDomain, setLibraryDomain] = useState<LibraryFilter>("mix");
  const [sourceFilter, setSourceFilter] = useState<TrainingSourceFilter>("mix");
  const recommended = useMemo(() => buildTrainingSession(exercises, attempts, "recommended", 7, {
    userRating,
    priorityConcept,
    priorityDomain,
  }), [attempts, exercises, priorityConcept, priorityDomain, userRating]);
  const counts = {
    personal: recommended.filter((exercise) => exercise.origin === "personal").length,
    concept: recommended.filter((exercise) => exercise.origin === "concept").length,
    multi: recommended.filter((exercise) => exercise.mode !== "one-move").length,
  };
  const firstPersonal = recommended.find((exercise) => exercise.origin === "personal");
  const hasConceptBridge = Boolean(firstPersonal && recommended.some((exercise) => (
    exercise.origin === "concept" && sharesPreciseConcept(firstPersonal, exercise)
  )));
  const rankedWeaknesses = useMemo(() => rankWeaknesses(conceptStats ?? []).slice(0, 4), [conceptStats]);
  const domainPools = useMemo(() => new Map(DOMAINS.map((domain) => [
    domain.id,
    trainingPoolForFilter(exercises, domain.id, sourceFilter),
  ])), [exercises, sourceFilter]);
  const subthemes = useMemo(
    () => availableSubthemes(exercises, libraryDomain, sourceFilter),
    [exercises, libraryDomain, sourceFilter],
  );
  const libraryPool = domainPools.get(libraryDomain) ?? [];

  function sessionFor(filter: TrainingFilter, source: TrainingSourceFilter, size = 7) {
    return buildTrainingSession(exercises, attempts, filter, size, {
      userRating,
      priorityConcept,
      priorityDomain,
      sourceFilter: source,
    });
  }

  const recommendationCopy = counts.personal === 0
    ? "Tes statistiques choisissent le concept prioritaire, puis ChessPath utilise les meilleures positions disponibles dans la banque."
    : hasConceptBridge
      ? "Une position pédagogique de tes parties ouvre la séance, puis de nouvelles positions testent le même concept dans d’autres contextes."
      : "Tes positions personnelles fiables sont prioritaires ; la banque complète la séance sans inventer de correspondance entre deux concepts.";

  return (
    <section className="page-shell training-hub-page">
      <header className="page-heading">
        <div><p className="eyebrow"><span /> S’entraîner</p><h1>Apprends ce qui manque<br />réellement à ton jeu.</h1></div>
        <span className="session-duration"><Clock3 size={15} /> entraînement continu</span>
      </header>

      <section className="training-section training-weaknesses">
        <div className="training-section-heading">
          <div><span className="section-index">01</span><div><p>Mes faiblesses</p><h2>Une prescription courte, issue de ton profil.</h2></div></div>
          <small>7 exercices recommandés · puis tu peux continuer</small>
        </div>

        {rankedWeaknesses.length ? (
          <div className="weakness-signals" aria-label="Priorités détectées">
            {rankedWeaknesses.map((weakness) => {
              const definition = conceptDefinition(weakness.conceptSlug);
              return (
                <div key={weakness.conceptSlug}>
                  <strong>{definition?.labelFr ?? weakness.conceptSlug}</strong>
                  <span>{weakness.failures} ratée{weakness.failures > 1 ? "s" : ""} sur {weakness.opportunities} occasions fiables</span>
                </div>
              );
            })}
          </div>
        ) : null}

        <article className="recommended-session">
          <div>
            <span className="recommended-badge"><Sparkles size={14} /> Recommandé pour moi</span>
            <h2>{priority || "Séance pédagogique ChessPath"}</h2>
            <p>{recommendationCopy}</p>
            <div className="session-composition">
              <span>{counts.personal} position{counts.personal > 1 ? "s" : ""} de mes parties</span>
              <span>{counts.concept} position{counts.concept > 1 ? "s" : ""} de transfert</span>
              <span>{counts.multi} séquence{counts.multi > 1 ? "s" : ""} multi-coups</span>
            </div>
          </div>
          <button className="lime-button" type="button" onClick={() => onStart(recommended, "recommended", "mix")} disabled={!recommended.length}>
            Commencer mes 7 priorités <ArrowRight size={17} />
          </button>
        </article>
      </section>

      <section className="training-section training-library">
        <div className="training-section-heading">
          <div><span className="section-index">02</span><div><p>Bibliothèque d’entraînement</p><h2>Choisis librement ton domaine et ton thème.</h2></div></div>
          <small>{libraryPool.length} position{libraryPool.length > 1 ? "s" : ""} disponible{libraryPool.length > 1 ? "s" : ""}</small>
        </div>

        <div className="source-filter" role="group" aria-label="Source des exercices">
          {SOURCES.map((source) => (
            <button className={sourceFilter === source.id ? "active" : ""} type="button" key={source.id} aria-pressed={sourceFilter === source.id} onClick={() => setSourceFilter(source.id)}>
              {source.label}
            </button>
          ))}
        </div>

        <div className="training-modes">
          {DOMAINS.map((filter) => {
            const pool = domainPools.get(filter.id) ?? [];
            const Icon = filterIcon(filter.id);
            return (
              <button className={libraryDomain === filter.id ? "active" : ""} type="button" key={filter.id} aria-pressed={libraryDomain === filter.id} onClick={() => setLibraryDomain(filter.id)} disabled={!pool.length}>
                <Icon size={20} />
                <strong>{filter.label}</strong>
                <small>{pool.length ? `${pool.length} position${pool.length > 1 ? "s" : ""}` : "Indisponible"}</small>
                <ArrowRight size={15} />
              </button>
            );
          })}
        </div>

        <div className="library-launch">
          <div><strong>{DOMAINS.find((domain) => domain.id === libraryDomain)?.label}</strong><span>Le flux continue jusqu’à ce que tu décides de changer de thème.</span></div>
          <button className="primary-button" type="button" disabled={!libraryPool.length} onClick={() => onStart(sessionFor(libraryDomain, sourceFilter), libraryDomain, sourceFilter)}>
            Commencer <ArrowRight size={16} />
          </button>
        </div>

        {subthemes.length ? (
          <div className="training-subthemes panel">
            <div className="panel-heading"><div><span>Sous-thèmes disponibles</span><h2>Travaille un concept précis.</h2></div><small>Seulement les concepts réellement alimentés</small></div>
            <div className="subtheme-buttons">
              {subthemes.map((theme) => {
                const definition = conceptDefinition(theme.conceptSlug)!;
                const filter = conceptTrainingFilter(theme.conceptSlug, theme.category);
                return (
                  <button type="button" key={`${theme.category}:${theme.conceptSlug}`} onClick={() => onStart(sessionFor(filter, sourceFilter), filter, sourceFilter)}>
                    <strong>{definition.labelFr}</strong>
                    <small>{theme.count} position{theme.count > 1 ? "s" : ""}</small>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="training-subthemes panel"><p>Aucun sous-thème fiable n’est encore disponible pour ce filtre.</p></div>
        )}
      </section>

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
