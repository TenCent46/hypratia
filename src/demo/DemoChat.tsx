type Msg = {
  id: string;
  role: 'user' | 'assistant';
  title: string;
  body: string[];
};

const SAMPLE_MESSAGES: Msg[] = [
  {
    id: 'm1',
    role: 'user',
    title: '',
    body: [
      "I keep losing track of where ideas came from in long ChatGPT threads. Anything spatial would help.",
    ],
  },
  {
    id: 'm2',
    role: 'assistant',
    title: 'Spatial works because retrieval is positional',
    body: [
      "Linear chat collapses every idea into one timeline. The mind doesn't store ideas that way — it stores them in a place.",
      "Drop messages onto a canvas as you go and the canvas becomes a map of the conversation.",
    ],
  },
  {
    id: 'm3',
    role: 'user',
    title: '',
    body: ["Right — and I want it offline. I'm tired of cloud notes."],
  },
  {
    id: 'm4',
    role: 'assistant',
    title: 'Local-first, Markdown all the way down',
    body: [
      'Every node is a Markdown file. Your Obsidian vault stays the source of truth.',
      'Hypratia is just a lens over those files — delete the app and your notes are still yours.',
    ],
  },
];

export function DemoChat() {
  return (
    <aside className="chat-panel demo-chat">
      <header className="demo-chat-header">
        <span className="demo-chat-title">Today’s thread</span>
        <span className="demo-chat-meta">2 messages · 1 idea pinned</span>
      </header>
      <div className="message-list">
        {SAMPLE_MESSAGES.map((m) => (
          <article key={m.id} className="message">
            <div className="role">{m.role}</div>
            {m.title ? <div className="title">{m.title}</div> : null}
            <div className="content">
              {m.body.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </article>
        ))}
      </div>
      <footer className="demo-chat-composer" aria-hidden>
        <div className="demo-chat-composer-input">Ask something…</div>
        <button type="button" className="demo-chat-composer-send" tabIndex={-1}>
          ↩
        </button>
      </footer>
    </aside>
  );
}
