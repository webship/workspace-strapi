Feature: The admin answers and its accounts work
  As the owner of the app
  I want the admin's login, each default account and the refusals to work
  So that a build that came out broken is caught before anything else is tested

  # Placed by the workspace's testing setup as a starting point: it is yours to change.
  # The accounts are the default ones (cmd-tools-strapi-cli.sh --add-users); a scenario logs in by a
  # handle of the users registry in cucumber.js, so no password is written here. It passes on an app
  # built with --install --add-users, with or without --sample-content.

  @critical
  Scenario: The admin login page is served
    Given I am not logged in
    Then I should be on the admin login page

  Scenario Outline: The <account> account logs in
    Given I am not logged in
    When I log in as "<account>" with the login form
    Then I should be logged in as "<account>"

    Examples:
      | account       |
      | administrator |
      | editor        |
      | author        |

  # The browser logs the refused login request (400): no error of the app.
  @js-off
  Scenario: A wrong password is refused
    Given I am not logged in
    When I log in with the email "nobody@example.com" and the password "Wrong-password-1"
    Then the login should be refused with "Invalid credentials"
    And I should not be logged in

  Scenario: The administrator sees every section, the accounts and their roles
    Given I am a logged in user with the "administrator" user
    Then the main navigation should list "Content-Type Builder"
    And the plan of the site should be "Community"
    And the account "editor" should have the role "Editor"
    And the account "author" should have the role "Author"

  Scenario: The editor has no Content-Type Builder and no roles
    Given I am a logged in user with the "editor" user
    Then the main navigation should list "Content Manager"
    And the main navigation should not list "Content-Type Builder"
    And the settings menu should not list "Roles"
