# Docs video guides

Drop short MP4 walkthroughs here. Reference them from a docs page with:

```tsx
<DocsFigure
  kind="video"
  src="/docs/videos/your-clip.mp4"
  alt="Describe what the clip shows"
  caption="Short caption under the player"
/>
```

Keep clips short (under ~60s) and compressed (H.264, 720p is plenty) so the
page stays fast. For longer walkthroughs, host on a CDN and embed the URL
instead of committing a large file to the repo.

Until a referenced file exists, the figure renders a "video coming soon"
placeholder, so it is safe to wire the figure before the clip lands.
