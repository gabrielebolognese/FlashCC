# Models

## u2netp.onnx

Background removal (Batch 21.5), run in the browser by `src/studio/cutout.ts`
through onnxruntime-web. Nothing is uploaded: the picture never leaves the device.

- **What:** U^2-Net, the small variant (u2netp), 320 by 320 input, exported to ONNX.
- **Weights:** Xuebin Qin et al., "U^2-Net: Going Deeper with Nested U-Structure
  for Salient Object Detection", https://github.com/xuebinqin/U-2-Net, released
  under the **Apache License 2.0**.
- **This ONNX file:** from the rembg project, https://github.com/danielgatis/rembg
  (release v0.0.0, `u2netp.onnx`), released under the **MIT License**.
- **sha256:** `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`
- **Size:** 4,574,861 bytes.

Served from our own origin rather than fetched from GitHub at run time, so the
feature does not depend on a third party being up, and the browser makes no
request anywhere but here.

Not the most popular in-browser removal library: that one is AGPL licensed, which a
closed commercial product cannot ship. Both licences above permit commercial use
with attribution, which this file and the notice in `docs/reference.md` provide.
