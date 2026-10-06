import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

/**
 * Erreur métier attendue : son message est sûr à afficher à l'utilisateur.
 * Toute autre erreur est journalisée et masquée derrière un message générique.
 */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (what = 'Ressource') => new AppError(404, `${what} introuvable`, 'NOT_FOUND')
export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, message, 'BAD_REQUEST', details)
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, message, code)
export const forbidden = (message = 'Accès refusé') => new AppError(403, message, 'FORBIDDEN')

/**
 * Convertit n'importe quelle erreur levée dans une route en réponse JSON.
 * - AppError        → son statut et son message
 * - ZodError        → 400 + détails de validation
 * - 23505 (unique)  → 409
 * - 23514 (check)   → 409 (ex. stock insuffisant)
 * - 23503 (FK)      → 400 (référence invalide)
 * - 22P02 (format)  → 400 (identifiant invalide)
 * - autre           → 500 générique (détail uniquement dans les logs serveur)
 */
export function handleRouteError(error: unknown, context = 'API'): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) },
      { status: error.status }
    )
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: 'Données invalides', code: 'VALIDATION_ERROR', details: error.flatten() },
      { status: 400 }
    )
  }

  const pgCode = (error as { code?: string })?.code
  if (pgCode === '23505') {
    return NextResponse.json(
      { error: 'Cet enregistrement existe déjà', code: 'DUPLICATE' },
      { status: 409 }
    )
  }
  if (pgCode === '23514') {
    return NextResponse.json(
      { error: 'Opération impossible : quantité ou montant invalide (stock insuffisant ?)', code: 'CONSTRAINT' },
      { status: 409 }
    )
  }
  if (pgCode === '23503') {
    return NextResponse.json(
      { error: 'Référence invalide (élément lié introuvable)', code: 'INVALID_REFERENCE' },
      { status: 400 }
    )
  }
  if (pgCode === '22P02') {
    return NextResponse.json({ error: 'Identifiant invalide', code: 'INVALID_ID' }, { status: 400 })
  }

  console.error(`[${context}]`, error)
  return NextResponse.json({ error: 'Erreur serveur', code: 'INTERNAL' }, { status: 500 })
}
