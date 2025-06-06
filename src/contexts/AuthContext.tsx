// src/contexts/AuthContext.tsx
"use client";

import type { Role } from "@/lib/constants";
import { createClientComponentClient } from '@/lib/supabase/client';
import type { AuthError, AuthSubscription, Session, User as SupabaseUser, SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import type { Dispatch, ReactNode, SetStateAction} from "react";
import { createContext, useState, useEffect, useCallback, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";

interface UserProfile {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: Role | null;
}

interface User extends SupabaseUser {
  profile: UserProfile | null;
}

interface AuthContextType {
  user: User | null;
  role: Role | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<{ error: AuthError | null }>;
  logout: () => Promise<{ error: AuthError | null }>;
  setRole: (newRole: Role) => Promise<void>;
  setUser: Dispatch<SetStateAction<User | null>>;
  session: Session | null;
  supabase: SupabaseClient;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRoleState] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  const fetchUserProfile = useCallback(async (supabaseUser: SupabaseUser): Promise<UserProfile | null> => {
    console.log("[AuthContext][fetchUserProfile] Fetching profile for user:", supabaseUser.id);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role")
      .eq("id", supabaseUser.id)
      .single();

    if (error) {
      console.error("[AuthContext][fetchUserProfile] Error fetching user profile:", JSON.stringify(error, null, 2));
      const generalErrorMessage = "No se pudo cargar tu perfil de usuario: ";
      let specificDetail = error.message;

      if (error.message.toLowerCase().includes("infinite recursion")) {
        specificDetail = "Se detectó una recursión infinita en las políticas de seguridad (RLS). Por favor, revisa las políticas, especialmente en la tabla 'trips'.";
         toast({
          title: "Error Crítico de RLS",
          description: specificDetail,
          variant: "destructive",
          duration: 15000, // Longer duration for critical errors
        });
      } else if (error.code === 'PGRST116') { // No rows found
        console.warn("[AuthContext][fetchUserProfile] No profile found for user (PGRST116):", supabaseUser.id, "This is often normal for new users.");
        // For new users, not finding a profile is expected, so don't show a user-facing error toast.
        // The calling function (onAuthStateChange or setRole) will handle creating/upserting the profile.
        return null;
      } else {
         toast({
          title: "Error de Perfil",
          description: generalErrorMessage + specificDetail,
          variant: "destructive",
        });
      }
      return null;
    }
    if (data) {
      console.log("[AuthContext][fetchUserProfile] Profile data found:", data);
      return {
        id: data.id,
        fullName: data.full_name,
        avatarUrl: data.avatar_url,
        role: data.role as Role,
      };
    }
    console.log("[AuthContext][fetchUserProfile] No profile data returned (but no explicit error) for user:", supabaseUser.id);
    return null;
  }, [supabase, toast]);

  useEffect(() => {
    let isMounted = true;
    console.log("[AuthContext][useEffect] Mounting. Setting up onAuthStateChange listener.");

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!isMounted) {
          console.log("[AuthContext][onAuthStateChange] Component unmounted, ignoring auth event:", event);
          return;
        }
        console.log(`[AuthContext][onAuthStateChange] Event: ${event}. Session available: ${!!currentSession}. Current isLoading (before processing): ${isLoading}`);
        
        setSession(currentSession);

        if (currentSession?.user) {
          // Set basic user info first, profile comes after fetch
          setUser(prevUser => ({ ...currentSession.user, profile: prevUser?.profile || null }));

          // Set isLoading to false *before* async profile fetch if it's the initial load
          if (isLoading && isMounted) {
            console.log('[AuthContext][onAuthStateChange] User session confirmed. Setting isLoading to false BEFORE profile fetch.');
            setIsLoading(false);
          }
          
          console.log('[AuthContext][onAuthStateChange] Fetching profile for user:', currentSession.user.id);
          const profile = await fetchUserProfile(currentSession.user);
          
          if (!isMounted) { // Check again after await
            console.log("[AuthContext][onAuthStateChange] Unmounted during/after profile fetch for event:", event);
            return; 
          }
          
          if (profile) {
            setUser(prevUser => prevUser ? ({ ...prevUser, profile }) : ({...currentSession.user, profile }));
            setRoleState(profile.role || null);
            console.log('[AuthContext][onAuthStateChange] User profile and role updated after fetch. Role:', profile.role);
          } else {
            // No profile found, could be a new user. Role should be null.
            // If isLoading was true, it should have been set to false already.
            // If an error occurred in fetchUserProfile (and it wasn't PGRST116), a toast was shown.
            setRoleState(null);
            console.log('[AuthContext][onAuthStateChange] No profile found or error during fetch. Role explicitly set to null.');
          }

        } else {
          // No user in session
          console.log('[AuthContext][onAuthStateChange] No user in session. Clearing user and role.');
          setUser(null);
          setRoleState(null);
          if (isLoading && isMounted) {
            console.log('[AuthContext][onAuthStateChange] No user session. Setting isLoading to false.');
            setIsLoading(false); // Ensure isLoading is false if no session
          }
        }
      }
    );

    // Initial check for existing session in case onAuthStateChange doesn't fire immediately
    // or if it fires before this effect sets up the listener (less likely but possible).
    // This also handles the case where the user is already logged in when the app loads.
    (async () => {
      if (isMounted && isLoading) { // Only run if still loading and mounted
        console.log("[AuthContext][useEffect] Performing initial session check as isLoading is true.");
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        console.log("[AuthContext][useEffect] Initial session check result. Session available:", !!initialSession);
        if (!initialSession?.user) { // If truly no session after initial check
          if (isMounted && isLoading) { // Check again, state might have changed
             console.log("[AuthContext][useEffect] No initial session, setting isLoading to false.");
             setIsLoading(false);
          }
        } else if (isMounted && isLoading) {
           // Session exists, onAuthStateChange should handle it or has handled it.
           // If onAuthStateChange hasn't set isLoading to false yet, we can do it here cautiously.
           // However, the onAuthStateChange logic is designed to set it.
           // Let's ensure it gets set if onAuthStateChange was too fast or too slow.
           console.log("[AuthContext][useEffect] Initial session found. isLoading might be set to false by onAuthStateChange or here if still true.");
           // setIsLoading(false); // Let onAuthStateChange handle this to avoid race conditions
        }
      }
    })();


    return () => {
      isMounted = false;
      console.log("[AuthContext][useEffect] Unmounting. Unsubscribing from auth changes.");
      authListener?.subscription.unsubscribe();
    };
  // Removed `isLoading` from dependency array to prevent re-running initial check too often.
  // `fetchUserProfile` and `supabase` are stable.
  }, [fetchUserProfile, supabase]);


  const login = async () => {
    console.log("[AuthContext] Attempting login with Google.");
    const redirectURL = window.location.origin + "/auth/callback";
    setIsLoading(true); // Set loading true before redirect
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectURL,
        // queryParams: { access_type: 'offline', prompt: 'consent' } // Optional, for refresh tokens
      },
    });
    if (error) {
      console.error("[AuthContext] Error during signInWithOAuth:", error);
      toast({
        title: "Error de inicio de sesión",
        description: error.message || "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
        variant: "destructive",
      });
      if (isLoading) setIsLoading(false); 
    }
    // isLoading will be set to false by onAuthStateChange after redirect and session processing
    return { error };
  };

  const logout = async () => {
    console.log("[AuthContext] Attempting logout.");
    setIsLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[AuthContext] Error during signOut:", error);
      toast({
        title: "Error al cerrar sesión",
        description: error.message || "No se pudo cerrar la sesión. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
    // setUser(null); // Handled by onAuthStateChange
    // setRoleState(null); // Handled by onAuthStateChange
    // router.push("/"); // AuthRedirector will handle this
    // setIsLoading(false); // onAuthStateChange will set this to false after clearing user
    return { error };
  };

  const setRoleAndUpdateProfile = async (newRole: Role) => {
    if (!user?.id || !newRole) {
      console.error("[AuthContext][setRole] User not authenticated or invalid role. UserID:", user?.id, "NewRole:", newRole);
      toast({ title: "Error de Parámetros", description: "Usuario no autenticado o rol no válido.", variant: "destructive" });
      return;
    }
    console.log(`[AuthContext][setRole] Attempting to set role to ${newRole} for user ${user.id}.`);
    
    const userMetaData = user.user_metadata;
    const currentProfile = user.profile;

    const dataToUpsert = {
      id: user.id,
      role: newRole,
      // Prioritize fresh metadata from OAuth, then existing profile, then email as fallback for name
      full_name: userMetaData?.full_name || userMetaData?.name || currentProfile?.fullName || user.email || "Usuario Anónimo",
      avatar_url: userMetaData?.avatar_url || currentProfile?.avatarUrl || null,
      // Supabase handles `updated_at` automatically
    };

    console.log("[AuthContext][setRole] Data to upsert:", JSON.stringify(dataToUpsert, null, 2));

    try {
      // Upsert first to ensure role is in DB
      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(dataToUpsert, { onConflict: 'id' });

      if (upsertError) {
        console.error("[AuthContext][setRole] Error upserting profile:", JSON.stringify(upsertError, null, 2));
        toast({
          title: "Error al Guardar Rol",
          description: `No se pudo guardar tu rol: ${upsertError.message}`,
          variant: "destructive",
        });
        return; 
      }
      console.log("[AuthContext][setRole] Profile upsert successful for role:", newRole);

      // Then fetch the complete (potentially merged) profile to update local state accurately
      console.log("[AuthContext][setRole] Fetching updated profile after upsert for user:", user.id);
      const updatedProfile = await fetchUserProfile(user); // Re-fetch to get the definitive state from DB

      if (updatedProfile) {
        console.log("[AuthContext][setRole] Updated profile fetched successfully:", JSON.stringify(updatedProfile, null, 2));
        
        setUser(currentUser => currentUser ? ({ ...currentUser, profile: updatedProfile }) : null);
        setRoleState(updatedProfile.role); 

        toast({
          title: "Rol Establecido",
          description: `Tu rol ha sido establecido como ${updatedProfile.role}. Redirigiendo...`,
          variant: "default",
        });
        console.log("[AuthContext][setRole] Pushing to /dashboard as role is now set:", updatedProfile.role);
        router.push("/dashboard");
      } else {
        console.error("[AuthContext][setRole] Failed to fetch profile data after upsert, or profile is null. User may not have full_name/avatar_url if new and fetchUserProfile had issues (excluding PGRST116).");
        // If fetchUserProfile returned null due to PGRST116, it means the upsert might not have returned data or something else went wrong.
        // We at least know the role should be newRole from the upsert.
        setRoleState(newRole); // Set role optimistically from input if fetch failed but upsert seemed ok
         setUser(currentUser => currentUser ? ({ 
            ...currentUser, 
            profile: { // Construct a minimal profile based on what we tried to upsert
                id: dataToUpsert.id,
                fullName: dataToUpsert.full_name,
                avatarUrl: dataToUpsert.avatar_url,
                role: newRole
            }
        }) : null);
        toast({
          title: "Rol Actualizado (con advertencia)",
          description: `Rol establecido como ${newRole}, pero no se pudo recargar el perfil completo. Redirigiendo...`,
          variant: "default", // Not destructive, as role was likely set
        });
        router.push("/dashboard");
      }
    } catch (error: any) {
      console.error("[AuthContext][setRole] Catch-all error during role setting:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        id: `error-setting-role-catch-all-${user.id}`,
        title: "Error Inesperado al Establecer Rol",
        description: error.message || "Ocurrió un error desconocido al actualizar tu rol.",
        variant: "destructive",
      });
    }
  };
  
  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated: !!user && !!session,
        isLoading,
        login,
        logout,
        setRole: setRoleAndUpdateProfile,
        setUser,
        session,
        supabase,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

