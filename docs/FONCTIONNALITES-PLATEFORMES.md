# LogiFlow — Fonctionnalités inspirées des grandes plateformes internationales

Résumé de toutes les fonctionnalités ajoutées à LogiFlow en s'inspirant des
standards de Glovo, Uber/Uber Eats, DoorDash, Grab et Amazon Logistics.
Chaque fonctionnalité est testée (tests automatisés) et vérifiée en
conditions réelles (navigateur). Le détail chronologique complet, avec les
bugs trouvés en cours de route, est dans `docs/00-PROGRESSION.md` — ce
fichier-ci est la vue d'ensemble, organisée par fonctionnalité plutôt que
par date.

---

## 1. Itinéraire et heure d'arrivée estimée (ETA)

**Inspiré de** : le suivi de livraison en direct (Glovo, Uber Eats, Amazon).

**Avant** : le client ne recevait aucune notification quand son colis
partait en livraison, et ne voyait ni position du livreur ni heure
d'arrivée sur sa page de suivi.

**Maintenant** :
- SMS automatique dès que la commande passe "en cours de livraison", avec
  une heure d'arrivée estimée.
- Carte en direct sur la page de suivi public (`/track/:orderNumber`)
  montrant la position du livreur — jamais l'adresse exacte du client
  (numéro de commande devinable/énumérable, donc jamais de donnée
  sensible exposée par ce biais).

**Code** : `src/modules/tracking/tracking.service.ts`,
`src/components/tracking/CustomerTrackingMap.tsx`,
`src/modules/notifications/notifications.events.ts`

---

## 2. Avis clients post-livraison

**Inspiré de** : la notation du livreur après chaque course (Uber, Glovo,
DoorDash).

**Maintenant** : notation 1 à 5 étoiles + commentaire optionnel, accessible
depuis la page de suivi public une fois le colis livré. Un seul avis par
commande. La note moyenne du livreur est visible sur sa fiche admin —
purement informative, elle n'entre jamais dans le calcul de dispatch.

**Code** : modèle `DeliveryReview`, `src/modules/tracking/tracking.service.ts`
(`submitDeliveryReview`), `src/components/tracking/DeliveryReviewForm.tsx`

---

## 3. "Mes gains" — espace livreur

**Inspiré de** : l'onglet gains de l'app livreur Uber/Glovo, le plus
consulté de leur application.

**Maintenant** : solde à percevoir, totaux du jour/de la semaine/du mois,
livraisons du jour, historique des mouvements — en distinguant clairement
l'encaissement client (argent détenu, pas un gain) de la rémunération
réelle.

**Code** : `src/modules/payments/payments.service.ts`
(`getDriverEarningsSummary`, `listDriverTransactions`),
`src/app/(driver)/earnings/page.tsx`

---

## 4. Centre d'aide (tickets de support)

**Inspiré de** : le centre d'aide intégré à chaque grande plateforme.

**Maintenant** : livreurs, fournisseurs et opérateurs peuvent ouvrir un
ticket, échanger des messages, et un agent peut l'assigner et le résoudre.
Un ticket fermé se rouvre automatiquement si un nouveau message arrive.

**Code** : modèles `SupportTicket` / `SupportMessage`,
`src/modules/support/support.service.ts`,
`/dashboard/support`, `/support` (livreur/fournisseur)

---

## 5. Fiche client (CRM léger)

**Inspiré de** : la vue client à 360° des équipes support/ops sur ces
plateformes.

**Maintenant** : recherche par nom ou téléphone, historique de commandes,
adresses connues, total réellement dépensé (uniquement sur les commandes
livrées, pas sur toutes).

**Code** : `src/modules/customers/customers.service.ts`,
`/dashboard/customers`

---

## 6. Chat livreur ↔ client

**Inspiré de** : la messagerie in-app pendant la livraison (Glovo, Uber
Eats).

**Maintenant** : messagerie en direct entre le client (depuis la page de
suivi public, sans compte) et le livreur (depuis sa mission), disponible
tant qu'un livreur est assigné et que la commande n'est pas terminée.
Chaque message notifie l'autre partie (PUSH vers le livreur, SMS vers le
client).

**Code** : modèle `OrderMessage`,
`src/modules/messaging/order-chat.service.ts`,
`src/components/chat/OrderChatPanel.tsx`

---

## 7. Codes promo

**Inspiré de** : les codes de réduction universels sur toutes les grandes
plateformes de livraison.

**Maintenant** : pourcentage plafonné ou montant fixe, minimum de
commande, limite d'utilisation, expiration. La validation et la
consommation du code se font en une seule opération atomique pour éviter
qu'un code à usage limité soit dépensé plus de fois que prévu par deux
commandes créées au même instant.

**Code** : modèle `PromoCode`,
`src/modules/promotions/promotions.service.ts`, `/dashboard/promotions`

---

## 8. Niveaux de performance livreur (Bronze / Argent / Or / Platine)

**Inspiré de** : Uber Pro, les récompenses Grab — un livreur régulier et
bien noté est reconnu.

**Maintenant** : palier calculé à partir du volume de livraisons réussies
**et** de la note moyenne (jamais l'un sans l'autre, pour ne pas
récompenser un gros volume mal noté). Purement informatif — n'affecte
jamais le scoring de dispatch.

