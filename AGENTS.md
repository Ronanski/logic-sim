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

# LogicSim workflow rules
- Design system rules in DESIGN.md apply to every change; never hardcode colors or add gradients/decorative animations.
- Update PROJECT_NOTES.md (Done / Next) after every change.

- Drawing parsing goes through a single server function `parseDrawing(file)` that reads PARSER_API_URL inside the handler and falls back to a mock graph; keeps the secret server-side and the UI working without a parser.
