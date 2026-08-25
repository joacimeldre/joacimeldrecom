import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const postsCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      pubDate: z.date(),
      description: z.string(),
      published: z.preprocess((value) => {
        if (typeof value === "string") {
          const normalized = value.trim().toLowerCase();
          if (normalized === "yes") return true;
          if (normalized === "no") return false;
        }

        return value;
      }, z.boolean().default(true)),
      image: z.preprocess(
        (value) => (value == null ? undefined : value),
        z
          .object({
            url: image(),
            alt: z.string(),
          })
          .optional(),
      ),
      ogImage: z.preprocess(
        (value) => (value == null ? undefined : value),
        image().optional(),
      ),
      tags: z.array(z.string()),
    }),
});

export const collections = {
  posts: postsCollection,
};
