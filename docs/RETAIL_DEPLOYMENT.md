# Retail Deployment Plan

## Current State

This repository is a deployable PWA/server MVP:

- Static app served by `server.mjs`
- `/api/scan` endpoint for AI ingredient extraction
- Mock scan fallback for demos and outages
- Local pantry persistence with delete control
- PWA manifest and service worker

## Recommended First Deployment

Use a basic Node web service before native app stores:

1. Create a Git repo and push this folder.
2. Deploy to Render, Railway, Fly.io, Google Cloud Run, or AWS App Runner.
3. Set environment variables:
   - `PORT`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL=gpt-5.5`
   - `GARDE_FORCE_MOCK=0`
4. Configure HTTPS on the host.
5. Point a real domain at the service.
6. Run a private pilot with real users.

## Production Architecture

Minimum retail-grade shape:

```text
Mobile/PWA client
  -> API gateway / Node service
  -> image scan worker
  -> recipe ranking service
  -> Postgres
  -> object storage for consented images only
  -> grocery SKU/retailer adapter
```

Do not store raw fridge photos by default. If you later need photos for model improvement, make it opt-in and attach a deletion workflow.

## Retail Features To Add

- Grocery SKU mapping: convert "milk" to retailer products by region.
- Cart handoff: deep link, partner API, or exportable shopping list.
- Store inventory: show availability and price when a retailer API permits it.
- Substitutions: recommend equivalent items already in pantry.
- Expiry priority: bias recipes toward ingredients likely to spoil first.
- Nutrition and allergen preferences.
- Household profiles and shared pantry state.

## Store Submission Notes

For app stores, the app must have:

- Complete metadata and screenshots.
- A live backend during review.
- A demo mode or demo account if accounts exist.
- Camera/photo permission purpose strings.
- Privacy policy URL.
- Accurate App Store privacy details and Google Play Data Safety entries.
- User deletion path for account and personal data.

## Metrics

Track these before spending heavily on retail integrations:

- Scan success rate
- Average ingredients accepted per scan
- Correction/removal rate
- Recipes opened per scan
- Recipes saved or cooked
- Shopping list additions
- Retail cart conversion
- 7-day retention
