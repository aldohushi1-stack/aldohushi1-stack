# Engine notes: Miniature A vs Miniature B

**Miniature A** is Henley Beach's look (the toy model). **Miniature B** is the CBD board's look (the real one).

Kept for the A/B test. `engine-from-henley.patch` is the full diff (20 hunks) against Henley's live engine. This file explains what each change is, the traps hit on the way, and what to hold steady between the two arms.

## What changed, by section of the engine

| Section | Miniature A (Henley) | Miniature B (CBD) |
|---|---|---|
| `parseData` | `D_BLD` boxes; road width by kind | Adds `D_FOOT` (real footprints, delta-coded, courtyards) and `D_TREES`. A road code can carry its width (`p22`). Henley's format still parses. |
| Renderer | Display colour, no tone mapping | `outputEncoding = sRGB`, ACES filmic, exposure .97. Every hex colour goes through `C()` (sRGB → linear); canvas textures through `srgbTex()`. |
| Sky, fog, light | Pale sky, low WNW sun at 1.0 | Blue gradient sky, haze fog 2400–8200 m, hemisphere .62, sun 2.9 from the north-west at about 35°. |
| Reflections | — | `scene.environment` = PMREM of a gradient sky with a sun spot. Only the Standard materials (glass, buildings, cars, water) use it. |
| Ground | Flat colours | Grey noise textures for grass, paving, asphalt and roofs; olive grass; urban grey tray top; dark walnut table. |
| Streets | Width by kind, 5 m footpath | Width per road, footpath by class (`KERB`), paved mall, thin white lane dashes. |
| Buildings | Instanced boxes plus hip caps, random bright roofs | One merged mesh per facade kind from the real rings. Walls are UV'd one window bay by one storey, so floors line up. Two-sided walls give parapets. Flat roofs sit behind a .9 m parapet, with plant boxes and lift overruns. Pitched roofs are hip/gable/dome on the footprint's minimum-area box. Plaster for the neighbours. |
| Contact shadow | — | Walls darken toward the ground (shader, by world y). A transparent skirt round each footprint on the ground. |
| Trees | Icosahedron balls, bright greens | Mapped trees plus a sparse Park Lands fill. Crowns are 3 lumpy lobes (1 on phones) with round-ball normals. Gums are grey-green, plane trees fresh green. Open 4-sided trunks. |
| Cars | 6.6 m toys in primary colours | 4.6 m, Standard material, real fleet colours |
| Kit | — | `tracks`: static rail on ballast for yards. The other kits (train, tram, rowers, cyclists) are unchanged. |
| Lens | Saturation ×1.24, contrast 1.07, vignette .6 | Saturation ×1.06, contrast 1.05, vignette .45, max blur 1.8. The scene buffer is stored sRGB-encoded. |
| Camera | Fixed fly distance and elevation | `PLAN.fly.dist`, `swing` and `elev` (default to Henley's). Zoom range 70–3800 m for the bigger tray. |
| Test hook | — | `__bait.info()`: triangles, top meshes, tree and building counts |

## Traps hit while building it

- **PMREM renders into RGBE.** A custom sky shader must end with `linearToOutputTexel(...)`. If it doesn't, the environment map decodes to about 2^127, and every Standard material renders black.
- **8-bit linear buffers band in the shadows.** Set `rtA.texture.encoding = sRGBEncoding` so the scene lands in display colour, and leave the lens shader as it was.
- **Labels and the gold edge** need `toneMapped: false`, or the filmic curve dulls them.
- **Instance and vertex colours are linear.** Use `C(hex)`, not `col.set(hex)`.
- **Triangle budget.** Detail-1 crowns on 15,000 trees came to 6.5 M triangles. Twenty triangles per lobe is the budget: 1.47 M on desktop, 0.91 M on phones.

## A/B: keeping it a fair test

- **One suburb per comparison.** Henley in A against the CBD in B mixes the look with the suburb. Build both looks for the same suburb: the CBD in A is Henley's engine with this data, and Henley in B is this engine with Henley's data.
- **Telling the arms apart needs no code.** The server fills the slot, and `safePath` accepts a query, so give each arm its own beacon, e.g. `"beacon":"/adelaide/adelaide/miniature/seen?arm=b"` and `…?arm=a`.
- **What the beacon already reports:**
  - `moving`: first frame, with `ms` (time to it) and `phone`
  - `ask`: a tap on the board or "What's my place worth?"
  - `fallback`: with `why` (`nogl`, `timeout`, `lost`, `savedata`)
  
  Ask rate per `moving` is the conversion. `ms`, and `fallback` with `lost`, show the price of the heavier page.
- **Hold steady:** the panel words, the board's text, the ask link and the camera path. Change only the look.
- **Weight differs.** B is 1.05 MB (367 KB gzipped) against A's 0.25 MB (Henley), and it draws more triangles. Expect a later `moving` on phones, and count `lost` fallbacks separately.
