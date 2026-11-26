/* Shared, deterministic renderer/search core and progressively enhanced UI. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SFHSFinder = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', api.init, { once: true });
    else api.init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var WORDS = {
    chairs: 'chair', seats: 'seat', sofas: 'sofa', couches: 'sofa', couch: 'sofa', settee: 'sofa', settees: 'sofa',
    tables: 'table', desks: 'desk', cabinets: 'cabinet', wardrobes: 'wardrobe', beds: 'bed', mattresses: 'mattress',
    pillows: 'pillow', cushions: 'cushion', parts: 'part', frames: 'frame', stools: 'stool', benches: 'bench',
    wooden: 'wood', timber: 'wood', oak: 'wood', walnut: 'wood', teak: 'wood', metallic: 'metal', steel: 'metal', aluminium: 'metal', aluminum: 'metal', iron: 'metal', plastics: 'plastic', upholstered: 'upholstered', upholstery: 'upholstered',
    foams: 'foam', springs: 'spring', kitchens: 'kitchen', bedrooms: 'bedroom', offices: 'office', recliners: 'recliner',
    bookcases: 'bookcase', shelves: 'shelf', shelving: 'shelf', cupboards: 'cupboard', ottomans: 'ottoman'
  };
  var STOP_WORDS = new Set(['a', 'an', 'the', 'for', 'of', 'with', 'and', 'hs', 'code', 'codes', 'hscode']);
  var COMMON_ORDER = ['940161', '940171', '940139', '940131', '940169', '940179', '940180', '940141', '940149', '940360', '940320', '940350', '940330', '940310', '940340', '940370', '940383', '940382', '940389', '940153', '940152', '940159', '940421', '940429', '940410', '940490', '940440', '940430', '940191', '940199', '940391', '940399', '940210', '940290', '940110', '940120'];
  function priority(row) { var rank = COMMON_ORDER.indexOf(codeDigits(row.code)); return rank < 0 ? COMMON_ORDER.length : rank; }
  function list(value) { return Array.isArray(value) ? value : value == null || value === '' ? [] : [value]; }
  function clean(value) { return String(value == null ? '' : value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' '); }
  function normalize(value) {
    return clean(value).replace(/\bnon upholstered\b/g, 'unupholstered').replace(/(?:木质|木制|实木)(?=[\u3400-\u9fff])/g, 'wood ').replace(/木(?=[餐桌椅床柜家具])/g, 'wood ').replace(/金属(?=[\u3400-\u9fff])/g, 'metal ').replace(/塑料(?=[\u3400-\u9fff])/g, 'plastic ').replace(/竹制(?=[\u3400-\u9fff])/g, 'bamboo ').replace(/(?:天然藤|藤制)(?=[\u3400-\u9fff])/g, 'rattan ').split(' ').map(function (word) { return WORDS[word] || word; }).join(' ').trim().replace(/\s+/g, ' ');
  }
  function tokens(value) { return normalize(value).split(' ').filter(function (word) { return word && !STOP_WORDS.has(word); }); }
  function productTokens(value) {
    var normalized = normalize(value).replace(/\blight wood\b/g, 'wood');
    if (/\b(wardrobe|closet|cabinet|dressing table)\b/.test(normalized)) normalized = normalized.replace(/\bwith (?:a )?mirror\b/g, '');
    return tokens(normalized);
  }
  function codeDigits(value) { return String(value == null ? '' : value).replace(/\D/g, ''); }
  function codeQuery(value) { var useful = tokens(value).join(''); return /^\d+$/.test(useful) ? useful : ''; }
  function formatCode(value) { var digits = codeDigits(value); return digits.length === 6 ? digits.slice(0, 4) + '.' + digits.slice(4) : String(value || ''); }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(value) { try { var url = new URL(String(value)); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch (_) { return ''; } }
  function label(value) { return String(value || '').replace(/[-_]/g, ' ').replace(/\b\w/g, function (letter) { return letter.toUpperCase(); }); }
  function valueOf(item) { return typeof item === 'string' ? item : String(item.id || item.value || item.key || item.slug || ''); }
  function labelOf(item) { return typeof item === 'string' ? label(item) : String(item.label || item.name || item.title || label(valueOf(item))); }
  function valuesFor(row, field) { return list(row[field]).map(function (value) { return String(value).toLowerCase(); }); }
  function categoryMatches(row, category) {
    var values = valuesFor(row, 'categoryKeys').concat(valuesFor(row, 'categoryKey'), valuesFor(row, 'category'), valuesFor(row, 'groups'));
    return !category || values.indexOf(String(category).toLowerCase()) !== -1 || (category === 'tables' && values.indexOf('desks') !== -1);
  }
  function materialMatches(row, material) { return !material || valuesFor(row, row.materials ? 'materials' : 'material').some(function (value) { return value === 'various' || normalize(value) === normalize(material); }); }
  function buildIndex(rows) {
    return rows.map(function (row) {
      var products = list(row.products).concat(list(row.aliases)).map(normalize);
      // Conditions, notes and material prose include exclusions and must never be positive aliases.
      var fields = [normalize(row.title)].concat(products, list(row.materials).map(normalize));
      return { row: row, code: codeDigits(row.code), title: normalize(row.title), products: products, fields: fields, text: fields.join(' | ') };
    });
  }
  function includesToken(text, token) {
    if (/[\u3400-\u9fff]/.test(token)) return text.indexOf(token) !== -1;
    return (' ' + text + ' ').indexOf(' ' + token + ' ') !== -1;
  }
  function scoreEntry(entry, query, rule, prefix) {
    if (!query) return 1;
    var code = codeQuery(query);
    if (code) return entry.code.indexOf(code) === 0 ? 200 + code.length : 0;
    var words = productTokens(query);
    if (!words.length) return 1;
    var ruleWords = rule ? tokens(rule.term) : [];
    var explicitMaterials = words.filter(function (word) { return ['wood', 'metal', 'plastic', 'bamboo', 'rattan', 'rubber', 'spring', 'textile'].indexOf(word) !== -1; });
    if (!explicitMaterials.every(function (material) { return materialMatches(entry.row, material); })) return 0;
    if (!words.every(function (word, i) { return ruleWords.indexOf(word) !== -1 || entry.fields.some(function (field) { return includesToken(field, word) || (prefix && i === words.length - 1 && field.split(' ').some(function (token) { return token.indexOf(word) === 0; })); }); })) return 0;
    var phrase = words.join(' ');
    var exact = entry.products.some(function (product) { return tokens(product).join(' ') === phrase; });
    var productPhrase = entry.products.some(function (product) { return (' ' + product + ' ').indexOf(' ' + phrase + ' ') !== -1; });
    return (exact ? 100 : productPhrase ? 70 : rule ? 60 : 35) + (entry.title.indexOf(phrase) !== -1 ? 15 : 0) + words.length;
  }
  function matchRule(query, entries, exclusions) {
    var normalized = normalize(query);
    var matches = [];
    list(entries).forEach(function (entry) {
      list(entry.terms).forEach(function (term) {
        var phrase = normalize(term);
        var isChinese = /[\u3400-\u9fff]/.test(phrase);
        var exact = normalized === phrase;
        var found = isChinese ? normalized.indexOf(phrase) !== -1 : (' ' + normalized + ' ').indexOf(' ' + phrase + ' ') !== -1;
        var exception = list(entry.exceptionPhrases).some(function (exception) { return (' ' + normalized + ' ').indexOf(' ' + normalize(exception) + ' ') !== -1; });
        var modeMatches = entry.matchMode === 'exact-query' ? exact : true;
        if (exclusions && !entry.matchMode && ['light', 'mirror', 'mirrors'].indexOf(phrase) !== -1) modeMatches = exact;
        if (exclusions && !entry.matchMode && ['door', 'doors'].indexOf(phrase) !== -1 && /\b(cabinet|wardrobe|cupboard|furniture)\b/.test(normalized)) modeMatches = false;
        if (found && modeMatches && !exception) matches.push({ entry: entry, term: term, length: phrase.length });
      });
    });
    return matches.sort(function (a, b) { return b.length - a.length; })[0] || null;
  }
  function resolveQuery(query, guidance) {
    var excluded = matchRule(query, guidance && guidance.excludedOrOutOfScope, true);
    if (excluded) return { excluded: true, rule: excluded };
    return { excluded: false, rule: matchRule(query, guidance && guidance.ambiguousQueries, false) };
  }
  function isPartsQuery(query, index) {
    var normalized = tokens(query).join(' ');
    if (/\b(part|component|replacement)\b/.test(normalized) || /配件|零件|部件/.test(normalized)) return true;
    return index.some(function (entry) {
      return entry.row.categoryKey === 'parts' && list(entry.row.aliases).some(function (alias) {
        var phrase = tokens(alias).join(' ');
        return phrase && (' ' + normalized + ' ').indexOf(' ' + phrase + ' ') !== -1;
      });
    });
  }
  function search(indexOrRows, state, guidance) {
    var index = indexOrRows.length && indexOrRows[0].row ? indexOrRows : buildIndex(indexOrRows);
    var current = state || {};
    var query = String(current.q || '').trim().slice(0, 180);
    var resolved = resolveQuery(query, guidance);
    if (resolved.excluded) return [];
    var rule = resolved.rule;
    var partsQuery = isPartsQuery(query, index);
    if (partsQuery && rule && !tokens(rule.term).includes('part') && !/配件|零件|部件|柜门/.test(rule.term)) rule = null;
    var candidates = rule && Array.isArray(rule.entry.candidateCodes) ? new Set(rule.entry.candidateCodes.map(codeDigits)) : null;
    var queryTokens = productTokens(query);
    var last = queryTokens[queryTokens.length - 1] || '';
    var prefix = /^[a-z]{2,}$/.test(last) && !index.some(function (entry) { return entry.fields.some(function (field) { return includesToken(field, last); }); });
    return index.filter(function (entry) {
      if (partsQuery && !categoryMatches(entry.row, 'parts')) return false;
      if (query && !partsQuery && !codeQuery(query) && current.category !== 'parts' && entry.row.categoryKey === 'parts') return false;
      return !candidates || candidates.has(entry.code);
    }).map(function (entry) { return { row: entry.row, score: scoreEntry(entry, query, rule, prefix) }; })
      .filter(function (result) { return result.score > 0 && categoryMatches(result.row, current.category) && materialMatches(result.row, current.material); })
      .sort(function (a, b) { return b.score - a.score || priority(a.row) - priority(b.row) || codeDigits(a.row.code).localeCompare(codeDigits(b.row.code)); })
      .map(function (result) { return result.row; });
  }
  function options(rows, meta, key) {
    var labels = meta && meta[key === 'categories' ? 'categoryLabels' : 'materialLabels'];
    if (labels && typeof labels === 'object') {
      var result = Object.keys(labels).map(function (value) { return { value: value, label: String(labels[value]) }; });
      if (key === 'categories') result = result.concat([{ value: 'tables', label: 'Tables & desks' }, { value: 'storage', label: 'Cabinets & storage' }, { value: 'beds', label: 'Beds & sofa beds' }, { value: 'outdoor', label: 'Outdoor furniture' }].filter(function (option) { return rows.some(function (row) { return categoryMatches(row, option.value); }); }));
      return result;
    }
    var supplied = meta && meta[key];
    if (Array.isArray(supplied) && supplied.length) return supplied.map(function (item) { return { value: valueOf(item), label: labelOf(item) }; }).filter(function (item) { return item.value; });
    if (supplied && typeof supplied === 'object') return Object.keys(supplied).map(function (key) { return { value: key, label: labelOf(supplied[key]) }; });
    var field = key === 'categories' ? 'categoryKey' : 'materials';
    return Array.from(new Set(rows.flatMap(function (row) { return list(row[field]); }))).filter(Boolean).map(function (value) { return { value: String(value), label: label(value) }; });
  }
  function categoryLabel(row, meta) {
    var category = row.categoryKey || list(row.category)[0] || '';
    var match = options([row], meta, 'categories').find(function (item) { return item.value === category; });
    return row.categoryLabel || (match ? match.label : label(category));
  }
  function renderRow(row, meta) {
    var e = escapeHtml;
    var code = formatCode(row.code);
    var digits = codeDigits(row.code);
    var source = safeUrl(row.sourceUrl);
    var examples = list(row.products).slice(0, 4).join(' · ');
    var official = list(row.officialDescription).join(' — ');
    var sourceLabel = row.sourceName || row.sourceTitle || 'View official classification';
    var details = '<p><strong>Official description</strong><br>' + e(official) + '</p>';
    if (row.material) details += '<p><strong>Material / construction</strong><br>' + e(row.material) + '</p>';
    if (row.note) details += '<p>' + e(row.note) + '</p>';
    if (source) details += '<a href="' + e(source) + '" target="_blank" rel="noopener noreferrer">' + e(sourceLabel) + ' <span aria-hidden="true">↗</span><span class="sf-hs__sr-only"> (opens in a new tab)</span></a>';
    return '<article class="sf-hs__result" id="hs-' + e(digits) + '" data-code="' + e(digits) + '" aria-labelledby="hs-title-' + e(digits) + '">' +
      '<div class="sf-hs__result-code-cell"><p class="sf-hs__result-code"><a href="#hs-' + e(digits) + '" aria-label="Link to HS code ' + e(code) + '">' + e(code) + '</a></p>' +
      '<button type="button" class="sf-hs__copy" data-hs-copy="' + e(digits) + '" aria-label="Copy HS code ' + e(code) + '"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"></rect><path d="M13 7V3H3v10h4"></path></svg><span>Copy code</span></button></div>' +
      '<div class="sf-hs__result-content"><p class="sf-hs__result-category">' + e(categoryLabel(row, meta)) + '</p><h3 id="hs-title-' + e(digits) + '">' + e(row.title) + '</h3>' +
      (examples ? '<p class="sf-hs__result-products">' + e(examples) + '</p>' : '') +
      (row.condition ? '<p class="sf-hs__result-condition"><strong>Choose when:</strong> ' + e(row.condition) + '</p>' : '') +
      '<details class="sf-hs__details"><summary>Classification notes &amp; official source</summary><div class="sf-hs__details-body">' + details + '</div></details></div></article>';
  }
  function renderRows(rows, meta) { return rows.map(function (row) { return renderRow(row, meta); }).join('\n'); }
  function parseState(searchString, categoryOptions, materialOptions) {
    var params = new URLSearchParams(searchString);
    var q = (params.get('q') || '').trim().slice(0, 180);
    var category = params.get('category') || '';
    var material = params.get('material') || '';
    return { q: q, category: categoryOptions.some(function (item) { return item.value === category; }) ? category : '', material: materialOptions.some(function (item) { return item.value === material; }) ? material : '' };
  }
  function stateUrl(href, state) {
    var url = new URL(href);
    ['q', 'category', 'material'].forEach(function (key) { if (state[key]) url.searchParams.set(key, state[key]); else url.searchParams.delete(key); });
    return url.pathname + url.search + url.hash;
  }
  function guidanceFor(query, data, count) {
    var normalized = normalize(query);
    if (!normalized) return [];
    var resolved = resolveQuery(query, data);
    if (resolved.rule) return [{ title: resolved.excluded ? 'Outside this furniture table.' : 'Check the product details.', message: resolved.rule.entry.message || '' }];
    var entries = Array.isArray(data) ? data : [].concat(list(data && data.rules), list(data && data.guidance), list(data && data.ambiguities), list(data && data.exclusions));
    var matched = entries.filter(function (entry) {
      return list(entry.terms || entry.queries || entry.triggers || entry.keywords).some(function (term) {
        var normalizedTerm = normalize(term);
        return /[\u3400-\u9fff]/.test(normalizedTerm) ? normalized.indexOf(normalizedTerm) !== -1 : (' ' + normalized + ' ').indexOf(' ' + normalizedTerm + ' ') !== -1;
      });
    }).map(function (entry) { return { title: entry.title || '', message: entry.message || entry.text || entry.note || '' }; }).filter(function (entry) { return entry.message; });
    if (!matched.length && codeQuery(query).length > 6) matched.push({ title: 'Looking up a national tariff code?', message: 'This table uses international six-digit HS codes. Search the first six digits, then confirm the full national tariff line in the destination country.' });
    if (!matched.length && count > 1) matched.push({ title: 'More than one code may fit.', message: 'Compare the product construction and selection conditions below. Add a material or function to narrow your search.' });
    return matched.slice(0, 3);
  }
  function init() {
    var root = document.getElementById('sf-hs-finder');
    if (!root || root.dataset.initialized === 'true') return;
    var data, guidance;
    try {
      data = JSON.parse(document.getElementById('sf-hs-data').textContent);
      guidance = JSON.parse(document.getElementById('sf-hs-guidance-data').textContent);
      if (!data || !Array.isArray(data.rows) || !data.rows.length || data.rows.some(function (row) { return !/^\d{6}$/.test(codeDigits(row.code)) || !row.title; })) throw new Error('Invalid reference data');
    } catch (_) {
      var error = document.getElementById('sf-hs-error');
      if (error) error.hidden = false;
      return;
    }
    root.dataset.initialized = 'true';
    var rows = data.rows;
    var meta = data.meta || {};
    var index = buildIndex(rows);
    var categoryOptions = options(rows, meta, 'categories');
    var materialOptions = options(rows, meta, 'materials');
    var state = parseState(window.location.search, categoryOptions, materialOptions);
    var $ = function (id) { return document.getElementById(id); };
    var input = $('sf-hs-query');
    var material = $('sf-hs-material');
    var mobileCategory = $('sf-hs-category-select');
    var resultList = $('sf-hs-results');
    var status = $('sf-hs-result-status');
    var categories = $('sf-hs-categories');
    var guidanceEl = $('sf-hs-guidance');
    var empty = $('sf-hs-empty');
    var form = $('sf-hs-search-form');
    var toastTimer;
    var typingTimer;
    var announcementTimer;
    var previousCount = null;
    var copyTimers = new WeakMap();
    var composing = false;
    // Progressive UI added on top of the shared renderer: row markup from renderRow() is never changed.
    var csvLink = root.querySelector('.sf-hs__download');
    var activeBar = document.createElement('div'); activeBar.className = 'sf-hs__active'; activeBar.setAttribute('aria-label', 'Active filters'); activeBar.hidden = true;
    guidanceEl.parentNode.insertBefore(activeBar, guidanceEl);
    var listEnd = document.createElement('div'); listEnd.className = 'sf-hs__list-end'; listEnd.hidden = true;
    resultList.parentNode.insertBefore(listEnd, resultList.nextSibling);
    var kbd = document.createElement('kbd'); kbd.className = 'sf-hs__kbd'; kbd.setAttribute('aria-hidden', 'true'); kbd.textContent = '/';
    input.parentNode.insertBefore(kbd, $('sf-hs-clear'));
    var groupOf = {};
    rows.forEach(function (row) { groupOf[codeDigits(row.code)] = String(row.categoryKey || list(row.category)[0] || ''); });
    function optionLabel(items, value) { var match = items.filter(function (item) { return item.value === value; })[0]; return match ? match.label : value; }
    function highlight(query) {
      var words = Array.from(new Set(clean(query).split(' '))).filter(function (word) { return word.length >= 3 && !/^\d+$/.test(word) && !/^(amp|quot|apos)$/.test(word); });
      if (!words.length) return;
      var pattern = new RegExp('(' + words.map(function (word) { return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
      resultList.querySelectorAll('h3, .sf-hs__result-products').forEach(function (el) {
        var text = el.textContent;
        if (!pattern.test(text)) return;
        pattern.lastIndex = 0;
        el.innerHTML = escapeHtml(text).replace(pattern, '<mark class="sf-hs__mark">$1</mark>');
      });
    }
    // HS groups come from the dataset labels; the remaining options are product shortcuts.
    var groupKeys = Object.keys(meta.categoryLabels || {});
    var categoryGroups = [
      { label: 'By HS group', options: categoryOptions.filter(function (option) { return groupKeys.indexOf(option.value) !== -1; }) },
      { label: 'By product type', options: categoryOptions.filter(function (option) { return groupKeys.indexOf(option.value) === -1; }) }
    ].filter(function (group) { return group.options.length; });
    if (categoryGroups.length < 2) categoryGroups = [{ label: '', options: categoryOptions }];
    function categoryButton(option) {
      var count = rows.filter(function (row) { return categoryMatches(row, option.value); }).length;
      return '<button type="button" class="sf-hs__category" data-hs-category="' + escapeHtml(option.value) + '" aria-pressed="false">' + escapeHtml(option.label) + '<span aria-hidden="true">' + count + '</span></button>';
    }
    function categoryOption(option) { return '<option value="' + escapeHtml(option.value) + '">' + escapeHtml(option.label) + '</option>'; }
    categories.innerHTML = categoryButton({ value: '', label: 'All categories' }) + categoryGroups.map(function (group) {
      return (group.label ? '<p class="sf-hs__category-group">' + escapeHtml(group.label) + '</p>' : '') + group.options.map(categoryButton).join('');
    }).join('');
    material.innerHTML = '<option value="">All materials</option>' + materialOptions.map(categoryOption).join('');
    mobileCategory.innerHTML = '<option value="">All categories</option>' + categoryGroups.map(function (group) {
      var items = group.options.map(categoryOption).join('');
      return group.label ? '<optgroup label="' + escapeHtml(group.label) + '">' + items + '</optgroup>' : items;
    }).join('');
    root.classList.add('is-ready');
    function syncUrl(push) {
      var next = stateUrl(window.location.href, state);
      if (next === window.location.pathname + window.location.search + window.location.hash) return;
      try { window.history[push ? 'pushState' : 'replaceState']({ sfhs: true }, '', next); } catch (_) { /* Search still works with restricted History access. */ }
    }
    function render(updateUrl, immediateAnnouncement) {
      var results = search(index, state, guidance);
      resultList.innerHTML = renderRows(results, meta);
      resultList.querySelectorAll('.sf-hs__result').forEach(function (el) { el.dataset.group = groupOf[el.dataset.code] || ''; });
      highlight(state.q);
      $('sf-hs-search-preview').hidden = !state.q.trim();
      $('sf-hs-preview-text').textContent = results.length === 0 ? 'No matching code' : results.length <= 2 ? 'Candidate ' + (results.length === 1 ? 'code: ' : 'codes: ') + results.map(function (row) { return formatCode(row.code); }).join(' · ') : results.length + ' candidate codes — compare conditions';
      if (results.length && results.length <= 2) $('sf-hs-preview-text').innerHTML = 'Candidate ' + (results.length === 1 ? 'code: ' : 'codes: ') + results.map(function (row) { var digits = codeDigits(row.code); return '<a href="#hs-' + escapeHtml(digits) + '">' + escapeHtml(formatCode(row.code)) + '</a>'; }).join(' · ');
      resultList.hidden = !results.length;
      root.querySelector('.sf-hs__column-head').hidden = !results.length;
      empty.hidden = !!results.length;
      input.value = state.q;
      material.value = state.material;
      mobileCategory.value = state.category;
      $('sf-hs-clear').hidden = !state.q;
      $('sf-hs-reset').hidden = !state.q && !state.category && !state.material;
      categories.querySelectorAll('button').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.hsCategory === state.category)); });
      root.querySelectorAll('[data-hs-pick]').forEach(function (pick) {
        var selected = normalize(state.q) === normalize(pick.dataset.hsQuery);
        pick.dataset.active = String(selected);
        if (selected) pick.setAttribute('aria-current', 'true');
        else pick.removeAttribute('aria-current');
      });
      var active = !!(state.q || state.category || state.material);
      $('sf-hs-results-title').textContent = active ? 'Matching HS codes' : 'Furniture HS codes';
      var chips = [];
      if (state.q) chips.push({ key: 'q', label: '“' + state.q + '”' });
      if (state.category) chips.push({ key: 'category', label: optionLabel(categoryOptions, state.category) });
      if (state.material) chips.push({ key: 'material', label: optionLabel(materialOptions, state.material) });
      activeBar.innerHTML = chips.map(function (chip) { return '<button type="button" class="sf-hs__chip" data-hs-remove="' + chip.key + '"><span>' + escapeHtml(chip.label) + '</span><span aria-hidden="true">×</span><span class="sf-hs__sr-only">, remove</span></button>'; }).join('') + (chips.length > 1 ? '<button type="button" class="sf-hs__chip sf-hs__chip--all" data-hs-reset>Clear all</button>' : '');
      activeBar.hidden = !chips.length;
      listEnd.hidden = results.length < 8;
      listEnd.innerHTML = '<p>' + (active ? 'End of the ' + results.length + ' matching codes.' : 'That’s all ' + results.length + ' codes.') + '</p><button type="button" data-hs-back>New search <span aria-hidden="true">↑</span></button>' + (csvLink ? '<a href="' + escapeHtml(csvLink.getAttribute('href')) + '" download>Download CSV</a>' : '');
      kbd.hidden = !!state.q;
      var summary = results.length + (results.length === 1 ? ' code' : ' codes') + (state.q ? ' for “' + state.q + '”' : active ? ' match your filters' : ' across seating, furniture & bedding');
      clearTimeout(announcementTimer);
      if (immediateAnnouncement || previousCount === null) status.textContent = summary;
      else announcementTimer = setTimeout(function () { status.textContent = summary; }, 220);
      previousCount = results.length;
      var tips = guidanceFor(state.q, guidance, results.length);
      guidanceEl.innerHTML = tips.map(function (tip) { return '<p>' + (tip.title ? '<strong>' + escapeHtml(tip.title) + '</strong> ' : '') + escapeHtml(tip.message) + '</p>'; }).join('');
      guidanceEl.hidden = !tips.length;
      $('sf-hs-empty-message').textContent = state.category || state.material ? 'Your search and filters do not match a code. Clear a filter, or try a simpler product name.' : 'Try a simpler product name, a material, or a six-digit code.';
      if (updateUrl) syncUrl(updateUrl === 'push');
    }
    function reset() { clearTimeout(typingTimer); state = { q: '', category: '', material: '' }; render('push', true); input.focus(); }
    function viewResults() {
      var heading = $('sf-hs-results-title');
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
    function submitSearch() { clearTimeout(typingTimer); state.q = input.value.trim().slice(0, 180); render('push', true); viewResults(); }
    function updateInput() { state.q = input.value.slice(0, 180); clearTimeout(typingTimer); if (!composing) typingTimer = setTimeout(function () { render('replace'); }, 90); }
    input.addEventListener('input', updateInput);
    input.addEventListener('compositionstart', function () { composing = true; clearTimeout(typingTimer); });
    input.addEventListener('compositionend', function () { composing = false; updateInput(); });
    input.addEventListener('keydown', function (event) { if (!composing && event.key === 'Escape' && state.q) { state.q = ''; render('replace', true); } });
    form.addEventListener('submit', function (event) { event.preventDefault(); if (composing) return; submitSearch(); });
    document.addEventListener('keydown', function (event) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      var target = event.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault(); input.focus(); input.select();
    });
    $('sf-hs-view-results').addEventListener('click', function () { if (!composing) submitSearch(); });
    $('sf-hs-clear').addEventListener('click', function () { clearTimeout(typingTimer); state.q = ''; render('push', true); input.focus(); });
    $('sf-hs-reset').addEventListener('click', reset);
    material.addEventListener('change', function () { state.material = material.value; render('push', true); });
    mobileCategory.addEventListener('change', function () { state.category = mobileCategory.value; render('push', true); });
    categories.addEventListener('click', function (event) { var button = event.target.closest('[data-hs-category]'); if (!button) return; state.category = button.dataset.hsCategory; render('push', true); });
    root.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-hs-query]');
      if (chip) {
        if (chip.tagName === 'A' && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0)) return;
        event.preventDefault();
        clearTimeout(typingTimer);
        state = { q: chip.dataset.hsQuery, category: '', material: '' };
        render('push', true);
        viewResults();
        return;
      }
      var remove = event.target.closest('[data-hs-remove]');
      if (remove) { clearTimeout(typingTimer); state[remove.dataset.hsRemove] = ''; render('push', true); return; }
      if (event.target.closest('[data-hs-back]')) { form.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); input.focus({ preventScroll: true }); input.select(); return; }
      if (event.target.closest('[data-hs-reset]')) { reset(); return; }
      var copy = event.target.closest('[data-hs-copy]');
      if (copy) copyCode(copy);
    });
    function announceCopy(message) {
      var toast = $('sf-hs-copy-status');
      clearTimeout(toastTimer);
      toast.textContent = message;
      toast.classList.add('is-visible');
      toastTimer = setTimeout(function () { toast.classList.remove('is-visible'); }, 4000);
    }
    async function copyCode(button) {
      var code = button.dataset.hsCopy;
      var copied = false;
      try {
        if (window.navigator.clipboard && window.isSecureContext) { await window.navigator.clipboard.writeText(code); copied = true; }
        else {
          var field = document.createElement('textarea');
          field.value = code;
          field.setAttribute('readonly', '');
          field.style.cssText = 'position:fixed;left:-9999px;top:0;font-size:16px';
          document.body.appendChild(field);
          field.select();
          try { copied = document.execCommand('copy'); } finally { field.remove(); button.focus({ preventScroll: true }); }
        }
      } catch (_) { copied = false; }
      if (!copied) { announceCopy('Copy unavailable. Select the code ' + formatCode(code) + ' and copy it manually.'); return; }
      clearTimeout(copyTimers.get(button));
      button.classList.add('is-copied');
      button.querySelector('span').textContent = 'Copied';
      button.setAttribute('aria-label', 'Copied HS code ' + formatCode(code));
      announceCopy('HS code ' + code + ' copied');
      copyTimers.set(button, setTimeout(function () { if (!button.isConnected) return; button.classList.remove('is-copied'); button.querySelector('span').textContent = 'Copy code'; button.setAttribute('aria-label', 'Copy HS code ' + formatCode(code)); }, 2300));
    }
    window.addEventListener('popstate', function () { clearTimeout(typingTimer); state = parseState(window.location.search, categoryOptions, materialOptions); render(false, true); });
    render(false, true);
  }
  return { normalize: normalize, codeDigits: codeDigits, formatCode: formatCode, escapeHtml: escapeHtml, safeUrl: safeUrl, buildIndex: buildIndex, search: search, options: options, categoryMatches: categoryMatches, materialMatches: materialMatches, renderRow: renderRow, renderRows: renderRows, parseState: parseState, stateUrl: stateUrl, guidanceFor: guidanceFor, resolveQuery: resolveQuery, init: init };
});
