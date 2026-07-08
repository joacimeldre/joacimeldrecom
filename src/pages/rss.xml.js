import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function get() {
  const posts = await getCollection("posts");
  return rss({
    title: "Joacim Eldre | Blog",
    description: "Posts on design, coding, icons, and tiny game experiments.",
    site: "https://joacimeldrecom.vercel.app",
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/posts/${post.id.replace(/\.(md|mdx)$/i, "")}/`,
    })),
    customData: `<language>en-us</language>`,
  });
}
