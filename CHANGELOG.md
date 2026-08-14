# Changelog

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
