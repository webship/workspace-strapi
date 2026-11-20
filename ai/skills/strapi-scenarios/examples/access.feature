Feature: What each account may do
  The editor has no Content-Type Builder and no roles; the author may not publish.

  Scenario: The editor's sections
    Given I am a logged in user with the "editor" user
    Then the main navigation should list "Content Manager"
    And the main navigation should not list "Content-Type Builder"
    And the settings menu should not list "Roles"

  Scenario: The author's draft
    Given there is no "Article" entry "Skill author article"
    And I am a logged in user with the "author" user
    When I create a new "Article" entry
    And I set "title" to "Skill author article"
    And I save the entry
    Then the status of the entry should be "Draft"
    And I should not be able to publish the entry
