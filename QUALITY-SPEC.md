# Quality Spec — Spline Road System (AAA pass)

**Reference ground truth:** `refs/` (10 frames from the author's own 1080p showcase capture:
`01-showcase-1080p.png`, `frame-*.png`). The bar is these frames, not invented.

## Visual signatures (non-negotiable)
1. **Organic curves everywhere.** No straight lines, no grid feel. Riverbanks, tree
   clumps, road paths, terrain undulation all follow naturalistic curved flow.
2. **Palette**: forest greens / olive drabs / earthy browns, cohesive and grounded.
   Murky olive-green water. No oversaturated post-processing.
3. **Soft HDR daylight** — directional sun with long soft-edged shadows, subtle aerial
   perspective/fog toward horizon, gentle bloom on grass and water highlights.
4. **Layered terrain material** — base grass blended with dirt, moss, dry scrub by
   slope/height; no hard seams anywhere.
5. **Road = compacted earth and gravel**: central rutted wheel-worn path flanked by
   slightly overgrown grass edges, feathered into terrain (no hard edge).
6. **Timber bridges** — heavy weathered beams, railings, supports; reads as real
   construction, not a flat ribbon.
7. **High-density vegetation** with wind sway, alpha-mapped leaves, varied scale/rotation
   (no billboard flatness, no repetition visible).
8. **Composition driven by flow** — river curves and roads lead the eye through the
   forest toward the horizon.

## Technical floor (all subsystems)
- PBR materials, ACES tone mapping, soft shadows, fog, physically-based lights.
- No flat colors, no default materials, no visible aliasing on silhouettes.
- Real geometry over hacks; procedural is fine when it reaches reference quality.
- Camera work must feel authored (showcase views), never default-orbit.

## Per-subsystem focus for builders
- **lighting/scene**: sun + sky fill, fog color matching the mood, shadow softness, tone.
- **terrain**: undulation quality, blend weights, shore/mud transition at water.
- **roads**: rut/gravel detail, edge feathering, jitter, UV continuity, bridge deck+railings+supports.
- **vegetation**: forest density/clumping, grass LOD fade, wind, wildflowers.
- **residences**: cottage construction, fences, plot alignment to terrain.
- **ui**: minimal, readable, does not disturb the art (hide for beauty shots).

## Critic scoring
- 0-10 with structured gap list under: lighting, materials, geometry, post-processing,
  composition. Verdict ladder: WOWED (≥9, no major gaps) / CLOSE / AMATEUR.
