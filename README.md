# Mon Quotidien 📅🏋️🥗🗺💼

Application web installable sur téléphone (PWA), protégée par mot de passe, qui regroupe votre quotidien :

| Section | Ce qu'elle fait |
|---|---|
| 📅 **Accueil** | Calendrier, activités (sport, nourriture, événement, travail), progression du jour, calories, eau, météo |
| 🏋️ **Sport** | 876 exercices illustrés, séances (kg × reps, séries ±), chronos de séance, de repos et de série, bilan avec mannequin 3D, records, progression et régression |
| 🥗 **Nutrition** | Scan de code-barres et de QR code (Open Food Facts : Nutri-Score, NOVA, Éco-score, composition), photo d'un repas analysée par IA, recherche, aliments de base, objectifs, eau, poids |
| 🗺 **Carte** | Recherche d'adresses et de restaurants, lieux à proximité, itinéraire à pied, à vélo ou en voiture avec étapes, ouverture dans Google Maps ou Plans |
| 🔔 **Rappels** | Rappels ponctuels ou récurrents, notifications push via ntfy |
| 💼 **Emploi** | Offres récentes (Safran, Dassault, Airbus, Thales…) trouvées par un robot toutes les 30 min, avec une notification par nouvelle offre |
| 💳 **Abonnements** | Abonnements par adresse e-mail, coût mensuel et annuel, rappel avant chaque prélèvement, aide pour les retrouver dans Gmail |
| 🔐 **Autorisations** | Caméra, micro (dictée vocale 🎤), localisation, notifications |

Toutes les sections sont accessibles depuis le **menu ☰**, organisé en groupes dépliables.
Vos données restent **sur votre téléphone**. Exportez-les régulièrement depuis ⚙️ Réglages.

---

## 1. Mettre en ligne (GitHub Pages)

1. Envoyez tous les fichiers dans votre dépôt `mon-quotidien` : bouton **Add file → Upload files**, ou `git push`.
2. **Settings → Pages** → *Deploy from a branch* → branche `main`, dossier `/ (root)` → **Save**.
3. Après 1 à 2 minutes, l'app est en ligne : `https://<votre-pseudo>.github.io/mon-quotidien/`

## 2. Installer sur le téléphone

- **iPhone (Safari)** : **Partager** ⬆️ → **Sur l'écran d'accueil**, puis ouvrez l'app depuis l'icône (iOS 16.4 minimum pour les notifications).
- **Android (Chrome)** : menu ⋮ → **Installer l'application**.

Ensuite : **☰ → Autorisations** → autorisez la caméra, le micro, la localisation et les notifications.

## 3. Mot de passe 🔒

- À la **première ouverture**, l'app vous demande de créer votre mot de passe.
- Il est ensuite redemandé **une fois par mois** sur cet appareil. Vous pouvez choisir « chaque jour » ou « à chaque ouverture » dans ⚙️ Réglages.
- **Même mot de passe sur tous vos appareils :**
  1. Allez dans ⚙️ Réglages → « Générer le code pour config.js ».
  2. Collez le code obtenu dans `js/config.js` (champ `hash`) sur GitHub.

  Seule une empreinte chiffrée (PBKDF2) est publiée, jamais le mot de passe lui-même.
- ⚠️ Il n'existe aucune récupération : un oubli impose d'effacer les données de l'app.

> Ce que le mot de passe protège : l'accès à l'app et à **vos données**, qui ne quittent jamais votre téléphone. Le code de l'app, lui, est public sur GitHub Pages ; un visiteur qui trouverait l'adresse ne verrait qu'une app vide, verrouillée par *son* propre mot de passe. Il ne voit jamais vos données.

## 4. Notifications push 📲 (rappels et emploi)

