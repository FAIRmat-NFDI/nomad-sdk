import { Alert, AlertTitle, Box } from '@mui/material';
import { isRouteErrorResponse, useRouteError } from 'react-router';

/** Catches render errors anywhere in the route tree (taxonomy RouteErrorPage, without ErrorAlert's api coupling). */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);
  return (
    <Box sx={{ p: 4 }}>
      <Alert severity="error" variant="outlined">
        <AlertTitle>Something went wrong</AlertTitle>
        {message}
      </Alert>
    </Box>
  );
}
