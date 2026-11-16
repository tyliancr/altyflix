# ALTYFLIX — version corrigée du 30 octobre 2026

Cette livraison contient le code source, une compilation reproductible avec `npm run build`, les règles Firebase et des tests. Elle a été préparée dans une copie : le dossier fourni dans Téléchargements n’a pas été modifié. Elle n’a pas été déployée sur le site public.

## Mise en ligne sur Netlify

1. Renouveler la clé TMDB. Si les services Discord sont utilisés, renouveler aussi le jeton du bot et le webhook qui étaient écrits dans les sources. Les anciens identifiants restent dans le dossier d’origine et peuvent aussi subsister dans d’anciennes versions publiées.
2. Dans les variables d’environnement Netlify, ajouter `TMDB_API_KEY` avec la nouvelle clé, accessible aux Functions. Supprimer `VITE_TMDB_API_KEY` : une variable VITE est destinée au navigateur.
3. Vérifier les identifiants publics Firebase dans `netlify.toml`. Ils ont été conservés pour le projet existant. Ce ne sont pas des secrets administrateur. Autoriser le domaine final dans Firebase Authentication et activer les fournisseurs Email/Mot de passe et Google utilisés par le site.
4. Sauvegarder les données Firebase avant de publier les règles. La collection historique `progress` doit porter `userId`, `profileId` et `contentId` correctement. Les documents anciens sans `userId` ne sont plus accessibles par une simple correspondance de préfixe. Une migration administrative peut être nécessaire ; aucune donnée de production n’a été modifiée ici.
5. Après vérification du projet sélectionné, publier `firestore.rules` et `firestore.indexes.json` avec Firebase CLI, ou copier les règles dans la console. Le fichier `firebase.json` est fourni.
6. Déployer le projet complet avec le processus de compilation Netlify : commande `npm run build`, dossier publié `dist`, fonctions `netlify/functions`. Les redirections sont configurées dans `netlify.toml` et `public/_redirects`. Un simple dépôt de `dist` sans les fonctions ne suffit pas : le catalogue utilise désormais `/api/tmdb`.
7. Vérifier sur une prévisualisation : connexion, création de profil, ajout/suppression d’un avis, favoris, historique, Lupin « Partie 4 », lecture et reconnexion sur mobile. Les lecteurs externes doivent être vérifiés individuellement.

Exemple de publication des règles, à exécuter uniquement après contrôle du compte et du projet Firebase :

```sh
firebase deploy --only firestore:rules,firestore:indexes --project atflix-39c32
```

## Exécution locale

Utiliser Node.js 24 (la version testée est indiquée dans `verification/verification-code.json`). `.nvmrc` et Netlify ciblent la branche 24.

```sh
npm ci
```

Copier `.env.example` en `.env`, compléter la nouvelle `TMDB_API_KEY` et la configuration Firebase publique. Les valeurs Firebase du projet se trouvent déjà dans `netlify.toml`.

Dans un premier terminal :

```sh
npm run server
```

Dans un second terminal :

```sh
npm run dev
```

Le serveur de développement relaie `/api` vers le serveur local, port 3000. Pour servir la compilation : `npm run build`, puis `npm start`. Le serveur Node charge `.env` sans écraser les variables déjà définies par l’hébergement.

## Contrôles reproductibles

```sh
npm run lint
npm test
npm run build
npm audit --omit=dev
```

Les tests Firebase sont indépendants des dépendances du site. Ils demandent Java 21 et téléchargent l’émulateur local. Depuis la racine du projet :

```sh
npm ci --prefix verification
node verification/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only firestore --project demo-altyflix-audit "node verification/check-rules.mjs"
```

Ce test utilise exclusivement un projet `demo-` et des comptes fictifs. Ne remplacer pas cet identifiant par le projet de production. Le dossier `verification` n’est pas publié dans `dist`.

## Services Discord optionnels

Les scripts Discord sont conservés dans une archive d’annexes distincte. Ils ne sont pas nécessaires au fonctionnement du site. Ils utilisent désormais `DISCORD_TOKEN`, `DISCORD_WEBHOOK_URL` et `TMDB_API_KEY` fournis par l’hébergement du bot. Ne stocker aucun de ces secrets dans les fichiers JSON. Aucun message Discord n’a été envoyé pendant les vérifications.

## Retour arrière

Conserver la version actuellement déployée et un export Firebase avant publication. Une restauration du code n’annule pas une migration des données ni une rotation des secrets. Le dossier original de Téléchargements constitue la copie source initiale ; il contient encore les anciens secrets et ne doit pas être republié tel quel.
