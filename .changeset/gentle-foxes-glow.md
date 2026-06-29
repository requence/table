---
'@requence/table': patch
---

Allow `useTableCache` key to be a `string`, `number`, or an array of both. Array keys are joined with `'-'` internally, avoiding manual string concatenation when combining dynamic parameters like sort field, direction, and filters. The `CacheKey` type is now exported.
