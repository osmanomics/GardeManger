const pantryStaples = ["salt", "pepper", "olive oil", "oil", "water", "butter", "flour", "vinegar", "sugar"];

const aliasMap = new Map([
  ["tomato", "tomatoes"],
  ["beans", "canned beans"],
  ["bean", "canned beans"],
  ["greens", "spinach"],
  ["leafy greens", "spinach"],
  ["herb", "herbs"],
  ["lemon", "lemons"],
  ["potato", "potatoes"],
  ["mushroom", "mushrooms"],
  ["onion", "onions"],
  ["carrot", "carrots"],
  ["egg", "eggs"],
]);

const fallbackRecipes = [
  {
    name: "Tomato Spinach Frittata",
    time: 18,
    serves: 2,
    level: "Easy",
    vegetarian: true,
    ingredients: ["eggs", "tomatoes", "spinach", "onions", "cheese", "olive oil", "salt", "pepper"],
    steps: ["Soften onions and tomatoes in oil.", "Fold in spinach, beaten eggs, and cheese.", "Cook covered until set, then finish under heat if needed."],
  },
  {
    name: "Pantry Bean Rice Bowl",
    time: 22,
    serves: 3,
    level: "Easy",
    vegetarian: true,
    ingredients: ["rice", "canned beans", "tomatoes", "onions", "garlic", "olive oil", "salt", "pepper"],
    steps: ["Warm beans with garlic, onions, and tomatoes.", "Spoon over hot rice.", "Finish with oil, pepper, and any herbs."],
  },
  {
    name: "Creamy Garlic Pasta",
    time: 20,
    serves: 2,
    level: "Easy",
    vegetarian: true,
    ingredients: ["pasta", "garlic", "yogurt", "cheese", "spinach", "salt", "pepper"],
    steps: ["Boil pasta and reserve a splash of water.", "Stir yogurt, cheese, garlic, and pasta water into a sauce.", "Toss with spinach until glossy."],
  },
  {
    name: "Carrot Tomato Soup",
    time: 32,
    serves: 4,
    level: "Medium",
    vegetarian: true,
    ingredients: ["carrots", "tomatoes", "onions", "garlic", "water", "olive oil", "salt", "pepper"],
    steps: ["Roast or saute carrots, onions, and garlic.", "Simmer with tomatoes and water.", "Blend until smooth and season."],
  },
  {
    name: "Chicken Potato Skillet",
    time: 28,
    serves: 3,
    level: "Medium",
    vegetarian: false,
    ingredients: ["chicken", "potatoes", "onions", "garlic", "herbs", "olive oil", "salt", "pepper"],
    steps: ["Brown diced potatoes in oil.", "Add chicken, onions, garlic, and herbs.", "Cook until the chicken is done and potatoes are crisp."],
  },
  {
    name: "Mushroom Cheese Toast",
    time: 14,
    serves: 2,
    level: "Easy",
    vegetarian: true,
    ingredients: ["bread", "mushrooms", "cheese", "garlic", "butter", "pepper"],
    steps: ["Cook mushrooms with butter and garlic.", "Pile onto bread with cheese.", "Toast until melted and browned."],
  },
  {
    name: "Tuna Tomato Pasta",
    time: 19,
    serves: 2,
    level: "Easy",
    vegetarian: false,
    ingredients: ["pasta", "canned tuna", "tomatoes", "onions", "garlic", "olive oil", "salt", "pepper"],
    steps: ["Cook pasta until al dente.", "Make a quick tomato, onion, and garlic sauce.", "Fold in tuna and pasta."],
  },
  {
    name: "Lentil Carrot Stew",
    time: 35,
    serves: 4,
    level: "Easy",
    vegetarian: true,
    ingredients: ["lentils", "carrots", "onions", "garlic", "tomatoes", "water", "salt", "pepper"],
    steps: ["Simmer lentils with carrots, onions, garlic, and tomatoes.", "Add water as needed until tender.", "Season heavily with pepper."],
  },
  {
    name: "Lemon Herb Yogurt Chicken",
    time: 24,
    serves: 2,
    level: "Medium",
    vegetarian: false,
    ingredients: ["chicken", "yogurt", "lemons", "herbs", "garlic", "olive oil", "salt", "pepper"],
    steps: ["Coat chicken with yogurt, lemon, garlic, and herbs.", "Sear in a hot pan.", "Rest, slice, and spoon sauce over the top."],
  },
  {
    name: "Rice Pudding",
    time: 26,
    serves: 3,
    level: "Easy",
    vegetarian: true,
    ingredients: ["rice", "milk", "sugar", "butter", "salt"],
    steps: ["Simmer cooked rice with milk.", "Stir in sugar, butter, and a small pinch of salt.", "Cook until creamy."],
  },
];

