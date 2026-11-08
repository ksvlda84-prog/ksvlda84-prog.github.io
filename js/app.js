/* =========================================================
   Студия Виктории Рассохиной — скрипты
   Прайс-лист: prices.xlsx (главный источник) → prices.json (запасной)
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Хранилище без падений (приватный режим и т. п.) ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* =========================================================
     1. ПРАЙС-ЛИСТ
     ========================================================= */
  const CATEGORIES = ['esthetic', 'spa', 'hardware', 'body', 'epilation'];
  const CATEGORY_LABELS = {
    esthetic: 'Эстетическая', spa: 'СПА-программы', hardware: 'Аппаратная',
    body: 'Коррекция тела', epilation: 'Эпиляция'
  };

  // Ключ нормализуется: нижний регистр, без пробелов и знаков
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');

  const COLUMN_ALIASES = {
    id: ['id', 'номер', 'n'],
    category: ['категориякод', 'категория', 'category', 'cat', 'раздел'],
    type: ['типстроки', 'тип', 'type'],
    name: ['названиеуслуги', 'название', 'услуга', 'наименование', 'name'],
    desc: ['описаниедетали', 'описание', 'детали', 'desc', 'description'],
    price: ['цена', 'стоимость', 'price'],
    oldPrice: ['стараяценазачеркнутая', 'стараяцена', 'было', 'oldprice', 'ценадоскидки'],
    icon: ['иконкаfontawesome', 'иконка', 'icon']
  };

  const CATEGORY_ALIASES = {
    esthetic: ['esthetic', 'эстетическая', 'эстетика', 'эстетическаякосметология'],
    spa: ['spa', 'спа', 'спапрограммы', 'спапрограмма'],
    hardware: ['hardware', 'аппаратная', 'аппаратнаякосметология', 'аппарат'],
    body: ['body', 'коррекциятела', 'тело', 'коррекцияфигуры'],
    epilation: ['epilation', 'эпиляция', 'депиляция', 'шугаринг']
  };

  const TYPE_ALIASES = {
    item: ['item', 'услуга', 'карточка', 'обычная'],
    complex: ['complex', 'комплекс', 'комплексы'],
    subheader: ['subheader', 'подзаголовок', 'заголовок'],
    gift: ['gift', 'подарок']
  };

  // Иконки Font Awesome Pro, которых нет в бесплатной версии → похожие бесплатные
  const ICON_ALIASES = { 'fa-sparkles': 'fa-wand-magic-sparkles' };
  const FALLBACK_ICON = 'fa-spa';

  function lookup(table, value) {
    const key = norm(value);
    for (const code in table) if (table[code].includes(key)) return code;
    return null;
  }

  function normalizeIcon(v) {
    const skip = ['fa', 'fas', 'far', 'fab', 'fal', 'fad', 'fa-solid', 'fa-regular', 'fa-brands'];
    const tokens = String(v == null ? '' : v).trim().toLowerCase().split(/\s+/).filter(t => t && !skip.includes(t));
    if (!tokens.length) return FALLBACK_ICON;
    let name = tokens[tokens.length - 1];
    if (!name.startsWith('fa-')) name = 'fa-' + name;
    if (!/^fa-[a-z0-9-]+$/.test(name)) return FALLBACK_ICON;
    return ICON_ALIASES[name] || name;
  }

  const priceFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  function formatPrice(v) {
    if (v === '' || v == null) return '';
    if (typeof v === 'number') return priceFmt.format(v) + ' ₽';
    const s = String(v).trim().replace(/\s+/g, ' ');
    // «2500», «2 500», «2500 ₽», «2500р», «2500 руб.» → «2 500 ₽»
    const m = s.match(/^(\d[\d ]*(?:[.,]\d{1,2})?)\s*(?:₽|р\.?|руб\.?|rub)?$/i);
    if (m) {
      const n = Number(m[1].replace(/ /g, '').replace(',', '.'));
      if (!isNaN(n)) return priceFmt.format(n) + ' ₽';
    }
    return s; // «от 3 500 ₽», «по запросу» и т. п. — как написано
  }

  const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  /**
   * Превращает строки таблицы в услуги. Возвращает { items, warnings }.
   * Ничего не теряется молча: всё подозрительное попадает в warnings.
   */
  function normalizeRows(rawRows) {
    const items = [];
    const warnings = [];
    let lastCategory = null;

    rawRows.forEach((raw, idx) => {
      const rowNo = idx + 2; // строка 1 — заголовки
      const row = {};
      for (const key in raw) row[norm(key)] = raw[key];
      const get = (field) => {
        for (const a of COLUMN_ALIASES[field]) if (row[a] !== undefined && row[a] !== '') return row[a];
        return '';
      };

      const name = clean(get('name'));
      const hasAnything = Object.values(raw).some(v => clean(v) !== '');
      if (!hasAnything) return; // пустая строка
      if (!name) { warnings.push(`Строка ${rowNo}: нет названия — строка пропущена.`); return; }

      let category = null;
      const rawCat = clean(get('category'));
      if (!rawCat) {
        if (lastCategory) { category = lastCategory; warnings.push(`Строка ${rowNo} «${name}»: не указана категория — взята предыдущая («${lastCategory}»).`); }
        else { category = 'esthetic'; warnings.push(`Строка ${rowNo} «${name}»: не указана категория — поставлена «esthetic».`); }
      } else {
        category = lookup(CATEGORY_ALIASES, rawCat);
        if (!category) { warnings.push(`Строка ${rowNo} «${name}»: неизвестная категория «${rawCat}» — услуга НЕ показана. Допустимо: ${CATEGORIES.join(', ')}.`); return; }
      }
      lastCategory = category;

      let type = 'item';
      const rawType = clean(get('type'));
      if (rawType) {
        type = lookup(TYPE_ALIASES, rawType);
        if (!type) { warnings.push(`Строка ${rowNo} «${name}»: неизвестный тип «${rawType}» — показана как обычная услуга (item).`); type = 'item'; }
      }

      const price = formatPrice(get('price'));
      if ((type === 'item' || type === 'complex') && !price) warnings.push(`Строка ${rowNo} «${name}»: не указана цена.`);

      items.push({
        id: get('id') || idx + 1,
        category, type, name,
        desc: clean(get('desc')),
        price,
        oldPrice: price ? formatPrice(get('oldPrice')) : '',
        icon: normalizeIcon(get('icon'))
      });
    });
    return { items, warnings };
  }

  function workbookToRows(wb) {
    const sheetName = wb.SheetNames.find(n => /прайс|price/i.test(n)) || wb.SheetNames[0];
    return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  }

  /* ---------- Отрисовка (без innerHTML — никакого XSS) ---------- */
  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }
  function icon(name) {
    const i = document.createElement('i');
    i.className = 'fas ' + name;
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  let currentItems = [];

  function renderServices(items) {
    currentItems = items;
    CATEGORIES.forEach(cat => { const c = document.getElementById(cat); if (c) c.replaceChildren(); });

    items.forEach(item => {
      const box = document.getElementById(item.category);
      if (!box) return;

      if (item.type === 'subheader') {
        box.appendChild(el('h3', 'price-sub', item.name));
      } else if (item.type === 'gift') {
        const g = el('div', 'gift-note');
        g.append(icon(item.icon), el('span', null, item.name));
        box.appendChild(g);
      } else {
        const card = el('div', item.type === 'complex' ? 'price-complex' : 'price-item');
        const ic = el('div', 'price-icon'); ic.appendChild(icon(item.icon));
        const text = el('div', 'price-text');
        text.appendChild(el('span', 'price-name', item.name));
        if (item.desc) text.appendChild(el('div', 'price-desc', item.desc));
        card.append(ic, text);
        if (item.price) {
          const val = el('span', 'price-val');
          if (item.oldPrice) {
            val.classList.add('has-old');
            const old = el('s', 'price-old', item.oldPrice);
            old.append(el('span', 'sr-only', ' (прежняя цена)'));
            val.append(old, el('span', 'price-now', item.price));
          } else {
            val.textContent = item.price;
          }
          card.appendChild(val);
        }
        box.appendChild(card);
      }
    });

    CATEGORIES.forEach(cat => {
      const box = document.getElementById(cat);
      if (box && !box.children.length) box.appendChild(el('div', 'services-state', 'В этом разделе пока нет услуг.'));
    });
    document.getElementById('servicesContainer').setAttribute('aria-busy', 'false');
    fixMissingIcons();
  }

  /** Если Font Awesome не знает иконку (например, Pro-иконка), ставим запасную — вместо пустого квадрата */
  function fixMissingIcons() {
    const run = () => {
      const fixed = [];
      document.querySelectorAll('.price-icon i, .gift-note i').forEach(i => {
        const c = getComputedStyle(i, '::before').content;
        if (!c || c === 'none' || c === 'normal' || c === '""') {
          const old = [...i.classList].find(k => k.startsWith('fa-') && k !== 'fa-solid');
          fixed.push(old);
          i.classList.remove(old); i.classList.add(FALLBACK_ICON);
        }
      });
      window.__iconsFixed = fixed;
    };
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run, { once: true });
  }

  function showLoadError() {
    const box = document.getElementById('esthetic');
    box.replaceChildren();
    const s = el('div', 'services-state');
    s.append('Не удалось загрузить прайс-лист. Обновите страницу или уточните цены по телефону ');
    const a = el('a', null, '+7 (918) 493-20-08'); a.href = 'tel:+79184932008';
    s.append(a, '.');
    box.appendChild(s);
    document.getElementById('servicesContainer').setAttribute('aria-busy', 'false');
  }

  function waitForXLSX(ms) {
    return new Promise(resolve => {
      const t0 = Date.now();
      (function poll() {
        if (typeof XLSX !== 'undefined') return resolve(true);
        if (Date.now() - t0 > ms) return resolve(false);
        setTimeout(poll, 50);
      })();
    });
  }

  async function loadFromXlsx() {
    if (!(await waitForXLSX(8000))) throw new Error('SheetJS не загрузился');
    const res = await fetch('prices.xlsx', { cache: 'no-store' });
    if (!res.ok) throw new Error('prices.xlsx: HTTP ' + res.status);
    const wb = XLSX.read(await res.arrayBuffer(), { type: 'array' });
    return normalizeRows(workbookToRows(wb));
  }

  async function loadFromJson() {
    const res = await fetch('prices.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('prices.json: HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('prices.json: ожидался массив');
    return normalizeRows(data);
  }

  async function initServices() {
    let result = null, source = null;
    try { result = await loadFromXlsx(); source = 'xlsx'; }
    catch (e) { console.warn('[прайс] Excel не прочитан, пробую prices.json →', e.message); }
    if (!result || !result.items.length) {
      try { result = await loadFromJson(); source = 'json'; }
      catch (e) { console.warn('[прайс] prices.json тоже не прочитан →', e.message); }
    }
    if (result && result.items.length) {
      renderServices(result.items);
      if (result.warnings.length) console.warn('[прайс] Замечания к таблице:\n' + result.warnings.join('\n'));
    } else {
      showLoadError();
    }
    window.__prices = { source, items: result ? result.items : [], warnings: result ? result.warnings : [] };
    document.dispatchEvent(new CustomEvent('prices:ready'));
  }

  /* ---------- Панель администратора: предпросмотр Excel ---------- */
  const adminPanel = document.getElementById('adminPanel');
  const adminStatus = document.getElementById('adminStatus');
  const fileInput = document.getElementById('excelFileInput');

  function toggleAdmin(force) { adminPanel.classList.toggle('active', force); }
  if (/[?&]admin=1\b/.test(location.search)) toggleAdmin(true);
  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.altKey && e.code === 'KeyA') toggleAdmin(); // работает и с русской раскладкой, и на Mac
  });

  function statusMessage(okText, warnings) {
    adminStatus.replaceChildren();
    adminStatus.appendChild(el('div', 'ok', okText));
    if (warnings.length) {
      const w = el('div', 'warn');
      w.appendChild(el('strong', null, `Нужно проверить (${warnings.length}):`));
      const ul = el('ul');
      warnings.forEach(t => ul.appendChild(el('li', null, t)));
      w.appendChild(ul);
      adminStatus.appendChild(w);
    }
  }

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (typeof XLSX === 'undefined') throw new Error('Библиотека чтения Excel ещё не загрузилась');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const { items, warnings } = normalizeRows(workbookToRows(wb));
      if (!items.length) throw new Error('В файле не найдено ни одной услуги. Проверьте заголовки столбцов.');
      renderServices(items);
      statusMessage(`Предпросмотр: загружено ${items.length} строк из «${file.name}». Посетители этого пока НЕ видят — чтобы опубликовать, замените prices.xlsx в репозитории.`, warnings);
    } catch (err) {
      adminStatus.replaceChildren(el('div', 'warn', 'Ошибка чтения файла: ' + err.message));
    }
    fileInput.value = '';
  });

  document.getElementById('resetPreviewBtn').addEventListener('click', async () => {
    adminStatus.replaceChildren();
    document.getElementById('servicesContainer').setAttribute('aria-busy', 'true');
    await initServices();
  });

  document.getElementById('downloadExcelBtn').addEventListener('click', () => {
    // Отдаём исходный prices.xlsx целиком (вместе с листом «Инструкция»)
    const a = document.createElement('a');
    a.href = 'prices.xlsx'; a.download = 'prices.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
  });

  initServices();

  /* =========================================================
     2. ВКЛАДКИ (ARIA tabs + клавиатура)
     ========================================================= */
  const tabs = [...document.querySelectorAll('.tab-btn')];
  function selectTab(tab, focus) {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.dataset.tab).classList.toggle('active', on);
    });
    if (focus) tab.focus();
    tab.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab, false));
    tab.addEventListener('keydown', (e) => {
      let n = null;
      if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = tabs.length - 1;
      if (n !== null) { e.preventDefault(); selectTab(tabs[n], true); }
    });
  });

  /* =========================================================
     3. МОБИЛЬНОЕ МЕНЮ
     ========================================================= */
  const menuBtn = document.getElementById('menuBtn');
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawerOverlay');
  const behind = [document.getElementById('navbar'), document.getElementById('main'), document.querySelector('.site-footer')];

  function setDrawer(open) {
    drawer.inert = !open;
    drawer.classList.toggle('open', open);
    overlay.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', open);
    behind.forEach(n => { if (n) n.inert = open; });
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) document.getElementById('drawerClose').focus();
    else if (document.activeElement === document.body || drawer.contains(document.activeElement)) menuBtn.focus();
  }
  menuBtn.addEventListener('click', () => setDrawer(true));
  document.getElementById('drawerClose').addEventListener('click', () => setDrawer(false));
  overlay.addEventListener('click', () => setDrawer(false));
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    drawer.inert = true; drawer.classList.remove('open'); overlay.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', false);
    behind.forEach(n => { if (n) n.inert = false; });
    document.body.style.overflow = '';
  }));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) setDrawer(false); });
  window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => { if (e.matches && drawer.classList.contains('open')) setDrawer(false); });

  /* =========================================================
     4. ГАЛЕРЕЯ
     ========================================================= */
  const track = document.getElementById('galleryTrack');
  const prev = document.getElementById('galleryPrev');
  const next = document.getElementById('galleryNext');
  const step = () => Math.max(track.clientWidth * 0.8, 200);
  const scrollBehavior = () => (reduceMotion.matches ? 'auto' : 'smooth');
  prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: scrollBehavior() }));
  next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: scrollBehavior() }));
  function updateGalleryButtons() {
    prev.disabled = track.scrollLeft < 8;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
  }
  track.addEventListener('scroll', updateGalleryButtons, { passive: true });
  window.addEventListener('resize', updateGalleryButtons);
  updateGalleryButtons();
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev.click(); }
  });

  /* =========================================================
     5. ПРОКРУТКА, ПОЯВЛЕНИЕ БЛОКОВ, КНОПКИ
     ========================================================= */
  const navbar = document.getElementById('navbar');
  const scrollTopBtn = document.getElementById('scrollTopBtn');
  const onScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 10);
    scrollTopBtn.classList.toggle('visible', window.scrollY > 600);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: scrollBehavior() }));

  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(r => io.observe(r));
  } else {
    reveals.forEach(r => r.classList.add('visible'));
  }

  // Плавающие кнопки прячутся, когда на экране блок контактов или подвал
  const sticky = document.getElementById('stickyButtons');
  if ('IntersectionObserver' in window) {
    const hide = new Set();
    const so = new IntersectionObserver((entries) => {
      entries.forEach(en => en.isIntersecting ? hide.add(en.target) : hide.delete(en.target));
      sticky.classList.toggle('hidden', hide.size > 0);
    }, { threshold: 0.15 });
    [document.getElementById('contact'), document.querySelector('.site-footer')].forEach(n => n && so.observe(n));
  }

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- Cookie ---------- */
  const banner = document.getElementById('cookieBanner');
  if (!store.get('cookiesAccepted')) setTimeout(() => banner.classList.add('show'), 1500);
  document.getElementById('acceptCookiesBtn').addEventListener('click', () => {
    store.set('cookiesAccepted', 'true');
    banner.classList.remove('show');
  });
})();
