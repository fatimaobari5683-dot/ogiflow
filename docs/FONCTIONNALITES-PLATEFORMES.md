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

## 12. Double authentification (MFA/TOTP)

**Inspiré de** : la double authentification par application (Google
Authenticator, Authy) proposée par toutes les grandes plateformes pour les
comptes à enjeu financier.

**Avant** : `User.mfaEnabled`/`mfaSecret` existaient déjà en base et
`login()` savait déjà bifurquer dessus, mais `verifyMfaCode` était un stub
qui levait systématiquement une erreur — la fonctionnalité était
"branchée" en façade mais totalement inopérante, sans aucun flux
d'activation nulle part.

**Maintenant** : activation en deux temps (génération du secret + QR code,
puis confirmation par un vrai code à 6 chiffres avant que le compte ne soit
verrouillé derrière), connexion qui exige le code une fois activée,
désactivation protégée par re-saisie du mot de passe. Le changement de mot
de passe (`changePasswordSchema`, jusque-là orphelin) a été implémenté au
même moment et révoque automatiquement les autres sessions actives.

**Code** : `src/modules/auth/auth.service.ts` (`generateMfaSecret`,
`confirmMfaEnrollment`, `disableMfa`, `changePassword`), librairie `otplib`,
`/api/v1/auth/mfa/*`, `/api/v1/auth/change-password`, page `/account`
(`src/components/account/MfaSettings.tsx`)

---

## 13. Programme de parrainage livreur

**Inspiré de** : le parrainage chauffeur d'Uber/Grab — un livreur actif
parraine un nouveau livreur, les deux touchent une prime une fois que le
filleul a fait ses preuves.

**Pourquoi limité aux livreurs** (et pas aux clients, contrairement à un
parrainage classique type Uber Eats/DoorDash) : LogiFlow n'a pas de
compte client — les clients sont créés par les fournisseurs à la commande,
sans inscription ni connexion. Un programme de parrainage client aurait
d'abord nécessité de construire tout un système de compte/connexion client,
hors périmètre de cette itération. Les livreurs, eux, ont déjà inscription,
compte et portefeuille (`walletBalance`) — le parrainage s'y greffe
proprement sans rien inventer.

**Maintenant** : chaque livreur reçoit un code personnel à l'inscription
(partageable en un clic depuis `/referrals`, ou via un lien
`/register/driver?ref=CODE` qui pré-remplit le champ). Un nouveau livreur
peut saisir le code d'un parrain à son inscription. Dès que le filleul
totalise 15 livraisons réussies, le parrain touche 300 MAD et le filleul
150 MAD, versés automatiquement (verrouillé par `referralRewardedAt` :
la prime n'est jamais versée deux fois, même si l'événement est rejoué).

