import type { Metadata } from 'next'
import { LegalPage, Bullet } from '@/components/marketing/legal-page'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — B-Stock',
  description: 'Comment B-Stock collecte, utilise et protège vos données personnelles.',
}

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      subtitle="Comment nous collectons, utilisons et protégeons vos données."
      updated="9 juin 2026"
    >
      <h2>1. Introduction</h2>
      <p>
        B-Stock accorde une grande importance à la protection des données. La présente politique
        explique quelles données sont traitées dans le cadre du Service et quels sont vos droits.
      </p>

      <h2>2. Données collectées</h2>
      <ul>
        <Bullet><strong>Données de compte :</strong> nom, e-mail, téléphone, entreprise, rôle.</Bullet>
        <Bullet><strong>Données d&apos;exploitation :</strong> produits, stocks, ventes, clients, livraisons, factures que vous saisissez.</Bullet>
        <Bullet><strong>Données de paiement :</strong> traitées par notre prestataire GeniusPay ; nous ne stockons pas vos coordonnées bancaires complètes.</Bullet>
        <Bullet><strong>Données techniques :</strong> journaux de connexion, adresse IP, type d&apos;appareil, à des fins de sécurité.</Bullet>
      </ul>

      <h2>3. Finalités</h2>
      <p>Nous utilisons ces données pour :</p>
      <ul>
        <Bullet>fournir, maintenir et améliorer le Service ;</Bullet>
        <Bullet>gérer votre compte, votre abonnement et la facturation ;</Bullet>
        <Bullet>assurer la sécurité et prévenir la fraude ;</Bullet>
        <Bullet>vous apporter assistance et communications de service.</Bullet>
      </ul>

      <h2>4. Partage des données</h2>
      <p>Vos données ne sont jamais vendues. Elles peuvent être partagées avec :</p>
      <ul>
        <Bullet><strong>GeniusPay</strong> — traitement des paiements d&apos;abonnement ;</Bullet>
        <Bullet>nos <strong>hébergeurs et fournisseurs d&apos;infrastructure</strong> (base de données, hébergement), strictement pour faire fonctionner le Service ;</Bullet>
        <Bullet>les <strong>autorités</strong>, si la loi l&apos;exige.</Bullet>
      </ul>

      <h2>5. Multi-tenant et cloisonnement</h2>
      <p>
        Le Service est multi-entreprises : les données de chaque entreprise sont logiquement isolées
        et accessibles uniquement aux utilisateurs autorisés de cette entreprise.
      </p>

      <h2>6. Conservation</h2>
      <p>
        Vos données sont conservées tant que votre compte est actif, puis pendant la durée nécessaire
        au respect de nos obligations légales (comptables, fiscales). Vous pouvez demander la
        suppression de votre compte.
      </p>

      <h2>7. Sécurité</h2>
      <p>
        Nous mettons en œuvre des mesures techniques et organisationnelles : chiffrement des
        communications (HTTPS), mots de passe hachés, contrôle d&apos;accès par rôle, journalisation des
        actions sensibles.
      </p>

      <h2>8. Cookies</h2>
      <p>
        Nous utilisons des cookies strictement nécessaires (session, authentification). Aucun cookie
        publicitaire tiers n&apos;est utilisé pour faire fonctionner le Service.
      </p>

      <h2>9. Vos droits</h2>
      <p>Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;export et de suppression de vos données. Pour les exercer :</p>
      <ul>
        <Bullet>depuis le Service, dans les paramètres de votre compte et de votre entreprise ;</Bullet>
        <Bullet>ou en nous contactant via la page <a href="/contact">Contact</a>.</Bullet>
      </ul>

      <h2>10. Modifications</h2>
      <p>
        Cette politique peut évoluer. Toute modification importante vous sera communiquée et la date
        de mise à jour ci-dessus sera actualisée.
      </p>
    </LegalPage>
  )
}
