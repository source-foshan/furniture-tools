// Shared helpers for the embeddable widgets.
export const params = new URLSearchParams(location.search);
const frameId = params.get('id') || '';
const host = (params.get('host') || '').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 100);

/** Tag a sourcefoshan.com link so the site's analytics can see which website the visit came from. */
export function tracked(href, campaign) {
  const url = new URL(href, 'https://sourcefoshan.com');
  url.searchParams.set('utm_source', 'sourcefoshan-widget');
  url.searchParams.set('utm_medium', 'embed');
  url.searchParams.set('utm_campaign', campaign);
  if (host) url.searchParams.set('utm_content', host);
  else url.searchParams.delete('utm_content');
  return url.href;
}

/** Point every [data-track] link at its tracked URL and open it in a new tab. */
export function trackLinks(root, campaign) {
  root.querySelectorAll('a[data-track]').forEach((a) => {
    a.href = tracked(a.getAttribute('href'), campaign);
    a.target = '_blank';
    a.rel = 'noopener';
  });
}

/** Tell the host page our height so its iframe never scrolls. */
export function autoResize() {
  if (window.parent === window) return;
  let last = 0;
  const send = () => {
    const h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (Math.abs(h - last) < 2) return;
    last = h;
    window.parent.postMessage({ type: 'sourcefoshan:resize', id: frameId, height: h }, '*');
  };
  new ResizeObserver(send).observe(document.documentElement);
  window.addEventListener('load', send);
  send();
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}