const STORAGE_KEY = "garde:pantry:v1";
const RECIPE_CACHE_KEY = "garde:recipe-cache:v1";
const DEFAULT_INGREDIENTS = ["eggs", "tomatoes", "spinach", "pasta", "rice", "canned beans"];
const NATIVE_SCAN_TIMEOUT_MS = 75_000;
const PLACEHOLDER_IMAGE = "assets/pantry-placeholder.png";
const SCAN_READY_STATUSES = new Set(["queued", "error"]);
const MAX_RECIPE_CACHE_ENTRIES = 18;
const SCAN_IMAGE_MAX_WIDTH = 1024;
const SCAN_IMAGE_QUALITY = 0.74;
let nativeScanRequestId = 0;
let nativeRecipeRequestId = 0;
let scanPhotoId = 0;
let pendingDetectionId = 0;
let recipeRefreshTimer = 0;
let recipeRequestId = 0;
let lastRecipeSignature = "";
let recipeCache = loadRecipeCache();

const state = {
  ingredients: new Set(DEFAULT_INGREDIENTS),
  detectionMeta: new Map(DEFAULT_INGREDIENTS.map((name) => [name, { confidence: 1, source: "starter" }])),
  recipes: fallbackRecipes,
  pendingDetections: [],
  scanPhotos: [],
  activePhotoId: null,
  cart: new Set(),
  filter: "all",
  latestScanMode: "local",
  recipeMode: "local",
  recipesLoading: false,
};

const els = {
  photoInput: document.querySelector("#photoInput"),
  previewImage: document.querySelector("#previewImage"),
  dropzone: document.querySelector("#dropzone"),
  scanButton: document.querySelector("#scanButton"),
  scanQueue: document.querySelector("#scanQueue"),
  scanStatus: document.querySelector("#scanStatus"),
  ingredientForm: document.querySelector("#ingredientForm"),
  ingredientInput: document.querySelector("#ingredientInput"),
  ingredientList: document.querySelector("#ingredientList"),
  ingredientTemplate: document.querySelector("#ingredientTemplate"),
  recipeTemplate: document.querySelector("#recipeTemplate"),
  recipeList: document.querySelector("#recipeList"),
  recipeSource: document.querySelector("#recipeSource"),
  generateRecipesButton: document.querySelector("#generateRecipesButton"),
  ingredientCount: document.querySelector("#ingredientCount"),
  readyCount: document.querySelector("#readyCount"),
  resetButton: document.querySelector("#resetButton"),
  staplesToggle: document.querySelector("#staplesToggle"),
  vegetarianToggle: document.querySelector("#vegetarianToggle"),
  fastToggle: document.querySelector("#fastToggle"),
  filterButtons: document.querySelectorAll("[data-filter]"),
  quickAdds: document.querySelectorAll("[data-add]"),
  modeBadge: document.querySelector("#modeBadge"),
  reviewPanel: document.querySelector("#reviewPanel"),
  detectionList: document.querySelector("#detectionList"),
  acceptScanButton: document.querySelector("#acceptScanButton"),
  savePantryButton: document.querySelector("#savePantryButton"),
  clearDataButton: document.querySelector("#clearDataButton"),
  cartStrip: document.querySelector("#cartStrip"),
};

