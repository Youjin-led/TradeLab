const prices = {
  container: { label: "Контейнерная свеча 200 мл", base: 690 },
  figure: { label: "Фигурная свеча", base: 520 },
  waxsheet: { label: "Тонкая декоративная свеча", base: 340 },
  set: { label: "Подарочный набор", base: 1490 }
};

const palettes = {
  red: { label: "red", color: "#a3262c", glow: "#eeb167" },
  blue: { label: "blue", color: "#8db5f1", glow: "#f8cf84" },
  wine: { label: "wine", color: "#630016", glow: "#d88a57" },
  blush: { label: "blush", color: "#c78891", glow: "#f0bd78" }
};

const contacts = {
  email: "hello@lumiere-atelier.example"
};
const cartStorageKey = "svetlo-cart";
const categoryCovers = {
  "wholesale:Свечи в таре": "assets/candle-product-04.png",
  "wholesale:Формовые свечи": "assets/candle-product-05.png",
  "wholesale:Соль для ванн": "assets/candle-product-01.png",
  "wholesale:Ароматические саше": "assets/candle-product-10.png",
  "wholesale:Мыло": "assets/candle-product-07.png",
  "wholesale:Бомбочки для ванн": "assets/candle-product-02.png",
  "wholesale:Уход за телом": "assets/candle-product-08.png",
  "wholesale:Уход за волосами": "assets/candle-product-09.png",
  "wholesale:Уход за лицом": "assets/candle-product-11.png",
  "wholesale:Подарочные наборы": "assets/candle-product-06.png",
  "wholesale:Аромадифузоры / автопарфюм": "assets/candle-product-03.png",
  "wholesale:Рум спреи": "assets/candle-product-11.png",
  "maker:Красители": "assets/maker-cover-dyes.png",
  "maker:Вощина": "assets/maker-cover-wax-sheets.png",
  "maker:Цветные воски": "assets/maker-cover-colored-wax.png",
  "maker:Отдушки": "assets/maker-cover-fragrances.png",
  "maker:Тара": "assets/maker-cover-containers.png",
  "maker:Упаковка": "assets/maker-cover-packaging.png",
  "maker:Силиконовые формы": "assets/maker-cover-silicone-molds.png",
  "maker:Фитили": "assets/maker-cover-wicks.png"
};
let cmsData = null;

const categoryDetails = {
  wholesale: {
    label: "Оптовые продажи",
    tag: "Оптовое направление",
    fallback: "Оптовая категория",
    defaultItem: "Свечи в таре",
    descriptions: {
      "Свечи в таре": "Контейнерные свечи для витрин, подарочных боксов, маркетплейсов и регулярных поставок в единой палитре.",
      "Формовые свечи": "Фигурные и декоративные свечи для сезонных коллекций, подарков и интерьерных выкладок.",
      "Соль для ванн": "Ароматические соли для ухода, подарочных наборов и спокойных wellness-линеек.",
      "Ароматические саше": "Саше для дома, шкафа, авто и комплектов с мягкими ароматическими акцентами.",
      "Мыло": "Подарочное и уходовое мыло для розничных партий, наборов и брендированных боксов.",
      "Бомбочки для ванн": "Партии для наборов, салонов, локальных магазинов и сезонных wellness-предложений.",
      "Уход за телом": "Средства для body care линеек, подарочных боксов и регулярной розничной полки.",
      "Уход за волосами": "Позиции для базового и сезонного ухода за волосами в подарочном или розничном формате.",
      "Уход за лицом": "Аккуратные уходовые товары для наборов, витрин и небольших партий.",
      "Подарочные наборы": "Готовые комплекты под событие, сезон, корпоративный заказ или розничную выкладку.",
      "Аромадифузоры / автопарфюм": "Ароматы для дома и авто в единой стилистике бренда или коллекции.",
      "Рум спреи": "Спреи для помещений, текстиля и ароматических коллекций."
    }
  },
  maker: {
    label: "Товары для свечеваров",
    tag: "Материалы и комплектующие",
    fallback: "Категория для свечеваров",
    defaultItem: "Красители",
    descriptions: {
      "Красители": "Красители для свечей и малых партий, чтобы быстро собрать нужную палитру коллекции.",
      "Вощина": "Вощина для декоративных свечей, наборов и учебных мастер-классов.",
      "Цветные воски": "Цветные воски для производства, тестов палитры и небольших авторских партий.",
      "Отдушки": "Ароматические отдушки для свечей, саше и интерьерных продуктов.",
      "Тара": "Тара для свечей в разных форматах: под тесты, регулярные партии и подарочные наборы.",
      "Упаковка": "Упаковка для свечей, комплектов, отправки и аккуратной розничной подачи.",
      "Силиконовые формы": "Формы для фигурных свечей, декора и сезонных коллекций.",
      "Фитили": "Фитили для разных типов воска, объемов и форматов свечей."
    }
  }
};

