import { Button } from '@mui/material';
import { Link } from 'react-router';
import { EmptyState } from '@/components/common';
import { paths } from '@/routes/paths';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      action={
        <Button component={Link} to={paths.designer} variant="contained">
          Back to the workflow designer
        </Button>
      }
    />
  );
}
