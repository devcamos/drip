# Drip app icon

The source artwork is `drip-icon-master.png`: an ivory rising chart with three terracotta droplets above its upward spikes, on an espresso background. It uses the Nexus palette (`#fffaf1`, `#b85a2a`, `#1b1510`).

The full square artwork is exported to the 192px/512px PWA icons and 180px Apple touch icon. The 512px maskable version adds 16px of padding on every side so launchers can crop it into a circle. The browser favicon contains 16px, 32px, 48px and 64px opaque RGBA PNG frames.

Keep exports opaque and square; each operating system applies its own icon shape. Icon URLs carry a version to avoid displaying an older cached design. Bump that version and the service-worker cache when replacing the artwork.
