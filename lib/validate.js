const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_REGEX = /^[a-zA-Z0-9 ._-]+$/;

export function validateEmail(email) {
  if (typeof email !== 'string') return { valid: false, error: 'Email must be a string' };
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) {
    return { valid: false, error: 'Email must be between 5 and 254 characters' };
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }
  return { valid: true, value: trimmed.toLowerCase() };
}

export function validateDisplayName(displayName) {
  if (typeof displayName !== 'string') return { valid: false, error: 'Display name must be a string' };
  const trimmed = displayName.trim();
  if (trimmed.length < 2 || trimmed.length > 30) {
    return { valid: false, error: 'Display name must be between 2 and 30 characters' };
  }
  if (!DISPLAY_NAME_REGEX.test(trimmed)) {
    return { valid: false, error: 'Display name can only contain letters, numbers, spaces, and ._-' };
  }
  return { valid: true, value: trimmed };
}

export function validatePassword(password, email = '') {
  if (typeof password !== 'string') return { valid: false, error: 'Password must be a string' };
  if (password.length < 8 || password.length > 128) {
    return { valid: false, error: 'Password must be between 8 and 128 characters' };
  }
  if (email && password.toLowerCase().trim() === email.toLowerCase().trim()) {
    return { valid: false, error: 'Password cannot be equal to email' };
  }
  return { valid: true, value: password };
}

export function validateRoomName(name) {
  if (typeof name !== 'string') return { valid: false, error: 'Room name must be a string' };
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    return { valid: false, error: 'Room name must be between 1 and 50 characters' };
  }
  return { valid: true, value: trimmed };
}
