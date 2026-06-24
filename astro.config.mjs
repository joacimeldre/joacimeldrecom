import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";

import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
import rehypeExternalLinks from "rehype-external-links";

const siteUrl = "https://joacimeldrecom.vercel.app";
const siteHostname = new URL(siteUrl).hostname;

function rehypeImageClassFromTitle() {
  return (tree) => {
    const walk = (node) => {
      if (!node || typeof node !== "object") return;

      if (
        node.type === "element" &&
        node.tagName === "img" &&
        node.properties
      ) {
        const title = node.properties.title;
        if (typeof title === "string") {
          const match = title.match(/\{\.([a-zA-Z0-9_-]+)\}\s*$/);

          if (match) {
            const className = match[1];
            const existingClass =
              node.properties.class || node.properties.className;
            let mergedClasses = [];

            if (Array.isArray(existingClass)) {
              mergedClasses = [...existingClass, className];
            } else if (typeof existingClass === "string") {
              mergedClasses = [
                ...existingClass.split(/\s+/).filter(Boolean),
                className,
              ];
            } else {
              mergedClasses = [className];
            }

            node.properties.class = Array.from(new Set(mergedClasses)).join(
              " ",
            );
            delete node.properties.className;

            const cleanedTitle = title
              .replace(/\s*\{\.[a-zA-Z0-9_-]+\}\s*$/, "")
              .trim();

            if (cleanedTitle) {
              node.properties.title = cleanedTitle;
            } else {
              delete node.properties.title;
            }
          }
        }
      }

      if (Array.isArray(node.children)) {
        node.children.forEach(walk);
      }
    };

    walk(tree);
  };
}

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
      rehypeImageClassFromTitle,
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
