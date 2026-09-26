# SafeFoto overlay on Immich

Base: Immich v3.0.1 family fork. Keep SafeFoto changes on feature branches and merge upstream releases into the fork after review.

## Purchase prompts (web)
- BottomInfo.svelte does not mount PurchaseInfo.
- UserSettingsList.svelte does not mount purchase settings.
- Admin user detail does not show the supporter badge setting.
- /buy preserves product-key activation callbacks, then redirects to photos.
- Do not remove AGPL license files, authorship, legal notices, or the published source link.
- The official mobile app is a separate build and is not changed by this web overlay.

## Upgrade review
1. Diff upstream web entry points for new purchase prompts, modals, notices and links.
2. Reapply the small SafeFoto web changes if component boundaries moved.
3. Exercise an account older than the current purchase threshold, settings, admin user details and /buy.
4. Verify the public source link points to the SafeFoto fork and the license remains available.
5. Build and check the server separately; the lab sets SAFEFOTO_SKIP_SWAGGER=1 because of the current Zod/OpenAPI date-schema startup issue.

The isolated lab is at /srv/tests/safefoto/immich-real and uses its own database and upload directory.
