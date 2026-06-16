# Migrating from v2 to v3

v3 is a significant change to how the `browser` block runs. This guide covers what changed and what
you need to update. If you are starting fresh, you can ignore this document and follow the
[readme](../readme.md).

## 1. Wayland instead of X11 — the browser now needs a companion display block

In v2 the block ran its own X11 server and drew directly to the display. In v3 the block is a thin
**Wayland client**: it no longer starts a display server itself. You now run a separate
**display (compositor) block** alongside it, and the two share the Wayland socket through a volume.

At minimum your compose file must:

- add the display block as a service and `depends_on` it from `browser`;
- share a volume mounted at `/run` between the two so the browser can reach the Wayland socket;
- set `XDG_RUNTIME_DIR` and `WAYLAND_DISPLAY` on the browser service.

```yaml
volumes:
  display-socket:

services:
  display:
    image: bh.cr/balenalabs/display-<arch>   # companion compositor block; see its README for the image name
    privileged: true
    volumes:
      - display-socket:/run
    labels:
      io.balena.features.dbus: '1'

  browser:
    image: bh.cr/balenalabs/browser-<device-type>
    privileged: true
    depends_on:
      - display
    environment:
      XDG_RUNTIME_DIR: /run/user/0
      WAYLAND_DISPLAY: wayland-0
    devices:
      - /dev/dri:/dev/dri
    ports:
      - '5011:5011'
    volumes:
      - display-socket:/run
```

## 2. New image namespace: per device type, not per architecture

v2 published one image per architecture (`browser-aarch64`, `browser-amd64`, `browser-arm32`). v3
publishes one image **per device type**:

| v2 image | v3 image |
| --- | --- |
| `browser-aarch64` (Raspberry Pi 3) | `browser-raspberrypi3-64` |
| `browser-aarch64` (Raspberry Pi 4 / 400) | `browser-raspberrypi4-64` |
| `browser-aarch64` (Raspberry Pi 5) | `browser-raspberrypi5` |
| `browser-aarch64` (other 64-bit Arm) | `browser-generic-aarch64` |
| `browser-amd64` | `browser-generic-amd64` |

The reason is that the browser is a client whose build differs per target — most notably the
Raspberry Pi images use a Chromium built from the Raspberry Pi sources to get hardware video decode.
Update your `docker-compose.yml` to reference the image for your device type.

> 32-bit Raspberry Pi OS, the `arm32` images and the balena Fin (`fincm3`) are no longer built. Use
> the 64-bit (`aarch64`) OS on Raspberry Pi.

## 3. Hardware acceleration toggles

`ENABLE_GPU=1` still turns on GPU rendering **and** best-effort hardware video decode, so existing
video kiosks need no change. New in v3:

- **`DISABLE_VIDEO_DECODE=1`** — opt out of hardware video decode while keeping GPU rendering, for
  devices where the decode path misbehaves.
- Hardware **video encode** is not supported (see
  [#168](https://github.com/balena-io-experimental/browser/issues/168)).

See [Hardware acceleration](../readme.md#hardware-acceleration) for what to expect per device.

## 4. Custom `FLAGS` / `EXTRA_FLAGS`

If you overrode `FLAGS` or `EXTRA_FLAGS` in v2, review them. v3 renders through Wayland
(`--ozone-platform=wayland`), so X11-specific switches no longer apply, and the GPU/decode flags are
now chosen per device type by the block. Prefer the `ENABLE_GPU` / `DISABLE_VIDEO_DECODE` toggles over
hand-rolled flags where possible.

## 5. Diagnostics

The `/diagnostics/*` endpoints (Chromium version, GPU state, media-decoder state) are new in v3 and
are **off by default**. Set `ENABLE_DIAGNOSTICS=1` to enable them. See
[Diagnostics](../readme.md#diagnostics).

## 6. Remote debugging

In v2, mapping the remote debugging port did not actually make it reachable from another host —
Chromium binds that interface to localhost only. In v3 it is an explicit opt-in: set
`ENABLE_REMOTE_DEBUG=1` and map `REMOTE_DEBUG_PORT`. See
[Remote debugging](../readme.md#remote-debugging) for the security caveats.
