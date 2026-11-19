# ALTYFLIX Stream API V1

## Démarrer sous Windows

Installer Node 24 et ouvrir PowerShell dans le dossier du projet. Exécuter `npm ci`. Si le fichier local `.env` manque, copier `.env.example` vers `.env`. Renseigner `TMDB_API_KEY` et la configuration Web Firebase du projet. Conserver la clé TMDB côté serveur. Lancer `npm run server` dans un terminal et `npm run dev` dans un second. Ouvrir l’adresse affichée par Vite puis la fiche de Big Buck Bunny, identifiant TMDB 10378. Pour tester le build de production local, exécuter `npm run build`, puis `npm start` et ouvrir http://localhost:3000.

## Publier sur Netlify

Déployer le projet depuis sa racine avec son fichier `netlify.toml`, sa fonction `netlify/functions/api.js` et son dossier `server`. Le dossier statique `dist` seul ne fournit pas l’API. Définir les variables Web Firebase pour le build, puis `TMDB_API_KEY`, `FIREBASE_PROJECT_ID` et `FIREBASE_WEB_API_KEY` pour les Functions. Les deux identifiants Firebase désignent le même projet que le client. Utiliser les règles Firestore du dépôt qui limitent le sous-arbre de chaque utilisateur à son UID. Vérifier le domaine du site dans les domaines autorisés Firebase Auth. Garder les secrets du partenaire et les URL signées dans l’environnement serveur.

Après déploiement, ouvrir `/api/stream/providers`, puis `/api/stream/movie/10378`. Tester avec un compte de recette la sauvegarde et la reprise sur un second appareil.

## Configurer les fournisseurs

La démonstration préconfigurée associe uniquement Big Buck Bunny à deux rendus HLS de Mux. Les deux utilisent la même infrastructure. La panne complète de cet hébergeur peut donc rendre les deux indisponibles. Le générique est crédité à la Blender Foundation sous CC BY 3.0. Une fiche TMDB décrit un titre et ses saisons indépendamment des droits de lecture.

Pour la bibliothèque personnelle, définir `STREAM_LIBRARY_HOSTS` avec les domaines vidéo exacts séparés par des virgules. `STREAM_LIBRARY_JSON` contient un tableau JSON. Exemple de structure à adapter avec votre propre média autorisé et votre UID Firebase.

```json
[{"key":"movie:123","url":"https://media.example.org/film/master.m3u8","format":"hls","language":"fr","height":1080,"externalPlayback":true,"allowedUids":["UID_FIREBASE"],"subtitles":[{"language":"fr","label":"Français","url":"https://media.example.org/film/fr.vtt"}],"intro":{"start":12,"end":56}}]
```

Pour protéger également l’accès direct au média, configurer des URL signées à durée limitée sur le CDN et fournir leur date ISO dans `expiresAt`. Un contrôle côté API ne peut révoquer une URL publique au niveau du CDN.

Le connecteur partenaire appelle en HTTPS `STREAM_PARTNER_ENDPOINT` avec `key` et `viewer` en paramètres et `STREAM_PARTNER_TOKEN` en Bearer serveur. Autoriser le domaine de l’API dans `STREAM_PARTNER_API_HOSTS` et ceux des vidéos et sous-titres dans `STREAM_PARTNER_MEDIA_HOSTS`. Le partenaire doit vérifier les droits, la région et l’expiration, puis renvoyer un objet contenant `viewer`, `key`, `externalPlayback: true` et un tableau `sources`. Chaque source reprend la clé exacte du titre, son URL, son format et une date ISO `expiresAt`. Les épisodes utilisent `tv:ID:SAISON:EPISODE`. Fournir les droits d’exploitation et configurer le CORS sur les manifestes, segments et sous-titres. Les flux nécessitant une licence DRM doivent être exclus.

Un fournisseur ajouté à `stream-providers.cjs` déclare un identifiant, sa visibilité, les domaines autorisés et une méthode asynchrone `find({key,uid,signal})`. Respecter le signal d’annulation. Le routeur vérifie le domaine, les adresses DNS publiques, le format et la signature du début de la réponse, puis classe les sources selon la compatibilité, la langue, le débit et la santé du fournisseur. La vidéo part du CDN directement vers le navigateur.

