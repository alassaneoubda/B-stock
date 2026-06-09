import type { Metadata } from 'next'
import { LegalPage, Bullet } from '@/components/marketing/legal-page'

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation — B-Stock",
  description: "Conditions générales d'utilisation de la plateforme B-Stock.",
}

export default function CguPage() {
  return (
    <LegalPage
      title="Conditions Générales d'Utilisation"
      subtitle="Les règles qui encadrent l'utilisation de la plateforme B-Stock."
      updated="9 juin 2026"
    >
      <h2>1. Objet</h2>
      <p>
        Les présentes Conditions Générales d&apos;Utilisation (les « CGU ») définissent les modalités
        de mise à disposition et d&apos;utilisation de la plateforme <strong>B-Stock</strong> (le
        « Service »), solution de gestion de la distribution de boissons (stock, ventes, emballages
        consignés, clients, livraisons et facturation), éditée à destination des distributeurs en
        Côte d&apos;Ivoire et en Afrique de l&apos;Ouest.
      </p>

      <h2>2. Acceptation</h2>
      <p>
        La création d&apos;un compte et l&apos;utilisation du Service emportent acceptation pleine et
        entière des présentes CGU. Si vous utilisez le Service au nom d&apos;une entreprise, vous
        déclarez disposer du pouvoir de l&apos;engager.
      </p>

      <h2>3. Description du Service</h2>
      <p>B-Stock est un logiciel en mode SaaS accessible via navigateur. Il permet notamment de :</p>
      <ul>
        <Bullet>gérer les produits, les emballages consignés (pleins et vides) et le stock multi-dépôts ;</Bullet>
        <Bullet>enregistrer les ventes, les crédits clients et les encaissements ;</Bullet>
        <Bullet>planifier les livraisons, les tournées et les retours d&apos;emballages ;</Bullet>
        <Bullet>générer factures et rapports décisionnels.</Bullet>
      </ul>

      <h2>4. Compte et sécurité</h2>
      <p>
        Vous êtes responsable de l&apos;exactitude des informations fournies, de la confidentialité de
        vos identifiants et de toute activité réalisée depuis votre compte. Vous vous engagez à
        informer sans délai l&apos;éditeur de tout accès non autorisé.
      </p>

      <h2>5. Essai, abonnements et paiement</h2>
      <ul>
        <Bullet>Le Service est proposé avec une période d&apos;essai gratuite, sans engagement.</Bullet>
        <Bullet>À l&apos;issue de l&apos;essai, l&apos;accès complet nécessite un abonnement payant, facturé en francs CFA (XOF).</Bullet>
        <Bullet>Les paiements sont traités via notre prestataire de paiement (GeniusPay). Les montants et fonctionnalités de chaque formule sont indiqués sur la page Tarifs.</Bullet>
        <Bullet>Sauf disposition contraire, les sommes versées ne sont pas remboursables une fois la période entamée.</Bullet>
      </ul>

      <h2>6. Obligations de l&apos;utilisateur</h2>
      <p>Vous vous engagez à ne pas :</p>
      <ul>
        <Bullet>utiliser le Service à des fins illicites ou frauduleuses ;</Bullet>
        <Bullet>tenter d&apos;accéder aux données d&apos;autres entreprises ou de perturber le Service ;</Bullet>
        <Bullet>copier, revendre ou exploiter le Service sans autorisation.</Bullet>
      </ul>

      <h2>7. Disponibilité et maintenance</h2>
      <p>
        L&apos;éditeur s&apos;efforce d&apos;assurer une disponibilité optimale mais ne garantit pas une
        accessibilité continue. Des interruptions peuvent survenir pour maintenance, mises à jour ou
        cas de force majeure.
      </p>

      <h2>8. Données</h2>
      <p>
        Les données que vous saisissez restent votre propriété. Leur traitement est décrit dans notre{' '}
        <a href="/confidentialite">Politique de confidentialité</a>. Vous pouvez exporter vos données
        depuis le Service.
      </p>

      <h2>9. Propriété intellectuelle</h2>
      <p>
        Le Service, sa marque, son code et ses contenus sont protégés. Aucun droit de propriété
        intellectuelle n&apos;est transféré à l&apos;utilisateur en dehors du droit d&apos;usage concédé
        pendant la durée de l&apos;abonnement.
      </p>

      <h2>10. Responsabilité</h2>
      <p>
        Le Service est fourni « en l&apos;état ». L&apos;éditeur ne saurait être tenu responsable des
        pertes indirectes (perte d&apos;exploitation, de chiffre d&apos;affaires, de données dues à une
        mauvaise utilisation). Il vous appartient de sauvegarder et de vérifier les informations
        critiques.
      </p>

      <h2>11. Résiliation</h2>
      <p>
        Vous pouvez cesser d&apos;utiliser le Service à tout moment. L&apos;éditeur peut suspendre ou
        résilier un compte en cas de manquement aux présentes CGU ou de défaut de paiement.
      </p>

      <h2>12. Modification des CGU</h2>
      <p>
        Les présentes CGU peuvent être mises à jour. En cas de modification substantielle, vous en
        serez informé. La poursuite de l&apos;utilisation vaut acceptation de la version en vigueur.
      </p>

      <h2>13. Droit applicable</h2>
      <p>
        Les présentes CGU sont régies par le droit ivoirien. Tout litige relève, à défaut de
        résolution amiable, des juridictions compétentes d&apos;Abidjan.
      </p>

      <h2>14. Contact</h2>
      <p>
        Pour toute question relative aux présentes CGU, contactez-nous via la page{' '}
        <a href="/contact">Contact</a>.
      </p>
    </LegalPage>
  )
}
