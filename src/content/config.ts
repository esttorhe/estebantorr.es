// ABOUTME: Content collections configuration for Astro. Blog posts are MDX with a strict category enum.
// ABOUTME: Uses the Astro v5 Content Layer API with the glob loader.

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    category: z.enum(['Tech', 'Leadership', 'Productivity', 'Personal', 'Community']),
    /** Path or slug of the per-post hero image. Optional — resolver falls back
        to convention path (src/assets/post-heroes/<slug>.*) and then to a
        Sigil-generated SVG when both are absent. */
    featured_image: z.string().optional(),
    /** Accessible alt text for the hero image. Required when the image is
        meaningful; if omitted the resolver uses a generic "Hero illustration
        for <title>" string. */
    featured_image_alt: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const til = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/til' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    // Required (unlike blog's optional description) — it's the one-sentence
    // takeaway the /til index shows in place of a body preview.
    description: z.string(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = {
  blog,
  til,
};
