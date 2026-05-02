import { DemoCanvas } from './DemoCanvas';
import { DemoChat } from './DemoChat';
import { DemoTour } from './DemoTour';
import { SiteHeader, DOWNLOAD_URL } from '../web/SiteHeader';
import { SiteFooter } from '../web/SiteFooter';

export function DemoApp() {
  return (
    <div className="demo-shell">
      <SiteHeader />

      <div className="demo-page-intro">
        <div>
          <h1 className="demo-page-title">
            Live demo
            <span className="demo-mode-badge demo-mode-badge--inline">
              Static · no AI calls
            </span>
          </h1>
          <p className="demo-page-sub">
            Drag nodes around. Click <strong>+ Add memo</strong> for a new
            Markdown node, or paste text / images straight onto the canvas.
            Nothing leaves your browser — this page does not talk to any AI
            provider.
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
      <DemoTour />
    </div>
  );
}
