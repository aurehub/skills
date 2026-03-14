import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

/**
 * Parse a .env file content into a plain object.
 * - Lines starting with # (after optional whitespace) are ignored.
 * - Blank / whitespace-only lines are ignored.
 * - Values may be surrounded by single or double quotes, which are stripped.
 */
function parseEnv(content) {
  const result = {};
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Load configuration from configDir.
 *
 * Reads:
 *   <configDir>/.env       — environment variables (key=value pairs)
 *   <configDir>/config.yaml — structured YAML config
 *
 * Both files are optional; missing files are silently treated as empty.
 *
 * @param {string} configDir  Path to the config directory (defaults to ~/.aurehub)
 * @returns {{ env: object, yaml: object, configDir: string }}
 */
export function loadConfig(configDir) {
  // Default to ~/.aurehub when no directory is supplied
  const dir = configDir ?? join(process.env.HOME ?? process.env.USERPROFILE ?? '', '.aurehub');

  let env = {};
  try {
    const raw = readFileSync(join(dir, '.env'), 'utf8');
    env = parseEnv(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  let yamlConfig = {};
  try {
    const raw = readFileSync(join(dir, 'config.yaml'), 'utf8');
    yamlConfig = yaml.load(raw, { schema: yaml.JSON_SCHEMA }) ?? {};
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  return { env, yaml: yamlConfig, configDir: dir };
}

/**
 * Resolve a token symbol to its address and decimals from config.yaml's `tokens` section.
 *
 * @param {{ yaml: object }} config  Config object returned by loadConfig
 * @param {string} symbol            Token symbol, e.g. "USDT"
 * @returns {{ address: string, decimals: number }}
 * @throws {Error} If the symbol is not found in the tokens section
 */
export function resolveToken(config, symbol) {
  const tokens = config?.yaml?.tokens ?? {};
  const token = tokens[symbol];
  if (!token) {
    throw new Error(`Unknown token symbol: "${symbol}"`);
  }
  return { address: token.address, decimals: token.decimals };
}
