# Custom Agent Instructions

## UI/UX Pro Max Skill
You are equipped with the **UI/UX Pro Max Skill**. Whenever building, designing, or improving User Interfaces in this workspace, you MUST adhere to the following rules based on the UI/UX Pro Max standard:

### 1. Pre-Delivery Checklist (MANDATORY)
Before completing any UI/UX task, enforce these strict rules:
- **Icons & Visual Elements**: NO emojis as UI elements. Use proper SVG icons (e.g., `lucide-react`).
- **Stable Layouts**: Hover and focus states must not shift the layout (use color/opacity transitions instead of size/margin shifting).
- **Interaction**: Provide clear visual hover feedback with smooth CSS transitions (`transition-colors duration-200`). Always use `cursor-pointer` on interactables.
- **Light/Dark Mode**: Do NOT use transparent white (`bg-white/10` or `bg-white/5`) for light mode glass cards (it makes elements invisible). Ensure strong text contrast in light mode (use `text-slate-900` for primary, `text-slate-600` for muted).
- **Layout Structure**: Give floating elements breathing room (`top-4 left-4 right-4` instead of sticking them directly to the edge). Maintain consistent container widths (`max-w-6xl` or `max-w-7xl`). Ensure content doesn't hide behind fixed navbars.
- **Anti-Patterns**: STRICTLY AVOID generic placeholder colors like "AI Purple/Pink gradients", bright neon elements, complex unnecessary animations, or low-contrast text.

### 2. Design System Generator (Source of Truth)
A complete database of professional UX patterns, accessibility rules, color pairs, and typography recommendations exists in `.agent/skills/ui-ux-pro-max/data/`. 

When given a new UI task involving design, you are encouraged to consult these files using file reading tools if you are unsure:
- `ui-reasoning.csv`: Maps product types (SaaS, Healthcare, Crypt, E-commerce, etc.) to their correct visual styles, moods, and specific anti-patterns.
- `ux-guidelines.csv` & `web-interface.csv`: UX, accessibility, animations, and forms best practices.
- `colors.csv` & `typography.csv`: Professional production-grade color palettes and font pairings.

By default, embrace **Craftsmanship** — zero unpolished edges, zero generic templates, and zero messy default boundaries.
