---
'@requence/table': patch
---

Fix DOM element reuse in VirtualTable empty state which could leak background skeleton rows. Enable vertical and horizontal centering of empty state contents by adding the `grow` style to its flex wrapper.
