# joacimeldre.com

Personal website and blog built with Astro, Tailwind CSS, and Astro Content Collections.

## Stack

- Astro 5
- Tailwind CSS 4
- Astro Content Collections for typed blog content
- Vercel adapter for deployment
- Redis-backed clap API with in-memory fallback

## Local development

Install dependencies:

```bash
npm install
```

Start dev server:

```bash
npm run dev
```

Default local URL is usually `http://localhost:4321`.

Build for production:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Project structure

```text
.
├── public/
│   └── fonts/
├── src/
│   ├── components/
│   ├── content/
│   │   ├── config.ts
│   │   ├── images/
│   │   └── posts/
│   ├── layouts/
│   ├── pages/
│   │   ├── api/claps/[slug].ts
│   │   └── posts/[...slug].astro
│   └── styles/global.css
├── astro.config.mjs
└── package.json
```

## Writing blog posts

Create a markdown file in `src/content/posts/` using date-first filenames:

```text
YYYY-MM-DD-post-title.md
```

Required frontmatter fields are validated in `src/content/config.ts`:

```yaml
---
pubDate: 2026-06-24
title: Post title
description: Short summary
image:
	url: "../images/posts/example.png"
	alt: "Accessible description"
tags: ["All", "Design"]
---
```

Post images should live under `src/content/images/posts/` and be referenced relatively from each post.

## Markdown image style tokens

This site supports class tokens in markdown image titles via a rehype plugin in `astro.config.mjs`.

Syntax:

```md
![Alt text](../images/posts/example.png "Optional title {.flat}")
```

That example adds the `flat` class to the rendered image, so styles from `src/styles/global.css` apply:

```css
img.flat {
  border-radius: 0;
}
```

Use this for icon/pixel art images that should keep sharp corners.

## Claps API

Claps are served by `src/pages/api/claps/[slug].ts`.

- In production, Redis is used when `REDIS_URL` is set.
- Without `REDIS_URL`, it falls back to an in-memory store (works for local dev, not durable across restarts).
- Basic rate limiting and re-clap cooldown are enabled.

## Deployment

The site is configured for Vercel using `@astrojs/vercel` with server output.

Before deploying claps in production, configure:

```bash
REDIS_URL=<your-redis-connection-string>
```
