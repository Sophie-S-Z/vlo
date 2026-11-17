import { describe, expect, test } from 'vitest';
import { GET } from '../../api/geo';
import { placeLabels } from '@/features/account/owner';

/* Migration 0010: the place server on Vercel and the names of places on the owner page. */

describe('api/geo', () => {
  test('sends back only the country, the region and the decoded city, and nothing keeps it', async () => {
    const response = GET(
      new Request('https://vlo.example/api/geo', {
        headers: {
          'x-vercel-ip-country': 'BR',
          'x-vercel-ip-country-region': 'SP',
          'x-vercel-ip-city': 'S%C3%A3o%20Paulo',
          'x-vercel-ip-latitude': '-23.5',
          'x-forwarded-for': '203.0.113.7',
        },
      }),
    );
    expect(await response.json()).toEqual({ country: 'BR', region: 'SP', city: 'São Paulo' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  test('gives null for a missing header or a city that does not decode', async () => {
    const response = GET(
      new Request('https://vlo.example/api/geo', { headers: { 'x-vercel-ip-city': '%E0%A4%A' } }),
    );
    expect(await response.json()).toEqual({ country: null, region: null, city: null });
  });
});

test('place keys get English names', () => {
  expect(placeLabels({ US: 2, 'US-CA': 1, 'US|CA|San Jose': 1, 'FR||Paris': 1, XZ: 1 })).toEqual({
    US: 'United States',
    'US-CA': 'CA, United States',
    'US|CA|San Jose': 'San Jose, CA, United States',
    'FR||Paris': 'Paris, France',
    XZ: 'XZ',
  });
});
