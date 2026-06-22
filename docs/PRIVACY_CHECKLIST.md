# Privacy Checklist

Fridge and pantry photos can reveal diet, household size, brands, income signals, medical/allergy needs, religion, and location hints. Treat them as sensitive.

## MVP Defaults

- Do not persist uploaded photos.
- Send photos only after the user presses Scan.
- Store pantry ingredients locally by default.
- Provide a local data deletion control.
- Use HTTPS in production.
- Keep API keys server-side only.

## Before Retail Launch

- Publish a privacy policy.
- Document data categories collected:
  - Photos for scan processing
  - Ingredient list
  - Preferences
  - Shopping/cart events
  - Account data, if added
- Add account deletion if accounts exist.
- Add data export if required by target jurisdictions.
- Add opt-in consent before retaining photos for product improvement.
- Review every analytics, crash, ad, and retail SDK for data collection.
- Update Apple privacy details and Google Play Data Safety whenever data practices change.

## Operational Controls

- Log scan failures without logging raw images.
- Redact request bodies from server logs.
- Set image payload size limits.
- Add rate limiting before public launch.
- Add abuse monitoring and model-cost alerts.
- Keep a data-retention schedule.
