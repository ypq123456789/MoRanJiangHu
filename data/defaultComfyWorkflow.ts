const 默认ZImageTurboComfyUI工作流 = {
  "9": {
    "inputs": {
      "filename_prefix": "z-image/z",
      "images": [
        "43",
        0
      ]
    },
    "class_type": "SaveImage",
    "_meta": {
      "title": "Save Image"
    }
  },
  "39": {
    "inputs": {
      "clip_name": "qwen_3_4b.safetensors",
      "type": "lumina2",
      "device": "default"
    },
    "class_type": "CLIPLoader",
    "_meta": {
      "title": "Load CLIP"
    }
  },
  "40": {
    "inputs": {
      "vae_name": "Flux_ae.safetensors"
    },
    "class_type": "VAELoader",
    "_meta": {
      "title": "Load VAE"
    }
  },
  "41": {
    "inputs": {
      "width": "__WIDTH__",
      "height": "__HEIGHT__",
      "batch_size": 1
    },
    "class_type": "EmptySD3LatentImage",
    "_meta": {
      "title": "Empty SD3 Latent Image"
    }
  },
  "42": {
    "inputs": {
      "conditioning": [
        "45",
        0
      ]
    },
    "class_type": "ConditioningZeroOut",
    "_meta": {
      "title": "Zero Out Negative Conditioning"
    }
  },
  "43": {
    "inputs": {
      "samples": [
        "44",
        0
      ],
      "vae": [
        "40",
        0
      ]
    },
    "class_type": "VAEDecode",
    "_meta": {
      "title": "VAE Decode"
    }
  },
  "44": {
    "inputs": {
      "seed": "__SEED__",
      "steps": "__STEPS__",
      "cfg": "__CFG__",
      "sampler_name": "__SAMPLER__",
      "scheduler": "__SCHEDULER__",
      "denoise": 1,
      "model": [
        "47",
        0
      ],
      "positive": [
        "45",
        0
      ],
      "negative": [
        "42",
        0
      ],
      "latent_image": [
        "41",
        0
      ]
    },
    "class_type": "KSampler",
    "_meta": {
      "title": "KSampler"
    }
  },
  "45": {
    "inputs": {
      "text": "__PROMPT__",
      "clip": [
        "39",
        0
      ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": {
      "title": "Positive Prompt"
    }
  },
  "46": {
    "inputs": {
      "unet_name": "mPMix_NSFW_V9_fp8.safetensors",
      "weight_dtype": "default"
    },
    "class_type": "UNETLoader",
    "_meta": {
      "title": "Load UNet"
    }
  },
  "47": {
    "inputs": {
      "shift": 3,
      "model": [
        "46",
        0
      ]
    },
    "class_type": "ModelSamplingAuraFlow",
    "_meta": {
      "title": "AuraFlow Sampling"
    }
  },
  "49": {
    "inputs": {
      "unet_name": "qwen-image-2512-Q6_K.gguf"
    },
    "class_type": "UnetLoaderGGUF",
    "_meta": {
      "title": "Unet Loader GGUF"
    }
  }
};

export const 默认ComfyUI工作流JSON = JSON.stringify(默认ZImageTurboComfyUI工作流, null, 2);
export const 默认NSFWComfyUI工作流JSON = JSON.stringify(默认ZImageTurboComfyUI工作流, null, 2);
