# ALTYFLIX – API vidéo et lecteur HLS

Ce document couvre le pipeline d'encodage, l'API vidéo, le lecteur React et leur déploiement.
Tout repose sur des fichiers que vous hébergez : l'API ne va chercher aucune vidéo sur un site tiers.

## Vue d'ensemble

```
 Source (vidéo + audios VF/VO + .srt)
        │  scripts/encode/encode.mjs (ffmpeg)
        ▼
 media/titles/<id>/            master.m3u8, v1080…v360, audio/<lang>, subs/<lang>, thumbs/
        │  rclone / wrangler
        ▼
 Bucket R2 ──► Worker api/worker/media-worker.js (vérifie le jeton, sert le fichier)
        ▲
        │ URL signée :  https://media.exemple.fr/<exp>-<n>-<signature>/titles/<id>/master.m3u8
 API Express (api/, fonction Netlify « video »)  ◄── ID token Firebase ── React (/watch/:id)
        │
        ▼
 Firestore : titles, episodes, users/{uid}/progress, users/{uid}/preferences
```

| Dossier | Rôle |
|---|---|
| `scripts/encode/` | `encode.mjs` (encodage), `seed.mjs` (inscription au catalogue), `make-test-title.mjs` (titre de test) |
| `api/` | API Express : `app.js`, `routes.js`, `services/catalog.js`, `store/` (Firestore ou fichier), `lib/signing.js` |
| `api/worker/` | Worker Cloudflare qui protège le bucket R2 |
| `netlify/functions/video.js` | Point d'entrée de l'API sur Netlify |
| `src/components/player/hls/` | Lecteur : `HlsPlayer.jsx`, barre de progression, menus, superpositions |
| `src/hooks/` | `useHlsPlayer`, `usePlaybackProgress`, `usePlayerUi` |
| `src/services/videoApi.js` | Client de l'API |
| `src/pages/WatchPage.jsx` | Page `/watch/:id` |

## Installation

1. Node.js 20.18 ou plus récent, puis `npm ci`.
2. ffmpeg dans le PATH. Sous Windows : `winget install Gyan.FFmpeg`, puis rouvrir le terminal.
3. Recopier dans `.env` le bloc « API vidéo » de `.env.example` et le remplir. Générer le secret :

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

### Essai local sans compte de service

Pour vérifier le lecteur avant d'avoir configuré Firebase côté serveur, mettre dans `.env` :

```
DATA_BACKEND=file
AUTH_DEV_UID=dev
VITE_VIDEO_API_BASE=http://localhost:3100
VITE_VIDEO_DEV_NOAUTH=1
```

`AUTH_DEV_UID` supprime la vérification du jeton : il n'est lu que par `api/server.js` (jamais par la fonction Netlify) et ne doit servir qu'en local. Les données vont dans `.data/video-store.json`.

```bash
npm run encode:test-title
```

```bash
npm run seed -- scripts/encode/titles/bbb-test.json
```

```bash
npm run video-api
```

```bash
npm run dev
```

Ouvrir ensuite `http://localhost:5173/watch/bbb-test`.

### Avec Firebase

Dans la console Firebase : Paramètres du projet → Comptes de service → Générer une nouvelle clé privée. Reporter `project_id`, `client_email` et `private_key` dans `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` et `FIREBASE_PRIVATE_KEY` (garder les `\n` de la clé, entre guillemets). Mettre `DATA_BACKEND=firestore` et vider `AUTH_DEV_UID` et `VITE_VIDEO_DEV_NOAUTH`. Ce fichier de clé donne tous les droits sur le projet : ne jamais le committer.

## Encoder un film ou une série

```bash
node scripts/encode/encode.mjs --input film.mkv --out media/titles/mon-film --audio lang=fr,name=Français,file=film.vf.wav,default --audio lang=en,name="Anglais – Version originale",file=film.mkv --sub lang=fr,name=Français,file=film.fr.srt --sub lang=en,name=Anglais,file=film.en.srt --sub lang=fr,name="Français (forcés)",file=film.fr.forced.srt,forced
```

- `--audio` : `lang` (code ISO), `name` (libellé du menu), `file` (fichier audio, ou la vidéo elle-même), `stream=1` pour choisir la 2ᵉ piste audio d'un fichier, `default` pour la piste par défaut. Un nom ne doit pas contenir de virgule.
- `--sub` : fichiers `.srt` en UTF-8 ou Windows-1252 ; `forced` marque des sous-titres forcés (panneaux, répliques en langue étrangère).
- `--preset` : `medium` par défaut ; `slow` pour une meilleure qualité, `veryfast` pour un essai.
- `--start` / `--duration` : n'encoder qu'un extrait.
- `--job travail.json` : mêmes options dans un fichier (`input`, `out`, `audio[]`, `subtitles[]`).