| Palier | Livraisons réussies | Note moyenne |
|---|---|---|
| 🥉 Bronze | — | par défaut |
| 🥈 Argent | ≥ 20 | ≥ 4.0 |
| 🥇 Or | ≥ 50 | ≥ 4.5 |
| 💎 Platine | ≥ 100 | ≥ 4.8 |

**Code** : `src/modules/drivers/drivers.service.ts` (`computeDriverTier`),
`src/components/drivers/DriverTierBadge.tsx`

---

## 9. Bouton SOS / alerte d'urgence livreur

**Inspiré de** : le bouton de sécurité Uber/Lyft/Grab.

**Maintenant** : depuis sa mission, un livreur peut déclencher une alerte
d'urgence (avec confirmation explicite pour éviter un déclenchement
accidentel). Elle apparaît en tête du Control Tower dans une bannière
rouge dédiée — nom du livreur, commande, lien d'appel direct — et n'est
**jamais** refermée automatiquement : seule une action humaine explicite
peut la résoudre.

**Code** : `ExceptionType.DRIVER_SOS`,
`src/modules/operations/exceptions.service.ts` (`triggerDriverSos`),
`src/components/driver/SosButton.tsx`

---

## 10. Indemnité livreur pour course blanche

**Inspiré de** : la compensation "no-show" chez Uber/DoorDash — un
déplacement effectué doit être payé, même si la livraison échoue pour une
raison hors du contrôle du livreur.

**Maintenant** : quand une commande est définitivement retournée après un
échec de livraison (client absent, adresse erronée, refus), le livreur
reçoit automatiquement 50 % des frais de livraison en compensation.

**Code** : `src/modules/payments/payments.service.ts`
(`compensateDriverForFailedAttempt`), déclenché par l'événement
`COMPENSATE_DRIVER_FAILED_ATTEMPT` sur la transition `RETURNED`
(`order-state-machine.ts`)

---

## 11. Bordereau de livraison imprimable

**Inspiré de** : l'étiquette d'expédition DHL/Chronopost/Colissimo/Amazon
Logistics — le document que le fournisseur imprime et colle sur le colis.

**Maintenant** : QR code (numéro de commande), expéditeur, destinataire,
adresse, nombre d'articles, et montant à encaisser bien visible si paiement
à la livraison. Accessible depuis la commande (admin, fournisseur
propriétaire, ou livreur assigné) via `🖨️ Bordereau`, sur une page dédiée
hors des barres latérales — rien à masquer à l'impression. Le QR code
encode `LOGIFLOW:<numéro>` (pas d'URL publique configurée dans ce projet).

**Code** : `src/components/orders/DeliveryLabel.tsx`,
`src/app/orders/[id]/label/page.tsx`, librairie `qrcode` (génération
serveur, aucun service externe)

---

## Bugs corrigés en cours de route (trouvés en vérifiant, pas en lisant le code)

- **Carte opérationnelle vide malgré des tuiles chargées** — style vectoriel
  remplacé par un style raster, plus robuste en environnement WebGL
  restreint.
- **Bug de dimensionnement du canvas MapLibre** — `ResizeObserver` ajouté,
  la taille du conteneur n'était pas stable à la construction.
- **Agent support incapable de se connecter au dashboard** — le layout
  n'autorisait pas le rôle `SUPPORT_AGENT`, alors même que ce rôle existait
  déjà dans le système de permissions.
- **Auto-résolution silencieuse d'une future alerte SOS** — `detectAndSyncExceptions`
  aurait refermé automatiquement n'importe quel type d'exception qu'il ne
  gère pas explicitement ; corrigé avant que le bouton SOS ne soit branché.
- **Race condition sur les codes promo à usage limité** — validée et
  corrigée avec un `updateMany` conditionné, testée sous appels concurrents.
- **`resetDatabase()` (utilitaire de tests) ne vidait pas les tables des
  quatre nouveaux modèles** (`delivery_reviews`, `order_messages`,
  `support_messages`, `promo_codes`) — la liste des tables à tronquer entre
  deux tests est tenue à jour manuellement, et personne ne l'avait mise à
  jour à chaque migration. Resté invisible tant qu'aucune donnée ne
  collisionnait sur une valeur unique ; exposé par les codes promo (code
  littéral fixe dans les tests). Corrigé.
- **Palier livreur : test invalide, pas le calcul lui-même** —
  `DeliveryReview.rating` est un entier en base ; un test qui y insérait une
  moyenne déjà calculée (4.5, 4.8) se la faisait tronquer silencieusement.
  Corrigé en construisant la moyenne à partir de plusieurs avis entiers.

## Ce qui n'a délibérément pas été fait

- **Optimisation de tournées multi-arrêts** — changement d'architecture trop
  lourd pour la valeur immédiate (LogiFlow assigne une livraison à la fois).
- **Programme de parrainage** — pas de demande explicite, aurait nécessité
  un système de crédits/promotions plus large que les codes promo actuels.
- **Paiement en ligne intégré (wallet, carte bancaire)** — nécessite une
  intégration avec un prestataire de paiement réel, hors périmètre d'une
  session de développement sans compte fournisseur externe.
