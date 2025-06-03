// src/contexts/AuthContext.tsx
"use client";

import type { Role } from "@/lib/constants";
import { supabase } from "@/lib/supabaseClient";
import type { AuthError, Session, User as SupabaseUser } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import type { Dispatch, ReactNode, SetStateAction} from "react";
import { createContext, useState, useEffect, useCallback } from "react";

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
  role: Role | null; // Mantenemos role aquí para acceso rápido, derivado de user.profile.role
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<{ error: AuthError | null }>;
  logout: () => Promise<{ error: AuthError | null }>;
  setRole: (newRole: Role) => Promise<void>;
  setUser: Dispatch<SetStateAction<User | null>>; // Se mantiene por compatibilidad, pero idealmente se gestiona internamente
  session: Session | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRoleState] = useState<Role>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const fetchUserProfile = useCallback(async (supabaseUser: SupabaseUser): Promise<UserProfile | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role")
      .eq("id", supabaseUser.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: 'No rows found'
      console.error("Error fetching user profile:", error);
      return null;
    }
    if (data) {
      return {
        id: data.id,
        fullName: data.full_name,
        avatarUrl: data.avatar_url,
        role: data.role as Role,
      };
    }
    return null;
  }, []);

  useEffect(() => {
    setIsLoading(true);
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      setSession(currentSession);
      if (currentSession?.user) {
        const profile = await fetchUserProfile(currentSession.user);
        setUser({ ...currentSession.user, profile });
        if (profile?.role) {
          setRoleState(profile.role);
        } else if (profile) { // Perfil existe pero sin rol
          // No redirigir aún, esperar a onAuthStateChange o AuthRedirector
        }
      }
      setIsLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setIsLoading(true);
        setSession(newSession);
        if (newSession?.user) {
          const profile = await fetchUserProfile(newSession.user);
          setUser({ ...newSession.user, profile });
          if (profile?.role) {
            setRoleState(profile.role);
            // Si estamos en role-selection y ya tenemos rol, redirigimos
            if (window.location.pathname === '/role-selection') {
              router.replace("/dashboard");
            }
          } else if (profile && window.location.pathname !== '/role-selection' && window.location.pathname !== '/') {
             // Perfil existe, pero sin rol, y no estamos en login o seleccion de rol
            router.replace("/role-selection");
          } else if (!profile && event === 'SIGNED_IN') {
            // Esto podría pasar si el trigger de Supabase tarda o falla.
            // Idealmente, el trigger handle_new_user crea el perfil.
            // Si no, el usuario se queda atascado sin perfil.
            // Considerar crear perfil aquí si no existe, aunque el trigger es mejor.
             console.warn('User signed in but profile not found immediately. Waiting for role selection or trigger.');
             router.replace("/role-selection"); // Forzar a role-selection para crear/completar perfil
          }
        } else {
          setUser(null);
          setRoleState(null);
           if (window.location.pathname !== '/') { // Evitar bucle si ya está en login
            router.replace("/");
          }
        }
        setIsLoading(false);
      }
    );

    return () => {
      authListener?.unsubscribe();
    };
  }, [router, fetchUserProfile]);

  const login = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // redirectTo se configura en el dashboard de Supabase
        // redirectTo: `${window.location.origin}/auth/callback` // Opcional si se quiere especificar aquí
      },
    });
    if (error) {
      console.error("Error al iniciar sesión con Google:", error);
      setIsLoading(false);
    }
    // No setIsLoading(false) aquí porque onAuthStateChange manejará el estado post-redirect
    return { error };
  };

  const logout = async () => {
    setIsLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Error al cerrar sesión:", error);
    //setUser(null); // onAuthStateChange lo hará
    //setRoleState(null); // onAuthStateChange lo hará
    //router.push("/"); // onAuthStateChange lo hará
    // setIsLoading(false); // onAuthStateChange lo hará
    return { error };
  };

  const setRoleAndUpdateProfile = async (newRole: Role) => {
    if (!user?.id || !newRole) {
      console.error("Usuario no autenticado o rol no válido para actualizar.");
      return;
    }
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
        setRoleState(newRole);
        // Actualizar el perfil del usuario en el estado local
        setUser(currentUser => currentUser ? ({
            ...currentUser,
            profile: {
                ...currentUser.profile!, // Asumimos que el perfil base ya existe
                id: profileData.id,
                fullName: profileData.full_name,
                avatarUrl: profileData.avatar_url,
                role: profileData.role as Role,
            }
        }) : null);
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Error al establecer el rol:", error);
      // Aquí podrías mostrar un toast al usuario
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated: !!user && !!session, // Un usuario está autenticado si hay user y session
        isLoading,
        login,
        logout,
        setRole: setRoleAndUpdateProfile,
        setUser, // Se mantiene por si se necesita, pero las actualizaciones principales son internas
        session,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
