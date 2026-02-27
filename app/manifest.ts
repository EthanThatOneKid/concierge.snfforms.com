import { MetadataRoute } from 'next';
import { companyInfo } from './components/company';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${companyInfo.name} AI Voice Concierge`,
    short_name: 'SNF Concierge',
    description:
      'Interact with our AI Voice Concierge to find medical forms and supplies with ease.',
    start_url: '/',
    display: 'standalone',
    background_color: '#100c14',
    theme_color: '#100c14',
    icons: [
      {
        src: '/brand-logo.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  };
}
