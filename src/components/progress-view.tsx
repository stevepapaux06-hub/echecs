"use client";

import { ArrowDownRight, ArrowRight, BarChart3, BrainCircuit, Target, TrendingUp } from "lucide-react";
import type { PersistentProfile } from "@/infrastructure/supabase/repository";

function deltaLabel(before: number | null, after: number | null, suffix = "%"): string {
  if (before === null || after === null) return "Données insuffisantes";
  return `${before}${suffix} → ${after}${suffix}`;
}

export function ProgressView({ profile, onProfile }: { profile: PersistentProfile | null; onProfile: () => void }) {
  if (!profile) {
    return (
      <section className="page-shell empty-state-page">
        <TrendingUp size={40} />
        <p className="eyebrow"><span /> Progression</p>
        <h1>Connecte ton profil pour comparer tes analyses.</h1>
        <p>ChessPath combine les nouvelles parties et les résultats d’entraînement ; une session isolée ne suffit pas à déclarer une compétence maîtrisée.</p>
        <button className="primary-button" type="button" onClick={onProfile}>Créer mon profil <ArrowRight size={16} /></button>
      </section>
    );
  }

  const chronological = profile.analyses.toReversed();
  const first = chronological[0]?.metrics;
  const latest = chronological.at(-1)?.metrics;
  const enoughHistory = chronological.length >= 2;
  return (
    <section className="page-shell progress-page">
      <header className="page-heading"><div><p className="eyebrow"><span /> Progression</p><h1>Ce qui change vraiment<br />dans ton jeu.</h1></div><span className="history-badge">{profile.analyses.length} analyses comparables</span></header>

      <div className="progress-kpis">
        <article><BarChart3 /><span>Analyses</span><strong>{profile.analyses.length}</strong></article>
        <article><Target /><span>Parties conservées</span><strong>{profile.savedGamesCount}</strong></article>
        <article><BrainCircuit /><span>Thèmes suivis</span><strong>{profile.weaknesses.length}</strong></article>
      </div>

      <article className="panel comparison-panel">
        <div className="panel-heading"><div><span>Entre la première et la dernière analyse</span><h2>{enoughHistory ? "Évolution mesurée" : "Une seconde analyse débloquera la comparaison"}</h2></div><TrendingUp size={22} /></div>
        <div className="comparison-grid">
          <div><small>Conversion</small><strong>{deltaLabel(first?.conversionRate ?? null, latest?.conversionRate ?? null)}</strong></div>
          <div><small>Grosses erreurs / partie</small><strong>{first && latest ? `${first.importantErrorsPerGame} → ${latest.importantErrorsPerGame}` : "Données insuffisantes"}</strong></div>
          <div><small>Défense</small><strong>{deltaLabel(first?.defenseRecoveryRate ?? null, latest?.defenseRecoveryRate ?? null)}</strong></div>
        </div>
        <p className="method-note">Une compétence n’avance pas parce qu’un bouton a été cliqué. Le statut combine les diagnostics successifs et, progressivement, les tentatives sur de nouvelles positions.</p>
      </article>

      <article className="panel skills-panel">
        <div className="panel-heading"><div><span>Compétences suivies</span><h2>Faiblesses actuelles et confiance.</h2></div><small>{profile.attempts} exercices enregistrés</small></div>
        <div className="skills-list">
          {profile.weaknesses.map((weakness) => (
            <div key={weakness.theme}>
              <span className={`skill-status ${weakness.status}`}>{weakness.status === "progressing" ? "En progression" : weakness.status === "mastered" ? "Maîtrisée" : weakness.status === "learning" ? "En apprentissage" : "À travailler"}</span>
              <strong>{weakness.title}</strong>
              <small>{weakness.issueCount}/{weakness.sampleSize} exemples · confiance {weakness.confidence === "high" ? "élevée" : weakness.confidence === "medium" ? "moyenne" : "faible"}</small>
              <ArrowDownRight size={16} />
            </div>
          ))}
          {!profile.weaknesses.length ? <p>Aucun thème suffisamment répété pour l’instant.</p> : null}
        </div>
      </article>
    </section>
  );
}
