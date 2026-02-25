/**
 * @ch4p/security -- Security subsystem barrel export
 *
 * Re-exports all security classes and their configuration types.
 * The primary entry point is DefaultSecurityPolicy which composes
 * all subsystems behind the ISecurityPolicy interface.
 */

// Filesystem scoping
export { FilesystemScope, SecurityError } from './filesystem-scope.js';
export type { FilesystemScopeConfig } from './filesystem-scope.js';

// Command execution filtering
export { CommandAllowlist } from './command-allowlist.js';
export type { CommandAllowlistConfig } from './command-allowlist.js';

// Encrypted secrets management
export { SecretStore } from './secrets.js';
export type { SecretStoreConfig } from './secrets.js';

// Output sanitization
export { OutputSanitizer } from './output-sanitizer.js';

// Input validation & prompt injection defense
export { InputValidator } from './input-validator.js';

// Autonomy level guard
export { AutonomyGuard } from './autonomy.js';

// Security configuration auditor
export { SecurityAuditor } from './audit.js';
export type { SecurityAuditorConfig } from './audit.js';

// Composed security policy (main entry point)
export { DefaultSecurityPolicy } from './policy.js';
export type { DefaultSecurityPolicyConfig } from './policy.js';
