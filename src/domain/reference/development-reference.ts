import { Chess } from "chess.js";
import { REFERENCE_SOURCE_BY_KEY } from "./source-catalog";
import type {
  AgreementStatus,
  AnnotationScope,
  ConceptAssessment,
  ConceptObjectType,
  DevelopmentReference,
  PilotConceptId,
  ReferenceFamily,
} from "./types";

type CaseSeed = {
  family: ReferenceFamily;
  sourceKey: string;
  move?: string;
  line?: string[];
  mechanism: string;
  rationale: string;
  access?: string;
  target?: string | null;
  counterevidence?: string;
  alternative?: string;
  confounder?: string;
  agreement?: AgreementStatus;
};

const OBJECT_TYPES: Record<PilotConceptId, ConceptObjectType> = {
  outpost: "functional_relation",
  open_file: "static_property",
  improve_worst_piece: "plan_intention",
  opposition: "theoretical_state",
  restrict_counterplay: "plan_intention",
  exchange_attacker: "decision_comparison",
};

function assessmentFor(family: ReferenceFamily): { assessment: ConceptAssessment; available: boolean | "unknown"; label: DevelopmentReference["label"] } {
  const axis = (score: number, status: "absent" | "weak" | "present" | "strong" | "unknown", rationale: string) => ({ score, status, rationale });
  if (family === "natural_positive") return {
    label: "positive", available: true,
    assessment: {
      presence: axis(0.92, "strong", "Les conditions constitutives sont visibles dans l’hypothèse annotée."),
      decision_relevance: axis(0.84, "strong", "La décision réalise le mécanisme dans la position source."),
      pedagogical_priority: axis(0.7, "present", "Exemple conceptuel utile, sous réserve de la seconde revue indépendante."),
      confidence: 0.78, abstentions: ["unsuitable_for_training"],
    },
  };
  if (family === "constitutive_negative" || family === "neighbor_negative") return {
    label: "negative", available: false,
    assessment: {
      presence: axis(0.08, "absent", "Une condition définitionnelle manque ou seul un concept voisin est établi."),
      decision_relevance: axis(0.08, "absent", "Le mécanisme cible ne justifie pas la décision."),
      pedagogical_priority: axis(0.03, "absent", "Ne doit pas devenir la leçon cible."),
      confidence: 0.76, abstentions: ["concept_unknown", "unsuitable_for_training"],
    },
  };
  if (family === "affordance_negative") return {
    label: "boundary", available: false,
    assessment: {
      presence: axis(0.82, "present", "La propriété géométrique peut exister."),
      decision_relevance: axis(0.2, "weak", "Elle n’offre ni accès, ni cible, ni changement utile établi."),
      pedagogical_priority: axis(0.08, "weak", "Présence sans affordance : ne pas enseigner le motif comme plan."),
      confidence: 0.72, abstentions: ["concept_present_but_not_relevant", "unsuitable_for_training"],
    },
  };
  if (family === "relevance_negative") return {
    label: "boundary", available: true,
    assessment: {
      presence: axis(0.8, "present", "Le motif peut être présent dans la position."),
      decision_relevance: axis(0.15, "weak", "La décision annotée ne dépend pas principalement de ce motif."),
      pedagogical_priority: axis(0.06, "weak", "Le concept ne doit pas être promu depuis cette décision."),
      confidence: 0.7, abstentions: ["concept_present_but_not_relevant", "unsuitable_for_training"],
    },
  };
  if (family === "centrality_negative") return {
    label: "boundary", available: true,
    assessment: {
      presence: axis(0.78, "present", "Le concept contribue à la position."),
      decision_relevance: axis(0.65, "present", "Il influence la décision sans être la leçon dominante."),
      pedagogical_priority: axis(0.15, "weak", "Une autre explication est plus centrale."),
      confidence: 0.66, abstentions: ["relevant_but_not_pedagogically_central", "unsuitable_for_training"],
    },
  };
  if (family === "tactical_override") return {
    label: "abstain", available: true,
    assessment: {
      presence: axis(0.66, "present", "Le motif positionnel peut rester visible."),
      decision_relevance: axis(0.42, "weak", "La tactique urgente contrôle la décision."),
      pedagogical_priority: axis(0.02, "absent", "La leçon positionnelle doit s’effacer."),
      confidence: 0.7, abstentions: ["tactical_override", "unsuitable_for_training"],
    },
  };
  if (family === "engine_disagreement") return {
    label: "abstain", available: "unknown",
    assessment: {
      presence: axis(0.58, "unknown", "L’hypothèse conceptuelle reste plausible mais non stabilisée."),
      decision_relevance: axis(0.48, "unknown", "Les branches objectives ou mécanismes concurrents divergent."),
      pedagogical_priority: axis(0.12, "weak", "Aucune leçon ne doit être publiée avant adjudication."),
      confidence: 0.42, abstentions: ["unstable_mechanism", "weak_signal", "unsuitable_for_training"],
    },
  };
  return {
    label: "abstain", available: "unknown",
    assessment: {
      presence: axis(0.45, "unknown", "Un indice superficiel imite le concept."),
      decision_relevance: axis(0.3, "weak", "Le mécanisme complet n’est pas établi."),
      pedagogical_priority: axis(0.05, "weak", "Challenge anti-shortcut, jamais une leçon automatique."),
      confidence: 0.52, abstentions: ["weak_signal", "multiple_concepts_no_dominant", "unsuitable_for_training"],
    },
  };
}

