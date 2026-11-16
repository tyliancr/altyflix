# ALTYFLIX — audit de publication du 4 novembre 2026

Le site public répond sur https://altyflix.netlify.app. Le déploiement Netlify 6aeb7371e3742f3b9cccf687 provient de la compilation de Downloads/altyflix. La prévisualisation et la production servent le même fichier d’entrée index-CSr950td.js. La clé TMDB a été configurée dans le contexte de production. Le paquet envoyé contient les ressources compilées et la fonction, avec son module serveur. La clé privée TMDB et le fichier .env ont été recherchés et exclus du paquet.

## Parcours et disponibilité

Sur le domaine public, Chrome atteint la connexion sans exception JavaScript. Les trois avatars signalés renvoient de vrais PNG. Le catalogue populaire fournit des résultats et Lupin Partie 4 renvoie huit épisodes. La fonction de lecture retourne une liste de sources pour le premier épisode. Cela vérifie la découverte des sources. Le démarrage de la vidéo et sa continuité chez les différents fournisseurs restent à mesurer.

Les parcours de détail, de reprise au clavier sur mobile, de fermeture du lecteur et de récupération après une panne du catalogue ont été exercés en navigateur avec un profil de test local. Les vérifications précédentes sur le dossier publié incluent 13 tests applicatifs, le lint et la compilation. Les achats, abonnements, applications TV et engagements de disponibilité ne font pas partie de ce site testé.

## Accès et sécurité

Une route d’authentification TMDB hors périmètre est refusée par le proxy sur le domaine public. La page de connexion renvoie nosniff, DENY et une politique de sécurité limitant notamment les objets embarqués et les domaines autorisés à encadrer le site. Les contrôles locaux couvrent notamment l’identité de session, les redirections, les événements de lecteur et la validation des paramètres serveur.

Les règles Firestore fournies ont la même empreinte que les règles ayant passé 29 contrôles en émulateur. Le domaine de production a été confirmé dans la configuration publique Firebase lors du diagnostic. La connexion avec un compte réel, l’isolation des données sur la base distante, les règles et index effectivement publiés et la reprise entre deux appareils restent à valider avec un compte de test. Cette publication Netlify ne déploie pas Firestore.

## Dépendances et risques ouverts

L’audit npm du jour sur les dépendances de production signale zéro vulnérabilité connue. Avec les dépendances de développement, il signale 18 alertes modérées et 2 faibles, notamment dans les chaînes ESLint et Workbox. Traiter ces mises à niveau séparément avec des tests de compilation et de cache. Le décompte actuel remplace les anciens chiffres du rapport du 30 octobre.

La clé TMDB utilisée avait déjà été exposée dans les anciens fichiers. La remplacer chez TMDB et mettre à jour les contextes Netlify et le .env local. Renouveler également les anciens secrets Discord si le bot est utilisé. Le PIN de profil reste un contrôle local. La suppression d’un compte ne garantit pas l’effacement de tous ses documents et certaines écritures de listes simultanées peuvent se remplacer. Les limitations de débit par instance et les compteurs alimentés par les clients ne constituent pas une protection à grande échelle.

## Avant une ouverture à grande échelle

Faire un parcours avec un compte de test sur deux appareils, chronométrer le démarrage réel des vidéos et les interruptions, puis tester la charge. Contrôler les sauvegardes et leur restauration ainsi que les droits de diffusion du catalogue distribué. Aucun test de charge, test d’intrusion complet, audit de droits ou audit d’accessibilité exhaustif n’a été réalisé dans cette publication.
