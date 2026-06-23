import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";

import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
import rehypeExternalLinks from "rehype-external-links";

const siteUrl = "https://joacimeldrecom.vercel.app";
const siteHostname = new URL(siteUrl).hostname;

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    drafts: true,
    rehypePlugins: [
      [
        rehypeExternalLinks,
        {
          target: "_blank",
          rel: ["noopener", "noreferrer"],
          test: (element) => {
            const href = element.properties?.href;
            if (typeof href !== "string") return false;

            try {
              return new URL(href, siteUrl).hostname !== siteHostname;
            } catch {
              return false;
            }
          },
        },
      ],
    ],
    shikiConfig: {
      theme: "css-variables",
    },
  },
  shikiConfig: {
    wrap: true,
    skipInline: false,
    drafts: true,
  },
  site: siteUrl,
  integrations: [sitemap(), mdx()],
});
