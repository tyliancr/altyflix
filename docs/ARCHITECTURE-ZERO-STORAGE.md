# ALTYFLIX — ARCHITECTURE ZERO STOCKAGE & DIRECT STREAMING

Architecture définitive **Zéro Stockage / Direct Streaming** d'Altyflix, étude comparative des 8 technologies vidéo, intégration du moteur unifié dans l'interface Netflix et résultats empiriques des benchmarks réels.

---

## 1. Respect Strict de la Contrainte Absolue

```
┌────────────────────────────────────────────────────────────────────────┐
│                        INFRASTRUCTURE ALTYFLIX                         │
│                                                                        │
│   ┌────────────────────┐                 ┌─────────────────────────┐   │
│   │   Netlify (Edge)   │                 │      Navigateur Client  │   │
│   │  Frontend Statique │                 │  HTML5 + MSE + Buffers  │   │
│   │   (HTML/JS/CSS)    │                 │   (RAM Volatile Uniquement)│   │
│   └─────────┬──────────┘                 └────────────▲────────────┘   │
└─────────────┼─────────────────────────────────────────┼────────────────┘
              │ Code Client                             │ Flux Vidéo Direct
              ▼                                         │ (Range 206 / HLS / DASH)
   ┌──────────────────────┐                             │
   │  Sources Autorisées  ├─────────────────────────────┘
   │  CDN Publics Libres  │  ZÉRO OCTET VIDÉO NE TRANSITE PAR LE SERVEUR
   │  (Blender Foundation)│  AUCUN STOCKAGE, AUCUN DISQUE DUR, AUCUN NAS
   └──────────────────────┘
```

### Garanties Zéro Stockage
- **Aucun serveur de stockage vidéo** (ni S3, ni VPS dédié, ni bucket de fichiers médias).
- **Aucun NAS** ou disque réseau connecté.
- **Aucun téléchargement permanent** : aucun fichier `.mp4` ou segment `.ts` n'est écrit sur le disque du serveur ou du client.
- **Aucun catalogue vidéo auto-hébergé** : seules les métadonnées textuelles (titres, résumés, posters TMDB) sont indexées.
- **Aucun serveur de transcodage** : pas de ferme FFmpeg, pas de conversion CPU/GPU en arrière-plan.
- **Aucun abonnement à une API de lecture tierce pirate** : zéro iframe, zéro dépendance à VidLink, Videasy ou équivalents.
- **Aucun téléchargement préalable intégral** : le film n'est jamais chargé en entier avant le clic de lecture.

---

## 2. Étude Comparative des 8 Technologies

| Technologie | Rôle & Mécanisme | Avantages Clés | Limites pour Altyflix | Retenu |
|---|---|---|---|:---:|
| **HTML5 Video (`<video>`)** | Élément DOM standardisé W3C avec décodage matériel natif du navigateur. | Démarrage ultra-rapide (710 ms), consommation mémoire minimale (11 Mo), décodage matériel direct. | Pas de bitrate adaptatif (ABR) natif sur Chrome/Firefox sans MSE. Dépend du format conteneur (MP4/WebM). | **OUI** (Moteur Range & Base de rendu) |
| **HLS.js** | Client JavaScript de l'Apple HTTP Live Streaming (RFC 8216) opérant via MSE. | Adaptation dynamique du débit (ABR), multi-audio (VF/VO), sous-titres WebVTT synchronisés, standard mondial VOD. | Découpage en segments discrets (2-6s) imposant un parsing de manifestes `.m3u8`. | **OUI** (Moteur HLS Principal) |
| **Shaka Player** | Lecteur open-source Google gérant MPEG-DASH et HLS de façon modulaire via MSE. | Algorithmes ABR avancés (`AbrManager`), gestion unifiée DASH/HLS, récupération d'erreurs robuste. | Empreinte bundle plus lourde (~300 Ko gzip), initialisation légèrement plus longue (~3,6s). | **OUI** (Moteur DASH Principal) |
| **MPEG-DASH** | Standard international ISO/IEC 23009-1 pour le streaming adaptatif sur HTTP. | Indépendant des codecs (H.264, VP9, AV1), manifestes XML `.mpd` extensibles, standard ouvert ISO. | Support natif navigateur nul (requiert obligatoirement MSE + Shaka/Dash.js). | **OUI** (Standard Industriel VOD) |
| **WebTorrent** | Streaming P2P dans le navigateur via WebRTC Data Channels et téléchargement séquentiel. | Réduit la charge serveur CDN, décentralisé, idéal pour les contenus libres communautaires. | Dépend de la présence de WebRTC seeders actifs. Latence d'amorçage élevée si l'essaim est faible. CPU/Batterie mobile. | **OUI** (Adaptateur P2P optionnel) |
| **WebRTC** | Protocole temps réel UDP/RTP ultra-faible latence (<500 ms) pour visio et direct interactif. | Latence sub-seconde pour le live interactif ou les visioconférences. | Incompatible avec le cache CDN HTTP standard. Pas de buffering prospectif. Coût serveur SFU/TURN prohibitif pour la VOD de films. | **NON** pour la VOD (Hors scope long-métrage) |
| **HTTP Range Requests** | RFC 7233 / RFC 9110 (`Range: bytes=X-Y`, réponse `206 Partial Content`). | Permet le seeking instantané et la lecture progressive de fichiers MP4 sans téléchargement complet. | Pas de bascule dynamique de résolution à la volée sur un fichier unique (résolution fixe). | **OUI** (Clé de voûte Direct MP4) |
| **MediaSource Extensions (MSE)** | API W3C (`window.MediaSource`, `SourceBuffer`) permettant à JS de nourrir `<video>`. | Permet à HLS.js et Shaka d'injecter des chunks binaires en RAM et d'évacuer l'historique sans toucher au disque. | Non disponible sur Safari iOS pour iPhone (qui impose son lecteur HLS système natif via `<video src>`). | **OUI** (Socle technique HLS & DASH) |

