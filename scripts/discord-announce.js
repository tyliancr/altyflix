/**
 * discord-announce.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Poste une annonce des améliorations AltyFlix dans #annonces
 * Mentionne le rôle @📢 Annonces (pas @everyone)
 *
 * Usage : node scripts/discord-announce.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, 'bot-config.json'), 'utf8'));

const { TOKEN: _legacyToken, guildId } = config;
const TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_API = 'https://discord.com/api/v10';
const SITE_URL    = 'https://altyflix.netlify.app';

// ─── IDs des rôles Discord ────────────────────────────────────────────────────
const ROLE_ANNONCES    = '1554913989249597450'; // 📢 Annonces
const ROLE_MAJ         = '1554914037815582840'; // 🛠️ Mises à jour

// ─── Couleurs ─────────────────────────────────────────────────────────────────
const RED  = 0xE50914;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Discord API ───────────────────────────────────────────────────────────────
async function discordApi(method, endpoint, body = null) {
    const opts = {
        method,
        headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${DISCORD_API}${endpoint}`, opts);
    if (res.status === 429) {
        const d = await res.json();
        const wait = Math.ceil((d.retry_after || 1) * 1000) + 300;
        console.log(`   ⏳ Rate limit — attente ${wait}ms`);
        await sleep(wait);
        return discordApi(method, endpoint, body);
    }
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`Discord ${method} ${endpoint} → ${res.status}: ${await res.text()}`);
    return res.json();
}

const dGet  = ep      => discordApi('GET',  ep);
const dPost = (ep, b) => discordApi('POST', ep, b);

// ─── Embed annonce ─────────────────────────────────────────────────────────────
function buildAnnonceEmbed() {
    const now = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'long', year: 'numeric'
    });

    return {
        // Mentionne le rôle @📢 Annonces (et @🛠️ Mises à jour en bonus)
        content: `<@&${ROLE_ANNONCES}> <@&${ROLE_MAJ}>`,
        embeds: [{
            title: '🚀  AltyFlix — Grande Mise à Jour & Nouveaux Lecteurs !',
            color: RED,
            description: [
                `> **${now}** — Mise à jour majeure déployée sur **[AltyFlix](${SITE_URL})** !`,
                'Découvrez de nouvelles sources de streaming haute performance et un renforcement complet de la plateforme.',
                '',
                '━━━━━━━━━━━━━━━━━━━━━━━━━',
            ].join('\n'),
            fields: [
                {
                    name: '🍿  Lecteurs Streaming & Sources 4K',
                    value: [
                        '⚡ **Vidzy en Mode Auto** — Vidzy est désormais le serveur prioritaire par défaut, avec adaptation automatique de la langue (**VF** ou **VOSTFR**) selon vos préférences de profil !',
                        '👑 **VidKing 4K intégré** — Nouveau lecteur ultra moderne, fluide avec autoplay, bouton épisode suivant et sélecteur d\'épisodes.',
                        '💎 **Videasy 4K & VidLink** — Flux 4K Ultra HD mis à jour sur leurs nouveaux endpoints haute vitesse.',
                        '🛡️ **Multi-secours AnyEmbed & VidSrc** — Bascule instantanée en cas d\'indisponibilité d\'un serveur.',
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: '🛡️  Sécurité & Confidentialité Renforcées',
                    value: [
                        '🔒 **Sécurisation du code PIN des profils** — Verrouillage strict empêchant toute modification sans le PIN actuel.',
                        '🔑 **Protection des comptes** — Chiffrement cryptographique SHA-256 des identifiants et mots de passe locaux.',
                        '🛡️ **Serveur & Proxy TMDB blindés** — Protection anti-traversal et isolation stricte des requêtes.',
                        '📊 **Règles Firestore durcies** — Protection de l\'intégrité des statistiques et des historiques.',
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: '⚡  Performances & Fluidité',
                    value: [
                        '🧹 **Nettoyage complet du projet** — Élimination des fichiers orphelins et allègement du bundle.',
                        '✅ **Codebase 100% certifiée** — Zéro erreur, zéro avertissement pour une stabilité absolue.',
                        '📱 **Expérience mobile & TV optimisée** — Zapping de serveurs instantané.',
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: '🌐  Tester dès maintenant',
                    value: `**➜ [altyflix.netlify.app](${SITE_URL})**`,
                    inline: true,
                },
                {
                    name: '💡  Suggestions & Retours',
                    value: '**➜ Salons `#suggestions` ou `#bugs`**',
                    inline: true,
                },
            ],
            footer: { text: 'AltyFlix · Le streaming nouvelle génération 🍿' },
            timestamp: new Date().toISOString(),
        }],
        // Autorise uniquement la mention du rôle, pas @everyone
        allowed_mentions: { roles: [ROLE_ANNONCES, ROLE_MAJ] },
    };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('📢  AltyFlix — Envoi annonce...\n');

    const channels = await dGet(`/guilds/${guildId}/channels`);
    const annoncesCh = channels.find(c => c.name?.includes('annonces') || c.name?.includes('annonce'));

    if (!annoncesCh) {
        console.error('❌  Salon #annonces introuvable !');
        process.exit(1);
    }

    console.log(`   📢  Salon trouvé : #${annoncesCh.name}`);
    await dPost(`/channels/${annoncesCh.id}/messages`, buildAnnonceEmbed());
    console.log('   ✅  Annonce envoyée avec succès !');
    console.log(`   🎭  Rôles mentionnés : @📢 Annonces + @🛠️ Mises à jour`);
}

main().catch(err => {
    console.error('❌  Erreur :', err.message);
    process.exit(1);
});