function normalizeIngredient(value) {
  const cleaned = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return aliasMap.get(cleaned) || cleaned;
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function availableIngredients() {
  const items = new Set([...state.ingredients].map(normalizeIngredient));
  if (els.staplesToggle.checked) {
    pantryStaples.forEach((item) => items.add(item));
  }
  return items;
}

function getMatches() {
  const available = availableIngredients();

  return state.recipes
    .filter((recipe) => !els.vegetarianToggle.checked || recipe.vegetarian)
    .filter((recipe) => !els.fastToggle.checked || recipe.time <= 25)
    .map((recipe) => {
      const required = recipe.ingredients.map(normalizeIngredient);
      const have = required.filter((item) => available.has(item));
      const missing = required.filter((item) => !available.has(item));
      const percent = Math.round((have.length / required.length) * 100);
      const score = percent + (missing.length === 0 ? 18 : 0) - missing.length * 4 - Math.max(recipe.time - 25, 0) * 0.2;
      return { ...recipe, have, missing, percent, score };
    })
    .filter((recipe) => {
      if (state.filter === "ready") return recipe.missing.length === 0;
      if (state.filter === "close") return recipe.missing.length > 0 && recipe.missing.length <= 2;
      return true;
    })
    .sort((a, b) => b.score - a.score || a.time - b.time);
}

function persistPantry() {
  const payload = {
    ingredients: [...state.ingredients],
    detectionMeta: Object.fromEntries(state.detectionMeta),
    cart: [...state.cart],
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function savePantry() {
  persistPantry();
  setStatus("Pantry saved", "ready");
}

function loadPantry() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    state.ingredients = new Set((parsed.ingredients || []).map(normalizeIngredient).filter(Boolean));
    state.detectionMeta = new Map(Object.entries(parsed.detectionMeta || {}));
    state.cart = new Set((parsed.cart || []).map(normalizeIngredient).filter(Boolean));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function loadRecipeCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECIPE_CACHE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(RECIPE_CACHE_KEY);
    return [];
  }
}

function saveRecipeCache() {
  localStorage.setItem(RECIPE_CACHE_KEY, JSON.stringify(recipeCache.slice(0, MAX_RECIPE_CACHE_ENTRIES)));
}

function setStatus(message, kind = "idle") {
  els.scanStatus.classList.toggle("is-ready", kind === "ready");
  els.scanStatus.classList.toggle("is-scanning", kind === "scanning");
  els.scanStatus.classList.toggle("is-error", kind === "error");
  els.scanStatus.lastElementChild.textContent = message;
}

function setMode(mode, note) {
  state.latestScanMode = mode;
  els.modeBadge.textContent = note || (mode === "ai" ? "AI mode" : "Local mode");
}

function commitPantryChange() {
  render();
  persistPantry();
  scheduleRecipeRefresh();
}

function parseIngredientEntries(value) {
  return String(value || "")
    .split(/[,;\n]+/)
    .map(normalizeIngredient)
    .filter(Boolean);
}

function shouldReplaceMeta(ingredient, meta) {
  const existing = state.detectionMeta.get(ingredient);
  if (!existing) return true;
  if (existing.source === "starter" && meta.source !== "starter") return true;
  return Number(meta.confidence || 0) > Number(existing.confidence || 0);
}

function upsertIngredient(value, meta = { confidence: 1, source: "manual" }) {
  const ingredient = normalizeIngredient(value);
  if (!ingredient) return null;

  const existed = state.ingredients.has(ingredient);
  state.ingredients.add(ingredient);
  state.cart.delete(ingredient);
  state.pendingDetections = state.pendingDetections.filter((item) => item.name !== ingredient);

  if (!existed || shouldReplaceMeta(ingredient, meta)) {
    state.detectionMeta.set(ingredient, meta);
  }

  return { ingredient, added: !existed };
}

function removeIngredient(ingredient) {
  state.ingredients.delete(ingredient);
  state.detectionMeta.delete(ingredient);
  state.cart.delete(ingredient);
  commitPantryChange();
}

function renderIngredients() {
  els.ingredientList.replaceChildren();

  if (state.ingredients.size === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No ingredients yet.";
    els.ingredientList.append(empty);
    return;
  }

  [...state.ingredients].sort().forEach((ingredient) => {
    const chip = els.ingredientTemplate.content.firstElementChild.cloneNode(true);
    const label = chip.querySelector("[data-name]");
    const meta = state.detectionMeta.get(ingredient);
    label.textContent = titleCase(ingredient);

    if (meta?.confidence && meta.confidence < 1) {
      const confidence = document.createElement("small");
      confidence.className = "chip-confidence";
      confidence.textContent = `${Math.round(meta.confidence * 100)}%`;
      chip.insertBefore(confidence, chip.querySelector("button"));
    }

    const removeButton = chip.querySelector("button");
    removeButton.setAttribute("aria-label", `Remove ${ingredient}`);
    removeButton.addEventListener("click", () => removeIngredient(ingredient));
    els.ingredientList.append(chip);
  });
}

function renderScanQueue() {
  els.scanQueue.replaceChildren();
  els.scanQueue.hidden = state.scanPhotos.length === 0;
  updatePreviewImage();
  updateScanButton();

  state.scanPhotos.forEach((photo) => {
    const row = document.createElement("div");
    row.className = "scan-photo";
    row.classList.toggle("is-active", photo.id === state.activePhotoId);

    const select = document.createElement("button");
    select.type = "button";
    select.className = "scan-photo__select";
    select.setAttribute("aria-label", `Preview ${photo.name}`);
    select.addEventListener("click", () => {
      state.activePhotoId = photo.id;
      renderScanQueue();
    });

    const image = document.createElement("img");
    image.src = photo.dataUrl;
    image.alt = "";

    const copy = document.createElement("span");
    copy.className = "scan-photo__copy";

    const name = document.createElement("strong");
    name.textContent = photo.name;

    const details = document.createElement("small");
    details.textContent = scanPhotoLabel(photo);

    copy.append(name, details);
    select.append(image, copy);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "scan-photo__remove";
    remove.setAttribute("aria-label", `Remove ${photo.name}`);
    remove.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
    remove.addEventListener("click", () => removeScanPhoto(photo.id));

    row.append(select, remove);
    els.scanQueue.append(row);
  });
}

function updatePreviewImage() {
  const active = state.scanPhotos.find((photo) => photo.id === state.activePhotoId) || state.scanPhotos.at(-1);
  if (active && state.activePhotoId !== active.id) {
    state.activePhotoId = active.id;
  }

  els.previewImage.src = active?.dataUrl || PLACEHOLDER_IMAGE;
  els.previewImage.alt = active ? `Selected pantry photo: ${active.name}` : "Open pantry and refrigerator shelves";
}

function scanPhotoLabel(photo) {
  if (photo.status === "scanning") return "Scanning";
  if (photo.status === "done") {
    const count = photo.detectionCount || 0;
    const review = photo.reviewCount || 0;
    if (review > 0) return `${review} to review`;
    return `${count} detected`;
  }
  if (photo.status === "error") return photo.error || "Scan failed";
  return "Ready to scan";
}

function updateScanButton() {
  const hasQueued = state.scanPhotos.some((photo) => SCAN_READY_STATUSES.has(photo.status));
  const isScanning = state.scanPhotos.some((photo) => photo.status === "scanning");
  const label = els.scanButton.querySelector("span");

  els.scanButton.disabled = !hasQueued;
  if (label) {
    label.textContent = isScanning && !hasQueued ? "Scanning" : "Scan photos";
  }
}

function removeScanPhoto(photoId) {
  const photo = state.scanPhotos.find((item) => item.id === photoId);
  if (!photo) return;

  state.scanPhotos = state.scanPhotos.filter((item) => item.id !== photoId);
  state.pendingDetections = state.pendingDetections.filter((item) => item.photoId !== photoId);

  if (state.activePhotoId === photoId) {
    state.activePhotoId = state.scanPhotos.at(-1)?.id || null;
  }

  setScanSummaryStatus();
  render();
}

function recipePreferences() {
  return {
    staples: els.staplesToggle.checked,
    vegetarian: els.vegetarianToggle.checked,
    fast: els.fastToggle.checked,
  };
}

function recipeSignature() {
  return JSON.stringify({
    ingredients: [...state.ingredients].sort(),
    preferences: recipePreferences(),
  });
}

function scheduleRecipeRefresh({ force = false } = {}) {
  if (recipeRefreshTimer) {
    window.clearTimeout(recipeRefreshTimer);
  }

  recipeRefreshTimer = window.setTimeout(() => {
    generateRecipes({ force });
  }, force ? 0 : 700);
}

async function generateRecipes({ force = false } = {}) {
  const ingredients = [...state.ingredients].sort();
  if (ingredients.length === 0) {
    state.recipes = fallbackRecipes;
    state.recipeMode = "local";
    state.recipesLoading = false;
    renderRecipes();
    return;
  }

  const signature = recipeSignature();
  if (!force && signature === lastRecipeSignature && state.recipeMode !== "local") return;
  lastRecipeSignature = signature;

  const cached = recipeCache.find((entry) => entry.signature === signature);
  if (!force && cached?.recipes?.length) {
    state.recipes = normalizeRecipes(cached.recipes);
    state.recipeMode = cached.mode || "ai cached";
    state.recipesLoading = false;
    renderRecipes();
    return;
  }

  if (location.protocol === "file:" && !window.webkit?.messageHandlers?.gardeRecipes) {
    state.recipes = fallbackRecipes;
    state.recipeMode = "local";
    state.recipesLoading = false;
    renderRecipes();
    return;
  }

  const requestId = ++recipeRequestId;
  state.recipesLoading = true;
  renderRecipeHeader();

  try {
    const response = await requestRecipes(ingredients, recipePreferences());
    if (requestId !== recipeRequestId) return;

    const generated = normalizeRecipes(response.recipes);
    if (generated.length > 0) {
      state.recipes = generated;
      state.recipeMode = response.mode || "ai";
      rememberRecipes(signature, generated, state.recipeMode);
    } else {
      state.recipes = fallbackRecipes;
      state.recipeMode = "local";
    }
  } catch (error) {
    if (requestId !== recipeRequestId) return;
    state.recipes = fallbackRecipes;
    state.recipeMode = "local";
    console.warn("Recipe generation failed.", error);
  } finally {
    if (requestId === recipeRequestId) {
      state.recipesLoading = false;
      renderRecipes();
    }
  }
}

function rememberRecipes(signature, recipes, mode) {
  recipeCache = [
    { signature, recipes, mode, savedAt: new Date().toISOString() },
    ...recipeCache.filter((entry) => entry.signature !== signature),
  ].slice(0, MAX_RECIPE_CACHE_ENTRIES);
  saveRecipeCache();
}

async function requestRecipes(ingredients, preferences) {
  if (window.webkit?.messageHandlers?.gardeRecipes) {
    return requestNativeRecipes(ingredients, preferences);
  }

  const res = await fetch("/api/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredients, preferences }),
  });

  if (!res.ok) {
    throw new Error(`Recipe generation failed with ${res.status}`);
  }

  return res.json();
}

