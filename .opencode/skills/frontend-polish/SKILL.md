---
name: frontend-polish
description: Rules for clean UI with Tailwind/shadcn. Use when building or polishing UI.
---

# Frontend Polish

- Use shadcn/ui components from @/components/ui; don't reinvent.
- Tailwind only; no inline styles.
- Spacing: use 4/8/12/16/24 scale (p-4, gap-6, etc.).
- Always handle loading, empty, and error states.
- Responsive: mobile-first; test at 375px and 1280px.
- Dark mode not required for hackathon.
- Keep components small; extract when >150 lines.
