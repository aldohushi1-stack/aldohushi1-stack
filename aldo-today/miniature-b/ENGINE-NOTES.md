# Engine notes: Miniature A vs Miniature B

**Miniature A** is Henley Beach's look (the toy model). **Miniature B** is the realistic look: the CBD board, and Henley Beach's B arm.

Kept for the A/B test. `engine-from-henley.patch` is the full diff against Henley's live engine. This file explains what each change is, the traps hit on the way, and what to hold steady between the two arms.

## What changed, by section of the engine

| Section | Miniature A | Miniature B |
|---|---|---|
| `parseData` | `D_BLD` boxes; road width by kind | Adds `D_FOOT` (real footprints, delta-coded, courtyards) and `D_TREES`. A road code can carry its width (`p22`). Henley's format still parses. |
| Renderer | Display colour, no tone mapping | `outputEncoding = sRGB`, ACES filmic, exposure .97. Every hex colour goes through `C()` (sRGB → linear); canvas textures through `srgbTex()`. |
| Sky, fog, light | Pale sky, low WNW sun at 1.0 | Blue gradient sky; haze fog that scales with the tray (A's 1700–6200 m on a small one, about 2700–8400 on the CBD's); hemisphere .62; sun 2.9 from the north-west at about 35°. |
| Reflections | — | `scene.environment` = PMREM of a gradient sky with a sun spot. Only the Standard materials (glass, buildings, cars, water) use it. |
| Ground | Flat colours | Grey noise textures for grass, paving, asphalt and roofs; olive grass; tray top from `PLAN.ground` (urban grey for the CBD, suburban lawn by default); a warm table that fades into the haze. |
| Streets | Width by kind, 5 m footpath | Width per road and footpath by class (`KERB`) when the data has widths (the CBD); A's widths, 5 m footpaths and road margins when it doesn't (Henley). Paved mall, thin white lane dashes. |
| Buildings | Instanced boxes plus hip caps, random bright roofs | `D_FOOT` (the CBD) or A's `D_BLD` boxes (Henley: houses get the cottage facade and a hip roof at A's size; flats and shops get flat roofs; pools are clear water with a coping). One merged mesh per facade kind. Walls are UV'd one window bay by one storey, so floors line up. Two-sided walls give parapets. Flat roofs sit behind a .9 m parapet, with plant boxes and lift overruns. Pitched roofs are hip/gable/dome on the footprint's minimum-area box. Plaster for the neighbours. |
| Contact shadow | — | Walls darken toward the ground (shader, by world y). A transparent skirt round each footprint on the ground. |
| Trees | Icosahedron balls, bright greens | Mapped trees plus a sparse Park Lands fill (the CBD), or A's own planting of streets, parks, back gardens and dune scrub (Henley). Crowns are 3 lumpy lobes (1 on phones) with round-ball normals. Gums are grey-green, plane trees fresh green. Open 4-sided trunks. |
| Cars, people, boats | 6.6 m toys in primary colours; bright shirts | 4.6 m cars in real fleet colours; ordinary clothes; sails, sea and pools in linear colour |
| Kit | — | `tracks`: static rail on ballast for yards. The other kits (train, tram, rowers, cyclists) are unchanged. |
| Lens | Saturation ×1.24, contrast 1.07, vignette .6 | Saturation ×1.06, contrast 1.05, vignette .45, max blur 1.8. The scene buffer is stored sRGB-encoded. |
| Camera | Fixed fly distance and elevation | `PLAN.fly.dist`, `swing` and `elev`, and `PLAN.zoom`. All default to A's; the CBD sets 820 m and 70–3800 m for its bigger tray. |
| Test hook | — | `__bait.info()`: triangles, top meshes, tree and building counts |

## Traps hit while building it

- **PMREM renders into RGBE.** A custom sky shader must end with `linearToOutputTexel(...)`. If it doesn't, the environment map decodes to about 2^127, and every Standard material renders black.
- **8-bit linear buffers band in the shadows.** Set `rtA.texture.encoding = sRGBEncoding` so the scene lands in display colour, and leave the lens shader as it was.
- **Labels and the gold edge** need `toneMapped: false`, or the filmic curve dulls them.
- **Instance and vertex colours are linear.** Use `C(hex)`, not `col.set(hex)`.
- **Triangle budget.** Detail-1 crowns on 15,000 trees came to 6.5 M triangles. Twenty triangles per lobe is the budget: 1.47 M on desktop, 0.91 M on phones.

## A's data in B: how the Henley arm stays identical

- **The data file is A's, untouched** (`build/henley-beach.data.js` is the live page's data script).
- **The random stream is drawn as A draws it.** A draws a wall height for each house, then a wall colour and a roof colour for each painted one, then plants its trees, then two numbers per tree and per shrub (a turn and a colour), and then starts its cars. B makes exactly those draws in that order, even where it picks its own colours from a second stream (`brng`). So the same trees stand in the same places, and the cars start where A's do.
- **The occupancy grid is marked as A marks it** (boxes with a 1.5 m pad, pools 1.2 m, roads at A's margins). The board's clearing comes after the trees, as in A.
- **Check:** B's plaque counts 2,355 buildings in the suburb, the same as A's plan.

## A/B: keeping it a fair test

- **One suburb per comparison.** Henley in A against the CBD in B mixes the look with the suburb. Henley now has both: A (live) and B (`index.b.html`).
- **Telling the arms apart needs no code.** The server fills the slot, and `safePath` accepts a query, so give each arm its own beacon, e.g. `"beacon":"/adelaide/adelaide/miniature/seen?arm=b"` and `…?arm=a`.
- **What the beacon already reports:**
  - `moving`: first frame, with `ms` (time to it) and `phone`
  - `ask`: a tap on the board or "What's my place worth?"
  - `fallback`: with `why` (`nogl`, `timeout`, `lost`, `savedata`)
  
  Ask rate per `moving` is the conversion. `ms`, and `fallback` with `lost`, show the price of the heavier page.
- **Hold steady:** the panel words, the board's text, the ask link and the camera path. Change only the look.
- **Weight.** For Henley the two arms weigh almost the same: B is 267 KB against A's 246 KB, and draws 0.16 M triangles on a phone. The difference is the shader work: standard materials, filmic tone mapping and reflections cost more per pixel than A's flat colours. Compare `moving` times on phones, and count `lost` fallbacks separately.
