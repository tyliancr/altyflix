import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, 'bot-config.json'), 'utf8'));

const { TOKEN: _legacyToken, guildId, membreRoleId } = config;
const TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_API = 'https://discord.com/api/v10';
const CATEGORY_ID = '1554787549036150867'; // 🎬 ALTYFLIX

async function createChannel() {
  console.log('Création du salon #🤖・commandes...');

  // 1. Create channel
  const body = {
    name: '🤖・commandes',
    type: 0, // Guild Text Channel
    parent_id: CATEGORY_ID,
    topic: 'Salon dédié aux commandes de bots, /bump pour booster le serveur et interactions communautaires 🚀',
    permission_overwrites: [
      {
        id: guildId, // @everyone
        type: 0,
        deny: '1024', // Masqué pour les non-vérifiés
        allow: '0',
      },
      {
        id: membreRoleId, // 🍿 Spectateur
        type: 0,
        allow: '2147863552', // VIEW, SEND, EMBED, ATTACH, USE_APPLICATION_COMMANDS, READ_HISTORY
        deny: '0',
      },
    ],
  };

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erreur création salon (${res.status}): ${err}`);
  }

  const channel = await res.json();
  console.log(`✅ Salon créé avec succès : #${channel.name} (ID: ${channel.id})`);

  // 2. Post official welcome embed in #🤖・commandes
  const welcomePayload = {
    embeds: [
      {
        title: '🤖 Salon Commandes & Bumps — AltyFlix',
        description: [
          'Bienvenue dans le salon dédié à toutes vos interactions avec les bots !',
          'Ce salon permet de centraliser vos commandes sans encombrer les discussions générales.',
          '',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        ].join('\n'),
        color: 0x5865F2, // Discord Blurple
        fields: [
          {
            name: '🚀 Faire un /bump (Référencement)',
            value: [
              '• Utilisez la commande **/bump** pour faire monter le serveur dans le classement.',
              '• Vous pouvez bumper toutes les **2 heures** avec Disboard ou d\'autres bots partenaires !',
              '• Chaque bump aide de nouveaux membres à découvrir AltyFlix ! ⭐',
            ].join('\n'),
            inline: false,
          },
          {
            name: '🍿 Commandes du Bot AltyFlix',
            value: [
              '`/recherche <titre>` ➜ Fiche complète film/série avec lien direct 4K',
              '`/suggerer <titre>` ➜ Proposer un film ou une série à ajouter',
              '`/film-au-hasard` ➜ Tirer au sort un film d\'exception',
              '`/serie-au-hasard` ➜ Tirer au sort une série tendance',
              '`/nouveautes` ➜ Afficher les derniers ajouts 4K',
              '`/stats` ➜ Voir l\'état des serveurs et stats',
              '`/aide` ➜ Ouvrir le menu d\'assistance complet',
            ].join('\n'),
            inline: false,
          },
        ],
        footer: {
          text: 'AltyFlix · Commandes & Bumps 🍿',
          icon_url: 'https://cdn.discordapp.com/avatars/1554110227354230834/9a53ffc9db9769aefb3cfeb32e2f2886.png?size=512',
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(welcomePayload),
  });

  if (msgRes.ok) {
    const msg = await msgRes.json();
    console.log(`✅ Message d'explications posté (ID: ${msg.id})`);
    // Pin message
    await fetch(`${DISCORD_API}/channels/${channel.id}/pins/${msg.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bot ${TOKEN}` },
    });
    console.log('📌 Message épinglé au salon !');
  }

  return channel.id;
}

createChannel().catch(err => {
  console.error('❌ Échec:', err.message);
  process.exit(1);
});
