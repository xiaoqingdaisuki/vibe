import type { MetadataRoute } from 'next';

// 生成可安装应用所需的 Web App Manifest
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Vibe — Personal Web Lab',
    short_name: 'Vibe',
    description: 'A personal Web Lab for apps, experiments, and public API powered demos.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#7c3aed',
    lang: 'en',
    categories: ['productivity', 'utilities', 'education'],
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Explore Lab',
        short_name: 'Lab',
        description: 'Open Vibe Lab apps and experiments.',
        url: '/lab',
      },
      {
        name: 'Read Blog',
        short_name: 'Blog',
        description: 'Read the latest posts from Vibe.',
        url: '/blog',
      },
    ],
  };
}
