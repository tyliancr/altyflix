# 🍿 AltyFlix — Documentation Officielle du Serveur & Bot Discord 24/7

Ce guide récapitule l'ensemble de la structure Discord, des fonctionnalités du bot et de son fonctionnement 24/7.

---

## 🏛️ 1. Architecture Complète du Serveur Discord

### 📋 INFORMATIONS *(Lecture seule pour les membres)*
- **`#📜・règlement`** : Présentation des règles + **Bouton vert interactif** `[Valider le règlement & Accéder au serveur ✅]` pour attribuer instantanément le rôle `🍿 Spectateur` et débloquer tous les salons.
- **`#📢・annonces`** : Annonces officielles de la plateforme (mises à jour, ajouts techniques).
- **`#🌐・le-site`** : Fiche complète d'AltyFlix (liens, fonctionnalités 4K, 5 serveurs miroirs, VF & VOSTFR).
- **`#🎟️・rôles`** : Panneau interactif avec **Boutons cliquables** permettant aux membres de choisir leurs alertes en 1 clic :
  - `[🆕 Nouveautés]` : Alerté des nouveaux films et séries 4K.
  - `[📢 Annonces]` : Alerté des news majeures.
  - `[🛠️ Mises à jour]` : Alerté des évolutions techniques.

### 🎬 ALTYFLIX *(Zone de streaming & cinéma)*
- **`#🎬・nouveautés`** : **Alimenté H24 en temps réel par le Bot** avec les dernières sorties cinéma et séries en 4K (affiche, note spectateurs, synopsis, lien direct et ping `@🆕 Nouveautés`).
- **`#💬・discussions`** : Salon principal cinéphile, accueil automatique des nouveaux membres et débats quotidiens.
- **`#🎭・films`** : Échanges et coups de cœur cinéma (reçoit le **Film du Jour 4K** du Bot).
- **`#📺・séries`** : Binge-watching, théories et recommandations séries.
- **`#🐛・bug-report`** : Signalement des liens morts ou soucis de lecture.
- **`#💡・suggestions`** : Suggestions de films/séries directement connectées à TMDB avec boutons de vote 👍 / 👎.

### 👥 COMMUNAUTÉ
- **`#👋・présentations`** : Présentation des nouveaux membres (avec leur film culte obligatoire !).
- **`#🗣️・général`** : Discussions libres et détente.
- **`#😂・memes`** : Mèmes cinéma, séries et pop-culture.
- **`#🖼️・partages`** : Captures de scènes, home cinéma, affiches et créations.

### 🔊 VOCAL
- **`🎧 Général`** : Salon vocal communautaire.
- **`🎬 Ciné-club`** : Visionnage groupé et débats vocaux.
- **`🎮 Gaming & Séries`** : Discussions jeux et séries.

### 🎫 TICKETS & SUPPORT
- **`#📩・ouvrir-un-ticket`** : Panneau officiel de support avec bouton `[📩 Ouvrir un ticket]`. Ouvre automatiquement un salon privé accessible uniquement par le créateur et le staff, avec bouton rouge de clôture.

### 🔒 STAFF *(Strictement masqué aux membres)*
- **`🛡️・staff-général`** : Échanges internes de l'équipe.
- **`🔧・bot-config`** : Commandes et scripts d'administration.
- **`📋・logs`** : Journal automatique (création de tickets, validation des règles, modération).

---

## 🤖 2. Les 13 Commandes Slash du Bot

| Commande | Rôle | Description |
|---|---|---|
| `/recherche <titre>` | Tous | Affiche la fiche TMDB complète avec note, synopsis et bouton de lecture direct 4K |
| `/suggerer <titre> [note]` | Tous | Recherche TMDB et publie la fiche dans `#💡・suggestions` avec votes 👍/👎 |
| `/ticket [motif]` | Tous | Ouvre un ticket privé avec le staff |
| `/film-au-hasard` | Tous | Tire au sort un chef-d'œuvre parmi les mieux notés |
| `/serie-au-hasard` | Tous | Tire au sort une série tendance |
| `/nouveautes` | Tous | Affiche les 3 derniers films et 3 dernières séries ajoutés |
| `/stats` | Tous | Affiche les statistiques techniques d'AltyFlix (serveurs, 4K, audio) |
| `/site` | Tous | Lien d'accès officiel et état du service |
| `/aide` | Tous | Menu d'aide interactif complet |
| `/post-nouveautes` | Staff | Force immédiatement la publication des nouveautés 4K dans `#nouveautés` |
| `/post-film-du-jour`| Staff | Force immédiatement la publication du coup de cœur cinéma dans `#films` |
| `/sondage <question> <A> <B>` | Staff | Crée un sondage officiel avec réactions interactives (🅰️, 🅱️, 🅲, 🅳) |
| `/purge <nombre>` | Staff | Supprime instantanément de 1 à 100 messages dans le salon |

---

## ⏰ 3. Moteur Auto-Poster 24/7 (H24)

Le bot intègre son propre moteur de planification asynchrone permanent :
1. **Veille TMDB Nouveautés (Toutes les 30 minutes)** :
   - Analyse les dernières sorties films et séries sur l'API TMDB.
   - Vérifie dans le cache (`posted-cache.json`) les titres déjà publiés pour **zéro doublon**.
   - Publie les nouvelles sorties dans `#🎬・nouveautés` avec ping `@🆕 Nouveautés`.
2. **Coup de Cœur Cinéma Quotidien** :
   - Sélectionne automatiquement un film ou une série d'exception.
   - Publie une fiche grand format (backdrop, note, lien AltyFlix) dans `#🎭・films`.
3. **Débats & Animations dans `#💬・discussions`** :
   - Propose régulièrement des questions interactives sur le cinéma avec réactions.

---

## 🚀 4. Lancement & Maintien 24/7

### Option A : Gestionnaire Interactif (Windows)
Double-cliquez simplement sur :
```bat
scripts/start-bot.bat
```
Vous pouvez choisir :
- **[1]** Lancer en arrière-plan 24/7 avec PM2 (le bot tourne même si vous fermez la fenêtre)
- **[2]** Lancer en direct dans la console (avec boucle de relance automatique en cas de crash)
- **[3]** Arrêter le bot
- **[4]** Consulter les logs en temps réel

### Option B : Commandes NPM
Depuis le dossier racine du projet :
```bash
npm run bot            # Démarrage direct du bot
npm run bot:register   # Ré-enregistrer les commandes slash si besoin
```

Depuis le dossier `scripts/` :
```bash
npm run pm2:start      # Lancer en démon 24/7
npm run pm2:logs       # Voir les logs
npm run pm2:stop       # Arrêter
```
