"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Sparkles, Target, TrendingUp } from "lucide-react";
import type { DiagnosticCategory } from "../domain/chess/types";
import { conceptDefinition } from "../domain/knowledge/concepts";
import type { ProgressFixtureName } from "../domain/progress/progress-read-model.fixtures";
import type { ObservedStrength, ProgressConcept, ProgressConceptStatus, ProgressReadModel } from "../domain/progress/progress-read-model";
import type { PersistentProfile } from "../infrastructure/supabase/repository";

const DOMAIN_ORDER: Array<{ id: DiagnosticCategory; label: string }> = [
  { id: "tactic", label: "Tactique" },
  { id: "strategy", label: "Stratégie" },
  { id: "conversion", label: "Conversion" },
  { id: "defense", label: "Défense" },
  { id: "endgame", label: "Finales" },
];
const DEV_FIXTURE_NAMES: ProgressFixtureName[] = ["NO_DATA", "INSUFFICIENT_DATA", "EMERGING_ONLY", "RECURRING", "IMPROVING", "RESOLVED", "RICH_PROFILE"];

type Achievement = {
  conceptSlug: string;
  label: string;
  kind: "IMPROVING" | "RESOLVED" | "STRENGTH";
  concept?: ProgressConcept;
  strength?: ObservedStrength;
};

export function developmentFixtureName(value: string | null, environment: string): ProgressFixtureName | null {
  if (environment !== "development" || !value) return null;
  return DEV_FIXTURE_NAMES.find((name) => name === value) ?? null;
}

export function progressStatusLabel(status: ProgressConceptStatus): string {
  if (status === "INSUFFICIENT_EVIDENCE") return "Données insuffisantes";
  if (status === "EMERGING") return "Signal émergent";
  if (status === "RECURRING") return "Faiblesse récurrente";
  if (status === "IMPROVING") return "En amélioration";
  return "Résolue";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Date indisponible";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export function progressSummary(model: ProgressReadModel): { eyebrow: string; title: string; description: string } {
  if (model.dataState === "NO_DATA") return {
    eyebrow: "Première étape",
    title: "Ton profil attend sa première analyse.",
    description: "Analyse quelques parties : ChessPath commencera par observer, sans transformer un exemple isolé en vérité sur ton jeu.",
  };
  if (model.dataState === "INSUFFICIENT_DATA") return {
    eyebrow: "Profil en construction",
    title: "ChessPath apprend encore ton jeu.",
    description: `Il faut encore ${model.reevaluation.newGamesNeeded} partie${model.reevaluation.newGamesNeeded > 1 ? "s" : ""} analysée${model.reevaluation.newGamesNeeded > 1 ? "s" : ""} pour une comparaison récente fiable.`,
  };
  const improved = model.concepts.find((concept) => concept.status === "IMPROVING" || concept.status === "RESOLVED");
  if (improved) return {
    eyebrow: "Signal encourageant",
    title: `${improved.label} ${improved.status === "RESOLVED" ? "ne ressort plus récemment" : "s’améliore dans tes parties récentes"}.`,
    description: "La conclusion compare des occasions réellement rencontrées, pas un score global artificiel.",
  };
  if (model.priority) return {
    eyebrow: "Lecture actuelle",
    title: model.priority.status === "EMERGING"
      ? `${model.priority.label} commence à apparaître dans plusieurs parties.`
      : `${model.priority.label} reste ton principal pattern récurrent.`,
    description: "Ce signal vient de parties distinctes et de preuves pédagogiques validées.",
  };
  return {
    eyebrow: "Profil stable",
    title: "Aucune évolution nette n’est encore démontrée.",
    description: "ChessPath attend davantage d’occasions comparables avant de conclure.",
  };
}

export function progressAchievements(model: ProgressReadModel): Achievement[] {
  const achievements: Achievement[] = model.concepts.flatMap((concept): Achievement[] => (
    concept.status === "IMPROVING" || concept.status === "RESOLVED"
      ? [{ conceptSlug: concept.conceptSlug, label: concept.label, kind: concept.status, concept }]
      : []
  ));
  const seen = new Set(achievements.map((item) => item.conceptSlug));
  for (const strength of model.observedStrengths) {
    if (seen.has(strength.conceptSlug)) continue;
    achievements.push({ conceptSlug: strength.conceptSlug, label: strength.label, kind: "STRENGTH", strength });
  }
  return achievements;
}

