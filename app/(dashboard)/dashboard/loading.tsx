import { PageSkeleton } from '@/components/states'

// Affiché instantanément pendant le rendu serveur d'une page du dashboard
// (avant : écran figé sans retour visuel, surtout en 3G).
export default function DashboardLoading() {
  return <PageSkeleton />
}
