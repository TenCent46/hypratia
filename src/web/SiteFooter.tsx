import { DOWNLOAD_URL, REPO_URL } from './SiteHeader';

export function SiteFooter() {
  return (
    <footer className="demo-footer">
      <span>© Hypratia · Local-first memory canvas for LLM conversations</span>
      <span className="demo-footer-links">
        <a className="demo-footer-link" href={REPO_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a className="demo-footer-link" href={DOWNLOAD_URL}>
          Download for macOS
        </a>
      </span>
    </footer>
  );
}
