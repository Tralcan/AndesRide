// src/contexts/AuthContext.tsx
"use client";

import type { Role } from "@/lib/constants";
import { supabase } from "@/lib/supabaseClient";
import type { AuthError, Session, User as SupabaseUser } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import type { Dispatch, ReactNode, SetStateAction} from "react";
import { createContext, useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface UserProfile {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: Role | null;
}

// Combinamos el usuario de Supabase Auth con nuestro perfil
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
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRoleState] = useState<Role>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  const fetchUserProfile = useCallback(async (supabaseUser: SupabaseUser): Promise<UserProfile | null> => {
    console.log("Fetching profile for user:", supabaseUser.id);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role")
      .eq("id", supabaseUser.id)
      .single();

    if (error && error.code !== 'PGRST116') { 
      console.error("Error fetching user profile:", error);
      toast({
        title: "Error de Perfil",
        description: "No se pudo cargar tu perfil de usuario.",
        variant: "destructive",
      });
      return null;
    }
    if (data) {
      console.log("Profile data found:", data);
      return {
        id: data.id,
        fullName: data.full_name,
        avatarUrl: data.avatar_url,
        role: data.role as Role,
      };
    }
    console.log("No profile data found for user:", supabaseUser.id);
    return null;
  }, [toast]);

  useEffect(() => {
    setIsLoading(true);
    console.log("AuthProvider: Initializing, checking session.");
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      console.log("AuthProvider: Initial session:", currentSession);
      setSession(currentSession);
      if (currentSession?.user) {
        const profile = await fetchUserProfile(currentSession.user);
        setUser({ ...currentSession.user, profile });
        if (profile?.role) {
          setRoleState(profile.role);
        }
      }
      setIsLoading(false);
      console.log("AuthProvider: Initial loading complete.");
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        console.log('AuthProvider: Auth event:', event, 'New session:', newSession);
        setIsLoading(true);
        try {
          setSession(newSession);
          if (newSession?.user) {
            const profile = await fetchUserProfile(newSession.user);
            console.log('AuthProvider: Fetched profile after auth change:', profile);
            setUser({ ...newSession.user, profile });
            if (profile?.role) {
              setRoleState(profile.role);
              if (window.location.pathname === '/role-selection') {
                console.log('AuthProvider: Redirecting to /dashboard from role-selection (role found)');
                router.replace("/dashboard");
              }
            } else if (profile && window.location.pathname !== '/role-selection' && window.location.pathname !== '/') {
              console.log('AuthProvider: Redirecting to /role-selection (profile found, no role)');
              router.replace("/role-selection");
            } else if (!profile && event === 'SIGNED_IN') {
               console.warn('AuthProvider: User signed in but profile not found immediately. Redirecting to /role-selection.');
               router.replace("/role-selection");
            }
          } else {
            console.log('AuthProvider: No user in session, clearing user state.');
            setUser(null);
            setRoleState(null);
             if (window.location.pathname !== '/') {
              console.log('AuthProvider: Redirecting to / (no session, not on login page)');
              router.replace("/");
            }
          }
        } catch (e: any) {
          console.error("AuthProvider: Error in onAuthStateChange:", e);
          setUser(null);
          setRoleState(null);
          toast({
            title: "Error de Autenticación",
            description: e.message || "Ocurrió un error durante el proceso de autenticación. Por favor, intenta de nuevo.",
            variant: "destructive",
          });
        } finally {
          setIsLoading(false);
          console.log('AuthProvider: onAuthStateChange finished, isLoading:', false);
        }
      }
    );

    return () => {
      authListener?.unsubscribe();
      console.log("AuthProvider: Unsubscribed from auth changes.");
    };
  }, [router, fetchUserProfile, toast]);

  const login = async () => {
    console.log("AuthProvider: Attempting login with Google.");
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // redirectTo se configura en el dashboard de Supabase
        // Si necesitas especificarlo aquí, asegúrate que coincida con tu dashboard Supabase y Google Cloud Console
        // redirectTo: `${window.location.origin}/auth/callback` 
      },
    });
    if (error) {
      console.error("AuthProvider: Error during signInWithOAuth:", error);
      toast({
        title: "Error de inicio de sesión",
        description: error.message || "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
    // No setIsLoading(false) aquí si el redirect se inicia, onAuthStateChange lo manejará.
    return { error };
  };

  const logout = async () => {
    console.log("AuthProvider: Attempting logout.");
    setIsLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("AuthProvider: Error during signOut:", error);
      toast({
        title: "Error al cerrar sesión",
        description: error.message || "No se pudo cerrar la sesión. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
    // onAuthStateChange se encargará de limpiar el estado y redirigir.
    return { error };
  };

  const setRoleAndUpdateProfile = async (newRole: Role) => {
    if (!user?.id || !newRole) {
      console.error("AuthProvider: User not authenticated or invalid role for update.");
      toast({
        title: "Error",
        description: "Usuario no autenticado o rol no válido.",
        variant: "destructive"
      });
      return;
    }
    console.log(`AuthProvider: Setting role to ${newRole} for user ${user.id}`);
    setIsLoading(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq("id", user.id)
        .select()
        .single();

      if (profileError) {
        throw profileError;
      }

      if (profileData) {
        console.log("AuthProvider: Profile updated successfully with new role:", profileData);
        setRoleState(newRole);
        setUser(currentUser => currentUser ? ({
            ...currentUser,
            profile: {
                ...currentUser.profile!, 
                id: profileData.id,
                fullName: profileData.full_name,
                avatarUrl: profileData.avatar_url,
                role: profileData.role as Role,
            }
        }) : null);
        router.push("/dashboard");
      }
    } catch (error: any) {
      console.error("AuthProvider: Error setting role:", error);
      toast({
        title: "Error al Establecer Rol",
        description: error.message || "No se pudo actualizar tu rol. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
