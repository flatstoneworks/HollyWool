"""ComfyUI Workflow Parser - extracts editable parameters from workflow JSON.

Analyzes ComfyUI workflow files to identify user-editable parameters like:
- Prompts (positive/negative from CLIPTextEncode nodes)
- Sampler settings (seed, steps, cfg, sampler_name, scheduler)
- Image dimensions (width, height, batch_size)
- Model selections (checkpoint, LoRA)
"""

from dataclasses import dataclass, field
from typing import Any, Optional
from copy import deepcopy


@dataclass
class EditableParameter:
    """A single editable parameter extracted from a workflow.

    Attributes:
        node_id: The node ID in the workflow (e.g., "3")
        node_class: The node class type (e.g., "KSampler")
        input_name: The input field name (e.g., "seed")
        input_type: Type hint: STRING, INT, FLOAT, COMBO, IMAGE
        current_value: The current value in the workflow
        constraints: Dict with min, max, step for numbers; choices for COMBO
        display_name: Human-readable name for UI
        category: Grouping category: prompt, sampler, dimensions, model, advanced
    """
    node_id: str
    node_class: str
    input_name: str
    input_type: str
    current_value: Any
    constraints: dict = field(default_factory=dict)
    display_name: str = ""
    category: str = "advanced"

    def __post_init__(self):
        if not self.display_name:
            # Generate human-readable name from input_name
            self.display_name = self.input_name.replace("_", " ").title()


# Node classes and their editable inputs, organized by category
PARAMETER_DETECTION_RULES = {
    # Prompt inputs
    "CLIPTextEncode": {
        "text": {"type": "STRING", "category": "prompt", "display_name": "Prompt"},
    },
    "CLIPTextEncodeSDXL": {
        "text_g": {"type": "STRING", "category": "prompt", "display_name": "SDXL Prompt (G)"},
        "text_l": {"type": "STRING", "category": "prompt", "display_name": "SDXL Prompt (L)"},
    },

    # Sampler settings
    "KSampler": {
        "seed": {"type": "INT", "category": "sampler", "display_name": "Seed",
                 "constraints": {"min": 0, "max": 2**32 - 1}},
        "steps": {"type": "INT", "category": "sampler", "display_name": "Steps",
                  "constraints": {"min": 1, "max": 150}},
        "cfg": {"type": "FLOAT", "category": "sampler", "display_name": "CFG Scale",
                "constraints": {"min": 1.0, "max": 30.0, "step": 0.5}},
        "sampler_name": {"type": "COMBO", "category": "sampler", "display_name": "Sampler"},
        "scheduler": {"type": "COMBO", "category": "sampler", "display_name": "Scheduler"},
        "denoise": {"type": "FLOAT", "category": "sampler", "display_name": "Denoise",
                    "constraints": {"min": 0.0, "max": 1.0, "step": 0.01}},
    },
    "KSamplerAdvanced": {
        "noise_seed": {"type": "INT", "category": "sampler", "display_name": "Seed",
                       "constraints": {"min": 0, "max": 2**32 - 1}},
        "steps": {"type": "INT", "category": "sampler", "display_name": "Steps",
                  "constraints": {"min": 1, "max": 150}},
        "cfg": {"type": "FLOAT", "category": "sampler", "display_name": "CFG Scale",
                "constraints": {"min": 1.0, "max": 30.0, "step": 0.5}},
        "sampler_name": {"type": "COMBO", "category": "sampler", "display_name": "Sampler"},
        "scheduler": {"type": "COMBO", "category": "sampler", "display_name": "Scheduler"},
    },
    "SamplerCustom": {
        "cfg": {"type": "FLOAT", "category": "sampler", "display_name": "CFG Scale",
                "constraints": {"min": 1.0, "max": 30.0, "step": 0.5}},
    },

    # Dimensions
    "EmptyLatentImage": {
        "width": {"type": "INT", "category": "dimensions", "display_name": "Width",
                  "constraints": {"min": 64, "max": 8192, "step": 8}},
        "height": {"type": "INT", "category": "dimensions", "display_name": "Height",
                   "constraints": {"min": 64, "max": 8192, "step": 8}},
        "batch_size": {"type": "INT", "category": "dimensions", "display_name": "Batch Size",
                       "constraints": {"min": 1, "max": 16}},
    },
    "EmptySD3LatentImage": {
        "width": {"type": "INT", "category": "dimensions", "display_name": "Width",
                  "constraints": {"min": 64, "max": 8192, "step": 8}},
        "height": {"type": "INT", "category": "dimensions", "display_name": "Height",
                   "constraints": {"min": 64, "max": 8192, "step": 8}},
        "batch_size": {"type": "INT", "category": "dimensions", "display_name": "Batch Size",
                       "constraints": {"min": 1, "max": 16}},
    },

    # Model loaders
    "CheckpointLoaderSimple": {
        "ckpt_name": {"type": "COMBO", "category": "model", "display_name": "Checkpoint"},
    },
    "UNETLoader": {
        "unet_name": {"type": "COMBO", "category": "model", "display_name": "UNET Model"},
    },
    "VAELoader": {
        "vae_name": {"type": "COMBO", "category": "model", "display_name": "VAE"},
    },
    "CLIPLoader": {
        "clip_name": {"type": "COMBO", "category": "model", "display_name": "CLIP Model"},
    },
    "LoraLoader": {
        "lora_name": {"type": "COMBO", "category": "model", "display_name": "LoRA"},
        "strength_model": {"type": "FLOAT", "category": "model", "display_name": "LoRA Model Strength",
                           "constraints": {"min": -2.0, "max": 2.0, "step": 0.05}},
        "strength_clip": {"type": "FLOAT", "category": "model", "display_name": "LoRA CLIP Strength",
                          "constraints": {"min": -2.0, "max": 2.0, "step": 0.05}},
    },
    "LoraLoaderModelOnly": {
        "lora_name": {"type": "COMBO", "category": "model", "display_name": "LoRA"},
        "strength_model": {"type": "FLOAT", "category": "model", "display_name": "LoRA Strength",
                           "constraints": {"min": -2.0, "max": 2.0, "step": 0.05}},
    },

    # Control inputs
    "ControlNetLoader": {
        "control_net_name": {"type": "COMBO", "category": "model", "display_name": "ControlNet"},
    },
    "ControlNetApplyAdvanced": {
        "strength": {"type": "FLOAT", "category": "advanced", "display_name": "ControlNet Strength",
                     "constraints": {"min": 0.0, "max": 2.0, "step": 0.05}},
    },
}

