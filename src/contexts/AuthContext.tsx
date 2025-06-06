
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

      if (error.message.toLowerCase().includes("infinite recursion detected in policy for relation \"trips\"")) {
        specificDetail = "Se detectó una recursión infinita en las políticas de seguridad (RLS). Por favor, revisa las políticas, especialmente en la tabla 'trips'.";
         toast({
          title: "Error Crítico de RLS",
          description: specificDetail,
          variant: "destructive",
          duration: 15000, 
        });
      } else if (error.code === 'PGRST116') { 
        console.warn("[AuthContext][fetchUserProfile] No profile found for user (PGRST116):", supabaseUser.id, "This is often normal for new users.");
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
          // Set user state immediately with Supabase user, profile will be fetched.
          setUser(prevUser => ({ ...currentSession.user, profile: prevUser?.profile || null }));
          
          // Set isLoading to false BEFORE async profile fetch if it's still true.
          if (isLoading && isMounted) {
            console.log('[AuthContext][onAuthStateChange] User session confirmed. Setting isLoading to false BEFORE profile fetch.');
            setIsLoading(false);
          }
          
          console.log('[AuthContext][onAuthStateChange] Fetching profile for user:', currentSession.user.id);
          const profile = await fetchUserProfile(currentSession.user);
          
          if (!isMounted) { 
            console.log("[AuthContext][onAuthStateChange] Unmounted during/after profile fetch for event:", event);
            return; 
          }
          
          if (profile) {
            setUser(prevUser => prevUser ? ({ ...prevUser, profile }) : ({...currentSession.user, profile }));
            setRoleState(profile.role || null);
            console.log('[AuthContext][onAuthStateChange] User profile and role updated after fetch. Role:', profile.role);
          } else {
            // No profile found or error, role should be null.
            setRoleState(null);
            console.log('[AuthContext][onAuthStateChange] No profile found or error during fetch. Role explicitly set to null.');
          }

        } else {
          // No user session.
          console.log('[AuthContext][onAuthStateChange] No user in session. Clearing user and role.');
          setUser(null);
          setRoleState(null);
          if (isLoading && isMounted) { // Ensure isLoading is false if there's no session.
            console.log('[AuthContext][onAuthStateChange] No user session. Setting isLoading to false.');
            setIsLoading(false); 
          }
        }
      }
    );

    // Initial session check.
    (async () => {
      if (isMounted && isLoading) { // Only run if still loading
        console.log("[AuthContext][useEffect] Performing initial session check as isLoading is true.");
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        console.log("[AuthContext][useEffect] Initial session check result. Session available:", !!initialSession);
        // If onAuthStateChange hasn't fired yet and there's no session, set loading to false.
        // If there IS a session, onAuthStateChange will handle setting user and then isLoading.
        if (!initialSession?.user) { 
          if (isMounted && isLoading) { // Double check isLoading, as onAuthStateChange might have run.
             console.log("[AuthContext][useEffect] No initial session, setting isLoading to false.");
             setIsLoading(false);
          }
        } else if (isMounted && isLoading) {
           // Initial session exists. onAuthStateChange should take over.
           // Log just in case, but usually onAuthStateChange will set isLoading false.
           console.log("[AuthContext][useEffect] Initial session found. isLoading might be set to false by onAuthStateChange or here if still true.");
        }
      }
    })();


    return () => {
      isMounted = false;
      console.log("[AuthContext][useEffect] Unmounting. Unsubscribing from auth changes.");
      authListener?.subscription.unsubscribe();
    };
  }, [fetchUserProfile, supabase]); // Removed isLoading from dependency array


  const login = async () => {
    console.log("[AuthContext] Attempting login with Google.");
    const redirectURL = window.location.origin + "/auth/callback";
    // setIsLoading(true); // isLoading is handled by onAuthStateChange now primarily
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectURL,
      },
    });
    if (error) {
      console.error("[AuthContext] Error during signInWithOAuth:", error);
      toast({
        title: "Error de inicio de sesión",
        description: error.message || "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
        variant: "destructive",
      });
      // if (isLoading) setIsLoading(false); // isLoading handled by onAuthStateChange
    }
    return { error };
  };

  const logout = async () => {
    console.log("[AuthContext] Attempting logout.");
    // setIsLoading(true); // isLoading handled by onAuthStateChange
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[AuthContext] Error during signOut:", error);
      toast({
        title: "Error al cerrar sesión",
        description: error.message || "No se pudo cerrar la sesión. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
    // User and role will be cleared by onAuthStateChange
    return { error };
  };

  const setRoleAndUpdateProfile = async (newRole: Role) => {
    console.log(`[AuthContext][setRole] Attempting to set role to ${newRole} for user ${user?.id}.`);
    if (!user?.id || !newRole) {
      console.error("[AuthContext][setRole] User or newRole is invalid. Cannot proceed. UserID:", user?.id, "NewRole:", newRole);
      toast({ title: "Error de Parámetros", description: "Usuario no autenticado o rol no válido.", variant: "destructive" });
      return;
    }

    toast({
      title: "Iniciando Actualización de Rol",
      description: `Estableciendo rol a ${newRole}...`,
      variant: "default"
    });
    console.log("[AuthContext][setRole] DEBUG: About to start profile upsert and fetch...");

    const userMetaData = user.user_metadata;
    const dataToUpsert = {
      id: user.id,
      role: newRole,
      full_name: userMetaData?.full_name || userMetaData?.name || user.email || "Usuario Anónimo",
      avatar_url: userMetaData?.avatar_url || null, // Ensure null if undefined
    };
    console.log("[AuthContext][setRole] Data to upsert:", JSON.stringify(dataToUpsert, null, 2));

    try {
      console.log("[AuthContext][setRole] PUNTO A: Antes del upsert a profiles.");
      const { error: upsertErrorOnly } = await supabase
        .from("profiles")
        .upsert(dataToUpsert, { onConflict: 'id' });
      console.log(`[AuthContext][setRole] PUNTO B: Después del upsert a profiles. Error de Upsert: ${JSON.stringify(upsertErrorOnly, null, 2)}`);

      if (upsertErrorOnly) {
        console.error("[AuthContext][setRole] Error upserting profile:", JSON.stringify(upsertErrorOnly, null, 2));
        toast({
          title: "Error al Guardar Rol (Upsert)",
          description: `No se pudo guardar tu rol: ${upsertErrorOnly.message}`,
          variant: "destructive",
        });
        return; 
      }
      console.log("[AuthContext][setRole] Profile upsert successful for role:", newRole);
      
      console.log("[AuthContext][setRole] PUNTO C: Antes del select del perfil post-upsert.");
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role")
        .eq("id", user.id)
        .single();
      console.log(`[AuthContext][setRole] PUNTO D: Después del select del perfil post-upsert. Datos del perfil: ${JSON.stringify(profileData, null, 2)}, Error de Select: ${JSON.stringify(profileError, null, 2)}`);

      if (profileError) {
        console.error("[AuthContext][setRole] Error fetching profile after upsert:", JSON.stringify(profileError, null, 2));
        toast({
          title: "Error al Leer Perfil Después de Guardar",
          description: `No se pudo verificar el rol guardado: ${profileError.message}`,
          variant: "destructive",
        });
        // Attempt to set role optimistically if select fails but upsert was ok
        // setRoleState(newRole); 
        // setUser(currentUser => currentUser ? ({ ...currentUser, profile: { ...currentUser.profile, id: dataToUpsert.id, fullName: dataToUpsert.full_name, avatarUrl: dataToUpsert.avatar_url, role: newRole } as UserProfile }) : null);
        // router.push("/dashboard"); // Maybe still navigate if upsert was okay? Risky.
        return;
      }

      if (profileData) {
        console.log("[AuthContext][setRole] Profile data after upsert/select:", JSON.stringify(profileData, null, 2));
        const fetchedProfile: UserProfile = {
          id: profileData.id,
          fullName: profileData.full_name,
          avatarUrl: profileData.avatar_url,
          role: profileData.role as Role,
        };
        setUser(currentUser => currentUser ? ({ ...currentUser, profile: fetchedProfile }) : null);
        setRoleState(fetchedProfile.role); 

        toast({
          title: "Rol Establecido Correctamente",
          description: `Tu rol ha sido establecido como ${fetchedProfile.role}. Redirigiendo...`,
          variant: "default",
        });
        console.log("[AuthContext][setRole] PUNTO E: Navegando a /dashboard. Rol actual:", fetchedProfile.role);
        router.push("/dashboard");
      } else {
        console.error("[AuthContext][setRole] No profile data returned after upsert/select, but no explicit select error. This is unexpected.");
        toast({
          title: "Error Inesperado de Perfil",
          description: "No se recibieron datos del perfil después de guardar el rol, aunque no hubo un error de selección explícito.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("[AuthContext][setRole] Catch-all error during role setting:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      toast({
        id: `error-setting-role-catch-all-${user.id}`,
        title: "Error Inesperado al Establecer Rol (Catch)",
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

    
