const brands = [
  { name: "BMW", logo: "media/logos/bmw.png" },
  { name: "Audi", logo: "media/logos/audi.png" },
  { name: "Mercedes-Benz", logo: "media/logos/mercedes-benz.png" },
  { name: "Tesla", logo: "media/logos/tesla.png" },
  { name: "Porsche", logo: "media/logos/porsche.png" },
  { name: "Toyota", logo: "media/logos/toyota.png" },
  { name: "Volkswagen", logo: "media/logos/volkswagen.png" },
  { name: "Range Rover", logo: "media/logos/range-rover.png" },
  { name: "Skoda", logo: "media/logos/skoda.png" },
];

const state = {
  cars: [],
  favorites: new Set(),
  userAds: [],
  messages: [],
  activeConversation: null,
  user: null,
  authMode: "login",
};

const fallbackImage = "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1100&q=82";
const formatUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const formatNumber = new Intl.NumberFormat("uk-UA");
const byId = (id) => document.getElementById(id);
const page = document.body.dataset.page || "home";
const localHostnames = new Set(["localhost", "127.0.0.1"]);
const shouldRedirectToServer =
  location.protocol === "file:" || (localHostnames.has(location.hostname) && location.port !== "3000");

if (shouldRedirectToServer) {
  const serverPage = page === "catalog" ? "catalog.html" : page === "car" ? "car.html" : "";
  location.replace(`http://localhost:3000/${serverPage}${location.search}${location.hash}`);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: options.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options.headers },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Не вдалося виконати запит");
  return data;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function carCard(car) {
  const isFavorite = state.favorites.has(Number(car.id));
  const isSold = car.status === "sold";
  const title = `${escapeHtml(car.brand)} ${escapeHtml(car.model)}`;
  return `
    <article class="car-card ${isSold ? "is-sold" : ""}" data-car-id="${Number(car.id)}" role="link" tabindex="0">
      <div class="car-photo">
        <img src="${escapeHtml(car.image || fallbackImage)}" alt="${title}" loading="lazy">
        ${isSold ? '<span class="sold-badge">Продано</span>' : ""}
        <button class="favorite-toggle ${isFavorite ? "active" : ""}" type="button" data-favorite="${Number(car.id)}" aria-label="Додати в обране" ${isSold ? "hidden" : ""}>
          <i data-lucide="heart"></i>
        </button>
      </div>
      <div class="car-body">
        <div class="car-title-row"><h3>${title}</h3><div class="price">${formatUsd.format(car.price)}</div></div>
        <div class="meta-row">
          <span>${Number(car.year)}</span><span>${formatNumber.format(car.mileage)} км</span><span>${escapeHtml(car.city)}</span>
          <span class="views-meta"><i data-lucide="eye"></i>${formatNumber.format(Number(car.views || 0))}</span>
        </div>
      </div>
    </article>`;
}

function openLayer(element) {
  if (!element) return;
  element.classList.add("open");
  element.setAttribute("aria-hidden", "false");
  document.body.classList.add("locked");
  refreshIcons();
}

function closeLayer(element) {
  if (!element) return;
  element.classList.remove("open");
  element.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".modal.open, .dashboard.open")) document.body.classList.remove("locked");
}

function showStatus(id, message, isError = true) {
  const element = byId(id);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("success", !isError);
}

