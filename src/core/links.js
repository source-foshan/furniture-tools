// Links back to sourcefoshan.com. UTM tags let the site's existing attribution
// (sf_attr cookie + PostHog) count visits that came from the API or MCP server.
export const SITE = 'https://sourcefoshan.com';

export function siteUrl(pathWithQuery, channel, campaign, hash) {
  const url = new URL(pathWithQuery, SITE);
  url.searchParams.set('utm_source', channel === 'mcp' ? 'sourcefoshan-mcp' : 'sourcefoshan-api');
  url.searchParams.set('utm_medium', channel === 'mcp' ? 'mcp' : 'api');
  url.searchParams.set('utm_campaign', campaign);
  if (hash) url.hash = hash;
  return url.href;
}

export function hsCta(channel) {
  return {
    text: 'Sourcing furniture from Foshan? Source Foshan compares suppliers against your written specification, agrees quality checks and consolidates several suppliers into one shipment.',
    url: siteUrl('/start-your-project/', channel, 'hs-code-finder')
  };
}

export function cbmCta(channel) {
  return {
    text: 'Send your packing lists to Source Foshan for a loading review before you book a container.',
    url: siteUrl('/start-your-project/', channel, 'cbm-calculator'),
    calculator_url: siteUrl('/furniture-shipping-and-consolidation-from-china/', channel, 'cbm-calculator', 'calculator')
  };
}
