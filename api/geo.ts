/*
 * The rough place of a visitor, for the daily count. Vercel reads the place from the IP address of the
 * request at its edge and puts it in the headers. This function sends back only the country code, the
 * region code and the city, never the address, and nothing keeps the response.
 */

function city(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function GET(request: Request): Response {
  const headers = request.headers;
  return Response.json(
    {
      country: headers.get('x-vercel-ip-country'),
      region: headers.get('x-vercel-ip-country-region'),
      city: city(headers.get('x-vercel-ip-city')),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
