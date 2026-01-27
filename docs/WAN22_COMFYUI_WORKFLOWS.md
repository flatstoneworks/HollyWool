# WAN 2.2 and ComfyUI Workflows

**Last Updated:** January 27, 2026

---

## What is WAN 2.2?

WAN 2.2 is a **video generation model** developed by **Alibaba Cloud**. It uses a Mixture of Experts (MoE) architecture and is one of the strongest open-source video generation models available. Key capabilities include film-level aesthetic control, large-scale complex motion generation, and precise semantic compliance.

### Model Sizes

| Variant | Parameters | Min VRAM | Use Case |
|---------|-----------|----------|----------|
| **WAN 2.2 5B** | 5 billion | 8 GB (with optimizations) | Consumer GPUs |
| **WAN 2.2 14B** | 14 billion | 24+ GB | High-end GPUs |

### Supported Generation Modes

- **Text-to-Video (T2V)** — Generate video from a text prompt
- **Image-to-Video (I2V)** — Animate a still image into video
- **Video-to-Video (V2V)** — Transform an existing video with new styles or content

---

## What is a ComfyUI Workflow?

A **workflow** in ComfyUI is a **node-based visual graph** that defines an entire generation pipeline. Each node performs a specific task — loading a model, encoding text, sampling, applying LoRAs, decoding output — and they are wired together to form a complete process.

Workflows are saved as **JSON files** and can be shared, imported, and modified. Think of a workflow as a reusable "recipe" that someone else has configured and tested so you can load it and start generating without wiring up all the nodes yourself.

### What a Typical Video Workflow Contains

```
Model Loader  -->  Text Encoder  -->  Sampler  -->  VAE Decoder  -->  Video Output
     |                                   |
  LoRA Loader                     SageAttention Patch
```

- **Model Loader** — loads the WAN 2.2 checkpoint (5B or 14B)
- **Text Encoder** — converts your prompt into model-readable embeddings (UMT5 encoder for WAN 2.2)
- **Sampler** — the denoising loop that generates the video frames
- **VAE Decoder** — converts latent frames into pixel-space video
- **Optional nodes** — LoRA loaders, SageAttention patches, upscalers, interpolation

### Where to Find Workflows

- **Civitai** — community-shared workflows alongside models and LoRAs
- **OpenArt** — curated ComfyUI workflow gallery
- **ComfyUI Official Docs** — reference workflows from the ComfyUI team

---

## What is SageAttention?

**SageAttention** is an optimization library that replaces the standard attention mechanism in diffusion models with a faster, more memory-efficient implementation. Attention layers are the most memory-hungry part of these models, so optimizing them has a large impact.

### Performance Gains

| Metric | Improvement |
|--------|-------------|
| **Speed** | ~2x faster generation |
| **VRAM** | Significant reduction (enables 8 GB cards to run WAN 2.2 5B) |
| **Quality** | No meaningful loss for most use cases |

### How to Enable in ComfyUI

**Option 1 — Command-line flag:**
```bash
python main.py --use-sage-attention
```

**Option 2 — Workflow node:**
Use the **Patch Sage Attention KJ** node from the `ComfyUI-KJNodes` custom node pack. Place it before the sampler and set `sage_attention` to `auto`.

### Caveat

SageAttention can produce **noisy output** with the WAN 2.2 I2V (image-to-video) 5B model. When doing image-to-video generation with the 5B variant, start ComfyUI **without** the `--use-sage-attention` flag. Text-to-video works fine.

---

## "WAN 2.2 for Everyone" — What It Means

The Civitai resource titled **"WAN2.2 for Everyone: 8 GB-Friendly ComfyUI Workflows with SageAttention"** is a **pre-built ComfyUI workflow file** that:

1. Loads the **WAN 2.2 video model**
2. Applies **SageAttention** to cut VRAM usage and double speed
3. Runs on GPUs with as little as **8 GB VRAM**
4. Generates a 5-second clip at 480x720 in roughly 5 minutes

It is designed so anyone with a modest GPU can generate AI video without manually configuring the pipeline.

### GGUF Variants

For low-VRAM setups, WAN 2.2 is also available in **GGUF format** — a quantized model format that further reduces memory usage. Use the 5B GGUF for 8 GB cards and the 14B GGUF for higher-end hardware.

---

## Relationship to HollyWool

HollyWool currently supports video generation via LTX-Video (T2V), CogVideoX (I2V), and Stable Video Diffusion. WAN 2.2 represents a potential addition to the supported model types. Key considerations:

- WAN 2.2 uses a different architecture (MoE) than currently supported models
- The 5B variant's low VRAM requirement makes it accessible on a wider range of hardware
- SageAttention integration would need to be evaluated for the HollyWool inference pipeline

See also: [CHECKPOINTS_AND_LORAS.md](./CHECKPOINTS_AND_LORAS.md) for how checkpoints, LoRAs, and weights work together.

---

## References

- [WAN2.2 for Everyone on Civitai](https://civitai.com/models/1869624/wan22-for-everyone-8-gb-friendly-comfyui-workflows-with-sageattention)
- [ComfyUI Official WAN 2.2 Tutorial](https://docs.comfy.org/tutorials/video/wan/wan2_2)
- [ComfyUI Wiki — WAN 2.2 Complete Guide](https://comfyui-wiki.com/en/tutorial/advanced/video/wan2.2/wan2-2)
- [SageAttention Speed-Up Guide](https://www.digitalcreativeai.net/en/post/how-speed-up-wan2-2-comfyui-sageattention-spargeattention)
- [Run WAN 2.2 on 8 GB VRAM — DEV Community](https://dev.to/aitechtutorials/run-wan-22-in-comfyui-with-just-8gb-vram-full-image-to-video-ai-workflow-2gb6)