function requestNativeRecipes(ingredients, preferences) {
  const requestId = `recipes-${Date.now()}-${++nativeRecipeRequestId}`;
  window.gardeNativeRecipeCallbacks ||= {};

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      delete window.gardeNativeRecipeCallbacks[requestId];
      reject(new Error("AI recipes timed out."));
    }, NATIVE_SCAN_TIMEOUT_MS);

    window.gardeNativeRecipeCallbacks[requestId] = {
      resolve: (payload) => {
        window.clearTimeout(timeout);
        resolve(payload);
      },
      reject: (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    };

    window.webkit.messageHandlers.gardeRecipes.postMessage({ requestId, ingredients, preferences });
  });
}

window.gardeNativeRecipesComplete = function gardeNativeRecipesComplete(requestId, payload = {}) {
  const callback = window.gardeNativeRecipeCallbacks?.[requestId];
  if (!callback) return;

  delete window.gardeNativeRecipeCallbacks[requestId];
  if (payload.error) {
    callback.reject(new Error(payload.error));
    return;
  }

  callback.resolve(payload);
};

function normalizeRecipes(items = []) {
  const seen = new Set();
  return items
    .map((item) => ({
      name: String(item.name || "").trim(),
      time: Math.round(clamp(Number(item.time) || 25, 5, 90)),
      serves: Math.round(clamp(Number(item.serves) || 2, 1, 8)),
      level: ["Easy", "Medium", "Hard"].includes(item.level) ? item.level : "Easy",
      vegetarian: item.vegetarian === true,
      ingredients: Array.isArray(item.ingredients) ? item.ingredients.map(normalizeIngredient).filter(Boolean).slice(0, 12) : [],
      steps: Array.isArray(item.steps) ? item.steps.map((step) => String(step || "").trim()).filter(Boolean).slice(0, 6) : [],
    }))
    .filter((item) => {
      const key = normalizeIngredient(item.name);
      if (!key || seen.has(key) || item.ingredients.length < 3 || item.steps.length < 2) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function renderReview() {
  els.detectionList.replaceChildren();
  els.reviewPanel.hidden = state.pendingDetections.length === 0;

  state.pendingDetections.forEach((detection) => {
    const row = document.createElement("div");
    row.className = "detection-row";

    const label = document.createElement("span");
    label.textContent = titleCase(detection.name);

    const meta = document.createElement("small");
    const photoLabel = detection.photoNames?.length ? ` - ${formatList(detection.photoNames)}` : "";
    meta.textContent = `${Math.round(detection.confidence * 100)}%${photoLabel}`;

    const actions = document.createElement("span");
    actions.className = "detection-actions";

    const accept = document.createElement("button");
    accept.type = "button";
    accept.textContent = "Add";
    accept.addEventListener("click", () => acceptDetection(detection.id));

    const reject = document.createElement("button");
    reject.type = "button";
    reject.textContent = "Skip";
    reject.addEventListener("click", () => rejectDetection(detection.id));

    actions.append(accept, reject);
    row.append(label, meta, actions);
    els.detectionList.append(row);
  });
}

function renderRecipes() {
  const matches = getMatches();
  renderRecipeHeader();
  els.recipeList.replaceChildren();

  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No recipes match the current filters.";
    els.recipeList.append(empty);
    els.readyCount.textContent = "0 ready";
    renderCart(matches);
    return;
  }

  matches.forEach((recipe) => {
    const card = els.recipeTemplate.content.firstElementChild.cloneNode(true);
    const badge = card.querySelector(".recipe-badge");
    const isReady = recipe.missing.length === 0;
    badge.textContent = isReady ? "Ready now" : `${recipe.missing.length} missing`;
    badge.classList.add(isReady ? "ready" : "close");
    card.querySelector("h3").textContent = recipe.name;
    card.querySelector(".recipe-score").textContent = `${recipe.percent}%`;
    card.querySelector(".match-meter span").style.width = `${recipe.percent}%`;
    card.querySelector("[data-time]").textContent = `${recipe.time} min`;
    card.querySelector("[data-serves]").textContent = recipe.serves;
    card.querySelector("[data-level]").textContent = recipe.level;
    writeIngredientLine(card.querySelector("[data-have]"), "Have", recipe.have);
    writeIngredientLine(card.querySelector("[data-missing]"), "Missing", recipe.missing);

    const cartButton = card.querySelector("[data-cart-button]");
    cartButton.hidden = recipe.missing.length === 0;
    cartButton.addEventListener("click", () => {
      recipe.missing.forEach((item) => state.cart.add(item));
      persistPantry();
      renderCart(matches);
    });

    const steps = card.querySelector(".steps");
    recipe.steps.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      steps.append(li);
    });

    els.recipeList.append(card);
  });

  const ready = matches.filter((recipe) => recipe.missing.length === 0).length;
  els.readyCount.textContent = `${ready} ready`;
  renderCart(matches);
}

