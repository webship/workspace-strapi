Feature: The editor finds articles in their list
  The sample content's 24 articles: a search, a filter, sorting and the pages of the list.

  Background:
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list

  Scenario: A search and a filter
    When I search the list for "river"
    Then the list should count 3 entries
    And the list should show "A guide to river walks"
    When I clear the search of the list
    And I filter the list where "Status" "is" "Draft (never published)"
    Then the list should count 4 entries
    And the list should have the filter "Status is draft"

  Scenario: Sorting and the pages
    When I sort the list by "title" in descending order
    Then the first row of the list should be "Why the old bridge matters"
    When I go to page 3 of the list
    Then the list should be on page 3
    And the list should have 4 rows
