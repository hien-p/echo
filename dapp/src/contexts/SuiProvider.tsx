"use client";

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { ThemeProvider } from "next-themes";
import { dAppKit } from "@/config/dapp-kit";

const queryClient = new QueryClient();

export const SuiProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    // ThemeProvider feeds the marketing hero's GLSL shader (light/dark
    // wave palette swap) and any child component that wants light/dark
    // tokens. attribute="class" sets html.dark, matching Tailwind's
    // dark-variant strategy.
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <DAppKitProvider dAppKit={dAppKit}>{children}</DAppKitProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};