function ProgressGraph({ model }: { model: ProgressReadModel }) {
  const points = model.graph.overall;
  const [selected, setSelected] = useState(points.at(-1)?.block ?? 1);
  const active = points.find((point) => point.block === selected) ?? points.at(-1);
  if (model.dataState === "NO_DATA" || points.length < 2) {
    return <div className="progress-chart-empty"><TrendingUp size={25} /><div><strong>La tendance se construit par blocs de 5 parties.</strong><span>Deux blocs complets sont nécessaires pour afficher une évolution honnête.</span></div></div>;
  }
  return (
    <div className="progress-chart-wrap">
      <div className="progress-chart" role="group" aria-label="Problèmes pédagogiques par blocs de cinq parties">
        {points.map((point) => (
          <button key={point.block} type="button" className={selected === point.block ? "active" : ""} onClick={() => setSelected(point.block)} title={`${formatDate(point.fromPlayedAt)} – ${formatDate(point.toPlayedAt)} : ${point.gamesWithValidatedProblem} partie(s) sur 5`} aria-label={`Bloc ${point.block}, ${point.gamesWithValidatedProblem} parties avec un problème validé sur 5`} aria-pressed={selected === point.block}>
            <span className="progress-chart-value">{point.gamesWithValidatedProblem}</span>
            <span className="progress-chart-bar"><i style={{ height: `${Math.max(8, point.gamesWithValidatedProblem * 20)}%` }} /></span>
            <small>{point.block * 5 - 4}–{point.block * 5}</small>
          </button>
        ))}
      </div>
      {active ? <p className="progress-chart-caption" aria-live="polite"><strong>{active.gamesWithValidatedProblem} sur {active.games}</strong> parties contiennent au moins un problème validé · {formatDate(active.fromPlayedAt)} au {formatDate(active.toPlayedAt)}</p> : null}
    </div>
  );
}

function EvidenceList({ concept }: { concept: ProgressConcept }) {
  const definition = conceptDefinition(concept.conceptSlug);
  return (
    <div className="progress-evidence">
      <p>{definition?.shortDescription ?? "Concept pédagogique observé dans plusieurs décisions validées."}</p>
      <div>{concept.supportingEvidence.map((evidence) => <article key={evidence.evidenceId}><span className={evidence.reason === "ERROR" ? "error" : "opportunity"}>{evidence.reason === "ERROR" ? "Erreur" : "Occasion manquée"}</span><strong>Partie {evidence.gameId}</strong><small>{formatDate(evidence.occurredAt)} · moment {evidence.momentId}</small></article>)}</div>
    </div>
  );
}

function AchievementDetail({ achievement }: { achievement: Achievement }) {
  if (achievement.strength) return <p className="achievement-detail">Tu as correctement traité {achievement.strength.correctlyTreated} occasions sur {achievement.strength.opportunities} dans tes 10 parties récentes.</p>;
  const concept = achievement.concept!;
  return <div className="achievement-detail"><p>Fenêtre précédente : {concept.previous.correctlyTreated}/{concept.previous.exposures} occasions correctement traitées.</p><p>Fenêtre récente : {concept.recent.correctlyTreated}/{concept.recent.exposures}.</p></div>;
}

