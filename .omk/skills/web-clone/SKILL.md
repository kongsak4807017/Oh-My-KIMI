---
name: web-clone
description: Clone websites with visual and functional verification
---

# Web Clone Skill

Clone websites with extraction, generation, and verification pipeline.

## Use When

- "web-clone", "clone site", "copy webpage"
- UI replication
- Learning from examples
- Template creation

## Pipeline

### 1. Extract
```
$web-clone https://example.com
```

- Downloads HTML/CSS/JS
- Extracts assets
- Maps structure

### 2. Analyze
```
$web-clone --analyze
```

- Component breakdown
- Style system
- Layout grid
- Typography scale

### 3. Generate
```
$web-clone --generate
```

- Recreates in target framework
- Responsive adaptation
- Clean code output

### 4. Verify
```
$web-clone --verify
```

- Visual comparison
- Functional parity
- Responsive check

## Output

```
.omk/web-clones/{domain}/
├── extracted/       # Raw download
├── analysis/        # Breakdown
├── generated/       # Clean code
└── report.md        # Comparison
```

## Options

```
$web-clone https://site.com --depth=1
$web-clone --framework=react
$web-clone --single-page
$web-clone --components-only
```

## Verification

Uses `$visual-verdict` for comparison:
```
$web-clone --verify-threshold=95
```

## Legal Note

For educational purposes only. Respect:
- Copyright
- Terms of service
- Robots.txt

## Usage

```
$web-clone https://example.com
$web-clone --framework=vue https://landing.page
```
