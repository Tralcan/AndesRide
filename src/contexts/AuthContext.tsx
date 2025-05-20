// src/contexts/AuthContext.tsx
"use client";

import type { Role } from "@/lib/constants";
import { DEFAULT_USER_EMAIL } from "@/lib/constants";
import { useRouter } from "next/navigation";
import type { Dispatch, ReactNode, SetStateAction} from "react";
import { createContext, useState, useEffect } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  role: Role;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  setRole: (newRole: Role) => void;
  setUser: Dispatch<SetStateAction<User | null>>;
}

const mockUser: User = {
  id: "1",
  name: "Andes Rider",
  email: DEFAULT_USER_EMAIL,
  avatar: "https://placehold.co/100x100.png",
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRoleState] = useState<Role>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Simulate checking auth status and role from localStorage
    const storedUser = localStorage.getItem("andesride_user");
    const storedRole = localStorage.getItem("andesride_role") as Role;
    if (storedUser) {
      setUser(JSON.parse(storedUser));
      if (storedRole) {
        setRoleState(storedRole);
      }
    }
    setIsLoading(false);
  }, []);

  const login = () => {
    setIsLoading(true);
    setTimeout(() => { // Simulate API call
      localStorage.setItem("andesride_user", JSON.stringify(mockUser));
      setUser(mockUser);
      const storedRole = localStorage.getItem("andesride_role") as Role;
      if (storedRole) {
        setRoleState(storedRole);
        router.push("/dashboard");
      } else {
        router.push("/role-selection");
      }
      setIsLoading(false);
    }, 500);
  };

  const logout = () => {
    setIsLoading(true);
    setTimeout(() => { // Simulate API call
      localStorage.removeItem("andesride_user");
      localStorage.removeItem("andesride_role");
      setUser(null);
      setRoleState(null);
      router.push("/");
      setIsLoading(false);
    }, 500);
  };

  const setRole = (newRole: Role) => {
    if (newRole) {
      localStorage.setItem("andesride_role", newRole);
      setRoleState(newRole);
      router.push("/dashboard");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        setRole,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
