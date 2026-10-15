const VIEWER = chrome.runtime.getURL('viewer.html');
const TIFF_URL = /\.tiff?([?#].*)?$/i;

// Web links to .tif/.tiff open in the viewer instead of downloading.
async function installRedirectRule() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: { type: 'redirect', redirect: { regexSubstitution: VIEWER + '#\\0' } },
      condition: {
        regexFilter: '^https?://[^?#]*\\.[Tt][Ii][Ff][Ff]?([?#].*)?$',
        resourceTypes: ['main_frame'],
      },
    }],
  });
}

function setup() {
  installRedirectRule();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'open-tiff',
      title: 'Open in TIFF Viewer',
      contexts: ['link'],
    });
  });
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(installRedirectRule);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-tiff' && info.linkUrl) {
    chrome.tabs.create({ url: VIEWER + '#' + info.linkUrl, index: tab ? tab.index + 1 : undefined });
  }
});

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: VIEWER }));

// Local files (file://) aren't covered by the redirect rule, so catch them here.
// Needs "Allow access to file URLs" switched on for the extension.
const redirectedFiles = new Set();
chrome.webNavigation.onBeforeNavigate.addListener(details => {
  if (details.frameId !== 0 || !TIFF_URL.test(details.url)) return;
  redirectedFiles.add(details.url);
  setTimeout(() => redirectedFiles.delete(details.url), 10000);
  chrome.tabs.update(details.tabId, { url: VIEWER + '#' + details.url });
}, { url: [{ schemes: ['file'] }] });

// Chrome treats a local TIFF as a download; cancel the copy it would make.
chrome.downloads.onCreated.addListener(item => {
  if (redirectedFiles.has(item.url) || redirectedFiles.has(item.finalUrl)) {
    chrome.downloads.cancel(item.id, () => chrome.downloads.erase({ id: item.id }));
  }
});
