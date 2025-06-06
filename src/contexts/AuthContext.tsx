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
  console.log("[AuthContext] Provider execution start.");
  const supabase = useMemo(() => createClientComponentClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRoleState] = useState<Role>(null);
  const [isLoading, setIsLoading] = useState(true); // Initialize to true
  const router = useRouter();
  const { toast } = useToast();

  console.log('[AuthContext] AuthProvider initial state:', { user, session, role, isLoading });

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
    console.log("[AuthContext][useEffect] Mount. Initializing auth state listener. Setting isLoading to true.");
    setIsLoading(true); // Ensure loading starts true

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!isMounted) {
          console.log("[AuthContext][onAuthStateChange] Component unmounted, ignoring auth event:", event);
          return;
        }
        console.log('[AuthContext][onAuthStateChange] Event:', event, 'New Session:', currentSession);
        
        // Set loading true at the start of processing any auth change
        // This helps if an event comes after the initial load was "done"
        if (isMounted) setIsLoading(true);

        setSession(currentSession); // Update session state

        if (currentSession?.user) {
          console.log('[AuthContext][onAuthStateChange] User found in session. Fetching profile for:', currentSession.user.id);
          const profile = await fetchUserProfile(currentSession.user);
          
          if (!isMounted) {
            console.log("[AuthContext][onAuthStateChange] Component unmounted during profile fetch for event:", event);
            return; // Avoid state updates if unmounted
          }
          
          console.log('[AuthContext][onAuthStateChange] Profile fetched:', profile);
          setUser({ ...currentSession.user, profile });
          setRoleState(profile?.role || null);
        } else {
          console.log('[AuthContext][onAuthStateChange] No user in session. Clearing user and role.');
          setUser(null);
          setRoleState(null);
        }
        
        if (isMounted) {
            console.log('[AuthContext][onAuthStateChange] Processed event. Setting isLoading to false.');
            setIsLoading(false);
        } else {
            console.log('[AuthContext][onAuthStateChange] Component unmounted before final setIsLoading(false) for event:', event);
        }
      }
    );

    // Cleanup function
    return () => {
      isMounted = false;
      console.log("[AuthContext][useEffect] Unmount. Unsubscribing from auth changes.");
      authListener?.subscription.unsubscribe();
    };
  }, [fetchUserProfile, supabase]); // supabase and fetchUserProfile are stable

  const login = async () => {
    console.log("[AuthContext] Attempting login with Google.");
    const redirectURL = window.location.origin + "/auth/callback";
    console.log("[AuthContext] Constructed redirectTo URL for OAuth:", redirectURL);
    // No need to set isLoading here, onAuthStateChange will handle it
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
      if (isLoading) setIsLoading(false); // Ensure loading stops if oauth itself fails early
    }
    return { error };
  };

  const logout = async () => {
    console.log("[AuthContext] Attempting logout.");
    setIsLoading(true); // Indicate loading during logout
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[AuthContext] Error during signOut:", error);
      toast({
        title: "Error al cerrar sesión",
        description: error.message || "No se pudo cerrar la sesión. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } else {
      // User, session, role will be cleared by onAuthStateChange
      console.log("[AuthContext] signOut successful. Redirecting to /");
      router.push('/'); 
    }
    // onAuthStateChange will eventually set isLoading to false after processing SIGNED_OUT
    // but if there's an error, ensure it's set.
    if (error) setIsLoading(false); 
    return { error };
  };

  const setRoleAndUpdateProfile = async (newRole: Role) => {
    if (!user?.id || !newRole) {
      console.error("[AuthContext][setRole] User not authenticated or invalid role for update. UserID:", user?.id, "NewRole:", newRole);
      toast({
        title: "Error",
        description: "Usuario no autenticado o rol no válido.",
        variant: "destructive"
      });
      return;
    }
    console.log(`[AuthContext][setRole] Setting role to ${newRole} for user ${user.id}`);
    setIsLoading(true);
    try {
      const dataToUpsert: {
        id: string;
        role: Role;
        updated_at: string;
        full_name?: string | null;
        avatar_url?: string | null;
      } = {
        id: user.id,
        role: newRole,
        updated_at: new Date().toISOString(),
      };

      dataToUpsert.full_name = user.profile?.fullName || user.user_metadata?.full_name || user.user_metadata?.name || user.email;
      dataToUpsert.avatar_url = user.profile?.avatarUrl || user.user_metadata?.avatar_url || null;

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .upsert([dataToUpsert], { onConflict: 'id' })
        .select("id, full_name, avatar_url, role")
        .single();

      if (profileError) {
        throw profileError;
      }

      if (profileData) {
        console.log("[AuthContext][setRole] Profile upserted successfully with new role:", profileData);
        setRoleState(newRole);
        const updatedProfile = {
            id: profileData.id,
            fullName: profileData.full_name,
            avatarUrl: profileData.avatar_url,
            role: profileData.role as Role,
        };
        setUser(currentUser => currentUser ? ({ ...currentUser, profile: updatedProfile }) : null);
        console.log("[AuthContext][setRole] Role updated. Redirecting to /dashboard");
        router.push("/dashboard");
      } else {
        console.error("[AuthContext][setRole] Profile data was null after upsert, though no explicit error.");
        toast({
            title: "Error al Establecer Rol",
            description: "No se recibió información del perfil después de la actualización.",
            variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("[AuthContext][setRole] Error setting role:", error);
      toast({
        title: "Error al Establecer Rol",
        description: error.message || "No se pudo actualizar tu rol. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      console.log('[AuthContext][setRole] Finally block. Setting isLoading to false.');
      setIsLoading(false);
    }
  };
  
  console.log('[AuthContext] AuthProvider render end. Context value:', { user, role, isAuthenticated: !!user && !!session, isLoading, session });

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated: !!user && !!session, //isAuthenticated depends on both user and session
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

    