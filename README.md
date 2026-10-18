# Ballkingdom

```
Ballkingdom/
├── index.html
├── Kingdoms/     one JSON file per kingdom
├── Troops/       one JSON file per troop type
└── Script/
    ├── game.js
    └── build_index.py
```

## Add a kingdom or troop
1. Drop a `.json` file into `Kingdoms/` or `Troops/`.
2. Run `python Script/build_index.py` from the repo root.
3. Refresh the page.

A kingdom's `roster` must reference troop ids that exist in `Troops/`.

## Run
Browsers block `fetch` on `file://`, so serve the folder:

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Controls
Drag to pan, scroll wheel to zoom.