function renderRecipeHeader() {
  if (els.generateRecipesButton) {
    els.generateRecipesButton.disabled = state.recipesLoading || state.ingredients.size === 0;
    const label = els.generateRecipesButton.querySelector("span");
    if (label) label.textContent = state.recipesLoading ? "Generating" : "Generate";
  }

  if (els.recipeSource) {
    if (state.recipesLoading) {
      els.recipeSource.textContent = "AI cooking";
    } else if (state.recipeMode === "ai") {
      els.recipeSource.textContent = "AI recipes";
    } else if (state.recipeMode === "ai cached") {
      els.recipeSource.textContent = "Cached recipes";
    } else if (state.recipeMode === "mock") {
      els.recipeSource.textContent = "Mock recipes";
    } else {
      els.recipeSource.textContent = "Local recipes";
    }
  }
}

function writeIngredientLine(node, label, items) {
  node.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  node.append(strong, formatList(items) || (label === "Missing" ? "Nothing" : "None"));
}

function renderCart(matches = getMatches()) {
  els.cartStrip.replaceChildren();

  if (state.cart.size === 0) {
    const bestClose = matches.find((recipe) => recipe.missing.length > 0);
    const message = document.createElement("span");
    message.textContent = bestClose ? `Retail list: ${bestClose.missing.length} item${bestClose.missing.length === 1 ? "" : "s"} unlock ${bestClose.name}` : "Retail list: nothing missing";
    els.cartStrip.append(message);
    return;
  }

  const label = document.createElement("span");
  label.textContent = `Retail list: ${formatList([...state.cart])}`;

  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "Clear";
  clear.addEventListener("click", () => {
    state.cart.clear();
    persistPantry();
    renderCart();
  });

  els.cartStrip.append(label, clear);
}

