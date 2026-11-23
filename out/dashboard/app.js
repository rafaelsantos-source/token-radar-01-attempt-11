// Token Radar dashboard, variant 11 (multi-signal ensemble). Plain JS, no network:
// it reads window.RADAR (written beside dashboard/ by main.ts) and renders the board,
// the detail view, the live-token view, the category comps and the model lab.
//
// The lab re-ranks from the three sub-model values each row carries (M1 comps, M2 growth,
// M3 composite): the reader can move the weights and watch the board move, which is the
// check that the ranking is a model's claim and not a hardcoded list. Default weights
// reproduce board.json exactly.

(function () {
  'use strict';
  var DATA = window.RADAR;
  var root = document.getElementById('board');
  if (!DATA || !root) return;

  var DEFAULT_W = { comps: DATA.ensemble.comps, growth: DATA.ensemble.growth, composite: DATA.ensemble.composite };
  var state = {
    q: '', category: 'all', chain: 'all', sort: 'value', dir: -1,
    tab: 'pre-token', selected: null,
    lab: { comps: DEFAULT_W.comps, growth: DEFAULT_W.growth, composite: DEFAULT_W.composite }
  };

  // ---------- helpers ----------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'text') node.textContent = v;
        else if (k === 'class') node.className = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else if (k === 'html') node.innerHTML = v;
        else node.setAttribute(k, v);
      }
    }
    var list = children === undefined ? [] : (Array.isArray(children) ? children : [children]);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }
  function fmtUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }
  function clamp01(n) { return Math.max(0, Math.min(1, n)); }
  function labActive() {
    return Math.abs(state.lab.comps - DEFAULT_W.comps) > 0.001 ||
      Math.abs(state.lab.growth - DEFAULT_W.growth) > 0.001 ||
      Math.abs(state.lab.composite - DEFAULT_W.composite) > 0.001;
  }
  function labValue(r) {
    var w = state.lab, tot = w.comps + w.growth + w.composite;
    if (tot <= 0) return r.implied_value_usd;
    var a = w.comps / tot, b = w.growth / tot, c = w.composite / tot;
    return Math.exp(a * Math.log(Math.max(1, r.m1_comps)) + b * Math.log(Math.max(1, r.m2_growth)) + c * Math.log(Math.max(1, r.m3_composite)));
  }
  function displayRank(r) { return labActive() ? r._labRank : r.rank; }

  // ---------- hash ----------
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('p')) { state.selected = params.get('p'); state._fromHash = true; }
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort')) state.sort = params.get('sort');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.sort !== 'value') params.set('sort', state.sort);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // ---------- rows ----------
  function baseRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function labRanked(list) {
    if (!labActive()) return list;
    var ranked = list.slice().sort(function (a, b) { return labValue(b) - labValue(a) || a.slug.localeCompare(b.slug); });
    ranked.forEach(function (r, i) { r._labRank = i + 1; });
    return ranked;
  }
  function sortedRows(list) {
    var ranked = labRanked(list);
    var key = state.sort;
    return ranked.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'confidence') { av = a.confidence; bv = b.confidence; }
      else { av = labActive() ? labValue(a) : a.implied_value_usd; bv = labActive() ? labValue(b) : b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  var MAXM = { m1: 1, m2: 1, m3: 1 };
  DATA.rows.forEach(function (r) {
    MAXM.m1 = Math.max(MAXM.m1, r.m1_comps); MAXM.m2 = Math.max(MAXM.m2, r.m2_growth); MAXM.m3 = Math.max(MAXM.m3, r.m3_composite);
  });

  // ---------- sections ----------
  function header() {
    return el('header', { class: 'top' }, [
      el('div', { class: 'brand' }, [el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })]),
      el('div', { class: 'top-meta' }, [
        el('span', { class: 'pill' }, [el('span', { class: 'dot cyan' }), 'Snapshot ', el('b', { text: DATA.as_of })]),
        el('span', { class: 'pill' }, [el('span', { class: 'dot violet' }), el('b', { text: DATA.model_version }), ' ensemble']),
        el('span', { class: 'pill' }, [el('span', { class: 'dot green' }), 'Global multiple ', el('b', { text: DATA.global_multiple + 'x' })])
      ])
    ]);
  }
  function lede() {
    return el('section', { class: 'lede' }, [
      el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by what a launch would be worth' }),
      el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, held to the same bar — no exchange, no bridge or staking wrapper, no versioned pool. Implied value is a model, not a promise: three sub-models vote, and the board shows how much they agree.' }),
      el('div', { class: 'facts' }, [
        el('div', { class: 'fact' }, [el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every slug on the list is ranked' })]),
        el('div', { class: 'fact' }, [el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: 'ranked by ensemble implied value' })]),
        el('div', { class: 'fact' }, [el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) }), el('small', { text: 'the radar exists to find these' })]),
        el('div', { class: 'fact' }, [el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'shown at market value, never ranked' })])
      ])
    ]);
  }
  function modelCards() {
    return el('section', { class: 'model-grid' }, [
      el('div', { class: 'model-card' }, [
        el('h3', null, ['M1 · Category comps', el('span', { class: 'w', text: 'weight 45%' })]),
        el('p', { text: 'The market’s own multiple: the median market-cap-to-TVL of live-token protocols in the same category, from this snapshot. Dexs trade near 0.34x TVL; liquid staking near 0.04x.' }),
        el('div', { class: 'formula' }, ['TVL × category median — ', el('b', { text: '14 categories' }), ' have enough live comps'])
      ]),
      el('div', { class: 'model-card' }, [
        el('h3', null, ['M2 · Growth', el('span', { class: 'w', text: 'weight 25%' })]),
        el('p', { text: 'TVL times the global median multiple, adjusted by the 7-day change: rises count in full, declines at half rate, clamped to −40% / +80% so one wild week cannot decide a rank.' }),
        el('div', { class: 'formula' }, ['TVL × ', el('b', { text: DATA.global_multiple + 'x' }), ' × (1 + clamped 7d change)'])
      ]),
      el('div', { class: 'model-card' }, [
        el('h3', null, ['M3 · Composite', el('span', { class: 'w', text: 'weight 30%' })]),
        el('p', { text: 'Seasoning, reach, momentum and stability: a hump over age with no token (peaks near 900 days), log chain breadth, tanh-scaled momentum, and a penalty for extreme weekly moves.' }),
        el('div', { class: 'formula' }, ['TVL × ', el('b', { text: DATA.global_multiple + 'x' }), ' × seasoning × reach × momentum × stability'])
      ])
    ]);
  }
  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 12);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      [el('option', { value: 'all', text: 'All categories' })].concat(cats.map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null });
      })));
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      [el('option', { value: 'all', text: 'All chains' })].concat(chains.map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null });
      })));
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' }, [
      el('div', { class: 'field search' }, [el('label', { for: 'q', text: 'Search' }), search]),
      el('div', { class: 'field' }, [el('label', { for: 'category', text: 'Category' }), catSel]),
      el('div', { class: 'field' }, [el('label', { for: 'chain', text: 'Chain' }), chainSel]),
      el('div', { class: 'field' }, [el('span', { class: 'lab', text: 'Token status' }), el('div', { class: 'tabs' }, [pre, live])]),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? baseRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    ]);
  }
  function sortHeader(key, label) {
    return el('th', { scope: 'col' }, el('button', {
      type: 'button',
      onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); }
    }, [label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null]));
  }
  function signalBars(r) {
    return el('span', { class: 'bars', title: 'M1 comps / M2 growth / M3 composite' }, [
      el('i', { class: 'm1', style: 'height:' + Math.max(3, Math.round(18 * Math.log(1 + r.m1_comps) / Math.log(1 + MAXM.m1))) + 'px' }),
      el('i', { class: 'm2', style: 'height:' + Math.max(3, Math.round(18 * Math.log(1 + r.m2_growth) / Math.log(1 + MAXM.m2))) + 'px' }),
      el('i', { class: 'm3', style: 'height:' + Math.max(3, Math.round(18 * Math.log(1 + r.m3_composite) / Math.log(1 + MAXM.m3))) + 'px' })
    ]);
  }
  function openDetail(slug) { state.selected = slug; state._fromHash = false; writeHash(); render(); var d = document.getElementById('detail'); if (d) d.scrollIntoView(); }
  function closeDetail() { state.selected = null; writeHash(); render(); }
  function boardTable() {
    var list = sortedRows(baseRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' }, [
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ]));
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var rankCell = labActive() && r._labRank !== r.rank
        ? el('span', null, [el('span', { class: 'rank-badge', text: String(r._labRank) }), el('span', { class: 'faint', text: ' was #' + r.rank })])
        : el('span', { class: 'rank-badge', text: String(r.rank) });
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        class: r.rank <= 3 ? 'top3' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      }, [
        el('td', { class: 'num' }, rankCell),
        el('td', { class: 'name' }, [el('b', { text: r.name }), el('span', { text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })]),
        el('td', { class: 'num' }, fmtUsd(r.tvl_usd)),
        el('td', { class: 'num ' + growthClass }, growth),
        el('td', { class: 'num hide-m' }, fmtAge(r.age_days)),
        el('td', { class: 'num' }, [el('b', { text: fmtUsd(labActive() ? labValue(r) : r.implied_value_usd) }), el('br'), el('span', { class: 'conf' }, ['agreement ', el('b', { text: Math.round(r.confidence * 100) + '%' })])]),
        el('td', { class: 'hide-m' }, signalBars(r))
      ]);
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null, [
      el('thead', null, el('tr', null, [
        el('th', { scope: 'col' }, '#'),
        sortHeader('name', 'Protocol'),
        sortHeader('tvl', 'TVL'),
        sortHeader('growth', '7d'),
        el('th', { scope: 'col', class: 'hide-m' }, 'Age, no token'),
        sortHeader('value', labActive() ? 'Lab value' : 'Implied value'),
        el('th', { scope: 'col', class: 'hide-m' }, 'Signals M1 M2 M3')
      ])),
      tbody
    ])));
  }
  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r, i) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', { tabindex: '0' }, [
        el('td', { class: 'num' }, el('span', { class: 'rank-badge', text: String(i + 1) })),
        el('td', { class: 'name' }, [el('b', { text: r.name }), el('span', { text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })]),
        el('td', { class: 'num' }, fmtUsd(r.tvl_usd)),
        el('td', { class: 'num' }, r.mcap_usd === null ? 'n/a' : fmtUsd(r.mcap_usd)),
        el('td', { class: 'num' }, r.multiple === null ? 'n/a' : r.multiple.toFixed(2) + 'x'),
        el('td', { class: 'num ' + growthClass }, growth)
      ]));
    });
    return el('div', { class: 'panel' }, [
      el('div', { class: 'table-wrap' }, el('table', null, [
        el('thead', null, el('tr', null, [
          el('th', { scope: 'col' }, '#'), el('th', { scope: 'col' }, 'Protocol'), el('th', { scope: 'col' }, 'TVL'),
          el('th', { scope: 'col' }, 'Market cap'), el('th', { scope: 'col' }, 'mcap / TVL'), el('th', { scope: 'col' }, '7d')
        ])),
        tbody
      ])),
      el('p', { class: 'note', style: 'padding: 0 16px 16px' }, 'These protocols already trade, so the board shows the market’s own value for them. Their multiples are the comps the ensemble reads — they are the reason M1 can price a protocol that has no token yet.')
    ]);
  }
  function detailPanel() {
    if (!state.selected) return null;
    var r = null;
    DATA.rows.forEach(function (row) { if (row.slug === state.selected) r = row; });
    if (!r) return null;
    var maxSub = Math.max(r.m1_comps, r.m2_growth, r.m3_composite);
    function sig(label, value, cls, note) {
      return el('div', { class: 'signal' }, [
        el('span', { text: label }), el('b', { text: fmtUsd(value) }),
        el('span', { class: 'bar' }, el('i', { class: cls, style: 'width:' + Math.round(100 * Math.log(1 + value) / Math.log(1 + maxSub)) + '%' })),
        el('small', { text: note })
      ]);
    }
    var confCls = r.confidence >= 0.85 ? 'green' : r.confidence >= 0.7 ? 'amber' : 'cyan';
    return el('section', { class: 'detail', id: 'detail' }, [
      el('div', { class: 'detail-head' }, [
        el('div', null, [
          el('h2', { text: '#' + r.rank + ' · ' + r.name }),
          el('p', { class: 'muted' }, (r.category || 'Other') + ' · ' + (r.chains || []).join(', ') + ' · tracked since ' + (r.listed_at || 'an unknown date') + ' · records no token')
        ]),
        el('div', { class: 'value' }, [fmtUsd(r.implied_value_usd), el('small', { text: 'ensemble implied value' })]),
        el('button', { class: 'button ghost', type: 'button', text: 'Close', onclick: closeDetail })
      ]),
      el('div', { class: 'detail-grid' }, [
        sig('M1 · Category comps', r.m1_comps, 'cyan', 'TVL × ' + r.comps_multiple + 'x, the ' + (r.category || 'unclassified') + ' median'),
        sig('M2 · Growth', r.m2_growth, 'green', 'TVL × ' + DATA.global_multiple + 'x, 7d ' + (r.change_7d === null ? 'unreported' : fmtPct(r.change_7d))),
        sig('M3 · Composite', r.m3_composite, 'violet', 'seasoning ' + r.seasoning.toFixed(2) + ' × reach ' + r.reach.toFixed(2) + ' × momentum ' + r.momentum.toFixed(2) + ' × stability ' + r.stability.toFixed(2)),
        el('div', { class: 'signal' }, [
          el('span', { text: 'Model agreement' }), el('b', { text: Math.round(r.confidence * 100) + '%' }),
          el('span', { class: 'bar' }, el('i', { class: confCls, style: 'width:' + Math.round(r.confidence * 100) + '%' })),
          el('small', { text: r.confidence >= 0.85 ? 'The three sub-models agree: a firm read.' : r.confidence >= 0.7 ? 'The sub-models mostly agree.' : 'The sub-models disagree: treat the value as wide.' })
        ])
      ]),
      el('h3', { class: 'section-title', text: 'How to farm it' }),
      el('ol', { class: 'steps' }, r.farm_steps.map(function (s, i) {
        return el('li', null, [el('span', { class: 'n', text: String(i + 1) }), el('p', { text: s })]);
      })),
      el('p', { class: 'note' }, 'TVL ' + fmtUsd(r.tvl_usd) + ' · age with no token ' + fmtAge(r.age_days) + ' · ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '. The farm plan is derived from this protocol’s own record — category, chains, TVL, age and momentum — not from a list of names. Never pay to claim an airdrop; a real claim costs gas only.')
    ]);
  }
  function lab() {
    function slider(key, label) {
      var input = el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(state.lab[key] * 100)), 'aria-label': label + ' weight' });
      var val = el('b', { text: Math.round(state.lab[key] * 100) + '%' });
      input.addEventListener('input', function () {
        state.lab[key] = Number(input.value) / 100;
        val.textContent = input.value + '%';
        render();
      });
      return el('div', { class: 'slider' }, [el('label', null, [label, val]), input]);
    }
    var moved = 0;
    if (labActive()) {
      var ranked = labRanked(DATA.rows.slice());
      ranked.forEach(function (r) { if (r._labRank !== r.rank) moved++; });
    }
    return el('section', { class: 'lab' }, [
      el('h2', { text: 'Model lab — re-weight the ensemble' }),
      el('p', { text: 'The board’s ranks come from three sub-models blended geometrically. Move a weight and the board re-ranks from the same sub-model values — nothing is hardcoded. Reset returns to the published weights (45 / 25 / 30).' }),
      el('div', { class: 'sliders' }, [slider('comps', 'M1 · Category comps'), slider('growth', 'M2 · Growth'), slider('composite', 'M3 · Composite')]),
      el('div', { class: 'lab-foot' }, [
        el('button', { class: 'button ghost', type: 'button', text: 'Reset weights', onclick: function () { state.lab = { comps: DEFAULT_W.comps, growth: DEFAULT_W.growth, composite: DEFAULT_W.composite }; render(); } }),
        el('span', { class: 'moved', text: labActive() ? moved + ' of ' + DATA.rows.length + ' rows moved from their published rank' : 'Published weights in use — the table matches board.json.' })
      ])
    ]);
  }
  function compsAndMethod() {
    var rows = DATA.category_comps.slice(0, 8);
    var tbody = el('tbody');
    rows.forEach(function (c) {
      tbody.appendChild(el('tr', null, [
        el('td', null, c.category), el('td', { class: 'num' }, String(c.live_count)), el('td', { class: 'num' }, c.median_multiple.toFixed(3) + 'x')
      ]));
    });
    return el('div', { class: 'two-col' }, [
      el('section', { class: 'card' }, [
        el('h2', { text: 'What the market pays, by category' }),
        el('p', { text: 'Median market-cap-to-TVL of live-token protocols, the multiples M1 reads. A category with fewer than 3 live comps falls back to the global median of ' + DATA.global_multiple + 'x.' }),
        el('div', { class: 'table-wrap' }, el('table', null, [
          el('thead', null, el('tr', null, [el('th', { scope: 'col' }, 'Category'), el('th', { scope: 'col' }, 'Live comps'), el('th', { scope: 'col' }, 'Median multiple')])),
          tbody
        ]))
      ]),
      el('section', { class: 'card' }, [
        el('h2', { text: 'What this board is — and is not' }),
        el('ul', null, [
          el('li', null, [el('b', { text: 'It is a model. ' }), 'Implied value follows from the snapshot’s own figures — TVL, 7-day growth, age with no token, chain breadth, category comps. It does not predict whether or when a token is issued.']),
          el('li', null, [el('b', { text: '“Records no token” is the claim. ' }), 'A protocol on this board may still have a token its DefiLlama record does not carry. The board never says a protocol has no token, only that none is recorded.']),
          el('li', null, [el('b', { text: 'The watchlist is a floor. ' }), 'Every one of its 40 protocols is ranked; 138 more below the floor are added, held to the same exclusion rule. Exchanges, bridges and staking wrappers are not launch candidates.']),
          el('li', null, [el('b', { text: 'Farm plans cost money. ' }), 'Every step states its cost and time. A plan that asks you to pay to claim is a scam; this board never asks that.'])
        ])
      ])
    ]);
  }
  function footer() {
    return el('footer', null, [
      el('p', { text: 'Data: ' + DATA.source }),
      el('p', { text: 'Token Radar · ' + DATA.model_version + ' ensemble · ' + DATA.board_size + ' pre-token protocols ranked · ' + DATA.live.length + ' live-token protocols set aside. Implied values are this entry’s own claim, never a promise of a launch or a price.' })
    ]);
  }

  function render() {
    root.setAttribute('aria-busy', 'false');
    root.textContent = '';
    // A deep-linked detail (#p=slug) renders first, so a capture of the page shows the
    // protocol, not the board's top; a clicked row keeps the detail above the table.
    var detailFirst = state.tab === 'pre-token' && state.selected && state._fromHash;
    var wrap = el('div', { class: 'wrap' }, [
      header(),
      detailFirst ? detailPanel() : null,
      lede(), modelCards(), controls(),
      !detailFirst && state.tab === 'pre-token' ? detailPanel() : null,
      state.tab === 'pre-token' ? boardTable() : liveTable(),
      lab(), compsAndMethod(), footer()
    ]);
    root.appendChild(wrap);
  }

  readHash();
  render();
})();
