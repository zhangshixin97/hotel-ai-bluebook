// Run with: node --test tests/reader.test.cjs
// Network/route regressions use a small DOM harness; visual layout still needs a browser.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/manifest-lite.json'), 'utf8'));
const searchIndex = JSON.parse(fs.readFileSync(path.join(root, 'data/search-index.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'assets/reader.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness({ corruptStorage = false } = {}) {
  const elements = {}, events = {}, requests = [], scrolls = [];
  function element(selector) {
    return elements[selector] ||= {
      hidden: true, innerHTML: '', textContent: '', value: '', style: {}, listeners: {}, attributes: {},
      querySelectorAll: () => [], contains: () => false,
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, handler) { this.listeners[name] = handler; },
      focus() {}, scrollIntoView() { scrolls.push(selector); },
    };
  }
  const context = {
    document: {
      documentElement: { scrollHeight: 1000, clientHeight: 800, scrollTop: 0 },
      querySelector: element, querySelectorAll: () => [],
      getElementById: id => ['manifest-json', 'articles-json'].includes(id) ? null : element('#' + id),
      addEventListener() {}, title: '',
    },
    window: { addEventListener: (name, handler) => { events[name] = handler; }, scrollTo() {} },
    location: { hash: '#/', href: 'https://example.test/#/' },
    localStorage: { getItem: () => corruptStorage ? '{bad json' : null, setItem() {} },
    AbortController,
    setTimeout: (callback, ms) => { const timer = setTimeout(callback, ms); timer.unref(); return timer; },
    clearTimeout,
    navigator: { clipboard: { writeText: async () => {} } },
    IntersectionObserver: function () { this.disconnect = () => {}; this.observe = () => {}; },
    fetch: async (url, options) => {
      if (url === 'data/manifest-lite.json') return { ok: true, json: async () => manifest };
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    },
  };
  vm.createContext(context); vm.runInContext(source, context);
  return {
    context, element, requests, scrolls,
    navigate(hash) { context.location.hash = hash; events.hashchange(); },
    respond(url, content, ok = true) {
      const request = requests.findLast(r => r.url === url && !r.done);
      assert.ok(request, 'pending request: ' + url); request.done = true;
      request.resolve({ ok, status: ok ? 200 : 404, text: async () => content, json: async () => content });
    },
  };
}

test('slow earlier article cannot replace the current article', async () => {
  const h = harness(); await tick();
  h.navigate('#/p/10'); h.navigate('#/p/11');
  h.respond('articles/11.html', '<p>交班正文</p>'); await tick();
  h.respond('articles/10.html', '<p>晨报正文</p>'); await tick();
  assert.equal(h.element('#artTitle').textContent, manifest.articles.find(a => a.id === '11').title);
  assert.equal(h.element('#artBody').innerHTML, '<p>交班正文</p>');
});

test('leaving an in-flight article keeps the cover active', async () => {
  const h = harness(); await tick(); h.navigate('#/p/10'); h.navigate('#/');
  h.respond('articles/10.html', '<p>stale</p>'); await tick();
  assert.equal(h.element('#coverView').hidden, false);
  assert.equal(h.element('#articleView').hidden, true);
  assert.ok(!h.element('#artBody').innerHTML.includes('stale'));
});

test('HTTP failure is not cached and retry can recover', async () => {
  const h = harness(); await tick(); h.navigate('#/p/09');
  h.respond('articles/09.html', '<h1>404</h1>', false); await tick();
  assert.ok(h.element('#artBody').innerHTML.includes('重新加载'));
  assert.ok(!h.element('#artBody').innerHTML.includes('<h1>404'));
  h.element('#retryArticle').onclick();
  h.respond('articles/09.html', '<p>recovered</p>'); await tick();
  assert.equal(h.element('#artBody').innerHTML, '<p>recovered</p>');
});

test('concurrent requests for one article share a single fetch', async () => {
  const h = harness(); await tick(); h.navigate('#/p/10'); h.navigate('#/p/10#s4');
  assert.equal(h.requests.filter(r => r.url === 'articles/10.html').length, 1);
  h.respond('articles/10.html', '<p>ready</p>'); await tick();
  assert.ok(h.scrolls.includes('#s4'));
  assert.ok(!h.scrolls.includes('#4'));
});

test('fullscreen search index loads only when requested', async () => {
  const h = harness(); await tick(); assert.equal(h.requests.length, 0);
  const opened = h.element('#searchBtn').onclick();
  h.element('#searchInput').value = '空调不够凉';
  h.respond('data/search-index.json', searchIndex); await opened;
  assert.ok(h.element('#searchList').innerHTML.includes('data-id="04"'));
  h.element('#searchClose').onclick();
  await h.element('#searchBtn').onclick();
  assert.equal(h.requests.filter(r => r.url === 'data/search-index.json').length, 1);
});

test('corrupt storage does not break initialization; pet hides the FAB', async () => {
  const h = harness({ corruptStorage: true }); await tick();
  assert.equal(h.element('#siteStatus').hidden, true);
  h.navigate('#/p/10'); h.respond('articles/10.html', '<p>ready</p>'); await tick();
  h.element('#petBtn').onclick(); assert.equal(h.element('#fab').hidden, true);
  h.element('#petPanelClose').onclick(); assert.equal(h.element('#fab').hidden, false);
  const before = h.context.location.hash;
  h.element('.skip-link').onclick({ preventDefault() {} });
  assert.equal(h.context.location.hash, before); assert.ok(h.scrolls.includes('#main'));
});

test('all 37 article files and lazy search entries remain available', () => {
  assert.equal(manifest.articles.length, 37);
  for (const article of manifest.articles) {
    assert.ok(fs.existsSync(path.join(root, 'articles', article.id + '.html')));
    assert.equal(typeof searchIndex[article.id], 'string');
    assert.equal(article.text, undefined);
  }
});

 test('legacy cached readers retain their original manifest with search text', () => {
  const legacy = JSON.parse(fs.readFileSync(path.join(root, 'data/manifest.json'), 'utf8'));
  assert.equal(legacy.articles.length, 37);
  assert.ok(legacy.articles.every(article => typeof article.text === 'string'));
  const oldScript = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  assert.ok(oldScript.includes('data/manifest.json'));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('assets/reader.js'));
  assert.ok(source.includes('data/manifest-lite.json'));
});
