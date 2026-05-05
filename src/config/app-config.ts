import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "muscle fit",
  version: packageJson.version,
  copyright: `© ${currentYear}, muscle fit.`,
  meta: {
    title: "muscle fit Google Ads — Operator dashboard",
    description:
      "Google Ads dashboard and CLI tooling for muscle fit: campaign reports, search terms, and n-gram analysis.",
  },
};
