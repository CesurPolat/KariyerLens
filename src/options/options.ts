import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { OptionsApp } from "./OptionsApp.js";

createRoot(document.getElementById("root")!).render(createElement(OptionsApp));
