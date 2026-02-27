import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { companyInfo } from './components/company';

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
  '@id': companyInfo.website,
  name: companyInfo.name,
  url: companyInfo.website,
  logo: companyInfo.logo,
  description: companyInfo.description,
  address: {
    '@type': 'PostalAddress',
    streetAddress: companyInfo.location.address,
    addressLocality: companyInfo.location.city,
    addressRegion: companyInfo.location.state,
    postalCode: companyInfo.location.zip,
    addressCountry: companyInfo.location.country,
  },
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: `+1-${companyInfo.contact.phone.replace(/[() ]/g, '')}`,
    contactType: 'customer service',
    email: companyInfo.contact.email,
  },
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Medical Forms Catalog',
  },
};

const softwareAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: `${companyInfo.name} AI Voice Concierge`,
  url: 'https://concierge.snfforms.com',
  image: 'https://concierge.snfforms.com/brand-logo.png',
  description: `An AI-powered voice concierge that helps healthcare professionals find and order medical forms and supplies from ${companyInfo.name} with real-time voice interaction.`,
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
