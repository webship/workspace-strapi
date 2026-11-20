Write and run webship-js scenarios for one area of a Strapi admin, from the step pack's own phrases.

The launch command below is for Claude Code, the default; the text between the triple quotes can be given to another AI CLI as it is.

```
claude --permission-mode bypassPermissions """
Write scenarios for the <list|edit view|draft and publish|dynamic zone|locales|media library|builder|settings> area of this app's admin, and run them
# ~/workspace/<folder>/<site> · https://<site>.ddev.site/admin · container-based (DDEV by default)
# the phrases are in the strapi-scenarios skill; the strapi-tester agent is the one to hand this work over to
# look at the admin first: in the Playwright MCP browser, in a tab of your own, open each screen of the area as the account the scenario uses, once, before writing its scenario
# the book Automated Functional Testing Recipes first (its README.md, then the matching chapter), from .claude/automated-functional-testing-recipes/ in the project, ~/.claude/automated-functional-testing-recipes/ or https://github.com/webship/webship-js-ai-agent/tree/2.0.x/automated-functional-testing-recipes

1. bash cmd-tools-testing.sh <site>
   (when the project has no cucumber.js yet)
2. write tests/features/<area>.feature from the skill's phrases:
   the accounts by their handles (administrator, editor, author), never a password;
   the entries it needs made with Given there is an "Article" entry "…", which the steps delete again;
   no account created, no platform name in a step
3. bash cmd-tools-testing.sh <site> --dry-run --path tests/features/<area>.feature
4. bash cmd-tools-testing.sh <site> --run --path tests/features/<area>.feature

When it is green: the scenarios and what each one proves. When it is not: the failing step, its
message, and whether the app or the scenario is wrong.
"""
```
