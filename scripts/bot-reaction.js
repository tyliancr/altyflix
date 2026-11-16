/**
 * bot-reaction.js - ALTYFLIX ULTIMATE 24/7 MASTER BOT
 * ─────────────────────────────────────────────────────────────────────────────
 * • Système Auto-Poster 24/7 (Nouveautés 4K, Film & Série du Jour, Débats cinéma)
 * • Système de vérification du règlement par Bouton Interactif ✅ & Réaction
 * • Panneau de rôles de notification interactif (Boutons [Nouveautés], [Annonces], [Mises à jour])
 * • Système de Tickets Privés (création salon, attribution rôles, bouton fermeture)
 * • Système de suggestions cinématographiques avec TMDB et sondages communautaires 👍/👎
 * • 13 Commandes Slash (/recherche, /suggerer, /ticket, /film-au-hasard, /serie-au-hasard,
 *   /nouveautes, /stats, /site, /aide, /post-nouveautes, /post-film-du-jour, /sondage, /purge)
 * • Statut personnalisé cyclique en temps réel
 * • Reconnexion automatique Gateway avec Heartbeat & gestion résiliente des erreurs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import { WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'bot-config.json');
const cachePath = path.join(__dirname, 'posted-cache.json');
const userDataPath = path.join(__dirname, 'user-data.json');

function loadConfig() {
  try {
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf8'));
    }
  } catch { /* ignore */ }
  return {};
}

let config = loadConfig();
const TOKEN = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID || config.guildId;
const rulesChannelId = process.env.RULES_CHANNEL_ID || config.rulesChannelId;
const verifMessageId = process.env.VERIF_MESSAGE_ID || config.verifMessageId;
const membreRoleId = process.env.MEMBRE_ROLE_ID || config.membreRoleId;
const ticketsCategoryId = process.env.TICKETS_CATEGORY_ID || config.ticketsCategoryId;
const nouveautesChannelId = process.env.NOUVEAUTES_CHANNEL_ID || config.nouveautesChannelId;
const discussionsChannelId = process.env.DISCUSSIONS_CHANNEL_ID || config.discussionsChannelId;
const filmsChannelId = process.env.FILMS_CHANNEL_ID || config.filmsChannelId;
const seriesChannelId = process.env.SERIES_CHANNEL_ID || config.seriesChannelId;
const suggestionsChannelId = process.env.SUGGESTIONS_CHANNEL_ID || config.suggestionsChannelId;
const logsChannelId = process.env.LOGS_CHANNEL_ID || config.logsChannelId;
const commandesChannelId = process.env.COMMANDES_CHANNEL_ID || config.commandesChannelId || '1563232688641679412';

const roleNouveautesId = process.env.ROLE_NOUVEAUTES_ID || config.roleNouveautesId;
const roleAnnoncesId = process.env.ROLE_ANNONCES_ID || config.roleAnnoncesId;
const roleMajId = process.env.ROLE_MAJ_ID || config.roleMajId;
const roleFilmsId = config.roleFilmsId || '1560326736409923674';
const roleSeriesId = config.roleSeriesId || '1560326739190616084';
const roleVostfrId = config.roleVostfrId || '1560326742239871087';
const roleVfId = config.roleVfId || '1560326745461366874';
const roleVipId = config.roleVipId || '1554112904943632434';
const roleRealisateurId = config.roleRealisateurId || '1545423609852330008';

const TMDB_KEY = process.env.TMDB_KEY || process.env.TMDB_API_KEY;
const SITE_URL = process.env.SITE_URL || 'https://altyflix.netlify.app';

function loadUserData() {
  try {
    if (existsSync(userDataPath)) {
      return JSON.parse(readFileSync(userDataPath, 'utf8'));
    }
  } catch { /* ignore */ }
  return { users: {}, matches: {}, reviews: {}, watchParties: {} };
}

function saveUserData(data) {
  try {
    writeFileSync(userDataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('Erreur sauvegarde userData:', err.message);
  }
}

function getUser(data, userId, username) {
  if (!data.users) data.users = {};
  if (!data.users[userId]) {
    data.users[userId] = {
      username: username || 'Membre',
      popcorn: 50,
      lastDaily: null,
      quizWins: 0,
      alerts: [],
    };
  }
  return data.users[userId];
}

const EMOJI_QUIZZES = [
  { emojis: '🚢 ❄️ 🎻', answer: 'Titanic', options: ['Titanic', 'Poséidon', 'En Pleine Mer', 'Avatar'] },
  { emojis: '🦁 👑 🌅', answer: 'Le Roi Lion', options: ['Madagascar', 'Le Roi Lion', 'Tarzan', 'Le Livre de la Jungle'] },
  { emojis: '🦖 🌴 🚙', answer: 'Jurassic Park', options: ['King Kong', 'Jurassic Park', 'Godzilla', 'Voyage au centre de la Terre'] },
  { emojis: '🧙‍♂️ 💍 🌋', answer: 'Le Seigneur des Anneaux', options: ['Harry Potter', 'Le Hobbit', 'Le Seigneur des Anneaux', 'Narnia'] },
  { emojis: '🕶️ 💊 🐇', answer: 'Matrix', options: ['Inception', 'Blade Runner', 'Matrix', 'Tenet'] },
  { emojis: '🦇 🃏 🏙️', answer: 'The Dark Knight', options: ['The Batman', 'The Dark Knight', 'Joker', 'Iron Man'] },
  { emojis: '🕷️ 🧑‍🎓 🕸️', answer: 'Spider-Man', options: ['Spider-Man', 'Venom', 'Ant-Man', 'Deadpool'] },
  { emojis: '🍫 🏭 🎫', answer: 'Charlie et la Chocolaterie', options: ['Wonka', 'Charlie et la Chocolaterie', 'Mary Poppins', 'Paddington'] },
  { emojis: '🥊 🥩 🏆', answer: 'Rocky', options: ['Creed', 'Rocky', 'Raging Bull', 'Million Dollar Baby'] },
  { emojis: '👻 🚫 🔫', answer: 'Ghostbusters', options: ['Men in Black', 'Ghostbusters', 'Beetlejuice', 'Casper'] },
  { emojis: '🎈 🤡 🌧️', answer: 'Ça (It)', options: ['Ça (It)', 'Annabelle', 'Conjuring', 'Sinister'] },
  { emojis: '🏎️ ⚡ 🕰️', answer: 'Retour vers le Futur', options: ['Retour vers le Futur', 'Fast & Furious', 'Tenet', 'Looper'] },
  { emojis: '🏹 🍎 👧', answer: 'Hunger Games', options: ['Hunger Games', 'Divergente', 'Le Labyrinthe', 'Rebelle'] },
  { emojis: '🚀 🪐 ⏳', answer: 'Interstellar', options: ['Interstellar', 'Gravity', 'Seul sur Mars', 'Ad Astra'] },
  { emojis: '🪓 🚪 ❄️', answer: 'Shining', options: ['Shining', 'Misery', 'Doctor Sleep', 'Psychose'] },
  { emojis: '🐀 👨‍🍳 🍲', answer: 'Ratatouille', options: ['Ratatouille', 'La Belle et le Clochard', 'Zootopie', 'Kung Fu Panda'] },
  { emojis: '🤖 🚗 💣', answer: 'Transformers', options: ['Transformers', 'Pacific Rim', 'Real Steel', 'Terminator'] },
  { emojis: '🥷 🐢 🍕', answer: 'Tortues Ninja', options: ['Tortues Ninja', 'Kung Fu Panda', 'Karaté Kid', 'Deadpool'] },
  { emojis: '👽 🚲 🌕', answer: 'E.T. l\'extra-terrestre', options: ['E.T. l\'extra-terrestre', 'Stranger Things', 'Super 8', 'Rencontres du 3e type'] },
  { emojis: '🧟‍♂️ 🏬 🛒', answer: 'Dawn of the Dead', options: ['Dawn of the Dead', '28 Jours Plus Tard', 'World War Z', 'Je suis une Légende'] },
];

const DROLE_QUIZZES = [
  {
    q: 'Dans "Psychose" d\'Alfred Hitchcock, de quoi était composé le faux sang dans la fameuse scène de la douche ?',
    answer: 'Du coulis de chocolat Hershey',
    options: ['Du coulis de chocolat Hershey', 'Du ketchup Heinz', 'Du sirop de fraise', 'De la peinture acrylique'],
    anecdote: 'Le film étant en noir et blanc, le chocolat offrait une densité et une viscosité visuellement plus réalistes que du vrai faux-sang !'
  },
  {
    q: 'Dans "Le Seigneur des Anneaux : Les Deux Tours", quelle blessure réelle d\'Aragorn (Viggo Mortensen) a été gardée au montage ?',
    answer: 'Deux orteils brisés en bottant un casque d\'orque',
    options: ['Deux orteils brisés en bottant un casque d\'orque', 'Une côte cassée contre un Uruk-hai', 'Une entaille de 10 cm au front', 'Une dent brisée par une épée'],
    anecdote: 'Son cri de rage dans la scène est en réalité son véritable cri de douleur quand il s\'est brisé les orteils !'
  },
  {
    q: 'Dans "Django Unchained", que s\'est-il produit quand Leonardo DiCaprio a violemment fracassé son verre sur la table ?',
    answer: 'Il s\'est profondément ouvert la paume et a continué la prise',
    options: ['Il s\'est profondément ouvert la paume et a continué la prise', 'Le verre a rebondi dans l\'œil de Jamie Foxx', 'La table en marbre s\'est brisée en deux', 'Il a éclaboussé Quentin Tarantino'],
    anecdote: 'Le sang qui dégoulinait sur sa main et qu\'il étale sur le visage de Kerry Washington était son vrai sang !'
  },
  {
    q: 'Dans "Star Wars: L\'Empire contre-attaque", quel objet insolite a été dissimulé parmi les astéroïdes par les techniciens ?',
    answer: 'Une vraie pomme de terre et une chaussure',
    options: ['Une vraie pomme de terre et une chaussure', 'Une canette de soda et un pneu', 'Une brosse à dents et un mug', 'Une télécommande et une chaussette'],
    anecdote: 'Agacé par les demandes infinies de George Lucas, un technicien d\'ILM a jeté une chaussure et une pomme de terre dans la maquette !'
  },
  {
    q: 'Sur le tournage de "Les Dents de la Mer", pourquoi Steven Spielberg a-t-il été contraint de cacher le requin ?',
    answer: 'Le requin mécanique coulait systématiquement au fond',
    options: ['Le requin mécanique coulait systématiquement au fond', 'Le faux requin avait l\'air d\'un dauphin ridicule', 'Il avait été attaqué par de vrais requins', 'Il avait pris feu à cause d\'un court-circuit'],
    anecdote: 'Ce problème technique majeur a forcé Spielberg à créer la terreur par la musique de John Williams et le point de vue subjectif !'
  },
  {
    q: 'Dans "Alien" (1979), pourquoi les acteurs étaient-ils réellement pétrifiés lors de la scène du Chestburster ?',
    answer: 'Ridley Scott ne leur avait pas dit que du vrai sang allait gicler',
    options: ['Ridley Scott ne leur avait pas dit que du vrai sang allait gicler', 'La marionnette a failli crever un œil à l\'acteur', 'Un court-circuit a électrisé la table', 'L\'odeur de boyaux de porc les a fait vomir'],
    anecdote: 'Veronica Cartwright a reçu un jet de sang au visage et s\'est évanouie de terreur pure !'
  },
  {
    q: 'Dans "The Dark Knight", que fait Heath Ledger (Joker) quand l\'explosion de l\'hôpital a un raté de déclenchement ?',
    answer: 'Il improvise en secouant le détonateur avec agacement',
    options: ['Il improvise en secouant le détonateur avec agacement', 'Il sursaute et s\'enfuit en courant', 'Il regarde la caméra en ricanant', 'Il hurle sur l\'équipe technique'],
    anecdote: 'Nolan a gardé la scène intacte au montage : c\'est devenu l\'un des moments les plus cultes du cinéma mondial !'
  },
  {
    q: 'Dans "Titanic", que fait Kate Winslet dès sa première rencontre avec Leonardo DiCaprio pour briser la glace ?',
    answer: 'Elle lui a flashé ses seins pour être à l\'aise pour la scène du dessin',
    options: ['Elle lui a flashé ses seins pour être à l\'aise pour la scène du dessin', 'Elle lui a renversé un café bouillant dessus', 'Elle lui a fait une clé de bras', 'Elle a imité Céline Dion en hurlant'],
    anecdote: 'Sachant qu\'elle allait devoir poser nue devant lui quelques jours plus tard, elle a préféré évacuer toute gêne immédiatement !'
  },
  {
    q: 'Dans "Halloween" (1978), quel masque célèbre a été repeint en blanc pour créer le visage de Michael Myers ?',
    answer: 'Un masque du Capitaine Kirk (William Shatner de Star Trek)',
    options: ['Un masque du Capitaine Kirk (William Shatner de Star Trek)', 'Un masque de Richard Nixon', 'Un masque de Ronald Reagan', 'Un masque du monstre de Frankenstein'],
    anecdote: 'Acheté 1,98 $ dans un magasin de déguisements, ils ont élargi les yeux, arraché les favoris et peint le masque en blanc !'
  },
  {
    q: 'Dans "Rocky IV", pourquoi Sylvester Stallone a-t-il été hospitalisé 4 jours en soins intensifs ?',
    answer: 'Dolph Lundgren (Drago) l\'a frappé si fort au torse que son cœur a enflé',
    options: ['Dolph Lundgren (Drago) l\'a frappé si fort au torse que son cœur a enflé', 'Il s\'est rompu le tendon d\'Achille sur le ring', 'Il s\'est déshydraté et est tombé dans le coma', 'Une barre de projecteur lui est tombée dessus'],
    anecdote: 'Stallone lui avait demandé de le cogner pour de vrai. Son sternum a cogné son cœur et ses constantes étaient celles d\'un accident de voiture !'
  },
  {
    q: 'Dans "Terminator 2", quel bruitage insolite a créé le son du T-1000 se faufilant à travers les barreaux ?',
    answer: 'De la nourriture pour chien expulsée lentement d\'une boîte de conserve',
    options: ['De la nourriture pour chien expulsée lentement d\'une boîte de conserve', 'Des spaghettis cuits écrasés dans un gant', 'Du liquide vaisselle aspiré avec une paille', 'De la pâte à modeler pétrie dans de la glue'],
    anecdote: 'Le designer sonore Gary Rydstrom a utilisé une boîte de pâtée pour chien pour produire cet effet de métal liquide mythique !'
  },
  {
    q: 'Dans "Le Parrain", d\'où provenait la véritable tête de cheval trouvée dans les draps de Jack Woltz ?',
    answer: 'D\'une usine d\'aliments pour chiens qui allait l\'équarrir',
    options: ['D\'une usine d\'aliments pour chiens qui allait l\'équarrir', 'D\'un haras privé de Francis Ford Coppola', 'D\'une réplique en latex à 40 000 dollars', 'D\'un cheval de course mort la veille d\'une crise cardiaque'],
    anecdote: 'L\'acteur John Marley pensait répéter avec une fausse tête : ses cris d\'horreur au réveil sont 100% authentiques !'
  },
  {
    q: 'Dans "Jurassic Park", de quels animaux provient le cri mythique du Tyrannosaure Rex ?',
    answer: 'Un bébé éléphant mixé avec un tigre et un alligator',
    options: ['Un bébé éléphant mixé avec un tigre et un alligator', 'Un lion en train de rugir dans une caverne', 'Un bison en colère et un ours polaire', 'Un chameau enrhumé ralenti 10 fois'],
    anecdote: 'Le cri aigu au début est celui d\'un bébé éléphant, le grondement profond est un rugissement d\'alligator !'
  },
  {
    q: 'Dans "Fight Club", quelle compétence étonnante Brad Pitt et Edward Norton ont-ils dû apprendre ensemble ?',
    answer: 'La saponification artisanale (fabriquer de vrais savons)',
    options: ['La saponification artisanale (fabriquer de vrais savons)', 'La serrurerie et le crochetage de portes', 'La pose de bombes pyrotechniques', 'La boxe anglaise avec Mike Tyson'],
    anecdote: 'Les deux acteurs sont devenus de véritables experts en fabrication de savons à partir de graisse !'
  },
  {
    q: 'Dans "Interstellar", qu\'est devenue l\'immense ferme de maïs plantée par Christopher Nolan pour le film ?',
    answer: 'Nolan a récolté le maïs et l\'a vendu avec un énorme bénéfice net',
    options: ['Nolan a récolté le maïs et l\'a vendu avec un énorme bénéfice net', 'Toute la récolte a été ravagée par un orage réel', 'Elle a été brûlée pour les besoins du film', 'Elle a été offerte à des banques alimentaires'],
    anecdote: 'Nolan a planté 500 acres de vrai maïs et a tiré un gros profit de la vente de la récolte après le tournage !'
  },
  {
    q: 'Dans "Le Loup de Wall Street", que snifait réellement Leonardo DiCaprio dans les scènes de fête ?',
    answer: 'De la poudre de vitamine B écrasée (il a fini avec une bronchite)',
    options: ['De la poudre de vitamine B écrasée (il a fini avec une bronchite)', 'Du sucre glace à la vanille', 'De la fécule de maïs sans sucre', 'Du sel fin raffiné'],
    anecdote: 'À force d\'en snifer des dizaines de fois par jour, ses poumons ont été saturés et il est tombé malade !'
  },
  {
    q: 'Dans "Pulp Fiction", pourquoi la scène de la piqûre d\'adrénaline dans le cœur a-t-elle été filmée à l\'envers ?',
    answer: 'Travolta retirait la seringue pour être sûr de ne pas blesser Uma Thurman',
    options: ['Travolta retirait la seringue pour être sûr de ne pas blesser Uma Thurman', 'La fausse poitrine en silicone rebondissait bizarrement', 'Tarantino n\'arrivait pas à synchroniser les battements', 'Uma Thurman avait une phobie des aiguilles'],
    anecdote: 'Le mouvement en marche arrière diffusé à l\'envers donne l\'illusion parfaite d\'un coup d\'une violence inouïe !'
  },
  {
    q: 'Dans "Matrix", qu\'a fait Keanu Reeves d\'une immense partie de son salaire sur les suites ?',
    answer: 'Il a offert des millions et des motos Harley-Davidson à l\'équipe cascades',
    options: ['Il a offert des millions et des motos Harley-Davidson à l\'équipe cascades', 'Il s\'est acheté une île privée dans le Pacifique', 'Il a fondé un studio de jeux vidéo', 'Il a racheté toutes les tenues en cuir du film'],
    anecdote: 'Estimant que les cascadeurs et monteurs faisaient tout le travail périlleux, il leur a redistribué une fortune colossale !'
  },
  {
    q: 'Dans "Les Gardiens de la Galaxie", que s\'est-il passé quand Star-Lord fait tomber l\'Orbe chez le Collectionneur ?',
    answer: 'Chris Pratt l\'a échappé par accident et l\'a rattrapé sans sortir du rôle',
    options: ['Chris Pratt l\'a échappé par accident et l\'a rattrapé sans sortir du rôle', 'L\'objet s\'est brisé et a coûté 50 000 dollars', 'C\'était écrit dans le scénario depuis le début', 'James Gunn a jeté son casque au sol de colère'],
    anecdote: 'Cette maladresse collait tellement à la personnalité insouciante de Peter Quill que James Gunn l\'a gardée !'
  },
  {
    q: 'Sur le plateau de "Mission: Impossible - Fallout", qu\'a fait Tom Cruise après s\'être fracturé la cheville en sautant ?',
    answer: 'Il s\'est relevé immédiatement et a terminé la prise en boitant devant la caméra',
    options: ['Il s\'est relevé immédiatement et a terminé la prise en boitant devant la caméra', 'Il a été héliporté inconscient', 'Il a insulté le cascadeur qui le réceptionnait', 'Il a demandé à sa doublure de recommencer'],
    anecdote: 'On voit nettement son pied se tordre à 90 degrés contre le mur de l\'immeuble dans le plan final du film !'
  }
];

const ICONIC_DIRECTORS = [
  'Christopher Nolan', 'Quentin Tarantino', 'Steven Spielberg', 'Martin Scorsese',
  'Denis Villeneuve', 'James Cameron', 'David Fincher', 'Ridley Scott',
  'Stanley Kubrick', 'Alfred Hitchcock', 'Peter Jackson', 'George Lucas',
  'Guillermo del Toro', 'Hayao Miyazaki', 'Bong Joon-ho', 'Tim Burton',
  'Francis Ford Coppola', 'Wes Anderson', 'Sam Raimi', 'Clint Eastwood'
];

const activeQuizCache = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, q] of activeQuizCache.entries()) {
    if (now - q.created > 20 * 60 * 1000) {
      activeQuizCache.delete(id);
    }
  }
}, 5 * 60 * 1000);

