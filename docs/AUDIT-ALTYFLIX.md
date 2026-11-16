# Audit et corrections ALTYFLIX

**30 octobre 2026 — livraison locale, non déployée.**

Le site a été examiné sur ses parcours React, son authentification Firebase, ses accès Firestore, ses deux API Node/Netlify, son lecteur intégré, sa configuration de compilation et ses scripts Discord. Le travail comprend des corrections de code, des tests de sécurité locaux et des améliorations de l’interface conservant la direction artistique noire et rouge. Il ne constitue pas une garantie d’absence de toute faille ni un test d’intrusion de l’hébergement public.

## Résultats vérifiés

- 13 tests de régression réussis : sessions forgées, erreurs Firebase, fausse connexion Google, redirections externes, numérotation Lupin, classification des films, événements de lecteur, paramètres d’API, cache et serveur HTTP.
- 29 vérifications Firestore réussies dans l’émulateur : opérations autorisées, accès entre comptes refusés, propriétaire immuable, usurpation de profil refusée, notes et commentaires bornés, progression privée et compteur de vues encadré.
- Vérifications Chrome sur ordinateur 1440 × 1000 et mobile 390 × 844 : sélection des parties, lecture au clavier, fermeture du lecteur, absence de débordement horizontal, erreur réseau puis nouvelle tentative. Aucun événement d’erreur JavaScript de page relevé dans ces parcours. Les comptes et écritures cloud étaient simulés ; les métadonnées de Lupin provenaient de TMDB.
- Analyse statique sans avertissement et compilation de production réussies, avec la configuration Firebase publique du projet.
- Recherche des secrets connus retirés et de motifs de jetons Discord, webhooks et clés privées : aucune correspondance dans les fichiers contrôlés de la livraison, hors dépendances. Ce contrôle ne prétend pas reconnaître tous les formats possibles de secret.

## Sécurité et intégrité corrigées

### Authentification — priorité élevée

L’ancienne connexion pouvait créer un compte local si Firebase était indisponible. L’application acceptait aussi une identité depuis `localStorage`, conservait une empreinte rapide des mots de passe avec un repli en clair et possédait une fausse connexion Google avec une identité fixe. Ces mécanismes ont été supprimés. Seul l’état Firebase établit désormais la session ; ses erreurs ne créent plus de compte local. Les anciennes entrées de cache contenant les comptes et mots de passe sont retirées à l’ouverture de cette version.

Le problème concernait la confiance de l’interface dans une identité locale. Cela ne démontre pas, à lui seul, que les règles Firebase de production autorisaient l’accès aux données d’un autre compte. Fichier principal : `src/features/auth/AuthContext.jsx`.

### Secrets — retrait effectué, rotation externe indispensable

Une clé TMDB, un jeton Discord et un webhook figuraient dans les sources. Ils ont été remplacés par des variables d’environnement côté serveur. Le navigateur passe par le proxy `/api/tmdb` et n’embarque plus de clé TMDB. Le script de configuration Discord ne réécrit plus le jeton dans son JSON.