---

## 3. Architecture du Lecteur Unifié (Unified Streaming Engine)

Fichier implémenté : `src/components/player/engine/UnifiedStreamingEngine.js`
Intégration UI : `src/components/player/NetflixPlayer.jsx`

### Fonctionnalités
- **Détection automatique du format** : HLS (`.m3u8`), DASH (`.mpd`), Range MP4 (`.mp4`), WebTorrent (`magnet:`).
- **Buffer intelligent & limitation RAM** : 45 secondes de buffer en avant, 30 secondes en arrière (éviction automatique via `SourceBuffer.remove()`), mémoire vive bornée entre 11 et 35 Mo.
- **Seeking rapide** : Annulation des fragments inutiles et saut instantané à la frame clé demandée.
- **Télémétrie en temps réel** : Affichage HUD (touche `D` ou bouton *"Flux Direct"*) des métriques TTFF, RAM, débit, images perdues et statut réseau.
- **Résilience réseau** : Détection immédiate `offline` / `online`, pause automatique et reconnexion automatique.

---

## 4. Mesures Réelles & Validation Empirique (Banc de Test Playwright)

Résultats issus de `tools/bench-streaming-architecture.mjs` exécuté dans Google Chrome headless :

| Technologie Testée | Titre & Source Ouverte | TTFF (1ère Image) | Buffer d'Avance | Latence de Seeking | Mémoire RAM (JS Heap) | Trafic Réseau Reçu | Stockage Serveur Altyflix |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **HLS (Hls.js + RFC 8216)** | *Tears of Steel* (Blender Foundation, CC BY 3.0) | **3 995 ms** | **60.7 s** | **45 ms** | 35.5 Mo | 25.46 Mo (31 req.) | **0 Mo (ZÉRO)** |
| **MPEG-DASH (Shaka + ISO/IEC)** | *Big Buck Bunny* (Blender Foundation, CC BY 3.0) | **3 650 ms** | **24.7 s** | **703 ms** | 17.6 Mo | 74.29 Mo (36 req.) | **0 Mo (ZÉRO)** |
| **HTTP Range (206 Partial)** | *Big Buck Bunny* (Bower Open Samples, CC BY 3.0) | **710 ms** | **21.6 s** | **47 ms** | 11.4 Mo | 7.91 Mo (4 req.) | **0 Mo (ZÉRO)** |

### Tests de Résilience
- **Comportement Hors-Connexion (Offline Simulation)** : Détection immédiate de la perte réseau (`offline`), suspension de la lecture, reprise automatique au rétablissement (`online`). **SUCCÈS**.
- **Comportement Sans Source Disponible (Simulation 404)** : Erreur 404 captée gracieusement, affichage du message d'erreur sans crash de l'interface. **SUCCÈS**.
- **Tests unitaires et structurels** : 30/30 tests passés (`npm test`), ESLint 0 avertissement, build de production Vite validé.
