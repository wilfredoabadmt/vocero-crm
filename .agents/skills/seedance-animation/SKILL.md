---
name: seedance-animation
description: Generate seamless loop video animations for web pages using Seedance 2.0 via KIE.AI. Use this skill whenever the user wants to create a looping intro animation, web animation, loading screen animation, or any short video loop — especially from a reference image. Triggers on requests like "create a loop animation", "animate this image", "make a looping video", "generate an intro animation for my site", or "create a Seedance animation".
---

# Seedance 2.0 Animation Generator

Generates 5-second seamless loop video animations using ByteDance Seedance 2.0 via the KIE.AI API. The output is a `.mp4` file designed to play as a smooth, looping intro animation on a web page.

## Prerequisites

The environment must have `KIE_API_KEY` set. Read it from the `.env` file if present — it will contain a line like `KIE_API_KEY=<key>`. Load it before running the script.

## Workflow

Follow these steps every time:

### Step 1 — Gather inputs

Collect from the user:
- **Reference image**: a local file path or URL. This becomes the first frame of the animation (required for best results).
- **Aspect ratio**: default `16:9` for web. Ask if unsure — common options: `16:9`, `1:1`, `9:16`.
- **Prompt** (optional): the user may describe the motion they want. If they don't provide one, generate one yourself (see Prompt Guidelines below).

If the user provides a local image file path, resolve it to an absolute path. The script handles file uploads automatically.

### Step 2 — Build the animation prompt

If the user hasn't written a prompt, craft one using the Prompt Guidelines section. Show the user the prompt you've written and give them a chance to refine it before proceeding.

### Step 3 — Run the generation script

```bash
python "<skill_dir>/scripts/generate_animation.py" \
  --image "<absolute_path_or_url>" \
  --prompt "<animation_prompt>" \
  --aspect-ratio "16:9" \
  --output-dir "<output_directory>"
```

- `<skill_dir>` is the directory containing this SKILL.md file.
- `<output_directory>` defaults to the current working directory if not specified.
- The script loads `KIE_API_KEY` from the environment or from a `.env` file in the current working directory.
- The script polls for completion and downloads the video automatically.

### Step 4 — Present the result

Once the script completes, tell the user:
- The path to the downloaded `.mp4` file
- Suggested HTML snippet for embedding as a looping background or intro:

```html
<video autoplay loop muted playsinline>
  <source src="animation.mp4" type="video/mp4">
</video>
```

---

## Prompt Guidelines for Seamless Loop Animations

The key challenge is generating an animation that loops seamlessly — the end frame must flow back naturally into the first frame. Write prompts that guide the model toward cyclic, repeating motion.

**Effective motion patterns for loops:**
- Gentle, continuous flows: floating particles, drifting fog, rippling water, swaying foliage
- Slow zoom in/out that returns to origin (avoid full-zoom-in — it won't loop)
- Pulsing light or glow effects that breathe in and out
- Smooth camera drift with no hard start or end point
- Ambient environmental motion: clouds drifting, embers floating, bokeh shifting

**Prompt structure:**

```
[describe the motion style], seamless loop, [mood/atmosphere], cinematic, smooth motion
```

**Examples:**
- `Gentle floating light particles drifting upward, seamless loop, ethereal and calm atmosphere, cinematic`
- `Soft fog slowly rolling through the scene, seamless loop, mysterious moody atmosphere, slow motion`
- `Subtle water surface rippling in circles, seamless loop, serene and minimal, 4K`
- `Bokeh lights slowly pulsing and drifting, seamless loop, dreamlike warm tones, smooth`

**What to avoid in prompts:**
- Abrupt starts or ends ("walks in", "explodes", "fades to black")
- Linear sequences with a clear beginning and end
- Fast cuts or camera pans with directional momentum
- Narrative action that doesn't cycle

---

## API Reference (for troubleshooting)

| Endpoint | Method | Purpose |
|---|---|---|
| `https://api.kie.ai/api/v1/jobs/createTask` | POST | Submit generation task |
| `https://api.kie.ai/api/v1/jobs/recordInfo` | GET | Poll task status |

**Task states:** `waiting` → `queuing` → `generating` → `success` / `fail`

**Key parameters:**
- `model`: `bytedance/seedance-2`
- `input.duration`: `5` (fixed for loop animations)
- `input.first_frame_url`: image URL or `asset://{assetId}`
- `input.resolution`: `720p`
- `input.generate_audio`: `false` (web animations don't need audio)
- `input.web_search`: `false`

**Error codes:**
- `401` — Invalid API key
- `402` — Insufficient credits on KIE.AI account
- `422` — Validation error (check parameters)
- `429` — Rate limit — wait and retry
- `501` — Generation failed — try a different prompt
