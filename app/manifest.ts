import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SNF Printing AI Voice Concierge',
    short_name: 'SNF Concierge',
    description:
      'Interact with our AI Voice Concierge to find medical forms and supplies with ease.',
    start_url: '/',
    display: 'standalone',
    background_color: '#100c14',
    theme_color: '#100c14',
    icons: [
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
