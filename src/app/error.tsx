"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="fatal-error">
      <span className="brand-mark" aria-hidden="true">♞</span>
      <p className="eyebrow"><span /> ChessPath</p>
      <h1>La position nous résiste.</h1>
      <p>Une erreur inattendue a interrompu l’application. Tes données Chess.com n’ont pas été modifiées.</p>
      <button type="button" className="primary-button" onClick={reset}>Réessayer</button>
    </main>
  );
}
