import { DemoCanvas } from './DemoCanvas';
import { DemoChat } from './DemoChat';
import { SiteHeader, DOWNLOAD_URL } from '../web/SiteHeader';
import { SiteFooter } from '../web/SiteFooter';

export function DemoApp() {
  return (
    <div className="demo-shell">
      <SiteHeader />

      <div className="demo-page-intro">
        <div>
          <h1 className="demo-page-title">Live demo</h1>
          <p className="demo-page-sub">
            Drag nodes around. Paste text or images directly onto the canvas to
            spawn new memos. Everything you see here ships in the Mac app.
          </p>
        </div>
        <a className="demo-back-link" href="/">
          ← Back to home
        </a>
      </div>

      <section
        className="demo-stage demo-stage-full"
        aria-label="Hypratia canvas demo"
      >
        <div className="demo-stage-canvas">
          <DemoCanvas />
        </div>
        <div className="demo-stage-chat">
          <DemoChat />
        </div>
      </section>

      <div className="demo-page-outro">
        <p className="demo-page-outro-text">
          This is a small slice of Hypratia. The Mac app adds local LLM chat,
          your full Obsidian vault, attachments, search, and more.
        </p>
        <a className="demo-cta-primary" href={DOWNLOAD_URL}>
          Download for macOS
        </a>
      </div>

      <SiteFooter />
    </div>
  );
}
