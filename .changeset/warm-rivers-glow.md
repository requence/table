---
'@requence/table': patch
---

Fix upsert into an empty cache (0→1 item transition). When the initial fetch
returned zero items, subsequent subscription upserts skipped the empty page and
never stored the item, causing the table to render an empty row.
