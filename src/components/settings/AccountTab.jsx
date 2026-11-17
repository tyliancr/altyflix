import { motion } from 'framer-motion';
import { Card, SectionHeader, Field, SubmitBtn } from './SettingsUI';
import Icon from '../ui/Icons';

export default function AccountTab({
    email,
    handleEmailChange,
    emailForm,
    setEmailForm,
    handlePasswordChange,
    passwordForm,
    setPasswordForm,
    handleDeleteAccount,
    loading,
    t
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="space-y-6"
        >
            <Card>
                <SectionHeader
                    icon={<Icon name="mail" />}
                    title={t('settings.changeEmailTitle')}
                    subtitle={email ? `Adresse actuelle : ${email}` : 'Un lien de validation sera envoyé à la nouvelle adresse.'}
                />
                <form onSubmit={handleEmailChange} className="space-y-4 p-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            label="Nouvelle adresse e-mail"
                            type="email"
                            value={emailForm.newEmail}
                            onChange={e => setEmailForm({ ...emailForm, newEmail: e.target.value })}
                            required
                            autoComplete="email"
                        />
                        <Field
                            label="Mot de passe actuel"
                            type="password"
                            value={emailForm.password}
                            onChange={e => setEmailForm({ ...emailForm, password: e.target.value })}
                            required
                            autoComplete="current-password"
                        />
                    </div>
                    <SubmitBtn loading={loading} label={t('settings.changeEmailBtn')} />
                </form>
            </Card>

            <Card>
                <SectionHeader
                    icon={<Icon name="lock" />}
                    title={t('settings.changePasswordTitle')}
                    subtitle="6 caractères au minimum."
                />
                <form onSubmit={handlePasswordChange} className="space-y-4 p-6">
                    <Field
                        label="Mot de passe actuel"
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                        required
                        autoComplete="current-password"
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            label={t('settings.newPassword')}
                            type="password"
                            value={passwordForm.newPassword}
                            onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                            required
                            autoComplete="new-password"
                        />
                        <Field
                            label={t('settings.repeatPassword')}
                            type="password"
                            value={passwordForm.confirmPassword}
                            onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                            required
                            autoComplete="new-password"
                        />
                    </div>
                    <SubmitBtn loading={loading} label={t('settings.changePasswordBtn')} />
                </form>
            </Card>

            <Card className="!border-[#E50914]/25">
                <div className="flex flex-col justify-between gap-5 p-6 sm:flex-row sm:items-center">
                    <div className="flex items-start gap-4">
                        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[#E50914]/12 text-[#ff5a63]">
                            <Icon name="alert" />
                        </span>
                        <div>
                            <h2 className="font-display text-lg font-bold tracking-tight text-white">{t('settings.dangerZoneTitle')}</h2>
                            <p className="mt-0.5 max-w-md text-[13px] leading-snug text-white/50">{t('settings.dangerZoneDesc')}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleDeleteAccount}
                        className="h-11 flex-none rounded-xl border border-[#E50914]/50 px-5 text-sm font-bold text-[#ff5a63] transition-colors hover:bg-[#E50914] hover:text-white"
                    >
                        {t('settings.deleteAccountBtn')}
                    </button>
                </div>
            </Card>
        </motion.div>
    );
}
