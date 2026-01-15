/**
 * Token System for dynamic content in overlay elements
 *
 * Tokens use the format: {{tokenName}} or {{tokenName:parameters}}
 * Example: {{datetime:HH:mm:ss}} or {{datetime:MMMM d, yyyy}}
 */

export interface TokenDefinition {
    name: string;
    description: string;
    example: string;
    // Parameters description for UI help
    parameters?: string;
    // Resolver function that takes optional parameters and returns the current value
    resolve: (params?: string) => string;
}

// Registry of all available tokens
const tokenRegistry: Map<string, TokenDefinition> = new Map();

/**
 * Register a new token
 */
export function registerToken(token: TokenDefinition): void {
    tokenRegistry.set(token.name, token);
}

/**
 * Get all registered tokens
 */
export function getAvailableTokens(): TokenDefinition[] {
    return Array.from(tokenRegistry.values());
}

/**
 * Parse and resolve all tokens in a string
 */
export function resolveTokens(input: string): string {
    // Match {{tokenName}} or {{tokenName:parameters}}
    const tokenPattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)(?::([^}]*))?\}\}/g;

    return input.replace(tokenPattern, (match, tokenName: string, params?: string) => {
        const token = tokenRegistry.get(tokenName);
        if (!token) {
            // Return original if token not found
            return match;
        }
        try {
            return token.resolve(params);
        } catch (e) {
            console.error(`Error resolving token ${tokenName}:`, e);
            return match;
        }
    });
}

/**
 * Check if a string contains any tokens
 */
export function hasTokens(input: string): boolean {
    return /\{\{[a-zA-Z_][a-zA-Z0-9_]*(?::[^}]*)?\}\}/.test(input);
}

// ============================================================================
// Built-in Tokens
// ============================================================================

/**
 * DateTime token with customizable format
 *
 * Format specifiers (subset of common patterns):
 * - yyyy: 4-digit year (2024)
 * - yy: 2-digit year (24)
 * - MMMM: Full month name (January)
 * - MMM: Abbreviated month name (Jan)
 * - MM: 2-digit month (01-12)
 * - M: Month (1-12)
 * - do: Day with ordinal suffix (1st, 2nd, 3rd, 4th, ...)
 * - dd: 2-digit day (01-31)
 * - d: Day (1-31)
 * - EEEE: Full weekday name (Monday)
 * - EEE: Abbreviated weekday name (Mon)
 * - HH: 2-digit 24-hour (00-23)
 * - H: 24-hour (0-23)
 * - hh: 2-digit 12-hour (01-12)
 * - h: 12-hour (1-12)
 * - mm: 2-digit minutes (00-59)
 * - m: Minutes (0-59)
 * - ss: 2-digit seconds (00-59)
 * - s: Seconds (0-59)
 * - a: AM/PM
 * - Z: Timezone offset (+0000)
 */
function formatDateTime(date: Date, format: string): string {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekdaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const pad = (n: number, len = 2): string => n.toString().padStart(len, '0');

    const ordinal = (n: number): string => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const replacements: Record<string, string> = {
        'yyyy': date.getFullYear().toString(),
        'yy': date.getFullYear().toString().slice(-2),
        'MMMM': months[date.getMonth()],
        'MMM': monthsShort[date.getMonth()],
        'MM': pad(date.getMonth() + 1),
        'M': (date.getMonth() + 1).toString(),
        'do': ordinal(date.getDate()),
        'dd': pad(date.getDate()),
        'd': date.getDate().toString(),
        'EEEE': weekdays[date.getDay()],
        'EEE': weekdaysShort[date.getDay()],
        'HH': pad(date.getHours()),
        'H': date.getHours().toString(),
        'hh': pad(date.getHours() % 12 || 12),
        'h': (date.getHours() % 12 || 12).toString(),
        'mm': pad(date.getMinutes()),
        'm': date.getMinutes().toString(),
        'ss': pad(date.getSeconds()),
        's': date.getSeconds().toString(),
        'a': date.getHours() < 12 ? 'AM' : 'PM',
        'Z': (() => {
            const offset = -date.getTimezoneOffset();
            const sign = offset >= 0 ? '+' : '-';
            const hours = pad(Math.floor(Math.abs(offset) / 60));
            const mins = pad(Math.abs(offset) % 60);
            return `${sign}${hours}${mins}`;
        })(),
    };

    // Sort by length descending to match longer patterns first
    const sortedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length);

    // Build result by scanning through format string and matching patterns
    // This prevents replacement text from being processed again (e.g., 'a' in 'January')
    let result = '';
    let i = 0;
    while (i < format.length) {
        let matched = false;
        // Try to match each pattern at current position
        for (const key of sortedKeys) {
            if (format.substring(i, i + key.length) === key) {
                result += replacements[key];
                i += key.length;
                matched = true;
                break;
            }
        }
        // No pattern matched, copy character as-is
        if (!matched) {
            result += format[i];
            i++;
        }
    }

    return result;
}

registerToken({
    name: 'datetime',
    description: 'Current date and time with custom formatting',
    example: '{{datetime:HH:mm:ss}}',
    parameters: 'Format string using: yyyy, MM, dd, HH, mm, ss, etc.',
    resolve: (params?: string) => {
        const format = params || 'yyyy-MM-dd HH:mm:ss';
        return formatDateTime(new Date(), format);
    },
});

registerToken({
    name: 'date',
    description: 'Current date (shorthand for datetime with date format)',
    example: '{{date:MMMM d, yyyy}}',
    parameters: 'Format string using: yyyy, MMMM, MMM, MM, dd, d, EEEE, EEE',
    resolve: (params?: string) => {
        const format = params || 'MMMM d, yyyy';
        return formatDateTime(new Date(), format);
    },
});

registerToken({
    name: 'time',
    description: 'Current time (shorthand for datetime with time format)',
    example: '{{time:h:mm a}}',
    parameters: 'Format string using: HH, H, hh, h, mm, m, ss, s, a',
    resolve: (params?: string) => {
        const format = params || 'HH:mm:ss';
        return formatDateTime(new Date(), format);
    },
});

registerToken({
    name: 'year',
    description: 'Current year',
    example: '{{year}}',
    resolve: () => new Date().getFullYear().toString(),
});

// Export default token list for documentation
export const AVAILABLE_TOKENS = getAvailableTokens();
