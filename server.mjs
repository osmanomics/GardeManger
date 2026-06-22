import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 5173);
const model = process.env.OPENAI_MODEL || "gpt-5.5";
const scanModel = process.env.OPENAI_SCAN_MODEL || model;
const recipeModel = process.env.OPENAI_RECIPE_MODEL || model;
const forceMock = process.env.GARDE_FORCE_MOCK === "1";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
]);

const mockIngredients = [
  { name: "eggs", confidence: 0.94, category: "protein", state: "fresh" },
  { name: "tomatoes", confidence: 0.9, category: "produce", state: "fresh" },
  { name: "spinach", confidence: 0.84, category: "produce", state: "fresh" },
  { name: "rice", confidence: 0.82, category: "grain", state: "packaged" },
  { name: "canned beans", confidence: 0.78, category: "pantry", state: "packaged" },
  { name: "onions", confidence: 0.75, category: "produce", state: "fresh" },
  { name: "yogurt", confidence: 0.68, category: "dairy", state: "fresh" },
];

const ingredientSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ingredients", "notes"],
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "confidence", "category", "state"],
        properties: {
          name: { type: "string", description: "Common grocery ingredient name in singular/plural everyday English." },
          confidence: { type: "number", description: "Detection confidence from 0 to 1." },
          category: {
            type: "string",
            enum: ["produce", "protein", "dairy", "grain", "pantry", "bakery", "frozen", "drink", "condiment", "other"],
          },
          state: {
            type: "string",
            enum: ["fresh", "packaged", "opened", "unknown"],
          },
        },
      },
    },
    notes: { type: "string" },
  },
};

const recipeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["recipes", "notes"],
  properties: {
    recipes: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "time", "serves", "level", "vegetarian", "ingredients", "steps"],
        properties: {
          name: { type: "string" },
          time: { type: "integer", minimum: 5, maximum: 90 },
          serves: { type: "integer", minimum: 1, maximum: 8 },
          level: { type: "string", enum: ["Easy", "Medium", "Hard"] },
          vegetarian: { type: "boolean" },
          ingredients: {
            type: "array",
            minItems: 4,
            maxItems: 12,
            items: { type: "string" },
          },
          steps: {
            type: "array",
            minItems: 3,
            maxItems: 4,
            items: { type: "string" },
          },
        },
      },
    },
    notes: { type: "string" },
  },
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        mode: process.env.OPENAI_API_KEY && !forceMock ? "ai" : "mock",
        model: process.env.OPENAI_API_KEY && !forceMock ? model : null,
        scanModel: process.env.OPENAI_API_KEY && !forceMock ? scanModel : null,
        recipeModel: process.env.OPENAI_API_KEY && !forceMock ? recipeModel : null,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/scan") {
      return handleScan(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/recipes") {
      return handleRecipes(req, res);
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    return serveStatic(url.pathname, res, req.method === "HEAD");
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(port, () => {
  console.log(`Garde running at http://127.0.0.1:${port}`);
});

async function handleScan(req, res) {
  const body = await readJson(req, 8_000_000);
  if (!body.image || typeof body.image !== "string" || !body.image.startsWith("data:image/")) {
    return sendJson(res, 400, { error: "Expected image as a data URL." });
  }

  if (!process.env.OPENAI_API_KEY || forceMock) {
    return sendJson(res, 200, mockScan(body.image, "mock"));
  }

  try {
    const result = await scanWithOpenAI(body.image);
    return sendJson(res, 200, {
      mode: "ai",
      model: scanModel,
      ingredients: normalizeIngredients(result.ingredients),
      notes: result.notes || "",
    });
  } catch (error) {
    console.error("OpenAI scan failed; returning mock result.", error);
    return sendJson(res, 200, {
      ...mockScan(body.image, "mock"),
      warning: "AI scan failed; mock result returned.",
    });
  }
}

async function handleRecipes(req, res) {
  const body = await readJson(req, 200_000);
  const ingredients = normalizeIngredientList(body.ingredients);
  const preferences = normalizeRecipePreferences(body.preferences);

  if (ingredients.length === 0) {
    return sendJson(res, 400, { error: "Expected at least one ingredient." });
  }

  if (!process.env.OPENAI_API_KEY || forceMock) {
    return sendJson(res, 200, mockRecipes(ingredients, preferences, "mock"));
  }

  try {
    const result = await recipesWithOpenAI(ingredients, preferences);
    return sendJson(res, 200, {
      mode: "ai",
      model: recipeModel,
      recipes: normalizeRecipes(result.recipes),
      notes: result.notes || "",
    });
  } catch (error) {
    console.error("OpenAI recipe generation failed; returning mock result.", error);
    return sendJson(res, 200, {
      ...mockRecipes(ingredients, preferences, "mock"),
      warning: "AI recipe generation failed; mock result returned.",
    });
  }
}

async function scanWithOpenAI(image) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: scanModel,
      input: [
        {
          role: "system",
          content:
            "You identify visible food ingredients in fridge and pantry photos for a consumer recipe app. Return only ingredients that are visually plausible. Do not infer hidden items.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "List visible recipe ingredients. Use common names like eggs, tomatoes, rice, canned beans, yogurt, chicken. Avoid brands and packaging text unless the food item is clear.",
            },
            { type: "input_image", image_url: image, detail: "low" },
          ],
        },
      ],
      max_output_tokens: 650,
      text: {
        format: {
          type: "json_schema",
          name: "pantry_scan",
          strict: true,
          schema: ingredientSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const output = extractOutputText(data);
  return JSON.parse(output);
}

async function recipesWithOpenAI(ingredients, preferences) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: recipeModel,
      input: [
        {
          role: "system",
          content:
            "You create practical home-cooking recipes for a pantry recipe app. Prefer the user's available ingredients, allow a few common pantry staples, and keep instructions concise.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: recipePrompt(ingredients, preferences),
            },
          ],
        },
      ],
      max_output_tokens: 1100,
      text: {
        format: {
          type: "json_schema",
          name: "pantry_recipes",
          strict: true,
          schema: recipeSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const output = extractOutputText(data);
  return JSON.parse(output);
}

function recipePrompt(ingredients, preferences) {
  const lines = [
    `Available ingredients: ${ingredients.join(", ")}.`,
    "Generate 4 varied recipes that feel fresh and not like the same default list.",
    "Use common recipe ingredient names, not brands. Include salt, pepper, oil, water, butter, flour, vinegar, or sugar only when useful.",
    "Every recipe must be cookable by a normal home cook and must include clear steps.",
  ];

  if (preferences.vegetarian) lines.push("Only return vegetarian recipes.");
  if (preferences.fast) lines.push("Prefer recipes that take 25 minutes or less.");
  if (!preferences.staples) lines.push("Do not assume pantry staples unless they are in the available ingredients list.");

  return lines.join(" ");
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;

  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") return content.text;
    }
  }

  throw new Error("No text output returned from model.");
}

