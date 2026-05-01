import { useState } from 'react';
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
      const id = createConversation('First conversation');
      addMessage(
        id,
        'system',
        '_Welcome. Try ⌘P for the command palette, ⌘K to search, ⌘J on selected text for AI._',
      );
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
          <h2>Welcome to Memory Canvas</h2>
          <button type="button" className="close" onClick={finish} title="Skip">
            ×
          </button>
        </header>

        {step === 0 ? (
          <section>
            <p>
              On the right is a real chat. On the left is your spatial memory:
              drag thoughts onto the canvas, drop PDFs and images, highlight
              text inside a PDF to spawn a linked card.
            </p>
            <p className="muted">
              Everything stays on your machine. You bring your own AI keys.
            </p>
            <ul className="onboarding-shortcuts">
              <li>
                <kbd>⌘P</kbd> command palette
              </li>
              <li>
                <kbd>⌘K</kbd> search
              </li>
              <li>
                <kbd>⌘J</kbd> AI palette on selection
              </li>
              <li>
                <kbd>⌘D</kbd> today's daily note
              </li>
              <li>
                <kbd>⌘?</kbd> all shortcuts
              </li>
            </ul>
          </section>
        ) : null}

        {step === 1 ? (
          <section>
            <h3>Add an AI provider</h3>
            <p className="muted">
              Optional — the app works as a journal without one. To enable
              streaming chat, add a key now or later.
            </p>
            <button
              type="button"
              className="primary"
              onClick={() => setSettingsOpen(true)}
            >
              Open Settings → Providers
            </button>
          </section>
        ) : null}

        {step === 2 ? (
          <section>
            <h3>Pick your vault (optional)</h3>
            <p className="muted">
              When you export, conversations + nodes go into this folder as
              Markdown. Skip and your data stays only in app data.
            </p>
            <div className="path-row">
              <code>{obsidianVaultPath ?? '(not set)'}</code>
              <button type="button" onClick={pickVault}>
                {obsidianVaultPath ? 'Change…' : 'Choose folder…'}
              </button>
            </div>
          </section>
        ) : null}

        <footer className="onboarding-footer">
          <button type="button" className="link" onClick={finish}>
            Skip
          </button>
          <span className="muted">{step + 1} / 3</span>
          <div className="onboarding-nav">
            {step > 0 ? (
              <button type="button" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : null}
            {step < 2 ? (
              <button
                type="button"
                className="primary"
                onClick={() => setStep(step + 1)}
              >
                Next
              </button>
            ) : (
              <button type="button" className="primary" onClick={finish}>
                Get started
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
