<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# LogicSim architecture
- Keep the uploaded LogicSim UI and simulation engine together in `src`; changes to wire routing belong in the presentation-side orthogonal router, not in signal evaluation, so simulation behavior stays intact.
- Use the uploaded design system and component patterns for new UI; the paper diagram is the only light surface, preserving the existing industrial shell.
