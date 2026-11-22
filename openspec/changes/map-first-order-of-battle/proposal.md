# Hierarchical Order of Battle UI

## Background
The previous sidebar had formation cards followed by one long list of divisions. Finding a unit by command hierarchy or seeing which army it belonged to required visual scanning and repeated filtering.

## Scope
- Default order-of-battle view: army group → army → division. Use native keyboard-accessible expand/collapse and deterministic ID ordering.
- Include unassigned divisions and independent armies; keep historical formation IDs and the engine-owned hierarchy unchanged.
- Show division location, organization and supply bars, combat/movement/encirclement status and attention indicators.
- Selecting a division uses the existing selection handler and centers the map; modifier-click supports multi-selection (up to 256).
- Search by division ID/province/group/army and filter by attention, movement and selection.
- Retain a switch to the previous detailed flat-list view with all established test IDs and command controls.
- Adaptive right panel on smaller viewports; no persistence or combat/stat changes.

## Acceptance
- With 20/100/500 divisions each division appears once in the hierarchy without requiring a flat list.
- Existing gameplay and command UI remain available through detailed list and shared action bar.
- New hierarchy is verified by pure unit tests and a browser navigation/formation-change test.