function materialSignature(fen: string): string {
  const counts = new Map<string, number>();
  for (const token of fen.split(" ")[0].replace(/[1-8/]/g, "")) counts.set(token, (counts.get(token) ?? 0) + 1);
  return [...counts.entries()].toSorted(([a], [b]) => a.localeCompare(b)).map(([piece, count]) => `${piece}${count}`).join("");
}

function reference(conceptId: PilotConceptId, index: number, seed: CaseSeed): DevelopmentReference {
  const source = REFERENCE_SOURCE_BY_KEY.get(seed.sourceKey);
  if (!source) throw new Error(`Unknown reference source: ${seed.sourceKey}`);
  const { assessment, available, label } = assessmentFor(seed.family);
  const scope: AnnotationScope = conceptId === "opposition" && !seed.move
    ? "theoretical_state"
    : seed.line && seed.line.length > 1 ? "short_sequence" : seed.move ? "move" : "position";
  const objectId = `${conceptId}-object-${String(index + 1).padStart(2, "0")}`;
  const negative = seed.family !== "natural_positive";
  return {
    id: `pilot-${conceptId}-${seed.family}-${String(index + 1).padStart(2, "0")}`,
    status: "development_reference",
    concept_id: conceptId,
    family: seed.family,
    fen: source.fen,
    phase: source.phase,
    move_uci: seed.move,
    line_uci: seed.line,
    annotation_scope: scope,
    label,
    concept_object: {
      object_id: objectId,
      concept_id: conceptId,
      object_type: OBJECT_TYPES[conceptId],
      scope,
      subject: { mechanism: seed.mechanism, move: seed.move ?? "position", target: seed.target ?? "unresolved" },
      evidence: [
        { kind: "human_annotation", claim: seed.rationale },
        { kind: "board_fact", claim: `Position source ${source.sourceRecordId}`, value: source.phase },
      ],
      counterevidence: seed.counterevidence ? [{ kind: "human_annotation", claim: seed.counterevidence }] : [],
      uncertainty: negative ? ["Seconde annotation aveugle requise avant tout statut indépendant."] : ["Hypothèse pilote à confirmer hors du chemin de collecte."],
      constitutive_conditions: { mechanism_identified: !negative, source_traceable: true, independent_adjudication: false },
      confounders: seed.confounder ? [seed.confounder] : [],
    },
    affordance: {
      available,
      mechanism: seed.mechanism,
      access: seed.access ?? (available === true ? "accès plausible annoté" : "accès non établi"),
      target: seed.target ?? null,
      cost: available === true ? "à comparer aux alternatives humaines" : "non justifié",
      stability: seed.family === "natural_positive" ? "reply_dependent" : seed.family === "engine_disagreement" ? "unstable" : "unknown",
    },
    decision_comparison: {
      candidates: seed.move ? [{
        move_uci: seed.move,
        line_uci: seed.line,
        human_rationale: seed.rationale,
        mechanism_realized: label === "positive" ? [seed.mechanism] : [],
        opponent_resource_prevented: conceptId === "restrict_counterplay" || conceptId === "exchange_attacker" ? [seed.target ?? "resource_under_review"] : [],
        concessions: negative ? [seed.counterevidence ?? "mécanisme cible incomplet"] : [],
        state_change: label === "positive" ? ["mécanisme rendu opérationnel"] : ["aucun changement causal cible établi"],
        critical_reply_stability: seed.family === "engine_disagreement" ? "uncertain" : seed.family === "tactical_override" ? "refuted" : "unchecked",
      }] : [],
      equivalent_mechanism_moves: [],
      tactical_competition: seed.family === "tactical_override" ? "dominant" : seed.family === "centrality_negative" ? "secondary" : seed.confounder?.includes("tact") ? "unknown" : "none",
      note: seed.alternative ?? "Le deuxième MultiPV n’est jamais supposé être l’alternative humaine.",
    },
    assessment,
    training_suitability: {
      suitable: seed.family === "natural_positive" ? "unknown" : false,
      reasons: seed.family === "natural_positive"
        ? ["Exemple conceptuel prometteur, mais la suitability Training n’est pas validée dans cette mission."]
        : ["Cas de validation ou frontière, explicitement exclu de Training."],
      plausible_human_alternative: Boolean(seed.alternative),
      target_elo: [source.eloBucket],
    },
    provenance: {
      source: source.source,
      source_url: source.sourceUrl,
      source_game_id: source.gameId,
      source_players: [...source.players],
      position_ply: source.ply,
      source_record_id: source.sourceRecordId,
      collection_path: "existing_source_corpus_before_pilot_annotation",
    },
    clusters: {
      game_cluster: `game:${source.gameId}`,
      player_clusters: source.players.map((player) => `player:${player.toLowerCase()}`),
      opening_cluster: source.phase === "endgame" ? "opening:not-applicable" : "opening:unknown-source-game",
      structure_cluster: `structure:${source.structure}`,
      position_cluster: `position:${source.gameId}:${Math.floor(source.ply / 6)}`,
      pv_cluster: seed.line ? `pv:${source.gameId}:${seed.line.join("-")}` : "pv:none",
      counterfactual_cluster: `counterfactual:${conceptId}:${source.gameId}:${source.ply}`,
      transformation_cluster: "transformation:natural-or-branch",
      symmetry_cluster: `symmetry:${source.gameId}:${source.ply}`,
    },
    mechanism_family: seed.mechanism,
    material_signature: materialSignature(source.fen),
    structure: source.structure,
    side_to_move: source.fen.split(" ")[1] === "w" ? "white" : "black",
    elo_bucket: source.eloBucket,
    eval_state: "unknown",
    difficulty: source.eloBucket === "1800+" ? "advanced" : "intermediate",
    agreement_status: seed.agreement ?? (seed.family === "engine_disagreement" ? "expert_disagreement" : "needs_second_review"),
    notes: [
      "DEVELOPMENT REFERENCE uniquement : ni gold, ni holdout indépendant.",
      seed.rationale,
    ],
  };
}

