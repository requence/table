---
'@requence/table': patch
---

Replace useEffectEvent with useRef+useCallback for stableGetItemId and
stableCompare in useTableCache. useEffectEvent-wrapped functions throw
when called during the React render phase, which happens when urql's
useSubscription invokes the handler inside a useState updater.