Le script ne produit que les qualités inférieures ou égales à la source (une source 720p donne 720p, 480p et 360p). Les images clés sont alignées toutes les 2 s sur toutes les qualités : c'est ce qui rend le changement de qualité invisible. Le résultat contient un `manifest.json` (durée, pistes, miniatures) lu par `seed.mjs`.

Pour une série, encoder chaque épisode dans son dossier, par exemple `media/titles/ma-serie/s1e1`, `media/titles/ma-serie/s1e2`.

## Ajouter un titre au catalogue

1. Encoder (ci-dessus).
2. Décrire le titre dans un fichier JSON, sur le modèle de `scripts/encode/titles/bbb-test.json`. Pour un film :

   ```json
   {
     "id": "mon-film",
     "type": "movie",
     "title": "Mon film",
     "synopsis": "…",
     "year": 2024,
     "posterUrl": "https://…/affiche.jpg",
     "published": true,
     "mediaDir": "titles/mon-film",
     "markers": { "intro": { "start": 62, "end": 95 }, "credits": { "start": 5230 } }
   }
   ```

   Les marqueurs sont en secondes. `recap` et `intro` affichent « Passer le récapitulatif » / « Passer l'intro » ; `credits.start` déclenche le compte à rebours de l'épisode suivant et marque le titre comme terminé.
3. Inscrire le titre : `npm run seed -- chemin/vers/mon-film.json` (écrit dans Firestore, ou dans `.data/` en mode fichier).
4. Envoyer les fichiers vers le bucket, en gardant la même arborescence :

   ```bash
   rclone sync media/titles/mon-film r2:altyflix-media/titles/mon-film --progress
   ```

5. Le titre se lit à l'adresse `/watch/mon-film` (ou `/watch/ma-serie?s=1&e=2`). Pour le retirer sans rien supprimer, repasser `published` à `false` et relancer `seed`.

## Hébergement des vidéos

| | (a) Service géré : Bunny Stream, Cloudflare Stream, Mux | (b) Stockage objet + CDN : Cloudflare R2 + Worker |
|---|---|---|
| Encodage | Fait par le service | Fait par `encode.mjs` sur votre machine |
| Multi-audio, sous-titres forcés, miniatures | Variable selon le service, peu de contrôle | Contrôle total, identique au test local |
| Coût | À la minute stockée et regardée | Stockage au Go ; trafic sortant gratuit sur R2 |
| URLs signées | Intégrées | Worker fourni (`api/worker/`) |
| Mise en place | La plus rapide | Un bucket, un Worker, un sous-domaine |
| Dépendance | Forte (format et API propriétaires) | Faible : de simples fichiers HLS, déplaçables |

**Recommandation pour un petit projet : (b) Cloudflare R2 + Worker.** Le coût reste prévisible parce que le trafic sortant n'est pas facturé, et le pipeline garantit le rendu VF/VO/sous-titres testé en local. Un service géré devient intéressant si vous ne voulez plus encoder vous-même. Firebase Storage est déconseillé ici : le trafic sortant y est facturé et les URLs signées s'y font fichier par fichier, ce qui convient mal à des milliers de segments HLS.

## Déploiement

### Cloudflare (médias)

1. Créer un bucket R2 `altyflix-media`.
2. Dans `api/worker/` : copier `wrangler.toml.example` en `wrangler.toml`, y mettre votre sous-domaine, puis :

   ```bash
   npx wrangler secret put PLAYBACK_SIGNING_SECRET
   ```

   ```bash
   npx wrangler deploy
   ```

3. Ne pas activer l'accès public du bucket : seuls les liens signés par le Worker doivent fonctionner.

### Netlify (site et API)

Variables d'environnement du site : `PLAYBACK_SIGNING_SECRET` (le même que le Worker), `MEDIA_BASE_URL` (`https://media.votre-domaine.fr`), `ALLOWED_ORIGINS` (`https://altyflix.netlify.app`), `DATA_BACKEND=firestore`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Ne pas définir `AUTH_DEV_UID`, `VITE_VIDEO_DEV_NOAUTH` ni `VITE_VIDEO_API_BASE`.

`netlify.toml` route `/api/titles/*`, `/api/me/*` et `/api/series/:id/seasons/:n/episodes` vers la fonction `video` ; les autres routes `/api/*` restent sur la fonction existante.

### Firebase (règles)

```bash
npx firebase-tools deploy --only firestore:rules
```

## Schéma Firestore

