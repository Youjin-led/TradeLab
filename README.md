# Multi-Agent 3D Scene Builder

This project orchestrates local AI agents around the external Blender artist in:

```text
C:\Users\Ардор\OneDrive\Рабочий стол\3д художник
```

The external `3д художник` MCP server remains the main 3D artist. This repo now focuses on the surrounding agents:

- `ArchitectAgent` chooses the scene workflow from the user prompt.
- `ArtDirectorAgent` asks the external MCP for a structured art brief.
- `BlenderBuildAgent` creates real Blender artifacts through the external artist.
- `SceneQAAgent` inspects the `.blend` file and critiques the rendered preview.
- `ArtifactAgent` publishes final files into local `output/`.

## Create A 3D Scene

```bash
npm start -- "3D scene like activetheory.net/work"
```

Final files are written here:

```text
output/scene.blend
output/scene.glb
output/preview.png
output/report.json
```

For a non-Active-Theory prompt:

```bash
npm start -- "dark sci-fi museum room with a floating glass artifact"
```

## Optional Web Preview

The old Three.js page is not the main output anymore. Use it only as a separate viewer:

```bash
npm run start:web
npm run preview
```

## Tool Check

```bash
npm run check:tools
```
