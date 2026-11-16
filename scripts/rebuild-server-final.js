import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'bot-config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const { TOKEN: _legacyToken, guildId, rulesChannelId, membreRoleId, roleNouveautesId, roleAnnoncesId, roleMajId } = config;
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
    console.warn(`Discord API [${method} ${endpoint}] ${res.status}:`, text);
    return null;
  }
  return res.json();
}

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
  console.log('🚀 Finalisation absolue du serveur AltyFlix : Permissions + Rôles Cinéma + Questionnaire...');

  // 1. Rôles
  let roles = await api('GET', `/guilds/${guildId}/roles`);
  const everyoneRole = roles.find(r => r.name === '@everyone');
  const spectateurRole = roles.find(r => r.id === membreRoleId || r.name.includes('Spectateur'));
  const staffRole = roles.find(r => r.name.includes('Staff'));
  const realisateurRole = roles.find(r => r.name.includes('Réalisateur'));

  // Création des rôles de préférences cinéma s'ils n'existent pas
  let roleFilms = roles.find(r => r.name.includes('Cinéphile'));
  let roleSeries = roles.find(r => r.name.includes('Sérivore'));
  let roleVostfr = roles.find(r => r.name.includes('VOSTFR'));
  let roleVf = roles.find(r => r.name.includes('Adepte VF'));

  if (!roleFilms) {
    roleFilms = await api('POST', `/guilds/${guildId}/roles`, { name: '🎥 Cinéphile', color: 0xE50914, mentionable: true });
    await sleep(400);
  }
  if (!roleSeries) {
    roleSeries = await api('POST', `/guilds/${guildId}/roles`, { name: '📺 Sérivore', color: 0x5865F2, mentionable: true });
    await sleep(400);
  }
  if (!roleVostfr) {
    roleVostfr = await api('POST', `/guilds/${guildId}/roles`, { name: '🎧 VOSTFR', color: 0xFEE75C, mentionable: true });
    await sleep(400);
  }
  if (!roleVf) {
    roleVf = await api('POST', `/guilds/${guildId}/roles`, { name: '🇫🇷 VF', color: 0x57F287, mentionable: true });
    await sleep(400);
  }

  console.log('✅ Rôles de préférences cinéma configurés :');
  console.log(`   - 🎥 Cinéphile: ${roleFilms?.id}`);
  console.log(`   - 📺 Sérivore: ${roleSeries?.id}`);
  console.log(`   - 🎧 VOSTFR: ${roleVostfr?.id}`);
  console.log(`   - 🇫🇷 VF: ${roleVf?.id}`);

  // 2. Mise à jour des permissions strictes sur les catégories et salons
  const channels = await api('GET', `/guilds/${guildId}/channels`);

  // Activer le screening natif de règlement
  await api('PATCH', `/guilds/${guildId}/member-verification`, {
    enabled: true,
    form_fields: [
      {
        field_type: 'TERMS',
        label: 'Charte Cinéma Officielle AltyFlix',
        required: true,
        values: [
          'Zéro spoiler sans balise ||spoiler||',
          'Respect et courtoisie dans les débats cinématographiques',
          'Interdiction absolue de spam ou de pub sauvage',
          'AltyFlix est et restera 100% gratuit et sans abonnement'
        ]
      }
    ],
    description: 'Merci d\'accepter la charte officielle pour débloquer l\'accès aux salons de discussion et de streaming AltyFlix !'
  });
  console.log('✅ Règlement natif obligatoire (Member Verification) activé');

  // Application des permissions
  for (const ch of channels) {
    if (ch.type === 4) {
      // Catégories
      if (ch.name.includes('STAFF')) {
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, deny: deny(P.VIEW), allow: '0' });
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, { type: 0, deny: deny(P.VIEW), allow: '0' });
      } else if (ch.name.includes('INFORMATIONS')) {
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, allow: allow(P.VIEW), deny: deny(P.SEND) });
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, { type: 0, allow: allow(P.VIEW), deny: deny(P.SEND) });
      } else {
        // ALTYFLIX, VOCAL, TICKETS sont fermés pour @everyone
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, deny: deny(P.VIEW), allow: '0' });
        // Ouverts uniquement pour ceux qui ont le rôle Spectateur
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, { type: 0, allow: allow(P.VIEW), deny: '0' });
      }
    } else if (ch.type === 0 || ch.type === 2) {
      // Salons
      if (ch.id === rulesChannelId) {
        // Règlement : @everyone voit mais ne parle pas
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
      } else if (ch.name.includes('annonces') || ch.name.includes('le-site') || ch.name.includes('rôles') || ch.name.includes('nouveaut') || ch.name.includes('ticket')) {
        // Salons d'annonces et lecture seule
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, deny: deny(P.VIEW), allow: '0' });
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
          type: 0,
          allow: allow(P.VIEW, P.HISTORY, P.REACT),
          deny: deny(P.SEND, P.EMBED, P.ATTACH, P.MENTION_ALL)
        });
      } else if (ch.type === 2) {
        // Vocal
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, deny: deny(P.VIEW, P.CONNECT), allow: '0' });
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
          type: 0,
          allow: allow(P.VIEW, P.CONNECT, P.SPEAK, P.STREAM, P.USE_VAD),
          deny: '0'
        });
      } else {
        // Salons de discussion active (#discussions, #films, #series, #bug-report, #suggestions)
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, deny: deny(P.VIEW), allow: '0' });
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
          type: 0,
          allow: allow(P.VIEW, P.SEND, P.HISTORY, P.REACT, P.EMBED, P.ATTACH, P.EXT_EMOJI),
          deny: deny(P.MENTION_ALL)
        });
      }
    }
    await sleep(250);
  }
  console.log('✅ Permissions hermétiques appliquées sur tous les salons');

  // 3. Mise à jour du salon #🎟️・rôles avec le grand Questionnaire Communauté Cinéma
  const rolesCh = channels.find(c => c.name.includes('rôles'));
  if (rolesCh) {
    // Vider les anciens messages
    const msgs = await api('GET', `/channels/${rolesCh.id}/messages?limit=10`);
    if (Array.isArray(msgs)) {
      for (const m of msgs) {
        await api('DELETE', `/channels/${rolesCh.id}/messages/${m.id}`);
        await sleep(350);
      }
    }

    // Message 1 : Questionnaire Préférences Cinéma & Séries
    await api('POST', `/channels/${rolesCh.id}/messages`, {
      embeds: [{
        title: '🎬 QUESTIONNAIRE COMMUNAUTÉ — VOS PRÉFÉRENCES CINÉMA',
        description: 'Personnalise ton profil sur AltyFlix ! Clique sur les boutons ci-dessous pour indiquer tes préférences de streaming aux autres spectateurs.\n\n*Clique une fois pour obtenir le rôle, clique à nouveau pour le retirer.*',
        color: 0xE50914,
        fields: [
          { name: '🎥 Format préféré', value: '• `🎥 Cinéphile` : Spécialiste des films et blockbusters\n• `📺 Sérivore` : Passionné de séries TV et binge-watching', inline: true },
          { name: '🎧 Version audio', value: '• `🎧 VOSTFR` : Voix originales sous-titrées\n• `🇫🇷 VF` : Doublage français intégral', inline: true }
        ],
        footer: { text: 'AltyFlix · Profils Cinéphiles 🍿' }
      }],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 1, custom_id: 'btn_role_films', label: 'Cinéphile', emoji: { name: '🎥' } },
            { type: 2, style: 1, custom_id: 'btn_role_series', label: 'Sérivore', emoji: { name: '📺' } },
            { type: 2, style: 2, custom_id: 'btn_role_vostfr', label: 'VOSTFR', emoji: { name: '🎧' } },
            { type: 2, style: 2, custom_id: 'btn_role_vf', label: 'VF', emoji: { name: '🇫🇷' } },
          ]
        }
      ]
    });
    await sleep(600);

    // Message 2 : Questionnaire Notifications & Alertes
    await api('POST', `/channels/${rolesCh.id}/messages`, {
      embeds: [{
        title: '🔔 VOS ALERTES & NOTIFICATIONS ALTYFLIX',
        description: 'Choisis les notifications que tu souhaites recevoir directement sur Discord.',
        color: 0x5865F2,
        fields: [
          { name: '🆕 @🆕 Nouveautés', value: 'Sois alerté dès qu\'un nouveau film ou une série sort en 4K sur le site.' },
          { name: '📢 @📢 Annonces', value: 'Reçois les annonces officielles d\'AltyFlix.' },
          { name: '🛠️ @🛠️ Mises à jour', value: 'Informations techniques et ajouts de fonctionnalités.' },
        ],
        footer: { text: 'AltyFlix · Gestion des alertes' }
      }],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 3, custom_id: 'btn_role_nouveautes', label: 'Nouveautés 4K', emoji: { name: '🆕' } },
            { type: 2, style: 1, custom_id: 'btn_role_annonces', label: 'Annonces', emoji: { name: '📢' } },
            { type: 2, style: 2, custom_id: 'btn_role_maj', label: 'Mises à jour', emoji: { name: '🛠️' } },
          ]
        }
      ]
    });
    console.log('✅ Salon #🎟️・rôles enrichi avec le double questionnaire');
  }

  // 4. Sauvegarde de bot-config.json
  const updatedConfig = {
    ...config,
    roleFilmsId: roleFilms.id,
    roleSeriesId: roleSeries.id,
    roleVostfrId: roleVostfr.id,
    roleVfId: roleVf.id
  };
  writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), 'utf8');

  console.log('\n🎉 TOUT LE SERVEUR EST ENTIÈREMENT FINALISÉ !');
  console.log('   - Règlement obligatoire par Discord & par le bouton vert.');
  console.log('   - @everyone : Bloqué à 100%, aucun accès aux salons de discussion sans validation.');
  console.log('   - Questionnaire communauté actif avec rôles films, séries, VOSTFR, VF et alertes.');
}

run().catch(e => console.error(e));
