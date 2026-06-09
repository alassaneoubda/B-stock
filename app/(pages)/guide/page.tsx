import type { Metadata } from 'next'
import { LegalPage, Bullet } from '@/components/marketing/legal-page'

export const metadata: Metadata = {
  title: "Guide d'utilisation — B-Stock",
  description: 'Prenez en main B-Stock étape par étape : configuration, ventes, stock, livraisons et rapports.',
}

export default function GuidePage() {
  return (
    <LegalPage
      title="Guide d'utilisation"
      subtitle="Prenez en main B-Stock pas à pas, de la configuration aux rapports."
    >
      <h2>1. Premiers pas</h2>
      <p>
        Après la création de votre compte, vous bénéficiez d&apos;une période d&apos;essai. Connectez-vous
        et complétez les informations de votre entreprise pour démarrer.
      </p>
      <ul>
        <Bullet>Créez votre compte depuis « Créer un compte » sur la page d&apos;accueil.</Bullet>
        <Bullet>Renseignez le nom de votre entreprise et vos coordonnées.</Bullet>
        <Bullet>Accédez à votre tableau de bord pour une vue d&apos;ensemble (ventes, achats, créances, valeur du stock).</Bullet>
      </ul>

      <h2>2. Configurer l&apos;entreprise et les dépôts</h2>
      <p>Dans <strong>Paramètres</strong>, définissez les bases de votre activité :</p>
      <ul>
        <Bullet>informations de l&apos;entreprise (raison sociale, contact) ;</Bullet>
        <Bullet>dépôts : un dépôt principal est créé automatiquement ; ajoutez vos autres dépôts ;</Bullet>
        <Bullet>utilisateurs et rôles (gérant, caissier, magasinier) avec permissions adaptées.</Bullet>
      </ul>

      <h2>3. Produits et emballages consignés</h2>
      <p>
        B-Stock gère la double comptabilité <strong>produits pleins</strong> et{' '}
        <strong>emballages vides consignés</strong>.
      </p>
      <ul>
        <Bullet>Créez vos produits et leurs déclinaisons (formats, prix).</Bullet>
        <Bullet>Associez les emballages consignés et leurs équivalences.</Bullet>
        <Bullet>Suivez les quantités pleines et vides séparément, par dépôt.</Bullet>
      </ul>

      <h2>4. Approvisionnement et stock</h2>
      <ul>
        <Bullet>Enregistrez vos commandes fournisseurs depuis <strong>Approvisionnement</strong>.</Bullet>
        <Bullet>Réceptionnez les marchandises pour mettre à jour le stock automatiquement.</Bullet>
        <Bullet>Réalisez des <strong>inventaires</strong> et des <strong>transferts entre dépôts</strong>.</Bullet>
        <Bullet>Recevez des <strong>alertes</strong> avant rupture de stock.</Bullet>
      </ul>

      <h2>5. Ventes, clients et crédits</h2>
      <ul>
        <Bullet>Enregistrez une vente avec comptes produits et emballages séparés.</Bullet>
        <Bullet>Gérez les <strong>paiements partiels</strong> et les <strong>crédits clients</strong>.</Bullet>
        <Bullet>Encaissez les dettes et suivez les créances en cours.</Bullet>
        <Bullet>Éditez les <strong>factures</strong> automatiquement.</Bullet>
      </ul>

      <h2>6. Livraisons et tournées</h2>
      <ul>
        <Bullet>Planifiez les livraisons et le chargement des véhicules.</Bullet>
        <Bullet>Suivez les retours d&apos;emballages vides à la livraison.</Bullet>
        <Bullet>Affectez les agents commerciaux à leurs tournées.</Bullet>
      </ul>

      <h2>7. Caisse</h2>
      <ul>
        <Bullet>Ouvrez et clôturez des sessions de caisse.</Bullet>
        <Bullet>Validez les mouvements et rapprochez les encaissements.</Bullet>
      </ul>

      <h2>8. Rapports</h2>
      <p>
        Consultez vos tableaux de bord et rapports pour identifier vos meilleures ventes, vos dépôts
        les plus performants et l&apos;évolution de vos créances — pour des décisions rapides et fiables.
      </p>

      <h2>Besoin d&apos;aide ?</h2>
      <p>
        Consultez la page <a href="/support">Support</a> ou contactez-nous via la page{' '}
        <a href="/contact">Contact</a>. Notre équipe vous accompagne dans la prise en main.
      </p>
    </LegalPage>
  )
}
