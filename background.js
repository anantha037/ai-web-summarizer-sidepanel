// Background Service Worker for handling active tab querying, script injection, and context menus

chrome.runtime.onInstalled.addListener(() => {
  // Create Context Menu item on installation
  chrome.contextMenus.create({
    id: "summarizeSelection",
    title: "Summarize Highlighted Text",
    contexts: ["selection"]
  });
});

// Listen for Context Menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "summarizeSelection") {
    const selectionText = info.selectionText;
    const url = tab ? tab.url : "";
    
    // Store selected text and URL for the popup to pick up
    chrome.storage.local.set({
      pending_selection_text: selectionText,
      pending_selection_url: url
    }, () => {
      // Programmatically open the extension popup
      if (chrome.action && chrome.action.openPopup) {
        chrome.action.openPopup().catch((err) => {
          console.warn("openPopup failed or is unsupported in this context:", err);
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extractText") {
    // Query active tab in the current window
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab) {
        sendResponse({ error: "No active tab found. Please make sure you are on a webpage." });
        return;
      }

      // Safeguard against chrome:// or file:// system pages where injection is blocked by Chrome security
      if (activeTab.url && (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("edge://") || activeTab.url.startsWith("about:"))) {
        sendResponse({ error: "Extension cannot run on browser system pages." });
        return;
      }

      // Programmatically execute content.js inside the active tab
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["content.js"]
      }, (results) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }

        if (results && results[0] && results[0].result !== undefined) {
          sendResponse({ text: results[0].result });
        } else {
          sendResponse({ error: "Failed to extract page content. No text returned." });
        }
      });
    });
    return true; // Keep the message channel open for async sendResponse
  }
});
