# Mon Quotidien 📅🏋️🔔

Application web installable (PWA) pour organiser sa journée :

- **Accueil** : calendrier mensuel et activités (Sport, Nourriture avec calories, Événement, Travail, Autre), cases « terminé », progression du jour, rappel optionnel par activité.
- **Sport** :
  - 876 exercices avec images (base libre [free-exercise-db](https://github.com/yuhonas/free-exercise-db)), environ 100 noms traduits en français, recherche, filtres par muscle et par équipement, favoris, exercices personnalisés.
  - Programmes (4 fournis au départ : Push, Pull, Legs, Full body).
  - Séance en cours : séries avec kg × répétitions, ＋/− série, colonne « précédent », chrono de séance, minuteur de repos (son, vibration et notification), chrono de série.
  - Bilan : mannequin 3D des muscles travaillés (à faire tourner au doigt), volume, records 🏆, progression ▲ et régression ▼ (1RM estimé).
  - Historique, records, courbe de progression par exercice, carte musculaire des 7 derniers jours.
- **Rappels** : ponctuels ou récurrents (tous les jours, du lundi au vendredi, jours choisis), notifications locales, et **push via ntfy** même quand l'app est fermée.

Les données restent **sur le téléphone** (localStorage). Vous pouvez les exporter ou les importer depuis ⚙️ Réglages.

---

## 1. Tester sur l'ordinateur

```bash
cd mon-quotidien
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```
(Ouvrir directement le fichier `index.html` ne marche pas, car les modules JS ont besoin d'un serveur.)

## 2. Mettre en ligne gratuitement avec GitHub Pages

1. Créez un compte sur https://github.com (si besoin).
2. Créez un nouveau dépôt : **New repository** → nom `mon-quotidien` → **Public** → *Create*.
3. Envoyez les fichiers, de l'une de ces deux façons :
   - **Sans ligne de commande** : sur la page du dépôt, cliquez sur **Add file → Upload files** et glissez *tout le contenu* du dossier (`index.html`, `css/`, `js/`, `data/`, `vendor/`, `icons/`, `sw.js`, `manifest.webmanifest`), puis **Commit changes**.
   - **En ligne de commande** :
     ```bash
     git remote add origin https://github.com/<VOTRE-PSEUDO>/mon-quotidien.git
     git push -u origin main
     ```
4. Dans le dépôt : **Settings → Pages** → *Source* : **Deploy from a branch** → branche `main`, dossier `/ (root)` → **Save**.
5. Une ou deux minutes plus tard, l'app est en ligne à l'adresse :
   **`https://<VOTRE-PSEUDO>.github.io/mon-quotidien/`**

Pour une mise à jour, il suffit de pousser (ou d'uploader) les nouveaux fichiers. L'app se met à jour à la prochaine ouverture.

## 3. Installer sur le téléphone

**iPhone (Safari obligatoire)**
1. Ouvrez l'adresse GitHub Pages dans **Safari**.
2. Touchez **Partager** ⬆️ → **Sur l'écran d'accueil** → *Ajouter*.
3. Ouvrez l'app **depuis l'icône**, allez dans 🔔 Rappels → **Activer** les notifications (iOS 16.4 minimum).

**Android (Chrome)**
1. Ouvrez l'adresse dans Chrome.
2. Menu ⋮ → **Installer l'application** (ou ⚙️ Réglages → *Installer* dans l'app).
3. 🔔 Rappels → **Activer**.

L'app fonctionne ensuite en plein écran, avec sa propre icône, et même hors ligne. Les images d'exercices déjà vues sont gardées en cache.

## 4. Notifications push (même app fermée)

Une page web hébergée sur GitHub Pages n'a pas de serveur, donc elle ne peut pas déclencher toute seule une notification quand elle est fermée. La solution intégrée passe par **ntfy** (gratuit, open source) :

1. Installez l'app **ntfy** ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [iPhone](https://apps.apple.com/app/ntfy/id1625396347)).
2. Dans Mon Quotidien → 🔔 Rappels → « Push même application fermée » : **Générer** un nom de canal → **Enregistrer** → **Envoyer un test**.
3. Dans l'app ntfy : **＋** → abonnez-vous au **même nom de canal**.

L'app programme sur ntfy les rappels des **3 prochains jours** (c'est la limite de ntfy.sh). Ouvrez donc Mon Quotidien au moins une fois tous les 3 jours pour programmer la suite.
⚠️ Un rappel déjà programmé sur ntfy ne peut pas être annulé : si vous le modifiez ou le supprimez, l'ancienne notification arrivera quand même une fois.
Gardez le nom du canal secret : toute personne qui le connaît peut lire vos rappels.

Sans ntfy, les rappels et la fin du temps de repos s'affichent comme notifications locales, mais **seulement si l'app est ouverte ou en arrière-plan récent**.

## Structure

```
index.html            page unique + import map three.js
manifest.webmanifest  métadonnées d'installation (PWA)
sw.js                 service worker : hors-ligne, cache des images, clic sur les notifications
css/style.css         styles (thème clair ou sombre automatique)
js/app.js             navigation, réglages, sauvegarde
js/store.js           stockage local + utilitaires de dates
js/calendar.js        onglet Accueil
js/sport.js           onglet Sport (séance, bilan, historique, progrès)
js/body3d.js          mannequin 3D (three.js)
js/exercises.js       base d'exercices + traductions FR
js/reminders.js       onglet Rappels + ntfy
data/exercises.json   876 exercices (domaine public)
vendor/               three.js 0.160 (MIT)
```

## Idées d'améliorations

- Vrai Web Push (serveur gratuit Cloudflare Worker + clés VAPID), pour se passer de ntfy.
- Synchronisation entre plusieurs appareils (Supabase ou Firebase).
- Suivi nutritionnel détaillé (macros, base d'aliments), poids corporel, mensurations.
- Mannequin 3D plus réaliste (modèle anatomique en .glb).
- Traduction complète des instructions d'exercices.
