// Rules for a NEW password in Change Password: at least 8 characters, one uppercase letter, one number and one
// special character. The user panel shows the same four rules (src/lib/passwordRules.ts).
const RULES = [
    { key: 'length', test: (p) => p.length >= 8 },
    { key: 'uppercase', test: (p) => /\p{Lu}/u.test(p) },
    { key: 'number', test: (p) => /[0-9]/.test(p) },
    { key: 'special', test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
];

const MESSAGE = 'Password must be at least 8 characters and include one uppercase letter, one number and one special character.';

// Which rules the password does not meet (all of them when it is not text).
const unmet = (password) =>
    (typeof password === 'string' ? RULES.filter((rule) => !rule.test(password)) : RULES).map((rule) => rule.key);

const isValid = (password) => unmet(password).length === 0;

module.exports = { MESSAGE, unmet, isValid };
