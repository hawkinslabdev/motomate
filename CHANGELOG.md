# Changelog

## Unreleased

- Added a Paperless-ngx integration for linking or copying existing archive documents to vehicles
- Added explicit copy and move workflows for sending MotoMate uploads to Paperless-ngx without deleting remote documents
- Added authenticated inline document previews, downloads, Paperless thumbnails, and generated/cached thumbnails for local PDFs and raster images
- Added reusable document relationships for maintenance and spending events, including sale/purchase relationships and migration of existing attachment arrays
- Added encrypted storage for Paperless API tokens and background sync jobs with retry/error state
- Clarified storage ownership and removal behavior throughout the document UI

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
