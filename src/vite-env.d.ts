/// <reference types="vite/client" />

// Individual Lucide modules share the public icon component type.
declare module "lucide-react/dist/esm/icons/*.mjs" {
  const icon: import("lucide-react").LucideIcon;
  export default icon;
}
