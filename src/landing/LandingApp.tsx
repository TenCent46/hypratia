import { DemoCanvas } from '../demo/DemoCanvas';
import { DemoChat } from '../demo/DemoChat';
import { SiteHeader, DOWNLOAD_URL } from '../web/SiteHeader';
import { SiteFooter } from '../web/SiteFooter';

const FEATURES = [
  {
    title: 'Local-first',
    desc: 'Every conversation is a plain Markdown file on your disk. Works offline. No accounts, no cloud lock-in.',
  },
  {
    title: 'Mac-native',
    desc: 'A real desktop app — ~10 MB, native windows, menubar, shortcuts. Built on Tauri 2.',
  },
  {
    title: 'Conversation memory canvas',
    desc: 'Drop messages onto an infinite canvas. Cluster, connect, revisit — instead of scrolling forever.',
  },
];

const STEPS = [
  {
    title: 'Chat as usual',
    desc: 'Talk to your favorite LLM in the right pane. BYO API key — Claude, GPT, Gemini, Mistral.',
  },
  {
    title: 'Drag onto the canvas',
    desc: 'Pull any message into the left pane. It becomes a draggable Markdown node you own.',
  },
  {
    title: 'Cluster and connect',
    desc: 'Arrange ideas in space. Link them. Drop in pasted text or images. Build a map of your thinking.',
  },
  {
    title: 'Save to your vault',
    desc: 'Everything mirrors to your Obsidian vault as Markdown with wikilinks. Your notes outlive the app.',
  },
];

export function LandingApp() {
  return (
    <div className="demo-shell">
      <SiteHeader />

      <section className="demo-hero">
        <p className="demo-hero-eyebrow">Memory Canvas · Beta</p>
        <h1 className="demo-hero-title">
          Your conversations,
          <br />
          finally spatial.
        </h1>
        <p className="demo-hero-sub">
          Hypratia turns every LLM chat into an infinite canvas you can rearrange,
          connect, and keep forever — as Markdown, on your Mac.
        </p>
        <div className="demo-cta-row">
          <a className="demo-cta-primary" href={DOWNLOAD_URL}>
            Download for macOS
          </a>
          <a className="demo-cta-secondary" href="/demo">
            Try the live demo →
          </a>
        </div>
        <p className="demo-cta-meta">
          Free during beta · Apple Silicon &amp; Intel · macOS 12+
        </p>
      </section>

      <section
        className="demo-stage demo-stage-preview"
        aria-label="Live canvas preview"
      >
        <div className="demo-stage-canvas">
          <DemoCanvas />
        </div>
        <div className="demo-stage-chat">
          <DemoChat />
        </div>
      </section>

      <div className="demo-section-head">
        <p className="demo-section-eyebrow">Why Hypratia</p>
        <h2 className="demo-section-title">Built for thinking, not filing.</h2>
      </div>
      <section className="demo-features" aria-label="Features">
        {FEATURES.map((f) => (
          <article key={f.title} className="demo-feature">
            <h3 className="demo-feature-title">{f.title}</h3>
            <p className="demo-feature-desc">{f.desc}</p>
          </article>
        ))}
      </section>

      <div className="demo-section-head">
        <p className="demo-section-eyebrow">How it works</p>
        <h2 className="demo-section-title">
          A canvas that grows with the conversation.
        </h2>
      </div>
      <section className="demo-howitworks" aria-label="How it works">
        {STEPS.map((s, i) => (
          <article key={s.title} className="demo-step">
            <span className="demo-step-num" aria-hidden>
              {i + 1}
            </span>
            <h3 className="demo-step-title">{s.title}</h3>
            <p className="demo-step-desc">{s.desc}</p>
          </article>
        ))}
      </section>

      <SiteFooter />
    </div>
  );
}
