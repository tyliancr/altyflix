import { motion } from 'framer-motion';
import { Card, SectionHeader, Field, SubmitBtn, Row, Toggle } from './SettingsUI';
import { LANGUAGES } from './SettingsConstants';
import { playHaptic } from '../../utils/interactions';
import Icon from '../ui/Icons';

export default function ProfileTab({
    handleProfileSave,
    selectedAvatar,
    setShowAvatarSelector,
    profileName,
    setProfileName,
    pinCode,
    setPinCode,
    isKid,
    setIsKid,
    selectedLanguage,
    setSelectedLanguage,
    loading,
    t
}) {
    return (
        <motion.form
            onSubmit={handleProfileSave}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="space-y-6"
        >
            <Card>
                <SectionHeader
                    icon={<Icon name="user" />}
                    title={t('settings.platformSettings')}
                    subtitle={t('settings.platformSettingsDesc')}
                />
                <div className="flex flex-col items-center gap-7 p-6 sm:flex-row sm:items-start">
                    <motion.button
                        type="button"
                        aria-label="Changer d’avatar"
                        whileHover={{ scale: 1.04, rotate: -2 }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                        className="group relative flex-none rounded-[26%]"
                        onClick={() => { playHaptic(); setShowAvatarSelector(true); }}
                    >
                        <span className="block h-28 w-28 overflow-hidden rounded-[26%] bg-[#101016] ring-1 ring-white/10 transition-shadow group-hover:ring-2 group-hover:ring-white">
                            <img
                                src={selectedAvatar || '/avatars/netflix/users-1.png'}
                                alt=""
                                className="h-full w-full object-cover"
                                onError={(e) => { e.currentTarget.src = '/avatars/netflix/users-1.png'; }}
                            />
                        </span>
                        <span className="absolute -bottom-1.5 -right-1.5 grid h-9 w-9 place-items-center rounded-full bg-white text-black shadow-lg">
                            <Icon name="edit" className="h-4 w-4" strokeWidth={2.2} />
                        </span>
                    </motion.button>

                    <div className="w-full flex-1 space-y-4">
                        <Field
                            label={t('settings.profileNameLabel')}
                            value={profileName}
                            onChange={e => setProfileName(e.target.value)}
                            required
                            maxLength={15}
                        />
                        <Field
                            label={t('settings.pinCodeLabel')}
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            value={pinCode}
                            onChange={e => setPinCode(e.target.value.replace(/\D/g, '').substring(0, 4))}
                            maxLength={4}
                            hint="Laissez vide pour ne pas verrouiller ce profil."
                        />
                    </div>
                </div>
            </Card>

            <Card className="divide-y divide-white/[0.07]">
                <Row icon={<Icon name="kid" />} title={t('settings.kidProfile')} description={t('settings.kidProfileDesc')}>
                    <Toggle checked={isKid} onChange={setIsKid} label={t('settings.kidProfile')} />
                </Row>
                <Row icon={<Icon name="globe" />} title={t('settings.contentLanguage')} description="Langue de l’interface et des fiches.">
                    <select
                        aria-label={t('settings.contentLanguage')}
                        value={selectedLanguage}
                        onChange={e => { playHaptic(); setSelectedLanguage(e.target.value); }}
                        className="field-select h-10"
                    >
                        {LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
                    </select>
                </Row>
            </Card>

            <SubmitBtn loading={loading} label={t('settings.save')} />
        </motion.form>
    );
}
