/**
 * Tunable knobs for the chat-ingest similarity router (plan/v1/31).
 *
 * Wrong-merge is a worse failure than duplicate-root, so the parent
 * thresholds are split into two bands: the high band silently merges,
 * the medium band only surfaces a suggestion. Cross-project matches are
 * always demoted to suggestions regardless of score (the user's project
 * boundaries must not be silently crossed).
 *
 * Numbers are starting points; expect to tune them as real embedding
 * data lands.
 */

/** score >= this AND same project → silent attach (toast + Undo). */
export const PARENT_AUTO_ATTACH_THRESHOLD = 0.9;

/**
 * PARENT_SUGGEST_THRESHOLD <= score < PARENT_AUTO_ATTACH_THRESHOLD →
 * surface as a suggestion. Same-project still gets a `possible-parent-match`
 * suggestion; cross-project gets `cross-project-match`. The router never
 * structurally attaches at this band.
 */
export const PARENT_SUGGEST_THRESHOLD = 0.82;

/**
 * Within-import child routing threshold. Looser than parent-level because
 * we already know we're in the right cluster — picking the wrong sibling
 * is a visible, draggable mistake, not a silent topic merge.
 */
export const SIBLING_MATCH_THRESHOLD = 0.78;

/**
 * Safety belt against embedding hallucinations on short titles. If the
 * best candidate's score is below this AND the candidate's title shares
 * zero non-stopword tokens with the query title, the router refuses to
 * auto-attach (drops to suggest, or to new-root if it was already in the
 * suggest band). Keeps "let's discuss this" / "more on this" near-1.0
 * embedding hits from collapsing two unrelated topics.
 */
export const SAFETY_TOKEN_OVERLAP_REQUIRED_BELOW = 0.95;

/** Max recent theme roots fed to the LLM classifier in fallback mode. */
export const LLM_FALLBACK_TOPK = 16;

/**
 * Pure-heuristic path: shared non-stopword tokens needed before the
 * heuristic can lift a candidate into the suggest band when no
 * embedding/classifier signal is available.
 */
export const HEURISTIC_TOKEN_OVERLAP_MIN = 3;
