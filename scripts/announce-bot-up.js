import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, 'bot-config.json'), 'utf8'));

const { TOKEN: _legacyToken, guildId, roleAnnoncesId } = config;
const TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_API = 'https://discord.com/api/v10';
const CHANNEL_ID = '1554787539800293459'; // #📢・annonces
const SITE_URL = 'https://altyflix.netlify.app';

const COLOR_GREEN = 0x57F287; // Discord Success Green

const payload = {
  content: roleAnnoncesId ? `<@&${roleAnnoncesId}>` : '@here',
  embeds: [
    {
      title: '🟢 Le Bot AltyFlix 24/7 est de retour en ligne !',
      description: [
        '> **Bonne nouvelle pour toute la communauté !**',
        'Notre bot officiel est de nouveau **100% opérationnel** et hébergé sur une nouvelle infrastructure haute performance disponible **24h/24 et 7j/7**.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      ].join('\n'),
      color: COLOR_GREEN,
      fields: [
        {
          name: '🚀 Nouvelles Performances & Stabilité',
          value: [
            '• **Uptime 24/7 permanent** sans interruption.',
            '• Temps de réponse ultra-rapide sur toutes les interactions.',
            '• Reconnexion automatique instantanée.',
          ].join('\n'),
          inline: false,
        },
        {
          name: '🎬 Auto-Poster & Alertes Réactivés',
          value: [
            '• **Veille 4K TMDB** : Publication automatique des dernières sorties dans <#1554787552056320083>.',
            '• **Film & Série du Jour** : Recommandations quotidiennes dans <#1554787558167289859>.',
            '• **Débats & Animations** dans <#1554787554987999266>.',
          ].join('\n'),
          inline: false,
        },
        {
          name: '🛠️ Vos Outils Disponibles',
          value: [
            '• **Commandes Slash** : `/recherche`, `/suggerer`, `/film-au-hasard`, `/aide`...',
            '• **Tickets & Support** : Accessible 24/7 dans <#1559262555921457202>.',
            '• **Rôles & Alertes** : Personnalisez vos alertes dans <#1560317140769312898>.',
          ].join('\n'),
          inline: false,
        },
        {
          name: '🌐 Accès Streaming 4K',
          value: `**➜ [Accéder à AltyFlix](${SITE_URL})**`,
          inline: true,
        },
        {
          name: '💡 Une suggestion ?',
          value: 'Utilisez la commande **/suggerer**',
          inline: true,
        },
      ],
      footer: {
        text: 'AltyFlix 24/7 · Bon streaming à tous ! 🍿',
        icon_url: 'https://altyflix.netlify.app/brand/altyflix-icon-512.png',
      },
      timestamp: new Date().toISOString(),
    },
  ],
  allowed_mentions: roleAnnoncesId ? { roles: [roleAnnoncesId] } : { parse: [] },
};

async function send() {
  const res = await fetch(`${DISCORD_API}/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erreur envoi (${res.status}): ${text}`);
  }

  const data = await res.json();
  console.log('✅ Annonce publiée avec succès ! ID du message:', data.id);
}

send().catch(err => {
  console.error('❌ Échec:', err.message);
  process.exit(1);
});
