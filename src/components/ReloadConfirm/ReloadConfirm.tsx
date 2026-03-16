'use client';

import { useEffect } from 'react';

/**
 * Shows a confirmation when the user tries to reload or leave the page.
 * Works across the entire app.
 */
export default function ReloadConfirm() {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'If you reload, data will be fetched again and you will have to wait. Are you sure?';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
  return null;
}
