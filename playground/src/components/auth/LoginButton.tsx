import { Link } from '@mui/material';

/**
 * Adapted from taxonomy AuthButton (anonymous branch): the same "Login" link styling.
 * Placeholder — NOMAD sign-in (PAT / Keycloak) is wired in a later milestone.
 */
export function LoginButton({ compact = false }: { compact?: boolean }) {
  return (
    <Link component="button" variant={compact ? 'body2' : 'h6'} underline="hover">
      Login
    </Link>
  );
}
