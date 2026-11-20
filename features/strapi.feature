Feature: The Strapi plugin on the dashboard
  Once the plugin is activated and installed, the sites folders offer the Strapi builder, each
  AI folder lists the items of its kind the plugin ships, and the Plugins page lists the plugin
  with its steps.

  # Settings lists every plugin that was added; the package and what the plugin ships are on its own page.
  Scenario: Settings lists the plugin, and its own page names its package and what it ships
    Given I am on "/settings"
     Then I should see "Strapi"
     When I go to "/settings/plugin/strapi"
     Then I should see "@webship.co/workspace-strapi"
      And I should see "cmd-strapi-project.sh"
      And I should see "strapi-site-builder"

  Scenario: A sites folder offers the Strapi builder
    Given I am on "/dev"
     Then "option[value='cmd-strapi-project.sh']" should be attached

  # The AI folders are searched by name: with every plugin on, a folder lists more than one page of items.
  Scenario: The AI Agents folder lists the agents the plugin ships
    Given I am on "/ai-agents?q=strapi-"
     Then I should see "strapi-site-builder"
      And I should see "strapi-tester"

  Scenario: The AI Skills folder lists the skill the plugin ships
    Given I am on "/ai-skills?q=strapi-scenarios"
     Then I should see "strapi-scenarios"

  Scenario: The AI Commands folder lists the command the plugin ships
    Given I am on "/ai-commands?q=strapi-test"
     Then I should see "strapi-test"

  Scenario: The AI Prompts folder lists the prompts the plugin ships
    Given I am on "/ai-prompts?q=strapi-"
     Then I should see "strapi-build-and-test"
      And I should see "strapi-scenarios-for-an-area"
