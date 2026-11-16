import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, 'bot-config.json'), 'utf8'));

const APP_ID = '1554110227354230834';
const GUILD_ID = config.guildId;
const TOKEN = process.env.DISCORD_TOKEN;

const commands = [
  // ─── Commandes Existantes ───────────────────────────────────────────────
  {
    name: 'recherche',
    description: '🔍 Rechercher un film ou une série sur AltyFlix',
    options: [
      {
        name: 'titre',
        description: 'Le nom du film ou de la série',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'suggerer',
    description: '💡 Proposer l\'ajout d\'un film ou série (recherche et lie directement à TMDB)',
    options: [
      {
        name: 'titre',
        description: 'Le titre du film ou de la série à suggérer',
        type: 3,
        required: true,
      },
      {
        name: 'commentaire',
        description: 'Pourquoi souhaites-tu cet ajout ? (optionnel)',
        type: 3,
        required: false,
      },
    ],
  },
  {
    name: 'ticket',
    description: '📩 Ouvrir un ticket de support privé avec l\'équipe Staff',
    options: [
      {
        name: 'motif',
        description: 'La raison de ta demande',
        type: 3,
        required: false,
      },
    ],
  },
  {
    name: 'film-au-hasard',
    description: '🎲 Choisis un film surprise parmi les mieux notés',
  },
  {
    name: 'serie-au-hasard',
    description: '🎲 Choisis une série surprise parmi les tendances',
  },
  {
    name: 'nouveautes',
    description: '🍿 Afficher les dernières nouveautés disponibles sur AltyFlix',
  },
  {
    name: 'stats',
    description: '📊 Afficher les statistiques de la plateforme AltyFlix',
  },
  {
    name: 'site',
    description: '🌐 Lien direct et statut de la plateforme AltyFlix',
  },
  {
    name: 'aide',
    description: '💡 Liste complète des 26 commandes et fonctionnalités du bot AltyFlix',
  },
  {
    name: 'post-nouveautes',
    description: '⚡ [Staff] Publier manuellement les dernières sorties 4K dans #nouveautés',
  },
  {
    name: 'post-film-du-jour',
    description: '🎬 [Staff] Publier le Film / la Série Coup de Cœur du jour',
  },
  {
    name: 'sondage',
    description: '📊 Créer un sondage cinéma avec réactions interactives',
    options: [
      { name: 'question', description: 'La question du sondage', type: 3, required: true },
      { name: 'choix1', description: 'Option A', type: 3, required: true },
      { name: 'choix2', description: 'Option B', type: 3, required: true },
      { name: 'choix3', description: 'Option C (optionnel)', type: 3, required: false },
      { name: 'choix4', description: 'Option D (optionnel)', type: 3, required: false },
    ],
  },
  {
    name: 'purge',
    description: '🧹 [Staff] Nettoyer un nombre de messages dans ce salon',
    options: [
      { name: 'nombre', description: 'Nombre de messages à supprimer (1 à 100)', type: 4, required: true },
    ],
  },

  // ─── Fonctionnalités Élite & Mini-Jeux ───────────────────────────────────
  {
    name: 'quiz',
    description: '🎬 Grand Quiz Cinéma Interactif (Affiches, Casting, Slogans, Anecdotes folles)',
    options: [
      {
        name: 'mode',
        description: 'Catégorie du quiz cinéma',
        type: 3,
        required: false,
        choices: [
          { name: '🎲 Hasard Total (Des millions de combinaisons)', value: 'hasard' },
          { name: '🖼️ Trouver le Film par l\'Affiche / Scène', value: 'affiche' },
          { name: '👥 Casting Mystère (Acteurs)', value: 'casting' },
          { name: '🎬 Qui est le Réalisateur ?', value: 'realisateur' },
          { name: '📜 Slogan & Accroche Culte', value: 'slogan' },
          { name: '🤣 Anecdotes Drôles & Insolites de Tournage', value: 'drole' },
          { name: '🧩 Devine le Film par les Émojis', value: 'emojis' },
        ],
      },
    ],
  },
  {
    name: 'quizz',
    description: '🎬 Grand Quiz Cinéma Interactif (Alias /quiz)',
    options: [
      {
        name: 'mode',
        description: 'Catégorie du quiz cinéma',
        type: 3,
        required: false,
        choices: [
          { name: '🎲 Hasard Total (Des millions de combinaisons)', value: 'hasard' },
          { name: '🖼️ Trouver le Film par l\'Affiche / Scène', value: 'affiche' },
          { name: '👥 Casting Mystère (Acteurs)', value: 'casting' },
          { name: '🎬 Qui est le Réalisateur ?', value: 'realisateur' },
          { name: '📜 Slogan & Accroche Culte', value: 'slogan' },
          { name: '🤣 Anecdotes Drôles & Insolites de Tournage', value: 'drole' },
          { name: '🧩 Devine le Film par les Émojis', value: 'emojis' },
        ],
      },
    ],
  },
  {
    name: 'recommande',
    description: '🍿 Moteur intelligent : que regarder ce soir selon ton humeur ?',
    options: [
      {
        name: 'humeur',
        description: 'Ton humeur ou ambiance recherchée',
        type: 3,
        required: false,
        choices: [
          { name: '😱 Frissons & Suspense (Horreur/Thriller)', value: 'frissons' },
          { name: '😂 Comédie & Détente (Rires)', value: 'comedie' },
          { name: '💥 Action & Blockbuster (Adrénaline)', value: 'action' },
          { name: '🧠 Mindfuck & Psychologique (Intrigue)', value: 'mindfuck' },
          { name: '💖 Romance & Feel-Good (Émotion)', value: 'romance' },
          { name: '🚀 Sci-Fi & Aventure (Voyage)', value: 'scifi' },
        ],
      },
    ],
  },
  {
    name: 'trailer',
    description: '🎬 Regarder la bande-annonce vidéo officielle en 1 clic',
    options: [
      {
        name: 'titre',
        description: 'Nom du film ou de la série',
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: 'sorties',
    description: '📅 Calendrier des prochaines sorties cinéma et séries les plus attendues',
    options: [
      {
        name: 'periode',
        description: 'Période des sorties',
        type: 3,
        required: false,
        choices: [
          { name: 'Cette semaine (J-7)', value: 'semaine' },
          { name: 'Ce mois-ci', value: 'mois' },
        ],
      },
    ],
  },
  {
    name: 'avis',
    description: '⭐ Publier ta critique d\'un film ou série avec vote de la communauté',
    options: [
      {
        name: 'titre',
        description: 'Nom du film ou de la série',
        type: 3,
        required: true,
      },
      {
        name: 'note',
        description: 'Ta note sur 10 (ex: 8)',
        type: 4,
        required: true,
        min_value: 0,
        max_value: 10,
      },
      {
        name: 'commentaire',
        description: 'Ton avis critique détaillé (optionnel)',
        type: 3,
        required: false,
      },
    ],
  },
  {
    name: 'match',
    description: '🔥 Tinder du Cinéma : trouve un film qui plaît à toi et ton ami(e)',
    options: [
      {
        name: 'ami',
        description: 'L\'ami(e) avec qui regarder un film',
        type: 6, // USER
        required: true,
      },
    ],
  },
  {
    name: 'popcorn',
    description: '🍿 Ton solde de Popcorn Coins et réclamation du bonus quotidien (+50)',
  },
  {
    name: 'shop',
    description: '🛍️ Boutique AltyFlix : dépense tes Popcorns pour débloquer des rôles exclusifs',
  },
  {
    name: 'alerte',
    description: '🔔 Être notifié dès qu\'un film ou série sort en 4K sur AltyFlix',
    options: [
      {
        name: 'titre',
        description: 'Le titre du film ou de la série attendu(e)',
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: 'ticket-cine',
    description: '🎟️ Générer ton Billet de Cinéma collector personnalisé AltyFlix',
    options: [
      {
        name: 'film',
        description: 'Titre du film',
        type: 3,
        required: true,
      },
      {
        name: 'note',
        description: 'Note accordée (0 à 10)',
        type: 4,
        required: true,
        min_value: 0,
        max_value: 10,
      },
    ],
  },
  {
    name: 'cine-club',
    description: '🍿 Planifier une séance collective dans le salon vocal avec compte à rebours',
    options: [
      {
        name: 'film',
        description: 'Titre du film pour la séance',
        type: 3,
        required: true,
      },
      {
        name: 'heure',
        description: 'Heure de la séance (ex: 21h00)',
        type: 3,
        required: false,
      },
    ],
  },
  // ─── 2 Nouvelles Commandes Essentielles ────────────────────────────────────
  {
    name: 'ping',
    description: '🏓 Tester la latence Gateway et l\'état de santé du bot AltyFlix',
  },
  {
    name: 'top-popcorn',
    description: '🏆 Afficher le Top 10 des membres les plus riches en Popcorns',
  },
];

async function registerCommands() {
  console.log(`⚡ Enregistrement des ${commands.length} commandes Slash Discord AltyFlix...`);
  const res = await fetch(`https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('❌ Erreur lors de l’enregistrement :', err);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`✅ ${data.length} commandes Slash enregistrées avec succès sur le serveur !`);
  data.forEach((c, idx) => console.log(`   ${idx + 1}. /${c.name}`));
}

registerCommands();
