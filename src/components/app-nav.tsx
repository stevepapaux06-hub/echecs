"use client";

import { BarChart3, BrainCircuit, Home, ScanSearch, UserRound } from "lucide-react";
import { Brand } from "./brand";

export type AppSection = "home" | "analyze" | "training-hub" | "progress" | "profile";

const ITEMS = [
  { id: "home", label: "Accueil", icon: Home },
  { id: "analyze", label: "Analyser", icon: ScanSearch },
  { id: "training-hub", label: "S’entraîner", icon: BrainCircuit },
  { id: "progress", label: "Progression", icon: BarChart3 },
  { id: "profile", label: "Profil", icon: UserRound },
] as const;

export function AppNav({
  active,
  onNavigate,
  connected,
}: {
  active: AppSection;
  onNavigate: (section: AppSection) => void;
  connected: boolean;
}) {
  return (
    <nav className="app-nav" aria-label="Navigation principale">
      <button className="brand-button" type="button" onClick={() => onNavigate("home")} aria-label="Accueil ChessPath">
        <Brand />
      </button>
      <div className="nav-links">
        {ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={active === id ? "active" : ""}
            onClick={() => onNavigate(id)}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <button className={`profile-status ${connected ? "connected" : ""}`} type="button" onClick={() => onNavigate("profile")}>
        <span>{connected ? "✓" : "@"}</span>
        {connected ? "Profil sauvegardé" : "Se connecter"}
      </button>
    </nav>
  );
}

