'use client';

import React, { createContext, useContext, useState } from 'react';

interface AppContextType {
  uploadDialogOpen: boolean;
  setUploadDialogOpen: (open: boolean) => void;
  openUploadDialog: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  const openUploadDialog = () => {
    setUploadDialogOpen(true);
  };

  return (
    <AppContext.Provider
      value={{
        uploadDialogOpen,
        setUploadDialogOpen,
        openUploadDialog,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
