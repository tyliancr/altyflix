# ALTYFLIX

Application web de catalogue de films et séries : comptes Firebase, profils (avec PIN et profil enfant), liste, historique et reprise de lecture. Le catalogue (fiches, images, bandes-annonces) vient de l'API TMDB.

## Stack

| Partie | Technologies |
|---|---|
| Interface | React 18, React Router 7, Vite 6, Tailwind CSS 3, Framer Motion |
| Comptes et données | Firebase Auth, Firestore (règles dans `firestore.rules`) |
| Serveur | Node.js (HTTP natif) : proxy TMDB sécurisé, résolution des sources de lecture |
| API vidéo (optionnelle) | Express, `api/` : URL signées, progression |
| Hébergement | Interface sur Netlify, serveur sur Render |

## Prérequis

- Node.js 20.18 ou plus (24 recommandé, voir `.nvmrc`)
- Un projet Firebase (Auth + Firestore)
- Une clé API TMDB

## Installation

```bash
npm ci
cp .env.example .env
```

Renseignez `.env`. Les variables utiles au quotidien :

| Variable | Rôle | Où |
|---|---|---|
| `TMDB_API_KEY` | Clé TMDB, utilisée **uniquement côté serveur** | serveur |
| `VITE_FIREBASE_*` | Configuration web Firebase (publique par conception) | interface |
| `ALLOWED_ORIGINS` | Origines autorisées à appeler le serveur | serveur |
| `STREAM_LIBRARY_HOSTS`, `STREAM_LIBRARY_JSON` | Vos propres vidéos (voir [docs/STREAM-API-V1.md](docs/STREAM-API-V1.md)) | serveur |

Ne créez jamais de variable `VITE_TMDB_API_KEY` : tout ce qui commence par `VITE_` est envoyé au navigateur.

## Lancer

```bash
npm run dev
```

Vite démarre l'interface et lance automatiquement le serveur sur le port 3000 s'il ne tourne pas déjà (`/api` est relayé vers lui). Pour lancer le serveur seul : `npm run server`.

Version de production en local :

```bash
npm run build
npm start
```

puis ouvrez http://localhost:3000.

## Vérifier

```bash
npm run check
```

Enchaîne la vérification des chemins d'avatars, le lint, les tests et la compilation. Détail :

| Script | Rôle |
|---|---|
| `npm run lint` | ESLint, zéro avertissement toléré |
| `npm test` | Tests Node (sécurité du serveur, API de lecture, authentification) |
| `npm run build` | Compilation de l'interface dans `dist/` |
| `npm run check:structure` | Vérifie que chaque avatar référencé existe avec la bonne casse |
| `npm run bench:stream` | Mesure les temps de réponse de l'API de lecture |
| `npm run test:e2e:stream` | Test navigateur de la lecture (nécessite Chrome) |

## Organisation

```
src/
  pages/        un fichier par écran (Accueil, Films, Fiche, Recherche, Paramètres…)
  components/
    ui/         briques partagées : PosterCard, Primitives (boutons, grilles, états vides),
                GenreMenu, BrowseLayout, Icons, OrbitBackdrop
    home/       hero, rangées, cartes du catalogue
    detail/     épisodes, distribution, avis
    search/     barre et filtres de recherche
    settings/   onglets des paramètres et leurs composants
    player/     lecteur vidéo
    common/     modales et éléments transverses (PIN, toasts, logo)
  layouts/      barre de navigation, navigation mobile, pied de page
  contexts/     session, profil actif, lecteur, notifications
  hooks/        logique réutilisable (navigation par genre, recommandations…)
  services/     accès aux données : TMDB, Firestore, recherche, avis
  config/       constantes, avatars, Firebase
  utils/        fonctions pures (formatage, saisons, sons, traductions)
server/         serveur Node : proxy TMDB, sécurité, résolution des sources
api/            API vidéo Express optionnelle (URL signées, progression)
tests/          tests Node
tools/          vérifications et mesures
docs/           déploiement, API de lecture, audits
public/         images, avatars, icônes
```

## Décisions d'architecture

- **La clé TMDB ne quitte jamais le serveur.** L'interface appelle `/api/tmdb/*` ; `server/security.cjs` n'autorise qu'une liste fermée de chemins et de paramètres et injecte la clé.
- **Un seul dépôt, pas de monorepo.** L'interface et le serveur partagent quelques utilitaires et un seul `package.json` ; un découpage en paquets n'apporterait rien à cette taille.
- **Les sources de lecture sont déclarées, pas devinées.** `server/stream-providers.cjs` décrit chaque fournisseur (domaines autorisés, visibilité) ; le routeur vérifie domaine, format et signature avant de proposer une source.
- **Les briques d'interface sont partagées.** Les pages de listing réutilisent `PosterCard`, `PosterGrid` et `BrowseLayout` ; les styles de champs (`field-input`, `field-select`) sont définis une fois dans `src/index.css`.

## Publier

Suivez le [guide de déploiement](docs/LIRE-AVANT-DEPLOIEMENT.md). Netlify compile l'interface (`dist/`) et relaie `/api/*` vers le serveur Render (voir `netlify.toml`). Vérifiez dans Firebase Auth que le domaine du site fait partie des domaines autorisés.

## Documentation

- [API de lecture et fournisseurs](docs/STREAM-API-V1.md)
- [Encodage et lecteur HLS](docs/VIDEO.md)
- [Déploiement](docs/LIRE-AVANT-DEPLOIEMENT.md)
- [Audit](docs/AUDIT-ALTYFLIX.md)
