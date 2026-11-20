---
name: strapi-scenarios
description: Write webship-js scenarios for the admin of a Strapi app of the Webship Workspace from phrases that exist — the Strapi step pack's steps by area (the session, the list, the edit view and its fields, draft and publish, the dynamic zone, the locales, the Media Library, the Content-Type Builder, the roles and the API tokens), the handles of the users registry, the test entries a scenario makes and the steps delete, the traps found on a real app, and three features that pass on an app built with the sample content. Use when writing or fixing a scenario for a Strapi admin, choosing a step for an admin screen, or turning a manual check of the admin into a feature.
---

# strapi-scenarios

Scenarios for the admin of an app built with the Strapi plugin (`bash cmd-strapi-project.sh <site>
--install --add-users --sample-content`) in a container-based workspace (DDEV by default), tested with
webship-js and `@webship-js/strapi-steps` once `bash cmd-tools-testing.sh <site>` set the project up.
Every phrase below exists in the pack or in webship-js; a scenario names no platform.

## Accounts and test entries

- `Given I am a logged in user with the "editor" user`: `administrator` (Super Admin), `editor`
  (Editor: every entry, publishing included), `author` (Author: its own entries, no publishing). The
  admin logs in with the email address the registry gives. `Given I am not logged in` for a visitor.
- `Given there is no "Article" entry "…"`: for an entry the scenario makes itself; it is deleted now when
  a stopped run left it, and again after the scenario.
- `Given there is an "Article" entry "…"`, `Given there is a published "Article" entry "…"`,
  `Given there is a modified "Article" entry "…"`, and `… with:` and a table of fields and values: a test
  entry made through the admin's API as the data administrator, deleted after the scenario. Every entry,
  file and folder a scenario makes on screen is deleted after it too.
- `Then there should be an "Article" entry "…"` (or `no`, or `… in "French (fr)"`): a check as the data
  administrator.

## Phrases by area

| Area | Steps |
| --- | --- |
| Session | `I log in as "editor" with the login form`, `I log in with the email "…" and the password "…"`, `the login should be refused with "Invalid credentials"`, `I log out`, `I should be logged in as "editor"`, `I should not be logged in`, `I should be on the admin login page` |
| List | `I am on the "Article" list`, `the list should count 24 entries`, `the list should show "…"`, `the list should show the entries:`, `the list should have 10 rows`, `the "…" row should show "…" in the "slug" column`, `the status of "…" in the list should be "Published"`, `I search the list for "…"`, `I clear the search of the list`, `I sort the list by "title" in descending order`, `the first row of the list should be "…"`, `I filter the list where "Status" "is" "Draft (never published)"`, `the list should have the filter "Status is draft"`, `I remove the filter "…"`, `I show the "category" column`, `I hide the "summary" column`, `I reset the columns of the list`, `I go to page 2 of the list`, `I show 20 entries per page`, `I switch the list to "French (fr)"`, `the list should be empty` |
| Selection | `I select "…" in the list`, `I select all entries on the page`, `the selection should read "2 entries selected"`, `the selection should offer "Publish"`, `I publish the selected entries`, `I unpublish the selected entries`, `I delete the selected entries` |
| Edit view | `I open "…" from the list`, `I create a new "Article" entry`, `I open the "Homepage" single type`, `I set "title" to "…"`, `I set these fields:`, `"title" should be set to "…"`, `I regenerate the "slug"`, `I choose "Guides" in the "category" relation`, `I remove "Guides" from the "category" relation`, `the "category" relation should list "Guides"`, `I choose the asset "meadow.png" for "cover"`, `I remove the asset "meadow.png" from "cover"`, `"cover" should hold no asset`, `I save the entry`, `I should see the notification "Saved document"`, `the "title" field should show the error "This value is required."`, `I leave the entry without saving`, `I delete the entry` |
| Draft and publish | `I publish the entry`, `I unpublish the entry`, `I discard the changes of the entry`, `the status of the entry should be "Modified"`, `I view the published version of the entry`, `the form should be read only`, `I should not be able to publish the entry` |
| Dynamic zone | `I add the "Quote" component to "blocks"`, `I set "body" to "…" in the "Quote" component of "blocks"`, `I move the "Quote" component of "blocks" down`, `I remove the "Quote" component from "blocks"`, `the "blocks" dynamic zone should hold "Quote" and "Rich text"` |
| Locales | `I switch the entry to "French (fr)"`, `the entry should be in "French (fr)"`, `I fill the entry in from "English (en)"` |
| Media Library | `I am on the media library`, `I open the folder "Covers" in the media library`, `the folder should count 2 items`, `the media library should show "…"`, `I upload "…" to the media library`, `the upload should be refused with "File is not a valid image"`, `I create the folder "…" in the media library`, `I delete "…" from the media library`, `I open the details of "…"`, `the "Dimensions" of the file should be "640 × 400"`, `I set "Alternative text" to "…" in the file details`, `I save the file details` |
| Builder | `I open the model of "Article"`, `I open the model of the "Quote" component`, `the model should have the fields:`, `the "blocks" dynamic zone of the model should offer "Quote", "Rich text" and "Media"`, `the model should not allow changes` |
| Settings | `I go to the "Settings" section`, `the main navigation should list "…"`, `I go to the settings page "Roles" under "Administration panel"`, `the settings menu should list "…"`, `the settings list should show "Editor" with "1 user"`, `I open "Editor" from the settings list`, `the role should allow "Publish" on "Article"`, `the API token should be "Read-only"`, `the account "editor" should have the role "Editor"`, `the plan of the site should be "Community"`, `I should not be allowed to open "/admin/settings/roles"` |

