import { screen, waitFor } from '@testing-library/react';

/** Sheet actions save asynchronously, then close. Wait for that before asserting. */
export const sheetClosed = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
