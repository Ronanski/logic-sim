# Redesign the Simulate workspace

## Outcome
Turn Simulate into a canvas-first workspace that uses the full available viewport while preserving the simulator’s existing industrial visual system and behavior.

## Changes
- Restore the uploaded LogicSim source as the working app baseline.
- Make the logic canvas fill all remaining width and height beneath a slim control toolbar.
- Move input overrides into a collapsible left drawer.
- Move outputs and selected-node parameters into a collapsible right drawer.
- Move the live signal monitor into a collapsible bottom drawer, closed initially.
- Add fit-view and fullscreen controls to the toolbar.
- Preserve graph selection, run/pause/step/reset, active-wire display, input forcing, outputs, parameter editing, and trends.
- Keep the interface usable when side or bottom drawers are open, including narrower screens.

## Verification
- Check the page at desktop and mobile widths.
- Exercise drawer toggles, graph controls, fit view, fullscreen, node selection, and the monitor drawer.
- Confirm the project builds without errors.

## Technical details
- Use the existing React Flow instance for fitting the graph and the browser Fullscreen API for fullscreen mode.
- Keep all colors, typography, spacing, and controls aligned with the existing design tokens and component library.
