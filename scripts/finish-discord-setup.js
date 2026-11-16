import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'bot-config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const { TOKEN: _legacyToken, guildId } = config;
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
  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${endpoint} → ${res.status}: ${text}`);
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
  console.log('🚀 Finalisation complète de la configuration Discord AltyFlix...');

  // 1. Récupération des rôles et salons existants
  const roles = await api('GET', `/guilds/${guildId}/roles`);
  const everyoneRole = roles.find(r => r.name === '@everyone');
  const spectateurRole = roles.find(r => r.id === config.membreRoleId || r.name.includes('Spectateur'));
  const staffRole = roles.find(r => r.name.includes('Staff'));
  const realisateurRole = roles.find(r => r.name.includes('Réalisateur'));
  const roleNouveautes = roles.find(r => r.name.includes('Nouveautés'));
  const roleAnnonces = roles.find(r => r.name.includes('Annonces'));
  const roleMaj = roles.find(r => r.name.includes('Mises à jour'));

  console.log('✅ Rôles détectés :');
  console.log(`   - @everyone: ${everyoneRole?.id}`);
  console.log(`   - Spectateur: ${spectateurRole?.id}`);
  console.log(`   - Staff: ${staffRole?.id}`);
  console.log(`   - Nouveautés: ${roleNouveautes?.id}`);
  console.log(`   - Annonces: ${roleAnnonces?.id}`);
  console.log(`   - Mises à jour: ${roleMaj?.id}`);

  let channels = await api('GET', `/guilds/${guildId}/channels`);
  const channelMap = {};
  channels.forEach(c => { channelMap[c.name] = c; });

  const getOrFindCat = async (name) => {
    let cat = channels.find(c => c.type === 4 && c.name.toLowerCase().includes(name.toLowerCase()));
    return cat;
  };

  // Catégories existantes
  const infoCat = await getOrFindCat('INFORMATIONS');
  const altyCat = await getOrFindCat('ALTYFLIX');
  const vocalCat = await getOrFindCat('VOCAL');
  const ticketsCat = await getOrFindCat('TICKETS');
  const staffCat = await getOrFindCat('STAFF');

  // 2. Création de la catégorie COMMUNAUTÉ si absente
  let commuCat = await getOrFindCat('COMMUNAUTÉ');
  if (!commuCat) {
    console.log('📁 Création de la catégorie 👥 COMMUNAUTÉ...');
    commuCat = await api('POST', `/guilds/${guildId}/channels`, {
      name: '👥 COMMUNAUTÉ',
      type: 4,
      permission_overwrites: [
        { id: everyoneRole.id, type: 0, deny: deny(P.VIEW), allow: '0' },
        { id: spectateurRole.id, type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY, P.REACT, P.EMBED, P.ATTACH, P.EXT_EMOJI), deny: deny(P.MENTION_ALL) },
      ]
    });
    console.log(`   ✅ Catégorie créée (${commuCat.id})`);
    await sleep(500);
  }

  // 3. Salons de COMMUNAUTÉ
  const commuChannels = [
    { name: '👋・présentations', topic: 'Présente-toi à la communauté ! Film préféré obligatoire 🍿' },
    { name: '🗣️・général', topic: 'Discussions générales, détente, vie de tous les jours.' },
    { name: '😂・memes', topic: 'Mèmes cinéma, séries et pop-culture.' },
    { name: '🖼️・partages', topic: 'Screenshots, configurations de home cinéma, fan arts.' },
  ];

  for (const ch of commuChannels) {
    let existing = channels.find(c => c.name === ch.name);
    if (!existing) {
      console.log(`   📄 Création de #${ch.name}...`);
      existing = await api('POST', `/guilds/${guildId}/channels`, {
        name: ch.name,
        type: 0,
        parent_id: commuCat.id,
        topic: ch.topic,
        permission_overwrites: [
          { id: everyoneRole.id, type: 0, deny: deny(P.VIEW), allow: '0' },
          { id: spectateurRole.id, type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY, P.REACT, P.EMBED, P.ATTACH, P.EXT_EMOJI), deny: deny(P.MENTION_ALL) },
        ]
      });
      console.log(`      ✅ Créé (${existing.id})`);
      await sleep(400);

      // Embed d'introduction
      let introEmbed = null;
      if (ch.name === '👋・présentations') {
        introEmbed = {
          title: '👋 Bienvenue dans le salon Présentations !',
          description: "Nouveau venu sur **AltyFlix** ? Présente-toi en quelques mots !\n\n**Modèle recommandé :**\n> 🎬 **Ton film / série culte :**\n> 🍿 **Ton genre de prédilection :** (Sci-Fi, Thriller, Comédie...)\n> 🍿 **Ton rituel de visionnage :** (Pop-corn, plaid, nuit blanche ?)",
          color: 0xE50914,
          footer: { text: 'AltyFlix · Faisons connaissance !' }
        };
      } else if (ch.name === '🗣️・général') {
        introEmbed = {
          title: '🗣️ Salon Général',
          description: "Ici on parle de tout et de rien ! Détends-toi, discute avec les membres dans le respect et la bonne humeur.",
          color: 0x5865F2,
          footer: { text: 'AltyFlix · Convivialité avant tout' }
        };
      } else if (ch.name === '😂・memes') {
        introEmbed = {
          title: '😂 Le Temple des Mèmes Ciné & Pop-Culture',
          description: "Partagez vos meilleurs mèmes, TikToks et blagues sur le cinéma et les séries !\n*(Pas de contenu offensant ou déplacé)*",
          color: 0xFEE75C,
          footer: { text: 'AltyFlix · Humour garanti' }
        };
      } else if (ch.name === '🖼️・partages') {
        introEmbed = {
          title: '🖼️ Galerie & Partages',
          description: "Partagez vos affiches de films favorites, vos setups cinéma, vos captures de scènes mémorables !",
          color: 0x57F287,
          footer: { text: 'AltyFlix · Visuels & Passions' }
        };
      }

      if (introEmbed) {
        await api('POST', `/channels/${existing.id}/messages`, { embeds: [introEmbed] });
        await sleep(400);
      }
    }
  }

  // 4. Salon 🎟️・rôles dans 📋 INFORMATIONS
  let rolesCh = channels.find(c => c.name.includes('rôles') || c.name.includes('roles'));
  if (!rolesCh && infoCat) {
    console.log('📄 Création du salon #🎟️・rôles...');
    rolesCh = await api('POST', `/guilds/${guildId}/channels`, {
      name: '🎟️・rôles',
      type: 0,
      parent_id: infoCat.id,
      topic: 'Choisis tes rôles de notification en 1 clic.',
      permission_overwrites: [
        { id: everyoneRole.id, type: 0, deny: deny(P.VIEW), allow: '0' },
        { id: spectateurRole.id, type: 0, allow: allow(P.VIEW, P.HISTORY, P.REACT), deny: deny(P.SEND, P.EMBED, P.ATTACH) },
      ]
    });
    console.log(`   ✅ Salon #🎟️・rôles créé (${rolesCh.id})`);
    await sleep(400);
  }

  // Poster le sélecteur de rôles avec boutons interactifs
  if (rolesCh) {
    // Vérifier si le message de rôles est déjà posté
    const existingMsgs = await api('GET', `/channels/${rolesCh.id}/messages?limit=5`);
    if (!existingMsgs || existingMsgs.length === 0) {
      console.log('📝 Publication du panneau interactif des rôles de notifications...');
      await api('POST', `/channels/${rolesCh.id}/messages`, {
        embeds: [{
          title: '🎟️ Rôles de Notification AltyFlix',
          description: "Personnalise ton expérience sur le serveur ! Clique sur les boutons ci-dessous pour activer ou désactiver les notifications de ton choix.\n\n*Clique une fois pour obtenir le rôle, clique à nouveau pour le retirer.*",
          color: 0xE50914,
          fields: [
            {
              name: '🔔 @🆕 Nouveautés',
              value: 'Sois alerté dès qu\'un nouveau film ou une nouvelle série sort en 4K sur le site.',
              inline: false
            },
            {
              name: '📢 @📢 Annonces',
              value: 'Reçois les informations officielles, événements et annonces importantes d\'AltyFlix.',
              inline: false
            },
            {
              name: '🛠️ @🛠️ Mises à jour',
              value: 'Tiens-toi informé des améliorations techniques, correctifs et ajouts de fonctionnalités.',
              inline: false
            }
          ],
          footer: { text: 'AltyFlix · Gestion automatique des rôles 🍿' }
        }],
        components: [{
          type: 1,
          components: [
            {
              type: 2,
              style: 1, // PRIMARY
              custom_id: 'btn_role_nouveautes',
              label: 'Nouveautés',
              emoji: { name: '🆕' }
            },
            {
              type: 2,
              style: 3, // SUCCESS
              custom_id: 'btn_role_annonces',
              label: 'Annonces',
              emoji: { name: '📢' }
            },
            {
              type: 2,
              style: 2, // SECONDARY
              custom_id: 'btn_role_maj',
              label: 'Mises à jour',
              emoji: { name: '🛠️' }
            }
          ]
        }]
      });
      console.log('   ✅ Panneau de rôles interactif posté !');
      await sleep(500);
    }
  }

  // 5. Salon vocal 🎮 Gaming & Séries si absent
  if (vocalCat) {
    const hasGaming = channels.find(c => c.name.includes('Gaming') || c.name.includes('gaming'));
    if (!hasGaming) {
      console.log('🔊 Création du salon vocal 🎮 Gaming & Séries...');
      await api('POST', `/guilds/${guildId}/channels`, {
        name: '🎮 Gaming & Séries',
        type: 2,
        parent_id: vocalCat.id,
        bitrate: 64000,
        permission_overwrites: [
          { id: everyoneRole.id, type: 0, deny: deny(P.VIEW, P.CONNECT), allow: '0' },
          { id: spectateurRole.id, type: 0, allow: allow(P.VIEW, P.CONNECT, P.SPEAK, P.STREAM, P.USE_VAD), deny: '0' }
        ]
      });
      console.log('   ✅ Salon vocal créé');
      await sleep(400);
    }
  }

  // 6. Mise à jour de #📜・règlement avec le bouton interactif de validation
  const rulesChId = config.rulesChannelId;
  const rulesMsgs = await api('GET', `/channels/${rulesChId}/messages?limit=10`);
  let verifMsg = rulesMsgs.find(m => m.components?.length > 0 && m.components[0].components?.some(b => b.custom_id === 'btn_accept_rules'));

  if (!verifMsg) {
    console.log('📝 Ajout du bouton officiel de validation du règlement...');
    verifMsg = await api('POST', `/channels/${rulesChId}/messages`, {
      embeds: [{
        title: '✅ Validation & Accès au Serveur',
        description: "Pour débloquer l'accès complet à tous les salons AltyFlix (Films, Séries, Nouveautés, Discussions, Support, Vocaux), clique sur le bouton vert ci-dessous pour certifier que tu acceptes le règlement.",
        color: 0x57F287,
        footer: { text: 'Attribution instantanée du rôle 🍿 Spectateur' }
      }],
      components: [{
        type: 1,
        components: [
          {
            type: 2,
            style: 3, // SUCCESS (Vert)
            custom_id: 'btn_accept_rules',
            label: 'Valider le règlement & Accéder au serveur',
            emoji: { name: '✅' }
          },
          {
            type: 2,
            style: 5, // LINK
            label: 'Visiter AltyFlix 🍿',
            url: SITE_URL
          }
        ]
      }]
    });

    // Ajouter aussi la réaction ✅
    try {
      await api('PUT', `/channels/${rulesChId}/messages/${verifMsg.id}/reactions/${encodeURIComponent('✅')}/@me`);
    } catch (e) {
      console.warn('Note réaction :', e.message);
    }

    console.log(`   ✅ Message de vérification créé avec succès (ID: ${verifMsg.id}) !`);
  }

  // 7. Harmonisation des permissions de TOUS les salons pour étanchéité parfaite
  console.log('\n🔒 Sécurisation des permissions des salons...');
  channels = await api('GET', `/guilds/${guildId}/channels`);

  for (const ch of channels) {
    if (ch.type === 4) {
      // Pour les catégories
      if (ch.name.includes('STAFF')) {
        // Staff strict
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, deny: deny(P.VIEW), allow: '0' });
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, { type: 0, deny: deny(P.VIEW), allow: '0' });
      } else {
        // @everyone ne voit pas la catégorie
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, { type: 0, deny: deny(P.VIEW), allow: '0' });
        // Spectateur voit la catégorie
        await api('PUT', `/channels/${ch.id}/permissions/${spectateurRole.id}`, { type: 0, allow: allow(P.VIEW), deny: '0' });
      }
    } else if (ch.type === 0 || ch.type === 2) {
      // Pour les salons
      if (ch.id === rulesChId) {
        // Règlement : @everyone peut voir et réagir mais pas écrire
        await api('PUT', `/channels/${ch.id}/permissions/${everyoneRole.id}`, {
          type: 0,
          allow: allow(P.VIEW, P.HISTORY, P.REACT),
          deny: deny(P.SEND, P.EMBED, P.ATTACH)
        });
      }
    }
  }

  // 8. Mise à jour de bot-config.json
  const updatedConfig = {
    ...config,
    rulesChannelId: rulesChId,
    verifMessageId: verifMsg.id,
    rolesChannelId: rolesCh?.id || config.rolesChannelId || null,
    nouveautesChannelId: channels.find(c => c.name.includes('nouveaut'))?.id,
    discussionsChannelId: channels.find(c => c.name.includes('discussion'))?.id,
    filmsChannelId: channels.find(c => c.name.includes('film') && c.type === 0)?.id,
    seriesChannelId: channels.find(c => c.name.includes('série') && c.type === 0)?.id,
    suggestionsChannelId: channels.find(c => c.name.includes('suggestion'))?.id,
    logsChannelId: channels.find(c => c.name.includes('logs'))?.id,
    roleNouveautesId: roleNouveautes?.id,
    roleAnnoncesId: roleAnnonces?.id,
    roleMajId: roleMaj?.id,
  };

  writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), 'utf8');
  console.log('💾 bot-config.json mis à jour avec tous les identifiants récents.');

  console.log('\n🎉 TOUT LE SERVEUR DISCORD EST MAINTENANT CONFIGURÉ À 100% !');
}

run().catch(err => {
  console.error('❌ Erreur configuration :', err);
  process.exit(1);
});
