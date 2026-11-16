/**
 * configure-discord-server.js
 * Système de vérification :
 *  - @everyone ne voit QUE #règlement
 *  - Après réaction ✅ dans #règlement → rôle "🎬 Membre" attribué
 *  - "🎬 Membre" a accès à tout le reste
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');

const TOKEN    = process.env.DISCORD_TOKEN;
const API      = 'https://discord.com/api/v10';
const SITE_URL = 'https://altyflix.netlify.app';

// ─── API ──────────────────────────────────────────────────────────────────────
async function api(method, endpoint, body = null, isFormData = false) {
    const opts = { method, headers: { Authorization: `Bot ${TOKEN}` } };
    if (body && !isFormData) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    } else if (isFormData) {
        opts.body = body;
    }
    const res = await fetch(`${API}${endpoint}`, opts);
    if (res.status === 429) {
        const d = await res.json();
        const wait = Math.ceil((d.retry_after || 1) * 1000) + 300;
        console.log(`   ⏳ Rate limit ${wait}ms`);
        await sleep(wait);
        return api(method, endpoint, body, isFormData);
    }
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`${method} ${endpoint} → ${res.status}: ${await res.text()}`);
    return res.json();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const get   = ep      => api('GET',   ep);
const post  = (ep, b) => api('POST',  ep, b);
const patch = (ep, b) => api('PATCH', ep, b);
const del   = ep      => api('DELETE', ep);
const put   = (ep, b) => api('PUT',   ep, b);

async function postWithFiles(channelId, payload, files) {
    const form = new FormData();
    form.append('payload_json', JSON.stringify(payload));
    files.forEach(({ name, buffer, type }, i) => {
        form.append(`files[${i}]`, new Blob([buffer], { type }), name);
    });
    return api('POST', `/channels/${channelId}/messages`, form, true);
}

// ─── Permissions ──────────────────────────────────────────────────────────────
const P = {
    VIEW: 1n<<10n, SEND: 1n<<11n, HISTORY: 1n<<16n,
    EMBED: 1n<<14n, ATTACH: 1n<<15n, REACT: 1n<<6n,
    EXT_EMOJI: 1n<<18n, MENTION_ALL: 1n<<17n,
    MANAGE_MSG: 1n<<13n, CONNECT: 1n<<20n, SPEAK: 1n<<21n,
    STREAM: 1n<<9n, USE_VAD: 1n<<25n, MANAGE_ROLES: 1n<<28n,
};
const allow = (...f) => f.reduce((x,y)=>x|y,0n).toString();
const deny  = (...f) => f.reduce((x,y)=>x|y,0n).toString();

// ─── Structure serveur ────────────────────────────────────────────────────────
const STRUCTURE = [
    {
        category: '📋 INFORMATIONS',
        channels: [
            { name: '📜・règlement', type: 0, topic: 'Accepte le règlement pour accéder au serveur.', rulesChannel: true },
            { name: '📢・annonces',  type: 0, topic: 'Annonces officielles AltyFlix.', readonly: true },
            { name: '🌐・le-site',  type: 0, topic: `Tout savoir sur AltyFlix — ${SITE_URL}`, readonly: true },
            { name: '🎟️・rôles',    type: 0, topic: 'Choisis tes rôles ici.', readonly: true },
        ],
    },
    {
        category: '🎬 ALTYFLIX',
        channels: [
            { name: '🎬・nouveautés',   type: 0, topic: `Nouveaux films & séries sur ${SITE_URL}`, readonly: true },
            { name: '💬・discussions',  type: 0, topic: 'Parle de ce que tu regardes.' },
            { name: '🎭・films',        type: 0, topic: 'Recommandations, coups de cœur, débats.' },
            { name: '📺・séries',       type: 0, topic: 'La série que tout le monde doit regarder selon toi.' },
            { name: '🐛・bug-report',   type: 0, topic: 'Décris le bug, la page concernée, et ton navigateur.' },
            { name: '💡・suggestions',  type: 0, topic: 'Une idée brillante ? Poste-la ici !' },
        ],
    },
    {
        category: '👥 COMMUNAUTÉ',
        channels: [
            { name: '👋・présentations', type: 0, topic: 'Présente-toi ! Film préféré obligatoire.' },
            { name: '🗣️・général',       type: 0, topic: 'La vraie vie du serveur.' },
            { name: '😂・memes',        type: 0, topic: 'Mèmes cinéma (et pas que).' },
            { name: '🖼️・partages',      type: 0, topic: 'Screenshots, arts, visuels.' },
        ],
    },
    {
        category: '🔊 VOCAL',
        channels: [
            { name: '🎧 Général',         type: 2 },
            { name: '🎬 Ciné-club',       type: 2 },
            { name: '🎮 Gaming & Séries', type: 2 },
        ],
    },
    {
        category: '🔒 STAFF',
        staffOnly: true,
        channels: [
            { name: '🛡️・staff-général', type: 0, topic: 'Zone privée staff.' },
            { name: '🔧・bot-config',    type: 0, topic: 'Configuration des bots.' },
            { name: '📋・logs',         type: 0, topic: 'Logs de modération.' },
        ],
    },
];

// ─── Embeds ───────────────────────────────────────────────────────────────────
function buildReglementEmbed() {
    return {
        embeds: [{
            title: "📜  Les règles. Oui, y'en a.",
            color: 0xE50914,
            description: "T'as survécu à la lecture jusqu'ici, c'est bon signe.\n*Courtes, simples, non négociables. Comme les meilleures séries.*",
            fields: [
                { name: '① Sois humain',                  value: "Le respect c'est pas optionnel. Insultes & harcèlement = ban, sans appel, sans bise.", inline: false },
                { name: '② Pas de spam',                  value: 'Pas de flood, pas de MAJUSCULES À FOND, pas de messages en 47 parties.', inline: false },
                { name: '③ Bon salon = bon message',      value: '`🐛 bug-report` pour les bugs · `💡 suggestions` pour les idées · `😂 memes` pour faire rire', inline: false },
                { name: '④ Zéro pub',                     value: "On est pas un marché. Aucune promo sans autorisation.", inline: false },
                { name: '⑤ Spoilers = avertissement',     value: "Annonce le spoiler AVANT. Les gens ont pas forcément fini la saison 3.", inline: false },
                { name: '⑥ Les mods ont le dernier mot',  value: "Pas d'accord ? DM un modo calmement. Pas de drama public.", inline: false },
            ],
            image: { url: 'attachment://banner.png' },
            footer: { text: 'AltyFlix · On regarde, on rigole, on respecte. 🍿', icon_url: 'attachment://icon.png' },
            timestamp: new Date().toISOString(),
        }],
    };
}

function buildVerifMessage() {
    return {
        embeds: [{
            color: 0x57F287,
            description: "✅  **Réagis avec ✅ ci-dessous pour accepter le règlement et accéder au serveur.**",
            footer: { text: "Le rôle Membre sera attribué automatiquement." }
        }]
    };
}

function buildSiteEmbed() {
    return {
        embeds: [{
            title: "🎬  AltyFlix — Le Netflix qu'on mérite vraiment.",
            color: 0xE50914,
            description: `Films, séries, documentaires — **gratuit**, **sans pub**, **sans te demander ta carte bleue**.\nT'as plus d'excuse pour t'ennuyer.\n\n> 🌐 **[Accéder au site →](${SITE_URL})**`,
            fields: [
                {
                    name: '📌  Les salons à connaître',
                    value: [
                        '📢 `#annonces` — Les news officielles',
                        '🎬 `#nouveautés` — Ce qui vient de débarquer sur le site',
                        '💬 `#discussions` — Cinéma, débats, coups de cœur',
                        '🐛 `#bug-report` — Quelque chose cloche ?',
                        "💡 `#suggestions` — T'as une idée de génie ? On écoute",
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: '🎭  Les rôles',
                    value: '`👑 Admin` · `🛡️ Modérateur` · `⭐ VIP AltyFlix` · `🎬 Membre`',
                    inline: false,
                },
            ],
            image: { url: 'attachment://banner.png' },
            footer: { text: 'AltyFlix · Le streaming comme il devrait être.', icon_url: 'attachment://icon.png' },
            timestamp: new Date().toISOString(),
        }],
    };
}

function buildAnnonce() {
    return {
        embeds: [{
            title: '🚀  Le serveur AltyFlix est là. Enfin.',
            color: 0xE50914,
            description: "Bienvenue sur le serveur officiel **AltyFlix** ! 🎉\n\nAvant de foncer :\n📜 Lis le **#règlement** *(ça prend 30 secondes)*\n🌐 Découvre **#le-site** si t'as vécu sous un rocher\n👋 Présente-toi dans **#présentations**\n\n*Film préféré obligatoire dans la présentation. On rigole pas avec ça.* 🍿",
            image: { url: 'attachment://banner.png' },
            footer: { text: 'AltyFlix · Bonne ambiance, bonne série.', icon_url: 'attachment://icon.png' },
            timestamp: new Date().toISOString(),
        }],
    };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const iconBuf       = fs.readFileSync(path.join(ROOT, 'logos', 'altyflix-icon-512.png'));
    const bannerBuf     = fs.readFileSync(path.join(ROOT, 'logos', 'altyflix-discord-banner-960x540.png'));
    const serverIconBuf = fs.readFileSync(path.join(ROOT, 'logos', 'altyflix-discord-server-icon.png'));

    const imageFiles = [
        { name: 'banner.png', buffer: bannerBuf, type: 'image/png' },
        { name: 'icon.png',   buffer: iconBuf,   type: 'image/png' },
    ];

    const me = await get('/users/@me');
    console.log(`🤖  Bot : ${me.username}`);

    console.log('\n🖼️   Avatar du bot...');
    await patch('/users/@me', { avatar: `data:image/png;base64,${iconBuf.toString('base64')}` });
    console.log('   ✅ Avatar mis à jour');
    await sleep(1500);

    const guilds  = await get('/users/@me/guilds');
    const guild   = guilds[0];
    const guildId = guild.id;
    console.log(`\n🎯  Serveur : ${guild.name} (${guildId})`);

    console.log('\n🏠  Mise à jour icône serveur...');
    await patch(`/guilds/${guildId}`, {
        icon: `data:image/png;base64,${serverIconBuf.toString('base64')}`,
        description: `AltyFlix — Le streaming gratuit, sans pub. Films, séries, documentaires. ${SITE_URL}`,
    });
    console.log('   ✅ Icône serveur mise à jour');
    await sleep(1000);

    // ── Rôles ────────────────────────────────────────────────────────────────
    let roles     = await get(`/guilds/${guildId}/roles`);
    const everyone  = roles.find(r => r.name === '@everyone');
    let adminRole = roles.find(r => r.name === '👑 Admin');
    let modRole   = roles.find(r => r.name === '🛡️ Modérateur');
    let membreRole = roles.find(r => r.name === '🎬 Membre');

    // Créer les rôles manquants
    if (!adminRole) {
        adminRole = await post(`/guilds/${guildId}/roles`, { name: '👑 Admin', color: 0xE50914, hoist: true, permissions: '8' });
        console.log('   ✅ Rôle 👑 Admin créé');
        await sleep(500);
    }
    if (!modRole) {
        modRole = await post(`/guilds/${guildId}/roles`, { name: '🛡️ Modérateur', color: 0xF1A817, hoist: true });
        console.log('   ✅ Rôle 🛡️ Modérateur créé');
        await sleep(500);
    }
    if (!membreRole) {
        membreRole = await post(`/guilds/${guildId}/roles`, { name: '🎬 Membre', color: 0x3498DB, hoist: false });
        console.log('   ✅ Rôle 🎬 Membre créé');
        await sleep(500);
    }
    console.log('\n   ✅ Rôles OK');

    // ── @everyone : AUCUNE permission de base ────────────────────────────────
    // On retire VIEW globalement — les salons seront invisibles sauf #règlement
    await patch(`/guilds/${guildId}/roles/${everyone.id}`, {
        permissions: '0',
    });
    console.log('   ✅ @everyone permissions : aucune (tout masqué)');
    await sleep(500);

    // ── Supprimer les anciens salons ─────────────────────────────────────────
    console.log('\n🗑️   Suppression des anciens salons...');
    const existing = await get(`/guilds/${guildId}/channels`);
    for (const ch of existing) {
        try { await del(`/channels/${ch.id}`); await sleep(250); } catch { /* ignore */ }
    }
    console.log('   ✅ Anciens salons supprimés');

    // ── Créer la structure ───────────────────────────────────────────────────
    console.log('\n📁  Création des catégories et salons...');
    const created = {};
    let rulesChannelId = null;

    for (const section of STRUCTURE) {
        // Overwrites de catégorie
        const catOw = [];

        if (section.staffOnly) {
            // Staff uniquement — @everyone et Membre n'ont rien
            catOw.push({ id: everyone.id,   type: 0, deny: deny(P.VIEW), allow: '0' });
            catOw.push({ id: membreRole.id, type: 0, deny: deny(P.VIEW), allow: '0' });
            if (adminRole) catOw.push({ id: adminRole.id, type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY, P.MANAGE_MSG, P.EMBED, P.ATTACH), deny: '0' });
            if (modRole)   catOw.push({ id: modRole.id,   type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY, P.MANAGE_MSG, P.EMBED, P.ATTACH), deny: '0' });
        } else {
            // Catégorie normale : @everyone masqué, Membre peut voir
            catOw.push({ id: everyone.id,   type: 0, deny: deny(P.VIEW), allow: '0' });
            catOw.push({ id: membreRole.id, type: 0, allow: allow(P.VIEW, P.HISTORY, P.REACT, P.EXT_EMOJI), deny: '0' });
            if (adminRole) catOw.push({ id: adminRole.id, type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY, P.MANAGE_MSG, P.EMBED, P.ATTACH, P.MENTION_ALL), deny: '0' });
            if (modRole)   catOw.push({ id: modRole.id,   type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY, P.MANAGE_MSG, P.EMBED, P.ATTACH), deny: '0' });
        }

        const cat = await post(`/guilds/${guildId}/channels`, {
            name: section.category, type: 4, permission_overwrites: catOw,
        });
        console.log(`\n   📁  ${section.category}`);
        await sleep(400);

        for (const ch of section.channels) {
            let ow = [];

            if (ch.rulesChannel) {
                // #règlement : TOUT LE MONDE peut voir (même sans Membre)
                // Lecture seule — juste voir + réagir
                ow = [
                    { id: everyone.id,   type: 0, allow: allow(P.VIEW, P.HISTORY, P.REACT), deny: deny(P.SEND, P.EMBED, P.ATTACH) },
                    { id: membreRole.id, type: 0, allow: allow(P.VIEW, P.HISTORY, P.REACT), deny: deny(P.SEND, P.EMBED, P.ATTACH) },
                ];
                if (adminRole) ow.push({ id: adminRole.id, type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY, P.EMBED, P.ATTACH, P.MANAGE_MSG, P.MENTION_ALL), deny: '0' });
                if (modRole)   ow.push({ id: modRole.id,   type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY, P.EMBED, P.ATTACH, P.MANAGE_MSG), deny: '0' });
            } else if (ch.type === 2) {
                // Vocal : Membre peut rejoindre
                ow = [
                    { id: everyone.id,   type: 0, deny: deny(P.VIEW, P.CONNECT), allow: '0' },
                    { id: membreRole.id, type: 0, allow: allow(P.VIEW, P.CONNECT, P.SPEAK, P.STREAM, P.USE_VAD), deny: '0' },
                ];
                if (adminRole) ow.push({ id: adminRole.id, type: 0, allow: allow(P.VIEW, P.CONNECT, P.SPEAK, P.STREAM, P.USE_VAD, P.MANAGE_MSG), deny: '0' });
                if (modRole)   ow.push({ id: modRole.id,   type: 0, allow: allow(P.VIEW, P.CONNECT, P.SPEAK, P.STREAM, P.USE_VAD), deny: '0' });
            } else if (ch.readonly) {
                // Lecture seule pour Membre
                ow = [
                    { id: everyone.id,   type: 0, deny: deny(P.VIEW), allow: '0' },
                    { id: membreRole.id, type: 0, allow: allow(P.VIEW, P.HISTORY, P.REACT), deny: deny(P.SEND, P.EMBED, P.ATTACH) },
                ];
                if (adminRole) ow.push({ id: adminRole.id, type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY, P.EMBED, P.ATTACH, P.MANAGE_MSG, P.MENTION_ALL), deny: '0' });
                if (modRole)   ow.push({ id: modRole.id,   type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY, P.EMBED, P.ATTACH, P.MANAGE_MSG), deny: '0' });
            } else {
                // Salon normal : Membre peut écrire
                ow = [
                    { id: everyone.id,   type: 0, deny: deny(P.VIEW), allow: '0' },
                    { id: membreRole.id, type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY, P.REACT, P.EMBED, P.ATTACH, P.EXT_EMOJI), deny: deny(P.MENTION_ALL) },
                ];
                if (adminRole) ow.push({ id: adminRole.id, type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY, P.MANAGE_MSG, P.MENTION_ALL, P.EMBED, P.ATTACH), deny: '0' });
                if (modRole)   ow.push({ id: modRole.id,   type: 0, allow: allow(P.VIEW, P.SEND, P.HISTORY, P.MANAGE_MSG, P.EMBED, P.ATTACH), deny: '0' });
            }

            const channel = await post(`/guilds/${guildId}/channels`, {
                name: ch.name, type: ch.type, topic: ch.topic || '',
                parent_id: cat.id, permission_overwrites: ow,
                ...(ch.type === 2 ? { bitrate: 64000, user_limit: 0 } : {}),
            });
            created[ch.name] = channel;
            if (ch.rulesChannel) rulesChannelId = channel.id;
            console.log(`      ✅  ${ch.type === 2 ? '🔊' : '#'}${ch.name}`);
            await sleep(400);
        }
    }

    // ── Messages ─────────────────────────────────────────────────────────────
    console.log('\n📝  Envoi des messages...');

    if (created['📜・règlement']) {
        // Règlement embed
        await postWithFiles(created['📜・règlement'].id, buildReglementEmbed(), imageFiles);
        console.log('   ✅  Règlement envoyé');
        await sleep(700);

        // Message de vérification avec ✅
        const verifMsg = await post(`/channels/${created['📜・règlement'].id}/messages`, buildVerifMessage());
        console.log('   ✅  Message de vérification envoyé');
        await sleep(500);

        // Ajouter la réaction ✅ au message
        await put(`/channels/${created['📜・règlement'].id}/messages/${verifMsg.id}/reactions/${encodeURIComponent('✅')}/@me`, null);
        console.log('   ✅  Réaction ✅ ajoutée');
        await sleep(500);

        // Sauvegarder l'ID du message de vérification pour le bot de réaction
        const config = {
            guildId,
            rulesChannelId: rulesChannelId || created['📜・règlement'].id,
            verifMessageId: verifMsg.id,
            membreRoleId: membreRole.id,
        };
        fs.writeFileSync(path.join(ROOT, 'scripts', 'bot-config.json'), JSON.stringify(config, null, 2));
        console.log('   ✅  Config bot sauvegardée (bot-config.json)');
    }

    if (created['🌐・le-site']) {
        await postWithFiles(created['🌐・le-site'].id, buildSiteEmbed(), imageFiles);
        console.log('   ✅  Présentation site envoyée');
        await sleep(700);
    }
    if (created['📢・annonces']) {
        await postWithFiles(created['📢・annonces'].id, buildAnnonce(), imageFiles);
        console.log('   ✅  Annonce de bienvenue envoyée');
        await sleep(700);
    }

    console.log('\n\n🎉  SERVEUR CONFIGURÉ !\n');
    console.log('👉  Lance maintenant : node scripts/bot-reaction.js');
    console.log('    Ce bot écoute les réactions ✅ et attribue le rôle Membre automatiquement.\n');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
