/*!
 * RVP Portfolio: renders data/portfolio.json into the Webflow portfolio layout.
 *
 * Webflow attributes (data-cms-layout):
 *   filter-list    wrapper for the filter pills
 *   filter-button  one pill, used as the template (its active class is reused)
 *   cms_list       the card grid
 *   cms_item       one card, used as the template
 *   tag            industry label
 *   status         "Exited" badge (hidden when the company is not exited)
 *   logo           default logo <img>
 *   logo-active    hover logo <img>
 *   name, text     company name and card description
 *   link           "Visit site" link
 *
 * Optional settings on the cms_list element:
 *   data-cms-source     URL of portfolio.json (defaults to the GitHub repo)
 *   data-cms-assets     base URL for logo paths (defaults to jsDelivr)
 *   data-cms-page-size  cards per infinite-load batch (default 9, "0" = all)
 *   data-cms-animate    "false" turns off the card fade-in on filter / load more
 *   data-cms-hover      "false" turns off the built-in logo hover swap
 * Optional on the filter-list element:
 *   data-cms-all-label     label of the first pill (default "All")
 *   data-cms-exited-label  adds an extra pill that shows exited companies
 */
(function () {
  'use strict';
  if (window.RVPPortfolio) { window.RVPPortfolio.init(); return; }

  var REPO = 'deeptechagency/rvp-webflow';
  var DEFAULT_SOURCE = 'https://raw.githubusercontent.com/' + REPO + '/main/data/portfolio.json';
  var DEFAULT_ASSETS = 'https://cdn.jsdelivr.net/gh/' + REPO + '@main/';
  var SEL = function (name) { return '[data-cms-layout="' + name + '"]'; };
  var ALL = '__all';
  var EXITED = '__exited';

  var cache = {};
  var instances = [];

  function load(src) {
    if (!cache[src]) {
      cache[src] = fetch(src, { credentials: 'omit' }).then(function (r) {
        if (!r.ok) throw new Error('RVP portfolio: ' + r.status + ' loading ' + src);
        return r.json();
      }).catch(function (e) { delete cache[src]; throw e; });
    }
    return cache[src];
  }

  function slugify(s) {
    return String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function abs(base, path) {
    if (!path) return '';
    return /^https?:\/\//.test(path) ? path : base.replace(/\/?$/, '/') + path.replace(/^\//, '');
  }

  // The innermost element that holds the button's text
  function labelEl(btn) {
    var el = btn.querySelector('.button_text');
    if (el) return el;
    el = btn;
    while (el.firstElementChild && el.children.length === 1) el = el.firstElementChild;
    return el;
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  var styleAdded = false;
  function addStyle() {
    if (styleAdded) return;
    styleAdded = true;
    var css =
      SEL('cms_list') + '[data-cms-hover="false"] ' + SEL('logo') + '{transition:none}' +
      SEL('cms_item') + ' ' + SEL('logo') + ',' + SEL('cms_item') + ' ' + SEL('logo-active') + '{transition:opacity .35s ease}' +
      '@media (hover:hover){' +
      SEL('cms_list') + ':not([data-cms-hover="false"]) ' + SEL('cms_item') + ':hover ' + SEL('logo') + '.rvp-has-hover{opacity:0}' +
      SEL('cms_list') + ':not([data-cms-hover="false"]) ' + SEL('cms_item') + ':hover ' + SEL('logo-active') + '{opacity:1}' +
      '}' +
      SEL('filter-button') + '{cursor:pointer;user-select:none}' +
      SEL('filter-button') + ':focus-visible{outline:2px solid currentColor;outline-offset:2px}' +
      '.rvp-sentinel{width:100%;height:1px;grid-column:1/-1}';
    var s = document.createElement('style');
    s.setAttribute('data-rvp-portfolio', '');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function Portfolio(list) {
    this.list = list;
    this.filterList = document.querySelector(SEL('filter-list'));
    this.source = list.getAttribute('data-cms-source') || DEFAULT_SOURCE;
    this.assets = list.getAttribute('data-cms-assets') || DEFAULT_ASSETS;
    var ps = parseInt(list.getAttribute('data-cms-page-size'), 10);
    this.pageSize = isNaN(ps) ? 9 : ps;
    this.animate = list.getAttribute('data-cms-animate') !== 'false';
    this.filter = ALL;
    this.shown = 0;
    this.items = [];
    this.view = [];
    this.observer = null;

    var first = list.querySelector(SEL('cms_item'));
    if (!first) { console.warn('RVP portfolio: no cms_item template found'); return; }
    this.template = first.cloneNode(true);
    this.hasIx2 = !!(this.template.hasAttribute('data-w-id') || this.template.querySelector('[data-w-id]'));

    if (this.filterList) {
      var b = this.filterList.querySelector(SEL('filter-button'));
      if (b) {
        this.activeClass = b.getAttribute('data-cms-active-class') ||
          [].filter.call(b.classList, function (c) { return /active/i.test(c); })[0] || 'is-active';
        this.buttonTemplate = b.cloneNode(true);
        this.buttonTemplate.classList.remove(this.activeClass);
      }
    }

    var self = this;
    load(this.source).then(function (data) {
      if (self.destroyed) return;
      var items = (data.companies || data.items || data || []).slice();
      items.sort(function (a, b) {
        if (!!a.exited !== !!b.exited) return a.exited ? 1 : -1;
        return (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(b.name);
      });
      self.items = items;
      self.readUrl();
      self.buildFilters();
      self.apply(false);
      list.setAttribute('data-cms-ready', '');
    }).catch(function (e) {
      console.error(e);
      list.setAttribute('data-cms-ready', 'error');
    });
  }

  Portfolio.prototype.tags = function () {
    var seen = {};
    var tags = [];
    this.items.forEach(function (it) {
      (it.industries || []).forEach(function (t) {
        var k = slugify(t);
        if (!seen[k]) { seen[k] = 1; tags.push({ key: k, label: t }); }
      });
    });
    return tags.sort(function (a, b) { return a.label.localeCompare(b.label); });
  };

  Portfolio.prototype.readUrl = function () {
    try {
      var v = new URL(location.href).searchParams.get('industry');
      if (v) this.filter = v === 'exited' ? EXITED : v;
    } catch (e) {}
  };

  Portfolio.prototype.writeUrl = function () {
    try {
      var u = new URL(location.href);
      if (this.filter === ALL) u.searchParams.delete('industry');
      else u.searchParams.set('industry', this.filter === EXITED ? 'exited' : this.filter);
      history.replaceState(history.state, '', u.toString());
    } catch (e) {}
  };

  Portfolio.prototype.buildFilters = function () {
    if (!this.filterList || !this.buttonTemplate) return;
    var self = this;
    var fl = this.filterList;
    var opts = [{ key: ALL, label: fl.getAttribute('data-cms-all-label') || 'All' }].concat(this.tags());
    var exitedLabel = fl.getAttribute('data-cms-exited-label');
    if (exitedLabel && this.items.some(function (i) { return i.exited; })) opts.push({ key: EXITED, label: exitedLabel });

    if (!opts.some(function (o) { return o.key === self.filter; })) this.filter = ALL;

    [].slice.call(fl.querySelectorAll(SEL('filter-button'))).forEach(function (b) { b.remove(); });
    fl.setAttribute('role', 'toolbar');
    fl.setAttribute('aria-label', 'Filter portfolio by industry');

    this.buttons = opts.map(function (o) {
      var b = self.buttonTemplate.cloneNode(true);
      labelEl(b).textContent = o.label;
      b.setAttribute('data-cms-filter', o.key);
      if (b.tagName !== 'BUTTON' && b.tagName !== 'A') {
        b.setAttribute('role', 'button');
        b.setAttribute('tabindex', '0');
      }
      b.addEventListener('click', function (e) { e.preventDefault(); self.setFilter(o.key); });
      b.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.setFilter(o.key); }
      });
      fl.appendChild(b);
      return b;
    });
    this.markActive();
  };

  Portfolio.prototype.markActive = function () {
    var self = this;
    (this.buttons || []).forEach(function (b) {
      var on = b.getAttribute('data-cms-filter') === self.filter;
      b.classList.toggle(self.activeClass, on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  Portfolio.prototype.setFilter = function (key) {
    if (key === this.filter) return;
    this.filter = key;
    this.markActive();
    this.writeUrl();
    this.apply(true);
  };

  Portfolio.prototype.matches = function (it) {
    if (this.filter === ALL) return true;
    if (this.filter === EXITED) return !!it.exited;
    var f = this.filter;
    return (it.industries || []).some(function (t) { return slugify(t) === f; });
  };

  Portfolio.prototype.apply = function (animated) {
    var self = this;
    var gsap = window.gsap;
    this.view = this.items.filter(this.matches, this);
    this.shown = 0;

    var old = [].slice.call(this.list.querySelectorAll(SEL('cms_item')));
    var swap = function () {
      if (self.destroyed) return;
      old.forEach(function (c) { c.remove(); });
      self.more(animated);
    };

    if (animated && old.length && gsap && this.animate && !reduceMotion()) {
      this.list.style.minHeight = this.list.offsetHeight + 'px';
      gsap.killTweensOf(old);
      gsap.to(old, { opacity: 0, y: '-0.5rem', duration: 0.22, ease: 'power1.in', onComplete: swap });
    } else {
      swap();
    }
  };

  Portfolio.prototype.card = function (it) {
    var c = this.template.cloneNode(true);
    var q = function (n) { return c.querySelector(SEL(n)); };
    var assets = this.assets;

    c.setAttribute('data-cms-slug', it.slug || slugify(it.name));
    var tag = q('tag');
    if (tag) tag.textContent = (it.industries || []).join(', ');
    var status = q('status');
    if (status && !it.exited) status.style.display = 'none';
    var name = q('name');
    if (name) name.textContent = it.name;
    var text = q('text');
    if (text) text.textContent = it.description || '';

    var logo = q('logo');
    var hover = q('logo-active');
    [logo, hover].forEach(function (img) {
      if (!img) return;
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.alt = '';
    });
    if (it.logo && logo) {
      logo.src = abs(assets, it.logo);
      logo.alt = it.name + ' logo';
      logo.loading = 'lazy';
      logo.decoding = 'async';
    } else if (logo) {
      var wrap = logo.parentElement;
      (wrap && wrap.children.length <= 2 ? wrap : logo).style.display = 'none';
    }
    if (hover) {
      if (it.logo && it.logoHover) {
        hover.src = abs(assets, it.logoHover);
        hover.setAttribute('aria-hidden', 'true');
        hover.loading = 'lazy';
        hover.decoding = 'async';
        if (logo) logo.classList.add('rvp-has-hover');
      } else {
        hover.remove();
      }
    }

    var link = q('link');
    if (link) {
      if (it.url) {
        link.href = it.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.setAttribute('aria-label', 'Visit ' + it.name + ' website');
      } else {
        link.style.display = 'none';
      }
    }
    return c;
  };

  Portfolio.prototype.more = function (animated) {
    var self = this;
    var gsap = window.gsap;
    var end = this.pageSize > 0 ? Math.min(this.view.length, this.shown + this.pageSize) : this.view.length;
    var frag = document.createDocumentFragment();
    var cards = [];
    for (var i = this.shown; i < end; i++) {
      var c = this.card(this.view[i]);
      cards.push(c);
      frag.appendChild(c);
    }
    this.shown = end;
    if (this.sentinel && this.sentinel.parentNode === this.list) this.list.insertBefore(frag, this.sentinel);
    else this.list.appendChild(frag);
    this.list.style.minHeight = '';

    if (animated && cards.length && gsap && this.animate && !reduceMotion()) {
      gsap.fromTo(cards, { opacity: 0, y: '1.5rem' }, {
        opacity: 1, y: 0, duration: 0.7, ease: 'power2.out', stagger: 0.06,
        clearProps: 'opacity,transform,translate'
      });
    }

    if (this.hasIx2 && window.Webflow && Webflow.require) {
      try { var ix2 = Webflow.require('ix2'); if (ix2 && ix2.init) ix2.init(); } catch (e) {}
    }

    this.watch();
    this.refresh();
    try {
      this.list.dispatchEvent(new CustomEvent('rvp:rendered', {
        bubbles: true, detail: { cards: cards, filter: this.filter, shown: this.shown, total: this.view.length }
      }));
    } catch (e) {}
  };

  Portfolio.prototype.watch = function () {
    var self = this;
    var done = this.shown >= this.view.length;
    if (!this.sentinel) {
      this.sentinel = document.createElement('div');
      this.sentinel.className = 'rvp-sentinel';
      this.sentinel.setAttribute('aria-hidden', 'true');
    }
    if (done) {
      if (this.observer) this.observer.disconnect();
      if (this.sentinel.parentNode) this.sentinel.remove();
      return;
    }
    this.list.appendChild(this.sentinel);
    if (!('IntersectionObserver' in window)) { this.more(true); return; }
    if (!this.observer) {
      this.observer = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; }) && !self.loading) {
          self.loading = true;
          requestAnimationFrame(function () { self.loading = false; self.more(true); });
        }
      }, { rootMargin: '0px 0px 600px 0px' });
    }
    this.observer.disconnect();
    this.observer.observe(this.sentinel);
  };

  Portfolio.prototype.refresh = function () {
    clearTimeout(this._rt);
    this._rt = setTimeout(function () {
      if (window.ScrollTrigger && ScrollTrigger.refresh) ScrollTrigger.refresh();
      if (window.lenis && window.lenis.resize) window.lenis.resize();
    }, 120);
  };

  Portfolio.prototype.destroy = function () {
    this.destroyed = true;
    if (this.observer) this.observer.disconnect();
    clearTimeout(this._rt);
  };

  function init() {
    instances = instances.filter(function (p) {
      if (!document.contains(p.list)) { p.destroy(); return false; }
      return true;
    });
    var lists = document.querySelectorAll(SEL('cms_list'));
    if (!lists.length) return;
    addStyle();
    [].forEach.call(lists, function (list) {
      if (list._rvpPortfolio) return;
      list._rvpPortfolio = new Portfolio(list);
      instances.push(list._rvpPortfolio);
    });
  }

  window.RVPPortfolio = { init: init, version: '1.0.0' };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // site page transitions swap the body without a reload
  window.addEventListener('pt:done', init);
  window.addEventListener('pageshow', function (e) { if (e.persisted) init(); });
})();
