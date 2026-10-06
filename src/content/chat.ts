import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ChatCard } from "./components/ChatCard.js";

(() => {
  const host = document.createElement("div");
  host.dataset.kariyerLensChat = "true";
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;display:block;width:auto;max-width:calc(100vw - 32px);margin:0;";
  const root = createRoot(host.attachShadow({ mode: "closed" }));
  let jobId: string | undefined;

  function sync() {
    const current = findJobId();
    if (jobId !== current) {
      jobId = current;
      root.render(createElement(ChatCard, { jobId }));
      lastRequestedJobId = "";
      void loadCurrentJob();
    }
    if (!jobId || !document.body) { host.remove(); return; }
    if (host.parentElement !== document.body) document.body.append(host);
  }
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; sync(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener("popstate", sync);
  setInterval(sync, 500);
  sync();
})();