function ensureMessagesUi() {
  if (byId("messagesModal")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal messages-modal" id="messagesModal" aria-hidden="true">
      <section class="messages-shell" role="dialog" aria-modal="true" aria-labelledby="messagesTitle">
        <header class="messages-heading">
          <div><p class="eyebrow">KovAuto</p><h2 id="messagesTitle">Повідомлення</h2></div>
          <button class="icon-button plain" id="closeMessages" type="button" aria-label="Закрити"><i data-lucide="x"></i></button>
        </header>
        <div class="messages-layout">
          <aside class="conversation-list" id="conversationList"></aside>
          <section class="message-pane">
            <header class="message-pane-heading" id="messageConversationTitle">Оберіть діалог</header>
            <div class="message-thread" id="messageThread"><p class="message-empty">Тут з'явиться ваша переписка.</p></div>
            <form class="message-form" id="messageForm" hidden>
              <textarea id="messageInput" maxlength="2000" rows="2" placeholder="Напишіть повідомлення..." required></textarea>
              <button class="primary-button" type="submit" aria-label="Надіслати"><i data-lucide="send"></i><span>Надіслати</span></button>
            </form>
            <p class="form-status message-status" id="messageStatus"></p>
          </section>
        </div>
      </section>
    </div>`);
}

function conversationKey(carId, otherUserId) {
  return `${Number(carId)}:${Number(otherUserId)}`;
}

function getConversations() {
  if (!state.user) return [];
  const grouped = new Map();
  for (const message of state.messages) {
    const mine = Number(message.senderId) === Number(state.user.id);
    const otherUserId = mine ? Number(message.recipientId) : Number(message.senderId);
    const otherName = mine ? message.recipientName : message.senderName;
    const key = conversationKey(message.carId, otherUserId);
    if (!grouped.has(key)) grouped.set(key, {
      key, carId: Number(message.carId), otherUserId, otherName,
      carTitle: `${message.brand} ${message.model}`, image: message.image, messages: [], unread: 0,
    });
    const conversation = grouped.get(key);
    conversation.messages.push(message);
    if (!mine && !message.readAt) conversation.unread += 1;
  }
  return [...grouped.values()].sort((a, b) => {
    const aLast = a.messages.at(-1);
    const bLast = b.messages.at(-1);
    return new Date(bLast.createdAt) - new Date(aLast.createdAt) || Number(bLast.id) - Number(aLast.id);
  });
}

function renderMessageCount() {
  const unread = state.messages.filter((message) => Number(message.recipientId) === Number(state.user?.id) && !message.readAt).length;
  if (byId("messagesCount")) {
    byId("messagesCount").textContent = unread;
    byId("messagesCount").hidden = unread === 0;
  }
}

function renderMessages() {
  const conversations = getConversations();
  const list = byId("conversationList");
  if (!list) return;
  list.innerHTML = conversations.map((conversation) => {
    const last = conversation.messages.at(-1);
    return `<button class="conversation-item ${state.activeConversation?.key === conversation.key ? "active" : ""}" type="button" data-conversation="${conversation.key}">
      <img src="${escapeHtml(conversation.image || fallbackImage)}" alt="">
      <span class="conversation-copy"><strong>${escapeHtml(conversation.otherName)}</strong><small>${escapeHtml(conversation.carTitle)}</small><span>${escapeHtml(last.body)}</span></span>
      ${conversation.unread ? `<b>${conversation.unread}</b>` : ""}
    </button>`;
  }).join("") || '<p class="conversation-empty">Ще немає діалогів.<br>Відкрийте оголошення, щоб написати продавцю.</p>';

  const active = state.activeConversation && (conversations.find((item) => item.key === state.activeConversation.key) || state.activeConversation);
  if (!active) {
    byId("messageConversationTitle").textContent = "Оберіть діалог";
    byId("messageThread").innerHTML = '<p class="message-empty">Тут з\'явиться ваша переписка.</p>';
    byId("messageForm").hidden = true;
  } else {
    state.activeConversation = active;
    byId("messageConversationTitle").innerHTML = `<strong>${escapeHtml(active.otherName)}</strong><span>${escapeHtml(active.carTitle)}</span>`;
    byId("messageThread").innerHTML = (active.messages || []).map((message) => `
      <div class="message-bubble ${Number(message.senderId) === Number(state.user.id) ? "mine" : ""}">
        <p>${escapeHtml(message.body)}</p><time>${new Date(message.createdAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
      </div>`).join("") || '<p class="message-empty">Почніть розмову з продавцем.</p>';
    byId("messageForm").hidden = false;
    byId("messageThread").scrollTop = byId("messageThread").scrollHeight;
  }
  renderMessageCount();
  refreshIcons();
}

async function loadMessages() {
  if (!state.user) state.messages = [];
  else state.messages = (await api("/api/messages")).messages;
  renderMessageCount();
}

async function selectConversation(conversation, markRead = true) {
  state.activeConversation = conversation;
  renderMessages();
  if (markRead && state.user) {
    await api("/api/messages/read", { method: "PATCH", body: JSON.stringify({ carId: conversation.carId, otherUserId: conversation.otherUserId }) });
    await loadMessages();
    renderMessages();
  }
}

async function openMessages() {
  if (!state.user) {
    setAuthMode("login");
    return openLayer(byId("authModal"));
  }
  await loadMessages();
  renderMessages();
  openLayer(byId("messagesModal"));
}

async function startSellerConversation() {
  const car = state.cars[0];
  if (!car) return;
  if (!state.user) {
    setAuthMode("login");
    return openLayer(byId("authModal"));
  }
  if (Number(car.ownerId) === Number(state.user.id)) return openMessages();
  await loadMessages();
  const key = conversationKey(car.id, car.ownerId);
  const existing = getConversations().find((item) => item.key === key);
  await selectConversation(existing || {
    key, carId: Number(car.id), otherUserId: Number(car.ownerId), otherName: car.sellerName || "Продавець",
    carTitle: `${car.brand} ${car.model}`, image: car.image, messages: [], unread: 0,
  }, false);
  openLayer(byId("messagesModal"));
  byId("messageInput")?.focus();
}

async function submitMessage(event) {
  event.preventDefault();
  const conversation = state.activeConversation;
  const body = byId("messageInput").value.trim();
  if (!conversation || !body) return;
  try {
    await api("/api/messages", { method: "POST", body: JSON.stringify({ carId: conversation.carId, recipientId: conversation.otherUserId, body }) });
    byId("messageInput").value = "";
    await loadMessages();
    const refreshed = getConversations().find((item) => item.key === conversation.key);
    if (refreshed) state.activeConversation = refreshed;
    renderMessages();
    showStatus("messageStatus", "");
  } catch (error) {
    showStatus("messageStatus", error.message);
  }
}

function renderBrands() {
  const grid = byId("brandGrid");
  if (grid) {
    grid.innerHTML = brands.map(({ name, logo }) => `
      <button class="brand-card" type="button" data-brand-choice="${escapeHtml(name)}">
        <span class="brand-logo"><img src="${escapeHtml(logo)}" alt="${escapeHtml(name)} logo" loading="lazy"></span>
        <strong>${escapeHtml(name)}</strong>
      </button>`).join("");
  }

  for (const select of [byId("brandFilter"), byId("catalogBrand"), byId("adBrand")].filter(Boolean)) {
    if (select.options.length === 1) select.insertAdjacentHTML("beforeend", brands.map(({ name }) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join(""));
  }
}

async function loadCars(query = "") {
  const data = await api(`/api/cars${query ? `?${query}` : ""}`);
  state.cars = data.cars;
  return state.cars;
}

function renderHomeCars() {
  const carousel = byId("popularCarousel");
  const grid = byId("listingGrid");
  if (carousel) carousel.innerHTML = state.cars.slice(0, 6).map(carCard).join("");
  if (grid) grid.innerHTML = state.cars.slice(0, 9).map(carCard).join("");
  refreshIcons();
}

function renderMyAds() {
  const container = byId("myAds");
  if (!container) return;
  container.innerHTML = state.userAds.map((car) => `
    <article class="my-ad ${car.status === "sold" ? "is-sold" : ""}">
      <img src="${escapeHtml(car.image || fallbackImage)}" alt="${escapeHtml(car.brand)} ${escapeHtml(car.model)}">
      <div><strong>${escapeHtml(car.brand)} ${escapeHtml(car.model)}</strong><span>${car.year} · ${formatNumber.format(car.mileage)} км · ${formatUsd.format(car.price)}</span><span class="my-ad-views"><i data-lucide="eye"></i>${formatNumber.format(Number(car.views || 0))} переглядів</span>${car.status === "sold" ? '<span class="my-ad-status">Продано</span>' : ""}</div>
      <div class="ad-actions">
        <button type="button" data-status="${car.id}" data-next-status="${car.status === "sold" ? "active" : "sold"}" aria-label="${car.status === "sold" ? "Повернути у продаж" : "Позначити проданим"}" title="${car.status === "sold" ? "Повернути у продаж" : "Позначити проданим"}"><i data-lucide="${car.status === "sold" ? "rotate-ccw" : "circle-check-big"}"></i></button>
        <button type="button" data-edit="${car.id}" aria-label="Редагувати"><i data-lucide="pencil"></i></button>
        <button type="button" data-delete="${car.id}" aria-label="Видалити"><i data-lucide="trash-2"></i></button>
      </div>
    </article>`).join("") || "<p>Поки що немає ваших оголошень.</p>";
  refreshIcons();
}

async function loadCarDetails() {
  const id = Number(new URLSearchParams(location.search).get("id"));
  if (!Number.isInteger(id) || id < 1) throw new Error("Некоректний номер оголошення");
  const data = await api(`/api/cars/${id}`);
  state.cars = [data.car];
  return data.car;
}

function renderCarDetails() {
  const car = state.cars[0];
  if (!car || !byId("vehicleDetail")) return;
  const title = `${car.brand} ${car.model}`;
  const image = byId("detailImage");
  image.src = car.image || fallbackImage;
  image.alt = title;
  byId("detailTitle").textContent = title;
  byId("detailPrice").textContent = formatUsd.format(car.price);
  byId("detailViews").innerHTML = `<i data-lucide="eye"></i>${formatNumber.format(Number(car.views || 0))} переглядів`;
  byId("detailDescription").textContent = car.description || "Продавець ще не додав опис автомобіля.";
  byId("sellerName").textContent = car.sellerName || "KovAuto";
  if (byId("messageSellerButton")) byId("messageSellerButton").hidden = Number(car.ownerId) === Number(state.user?.id);
  byId("detailSoldBadge").hidden = car.status !== "sold";
  document.title = `${title} - KovAuto`;

  const engine = car.engineVolume ? `${Number(car.engineVolume).toFixed(1)} л` : car.brand === "Tesla" ? "Електро" : "Не вказано";
  const specs = [
    ["Марка", car.brand],
    ["Об'єм двигуна", engine],
    ["Пробіг", `${formatNumber.format(car.mileage)} км`],
    ["Місто", car.city],
    ["Рік випуску", car.year],
    ["Модель", car.model],
  ];
  byId("specGrid").innerHTML = specs.map(([label, value]) => `
    <div class="spec-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join("");

  const favorite = byId("detailFavorite");
  const isFavorite = state.favorites.has(Number(car.id));
  favorite.dataset.favorite = car.id;
  favorite.classList.toggle("active", isFavorite && car.status !== "sold");
  favorite.disabled = car.status === "sold";
  favorite.querySelector("span").textContent = car.status === "sold" ? "Автомобіль продано" : isFavorite ? "В обраному" : "Додати в обране";
  refreshIcons();
}

function updateAccountUi() {
  if (byId("loginButton")) byId("loginButton").textContent = state.user ? "Кабінет" : "Вхід";
  if (byId("registerButton")) byId("registerButton").hidden = Boolean(state.user);
  if (byId("accountName")) byId("accountName").textContent = state.user ? `${state.user.name} · ${state.user.email}` : "";
  if (byId("favoritesCount")) byId("favoritesCount").textContent = state.favorites.size;
  renderMessageCount();
}

async function loadAccountData() {
  if (!state.user) {
    state.favorites.clear();
    state.userAds = [];
    state.messages = [];
    state.activeConversation = null;
  } else {
    const [favorites, ads, messages] = await Promise.all([api("/api/favorites"), api("/api/cars/mine"), api("/api/messages")]);
    state.favorites = new Set(favorites.ids.map(Number));
    state.userAds = ads.cars;
    state.messages = messages.messages;
  }
  updateAccountUi();
  renderMyAds();
}

async function loadSession() {
  const data = await api("/api/auth/me");
  state.user = data.user;
  await loadAccountData();
}

function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.classList.toggle("active", button.dataset.authMode === mode));
  const nameField = byId("authNameField");
  if (nameField) nameField.hidden = mode !== "register";
  const password = byId("authPassword") || byId("authForm")?.querySelector('input[type="password"]');
  if (password) password.autocomplete = mode === "register" ? "new-password" : "current-password";
  const submit = byId("authSubmit") || byId("authForm")?.querySelector('button[type="submit"]');
  if (submit) submit.textContent = mode === "register" ? "Створити акаунт" : "Увійти";
  if (byId("authTitle")) byId("authTitle").textContent = mode === "register" ? "Створіть акаунт" : "Увійдіть до акаунта";
  showStatus("authStatus", "");
}

async function submitAuth(event) {
  event.preventDefault();
  const passwordInput = byId("authPassword") || event.currentTarget.querySelector('input[type="password"]');
  const payload = { email: byId("authEmail").value.trim(), password: passwordInput.value };
  if (state.authMode === "register") payload.name = byId("authName").value.trim();
  try {
    const data = await api(`/api/auth/${state.authMode}`, { method: "POST", body: JSON.stringify(payload) });
    state.user = data.user;
    await loadAccountData();
    if (page === "catalog") await loadCatalogCars();
    closeLayer(byId("authModal"));
    event.currentTarget.reset();
    openLayer(byId("dashboard"));
    renderCurrentCars();
  } catch (error) {
    showStatus("authStatus", error.message);
  }
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  state.user = null;
  await loadAccountData();
  if (page === "catalog") await loadCatalogCars();
  closeLayer(byId("dashboard"));
  renderCurrentCars();
}

function openDashboard() {
  if (!state.user) {
    setAuthMode("login");
    openLayer(byId("authModal"));
    return;
  }
  if (!byId("dashboard")) {
    location.href = "index.html";
    return;
  }
  resetAdForm();
  openLayer(byId("dashboard"));
}

function resetAdForm() {
  if (!byId("adForm")) return;
  byId("editId").value = "";
  byId("adForm").reset();
  showStatus("adStatus", "");
}

async function uploadPhoto() {
  const file = byId("adPhoto")?.files?.[0];
  if (!file) return "";
  const form = new FormData();
  form.append("photo", file);
  const data = await api("/api/uploads", { method: "POST", body: form });
  return data.url;
}

async function submitAd(event) {
  event.preventDefault();
  if (!state.user) return openDashboard();
  const existingId = byId("editId").value;
  try {
    showStatus("adStatus", "Зберігаємо...", false);
    const uploadedImage = await uploadPhoto();
    const payload = {
      brand: byId("adBrand").value.trim(), model: byId("adModel").value.trim(), city: byId("adCity").value.trim(),
      engineVolume: byId("adEngine")?.value || null,
      year: Number(byId("adYear").value), price: Number(byId("adPrice").value), mileage: Number(byId("adMileage").value),
      image: uploadedImage || byId("adImage").value.trim(),
      description: byId("adDescription")?.value.trim() || "",
    };
    await api(existingId ? `/api/cars/${existingId}` : "/api/cars", { method: existingId ? "PATCH" : "POST", body: JSON.stringify(payload) });
    resetAdForm();
    await Promise.all([loadAccountData(), page === "catalog" ? loadCatalogCars() : loadCars()]);
    renderCurrentCars();
    showStatus("adStatus", "Оголошення збережено", false);
  } catch (error) {
    showStatus("adStatus", error.message);
  }
}

function editAd(id) {
  const ad = state.userAds.find((item) => Number(item.id) === Number(id));
  if (!ad) return;
  byId("editId").value = ad.id;
  byId("adBrand").value = ad.brand;
  byId("adModel").value = ad.model;
  if (byId("adEngine")) byId("adEngine").value = ad.engineVolume || "";
  byId("adCity").value = ad.city;
  byId("adYear").value = ad.year;
  byId("adPrice").value = ad.price;
  byId("adMileage").value = ad.mileage;
  byId("adImage").value = ad.image || "";
  if (byId("adDescription")) byId("adDescription").value = ad.description || "";
  byId("adBrand").focus();
}

async function deleteAd(id) {
  if (!window.confirm("Видалити це оголошення?")) return;
  try {
    await api(`/api/cars/${id}`, { method: "DELETE" });
    await Promise.all([loadAccountData(), page === "catalog" ? loadCatalogCars() : loadCars()]);
    renderCurrentCars();
  } catch (error) {
    showStatus("adStatus", error.message);
  }
}

async function updateAdStatus(id, status) {
  try {
    await api(`/api/cars/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    await Promise.all([loadAccountData(), page === "catalog" ? loadCatalogCars() : loadCars()]);
    renderCurrentCars();
  } catch (error) {
    showStatus("adStatus", error.message);
  }
}

async function handleFavorite(id) {
  if (!state.user) {
    setAuthMode("login");
    return openLayer(byId("authModal"));
  }
  const active = state.favorites.has(id);
  await api(`/api/favorites/${id}`, { method: active ? "DELETE" : "PUT" });
  active ? state.favorites.delete(id) : state.favorites.add(id);
  updateAccountUi();
  renderCurrentCars();
}

function homeSearchUrl() {
  const params = new URLSearchParams();
  const values = { brand: byId("brandFilter")?.value, model: byId("modelFilter")?.value.trim(), year: byId("yearFilter")?.value, price: byId("priceFilter")?.value };
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return `catalog.html${params.size ? `?${params}` : ""}`;
}

function catalogParamsFromForm() {
  const params = new URLSearchParams();
  const values = {
    brand: byId("catalogBrand").value, model: byId("catalogModel").value.trim(), year: byId("catalogYear").value,
    city: byId("catalogCity").value.trim(), price: byId("catalogPrice").value,
    mileage: byId("catalogMileage").value, sort: byId("catalogSort").value,
  };
  for (const [key, value] of Object.entries(values)) if (value && !(key === "sort" && value === "recommended")) params.set(key, value);
  return params;
}

function fillCatalogForm(params) {
  byId("catalogBrand").value = params.get("brand") || "";
  byId("catalogModel").value = params.get("model") || "";
  byId("catalogCity").value = params.get("city") || "";
  byId("catalogYear").value = params.get("year") || "";
  byId("catalogPrice").value = params.get("price") || "";
  byId("catalogMileage").value = params.get("mileage") || "";
  byId("catalogSort").value = params.get("sort") || "recommended";
}

async function loadCatalogCars(updateUrl = false) {
  const params = catalogParamsFromForm();
  const favoritesOnly = new URLSearchParams(location.search).get("favorites") === "1";
  if (updateUrl) history.replaceState(null, "", `catalog.html${params.size ? `?${params}` : ""}`);
  await loadCars(params.toString());
  if (favoritesOnly) state.cars = state.cars.filter((car) => state.favorites.has(Number(car.id)));
}

function renderCatalogCars() {
  const grid = byId("catalogGrid");
  if (!grid) return;
  grid.innerHTML = state.cars.map(carCard).join("");
  byId("catalogEmpty").hidden = state.cars.length > 0;
  refreshIcons();
}

function renderCurrentCars() {
  if (page === "catalog") renderCatalogCars();
  else if (page === "car") renderCarDetails();
  else renderHomeCars();
}

function initObservers() {
  if (!("IntersectionObserver" in window)) return;
  const revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("visible")), { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));
}

function bindSharedEvents() {
  byId("menuButton")?.addEventListener("click", () => document.querySelector(".main-nav")?.classList.toggle("open"));
  byId("loginButton")?.addEventListener("click", () => {
    if (state.user) return openDashboard();
    setAuthMode("login");
    openLayer(byId("authModal"));
  });
  byId("registerButton")?.addEventListener("click", () => {
    setAuthMode("register");
    openLayer(byId("authModal"));
  });
  byId("closeAuth")?.addEventListener("click", () => closeLayer(byId("authModal")));
  byId("closeDashboard")?.addEventListener("click", () => closeLayer(byId("dashboard")));
  byId("authForm")?.addEventListener("submit", submitAuth);
  byId("adForm")?.addEventListener("submit", submitAd);
  byId("logoutButton")?.addEventListener("click", logout);
  byId("favoritesButton")?.addEventListener("click", () => {
    if (state.user) location.href = "catalog.html?favorites=1";
    else { setAuthMode("login"); openLayer(byId("authModal")); }
  });
  byId("messagesButton")?.addEventListener("click", openMessages);
  byId("closeMessages")?.addEventListener("click", () => closeLayer(byId("messagesModal")));
  byId("messageForm")?.addEventListener("submit", submitMessage);
  byId("messageSellerButton")?.addEventListener("click", startSellerConversation);
  document.querySelectorAll("[data-open-dashboard]").forEach((button) => button.addEventListener("click", openDashboard));
  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));

  document.addEventListener("click", (event) => {
    const favorite = event.target.closest("[data-favorite]");
    const car = event.target.closest("[data-car-id]");
    const brand = event.target.closest("[data-brand-choice]");
    const edit = event.target.closest("[data-edit]");
    const remove = event.target.closest("[data-delete]");
    const status = event.target.closest("[data-status]");
    const conversation = event.target.closest("[data-conversation]");
    if (conversation) {
      const selected = getConversations().find((item) => item.key === conversation.dataset.conversation);
      if (selected) selectConversation(selected);
      return;
    }
    if (favorite) {
      handleFavorite(Number(favorite.dataset.favorite));
      return;
    }
    if (brand) location.href = `catalog.html?brand=${encodeURIComponent(brand.dataset.brandChoice)}`;
    if (edit) editAd(Number(edit.dataset.edit));
    if (remove) deleteAd(Number(remove.dataset.delete));
    if (status) updateAdStatus(Number(status.dataset.status), status.dataset.nextStatus);
    if (car) location.href = `car.html?id=${encodeURIComponent(car.dataset.carId)}`;
    if (event.target.classList.contains("modal") || event.target.classList.contains("dashboard")) closeLayer(event.target);
  });
  document.addEventListener("keydown", (event) => {
    const car = event.target.closest?.("[data-car-id]");
    if (car && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      location.href = `car.html?id=${encodeURIComponent(car.dataset.carId)}`;
      return;
    }
    if (event.key === "Escape") { closeLayer(byId("authModal")); closeLayer(byId("dashboard")); closeLayer(byId("messagesModal")); }
  });
}

function bindHomeEvents() {
  byId("searchNavLink")?.addEventListener("click", (event) => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
    history.replaceState(null, "", `${location.pathname}${location.search}#top`);
  });
  byId("heroSearch")?.addEventListener("submit", (event) => { event.preventDefault(); location.href = homeSearchUrl(); });
  byId("sortSelect")?.addEventListener("change", (event) => { location.href = `catalog.html?sort=${encodeURIComponent(event.target.value)}`; });
  byId("scrollLeft")?.addEventListener("click", () => byId("popularCarousel").scrollBy({ left: -390, behavior: "smooth" }));
  byId("scrollRight")?.addEventListener("click", () => byId("popularCarousel").scrollBy({ left: 390, behavior: "smooth" }));
}

function bindCatalogEvents() {
  const form = byId("catalogFilterForm");
  form.addEventListener("submit", async (event) => { event.preventDefault(); await loadCatalogCars(true); renderCatalogCars(); });
  byId("catalogSort").addEventListener("change", () => form.requestSubmit());
  for (const input of form.querySelectorAll("select, input[type='checkbox']")) input.addEventListener("change", () => form.requestSubmit());
  let debounce;
  for (const input of form.querySelectorAll("input[type='search'], input[type='number']")) {
    input.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(() => form.requestSubmit(), 450); });
  }
  byId("filterReset").addEventListener("click", async () => {
    form.reset(); byId("catalogSort").value = "recommended"; await loadCatalogCars(true); renderCatalogCars();
  });
  byId("filterToggle").addEventListener("click", () => byId("catalogFilters").classList.toggle("open"));
  window.addEventListener("popstate", async () => { fillCatalogForm(new URLSearchParams(location.search)); await loadCatalogCars(); renderCatalogCars(); });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (shouldRedirectToServer) return;
  renderBrands();
  ensureMessagesUi();
  bindSharedEvents();
  setAuthMode("login");
  initObservers();
  try {
    await loadSession();
    if (page === "catalog") {
      fillCatalogForm(new URLSearchParams(location.search));
      bindCatalogEvents();
      await loadCatalogCars();
      renderCatalogCars();
      if (new URLSearchParams(location.search).get("favorites") === "1" && !state.user) openLayer(byId("authModal"));
    } else if (page === "car") {
      await loadCarDetails();
      renderCarDetails();
    } else {
      bindHomeEvents();
      await loadCars();
      renderHomeCars();
    }
  } catch (error) {
    console.error(error);
    const target = byId("catalogGrid") || byId("listingGrid") || byId("vehicleDetail");
    if (target) target.innerHTML = `<p class="load-error">${escapeHtml(error.message)}. Запустіть сайт через сервер.</p>`;
  }
  refreshIcons();
});