```
titles/{titleId}
  type            "movie" | "series"
  title, synopsis, year, posterUrl, backdropUrl
  published       bool
  audioLanguages  [{ lang, name }]
  subtitleLanguages [{ lang, name, forced }]
  seasons         [{ number, title, episodeCount }]            (séries)
  media           { dir, duration, audio[], subtitles[], thumbnails }   (films)
  markers         { recap?: {start,end}, intro?: {start,end}, credits?: {start} }   (films)

episodes/{titleId}_s{saison}e{épisode}
  titleId, season, episode, title, synopsis, stillUrl, published
  media, markers  (mêmes formes que ci-dessus)

users/{uid}/progress/{profileId}__{titleId}[__s{saison}e{épisode}]
  profileId, titleId, type, season, episode
  position, duration   secondes
  completed            bool (générique atteint, ou 95 % de la durée)
  updatedAt            horodatage serveur

users/{uid}/preferences/{profileId}
  audioLang       "fr"
  subtitleLang    "fr" | null (désactivés)
  subtitleForced  bool
  subtitleSize    "s" | "m" | "l" | "xl"
```

`profileId` vaut l'identifiant du profil ALTYFLIX, ou `default`. Règles (`firestore.rules`) : `titles` et `episodes` sont lisibles par les comptes connectés quand `published == true` et ne sont jamais modifiables depuis un navigateur ; `users/{uid}/**` n'est accessible qu'à son propriétaire. L'API écrit avec firebase-admin, qui n'est pas soumis aux règles : c'est elle qui vérifie l'ID token et cloisonne par `uid`.

## API

Toutes les routes exigent `Authorization: Bearer <ID token Firebase>`. Les erreurs ont la forme `{ "error": { "code", "message", "details?" } }`. Paramètre commun facultatif : `profileId`.

| Méthode | Chemin | Réponse |
|---|---|---|
| GET | `/api/titles/:id` | Métadonnées, saisons, langues audio et sous-titres |
| GET | `/api/titles/:id/playback?season&episode` | `hlsUrl` signée, `expiresAt`, `audioTracks`, `subtitles`, `thumbnailsUrl`, `markers`, `resume`, `preferences`, `next` |
| GET | `/api/titles/:id/next?season&episode` | `{ next }` (épisode suivant ou `null`) |
| GET | `/api/series/:id/seasons/:n/episodes` | Liste des épisodes |
| GET | `/api/me/progress/:titleId?season&episode` | `{ progress }` |
| PUT | `/api/me/progress/:titleId` | Corps `{ position, duration, season?, episode? }` |
| GET | `/api/me/continue-watching` | Rangée « Reprendre la lecture » |
| GET / PUT | `/api/me/preferences` | `{ audioLang, subtitleLang, subtitleForced, subtitleSize }` |

Sans `season` / `episode`, `/playback` sur une série renvoie l'épisode à reprendre (ou le suivant si le dernier est terminé).

Limites : 120 requêtes par minute et par adresse IP, 20 par minute pour `/playback`. Sur Netlify le compteur vit en mémoire dans chaque instance de la fonction : c'est un garde-fou, pas une protection contre une attaque distribuée.

### URLs signées

Le jeton est dans le chemin : `<base>/<expiration>-<profondeur>-<signature>/titles/<id>/master.m3u8`. Les playlists utilisent des chemins relatifs, donc segments, sous-titres et miniatures héritent du jeton sans réécriture, y compris avec le HLS natif de Safari. La signature (HMAC-SHA256) couvre l'expiration et le dossier du titre : un lien ne donne accès qu'à ce dossier, pendant `PLAYBACK_URL_TTL` secondes (6 h par défaut). Si le lien expire en cours de lecture, le lecteur en redemande un et reprend au même endroit.

Limite à connaître : pendant sa durée de validité, un lien copié fonctionne depuis un autre appareil. Réduire `PLAYBACK_URL_TTL` raccourcit cette fenêtre. Empêcher réellement la copie demande un DRM (Widevine, FairPlay), hors du périmètre de ce projet.

## Lecteur

**hls.js plutôt que Shaka Player** : il est déjà une dépendance du projet, il est plus léger, et il change de piste audio et de sous-titres à chaud sans recharger la vidéo. Shaka apporterait surtout DASH et les DRM, inutiles ici. Sur iPhone et iPad, le lecteur utilise le HLS natif de Safari (AirPlay, plein écran système) ; la qualité y est alors gérée par le système et le menu de qualité n'offre que « Automatique ».

| Touche | Action |
|---|---|
| Espace, K | Lecture / pause |
| ←, → (ou J, L) | −10 s / +10 s |
| ↑, ↓ | Volume |
| F | Plein écran |
| M | Muet |
| S | Passer l'intro ou le récapitulatif |
| N | Épisode suivant |
| Échap | Fermer le menu ouvert |

