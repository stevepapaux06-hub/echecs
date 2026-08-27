export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className="brand" href="#top" aria-label="ChessPath, accueil">
      <span className="brand-mark" aria-hidden="true">♞</span>
      {compact ? null : <span>ChessPath</span>}
    </a>
  );
}
