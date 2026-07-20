# Paperless-ngx integration

MotoMate can use Paperless-ngx as an external document library while retaining clear ownership boundaries. The integration supports selecting an existing Paperless document, keeping a local copy when desired, and transferring new MotoMate uploads into Paperless.

MotoMate never deletes a document from Paperless-ngx. Every destructive action in MotoMate is limited to the MotoMate record, its local object, or its generated thumbnail cache.

## Requirements

- A Paperless-ngx instance whose base URL is reachable from the MotoMate container
- A Paperless API token with access to the documents the MotoMate user should see
- A dedicated 32-byte `INTEGRATION_ENCRYPTION_KEY`

Generate the encryption key with:

```sh
openssl rand -hex 32
```

Add it to the MotoMate service environment:

```yaml
services:
  motomate:
    environment:
      INTEGRATION_ENCRYPTION_KEY: "your-64-character-hex-value"
      PAPERLESS_SYNC_INTERVAL_SECONDS: "30"
```

Do not reuse `AUTH_SECRET` as the integration key. Keep the configured value stable: changing it makes previously saved Paperless tokens unreadable until the original key is restored or the connection is recreated.

The sync interval defaults to 30 seconds and controls how frequently MotoMate polls Paperless for completion of asynchronous uploads.

## Connect Paperless-ngx

1. In Paperless-ngx, create or copy an API token for the account MotoMate will use.
2. In MotoMate, open **Settings > Developer**.
3. Under **Paperless-ngx**, enter a connection name, the Paperless base URL, and the API token.
4. Select **Connect and test**. MotoMate saves the token only after the API test succeeds.

The saved token is encrypted with AES-256-GCM before it is stored in the MotoMate database. It is used only by authenticated server-side requests and is never returned to the browser.

## Document actions

| Action                  | MotoMate content                                                                    | Paperless content                                          | What removal from MotoMate does                                            |
| ----------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Link from Paperless** | Metadata and a secure reference only                                                | Existing document remains authoritative                    | Removes only the MotoMate reference                                        |
| **Copy from Paperless** | Stores an independent local copy and the Paperless reference                        | Existing document remains unchanged                        | Removes the MotoMate record and local copy only                            |
| **Copy to Paperless**   | Keeps the local MotoMate file                                                       | Creates a new Paperless document                           | Removes the MotoMate record and local copy; the Paperless document remains |
| **Move to Paperless**   | Keeps the local file until Paperless confirms successful ingestion, then removes it | Creates a new Paperless document and becomes authoritative | Removes only the MotoMate reference                                        |
| **Preview**             | No ownership change                                                                 | No ownership change                                        | Nothing; this is read-only                                                 |
| **Download**            | No ownership change                                                                 | No ownership change                                        | Nothing; this is read-only                                                 |

“Copy to Paperless” is the former mirror concept expressed as an explicit action: there are two durable copies after Paperless confirms the upload. “Move to Paperless” is asynchronous and does not remove the local file until Paperless reports success. Failed jobs retain the local content and expose their error state for retry.

Disconnecting a Paperless connection is blocked while MotoMate documents still reference it. Remove or copy those references first. Disconnecting never calls a Paperless delete API.

## Previews and thumbnails

Previewable PDFs, raster images, and plain-text files open in a new browser tab through an authenticated MotoMate endpoint. Download is a separate explicit action and returns an attachment response.

- Linked Paperless documents use Paperless's generated thumbnail endpoint through an authenticated MotoMate proxy.
- Local PDFs render their first page as a WebP thumbnail on first view.
- Local JPEG, PNG, GIF, WebP, and AVIF files are resized and converted to WebP.
- Generated thumbnails are cached under `thumbnails/<user>/<document>.webp` in the configured local or S3 storage adapter.
- SVG, HTML, and other active or unsupported formats are not rendered as thumbnails. The UI displays a neutral document placeholder instead.

The thumbnail and content routes verify the signed-in user owns the document. Responses use private browser caching and `nosniff`; Paperless credentials and direct internal URLs are not embedded in the page.

## Event attachments and migration

Documents are attached to maintenance and spending events through the `document_links` table instead of event-specific JSON arrays. The relation field distinguishes normal attachments from purchase and sale documents. The same model also supports vehicle-level links and gives future event types a consistent extension point, while the underlying document can be local, Paperless-linked, or present in both systems.

Migration `0009_cheerful_catseye.sql` creates the Paperless connection, sync job, and document link tables; adds source/sync fields to documents; and migrates existing maintenance and spending attachment arrays into document links. MotoMate applies migrations automatically when the container starts. Back up the SQLite database before upgrading.

## Backup and restore

Back up all of the following together:

- MotoMate database (`/app/data` with the default container paths)
- MotoMate local uploads (`/app/uploads`) when using local storage
- `INTEGRATION_ENCRYPTION_KEY` in a secrets manager or encrypted configuration backup
- Paperless-ngx using its normal backup process

A MotoMate backup cannot restore linked-only Paperless content. Conversely, a Paperless backup does not include MotoMate event relationships.

## Troubleshooting

### Connection test fails

- Confirm the URL is the Paperless base URL, not an individual API endpoint.
- Test DNS, TLS, and routing from inside the MotoMate container. A URL reachable from a desktop browser may not be reachable from Docker.
- Confirm the token is current and the Paperless account can list documents.
- If the error mentions encryption, verify `INTEGRATION_ENCRYPTION_KEY` decodes to exactly 32 bytes.

### A transfer remains queued or processing

- Check that the MotoMate process is running its scheduler.
- Verify `PAPERLESS_SYNC_INTERVAL_SECONDS` is a positive number.
- Open the document list to inspect its transfer status and error detail.
- Confirm Paperless workers are processing document ingestion tasks.

### Preview or thumbnail returns 502

- Test the Paperless connection again for linked-only documents.
- Confirm the original MotoMate object still exists in local or S3 storage for local documents.
- Check MotoMate logs for `Document content retrieval failed` or `Document thumbnail retrieval failed`.
- For S3, verify MotoMate has get, put, and delete access to both document and `thumbnails/` object keys.

### Paperless shows duplicates

Copy and move create new Paperless documents. Wait for an in-progress action to finish before starting another transfer. MotoMate prevents multiple active jobs for the same document, but retrying after Paperless accepted an upload and before its success state became visible can require manual duplicate cleanup in Paperless.
