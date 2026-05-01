import { useStore } from '../../store';

function todayTitle(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function openTodayDailyNote(): string {
  const title = todayTitle();
  const state = useStore.getState();
  const existing = state.conversations.find(
    (c) => c.kind === 'daily' && c.title === title,
  );
  if (existing) {
    state.setActiveConversation(existing.id);
    return existing.id;
  }
  const id = state.createConversation(title);
  state.markConversationKind(id, 'daily');
  state.setActiveConversation(id);
  return id;
}

export function getOrCreateInbox(): string {
  const state = useStore.getState();
  const inboxId = state.settings.inboxConversationId;
  if (inboxId) {
    const c = state.conversations.find((c) => c.id === inboxId);
    if (c) return inboxId;
  }
  const id = state.createConversation('Inbox');
  state.markConversationKind(id, 'inbox');
  state.setInboxConversationId(id);
  return id;
}
