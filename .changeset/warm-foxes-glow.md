---
'@requence/table': patch
---

Fix upsert not rendering items that sort after the last cached page when it is
the terminal page. Previously, new items appended at the end always deferred to
fetchCount — incrementing totalCount (creating empty space) without placing the
item on any page. Now the item is inserted directly when the last cached page
covers the tail of the dataset. Also stabilise callback identities with
useEffectEvent and memoise the returned cache object.