// ─── Cloud Web Healthcheck Server ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const healthServer = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({
    status: 'online',
    service: 'AltyFlix Discord 24/7 Master Bot',
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }));
});

healthServer.listen(PORT, () => {
  console.log(`🌐 Serveur HTTP Cloud Healthcheck actif sur le port ${PORT}`);
});

const API = 'https://discord.com/api/v10';
const WS = 'wss://gateway.discord.gg/?v=10&encoding=json';
const APP_ID = '1554110227354230834';
const STAFF_ROLE_ID = '1545423609852330007';

const COLOR_RED = 0xE50914;
const COLOR_BLUE = 0x5865F2;
const COLOR_GOLD = 0xFEE75C;
const COLOR_GREEN = 0x57F287;
const COLOR_DARK = 0x2B2D31;

let heartbeatInterval = null;
let presenceInterval = null;
let autoPostInterval = null;
let sequence = null;
let botId = '1554110227354230834';
let botAvatarUrl = 'https://cdn.discordapp.com/avatars/1554110227354230834/9a53ffc9db9769aefb3cfeb32e2f2886.png?size=512';
let lastPingTimestamp = Date.now();
let lastGatewayPing = 35;
const botStartTime = Date.now();

// ─── Cache Helpers ───────────────────────────────────────────────────────────
function loadCache() {
  try {
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf8'));
    }
  } catch { /* ignore */ }
  return { posted: [], lastDailyFilm: null, lastDebat: null };
}

function saveCache(cache) {
  try {
    writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.warn('Erreur sauvegarde cache :', err.message);
  }
}

// ─── Rich Presence Rotation ──────────────────────────────────────────────────
const ACTIVITIES = [
  { name: 'AltyFlix (Films & Séries 4K)', type: 3 }, // WATCHING
  { name: '/recherche | +100 000 titres', type: 3 },
  { name: 'altyflix.netlify.app 🍿', type: 0 },       // PLAYING
  { name: '/aide | Support 24/7', type: 3 },
  { name: '/suggerer | TMDB connecté', type: 3 },
];
let currentActivityIndex = 0;

function sendPresence(ws) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const activity = ACTIVITIES[currentActivityIndex];
  currentActivityIndex = (currentActivityIndex + 1) % ACTIVITIES.length;

  ws.send(JSON.stringify({
    op: 3,
    d: {
      since: null,
      activities: [{
        name: activity.name,
        type: activity.type,
      }],
      status: 'online',
      afk: false,
    },
  }));
}

