# Organisation du projet

Le nettoyage porte sur la copie corrigée, jamais sur le dossier original de Téléchargements.

## Changements

- Scripts Discord et outils de génération de logos sortis du site et conservés dans les annexes.
- Quatre fichiers source non atteignables depuis le point d'entrée archivés : `App.css`, `utils/theme.js`, `assets/styles/netflix-intro.css` et `components/common/LoadingSpinner.jsx`.
- Ancien manifeste statique archivé : le manifeste est désormais défini uniquement dans `vite.config.js` et injecté par le plugin PWA.
- Audit et guide regroupés dans `docs`. README remplacé pour retirer les instructions obsolètes, les liens inexistants et la configuration TMDB publique.
- 21 chemins d'avatars corrigés pour respecter la casse des fichiers. Redirections de compatibilité ajoutées sur Netlify et le serveur Node pour les profils déjà enregistrés.
- Commande `npm run check` ajoutée pour vérifier structure, avatars, lint, tests et compilation.
- Archive source sans dépendances, compilation, journaux, bases locales ni secrets. Ces exclusions ne suppriment pas les fichiers nécessaires au développement local.

## Ressources conservées volontairement

Les avatars présents dans `public` peuvent être référencés dans des profils existants, même s'ils ne figurent plus dans le sélecteur. Ils sont conservés, ainsi que les ressources de marque publiques, afin de ne pas casser ces URL. Supprimer ces fichiers demande d'abord un inventaire des références en base de production.

## Qualité produit

Le prochain niveau de qualité doit être mesuré sur les parcours réels : démarrage de lecture, interruptions, reprise sur plusieurs appareils, accessibilité au clavier et à la télécommande, disponibilité et assistance. La direction artistique seule ne démontre pas une expérience supérieure aux plateformes de référence. Les limites techniques encore connues sont consignées dans l'audit ; aucune capacité de diffusion supplémentaire n'est revendiquée par ce nettoyage.
