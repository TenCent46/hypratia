import { useLocale } from '../web/LocaleProvider';

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  titleKey?: string;
  bodyKeys: string[];
};

const SAMPLE_MESSAGES: Msg[] = [
  { id: 'm1', role: 'user', bodyKeys: ['sample.msg.user1'] },
  {
    id: 'm2',
    role: 'assistant',
    titleKey: 'sample.msg.assistant1.title',
    bodyKeys: ['sample.msg.assistant1.p1', 'sample.msg.assistant1.p2'],
  },
  { id: 'm3', role: 'user', bodyKeys: ['sample.msg.user2'] },
  {
    id: 'm4',
    role: 'assistant',
    titleKey: 'sample.msg.assistant2.title',
    bodyKeys: ['sample.msg.assistant2.p1', 'sample.msg.assistant2.p2'],
  },
];

export function DemoChat() {
  const { t } = useLocale();
  return (
    <aside className="chat-panel demo-chat">
      <header className="demo-chat-header">
        <span className="demo-chat-title">{t('chat.title')}</span>
        <span className="demo-mode-badge" title={t('chat.badge.title')}>
          {t('chat.badge')}
        </span>
      </header>
      <div className="message-list">
        {SAMPLE_MESSAGES.map((m) => (
          <article key={m.id} className="message">
            <div className="role">{m.role}</div>
            {m.titleKey ? <div className="title">{t(m.titleKey)}</div> : null}
            <div className="content">
              {m.bodyKeys.map((bk, i) => (
                <p key={i}>{t(bk)}</p>
              ))}
            </div>
          </article>
        ))}
      </div>
      <footer className="demo-chat-composer" aria-hidden>
        <div className="demo-chat-composer-input">
          {t('chat.composer.disabled')}
        </div>
        <button type="button" className="demo-chat-composer-send" tabIndex={-1}>
          ↩
        </button>
      </footer>
    </aside>
  );
}
