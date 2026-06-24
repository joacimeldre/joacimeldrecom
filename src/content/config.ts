import { defineCollection, z } from "astro:content";

const postsCollection = defineCollection({
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      pubDate: z.date(),
      description: z.string(),
      image: z.object({
        url: image(),
        alt: z.string(),
      }),
      tags: z.array(z.string()),
    }),
});

const imagesCollection = defineCollection({
  type: "data",
});

export const collections = {
  posts: postsCollection,
  images: imagesCollection,
};
