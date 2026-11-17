# 🚀 Guide de Déploiement Altyflix (Netlify & Utilisation entre Amis)

Votre application **Altyflix** est désormais 100% autonome, sans aucun serveur API à payer ou à maintenir, et prête pour un déploiement instantané sur **Netlify**.

---

## 1. Comment déployer sur Netlify (2 Méthodes au choix)

### Méthode A : Drag & Drop (Le plus rapide - 30 secondes)
1. Rendez-vous sur **[app.netlify.com/drop](https://app.netlify.com/drop)**.
2. Glissez-déposez directement le dossier compilé **`dist/`** présent à la racine du projet.
3. Netlify génère immédiatement votre URL publique (ex: `https://altyflix.netlify.app`).

### Méthode B : Déploiement Git Continu (Recommandé)
1. Poussez votre projet sur **GitHub** (`git push origin main`).
2. Connectez votre dépôt sur [Netlify](https://app.netlify.com) :
   * **Build command** : `npm run build`
   * **Publish directory** : `dist`
3. Le fichier `netlify.toml` inclus gère automatiquement le routage SPA et les en-têtes de sécurité.

---

## 2. Comment activer la 4K et le lecteur natif pour vous et vos amis

Altyflix intègre une **Passerelle de Streaming Direct** compatible avec **Torbox** (recommandé pour le multi-accès sans blocage d'IP) et **Real-Debrid**.

### Option 1 : Directement dans l'application (Par utilisateur)
1. Ouvrez votre site Altyflix.
2. Allez dans les **Réglages** (icône profil en haut à droite > *Compte* ou */settings*).
3. Dans l'onglet **Préférences**, descendez à la section **Passerelle de Streaming Privé**.
4. Sélectionnez votre fournisseur (**Torbox** ou **Real-Debrid**), collez votre clé API / Token.
5. Cliquez sur **Tester la clé**, puis **Enregistrer**.

### Option 2 : Clé globale pour tous vos amis (Dans Netlify)
Si vous voulez que vos amis n'aient **rien à configurer ni à payer**, ajoutez ces deux variables d'environnement dans votre tableau de bord Netlify (*Site configuration > Environment variables*) :
* `VITE_DEBRID_PROVIDER` = `torbox` (ou `realdebrid`)
* `VITE_DEBRID_TOKEN` = `votre_cle_api_ici`

Dès que vos amis cliqueront sur un film ou un épisode, le film se lancera immédiatement dans le lecteur natif Altyflix !

---

## 3. Ce que vous offre votre lecteur Netflix natif Altyflix
* **Zéro iframe / Zéro logo externe** : 100% lecteur HTML5 avec les icônes officielles Netflix.
* **Barre rouge Netflix (#e50914)** : Scrubbing fluide, buffer prévisionnel et tooltip temporel.
* **Format temps officiel** : Affichage du temps restant négatif (ex: `- 01:24:10`).
* **Sélecteur de qualité** : Basculez entre 4K UHD, 1080p FHD et 720p HD.
* **Navigation séries intégrée** : Tiroir d'épisodes et passage instantané à l'épisode suivant.
* **Raccourcis clavier** : Espace (Play/Pause), Flèches (±10s et Volume), F (Plein écran), M (Muet).
* **Mode Secours Instantané** : Si une clé n'est pas encore configurée, un bouton permet de lancer immédiatement le film en plein écran de secours sans bloquer l'utilisateur.