## Routes

| Méthode | Chemin | Usage |
|---|---|---|
| GET | /api/search?q=lupin&page=1 | Recherche TMDB paginée |
| GET | /api/movies/trending | Tendances de la semaine |
| GET | /api/movies/:id | Fiche du film |
| GET | /api/series/:id | Fiche de la série et saisons TMDB |
| GET | /api/series/:id/season/:n | Épisodes de la saison |
| GET | /api/stream/movie/:id | Résolution du film |
| GET | /api/stream/tv/:id/:saison/:episode | Résolution exacte de l’épisode |
| GET | /api/stream/health et /api/stream/providers | État de l’instance et fournisseurs configurés |
| GET, POST | /api/playback/progress | Reprise authentifiée par profil et titre |

Les résolutions acceptent `lang=fr` ou `vostfr`, `formats=hls,mp4,dash` et `mbps`. Les états sont `available`, `unavailable` et `temporarily_unavailable`. La progression reçoit un jeton Firebase en Bearer, `type`, `tmdbId`, `profileId`, et pour un épisode `season` et `episode`. Le POST JSON ajoute `position` et `duration` en secondes. Les lectures et écritures utilisent le jeton du spectateur auprès de Firestore. La page conserve aussi l’historique de profil existant.

## Mesures et vérifications

Campagne locale du 11 novembre 2026, Node 24, avec de vraies requêtes TMDB et Mux. Pour chaque route, une première requête puis 30 requêtes cache chaud par groupes de six.

| Opération | Première requête | p95 cache chaud |
|---|---:|---:|
| Recherche | 130 ms | 12,90 ms |
| Métadonnées | 25 ms | 6,21 ms |
| Résolution vidéo | 69 ms | 2,49 ms |

Sur huit recherches distinctes hors cache, le p95 HTTP était de 177,64 ms. Sur huit routeurs neufs, le p95 de découverte vidéo était de 64,72 ms. Dans Chrome, les cinq délais entre le clic et un lecteur actif avec position positive étaient de 3 030, 79, 87, 82 et 80 ms. Les quatre dernières ouvertures réutilisaient la session et reprenaient la vidéo. La cible de deux secondes a été dépassée à la première ouverture. Cet échantillon ne mesure ni le premier pixel sur le téléviseur du spectateur ni les démarrages à froid de Netlify.

Reproduire avec `npm run check`, `npm run bench:stream` puis `npm run test:e2e:stream`. Le test navigateur nécessite Chrome (ou la variable `CHROME_PATH` indiquant son exécutable), une clé TMDB fonctionnelle et le réseau. Il utilise un profil isolé et une vidéo HLS réelle. Les tests d’intégration de Firestore et des droits privés simulent les services concernés. La charge, le stockage de progression sur deux appareils réels, Safari/iOS, les téléviseurs, DASH et MP4 avec un partenaire de production restent à qualifier sur l’infrastructure cible. Les caches et coupe-circuits vivent en mémoire par instance. Les pages consultées sont rafraîchies par expiration et par l’API de changements TMDB.

## Fichiers de la V1
- `.env.example`
- `docs/STREAM-API-V1.md`
- `netlify/functions/api.js`
- `package-lock.json`
- `package.json`
- `README.md`
- `server/server-vf-api.cjs`
- `server/stream-api.cjs`
- `server/stream-catalogue.cjs`
- `server/stream-network.cjs`
- `server/stream-providers.cjs`
- `server/stream-router.cjs`
- `src/components/player/Availability.jsx`
- `src/components/player/NativeMedia.jsx`
- `src/components/player/VideoPlayer.jsx`
- `src/core/contexts/PlayerContext.jsx`
- `src/pages/DetailPage.jsx`
- `src/services/nativeStream.js`
- `src/services/tmdb.js`
- `src/services/videoSources.js`
- `tests/security.test.js`
- `tests/stream-v1.test.js`
- `tools/bench-stream.mjs`
- `vite.config.js`