const form = document.querySelector("[data-calc-form]");
const totalNode = document.querySelector("[data-total]");
const summaryNode = document.querySelector("[data-summary-text]");
const canvas = document.getElementById("candleCanvas");
let activePalette = "red";
let currentCalculation = null;

function getProductFromUrl() {
  const raw = new URLSearchParams(window.location.search).get("product");
  if (!raw) return null;
  try {
    const product = JSON.parse(raw);
    if (!product || !product.title || !Number(product.price)) return null;
    return product;
  } catch {
    return null;
  }
}

const calculatorProduct = getProductFromUrl();

function closeDropdowns(exceptDropdown = null) {
  document.querySelectorAll(".nav-dropdown[open]").forEach((dropdown) => {
    if (dropdown !== exceptDropdown) dropdown.open = false;
  });
}

function money(value) {
  return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
}

function calculateLineTotal(unit, qty) {
  let total = unit * qty;
  if (qty >= 30) total = Math.ceil(total * 0.92);
  if (qty >= 80) total = Math.ceil(total * 0.86);
  return total;
}

function readCart() {
  try {
    return JSON.parse(localStorage.getItem(cartStorageKey)) || [];
  } catch {
    return [];
  }
}

function writeCart(items) {
  localStorage.setItem(cartStorageKey, JSON.stringify(items));
}

function getProductId(product) {
  return `${product.sectionKey}:${product.category}:${product.title}`;
}

function addToCart(product, qty = 1) {
  const items = readCart();
  const id = getProductId(product);
  const existing = items.find((item) => item.id === id);
  if (existing) {
    existing.qty += qty;
  } else {
    items.push({
      id,
      title: product.title,
      category: product.category,
      price: product.price,
      color: product.color,
      image: product.image || "",
      sectionKey: product.sectionKey,
      qty
    });
  }
  writeCart(items);
  renderCartPage();
}

function buildCartMessage(items) {
  if (!items.length) return "Здравствуйте! Хочу оформить заказ.";
  const lines = items.map((item, index) =>
    `${index + 1}. ${item.title} — ${item.qty} шт. × ${money(item.price)} = ${money(calculateLineTotal(item.price, item.qty))}`
  );
  const total = items.reduce((sum, item) => sum + calculateLineTotal(item.price, item.qty), 0);
  return [
    "Здравствуйте! Хочу оформить заказ.",
    ...lines,
    `Итого: ${money(total)}`
  ].join("\n");
}

function updateCartLinks(message) {
  const encoded = encodeURIComponent(message);
  const email = document.querySelector("[data-send-cart='email']");
  if (email) email.href =
    `mailto:${contacts.email}?subject=${encodeURIComponent("Заказ Svetlo")}&body=${encoded}`;
}