function formatList(items) {
  return items.map(titleCase).join(", ");
}

function renderStats() {
  const size = state.ingredients.size;
  els.ingredientCount.textContent = `${size} ingredient${size === 1 ? "" : "s"}`;
}

function render() {
  renderScanQueue();
  renderIngredients();
  renderReview();
  renderRecipes();
  renderStats();
}

function addIngredient(value, meta = { confidence: 1, source: "manual" }) {
  const result = upsertIngredient(value, meta);
  if (!result) return null;
  commitPantryChange();
  return result;
}

function addManualIngredients(value) {
  const entries = parseIngredientEntries(value);
  if (entries.length === 0) return 0;

  const added = entries
    .map((ingredient) => upsertIngredient(ingredient, { confidence: 1, source: "manual" }))
    .filter((result) => result?.added).length;

  commitPantryChange();
  setStatus(added === 0 ? "Ingredient already in pantry" : `${added} ingredient${added === 1 ? "" : "s"} added`, "ready");
  return added;
}

function acceptDetection(id) {
  const detection = state.pendingDetections.find((item) => item.id === id);
  if (!detection) return;

  upsertIngredient(detection.name, {
    confidence: detection.confidence,
    source: detection.source || state.latestScanMode,
    category: detection.category,
    state: detection.state,
  });
  state.pendingDetections = state.pendingDetections.filter((item) => item.name !== detection.name);
  commitPantryChange();
  setScanSummaryStatus();
}

function rejectDetection(id) {
  state.pendingDetections = state.pendingDetections.filter((item) => item.id !== id);
  setScanSummaryStatus();
  render();
}

function acceptAllDetections() {
  const detections = [...state.pendingDetections];
  detections.forEach((detection) => {
    upsertIngredient(detection.name, {
      confidence: detection.confidence,
      source: detection.source || state.latestScanMode,
      category: detection.category,
      state: detection.state,
    });
  });
  state.pendingDetections = [];
  commitPantryChange();
  setStatus(detections.length === 0 ? "Nothing to add" : "Ingredients added", "ready");
}

async function scanPantry() {
  const targets = state.scanPhotos.filter((photo) => SCAN_READY_STATUSES.has(photo.status));
  if (targets.length === 0) {
    setScanSummaryStatus();
    return;
  }

  setStatus(`${targets.length} photo${targets.length === 1 ? "" : "s"} scanning`, "scanning");
  render();
  await Promise.allSettled(targets.map(scanPhoto));
  setScanSummaryStatus();
  render();
}