// ─── TMDB Helpers ────────────────────────────────────────────────────────────
async function tmdbFetch(endpoint, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
  url.searchParams.set('api_key', TMDB_KEY);
  url.searchParams.set('language', 'fr-FR');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function ratingStars(vote) {
  const stars = Math.round((vote || 0) / 2);
  return '⭐'.repeat(Math.min(stars, 5)) + '☆'.repeat(Math.max(0, 5 - stars));
}

const CULT_MOVIES_POOL = [
  {
    title: "Interstellar",
    year: "2014",
    poster: "https://image.tmdb.org/t/p/w500/1pnigkWWy8W032o9TKDneBa3eVK.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/8sNiAPPYU14PUepFNeSNGUTiHW.jpg",
    director: "Christopher Nolan",
    cast: ["Matthew McConaughey", "Anne Hathaway", "Jessica Chastain", "Michael Caine"],
    tagline: "La fin de la Terre ne sera pas notre fin.",
    anecdote: "Pour la musique, Christopher Nolan a demandé à Hans Zimmer de composer sur le thème d'un père quittant son enfant, sans lui dire que c'était de la science-fiction !"
  },
  {
    title: "Inception",
    year: "2010",
    poster: "https://image.tmdb.org/t/p/w500/aej3LRUga5rhgkmRP6XMFw3ejbl.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg",
    director: "Christopher Nolan",
    cast: ["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page", "Tom Hardy"],
    tagline: "Votre esprit est la scène du crime.",
    anecdote: "Le couloir rotatif a été réellement construit : une centrifugeuse de 30 mètres actionnée par des moteurs électriques géants !"
  },
  {
    title: "Titanic",
    year: "1997",
    poster: "https://image.tmdb.org/t/p/w500/vpsvHLkoeKUjceIMeNSqCp3xEyY.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/sCzcYW9h55WcesOqA12cgEr9Exw.jpg",
    director: "James Cameron",
    cast: ["Leonardo DiCaprio", "Kate Winslet", "Billy Zane", "Kathy Bates"],
    tagline: "Rien sur Terre ne saurait les séparer.",
    anecdote: "La réplique « Je suis le maître du monde ! » était une pure improvisation de James Cameron sur le tournage."
  },
  {
    title: "The Dark Knight : Le Chevalier noir",
    year: "2008",
    poster: "https://image.tmdb.org/t/p/w500/pyNXnq8QBWoK3b37RS6C3axwUOy.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/9FE5eD92WfVCiivM9Pq9GVSrlWk.jpg",
    director: "Christopher Nolan",
    cast: ["Christian Bale", "Heath Ledger", "Aaron Eckhart", "Michael Caine"],
    tagline: "Pourquoi cet air si sérieux ?",
    anecdote: "Heath Ledger s'est isolé seul pendant 43 jours dans un hôtel londonien pour créer la psychologie de son Joker."
  },
  {
    title: "Pulp Fiction",
    year: "1994",
    poster: "https://image.tmdb.org/t/p/w500/plNelbvBbt41zY9nKsfI9aW3bK7.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg",
    director: "Quentin Tarantino",
    cast: ["John Travolta", "Samuel L. Jackson", "Uma Thurman", "Bruce Willis"],
    tagline: "Vous ne saurez la vérité que si vous l'avez vu.",
    anecdote: "Le passage biblique d'Ézéchiel 25:17 a été presque entièrement inventé par Quentin Tarantino !"
  },
  {
    title: "Matrix",
    year: "1999",
    poster: "https://image.tmdb.org/t/p/w500/pEoqbqtLc4CcwDUDqxmEDSWpWTZ.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/tlm8UkiQsitc8rSuIAscQDCnP8d.jpg",
    director: "Lana Wachowski",
    cast: ["Keanu Reeves", "Laurence Fishburne", "Carrie-Anne Moss", "Hugo Weaving"],
    tagline: "Libérez votre esprit.",
    anecdote: "Le célèbre code vert qui défile à l'écran provient en réalité de recettes de sushis numérisées !"
  },
  {
    title: "Fight Club",
    year: "1999",
    poster: "https://image.tmdb.org/t/p/w500/bptfVGEQuv6vDTIMVCHjJ9Dz8PX.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/hZkgoQYus5vegHoetLkCJzb17zJ.jpg",
    director: "David Fincher",
    cast: ["Brad Pitt", "Edward Norton", "Helena Bonham Carter", "Meat Loaf"],
    tagline: "L'espièglerie, le désordre, la révolution.",
    anecdote: "Une tasse de café Starbucks apparaît discrètement dans presque tous les plans du film !"
  },
  {
    title: "Gladiator",
    year: "2000",
    poster: "https://image.tmdb.org/t/p/w500/ty8TGRuvJLPUmAR1H1nRIsgwvim.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/k7vdjXk0XlJ9x23fQ16yWqC9eR0.jpg",
    director: "Ridley Scott",
    cast: ["Russell Crowe", "Joaquin Phoenix", "Connie Nielsen", "Oliver Reed"],
    tagline: "Ce que nous faisons dans notre vie résonne dans l'éternité.",
    anecdote: "Russell Crowe a été réellement blessé au visage par des branches d'arbres quand son cheval s'est emballé."
  },
  {
    title: "Django Unchained",
    year: "2012",
    poster: "https://image.tmdb.org/t/p/w500/vRXUnWrXUgXRoX0BaEcuNMfyeQt.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/2oZklIzUbvZXXzIFzv7Hi68d6xf.jpg",
    director: "Quentin Tarantino",
    cast: ["Jamie Foxx", "Christoph Waltz", "Leonardo DiCaprio", "Samuel L. Jackson"],
    tagline: "La vie, la liberté et la poursuite de la vengeance.",
    anecdote: "DiCaprio s'est profondément entaillé la main avec un verre brisé lors d'une tirade et a continué de jouer sans broncher !"
  },
  {
    title: "Le Seigneur des anneaux : La Communauté de l'anneau",
    year: "2001",
    poster: "https://image.tmdb.org/t/p/w500/5OPg6M0yHr21Ovs1fni2H1xpKuF.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/oiwc338EoBgS4sEI2ixAny4KQKg.jpg",
    director: "Peter Jackson",
    cast: ["Elijah Wood", "Ian McKellen", "Viggo Mortensen", "Orlando Bloom"],
    tagline: "Un Anneau pour les gouverner tous.",
    anecdote: "Tous les membres de la Communauté se sont fait tatouer le chiffre 9 en elfique à la fin du tournage."
  },
  {
    title: "Le Parrain",
    year: "1972",
    poster: "https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/tmU7GeKVybMWFButWEGl2M4GeiP.jpg",
    director: "Francis Ford Coppola",
    cast: ["Marlon Brando", "Al Pacino", "James Caan", "Robert Duvall"],
    tagline: "Une offre que vous ne pourrez pas refuser.",
    anecdote: "Le chat dans les bras de Don Corleone était un chat errant des studios Paramount qui ronronnait très fort !"
  },
  {
    title: "Forrest Gump",
    year: "1994",
    poster: "https://image.tmdb.org/t/p/w500/saHP97rTPS5eLmrLQEcANmKrsFl.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/qdIMIH40urn5scUMXY9Kp65ZsvT.jpg",
    director: "Robert Zemeckis",
    cast: ["Tom Hanks", "Robin Wright", "Gary Sinise", "Sally Field"],
    tagline: "La vie, c'est comme une boîte de chocolats...",
    anecdote: "Tom Hanks a accepté un pourcentage des bénéfices au lieu d'un salaire, empochant plus de 40 millions de dollars."
  },
  {
    title: "Le Silence des Agneaux",
    year: "1991",
    poster: "https://image.tmdb.org/t/p/w500/uS9m8OBk1A8eM9I042bx8XXpqAq.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/mfwq2nMBzArGQay6EbCknH670Qz.jpg",
    director: "Jonathan Demme",
    cast: ["Jodie Foster", "Anthony Hopkins", "Scott Glenn", "Ted Levine"],
    tagline: "Pour entrer dans l'esprit d'un tueur, elle doit en défier un autre.",
    anecdote: "Anthony Hopkins n'est présent que 16 minutes à l'écran, suffisant pour remporter l'Oscar du Meilleur Acteur !"
  },
  {
    title: "Retour vers le Futur",
    year: "1985",
    poster: "https://image.tmdb.org/t/p/w500/mB1ZzK2gQ0K6W2hWf9zH7sD8aA.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/5F6D9gNfZtP6461v83yH52c0kQp.jpg",
    director: "Robert Zemeckis",
    cast: ["Michael J. Fox", "Christopher Lloyd", "Lea Thompson", "Crispin Glover"],
    tagline: "Là où on va, on n'a pas besoin de route !",
    anecdote: "Dans la version originale du script, la machine à voyager dans le temps était un simple réfrigérateur !"
  },
  {
    title: "Jurassic Park",
    year: "1993",
    poster: "https://image.tmdb.org/t/p/w500/c77sL00FkLq5qO5iX9tA0n2D5gR.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/y2A28Qf3Z3z91rJv8W5145E0y.jpg",
    director: "Steven Spielberg",
    cast: ["Sam Neill", "Laura Dern", "Jeff Goldblum", "Richard Attenborough"],
    tagline: "Une aventure commencée il y a 65 millions d'années.",
    anecdote: "Le cri du T-Rex a été produit en mixant les sons d'un bébé éléphant, d'un tigre et d'un alligator."
  },
  {
    title: "Avatar",
    year: "2009",
    poster: "https://image.tmdb.org/t/p/w500/7N8L80OaG8EBTDdRBjGqT8PBzCM.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/vL5LR6WdxWPjLPFRLe133jXWsh5.jpg",
    director: "James Cameron",
    cast: ["Sam Worthington", "Zoe Saldana", "Sigourney Weaver", "Stephen Lang"],
    tagline: "Entrez dans un monde au-delà de votre imagination.",
    anecdote: "James Cameron a repoussé le tournage de plus de 10 ans pour attendre que les effets visuels soient au point."
  },
  {
    title: "Shutter Island",
    year: "2010",
    poster: "https://image.tmdb.org/t/p/w500/kve20tXwUZpu4GUX8l6X7ZgM3k3.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/4k4yUaH7l9zM6D63EaQpT2f5n9.jpg",
    director: "Martin Scorsese",
    cast: ["Leonardo DiCaprio", "Mark Ruffalo", "Ben Kingsley", "Michelle Williams"],
    tagline: "Quelqu'un disparaît.",
    anecdote: "Tout au long du film, l'eau et le feu symbolisent la vérité et l'illusion construite par le personnage."
  },
  {
    title: "Intouchables",
    year: "2011",
    poster: "https://image.tmdb.org/t/p/w500/1wP69Zc1mD7j5hXgY8uT8bK5A6.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/8ZkgoQYus5vegHoetLkCJzb17zJ.jpg",
    director: "Olivier Nakache",
    cast: ["François Cluzet", "Omar Sy", "Anne Le Ny", "Audrey Fleurot"],
    tagline: "Parfois, il faut entrer dans le monde de l'autre pour trouver le sien.",
    anecdote: "Omar Sy est devenu le tout premier acteur noir à remporter le César du Meilleur Acteur en France."
  },
  {
    title: "Le Fabuleux Destin d'Amélie Poulain",
    year: "2001",
    poster: "https://image.tmdb.org/t/p/w500/kZ0X9qE2hJ0b0W8K8M1bK3E3y0.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/sCzcYW9h55WcesOqA12cgEr9Exw.jpg",
    director: "Jean-Pierre Jeunet",
    cast: ["Audrey Tautou", "Mathieu Kassovitz", "Rufus", "Jamel Debbouze"],
    tagline: "Elle va changer votre vie.",
    anecdote: "Le rôle était écrit pour l'actrice britannique Emily Watson avant d'être confié à Audrey Tautou."
  },
  {
    title: "Parasite",
    year: "2019",
    poster: "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
    backdrop: "https://image.tmdb.org/t/p/w780/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg",
    director: "Bong Joon-ho",
    cast: ["Song Kang-ho", "Lee Sun-kyun", "Cho Yeo-jeong", "Choi Woo-shik"],
    tagline: "Trouvez l'intrus.",
    anecdote: "Parasite est le premier film étranger de l'histoire à remporter l'Oscar suprême du Meilleur Film !"
  }
];

// ─── Dynamic Cinema Quiz Engine (Millions de questions TMDB & Anecdotes) ────
async function generateCinemaQuiz(requestedMode = 'hasard') {
  let mode = requestedMode;
  if (!mode || mode === 'hasard') {
    const modes = ['affiche', 'casting', 'realisateur', 'slogan', 'drole', 'emojis'];
    mode = modes[Math.floor(Math.random() * modes.length)];
  }

  // Identifiant compact sans underscore pour un parsing fiable
  const quizId = 'qz' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // 1. Mode : ANECDOTES DRÔLES & INSOLITES
  if (mode === 'drole') {
    const item = DROLE_QUIZZES[Math.floor(Math.random() * DROLE_QUIZZES.length)];
    const options = [...item.options].sort(() => Math.random() - 0.5);
    activeQuizCache.set(quizId, {
      answer: item.answer,
      options,
      answered: [],
      solved: false,
      bonus: 30,
      anecdote: item.anecdote,
      created: Date.now(),
    });

    const buttons = options.map((opt, idx) => ({
      type: 2,
      style: 1,
      label: opt.length > 80 ? opt.slice(0, 77) + '...' : opt,
      custom_id: `quiz_dyn_${quizId}_${idx}`,
    }));

    return {
      embeds: [{
        title: '🤣 QUIZ CINÉMA : L\'Anecdote Drôle & Insolite !',
        description: `> **${item.q}**\n\nCliquez sur la bonne réponse ci-dessous pour remporter **+30 🍿 Popcorns** !`,
        color: COLOR_GOLD,
        footer: { text: 'AltyFlix Cinema Trivia · Testez vos connaissances insolites' },
      }],
      components: [
        { type: 1, components: buttons.slice(0, 2) },
        { type: 1, components: buttons.slice(2, 4) },
      ],
    };
  }

  // 2. Mode : DEVINETTE ÉMOJIS
  if (mode === 'emojis') {
    const item = EMOJI_QUIZZES[Math.floor(Math.random() * EMOJI_QUIZZES.length)];
    const options = [...item.options].sort(() => Math.random() - 0.5);
    activeQuizCache.set(quizId, {
      answer: item.answer,
      options,
      answered: [],
      solved: false,
      bonus: 25,
      created: Date.now(),
    });

    const buttons = options.map((opt, idx) => ({
      type: 2,
      style: 1,
      label: opt,
      custom_id: `quiz_dyn_${quizId}_${idx}`,
    }));

    return {
      embeds: [{
        title: '🧩 QUIZ CINÉMA : Devine le Film par les Émojis !',
        description: `> ## ${item.emojis}\n\nQuel film mythique se cache derrière cette combinaison d'émojis ?\nTrouvez la réponse pour remporter **+25 🍿 Popcorns** !`,
        color: COLOR_GOLD,
        footer: { text: 'AltyFlix Émojis Quiz · Bon visionnage sur AltyFlix' },
      }],
      components: [{ type: 1, components: buttons.slice(0, 4) }],
    };
  }

  // 3. Modes CINÉMA (Affiche, Casting, Réalisateur, Slogan)
  // Utilisation ultra-rapide (<1ms) du pool de films cultes avec combinaisons infinies
  const pool = CULT_MOVIES_POOL;
  const targetMovie = pool[Math.floor(Math.random() * pool.length)];
  const wrongMovies = pool.filter(m => m.title !== targetMovie.title).slice(0, 3).map(m => m.title);
  const movieOptions = [targetMovie.title, ...wrongMovies].sort(() => Math.random() - 0.5);

  // Mode : AFFICHE / SCÈNE MYSTÈRE
  if (mode === 'affiche') {
    activeQuizCache.set(quizId, {
      answer: targetMovie.title,
      options: movieOptions,
      answered: [],
      solved: false,
      bonus: 35,
      anecdote: targetMovie.anecdote,
      created: Date.now(),
    });

    const buttons = movieOptions.map((opt, idx) => ({
      type: 2,
      style: 1,
      label: opt.length > 80 ? opt.slice(0, 77) + '...' : opt,
      custom_id: `quiz_dyn_${quizId}_${idx}`,
    }));

    return {
      embeds: [{
        title: '🖼️ QUIZ CINÉMA : Trouve le Film par l\'Affiche / Scène !',
        description: `> **De quel chef-d'œuvre provient cette scène culte ?**\n\nRegarde attentivement l'image ci-dessous et clique sur le bon titre pour remporter **+35 🍿 Popcorns** !`,
        color: COLOR_RED,
        image: { url: targetMovie.backdrop || targetMovie.poster },
        footer: { text: `AltyFlix Affiche Mystère · Année de sortie : ${targetMovie.year}` },
      }],
      components: [
        { type: 1, components: buttons.slice(0, 2) },
        { type: 1, components: buttons.slice(2, 4) },
      ],
    };
  }

  // Mode : CASTING MYSTÈRE
  if (mode === 'casting') {
    activeQuizCache.set(quizId, {
      answer: targetMovie.title,
      options: movieOptions,
      answered: [],
      solved: false,
      bonus: 30,
      anecdote: targetMovie.anecdote,
      created: Date.now(),
    });

    const buttons = movieOptions.map((opt, idx) => ({
      type: 2,
      style: 1,
      label: opt.length > 80 ? opt.slice(0, 77) + '...' : opt,
      custom_id: `quiz_dyn_${quizId}_${idx}`,
    }));

    return {
      embeds: [{
        title: '👥 QUIZ CINÉMA : Le Casting Mystère !',
        description: `> Ce film réunit à l'écran les acteurs suivants :\n> ⭐ **${targetMovie.cast.join(' • ')}**\n\nQuel est le titre de ce chef-d'œuvre ? Cliquez pour gagner **+30 🍿 Popcorns** !`,
        color: COLOR_BLUE,
        thumbnail: targetMovie.poster ? { url: targetMovie.poster } : undefined,
        footer: { text: `AltyFlix Casting Quiz · Sorti en ${targetMovie.year}` },
      }],
      components: [
        { type: 1, components: buttons.slice(0, 2) },
        { type: 1, components: buttons.slice(2, 4) },
      ],
    };
  }

  // Mode : RÉALISATEUR CULTE
  if (mode === 'realisateur') {
    const wrongDirs = ICONIC_DIRECTORS.filter(d => d.toLowerCase() !== targetMovie.director.toLowerCase()).slice(0, 3);
    const dirOptions = [targetMovie.director, ...wrongDirs].sort(() => Math.random() - 0.5);

    activeQuizCache.set(quizId, {
      answer: targetMovie.director,
      options: dirOptions,
      answered: [],
      solved: false,
      bonus: 30,
      anecdote: targetMovie.anecdote,
      created: Date.now(),
    });

    const buttons = dirOptions.map((opt, idx) => ({
      type: 2,
      style: 1,
      label: opt,
      custom_id: `quiz_dyn_${quizId}_${idx}`,
    }));

    return {
      embeds: [{
        title: '🎬 QUIZ CINÉMA : Qui est le Réalisateur ?',
        description: `> Qui a réalisé le film culte **« ${targetMovie.title} »** (${targetMovie.year}) ?\n\nSélectionne le bon maître du cinéma pour remporter **+30 🍿 Popcorns** !`,
        color: COLOR_RED,
        image: targetMovie.backdrop ? { url: targetMovie.backdrop } : undefined,
        footer: { text: 'AltyFlix Réalisateurs · Testez votre culture 7e Art' },
      }],
      components: [
        { type: 1, components: buttons.slice(0, 2) },
        { type: 1, components: buttons.slice(2, 4) },
      ],
    };
  }

  // Mode : SLOGAN & ACCROCHE CULTE
  activeQuizCache.set(quizId, {
    answer: targetMovie.title,
    options: movieOptions,
    answered: [],
    solved: false,
    bonus: 30,
    anecdote: targetMovie.anecdote,
    created: Date.now(),
  });

  const buttons = movieOptions.map((opt, idx) => ({
    type: 2,
    style: 1,
    label: opt.length > 80 ? opt.slice(0, 77) + '...' : opt,
    custom_id: `quiz_dyn_${quizId}_${idx}`,
  }));

  return {
    embeds: [{
      title: '📜 QUIZ CINÉMA : L\'Accroche Culte !',
      description: `> *« ${targetMovie.tagline} »*\n\nÀ quel film appartient cette célèbre phrase d'accroche ?\nTrouvez le bon titre pour remporter **+30 🍿 Popcorns** !`,
      color: COLOR_GOLD,
      footer: { text: `AltyFlix Taglines Quiz · Sorti en ${targetMovie.year}` },
    }],
    components: [
      { type: 1, components: buttons.slice(0, 2) },
      { type: 1, components: buttons.slice(2, 4) },
    ],
  };
}

// ─── Discord API Helpers ─────────────────────────────────────────────────────
async function discordApi(method, endpoint, body = null) {
  const opts = {
    method,
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${API}${endpoint}`, opts);
    if (res.status === 204) return true;
    if (res.status === 429) {
      const d = await res.json();
      const wait = Math.ceil((d.retry_after || 1) * 1000) + 300;
      await new Promise(r => setTimeout(r, wait));
      return discordApi(method, endpoint, body);
    }
    if (!res.ok) {
      const err = await res.text();
      console.warn(`Discord API [${method} ${endpoint}] ${res.status}:`, err);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`Erreur réseau Discord API :`, e.message);
    return null;
  }
}

async function postMessage(channelId, body) {
  return discordApi('POST', `/channels/${channelId}/messages`, body);
}

async function respondInteraction(interactionId, interactionToken, responseData) {
  return discordApi('POST', `/interactions/${interactionId}/${interactionToken}/callback`, {
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: responseData,
  });
}

async function deferInteraction(interactionId, interactionToken, flags = 0) {
  const body = { type: 5 };
  if (flags) body.data = { flags };
  return discordApi('POST', `/interactions/${interactionId}/${interactionToken}/callback`, body);
}

async function editOriginalResponse(interactionToken, responseData) {
  const appId = botId || APP_ID;
  return discordApi('PATCH', `/webhooks/${appId}/${interactionToken}/messages/@original`, responseData);
}

async function addReaction(channelId, messageId, emoji) {
  return discordApi('PUT', `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`);
}

async function addMemberRole(userId, roleId) {
  return discordApi('PUT', `/guilds/${guildId}/members/${userId}/roles/${roleId}`);
}

async function removeMemberRole(userId, roleId) {
  return discordApi('DELETE', `/guilds/${guildId}/members/${userId}/roles/${roleId}`);
}

async function getMember(userId) {
  return discordApi('GET', `/guilds/${guildId}/members/${userId}`);
}

// ─── Auto-Poster Engine (H24) ────────────────────────────────────────────────

// 1. Post automatique des NOUVEAUTÉS 4K dans #🎬・nouveautés
async function checkAndPostNouveautes(forced = false) {
  const targetChannel = nouveautesChannelId;
  if (!targetChannel) return;

  const cache = loadCache();
  const postedSet = new Set(cache.posted || []);

  const today = new Date().toISOString().split('T')[0];
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - 30);
  const daysAgoStr = daysAgo.toISOString().split('T')[0];

  const [movieData, tvData] = await Promise.all([
    tmdbFetch('/discover/movie', {
      'primary_release_date.gte': daysAgoStr,
      'primary_release_date.lte': today,
      sort_by: 'popularity.desc',
      'vote_count.gte': 8,
      include_adult: false,
    }),
    tmdbFetch('/discover/tv', {
      'first_air_date.gte': daysAgoStr,
      'first_air_date.lte': today,
      sort_by: 'popularity.desc',
      'vote_count.gte': 5,
      include_adult: false,
    }),
  ]);

  const candidates = [];
  (movieData?.results || []).forEach(m => candidates.push({ ...m, media_type: 'movie' }));
  (tvData?.results || []).forEach(t => candidates.push({ ...t, media_type: 'tv' }));

  // Trier par popularité
  candidates.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  // Trouver ceux qui n'ont pas encore été postés
  const toPost = forced
    ? candidates.slice(0, 2)
    : candidates.filter(item => !postedSet.has(`${item.media_type}_${item.id}`)).slice(0, 2);

  if (toPost.length === 0) {
    if (forced) console.log('Aucune nouveauté récente trouvée sur TMDB.');
    return;
  }

  for (const item of toPost) {
    const isTv = item.media_type === 'tv';
    const title = item.title || item.name;
    const date = item.release_date || item.first_air_date || '';
    const year = date ? date.split('-')[0] : '';
    const rating = item.vote_average ? `${item.vote_average.toFixed(1)}/10` : 'N/A';
    const stars = ratingStars(item.vote_average);
    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
    const playUrl = `${SITE_URL}/${isTv ? 'tv' : 'movie'}/${item.id}`;
    const overview = item.overview
      ? (item.overview.length > 280 ? item.overview.slice(0, 277) + '...' : item.overview)
      : 'Disponible dès maintenant en qualité 4K UHD avec double audio français (VF / VOSTFR).';

    const msg = await postMessage(targetChannel, {
      content: roleNouveautesId ? `<@&${roleNouveautesId}>` : undefined,
      embeds: [{
        title: `🔥 NOUVEAUTÉ 4K : ${title} ${year ? `(${year})` : ''}`,
        url: playUrl,
        description: `> ${overview}\n\n🍿 **[▶ Regarder maintenant en 4K sur AltyFlix](${playUrl})**`,
        color: COLOR_RED,
        fields: [
          { name: 'Format', value: isTv ? '📺 Série TV' : '🎥 Film Cinéma', inline: true },
          { name: 'Note Spectateurs', value: `${stars} ${rating}`, inline: true },
          { name: 'Qualité & Audio', value: '🟢 4K Ultra HD · VF & VOSTFR', inline: true },
        ],
        image: poster ? { url: poster } : undefined,
        footer: { text: 'AltyFlix Nouveautés 24/7 · 5 Lecteurs serveurs disponibles' },
        timestamp: new Date().toISOString(),
      }],
      allowed_mentions: roleNouveautesId ? { roles: [roleNouveautesId] } : undefined,
    });

    if (msg?.id) {
      await addReaction(targetChannel, msg.id, '🍿');
      await addReaction(targetChannel, msg.id, '🔥');
    }

    // Vérification des alertes personnalisées des membres (/alerte)
    try {
      const uData = loadUserData();
      const alertedUsers = [];
      for (const [uId, uObj] of Object.entries(uData.users || {})) {
        if (Array.isArray(uObj.alerts)) {
          const matchAlert = uObj.alerts.find(a => title.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(title.toLowerCase()));
          if (matchAlert) alertedUsers.push(uId);
        }
      }
      if (alertedUsers.length > 0) {
        const pings = alertedUsers.map(id => `<@${id}>`).join(' ');
        await postMessage(targetChannel, {
          content: `🔔 **Alerte Sortie 4K pour ${pings} !** Le titre **${title}** que vous attendiez est disponible sur AltyFlix ! 🍿`,
        });
      }
    } catch { /* ignore */ }

    postedSet.add(`${item.media_type}_${item.id}`);
    console.log(`[24/7 Auto-Poster] ✅ Nouveauté postée : ${title} (${item.media_type})`);
    await new Promise(r => setTimeout(r, 1500));
  }

  cache.posted = Array.from(postedSet).slice(-200); // garder les 200 derniers
  saveCache(cache);
}

// 2. Post du FILM & SÉRIE DU JOUR (Coup de Cœur 4K)
async function checkAndPostDailyDrop(forced = false) {
  const cache = loadCache();
  const todayKey = new Date().toISOString().split('T')[0];

  if (!forced && cache.lastDailyFilm === todayKey) {
    return; // Déjà posté aujourd'hui
  }

  // Tirer un film d'exception parmi les meilleurs de TMDB
  const randomPage = Math.floor(Math.random() * 6) + 1;
  const res = await tmdbFetch('/movie/top_rated', { page: randomPage });
  const movies = res?.results || [];
  if (movies.length === 0) return;

  const movie = movies[Math.floor(Math.random() * movies.length)];
  const title = movie.title;
  const year = movie.release_date ? `(${movie.release_date.split('-')[0]})` : '';
  const rating = movie.vote_average ? `${movie.vote_average.toFixed(1)}/10` : 'N/A';
  const stars = ratingStars(movie.vote_average);
  const backdrop = movie.backdrop_path ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}` : null;
  const playUrl = `${SITE_URL}/movie/${movie.id}`;

  const channelTarget = filmsChannelId || nouveautesChannelId;
  if (!channelTarget) return;

  const msg = await postMessage(channelTarget, {
    embeds: [{
      title: `⭐ COUP DE CŒUR DU JOUR : ${title} ${year}`,
      url: playUrl,
      description: `Chaque jour, la rédaction AltyFlix vous sélectionne un chef-d'œuvre à ne surtout pas manquer.\n\n${movie.overview || 'Un film incontournable à savourer dès ce soir !'}\n\n**🍿 [▶ Lancer la lecture sur AltyFlix](${playUrl})**`,
      color: COLOR_GOLD,
      fields: [
        { name: 'Note critique', value: `${stars} ${rating}`, inline: true },
        { name: 'Serveurs streaming', value: '⚡ 5 flux miroirs haute vitesse', inline: true },
        { name: 'Avis communauté', value: 'L\'avez-vous déjà vu ? Votez ci-dessous !', inline: false },
      ],
      image: backdrop ? { url: backdrop } : undefined,
      footer: { text: 'AltyFlix · Le Cinéma à portée de clic' },
      timestamp: new Date().toISOString(),
    }],
  });

  if (msg?.id) {
    await addReaction(channelTarget, msg.id, '⭐');
    await addReaction(channelTarget, msg.id, '👍');
    await addReaction(channelTarget, msg.id, '👎');
  }

  cache.lastDailyFilm = todayKey;
  saveCache(cache);
  console.log(`[24/7 Auto-Poster] ⭐ Coup de cœur du jour posté : ${title}`);
}

// 3. Débats Cinéma Automatiques dans #💬・discussions
const CINE_DEBATS = [
  {
    question: '🎬 Grand débat Nolan : Quel est son chef-d\'œuvre absolu ?',
    optA: 'Interstellar 🚀',
    optB: 'Inception 🌀',
    optC: 'The Dark Knight 🦇',
    optD: 'Oppenheimer 💣',
  },
  {
    question: '📺 Séries cultes : Le meilleur univers de tous les temps ?',
    optA: 'Breaking Bad 🧪',
    optB: 'Game of Thrones ⚔️',
    optC: 'Stranger Things 🚲',
    optD: 'The Sopranos 🚬',
  },
  {
    question: '🍿 Question habitudes : Comment regardez-vous vos films et séries sur AltyFlix ?',
    optA: '100% VOSTFR pour les voix originales 🎧',
    optB: '100% VF pour la détente 🇫🇷',
    optC: 'Les deux selon l\'humeur 🎭',
  },
  {
    question: '🌌 Science-Fiction Ultime : Votre univers favori ?',
    optA: 'Star Wars 🌟',
    optB: 'Dune 🏜️',
    optC: 'Matrix 💊',
    optD: 'Blade Runner 🏙️',
  },
  {
    question: '😱 Soirée Frissons : Le film d\'horreur qui vous a le plus traumatisé ?',
    optA: 'The Conjuring 👻',
    optB: 'Hérédité 🕯️',
    optC: 'Shining 🪓',
    optD: 'Alien, le huitième passager 🛸',
  },
  {
    question: '🍕 Rituel Binge-watching : Votre style devant une nouvelle saison ?',
    optA: 'Nuit blanche : je plie la saison en 24h ⚡',
    optB: 'Gourmet : 1 ou 2 épisodes par jour pour faire durer 🍷',
  },
  {
    question: '🎬 Nolan vs Villeneuve : Qui est le maître de la science-fiction moderne ?',
    optA: 'Christopher Nolan (Interstellar, Inception) 🌀',
    optB: 'Denis Villeneuve (Dune, Blade Runner 2049) 🏜️',
    optC: 'Égalité parfaite entre deux légendes 🤝',
  },
  {
    question: '🦇 Le Batman Absolu : Quelle incarnation a le plus marqué l\'histoire ?',
    optA: 'Christian Bale (The Dark Knight) 🃏',
    optB: 'Robert Pattinson (The Batman) 🌧️',
    optC: 'Michael Keaton (Batman 1989) 🏢',
    optD: 'Ben Affleck (Justice League) ⚔️',
  },
  {
    question: '🧠 Le Mindfuck Ultime : Quel film a le retournement de situation le plus fou ?',
    optA: 'Shutter Island 🏝️',
    optB: 'Fight Club 🥊',
    optC: 'Sixième Sens 👻',
    optD: 'Les Autres 🕯️',
  },
];

async function checkAndPostDebat(forced = false) {
  const channelTarget = discussionsChannelId;
  if (!channelTarget) return;

  const cache = loadCache();
  const todayKey = new Date().toISOString().split('T')[0];

  if (!forced && cache.lastDebat === todayKey) {
    return;
  }

  const debat = CINE_DEBATS[Math.floor(Math.random() * CINE_DEBATS.length)];
  const fields = [
    { name: '1️⃣ Option 1', value: debat.optA, inline: true },
    { name: '2️⃣ Option 2', value: debat.optB, inline: true },
  ];
  if (debat.optC) fields.push({ name: '3️⃣ Option 3', value: debat.optC, inline: true });
  if (debat.optD) fields.push({ name: '4️⃣ Option 4', value: debat.optD, inline: true });

  const msg = await postMessage(channelTarget, {
    embeds: [{
      title: debat.question,
      description: 'Réagissez avec l\'emoji correspondant pour voter et débattez dans le salon ! 🍿',
      color: COLOR_BLUE,
      fields,
      footer: { text: 'AltyFlix Sondages Communautaires 💬' },
    }],
  });

  if (msg?.id) {
    await addReaction(channelTarget, msg.id, '1️⃣');
    await addReaction(channelTarget, msg.id, '2️⃣');
    if (debat.optC) await addReaction(channelTarget, msg.id, '3️⃣');
    if (debat.optD) await addReaction(channelTarget, msg.id, '4️⃣');
  }

  cache.lastDebat = todayKey;
  saveCache(cache);
  console.log('[24/7 Auto-Poster] 💬 Débat cinéma quotidien posté !');
}

// ─── Lancement de la boucle 24/7 ─────────────────────────────────────────────
function start24_7Scheduler() {
  if (autoPostInterval) clearInterval(autoPostInterval);

  console.log('⏰ Moteur de publication 24/7 activé !');
  console.log('   - Vérification Nouveautés 4K : toutes les 30 minutes');
  console.log('   - Film du Jour & Débats quotidiens : actifs');

  // Premier check après 30 secondes au démarrage
  setTimeout(async () => {
    try {
      await checkAndPostNouveautes(false);
      await checkAndPostDailyDrop(false);
      await checkAndPostDebat(false);
    } catch (err) {
      console.warn('Erreur vérification scheduler initial :', err.message);
    }
  }, 30000);

  // Intervalle récurrent toutes les 30 minutes (1800000 ms)
  autoPostInterval = setInterval(async () => {
    try {
      await checkAndPostNouveautes(false);
      await checkAndPostDailyDrop(false);
      await checkAndPostDebat(false);
    } catch (err) {
      console.warn('Erreur scheduler 24/7 :', err.message);
    }
  }, 30 * 60 * 1000);
}

// ─── Ticket Management ───────────────────────────────────────────────────────
async function createTicket(userId, username, reason = 'Assistance générale') {
  const cleanName = `ticket-${username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'user'}`;

  const channel = await discordApi('POST', `/guilds/${guildId}/channels`, {
    name: cleanName,
    type: 0,
    parent_id: ticketsCategoryId || null,
    topic: `Ticket ouvert par <@${userId}> | Motif : ${reason}`,
    permission_overwrites: [
      { id: guildId, type: 0, deny: '1024' }, // Masqué pour @everyone
      { id: membreRoleId, type: 0, deny: '1024' }, // Strictement masqué pour les autres Spectateurs
      { id: userId, type: 1, allow: '3072' },  // VIEW + SEND pour le créateur
      { id: STAFF_ROLE_ID, type: 0, allow: '68608' }, // VIEW + SEND + EMBED + ATTACH + HISTORY pour le staff
      { id: botId || APP_ID, type: 1, allow: '68608' }, // Plein accès pour le bot AltyFlix
    ],
  });

  if (!channel?.id) return null;

  await postMessage(channel.id, {
    content: `<@${userId}> <@&${STAFF_ROLE_ID}>`,
    embeds: [{
      title: '🎫 Ticket de Support AltyFlix',
      description: `Bonjour <@${userId}> ! Un membre de l'équipe Staff va te répondre sous peu.\n\n**Motif indiqué :**\n> ${reason}`,
      color: COLOR_RED,
      fields: [
        { name: '⚙️ Conseils', value: 'Décris ton problème en détail (appareil, navigateur, titre concerné).' },
        { name: '🔒 Clôture', value: 'Clique sur le bouton rouge ci-dessous une fois ton problème résolu.' },
      ],
      footer: { text: `Ticket #${channel.id.slice(-4)} · AltyFlix Support` },
    }],
    components: [{
      type: 1,
      components: [{
        type: 2,
        style: 4, // DANGER
        custom_id: 'btn_close_ticket',
        label: 'Fermer le ticket',
        emoji: { name: '🔒' },
      }],
    }],
  });

  if (logsChannelId) {
    await postMessage(logsChannelId, {
      content: `🎫 Nouveau ticket créé par **@${username}** (<#${channel.id}>) — Motif : *${reason}*`,
    });
  }

  return channel;
}

async function closeTicket(channelId, closedByUsername) {
  await postMessage(channelId, {
    content: `🔒 Ticket clôturé par **@${closedByUsername}**. Archivage du salon et suppression dans 5 secondes...`,
  });

  // Archivage automatique dans #📋・logs
  try {
    const messages = await discordApi('GET', `/channels/${channelId}/messages?limit=100`);
    if (logsChannelId && Array.isArray(messages) && messages.length > 0) {
      const reversed = [...messages].reverse();
      const transcriptLines = reversed
        .filter(m => !m.content?.includes('Archivage du salon et suppression'))
        .map(m => `[${new Date(m.timestamp).toLocaleTimeString('fr-FR')}] ${m.author?.username || 'Membre'}: ${m.content || '(Embed / Fichier)'}`)
        .slice(-25)
        .join('\n');

      await postMessage(logsChannelId, {
        embeds: [{
          title: `📁 Journal d'Archivage Ticket #${channelId.slice(-4)}`,
          description: `**Fermé par :** @${closedByUsername}\n**Messages échangés :** ${messages.length}\n\n\`\`\`text\n${transcriptLines || 'Aucun message textuel'}\n\`\`\``,
          color: COLOR_DARK,
          footer: { text: 'AltyFlix Audit & Sécurité Tickets' },
          timestamp: new Date().toISOString(),
        }],
      });
    }
  } catch (err) {
    console.warn('Erreur archivage ticket logs :', err.message);
  }

  setTimeout(async () => {
    try {
      await discordApi('DELETE', `/channels/${channelId}`);
      console.log(`Salon ticket ${channelId} archivé et supprimé avec succès.`);
    } catch (e) {
      console.warn('Erreur suppression salon ticket :', e.message);
    }
  }, 5000);
}

// ─── Button Interactions ─────────────────────────────────────────────────────
async function handleButtonInteraction(d) {
  const { id: interactionId, token: interactionToken, data, member, user, channel_id } = d;
  const customId = data.custom_id;
  const callerUser = member?.user || user;
  const userId = callerUser?.id;
  const username = callerUser?.username || 'Utilisateur';

  // 1. Bouton : Valider le règlement
  if (customId === 'btn_accept_rules') {
    const currentRoles = member?.roles || [];
    if (currentRoles.includes(membreRoleId)) {
      await respondInteraction(interactionId, interactionToken, {
        content: `🍿 **<@${userId}>**, tu as déjà validé le règlement et obtenu le rôle **Spectateur** ! Bon visionnage sur AltyFlix !`,
        flags: 64, // Ephemeral
      });
      return;
    }

    const ok = await addMemberRole(userId, membreRoleId);
    if (ok) {
      await respondInteraction(interactionId, interactionToken, {
        content: `🎉 **Félicitations <@${userId}> !** Le règlement est validé.\nLe rôle **🍿 Spectateur** t'a été attribué. Tu as désormais accès à l'ensemble du serveur !`,
        flags: 64, // Ephemeral
      });

      if (discussionsChannelId) {
        await postMessage(discussionsChannelId, {
          content: `🎉 Bienvenue à <@${userId}> qui vient de valider le règlement ! Installe-toi confortablement, prépare ton pop-corn et bon visionnage sur **AltyFlix** 🍿`,
        });
      }
    } else {
      await respondInteraction(interactionId, interactionToken, {
        content: '⚠️ Impossible d\'attribuer le rôle. Veuillez contacter un administrateur.',
        flags: 64,
      });
    }
    return;
  }

  // 2. Boutons de rôles de notification & préférences cinéma
  const roleButtons = {
    btn_role_nouveautes: { roleId: roleNouveautesId, name: '🆕 Nouveautés' },
    btn_role_annonces: { roleId: roleAnnoncesId, name: '📢 Annonces' },
    btn_role_maj: { roleId: roleMajId, name: '🛠️ Mises à jour' },
    btn_role_films: { roleId: config.roleFilmsId || '1560326736409923674', name: '🎥 Cinéphile' },
    btn_role_series: { roleId: config.roleSeriesId || '1560326739190616084', name: '📺 Sérivore' },
    btn_role_vostfr: { roleId: config.roleVostfrId || '1560326742239871087', name: '🎧 VOSTFR' },
    btn_role_vf: { roleId: config.roleVfId || '1560326745461366874', name: '🇫🇷 VF' },
  };

  if (roleButtons[customId]) {
    const { roleId, name } = roleButtons[customId];
    if (!roleId) {
      await respondInteraction(interactionId, interactionToken, {
        content: '⚠️ Rôle non configuré.',
        flags: 64,
      });
      return;
    }

    const currentRoles = member?.roles || [];
    const hasRole = currentRoles.includes(roleId);

    if (hasRole) {
      await removeMemberRole(userId, roleId);
      await respondInteraction(interactionId, interactionToken, {
        content: `🔕 Rôle **@${name}** retiré avec succès. Tu ne recevras plus ces notifications.`,
        flags: 64,
      });
    } else {
      await addMemberRole(userId, roleId);
      await respondInteraction(interactionId, interactionToken, {
        content: `🔔 Rôle **@${name}** activé avec succès ! Tu seras prévenu en avant-première.`,
        flags: 64,
      });
    }
    return;
  }

  // 3. Bouton : Ouvrir un ticket
  if (customId === 'btn_open_ticket') {
    const channel = await createTicket(userId, username, 'Demande via le panneau de support');
    if (channel) {
      await respondInteraction(interactionId, interactionToken, {
        content: `✅ Ton salon privé de support a été créé : <#${channel.id}>. Le staff va te répondre très rapidement !`,
        flags: 64,
      });
    } else {
      await respondInteraction(interactionId, interactionToken, {
        content: '⚠️ Impossible d\'ouvrir le ticket actuellement. Réessaie dans quelques instants.',
        flags: 64,
      });
    }
    return;
  }

  // 4. Bouton : Fermer le ticket
  if (customId === 'btn_close_ticket') {
    await respondInteraction(interactionId, interactionToken, {
      content: '🔒 Clôture du ticket en cours...',
    });
    await closeTicket(channel_id, username);
    return;
  }

  // 5. Boutons Quiz Dynamique (Questions Cultes & Anecdotes)
  if (customId.startsWith('quiz_dyn_')) {
    const raw = customId.replace('quiz_dyn_', '');
    const lastUnderscore = raw.lastIndexOf('_');
    const quizId = raw.slice(0, lastUnderscore);
    const optIdx = parseInt(raw.slice(lastUnderscore + 1), 10);

    const quiz = activeQuizCache.get(quizId);
    if (!quiz) {
      await respondInteraction(interactionId, interactionToken, {
        content: '⚠️ Ce quiz a expiré ou a déjà été clôturé. Lancez-en un nouveau avec `/quiz` !',
        flags: 64,
      });
      return;
    }

    if (quiz.answered.includes(userId)) {
      await respondInteraction(interactionId, interactionToken, {
        content: `✋ **Patience <@${userId}> !** Tu as déjà donné ta réponse sur ce quiz. Lance un nouveau \`/quiz\` !`,
        flags: 64,
      });
      return;
    }

    const selectedOpt = quiz.options[optIdx];
    const isCorrect = selectedOpt === quiz.answer;
    quiz.answered.push(userId);

    const uData = loadUserData();
    const u = getUser(uData, userId, username);

    if (isCorrect) {
      quiz.solved = true;
      u.popcorn = (u.popcorn || 0) + (quiz.bonus || 30);
      u.quizWins = (u.quizWins || 0) + 1;
      saveUserData(uData);

      const anecdoteText = quiz.anecdote ? `\n\n💡 **Le saviez-vous ?**\n> *${quiz.anecdote}*` : '';

      await respondInteraction(interactionId, interactionToken, {
        content: `🎯 **BINGO <@${userId}> !** C'était bien **${quiz.answer}** ! 🎉\n🍿 Tu remportes **+${quiz.bonus || 30} Popcorns** ! *(Nouveau solde : **${u.popcorn} 🍿**)*${anecdoteText}`,
      });
    } else {
      await respondInteraction(interactionId, interactionToken, {
        content: `❌ **Aïe <@${userId}>, mauvaise réponse !**\nTu as choisi *${selectedOpt}*, mais la bonne réponse était **${quiz.answer}** ! Retente ta chance au prochain quiz !`,
        flags: 64,
      });
    }
    return;
  }

  // Fallback anciens boutons quiz
  if (customId.startsWith('quiz_ans_')) {
    const parts = customId.split('_');
    const qType = parts[2];
    const qIdx = parseInt(parts[3], 10);
    const optIdx = parseInt(parts[4], 10);

    const list = qType === 'emojis' ? EMOJI_QUIZZES : QCM_QUIZZES;
    const item = list[qIdx % list.length];
    if (!item) {
      await respondInteraction(interactionId, interactionToken, { content: '⚠️ Question introuvable.', flags: 64 });
      return;
    }

    const selectedOpt = item.options[optIdx];
    const isCorrect = selectedOpt === item.answer;

    const uData = loadUserData();
    const u = getUser(uData, userId, username);

    if (isCorrect) {
      u.popcorn = (u.popcorn || 0) + 25;
      u.quizWins = (u.quizWins || 0) + 1;
      saveUserData(uData);

      await respondInteraction(interactionId, interactionToken, {
        content: `🎯 **EXCELLENT <@${userId}> !** C'était bien **${item.answer}** !\n🎉 Tu remportes **+25 🍿 Popcorns** ! *(Ton solde : **${u.popcorn} 🍿**)*`,
      });
    } else {
      await respondInteraction(interactionId, interactionToken, {
        content: `❌ **Aïe <@${userId}>, mauvaise réponse !**\nTu as choisi *${selectedOpt}*, mais la bonne réponse était **${item.answer}** ! Retente ta chance au prochain quiz !`,
        flags: 64,
      });
    }
    return;
  }

  // 6. Bonus Popcorn Quotidien (+50 Popcorns)
  if (customId === 'btn_popcorn_daily') {
    const today = new Date().toISOString().split('T')[0];
    const uData = loadUserData();
    const u = getUser(uData, userId, username);

    if (u.lastDaily === today) {
      await respondInteraction(interactionId, interactionToken, {
        content: `⏰ **Patience <@${userId}> !** Tu as déjà réclamé ton bonus aujourd'hui.\nReviens demain pour décrocher tes prochains **+50 🍿 Popcorns** !`,
        flags: 64,
      });
      return;
    }

    u.popcorn = (u.popcorn || 0) + 50;
    u.lastDaily = today;
    saveUserData(uData);

    await respondInteraction(interactionId, interactionToken, {
      content: `🎉 **Félicitations <@${userId}> !** Tu as récupéré ton bonus journalier de **+50 🍿 Popcorns** !\n🍿 **Nouveau solde : ${u.popcorn} Popcorns** !`,
    });
    return;
  }

  // 7. Boutique Achats Rôles
  if (customId === 'btn_shop_buy_vip' || customId === 'btn_shop_buy_realisateur') {
    const isVip = customId === 'btn_shop_buy_vip';
    const roleId = isVip ? roleVipId : roleRealisateurId;
    const cost = isVip ? 300 : 600;
    const roleName = isVip ? '⭐ VIP AltyFlix' : '🎬 Réalisateur';

    const uData = loadUserData();
    const u = getUser(uData, userId, username);

    if ((u.popcorn || 0) < cost) {
      await respondInteraction(interactionId, interactionToken, {
        content: `❌ **Popcorns insuffisants !**\nLe rôle **${roleName}** coûte **${cost} 🍿**, mais tu ne possèdes que **${u.popcorn || 0} 🍿**.\nParticipe aux quiz et fais /popcorn pour accumuler des pièces !`,
        flags: 64,
      });
      return;
    }

    const ok = await addMemberRole(userId, roleId);
    if (ok) {
      u.popcorn -= cost;
      saveUserData(uData);
      await respondInteraction(interactionId, interactionToken, {
        content: `👑 **FÉLICITATIONS <@${userId}> !**\nTu viens de débloquer le rôle officiel **@${roleName}** pour **${cost} 🍿 Popcorns** ! Tu brilles désormais dans la communauté. 🎉`,
      });
    } else {
      await respondInteraction(interactionId, interactionToken, {
        content: `⚠️ Impossible d'attribuer le rôle. Veuillez vérifier les permissions du bot.`,
        flags: 64,
      });
    }
    return;
  }

  // 8. Votes Critiques (/avis)
  if (customId.startsWith('btn_review_agree_') || customId.startsWith('btn_review_disagree_')) {
    const isAgree = customId.startsWith('btn_review_agree_');
    const reviewId = customId.replace(isAgree ? 'btn_review_agree_' : 'btn_review_disagree_', '');

    const uData = loadUserData();
    if (!uData.reviews) uData.reviews = {};
    if (!uData.reviews[reviewId]) uData.reviews[reviewId] = { agrees: [], disagrees: [] };
    const rev = uData.reviews[reviewId];

    if (isAgree) {
      if (!rev.agrees.includes(userId)) {
        rev.agrees.push(userId);
        rev.disagrees = rev.disagrees.filter(id => id !== userId);
      }
    } else {
      if (!rev.disagrees.includes(userId)) {
        rev.disagrees.push(userId);
        rev.agrees = rev.agrees.filter(id => id !== userId);
      }
    }
    saveUserData(uData);

    await respondInteraction(interactionId, interactionToken, {
      content: `🗳️ **Vote pris en compte !** Tu as voté ${isAgree ? '👍 D\'accord' : '👎 Pas d\'accord'} avec cette critique.`,
      flags: 64,
    });
    return;
  }

  // 9. Tinder du Cinéma (/match)
  if (customId.startsWith('btn_match_like_') || customId.startsWith('btn_match_next_')) {
    const isLike = customId.startsWith('btn_match_like_');
    const parts = customId.split('_');
    const matchId = parts[3];
    const movieIdx = parseInt(parts[4], 10);

    const uData = loadUserData();
    if (!uData.matches) uData.matches = {};
    const match = uData.matches[matchId];

    if (!match) {
      await respondInteraction(interactionId, interactionToken, { content: '⚠️ Cette session de match a expiré.', flags: 64 });
      return;
    }

    if (userId !== match.u1 && userId !== match.u2) {
      await respondInteraction(interactionId, interactionToken, { content: '⛔ Seuls les 2 participants peuvent voter sur ce match !', flags: 64 });
      return;
    }

    const currentMovie = match.movies[movieIdx];
    if (isLike) {
      if (!match.likes) match.likes = {};
      if (!match.likes[movieIdx]) match.likes[movieIdx] = [];
      if (!match.likes[movieIdx].includes(userId)) match.likes[movieIdx].push(userId);
      saveUserData(uData);

      if (match.likes[movieIdx].includes(match.u1) && match.likes[movieIdx].includes(match.u2)) {
        const playUrl = `${SITE_URL}/movie/${currentMovie.id}`;
        await respondInteraction(interactionId, interactionToken, {
          content: `🎉 **C'EST UN MATCH PARFAIT ENTRE <@${match.u1}> ET <@${match.u2}> !** 🍿\n\nVous avez tous les deux aimé **${currentMovie.title}** !\n👉 **[▶ Lancer ${currentMovie.title} en 4K sur AltyFlix](${playUrl})**`,
        });
        return;
      }

      await respondInteraction(interactionId, interactionToken, {
        content: `💚 Tu as voté OUI pour **${currentMovie.title}** ! En attente du vote de ton partenaire... (1/2)`,
        flags: 64,
      });
    } else {
      const nextIdx = movieIdx + 1;
      if (nextIdx >= match.movies.length) {
        await respondInteraction(interactionId, interactionToken, {
          content: `🎬 Fin de la sélection ! Relancez un **/match** pour de nouvelles propositions.`,
        });
        return;
      }

      const nextMovie = match.movies[nextIdx];
      const poster = nextMovie.poster_path ? `https://image.tmdb.org/t/p/w500${nextMovie.poster_path}` : null;
      const playUrl = `${SITE_URL}/movie/${nextMovie.id}`;

      await respondInteraction(interactionId, interactionToken, {
        embeds: [{
          title: `🔥 Tinder du Cinéma (${nextIdx + 1}/${match.movies.length}) : ${nextMovie.title}`,
          url: playUrl,
          description: nextMovie.overview ? (nextMovie.overview.slice(0, 300) + '...') : 'Aucun synopsis disponible.',
          color: COLOR_RED,
          fields: [
            { name: 'Note Spectateurs', value: `⭐ ${nextMovie.vote_average?.toFixed(1) || 'N/A'}/10`, inline: true },
            { name: 'Participants', value: `<@${match.u1}> & <@${match.u2}>`, inline: true },
          ],
          image: poster ? { url: poster } : undefined,
          footer: { text: 'AltyFlix Match · Cliquez sur J\'aime si ce film vous tente tous les deux !' },
        }],
        components: [{
          type: 1,
          components: [
            { type: 2, style: 3, label: '💚 J\'aime (0/2)', custom_id: `btn_match_like_${matchId}_${nextIdx}` },
            { type: 2, style: 2, label: '❌ Suivant', custom_id: `btn_match_next_${matchId}_${nextIdx}` },
            { type: 2, style: 5, label: 'Fiche 4K', url: playUrl },
          ],
        }],
      });
    }
    return;
  }

  // 10. Ciné-Club / Watch Party
  if (customId.startsWith('btn_cineclub_join_')) {
    const partyId = customId.replace('btn_cineclub_join_', '');
    const uData = loadUserData();
    if (!uData.watchParties) uData.watchParties = {};
    if (!uData.watchParties[partyId]) uData.watchParties[partyId] = { participants: [] };

    if (!uData.watchParties[partyId].participants.includes(userId)) {
      uData.watchParties[partyId].participants.push(userId);
      saveUserData(uData);
    }

    await respondInteraction(interactionId, interactionToken, {
      content: `🍿 **Inscription confirmée <@${userId}> !** Tu participes à la séance Ciné-Club avec **${uData.watchParties[partyId].participants.length} spectateur(s)** !`,
      flags: 64,
    });
    return;
  }

  if (customId.startsWith('btn_cineclub_start_')) {
    await respondInteraction(interactionId, interactionToken, {
      content: `🎬 **ATTENTION TOUT LE MONDE DANS LE SALON VOCAL !** 🍿\n\n3️⃣ ...\n2️⃣ ...\n1️⃣ ...\n\n▶️ **TOP DÉPART ! LECTURE SIMULTANÉE SUR ALTYFLIX !**\n*Bonne séance à tous !* 🍿`,
    });
    return;
  }
}

// ─── Slash Commands Handlers ─────────────────────────────────────────────────
async function handleSlashCommand(d) {
  const { id: interactionId, token: interactionToken, data, member, user, channel_id } = d;
  const cmdName = data.name;
  const callerUser = member?.user || user;
  const userId = callerUser?.id;
  const username = callerUser?.username || 'Utilisateur';
  const userRoles = member?.roles || [];
  const isAdmin = (BigInt(member?.permissions || '0') & 8n) === 8n;
  const isOwner = userId === '1349026669905575956';
  const isStaff = isOwner || isAdmin || userRoles.includes(STAFF_ROLE_ID) || userRoles.includes('1545423609852330008');

  if (cmdName === 'aide') {
    await respondInteraction(interactionId, interactionToken, {
      embeds: [{
        title: '🍿 Centre d\'Assistance & Outils Élite ALTYFLIX',
        description: 'Voici l\'ensemble des **26 commandes officielles** à ta disposition :',
        color: COLOR_RED,
        fields: [
          {
            name: '🎬 Streaming & Cinéma 4K',
            value: [
              '• `/recherche <titre>` ➜ Fiche complète, note et bouton de lecture direct',
              '• `/trailer <titre>` ➜ Bande-annonce vidéo YouTube intégrée en 1 clic',
              '• `/recommande [humeur]` ➜ Trouve le film parfait selon ton humeur',
              '• `/sorties` ➜ Calendrier des prochaines sorties 4K avec décompte J-X',
              '• `/nouveautes` ➜ 3 derniers films et séries ajoutés',
              '• `/film-au-hasard` & `/serie-au-hasard` ➜ Tirage au sort d\'une pépite',
              '• `/suggerer <titre>` ➜ Proposer un ajout TMDB avec vote 👍/👎',
            ].join('\n'),
          },
          {
            name: '🎮 Mini-Jeux, Match & Événements',
            value: [
              '• `/quiz [mode]` ➜ Devine le film par les émojis ou QCM (+25 Popcorns)',
              '• `/match <@ami>` ➜ Tinder du Cinéma : trouvez un film en accord parfait',
              '• `/cine-club <film>` ➜ Soirée ciné en vocal avec compte à rebours 3..2..1',
              '• `/avis <titre> <note>` ➜ Publie ta critique avec vote de la communauté',
              '• `/ticket-cine <film> <note>` ➜ Génère ton Billet de Cinéma VIP Collector',
            ].join('\n'),
          },
          {
            name: '🍿 Popcorns & Boutique VIP',
            value: [
              '• `/popcorn` ➜ Solde de Popcorns et réclamation du bonus quotidien (+50)',
              '• `/shop` ➜ Boutique officielle pour acheter les rôles VIP et Réalisateur',
              '• `/top-popcorn` ➜ Classement Top 10 des plus grands cinéphiles',
              '• `/alerte <titre>` ➜ Être notifié dès qu\'un titre sort en 4K',
            ].join('\n'),
          },
          {
            name: '🛠️ Outils & Support',
            value: [
              '• `/ping` ➜ Latence Gateway Discord, Uptime et état de santé du bot',
              '• `/ticket [motif]` ➜ Salon privé d\'assistance avec le staff',
              '• `/stats` & `/site` ➜ État du service et lien officiel',
              '• `/sondage` ➜ Créer un sondage communautaire',
            ].join('\n'),
          },
        ],
        footer: { text: 'AltyFlix Élite 24/7 · 26 Commandes Actives 🍿' },
      }],
    });
    return;
  }

  if (cmdName === 'ping') {
    const uptimeSeconds = Math.floor((Date.now() - botStartTime) / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;
    const memUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

    await respondInteraction(interactionId, interactionToken, {
      embeds: [{
        title: '🏓 Pong ! État de Santé du Master Bot AltyFlix',
        color: COLOR_GREEN,
        fields: [
          { name: '⚡ Latence Gateway Discord', value: `\`${lastGatewayPing} ms\``, inline: true },
          { name: '⏱️ Uptime Service', value: `\`${uptimeStr}\``, inline: true },
          { name: '💾 Utilisation RAM', value: `\`${memUsage} Mo\``, inline: true },
          { name: '🌐 Serveur Cloud Health', value: `\`Port ${PORT} (Actif)\``, inline: true },
          { name: '🟢 Statut 24/7', value: '`Opérationnel 100%`', inline: true },
          { name: '🎬 Commandes Actives', value: '`26 Commandes Slash`', inline: true },
        ],
        footer: { text: 'AltyFlix Monitoring Temps Réel · 2026' },
        timestamp: new Date().toISOString(),
      }],
    });
    return;
  }

  if (cmdName === 'top-popcorn') {
    const uData = loadUserData();
    const usersList = Object.entries(uData.users || {}).map(([id, u]) => ({
      id,
      username: u.username || 'Spectateur',
      popcorn: u.popcorn || 0,
      quizWins: u.quizWins || 0,
    }));

    usersList.sort((a, b) => b.popcorn - a.popcorn);
    const top10 = usersList.slice(0, 10);

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const lines = top10.length > 0
      ? top10.map((u, i) => `${medals[i]} **<@${u.id}>** : **${u.popcorn} 🍿 Popcorns** (${u.quizWins} 🏆 quiz)`).join('\n')
      : 'Aucun membre enregistré pour le moment. Fais `/popcorn` pour commencer à accumuler des pièces !';

    await respondInteraction(interactionId, interactionToken, {
      embeds: [{
        title: '🏆 Classement des Maîtres du Cinéma AltyFlix',
        description: `Voici le panthéon des plus grands cinéphiles et parieurs du serveur :\n\n${lines}`,
        color: COLOR_GOLD,
        footer: { text: 'AltyFlix Leaderboard · Gagne des Popcorns avec /quiz, /avis et /popcorn' },
      }],
    });
    return;
  }

  if (cmdName === 'site') {
    await respondInteraction(interactionId, interactionToken, {
      embeds: [{
        title: '🌐 Plateforme Officielle ALTYFLIX',
        description: '**Films, Séries, Documentaires en illimité et 100% gratuit.**\n\n• Résolution 4K UHD & 1080p FHD\n• 5 Serveurs miroirs haute vitesse (Videasy, VidLink, Vidzy...)\n• Double audio (VF / VOSTFR intégrés)\n• Reprise de lecture synchronisée & mode Kids',
        color: COLOR_RED,
        fields: [
          { name: '🔗 Lien d\'accès', value: `[👉 Ouvrir AltyFlix en grand écran](${SITE_URL})` },
          { name: '⚡ Statut réseau', value: '🟢 Tous les systèmes opérationnels' },
        ],
        footer: { text: 'AltyFlix · Aucune inscription requise' },
      }],
    });
    return;
  }

  if (cmdName === 'stats') {
    await respondInteraction(interactionId, interactionToken, {
      embeds: [{
        title: '📊 Statistiques ALTYFLIX',
        color: COLOR_BLUE,
        fields: [
          { name: '🎬 Catalogue', value: '+100 000 Films & Séries disponibles', inline: true },
          { name: '⚡ Serveurs actifs', value: '5 flux miroirs de secours', inline: true },
          { name: '🔊 Pistes Audio', value: 'VF Française & VOSTFR', inline: true },
          { name: '📱 Compatibilité', value: 'PWA Web, Mobile, Smart TV & PC', inline: true },
          { name: '🛡️ Sécurité & Adblock', value: 'Lecteurs épurés et sécurisés', inline: true },
          { name: '🚀 Disponibilité', value: '99.98% uptime', inline: true },
        ],
        footer: { text: 'AltyFlix Analytics · 2026' },
      }],
    });
    return;
  }

  if (cmdName === 'post-nouveautes') {
    await respondInteraction(interactionId, interactionToken, {
      content: '🚀 Lancement forcé de la publication des dernières nouveautés 4K...',
      flags: 64,
    });
    await checkAndPostNouveautes(true);
    return;
  }

  if (cmdName === 'post-film-du-jour') {
    await respondInteraction(interactionId, interactionToken, {
      content: '🎬 Publication immédiate du coup de cœur du jour...',
      flags: 64,
    });
    await checkAndPostDailyDrop(true);
    return;
  }

  if (cmdName === 'sondage') {
    const question = data.options?.find(o => o.name === 'question')?.value || '';
    const choix1 = data.options?.find(o => o.name === 'choix1')?.value || '';
    const choix2 = data.options?.find(o => o.name === 'choix2')?.value || '';
    const choix3 = data.options?.find(o => o.name === 'choix3')?.value || null;
    const choix4 = data.options?.find(o => o.name === 'choix4')?.value || null;

    const fields = [
      { name: '1️⃣ Option 1', value: choix1, inline: true },
      { name: '2️⃣ Option 2', value: choix2, inline: true },
    ];
    if (choix3) fields.push({ name: '3️⃣ Option 3', value: choix3, inline: true });
    if (choix4) fields.push({ name: '4️⃣ Option 4', value: choix4, inline: true });

    await respondInteraction(interactionId, interactionToken, {
      content: '✅ Sondage créé avec succès !',
      flags: 64,
    });

    const pollMsg = await postMessage(channel_id, {
      embeds: [{
        title: `📊 SONDAGE : ${question}`,
        description: `Proposé par <@${userId}>\nVotez en cliquant sur les réactions correspondantes ci-dessous !`,
        color: COLOR_BLUE,
        fields,
        footer: { text: 'AltyFlix Sondages Communautaires' },
      }],
    });

    if (pollMsg?.id) {
      await addReaction(channel_id, pollMsg.id, '1️⃣');
      await addReaction(channel_id, pollMsg.id, '2️⃣');
      if (choix3) await addReaction(channel_id, pollMsg.id, '3️⃣');
      if (choix4) await addReaction(channel_id, pollMsg.id, '4️⃣');
    }
    return;
  }

  if (cmdName === 'purge') {
    if (!isStaff) {
      await respondInteraction(interactionId, interactionToken, {
        content: '⛔ Seul le staff peut utiliser cette commande.',
        flags: 64,
      });
      return;
    }

    const count = data.options?.find(o => o.name === 'nombre')?.value || 10;
    const clamped = Math.min(Math.max(count, 1), 100);

    const msgs = await discordApi('GET', `/channels/${channel_id}/messages?limit=${clamped}`);
    if (Array.isArray(msgs) && msgs.length > 0) {
      const msgIds = msgs.map(m => m.id);
      await discordApi('POST', `/channels/${channel_id}/messages/bulk-delete`, { messages: msgIds });
      await respondInteraction(interactionId, interactionToken, {
        content: `🧹 **${msgIds.length} messages** ont été supprimés de ce salon.`,
        flags: 64,
      });
    } else {
      await respondInteraction(interactionId, interactionToken, {
        content: '⚠️ Aucun message récent à supprimer.',
        flags: 64,
      });
    }
    return;
  }

  if (cmdName === 'ticket') {
    const motif = data.options?.find(o => o.name === 'motif')?.value || 'Demande générale';
    const channel = await createTicket(userId, username, motif);

    if (channel) {
      await respondInteraction(interactionId, interactionToken, {
        content: `✅ Ton salon de support vient d'être créé : <#${channel.id}>. Le staff a été notifié !`,
        flags: 64,
      });
    } else {
      await respondInteraction(interactionId, interactionToken, {
        content: '⚠️ Une erreur est survenue lors de la création du ticket. Contacte un administrateur.',
        flags: 64,
      });
    }
    return;
  }

  if (cmdName === 'suggerer') {
    await deferInteraction(interactionId, interactionToken, 64);
    const titreQuery = data.options?.find(o => o.name === 'titre')?.value || '';
    const commentaire = data.options?.find(o => o.name === 'commentaire')?.value || '';

    const res = await tmdbFetch('/search/multi', { query: titreQuery, include_adult: 'false' });
    const item = res?.results?.find(r => r.media_type === 'movie' || r.media_type === 'tv') || res?.results?.[0];

    if (!item) {
      await editOriginalResponse(interactionToken, {
        content: `❌ Aucun titre trouvé sur TMDB pour **"${titreQuery}"**. Vérifie le nom officiel !`,
      });
      return;
    }

    const isTv = item.media_type === 'tv';
    const title = item.title || item.name;
    const date = item.release_date || item.first_air_date || '';
    const year = date ? `(${date.split('-')[0]})` : '';
    const rating = item.vote_average ? `⭐ ${item.vote_average.toFixed(1)}/10` : 'Non noté';
    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
    const playUrl = `${SITE_URL}/${isTv ? 'tv' : 'movie'}/${item.id}`;

    await editOriginalResponse(interactionToken, {
      content: `🎉 Ta suggestion pour **${title}** a été envoyée dans <#${suggestionsChannelId}> avec les votes communautaires !`,
    });

    const suggestionMsg = await postMessage(suggestionsChannelId, {
      content: `💡 **Nouvelle suggestion proposée par <@${userId}> !**`,
      embeds: [{
        title: `🎬 ${title} ${year}`,
        url: playUrl,
        description: item.overview ? (item.overview.slice(0, 300) + '...') : 'Synopsis disponible prochainement.',
        color: COLOR_GREEN,
        fields: [
          { name: 'Format', value: isTv ? '📺 Série' : '🎥 Film', inline: true },
          { name: 'Note TMDB', value: rating, inline: true },
          { name: 'Fiche AltyFlix', value: `[👉 Consulter la fiche](${playUrl})`, inline: true },
          ...(commentaire ? [{ name: '💬 Commentaire du membre', value: `*"${commentaire}"*` }] : []),
        ],
        image: poster ? { url: poster } : undefined,
        footer: { text: `AltyFlix Suggestions · ID TMDB: ${item.id} · Votez ci-dessous !` },
      }],
    });

    if (suggestionMsg?.id) {
      await addReaction(suggestionsChannelId, suggestionMsg.id, '👍');
      await addReaction(suggestionsChannelId, suggestionMsg.id, '👎');
    }
    return;
  }

  if (cmdName === 'recherche') {
    await deferInteraction(interactionId, interactionToken);
    const query = data.options?.find(o => o.name === 'titre')?.value || '';
    const res = await tmdbFetch('/search/multi', { query, include_adult: 'false' });
    const item = res?.results?.find(r => r.media_type === 'movie' || r.media_type === 'tv');

    if (!item) {
      await editOriginalResponse(interactionToken, {
        content: `❌ Aucun résultat trouvé sur AltyFlix pour **"${query}"**. Vérifie l'orthographe !`,
      });
      return;
    }

    const isTv = item.media_type === 'tv';
    const title = item.title || item.name;
    const date = item.release_date || item.first_air_date || 'Date inconnue';
    const year = date.split('-')[0];
    const rating = item.vote_average ? `⭐ ${item.vote_average.toFixed(1)}/10` : 'Non noté';
    const overview = item.overview || 'Aucun synopsis disponible.';
    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
    const playUrl = `${SITE_URL}/${isTv ? 'tv' : 'movie'}/${item.id}`;

    await editOriginalResponse(interactionToken, {
      embeds: [{
        title: `🎬 ${title} (${year})`,
        url: playUrl,
        description: overview.length > 300 ? overview.slice(0, 300) + '...' : overview,
        color: COLOR_RED,
        fields: [
          { name: 'Type', value: isTv ? '📺 Série' : '🎥 Film', inline: true },
          { name: 'Note', value: rating, inline: true },
          { name: 'Lien direct', value: `[🍿 Regarder sur AltyFlix](${playUrl})`, inline: true },
        ],
        image: poster ? { url: poster } : undefined,
        footer: { text: 'AltyFlix · Clique sur le titre pour lancer le lecteur 4K' },
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 5, label: '▶ Lancer le lecteur 4K', url: playUrl, emoji: { name: '🍿' } },
        ],
      }],
    });
    return;
  }

  if (cmdName === 'film-au-hasard' || cmdName === 'serie-au-hasard') {
    await deferInteraction(interactionId, interactionToken);
    const isTv = cmdName === 'serie-au-hasard';
    const endpoint = isTv ? '/tv/top_rated' : '/movie/top_rated';
    const randomPage = Math.floor(Math.random() * 5) + 1;
    const res = await tmdbFetch(endpoint, { page: randomPage });
    const items = res?.results || [];
    const item = items[Math.floor(Math.random() * items.length)];

    if (!item) {
      await editOriginalResponse(interactionToken, {
        content: '⚠️ Impossible de tirer un titre au sort pour le moment.',
      });
      return;
    }

    const title = item.title || item.name;
    const date = item.release_date || item.first_air_date || '';
    const year = date ? `(${date.split('-')[0]})` : '';
    const rating = item.vote_average ? `⭐ ${item.vote_average.toFixed(1)}/10` : 'Non noté';
    const playUrl = `${SITE_URL}/${isTv ? 'tv' : 'movie'}/${item.id}`;
    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;

    await editOriginalResponse(interactionToken, {
      embeds: [{
        title: `🎲 Choix aléatoire : ${title} ${year}`,
        url: playUrl,
        description: item.overview || 'Un classique à ne pas manquer !',
        color: COLOR_GOLD,
        fields: [
          { name: 'Type', value: isTv ? '📺 Série' : '🎥 Film', inline: true },
          { name: 'Note', value: rating, inline: true },
          { name: 'Lancer', value: `[🍿 Regarder maintenant](${playUrl})`, inline: true },
        ],
        image: poster ? { url: poster } : undefined,
        footer: { text: 'AltyFlix · Bon visionnage !' },
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 5, label: '▶ Lancer sur AltyFlix', url: playUrl, emoji: { name: '🍿' } },
        ],
      }],
    });
    return;
  }

  if (cmdName === 'nouveautes') {
    await deferInteraction(interactionId, interactionToken);
    const [moviesRes, seriesRes] = await Promise.all([
      tmdbFetch('/movie/now_playing', { page: 1 }),
      tmdbFetch('/tv/on_the_air', { page: 1 }),
    ]);

    const movies = (moviesRes?.results || []).slice(0, 3);
    const series = (seriesRes?.results || []).slice(0, 3);

    const movieLines = movies.map(m => `• [**${m.title}**](${SITE_URL}/movie/${m.id}) (${m.vote_average?.toFixed(1) || 'N/A'} ⭐)`).join('\n') || 'Aucun';
    const seriesLines = series.map(s => `• [**${s.name}**](${SITE_URL}/tv/${s.id}) (${s.vote_average?.toFixed(1) || 'N/A'} ⭐)`).join('\n') || 'Aucun';

    await editOriginalResponse(interactionToken, {
      embeds: [{
        title: '🍿 Dernières nouveautés disponibles sur AltyFlix',
        color: COLOR_RED,
        fields: [
          { name: '🎥 Films récents', value: movieLines },
          { name: '📺 Séries en cours de diffusion', value: seriesLines },
        ],
        footer: { text: 'AltyFlix · Mis à jour 24/7' },
      }],
    });
    return;
  }

  // 14. /quiz et /quizz
  if (cmdName === 'quiz' || cmdName === 'quizz') {
    await deferInteraction(interactionId, interactionToken);
    try {
      const mode = data.options?.find(o => o.name === 'mode')?.value || 'hasard';
      const payload = await generateCinemaQuiz(mode);
      await editOriginalResponse(interactionToken, payload);
    } catch (err) {
      console.error('Erreur génération quiz :', err);
      await editOriginalResponse(interactionToken, {
        content: `❌ Une erreur est survenue lors de la création du quiz : ${err.message}`,
      });
    }
    return;
  }

  // 15. /recommande
  if (cmdName === 'recommande') {
    await deferInteraction(interactionId, interactionToken);
    const humeur = data.options?.find(o => o.name === 'humeur')?.value || 'action';
    const moodMap = {
      frissons: { genres: '27,53', label: '😱 Frissons & Suspense' },
      comedie: { genres: '35', label: '😂 Comédie & Détente' },
      action: { genres: '28,12', label: '💥 Action & Blockbuster' },
      mindfuck: { genres: '9648,878', label: '🧠 Mindfuck & Psychologique' },
      romance: { genres: '10749,35', label: '💖 Romance & Feel-Good' },
      scifi: { genres: '878', label: '🚀 Science-Fiction & Voyage' },
    };
    const sel = moodMap[humeur] || moodMap.action;
    const page = Math.floor(Math.random() * 3) + 1;
    const res = await tmdbFetch('/discover/movie', {
      with_genres: sel.genres,
      'vote_average.gte': '7.0',
      sort_by: 'vote_count.desc',
      page,
    });
    const items = res?.results || [];
    const item = items[Math.floor(Math.random() * items.length)];

    if (!item) {
      await editOriginalResponse(interactionToken, { content: '⚠️ Aucune recommandation trouvée.' });
      return;
    }

    const title = item.title || item.original_title;
    const year = (item.release_date || '').split('-')[0];
    const playUrl = `${SITE_URL}/movie/${item.id}`;
    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;

    await editOriginalResponse(interactionToken, {
      embeds: [{
        title: `🍿 Ta Recommandation du Soir : ${title} (${year})`,
        url: playUrl,
        description: `> *Ambiance sélectionnée : **${sel.label}***\n\n${item.overview || 'Un chef-d\'œuvre cinématographique à savourer.'}`,
        color: COLOR_RED,
        fields: [
          { name: 'Note Spectateurs', value: `⭐ ${item.vote_average?.toFixed(1) || 'N/A'}/10 (${ratingStars(item.vote_average)})`, inline: true },
          { name: 'Résolution', value: '🟢 4K Ultra HD · VF & VOSTFR', inline: true },
        ],
        image: poster ? { url: poster } : undefined,
        footer: { text: 'AltyFlix · Clique sur le bouton ci-dessous pour lancer la lecture' },
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 5, label: '▶ Lancer le film sur AltyFlix', url: playUrl, emoji: { name: '🍿' } },
        ],
      }],
    });
    return;
  }

  // 16. /trailer
  if (cmdName === 'trailer') {
    await deferInteraction(interactionId, interactionToken);
    const titre = data.options?.find(o => o.name === 'titre')?.value || '';
    const searchRes = await tmdbFetch('/search/multi', { query: titre, include_adult: 'false' });
    const item = searchRes?.results?.find(r => r.media_type === 'movie' || r.media_type === 'tv') || searchRes?.results?.[0];

    if (!item) {
      await editOriginalResponse(interactionToken, {
        content: `❌ Aucun film ou série trouvé pour **"${titre}"**.`,
      });
      return;
    }

    const isTv = item.media_type === 'tv';
    const type = isTv ? 'tv' : 'movie';
    const title = item.title || item.name;
    const videosRes = await tmdbFetch(`/${type}/${item.id}/videos`);
    const videos = videosRes?.results || [];

    const trailer = videos.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser') && v.iso_639_1 === 'fr') ||
                    videos.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')) ||
                    videos.find(v => v.site === 'YouTube');

    if (!trailer) {
      await editOriginalResponse(interactionToken, {
        content: `⚠️ Aucune bande-annonce vidéo disponible pour **${title}**.`,
      });
      return;
    }

    const ytUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
    const playUrl = `${SITE_URL}/${type}/${item.id}`;

    await editOriginalResponse(interactionToken, {
      content: `🎬 **Bande-Annonce Officielle : ${title}**\n${ytUrl}`,
      embeds: [{
        title: `🍿 Regarder ${title} en 4K sur AltyFlix`,
        url: playUrl,
        description: `Bande-annonce disponible ci-dessus. Cliquez sur le bouton pour accéder directement au lecteur 4K VF / VOSTFR sur AltyFlix !`,
        color: COLOR_RED,
        footer: { text: 'AltyFlix Trailers 4K' },
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 5, label: 'Ouvrir sur AltyFlix 4K', url: playUrl, emoji: { name: '🍿' } },
        ],
      }],
    });
    return;
  }

  // 17. /sorties
  if (cmdName === 'sorties') {
    await deferInteraction(interactionId, interactionToken);
    const res = await tmdbFetch('/movie/upcoming', { language: 'fr-FR', region: 'FR' });
    const movies = (res?.results || []).slice(0, 4);

    if (movies.length === 0) {
      await editOriginalResponse(interactionToken, { content: '⚠️ Calendrier indisponible pour le moment.' });
      return;
    }

    const todayDate = new Date();
    const fields = movies.map(m => {
      const relDate = new Date(m.release_date);
      const diffDays = Math.ceil((relDate - todayDate) / (1000 * 60 * 60 * 24));
      const countdown = diffDays === 0 ? '🔴 **SORT AUJOURD\'HUI !**' : (diffDays > 0 ? `⏳ **J-${diffDays}** (Sortie le ${m.release_date})` : `✅ **Déjà sorti** (${m.release_date})`);
      return {
        name: `🎬 ${m.title}`,
        value: `${countdown}\n⭐ Note : ${m.vote_average?.toFixed(1) || 'N/A'}/10\n> *${m.overview ? (m.overview.slice(0, 120) + '...') : 'Synopsis à venir.'}*`,
        inline: false,
      };
    });

    await editOriginalResponse(interactionToken, {
      embeds: [{
        title: '📅 Prochaines Sorties Cinéma & Séries les Plus Attendues',
        description: 'Voici le calendrier des films et séries majeurs qui débarquent très bientôt sur AltyFlix en 4K ! 🍿',
        color: COLOR_GOLD,
        fields,
        footer: { text: 'AltyFlix Calendrier · Alertes automatiques activées' },
      }],
    });
    return;
  }

  // 18. /avis
  if (cmdName === 'avis') {
    const titre = data.options?.find(o => o.name === 'titre')?.value || '';
    const note = data.options?.find(o => o.name === 'note')?.value || 5;
    const commentaire = data.options?.find(o => o.name === 'commentaire')?.value || '';

    const res = await tmdbFetch('/search/multi', { query: titre });
    const item = res?.results?.[0];
    const title = item?.title || item?.name || titre;
    const year = (item?.release_date || item?.first_air_date || '').split('-')[0];
    const poster = item?.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
    const playUrl = item ? `${SITE_URL}/${item.media_type === 'tv' ? 'tv' : 'movie'}/${item.id}` : SITE_URL;

    const fullStars = '⭐'.repeat(Math.min(Math.max(note, 0), 10));
    const emptyStars = '☆'.repeat(Math.max(0, 10 - note));
    const starsStr = fullStars + emptyStars;

    const uData = loadUserData();
    const u = getUser(uData, userId, username);
    u.popcorn = (u.popcorn || 0) + 15;
    const reviewId = `rev_${Date.now()}`;
    if (!uData.reviews) uData.reviews = {};
    uData.reviews[reviewId] = { title, note, agrees: [], disagrees: [], authorId: userId };
    saveUserData(uData);

    await respondInteraction(interactionId, interactionToken, {
      content: `🎉 Ta critique a été publiée ! Tu remportes **+15 🍿 Popcorns** !`,
      flags: 64,
    });

    await postMessage(channel_id, {
      embeds: [{
        title: `⭐ Critique Ciné : ${title} ${year ? `(${year})` : ''}`,
        url: playUrl,
        description: [
          `**Avis de <@${userId}> :**`,
          `> ${starsStr} **(${note}/10)**`,
          '',
          commentaire ? `*"${commentaire}"*` : '*Note partagée sans commentaire détaillé.*',
        ].join('\n'),
        color: note >= 7 ? COLOR_GREEN : (note >= 4 ? COLOR_GOLD : COLOR_RED),
        thumbnail: poster ? { url: poster } : undefined,
        footer: { text: `AltyFlix Critiques · Votez si vous êtes d'accord ci-dessous !` },
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: '👍 D\'accord', custom_id: `btn_review_agree_${reviewId}` },
          { type: 2, style: 4, label: '👎 Pas d\'accord', custom_id: `btn_review_disagree_${reviewId}` },
          { type: 2, style: 5, label: 'Voir sur AltyFlix', url: playUrl },
        ],
      }],
    });
    return;
  }

  // 19. /match
  if (cmdName === 'match') {
    const friendId = data.options?.find(o => o.name === 'ami')?.value;
    if (!friendId || friendId === userId) {
      await respondInteraction(interactionId, interactionToken, {
        content: '❌ Merci de mentionner un(e) ami(e) différent(e) de toi pour lancer un match cinéma !',
        flags: 64,
      });
      return;
    }

    const popularRes = await tmdbFetch('/movie/popular', { language: 'fr-FR', page: 1 });
    const movies = (popularRes?.results || []).slice(0, 5);

    if (movies.length === 0) {
      await respondInteraction(interactionId, interactionToken, { content: '⚠️ Films indisponibles pour le match.', flags: 64 });
      return;
    }

    const matchId = `m_${Date.now()}`;
    const uData = loadUserData();
    if (!uData.matches) uData.matches = {};
    uData.matches[matchId] = {
      u1: userId,
      u2: friendId,
      movies,
      likes: {},
    };
    saveUserData(uData);

    const firstMovie = movies[0];
    const poster = firstMovie.poster_path ? `https://image.tmdb.org/t/p/w500${firstMovie.poster_path}` : null;
    const playUrl = `${SITE_URL}/movie/${firstMovie.id}`;

    await respondInteraction(interactionId, interactionToken, {
      content: `🔥 **Tinder du Cinéma lancé entre <@${userId}> et <@${friendId}> !**\nVotez chacun votre tour : dès que vous aimez tous les deux le même film, c'est le MATCH ! 🍿`,
      embeds: [{
        title: `🔥 Tinder Ciné (1/${movies.length}) : ${firstMovie.title}`,
        url: playUrl,
        description: firstMovie.overview ? (firstMovie.overview.slice(0, 300) + '...') : 'Aucun synopsis.',
        color: COLOR_RED,
        fields: [
          { name: 'Note Spectateurs', value: `⭐ ${firstMovie.vote_average?.toFixed(1) || 'N/A'}/10`, inline: true },
          { name: 'Participants', value: `<@${userId}> & <@${friendId}>`, inline: true },
        ],
        image: poster ? { url: poster } : undefined,
        footer: { text: 'AltyFlix Match · Cliquez sur J\'aime si le film vous intéresse !' },
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: '💚 J\'aime (0/2)', custom_id: `btn_match_like_${matchId}_0` },
          { type: 2, style: 2, label: '❌ Suivant', custom_id: `btn_match_next_${matchId}_0` },
          { type: 2, style: 5, label: 'Fiche 4K', url: playUrl },
        ],
      }],
    });
    return;
  }

  // 20. /popcorn
  if (cmdName === 'popcorn') {
    const uData = loadUserData();
    const u = getUser(uData, userId, username);

    await respondInteraction(interactionId, interactionToken, {
      embeds: [{
        title: `🍿 Compte Popcorn AltyFlix — @${username}`,
        color: COLOR_GOLD,
        fields: [
          { name: '💰 Solde de Popcorns', value: `**${u.popcorn || 0} 🍿 Popcorns**`, inline: true },
          { name: '🏆 Victoires Quiz', value: `${u.quizWins || 0} trophée(s)`, inline: true },
          { name: '🔔 Alertes Actives', value: `${(u.alerts || []).length} film(s)`, inline: true },
        ],
        description: [
          'Les **Popcorns** sont la monnaie officielle d\'AltyFlix !',
          '• Gagnez-en chaque jour avec votre bonus quotidien (+50 🍿).',
          '• Répondez correctement aux quiz cinéma (+25 🍿).',
          '• Partagez vos critiques de films avec `/avis` (+15 🍿).',
          '• Dépensez vos Popcorns dans le **/shop** pour obtenir des rôles VIP prestigieux !',
        ].join('\n'),
        footer: { text: 'AltyFlix Économie Communautaire 🍿' },
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: '🎁 Réclamer mon bonus (+50 🍿)', custom_id: 'btn_popcorn_daily', emoji: { name: '🍿' } },
        ],
      }],
    });
    return;
  }

  // 21. /shop
  if (cmdName === 'shop') {
    const uData = loadUserData();
    const u = getUser(uData, userId, username);

    await respondInteraction(interactionId, interactionToken, {
      embeds: [{
        title: '🛍️ Boutique Officielle AltyFlix',
        description: `Bonjour <@${userId}> ! Ton solde actuel est de **${u.popcorn || 0} 🍿 Popcorns**.\nVoici les récompenses exclusives que tu peux débloquer :`,
        color: COLOR_GOLD,
        fields: [
          {
            name: '⭐ Rôle VIP AltyFlix — 300 🍿',
            value: 'Accès prioritaire, couleur dorée sur le profil et statut de membre privilégié !',
            inline: false,
          },
          {
            name: '🎬 Rôle Réalisateur — 600 🍿',
            value: 'Le grade suprême du serveur AltyFlix ! Couleur rouge cinéma, salon dédié et prestige absolu.',
            inline: false,
          },
        ],
        footer: { text: 'AltyFlix Shop · Cliquez ci-dessous pour débloquer votre rôle !' },
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 1, label: '👑 Débloquer VIP (300 🍿)', custom_id: 'btn_shop_buy_vip' },
          { type: 2, style: 3, label: '🎬 Débloquer Réalisateur (600 🍿)', custom_id: 'btn_shop_buy_realisateur' },
        ],
      }],
    });
    return;
  }

  // 22. /alerte
  if (cmdName === 'alerte') {
    const titre = data.options?.find(o => o.name === 'titre')?.value || '';
    const uData = loadUserData();
    const u = getUser(uData, userId, username);
    if (!u.alerts) u.alerts = [];

    if (!u.alerts.includes(titre)) {
      u.alerts.push(titre);
      saveUserData(uData);
    }

    await respondInteraction(interactionId, interactionToken, {
      embeds: [{
        title: '🔔 Alerte Sortie 4K Activée !',
        description: `> Tu es désormais abonné aux sorties pour **"${titre}"** !\n\nDès que notre moteur 24/7 détecte ce titre dans les nouvelles sorties TMDB/AltyFlix, **tu seras directement notifié et mentionné** dans <#${nouveautesChannelId}> avec le lien de streaming 4K direct ! 🍿`,
        color: COLOR_GREEN,
        fields: [
          { name: 'Titre surveillé', value: `🎬 **${titre}**`, inline: true },
          { name: 'Tes alertes actives', value: `${u.alerts.length} titre(s)`, inline: true },
        ],
        footer: { text: 'AltyFlix Veille 24/7' },
      }],
      flags: 64,
    });
    return;
  }

  // 23. /ticket-cine
  if (cmdName === 'ticket-cine') {
    const film = data.options?.find(o => o.name === 'film')?.value || 'Film Inconnu';
    const note = data.options?.find(o => o.name === 'note')?.value || 8;

    const res = await tmdbFetch('/search/multi', { query: film });
    const item = res?.results?.[0];
    const title = item?.title || item?.name || film;
    const year = (item?.release_date || item?.first_air_date || '').split('-')[0] || '2026';
    const poster = item?.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
    const playUrl = item ? `${SITE_URL}/${item.media_type === 'tv' ? 'tv' : 'movie'}/${item.id}` : SITE_URL;

    const rows = ['A', 'B', 'C', 'D', 'E', 'F'];
    const row = rows[Math.floor(Math.random() * rows.length)];
    const seat = Math.floor(Math.random() * 20) + 1;
    const ticketCode = `ALTY-${Math.floor(1000 + Math.random() * 9000)}-VIP`;
    const stars = '⭐'.repeat(Math.min(note, 10));

    const ticketAscii = [
      '```',
      '╔══════════════════════════════════════════════════════════╗',
      '║               🎟️ BILLET DE CINÉMA VIP ALTYFLIX          ║',
      '╠══════════════════════════════════════════════════════════╣',
      `║ Spectateur : @${username.slice(0, 25).padEnd(25)}          ║`,
      `║ Titre      : ${title.slice(0, 25).padEnd(25)} (${year})   ║`,
      `║ Note       : ${stars.padEnd(20)} (${note}/10)        ║`,
      '║ Salle      : Salle 1 • 4K UHD Dolby Atmos                ║',
      `║ Siège VIP  : Rangée ${row} • Fauteuil ${String(seat).padEnd(2)} [PREMIUM]         ║`,
      `║ Billet N°  : ${ticketCode.padEnd(20)}                ║`,
      '║ ║▌│█║▌│ █║▌│█│║▌║ ▌│█│║▌║ ▌│█│║▌║ █║▌│                   ║',
      '╚══════════════════════════════════════════════════════════╝',
      '```',
    ].join('\n');

    await respondInteraction(interactionId, interactionToken, {
      embeds: [{
        title: `🎟️ Billet Collector de @${username} : ${title}`,
        description: ticketAscii,
        color: COLOR_GOLD,
        thumbnail: poster ? { url: poster } : undefined,
        footer: { text: 'AltyFlix Cinema Tickets · Billet certifié VIP 🍿' },
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 5, label: 'Regarder le film en 4K', url: playUrl, emoji: { name: '🍿' } },
        ],
      }],
    });
    return;
  }

  // 24. /cine-club
  if (cmdName === 'cine-club') {
    const film = data.options?.find(o => o.name === 'film')?.value || '';
    const heure = data.options?.find(o => o.name === 'heure')?.value || 'Ce soir à 21h00';

    const res = await tmdbFetch('/search/multi', { query: film });
    const item = res?.results?.[0];
    const title = item?.title || item?.name || film;
    const year = (item?.release_date || item?.first_air_date || '').split('-')[0] || '';
    const poster = item?.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
    const playUrl = item ? `${SITE_URL}/${item.media_type === 'tv' ? 'tv' : 'movie'}/${item.id}` : SITE_URL;

    const partyId = `party_${Date.now()}`;
    const uData = loadUserData();
    if (!uData.watchParties) uData.watchParties = {};
    uData.watchParties[partyId] = { title, hostId: userId, participants: [userId] };
    saveUserData(uData);

    await respondInteraction(interactionId, interactionToken, {
      content: '🎉 Séance Ciné-Club programmée avec succès !',
      flags: 64,
    });

    await postMessage(channel_id, {
      content: `🎬 **SÉANCE CINÉ-CLUB OFFICIELLE ALTYFLIX !**\nOrganisée par <@${userId}> dans le salon vocal **🎧 Général / 🎬 Ciné-club** !`,
      embeds: [{
        title: `🍿 Séance Collective : ${title} ${year ? `(${year})` : ''}`,
        url: playUrl,
        description: [
          `> ${item?.overview ? (item.overview.slice(0, 300) + '...') : 'Préparez vos boissons et vos popcorns !'}`,
          '',
          `⏰ **Horaire** : **${heure}**`,
          `🎧 **Lieu** : Salon Vocal **Ciné-club**`,
          `🍿 **Organisateur** : <@${userId}>`,
          '',
          'Cliquez sur **Je participe** pour être compté parmi les spectateurs et sur **Top Départ** pour lancer la lecture synchronisée !',
        ].join('\n'),
        color: COLOR_RED,
        image: poster ? { url: poster } : undefined,
        footer: { text: 'AltyFlix Ciné-Club · Visionnage synchronisé 24/7' },
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: '🍿 Je participe (1)', custom_id: `btn_cineclub_join_${partyId}` },
          { type: 2, style: 1, label: '▶️ Top Départ 3... 2... 1...', custom_id: `btn_cineclub_start_${partyId}` },
          { type: 2, style: 5, label: 'Lien AltyFlix 4K', url: playUrl },
        ],
      }],
    });
    return;
  }
}