function renderCartPage() {
  const cartPage = document.querySelector("[data-cart-page]");
  if (!cartPage) return;

  const listNode = cartPage.querySelector("[data-cart-list]");
  const totalNode = cartPage.querySelector("[data-cart-total]");
  const countNode = cartPage.querySelector("[data-cart-count]");
  const emptyNode = cartPage.querySelector("[data-cart-empty]");
  const items = readCart();
  const total = items.reduce((sum, item) => sum + calculateLineTotal(item.price, item.qty), 0);
  const count = items.reduce((sum, item) => sum + item.qty, 0);
  const message = buildCartMessage(items);

  if (listNode) {
    listNode.innerHTML = items.length ? items.map((item) => `
      <article class="cart-item">
        <div class="product-photo ${item.image ? "photo-cover" : item.color} ${item.sectionKey}" role="img" aria-label="Фото: ${item.title}" ${item.image ? `style="background-image: url('${escapeHtml(item.image)}')"` : ""}><span></span></div>
        <div>
          <span>${item.category}</span>
          <h3>${item.title}</h3>
          <strong>${money(item.price)}</strong>
        </div>
        <label>Количество <input type="number" min="1" max="999" value="${item.qty}" data-cart-qty="${item.id}" /></label>
        <button class="button outline" type="button" data-cart-remove="${item.id}">Убрать</button>
      </article>
    `).join("") : `<div class="cart-placeholder"><h3>Корзина пока пустая</h3><p>Перейдите в разделы и добавьте товары, чтобы сформировать заказ.</p><a class="button primary" href="wholesale.html">Выбрать товары</a></div>`;
  }
  if (totalNode) totalNode.textContent = money(total);
  if (countNode) countNode.textContent = count ? `${count} ${count === 1 ? "товар" : "позиций"} в заказе.` : "Корзина пуста.";
  if (emptyNode) emptyNode.hidden = Boolean(items.length);
  updateCartLinks(message);
}

function getState() {
  const data = new FormData(form);
  const type = data.get("type");
  const qty = Math.max(1, Number(data.get("qty") || 1));
  const fallback = prices[type] || prices.container;
  return {
    type,
    title: calculatorProduct?.title || fallback.label,
    category: calculatorProduct?.category || "Калькулятор",
    price: Number(calculatorProduct?.price || fallback.base),
    sectionKey: calculatorProduct?.sectionKey || "wholesale",
    qty,
    color: calculatorProduct?.color || activePalette,
    image: calculatorProduct?.image || ""
  };
}

function calculate(state) {
  const unit = state.price;
  const total = calculateLineTotal(unit, state.qty);
  return { unit, total };
}

function setupCalculatorProduct() {
  if (!form || !calculatorProduct) return;
  const typeField = form.elements.type;
  if (typeField) {
    typeField.innerHTML = "";
    typeField.add(new Option(calculatorProduct.title, "selected-product"));
    typeField.value = "selected-product";
  }
  activePalette = calculatorProduct.color || activePalette;
}

function render() {
  if (!form) {
    drawPreview({ color: activePalette });
    setDiagnostics();
    return;
  }
  const state = getState();
  const calc = calculate(state);
  currentCalculation = { state, calc };
  totalNode.textContent = money(calc.total);
  summaryNode.textContent = `${state.qty} шт. · ${state.title.toLowerCase()}.`;
  drawPreview(state);

  setDiagnostics();
}

function setDiagnostics() {
  window.__SCENE_DIAGNOSTICS__ = {
    hasRendererCanvas: true,
    hasBlenderAssets: true,
    hasExternalArtist: true,
    objectCount: 6,
    candleCalculator: true,
    canvasPixels: canvas ? canvas.width * canvas.height : 0
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) throw new Error(`Ошибка запроса: ${response.status}`);
  return response.json();
}

async function loadCmsData() {
  try {
    cmsData = await requestJson(`data/cms.json?ts=${Date.now()}`);
  } catch {
    cmsData = null;
  }
}

function getCmsCategories(sectionKey) {
  return cmsData?.sections?.[sectionKey]?.categories || Object.entries(categoryDetails[sectionKey].descriptions).map(([name, description], index) => ({
    name,
    description,
    label: categoryDetails[sectionKey].tag,
    color: Object.keys(palettes)[index % Object.keys(palettes).length]
  }));
}

function getSectionDescription(sectionKey, item) {
  return getCmsCategories(sectionKey).find((category) => category.name === item)?.description || categoryDetails[sectionKey].descriptions[item] || "";
}