async function scanPhoto(photo) {
  photo.status = "scanning";
  photo.error = "";
  photo.detectionCount = 0;
  photo.reviewCount = 0;
  state.pendingDetections = state.pendingDetections.filter((item) => item.photoId !== photo.id);
  render();

  try {
    const response = await requestScan(photo.dataUrl);
    const mode = response.mode || "ai";
    const detections = normalizeDetections(response.ingredients).map((item) => ({
      ...item,
      photoId: photo.id,
      photoName: photo.name,
      source: mode,
    }));
    const autoAccepted = new Set(detections.filter((item) => item.confidence >= 0.88).map((item) => item.name));

    detections
      .filter((item) => autoAccepted.has(item.name))
      .forEach((item) => upsertIngredient(item.name, { ...item, source: mode }));

    const pending = detections.filter((item) => !state.ingredients.has(item.name) && !autoAccepted.has(item.name));
    mergePendingDetections(pending);

    photo.status = "done";
    photo.mode = mode;
    photo.detectionCount = detections.length;
    photo.reviewCount = pending.length;
    setMode(mode, mode === "mock" ? "Mock ready" : "AI mode");
    persistPantry();
    if (autoAccepted.size > 0) scheduleRecipeRefresh();
  } catch (error) {
    photo.status = "error";
    photo.error = error.message || "Scan failed";
    setMode("ai", "AI unavailable");
    console.warn("Scan failed.", error);
  } finally {
    setScanSummaryStatus();
    render();
  }
}

function mergePendingDetections(detections) {
  detections.forEach((detection) => {
    const existing = state.pendingDetections.find((item) => item.name === detection.name);
    if (existing) {
      if (detection.confidence > existing.confidence) {
        existing.confidence = detection.confidence;
        existing.category = detection.category;
        existing.state = detection.state;
        existing.source = detection.source;
        existing.photoId = detection.photoId;
      }
      existing.photoNames = [...new Set([...(existing.photoNames || []), detection.photoName])];
      return;
    }

    state.pendingDetections.push({
      ...detection,
      id: `detection-${Date.now()}-${++pendingDetectionId}`,
      photoNames: [detection.photoName],
    });
  });
}

function setScanSummaryStatus() {
  const scanning = state.scanPhotos.filter((photo) => photo.status === "scanning").length;
  const queued = state.scanPhotos.filter((photo) => photo.status === "queued").length;
  const failed = state.scanPhotos.filter((photo) => photo.status === "error").length;
  const review = state.pendingDetections.length;

  if (scanning > 0) {
    setStatus(`${scanning} photo${scanning === 1 ? "" : "s"} scanning`, "scanning");
  } else if (review > 0) {
    setStatus(`${review} ingredient${review === 1 ? "" : "s"} to review`, "ready");
  } else if (queued > 0) {
    setStatus(`${queued} photo${queued === 1 ? "" : "s"} ready to scan`, "idle");
  } else if (failed > 0) {
    setStatus(`${failed} photo${failed === 1 ? "" : "s"} need retry`, "error");
  } else if (state.scanPhotos.length > 0) {
    setStatus("All photos scanned", "ready");
  } else {
    setStatus("Add photos to scan", "idle");
  }
}

async function requestScan(image) {
  if (window.webkit?.messageHandlers?.gardeScan) {
    return requestNativeScan(image);
  }

  if (location.protocol === "file:") {
    throw new Error("AI scanning is not configured for this app build.");
  }

  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });

  if (!res.ok) {
    throw new Error(`Scan failed with ${res.status}`);
  }

  return res.json();
}

function requestNativeScan(image) {
  const requestId = `scan-${Date.now()}-${++nativeScanRequestId}`;
  window.gardeNativeScanCallbacks ||= {};

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      delete window.gardeNativeScanCallbacks[requestId];
      reject(new Error("AI scan timed out."));
    }, NATIVE_SCAN_TIMEOUT_MS);

    window.gardeNativeScanCallbacks[requestId] = {
      resolve: (payload) => {
        window.clearTimeout(timeout);
        resolve(payload);
      },
      reject: (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    };

    window.webkit.messageHandlers.gardeScan.postMessage({ requestId, image });
  });
}

window.gardeNativeScanComplete = function gardeNativeScanComplete(requestId, payload = {}) {
  const callback = window.gardeNativeScanCallbacks?.[requestId];
  if (!callback) return;

  delete window.gardeNativeScanCallbacks[requestId];
  if (payload.error) {
    callback.reject(new Error(payload.error));
    return;
  }

  callback.resolve(payload);
};

