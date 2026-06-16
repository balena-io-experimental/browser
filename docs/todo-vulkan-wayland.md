# TODO: Vulkan on Wayland (deferred until after v3)

Vulkan support was removed from the block before the v3 release. This note records why,
so we don't re-investigate from scratch when we pick it back up.

## What we found

Chromium's Vulkan backend is **incompatible with native Ozone Wayland**. With
`--ozone-platform=wayland` (which v3 always uses), the GPU process refuses Vulkan and logs:

```
ERROR:ui/ozone/platform/wayland/gpu/wayland_surface_factory.cc:252]
'--ozone-platform=wayland' is not compatible with Vulkan.
Consider switching to '--ozone-platform=x11' or disabling Vulkan
```

This is enforced in Chromium, not a driver, package, or permission problem:

- Confirmed on Raspberry Pi 5 with the Pi-patched builds (`chromium …+rpt1`,
  `mesa-vulkan-drivers 25.0.7-2+rpt4`) — same packages as Raspberry Pi OS desktop.
- When the block auto-enabled Vulkan, the GPU process crashed in a loop at startup
  (`gpu_process_host: GPU process exited unexpectedly: exit_code=8704`, 3x) before
  falling back to GLES. The crash reason was only visible with `--disable-gpu-sandbox`,
  which let the GPU process log the incompatibility message above.

## Why Raspberry Pi OS likely shows Vulkan enabled

Not confirmed, but the most likely explanation: on the RPi OS desktop Chromium probably
runs under **X11 / XWayland** (`--ozone-platform=x11`) rather than native Wayland, where
Vulkan is supported. The desktop compositor (labwc) using Vulkan would be separate from
Chromium's own renderer backend. Worth verifying the actual Chromium launch args / ozone
platform on RPi OS when we revisit this.

## Options for re-enabling later

1. Run Chromium under X11 / XWayland (`--ozone-platform=x11`). Brings Vulkan/WebGPU back
   but walks back the v3 X11 -> Wayland migration and needs the display block to provide
   XWayland. Large change for little gain on a video/kiosk browser.
2. Wait for upstream Chromium to support Vulkan under Ozone Wayland.

Under the current Wayland-only design, rendering runs on GLES (healthy: `gpu_compositing`,
`rasterization`, `webgl` all enabled). The only real loss is WebGPU, which needs Vulkan.

## Notes

- `mesa-vulkan-drivers` is still installed in `build/install_chromium` so the driver is
  present when we revisit this.
- The `FORCE_VULKAN` env var and the Vulkan feature flag were removed from `src/server.js`.