Les notifications passent par **ntfy**, une app gratuite et open source :
1. Installez **ntfy** ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [iPhone](https://apps.apple.com/app/ntfy/id1625396347)).
2. Dans Mon Quotidien → **Rappels** → « Push même application fermée » → **Générer** un nom de canal → **Enregistrer** → **Envoyer un test**.
3. Dans ntfy : **＋** → abonnez-vous à ce **même nom**.

Limites :
- Les rappels sont programmés 3 jours à l'avance : ouvrez l'app au moins une fois tous les 3 jours.
- Un rappel déjà programmé ne peut pas être annulé.

## 5. Alertes emploi 💼 (robot GitHub)

Le fichier `.github/workflows/jobs.yml` lance `jobs/check-jobs.mjs` **toutes les 30 minutes** sur les serveurs de GitHub (gratuit). Le robot :
- récupère les offres récentes ;
- met à jour `data/jobs.json`, que lit l'onglet Emploi ;
- envoie une notification ntfy pour chaque **nouvelle** offre, avec l'intitulé, l'entreprise, le type de contrat, le lieu et la date de publication. Toucher la notification ouvre l'offre.

**Activation :**
1. Sur GitHub : **Settings → Secrets and variables → Actions → New repository secret** :
   - `NTFY_TOPIC` = un nom de canal ntfy. Il peut être le même que pour les rappels.
   - `FT_CLIENT_ID` et `FT_CLIENT_SECRET` : accès **gratuit** à l'API officielle **France Travail**, qui couvre aussi les offres de Safran, Dassault, etc. Pour les obtenir :
     1. Créez un compte sur https://francetravail.io.
     2. Créez une application (« Mes applications »).
     3. Abonnez-la à l'API **« Offres d'emploi v2 »**.
     4. Copiez l'identifiant et la clé secrète.
2. **Settings → Actions → General** → *Workflow permissions* → **Read and write permissions** → Save.
3. Onglet **Actions** → « Alertes emploi » → **Run workflow** pour un premier essai. Le journal indique combien d'offres chaque source a trouvées.

**Personnaliser** : modifiez `jobs/config.json` sur GitHub (mots-clés, entreprises, villes, types de contrat, ancienneté maximale).

Sources :
- **France Travail** (si les clés sont renseignées) ;
- sites carrières **Workday** d'Airbus et de Thales ;
- flux **RSS** de votre choix.

Les sites de Safran et de Dassault Aviation n'ont pas d'API publique : leurs offres arrivent par France Travail, et leurs sites carrières sont accessibles en un toucher depuis l'onglet Emploi.

⚠️ **LinkedIn** n'autorise aucune application tierce à lire ses offres ou votre compte (et l'aspiration de son site est interdite par ses conditions). Activez plutôt les **alertes emploi** dans l'app LinkedIn ; l'onglet Emploi ouvre aussi LinkedIn filtré sur les dernières 24 h.

## 6. Photo de repas analysée par IA 🤖

L'onglet Nutrition → **Photo IA** envoie la photo à **Claude** (Anthropic), qui identifie les aliments, estime les grammes, les calories et les macronutriments.
1. Créez une clé sur https://console.anthropic.com (**API Keys**) et ajoutez un peu de crédit.
2. Collez-la dans ⚙️ Réglages → « Reconnaissance photo ».

La clé reste sur le téléphone et n'est jamais exportée. Coût : environ 1 à 2 centimes par photo avec Opus 5.5, moins avec Sonnet ou Haiku (choix dans les réglages).

Le **scan de code-barres** (et des QR codes GS1 présents sur les emballages) est gratuit et sans clé : il interroge Open Food Facts.

## 7. Services utilisés (gratuits, sans clé)

OpenStreetMap (fonds de carte), Photon (recherche d'adresses), Overpass (lieux à proximité), OSRM/FOSSGIS (itinéraires), Open-Meteo (météo), Open Food Facts (produits), ntfy (push), free-exercise-db (exercices).

## Structure

```
index.html, manifest.webmanifest, sw.js   page, installation, hors-ligne
css/style.css                            styles (thème clair/sombre auto)
js/app.js        navigation, menu, réglages       js/lock.js        mot de passe
js/config.js     options modifiables sur GitHub   js/permissions.js autorisations + dictée
js/calendar.js   accueil                          js/weather.js     météo
js/sport.js      sport (+ body3d.js, exercises.js, chart.js)
js/nutrition.js  nutrition, scan, IA              js/map.js         carte & itinéraires
js/reminders.js  rappels + ntfy                   js/jobs.js        onglet emploi
js/subs.js       abonnements
jobs/            robot d'alertes emploi (config.json, check-jobs.mjs)
data/            exercices, offres d'emploi (générées)
vendor/          three.js, Leaflet, ZXing, SDK Anthropic
```
