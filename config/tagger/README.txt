TAGS_API.json - ComfyUI workflow (API format) for the WD14 Tagger.
Used by the Compose / Replicate "Extract Tags" action. Nodes:
  LoadImage (2) -> WD14Tagger|pysssss (10) -> PreviewAny (5)
Requires the ComfyUI-WD14-Tagger (pysssss) custom node + model
wd-v1-4-moat-tagger-v2. Model/threshold are adjustable in the app Settings.
To change it: rebuild in ComfyUI, "Save (API Format)", replace this file.