# Common sampler choices (fallback when object_info unavailable)
DEFAULT_SAMPLERS = [
    "euler", "euler_ancestral", "heun", "heunpp2", "dpm_2", "dpm_2_ancestral",
    "lms", "dpm_fast", "dpm_adaptive", "dpmpp_2s_ancestral", "dpmpp_sde",
    "dpmpp_sde_gpu", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu",
    "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", "ddpm", "lcm", "ddim", "uni_pc",
    "uni_pc_bh2"
]

DEFAULT_SCHEDULERS = [
    "normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform",
    "beta"
]


class WorkflowParser:
    """Parses ComfyUI workflows to extract editable parameters."""

    def __init__(self, object_info: Optional[dict] = None):
        """Initialize parser.

        Args:
            object_info: Optional ComfyUI object_info for accurate COMBO choices.
                        If not provided, uses defaults for samplers/schedulers.
        """
        self.object_info = object_info or {}

    def parse(self, workflow: dict) -> list[EditableParameter]:
        """Parse a workflow and extract all editable parameters.

        Args:
            workflow: ComfyUI workflow in API format (dict of node_id -> node_data)

        Returns:
            List of EditableParameter objects, sorted by category then node_id.
        """
        parameters = []

        for node_id, node_data in workflow.items():
            class_type = node_data.get("class_type", "")
            inputs = node_data.get("inputs", {})

            # Check if this node class has known editable parameters
            if class_type in PARAMETER_DETECTION_RULES:
                rules = PARAMETER_DETECTION_RULES[class_type]

                for input_name, rule in rules.items():
                    # Check if this input exists in the workflow
                    if input_name not in inputs:
                        continue

                    value = inputs[input_name]

                    # Skip if value is a connection (list of [node_id, output_index])
                    if isinstance(value, list) and len(value) == 2:
                        continue

                    # Build constraints
                    constraints = rule.get("constraints", {}).copy()

                    # For COMBO types, try to get choices from object_info
                    if rule["type"] == "COMBO":
                        choices = self._get_combo_choices(class_type, input_name)
                        if choices:
                            constraints["choices"] = choices

                    param = EditableParameter(
                        node_id=node_id,
                        node_class=class_type,
                        input_name=input_name,
                        input_type=rule["type"],
                        current_value=value,
                        constraints=constraints,
                        display_name=rule.get("display_name", ""),
                        category=rule.get("category", "advanced"),
                    )
                    parameters.append(param)

        # Sort by category priority, then by node_id
        category_order = {"prompt": 0, "sampler": 1, "dimensions": 2, "model": 3, "advanced": 4}
        parameters.sort(key=lambda p: (category_order.get(p.category, 5), p.node_id))

        return parameters

    def _get_combo_choices(self, class_type: str, input_name: str) -> list[str]:
        """Get COMBO choices from object_info or defaults.

        Args:
            class_type: Node class type
            input_name: Input name

        Returns:
            List of valid choices, or empty list if unknown.
        """
        # Try object_info first
        if class_type in self.object_info:
            node_info = self.object_info[class_type]
            input_info = node_info.get("input", {})

            # Check required and optional inputs
            for section in ["required", "optional"]:
                if section in input_info:
                    if input_name in input_info[section]:
                        spec = input_info[section][input_name]
                        # COMBO spec is [[choices], {}]
                        if isinstance(spec, list) and len(spec) > 0:
                            if isinstance(spec[0], list):
                                return spec[0]

        # Fallback defaults for common fields
        if input_name == "sampler_name":
            return DEFAULT_SAMPLERS
        elif input_name == "scheduler":
            return DEFAULT_SCHEDULERS

        return []

    def apply_parameters(
        self,
        workflow: dict,
        parameters: dict[str, Any]
    ) -> dict:
        """Apply modified parameters back to a workflow.

        Args:
            workflow: Original workflow dict (will be deep copied)
            parameters: Dict mapping "node_id.input_name" to new values

        Returns:
            Modified workflow dict with updated values.
        """
        modified = deepcopy(workflow)

        for param_key, new_value in parameters.items():
            if "." not in param_key:
                continue

            node_id, input_name = param_key.split(".", 1)

            if node_id in modified:
                node = modified[node_id]
                if "inputs" in node and input_name in node["inputs"]:
                    # Don't overwrite connections
                    current = node["inputs"][input_name]
                    if not (isinstance(current, list) and len(current) == 2):
                        node["inputs"][input_name] = new_value

        return modified

    def validate_workflow(self, workflow: dict) -> tuple[bool, Optional[str]]:
        """Validate that a workflow has required structure.

        Args:
            workflow: Workflow dict to validate

        Returns:
            Tuple of (is_valid, error_message).
        """
        if not isinstance(workflow, dict):
            return False, "Workflow must be a dictionary"

        if len(workflow) == 0:
            return False, "Workflow is empty"

        # Check for at least one node with class_type
        has_valid_nodes = False
        for node_id, node_data in workflow.items():
            if isinstance(node_data, dict) and "class_type" in node_data:
                has_valid_nodes = True
                break

        if not has_valid_nodes:
            return False, "No valid nodes found (missing class_type)"

        # Check for output node (SaveImage, PreviewImage, etc.)
        output_classes = {
            "SaveImage", "PreviewImage", "SaveAnimatedWEBP", "SaveAnimatedPNG",
            "VHS_VideoCombine", "SaveVideo"
        }
        has_output = False
        for node_data in workflow.values():
            if isinstance(node_data, dict):
                if node_data.get("class_type") in output_classes:
                    has_output = True
                    break

        if not has_output:
            return False, "No output node found (SaveImage, PreviewImage, etc.)"

        return True, None

    def get_output_nodes(self, workflow: dict) -> list[str]:
        """Find all output nodes in a workflow.

        Args:
            workflow: Workflow dict

        Returns:
            List of node IDs that are output nodes.
        """
        output_classes = {
            "SaveImage", "PreviewImage", "SaveAnimatedWEBP", "SaveAnimatedPNG",
            "VHS_VideoCombine", "SaveVideo"
        }
        output_nodes = []

        for node_id, node_data in workflow.items():
            if isinstance(node_data, dict):
                if node_data.get("class_type") in output_classes:
                    output_nodes.append(node_id)

        return output_nodes

    def identify_prompt_nodes(self, workflow: dict) -> dict[str, str]:
        """Identify which CLIPTextEncode nodes are positive vs negative prompts.

        Uses heuristics based on node connections and titles.

        Args:
            workflow: Workflow dict

        Returns:
            Dict mapping node_id to "positive" or "negative".
        """
        prompt_nodes = {}

        for node_id, node_data in workflow.items():
            if not isinstance(node_data, dict):
                continue

            class_type = node_data.get("class_type", "")
            if class_type not in ("CLIPTextEncode", "CLIPTextEncodeSDXL"):
                continue

            # Check _meta title if present
            meta = node_data.get("_meta", {})
            title = meta.get("title", "").lower()

            if "negative" in title or "neg" in title:
                prompt_nodes[node_id] = "negative"
            elif "positive" in title or "pos" in title:
                prompt_nodes[node_id] = "positive"
            else:
                # Default to positive (more common)
                prompt_nodes[node_id] = "positive"

        return prompt_nodes