function getCategoryCover(sectionKey, item) {
  const png = categoryCovers[`${sectionKey}:${item}`] || "";
  if (!png) return "";
  // Используем WebP (создан скриптом optimize-images.js)
  return png.replace(/\.png$/i, '.webp');
}

function stars(rating) {
  const value = Math.max(1, Math.min(5, Number(rating || 5)));
  return "★".repeat(value) + "☆".repeat(5 - value);
}

function drawPreview(state) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = 1;
  canvas.height = 1;
  ctx.fillStyle = palettes[state.color].color;
  ctx.fillRect(0, 0, 1, 1);
}

function buildCategorySamples(item, sectionKey) {
  const paletteKeys = Object.keys(palettes);
  const customProducts = (cmsData?.products || [])
    .filter((product) => product.section === sectionKey && product.category === item)
    .map((product) => ({
      title: product.title,
      category: item,
      description: product.description,
      price: Number(product.price || 0),
      color: product.color || "red",
      image: product.image || "",
      sectionKey,
      id: product.id
    }));
  const wholesaleTemplates = [
    ["Базовая партия", "Для регулярной полки, витрины или первой закупки."],
    ["Подарочная серия", "Подходит для боксов, сезонных наборов и небольших витрин."],
    ["Мини-коллекция", "Небольшой запуск, чтобы проверить спрос и собрать обратную связь."],
    ["Корпоративная линия", "Формат для события, команды или брендированного подарка."],
    ["Сезонный выпуск", "Акцент на настроении коллекции, цвете и подаче."],
    ["Витринный микс", "Подборка разных позиций для красивой выкладки."],
    ["Маркетплейс партия", "Лаконичный формат с понятной комплектацией."],
    ["Премиум линия", "Более выразительная подача для подарочного сегмента."],
    ["Тестовый сет", "Небольшой объем для оценки качества и реакции покупателей."],
    ["Регулярная поставка", "Повторяемая партия с понятными параметрами."]
  ];
  const makerTemplates = [
    ["Стартовый набор", "Для тестов, мастер-классов и первых малых партий."],
    ["Производственный запас", "Удобный объем для регулярной работы."],
    ["Палитра коллекции", "Для сборки цветовой или ароматической линейки."],
    ["Тестовый комплект", "Небольшой формат для проверки совместимости."],
    ["Профессиональная партия", "Для стабильной закупки под поток заказов."],
    ["Сезонный микс", "Под праздничные, летние или подарочные серии."],
    ["Мастерская", "Для локального производства и ежедневной работы."],
    ["Пробная поставка", "Минимальный объем для оценки качества."],
    ["Расширенный сет", "Больше вариантов для экспериментов."],
    ["Регулярная закупка", "Повторный заказ с понятной комплектацией."]
  ];
  const templates = sectionKey === "maker" ? makerTemplates : wholesaleTemplates;
  const basePrice = sectionKey === "maker" ? 420 : 890;

  const samples = templates.map(([name, description], index) => ({
    title: `${item} · ${name}`,
    category: item,
    description,
    price: basePrice + index * (sectionKey === "maker" ? 120 : 260),
    color: paletteKeys[index % paletteKeys.length],
    sectionKey
  }));
  return customProducts.concat(samples);
}