## A scenario, start to end

An entry published, changed, its changes discarded: the entry is the scenario's own, deleted after it
whatever happens in it.

```gherkin
Feature: Draft and publish
  Scenario: A change taken back
    Given there is a published "Article" entry "Skill publish article"
    And I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Skill publish article"
    And I open "Skill publish article" from the list
    And I set "summary" to "A change that is taken back."
    And I save the entry
    Then the status of the entry should be "Modified"
    When I discard the changes of the entry
    Then I should see the notification "Changes discarded"
    And the status of the entry should be "Published"
```

## Traps found on a real app

- A field's label is the attribute's name as the edit view shows it ("title", "metaTitle"), without the
  "*" of a required field; webship-js's `I fill in "…" with "…"` matches labels exactly and does not
  know the rich-text editors or the relation picker: `I set "…" to "…"` finds the field the way a person
  does, whatever its kind.
- A draft is saved without its required fields: the admin checks them when the entry is published.
- A list shows one page at a time (10 rows): search for an entry before a step looks for it.
- The admin keeps the sort and the columns of a list in the browser; a scenario starts with a fresh
  browser, so the list starts as configured.
- The admin allows 5 logins of an account in 5 minutes from one address: take the session over
  (`I am a logged in user with …`) rather than logging in through the form in every scenario.
- On a shared machine the browser on the host can lose a request when another container starts: run
  the suite in the container (`bash cmd-tools-testing.sh <site> --run`).

## Examples

- [`examples/list.feature`](examples/list.feature): a search, a filter, sorting and the pages of the list.
- [`examples/edit-view.feature`](examples/edit-view.feature): an article with every kind of field, and a refused publication.
- [`examples/access.feature`](examples/access.feature): what the editor and the author see and may do.

Copy them into `tests/features/` of the project and run them:

```bash
bash cmd-tools-testing.sh <site> --run --path tests/features/edit-view.feature
```

## The book

For any automated functional testing in this work (a Gherkin feature, a step definition, choosing a
step, a test run and its failures), read the book *Automated Functional Testing Recipes* first.

- **Where.** Use the first that exists: `.claude/automated-functional-testing-recipes/` in the project,
  `~/.claude/automated-functional-testing-recipes/` (installed by webship/webship-js-ai-agent,
  webship/webship-js-skills or webship/ai-agents), or
  https://github.com/webship/webship-js-ai-agent/tree/2.0.x/automated-functional-testing-recipes
- **How.** Its `README.md` first, then the chapter that matches the task (one file per chapter,
  named by its subject), not the single complete file.
- **Which wins.** The installed webship-js package and the step pack are the source of truth for
  step phrasing. When they differ from the book, follow them and say so.
- **For Strapi.** Start with `ch27-testing-spa.md` (a single-page admin and its waits),
  `ch09-table-list-testing.md` (the lists, their rows and columns), `ch06-form-testing-recipes.md`
  (the forms and their fields) and `ch10-authentication-authorization.md` (logins, sessions and refusals).
