# TODO: Allow forcing H.264 for hardware decode on sites that provide multiple codecs per video (e.g. YouTube)

Hardware video decode now works on Intel `generic-amd64` (iHD/i965 VA-API drivers added in
`build/install_chromium`). But many sites — YouTube most notably — prefer codecs that *aren't*
hardware-decodable on most of our targets, so playback still falls back to software even though the
device has a perfectly good hardware decoder for H.264. This note records the problem and the options
so we don't re-investigate from scratch.

## The problem

Codec hardware-decode availability across our targets, worst to best:

| Codec | Hardware decode availability |
|-------|------------------------------|
| **H.264** | Near-universal — every Intel iGPU, the Pi's `bcm2835-codec`, virtually all SoCs. |
| **VP9** | Intel Gen9+ (e.g. Kaby Lake NUC shows `VAProfileVP9Profile0/2`), but **absent** on the Pi, generic arm64, and older x86. |
| **AV1** | Rare — Intel Gen11+ (Tiger Lake/Raptor Lake) only; most ARM SoCs lack it entirely. |

YouTube's codec preference is the **inverse**: **AV1 > VP9 > H.264**. So on a typical device YouTube
negotiates AV1 (or VP9, where the device can't hardware-decode it) and Chromium decodes in software
(`Dav1dVideoDecoder` for AV1, `libvpx` for VP9) — burning CPU — while the idle hardware decoder goes
unused.

This is a codec-**selection** problem, not a capability problem. On the Kaby Lake i3 NUC, Chromium
hardware-decodes VP9 and HEVC and H.264 directly (verified: a direct VP9 `.webm` reports
`decoderName: VaapiVideoDecoder`, `kIsPlatformVideoDecoder: true`, `vp9 profile0 1920x1080`). Yet
YouTube still serves AV1 and decodes it in software. The likely reason: `chrome://gpu`'s
`videoDecoding` array is **empty** even though `VaapiVideoDecoder` clearly works, so the page-facing
`navigator.mediaCapabilities.decodingInfo` reports VP9/AV1 as **not `powerEfficient`**. YouTube
weights selection on `smooth` (can the device keep up) plus its AV1 > VP9 > H.264 preference — not on
power efficiency — and an i3 software-plays AV1 "smoothly," so it picks AV1. The decoder's real
ability and the capability *advertised to the page* are disconnected; that gap is the problem.

Use `/diagnostics/report` to see it: the `vainfo` VA profile list (what the device *can* do in
hardware) vs. the MEDIA PLAYERS decoder name (what it *actually* used).

Forcing H.264 flips this for the broadest device coverage. Trade-off: YouTube caps H.264 at 1080p
(no 4K H.264) and it's slightly less bandwidth-efficient — generally acceptable for a video/kiosk
browser, and far better than dropped frames from software AV1.

## Options

### 1. h264ify (or enhanced-h264ify) browser extension
A maintained extension that hides VP9/AV1 from YouTube so it serves H.264.

- **Pros:** ready-made, well-tested, YouTube-specific edge cases already handled.
- **Cons:** third-party dependency we'd have to trust/pin/update; needs extension loading into our
  kiosk Chromium (`--load-extension=` or via the existing `/etc/chromium/policies` mechanism), which
  we don't currently do; YouTube-only.

### 2. Custom in-page override (do it ourselves)
Inject a small content script that reports VP9/AV1 as unsupported so the page picks H.264. Hook the
codec-negotiation entry points:

- `MediaSource.isTypeSupported` / `ManagedMediaSource.isTypeSupported`
- `HTMLMediaElement.prototype.canPlayType`
- `navigator.mediaCapabilities.decodingInfo` (return `supported:false` / `powerEfficient:false` for
  `vp9`/`av01` codec strings)

- **Pros:** no third-party code; can be made **generic** (any site, not just YouTube); tiny and
  auditable; we control the rollout (could gate behind an env var, e.g. `FORCE_H264=1`).
- **Cons:** we maintain it as sites evolve; must be careful not to claim a codec is unsupported when
  it's the *only* one the site offers (could break playback); per-device gating is ideal since
  forcing H.264 on a device that *does* have hardware VP9/AV1 (e.g. Gen13 Intel) is a downgrade.

## Recommendation (to validate later)

Lean toward **option 2** behind an opt-in env var, injected only where it helps. Decide whether to
apply it unconditionally or per-device using the VA profile list (only strip codecs the device can't
decode in hardware). Verify the result the same way as the VA-API fix: `/diagnostics/report` should
then show `VaapiVideoDecoder` / `hardware: true` on a YouTube tab instead of `Dav1dVideoDecoder`.

## Notes
- The VA-API hardware-decode groundwork (drivers + `vainfo` in the diagnostics report) already landed;
  this is purely about *which codec the page chooses*, not whether the hardware can decode it.
- Per-device codec truth is in `/diagnostics/report` under `VA-API (vainfo)`.
