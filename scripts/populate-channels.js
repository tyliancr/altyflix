import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, 'bot-config.json'), 'utf8'));

const SITE_URL = 'https://altyflix.netlify.app';

async function sendEmbed(channelId, embed) {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Erreur envoi sur ${channelId}:`, err);
    return null;
  }
  return res.json();
}

async function run() {
  console.log('🚀 Initialisation des salons restants...');

  // 1. 🎭・films (1554787558167289859)
  await sendEmbed('1554787558167289859', {
    title: '🍿 Bienvenue dans le salon Films !',
    description: 'Partagez ici vos coups de cœur, critiques, pépites découvertes sur **AltyFlix** et débats cinématographiques.',
    color: 0xE50914,
    fields: [
      { 
        name: "🎬 Qu'est-ce qu'on y fait ?", 
        value: "• Donner vos avis sans spoilers (ou utilisez les balises `||spoiler||`)\n• Recommander des films disponibles sur le catalogue\n• Échanger sur les classiques et les dernières sorties" 
      },
      { 
        name: '🌐 Catalogue Films', 
        value: `[Accéder aux films sur AltyFlix](${SITE_URL}/films)` 
      }
    ],
    footer: { text: 'AltyFlix · Cinéma & Émotion 🍿' }
  });
  console.log('✅ Salon 🎭・films initialisé');

  // 2. 📺・séries (1554787561795493899)
  await sendEmbed('1554787561795493899', {
    title: '📺 Bienvenue dans le salon Séries !',
    description: "Binge-watchers confirmés ou amateurs de mini-séries, c'est ici que tout se passe !",
    color: 0x5865F2,
    fields: [
      { 
        name: '🍿 Au programme', 
        value: "• Discussions sur vos saisons et épisodes en cours\n• Théories, fins de saisons et attentes\n• Attention aux spoilers : balises `||texte||` obligatoires !" 
      },
      { 
        name: '🌐 Catalogue Séries', 
        value: `[Accéder aux séries sur AltyFlix](${SITE_URL}/series)` 
      }
    ],
    footer: { text: 'AltyFlix · Binge-watching illimité 🍿' }
  });
  console.log('✅ Salon 📺・séries initialisé');

  // 3. 🐛・bug-report (1554787565545201685)
  await sendEmbed('1554787565545201685', {
    title: '🐛 Signalement de Bugs & Problèmes',
    description: "Un lecteur vidéo qui ne se lance pas ? Une coquille d'affichage ? Signalez-le ici pour que le staff intervienne au plus vite !",
    color: 0xFEE75C,
    fields: [
      { 
        name: '📋 Modèle de signalement recommandé', 
        value: "• **Page / Titre concerné** : (ex: Film Inception ou Page Profil)\n• **Appareil / Navigateur** : (ex: PC Chrome, iPhone Safari, Smart TV...)\n• **Description du bug** : Que s'est-il passé ?\n• **Capture d'écran** : (si possible)" 
      },
      { 
        name: '⚡ Lecteurs de secours', 
        value: "N'oubliez pas que le lecteur AltyFlix intègre 5 serveurs de streaming (Videasy, VidLink, Vidzy...). Changez de serveur en un clic dans le lecteur !" 
      }
    ],
    footer: { text: 'AltyFlix · Support Technique 🛡️' }
  });
  console.log('✅ Salon 🐛・bug-report initialisé');

  // 4. 💡・suggestions (1554787568963293234)
  await sendEmbed('1554787568963293234', {
    title: '💡 Boîte à Idées & Suggestions',
    description: 'AltyFlix grandit grâce à sa communauté ! Proposez vos idées pour améliorer la plateforme ou le serveur.',
    color: 0x57F287,
    fields: [
      { 
        name: '🎯 Vos retours comptent', 
        value: "• Suggestions de fonctionnalités (interface, filtres, profils...)\n• Suggestions de films/séries à mettre en avant\n• Idées d'animations pour le serveur Discord" 
      },
      { 
        name: '🗳️ Système de vote', 
        value: 'Réagissez avec 👍 ou 👎 sur les idées postées par les autres membres pour les soutenir !' 
      }
    ],
    footer: { text: 'AltyFlix · Évolution communautaire 💡' }
  });
  console.log('✅ Salon 💡・suggestions initialisé');

  // 5. 🔧・bot-config (1554787609853698078)
  await sendEmbed('1554787609853698078', {
    title: '🔧 Configuration & Commandes Bot Staff',
    description: "Ce salon récapitule les scripts d'automatisation AltyFlix.",
    color: 0x2B2D31,
    fields: [
      { 
        name: '🤖 Scripts disponibles (scripts/)', 
        value: "• `node scripts/discord-announce.js` : Annonce des mises à jour du site\n• `node scripts/discord-nouveautes.js` : Publication des nouveautés de la semaine\n• `node scripts/bot-reaction.js` : Bot rôles de vérification en temps réel\n• `node scripts/discord-cron.js` : CRON hebdo automatique du lundi" 
      },
      { 
        name: '🔑 Configuration', 
        value: 'Toutes les configurations sont centralisées dans `bot-config.json`.' 
      }
    ],
    footer: { text: 'AltyFlix · Staff Internal Tool 🔧' }
  });
  console.log('✅ Salon 🔧・bot-config initialisé');

  // 6. 📋・logs (1554787613544816711)
  await sendEmbed('1554787613544816711', {
    title: "📋 Journal d'Audit & Initialisation",
    description: 'Configuration du serveur Discord AltyFlix effectuée et prête.',
    color: 0x2B2D31,
    fields: [
      { 
        name: '⚙️ État du système', 
        value: "• Salons publics et staff créés et configurés\n• Message de vérification avec rôle automatique actif\n• Webhooks et API Discord opérationnels\n• Annonces officielles publiées" 
      }
    ],
    footer: { text: 'AltyFlix · Logs Système 📋' }
  });
  console.log('✅ Salon 📋・logs initialisé');

  console.log('\n🎉 Tous les salons Discord ont été entièrement initialisés et configurés !');
}

run();
