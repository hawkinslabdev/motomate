# Changelog

## 0.6.0

**Breaking change**: The application will refuse to start on a default `AUTH_SECRET`. A secret under 32 bytes will prevent a fresh install from starting, though existing installs will only show a warning you should take seriously. Generate a new key with: `openssl rand -hex 32`, beware that this will invalidate your stored S3 and paperless credentials!

- You can now use your favorite OIDC provider (e.g. Authelia, Authentik, Pocket ID). See examples [here](https://github.com/hawkinslabdev/motomate/blob/main/docker-compose.yml) (#99)
- Your OIDC provider can now create accounts by itself with `OIDC_ALLOW_SIGNUP`, so single sign-on works while public registration stays closed (#101)
- Added a search box to the login screen for easier language selection
- Renaming a document will push that new document name to Paperless-ngx for consistency
- Fix: a magic link now lets you set a new password without entering the old one to allow password recovery
- Fix: an account created through OIDC can now set a password from a magic link, as a way back in when the provider is unavailable
- Fix: With no SMTP configured, magic links are written to the server log instead of attempting to mail it
- Fix: opening a magic link without a token returned a server error instead of the invalid link page
- Fix: when using the magic link feature, the message will now clearly show when registration is either enabled or disabled
- Photos and PDFs now open in a preview tab instead of downloading first, while formats no browser can render, like Office-documents, still download as before
- Fix: editing, backdating, or deleting a past service entry no longer resets tracker progress to that entry date
- Fix: translate notification messages to Italian (contribution by @albanobattistella) #100
- Fix: the notification channel settings were still shown in English in German, Spanish, French and Portuguese
- Fix: restore the umlauts in German and the accents in Portuguese, which were written as plain ASCII in the integrations and notification text
- Fix: add the missing magic link page title to five languages, and drop a stray Italian key
- Fix: document `ADDRESS_HEADER` and `XFF_DEPTH` in the docker compose config and `.env.example`, so rate limits bucket per client instead of per proxy behind a reverse proxy
- Fix: `PUBLIC_APP_URL` was read from the wrong place and always ignored, so magic link emails pointed at localhost, the OIDC redirect fell back to the request host, and the API answered any origin on installs that set it without `PUBLIC_APP_ORIGINS`
- Security: uploaded files are now served only to a logged-in owner, instead of allowing anyone access the (though secure and signed) url
- Security: refuse to start on a default `AUTH_SECRET` even when users already exist
- Security: require a verified email from your OIDC provider, and match accounts on the provider's user id instead of the email address (can be disabled with `OIDC_TRUST_UNVERIFIED_EMAIL`)
- Security: changing your password now logs out your other sessions
- Security: strip raw HTML and `javascript:` links when rendering notes
- Security: add rate limiting to the magic link and OIDC routes
- Security: remove an expensive hash from the magic link page that could be triggered without logging in
- Security: prevent SVG injection via the unescaped rotate option in DiceBear avatars
- Security: the magic link form no longer reveals whether an email address has an account
- Security: the API keys now authenticate the REST API only, so a key can no longer drive a page route or a form action
- Security: a read-only API key is refused on every write generally, instead of checking this on each endpoint

## 0.5.5

- Fix: tracker edit now re-use sheet for consistent UI-experience (#94)
- Fix: add missing i18n keys to frontend
- Security: bump various dependencies

## 0.5.4

- Fix: some containers refused to start due to missing dependency (warning).

## 0.5.3

- This release is a performance-focused maintenance release that updates the Docker base image from `node:20-slim` to `node:24-alpine`.

## 0.5.2

- Fix: purchase/sold price ignores its recorded currency, causing a mismatch with expenses (reported by @NJBodey) #90
- Fix: OSM-markers (e.g. Pin for start-location) can now be loaded again
- Fix: demo instance couldn't load assets since these were not copied in Dockerbuild (#89)

## 0.5.1

- Fix: downloading GPX travel files could fail with an error
- Fix: map tiles failing to load no longer show a confusing error
- Fix: Paperless-ngx and S3 sync no longer creates duplicate documents on filename changes

## 0.5.0

- Add your own document storage destinations from your profile page! Save a copy of your documents on a S3-compatible server or in Paperless-ngx
- You can now convert an existing vehicle between kilometers and miles (not compatible with hours, ofcourse)
- Your account currency and distance preferences are now applied consistently across, while each entry keeps the currency it was originally recorded in
- Spending totals now group by currency when a vehicle has entries in more than one currency, instead of adding different currencies into a single incorrect total
- Your notifications in the notification-tray now have a click-action, a new 'Clear all' button and show 5 items (instead of 3)
- OpenAPI specification has been upgraded from 3.1 to 3.2.0 with webhooks support
- Fix: resolve origin trust failures for plain form submissions behind reverse proxy (#85 by @NJBodey)
- Fix: new vehicles now default to your account distance unit
- Fix: the theme selector no longer resets to 'system' after saving your profile
- Fix: the measurement unit toggle in profile settings now switches on click and saves correctly
- Fix: the maintenance page heading now matches the size used on the other vehicle pages
- Fix: show last fired time for workflow rules (instead of returning an invalid date/object map)
- Fix: show finance tally on the dashboard for all financial entries (instead of only finance entries made from finance-tab)
- Fix: reuse drawer on various pages
- Fix: reuse document reads during sync instead of reading off the disk twice
- Fix: remove the `BODY_SIZE_LIMIT` variable in the default docker compose config, it now defaults to 20 MB
- Fix: bundle the map stylesheet instead of loading it from a CDN, so travel maps render without internet access
- Fix: replacing a vehicle photo or profile avatar now shows the new image right away, instead of the old one sticking around for up to an hour
- Fix: vehicle photos and documents are no longer re-downloaded on every visit, so pages open quicker and use less data on mobile
- Security: Verify ownership before deleting an object/file
- Security: Close registration by default (except during onboarding)
- Security: Add SSRF protection to fetch calls via shared URL validation
- Security: Add rate limiting keyed on the account
- Security: Add a Content Security Policy (CSP)
- Security: Refuse to start on a default or too short `AUTH_SECRET`, existing installs log a warning instead so an upgrade never fails to boot
- Security: Reject changes coming from an untrusted/missing origin, rather than allowing them when `PUBLIC_APP_ORIGINS` is unset
- Security: Scope push notification unsubscribes to the account that owns them

## 0.4.0

- Added an 'Insights' view showing how far you've ridden and what you've spent. You can filter by vehicle and time range, toggle between monthly and cumulative costs, and see service events directly on your mileage chart
- Added a 'Notes' page for your vehicles, allowing you to add custom notes in Markdown (and reference uploaded documents)
- Added server-side drafts for unfinished entries for specific vehicles, so you never lose your progress
- Updated the new entry workflow to open a sidebar instead of a modal
- Updated the 'Finance' feature, renaming it to 'Spending' across all supported languages (though the API remains unaffected)
- Updated the dashboard's recent activity feed to display your most recent entry for each vehicle
- Updated the vehicle settings page by moving the measurement unit section to the odometer section
- Updated the mobile top menu by moving the settings page under the profile icon
- Fix: the backdrop no longer scrolls when using the mobile quick add menu
- Fix: the current vehicle is now correctly pre-selected in the mobile menu when logging a new odometer or maintenance entry
- Security: updated dependencies to address vulnerabilities related to cookie handling and the dev server

## 0.3.3

- Fix: new locales are now properly recognized in the frontend

## 0.3.2

- Romanian (ro) locale is now available, contributed by @gg64nou (#46)
- Fix: theme selector in profile settings is now in the main section instead of a separate tab
- Fix: toast notifications no longer overflow or stack incorrectly when multiple fire in quick succession (#47)

## 0.3.1

- New mobile navigation bar at the bottom of the screen with tabs for dashboard and garage, and a floating + button to quickly log entries
- Notification panel in the top bar now shows your three most recent notifications, with dismiss and swipe-to-dismiss support
- Light, dark, and system theme can now be selected from Settings > Profile
- Fix: toast notifications no longer repeat for the same event

## 0.3.0

- Added 'Developer' tab in the profile page, allowing you to setup access keys for the REST API
- Added 'Finance' data to the pdf export functionality, meaning you can export financial data in the printable maintenance report
- You can now set your name in your profile, which should make the experience a tad more personal
- You can now pin a document for quick-reference per vehicle, e.g. allowing you to pin your vehicles manual
- Fix: odometer reminder workflow no longer fires daily once stale, cooldown now matches the configured interval
- Fix: odometer staleness now checks the last logged odometer entry, not the last time the vehicle record was edited
- Fix: workflow rules with multiple vehicles now notify each vehicle independently instead of blocking after the first
- Fix: when multiple documents are expiring, you now get a notification for each one instead of only the first
- Fix: normalized errors on the login/register forms, these are now translated (#40)
- Fix: dashboard now shows which vehicle has overdue/upcoming maintenance when more than three items are waiting and forwards on click to right vehicle
- Fix: due and overdue maintenance cards now stack correctly on small screens, keeping the action button reachable
- Fix: activity details on the dashboard no longer clip on narrow screens
- Fix: workflow last-run dates can now be tapped to expand on small screens
- Fix: vehicle cover images are now only accessible to the vehicle's owner
- Fix: the server now requires AUTH_SECRET to be set at startup and warns if open registration is left enabled on an active instance
- Fix: the pdf export for vehicles now has less dependencies, uses proper (number) formatting and consistent styling
- Security: `AUTH_SECRET` is now required as environment variable and thus no longer optional

## 0.2.5

- The registration pages are now secured with [Altcha](https://altcha.org/) (a privacy-first, local reCAPTCHA-alternative)
- Fix: the tab-menu for the vehicles became unresponsive in specific scenario's
- Fix: during onboarding the shown tab name was incomplete
- Fix: add safeguard for magic link when smtp is not configured
- Fix: improve handling of stored theme settings

## 0.2.4

- You can now disable public sign-up by setting `AUTH_ALLOW_REGISTRATION=false`
- The changelog is now accessible from your profile settings
- Fix: Magic link sign-in no longer creates new accounts when registration is disabled

## 0.2.3

- Maintenance trackers can now be set to reminder-only. You can get notified when service is due without polluting your timeline
- Fix: reminder entries are now correctly saved alongside your service logs
- Fix: filters on the maintenance view no longer reset when you navigate away from the page
- Fix: reminders are now properly scheduled with cron (#33)
- Fix: alerts like odometer reminders no longer repeat every day once they have already been sent (#35)
