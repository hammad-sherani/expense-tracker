"use client";
import { ThemeProvider } from "next-themes";
import React from "react";

function RootProviders({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ThemeProvider
            attribute={"class"}
            defaultTheme="dark"
            enableSystem={true}
            disableTransitionOnChange={false}
        >
            {children}
        </ThemeProvider>
    )
}

export default RootProviders;