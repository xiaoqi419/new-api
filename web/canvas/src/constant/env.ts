export const APP_VERSION = __APP_VERSION__ || "dev";

export const DOCS_URL = import.meta.env.VITE_DOC_URL || "https://docs.canvas.best";

// Embedded builds only execute plugins shipped from this origin.  A deployment
// may explicitly provide another registry, but the default stays local so a
// remote manifest cannot introduce arbitrary code into a logged-in iframe.
export const PLUGIN_REGISTRY_URL = import.meta.env.VITE_PLUGIN_REGISTRY_URL || `${import.meta.env.BASE_URL}official-plugins.json`;
