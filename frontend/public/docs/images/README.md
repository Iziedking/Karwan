# Docs screenshots

Drop screenshot PNGs here. Reference them from a docs page with:

```tsx
<DocsFigure
  src="/docs/images/your-screenshot.png"
  alt="Describe what the screenshot shows"
  caption="Short caption under the frame"
/>
```

The path in `src` is relative to this folder's public root, so a file saved
as `frontend/public/docs/images/foo.png` is referenced as `/docs/images/foo.png`.

Until a referenced file exists, the figure renders a "screenshot coming soon"
placeholder instead of a broken image, so it is safe to wire the figure before
the asset lands.

Filenames the current pages already reference (add these to fill them in):

- `negotiation-timeline.png`
- `agent-guardrails.png`
- `deal-lifecycle.png`
- `reputation-tiers.png`
- `stake-card.png`
- `bridge-steps.png`