Sur mobile : un tap affiche ou masque les contrôles, un double tap à gauche ou à droite recule ou avance de 10 s.

La langue audio, les sous-titres et leur taille sont enregistrés par profil à chaque changement : l'épisode suivant et les autres appareils s'ouvrent avec les mêmes choix.

## Titre de test

`npm run encode:test-title` télécharge Big Buck Bunny en 720p depuis blender.org (archive d'environ 420 Mo) et fabrique une mini-série de deux épisodes d'une minute, avec deux pistes audio et trois pistes de sous-titres. Le film n'ayant pas de dialogues, la piste « Français » est la bande-son d'origine avec un bip toutes les 15 s, pour entendre le changement de piste. Big Buck Bunny © Blender Foundation, licence CC BY 3.0, peach.blender.org.

## Checklist de tests

Tests automatiques : `npm test` (signature des URLs, authentification, validation, reprise, préférences, CORS).

À faire à la main sur `/watch/bbb-test` :

**Audio**
- [ ] Menu « Audio et sous-titres » : passer de Français à Anglais. Le bip disparaît, la position ne bouge pas, l'image ne se fige pas.
- [ ] Recharger la page : la piste choisie est conservée.

**Sous-titres**
- [ ] Français, Anglais, Désactivés : le texte change immédiatement.
- [ ] « Français (forcés) » : seuls les deux panneaux apparaissent (vers 0:20 et 0:40).
- [ ] Les accents s'affichent correctement (é è à ç ù œ).
- [ ] Les quatre tailles s'appliquent ; les sous-titres remontent quand les contrôles sont affichés.

**Qualité**
- [ ] « Automatique » affiche la qualité en cours.
- [ ] Forcer 360p puis 720p : la netteté change sans coupure.
- [ ] Limiter le débit dans les outils du navigateur : la qualité baisse toute seule.

**Reprise**
- [ ] Regarder 30 s, fermer l'onglet, rouvrir : « Reprendre à 0:30 ? ».
- [ ] « Reprendre » repart au bon endroit ; « Depuis le début » repart à zéro.
- [ ] `GET /api/me/continue-watching` contient le titre.
- [ ] Deuxième appareil, même compte et même profil : même position.

**Intro, récapitulatif, épisode suivant**
- [ ] Épisode 1 : « Passer l'intro » entre 0:05 et 0:15 ; la touche S fait la même chose.
- [ ] Épisode 2 : « Passer le récapitulatif » au début, puis « Passer l'intro ».
- [ ] Épisode 1 à 0:45 : carte « Épisode suivant » avec compte à rebours ; il se met en pause avec la vidéo.
- [ ] À zéro, l'épisode 2 démarre dans la même langue, sans quitter le plein écran.
- [ ] « Voir le générique » ferme la carte ; l'épisode 2 démarre quand même à la fin.
- [ ] Fin de l'épisode 2 : retour à la page précédente.

**Contrôles**
- [ ] Les contrôles et le curseur disparaissent après 3 s sans activité, et restent affichés en pause ou menu ouvert.
- [ ] Survol de la barre de progression : miniature et temps corrects.
- [ ] Tous les raccourcis du tableau ci-dessus.
- [ ] Navigation à la touche Tab : focus visible partout, barre de progression pilotable aux flèches.

**Réseau**
- [ ] Couper le réseau pendant la lecture : « Connexion perdue. Reconnexion… », puis reprise automatique au retour.
- [ ] Mettre `PLAYBACK_URL_TTL=300`, attendre 5 min en pause, relancer : la lecture reprend avec un nouveau lien.
- [ ] Ouvrir l'URL d'un segment après expiration : réponse 403.

**Mobile (Android Chrome)**
- [ ] Double tap gauche / droite : ±10 s. Tap simple : affiche / masque les contrôles.
- [ ] Plein écran : passage en paysage.
- [ ] PWA installée : mêmes vérifications.

**Safari (macOS) et iOS**
- [ ] Lecture, changement d'audio et de sous-titres.
- [ ] iPhone : plein écran natif, sous-titres visibles en plein écran.
- [ ] Reprise et épisode suivant.

## Limites connues

- Le lecteur n'a été vérifié que sur Chrome de bureau ; Safari, iOS et Android restent à valider avec la checklist.
- Le déploiement Netlify de la fonction `video` et le Worker Cloudflare n'ont pas été exécutés : ils sont à valider au premier déploiement.
- Pas de liste des épisodes dans le lecteur (seulement « Épisode suivant ») ; la route `/api/series/:id/seasons/:n/episodes` est prête pour l'ajouter.
- Les pages du site (accueil, fiches) ne pointent pas encore vers `/watch/:id` : le catalogue affiché vient toujours de TMDB.
