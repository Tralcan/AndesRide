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
  const [isLoading, setIsLoading] = useState(true); // Initialize to true, only set to false once by onAuthStateChange
  const router = useRouter();
  const { toast } = useToast();

  console.log("[AuthContext] Provider instance created/re-rendered. Initial/Current isLoading:", isLoading);

  const fetchUserProfile = useCallback(async (supabaseUser: SupabaseUser): Promise<UserProfile | null> => {
    console.log("[AuthContext][fetchUserProfile] Fetching profile for user:", supabaseUser.id);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role")
      .eq("id", supabaseUser.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log("[AuthContext][fetchUserProfile] No profile found for user (PGRST116):", supabaseUser.id);
        return null;
      }
      console.error("[AuthContext][fetchUserProfile] Error fetching user profile:", error);
      toast({
        title: "Error de Perfil",
        description: "No se pudo cargar tu perfil de usuario: " + error.message,
        variant: "destructive",
      });
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
    console.log("[AuthContext][fetchUserProfile] No profile data returned, though no explicit error, for user:", supabaseUser.id);
    return null;
  }, [toast, supabase]);

  useEffect(() => {
    let isMounted = true;
    console.log("[AuthContext][useEffect] Mounting. Setting up onAuthStateChange listener.");
    // setIsLoading(true); // REMOVED: Rely on initial useState(true) and single flip by onAuthStateChange

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!isMounted) {
          console.log("[AuthContext][onAuthStateChange] Component unmounted, ignoring auth event:", event);
          return;
        }
        console.log(`[AuthContext][onAuthStateChange] Event: ${event}. Session available: ${!!currentSession}.`);
        
        // setIsLoading(true); // REMOVED: isLoading should only transition from true to false on initial load.

        setSession(currentSession);

        if (currentSession?.user) {
          console.log('[AuthContext][onAuthStateChange] User in session. Fetching profile for:', currentSession.user.id);
          const profile = await fetchUserProfile(currentSession.user);
          
          if (!isMounted) {
            console.log("[AuthContext][onAuthStateChange] Unmounted during profile fetch for event:", event);
            return; 
          }
          
          setUser({ ...currentSession.user, profile });
          setRoleState(profile?.role || null);
          console.log('[AuthContext][onAuthStateChange] User and role updated.');
        } else {
          console.log('[AuthContext][onAuthStateChange] No user in session. Clearing user and role.');
          setUser(null);
          setRoleState(null);
        }
        
        if (isMounted) {
            // This is the primary place isLoading transitions from true to false.
            // It ensures that after the first auth state is processed (user or no user), loading is done.
            if (isLoading) { // Only set to false if it's currently true
                 console.log('[AuthContext][onAuthStateChange] Processed event. Setting isLoading to false.');
                 setIsLoading(false); 
            }
        }
      }
    );

    return () => {
      isMounted = false;
      console.log("[AuthContext][useEffect] Unmounting. Unsubscribing from auth changes.");
      authListener?.subscription.unsubscribe();
    };
  }, [fetchUserProfile, supabase, isLoading]); // Added isLoading to dep array for the conditional setIsLoading(false)

  const login = async () => {
    console.log("[AuthContext] Attempting login with Google.");
    const redirectURL = window.location.origin + "/auth/callback";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectURL
      },
    });
    if (error) {
      console.error("[AuthContext] Error during signInWithOAuth:", error);
      toast({
        title: "Error de inicio de sesión",
        description: error.message || "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
        variant: "destructive",
      });
      // If signInWithOAuth itself fails early, ensure loading state is handled if it was still true
      if (isLoading) setIsLoading(false); 
    }
    return { error };
  };

  const logout = async () => {
    console.log("[AuthContext] Attempting logout.");
    // Let onAuthStateChange handle isLoading for SIGNED_OUT event
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[AuthContext] Error during signOut:", error);
      toast({
        title: "Error al cerrar sesión",
        description: error.message || "No se pudo cerrar la sesión. Inténtalo de nuevo.",
        variant: "destructive",
      });
      // Fallback if onAuthStateChange doesn't fire to set isLoading to false
      if (isLoading) setIsLoading(false);
    } else {
      // AuthRedirector will handle navigation after onAuthStateChange updates state
      console.log("[AuthContext] signOut successful. AuthRedirector will handle navigation.");
    }
    return { error };
  };

  const setRoleAndUpdateProfile = async (newRole: Role) => {
    if (!user?.id || !newRole) {
      console.error("[AuthContext][setRole] User not authenticated or invalid role for update. UserID:", user?.id, "NewRole:", newRole);
      toast({ title: "Error", description: "Usuario no autenticado o rol no válido.", variant: "destructive" });
      return;
    }
    console.log(`[AuthContext][setRole] Setting role to ${newRole} for user ${user.id}.`);
    // This function typically runs after initial load, so global isLoading shouldn't be set to true.
    // UI feedback for this action should be local to the component calling it (e.g., button spinner).
    try {
      const dataToUpsert: {
        id: string; role: Role; updated_at: string; full_name?: string | null; avatar_url?: string | null;
      } = {
        id: user.id, role: newRole, updated_at: new Date().toISOString(),
        full_name: user.profile?.fullName || user.user_metadata?.full_name || user.user_metadata?.name || user.email,
        avatar_url: user.profile?.avatarUrl || user.user_metadata?.avatar_url || null,
      };

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .upsert([dataToUpsert], { onConflict: 'id' })
        .select("id, full_name, avatar_url, role")
        .eq('id', user.id) // Added .eq filter
        .single();

      if (profileError) throw profileError;

      if (profileData) {
        console.log("[AuthContext][setRole] Profile upserted successfully:", profileData);
        setRoleState(newRole);
        const updatedProfile = {
            id: profileData.id, fullName: profileData.full_name, avatarUrl: profileData.avatar_url, role: profileData.role as Role,
        };
        setUser(currentUser => currentUser ? ({ ...currentUser, profile: updatedProfile }) : null);
        router.push("/dashboard");
      } else {
        console.error("[AuthContext][setRole] Profile data null after upsert.");
        toast({ title: "Error al Establecer Rol", description: "No se recibió información del perfil actualizada.", variant: "destructive" });
      }
    } catch (error: any) {
      console.error("[AuthContext][setRole] Error setting role:", error);
      toast({ title: "Error al Establecer Rol", description: error.message || "No se pudo actualizar tu rol.", variant: "destructive" });
    }
    // No global setIsLoading toggle here.
  };
  
  console.log('[AuthContext] AuthProvider render end. Context value:', { isAuthenticated: !!user && !!session, isLoading, role: role });

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