function renderCategoryPage() {
  const categoryPage = document.querySelector("[data-category-page]");
  if (!categoryPage) return;

  const params = new URLSearchParams(window.location.search);
  const sectionKey = params.get("section") === "maker" ? "maker" : "wholesale";
  const section = categoryDetails[sectionKey];
  const requestedItem = params.get("item") || section.defaultItem;
  const categoryNames = getCmsCategories(sectionKey).map((category) => category.name);
  const item = categoryNames.includes(requestedItem) ? requestedItem : section.defaultItem;
  const calcUrl = "calculator.html";

  const sectionNode = categoryPage.querySelector("[data-category-section]");
  const titleNode = categoryPage.querySelector("[data-category-title]");
  const calcLinks = categoryPage.querySelectorAll("[data-category-calc]");
  const categoryGrid = categoryPage.querySelector("[data-category-grid]");
  const categoryCover = categoryPage.querySelector("[data-category-cover]");

  document.title = `Svetlo - ${item}`;
  if (sectionNode) sectionNode.textContent = section.label;
  if (titleNode) titleNode.textContent = item;
  if (categoryCover) {
    const cover = getCategoryCover(sectionKey, item);
    categoryPage.classList.toggle("has-category-cover", Boolean(cover));
    categoryPage.style.setProperty("--category-cover-image", cover ? `url("${cover}")` : "none");
    categoryCover.hidden = true;
    categoryCover.style.backgroundImage = "";
  }
  calcLinks.forEach((link) => {
    link.href = calcUrl;
  });
  if (categoryGrid) {
    categoryGrid.innerHTML = buildCategorySamples(item, sectionKey).map((product, index) => `
      <article class="category-product-card">
        <div class="product-photo ${product.image ? "photo-cover" : product.color} ${product.sectionKey}" role="img" aria-label="Фото: ${product.title}" ${product.image ? `style="background-image: url('${escapeHtml(product.image)}')"` : ""}>
          <span></span>
        </div>
        <strong class="category-product-price">${money(product.price)}</strong>
        <h3>${escapeHtml(product.title)}</h3>
        <p>${escapeHtml(product.description)}</p>
        <a class="calc-link" href="calculator.html?product=${encodeURIComponent(JSON.stringify(product))}">Рассчитать</a>
      </article>
    `).join("");
  }
}

function renderSectionDirectories() {
  document.querySelectorAll("[data-section-directory]").forEach((grid) => {
    const sectionKey = grid.dataset.sectionDirectory === "maker" ? "maker" : "wholesale";
    grid.innerHTML = getCmsCategories(sectionKey).map((category) => {
      const href = `category.html?section=${sectionKey}&item=${encodeURIComponent(category.name)}`;
      const cover = getCategoryCover(sectionKey, category.name);
      return `
        <a class="section-tile" href="${href}">
          <div class="section-tile-photo product-photo ${cover ? "photo-cover" : escapeHtml(category.color || "red")} ${sectionKey === "maker" ? "maker" : ""}" ${cover ? `style="background-image: url('${escapeHtml(cover)}')"` : ""}><span></span></div>
          <span>${escapeHtml(category.label || categoryDetails[sectionKey].tag)}</span>
          <h3>${escapeHtml(category.name)}</h3>
          <p>${escapeHtml(category.description || "")}</p>
          <strong>Открыть раздел</strong>
        </a>
      `;
    }).join("");
  });
}

function renderNavigationCategories() {
  if (!cmsData) return;
  ["wholesale", "maker"].forEach((sectionKey) => {
    const parentHref = sectionKey === "maker" ? "maker-goods.html" : "wholesale.html";
    document.querySelectorAll(`.nav-parent[href="${parentHref}"]`).forEach((parent) => {
      const panel = parent.closest(".nav-dropdown")?.querySelector(".dropdown-panel");
      if (!panel) return;
      panel.innerHTML = getCmsCategories(sectionKey).map((category) =>
        `<a href="category.html?section=${sectionKey}&item=${encodeURIComponent(category.name)}">${escapeHtml(category.name)}</a>`
      ).join("");
    });
  });
}

function renderBlogPage() {
  const grid = document.querySelector("[data-blog-grid]");
  if (!grid || !cmsData?.blog) return;
  grid.innerHTML = cmsData.blog.map((post) => `
    <article class="blog-card">
      <span>${escapeHtml(post.tag || "Разбор")}</span>
      <h2>${escapeHtml(post.title)}</h2>
      <p>${escapeHtml(post.text)}</p>
      <a href="${escapeHtml(post.url || "blog.html")}">Перейти к разделу</a>
    </article>
  `).join("");
}

