import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

import { rehypeGlossary } from './app/lib/rehype-glossary';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig({
  mdxOptions: {
    rehypePlugins: (plugins) => [...plugins, rehypeGlossary],
  },
});