Retirer ces valeurs du code ne révoque pas les identifiants existants. Il faut les renouveler dans les services concernés, puis mettre à jour l’hébergement. Aucun accès aux consoles administrateur n’a été utilisé pour cela. La configuration publique Firebase a été conservée : elle identifie l’application et ne remplace pas les règles d’autorisation. [Documentation Vite sur l’exposition des variables](https://vite.dev/guide/env-and-mode).

### Firestore — règles renforcées et testées localement

Les mises à jour ne peuvent plus changer le propriétaire d’un profil, d’un avis ou d’une progression. La création d’un avis et d’une progression vérifie la propriété du profil référencé. Les notes, la taille des commentaires, les champs autorisés des avis et leur horodatage sont vérifiés. Les statistiques acceptent une création à 1 et une augmentation de 1, et non une valeur arbitraire. Le client utilise un horodatage serveur compatible avec ces règles.

Les nouvelles règles et l’index de progression sont fournis. Ils restent à publier. Les anciens documents `progress` sans propriétaire explicite nécessitent éventuellement une migration administrative. [Référence Firebase sur la validation des champs](https://firebase.google.com/docs/firestore/security/rules-fields).

### API et serveur — validation et limites

Les deux API partagent les validations : chemins TMDB limités au catalogue, paramètres acceptés explicitement, clé contrôlée côté serveur, identifiants et numéros d’épisode numériques. L’API ne permet plus d’injecter des caractères HTML dans le code iframe qu’elle renvoie. Les méthodes non prévues sont refusées, les erreurs internes ne sont plus exposées et les requêtes externes ont une durée maximale.

Le cache est limité à 250 entrées ; une limitation de requêtes par processus est ajoutée. Les chemins statiques sont contrôlés après décodage et résolution réelle, avec refus des sorties des dossiers publiés. Les redirections Netlify conservent le suffixe de route. Des en-têtes de protection sont ajoutés. Ces mesures ne remplacent pas un filtrage et une limitation distribués chez l’hébergeur.

### Lecteur — événements vérifiés

Le site vérifie l’origine exacte et la fenêtre émettrice des messages du lecteur avant de modifier la progression ou lancer un épisode suivant. Les durées reçues doivent être numériques, finies et cohérentes. Les sources personnalisées doivent utiliser HTTPS. L’iframe est restreinte et n’accorde plus l’accès au presse-papiers, les fenêtres surgissantes ou la navigation de la page principale.

Un chargement d’iframe réussi ne prouve pas qu’une vidéo existe ou fonctionne. Les lecteurs externes n’ont pas été utilisés pour valider la lecture réelle. Certaines intégrations peuvent demander une adaptation ciblée aux restrictions ; il ne faut pas les désactiver globalement. [Référence MDN sur les messages entre fenêtres](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).

### Cohérence des données et autres bugs

- Les films sauvegardés avec les anciennes valeurs par défaut saison 1 / épisode 1 ne sont plus automatiquement reclassés en séries.
- Les changements rapides de saison ignorent les réponses devenues obsolètes. Les épisodes sont lancés avec leur numéro réel, pas leur position dans une liste.
- Les profils ne sont plus restaurés depuis un cache global avant vérification de la session. Une nouvelle session repasse par la sélection du profil, y compris son écran PIN. Les résultats tardifs d’historique, favoris et recommandations sont écartés après un changement de contexte.
- Les profils supprimés côté cloud ne sont plus ressuscités par une liste locale lorsque la réponse distante est vide. Les mutations de profil et d’avis ne signalent plus un succès cloud après un refus d’écriture.
- Le document utilisateur est fusionné lors d’une reconnexion Google, au lieu d’être écrasé systématiquement. L’historique peut se mettre à jour localement sans lecture distante préalable bloquante.
- L’appel de suppression Firebase Auth utilise désormais l’API modulaire correcte. La purge exhaustive des données associées reste un point distinct, détaillé ci-dessous.

## Lupin et expérience de visionnage

TMDB regroupe les parties 1 et 2 dans sa saison technique 1, puis référence « Partie 3 » sous le numéro 2 et « Partie 4 » sous le numéro 3. Le nom fourni par TMDB est maintenant affiché dans la fiche et dans le panneau d’épisodes, tout en conservant les identifiants nécessaires au catalogue.

Le choix d’une partie est accessible dès le haut de la fiche, sur mobile aussi. Le bouton principal suit la partie choisie et un accès séparé permet de reprendre le dernier épisode. La progression est lisible ; les épisodes possèdent de vrais points d’accès clavier. Les états de chargement et d’erreur sont distincts, avec un bouton Réessayer. Le lecteur propose une nouvelle tentative ou une autre source lorsqu’il tarde à charger. Les commandes restent visibles lorsqu’un bouton a le focus clavier.

La palette, les grandes affiches, la typographie et l’ambiance cinéma ont été conservées. Les préférences de réduction des animations sont respectées. L’image principale est demandée en taille adaptée plutôt qu’en taille originale. Le cache initial PWA passe de **28 321,80 Kio / 453 entrées à environ 1 638,53 Kio / 32 entrées**, soit environ 94 % de moins. Ce chiffre mesure les ressources préchargées, pas le débit de lecture ni un score Lighthouse.

## Dépendances

L’audit npm initial signalait 26 paquets affectés, dont 1 critique, 15 élevés, 4 modérés et 6 faibles. Après les mises à jour compatibles, le passage à Vite 6.4.5 et le remplacement de gRPC par une version corrigée :

- Dépendances de production du site : **0 alerte npm connue** au contrôle.
- Dépendances du bot : **0 alerte npm connue** au contrôle.
- Ensemble du site, outils de compilation inclus : **4 alertes faibles**, liées à `deepmerge` et à sa chaîne de dépendances PWA. Aucun correctif officiel de `deepmerge` n’était publié au contrôle ; un retour forcé à d’anciennes versions incompatibles n’a pas été appliqué. [Avis de sécurité deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

La livraison cible Node.js 24, avec validation locale sous 24.22.2. Le conteneur du bot a aussi été actualisé. Node.js 20 présent sur la machine est en fin de vie selon le calendrier officiel ; l’installation globale de la machine n’a pas été modifiée. [Versions Node.js](https://nodejs.org/en/about/previous-releases).

## Points restant à traiter avant une promesse de service à grande échelle

1. **Déploiement et secrets.** Publier les nouvelles fonctions et règles, renouveler les identifiants exposés, contrôler les données anciennes. Ces opérations n’ont pas été réalisées sur les services en ligne.
2. **Contrôle parental.** Le PIN et le filtrage enfant restent principalement des contrôles d’interface. Le titulaire du même compte peut accéder aux documents de ses profils et donc au PIN stocké. Une garantie forte exige un service de vérification et des autorisations distinctes côté serveur.
3. **Suppression des données.** Supprimer l’identité Firebase Auth ne purge pas automatiquement les profils, avis, historiques et caches. Prévoir un traitement serveur de suppression complète et vérifiable avant de promettre un effacement global.
4. **Fiabilité multiappareil.** Certaines listes utilisent encore un document contenant un tableau complet : des mises à jour simultanées peuvent se remplacer. Une migration vers des écritures par élément et des identifiants `type:tmdbId` évitera aussi les collisions possibles entre films et séries portant le même identifiant numérique.
5. **Abus et supervision.** Le compteur de vues reste alimenté par les clients authentifiés ; il peut être gonflé par répétition. La limitation de requêtes actuelle est locale à chaque instance. Ajouter une protection partagée, des métriques, des alertes et des tests de charge avant une montée en trafic importante.
6. **Prestataires vidéo.** Leur disponibilité, leurs formats d’événements, la qualité réellement servie et leur numérotation doivent être vérifiés en situation réelle. Les libellés de qualité sont déclaratifs. L’affichage du catalogue ne garantit pas la lecture.
7. **Périmètre des tests.** Les parcours vidéo réels, les connexions Google sur le domaine final, les consoles d’hébergement, les sauvegardes, les appareils TV et les tests d’intrusion/charge ne sont pas couverts par cette livraison locale. Les aperçus utilisent une session fictive de validation.

Les détails de mise en ligne se trouvent dans `LIRE-AVANT-DEPLOIEMENT.md`. Les résultats bruts et les tests sont inclus dans le dossier `verification` et dans `tests`.