const CASES: Record<PilotConceptId, CaseSeed[]> = {
  outpost: [
    { family: "natural_positive", sourceKey: "outpost-a", move: "c3d5", mechanism: "install", target: "e3", rationale: "Nd5 atteint une case stable et soutenue avec une cible concrète en e3." },
    { family: "natural_positive", sourceKey: "outpost-b", move: "c3d5", mechanism: "install", target: "b6", rationale: "Deuxième structure naturelle : Nd5 doit être jugé par stabilité, accès et rôle, pas par le nom de la case." },
    { family: "constitutive_negative", sourceKey: "outpost-a", move: "c3a4", mechanism: "install", rationale: "Na4 est avancé mais ne satisfait pas le rôle central attendu.", counterevidence: "Case de bord et fonction durable non établie." },
    { family: "affordance_negative", sourceKey: "outpost-a", move: "c3b5", mechanism: "install", rationale: "La case paraît avancée, mais l’accès ne suffit pas à démontrer une cible ou une restriction utile.", counterevidence: "Affordance après installation non établie." },
    { family: "relevance_negative", sourceKey: "outpost-a", move: "e4e5", mechanism: "maintain", rationale: "Le motif d5 reste visible, mais la décision e5 doit être expliquée par la structure ou le tempo.", counterevidence: "La décision annotée n’installe aucun avant-poste." },
    { family: "centrality_negative", sourceKey: "outpost-c", move: "c3d5", mechanism: "install", rationale: "Nd5 est possible mais attaque immédiatement une pièce : la dimension tactique peut dominer la leçon.", confounder: "tactique sur e3 ou b4" },
    { family: "neighbor_negative", sourceKey: "worst-b", move: "a3c4", mechanism: "install", rationale: "Nc4 peut surtout être un redéploiement de la pire pièce, sans stabilité d’avant-poste établie.", counterevidence: "Concept voisin improve_worst_piece plus plausible." },
    { family: "tactical_override", sourceKey: "outpost-b", move: "c3d5", mechanism: "install", rationale: "La présence des dames et menaces forcing impose de vérifier que Nd5 n’est pas d’abord tactique.", confounder: "tactique forcing avec dames" },
    { family: "human_plausible_misconception", sourceKey: "outpost-b", move: "c3d5", mechanism: "install", rationale: "Le raccourci cavalier en d5 est volontairement mis au défi ; stabilité, échange et cibles restent à annoter.", counterevidence: "d5 seul n’est pas un label." },
    { family: "engine_disagreement", sourceKey: "outpost-c", move: "c3d5", mechanism: "install", rationale: "Candidat historique non activé : le motif et la tactique doivent être départagés après l’hypothèse humaine.", counterevidence: "Validation objective et seconde annotation manquantes." },
  ],
  open_file: [
    { family: "natural_positive", sourceKey: "file-a", move: "c2d2", mechanism: "occupy", target: "d4", rationale: "La tour rejoint la colonne d et rencontre une cible/entrée concrète plutôt qu’une colonne abstraite." },
    { family: "natural_positive", sourceKey: "file-b", move: "a1d1", mechanism: "contest", target: "d7", rationale: "Deuxième famille : la tour conteste la colonne d dans une structure différente, avec une case d’entrée à évaluer." },
    { family: "constitutive_negative", sourceKey: "file-a", move: "c2c1", mechanism: "occupy", rationale: "La tour reste sur la colonne c ; la décision n’occupe pas la colonne candidate.", counterevidence: "Condition d’accès à la colonne cible absente." },
    { family: "affordance_negative", sourceKey: "file-a", move: "f1a1", mechanism: "occupy", rationale: "Une tour se déplace vers une colonne sans qu’entrée ou cible utile soit démontrée.", counterevidence: "Aucune affordance documentée." },
    { family: "relevance_negative", sourceKey: "file-a", move: "b5b6", mechanism: "occupy", rationale: "La colonne existe, mais b6 traite un autre plan ; open_file ne justifie pas ce choix." },
    { family: "centrality_negative", sourceKey: "file-c", move: "a1d1", mechanism: "occupy", rationale: "La tour rejoint d1, mais la présence des dames et menaces directes peut rendre la tactique plus centrale.", confounder: "tactique lourde sur la première rangée" },
    { family: "neighbor_negative", sourceKey: "worst-a", move: "f1e1", mechanism: "occupy", rationale: "Le déplacement de tour peut relever de l’activité ou de la défense, pas nécessairement d’une colonne ouverte.", counterevidence: "Concept voisin rook_activity." },
    { family: "tactical_override", sourceKey: "file-c", move: "a1d1", mechanism: "occupy", rationale: "La dame noire en b2 oblige à contrôler les suites forcing avant toute leçon de colonne.", confounder: "menace tactique immédiate" },
    { family: "human_plausible_misconception", sourceKey: "file-b", move: "a1d1", mechanism: "occupy", rationale: "Une tour sur une colonne sans pion n’est utile que si l’entrée, la cible ou la contestation sont réelles.", counterevidence: "Shortcut rook + pawnless_file explicitement testé." },
    { family: "engine_disagreement", sourceKey: "file-b", move: "a1d1", mechanism: "contest", rationale: "La différence entre activité générique et exploitation de la colonne n’est pas stabilisée par un classement moteur seul." },
  ],
  improve_worst_piece: [
    { family: "natural_positive", sourceKey: "worst-a", move: "e2c3", mechanism: "activate_minor", target: "b5", rationale: "Le cavalier e2 obtient une route et des cases utiles ; l’hypothèse porte sur son rôle, pas sa mobilité brute." },
    { family: "natural_positive", sourceKey: "worst-b", move: "a3c4", mechanism: "maneuver", target: "d6", rationale: "Deuxième structure : le cavalier de bord rejoint un circuit central dont le rôle doit être confirmé." },
    { family: "constitutive_negative", sourceKey: "worst-a", move: "e2f4", mechanism: "activate_minor", rationale: "Une destination active en apparence ne suffit pas sans rôle sûr et durable.", counterevidence: "Destination et coût non établis." },
    { family: "affordance_negative", sourceKey: "worst-a", move: "e2g3", mechanism: "activate_minor", rationale: "Le redéploiement change la mobilité mais aucune contribution finale n’est encore démontrée.", counterevidence: "Rôle final absent." },
    { family: "relevance_negative", sourceKey: "worst-a", move: "e5d6", mechanism: "activate_minor", rationale: "La pièce la moins active peut exister, mais Bd6 répond à une autre décision." },
    { family: "centrality_negative", sourceKey: "worst-c", move: "a3c4", mechanism: "maneuver", rationale: "Nc4 améliore le cavalier, mais la structure fermée peut rendre une rupture de pion plus centrale.", confounder: "pawn_break concurrent" },
    { family: "neighbor_negative", sourceKey: "outpost-a", move: "c3d5", mechanism: "activate_minor", rationale: "Nd5 est mieux expliqué par un avant-poste effectif et sa cible que par la méta-idée de pire pièce.", counterevidence: "Concept voisin outpost plus spécifique." },
    { family: "tactical_override", sourceKey: "worst-a", move: "e5c7", mechanism: "activate_minor", rationale: "Un déplacement forcing/capture potentiel ne doit pas être rebaptisé amélioration de pièce.", confounder: "tactique forcing" },
    { family: "human_plausible_misconception", sourceKey: "worst-b", move: "a3c4", mechanism: "activate_minor", rationale: "Faible mobilité initiale n’est pas suffisante : rôle défensif, route et destination doivent être comparés." },
    { family: "engine_disagreement", sourceKey: "worst-c", move: "a3c4", mechanism: "maneuver", rationale: "Plusieurs plans lents peuvent être proches objectivement ; le nom du concept exige une comparaison humaine." },
  ],
  opposition: [
    { family: "natural_positive", sourceKey: "opposition-a", move: "e6d5", mechanism: "direct", target: "d4", rationale: "Kd5 crée une relation de rois liée aux cases clés et aux pions, avec le trait explicitement conservé." },
    { family: "natural_positive", sourceKey: "opposition-b", move: "g2h2", line: ["g2h2", "h4g5", "h2g3"], mechanism: "reserve_tempo", target: "g3", rationale: "Deuxième famille : Kh2 réserve le bon tempo puis reprend l’accès aux cases clés après ...Kg5." },
    { family: "constitutive_negative", sourceKey: "opposition-a", move: "e6f5", mechanism: "direct", rationale: "Kf5 conserve un roi actif sans établir la géométrie d’opposition recherchée.", counterevidence: "La géométrie constitutive manque." },
    { family: "affordance_negative", sourceKey: "opposition-b", move: "g2h2", mechanism: "reserve_tempo", rationale: "La géométrie seule ne prouve pas que l’opposition gagne une case clé avec plusieurs tempi de pions.", counterevidence: "Spare pawn moves et débordement restent possibles." },
    { family: "relevance_negative", sourceKey: "opposition-a", move: "a5a4", mechanism: "direct", rationale: "Une géométrie de rois peut exister, mais le coup de pion suit une autre logique de tempo." },
    { family: "centrality_negative", sourceKey: "opposition-c", move: "e4f4", mechanism: "direct", rationale: "L’opposition peut contribuer, mais la course du pion f et les cases clés peuvent mieux expliquer le résultat." },
    { family: "neighbor_negative", sourceKey: "opposition-c", move: "e4f4", mechanism: "direct", rationale: "Le coup peut relever surtout de king_activity ou de la règle du carré.", counterevidence: "Concept voisin plus central à départager." },
    { family: "tactical_override", sourceKey: "opposition-a", move: "f7f6", mechanism: "reserve_tempo", rationale: "Une prise ou course de pions concrète peut dominer la géométrie abstraite.", confounder: "course de pions forcing" },
    { family: "human_plausible_misconception", sourceKey: "opposition-b", move: "g2h2", mechanism: "direct", rationale: "RoIs face à face et finale de pions ne suffisent pas sans trait, tempi et conséquence théorique." },
    { family: "engine_disagreement", sourceKey: "opposition-a", move: "e6e5", mechanism: "direct", rationale: "Deux routes de roi proches objectivement imposent une validation théorique plutôt qu’un label par rang MultiPV." },
  ],
  restrict_counterplay: [
    { family: "natural_positive", sourceKey: "restrict-a", move: "b2b3", line: ["b2b3", "d8d5", "c4a3"], mechanism: "remove_resource", target: "...Rd5", rationale: "b3 répond à une ressource adverse identifiée et la suite permet de vérifier si la restriction reste stable." },
    { family: "natural_positive", sourceKey: "restrict-c", move: "b2b4", line: ["b2b4", "f8e8", "f1d1"], mechanism: "stop_break", target: "...c5-c4", rationale: "Deuxième famille : b4 modifie la viabilité du contre-jeu à l’aile dame avant de poursuivre le plan blanc." },
    { family: "constitutive_negative", sourceKey: "restrict-a", move: "a4a3", mechanism: "remove_resource", rationale: "Ra3 peut être utile, mais aucune ressource adverse précise n’est retirée par définition.", counterevidence: "opponent_resource_before absent de l’annotation." },
    { family: "affordance_negative", sourceKey: "restrict-b", move: "h5h4", mechanism: "stop_break", rationale: "Le coup limite peut-être une case, mais le gain de temps pour un plan propre n’est pas établi.", counterevidence: "Bénéfice après restriction inconnu." },
    { family: "relevance_negative", sourceKey: "restrict-b", move: "d4c5", mechanism: "stop_break", rationale: "Le coup traite la structure directement ; la restriction du contre-jeu n’est pas nécessairement sa raison principale." },
    { family: "centrality_negative", sourceKey: "restrict-c", move: "b2b4", mechanism: "stop_break", rationale: "b4 peut restreindre une ressource, mais créer sa propre rupture peut être la leçon dominante.", confounder: "pawn_break concurrent" },
    { family: "neighbor_negative", sourceKey: "exchange-a", move: "g1f2", mechanism: "remove_resource", rationale: "Capturer l’attaquant est une défense concrète ; restrict_counterplay serait trop large.", counterevidence: "Concept voisin exchange_attacker plus précis." },
    { family: "tactical_override", sourceKey: "restrict-a", move: "a4a5", mechanism: "cut_piece_or_king", rationale: "La branche chute objectivement dans le corpus ; la réfutation concrète domine toute leçon prophylactique.", confounder: "réfutation tactique documentée dans les candidats source" },
    { family: "human_plausible_misconception", sourceKey: "restrict-b", move: "h5h6", mechanism: "stop_break", rationale: "Un coup calme de pion n’est pas automatiquement prophylactique ; la ressource ...c4 doit être viable et importante." },
    { family: "engine_disagreement", sourceKey: "restrict-b", move: "h5h4", mechanism: "stop_break", rationale: "h6 et h4 sont proches dans les candidats source : leur mécanisme humain ne découle pas du classement moteur." },
  ],
  exchange_attacker: [
    { family: "natural_positive", sourceKey: "exchange-a", move: "g1f2", line: ["g1f2", "d7f5", "f2g1"], mechanism: "forced_exchange", target: "bishop-f2", rationale: "Le roi élimine la pièce qui porte l’échec ; la suite vérifie l’état défensif après disparition de l’attaquant." },
    { family: "natural_positive", sourceKey: "exchange-b", move: "c2c3", line: ["c2c3", "c8c3", "c1c3"], mechanism: "forced_exchange", target: "queen-c3", rationale: "Deuxième structure : Qxc3 force l’échange de la dame infiltrée et permet de comparer la baisse réelle du danger." },
    { family: "constitutive_negative", sourceKey: "exchange-c", move: "g4f5", mechanism: "trade_defender_for_attacker", rationale: "gxf5 échange un pion ; aucune pièce portant une attaque n’est identifiée.", counterevidence: "Attaquant essentiel absent." },
    { family: "affordance_negative", sourceKey: "exchange-c", move: "d1e1", mechanism: "offer_exchange", rationale: "La tour change de case sans échange disponible ni baisse démontrée de l’attaque.", counterevidence: "Affordance d’échange absente." },
    { family: "relevance_negative", sourceKey: "exchange-c", move: "d3e3", mechanism: "offer_exchange", rationale: "La décision peut améliorer une tour, mais ne retire aucun attaquant." },
    { family: "centrality_negative", sourceKey: "exchange-b", move: "c2c3", line: ["c2c3", "c8c3", "c1c3"], mechanism: "forced_exchange", rationale: "La dame attaquante disparaît, mais la séquence forcée de sortie d’échec peut être mieux enseignée comme ressource tactique.", confounder: "tactique défensive forcing" },
    { family: "neighbor_negative", sourceKey: "exchange-b", move: "c2c3", mechanism: "forced_exchange", rationale: "Le mécanisme peut relever de simplification_to_hold lorsque la liquidation, plus que l’attaquant, décide du résultat.", counterevidence: "Concept voisin à départager." },
    { family: "tactical_override", sourceKey: "exchange-d", move: "a4b2", mechanism: "forced_exchange", rationale: "Nxb2 capture la dame : le gain matériel immédiat domine entièrement l’idée d’échanger un attaquant.", confounder: "capture tactique d’une dame" },
    { family: "human_plausible_misconception", sourceKey: "exchange-c", move: "g4f5", mechanism: "trade_defender_for_attacker", rationale: "Le simple fait qu’une capture réduise le matériel ne prouve pas que l’attaquant principal est échangé." },
    { family: "engine_disagreement", sourceKey: "exchange-b", move: "c2c3", line: ["c2c3", "c8c3", "c1c3"], mechanism: "forced_exchange", rationale: "Le résultat concret est traçable, mais la centralité pédagogique entre échange de l’attaquant et liquidation salvatrice reste à adjuger." },
  ],
};

export const DEVELOPMENT_REFERENCE_BANK: readonly DevelopmentReference[] = Object.entries(CASES)
  .flatMap(([conceptId, cases]) => cases.map((seed, index) => reference(conceptId as PilotConceptId, index, seed)));

/** This module validates only source integrity and legality. It deliberately
 * does not call the current Pattern Engine, avoiding validation by the rules
 * that originally surfaced part of the source corpus. */
export function assertDevelopmentReferenceIntegrity(references = DEVELOPMENT_REFERENCE_BANK): void {
  const ids = new Set<string>();
  for (const sample of references) {
    if (ids.has(sample.id)) throw new Error(`Duplicate development reference id: ${sample.id}`);
    ids.add(sample.id);
    const chess = new Chess(sample.fen);
    const line = sample.line_uci ?? (sample.move_uci ? [sample.move_uci] : []);
    for (const uci of line) {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
      if (!move) throw new Error(`Illegal move ${uci} in ${sample.id}`);
    }
  }
}
