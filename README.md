# Garde-Manger

Garde-Manger is a pantry/fridge recipe finder prototype moving toward a retail MVP.

The iOS app uses direct AI scans through native Swift and does not include local mock detections. The Node web server can still run in two modes for browser demos and hosted deployments:

- Mock mode: works with no keys and returns deterministic ingredient detections.
- AI mode: set `OPENAI_API_KEY` and the backend sends the image to the OpenAI Responses API for structured ingredient extraction.

## Run locally

```bash
npm start
```

Open `http://127.0.0.1:5173`.

## Enable AI scans

Create an environment file or set variables in your host:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5
```

The app does not persist uploaded photos. The server sends each queued scan image to the model and returns ingredient names, confidence scores, category, and state.
Recipes use the same backend OpenAI configuration. The app sends the current pantry ingredients to the server and receives a fresh structured recipe set; mock recipes are returned when no API key is configured.
For faster responses, you can set `OPENAI_SCAN_MODEL` and `OPENAI_RECIPE_MODEL` independently while keeping `OPENAI_MODEL` as the default fallback.

## Useful commands

```bash
npm run check
npm start
GARDE_FORCE_MOCK=1 npm start
```

## iOS testing

This repo now includes a native iOS wrapper in `ios/GardeManger.xcodeproj`.

- Direct AI scans: open the Xcode project, set the `GARDE_OPENAI_API_KEY` build setting on the `GardeManger` target, and run the app. The bundled app calls the OpenAI Responses API from native Swift.
- Model selection: set `GARDE_OPENAI_MODEL` if you want to override the default model.
- Hosted web option: set `GARDE_WEB_URL` only if you want the iOS shell to load a deployed HTTPS web build instead of the bundled app.
- External testers: archive from Xcode and distribute through TestFlight once a bundle ID, signing team, privacy policy URL, and hosted backend are ready.

Direct API keys in iOS builds are suitable for prototypes and controlled TestFlight tests, but they can be extracted from the app bundle. Use a server or ephemeral-token flow before a production launch.

## API

`GET /api/health`

Returns whether the server is in `ai` or `mock` mode.

`POST /api/scan`

Request:

```json
{
  "image": "data:image/jpeg;base64,..."
}
```

`POST /api/recipes`

Request:

```json
{
  "ingredients": ["eggs", "tomatoes", "spinach"],
  "preferences": { "staples": true, "vegetarian": false, "fast": false }
}
```

Response:

```json
{
  "mode": "ai",
  "model": "gpt-5.5",
  "recipes": [
    {
      "name": "Tomato Spinach Eggs",
      "time": 18,
      "serves": 2,
      "level": "Easy",
      "vegetarian": true,
      "ingredients": ["eggs", "tomatoes", "spinach", "olive oil", "salt"],
      "steps": ["Cook tomatoes.", "Add spinach and eggs.", "Season and serve."]
    }
  ],
  "notes": ""
}
```

Response:

```json
{
  "mode": "ai",
  "model": "gpt-5.5",
  "ingredients": [
    { "name": "eggs", "confidence": 0.94, "category": "protein", "state": "fresh" }
  ],
  "notes": ""
}
```

## Retail MVP Roadmap

1. Replace embedded recipes with a real recipe catalog and normalized ingredient taxonomy.
2. Add accounts, saved pantries, household sharing, and consented photo-retention settings.
3. Add barcode scanning and grocery SKU mapping.
4. Add retailer cart export or partner checkout integration.
5. Add analytics for scan correction rate, recipe save rate, cart conversion, and repeat cooking.
6. Run a closed beta before store submission.
