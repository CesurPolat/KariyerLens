const RULE_ID = 1001;
const installed = new WeakMap<object, Promise<void>>();

export function iskurOriginRule(extensionId: string): chrome.declarativeNetRequest.Rule {
  return {
    id: RULE_ID, priority: 1,
    action: { type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
      requestHeaders: [{ header: "origin", operation: "remove" as chrome.declarativeNetRequest.HeaderOperation }] },
    condition: {
      regexFilter: "^https://esube\\.iskur\\.gov\\.tr/Istihdam/AcikIsIlan(Ara|Detay)\\.aspx(\\?|$)",
      initiatorDomains: [extensionId],
      requestMethods: ["post" as chrome.declarativeNetRequest.RequestMethod],
      resourceTypes: ["xmlhttprequest" as chrome.declarativeNetRequest.ResourceType],
    },
  };
}

/** Fetch cannot remove the browser's Origin header; install the scoped rule first. */
export function ensureIskurOriginRemoved(): Promise<void> {
  // Standalone Node callers have no browser-generated Origin or extension API.
  if (typeof chrome === "undefined" || !chrome.runtime?.id) return Promise.resolve();
  const extensionId = chrome.runtime.id, api = chrome.declarativeNetRequest;
  if (!api?.updateSessionRules) return Promise.reject(new Error("İstek başlığı izni kullanılamıyor."));
  const existing = installed.get(api);
  if (existing) return existing;
  const pending = Promise.resolve().then(() => api.updateSessionRules({ removeRuleIds: [RULE_ID], addRules: [iskurOriginRule(extensionId)] }))
    .catch(error => { installed.delete(api); throw error; });
  installed.set(api, pending);
  return pending;
}