**Code** : `Driver.referralCode`/`referredById`/`referralRewardedAt`,
`src/modules/drivers/referrals.service.ts`,
`src/modules/drivers/referrals.events.ts` (déclenché sur `ORDER_DELIVERED`,
comme l'encaissement COD), page `/(driver)/referrals`

---

## 14. Multi-arrêts (un livreur porte plusieurs commandes à la fois)

**Inspiré de** : le groupage de commandes (batching) chez Uber Eats/Glovo —
un livreur en tournée peut se voir proposer un arrêt supplémentaire proche
de son trajet plutôt que de rester exclu du dispatch tant qu'il n'a pas
terminé sa course en cours.

**Avant** : un livreur `BUSY` (une livraison assignée) disparaissait
totalement du pool de candidats — un seul arrêt à la fois, quelle que soit
sa proximité avec une nouvelle commande.

**Maintenant** : un livreur `BUSY` reste candidat (dispatch, proposition
manuelle, offre) tant qu'il porte moins de 3 livraisons actives
(`MAX_CONCURRENT_DELIVERIES`). L'app livreur (`/missions`) ordonne ses
arrêts par plus proche voisin successif depuis sa position actuelle
(heuristique gloutonne, pas un solveur TSP complet — inutile sur 2-3
arrêts) et les numérote ("Arrêt 1/2", "Arrêt 2/2"...). Le retour à
`AVAILABLE` (`releaseDriverIfIdle`) était déjà conçu pour compter les
livraisons restantes plutôt qu'un simple booléen — aucune modification n'a
été nécessaire là, seuls les trois garde-fous "AVAILABLE uniquement"
(dispatch, assignation directe, offre) ont été relâchés.

**Code** : `MAX_CONCURRENT_DELIVERIES` (`dispatch.service.ts`),
`sequenceByNearestNeighbor` (`src/shared/utils/geo.ts`), `getMyMissions`
(`deliveries.service.ts`)

---

## 15. Preuve de livraison (POD) réelle — photo et signature

**Inspiré de** : la capture obligatoire d'une photo ou signature à la
livraison chez DHL/Chronopost/Amazon Logistics — la preuve doit venir du
terminal du livreur, pas d'un champ texte qu'il remplit lui-même.

**Avant** : "Photo" et "Signature" étaient deux étiquettes de bouton parmi
d'autres, mais soumettaient toutes exactement le même champ texte libre —
aucune caméra, aucun pad de signature, aucun fichier réel nulle part dans
le code. `Delivery.proofData` stockait n'importe quel JSON, y compris une
"photo" qui n'avait jamais existé.

**Maintenant** : une vraie photo est prise via l'appareil (`<input
type="file" accept="image/*" capture="environment">`, ouvre directement la
caméra sur mobile) ; une vraie signature est dessinée à la main sur un
canvas (pointer events, unifie souris/tactile) puis convertie en PNG. Les
deux sont téléversés en `multipart/form-data` et stockés via la même
abstraction que les documents KYC (`DocumentStorage`) — jamais l'image
elle-même en base, seulement une clé de stockage. Un agent interne, le
fournisseur propriétaire ou le livreur assigné peut ensuite consulter la
preuve via une route authentifiée dédiée ; la fiche commande admin
l'affiche directement.

**Code** : `SignaturePad` (`src/components/driver/SignaturePad.tsx`),
`recordDeliveryAttempt`/`getDeliveryProofFile` (`deliveries.service.ts`),
`/api/v1/deliveries/orders/[orderId]/attempts` (désormais multipart),
`/api/v1/deliveries/orders/[orderId]/proof` (nouvelle route de lecture)

---

## 16. Import de commandes en masse (CSV)

**Inspiré de** : l'import CSV de commandes/produits proposé par la plupart
des plateformes e-commerce/logistique pour les fournisseurs à volume — évite
de ressaisir une à une des dizaines de commandes reçues par ailleurs (email,
téléphone, autre système).

**Maintenant** : un fournisseur dépose un fichier CSV (un modèle
téléchargeable est généré avec un vrai SKU de son catalogue) ; chaque ligne
= une commande à un seul article, réutilisant exactement
`createOrderForSupplier` — même relecture serveur du prix catalogue (jamais
un prix venant du fichier, qui n'en contient d'ailleurs pas), même
vérification de conformité documentaire, même application de code promo. Une
ligne invalide (SKU inconnu, téléphone mal formé...) échoue seule et
n'interrompt jamais les suivantes : le rapport final liste chaque ligne avec
son numéro, succès ou raison de l'échec, et un lien direct vers chaque
commande créée.

**Code** : `src/modules/orders/orders-import.service.ts` (parsing CSV via
`papaparse`, gère les champs entre guillemets/virgules internes — une
adresse contient presque toujours une virgule), `/api/v1/orders/import`,
page `/supplier/orders/import`

---

## 17. Facture et état de versement imprimables

**Inspiré de** : le même besoin que le bordereau de livraison (section 11)
mais pour la comptabilité — une facture de vente que le client peut
recevoir, un relevé de versement que le fournisseur peut archiver.

**Maintenant** : deux documents, même gabarit visuel que le bordereau
(page dédiée hors barres latérales, `window.print()` du navigateur — aucune
librairie PDF serveur). La **facture** (`/orders/:id/invoice`) est le
document du fournisseur (vendeur) au client : articles, quantités, prix
unitaires relus du catalogue, sous-total, frais de livraison, réduction,
total — jamais la commission, qui ne regarde pas le client. L'**état de
versement** (`/settlements/:id/statement`) est le document inverse, de
LogiFlow au fournisseur : le détail commande par commande du versement
(numéro, client, montant, commission, net), pour qu'un fournisseur puisse
justifier ce qui lui a été payé.

**Code** : `src/components/orders/OrderInvoice.tsx`,
`src/components/settlements/SettlementStatement.tsx` — `getSettlementDetail`
élargi pour inclure le détail par commande (une transaction
`SUPPLIER_PAYOUT` par commande couverte, déjà créée par `generateSettlement`)
sans requête supplémentaire

---

## 18. Webhooks sortants (notifications fournisseur)

**Inspiré de** : le mécanisme de webhooks de Shopify/Stripe — un fournisseur
branche son propre système (ERP, outil de suivi de commandes) et reçoit un
appel HTTP à chaque changement de statut pertinent, sans avoir à interroger
l'API LogiFlow en boucle.

**Maintenant** : un fournisseur configure une URL depuis `/supplier/webhooks`
; LogiFlow génère un secret de signature (affiché une seule fois généré,
jamais régénéré silencieusement pour ne pas casser une intégration en
place). Chaque commande confirmée, assignée, en livraison, livrée,
retournée ou annulée déclenche un `POST` signé (`X-LogiFlow-Signature:
sha256=<HMAC>`, calculé sur le corps brut — le fournisseur peut vérifier
l'authenticité de son côté). Un échec relance automatiquement deux fois
(délais courts, pas de file différée — ce projet n'a pas de scheduler), puis
reste rejouable manuellement depuis le journal des livraisons.

**Sécurité** : protection SSRF minimale — hôtes privés/locaux et HTTP
(non-HTTPS) bloqués en production uniquement (autorisés en dev/test, sinon
impossible à vérifier contre un serveur de test local). Explicitement pas
exhaustif (pas de protection contre le DNS rebinding) — honnête sur cette
limite comme les autres garde-fous "V1" du projet.

**Code** : `src/modules/webhooks/webhooks.service.ts`
(`setSupplierWebhook`, `sendWebhook`, `retryWebhookDelivery`),
`src/modules/webhooks/webhooks.events.ts` (branché sur les événements
domaine déjà émis par `order-state-machine.ts`), page `/supplier/webhooks`.
Vérifié avec un vrai serveur HTTP local (pas un mock de `fetch`) : signature
HMAC recalculée et comparée côté récepteur, échec+réessai+rejeu manuel
testés en conditions réelles.

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
- **Bordereau imprimable sur 2 pages au lieu d'une** (signalé par
  l'utilisateur via le PDF généré) — `min-h-screen` n'était pas neutralisé
  en media `print`, ajoutant une page blanche. Corrigé et vérifié en
  générant un vrai PDF (comptage des pages dans les octets bruts).
- **Race condition sur la numérotation des transactions financières** —
  `nextTransactionReferences` calculait la prochaine référence via
  `COUNT(*) + 1`, non atomique. Invisible tant qu'un seul processus créait
  des `Transaction` par commande ; exposée en ajoutant un second handler
  concurrent sur le même événement `ORDER_DELIVERED` (la prime de
  parrainage, versée en parallèle de l'encaissement COD) — les deux
  handlers lisaient le même compteur de départ et entraient en collision
  sur l'unicité de `reference`. Corrigée en remplaçant le compteur par une
  vraie séquence Postgres (`nextval`, atomique par construction), qui
  profite aussi à tous les autres appelants (settlements, indemnités).

## Ce qui n'a délibérément pas été fait

- **Routage multi-arrêts sur réseau routier réel** — la section 14
  implémente la capacité multi-livraisons et un ordre de tournée par plus
  proche voisin (distance à vol d'oiseau) ; un vrai solveur d'itinéraire
  (temps de trajet réel, sens de circulation) nécessiterait un service de
  cartographie externe, hors périmètre ici.
- **Programme de parrainage client** — LogiFlow n'a pas de compte client
  (voir section 13) ; seul le parrainage livreur a été construit.
- **Paiement en ligne intégré (wallet, carte bancaire)** — nécessite une
  intégration avec un prestataire de paiement réel, hors périmètre d'une
  session de développement sans compte fournisseur externe.
- **SMS/Email/Push réels** — seul un provider de secours (log structuré)
  est branché ; aucun fournisseur (Twilio, etc.) n'est intégré.
- **Stockage documents sur S3/cloud** — implémentation disque local
  uniquement pour l'instant (`LocalDiskDocumentStorage`).
