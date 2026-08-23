# @deepseek-ai/dsh-client-ui-studio

English | [中文](README.zh.md)

`ui-studio` provides the editor-style three-column Studio frame. It owns the runtime `root` layout, arranges the navigation rail, conversation area, and workbench, and exposes the layout actions used by the sidebar and conversation plugins.

The left rail provides workspace and session navigation plus the read-only workspace file tree. The center preserves the existing conversation composer and conversation rendering chain. The right workbench records project todos, supports project creation, bottom-docked todo publishing, completion toggles, detail editing, and sending one todo or the current project to chat. Additional center seats remain available for later plugins.

Panel widths are transient browser state. The frame keeps closed panels mounted where required, constrains drag results to the column ranges, and preserves stored preferences when the viewport temporarily cannot fit them. `ctx.layout` maps sidebar actions to the left rail; details actions are no-ops because Studio has no details column.

The `/client` entry exports the plugin body, injection declarations, owner-share interfaces, and layout service. `StudioFrame`, the geometry store, and the column solver remain internal to slot registration.

## Visual Direction

Studio uses an ink-wash visual language that combines Song–Yuan landscape composition, strange-tale imagery, and expressive splash-ink brushwork. The interface should feel like a quiet work surface with a restrained archive quality, not a generic dark dashboard or a decorative historical imitation.

### Artistic Tone

The composition is cold, sparse, and layered. Blue-black ink, blue-gray haze, mist-white text, and quiet structural lines establish the main field. Open areas are intentional and should remain available around content, controls, and panel boundaries. Red and deep black appear only when a state needs force: active selection, danger, interruption, or a decisive mark.

### Color Use

Saturation stays low and the temperature stays cool across ordinary surfaces. Use cold ink and gray-blue layers for application backgrounds, workspaces, and status areas. Use pale paper-gray or mist-white for primary content, and smoke-gray for secondary information. Vermilion red is an accent for urgent state, destructive action, and important seals; deep black is an accent for concentrated contrast rather than a default surface. Avoid neon colors, cyan glow, glass-like highlights, warm-brown fields, gradient buttons, and heavy shadows.

### Composition

Use “counting white as black”: whitespace carries hierarchy and gives the interface room to breathe. Build depth with faint ink diffusion, broken rules, paper fibers, and changes in opacity rather than stacked cards or strong borders. Background texture must stay subordinate to text, icons, and focus indicators. Rounded corners remain restrained, generally between `0` and `6px`; pills and glossy surfaces are not part of the Studio language.

### Application Rules

New views should establish one clear content layer, one quiet structural layer, and a small number of state marks. Prefer fine lines, offset spacing, pale paper surfaces, and soft ink traces over shadows and decorative effects. Product labels remain direct even when section captions use terms such as “archive”, “desk”, or “jianghu”. Keyboard access, visible focus, contrast, wrapping, narrow-rail behavior, and reduced-motion support remain mandatory parts of the visual treatment.

## Model Experience

None. Studio manages browser view state and sends user-selected todo text to the conversation UI; it does not assemble or send provider requests.

#### KV Cache effect

None. This package does not build provider prompts or maintain provider-side cache state.

## Known Limitations and Deferred Work

- **Content seats remain extensible** — the Studio frame does not provide a built-in code editor or tool dock; those areas are reserved for later registrants.
- **No details column** — the details seat is declared for composition but is not rendered by this layout, so `ctx.layout.openDetails` and `ctx.layout.closeDetails` are no-ops.
- **Transient geometry and workbench data** — panel widths, projects, and todos return to their initial values after reload; no browser persistence is provided.
- **No narrow-viewport auto-collapse** — the left rail keeps its stored preference below the narrow-layout threshold.