function normalizeIngredients(items = []) {
  const seen = new Set();
  return items
    .map((item) => ({
      name: normalizeName(item.name),
      confidence: clamp(Number(item.confidence) || 0.65, 0.35, 0.99),
      category: item.category || "other",
      state: item.state || "unknown",
    }))
    .filter((item) => {
      if (!item.name || seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    })
    .slice(0, 18);
}

function normalizeIngredientList(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeName(item))
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 60);
}

function normalizeRecipePreferences(value = {}) {
  return {
    staples: value.staples !== false,
    vegetarian: value.vegetarian === true,
    fast: value.fast === true,
  };
}

function normalizeRecipes(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      name: String(item.name || "").trim(),
      time: Math.round(clamp(Number(item.time) || 25, 5, 90)),
      serves: Math.round(clamp(Number(item.serves) || 2, 1, 8)),
      level: ["Easy", "Medium", "Hard"].includes(item.level) ? item.level : "Easy",
      vegetarian: item.vegetarian === true,
      ingredients: normalizeIngredientList(item.ingredients).slice(0, 12),
      steps: (Array.isArray(item.steps) ? item.steps : [])
        .map((step) => String(step || "").trim())
        .filter(Boolean)
        .slice(0, 6),
    }))
    .filter((item) => {
      const key = normalizeName(item.name);
      if (!key || seen.has(key) || item.ingredients.length < 3 || item.steps.length < 2) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function mockScan(image, mode) {
  const offset = image.length % mockIngredients.length;
  const rotated = [...mockIngredients.slice(offset), ...mockIngredients.slice(0, offset)];
  return {
    mode,
    ingredients: normalizeIngredients(rotated),
    notes: "Mock detections are deterministic and intended for local demos.",
  };
}

function mockRecipes(ingredients, preferences, mode) {
  const core = ingredients.filter((item) => !["salt", "pepper", "water", "oil", "olive oil"].includes(item));
  const first = core[0] || "vegetables";
  const second = core[1] || "rice";
  const third = core[2] || "eggs";
  const fourth = core[3] || "beans";
  const protein = preferences.vegetarian ? fourth : core.find((item) => ["chicken", "canned tuna", "eggs", "beans", "lentils"].some((token) => item.includes(token))) || third;
  const baseTime = preferences.fast ? 18 : 28;

  return {
    mode,
    recipes: normalizeRecipes([
      {
        name: `${titleCase(first)} ${titleCase(second)} Skillet`,
        time: baseTime,
        serves: 2,
        level: "Easy",
        vegetarian: preferences.vegetarian || !["chicken", "canned tuna"].includes(protein),
        ingredients: [first, second, "olive oil", "salt", "pepper"],
        steps: [`Prep ${first} and ${second}.`, "Cook everything in a hot skillet with oil.", "Season and serve warm."],
      },
      {
        name: `${titleCase(protein)} Pantry Bowl`,
        time: baseTime + 4,
        serves: 3,
        level: "Easy",
        vegetarian: preferences.vegetarian || !["chicken", "canned tuna"].includes(protein),
        ingredients: [protein, second, third, "olive oil", "salt", "pepper"],
        steps: [`Warm ${protein} with ${third}.`, `Spoon over ${second}.`, "Finish with oil, salt, and pepper."],
      },
      {
        name: `Quick ${titleCase(third)} Toasts`,
        time: 14,
        serves: 2,
        level: "Easy",
        vegetarian: true,
        ingredients: [third, "bread", "butter", "salt", "pepper"],
        steps: ["Toast bread until crisp.", `Cook ${third} with butter.`, "Pile onto toast and season."],
      },
      {
        name: `${titleCase(first)} Soup`,
        time: preferences.fast ? 24 : 34,
        serves: 4,
        level: "Medium",
        vegetarian: true,
        ingredients: [first, second, "water", "olive oil", "salt", "pepper"],
        steps: [`Cook ${first} and ${second} in oil.`, "Simmer with water until tender.", "Blend or mash lightly and season."],
      },
    ]),
    notes: "Mock recipes are generated from the current pantry for local demos.",
  };
}

function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function serveStatic(pathname, res, headOnly = false) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const target = normalize(join(root, cleanPath));

  if (!target.startsWith(root)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  try {
    const data = await readFile(target);
    const ext = extname(target);
    res.writeHead(200, {
      "Content-Type": mimeTypes.get(ext) || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=300",
    });
    if (!headOnly) res.end(data);
    else res.end();
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}
