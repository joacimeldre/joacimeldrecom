import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export const prerender = true;

export async function GET(context) {
  const posts = await getCollection("posts");
  const visiblePosts = import.meta.env.DEV
    ? posts
    : posts.filter((post) => post.data.published);
  const response = await rss({
    title: "Joacim Eldre | Blog",
    description: "Posts on design, coding, icons, and tiny game experiments.",
    site: context.site,
    items: visiblePosts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/posts/${post.id.replace(/\.(md|mdx)$/i, "")}/`,
    })),
    customData: `<language>en-us</language>`,
  });

  response.headers.set(
    "Cache-Control",
    "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  );

  return response;
}
