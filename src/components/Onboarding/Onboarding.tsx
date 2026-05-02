import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { dialog } from '../../services/dialog';

export function Onboarding() {
  const dismissed = useStore((s) => s.settings.onboardingDismissed);
  const conversations = useStore((s) => s.conversations);
  // Only show on truly fresh launches: never dismissed AND no conversations yet.
  if (dismissed || conversations.length > 0) return null;
  return <OnboardingInner />;
}

function OnboardingInner() {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const dismiss = useStore((s) => s.dismissOnboarding);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setObsidianVault = useStore((s) => s.setObsidianVault);
  const obsidianVaultPath = useStore((s) => s.settings.obsidianVaultPath);
  const createConversation = useStore((s) => s.createConversation);
  const setActiveConversation = useStore((s) => s.setActiveConversation);
  const addMessage = useStore((s) => s.addMessage);

  function finish() {
    if (!useStore.getState().conversations.length) {
      const id = createConversation(t('onboarding.firstConversation'));
      addMessage(id, 'system', t('onboarding.welcomeMessage'));
      setActiveConversation(id);
    }
    dismiss();
  }

  async function pickVault() {
    const picked = await dialog.pickFolder();
    if (picked) setObsidianVault(picked);
  }

  return (
    <div className="modal-backdrop" onClick={() => undefined}>
      <div className="modal onboarding" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('onboarding.welcome')}</h2>
          <button
            type="button"
            className="close"
            onClick={finish}
            title={t('onboarding.skip')}
          >
            ×
          </button>
        </header>

        {step === 0 ? (
          <section>
            <p>{t('onboarding.intro')}</p>
            <p className="muted">{t('onboarding.introNote')}</p>
            <ul className="onboarding-shortcuts">
              <li>
                <kbd>⌘P</kbd> {t('onboarding.shortcutCommandPalette')}
              </li>
              <li>
                <kbd>⌘K</kbd> {t('onboarding.shortcutSearch')}
              </li>
              <li>
                <kbd>⌘J</kbd> {t('onboarding.shortcutAiPalette')}
              </li>
              <li>
                <kbd>⌘D</kbd> {t('onboarding.shortcutDaily')}
              </li>
              <li>
                <kbd>⌘?</kbd> {t('onboarding.shortcutAll')}
              </li>
            </ul>
          </section>
        ) : null}

        {step === 1 ? (
          <section>
            <h3>{t('onboarding.addProvider')}</h3>
            <p className="muted">{t('onboarding.addProviderHelp')}</p>
            <button
              type="button"
              className="primary"
              onClick={() => setSettingsOpen(true)}
            >
              {t('onboarding.openProviderSettings')}
            </button>
          </section>
        ) : null}

        {step === 2 ? (
          <section>
            <h3>{t('onboarding.pickVault')}</h3>
            <p className="muted">{t('onboarding.pickVaultHelp')}</p>
            <div className="path-row">
              <code>{obsidianVaultPath ?? t('onboarding.notSet')}</code>
              <button type="button" onClick={pickVault}>
                {obsidianVaultPath
                  ? t('onboarding.change')
                  : t('onboarding.choose')}
              </button>
            </div>
          </section>
        ) : null}

        <footer className="onboarding-footer">
          <button type="button" className="link" onClick={finish}>
            {t('onboarding.skip')}
          </button>
          <span className="muted">{step + 1} / 3</span>
          <div className="onboarding-nav">
            {step > 0 ? (
              <button type="button" onClick={() => setStep(step - 1)}>
                {t('onboarding.back')}
              </button>
            ) : null}
            {step < 2 ? (
              <button
                type="button"
                className="primary"
                onClick={() => setStep(step + 1)}
              >
                {t('onboarding.next')}
              </button>
            ) : (
              <button type="button" className="primary" onClick={finish}>
                {t('onboarding.getStarted')}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
