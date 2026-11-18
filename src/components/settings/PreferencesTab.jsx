import { motion } from 'framer-motion';
import { Card, SectionHeader, SubmitBtn, Row, Toggle, Field } from './SettingsUI';
import { SUBTITLE_SIZE_MAP, SUBTITLE_COLOR_MAP } from './SettingsConstants';
import Icon from '../ui/Icons';
import { SegmentedControl } from '../ui/Primitives';

const COLOR_NAMES = { white: 'Blanc', yellow: 'Jaune', cyan: 'Cyan', green: 'Vert', orange: 'Orange' };

export default function PreferencesTab({
    handlePreferencesSave,
    autoplayNext,
    setAutoplayNext,
    autoplayTrailers,
    setAutoplayTrailers,
    subtitlesAlwaysOn,
    setSubtitlesAlwaysOn,
    videoQuality,
    setVideoQuality,
    subtitlesSize,
    setSubtitlesSize,
    subtitlesColor,
    setSubtitlesColor,
    debridProvider,
    setDebridProvider,
    debridToken,
    setDebridToken,
    frenchioUrl,
    setFrenchioUrl,
    loading,
    t
}) {
    return (
        <motion.form
            onSubmit={handlePreferencesSave}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="space-y-6"
        >
            <Card>
                <SectionHeader
                    icon={<Icon name="play" />}
                    title={t('settings.playPreferences')}
                    subtitle={t('settings.playPreferencesDesc')}
                />
                <div className="divide-y divide-white/[0.07]">
                    <Row title={t('settings.autoplayNextEp')} description={t('settings.autoplayNextEpDesc')}>
                        <Toggle checked={autoplayNext} onChange={setAutoplayNext} label={t('settings.autoplayNextEp')} />
                    </Row>
                    <Row title={t('settings.autoplayTrailers')} description={t('settings.autoplayTrailersDesc')}>
                        <Toggle checked={autoplayTrailers} onChange={setAutoplayTrailers} label={t('settings.autoplayTrailers')} />
                    </Row>
                    <Row title={t('settings.preferredQuality')} description="« Automatique » s’adapte à votre connexion.">
                        <select
                            aria-label={t('settings.preferredQuality')}
                            value={videoQuality}
                            onChange={e => setVideoQuality(e.target.value)}
                            className="field-select h-10"
                        >
                            <option value="auto">Automatique</option>
                            <option value="1080p">1080p</option>
                            <option value="720p">720p</option>
                        </select>
                    </Row>
                </div>
            </Card>

            <Card>
                <SectionHeader icon={<Icon name="subtitles" />} title="Sous-titres" subtitle="Activation par défaut, taille et couleur du texte." />
                <div className="space-y-6 p-6">
                    <Row
                        title={t('settings.subtitlesAlwaysOnLabel') || 'Toujours activer les sous-titres'}
                        description={t('settings.subtitlesAlwaysOnDesc') || 'Active automatiquement les sous-titres au lancement de chaque film ou épisode. Vous pouvez les désactiver à tout moment via le lecteur ou la touche C.'}
                    >
                        <Toggle
                            checked={subtitlesAlwaysOn}
                            onChange={setSubtitlesAlwaysOn}
                            label={t('settings.subtitlesAlwaysOnLabel') || 'Toujours activer les sous-titres'}
                        />
                    </Row>

                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <span className="text-[15px] font-semibold text-white">{t('settings.subtitleSizeLabel')}</span>
                        <SegmentedControl
                            size="sm"
                            label={t('settings.subtitleSizeLabel')}
                            value={subtitlesSize}
                            onChange={setSubtitlesSize}
                            options={Object.entries(SUBTITLE_SIZE_MAP).map(([id, size]) => ({ id, label: size.label }))}
                        />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <span className="text-[15px] font-semibold text-white">{t('settings.subtitleColorLabel')}</span>
                        <div className="flex items-center gap-2.5" role="radiogroup" aria-label={t('settings.subtitleColorLabel')}>
                            {Object.entries(SUBTITLE_COLOR_MAP).map(([key, hex]) => {
                                const active = subtitlesColor === key;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        aria-label={COLOR_NAMES[key] || key}
                                        title={COLOR_NAMES[key] || key}
                                        onClick={() => setSubtitlesColor(key)}
                                        className={`grid h-9 w-9 place-items-center rounded-full transition-transform duration-200 ${active ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#0b0b10]' : 'ring-1 ring-white/20 hover:scale-105'}`}
                                        style={{ backgroundColor: hex }}
                                    >
                                        {active && <Icon name="check" className="h-4 w-4 text-black" strokeWidth={3} />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Live preview on a neutral "frame" */}
                    <div className="relative overflow-hidden rounded-2xl ring-1 ring-inset ring-white/10" aria-label={t('settings.subtitlePreviewTitle')}>
                        <div className="flex aspect-[21/9] min-h-[150px] items-end justify-center pb-6" style={{ background: 'radial-gradient(120% 90% at 30% 20%, #2a2f45 0%, #14161f 45%, #07070a 100%)' }}>
                            <motion.p
                                key={`${subtitlesSize}-${subtitlesColor}`}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25 }}
                                className="px-4 text-center font-bold"
                                style={{
                                    fontSize: SUBTITLE_SIZE_MAP[subtitlesSize]?.fontSize || '16px',
                                    color: SUBTITLE_COLOR_MAP[subtitlesColor] || '#FFFFFF',
                                    textShadow: '0 0 4px #000, 0 2px 8px rgba(0,0,0,0.9)',
                                }}
                            >
                                {t('settings.subtitlePreviewText')}
                            </motion.p>
                        </div>
                        <span className="absolute left-3 top-3 rounded-md border border-white/15 bg-black/60 px-1.5 py-1 text-[9px] font-bold uppercase leading-none tracking-[0.12em] text-white/70 backdrop-blur-md">
                            {t('settings.subtitlePreviewTitle')}
                        </span>
                    </div>
                </div>
            </Card>

            <Card>
                <SectionHeader
                    icon={<Icon name="globe" />}
                    title="Sources Debrid"
                    subtitle="Connectez votre débrideur (Torbox, Real-Debrid) pour la lecture 4K/1080p instantanée."
                />
                <div className="space-y-5 p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-white/70 mb-2">Fournisseur</label>
                            <select
                                value={debridProvider || 'torbox'}
                                onChange={e => setDebridProvider(e.target.value)}
                                className="field-select h-14 w-full text-sm"
                            >
                                <option value="torbox">Torbox (Recommandé)</option>
                                <option value="realdebrid">Real-Debrid</option>
                                <option value="alldebrid">AllDebrid</option>
                                <option value="debridlink">Debrid-Link</option>
                                <option value="premiumize">Premiumize.me</option>
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <Field
                                label="Clé API Debrid (Torbox / Real-Debrid)"
                                type="password"
                                value={debridToken || ''}
                                onChange={e => setDebridToken(e.target.value)}
                                hint="Votre clé personnelle Torbox (torbox.app/settings) ou Real-Debrid."
                            />
                        </div>
                    </div>

                    <div className="border-t border-white/[0.07] pt-5">
                        <Field
                            label="URL Addon Frenchio (Optionnel)"
                            type="text"
                            value={frenchioUrl || ''}
                            onChange={e => setFrenchioUrl(e.target.value)}
                            hint="URL Stremio d'installation de Frenchio (ElfHosted ou instance privée)."
                        />
                    </div>
                </div>
            </Card>

            <SubmitBtn loading={loading} label={t('settings.save')} />
        </motion.form>
    );
}