export function ProgressView({ profile, onProfile, onAnalyze, onTrain }: {
  profile: PersistentProfile | null;
  onProfile: () => void;
  onAnalyze: () => void;
  onTrain: (conceptSlug: string, category: DiagnosticCategory | null, label: string) => void;
}) {
  const [fixtureName, setFixtureName] = useState<ProgressFixtureName | null>(null);
  const [fixtureModel, setFixtureModel] = useState<ProgressReadModel | null>(null);
  const model = fixtureModel ?? profile?.progress;
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [openAchievement, setOpenAchievement] = useState<string | null>(null);
  const [showAllAchievements, setShowAllAchievements] = useState(false);
  const [openDomain, setOpenDomain] = useState<DiagnosticCategory | null>(null);
  const [openConcept, setOpenConcept] = useState<string | null>(null);
  const achievements = useMemo(() => model ? progressAchievements(model) : [], [model]);

  useEffect(() => {
    const requested = developmentFixtureName(new URLSearchParams(window.location.search).get("progressFixture"), process.env.NODE_ENV);
    if (!requested) return;
    void import("../domain/progress/progress-read-model.fixtures").then(({ buildProgressFixture }) => {
      setFixtureName(requested);
      setFixtureModel(buildProgressFixture(requested));
    });
  }, []);

  async function selectFixture(value: string) {
    if (process.env.NODE_ENV !== "development" || value === "REAL") {
      setFixtureName(null);
      setFixtureModel(null);
      return;
    }
    const selected = developmentFixtureName(value, process.env.NODE_ENV);
    if (!selected) return;
    const { buildProgressFixture } = await import("../domain/progress/progress-read-model.fixtures");
    setFixtureName(selected);
    setFixtureModel(buildProgressFixture(selected));
  }

  if (!profile && !model) return <section className="page-shell empty-state-page"><TrendingUp size={40} /><p className="eyebrow"><span /> Progression</p><h1>Connecte ton profil pour suivre l’évolution de ton jeu.</h1><p>ChessPath compare uniquement des parties et des occasions pédagogiques réellement observées.</p><button className="primary-button" type="button" onClick={onProfile}>Créer mon profil <ArrowRight size={16} /></button></section>;
  if (!model) return null;

  const summary = progressSummary(model);
  const visibleAchievements = showAllAchievements ? achievements : achievements.slice(0, 3);
  const priorityConcept = model.priority ? model.concepts.find((concept) => concept.conceptSlug === model.priority?.conceptSlug) : undefined;

  return (
    <section className="page-shell progress-v2-page">
      {process.env.NODE_ENV === "development" ? <label className="progress-fixture-switcher">Prévisualiser<select value={fixtureName ?? "REAL"} onChange={(event) => void selectFixture(event.target.value)}><option value="REAL">Données réelles</option>{DEV_FIXTURE_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}</select></label> : null}

      <header className="progress-summary">
        <div><p className="eyebrow"><span /> {summary.eyebrow}</p><h1>{summary.title}</h1><p>{summary.description}</p></div>
        <aside><Clock3 size={18} /><span>Prochaine lecture</span><strong>{model.reevaluation.newGamesNeeded} nouvelle{model.reevaluation.newGamesNeeded > 1 ? "s" : ""} partie{model.reevaluation.newGamesNeeded > 1 ? "s" : ""}</strong><small>{model.windows.recentGames}/10 récentes · {model.windows.previousGames}/10 précédentes</small></aside>
      </header>

      <section className="progress-v2-section progress-trend-section">
        <div className="progress-section-heading"><div><span>01 · Tendance</span><h2>Les problèmes reviennent-ils moins souvent ?</h2></div><small>Parties avec ≥1 problème validé · blocs de 5</small></div>
        <ProgressGraph model={model} />
      </section>

      <section className="progress-v2-section progress-priority-section">
        <div className="progress-section-heading"><div><span>02 · Priorité actuelle</span><h2>Ce qui mérite ton attention maintenant.</h2></div></div>
        {model.priority && priorityConcept ? (
          <article className="progress-priority-card">
            <div className="progress-priority-main"><span className={`progress-status ${model.priority.status.toLowerCase()}`}>{progressStatusLabel(model.priority.status)}</span><h3>{model.priority.label}</h3><p>{conceptDefinition(model.priority.conceptSlug)?.shortDescription}</p><div className="progress-priority-facts"><span><strong>{model.priority.distinctGames}</strong> parties concernées</span><span><strong>{model.priority.historicalErrors}</strong> erreurs</span><span><strong>{model.priority.historicalMissedOpportunities}</strong> occasions manquées</span></div></div>
            <div className="progress-priority-side"><span>Dernière occurrence</span><strong>{formatDate(model.priority.lastOccurrenceAt)}</strong><small>{model.priority.trend === "IMPROVING" ? "Tendance en amélioration" : model.priority.trend === "WORSENING" ? "Signal plus fréquent récemment" : "Tendance encore stable"}</small><div><button className="progress-secondary-action" type="button" onClick={() => setPriorityOpen((value) => !value)} aria-expanded={priorityOpen}><CircleHelp size={16} /> Pourquoi ? {priorityOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button><button className="lime-button" type="button" onClick={() => onTrain(model.priority!.conceptSlug, model.priority!.category, model.priority!.label)}>Travailler cette faiblesse <ArrowRight size={16} /></button></div></div>
            {priorityOpen ? <div className="progress-priority-proof"><div>{model.priority.priorityReasons.map((reason) => <p key={reason}><Check size={14} />{reason}</p>)}</div><EvidenceList concept={priorityConcept} /></div> : null}
          </article>
        ) : <article className="progress-priority-empty"><Target size={24} /><div><strong>Aucune faiblesse prioritaire suffisamment établie.</strong><p>ChessPath attend des preuves dans plusieurs parties distinctes avant de te prescrire un travail.</p></div><button className="primary-button" type="button" onClick={onAnalyze}>Analyser de nouvelles parties</button></article>}
      </section>

      <section className="progress-v2-section progress-achievements-section">
        <div className="progress-section-heading"><div><span>03 · Progrès et réussites</span><h2>Ce qui change dans le bon sens.</h2></div>{achievements.length > 3 ? <button type="button" onClick={() => setShowAllAchievements((value) => !value)}>{showAllAchievements ? "Réduire" : "Voir tout"}</button> : null}</div>
        {visibleAchievements.length ? <div className="progress-achievements">{visibleAchievements.map((achievement) => { const open = openAchievement === achievement.conceptSlug; return <article key={achievement.conceptSlug}><button type="button" onClick={() => setOpenAchievement(open ? null : achievement.conceptSlug)} aria-expanded={open}><span>{achievement.kind === "IMPROVING" ? "↑" : achievement.kind === "RESOLVED" ? "✓" : "+"}</span><div><strong>{achievement.label}</strong><small>{achievement.kind === "IMPROVING" ? "En amélioration" : achievement.kind === "RESOLVED" ? "Résolue" : "Point fort observé"}</small></div>{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>{open ? <AchievementDetail achievement={achievement} /> : null}</article>; })}</div> : <p className="progress-neutral-copy">Aucune progression n’est encore démontrée. Une absence de données ne sera jamais présentée comme une réussite.</p>}
      </section>

      <section className="progress-v2-section progress-map-section">
        <div className="progress-section-heading"><div><span>04 · Carte de ton jeu</span><h2>Explore ton profil, domaine par domaine.</h2></div><small>Les détails restent repliés jusqu’à ta demande</small></div>
        <div className="progress-domain-list">{DOMAIN_ORDER.map((domain) => { const concepts = model.concepts.filter((concept) => concept.category === domain.id); const priorities = concepts.filter((concept) => concept.status === "EMERGING" || concept.status === "RECURRING").length; const progress = concepts.filter((concept) => concept.status === "IMPROVING" || concept.status === "RESOLVED").length; const insufficient = concepts.filter((concept) => concept.status === "INSUFFICIENT_EVIDENCE").length; const open = openDomain === domain.id; return <article key={domain.id}><button type="button" onClick={() => setOpenDomain(open ? null : domain.id)} aria-expanded={open}><strong>{domain.label}</strong><span>{priorities} priorité{priorities > 1 ? "s" : ""} · {progress} progrès · {insufficient} donnée{insufficient > 1 ? "s" : ""} insuffisante{insufficient > 1 ? "s" : ""}</span>{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>{open ? <div className="progress-domain-concepts">{concepts.length ? concepts.toSorted((first, second) => first.status.localeCompare(second.status)).map((item) => { const conceptOpen = openConcept === item.conceptSlug; return <div key={item.conceptSlug}><button type="button" onClick={() => setOpenConcept(conceptOpen ? null : item.conceptSlug)} aria-expanded={conceptOpen}><span className={`progress-status ${item.status.toLowerCase()}`}>{progressStatusLabel(item.status)}</span><strong>{item.label}</strong>{conceptOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>{conceptOpen ? <div className="progress-concept-detail"><p>{conceptDefinition(item.conceptSlug)?.shortDescription}</p><span>{item.distinctGames} partie{item.distinctGames > 1 ? "s" : ""} avec preuve · {item.recent.correctlyTreated}/{item.recent.exposures} occasions récentes correctement traitées</span></div> : null}</div>; }) : <p>Aucun concept fiable observé dans ce domaine.</p>}</div> : null}</article>; })}</div>
        <footer><Sparkles size={15} /> Analyse tes prochaines parties pour voir si ces statuts évoluent après la prochaine réévaluation.</footer>
      </section>
    </section>
  );
}
