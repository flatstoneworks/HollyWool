# Checkpoints and LoRAs in HollyWool

**Last Updated:** January 27, 2026

---

## What is a Checkpoint?

A checkpoint is the **full AI model** itself. It contains all the neural network weights and parameters needed to generate images or video. When you load a checkpoint in HollyWool (or tools like Stable Diffusion WebUI / ComfyUI), you are loading an entire model that can generate output on its own.

- **File formats:** `.ckpt` or `.safetensors`
- **Typical size:** 2-7 GB
- **Examples:** SD 1.5, SDXL, Realistic Vision, DreamShaper, FLUX.1

A checkpoint is a saved snapshot of a model's state at a particular point during training, including all learned weights and biases. Different checkpoints produce different styles and capabilities because they were trained on different data or fine-tuned for different purposes.

In HollyWool, checkpoints are configured in `backend/config.yaml` and loaded by the inference service (`backend/app/services/inference.py`).

---

## What is a LoRA?

A **LoRA** (Low-Rank Adaptation) is a small, lightweight add-on that modifies a checkpoint's behavior. It was trained on top of a base checkpoint to nudge output toward a specific style, character, or concept.

- **File formats:** `.safetensors` (most common)
- **Typical size:** 10-200 MB
- **A LoRA cannot run on its own** — it always requires a base checkpoint

LoRAs are managed in HollyWool by the LoRA manager (`backend/app/services/lora_manager.py`) and listed via the `GET /api/loras` endpoint.

---

## How They Work Together

```
Checkpoint (base model)        -- required, generates on its own
  + LoRA (optional add-on)     -- tweaks style/subject
  + LoRA (optional add-on)     -- you can stack multiple
```

The checkpoint is the foundation. LoRAs are layered on top to adjust the output without replacing the entire model. This is what makes LoRAs practical — you can swap styles quickly without loading a multi-gigabyte checkpoint each time.

---

## LoRA Weights

When you attach a LoRA, you set a **weight value** that controls how strongly it influences the output. The weight is typically a number from 0.0 to 1.0:

| Weight | Effect |
|--------|--------|
| **0.0** | LoRA has no effect |
| **0.3** | Subtle influence |
| **0.5** | Moderate influence |
| **0.7** | Strong influence |
| **1.0** | Full effect (what the LoRA was trained for) |
| **>1.0** | Over-amplified, often produces artifacts |

**The checkpoint itself does not need a weight** — it is always fully loaded as the base. You only set weights for LoRAs and similar add-ons.

### Weight Examples in Practice

- **Style LoRA at 0.5:** Blends the LoRA's trained style with the checkpoint's default style
- **Character LoRA at 0.8:** Strong likeness to the trained character while preserving image quality
- **Two LoRAs stacked (0.6 + 0.4):** Combines both influences; keep combined weights reasonable to avoid artifacts

---

## Other Add-On Types

Beyond LoRAs, there are additional lightweight add-ons that work similarly:

| Type | Purpose | Size |
|------|---------|------|
| **LoRA** | Style, character, or concept adaptation | 10-200 MB |
| **Textual Inversion / Embedding** | Teaches new words/concepts to the model | <100 KB |
| **Hypernetwork** | Modifies cross-attention layers for style | 50-200 MB |
| **ControlNet** | Adds spatial guidance (pose, depth, edges) | 700 MB-1.4 GB |

All of these attach to a base checkpoint — none can run independently.

---

## Analogy

- **Checkpoint** = a complete painter with their own default style
- **LoRA** = instructions that say "paint more like _this_"
- **Weight** = how closely the painter follows those instructions

---

## Where to Find Models

- **Civitai** (https://civitai.com) — largest community repository for checkpoints, LoRAs, and embeddings. See [CIVITAI_INTEGRATION.md](./CIVITAI_INTEGRATION.md) for details on browsing and downloading models through HollyWool.
- **Hugging Face** (https://huggingface.co) — hosts official model releases and community uploads
