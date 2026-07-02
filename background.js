// Toolbar icon opens/closes the sidebar for all tabs. Content scripts observe
// the `open` flag in storage, so navigation keeps the sidebar state.
// Marker mode itself is toggled from the "Mark up" button (the `marking` flag).
//
// Marks are session-scoped: closing the plugin (or a new browser session) wipes
// them, so markings never leak from one site/session into the next.
const reset = () => chrome.storage.local.set({ open: false, marking: false, minimized: false, marks: [] });

chrome.runtime.onStartup.addListener(reset);
chrome.runtime.onInstalled.addListener(reset);

chrome.action.onClicked.addListener(async () => {
  const { open } = await chrome.storage.local.get("open");
  if (open) return reset();                         // closing → clear all marks
  await chrome.storage.local.set({ open: true });   // opening → fresh (marks already cleared)
});
