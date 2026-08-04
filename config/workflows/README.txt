ComfyUI workflows in API format. One .json per workflow.

To add one:
  1. ComfyUI -> Settings -> enable "Dev Mode Options".
  2. Build the graph, then "Save (API Format)".
  3. Drop the .json here with any name (e.g. myStyle.json).
  4. In the app, click "Refresh Models". It appears in the Workflow dropdown.

The backend finds nodes by class_type, not id. Required nodes:
  CheckpointLoaderSimple  - receives the selected checkpoint
  EmptyLatentImage        - receives width / height / batch size
  CLIPTextEncode (>=2)    - even occurrence = POSITIVE, odd = NEGATIVE
  LoraLoader (optional)   - if present, the LoRA picker shows up
