import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': 'https://snfforms.com',
  name: 'SNF Printing',
  url: 'https://snfforms.com',
  logo: 'https://snfforms.vercel.app/logo.png',
  description:
    'Precision printing and easy access to medical forms and supplies for the healthcare industry.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '15532 Computer Lane',
    addressLocality: 'Huntington Beach',
    addressRegion: 'CA',
    postalCode: '92649',
    addressCountry: 'US',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+1-714-901-6868',
    contactType: 'customer service',
    email: 'sales@snfforms.com',
  },
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Medical Forms Catalog',
  },
};

const softwareAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'SNF Printing AI Voice Concierge',
  url: 'https://concierge.snfforms.com',
  image: 'https://concierge.snfforms.com/brand-logo.png',
  description:
    'An AI-powered voice concierge that helps healthcare professionals find and order medical forms and supplies from SNF Printing with real-time voice interaction.',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  featureList: [
    'AI-powered voice assistant',
    'Real-time voice interaction',
    'Medical forms catalog search',
    'Healthcare supply ordering assistance',
    'Natural language query support',
  ],
  potentialAction: {
    '@type': 'SearchAction',
    target: 'https://concierge.snfforms.com',
    description: 'Ask the AI Voice Concierge about medical forms and supplies',
  },
  publisher: {
    '@id': 'https://snfforms.com',
  },
  additionalType: 'https://schema.org/AIApplication',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(softwareAppJsonLd),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