function normalizeDetections(items = []) {
  const seen = new Set();
  return items
    .map((item) => ({
      name: normalizeIngredient(item.name),
      confidence: clamp(Number(item.confidence) || 0.65, 0.35, 0.99),
      category: item.category || "other",
      state: item.state || "unknown",
    }))
    .filter((item) => {
      if (!item.name || seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    })
    .sort((a, b) => b.confidence - a.confidence);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readPhotoFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      try {
        const dataUrl = await optimizeScanImage(reader.result);
        resolve({
          id: `photo-${Date.now()}-${++scanPhotoId}`,
          name: file.name || `Photo ${scanPhotoId}`,
          dataUrl,
          status: "queued",
          detectionCount: 0,
          reviewCount: 0,
          error: "",
        });
      } catch (error) {
        reject(error);
      }
    });
    reader.addEventListener("error", () => reject(new Error(`Could not read ${file.name || "photo"}.`)));
    reader.readAsDataURL(file);
  });
}

function optimizeScanImage(dataUrl) {
  return new Promise((resolve, reject) => {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      reject(new Error("Could not prepare photo for scanning."));
      return;
    }

    const image = new Image();
    image.addEventListener("load", () => {
      const naturalWidth = image.naturalWidth || SCAN_IMAGE_MAX_WIDTH;
      const naturalHeight = image.naturalHeight || SCAN_IMAGE_MAX_WIDTH;
      const scale = Math.min(1, SCAN_IMAGE_MAX_WIDTH / naturalWidth);
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }

      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", SCAN_IMAGE_QUALITY));
    });
    image.addEventListener("error", () => reject(new Error("Could not load photo for scanning.")));
    image.src = dataUrl;
  });
}

async function handlePhotos(fileList) {
  const files = [...(fileList || [])].filter((file) => file.type.startsWith("image/"));
  if (files.length === 0) return;

  const results = await Promise.allSettled(files.map(readPhotoFile));
  const photos = results
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);

  if (photos.length > 0) {
    state.scanPhotos.push(...photos);
    state.activePhotoId = photos.at(-1).id;
  }

  els.photoInput.value = "";
  if (photos.length !== files.length) {
    setStatus("Some photos could not be loaded", "error");
  } else {
    setScanSummaryStatus();
  }
  render();
}

function clearLocalData() {
  localStorage.removeItem(STORAGE_KEY);
  state.ingredients = new Set(DEFAULT_INGREDIENTS);
  state.detectionMeta = new Map(DEFAULT_INGREDIENTS.map((name) => [name, { confidence: 1, source: "starter" }]));
  state.pendingDetections = [];
  state.scanPhotos = [];
  state.activePhotoId = null;
  state.cart = new Set();
  els.photoInput.value = "";
  setMode("local", "Local mode");
  setStatus("Local data deleted", "ready");
  state.recipes = fallbackRecipes;
  state.recipeMode = "local";
  lastRecipeSignature = "";
  render();
  scheduleRecipeRefresh();
}

els.photoInput.addEventListener("change", (event) => {
  handlePhotos(event.target.files);
});

els.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
});

els.dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  handlePhotos(event.dataTransfer.files);
});

els.scanButton.addEventListener("click", scanPantry);

els.ingredientForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addManualIngredients(els.ingredientInput.value);
  els.ingredientInput.value = "";
  els.ingredientInput.focus();
});

els.quickAdds.forEach((button) => {
  button.addEventListener("click", () => addManualIngredients(button.dataset.add));
});

els.filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    els.filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    renderRecipes();
  });
});

[els.staplesToggle, els.vegetarianToggle, els.fastToggle].forEach((input) => {
  input.addEventListener("change", () => {
    renderRecipes();
    scheduleRecipeRefresh();
  });
});

els.resetButton.addEventListener("click", () => {
  state.ingredients = new Set(DEFAULT_INGREDIENTS);
  state.detectionMeta = new Map(DEFAULT_INGREDIENTS.map((name) => [name, { confidence: 1, source: "starter" }]));
  state.pendingDetections = [];
  state.scanPhotos = [];
  state.activePhotoId = null;
  state.cart.clear();
  els.photoInput.value = "";
  setMode("local", "Local mode");
  commitPantryChange();
  setScanSummaryStatus();
});

els.acceptScanButton.addEventListener("click", acceptAllDetections);
els.generateRecipesButton.addEventListener("click", () => scheduleRecipeRefresh({ force: true }));
els.savePantryButton.addEventListener("click", savePantry);
els.clearDataButton.addEventListener("click", clearLocalData);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

async function checkServerMode() {
  if (window.webkit?.messageHandlers?.gardeScan) {
    setMode("ai", "AI app");
    return;
  }

  if (location.protocol === "file:") return;
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return;
    const health = await res.json();
    setMode(health.mode, health.mode === "ai" ? "AI ready" : "Mock ready");
  } catch {
    setMode("local", "Local mode");
  }
}

loadPantry();
render();
checkServerMode();
scheduleRecipeRefresh();
