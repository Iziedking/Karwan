# Docs screenshots

Screenshots shown on the docs pages. Reference one from a docs page with:

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
placeholder instead of a broken image.

## Retaking them

The pictures are taken from today's screens with test data, in the light theme
at 1200 by 820, by `frontend/e2e/docs-screenshots.spec.ts`. It is skipped unless
`DOCS_SHOTS=1` is set, so the normal browser tests never run it. After a redesign,
run it on a test machine and copy the PNGs it writes over the files here:

```bash
DOCS_SHOTS=1 npx playwright test e2e/docs-screenshots.spec.ts --project=desktop --workers=1
```

| File | Docs page | Screen |
|---|---|---|
| `deal-lifecycle1.png` to `deal-lifecycle6.png` | Deals | The deal page: paid in, waiting for delivery, delivered, first release, after it, settled |
| `negotiation-timeline.png` | Agents | A request with its offers open |
| `agent-guardrails.png` | Agents | The request form at the budget and the date |
| `reputation-tiers.png` | Reputation | The trade record page |
| `stake-card.png` | Reputation | Money, Deal guarantee tab |
| `bridge-steps.png` | Bridge | Add money, the deposit card |

Last retaken 9 Nov 2026.
