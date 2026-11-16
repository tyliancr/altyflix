/**
 * configure-permissions.js
 * Configure et verrouille hermétiquement les permissions de tous les salons du serveur AltyFlix.
 * - @everyone :
 *    • Bloqué en écriture dans TOUT le serveur.
 *    • Ne peut voir que #règlement, #annonces, #le-site (et #discussions en lecture seule).
 * - Spectateurs :
 *    • Strictement INTERDIT d'écrire dans #règlement, #annonces, #le-site, #rôles, #nouveautés, #ouvrir-un-ticket.
 *    • Strictement INTERDIT de voir ou d'écrire dans les salons STAFF (#bot-config, #logs, #staff-général).
 *    • Autorisé à écrire et participer UNIQUEMENT dans : #discussions, #films, #séries, #bug-report, #suggestions, #commandes.
 * - Bots (carl-bot, Disboard, Top.gg) :
 *    • Strictement INTERDIT d'écrire dans #règlement, #annonces, #le-site, #rôles, #nouveautés, #ouvrir-un-ticket (stoppe le ghost-ping des arrivées).
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, 'bot-config.json'), 'utf8'));

const { TOKEN: _legacyToken, guildId, membreRoleId, rulesChannelId } = config;
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
    console.log(`   ⏳ Rate limit atteint, attente de ${wait}ms...`);
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

// Masques de permissions Discord BigInt
const P = {
  CREATE_INVITE: 1n << 0n,
  ADD_REACTIONS: 1n << 6n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  USE_EXTERNAL_EMOJIS: 1n << 18n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  USE_VAD: 1n << 25n,
  USE_APPLICATION_COMMANDS: 1n << 31n,
  CREATE_PUBLIC_THREADS: 1n << 35n,
  CREATE_PRIVATE_THREADS: 1n << 36n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
};

const mask = (...perms) => perms.reduce((acc, curr) => acc | curr, 0n).toString();

// Masque universel d'interdiction d'écriture (messages + fils de discussion)
const NO_WRITE_MASK = mask(
  P.SEND_MESSAGES,
  P.CREATE_PUBLIC_THREADS,
  P.CREATE_PRIVATE_THREADS,
  P.SEND_MESSAGES_IN_THREADS,
  P.MENTION_EVERYONE
);

async function run() {
  console.log('⚡ Démarrage de la configuration complète et hermétique des permissions Discord...');

  const [roles, channels] = await Promise.all([
    api('GET', `/guilds/${guildId}/roles`),
    api('GET', `/guilds/${guildId}/channels`)
  ]);

  const everyoneRole = roles.find(r => r.id === guildId || r.name === '@everyone');
  const spectateurRole = roles.find(r => r.id === membreRoleId || r.name.includes('Spectateur'));
  const staffRole = roles.find(r => r.name.includes('Staff'));
  const botsRole = roles.find(r => r.name.includes('Bots'));
  const carlBotRole = roles.find(r => r.name.includes('carl-bot'));
  const disboardRole = roles.find(r => r.name.includes('DISBOARD'));
  const topggRole = roles.find(r => r.name.includes('Top.gg'));

  console.log(`📋 Rôle @everyone : ${everyoneRole?.id}`);
  console.log(`🍿 Rôle Spectateur : ${spectateurRole?.id}`);
  console.log(`🎥 Rôle Staff : ${staffRole?.id}`);

  // 1. Assurer que le rôle @everyone de base du serveur a 0 permission globale
  console.log('\n🔒 1. Sécurisation du rôle global @everyone (permissions = 0)...');
  await api('PATCH', `/guilds/${guildId}/roles/${everyoneRole.id}`, {
    permissions: '0'
  });
  console.log('   ✅ Rôle @everyone verrouillé à 0.');

  // 2. Traitement de chaque catégorie
  console.log('\n📁 2. Configuration stricte des catégories...');
  for (const ch of channels.filter(c => c.type === 4)) {
    const name = ch.name.toUpperCase();
    console.log(`\n  👉 Catégorie [${ch.name}] (${ch.id})`);

    if (name.includes('INFORMATIONS')) {
      await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY),
        deny: NO_WRITE_MASK
      });
      await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY),
        deny: NO_WRITE_MASK
      });
      console.log('     ✅ Catégorie INFORMATIONS : lecture seule pour @everyone et Spectateurs.');
    } else if (name.includes('STAFF')) {
      await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
        type: 0,
        allow: '0',
        deny: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES)
      });
      await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
        type: 0,
        allow: '0',
        deny: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES)
      });
      if (staffRole) {
        await api('PUT', `/channels/${ch.id}/permissions/${staffRole.id}`, {
          type: 0,
          allow: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES, P.READ_MESSAGE_HISTORY, P.EMBED_LINKS, P.ATTACH_FILES, P.MANAGE_MESSAGES),
          deny: '0'
        });
      }
      console.log('     ✅ Catégorie STAFF : hermétiquement fermée (Staff uniquement).');
    } else if (name.includes('TICKETS')) {
      await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
        type: 0,
        allow: '0',
        deny: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES)
      });
      await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
        type: 0,
        allow: '0',
        deny: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES)
      });
      if (staffRole) {
        await api('PUT', `/channels/${ch.id}/permissions/${staffRole.id}`, {
          type: 0,
          allow: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES, P.READ_MESSAGE_HISTORY),
          deny: '0'
        });
      }
      console.log('     ✅ Catégorie TICKETS : fermée par défaut (sécurité tickets individuels garantie).');
    } else {
      await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
        type: 0,
        allow: '0',
        deny: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES, P.CONNECT)
      });
      await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.CONNECT),
        deny: '0'
      });
      console.log(`     ✅ Catégorie ${ch.name} : masquée à @everyone, ouverte aux Spectateurs.`);
    }
    await sleep(200);
  }

  // 3. Traitement de chaque salon textuel & vocal individuel
  console.log('\n💬 3. Configuration explicite des permissions pour CHAQUE salon...');

  for (const ch of channels.filter(c => c.type === 0 || c.type === 2)) {
    console.log(`\n  👉 Salon #${ch.name} (${ch.id}, type ${ch.type})`);

    // A. Salon #📜・règlement (AUCUNE écriture, pas de bot-ping, réactions seules)
    if (ch.id === rulesChannelId || ch.name.includes('règlement')) {
      // @everyone
      await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY, P.ADD_REACTIONS),
        deny: mask(P.SEND_MESSAGES, P.CREATE_PUBLIC_THREADS, P.CREATE_PRIVATE_THREADS, P.SEND_MESSAGES_IN_THREADS, P.EMBED_LINKS, P.ATTACH_FILES, P.MENTION_EVERYONE)
      });
      // Spectateurs
      await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY, P.ADD_REACTIONS),
        deny: NO_WRITE_MASK
      });
      // Blocage absolu des bots (carl-bot, bots tiers) pour stopper tout ping/ghost-ping à l'arrivée
      const botsToBlock = [carlBotRole, botsRole, disboardRole, topggRole].filter(Boolean);
      for (const b of botsToBlock) {
        await api('PUT', `/channels/${ch.id}/permissions/${b.id}`, {
          type: 0,
          allow: '0',
          deny: mask(P.SEND_MESSAGES, P.MENTION_EVERYONE)
        });
      }
      console.log('     ✅ #règlement : écriture INTERDITE pour @everyone, Spectateurs et Bots.');
    }
    // B. Salons #📢・annonces et #🌐・le-site (Lecture seule stricte)
    else if (ch.name.includes('annonces') || ch.name.includes('le-site')) {
      await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY, P.ADD_REACTIONS),
        deny: NO_WRITE_MASK
      });
      await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY, P.ADD_REACTIONS),
        deny: NO_WRITE_MASK
      });
      if (carlBotRole) {
        await api('PUT', `/channels/${ch.id}/permissions/${carlBotRole.id}`, {
          type: 0,
          allow: '0',
          deny: mask(P.SEND_MESSAGES)
        });
      }
      console.log(`     ✅ #${ch.name} : écriture INTERDITE pour @everyone et Spectateurs.`);
    }
    // C. Salon #🎟️・rôles (Masqué à everyone, Spectateurs peuvent voir/cliquer mais PAS écrire)
    else if (ch.name.includes('rôles')) {
      await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
        type: 0,
        allow: '0',
        deny: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES)
      });
      await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY, P.ADD_REACTIONS, P.USE_APPLICATION_COMMANDS),
        deny: NO_WRITE_MASK
      });
      console.log('     ✅ #rôles : masqué à @everyone, boutons interactifs pour Spectateurs, écriture INTERDITE.');
    }
    // D. Salon #🎬・nouveautés (Masqué à everyone, Spectateurs peuvent voir/réagir mais PAS écrire)
    else if (ch.name.includes('nouveaut')) {
      await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
        type: 0,
        allow: '0',
        deny: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES)
      });
      await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY, P.ADD_REACTIONS),
        deny: NO_WRITE_MASK
      });
      console.log('     ✅ #nouveautés : réservé aux annonces du bot, écriture INTERDITE pour Spectateurs.');
    }
    // E. Salon #📩・ouvrir-un-ticket (Panneau interactif, écriture interdite)
    else if (ch.name.includes('ticket')) {
      await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
        type: 0,
        allow: '0',
        deny: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES)
      });
      await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY, P.ADD_REACTIONS, P.USE_APPLICATION_COMMANDS),
        deny: NO_WRITE_MASK
      });
      if (staffRole) {
        await api('PUT', `/channels/${ch.id}/permissions/${staffRole.id}`, {
          type: 0,
          allow: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES, P.READ_MESSAGE_HISTORY),
          deny: '0'
        });
      }
      console.log(`     ✅ #${ch.name} : bouton accessible aux Spectateurs, écriture INTERDITE.`);
    }
    // F. Salons du STAFF (Interdiction absolue de voir et d'écrire pour everyone et Spectateurs)
    else if (ch.name.includes('staff') || ch.name.includes('bot-config') || ch.name.includes('logs')) {
      await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
        type: 0,
        allow: '0',
        deny: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES)
      });
      await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
        type: 0,
        allow: '0',
        deny: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES)
      });
      if (staffRole) {
        await api('PUT', `/channels/${ch.id}/permissions/${staffRole.id}`, {
          type: 0,
          allow: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES, P.READ_MESSAGE_HISTORY, P.EMBED_LINKS, P.ATTACH_FILES, P.MANAGE_MESSAGES, P.ADD_REACTIONS),
          deny: '0'
        });
      }
      console.log(`     🔒 #${ch.name} : STAFF UNIQUEMENT. Spectateurs et @everyone strictement bannis.`);
    }
    // G. Salon vocal
    else if (ch.type === 2) {
      await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
        type: 0,
        allow: '0',
        deny: mask(P.VIEW_CHANNEL, P.CONNECT, P.SPEAK)
      });
      await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.CONNECT, P.SPEAK, P.STREAM, P.USE_VAD),
        deny: '0'
      });
      console.log(`     🔊 Vocal #${ch.name} : masqué à @everyone, ouvert aux Spectateurs.`);
    }
    // H. Salon #💬・discussions (Relié à l'Accueil Discord, lecture seule pour everyone, écriture libre pour Spectateurs)
    else if (ch.name.includes('discussion')) {
      await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY),
        deny: NO_WRITE_MASK
      });
      await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES, P.READ_MESSAGE_HISTORY, P.EMBED_LINKS, P.ATTACH_FILES, P.ADD_REACTIONS, P.USE_EXTERNAL_EMOJIS, P.USE_APPLICATION_COMMANDS),
        deny: mask(P.MENTION_EVERYONE)
      });
      console.log(`     💬 #${ch.name} : @everyone en lecture seule, Spectateurs autorisés à écrire.`);
    }
    // I. Autres salons communautaires (#films, #séries, #bug-report, #suggestions, #commandes)
    else {
      await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
        type: 0,
        allow: '0',
        deny: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES)
      });
      await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, {
        type: 0,
        allow: mask(P.VIEW_CHANNEL, P.SEND_MESSAGES, P.READ_MESSAGE_HISTORY, P.EMBED_LINKS, P.ATTACH_FILES, P.ADD_REACTIONS, P.USE_EXTERNAL_EMOJIS, P.USE_APPLICATION_COMMANDS),
        deny: mask(P.MENTION_EVERYONE)
      });
      console.log(`     💬 #${ch.name} : masqué à @everyone, Spectateurs autorisés à écrire.`);
    }

    await sleep(200);
  }

  console.log('\n🎉 PERMISSIONS MISES À JOUR AVEC SUCCÈS SUR TOUT LE SERVEUR !');
}

run().catch(err => {
  console.error('❌ Erreur lors de l\'exécution :', err);
});
