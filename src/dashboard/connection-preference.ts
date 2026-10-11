const KEY = "dashboardAutoConnectEnabled";

export async function loadAutoConnectPreference(): Promise<boolean> {
  const stored = await chrome.storage.local.get(KEY);
  return stored[KEY] === true;
}

export async function saveAutoConnectPreference(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [KEY]: enabled });
}
