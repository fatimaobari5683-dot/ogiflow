# LogiFlow — Suivi de construction

## 🐛 Correctif — page "Mes documents" trompeuse pour un envoi en attente (2026-08-23)

### Contexte

Signalement utilisateur : "la page documents n'est pas mise à jour".
Vérifié en direct plutôt que supposé : la page se met bel et bien à jour
sans rechargement manuel (`router.refresh()` fonctionne correctement, testé
côté admin ET côté livreur). Le vrai problème, trouvé en reproduisant le
scénario complet (upload d'un document de remplacement après un refus) :
une fois envoyé, le document apparaissait bien dans l'historique avec le
statut "En attente de revue" — mais le bandeau du haut affichait toujours
"Manquants : CIN", comme si l'envoi n'avait pas fonctionné.

### Cause

`computeEligibility.missingTypes` signifie "aucun document VERIFIED de ce
type" — correct pour l'éligibilité au dispatch (un document non vérifié ne
doit effectivement pas suffire). Mais les pages livreur/fournisseur
réutilisaient ce même mot "Manquants" pour l'affichage, sans distinguer
"jamais envoyé" de "envoyé, en attente de vérification" — deux situations
très différentes du point de vue de l'utilisateur.

### Correctif

Nouvelle fonction `classifyMissingTypes` (documents.service.ts) qui sépare
`missingTypes` en `trulyMissingTypes` (aucun document, ou le plus récent est
REJECTED) et `pendingReviewTypes` (le plus récent est UPLOADED, en attente).
Les deux pages affichent maintenant un bandeau bleu neutre "En attente de
vérification" séparé du bandeau orange d'alerte "Manquants/Expirés", et le
message d'en-tête s'adapte (pas de ton alarmant quand il ne reste plus
qu'une vérification à attendre).

### Vérifié

Playwright en direct : après réenvoi d'un CIN refusé, le bandeau passe de
"Manquants : CIN" (faux) à "En attente de vérification : CIN" (exact),
sans rechargement manuel. 4 nouveaux tests sur `classifyMissingTypes`.

## ✅ Chat livreur ↔ client + codes promo (2026-08-23)

### Contexte

Suite directe de la demande précédente ("copier les fonctionnalités des
grandes plateformes") — deux ajouts supplémentaires, choisis sans re-demander
cette fois (la réponse précédente de l'utilisateur — "exécutez les trois
options l'une après l'autre" — établissait clairement une préférence pour
l'exécution directe).

### 1. Chat livreur ↔ client pendant la livraison

Présent sur Glovo/Uber Eats, absent de LogiFlow. Nouveau modèle
`OrderMessage` (sender CUSTOMER/DRIVER), module `order-chat.service.ts`
réutilisant la même vérification de propriété IDOR que les transitions de
livraison (`assertDeliveryOwnership`, exportée depuis deliveries.service.ts
pour éviter toute logique de sécurité dupliquée). Composant partagé
`OrderChatPanel` sur la page de suivi public (client, sans compte) et la
mission livreur (authentifié) — n'existe que si un livreur est assigné, se
ferme une fois la commande DELIVERED/CANCELLED/RETURNED. Chaque message
déclenche une notification (PUSH vers le livreur, SMS vers le client).

### 2. Codes promo

Universel sur toutes les grandes plateformes de livraison. Nouveau modèle
`PromoCode` (pourcentage plafonné ou montant fixe, minimum de commande,
limite d'utilisation, expiration) + `Order.promoCodeId`/`discountAmount`.
`validateAndApplyDiscount` valide ET décompte l'usage en une seule opération
atomique (`updateMany` conditionné) pour éviter qu'un code à usage limité
soit dépensé plus de fois que prévu par deux commandes créées au même
instant — testé explicitement sous 3 appels concurrents. Intégré dans
`createOrder` (le rabais s'applique au sous-total, la commission se calcule
sur le total déjà réduit). Écran admin `/dashboard/promotions` (création,
activation/désactivation) ; champ "Code promo" ajouté au formulaire de
commande fournisseur ; réduction affichée sur les pages de détail commande
(fournisseur et admin).

### Vérifié

Playwright en direct, bout en bout : message client depuis la page de suivi
public → notification/réception côté mission livreur → réponse du livreur →
relecture côté client après rechargement. Commande créée avec `DEMO20`
(20%, plafond 50 MAD, minimum 100 MAD) sur un sous-total de 1200 MAD →
réduction de 50 MAD correctement plafonnée, commission calculée sur le total
déjà réduit (1170 MAD, pas 1220), compteur d'utilisation à jour dans l'écran
admin. 372/372 tests, aucune régression.

## ✅ Trois manques inspirés des grandes plateformes (2026-08-23)

### Contexte

Demande explicite de l'utilisateur : s'inspirer des grandes plateformes de
logistique/livraison pour compléter le développement. Plutôt que de deviner,
j'ai fait un état des lieux du code pour trouver des manques réels (pas des
idées génériques), puis j'ai proposé trois candidats concrets à l'utilisateur,
qui a demandé les trois.

### 1. "Mes gains" côté livreur

Aucune page ne montrait au livreur son solde ni son historique — pourtant
`Driver.walletBalance` et `Transaction` existaient déjà en base depuis la
toute première session. Ajouté : `getDriverEarningsSummary` /
`listDriverTransactions` (payments.service.ts) et `/earnings` — solde à
percevoir, totaux jour/semaine/mois, livraisons du jour, historique
distinguant clairement encaissement client (ce que le livreur détient, pas
un gain) et rémunération réelle.

### 2. Centre d'aide (tickets de support)

Le modèle `SupportTicket` existait dans le schéma, avec `Permission.SUPPORT_MANAGE`
et un rôle `SUPPORT_AGENT` déjà définis dans `permissions.ts` — mais strictement
aucun service ni UI ne les utilisait. Ajouté : `SupportMessage` (fil de
discussion), module `support` complet (créer/lister/répondre/assigner/changer
de statut), pages côté livreur, fournisseur et admin (`/dashboard/support`),
et `requireTicketAccess` (auth-context.ts) — agent avec SUPPORT_MANAGE, ou
auteur du ticket.

### 3. Fiche client (CRM léger)

Le dossier `src/modules/customers/` était vide. Ajouté : `listCustomers`
(recherche nom/téléphone) et `getCustomerDetail` (adresses connues,
historique de commandes, total dépensé — calculé uniquement sur les
commandes DELIVERED, pas sur toutes) + `/dashboard/customers`.

### 🐛 Bug trouvé pendant la vérification

Le layout `(dashboard)` n'autorisait que SUPER_ADMIN/LOGISTICS_MANAGER/
FINANCE_MANAGER (`requirePageUser([...])`) — un compte SUPPORT_AGENT, le rôle
même destiné à utiliser l'écran support, ne pouvait pas se connecter au
dashboard du tout. Corrigé en l'ajoutant à la liste des rôles autorisés.
Trouvé uniquement en essayant de me connecter avec le compte agent seedé
pour la vérification — invisible à la lecture du code support lui-même.

### Vérifié

Playwright en direct, bout en bout : livreur consulte ses gains (solde réel,
historique correctement étiqueté) → ouvre un ticket → l'agent support se
connecte (bug ci-dessus corrigé au passage), répond, résout le ticket →
fiche client admin affiche l'historique et le total dépensé corrects.
352/352 tests, aucune régression.

## ✅ Avis clients + itinéraire/ETA en cours de livraison (2026-08-23)

### Contexte

Demande explicite de l'utilisateur : ne pas oublier les avis des clients qui
reçoivent leurs colis, et les aviser de l'itinéraire de leur colis et du
temps imparti. Vérification du code existant : `getDomainEventsForTransition`
(order-state-machine.ts) ne déclenchait `NOTIFY_CUSTOMER` que sur DELIVERED,
CUSTOMER_ABSENT, WRONG_ADDRESS, RETURNED, CANCELLED — jamais sur
OUT_FOR_DELIVERY, le seul moment où un client attend concrètement son colis
"maintenant". Aucun modèle d'avis n'existait non plus.

### Ce qui a été construit

| Élément | Détail |
|---|---|
| `DeliveryReview` (schéma) | Note 1-5 + commentaire optionnel, un avis par commande (`orderId` unique), rattaché au livreur via `Delivery.driverId` |
| Notification OUT_FOR_DELIVERY | Ajoutée à la state machine ; le client reçoit désormais un SMS avec une heure d'arrivée estimée (`etaAt`), calculée à partir du même seuil SLA que le Control Tower (`SLA_MAX_MINUTES.OUT_FOR_DELIVERY`, 45 min — exporté pour être réutilisé plutôt que dupliqué) |
| `getPublicTracking` enrichi | Renvoie `eta` et `driverPosition` uniquement pendant OUT_FOR_DELIVERY (fenêtre d'exposition minimale) ; renvoie `review` s'il existe. **Ne renvoie jamais l'adresse de livraison** — le numéro de commande est devinable/énumérable, principe déjà établi par ce module et volontairement préservé |
| `CustomerTrackingMap.tsx` | Carte MapLibre (position du livreur uniquement, jamais la destination), réutilise le style raster CARTO déjà validé — extrait dans `src/lib/map-style.ts` partagé avec `DriverMap.tsx` du Control Tower |
| `DeliveryReviewForm.tsx` | Étoiles cliquables + commentaire, sur `/track/:orderNumber` une fois DELIVERED ; affiche l'avis déjà laissé si présent |
| `POST /api/v1/tracking/:orderNumber/review` | Public comme le reste du tracking — refuse si pas DELIVERED, refuse un second avis |
| Note moyenne livreur | Affichée sur la fiche livreur du dashboard (`getDriverPerformance`) — **purement informative, n'entre pas dans le scoring de dispatch**, même discipline que `zoneMatch`/`locationStale` cette session |

### 🐛 Bugs trouvés pendant la vérification

1. **Carte cliente entièrement transparente malgré des tuiles chargées avec
   succès (200, PNG valides)** — le marqueur était posé immédiatement à la
   construction plutôt qu'après l'événement `load` de MapLibre (contrairement
   à `DriverMap.tsx`, qui différait déjà cette étape). Corrigé en alignant le
   composant client sur ce même séquencement.
2. **Faux négatif de diagnostic** : tenter de vérifier le rendu via
   `gl.readPixels()` sur le contexte WebGL de MapLibre renvoyait des pixels à
   zéro même une fois le vrai bug corrigé — piège classique du
   `preserveDrawingBuffer` (le tampon est vidé après composition). Seule une
   vraie capture d'écran (`page.screenshot()`) donne un signal fiable.
3. **Race condition dans mon propre test** (pas dans le code produit) :
   créer deux commandes via `Promise.all` fait entrer en collision la
   génération séquentielle du numéro de commande (les deux appels lisent le
   même compteur de départ). Corrigé en créant les commandes l'une après
   l'autre — a aussi révélé, en passant, que `createOrderForSupplier` n'est
   pas sûr en cas d'appels concurrents (non corrigé : aucun appelant réel ne
   crée deux commandes en parallèle aujourd'hui).

### Vérifié

Playwright en direct : bannière ETA + carte de position affichées pendant
OUT_FOR_DELIVERY (vraies rues de Casablanca) ; formulaire d'avis (4 étoiles +
commentaire) soumis, confirmation affichée, persistant après rechargement ;
note moyenne "4.0 ★ (1 avis)" visible sur la fiche livreur admin.

## ✅ Référentiel de zones national — au-delà de Casablanca (2026-08-23)

### Contexte

Remarque directe de l'utilisateur : toute la donnée de démo (zones, positions
des livreurs) était concentrée sur une seule zone, "Centre-Ville Casablanca"
— peu crédible pour une plateforme logistique qui se veut nationale.
Vérification : `prisma/seed.ts` ne créait effectivement qu'une seule `Zone`
au total, réutilisée partout (les 3 livreurs de démo, l'adresse client).

### Ce qui a été construit

| Élément | Détail |
|---|---|
| 10 zones | Casablanca, Rabat, Kénitra, Marrakech, Fès, Meknès, Tanger, Tétouan, Agadir, Oujda — coordonnées réelles, `baseDeliveryFee` variant grossièrement avec la distance au hub |
| Répartition des 3 livreurs de démo | DRV-001 Casablanca, DRV-002 Rabat, DRV-003 Marrakech (zone de service + zone principale alignées) — au lieu des 3 empilés au même endroit |
| Seed rendu réellement idempotent | L'ancien `update: {}` sur `driver.upsert` ne mettait à jour ni la position ni la zone d'un livreur déjà existant en base — un reseed n'appliquait donc jamais la nouvelle répartition. Corrigé pour repositionner et réaligner la zone de service à chaque run (sans jamais toucher `status`, potentiellement changé manuellement pendant une démo) |

### 🐛 Bug trouvé pendant la vérification

Premier `npm run db:seed` : les livreurs de démo existaient déjà en base
(session précédente) → `update: {}` n'a rien changé, et le nouveau
`driverZone.upsert` a *ajouté* une zone sans retirer l'ancienne (chaque
livreur listait Casablanca + sa nouvelle ville). Diagnostiqué en
interrogeant directement Prisma après le premier reseed. Corrigé en (1)
faisant du `driver.upsert` un vrai update de position/zone principale et
(2) supprimant explicitement toute `driverZone` qui ne correspond plus à
la ville assignée avant de recréer la bonne.

### Vérifié

Playwright en direct : `/dashboard/drivers` liste bien Casablanca / Rabat /
Marrakech comme zones distinctes ; `/dashboard/control-tower` affiche les 3
livreurs dispersés sur la carte (Rabat, Casablanca, Marrakech), plus les 2
comptes livreurs créés via les tests d'inscription (sans position, comptés
séparément — "2 livreurs sans position connue").

## ✅ Assignation des zones de service aux livreurs — UI manquante (2026-08-23)

### Contexte

L'utilisateur cherchait le champ permettant d'assigner une zone de
service à un livreur et n'en trouvait aucun dans l'interface. Vérification :
le modèle `DriverZone`, le service (`assignDriverToZone`/
`removeDriverFromZone`) et la route API (`POST`/`DELETE
/api/v1/drivers/[id]/zones`) existaient déjà et étaient même utilisés par
le scoring de dispatch (`zoneMatch`) — mais aucune UI n'avait jamais été
branchée dessus. La page détail livreur se contentait d'afficher la liste
en texte brut, sans aucun moyen de la modifier. Trou réel, pas une
impression.

### Ce qui a été construit

| Élément | Fichier | Détail |
|---|---|---|
| Composant | `src/components/drivers/DriverZoneAssignment.tsx` | Liste des zones actives (`GET /api/v1/zones`) sous forme de puces cliquables ; assigne/retire en direct via l'API existante |
| Intégration | `dashboard/drivers/[id]/page.tsx` | Nouvelle carte "Zones de service" avec le composant, à la place de l'ancien texte en lecture seule |

Aucun changement de schéma ni de service — uniquement le câblage UI
manquant sur des fondations backend déjà testées.

### Vérifié

Playwright en direct (serveur jetable, port 3002, connexion admin) :
clic sur une puce non assignée → `POST` confirmé, puce passe à l'état
coché (bordure bleue) ; second clic → `DELETE` confirmé, retour à l'état
initial. Suite complète : 320+ tests, aucune régression (aucun test
n'existait pour ce chemin UI pur, le service sous-jacent était déjà
couvert).

## ✅ Carte opérationnelle temps réel — Control Tower (2026-08-23)

### Contexte

Question directe de l'utilisateur sur la géolocalisation/disponibilité/
appel d'un livreur, suivie d'une demande de construire la carte visuelle
que j'avais proposée en réponse — le seul gros manque identifié à ce
moment-là (positions stockées et utilisées pour le scoring depuis le
début de session, mais jamais affichées visuellement nulle part).

### Ce qui a été construit

| Élément | Fichier | Détail |
|---|---|---|
| Dépendance | `package.json` | `maplibre-gl` — open-source, sans clé API requise |
| Service | `drivers.service.ts` → `listDriverLocations()` | Inclut aussi les livreurs sans position connue (`latitude/longitude: null`) plutôt que de les filtrer silencieusement — permet à la carte d'afficher "N livreurs sans position" |
| Route API | `GET /api/v1/drivers/locations` | Permission `DRIVERS_MANAGE` ou `DISPATCH_MANAGE` |
| Composant | `src/components/control-tower/DriverMap.tsx` | Polling 20s, marqueurs colorés par statut (disponible/en course/hors ligne), atténués si `locationStale`, popup au clic |
| Intégration | `/dashboard/control-tower` | Nouvelle section "Carte opérationnelle" |

### 🐛 Deux bugs réels trouvés et corrigés pendant la vérification (pas au typecheck)

1. **`npm install maplibre-gl` a supprimé Playwright** — Playwright n'était
   installé que via `npx` sans figurer dans `package.json`, donc traité
   comme "extraneous" et élagué par npm au premier `install` suivant.
   Corrigé en l'ajoutant explicitement en devDependency — pour de bon,
   cette fois.
2. **Carte visible mais vide** — le style vectoriel GL officiel de CARTO
   chargeait ses métadonnées (style.json, sprite, tiles.json — tous 200)
   mais ne peignait jamais aucune tuile, dans ce contexte WebGL restreint
   (headless/logiciel). Diagnostiqué en vérifiant successivement : le
   support WebGL du contexte (présent), les réponses réseau (toutes 200),
   avant de conclure que c'était le pipeline de rendu vectoriel
   (polygones/glyphes) qui ne s'exécutait pas correctement dans cet
   environnement — remplacé par un style raster CARTO (simple composition
   d'images PNG, sans rendu vectoriel), bien plus robuste. Un second bug
   suivait juste derrière : le canvas ne peignait que dans une fraction de
   son conteneur (moitié gauche grise/reste blanc) — classique décalage
   MapLibre entre la taille du conteneur à la construction et sa taille
   réelle une fois le layout React stabilisé ; corrigé avec un
   `ResizeObserver` appelant `map.resize()`.

### Vérifié

4 tests d'intégration pour `listDriverLocations` (position fraîche,
position absente traitée comme obsolète, seuil de 20 minutes, exclusion
des comptes non opérationnels). **320/320 tests passants.** Vérifié en
conditions réelles via Playwright : carte Casablanca réelle avec rues et
noms de boulevards, 3 marqueurs correctement positionnés et colorés (dont
un atténué pour position obsolète — DRV-002, dont l'assurance expire
bientôt selon le seed), popup fonctionnelle au clic affichant nom, statut
et avertissement de fraîcheur.

## ✅ Zone déclarée + heartbeat de position livreur (2026-08-23)

### Contexte de décision

Cinquième document d'architecture, sur la séparation zone/disponibilité et
la nécessité d'un heartbeat pour éviter le problème "ONLINE mais disparu".
**Refus explicite de la refonte à 3 axes proposée** (`presenceStatus` /
`operationalStatus` / `eligibilityStatus` séparés remplaçant `driver.status`)
— une vérification du code existant a montré que les protections que cette
refonte visait à garantir étaient **déjà en place** avec le modèle actuel à
statut unique :
- `BUSY` n'est déjà jamais settable en libre-service (`SELF_SERVICE_STATUSES
  = ['AVAILABLE', 'OFFLINE']`, `drivers.service.ts`).
- Un livreur refusant une offre reste déjà `AVAILABLE`, jamais `BUSY`
  (`rejectOffer` ne touche jamais `driver.status`).
- Le bouton toggle "Disponible/Hors ligne" correspond déjà exactement à la
  maquette recommandée (section 18).

Refaire ces trois statuts en un chantier de refonte aurait cassé le
dispatch, les offres, l'onboarding, l'admin et des dizaines de tests pour
reproduire un comportement déjà correct. À la place, deux vrais manques
identifiés et comblés :

1. **Zone déclarée distincte des zones de service** (section 2-3) —
   `Driver.baseZoneId` ajouté, séparé du `DriverZone[]` many-to-many
   existant (qui couvre déjà "zones de service"). Champ de profil
   uniquement — ne participe pas au scoring de dispatch, pour ne pas
   toucher une formule déjà testée.
2. **Le vrai trou trouvé en creusant le heartbeat (section 16-17)** :
   `PATCH /api/v1/drivers/[id]/location` et `lastLocationUpdate` existaient
   déjà dans le code depuis une session précédente, mais **rien côté app
   livreur ne les appelait jamais** — un livreur restait figé sur sa
   position d'inscription pour toujours. `DriverLocationPing.tsx` comble ce
   trou : ping `navigator.geolocation` toutes les 60s tant que le livreur
   est en ligne (AVAILABLE/BUSY), jamais quand OFFLINE.
3. **Signal de position obsolète — volontairement informatif, jamais un
   filtre.** `locationStale` (> 20 min sans ping) s'affiche dans le
   panneau de dispatch, n'exclut personne. Un vrai filtre aurait le même
   risque que le garde-fou documentaire découvert plus tôt cette session :
   aucun livreur de démo n'avait jamais reçu de ping avant ce correctif,
   un filtre dur aurait immédiatement cassé le dispatch en direct.

### Vérifié

7 nouveaux tests d'intégration (zone optionnelle à l'inscription,
persistance distincte des zones de service, `locationStale` dans ses 3 cas).
Vérifié en conditions réelles via Playwright avec géolocalisation mockée
(Tanger, 35.759/-5.834) : inscription avec zone → approbation → connexion
réelle → passage "Disponible" → ping GPS confirmé en base avec les
coordonnées exactes. Données de test nettoyées après vérification.

## ✅ Refus de document : notification + "Actions requises" (2026-08-23)

### Contexte de décision

Quatrième document d'architecture soumis sur le moteur de conformité,
centré sur une mise en garde précise : **"un document refusé ne doit pas
automatiquement désactiver tout le compte."** Vérification faite, c'était
déjà le comportement réel du code — `rejectDocument` ne touche jamais
`Driver.status`/`Supplier.status`, seule l'éligibilité (calculée à part) en
est affectée. Plutôt que de refaire ce qui fonctionnait déjà, j'ai :

1. **Ajouté un test de régression explicite** qui fige ce comportement
   (`tests/integration/documents.test.ts`), pour qu'une régression future
   soit détectée immédiatement plutôt que découverte en production.
2. **Comblé un vrai manque** : le refus (et la vérification) d'un document
   ne notifiaient personne — `rejectDocument`/`verifyDocument` envoient
   maintenant une notification au propriétaire réel (résolution
   `ownerId` polymorphe → `userId`), avec le motif codifié exact.
3. **Construit la section "🔴 Actions requises"** (`ActionRequiredDocuments.tsx`)
   dans les portails livreur et fournisseur — n'affiche jamais un simple
   `eligible: false`, mais le document précis à corriger avec le motif
   donné par l'administrateur. Se vide automatiquement dès qu'un nouveau
   document est envoyé pour ce type, sans effacer l'ancien de l'historique.

### Délibérément non fait (et pourquoi)

- **Séparation `Vehicle` en entité propre** — la recommandation soumise
  insiste sur "Assurance refusée → Vehicle = NOT_ELIGIBLE, pas Driver =
  BLOCKED", avec l'exemple d'un livreur à deux véhicules dont un seul est
  affecté. Le schéma actuel n'a qu'un `vehicleType`/`vehiclePlate` sur
  `Driver` — un livreur = un véhicule. Séparer `Vehicle` toucherait le
  dispatch, les tests, les fixtures et l'admin driver — un vrai chantier,
  pas une extension de ce qui existe. Noté comme item futur explicite.
- **`Capabilities` par type de service** (STANDARD/EXPRESS/COD × MOTO/CAR)
  — suppose un concept de "type de service" qui n'existe pas du tout dans
  le modèle actuel (`Order` n'a pas de `serviceType`). Inventer cette
  dimension juste pour la faire correspondre au document aurait été
  ajouter de la structure sans besoin produit exprimé.
- **`EligibilityDecision`/`EligibilityReason` persistées à chaque tentative
  de dispatch** — `computeEligibility` calcule déjà et renvoie une raison
  structurée à la lecture (`missingTypes`/`expiredTypes`), ce qui suffit
  aux besoins actuels (Control Tower, portails). Persister un historique
  de CHAQUE décision d'éligibilité par tentative de dispatch est un vrai
  ajout de table + volumétrie, pas justifié tant qu'aucun besoin d'audit
  fin ("pourquoi ce livreur a été exclu il y a 3 jours") n'a été exprimé.
- **Relances automatiques J+1/J+3/J+7** — nécessite un job planifié
  (cron), pattern explicitement évité dans ce projet (calcul à la lecture
  partout ailleurs : offres livreur, exceptions Control Tower). La
  visibilité opérateur existe déjà (`/dashboard/documents` — expirants/
  expirés) ; les relances actives resteraient à construire avec une vraie
  infra de scheduling le jour où c'est demandé.

### Confirmé déjà correct (aucun changement nécessaire)

Le principe "conformité → filtre → classement, jamais l'inverse" — déjà
respecté : `getDispatchCandidates` filtre les livreurs inéligibles *avant*
d'appeler `computeDispatchScore`, jamais après.

### Vérifié

6 nouveaux tests d'intégration (notification au refus/à la vérification,
régression compte-jamais-suspendu, `getActionRequiredDocuments` dans ses
trois cas). **20/20 sur `documents.test.ts`.** Vérifié en conditions
réelles via Playwright : un livreur de test refusé par un manager voit
immédiatement, à sa prochaine connexion, la section "Actions requises"
avec le motif exact — données de test nettoyées après vérification.

## ✅ Activation du garde-fou d'éligibilité + motifs de refus codifiés (2026-08-23)

### Contexte de décision

Deux documents d'architecture soumis coup sur coup ont répété, chacun à sa
manière, le même principe : **"le dispatch ne doit jamais décider seul"** —
un livreur avec un document expiré ne doit même pas apparaître parmi les
candidats. C'était exactement la pièce que j'avais **délibérément laissée
inactive** lors de la construction du Document Compliance Engine, pour ne
pas casser la démo en direct (tous les comptes de démo avaient zéro
document). Cette fois, activée proprement :

1. **Comptes de démo rendus conformes** (`prisma/seed.ts`) — chaque livreur
   reçoit ses 4 documents obligatoires VERIFIED, le fournisseur son
   COMPANY_REGISTRATION ; idempotent (ne duplique jamais un document déjà
   uploadé/vérifié réellement via l'UI entre deux runs du seed). DRV-002
   reçoit une assurance expirant dans 12 jours, pour peupler l'écran
   "Documents expirant" en démo.
2. **Fixtures de test rendues conformes par défaut** (`tests/factories.ts`)
   — `createDriver`/`createSupplier` attachent désormais des documents
   VERIFIED sauf `withDocuments: false` explicite (utilisé dans
   `documents.test.ts`, qui teste le moteur d'éligibilité lui-même à partir
   d'un état vierge).
3. **Le garde-fou lui-même activé à trois endroits** :
   - `dispatch.service.ts` → `getDispatchCandidates` filtre les livreurs
     AVAILABLE non conformes ; `assignDriverToOrder` (choix manuel direct)
     et `offers.service.ts` → `createOffer` (offre à un livreur précis)
     refusent aussi explicitement — un opérateur qui connaît déjà le
     `driverId` ne peut pas contourner la conformité en évitant la liste de
     candidats.
   - `orders.service.ts` → `createOrderForSupplier` vérifie désormais le
     statut ACTIVE **et** l'éligibilité documentaire du fournisseur.
4. **Transparence opérateur (idée non demandée explicitement, ajoutée pour
   cohérence avec le principe "reasons" des documents soumis)** — le
   `DispatchPanel` affiche désormais "N livreur(s) disponible(s) exclu(s)
   pour non-conformité documentaire" avec un lien direct vers `/dashboard/
   documents`, pour qu'un "aucun livreur disponible" ne soit jamais silencieux.
5. **Motifs de refus codifiés** (`DocumentRejectionReason` — ILLEGIBLE,
   EXPIRED, WRONG_DOCUMENT, MISMATCH_VEHICLE, etc.) remplacent le texte
   libre en seule source de motif ; le texte libre reste pour le détail
   humain complémentaire.

### Vérifié

7 nouveaux tests d'intégration ciblant spécifiquement le garde-fou
(exclusion silencieuse des candidats, refus d'assignation/offre manuelle,
document expiré traité comme manquant, `countIneligibleAvailableDrivers`,
fournisseur ACTIVE-mais-non-conforme toujours bloqué). Vérifié en
conditions réelles via Playwright avec un vrai livreur sans documents créé
pour l'occasion : absent de la liste de candidats, bannière "1 livreur
exclu" affichée, tentative d'assignation manuelle directe via l'API rejetée
en 403 avec message explicite — puis données de test nettoyées.

### 🐛 Incident méthodologique (pas un bug produit)

Deux exécutions `npm test` lancées en parallèle contre la même base de test
partagée se sont contaminées mutuellement (`resetDatabase` de l'une
effaçant les données en cours d'utilisation par l'autre), produisant des
échecs qui ressemblaient à de vraies régressions. Diagnostiqué en
ré-exécutant les fichiers en cause en isolation (propres, rapides) et en ne
faisant plus jamais tourner deux suites vitest concurrentes sur la même
base. Une exécution complète a aussi essuyé un segfault Node (même
symptôme d'environnement observé plus tôt dans la session, sans lien avec
le code) — tous les tests visibles avant le crash étaient passants.

## ✅ Document Compliance Engine — KYC livreur / KYB fournisseur (2026-08-23)

### Contexte de décision

L'utilisateur a soumis des recommandations détaillées sur les pièces
justificatives à exiger (KYC livreur, KYB fournisseur), avec mise en garde
CNDP explicite sur la proportionnalité, et une architecture cible : chaque
document devient un objet logiciel avec statut/expiration, un moteur
d'éligibilité empêche le dispatch de proposer une mission à un livreur dont
un document critique est expiré ou non vérifié.

**Périmètre volontairement réduit par rapport à la recommandation complète** :
- Un seul palier de vérification (pas BASIC/VERIFIED/BUSINESS_VERIFIED à
  trois niveaux) — cohérent avec l'esprit "ne pas imposer de procédure
  lourde" du document source lui-même.
- Pas de documents contractuels (Driver Partner Agreement, etc.) — hors
  périmètre d'un agent de code ; le document source dit lui-même que ça doit
  être rédigé par un juriste marocain.
- **Le blocage dur (dispatch/commande impossible si documents incomplets)
  n'est PAS activé.** `getIneligibleOwnerIds` existe et fonctionne (testé),
  mais l'activer aujourd'hui rendrait immédiatement inéligibles tous les
  livreurs/fournisseurs de démo existants (aucun n'a de document), cassant
  le dispatch en direct pendant que l'utilisateur teste l'app. Le calcul
  d'éligibilité est en revanche pleinement visible (portails + Control
  Tower) — l'activation du blocage est une suite explicite, à faire une
  fois des documents de démo réels vérifiés en base.

### Ce qui a été construit

| Élément | Fichier | Détail |
|---|---|---|
| Modèle | `prisma/schema.prisma` | `Document` (ownerType/ownerId polymorphe — même pattern que `PayoutProfile` dans les recommandations soumises), enums `DocumentType`/`DocumentStatus` |
| Stockage | `src/infrastructure/storage/document-storage.ts` | Interface `DocumentStorage` + implémentation disque local — **explicitement non production-ready** (pas de réplication/chiffrement, incompatible multi-instance), swappable vers S3 sans toucher aux appelants, même pattern que `NotificationProvider`. Jamais servi depuis `/public` — CIN/permis/plaque sont des données personnelles CNDP |
| Service | `src/modules/documents/documents.service.ts` | `uploadDocument`, `verifyDocument`/`rejectDocument` (audit log), `computeEligibility`, `getIneligibleOwnerIds` (version batchée), `listPendingDocuments`/`listExpiringDocuments`/`listExpiredDocuments` |
| Routes API | `src/app/api/v1/documents/**` | Upload (multipart), streaming fichier authentifié, vérification/refus |
| UI livreur | `src/app/(driver)/documents/page.tsx` | Upload + historique + bannière d'éligibilité |
| UI fournisseur | `src/app/(supplier)/supplier/documents/page.tsx` | Idem |
| UI admin | `src/app/(dashboard)/dashboard/documents/page.tsx` | File de revue + documents expirant sous 30 jours + documents expirés, avec lien direct vers la fiche livreur/fournisseur |

### Vérifié

14 tests d'intégration (`tests/integration/documents.test.ts`) : upload,
vérification/refus avec audit log, calcul d'éligibilité (manquant/expiré/le
plus récent VERIFIED prime), version batchée. **297/297 tests passants.**
Vérifié en conditions réelles via Playwright : upload d'un CIN par un vrai
livreur de démo → apparition dans la file d'attente admin → vérification →
mise à jour immédiate de l'éligibilité côté livreur (le document sort de la
liste "manquants").

### 🐛 Bug évité de justesse (leçon déjà apprise cette session, réappliquée)

`documents` a été ajouté à `TABLES_IN_DELETE_ORDER` (`tests/db.ts`) dès la
création du modèle, avant même d'écrire le premier test — la même classe de
bug (`idempotency_keys` oublié, silencieux pendant plusieurs commits) avait
déjà coûté du temps de debug plus tôt dans la session.

## ✅ Correctif message d'erreur générique + page admin Fournisseurs (2026-08-23)

Deux correctifs ponctuels signalés par l'utilisateur en testant l'app :

1. **`apiFetch` affichait le code brut `VALIDATION_ERROR`** au lieu du
   détail Zod (`details.fieldErrors`) déjà renvoyé par chaque route. Corrigé
   dans `src/lib/api-client.ts` — impacte tous les formulaires de l'app, pas
   seulement l'inscription. 6 tests unitaires dédiés (`tests/unit/api-client.test.ts`).
2. **Aucun onglet "Fournisseurs"** dans le dashboard admin — seul "Livreurs"
   avait son équivalent. Ajouté `src/modules/suppliers/suppliers.service.ts`
   (`listSuppliers`, `getSupplierProfile` — réutilise `getSupplierAnalytics`
   déjà existant) + pages `dashboard/suppliers` (liste) et
   `dashboard/suppliers/[id]` (détail), même structure que `dashboard/drivers`.
   Nav mise à jour. Vérifié via Playwright sur serveur jetable.

## ✅ Onboarding fournisseur/livreur + approbation (2026-08-23)

### Contexte de décision

Question directe de l'utilisateur : "comment le livreur ou le fournisseur
créent-ils leurs compte sur la plateforme ?" L'audit a révélé un parcours
cassé en deux endroits :

1. **Aucune UI d'inscription** — `POST /api/v1/auth/register` existait déjà
   (créant un `User` + profil métier en `PENDING_APPROVAL`) mais rien dans
   le frontend ne l'appelait. Un compte ne pouvait être créé qu'en tapant
   une requête HTTP à la main.
2. **Aucun mécanisme d'approbation, nulle part** — même en s'inscrivant via
   l'API brute, un compte restait bloqué en `PENDING_APPROVAL` indéfiniment.
   Pire : `requirePageUser` et `createOrderForSupplier` ne vérifiaient **que
   le rôle**, jamais le statut d'approbation du profil métier — un
   fournisseur fraîchement inscrit et jamais validé pouvait se connecter
   immédiatement et créer de vraies commandes (déclenchant dispatch,
   commission, etc.) avant qu'aucun opérateur ne l'ait vu. C'est exactement
   l'anti-pattern que les documents d'architecture soumis plus tôt
   dénonçaient explicitement ("PENDING ne signifie jamais AVAILABLE").

Les deux ont été corrigés dans le même effort — l'UI seule sans le
garde-fou aurait juste rendu la faille plus facile à déclencher.

### Ce qui a été construit

| Élément | Fichier | Détail |
|---|---|---|
| Schéma | `prisma/schema.prisma` | `REJECTED` ajouté à `SupplierStatus` et `DriverStatus` ; `rejectionReason` sur les deux modèles |
| Validation | `src/modules/auth/auth.validators.ts` | `registerSchema` — `companyName` requis si `role=SUPPLIER`, `vehicleType` requis si `role=DRIVER` (via `superRefine`) |
| Service | `src/modules/auth/auth.service.ts` | `register()` utilise la vraie raison sociale / le vrai type de véhicule saisis, plus le nom de la personne par défaut |
| **Module** | `src/modules/onboarding/onboarding.service.ts` | `listPendingSuppliers/Drivers`, `approveSupplier/Driver`, `rejectSupplier/Driver` — transaction (profil + `User.status` + `AuditLog`), notification, garde contre le double-traitement |
| Routes API | `src/app/api/v1/onboarding/**` | `GET /pending`, `POST /suppliers/[id]/approve`\|`reject`, `POST /drivers/[id]/approve`\|`reject` |
| Permission | `src/shared/constants/permissions.ts` | `SUPPLIERS_MANAGE` ajoutée à `LOGISTICS_MANAGER` (même écran que `DRIVERS_MANAGE`) |
| **Correctif critique** | `src/modules/orders/orders.service.ts` | `createOrderForSupplier` refuse désormais toute commande si `supplier.status !== 'ACTIVE'` — la faille métier décrite ci-dessus |
| **Correctif défense en profondeur** | `src/app/(supplier)/layout.tsx`, `src/app/(driver)/layout.tsx` | Redirigent vers `/onboarding/pending` si le profil n'est pas approuvé |
| UI publique | `src/app/register/**`, `src/components/auth/RegisterForm.tsx` | Choix de rôle → formulaire dédié (raison sociale pour fournisseur, type de véhicule pour livreur) |
| UI statut | `src/app/onboarding/pending/page.tsx` | Message selon le statut réel lu en base (en attente / refusé avec motif / suspendu) — jamais un simple paramètre d'URL |
| UI admin | `src/app/(dashboard)/dashboard/onboarding/page.tsx`, `src/components/onboarding/OnboardingActions.tsx` | Liste des inscriptions en attente, actions Approuver / Refuser (motif obligatoire) — même pattern que `ExceptionActions.tsx` |

Un livreur approuvé passe en `OFFLINE`, jamais directement `AVAILABLE` —
l'approbation autorise le compte, elle ne le rend pas immédiatement
dispatchable ; c'est au livreur d'activer sa disponibilité depuis l'app.

### Vérifié

13 tests d'intégration (`tests/integration/onboarding.test.ts`) : création
de profil PENDING_APPROVAL avec les vraies données saisies, refus de
`createOrderForSupplier` tant que non approuvé (test de régression pour la
faille), approbation/refus avec audit log et motif, garde contre le
double-traitement. **277/277 tests passants.** Vérifié en conditions
réelles via Playwright sur un serveur jetable : inscription fournisseur
réelle → blocage effectif sur `/onboarding/pending` → approbation par un
LOGISTICS_MANAGER depuis `/dashboard/onboarding` → reconnexion → accès
réel au portail fournisseur sous le nom d'entreprise saisi à l'inscription.

### Délibérément non fait

Les documents d'architecture décrivent un onboarding avec upload de
documents (pièce d'identité, permis, assurance, registre de commerce) et
vérification associée. Ça suppose un stockage d'objets (S3-compatible) qui
n'existe pas encore dans le projet — l'ajouter maintenant aurait été
inventer une brique d'infrastructure non demandée. Le formulaire actuel
couvre l'identité + les champs métier minimaux ; l'upload de documents est
noté comme suite naturelle une fois un stockage d'objets branché.

## ✅ Idempotence des requêtes + health checks (2026-08-22)

### Contexte de décision

Un troisième document d'architecture (backend NestJS détaillé, PHASE 14-22)
a été soumis avec la consigne "prendre le mieux de ce document dans votre
développement professionnel". Même lecture que les deux documents
précédents : le socle proposé (NestJS, monorepo `apps/{web,api,worker}`,
Organization multi-tenant) n'apporte aucune capacité que le système actuel
n'a pas déjà, testée et vérifiée en conditions réelles — donc pas de
reconstruction. En revanche, deux idées **répétées et concrètes** dans ce
document manquaient réellement au système et se sont avérées peu coûteuses
à ajouter proprement : les **clés d'idempotence** (citées deux fois comme
protection critique contre les doubles soumissions) et les **health
checks** `/health` / `/ready` (section 20, industrialisation).

### Ce qui a été construit

| Élément | Fichier | Détail |
|---|---|---|
| Modèle | `prisma/schema.prisma` | `IdempotencyKey` (scope, key, requestHash, statusCode/responseBody nullable — null = requête en cours) |
| Service | `src/shared/http/idempotency.ts` | `withIdempotency()` — réservation atomique de la clé via la contrainte unique `(scope, key)` **avant** exécution du handler (pas un simple check-then-write, qui laisserait passer une vraie course entre deux requêtes concurrentes) |
| Câblage | `src/app/api/v1/orders/route.ts` | `POST /api/v1/orders` — l'endpoint où une double soumission a le plus de conséquence (double commande, double commission) |
| Client | `src/components/supplier/CreateOrderForm.tsx` | Clé générée une fois par montage du formulaire (`crypto.randomUUID()`), renvoyée à chaque tentative de soumission |
| Health checks | `src/app/api/health/route.ts`, `src/app/api/ready/route.ts` | Liveness (toujours 200) vs readiness (vérifie la connexion PostgreSQL, 503 si indisponible) — distinction volontaire pour un futur orchestrateur |

Sémantique côté endpoint : sans en-tête `Idempotency-Key`, comportement
inchangé (strictement opt-in). Avec la clé : une requête concurrente sur la
même clé reçoit `409 IdempotencyInProgressError` pendant que la première
s'exécute ; une fois terminée, la même clé rejoue la réponse mise en cache
(`replayed: true`) ; la même clé avec un corps de requête différent est
rejetée (`409 IdempotencyConflictError`) plutôt que silencieusement
acceptée. Un handler qui échoue libère la clé pour permettre un retry
légitime.

### Vérifié

6 tests d'intégration dédiés (`tests/integration/idempotency.test.ts`) :
replay, conflit de payload, isolation par scope, requête concurrente,
libération sur échec. Vérifié aussi en conditions réelles via Playwright
sur un serveur jetable : deux requêtes `POST /api/v1/orders` tirées en
parallèle avec la même clé n'ont créé **qu'une seule commande** en base
(confirmé par requête directe) — la seconde a reçu le 409 attendu.

### 🐛 Bug réel trouvé en écrivant les tests (pas dans le code livré cette session)

`tests/db.ts` (`resetDatabase`) n'incluait ni `driver_offers`, ni
`exceptions`, ni `idempotency_keys` dans sa liste de troncature — ajoutés
au schéma sur plusieurs sessions sans jamais mettre à jour cette liste.
`driver_offers` et `exceptions` étaient purgées incidemment par CASCADE
(FK vers `orders`), donc invisibles jusqu'ici ; `idempotency_keys` n'a
aucune FK vers une autre table et n'était **jamais** purgée entre tests —
les lignes s'accumulaient silencieusement d'un test à l'autre. Détecté par
un test comptant les lignes après un échec de handler, corrigé en
complétant la liste. Rappel utile : une table sans dépendance entrante est
invisible aux tests tant qu'aucun test ne compte ses lignes explicitement.

## ✅ Control Tower — moteur d'exceptions & SLA (2026-08-22)

### Contexte de décision

Un deuxième document d'architecture (NestJS, monorepo `apps/{web,api,worker}`,
séparation Order/Shipment/Package/Assignment, Organization multi-tenant,
Ledger double-entrée) a été soumis avec la consigne "avancez... en vous
inspirant de ce document". Décision : ne pas relancer le débat reconstruction
vs incrémental — déjà tranché en faveur de l'adoption incrémentale lors d'un
document précédent similaire. À la place, extraction de la pièce à plus haute
valeur et la plus systématiquement répétée dans les deux documents comme
prochaine étape critique : le **moteur d'exceptions / Control Tower**, absent
du système jusqu'ici. Le reste du document (NestJS, restructuration monorepo,
Organization/Membership) est laissé de côté : aucun gain fonctionnel pour un
système déjà testé (250+ tests) et vérifié sur 4 portails, seulement du
churn.

### Ce qui a été construit

| Élément | Fichier | Détail |
|---|---|---|
| Modèle | `prisma/schema.prisma` | `Exception` (type, sévérité, statut OPEN/ACKNOWLEDGED/RESOLVED, acquittement + résolution avec traçabilité utilisateur) |
| Service | `src/modules/operations/exceptions.service.ts` | `detectAndSyncExceptions()`, `listExceptions()`, `acknowledgeException()`, `resolveException()` |
| Validateurs | `src/modules/operations/exceptions.validators.ts` | |
| Routes API | `src/app/api/v1/exceptions/**` | `GET /exceptions`, `POST /exceptions/[id]/acknowledge`, `POST /exceptions/[id]/resolve` |
| Permission | `src/shared/constants/permissions.ts` | `EXCEPTIONS_MANAGE` (SUPER_ADMIN, LOGISTICS_MANAGER) |
| UI | `src/app/(dashboard)/dashboard/control-tower/page.tsx`, `src/components/operations/ExceptionActions.tsx` | Nouvelle page Control Tower + bannière d'alerte sur le dashboard principal si des exceptions sont actives |

Détection à la lecture (même pattern que l'expiration des offres livreur —
pas de job cron en V1) : seuils SLA par étape en constantes de code
(READY_FOR_PICKUP 15 min, ASSIGNED 15 min, PICKED_UP 10 min, IN_TRANSIT 30
min, OUT_FOR_DELIVERY 45 min ; AT_RISK à 70% du seuil, BREACHED au-delà) +
détection des échecs de livraison répétés (≥2 tentatives non SUCCESS, y
compris pendant que la commande attend une décision manager en
CUSTOMER_ABSENT/RESCHEDULED, hors du périmètre SLA). Auto-résolution quand la
commande progresse au-delà du statut incriminé.

### Vérifié

10 tests d'intégration dédiés (`tests/integration/exceptions.test.ts`) : seuils
AT_RISK/BREACHED, non-duplication sur balayages successifs, auto-résolution,
échecs répétés hors périmètre SLA, acquittement/résolution avec vrais IDs
utilisateur, refus d'acquitter une exception déjà résolue. Suite complète :
**258/258 tests passants**. Vérifié aussi en conditions réelles via Playwright
sur un serveur jetable (port 3002, le serveur de développement sur le port
3000 refusant l'arrêt — signal d'accès refusé, donc laissé intact) : une
vraie commande restée bloquée depuis une session de test précédente a été
détectée automatiquement (ASSIGNED depuis 70+ min, seuil 15 min), acquittée,
puis résolue de bout en bout via l'UI — et re-détectée correctement au
balayage suivant puisque la condition sous-jacente persistait toujours
(comportement voulu : résoudre acquitte une occurrence, pas la condition).

### 🐛 Bug trouvé et corrigé pendant l'écriture des tests

`backdateCurrentStatus` ne reculait que la dernière entrée d'historique de
statut, cassant l'ordre chronologique relatif : les entrées précédentes
(créées quelques ms plus tôt en temps réel) devenaient alors les plus
"récentes" une fois la dernière reculée de plusieurs minutes, et le service
lisait le mauvais statut comme "actuel". Corrigé en reculant tout
l'historique du même delta.

## ✅ Portail de tracking client public (2026-08-22)

Le seul des quatre points de contact utilisateur (admin, livreur, fournisseur,
client) qui n'avait encore aucune interface — l'API existait déjà et était
validée depuis plusieurs sessions.

| Élément | Fichier | Détail |
|---|---|---|
| Formulaire de recherche | `src/app/track/page.tsx` | Saisie du numéro de commande, public |
| Page de suivi | `src/app/track/[orderNumber]/page.tsx` | Timeline en 6 étapes, langage client (pas les libellés opérationnels internes), branché directement sur `getPublicTracking` (pas d'aller-retour HTTP) |
| 404 personnalisée | `src/app/track/[orderNumber]/not-found.tsx` | Remplace la page 404 générique de Next.js par un message de marque avec bouton "Réessayer" |

Statuts d'exception (client absent, adresse erronée, retour, annulation...)
affichés comme une alerte distincte sous la timeline plutôt que forcés dans
les 6 étapes du chemin nominal. Vérifié visuellement (Playwright, viewport
mobile 480px) sur 4 cas : commande livrée, en cours, pas encore confirmée, et
introuvable — un ajustement fait sur place : l'étape "Livré" s'affichait en
bleu "en cours" au lieu de vert "terminé" pour une commande déjà livrée
(incohérent pour un état terminal réussi) — corrigé avant validation finale.

## ✅ Flux offre/acceptation livreur (2026-08-22)

### Contexte de décision

L'utilisateur a proposé une vision élargie inspirée de DHL/UPS/FedEx (séparation
Order/Shipment/Package, multi-tenant Organization, Webhooks, Control Tower,
SLA engine — ~15 nouveaux domaines, 60+ tables). Recommandation donnée :
**adoption incrémentale**, pas de reconstruction — le système actuel (240
tests, 3 portails vérifiés) encode déjà l'essentiel des concepts sous-jacents
(ledger, POD, event-driven, dispatch scoring) sous une forme plus simple, et
la séparation Order/Shipment/Package n'a de valeur que si une commande peut
se scinder en plusieurs colis — pas le cas du flux actuel. L'utilisateur a
choisi l'adoption incrémentale. Première pièce retenue : le flux **offre/
acceptation du livreur** (section 17 de sa proposition), parce qu'il s'appuie
directement sur le moteur de dispatch déjà testé, ne dépend d'aucun service
externe, et corrige un vrai manque (`assignDriverToOrder` imposait la course
sans consentement du livreur).

### Ce qui a été construit

| Élément | Fichier | Détail |
|---|---|---|
| Modèle de données | `prisma/schema.prisma` — `DriverOffer` | `PENDING → ACCEPTED/REJECTED/EXPIRED`, expiration lazy (matérialisée à la lecture, pas de cron — cohérent avec "pas de complexité prématurée") |
| Service | `src/modules/dispatch/offers.service.ts` | `createOffer` (un livreur = une offre PENDING à la fois), `acceptOffer` (délègue à `assignDriverToOrder` déjà testé, périme les offres concurrentes), `rejectOffer`, `offerToNextBestDriver` (fallback en cascade qui ne resollicite jamais un refus) |
| API | `POST /dispatch/orders/[id]/offer`, `POST /offers/[id]/{accept,reject}`, `GET /drivers/[id]/offers` | Réutilise `requireDriverAccess`/`requireAnyPermission` existants |
| UI livreur | `PendingOffers.tsx` | Bannière avec compte à rebours (90s), gain estimé, montant COD, polling 8s |
| UI admin | `DispatchPanel.tsx` (mis à jour) | Bouton "Proposer" à côté de "Assigner" — l'assignation directe existante n'a pas été retirée, seulement complétée |
| Tests | `tests/integration/offers.test.ts` | 10 tests : non-forçage du statut avant acceptation, unicité d'offre PENDING par livreur, délégation correcte, isolation entre livreurs, expiration matérialisée, cascade de fallback |

### Vérifié

- Suite complète : **250/250 tests passent** (240 précédents + 10 nouveaux), aucune régression
- Parcours réel à **deux acteurs asynchrones** via Playwright (deux contextes navigateur séparés) : manager envoie une offre → livreur la voit avec compte à rebours et gain estimé → livreur accepte → commande passe ASSIGNED avec l'historique correct côté manager. Zéro erreur.

### Incident technique

`prisma migrate dev` a réussi mais `prisma generate` a échoué (`EPERM`) sur le
remplacement du binaire du moteur de requête — verrouillé par un serveur
`next dev` actif (pas le mien, celui de l'utilisateur, donc non interrompu).
Vérifié empiriquement que l'ancien binaire reste compatible avec le nouveau
schéma (les requêtes sur `driver_offers` fonctionnent normalement) — sans
impact fonctionnel, mais **un `npx prisma generate` propre est recommandé la
prochaine fois que le serveur de dev est arrêté**, pour remplacer le binaire
proprement.

## ✅ Suite de tests automatisés (2026-08-22)

Angle ingénierie : toute la vérification de cette semaine (bugs event-bus,
boucle de redirection, `supplierId` manquant, fuseau horaire) a été trouvée
**manuellement**, à la main, via Playwright/curl, à chaque session. Ce n'est
pas soutenable — un bug corrigé sans filet de sécurité permanent peut
revenir silencieusement au prochain changement. Cette session convertit
cette discipline manuelle en **240 tests automatisés qui tournent en 40
secondes**, contre une vraie base PostgreSQL dédiée.

### Infrastructure

| Élément | Fichier | Détail |
|---|---|---|
| Framework | `vitest.config.mts` | Vitest 2.1.9 (voir incident ci-dessous pour le choix de version) |
| Base de test dédiée | `.env.test`, `logiflow_test` (DB séparée sur le même conteneur Postgres) | Jamais la même base que le dev — garde-fou explicite qui refuse de démarrer si `DATABASE_URL` ne contient pas "test" |
| Reset entre tests | `tests/db.ts` | `TRUNCATE CASCADE` explicite sur les 22 tables, **opt-in par fichier** (pas global — voir incident) |
| Fabriques de données | `tests/factories.ts` | `createUser`, `createSupplier`, `createDriver`, `createCustomerWithAddress`, `createOrderFixtures` — réduisent le boilerplate sans cacher les FK réelles |
| Enregistrement des event handlers | `tests/register-events.ts` | Équivalent test de `src/instrumentation.ts` (jamais appelé automatiquement par Vitest) |
| Scripts | `package.json` | `npm test`, `test:watch`, `test:unit`, `test:integration`, `db:test:migrate` |

### Couverture

- **`tests/unit/order-state-machine.test.ts`** — matrice exhaustive des 196 paires (from, to) possibles de la state machine des commandes, + cohérence des événements domaine émis par transition
- **`tests/unit/permissions.test.ts`** — refus par défaut, isolation entre rôles (ex: SUPPLIER n'a jamais ANALYTICS_VIEW en bloc)
- **`tests/unit/event-bus.test.ts`** — régression directe du bug de singleton de la session précédente (simule deux imports "frais" du module partageant l'état via `global`)
- **`tests/integration/orders.test.ts`** — intégrité des prix (jamais fait confiance à l'appelant), isolation inter-fournisseurs, audit trail
- **`tests/integration/dispatch.test.ts`** — algorithme de scoring (distance/charge/zone), pré-conditions, atomicité de l'assignation
- **`tests/integration/deliveries.test.ts`** — **isolation IDOR entre livreurs** (un livreur ne peut jamais agir sur la livraison d'un autre), preuve de livraison obligatoire
- **`tests/integration/full-lifecycle.test.ts`** — le parcours complet vérifié manuellement pendant les sessions précédentes (commande → dispatch → livraison → POD → paiement COD automatique → libération livreur → versement), rejoué automatiquement avec assertions sur chaque montant du ledger

### 🐛 Incidents rencontrés en construisant la suite elle-même

1. **Vitest 4.1.11 se bloquait indéfiniment** dès `setupFiles` chargé — aucune erreur, juste un silence total après `RUN v4.1.11`. Isolé par bissection (config minimal → ajout d'options une à une) plutôt que supposé. La cause réelle (ci-dessous) n'avait rien à voir avec la version ; **downgrade vers 2.1.9** conservé par prudence après coup.
2. **La vraie cause : un `beforeEach` global tronquait les 22 tables avant CHACUN des 196 tests unitaires générés** — soit plus de 5 minutes pour une suite qui n'a besoin d'aucune base de données. Ce qui ressemblait à un blocage était en réalité une lenteur x300. Corrigé en rendant le reset DB **opt-in par fichier** (`tests/db.ts`, importé explicitement) plutôt que global (`tests/setup.ts` ne garde que le garde-fou anti-mauvaise-base).
3. **Bug réel dans ma propre fabrique de test** : génération de téléphone par troncature (`.slice(0,15)` après concaténation) qui coupait justement le suffixe garantissant l'unicité — collisions silencieuses entre fixtures créées dans la même milliseconde.
4. **Bug réel dans mon test dispatch** : `createOrderForSupplier` crée TOUJOURS une nouvelle adresse (jamais celle des fixtures) — mettre à jour les coordonnées de l'adresse de fixture après coup ne faisait rien, le test comparait deux livreurs avec un score identique par coïncidence (les deux tombaient sur le score neutre "distance inconnue").
5. **`actorId` fictif violant une FK réelle** (`audit_logs.actorId → users.id`) — la contrainte faisait exactement son travail ; corrigé en utilisant de vrais utilisateurs de fixture plutôt que des chaînes inventées.

Ces cinq incidents sont listés en détail parce que c'est le genre d'historique
qui évite de re-déboguer la même chose dans six mois.

## ✅ Portail fournisseur + module Produits (2026-08-22)

Angle métier : le fournisseur est le client payant de la plateforme — sans
self-service, chaque commande passe par un appel API manuel. Découverte en
cours de route : **aucun module Produits n'existait**, backend ou frontend —
un fournisseur ne peut pourtant pas créer de commande sans catalogue.
Construit les deux, **vérifiés via Playwright** avec un vrai cycle création
produit → création commande → détail → liste → versements.

| Élément | Fichier | Détail |
|---|---|---|
| Backend Produits | `src/modules/products/*`, `GET/POST /api/v1/products`, `GET/PATCH /api/v1/products/[id]` | CRUD scopé au fournisseur propriétaire, SKU unique par fournisseur, nouvelle permission `PRODUCTS_MANAGE_OWN` |
| Versements scopés fournisseur | `GET /api/v1/settlements`, `GET /api/v1/settlements/[id]` | Un fournisseur ne voit que ses propres versements (le `supplierId` de la requête n'est jamais fait confiance pour ce rôle) ; managers finance inchangés |
| Routage par rôle (mis à jour) | `role-routing.ts` | SUPPLIER → `/supplier` |
| Portail fournisseur | `src/app/(supplier)/supplier/*` | Vue d'ensemble (revenus, versement en attente), Commandes (liste + détail + annulation), Produits (liste + création), Versements (lecture seule) |
| Création de commande | `CreateOrderForm.tsx` | Formulaire multi-lignes avec **calcul de commission en temps réel** (aperçu du revenu net avant soumission) ; prix relu serveur à la soumission, jamais fait confiance au calcul client |

### 🐛 Bug réel trouvé et corrigé (pas au typecheck)

**`supplierId` manquant dans la requête de création de commande** : le
formulaire ne l'envoyait jamais dans le corps de la requête POST, alors que
l'API l'exige. Résultat : `422 VALIDATION_ERROR` systématique, invisible tant
qu'on ne clique pas réellement sur "Créer la commande" avec les devtools
ouverts. Trouvé en pilotant le formulaire de bout en bout, pas en le
regardant. Corrigé en passant `supplierId` en prop depuis la page serveur
(qui l'a déjà via la session) jusqu'au composant client.

**Faux positifs écartés pendant la vérification** : deux artefacts
transitoires du serveur `next dev` (compilation à la volée d'une route visitée
pour la première fois, JSON de hot-update momentanément 404) sont apparus une
fois puis ont disparu au run suivant identique — confirmés comme non
reproductibles avant d'être écartés, pas ignorés par défaut.

## ✅ App livreur / routage par rôle (2026-08-22)

Priorité opérationnelle : sans interface livreur, aucune livraison ne peut
physiquement se faire via la plateforme, quelle que soit la qualité du
dashboard admin. Construit et **vérifié via Playwright sur viewport mobile
(390×844)** avec un vrai parcours complet.

| Élément | Fichier | Détail |
|---|---|---|
| Routage par rôle | `src/shared/http/role-routing.ts`, `src/app/page.tsx` | Source unique de vérité : SUPER_ADMIN/LOGISTICS_MANAGER/FINANCE_MANAGER → `/dashboard`, DRIVER → `/missions`, sinon → `/login`. Remplace le `redirect('/dashboard')` codé en dur. |
| Shell livreur | `src/app/(driver)/layout.tsx`, `AvailabilityToggle` | Header mobile : nom, code livreur, bascule disponibilité (désactivée pendant une course) |
| Missions | `src/app/(driver)/missions/page.tsx` | Prochaine livraison mise en avant, liste des missions actives, montant COD visible |
| Détail mission | `.../missions/[orderId]/page.tsx` | Adresse, instructions, boutons Naviguer (Google Maps) / Appeler (`tel:`), articles |
| Actions livreur | `MissionActions.tsx` | Cycle complet : récupéré → transit → livraison → POD (OTP/signature/photo/GPS) ou échec (absent/adresse/refus/autre) → reprogrammation/retour ; géolocalisation best-effort à chaque étape |
| Service | `getMyMissions()`, `getDriverByUserId()` | Missions actives du livreur connecté, résolution profil via userId |

### Parcours vérifié de bout en bout (Playwright, capture à chaque étape)

Connexion → missions → ouverture mission → récupéré → transit → en livraison →
formulaire POD → confirmation → **retour automatique à "Disponible"** (le
handler `releaseDriverIfIdle` se déclenche correctement) → bascule
disponibilité manuelle. Zéro erreur console à chaque étape.

### 🐛 Bug trouvé et corrigé pendant cette session

**Boucle de redirection potentielle rôle-croisée** : avec le nouveau routage,
un livreur forçant `/dashboard` devait rebondir sans boucler, et un admin
forçant `/missions` de même. Testé explicitement dans les deux sens — les
deux gardes (`(dashboard)/layout.tsx`, `(driver)/layout.tsx`) redirigent vers
`/`, qui route ensuite correctement selon le rôle réel. Aucune boucle.

**Nettoyage de données de test** : 2 livreurs (DRV-001, DRV-002) étaient
restés bloqués en `BUSY` sans aucune livraison active — artefact des tests
d'avant le fix de l'event bus (session précédente). Remis à `AVAILABLE`
manuellement ; en production ce cas ne devrait plus se produire (le handler
`releaseDriverIfIdle` s'en charge), mais illustre l'intérêt d'un job de
réconciliation périodique si des incidents similaires arrivent (piste V2).

### Non fait (délibérément, par manque de temps/valeur immédiate)

- **Manifest PWA / installabilité** (`manifest.json`, icônes, service worker) : l'app fonctionne parfaitement comme site mobile responsive, mais n'est pas encore "installable" sur l'écran d'accueil. Nécessite des assets d'icône réels.
- **Capture réelle de signature/photo** : le formulaire POD utilise un champ texte générique (code OTP, référence) plutôt qu'un pad de signature ou l'appareil photo — fonctionnellement complet côté backend (le champ `proofData` accepte n'importe quel JSON), mais l'UI de capture est simplifiée.

## ✅ Frontend Admin Dashboard (2026-08-22)

Premier front réel de la plateforme — palette CVD-safe validée, layout protégé,
et **vérifié visuellement via Playwright** (navigation, remplissage de formulaires,
clics, captures d'écran, `console --errors`), pas seulement au typecheck.

| Élément | Fichier | Détail |
|---|---|---|
| Palette | `tailwind.config.ts` | Remplace les couleurs improvisées par la palette CVD-safe validée (skill dataviz) : `brand`, `status` (good/warning/serious/critical), `series` 1-8, tokens de chrome (`surface`, `ink`, `hairline`) |
| Auth pages | `src/app/login/page.tsx`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout` | Formulaire de connexion, session lisible côté client, déconnexion propre |
| Garde de page | `src/shared/http/page-auth.ts` | Équivalent `next/headers` de `auth-context.ts` pour les Server Components |
| Shell admin | `src/app/(dashboard)/layout.tsx` + `DashboardNav`, `LogoutButton` | Sidebar, header, accès restreint à SUPER_ADMIN/LOGISTICS_MANAGER/FINANCE_MANAGER |
| Dashboard | `src/app/(dashboard)/dashboard/page.tsx` | Stat tiles, graphique de tendance (Recharts, mark specs de la skill dataviz), répartition du jour, commandes récentes |
| Commandes | `.../dashboard/orders/{page,[id]/page}.tsx`, `OrderActions`, `DispatchPanel` | Liste filtrable, détail avec historique/POD, actions réelles (confirmer/prête/annuler/dispatch) branchées sur l'API existante |
| Livreurs | `.../dashboard/drivers/{page,[id]/page}.tsx` | Liste + profil avec performance détaillée |
| Versements | `.../dashboard/settlements/{page,[id]/page}.tsx`, `GenerateSettlementForm`, `SettlementActions` | Génération, cycle de vie DRAFT→PAID |
| Analytics trend | `getOrdersTrend()`, `GET /api/v1/analytics/trend` | Série quotidienne pour le graphique du dashboard |

### 🐛 Bugs trouvés et corrigés pendant la vérification visuelle (pas au typecheck)

1. **Structure de routes cassée** : `orders/`, `drivers/`, `settlements/` étaient placés comme sœurs de `dashboard/` à l'intérieur du groupe `(dashboard)`, donc résolus en `/orders` au lieu de `/dashboard/orders` → 404 sur toute la nav. Corrigé en déplaçant ces dossiers sous `(dashboard)/dashboard/`.
2. **Bug de fuseau horaire dans `getOrdersTrend`** : mélange minuit-local (`setHours(0,0,0,0)`) puis clé `.toISOString()` (UTC) — décalait toutes les commandes du jour vers la veille dès que le serveur n'est pas en UTC+0 (ici UTC+1). Le graphique de tendance était vide pour "aujourd'hui". Corrigé avec des clés de date 100% UTC.
3. **Boucle de redirection infinie** : `requirePageUser` redirigeait un rôle non autorisé vers `/dashboard`, qui est protégé par ce même garde → `ERR_TOO_MANY_REDIRECTS` pour tout rôle non-admin (fournisseur, livreur, client) tentant d'accéder au dashboard. Corrigé : redirection vers `/login` (à remplacer par un renvoi vers le futur portail du rôle).
4. **Cache PostCSS obsolète** : `postcss.config.js` a été créé après le démarrage du serveur `next dev` de session — certaines classes Tailwind (`bg-status-critical`, notamment le bouton "Annuler") ne se compilaient plus, invisibles à l'œil sans capture d'écran comparée au DOM. Un redémarrage serveur résout ça — **si vous voyez des couleurs manquantes, redémarrez `npm run dev`**.

## ✅ Livré (aujourd'hui)

| Élément | Fichier | Détail |
|---|---|---|
| Schéma DB complet | `prisma/schema.prisma` | 25+ modèles : users, RBAC, suppliers, products, customers, orders, deliveries, tracking, ledger financier, settlements, notifications, support |
| Config projet | `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `.env.example` | Stack réelle : Next.js 14, TypeScript strict, Prisma, Redis/BullMQ, Zod |
| RBAC | `src/shared/constants/permissions.ts` | Permissions explicites par rôle, refus par défaut |
| Auth complet | `src/modules/auth/*` | Validation Zod, hashing bcrypt, JWT + sessions révocables, hooks MFA, audit log |
| API Auth | `src/app/api/v1/auth/{register,login}/route.ts` | Endpoints fonctionnels, cookies httpOnly |
| State machine commandes | `src/modules/orders/order-state-machine.ts` | Transitions contrôlées, états terminaux, mapping événements |
| Service commandes | `src/modules/orders/orders.service.ts` | Création commande, calcul commission automatique, transition transactionnelle |
| Event bus | `src/infrastructure/messaging/event-bus.ts` | Découplage des modules (base de l'architecture événementielle) |
| Drivers | `src/modules/drivers/*` | Profil, disponibilité (self-service), position GPS, zones, stats de performance (taux de réussite, charge active, encaissement COD) |
| Dispatch | `src/modules/dispatch/*` | Scoring automatique (distance haversine / charge / performance / zone), assignation manuelle ou auto, libération du livreur en fin de commande |
| API Drivers + Dispatch | `src/app/api/v1/drivers/**`, `src/app/api/v1/dispatch/**` | Endpoints RBAC-protégés (managers + self-service livreur) |
| Auth HTTP | `src/shared/http/auth-context.ts`, `src/shared/http/api-error.ts` | Garde d'accès par permission/ownership réutilisable, réponses d'erreur uniformes (préfigure le middleware RBAC global de l'étape 9) |
| Bootstrap événements | `src/instrumentation.ts` + `dispatch.events.ts` | Libération auto du livreur quand une commande devient DELIVERED/RETURNED/CANCELLED |
| Deliveries | `src/modules/deliveries/*` | Transit manuel (PICKED_UP/IN_TRANSIT/OUT_FOR_DELIVERY), tentatives de livraison, POD (signature/OTP/photo/GPS) obligatoire sur succès, dispositionnement après échec (RESCHEDULED/RETURNED) — tout réutilise la state machine des commandes, aucune règle dupliquée |
| Tracking public | `src/modules/tracking/*`, `GET /api/v1/tracking/[orderNumber]` | Endpoint sans authentification, volontairement minimal (pas de PII) pour le futur portail client |
| API Deliveries | `src/app/api/v1/deliveries/orders/[orderId]/{status,attempts,events,resolve}` | Ownership vérifiée côté service (le livreur ne peut agir que sur ses propres livraisons ; manager = accès complet) |
| Payments | `src/modules/payments/*` | Encaissement COD 100% automatique (déclenché par l'événement `ORDER_DELIVERED`) : paiement confirmé, 3 mouvements de ledger (collecte/commission/rémunération livreur), mise à jour du solde livreur. Idempotent. Confirmation manuelle pour prépayé/virement. |
| Settlements | `src/modules/settlements/*` | Génération de versement fournisseur (agrégation par période, anti-doublon via absence de transaction SUPPLIER_PAYOUT), state machine DRAFT→PENDING_PAYMENT→PAID / DISPUTED |
| Ledger | `src/modules/payments/transaction-reference.ts` | Références séquentielles `TX-0000128` sans collision sur créations groupées |
| API Payments + Settlements | `src/app/api/v1/payments/**`, `src/app/api/v1/settlements/**` | RBAC via `PAYMENTS_MANAGE` / `SETTLEMENTS_MANAGE` |
| Bootstrap événements (mis à jour) | `src/instrumentation.ts` | Enregistre maintenant les handlers dispatch, payments ET notifications au démarrage |
| Notifications | `src/modules/notifications/*` | Consomme NOTIFY_CUSTOMER/NOTIFY_SUPPLIER déjà émis ; provider de log en attendant Twilio/WhatsApp/Resend (interface `NotificationProvider` prête à substituer) |
| Analytics | `src/modules/analytics/*`, `GET /api/v1/analytics/{dashboard,suppliers/[id]}` | Agrégats dashboard admin (section 13 du plan) et revenus fournisseur, nouvelle permission `ANALYTICS_VIEW` |
| Environnement local | `docker-compose.yml`, `.env.example` | Postgres + Redis prêts à l'emploi (`docker compose up -d`) |
| Seed de démo | `prisma/seed.ts` | Comptes de test pour chaque rôle + 1 fournisseur/3 livreurs/1 client/1 zone (mot de passe : `Passw0rd!2026`) |

## ✅ Validation end-to-end (2026-08-22)

Docker Desktop installé, Postgres + Redis lancés (`docker compose up -d`), migration initiale appliquée, seed exécuté, puis **parcours complet déroulé via de vrais appels HTTP** (login → commande → confirmation → dispatch → livraison → POD → paiement → settlement), avec un serveur `next dev` unique et propre. Résultat vérifié en base à chaque étape, pas seulement via les réponses HTTP :

- Commande créée par le fournisseur (prix relu serveur, jamais fait confiance au client) → commission 12% calculée correctement
- Manager : CONFIRMED → READY_FOR_PICKUP via la state machine
- Dispatch : scoring correct (le livreur le plus proche/disponible gagne), auto-assignation → ASSIGNED
- Livreur : PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → tentative SUCCESS avec POD (ownership vérifiée : un livreur ne peut agir que sur sa propre livraison)
- **Paiement COD automatique** déclenché par l'événement ORDER_DELIVERED : 3 transactions de ledger créées (COD_COLLECTION 470, COMMISSION_DEDUCTION 56.4, DRIVER_PAYOUT 2), solde livreur mis à jour (468 = 470 − 2), livreur repassé AVAILABLE automatiquement
- Notification SMS journalisée pour le client
- Tracking public (`GET /api/v1/tracking/:orderNumber`) : statut + timeline corrects, aucune PII exposée
- Dashboard analytics : totaux, taux de réussite, répartition du jour tous corrects
- Settlement : génération (agrégation correcte, exclut les commandes déjà payées d'un cycle précédent), puis DRAFT → PENDING_PAYMENT → PAID, transaction SUPPLIER_PAYOUT confirmée

### 🐛 Bug critique trouvé et corrigé pendant cette validation

**`src/infrastructure/messaging/event-bus.ts`** : le registre des handlers (`handlers = new Map()`) était une simple variable de module. Next.js compile chaque route API comme un module graph potentiellement distinct (surtout en dev) : `src/instrumentation.ts` enregistrait les handlers sur une instance, mais les routes appelant `dispatchDomainEvent` en voyaient une autre, vide — **aucune erreur, aucun log, échec totalement silencieux**. Résultat : paiement COD jamais déclenché, livreur jamais libéré, notifications jamais envoyées, malgré un typecheck et des réponses HTTP 200 parfaitement propres. Corrigé en appliquant le même pattern de singleton `global.*` déjà utilisé pour Prisma dans `client.ts`. Reproduit et confirmé avant/après fix avec des commandes réelles. **Sans ce test end-to-end, ce bug serait resté invisible indéfiniment** — le genre de chose qu'aucune suite de types ne peut attraper.

Deux commandes de test (ORD-2026-000001, ORD-2026-000002) sont restées bloquées en DELIVERED/paymentStatus=PENDING, créées avant le fix — artefacts de test sans impact, base locale de dev uniquement.

**Autre point relevé pendant la validation** : `POST /api/v1/orders` n'existait pas — `orders.service.ts` avait la logique de création depuis le début mais aucune route ne l'exposait. Ajouté (`src/app/api/v1/orders/**`) avec relecture serveur des prix produit (jamais fait confiance à un prix transmis par le client), find-or-create client par téléphone, et permission `ORDERS_CANCEL` désormais réellement utilisable par le fournisseur.

**Environnement local** : le port Postgres par défaut (5432) est occupé par un service PostgreSQL natif Windows préexistant sur cette machine — le conteneur Docker utilise donc le port **5433** (`docker-compose.yml` et `.env.example` mis à jour en conséquence). `POSTGRES_HOST_AUTH_METHOD=trust` activé pour la base locale (authentification scram-sha-256 échouait spécifiquement sur le chemin hôte Windows → conteneur via Docker Desktop/WSL2, confirmé par un test isolant Prisma/pg/psql — sans rapport avec la sécurité applicative).

## ✅ Récapitulatif des portails (2026-08-22)

Les trois interfaces internes existent et sont vérifiées : **Dashboard Admin**
(SUPER_ADMIN/LOGISTICS_MANAGER/FINANCE_MANAGER), **App livreur** (DRIVER,
mobile-first), **Portail fournisseur** (SUPPLIER). Routage automatique par
rôle depuis `/`, aucune boucle de redirection, testé croisé dans les trois
sens.

## ✅ Double authentification (MFA) + Programme de parrainage livreur (2026-08-24)

**MFA (TOTP)** — `User.mfaEnabled`/`mfaSecret` existaient déjà en base et `login()`
savait déjà bifurquer dessus, mais `verifyMfaCode` était un stub qui levait
systématiquement une erreur : la fonctionnalité était câblée en façade mais
totalement inopérante, et aucun flux d'activation n'existait nulle part.
Implémenté avec `otplib` : activation en deux temps (secret + QR code, puis
confirmation par un vrai code à 6 chiffres avant verrouillage du compte),
connexion qui exige le code une fois activée, désactivation protégée par
re-saisie du mot de passe. Le changement de mot de passe (`changePasswordSchema`,
jusque-là orphelin — aucune route/service/UI) a été implémenté en même temps
et révoque les autres sessions actives. Page `/account` créée (partagée entre
tous les rôles, hors des groupes de layout). Vérifié en direct : QR généré,
code TOTP réellement calculé via `otplib` côté script de vérification (comme
un vrai gestionnaire de mots de passe le ferait), connexion bloquée sans code,
acceptée avec le bon code, rejetée avec un mauvais.

**Programme de parrainage livreur** — inspiré du parrainage chauffeur
Uber/Grab, volontairement limité aux livreurs (LogiFlow n'a pas de compte
client : les clients sont créés par les fournisseurs à la commande, sans
inscription — construire un système de compte client aurait été hors
périmètre). Chaque livreur reçoit un code personnel à l'inscription,
partageable via `/referrals` ou un lien `/register/driver?ref=CODE` qui
pré-remplit le formulaire. Un nouveau livreur peut saisir le code d'un
parrain ; à 15 livraisons réussies, le parrain touche 300 MAD et le filleul
150 MAD, versés automatiquement et une seule fois (verrou `referralRewardedAt`).

**Bug réel trouvé et corrigé pendant cette implémentation** : ajouter un
second créateur de `Transaction` (la prime de parrainage) sur l'événement
`ORDER_DELIVERED` — déjà consommé par l'encaissement COD — a exposé une race
condition préexistante dans `nextTransactionReferences` : la référence
suivante était calculée par `COUNT(*) + 1`, non atomique, invisible tant
qu'un seul processus créait des transactions par commande. Les deux handlers
tournent en parallèle (`Promise.allSettled` dans le bus d'événements) et
pouvaient lire le même compteur de départ, provoquant une collision
d'unicité sur `reference`. Corrigé en remplaçant le compteur par une vraie
séquence Postgres (`nextval`, atomique par construction) — bénéficie aussi à
tous les autres appelants (settlements, indemnités course blanche). Trouvé
en écrivant un test d'intégration qui déclenche réellement l'événement,
jamais en lisant le code.

Suite complète (409 tests) verte à deux reprises après le fix. Vérifié en
direct : code affiché, filleul listé avec sa progression réelle, lien
d'inscription pré-rempli, inscription d'un nouveau livreur avec le code
confirmée en base (rattachement correct au parrain).

## ✅ Multi-arrêts (2026-08-24)

Un livreur pouvait porter une seule livraison active à la fois — trois
garde-fous distincts ("le livreur doit être AVAILABLE") l'empêchaient
d'être proposé/assigné à une commande supplémentaire tant qu'il n'avait pas
terminé sa course en cours (`getDispatchCandidates`, `assignDriverToOrder`,
`createOffer`). Ces trois points ont été relâchés pour accepter un livreur
`BUSY` sous une capacité de 3 livraisons actives (`MAX_CONCURRENT_DELIVERIES`,
`dispatch.service.ts`). Le mécanisme de retour à `AVAILABLE`
(`releaseDriverIfIdle`) comptait déjà les livraisons restantes plutôt qu'un
simple flag — il n'a nécessité aucune modification, une bonne surprise
trouvée en l'auditant avant de toucher au reste. L'app livreur (`/missions`)
ordonne maintenant ses arrêts par plus proche voisin successif depuis sa
position GPS (`sequenceByNearestNeighbor`, `src/shared/utils/geo.ts`) et
les numérote ("Arrêt 1/2", "Arrêt 2/2"...).

18 nouveaux tests (capacité au dispatch/aux offres, libération partielle,
séquencement par proximité), suite complète verte (422/422, deux passages).
Vérifié en direct : un livreur BUSY avec 2 livraisons actives reste candidat
au dispatch (`activeLoad: 2` affiché), et son app affiche bien "Arrêt 1/2" /
"Arrêt 2/2" dans l'ordre du plus proche à la position réelle du livreur —
pas dans l'ordre d'assignation. Un livreur préexistant déjà à 3 livraisons
actives (donnée de test accumulée pendant cette session) a été correctement
exclu des candidats d'une 4ᵉ commande, confirmant la limite de capacité en
conditions réelles, pas seulement en test.

## ✅ Preuve de livraison (POD) réelle — photo et signature (2026-08-24)

"Photo" et "Signature" étaient deux étiquettes de bouton parmi quatre types
de preuve, mais soumettaient toutes le même champ texte libre — aucune
caméra, aucun canvas, aucun fichier réel nulle part dans le code
(`grep getUserMedia/canvas/MediaStream` : zéro résultat). Une preuve "photo"
n'avait donc jamais existé.

Remplacé par une vraie capture : `<input type="file" accept="image/*"
capture="environment">` (ouvre l'appareil photo sur mobile) pour PHOTO, un
canvas dessiné à la main (pointer events) converti en PNG pour SIGNATURE.
La route `attempts` est passée de JSON à `multipart/form-data` (elle doit
porter un fichier binaire dans la même requête) — `apiFetch` (client HTTP
partagé) a dû apprendre à ne plus forcer `Content-Type: application/json`
quand le corps est un `FormData`, sinon le navigateur ne peut plus calculer
le boundary multipart lui-même. Les fichiers sont stockés via la même
abstraction que les documents KYC (`DocumentStorage`) — `Delivery.proofData`
ne porte plus qu'une clé de stockage, jamais les octets. Nouvelle route
authentifiée pour relire la preuve (même garde d'ownership que le bordereau
imprimable), affichée sur la fiche commande admin.

10 nouveaux tests (fichier réellement stocké et relu, validation manquante,
OTP/GPS n'ont rien à streamer). Vérifié en direct dans un vrai navigateur :
un vrai fichier PNG téléversé via `setInputFiles` (photo), un vrai trait de
souris dessiné sur le canvas (signature), les deux confirmés sans erreur ;
puis relu comme admin — l'image s'affiche réellement (`naturalWidth/Height:
1×1`, exactement la taille du PNG de test envoyé, pas une image cassée).

## 🔜 Prochaines étapes (dans l'ordre)

1. **Import CSV de commandes (fournisseur)** — le formulaire un-par-un existe et fonctionne ; l'import en masse reste à faire (même service `createOrderForSupplier` sous-jacent, juste un parseur CSV + validation ligne par ligne en plus)
2. **Providers de notification réels** — brancher Twilio (SMS/WhatsApp) et Resend/SES (email) derrière `NotificationProvider` (nécessite des identifiants du côté utilisateur)
3. **Middleware RBAC global** — actuellement : garde par route via `requirePermission`/`requireAnyPermission`/`requireDriverAccess`/`requireSupplierAccess`, fonctionnel, validé dans les 3 portails ET couvert par les tests d'intégration, mais pas centralisé
4. **Étendre la couverture de tests** — payments/settlements/products/analytics n'ont pas encore leur fichier dédié (le chemin critique COD est couvert par `full-lifecycle.test.ts`, mais pas les cas limites : paiement prépayé/virement, contestation de versement, unicité SKU) ; ajouter aussi des tests sur les routes API elles-mêmes (RBAC HTTP), pas seulement la couche service ; brancher `npm test` en CI dès qu'il y a un dépôt git
5. **Manifest PWA** (`manifest.json`, icônes, service worker) — la capture signature/photo réelle est faite (voir section 15, FONCTIONNALITES-PLATEFORMES.md) ; reste l'installabilité sur écran d'accueil, nécessite des assets d'icône réels
6. **Génération PDF facture/état de versement** — mentionné dans le plan produit initial (section paiements), pas encore construit
7. **Webhooks fournisseurs** — notifier un système externe des changements de statut de commande (mentionné dans les deux documents d'architecture, pas encore construit)
8. **Stockage S3-compatible pour les documents** — `document-storage.ts` est déjà interface-based (swap sans toucher aux appelants), mais le provider actif est un stockage disque local explicitement non production-ready
9. **Documents contractuels** (Driver Partner Agreement, contrat fournisseur) — hors périmètre technique, nécessite rédaction juridique locale avant tout développement
10. **Documents multi-fichiers** (CIN recto/verso comme un seul `Document` avec plusieurs `DocumentFile`) — le modèle actuel est volontairement un fichier par document ; suffisant tant qu'un recto/verso combiné en un seul PDF/photo reste acceptable
11. **Séparation `Vehicle` en entité propre** — un livreur avec deux véhicules dont un seul a une assurance expirée devrait rester éligible avec l'autre ; impossible tant que `vehicleType`/`vehiclePlate` restent des champs simples sur `Driver`. Chantier notable (dispatch, tests, admin) — pas une extension incrémentale
12. **Capabilities par type de service** (STANDARD/EXPRESS/COD × véhicule) — suppose un concept de "type de service" sur `Order` qui n'existe pas encore
13. **Relances automatiques d'expiration** (J-30/J-15/J-7 vers le partenaire) — nécessite un vrai job planifié ; la visibilité opérateur existe déjà (`/dashboard/documents`), la relance active du partenaire reste à construire

## Comment continuer

Dites simplement **"continue avec [numéro/nom du module]"** et je livre le code complet
de ce module (services, routes API, validateurs, et UI si applicable), avec le même
niveau de rigueur : pas de pseudo-code, pas de `// TODO` sur la logique métier centrale.