function renderReviewsPage() {
  const page = document.querySelector("[data-reviews-page]");
  if (!page || !cmsData?.reviews) return;
  const reviews = cmsData.reviews.filter((review) => review.approved !== false);
  const grid = page.querySelector("[data-review-grid]");
  const average = page.querySelector("[data-review-average]");
  const summary = page.querySelector("[data-review-summary]");
  const rating = reviews.length
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 5), 0) / reviews.length
    : 0;
  if (average) average.textContent = rating ? rating.toFixed(1) : "0";
  if (summary) summary.textContent = reviews.length
    ? `На сайте опубликовано ${reviews.length} отзывов. Посетители могут оставить новый отзыв с оценкой, а админка позволяет удалить лишнее.`
    : "Пока нет отзывов. Будьте первым, кто оставит оценку.";
  if (grid) {
    grid.innerHTML = reviews.map((review) => `
      <article class="review-card">
        <div class="review-card-head">
          <span>${stars(review.rating)}</span>
          <small>${escapeHtml(review.meta || "Отзыв с сайта")}</small>
        </div>
        <h3>${escapeHtml(review.title)}</h3>
        <p>${escapeHtml(review.text)}</p>
        <footer>${escapeHtml(review.name)}</footer>
      </article>
    `).join("");
  }
}

