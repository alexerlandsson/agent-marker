// Toolbar icon opens/closes the sidebar for all tabs. Content scripts observe
// the `open` flag in storage, so navigation keeps the sidebar state.
// Marker mode itself is toggled from the "Mark up" button (the `marking` flag).
chrome.action.onClicked.addListener(async () => {
  const { open } = await chrome.storage.local.get("open");
  await chrome.storage.local.set({ open: !open });
});
