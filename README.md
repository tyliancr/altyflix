# ALTYFLIX

Application React de catalogue et de lecture avec comptes Firebase, profils, listes et reprise. Direction artistique noire et rouge conservée.

## Démarrer

Utiliser Node.js 24. Installer avec `npm ci`, copier `.env.example` vers `.env` et remplir les valeurs. La configuration locale du dossier de travail est exclue de l'archive.

Lancer `npm run server` dans un terminal et `npm run dev` dans un second. Ouvrir l'adresse affichée par Vite. Pour servir la compilation : `npm run build`, puis `npm start`.

`TMDB_API_KEY` est exclusivement côté serveur. Ne pas créer de variable `VITE_TMDB_API_KEY`. Les valeurs publiques Firebase utilisent le préfixe `VITE_FIREBASE_`.

## Organisation

- `src/pages` : écrans et parcours.
- `src/components` : composants classés par usage.
- `src/features` : authentification et profils.
- `src/core` : configuration et contextes transversaux.
- `src/services`, `src/hooks`, `src/utils` : données et logique partagée.
- `src/layouts` : navigation et structure des pages.
- `public` : ressources publiques ; anciens avatars conservés pour les profils existants.
- `server` : API et serveur Node ; `netlify/functions` : adaptation Netlify.
- `tests` : régressions ; `tools` : contrôles de structure.
- `verification` : preuves des contrôles et outils de test Firebase indépendants.
- `docs` : audit, déploiement et décisions de nettoyage.

`node_modules` et `dist` sont générés et exclus de l'archive source. Les scripts Discord, les logos sources et les anciens fichiers inutilisés sont conservés dans une archive d'annexes séparée.

## Vérifier

`npm run check` vérifie les chemins d'avatars, le lint, les tests et la compilation. Les tests Firebase se lancent séparément comme décrit dans le [guide de déploiement](docs/LIRE-AVANT-DEPLOIEMENT.md).

## Publier

Suivre le [guide de déploiement](docs/LIRE-AVANT-DEPLOIEMENT.md). Netlify doit compiler le projet complet avec ses Functions : déposer uniquement `dist` ne fournit pas l'API. La livraison ne modifie ni l'hébergement ni les règles Firebase en production.

L'[audit](docs/AUDIT-ALTYFLIX.md) précise les limites connues. La disponibilité et la qualité des vidéos dépendent encore des fournisseurs intégrés ; cette version ne garantit pas une qualité de service comparable aux grandes plateformes.

## Lecture vidéo native

[Installation Windows, fournisseurs, API et mesures de la V1](docs/STREAM-API-V1.md)

## API vidéo et lecteur HLS

[Encodage, API, lecteur, déploiement et checklist de tests](docs/VIDEO.md)
