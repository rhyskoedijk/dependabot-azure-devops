/**
 * Map between package ecyosystem names and package manager names.
 * Package Ecosystems: https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file#package-ecosystem
 * Package Managers:   https://github.com/dependabot/dependabot-core/blob/main/common/lib/dependabot/config/file.rb
 */

export function convertPackageEcosystemToPackageManager(packageEcosystem: string): string {
  switch (packageEcosystem?.toLowerCase()) {
    case 'devcontainer':
      return 'devcontainers';
    case 'github-actions':
      return 'github_actions';
    case 'gitsubmodule':
      return 'submodules';
    case 'gomod':
      return 'go_modules';
    case 'mix':
      return 'hex';
    case 'npm':
      return 'npm_and_yarn';
    // Additional aliases, for convenience
    case 'pipenv':
      return 'pip';
    case 'pip-compile':
      return 'pip';
    case 'poetry':
      return 'pip';
    case 'pnpm':
      return 'npm_and_yarn';
    case 'yarn':
      return 'npm_and_yarn';
    default:
      return packageEcosystem;
  }
}
