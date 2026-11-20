Feature: The editor writes an article
  An article with a slug, a rich text, a switch, a relation and a cover, and the refusal of a
  publication without its title.

  Background:
    Given there is no "Article" entry "Skill test article"
    And I am a logged in user with the "editor" user

  Scenario: Every kind of field
    When I create a new "Article" entry
    And I set "title" to "Skill test article"
    And I regenerate the "slug"
    And I set these fields:
      | summary  | A short summary.  |
      | content  | A first paragraph. |
      | featured | true              |
    And I choose "Guides" in the "category" relation
    And I choose the asset "meadow.png" for "cover"
    And I save the entry
    Then I should see the notification "Saved document"
    And "slug" should be set to "skill-test-article"
    And the "category" relation should list "Guides"
    And "cover" should hold the asset "meadow.png"

  Scenario: A publication refused
    When I create a new "Article" entry
    And I set "summary" to "This one has no title."
    And I publish the entry
    Then the "title" field should show the error "This value is required."
    When I leave the entry without saving
    Then the list should count 24 entries
