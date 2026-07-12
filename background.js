// Owns the per-tab state lifecycle. State for tab N lives in
// chrome.storage.session under "tab:<N>" as { open, marking, listOpen, pos,
// marks }. Session storage clears itself when the browser closes, so marks
// never outlive a session; closing a tab wipes its state here. The toolbar
// icon only toggles `open` — hiding the UI keeps the tab's marks.
//
// Content scripts learn their tab id via the one "tabId" message below;
// everything else flows through storage.onChanged.

const ready = chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });

const key = (id) => `tab:${id}`;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg !== "tabId" || sender.tab?.id == null) return;
  ready.then(() => sendResponse(sender.tab.id));
  return true; // async sendResponse
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null) return;
  const k = key(tab.id);
  const cur = (await chrome.storage.session.get(k))[k];
  if (cur?.open) {
    chrome.storage.session.set({ [k]: { ...cur, open: false, marking: false, listOpen: false } });
  } else {
    const marks = cur?.marks || [];
    // Fresh open arms marking (that's what the tool is for); reopening with
    // existing marks shows the list instead.
    chrome.storage.session.set({ [k]: { ...cur, open: true, marking: marks.length === 0, listOpen: marks.length > 0, marks } });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(key(tabId)));

// Toolbar badge mirrors each tab's mark count.
chrome.storage.session.onChanged.addListener((changes) => {
  for (const [k, c] of Object.entries(changes)) {
    if (!k.startsWith("tab:")) continue;
    const n = c.newValue?.marks?.length ?? 0;
    chrome.action.setBadgeText({ tabId: +k.slice(4), text: n ? String(n) : "" }).catch(() => {});
  }
});
chrome.action.setBadgeBackgroundColor({ color: "#5fe3c8" });
chrome.action.setBadgeTextColor({ color: "#062b24" });
