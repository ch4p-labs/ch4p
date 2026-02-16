# How-to: Use the Canvas Workspace

The canvas workspace gives ch4p a visual, spatial interface. Instead of text-only responses, the agent can render rich UI components — cards, charts, forms, tables, code blocks — on an infinite canvas powered by [tldraw](https://tldraw.dev).

---

## Prerequisites

- ch4p installed and configured (`ch4p onboard`)
- A working LLM provider (any provider supported by ch4p)

---

## Start the Canvas

```bash
ch4p canvas
```

This starts a gateway server with WebSocket support, serves the canvas web UI, and opens your browser to the workspace. The agent is immediately available in the chat panel on the right side.

### Options

| Flag | Description |
|------|-------------|
| `--port N` | Override the server port (default: from config or 4800) |
| `--no-open` | Don't auto-open the browser |

---

## Using the Workspace

The canvas workspace has two areas:

**Left: Infinite Canvas** — A tldraw-powered spatial workspace. The agent places A2UI components here. You can also use tldraw's built-in drawing tools (pen, shapes, text, arrows) alongside the agent's components. Pan with the hand tool, zoom with scroll.

**Right: Chat Panel** — A text chat interface. Type messages, see agent responses stream in real-time, and monitor agent status (thinking, executing tools, etc.). Use the abort button to cancel a running agent.

### Interacting with Components

Components on the canvas are interactive:

- **Cards** — click action buttons to trigger agent responses
- **Forms** — fill in fields and click Submit to send values to the agent
- **Buttons** — click to trigger the associated action
- **All components** — drag to reposition on the canvas

Every interaction flows back to the agent as a structured event. The agent sees click events, form submissions, and position changes in real-time.

---

## A2UI Component Types

The agent can render 11 component types via the `canvas_render` tool:

| Type | Description |
|------|-------------|
| `card` | Title, body text, optional image, action buttons |
| `chart` | Bar, line, or pie chart with labeled datasets |
| `form` | Interactive form with text inputs, selects, checkboxes, textareas |
| `button` | Standalone button (primary, secondary, danger variants) |
| `text_field` | Single text input field |
| `data_table` | Tabular data with headers and rows |
| `code_block` | Code with language annotation |
| `markdown` | Rendered markdown content |
| `image` | Image display from URL |
| `progress` | Progress bar with percentage |
| `status` | Status indicator (success, warning, error, info) |

Components can be connected with directional edges (arrows) to show relationships.

---

## Configuration

Add a `canvas` section to `~/.ch4p/config.json`:

```json
{
  "canvas": {
    "enabled": true,
    "port": 4800,
    "maxComponents": 500
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable canvas support |
| `port` | `number` | gateway port | Server port for the canvas |
| `maxComponents` | `number` | `500` | Maximum components per session |

---

## How It Works

The canvas uses a WebSocket-based protocol between the browser and the gateway:

1. **You type a message** → sent as `c2s:message` over WebSocket
2. **Agent processes it** → runs the agent loop with `canvas_render` tool available
3. **Agent renders components** → calls `canvas_render` with component type, data, and position
4. **Components appear on canvas** → server state change pushes to browser via `s2c:canvas:change`
5. **You interact** → clicks/submissions sent back as `c2s:click`, `c2s:form_submit`, etc.
6. **Agent responds to interaction** → loop continues

The server maintains authoritative canvas state. The browser mirrors it via incremental updates. Drag events update positions on both sides.
