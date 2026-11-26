/*! Source Foshan furniture tools widget · https://tools.sourcefoshan.com/widgets
 * Usage:
 *   <div data-sourcefoshan-tool="cbm"><a href="https://sourcefoshan.com/furniture-shipping-and-consolidation-from-china/">Furniture CBM calculator</a> by Source Foshan</div>
 *   <script src="https://tools.sourcefoshan.com/widget.js" async></script>
 * Tools: "cbm", "hs-code". Options: data-unit="cm|in" (cbm), data-query="sofa" (hs-code).
 */
(function () {
  'use strict';
  if (window.SourceFoshanTools && window.SourceFoshanTools.scan) { window.SourceFoshanTools.scan(); return; }

  var script = document.currentScript;
  var ORIGIN = 'https://tools.sourcefoshan.com';
  try { if (script && script.src) ORIGIN = new URL(script.src, location.href).origin; } catch (e) { /* keep default */ }

  var TOOLS = {
    'cbm': { path: '/embed/cbm', title: 'Furniture CBM and container calculator by Source Foshan', height: 640 },
    'hs-code': { path: '/embed/hs-code', title: 'Furniture HS code finder by Source Foshan', height: 420 }
  };
  var frames = [];

  function mount(el) {
    if (el.getAttribute('data-sf-mounted')) return;
    var name = (el.getAttribute('data-sourcefoshan-tool') || '').toLowerCase();
    var tool = TOOLS[name];
    if (!tool) return;
    el.setAttribute('data-sf-mounted', '1');

    var id = 'sf' + Math.random().toString(36).slice(2, 10);
    var src = new URL(tool.path, ORIGIN);
    src.searchParams.set('id', id);
    src.searchParams.set('host', location.hostname);
    var unit = el.getAttribute('data-unit');
    if (unit === 'in' || unit === 'cm') src.searchParams.set('unit', unit);
    var query = el.getAttribute('data-query');
    if (query) src.searchParams.set('q', query.slice(0, 180));

    var iframe = document.createElement('iframe');
    iframe.src = src.href;
    iframe.title = tool.title;
    iframe.loading = 'lazy';
    iframe.setAttribute('allow', 'clipboard-write');
    iframe.style.cssText = 'display:block;width:100%;max-width:100%;min-width:280px;border:0;margin:0 0 6px;' +
      'background:transparent;color-scheme:light;overflow:hidden;height:' + tool.height + 'px';
    el.insertBefore(iframe, el.firstChild);
    frames.push({ id: id, iframe: iframe });
  }

  // Each widget reports its content height so the iframe never shows a scrollbar.
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.origin !== ORIGIN || !data || data.type !== 'sourcefoshan:resize') return;
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (f.id === data.id && event.source === f.iframe.contentWindow) {
        var h = Math.ceil(Number(data.height) || 0);
        if (h >= 120 && h <= 5000) f.iframe.style.height = h + 'px';
      }
    }
  });

  function scan() {
    var els = document.querySelectorAll('[data-sourcefoshan-tool]');
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }

  window.SourceFoshanTools = { scan: scan, version: '1.0.0' };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
})();
