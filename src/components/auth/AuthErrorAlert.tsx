// src/components/auth/AuthErrorAlert.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function AuthErrorAlert() {
  const searchParams = useSearchParams();
  const { toast } = useToast(); // useToast can be called here if needed for other client-side logic

  const authErrorParam = searchParams.get('error');
  const authMessageParam = searchParams.get('message');

  // The useEffect for toast can be removed if the Alert is sufficient
  // or kept if a toast is still desired in some scenarios.
  // For now, focusing on rendering the Alert based on params.
  // useEffect(() => {
  //   if (authErrorParam && authMessageParam) {
  //     const decodedMessage = decodeURIComponent(authMessageParam);
  //     console.log(`[AuthErrorAlert] Auth error from URL: ${authErrorParam}, Message: ${decodedMessage}`);
  //     // Example: Optionally show a toast in addition to the Alert, or instead of logging.
  //     // toast({
  //     //   title: `Error de Autenticación: ${authErrorParam}`,
  //     //   description: decodedMessage,
  //     //   variant: "destructive",
  //     //   duration: 7000,
  //     // });
  //   }
  // }, [authErrorParam, authMessageParam, toast]);

  if (authErrorParam && authMessageParam) {
    return (
      <Alert variant="destructive" className="mb-6 text-left">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Error de Autenticación</AlertTitle>
        <AlertDescription>
          {decodeURIComponent(authMessageParam)}
        </AlertDescription>
      </Alert>
    );
  }

  return null; // Return null if no error to display
}
