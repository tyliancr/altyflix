import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'bot-config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const { TOKEN: _legacyToken, guildId, rulesChannelId } = config;
const TOKEN = process.env.DISCORD_TOKEN;
const API = 'https://discord.com/api/v10';
const SITE_URL = 'https://altyflix.netlify.app';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(method, endpoint, body = null) {
  const opts = {
    method,
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${endpoint}`, opts);
  if (res.status === 429) {
    const d = await res.json();
    const wait = Math.ceil((d.retry_after || 1) * 1000) + 500;
    console.log(`   ⏳ Rate limit ${wait}ms`);
    await sleep(wait);
    return api(method, endpoint, body);
  }
  if (res.status === 204) return true;
  if (!res.ok) {
    const text = await res.text();
    console.warn(`Discord API ${method} ${endpoint} ${res.status}:`, text);
    return null;
  }
  return res.json();
}

async function run() {
  console.log('🧹 Nettoyage des salons communautaires et refonte 100% Cinéma...');

  // 1. Récupérer les salons
  const channels = await api('GET', `/guilds/${guildId}/channels`);

  // Supprimer la catégorie COMMUNAUTÉ et ses salons
  const channelsToDelete = channels.filter(c => 
    c.name.includes('COMMUNAUTÉ') ||
    c.name.includes('présentations') ||
    c.name.includes('général') ||
    c.name.includes('memes') ||
    c.name.includes('partages')
  );

  for (const ch of channelsToDelete) {
    console.log(`   🗑️ Suppression de ${ch.name} (${ch.id})...`);
    await api('DELETE', `/channels/${ch.id}`);
    await sleep(400);
  }

  // 2. Nettoyer l'ancien contenu du salon #📜・règlement
  console.log('🧹 Nettoyage du salon #📜・règlement...');
  const oldMsgs = await api('GET', `/channels/${rulesChannelId}/messages?limit=20`);
  if (Array.isArray(oldMsgs)) {
    for (const m of oldMsgs) {
      await api('DELETE', `/channels/${rulesChannelId}/messages/${m.id}`);
      await sleep(350);
    }
  }

  // 3. Poster le NOUVEAU règlement 100% Cinéma & Séries
  console.log('🎬 Publication de la nouvelle charte cinéma...');

  const rulesEmbed = {
    title: '🎬 ALTYFLIX — CHARTE CINÉMA & RÈGLEMENT OFFICIEL',
    description: [
      'Bienvenue sur le serveur officiel **AltyFlix** — Le streaming cinéma réinventé (+100 000 Films & Séries en 4K UHD gratuits).',
      '',
      'Ce serveur est un **espace 100% dédié aux passionnés de films et de séries**. Pour que l’expérience reste agréable pour tous les spectateurs, merci de respecter ces règles fondamentales.',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n'),
    color: 0xE50914,
    fields: [
      {
        name: '① 🚫 TOLÉRANCE ZÉRO SUR LES SPOILERS',
        value: 'Ne gâchez jamais le plaisir des autres ! Tout élément clé d\'intrigue, mort de personnage ou fin de saison/film **doit obligatoirement être masqué** avec les balises spoilers : `||votre spoiler ici||`.\n*Tout spoiler volontaire sans balise entraîne un bannissement immédiat.*',
        inline: false
      },
      {
        name: '② 🍿 RESPECT & DÉBATS CINÉPHILES',
        value: 'Tous les goûts cinématographiques sont légitimes, du blockbuster hollywoodien à la pépite d\'auteur indépendante. Échangez avec passion, argumentez, mais restez toujours courtois. Insultes, toxicité et jugements rabaissants sont proscrits.',
        inline: false
      },
      {
        name: '③ 💬 LE BON SALON POUR LE BON ÉCHANGE',
        value: [
          '• **#💬・discussions** : Salon central pour débattre cinéma, échanger sur vos séances et théories.',
          '• **#🎭・films** : Vos recommandations, pépites découvertes et critiques ciné.',
          '• **#📺・séries** : Binge-watching, avis sur les nouvelles saisons et sorties.',
          '• **#🎬・nouveautés** : Alertes automatiques 24/7 des dernières sorties 4K.',
          '• **#💡・suggestions** : Proposez des ajouts avec la commande `/suggerer`.',
          '• **#🐛・bug-report** : Signalez tout problème de lecteur ou serveur.',
        ].join('\n'),
        inline: false
      },
      {
        name: '④ 🛡️ ZÉRO PUBLICITÉ & ZÉRO SPAM',
        value: 'Aucune autopromotion, publicité sauvage ou lien externe non sollicité (serveurs Discord, arnaques, ventes). Pas de spam ou flood de messages.',
        inline: false
      },
      {
        name: '⑤ 🎟️ ACCÈS 100% GRATUIT',
        value: 'AltyFlix est et restera 100% gratuit, sans abonnement, sans carte bancaire et sans pub intrusive. Profitez du catalogue en illimité sur [altyflix.netlify.app](https://altyflix.netlify.app) !',
        inline: false
      }
    ],
    footer: {
      text: 'AltyFlix · On regarde, on partage, on respecte le Cinéma 🍿',
      icon_url: 'https://altyflix.netlify.app/brand/altyflix-icon-512.png'
    },
    timestamp: new Date().toISOString()
  };

  const validationEmbed = {
    title: '🎟️ DÉBLOQUER L\'ACCÈS AU SERVEUR',
    description: 'En cliquant sur le bouton vert ci-dessous, tu confirmes avoir lu et accepté la charte du serveur.\nLe rôle **🍿 Spectateur** te sera immédiatement attribué et tous les salons de streaming et de discussion s\'ouvriront à toi !',
    color: 0x57F287,
    footer: { text: 'Attribution automatique instantanée' }
  };

  // Envoi des embeds avec le bouton interactif
  const sent = await api('POST', `/channels/${rulesChannelId}/messages`, {
    embeds: [rulesEmbed, validationEmbed],
    components: [{
      type: 1,
      components: [
        {
          type: 2,
          style: 3, // SUCCESS (Vert)
          custom_id: 'btn_accept_rules',
          label: 'Accepter la charte & Accéder au serveur',
          emoji: { name: '✅' }
        },
        {
          type: 2,
          style: 5, // LINK
          label: 'Ouvrir AltyFlix 🍿',
          url: SITE_URL
        }
      ]
    }]
  });

  if (sent?.id) {
    console.log(`   ✅ Nouveau règlement posté (Message ID: ${sent.id}) !`);
    // Ajouter réaction de secours
    await api('PUT', `/channels/${rulesChannelId}/messages/${sent.id}/reactions/${encodeURIComponent('✅')}/@me`);

    // Mettre à jour bot-config.json
    config.verifMessageId = sent.id;
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log('💾 bot-config.json mis à jour.');
  }

  console.log('\n🎉 RÈGLEMENT 100% CINÉMA RÉNOVÉ & SALONS NETTOYÉS AVEC SUCCÈS !');
}

run().catch(err => {
  console.error('Erreur :', err);
  process.exit(1);
});
