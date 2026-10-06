import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ChatCard } from "./components/ChatCard.js";

(() => {
  const host = document.createElement("div");
  host.dataset.kariyerLensChat = "true";
  host.style.cssText = "display:block;width:100%;min-width:0;margin-bottom:20px;";
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
    const column = jobId && document.querySelector(".job-detail-right-column");
    const companyCard = column && column.querySelector(".job-detail-company-card");
    if (!companyCard) { host.remove(); return; }
    if (host.previousElementSibling !== companyCard) companyCard.insertAdjacentElement("afterend", host);
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