function renderAdminPage() {
  const page = document.querySelector("[data-admin-page]");
  if (!page || !cmsData) return;
  const status = page.querySelector("[data-admin-status]");
  if (status) status.textContent = "Данные загружены. Изменения сохраняются в data/cms.json.";

  const categorySelect = page.querySelector("[data-admin-product-category]");
  const productSection = page.querySelector("[data-admin-product-section]");
  const fillProductCategories = () => {
    if (!categorySelect || !productSection) return;
    const sectionKey = productSection.value === "maker" ? "maker" : "wholesale";
    categorySelect.innerHTML = getCmsCategories(sectionKey)
      .map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`)
      .join("");
  };
  fillProductCategories();
  if (productSection) productSection.onchange = fillProductCategories;

  const blogList = page.querySelector("[data-admin-list='blog']");
  if (blogList) blogList.innerHTML = cmsData.blog.map((post) => `
    <div class="admin-item"><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.tag)} · ${escapeHtml(post.text)}</p><button class="button outline" data-admin-delete="blog" data-id="${escapeHtml(post.id)}">Удалить</button></div>
  `).join("");

  const reviewList = page.querySelector("[data-admin-list='reviews']");
  if (reviewList) reviewList.innerHTML = cmsData.reviews.map((review) => `
    <div class="admin-item"><h3><span>${stars(review.rating)}</span> ${escapeHtml(review.title)}</h3><p>${escapeHtml(review.name)} · ${escapeHtml(review.text)}</p><button class="button outline" data-admin-delete="reviews" data-id="${escapeHtml(review.id)}">Удалить</button></div>
  `).join("");

  const categoryList = page.querySelector("[data-admin-list='categories']");
  if (categoryList) categoryList.innerHTML = ["wholesale", "maker"].map((sectionKey) =>
    getCmsCategories(sectionKey).map((category) => `
      <div class="admin-item"><h3>${escapeHtml(category.name)}</h3><p>${escapeHtml(categoryDetails[sectionKey].label)} · ${escapeHtml(category.description || "")}</p><button class="button outline" data-admin-delete="categories" data-section="${sectionKey}" data-id="${escapeHtml(category.name)}">Удалить</button></div>
    `).join("")
  ).join("");

  const productList = page.querySelector("[data-admin-list='products']");
  if (productList) productList.innerHTML = (cmsData.products || []).map((product) => `
    <div class="admin-item"><h3>${escapeHtml(product.title)} · ${money(Number(product.price || 0))}</h3><p>${escapeHtml(categoryDetails[product.section]?.label || "")} / ${escapeHtml(product.category)} · ${escapeHtml(product.description || "")}</p><button class="button outline" data-admin-delete="products" data-id="${escapeHtml(product.id)}">Удалить</button></div>
  `).join("") || `<p>Пока нет добавленных вручную товаров.</p>`;
}

async function refreshCmsViews() {
  await loadCmsData();
  renderNavigationCategories();
  renderSectionDirectories();
  renderCategoryPage();
  renderBlogPage();
  renderReviewsPage();
  renderAdminPage();
}

document.addEventListener("click", async (event) => {
  if (!event.target.closest(".nav-dropdown")) closeDropdowns();

  const addCalculatedButton = event.target.closest("[data-add-calculated-cart]");
  if (addCalculatedButton && currentCalculation) {
    const { state } = currentCalculation;
    addToCart({
      title: state.title,
      category: state.category,
      price: state.price,
      color: state.color,
      image: state.image,
      sectionKey: state.sectionKey
    }, state.qty);
    addCalculatedButton.textContent = "Добавлено";
    setTimeout(() => {
      addCalculatedButton.textContent = "Добавить в корзину";
    }, 1200);
  }

  const removeButton = event.target.closest("[data-cart-remove]");
  if (removeButton) {
    writeCart(readCart().filter((item) => item.id !== removeButton.dataset.cartRemove));
    renderCartPage();
  }

  const adminDeleteButton = event.target.closest("[data-admin-delete]");
  if (adminDeleteButton) {
    const type = adminDeleteButton.dataset.adminDelete;
    const id = adminDeleteButton.dataset.id;
    const section = adminDeleteButton.dataset.section;
    const url = type === "categories"
      ? `/api/categories/${section}/${encodeURIComponent(id)}`
      : `/api/${type}/${encodeURIComponent(id)}`;
    try {
      cmsData = await requestJson(url, { method: "DELETE" });
      renderSectionDirectories();
      renderAdminPage();
    } catch (error) {
      const status = document.querySelector("[data-admin-status]");
      if (status) status.textContent = error.message;
    }
  }

});

document.addEventListener("submit", async (event) => {
  const reviewForm = event.target.closest("[data-review-form]");
  if (reviewForm) {
    event.preventDefault();
    const status = reviewForm.querySelector("[data-review-form-status]");
    const data = Object.fromEntries(new FormData(reviewForm).entries());
    try {
      cmsData = await requestJson("/api/reviews", {
        method: "POST",
        body: JSON.stringify(data)
      });
      reviewForm.reset();
      if (status) status.textContent = "Спасибо! Отзыв опубликован.";
      renderReviewsPage();
    } catch {
      const localReviews = JSON.parse(localStorage.getItem("svetlo-local-reviews") || "[]");
      localReviews.unshift({ ...data, id: `local-${Date.now()}`, approved: true });
      localStorage.setItem("svetlo-local-reviews", JSON.stringify(localReviews));
      if (status) status.textContent = "Отзыв сохранен в этом браузере. Для общей публикации нужен сервер.";
    }
  }

  const adminForm = event.target.closest("[data-admin-form]");
  if (adminForm) {
    event.preventDefault();
    const type = adminForm.dataset.adminForm;
    const data = Object.fromEntries(new FormData(adminForm).entries());
    const status = document.querySelector("[data-admin-status]");
    try {
      cmsData = await requestJson(`/api/${type}`, {
        method: "POST",
        body: JSON.stringify(data)
      });
      adminForm.reset();
      renderSectionDirectories();
      renderCategoryPage();
      renderBlogPage();
      renderReviewsPage();
      renderAdminPage();
      if (status) status.textContent = "Сохранено.";
    } catch (error) {
      if (status) status.textContent = `Не удалось сохранить: ${error.message}`;
    }
  }
});

document.addEventListener("input", (event) => {
  const input = event.target.closest("[data-cart-qty]");
  if (!input) return;
  const qty = Math.max(1, Math.min(999, Number(input.value || 1)));
  const items = readCart().map((item) =>
    item.id === input.dataset.cartQty ? { ...item, qty } : item
  );
  writeCart(items);
  renderCartPage();
});

document.addEventListener("toggle", (event) => {
  if (event.target.matches(".nav-dropdown") && event.target.open) {
    closeDropdowns(event.target);
  }
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDropdowns();
});

async function init() {
  await loadCmsData();
  setupCalculatorProduct();
  renderNavigationCategories();
  renderSectionDirectories();
  renderCategoryPage();
  renderBlogPage();
  renderReviewsPage();
  renderAdminPage();
  renderCartPage();
  render();
}

if (form) form.addEventListener("input", render);
window.addEventListener("resize", render);
init();

