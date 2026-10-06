'use client'

// Dernier filet de sécurité (erreur dans le layout racine) : HTML autonome.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafafa',
          margin: 0,
        }}
      >
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 20, color: '#18181b' }}>B-Stock est momentanément indisponible</h1>
          <p style={{ color: '#71717a', fontSize: 14 }}>Réessayez dans quelques instants.</p>
          <button
            onClick={reset}
            style={{
              marginTop: 12,
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: '#18181b',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  )
}
