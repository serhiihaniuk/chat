import type { Config } from '@react-router/dev/config';
import { glob } from 'node:fs/promises';
import { createGetUrl, getSlugs } from 'fumadocs-core/source';

const getUrl = createGetUrl('/docs');

export default {
  ssr: false,
  async prerender({ getStaticPaths }) {
    const paths: string[] = [];
    const excluded: string[] = [];

    for (const path of getStaticPaths()) {
      if (!excluded.includes(path)) paths.push(path);
    }

    for await (const entry of glob('**/*.mdx', { cwd: 'content/docs' })) {
      // node:fs glob yields OS-native separators; getSlugs splits on '/', so on
      // Windows nested pages would otherwise produce a single mangled slug and
      // never enter the prerender list (their .data 404s in dev and prod).
      const slugs = getSlugs(entry.replaceAll('\\', '/'));
      paths.push(getUrl(slugs), `/llms.mdx/docs/${[...slugs, 'content.md'].join('/')}`);
    }

    return paths;
  },
} satisfies Config;
