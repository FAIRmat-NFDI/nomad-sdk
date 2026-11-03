import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { ApiPage, NotFoundPage, RouteErrorPage, WorkflowDesignerPage } from '@/pages';
import { paths, routeHandles } from './paths';

/**
 * Path routing (HOST/workflow, HOST/api). On GitHub Pages and in `nomad-sdk playground serve`,
 * unknown paths fall back to index.html so deep links work.
 */
export const router = createBrowserRouter(
  [
    {
      element: <AppLayout />,
      errorElement: <RouteErrorPage />,
      children: [
        { index: true, element: <Navigate to={paths.designer} replace /> },
        { path: paths.designer, element: <WorkflowDesignerPage />, handle: routeHandles.designer },
        { path: paths.api, element: <ApiPage />, handle: routeHandles.api },
        { path: `${paths.api}/:symbol`, element: <ApiPage />, handle: routeHandles.api },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);