// ─── WebSocket Gateway ───────────────────────────────────────────────────────
function connect() {
  const ws = new WebSocket(WS);

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const { op, d, s, t } = msg;
    if (s) sequence = s;

    // OP 11: Heartbeat ACK
    if (op === 11) {
      lastGatewayPing = Math.max(1, Date.now() - lastPingTimestamp);
    }

    // OP 10: Hello
    if (op === 10) {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      lastPingTimestamp = Date.now();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: 1, d: sequence }));
      }
      heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          lastPingTimestamp = Date.now();
          ws.send(JSON.stringify({ op: 1, d: sequence }));
        }
      }, d.heartbeat_interval);

      // Identify
      ws.send(JSON.stringify({
        op: 2,
        d: {
          token: TOKEN,
          intents: (1 << 0) | (1 << 10), // GUILDS | GUILD_MESSAGE_REACTIONS
          properties: { os: 'windows', browser: 'altyflix-master-bot', device: 'altyflix-server' },
        },
      }));
    }

    // OP 0: Dispatch
    if (op === 0) {
      if (t === 'READY') {
        botId = d.user.id;
        botAvatarUrl = `https://cdn.discordapp.com/avatars/${d.user.id}/${d.user.avatar}.png`;
        console.log(`\n🎉 ALTYFLIX MASTER BOT 24/7 CONNECTÉ !`);
        console.log(`   Identifiant : ${d.user.username} (${botId})`);
        console.log(`   Serveurs    : ${d.guilds?.length || 1}`);

        // Set rich presence
        sendPresence(ws);
        if (presenceInterval) clearInterval(presenceInterval);
        presenceInterval = setInterval(() => sendPresence(ws), 60000);

        // Démarrer le scheduler 24/7
        start24_7Scheduler();
      }

      // 1. Réactions de vérification (fallback)
      if (t === 'MESSAGE_REACTION_ADD') {
        const { channel_id, message_id, emoji, user_id } = d;
        if (
          channel_id === rulesChannelId &&
          emoji.name === '✅' &&
          user_id !== botId
        ) {
          const ok = await addMemberRole(user_id, membreRoleId);
          if (ok) {
            console.log(`🍿 Rôle Spectateur attribué par réaction à <@${user_id}>`);
            if (discussionsChannelId) {
              await postMessage(discussionsChannelId, {
                content: `🎉 Bienvenue à <@${user_id}> qui vient de valider le règlement ! Bon visionnage sur **AltyFlix** 🍿`,
              });
            }
          }
        }
      }

      // 2. Interactions (Boutons et Slash Commands)
      if (t === 'INTERACTION_CREATE') {
        if (d.type === 2) { // APPLICATION_COMMAND
          const userTag = d.member?.user?.username || d.user?.username || 'inconnu';
          console.log(`⚡ [COMMANDE] /${d.data?.name} reçu de @${userTag} (${d.id})`);
          handleSlashCommand(d).catch(err => {
            console.error('Erreur commande Slash :', err);
          });
        } else if (d.type === 3) { // MESSAGE_COMPONENT
          const userTag = d.member?.user?.username || d.user?.username || 'inconnu';
          console.log(`⚡ [BOUTON] ${d.data?.custom_id} cliqué par @${userTag} (${d.id})`);
          handleButtonInteraction(d).catch(err => {
            console.error('Erreur interaction composant :', err);
          });
        }
      }
    }
  });

  ws.on('close', (code) => {
    console.log(`⚠️ WebSocket fermé (code ${code}). Reconnexion dans 4 secondes...`);
    clearInterval(heartbeatInterval);
    clearInterval(presenceInterval);
    setTimeout(connect, 4000);
  });

  ws.on('error', (err) => {
    console.error('❌ Erreur Gateway :', err.message);
  });
}

// ─── Zero-Crash Guards ───────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('🚨 Exception non gérée (attrapée) :', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('🚨 Promesse rejetée non gérée (attrapée) :', reason);
});

console.log('🚀 Démarrage du Master Bot AltyFlix 24/7...');
connect();
