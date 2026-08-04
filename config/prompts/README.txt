Hand-editable LLM/system guides for the app.

pose_filter.txt   - system prompt for the local LLM that removes pose / action /
                    expression / camera / scene tags from the WD14 output, keeping
                    only the character's permanent description. Used by the Poses
                    tab "Extract Tags". Re-read on every request (no restart).
                    If no local LLM is selected in Settings, a rule-based filter
                    is used instead.

pose_extract.txt  - inverse filter for the Poses library. Keeps pose / clothing /
                    scene and DROPS the character description. Used by "Extract
                    pose from image". Works with the same local LLM or cloud API
                    selected in Settings; rule-based fallback if none.
