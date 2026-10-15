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

- Appointment presentation uses a route-scoped semantic theme, also applied to dialog/select portals, so other screens and the user's global theme preference remain unchanged.
- Keep appointment header/filter presentation in a dedicated component while the route owns data and mutations, to preserve business behavior during visual changes.
