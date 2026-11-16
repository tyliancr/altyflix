import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'bot-config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const { TOKEN: _legacyToken, guildId, rulesChannelId, membreRoleId, roleNouveautesId, roleAnnoncesId, roleMajId } = config;
const TOKEN = process.env.DISCORD_TOKEN;
const API = 'https://discord.com/api/v10';
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
    console.warn(`Discord API [${method} ${endpoint}] ${res.status}:`, text);
    return null;
  }
  return res.json();
}

// Permissions bits
const P = {
  VIEW: 1n << 10n,
  SEND: 1n << 11n,
  HISTORY: 1n << 16n,
  EMBED: 1n << 14n,
  ATTACH: 1n << 15n,
  REACT: 1n << 6n,
  EXT_EMOJI: 1n << 18n,
  MENTION_ALL: 1n << 17n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  STREAM: 1n << 9n,
  USE_VAD: 1n << 25n,
};
const allow = (...f) => f.reduce((x, y) => x | y, 0n).toString();
const deny = (...f) => f.reduce((x, y) => x | y, 0n).toString();

async function run() {
  console.log('⚡ Refonte complète des permissions et du système Communauté Onboarding...');

  // 1. Récupération des rôles et salons
  const roles = await api('GET', `/guilds/${guildId}/roles`);
  const everyoneRole = roles.find(r => r.name === '@everyone');
  const spectateurRole = roles.find(r => r.id === membreRoleId || r.name.includes('Spectateur'));
  const staffRole = roles.find(r => r.name.includes('Staff'));
  const realisateurRole = roles.find(r => r.name.includes('Réalisateur'));

  const channels = await api('GET', `/guilds/${guildId}/channels`);

  const rulesCh = channels.find(c => c.id === rulesChannelId);
  const annoncesCh = channels.find(c => c.name.includes('annonces'));
  const siteCh = channels.find(c => c.name.includes('le-site'));
  const rolesCh = channels.find(c => c.name.includes('rôles'));
  const nouveautesCh = channels.find(c => c.name.includes('nouveaut'));
  const discussionsCh = channels.find(c => c.name.includes('discussion'));
  const filmsCh = channels.find(c => c.name.includes('film') && c.type === 0);
  const seriesCh = channels.find(c => c.name.includes('série') && c.type === 0);
  const bugsCh = channels.find(c => c.name.includes('bug'));
  const suggestionsCh = channels.find(c => c.name.includes('suggestion'));
  const ticketsCh = channels.find(c => c.name.includes('ticket') && c.type === 0);

  // 2. Configuration stricte du rôle @everyone global
  console.log('🔒 Verrouillage global de @everyone...');
  await api('PATCH', `/guilds/${guildId}/roles/${everyoneRole.id}`, {
    permissions: '0' // Aucune permission par défaut sans acceptation des règles
  });

  // 3. Mise en place des permissions hermétiques par salon
  console.log('🔒 Application des permissions strictes par salon...');

  for (const ch of channels) {
    if (ch.type === 4) {
      // ── Catégories ──
      if (ch.name.includes('STAFF')) {
        // Staff uniquement
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, deny: deny(P.VIEW), allow: '0' });
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, { type: 0, deny: deny(P.VIEW), allow: '0' });
        if (staffRole) await api('PUT', `/channels/${ch.id}/permissions/${staffRole.id}`, { type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY), deny: '0' });
      } else if (ch.name.includes('INFORMATIONS')) {
        // Tout le monde peut voir la catégorie d'information
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, allow: allow(P.VIEW), deny: deny(P.SEND) });
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, { type: 0, allow: allow(P.VIEW), deny: deny(P.SEND) });
      } else {
        // Catégories ALTYFLIX, VOCAL, TICKETS : strictement MASQUÉES à @everyone
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, deny: deny(P.VIEW), allow: '0' });
        // Visible uniquement pour ceux qui ont validé le règlement (Spectateur)
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, { type: 0, allow: allow(P.VIEW), deny: '0' });
      }
    } else if (ch.type === 0 || ch.type === 2) {
      // ── Salons textuels & vocaux ──

      if (ch.id === rulesChannelId) {
        // #📜・règlement : Seul salon visible par @everyone, mais écriture interdite
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
          type: 0,
          allow: allow(P.VIEW, P.HISTORY, P.REACT),
          deny: deny(P.SEND, P.EMBED, P.ATTACH, P.MENTION_ALL)
        });
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
          type: 0,
          allow: allow(P.VIEW, P.HISTORY, P.REACT),
          deny: deny(P.SEND, P.EMBED, P.ATTACH, P.MENTION_ALL)
        });
      } else if (ch.id === annoncesCh?.id || ch.id === siteCh?.id || ch.id === rolesCh?.id || ch.id === nouveautesCh?.id || ch.id === ticketsCh?.id) {
        // Salons d'annonces / lecture seule
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, deny: deny(P.VIEW), allow: '0' });
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
          type: 0,
          allow: allow(P.VIEW, P.HISTORY, P.REACT),
          deny: deny(P.SEND, P.EMBED, P.ATTACH, P.MENTION_ALL)
        });
      } else if (ch.type === 2) {
        // Salons vocaux
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, deny: deny(P.VIEW, P.CONNECT), allow: '0' });
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
          type: 0,
          allow: allow(P.VIEW, P.CONNECT, P.SPEAK, P.STREAM, P.USE_VAD),
          deny: '0'
        });
      } else {
        // Salons de discussion active (#💬・discussions, #🎭・films, #📺・séries, #🐛・bug-report, #💡・suggestions)
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, deny: deny(P.VIEW), allow: '0' });
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
          type: 0,
          allow: allow(P.VIEW, P.SEND, P.HISTORY, P.REACT, P.EMBED, P.ATTACH, P.EXT_EMOJI),
          deny: deny(P.MENTION_ALL)
        });
      }
    }
  }

  // 4. Système de Communauté Discord : Questions d'Onboarding
  console.log('📋 Configuration du Système Communauté Onboarding avec questions...');

  const onboardingBody = {
    prompts: [
      {
        title: '🎬 Quel est ton format préféré sur AltyFlix ?',
        options: [
          {
            title: 'Films uniquement',
            description: 'Coups de cœur, blockbusters et classiques',
            emoji: { name: '🎥' },
            role_ids: [],
            channel_ids: filmsCh ? [filmsCh.id] : []
          },
          {
            title: 'Séries en continu',
            description: 'Binge-watching et saisons complètes',
            emoji: { name: '📺' },
            role_ids: [],
            channel_ids: seriesCh ? [seriesCh.id] : []
          },
          {
            title: 'Films & Séries (Les deux !)',
            description: 'Accès illimité à tout le catalogue',
            emoji: { name: '🍿' },
            role_ids: [spectateurRole.id],
            channel_ids: [discussionsCh?.id, filmsCh?.id, seriesCh?.id].filter(Boolean)
          }
        ],
        single_select: true,
        required: true,
        in_onboarding: true,
        type: 0
      },
      {
        title: '🔔 Quelles notifications souhaites-tu recevoir ?',
        options: [
          {
            title: 'Nouveautés 4K',
            description: 'Alerté dès qu\'un film ou une série sort en 4K',
            emoji: { name: '🆕' },
            role_ids: roleNouveautesId ? [roleNouveautesId] : [],
            channel_ids: nouveautesCh ? [nouveautesCh.id] : []
          },
          {
            title: 'Annonces officielles',
            description: 'Actualités majeures et événements',
            emoji: { name: '📢' },
            role_ids: roleAnnoncesId ? [roleAnnoncesId] : [],
            channel_ids: annoncesCh ? [annoncesCh.id] : []
          },
          {
            title: 'Mises à jour du site',
            description: 'Améliorations techniques et nouveaux serveurs',
            emoji: { name: '🛠️' },
            role_ids: roleMajId ? [roleMajId] : [],
            channel_ids: annoncesCh ? [annoncesCh.id] : []
          }
        ],
        single_select: false,
        required: false,
        in_onboarding: true,
        type: 0
      }
    ],
    default_channel_ids: [
      rulesCh?.id,
      annoncesCh?.id,
      siteCh?.id,
      rolesCh?.id,
      discussionsCh?.id
    ].filter(Boolean),
    enabled: true,
    mode: 0
  };

  const obRes = await api('PUT', `/guilds/${guildId}/onboarding`, onboardingBody);
  if (obRes) {
    console.log('   ✅ Onboarding Communauté configuré avec succès avec les questions !');
  } else {
    console.log('   ℹ️ Note onboarding API, configuration maintenue.');
  }

  console.log('\n🎉 TOUT LE SERVEUR EST ENTIÈREMENT CONFIGURÉ ET VERROUILLÉ !');
  console.log('   - @everyone : Bloqué à 100% sur le règlement.');
  console.log('   - Validation obligatoire : Clic sur le bouton vert ou confirmation du règlement pour débloquer les salons.');
  console.log('   - Questions d\'accueil : Actives pour orienter chaque membre vers ses contenus préférés.');
}

run().catch(err => {
  console.error('Erreur :', err);
  process.exit(1);
});
